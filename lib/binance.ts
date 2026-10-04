// API pública de Binance: no necesita cuenta ni API key para leer precios.
// Docs: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints
import type { UTCTimestamp } from 'lightweight-charts'

export const REST = 'https://api.binance.com/api/v3'
export const WS = 'wss://stream.binance.com:9443/ws'

// Accesos rápidos en el gráfico (se puede abrir cualquier otra moneda desde Mercado)
export const SYMBOLS = [
  { value: 'BTCUSDT', label: 'BTC' },
  { value: 'BNBUSDT', label: 'BNB' },
  { value: 'ETHUSDT', label: 'ETH' },
  { value: 'SOLUSDT', label: 'SOL' },
] as const

export const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const

/** Un par contra USDT, por ejemplo "BTCUSDT" */
export type Symbol = string

export const isUsdtSymbol = (s: string) => /^[A-Z0-9]{2,15}USDT$/.test(s)
export type Interval = (typeof INTERVALS)[number]

export type Bar = {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// Una vela de Binance: [openTime, open, high, low, close, volume, ...]
type Kline = [number, string, string, string, string, string, ...unknown[]]

export function toBar(k: Kline): Bar {
  return {
    time: (k[0] / 1000) as UTCTimestamp,
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
  }
}

export async function getKlines(symbol: Symbol, interval: Interval, limit = 500): Promise<Bar[]> {
  const res = await fetch(`${REST}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)
  if (!res.ok) throw new Error(`Binance respondió ${res.status}`)
  return ((await res.json()) as Kline[]).map(toBar)
}

/** Variación del precio en las últimas 24 horas, en % */
export async function get24hChange(symbol: Symbol): Promise<number> {
  const res = await fetch(`${REST}/ticker/24hr?symbol=${symbol}`)
  if (!res.ok) throw new Error(`Binance respondió ${res.status}`)
  const t = (await res.json()) as { priceChangePercent: string }
  return +t.priceChangePercent
}

export const coinName = (symbol: Symbol) => symbol.replace('USDT', '')

export const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 4 : 2 })

export const signed = (n: number, decimals = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`
