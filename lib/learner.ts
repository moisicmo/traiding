// 🧠 Bot que aprende en ciclos — simulación sobre el pasado ("walk-forward").
//
// Cada semana (42 velas de 4 h) el bot:
//   1. ESTUDIA los últimos ~6 meses de cada moneda con "rebote" y "tendencia".
//   2. SE EXAMINA con los ~2 meses más recientes (que no usó para estudiar).
//   3. Usa en cada moneda la estrategia que ganó en LOS DOS; si ninguna, no opera esa moneda.
//   4. APRENDE DE SUS ERRORES: si pierde 3 veces seguidas en una moneda, la pausa 4 semanas.
// Y durante la semana opera con lo aprendido, vela por vela, sin ver nunca el futuro.
// Es una cartera: empieza con un capital, reinvierte todo y puede sumar un aporte cada mes.
import type { Bar } from './binance'
import { above, bounceSignal, defaultParams, FEE, START, tradeBounce, tradeTrend, trendSignal, type ExitReason, type Params } from './backtest'

export type LearnStrategy = 'bounce' | 'trend'
export type SimMode = 'learn' | 'trend' // aprendiendo, o siempre tendencia (para comparar)

export const CYCLE = 42 // 1 semana de velas de 4 h
export const STUDY = 1080 // ~6 meses para estudiar
export const EXAM = 360 // ~2 meses para examinarse
export const SLOTS = 4 // máximo de operaciones abiertas a la vez
export const PAUSE_AFTER = 3 // pérdidas seguidas en una moneda para pausarla
export const PAUSE_CYCLES = 4 // semanas que dura la pausa

export type CoinSeries = { symbol: string; base: string; name: string; bars: Bar[] }

export type SimTrade = {
  base: string
  strategy: LearnStrategy
  entryTime: number
  entry: number
  exitTime: number
  exit: number
  reason: ExitReason
  size: number // USDT puestos en la operación
  pnl: number // USDT ganados o perdidos (con comisiones)
  pnlPct: number
}

export type CycleLog = {
  time: number
  active: { base: string; strategy: LearnStrategy; study: number; exam: number }[]
  paused: string[] // monedas en pausa por errores
  events: string[] // lo que aprendió esa semana, en palabras
}

export type Point = { time: number; value: number }

export type SimResult = {
  mode: SimMode
  trades: SimTrade[]
  equity: Point[] // cuánto vale la cartera (una vez por día)
  invested: Point[] // cuánto pusiste en total hasta ese momento
  cycles: CycleLog[]
  final: number
  totalInvested: number
  from: number
  to: number
}

const PARAMS: Record<LearnStrategy, Params> = { bounce: defaultParams('bounce', '4h'), trend: defaultParams('trend', '4h') }
const monthKey = (ms: number) => new Date(ms - 4 * 3_600_000).toISOString().slice(0, 7) // hora de Bolivia

/** Suma de los % de ganancia de una estrategia en un tramo [from, to) de velas */
function score(bars: Bar[], strategy: LearnStrategy, from: number, to: number) {
  const trades = strategy === 'trend' ? tradeTrend(bars, PARAMS.trend, from, to) : tradeBounce(bars, PARAMS.bounce, from, to)
  return trades.reduce((s, t) => s + t.pnlPct, 0)
}

type Position = { coin: number; strategy: LearnStrategy; entryIdx: number; entryTime: number; entry: number; qty: number; size: number }

export type SimConfig = {
  capital: number
  monthly: number
  mode: SimMode
  pause?: boolean // pausar una moneda después de PAUSE_AFTER pérdidas seguidas (por defecto sí)
  exam?: boolean // exigir que también gane en el examen, no solo en el estudio (por defecto sí)
}

export function simulate(coins: CoinSeries[], master: Bar[], cfg: SimConfig): SimResult {
  const usePause = cfg.pause ?? true
  const useExam = cfg.exam ?? true
  // Para cada moneda: en qué vela está cada momento del tiempo (las monedas empezaron en fechas distintas)
  const index = coins.map((c) => new Map(c.bars.map((b, i) => [b.time, i])))
  const warmup = START + STUDY + EXAM
  const startM = warmup

  let cash = cfg.capital
  let invested = cfg.capital
  let lastMonth = monthKey(master[startM].time * 1000)
  const positions: Position[] = []
  const trades: SimTrade[] = []
  const equity: Point[] = []
  const investedSeries: Point[] = []
  const cycles: CycleLog[] = []
  let plan = new Map<number, LearnStrategy>() // moneda → estrategia de esta semana
  const losses = new Map<number, number>() // pérdidas seguidas por moneda
  const pausedUntil = new Map<number, number>() // moneda → ciclo hasta el que está pausada
  let cycle = -1
  let log: CycleLog | null = null

  const value = (m: number) =>
    cash +
    positions.reduce((s, p) => {
      const i = index[p.coin].get(master[m].time)
      return s + p.qty * (i === undefined ? p.entry : coins[p.coin].bars[i].close)
    }, 0)

  for (let m = startM; m < master.length; m++) {
    const time = master[m].time * 1000

    // Aporte mensual: al empezar cada mes
    const month = monthKey(time)
    if (month !== lastMonth) {
      lastMonth = month
      cash += cfg.monthly
      invested += cfg.monthly
    }

    // ===== Cada semana: estudiar, examinarse y armar el plan =====
    if ((m - startM) % CYCLE === 0) {
      cycle++
      const next = new Map<number, LearnStrategy>()
      log = { time, active: [], paused: [], events: [] }
      coins.forEach((c, k) => {
        const i = index[k].get(master[m].time)
        if (i === undefined || i < warmup) return // todavía no tiene historia suficiente
        if ((pausedUntil.get(k) ?? -1) >= cycle) {
          log!.paused.push(c.base)
          return
        }
        if (cfg.mode === 'trend') {
          next.set(k, 'trend')
          return
        }
        // Solo velas YA cerradas: estudio [i-EXAM-STUDY, i-EXAM) y examen [i-EXAM, i)
        let best: { strategy: LearnStrategy; study: number; exam: number } | null = null
        for (const strategy of ['bounce', 'trend'] as const) {
          const study = score(c.bars, strategy, i - EXAM - STUDY, i - EXAM)
          const exam = score(c.bars, strategy, i - EXAM, i)
          const passes = study > 0 && (!useExam || exam > 0)
          const better = !best || (useExam ? exam > best.exam : study > best.study)
          if (passes && better) best = { strategy, study, exam }
        }
        if (best) {
          next.set(k, best.strategy)
          log!.active.push({ base: c.base, ...best })
        }
      })
      if (cfg.mode === 'learn') {
        for (const [k, s] of next) if (plan.get(k) !== s) log.events.push(`Empieza a usar ${s === 'trend' ? 'tendencia' : 'rebote'} en ${coins[k].base}`)
        for (const [k, s] of plan) if (!next.has(k) && !log.paused.includes(coins[k].base)) log.events.push(`Deja de operar ${coins[k].base}: ${s === 'trend' ? 'la tendencia' : 'el rebote'} ya no ganó en el examen`)
      }
      plan = next
      cycles.push(log)
    }

    // ===== Vela por vela: primero las entradas, después las salidas =====
    // Entradas: la señal se mira en la vela anterior (ya cerrada) y se compra al abrir esta
    for (const [k, strategy] of plan) {
      if (positions.length >= SLOTS) break
      if (positions.some((p) => p.coin === k)) continue
      const bars = coins[k].bars
      const i = index[k].get(master[m].time)
      if (i === undefined || i < 1) continue
      const signal = strategy === 'trend' ? trendSignal(bars, i - 1) : bounceSignal(bars, i - 1)
      if (!signal) continue
      const size = Math.min(value(m - 1) / SLOTS, cash)
      if (size < 5) continue // Binance no deja operar menos de 5 USDT
      const entry = bars[i].open
      cash -= size
      positions.push({ coin: k, strategy, entryIdx: i, entryTime: bars[i].time * 1000, entry, qty: (size * (1 - FEE)) / entry, size })
    }

    // Salidas (también de lo que se compró en esta misma vela: si se desplomó apenas compró, el stop salta ya)
    for (let p = positions.length - 1; p >= 0; p--) {
      const pos = positions[p]
      const bars = coins[pos.coin].bars
      const i = index[pos.coin].get(master[m].time)
      if (i === undefined || i <= pos.entryIdx - 1) continue
      const b = bars[i]
      let exit: { price: number; reason: ExitReason } | null = null
      const sl = pos.entry * (1 - PARAMS[pos.strategy].sl / 100)
      if (b.low <= sl) exit = { price: Math.min(sl, b.open), reason: 'sl' }
      else if (pos.strategy === 'bounce') {
        const tp = pos.entry * (1 + PARAMS.bounce.tp / 100)
        if (b.high >= tp) exit = { price: Math.max(tp, b.open), reason: 'tp' }
        else if (i - pos.entryIdx + 1 >= PARAMS.bounce.maxBars) exit = { price: b.close, reason: 'time' }
      } else if (i > pos.entryIdx && !above(bars, i - 1)) exit = { price: b.open, reason: 'cross' }
      if (!exit) continue

      const proceeds = pos.qty * exit.price * (1 - FEE)
      cash += proceeds
      const pnl = proceeds - pos.size
      trades.push({
        base: coins[pos.coin].base,
        strategy: pos.strategy,
        entryTime: pos.entryTime,
        entry: pos.entry,
        exitTime: b.time * 1000,
        exit: exit.price,
        reason: exit.reason,
        size: pos.size,
        pnl,
        pnlPct: (pnl / pos.size) * 100,
      })
      positions.splice(p, 1)

      // Aprender de los errores: 3 pérdidas seguidas en una moneda → pausa
      const streak = pnl <= 0 ? (losses.get(pos.coin) ?? 0) + 1 : 0
      losses.set(pos.coin, streak)
      if (cfg.mode === 'learn' && usePause && streak >= PAUSE_AFTER) {
        losses.set(pos.coin, 0)
        pausedUntil.set(pos.coin, cycle + PAUSE_CYCLES)
        plan.delete(pos.coin)
        log?.events.push(`Pausa ${coins[pos.coin].base} por ${PAUSE_CYCLES} semanas: perdió ${PAUSE_AFTER} veces seguidas`)
      }
    }

    // Una foto por día del valor de la cartera
    if ((m - startM) % 6 === 0 || m === master.length - 1) {
      equity.push({ time, value: value(m) })
      investedSeries.push({ time, value: invested })
    }
  }

  const last = master.length - 1
  return {
    mode: cfg.mode,
    trades,
    equity,
    invested: investedSeries,
    cycles,
    final: value(last),
    totalInvested: invested,
    from: master[startM].time * 1000,
    to: master[last].time * 1000,
  }
}

/** "No tocar": reparte el capital (y cada aporte) en partes iguales entre las monedas disponibles y espera */
export function holdBenchmark(coins: CoinSeries[], master: Bar[], cfg: { capital: number; monthly: number }): Pick<SimResult, 'equity' | 'final' | 'totalInvested'> {
  const index = coins.map((c) => new Map(c.bars.map((b, i) => [b.time, i])))
  const startM = START + STUDY + EXAM
  const qty = new Array(coins.length).fill(0)
  let invested = 0
  let lastMonth = ''
  const equity: Point[] = []
  const priceAt = (k: number, m: number) => {
    const i = index[k].get(master[m].time)
    return i === undefined ? null : coins[k].bars[i]
  }
  const buy = (amount: number, m: number) => {
    const available = coins.map((_, k) => k).filter((k) => priceAt(k, m))
    for (const k of available) qty[k] += ((amount / available.length) * (1 - FEE)) / priceAt(k, m)!.open
    invested += amount
  }
  const value = (m: number) => qty.reduce((s, q, k) => s + q * (priceAt(k, m)?.close ?? 0), 0)
  for (let m = startM; m < master.length; m++) {
    const time = master[m].time * 1000
    const month = monthKey(time)
    if (m === startM) {
      buy(cfg.capital, m)
      lastMonth = month
    } else if (month !== lastMonth) {
      lastMonth = month
      if (cfg.monthly > 0) buy(cfg.monthly, m)
    }
    if ((m - startM) % 6 === 0 || m === master.length - 1) equity.push({ time, value: value(m) })
  }
  return { equity, final: value(master.length - 1), totalInvested: invested }
}

/** Ganancia de cada mes: cuánto creció la cartera, sin contar lo que pusiste ese mes */
export function monthlyGains(equity: Point[], invested: Point[]) {
  const months = new Map<string, { first: Point; last: Point; investedFirst: number; investedLast: number }>()
  equity.forEach((p, i) => {
    const key = monthKey(p.time)
    const m = months.get(key)
    if (!m) months.set(key, { first: equity[i - 1] ?? p, last: p, investedFirst: (invested[i - 1] ?? invested[i]).value, investedLast: invested[i].value })
    else {
      m.last = p
      m.investedLast = invested[i].value
    }
  })
  return [...months].map(([key, m]) => ({ key, gain: m.last.value - m.first.value - (m.investedLast - m.investedFirst) }))
}
