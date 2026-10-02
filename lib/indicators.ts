import type { Bar } from './binance'

/** Promedio de cierre de las `period` velas que terminan en la posición i (null si no hay suficientes) */
export function smaAt(data: Bar[], i: number, period: number): number | null {
  if (i < period - 1 || i >= data.length) return null
  let sum = 0
  for (let j = i - period + 1; j <= i; j++) sum += data[j].close
  return sum / period
}

/** Media móvil simple de toda la serie, lista para dibujar como línea */
export function sma(data: Bar[], period: number) {
  const out: { time: Bar['time']; value: number }[] = []
  for (let i = period - 1; i < data.length; i++) {
    out.push({ time: data[i].time, value: smaAt(data, i, period)! })
  }
  return out
}

export const pct = (from: number, to: number) => ((to - from) / from) * 100

export function median(arr: number[]) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
