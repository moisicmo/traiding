// Metas del mes y racha diaria, para animarte a seguir practicando.
// La racha solo cuenta días con al menos UNA VENTA CON GANANCIA (aunque sea de centavos).
import 'server-only'
import { getMeta, setMeta } from './db'
import { notify } from './telegram'
import type { ClosedOp } from './trades'

const TZ = 'America/La_Paz'
const DAY = 86_400_000

export type Goals = { pnl: number; ops: number }

export function getGoals(): Goals {
  return {
    pnl: Number(getMeta('goal_pnl')) || 1, // empezar con poco: 1 USDT al mes
    ops: Number(getMeta('goal_ops')) || 10,
  }
}

export function saveGoals(g: Goals) {
  setMeta('goal_pnl', String(g.pnl))
  setMeta('goal_ops', String(g.ops))
}

/** "2026-10-04" en hora de Bolivia */
export const dayKey = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ })
const monthKey = (ms: number) => dayKey(ms).slice(0, 7)

export type DayStatus = 'win' | 'loss' | 'none' // ganaste algún día / solo pérdidas / sin ventas
export type Progress = {
  goals: Goals
  monthPnl: number
  monthOps: number
  streak: number // días seguidos con una venta con ganancia (hasta hoy o ayer)
  best: number // tu mejor racha
  todayDone: boolean // ¿hoy ya tienes una venta con ganancia?
  last14: { key: string; label: string; status: DayStatus }[]
  avgPct: number | null // ganancia promedio por operación (todas tus ventas)
}

export function computeProgress(ops: ClosedOp[], now = Date.now()): Progress {
  const goals = getGoals()
  const month = monthKey(now)
  const thisMonth = ops.filter((o) => monthKey(o.time) === month)

  // Estado de cada día
  const days = new Map<string, DayStatus>()
  for (const o of ops) {
    const k = dayKey(o.time)
    if (o.pnl > 0) days.set(k, 'win')
    else if (!days.has(k)) days.set(k, 'loss')
  }
  const isWin = (ms: number) => days.get(dayKey(ms)) === 'win'

  // Racha actual: si hoy todavía no ganaste, sigue viva desde ayer (tienes hasta medianoche)
  const todayDone = isWin(now)
  let streak = 0
  for (let t = todayDone ? now : now - DAY; isWin(t); t -= DAY) streak++

  // Mejor racha de todas
  const winDays = [...days].filter(([, s]) => s === 'win').map(([k]) => Date.parse(`${k}T12:00:00Z`)).sort((a, b) => a - b)
  let best = 0
  let run = 0
  for (let i = 0; i < winDays.length; i++) {
    run = i > 0 && Math.round((winDays[i] - winDays[i - 1]) / DAY) === 1 ? run + 1 : 1
    best = Math.max(best, run)
  }

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const t = now - (13 - i) * DAY
    const key = dayKey(t)
    const label = new Date(t).toLocaleDateString('es-BO', { timeZone: TZ, weekday: 'narrow', day: 'numeric' })
    return { key, label, status: days.get(key) ?? 'none' }
  })

  return {
    goals,
    monthPnl: thisMonth.reduce((s, o) => s + o.pnl, 0),
    monthOps: thisMonth.length,
    streak,
    best: Math.max(best, streak),
    todayDone,
    last14,
    avgPct: ops.length ? ops.reduce((s, o) => s + o.pnlPct, 0) / ops.length : null,
  }
}

/**
 * Cuánto tendrías que invertir para llegar a tu meta de ganancia con TU ritmo:
 * meta ÷ (ganancia promedio por operación × operaciones al mes)
 */
export function capitalNeeded(p: Progress): number | null {
  if (!p.avgPct || p.avgPct <= 0) return null
  return p.goals.pnl / ((p.avgPct / 100) * p.goals.ops)
}

const usd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Tarea de cada 5 minutos: avisa cuando cumples una meta y recuerda la racha a las 20:00 */
export async function checkGoals(ops: ClosedOp[]) {
  const now = Date.now()
  const p = computeProgress(ops, now)
  const month = monthKey(now)
  const send = async (key: string, text: string) => {
    if (getMeta(key) === month || getMeta(key) === dayKey(now)) return
    await notify(text)
    setMeta(key, key.startsWith('remind') ? dayKey(now) : month)
  }

  if (p.monthPnl >= p.goals.pnl)
    await send('goal_pnl_notified', `🎯 <b>¡Meta del mes cumplida!</b>\nGanaste <b>${usd(p.monthPnl)} USDT</b> este mes (tu meta: ${usd(p.goals.pnl)}). ¿Subimos la meta?`)
  if (p.monthOps >= p.goals.ops)
    await send('goal_ops_notified', `🎯 <b>¡${p.monthOps} operaciones este mes!</b>\nCumpliste tu meta de ${p.goals.ops} operaciones.`)

  // Recordatorio a las 20:00 (hora de Bolivia) si tienes racha y hoy todavía no ganaste
  const hour = Number(new Date(now).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false })) % 24
  if (hour === 20 && p.streak > 0 && !p.todayDone)
    await send(
      'remind_streak',
      `🔥 <b>Tu racha de ${p.streak} ${p.streak === 1 ? 'día' : 'días'} termina a medianoche</b>\nTe falta una venta con ganancia hoy.\n<i>Pero si no ves una buena oportunidad, no la fuerces: es mejor perder la racha que perder plata.</i>`,
    )
}
