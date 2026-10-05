// Historial largo de velas (Binance da hasta 1000 por pedido: pedimos varias veces hacia atrás)
import 'server-only'
import { REST, toBar, type Bar } from './binance'

import type { BtInterval } from './backtest'

export const BT_INTERVALS: Record<BtInterval, { label: string; bars: number }> = {
  '4h': { label: 'Velas de 4 horas', bars: 4400 }, // ~2 años
  '1d': { label: 'Velas de 1 día', bars: 1460 }, // ~4 años (o desde que existe)
}
export type { BtInterval }

export async function getHistory(symbol: string, interval: BtInterval): Promise<Bar[]> {
  const total = BT_INTERVALS[interval].bars
  const out: Parameters<typeof toBar>[0][] = []
  let end = Date.now()
  while (out.length < total) {
    // El historial viejo no cambia: lo guardamos 1 hora para no pedirlo a Binance cada vez
    const res = await fetch(`${REST}/klines?symbol=${symbol}&interval=${interval}&limit=1000&endTime=${end}`, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`Binance respondió ${res.status}`)
    const batch = (await res.json()) as Parameters<typeof toBar>[0][]
    if (!batch.length) break
    out.unshift(...batch)
    if (batch.length < 1000) break
    end = batch[0][0] - 1
  }
  return out.slice(-total).map(toBar)
}
