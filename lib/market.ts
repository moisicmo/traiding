// Mercado: las monedas conocidas contra USDT, con su situación explicada en palabras simples.
// Usamos una lista fija de monedas grandes y establecidas: ordenar solo por volumen trae monedas
// "de moda" que suben y bajan 20% en un día, justo lo que no queremos para aprender.
import 'server-only'
import { REST, toBar, type Bar } from './binance'
import { pct, smaAt } from './indicators'

export const POPULAR: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  BNB: 'BNB',
  SOL: 'Solana',
  XRP: 'XRP',
  DOGE: 'Dogecoin',
  ADA: 'Cardano',
  TRX: 'TRON',
  AVAX: 'Avalanche',
  LINK: 'Chainlink',
  DOT: 'Polkadot',
  LTC: 'Litecoin',
  BCH: 'Bitcoin Cash',
  NEAR: 'NEAR',
  SUI: 'Sui',
  TON: 'Toncoin',
  XLM: 'Stellar',
  UNI: 'Uniswap',
  ATOM: 'Cosmos',
  APT: 'Aptos',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  FIL: 'Filecoin',
  SHIB: 'Shiba Inu',
}

export type Trend = 'up' | 'down' | 'flat'
export type Place = 'touching' | 'above' | 'far' | 'below'
export type Move = 'calm' | 'moving' | 'wild'

export type Coin = {
  symbol: string
  base: string
  name: string
  price: number
  change24h: number
  volume: number // USDT negociados en 24 h
  spark: number[] // cierre de los últimos 30 días
  sparkSma20: number[] // la línea amarilla en esos mismos 30 días
  change30d: number
  trend: Trend
  place: Place
  dailyMove: number // cuánto se mueve en un día normal (promedio, %)
  move: Move
  watch: boolean // misma situación que tu compra de BNB que salió bien
}

const CACHE = { next: { revalidate: 300 } } // los datos se piden a Binance como mucho cada 5 minutos

type Ticker = { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }

export async function getMarket(): Promise<Coin[]> {
  const res = await fetch(`${REST}/ticker/24hr`, CACHE)
  if (!res.ok) throw new Error(`Binance respondió ${res.status}`)
  const tickers = new Map(((await res.json()) as Ticker[]).map((t) => [t.symbol, t]))

  const coins = await Promise.all(
    Object.entries(POPULAR).map(async ([base, name]) => {
      const t = tickers.get(`${base}USDT`)
      if (!t) return null // no se cambia contra USDT en Binance
      const kRes = await fetch(`${REST}/klines?symbol=${base}USDT&interval=1d&limit=60`, CACHE)
      if (!kRes.ok) return null
      const bars = ((await kRes.json()) as Parameters<typeof toBar>[0][]).map(toBar)
      if (bars.length < 55) return null
      return summarize(base, name, t, bars)
    }),
  )
  return coins.filter((c): c is Coin => c !== null).sort((a, b) => b.volume - a.volume)
}

// Las mismas reglas que el análisis de 2 meses, resumidas
function summarize(base: string, name: string, t: Ticker, bars: Bar[]): Coin {
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
    symbol: `${base}USDT`,
    base,
    name,
    price,
    change24h: +t.priceChangePercent,
    volume: +t.quoteVolume,
    spark: recent.map((b) => b.close),
    sparkSma20: recent.map((_, i) => smaAt(bars, bars.length - 30 + i, 20)!),
    change30d: pct(recent[0].close, price),
    trend,
    place,
    dailyMove,
    move,
    watch: trend === 'up' && place === 'touching',
  }
}
