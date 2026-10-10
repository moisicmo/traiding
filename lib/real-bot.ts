// 💰 Bot REAL: copia en tu cuenta de Binance la cartera de UN competidor de la competencia (por defecto 🤝 Mitad y mitad).
// Por defecto opera en la TESTNET de Binance (dinero de práctica, órdenes de verdad). Para plata real hay que
// poner a propósito BINANCE_TRADE_URL=https://api.binance.com en el .env.
//
// Seguridad:
//  - Usa una llave APARTE (BINANCE_TRADE_API_KEY) con permiso de operar Spot y SIN permiso de retiro (si lo tiene, no arranca).
//  - Solo maneja SU presupuesto: lleva la cuenta de su USDT y de las monedas que compró (o adoptó al empezar).
//    Nunca toca el resto de tu cuenta.
//  - Freno: si su cartera cae más de X% desde su punto más alto, vende todo y se apaga.
//  - Solo órdenes de mercado en Spot: nada de apalancamiento.
import 'server-only'
import { BinanceError, explainError, getPrices, signedWith, type Keys } from './binance-account'
import { db, getMeta, setMeta } from './db'
import { mySeed } from './my-seed'
import { COMPETITORS, getCash, getStartedAt, listPositions, mirrorTargets, type Competitor } from './paper-bot'
import { esc, notify } from './telegram'

const keys = (): Keys => ({
  base: process.env.BINANCE_TRADE_URL || 'https://testnet.binance.vision',
  key: process.env.BINANCE_TRADE_API_KEY,
  secret: process.env.BINANCE_TRADE_API_SECRET,
})
export const realConfigured = () => !!(process.env.BINANCE_TRADE_API_KEY && process.env.BINANCE_TRADE_API_SECRET)
export const isTestnet = () => keys().base.includes('testnet')

const TOLERANCE = 0.25 // solo ajusta una moneda si se desvía más de 25% de lo que debería tener (igual que 🪞 y 🤝)
const ARENA_STALE = 20 * 60_000 // si la competencia no se revisó hace 20 min, no opera (podría copiar algo viejo)

export type RealState = {
  enabled: boolean
  follow: Competitor
  budget: number // USDT con los que empezó
  maxLoss: number // % de caída desde el punto más alto que activa el freno
  cash: number // USDT que son del bot
  holdings: Record<string, { qty: number; cost: number }> // monedas que son del bot
  peak: number
  started: number
  lastRun: number | null
  lastError: string
  stopped: string // por qué se apagó solo (vacío = sigue prendido o lo pausaste tú)
  // "Cuotas", como un fondo: al empezar, 1 cuota por USDT puesto. Al agregar fondos se compran cuotas al valor de ese momento.
  // Así valor ÷ cuotas mide cuánto ganó la ESTRATEGIA, sin que los depósitos parezcan ganancia (para compararlo en el gráfico)
  units?: number
}
const unitsOf = (s: RealState) => s.units ?? s.budget

export const getReal = () => JSON.parse(getMeta('real_state') ?? 'null') as RealState | null
const save = (s: RealState) => setMeta('real_state', JSON.stringify(s))

function ensureTable() {
  db().exec(`
    -- Una foto por hora: cuánto vale lo del bot y cuántas cuotas tiene (para el gráfico)
    CREATE TABLE IF NOT EXISTS real_equity (ts INTEGER PRIMARY KEY, value REAL NOT NULL, units REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS real_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, symbol TEXT NOT NULL, side TEXT NOT NULL,
      qty REAL NOT NULL, quote REAL NOT NULL, order_id INTEGER NOT NULL, reason TEXT NOT NULL, testnet INTEGER NOT NULL
    );
  `)
}
export type RealOrder = { id: number; ts: number; symbol: string; side: 'BUY' | 'SELL'; qty: number; quote: number; order_id: number; reason: string; testnet: number }
export function listRealOrders(limit = 100) {
  ensureTable()
  return (db().prepare('SELECT * FROM real_orders ORDER BY ts DESC LIMIT ?').all(limit) as RealOrder[]).map((r) => ({ ...r }))
}

/** La historia del bot: valor de UNA cuota (1 al empezar) hora por hora */
export function listRealEquity() {
  ensureTable()
  return (db().prepare('SELECT ts, value / units AS nav FROM real_equity ORDER BY ts').all() as { ts: number; nav: number }[]).map((r) => ({ ...r }))
}

function snapshotReal(value: number, units: number) {
  ensureTable()
  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000
  db().prepare('INSERT OR REPLACE INTO real_equity (ts, value, units) VALUES (?, ?, ?)').run(hour, value, units)
}

// ===== Datos del servidor donde opera (testnet o real) =====

/** Precios del servidor donde opera (los de la testnet son distintos a los reales) */
export async function tradePrices(): Promise<Map<string, number>> {
  const res = await fetch(`${keys().base}/api/v3/ticker/price`, { cache: 'no-store' })
  const list = (await res.json()) as { symbol: string; price: string }[]
  return new Map(list.map((p) => [p.symbol, +p.price]))
}

async function freeBalances(): Promise<Map<string, number>> {
  const acc = await signedWith<{ balances: { asset: string; free: string }[] }>(keys(), 'GET', '/api/v3/account', { omitZeroBalances: 'true' })
  return new Map(acc.balances.map((b) => [b.asset, +b.free]))
}

type Rules = { step: number; minQty: number; minNotional: number }
const rulesCache = new Map<string, Rules | null>()
/** Reglas de Binance para la moneda: de a cuánto se puede comprar o vender y el mínimo por orden. null = no se puede operar */
async function rules(symbol: string): Promise<Rules | null> {
  if (rulesCache.has(symbol)) return rulesCache.get(symbol)!
  const res = await fetch(`${keys().base}/api/v3/exchangeInfo?symbol=${symbol}`, { cache: 'no-store' })
  if (!res.ok) return null // no existe en este servidor (pasa en la testnet): no se guarda por si fue un error de red
  const info = (await res.json()) as { symbols: { status: string; filters: Record<string, string>[] }[] }
  const filter = (type: string) => info.symbols[0]?.filters.find((x) => x.filterType === type)
  const marketLot = filter('MARKET_LOT_SIZE')
  const lot = marketLot && +marketLot.stepSize > 0 ? marketLot : filter('LOT_SIZE')
  const notional = filter('NOTIONAL')?.minNotional ?? filter('MIN_NOTIONAL')?.minNotional ?? '5'
  const r = info.symbols[0]?.status === 'TRADING' && lot ? { step: +lot.stepSize, minQty: +lot.minQty, minNotional: +notional } : null
  rulesCache.set(symbol, r)
  return r
}

/** Redondea hacia abajo al "paso" que acepta Binance (por ejemplo de a 0.001 BNB) */
function floorStep(qty: number, step: number) {
  const decimals = Math.max(0, Math.round(-Math.log10(step)))
  return Number((Math.floor(qty / step + 1e-9) * step).toFixed(decimals))
}

const coinOf = (symbol: string) => symbol.replace(/USDT$/, '')
const missing = (symbol: string) =>
  `${coinOf(symbol)}: en tu cuenta hay menos libre de lo que el bot tiene anotado (¿una orden tuya abierta o lo moviste?). Vendió lo que pudo.`
const tagMode = () => (isTestnet() ? '🧪 Bot de práctica (testnet)' : '💰 Bot REAL')

async function safeNotify(html: string) {
  try {
    await notify(html)
  } catch (e) {
    console.error('[real] No se pudo avisar por Telegram:', e)
  }
}

type OrderResult = { orderId: number; executedQty: string; cummulativeQuoteQty: string; fills: { commission: string; commissionAsset: string }[] }

/**
 * Orden de mercado. Compra por monto en USDT; vende por cantidad de monedas.
 * Actualiza la cuenta del bot con lo que REALMENTE se ejecutó (descontando comisiones).
 */
async function market(s: RealState, symbol: string, side: 'BUY' | 'SELL', amount: number, reason: string) {
  const base = coinOf(symbol)
  const params: Record<string, string | number> = { symbol, side, type: 'MARKET', newOrderRespType: 'FULL' }
  if (side === 'BUY') params.quoteOrderQty = amount.toFixed(2)
  else params.quantity = amount
  const r = await signedWith<OrderResult>(keys(), 'POST', '/api/v3/order', params)
  const qty = +r.executedQty
  const quote = +r.cummulativeQuoteQty
  if (!(qty > 0)) throw new BinanceError(`La orden de ${side === 'BUY' ? 'compra' : 'venta'} no se ejecutó`)
  const fee = (asset: string) => r.fills.filter((f) => f.commissionAsset === asset).reduce((sum, f) => sum + +f.commission, 0)
  const h = s.holdings[symbol] ?? { qty: 0, cost: 0 }
  if (side === 'BUY') {
    s.cash -= quote
    h.qty += qty - fee(base)
    h.cost += quote
  } else {
    s.cash += quote - fee('USDT')
    h.cost = h.qty > 0 ? h.cost * Math.max(0, 1 - qty / h.qty) : 0
    h.qty = Math.max(0, h.qty - qty)
  }
  s.holdings[symbol] = h
  ensureTable()
  db()
    .prepare('INSERT INTO real_orders (ts, symbol, side, qty, quote, order_id, reason, testnet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(Date.now(), symbol, side, qty, quote, r.orderId, reason, isTestnet() ? 1 : 0)
  await safeNotify(
    `${side === 'BUY' ? '🛒' : '💵'} <b>${tagMode()} ${side === 'BUY' ? 'compró' : 'vendió'} ${esc(base)}</b>\n` +
      `${qty} ${esc(base)} por ${quote.toFixed(2)} USDT\n<i>${esc(reason)}</i>`,
  )
}

/** Cuánto vale lo del bot: su USDT + sus monedas */
export const realValue = (s: RealState, prices: Map<string, number>) =>
  s.cash + Object.entries(s.holdings).reduce((sum, [sym, h]) => sum + h.qty * (prices.get(sym) ?? 0), 0)

/** Vende todas las monedas del bot (lo que se pueda: lo muy chiquito queda como "polvo") */
async function sellEverything(s: RealState, reason: string) {
  const free = await freeBalances()
  const errors: string[] = []
  const prices = await tradePrices()
  for (const [symbol, h] of Object.entries(s.holdings)) {
    const r = await rules(symbol)
    const price = prices.get(symbol) ?? 0
    const qty = r ? floorStep(Math.min(h.qty, free.get(coinOf(symbol)) ?? 0), r.step) : 0
    if (r && qty >= r.minQty && qty * price >= r.minNotional) {
      try {
        await market(s, symbol, 'SELL', qty, reason)
      } catch (e) {
        errors.push(`${coinOf(symbol)}: ${explainError(e)}`)
        continue
      }
    }
    const left = s.holdings[symbol].qty * price
    if (left >= (r?.minNotional ?? 5)) {
      errors.push(missing(symbol))
      continue
    }
    delete s.holdings[symbol] // "polvo": demasiado poco para venderlo
  }
  s.lastError = errors.join(' · ')
}

// ===== Empezar, pausar, vender todo =====

export async function startReal(opts: { follow: Competitor; budget: number; maxLoss: number; adopt: boolean }) {
  if (!realConfigured()) throw new BinanceError('Faltan BINANCE_TRADE_API_KEY y BINANCE_TRADE_API_SECRET en el .env')
  const prev = getReal()
  if (prev && Object.keys(prev.holdings).length) throw new BinanceError('Todavía tiene monedas: primero "Vender todo".')
  if (!isTestnet()) {
    // Con plata real: la llave NO puede tener permiso de retiro
    const perm = await signedWith<{ enableWithdrawals: boolean; enableSpotAndMarginTrading: boolean }>(keys(), 'GET', '/sapi/v1/account/apiRestrictions')
    if (perm.enableWithdrawals) throw new BinanceError('La llave tiene permiso de RETIRO. Desactívalo en Binance (Gestión de API) y vuelve a intentar.')
    if (!perm.enableSpotAndMarginTrading) throw new BinanceError('La llave no tiene permiso de operar en Spot ("Enable Spot & Margin Trading").')
  }
  const free = await freeBalances()
  const prices = await tradePrices()
  const holdings: RealState['holdings'] = {}
  if (opts.adopt) {
    // Tus monedas compradas pasan a ser del bot (solo lo libre: si tienes una orden abierta, esa parte está bloqueada)
    for (const x of await mySeed()) {
      const qty = Math.min(x.qty, free.get(coinOf(x.symbol)) ?? 0)
      if (qty * (prices.get(x.symbol) ?? 0) >= 1) holdings[x.symbol] = { qty, cost: qty * x.entry }
    }
  }
  const adopted = Object.values(holdings).reduce((sum, h) => sum + h.cost, 0)
  const cash = Math.max(0, opts.budget - adopted)
  const freeUsdt = free.get('USDT') ?? 0
  if (freeUsdt + 0.01 < cash) throw new BinanceError(`Necesita ${cash.toFixed(2)} USDT libres en Spot y hay ${freeUsdt.toFixed(2)}.`)

  const s: RealState = { ...opts, enabled: true, cash, holdings, peak: 0, started: Date.now(), lastRun: null, lastError: '', stopped: '' }
  s.peak = realValue(s, prices)
  s.units = opts.budget
  ensureTable()
  db().exec('DELETE FROM real_equity')
  save(s)
  const who = `${COMPETITORS[opts.follow].emoji} ${esc(COMPETITORS[opts.follow].label)}`
  await safeNotify(
    `🚀 <b>${tagMode()}: empieza</b>\nCopia la cartera de ${who} con ${opts.budget} USDT` +
      (adopted ? ` (incluye tus ${Object.keys(holdings).map((x) => esc(coinOf(x))).join(', ')})` : '') +
      `.\nFreno: si cae ${opts.maxLoss}% desde su mejor momento, vende todo y se apaga.`,
  )
  await runReal()
}

export function pauseReal() {
  const s = getReal()
  if (s) save({ ...s, enabled: false, stopped: '' })
}

export function resumeReal() {
  const s = getReal()
  if (s) save({ ...s, enabled: true, stopped: '', lastError: '' })
}

/**
 * ➕ Darle más fondos: suma USDT de tu cuenta al presupuesto del bot (desde ahí lo invierte junto con lo demás).
 * Solo si ese USDT está libre en Spot y no es ya del bot.
 */
export async function addFunds(amount: number) {
  const s = getReal()
  if (!s) throw new BinanceError('Primero empieza el bot')
  const free = (await freeBalances()).get('USDT') ?? 0
  const available = free - s.cash // el USDT libre que NO es del bot
  if (available + 0.01 < amount)
    throw new BinanceError(
      `Hay ${Math.max(0, available).toFixed(2)} USDT libres en Spot que no son del bot. Si los compraste en P2P, pásalos de la billetera Fondos a Spot.`,
    )
  const value = realValue(s, await tradePrices())
  s.units = unitsOf(s) + amount / (value / unitsOf(s)) // compra cuotas al valor de ahora
  s.cash += amount
  s.budget += amount // así la ganancia sigue siendo justa: lo que pusiste no cuenta como ganancia
  s.peak += amount
  save(s)
  await safeNotify(`➕ <b>${tagMode()}: recibió ${amount.toFixed(2)} USDT más</b>
Ahora maneja ${s.budget.toFixed(2)} USDT en total (lo que pusiste).`)
  await runReal()
}

/** Botón de pánico: vende todo lo del bot y lo apaga */
export async function sellAllReal() {
  const s = getReal()
  if (!s) return
  s.enabled = false
  await sellEverything(s, 'Vendido a mano (botón de pánico)')
  save(s)
  await safeNotify(`🛑 <b>${tagMode()}: vendí todo</b> (botón de pánico). Quedó apagado.`)
}

/** Para empezar de nuevo (solo si ya no tiene monedas) */
export function resetReal() {
  const s = getReal()
  if (s && !Object.keys(s.holdings).length) setMeta('real_state', 'null')
}

// ===== El ciclo: después de cada revisión de la competencia (cada 5 minutos) =====

let running = false

export async function runReal() {
  const s = getReal()
  if (!s?.enabled || running || !realConfigured()) return
  running = true
  try {
    const lastArena = Number(getMeta('arena_last_run') ?? 0)
    if (!getStartedAt() || getMeta('arena_enabled') !== '1' || Date.now() - lastArena > ARENA_STALE) {
      s.lastError = 'La competencia está en pausa o no se revisó hace rato: el bot espera para no copiar algo viejo.'
      return
    }
    const prices = await tradePrices()
    const value = realValue(s, prices)
    s.peak = Math.max(s.peak, value)
    snapshotReal(value, unitsOf(s))

    // 🛑 Freno de pérdida
    if (value < s.peak * (1 - s.maxLoss / 100)) {
      await sellEverything(s, `Freno: cayó más de ${s.maxLoss}% desde su mejor momento`)
      s.enabled = false
      s.stopped = `Se activó el freno: cayó más de ${s.maxLoss}% desde su mejor momento (${s.peak.toFixed(2)} USDT). Vendió todo.`
      await safeNotify(`🛑 <b>${tagMode()}: se activó el freno</b>\nCayó más de ${s.maxLoss}% desde su mejor momento. Vendió todo y se apagó.`)
      return
    }

    // Lo que debería tener: la misma proporción que la cartera del competidor que copia
    const target = mirrorTargets(listPositions(s.follow), getCash(s.follow), await getPrices(), value)
    const label = `Copia a ${COMPETITORS[s.follow].emoji} ${COMPETITORS[s.follow].label}`
    const errors: string[] = []

    // 1. Ventas primero (así hay USDT para las compras)
    let free = await freeBalances()
    let sold = false
    for (const [symbol, h] of Object.entries(s.holdings)) {
      const price = prices.get(symbol)
      const r = await rules(symbol)
      if (!price || !r) continue
      const want = target.get(symbol) ?? 0
      const have = h.qty * price
      if (want > 0 && have <= want * (1 + TOLERANCE)) continue
      const wanted = want > 0 ? (have - want) / price : h.qty
      const qty = floorStep(Math.min(wanted, free.get(coinOf(symbol)) ?? 0), r.step)
      if (qty < r.minQty || qty * price < r.minNotional) {
        if (wanted * price >= r.minNotional) errors.push(missing(symbol))
        else if (want === 0) delete s.holdings[symbol] // "polvo": demasiado poco para venderlo
        continue
      }
      try {
        await market(s, symbol, 'SELL', qty, want > 0 ? `${label}: tenía de más` : `${label}: él ya la vendió`)
        sold = true
        if (s.holdings[symbol].qty * price < r.minNotional && want === 0) delete s.holdings[symbol]
        else if (qty + r.step < wanted) errors.push(missing(symbol))
      } catch (e) {
        errors.push(`${coinOf(symbol)}: ${explainError(e)}`)
      }
    }
    if (sold) free = await freeBalances()

    // 2. Compras: nunca más que su propio USDT ni más de lo que hay libre en la cuenta
    let freeUsdt = free.get('USDT') ?? 0
    for (const [symbol, want] of target) {
      const price = prices.get(symbol)
      const r = await rules(symbol)
      if (!price || !r) {
        errors.push(`${coinOf(symbol)}: no se puede operar en ${isTestnet() ? 'la testnet' : 'Binance'}, se salta`)
        continue
      }
      const have = (s.holdings[symbol]?.qty ?? 0) * price
      if (have >= want * (1 - TOLERANCE)) continue
      const amount = Math.floor(Math.min(want - have, s.cash, freeUsdt) * 100) / 100
      if (amount < r.minNotional) continue
      try {
        const before = s.cash
        await market(s, symbol, 'BUY', amount, `${label}: compra para igualar su cartera`)
        freeUsdt -= before - s.cash
      } catch (e) {
        errors.push(`${coinOf(symbol)}: ${explainError(e)}`)
      }
    }
    s.lastError = errors.join(' · ')
  } catch (e) {
    s.lastError = explainError(e)
    console.error('[real] Error:', e)
  } finally {
    s.lastRun = Date.now()
    if (getReal()?.enabled === false) s.enabled = false // lo pausaste mientras revisaba
    save(s)
    running = false
  }
}
