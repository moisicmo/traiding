// Backtest: "si este bot hubiera funcionado en el pasado, ¿cuánto habría ganado o perdido?"
// Recorre las velas una por una, como si fuera en vivo: en cada vela solo mira lo que YA pasó.
//
// Estrategia "rebote en la línea amarilla" (la de tu compra de BNB):
//   COMPRA  cuando viene subiendo (amarilla sobre azul y la azul en alza) y el precio baja a tocar la amarilla.
//           Compra al ABRIR la vela siguiente (nunca al precio de una vela que ya cerró: eso sería trampa).
//   VENDE   cuando llega al take profit, al stop loss, o si pasan demasiadas velas sin que pase nada.
//           Si en la misma vela se tocan los dos, contamos el stop loss (somos pesimistas a propósito).
import type { Bar } from './binance'
import { smaAt } from './indicators'

export const FEE = 0.001 // 0,1% por operación, como Binance

export type Params = {
  tp: number // take profit, % (ej. 3)
  sl: number // stop loss, % (ej. 2)
  maxBars: number // si no pasa nada en estas velas, vende igual
  stake: number // USDT por operación (siempre el mismo monto, sin "interés compuesto")
}

export const DEFAULT_PARAMS: Params = { tp: 3, sl: 2, maxBars: 30, stake: 100 }

export type ExitReason = 'tp' | 'sl' | 'time'

export type Trade = {
  entryTime: number // ms
  entry: number
  exitTime: number
  exit: number
  reason: ExitReason
  pnlPct: number // neto, con comisiones
  pnl: number // en USDT, sobre el monto de cada operación
  bars: number // cuántas velas duró
}

export type Stats = {
  trades: number
  wins: number
  losses: number
  winRate: number // %
  total: number // USDT
  totalPct: number // % sobre el monto de una operación
  avgWin: number // %
  avgLoss: number // %
  best: number // %
  worst: number // %
  maxDrawdown: number // USDT: la peor caída desde un máximo de ganancia
  worstStreak: number // pérdidas seguidas
  buyHold: number // USDT: si hubieras comprado al inicio y no tocabas nada
  from: number // ms
  to: number // ms
}

export type Result = { trades: Trade[]; stats: Stats }

/** ¿En esta vela se cumple la regla de compra? Solo usa velas hasta i (inclusive). */
export function entrySignal(bars: Bar[], i: number): boolean {
  if (i < 60) return false
  const s20 = smaAt(bars, i, 20)!
  const s50 = smaAt(bars, i, 50)!
  const s50before = smaAt(bars, i - 10, 50)!
  const rising = s20 > s50 && s50 > s50before
  const b = bars[i]
  // "Tocar" = bajó hasta la amarilla pero cerró cerca o encima de ella (igual que en el análisis)
  const touch = b.low <= s20 * 1.005 && b.close >= s20 * 0.99
  return rising && touch
}

export function runBacktest(bars: Bar[], p: Params = DEFAULT_PARAMS): Result {
  const trades: Trade[] = []
  let i = 60
  while (i < bars.length - 1) {
    if (!entrySignal(bars, i)) {
      i++
      continue
    }
    // Compra al abrir la vela siguiente
    const entryIdx = i + 1
    const entry = bars[entryIdx].open
    const tpPrice = entry * (1 + p.tp / 100)
    const slPrice = entry * (1 - p.sl / 100)

    let exitIdx = -1
    let exit = 0
    let reason: ExitReason = 'time'
    for (let j = entryIdx; j < bars.length; j++) {
      const b = bars[j]
      const hitSl = b.low <= slPrice
      const hitTp = b.high >= tpPrice
      if (hitSl) {
        // Si abrió por debajo del stop (un "salto"), se vende a ese precio, no al stop
        ;[exitIdx, exit, reason] = [j, Math.min(slPrice, b.open), 'sl']
        break
      }
      if (hitTp) {
        ;[exitIdx, exit, reason] = [j, Math.max(tpPrice, b.open), 'tp']
        break
      }
      if (j - entryIdx + 1 >= p.maxBars) {
        ;[exitIdx, exit, reason] = [j, b.close, 'time']
        break
      }
    }
    if (exitIdx === -1) break // la última operación todavía estaría abierta: no la contamos

    const net = (exit / entry) * (1 - FEE) * (1 - FEE) - 1
    trades.push({
      entryTime: bars[entryIdx].time * 1000,
      entry,
      exitTime: bars[exitIdx].time * 1000,
      exit,
      reason,
      pnlPct: net * 100,
      pnl: net * p.stake,
      bars: exitIdx - entryIdx + 1,
    })
    i = exitIdx + 1 // una operación a la vez
  }
  return { trades, stats: stats(bars, trades, p) }
}

function stats(bars: Bar[], trades: Trade[], p: Params): Stats {
  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl <= 0)
  const total = trades.reduce((s, t) => s + t.pnl, 0)

  let peak = 0
  let equity = 0
  let maxDrawdown = 0
  let streak = 0
  let worstStreak = 0
  for (const t of trades) {
    equity += t.pnl
    peak = Math.max(peak, equity)
    maxDrawdown = Math.max(maxDrawdown, peak - equity)
    streak = t.pnl <= 0 ? streak + 1 : 0
    worstStreak = Math.max(worstStreak, streak)
  }

  const avg = (list: Trade[]) => (list.length ? list.reduce((s, t) => s + t.pnlPct, 0) / list.length : 0)
  const first = bars[60] ?? bars[0]
  const last = bars[bars.length - 1]
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    total,
    totalPct: (total / p.stake) * 100,
    avgWin: avg(wins),
    avgLoss: avg(losses),
    best: Math.max(0, ...trades.map((t) => t.pnlPct)),
    worst: Math.min(0, ...trades.map((t) => t.pnlPct)),
    maxDrawdown,
    worstStreak,
    buyHold: ((last.close / first.open) * (1 - FEE) * (1 - FEE) - 1) * p.stake,
    from: first.time * 1000,
    to: last.time * 1000,
  }
}

