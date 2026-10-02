// Arma velas (como las de BTC) a partir de las fotos del precio P2P que guardamos cada 5 minutos.
// Binance P2P no da historial: el gráfico crece a medida que la app junta datos.
import type { UTCTimestamp } from 'lightweight-charts'
import type { Bar } from './binance'

export const P2P_INTERVALS = {
  '15m': { label: '15m', ms: 15 * 60_000, history: 3 * 86_400_000 },
  '1h': { label: '1h', ms: 3_600_000, history: 14 * 86_400_000 },
  '4h': { label: '4h', ms: 4 * 3_600_000, history: 60 * 86_400_000 },
  '1d': { label: '1d', ms: 86_400_000, history: 365 * 86_400_000 },
} as const
export type P2PInterval = keyof typeof P2P_INTERVALS
export type P2PSide = 'buy' | 'sell'

// El gráfico muestra la hora en UTC: corremos todo −4 h para que las velas y las horas sean de Bolivia
const LA_PAZ_OFFSET_MS = -4 * 3_600_000

type Snapshot = { ts: number; buy_best: number; sell_best: number }

export function buildCandles(rows: Snapshot[], interval: P2PInterval, side: P2PSide): Bar[] {
  const size = P2P_INTERVALS[interval].ms
  const candles: Bar[] = []
  for (const r of rows) {
    const price = side === 'buy' ? r.buy_best : r.sell_best
    const local = r.ts + LA_PAZ_OFFSET_MS
    const time = (Math.floor(local / size) * size / 1000) as UTCTimestamp
    const last = candles[candles.length - 1]
    if (last && last.time === time) {
      last.high = Math.max(last.high, price)
      last.low = Math.min(last.low, price)
      last.close = price
      last.volume++
    } else {
      // La vela abre donde cerró la anterior, así no quedan "saltos" entre velas
      const open = last ? last.close : price
      candles.push({ time, open, high: Math.max(open, price), low: Math.min(open, price), close: price, volume: 1 })
    }
  }
  return candles
}
