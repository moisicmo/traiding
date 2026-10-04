// Mercado: monedas contra USDT que pasan un FILTRO DE SEGURIDAD con reglas objetivas.
// No es una lista fija: si mañana una moneda nueva cumple las reglas (años de historia, mucho
// movimiento), aparece sola; si una deja de cumplirlas, sale. Las que no pasan se muestran aparte
// con el motivo, para aprender a reconocerlas.
import 'server-only'
import { isStale, REST, toBar, type Bar } from './binance'
import { pct, smaAt } from './indicators'

/** Las reglas del filtro (se muestran en la pantalla tal cual) */
export const RULES = {
  minYears: 2, // al menos 2 años en Binance
  minVolume: 20_000_000, // al menos 20 millones de USD negociados por día (promedio 30 días)
  minTrades: 50_000, // al menos 50 mil operaciones por día (promedio 30 días)
  maxPump30d: 60, // no subió más de 60% en 30 días (subidas locas = alerta)
  maxDailyMove: 6, // no se mueve más de ±6% en un día normal
}

// Monedas "meme": valen por popularidad, no por lo que hacen. Se excluyen siempre.
const MEMES = new Set([
  'DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF', 'TRUMP', 'MEME', 'BOME', 'PEOPLE', '1000SATS', 'NOT', 'TURBO', 'PNUT',
  'NEIRO', 'ACT', 'MUBARAK', 'BROCCOLI714', 'PUMP', 'PENGU', 'MOODENG', 'GOAT', 'POPCAT', 'BRETT', 'DOGS', 'HMSTR', 'CATI',
  '1000CAT', '1000CHEEMS', 'BANANAS31', 'TST', 'LIBRA',
])
// Dólares digitales y similares: no tiene sentido comprarlos para ganar
const NOT_COINS = /^(USDC|FDUSD|TUSD|DAI|USDP|BUSD|EUR|EURI|USD1|PAX|AEUR|XUSD|BFUSD|RLUSD|USDE|PAXG|XAUT|WBTC|WBETH|BNSOL)$/
const LEVERAGED = /(UP|DOWN|BULL|BEAR)$/

export const NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', BNB: 'BNB', SOL: 'Solana', XRP: 'XRP', DOGE: 'Dogecoin', ADA: 'Cardano', TRX: 'TRON',
  AVAX: 'Avalanche', LINK: 'Chainlink', DOT: 'Polkadot', LTC: 'Litecoin', BCH: 'Bitcoin Cash', NEAR: 'NEAR', SUI: 'Sui',
  TON: 'Toncoin', XLM: 'Stellar', UNI: 'Uniswap', ATOM: 'Cosmos', APT: 'Aptos', ARB: 'Arbitrum', OP: 'Optimism',
  FIL: 'Filecoin', SHIB: 'Shiba Inu', ETC: 'Ethereum Classic', AAVE: 'Aave', HBAR: 'Hedera', ICP: 'Internet Computer',
  INJ: 'Injective', FET: 'Fetch.ai', TAO: 'Bittensor', ZEC: 'Zcash', QNT: 'Quant', ENA: 'Ethena', WLD: 'Worldcoin',
  SAND: 'The Sandbox', ALGO: 'Algorand', VET: 'VeChain', RENDER: 'Render', TIA: 'Celestia', SEI: 'Sei', STRK: 'Starknet',
}

export type Trend = 'up' | 'down' | 'flat'
export type Place = 'touching' | 'above' | 'far' | 'below'
export type Move = 'calm' | 'moving' | 'wild'

export type Coin = {
  symbol: string
  base: string
  name: string
  since: number // desde cuándo está en Binance (ms)
  price: number
  change24h: number
  avgVolume: number // USD negociados por día (promedio 30 días)
  avgTrades: number // operaciones por día (promedio 30 días)
  spark: number[] // cierre de los últimos 30 días
  sparkSma20: number[] // la línea amarilla en esos mismos 30 días
  change30d: number
  vsBtc30d: number // cuánto mejor (o peor) le fue que a Bitcoin en 30 días
  trend: Trend
  place: Place
  dailyMove: number
  move: Move
  watch: boolean // viene subiendo y toca la amarilla: la situación de tu compra de BNB
}

export type Rejected = { base: string; name: string; reasons: string[] }
export type Market = { coins: Coin[]; rejected: Rejected[] }

const FIVE_MIN = { next: { revalidate: 300 } }
const ONE_DAY = { next: { revalidate: 86_400 } } // la fecha de inicio no cambia: se pide una vez al día
const YEAR = 365.25 * 86_400_000

type Ticker = { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string; closeTime: number }
type RawKline = Parameters<typeof toBar>[0] & { 7: string; 8: number }

export async function getMarket(): Promise<Market> {
  const res = await fetch(`${REST}/ticker/24hr`, FIVE_MIN)
  if (!res.ok) throw new Error(`Binance respondió ${res.status}`)
  const tickers = (await res.json()) as Ticker[]

  // Candidatas: pares contra USDT con algo de movimiento hoy (las 60 con más volumen)
  const candidates = tickers
    .filter((t) => t.symbol.endsWith('USDT'))
    .map((t) => ({ t, base: t.symbol.slice(0, -4) }))
    .filter(({ base, t }) => !NOT_COINS.test(base) && !LEVERAGED.test(base) && +t.quoteVolume > 5_000_000)
    .sort((a, b) => +b.t.quoteVolume - +a.t.quoteVolume)
    .slice(0, 60)

  const results = await Promise.all(candidates.map(({ t, base }) => evaluate(t, base)))
  const coins = results.filter((r): r is Coin => 'symbol' in r)
  const rejected = results.filter((r): r is Rejected => 'reasons' in r)

  // Comparar con Bitcoin: ¿a quién le fue mejor en 30 días?
  const btc = coins.find((c) => c.base === 'BTC')
  if (btc) for (const c of coins) c.vsBtc30d = ((1 + c.change30d / 100) / (1 + btc.change30d / 100) - 1) * 100

  return { coins: coins.sort((a, b) => b.avgVolume - a.avgVolume), rejected }
}

async function evaluate(t: Ticker, base: string): Promise<Coin | Rejected> {
  const name = NAMES[base] ?? base
  const reasons: string[] = []
  if (isStale(t.closeTime)) return { base, name, reasons: ['No se opera en Binance ahora (par pausado o eliminado)'] }
  if (MEMES.has(base)) reasons.push('Es una moneda meme (vale por popularidad)')

  // ¿Desde cuándo existe en Binance? (la primera vela mensual)
  const first = await fetch(`${REST}/klines?symbol=${t.symbol}&interval=1M&startTime=0&limit=1`, ONE_DAY)
  const since = first.ok ? ((await first.json()) as RawKline[])[0]?.[0] ?? Date.now() : Date.now()
  const years = (Date.now() - since) / YEAR
  if (years < RULES.minYears) reasons.push(`Es nueva: solo ${years < 1 ? `${Math.max(1, Math.round(years * 12))} meses` : `${years.toFixed(1)} años`} en Binance`)

  if (reasons.length) return { base, name, reasons }

  const kRes = await fetch(`${REST}/klines?symbol=${t.symbol}&interval=1d&limit=60`, FIVE_MIN)
  if (!kRes.ok) return { base, name, reasons: ['No se pudieron leer sus datos'] }
  const raw = (await kRes.json()) as RawKline[]
  const bars = raw.map(toBar)
  if (bars.length < 55) return { base, name, reasons: ['Tiene poco historial'] }

  const month = raw.slice(-30)
  const avgVolume = month.reduce((s, k) => s + +k[7], 0) / month.length
  const avgTrades = month.reduce((s, k) => s + k[8], 0) / month.length
  const coin = summarize(t, base, name, since, bars, avgVolume, avgTrades)

  if (avgVolume < RULES.minVolume) reasons.push(`Poco movimiento: ${(avgVolume / 1e6).toFixed(1)} millones USD por día`)
  if (avgTrades < RULES.minTrades) reasons.push(`Pocas operaciones: ${Math.round(avgTrades).toLocaleString('es')} por día`)
  if (coin.change30d > RULES.maxPump30d) reasons.push(`Subió demasiado rápido: +${coin.change30d.toFixed(0)}% en 30 días`)
  if (coin.dailyMove > RULES.maxDailyMove) reasons.push(`Muy brusca: se mueve ±${coin.dailyMove.toFixed(1)}% en un día normal`)
  return reasons.length ? { base, name, reasons } : coin
}

// Las mismas reglas que el análisis de 2 meses, resumidas
function summarize(t: Ticker, base: string, name: string, since: number, bars: Bar[], avgVolume: number, avgTrades: number): Coin {
  const last = bars.length - 1
  const price = +t.lastPrice
  const s20 = smaAt(bars, last, 20)!
  const s50 = smaAt(bars, last, 50)!
  const slope = pct(smaAt(bars, last - 10, 50)!, s50)
  const trend: Trend = s20 > s50 && slope > 1 ? 'up' : s20 < s50 && slope < -1 ? 'down' : 'flat'

  const dist = pct(s20, price)
  const place: Place = Math.abs(dist) <= 2 ? 'touching' : dist > 6 ? 'far' : dist > 0 ? 'above' : 'below'

  const recent = bars.slice(-30)
  const dailyMove = recent.slice(1).reduce((s, b, i) => s + Math.abs(pct(recent[i].close, b.close)), 0) / (recent.length - 1)
  const move: Move = dailyMove < 2.5 ? 'calm' : dailyMove < 4.5 ? 'moving' : 'wild'

  return {
    symbol: t.symbol,
    base,
    name,
    since,
    price,
    change24h: +t.priceChangePercent,
    avgVolume,
    avgTrades,
    spark: recent.map((b) => b.close),
    sparkSma20: recent.map((_, i) => smaAt(bars, bars.length - 30 + i, 20)!),
    change30d: pct(recent[0].close, price),
    vsBtc30d: 0,
    trend,
    place,
    dailyMove,
    move,
    watch: trend === 'up' && place === 'touching',
  }
}
