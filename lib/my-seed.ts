import 'server-only'
import { getPrices, hasBinanceKeys } from './binance-account'
import type { Seed } from './paper-bot'
import { computeResults } from './trades'

/** Lo que tienes comprado en Binance contra USDT (según tus operaciones), si vale al menos 5 USDT */
export async function mySeed(): Promise<Seed[]> {
  if (!hasBinanceKeys()) return []
  const prices = await getPrices()
  return computeResults(prices)
    .open.filter((p) => p.quote === 'USDT' && p.qty * (p.price ?? 0) >= 5)
    .map((p) => ({ symbol: p.symbol, qty: p.qty, entry: p.avgCost }))
}
