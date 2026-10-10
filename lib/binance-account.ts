// Datos privados de tu cuenta de Binance: saldos y órdenes.
// Usa una API key de SOLO LECTURA: no puede comprar, vender ni retirar.
// Docs: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints
import 'server-only'
import crypto from 'node:crypto'

// Se puede cambiar (por ejemplo a la testnet: https://testnet.binance.vision)
const BASE = process.env.BINANCE_API_URL ?? 'https://api.binance.com'

export const hasBinanceKeys = () => !!(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET)

export class BinanceError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message)
  }
}

/** Mensaje entendible para los errores más comunes de Binance */
export function explainError(e: unknown): string {
  if (!(e instanceof BinanceError)) return (e as Error).message
  if (e.code === -2015 || e.code === -2014 || e.code === -1022)
    return 'Binance rechazó la API key: revisa BINANCE_API_KEY / BINANCE_API_SECRET y, si le pusiste restricción de IP, que sea la IP pública del NAS.'
  if (e.code === -1021) return 'La hora del servidor no coincide con la de Binance. Vuelve a intentar en un minuto.'
  return `Binance: ${e.message}`
}

// Binance exige que la hora de cada pedido coincida con la suya (±10 s): guardamos la diferencia (una por servidor)
const clocks = new Map<string, { offset: number; syncedAt: number }>()

async function syncTime(base: string) {
  const res = await fetch(`${base}/api/v3/time`, { cache: 'no-store' })
  const { serverTime } = (await res.json()) as { serverTime: number }
  clocks.set(base, { offset: serverTime - Date.now(), syncedAt: Date.now() })
}

export type Keys = { base: string; key?: string; secret?: string }

/** Pedido firmado con el API secret (HMAC SHA256), como lo pide Binance */
export async function signedWith<T>(keys: Keys, method: 'GET' | 'POST', path: string, params: Record<string, string | number> = {}): Promise<T> {
  if (!keys.key || !keys.secret) throw new BinanceError('Falta la API key o el secret en el .env')
  const clock = clocks.get(keys.base)
  if (!clock || Date.now() - clock.syncedAt > 10 * 60_000) await syncTime(keys.base)

  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  query.set('recvWindow', '10000')
  query.set('timestamp', String(Date.now() + clocks.get(keys.base)!.offset))
  query.set('signature', crypto.createHmac('sha256', keys.secret).update(query.toString()).digest('hex'))

  const res = await fetch(`${keys.base}${path}?${query}`, {
    method,
    headers: { 'X-MBX-APIKEY': keys.key },
    cache: 'no-store',
  })
  const data = await res.json()
  if (!res.ok) {
    if (data.code === -1021) clocks.delete(keys.base) // la próxima vez vuelve a sincronizar la hora
    throw new BinanceError(data.msg ?? `HTTP ${res.status}`, data.code)
  }
  return data as T
}

/** Con tu llave de SOLO LECTURA */
async function signed<T>(method: 'GET' | 'POST', path: string, params: Record<string, string | number> = {}): Promise<T> {
  if (!hasBinanceKeys()) throw new BinanceError('Faltan BINANCE_API_KEY y BINANCE_API_SECRET en el .env')
  return signedWith<T>({ base: BASE, key: process.env.BINANCE_API_KEY, secret: process.env.BINANCE_API_SECRET }, method, path, params)
}

// ===== Saldos =====

export type Balance = {
  asset: string // BNB, BTC, USDT...
  spot: number // billetera Spot (disponible + en órdenes)
  inOrders: number // parte de spot bloqueada en órdenes abiertas
  funding: number // billetera Fondos (donde llega lo del P2P)
  earn: boolean // saldos "LD..." = Simple Earn flexible
  total: number
  price: number | null // en USDT
  value: number | null // total × price
}

type RawBalance = { asset: string; free: string; locked: string }

export async function getBalances(): Promise<Balance[]> {
  const [account, funding, prices] = await Promise.all([
    signed<{ balances: RawBalance[] }>('GET', '/api/v3/account', { omitZeroBalances: 'true' }),
    // Billetera Fondos: si la key no tiene permiso, seguimos solo con Spot
    signed<RawBalance[]>('POST', '/sapi/v1/asset/get-funding-asset').catch(() => [] as RawBalance[]),
    getPrices(),
  ])

  const byAsset = new Map<string, Balance>()
  const add = (rawAsset: string, spot: number, inOrders: number, fund: number) => {
    // "LDBNB" = BNB en Simple Earn flexible: lo valoramos como BNB
    const earn = rawAsset.startsWith('LD') && rawAsset.length > 2 && prices.has(`${rawAsset.slice(2)}USDT`)
    const asset = earn ? `${rawAsset.slice(2)} (Earn)` : rawAsset
    const b = byAsset.get(asset) ?? { asset, spot: 0, inOrders: 0, funding: 0, earn, total: 0, price: null, value: null }
    b.spot += spot
    b.inOrders += inOrders
    b.funding += fund
    b.total = b.spot + b.funding
    const base = earn ? rawAsset.slice(2) : rawAsset
    b.price = base === 'USDT' ? 1 : (prices.get(`${base}USDT`) ?? null)
    b.value = b.price === null ? null : b.total * b.price
    byAsset.set(asset, b)
  }

  for (const b of account.balances) add(b.asset, +b.free + +b.locked, +b.locked, 0)
  for (const b of funding) add(b.asset, 0, 0, +b.free + +b.locked)

  return [...byAsset.values()].filter((b) => b.total > 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
}

/** Precio en USDT de todas las monedas (ruta pública) */
export async function getPrices(): Promise<Map<string, number>> {
  const res = await fetch(`${BASE}/api/v3/ticker/price`, { cache: 'no-store' })
  const list = (await res.json()) as { symbol: string; price: string }[]
  return new Map(list.map((p) => [p.symbol, +p.price]))
}

// ===== Órdenes =====

export type BinanceOrder = {
  symbol: string
  orderId: number
  orderListId: number // -1 si no es parte de una OCO / TP-SL
  price: string
  stopPrice: string
  origQty: string
  executedQty: string
  cummulativeQuoteQty: string
  status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'PENDING_CANCEL' | 'REJECTED' | 'EXPIRED' | 'EXPIRED_IN_MATCH'
  type: string
  side: 'BUY' | 'SELL'
  time: number
  updateTime: number
}

/** Todas tus órdenes abiertas (de todas las monedas) */
export const getOpenOrders = () => signed<BinanceOrder[]>('GET', '/api/v3/openOrders')

/** El estado actual de una orden (para saber si se ejecutó o se canceló) */
export const getOrder = (symbol: string, orderId: number) =>
  signed<BinanceOrder>('GET', '/api/v3/order', { symbol, orderId })

/** Qué permisos tiene la API key: así la app te avisa si NO es de solo lectura */
export const getKeyPermissions = () =>
  signed<{ ipRestrict: boolean; enableReading: boolean; enableSpotAndMarginTrading: boolean; enableWithdrawals: boolean }>(
    'GET',
    '/sapi/v1/account/apiRestrictions',
  )

// ===== Operaciones ejecutadas (trades) =====

export type BinanceTrade = {
  symbol: string
  id: number
  orderId: number
  price: string
  qty: string
  quoteQty: string
  commission: string
  commissionAsset: string
  time: number
  isBuyer: boolean
}

/** Tus operaciones ejecutadas de un par, desde el id indicado (hasta 1000 por pedido) */
export const getMyTrades = (symbol: string, fromId: number) =>
  signed<BinanceTrade[]>('GET', '/api/v3/myTrades', { symbol, fromId, limit: 1000 })
