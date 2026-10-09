// Backtest: "si este bot hubiera funcionado en el pasado, ¿cuánto habría ganado o perdido?"
// Recorre las velas una por una, como si fuera en vivo: en cada vela solo mira lo que YA pasó.
// Siempre compra al ABRIR la vela siguiente a la señal (nunca al precio de una vela que ya cerró:
// eso sería trampa), cobra 0,1% de comisión por lado y, si en una vela se tocan la ganancia y
// la pérdida, cuenta la pérdida (somos pesimistas a propósito).
import type { Bar } from './binance'
import { bollSignal, exitBy, fibSignal, goldenSignal, hybridSignal, pocSignal, rsiSignal, smcSignal, trendPlusSignal, turtleSignal, type EntryPlan } from './signals'

export const FEE = 0.001 // 0,1% por operación, como Binance

export type Strategy = 'bounce' | 'trend' | 'trendplus' | 'dca' | 'dip' | 'poc' | 'fib' | 'smc' | 'rsi' | 'boll' | 'turtle' | 'hybrid' | 'half' | 'golden' | 'rebal'
export type BtInterval = '4h' | '1d'

export const STRATEGIES: Record<Strategy, { emoji: string; label: string; short: string; how: string[] }> = {
  bounce: {
    emoji: '🟡',
    label: 'Rebote en la amarilla',
    short: 'Rebote',
    how: [
      'Compra cuando viene subiendo (amarilla sobre azul, y la azul en alza) y el precio baja a tocar la amarilla. Igual que tu compra de BNB.',
      'Vende al llegar a la ganancia (take profit), a la pérdida máxima (stop loss), o si pasan demasiadas velas sin que pase nada.',
      'Busca ganancias chicas y frecuentes.',
    ],
  },
  trend: {
    emoji: '📈',
    label: 'Seguir la tendencia',
    short: 'Tendencia',
    how: [
      'Compra cuando la amarilla cruza hacia ARRIBA a la azul: empieza una subida.',
      'Vende cuando la amarilla cruza hacia ABAJO a la azul (se acabó la subida), o en el stop loss si cae de golpe.',
      'Acierta pocas veces, pero cuando acierta se queda en subidas grandes. Hay que aguantar varias pérdidas chicas seguidas.',
    ],
  },
  trendplus: {
    emoji: '🛡️',
    label: 'Tendencia+ (media 200)',
    short: 'Tendencia+',
    how: [
      'Una versión más paciente de "seguir la tendencia".',
      'Compra cuando el precio sube más de 5% arriba de su media de 200 velas (≈33 días).',
      'Se queda dentro mientras siga arriba, y vende cuando cae más de 5% debajo de esa media. Así sale de las caídas grandes sin salir por cualquier bajadita.',
    ],
  },
  dip: {
    emoji: '🎯',
    label: 'Tu estrategia: comprar en la caída',
    short: 'Tuya',
    how: [
      'Después de una vela que cerró bajando, pone una compra límite un poco más abajo (como tu compra de BNB a 765,27 cuando estaba en ~774).',
      'Cuando se compra, pone la venta límite un poco más arriba. Stop loss opcional: con 0 no hay stop, como haces hoy.',
      'Si al final quedó algo comprado sin vender, se cuenta con el precio de hoy (así no se esconden las pérdidas de lo que nunca rebotó).',
    ],
  },
  poc: {
    emoji: '📊',
    label: 'POC (perfil de volumen)',
    short: 'POC',
    how: [
      'Calcula el POC: el precio donde más se compró y vendió en los últimos ~20 días.',
      'Compra si el precio venía arriba y baja a tocar el POC (la idea: ahí "defienden" ese precio).',
      'Vende con +6%, con stop loss de −4%, o si pasan ~10 días.',
    ],
  },
  fib: {
    emoji: '🌀',
    label: 'Fibonacci',
    short: 'Fibo',
    how: [
      'Busca la última subida de 10% o más.',
      'Compra si el precio retrocede al 61,8% de esa subida y rebota.',
      'Vende cuando vuelve al máximo de la subida; stop loss si cae más allá del 78,6%.',
    ],
  },
  smc: {
    emoji: '🏦',
    label: 'Smart Money (SMC)',
    short: 'SMC',
    how: [
      'Quiebre de estructura: una vela cierra arriba del máximo de los últimos ~3 días.',
      'Order block: la última vela roja antes del quiebre. Compra la primera vez que el precio vuelve ahí.',
      'Stop loss debajo del order block; vende cuando gana el doble de lo que arriesgó (2:1).',
    ],
  },
  rsi: {
    emoji: '📉',
    label: 'RSI (sobrevendido)',
    short: 'RSI',
    how: [
      'El RSI va de 0 a 100: debajo de 30 se dice que está "sobrevendido" (bajó demasiado).',
      'Compra cuando el RSI estaba debajo de 30 y vuelve a subir de 30.',
      'Vende cuando el RSI pasa de 70 ("sobrecomprado"), con stop loss de −8% o a los ~10 días.',
    ],
  },
  boll: {
    emoji: '〰️',
    label: 'Bandas de Bollinger',
    short: 'Bollinger',
    how: [
      'Una franja alrededor del promedio de 20 velas, que se ensancha cuando el precio se mueve mucho.',
      'Compra cuando el precio cerró debajo de la banda de abajo y vuelve a entrar.',
      'Vende al llegar a la línea del medio, con stop loss de −5% o a los ~5 días.',
    ],
  },
  turtle: {
    emoji: '🐢',
    label: 'Ruptura de las Tortugas',
    short: 'Tortugas',
    how: [
      'La estrategia de los famosos "Turtle traders" de los años 80.',
      'Compra cuando el precio cierra arriba del máximo de las últimas 20 velas.',
      'Vende cuando cierra debajo del mínimo de las últimas 10 velas, o con stop loss de −8%.',
    ],
  },
  hybrid: {
    emoji: '🧬',
    label: 'Híbrido Tortugas + Tendencia',
    short: 'Híbrido',
    how: [
      'Compra solo cuando las dos están de acuerdo: el precio rompe el máximo de las últimas 20 velas (Tortugas) y la amarilla está encima de la azul (Tendencia).',
      'Vende como las Tortugas: cuando cierra debajo del mínimo de las últimas 10 velas, o con stop loss de −8%.',
      'Opera menos veces que cada una por separado: la idea es evitar las compras falsas.',
    ],
  },
  half: {
    emoji: '🤝',
    label: 'Mitad Tortugas, mitad Tendencia',
    short: 'Mitad',
    how: [
      'La mitad de la plata la maneja Tortugas y la otra mitad Tendencia, cada una con sus propias reglas.',
      'No inventa nada nuevo: cuando una se equivoca, muchas veces la otra no, y las caídas se suavizan.',
      'Cada operación usa la mitad del monto (50 de los 100 USDT).',
    ],
  },
  golden: {
    emoji: '✨',
    label: 'Golden cross 50/200',
    short: 'Golden',
    how: [
      'Como "seguir la tendencia", pero con promedios más lentos: 50 y 200 velas.',
      'Compra cuando la media de 50 cruza hacia arriba a la de 200 (golden cross).',
      'Vende en el cruce contrario (death cross), o con stop loss de −10%.',
    ],
  },
  rebal: {
    emoji: '⚖️',
    label: 'Rebalanceo 50/50',
    short: 'Rebalanceo',
    how: [
      'Tiene siempre la mitad en la moneda y la mitad en USDT.',
      'Cada semana vuelve al 50/50: si la moneda subió, vende un poco; si bajó, compra un poco.',
      'Nunca adivina: vende caro y compra barato de forma automática.',
    ],
  },
  dca: {
    emoji: '🗓️',
    label: 'Compra semanal',
    short: 'Semanal',
    how: [
      'Reparte los 100 USDT en partes iguales y compra un poquito cada semana, sin mirar el gráfico.',
      'Nunca vende: al final se cuenta cuánto vale lo que juntó.',
      'Es la más simple y la que menos estrés da: no hay que adivinar el momento.',
    ],
  },
}

export type Params = {
  tp: number // take profit, % (rebote)
  sl: number // stop loss, % (rebote y tendencia)
  maxBars: number // vender igual si pasan estas velas (rebote)
  dip: number // tu estrategia: comprar este % debajo del precio
  stake: number // USDT por operación / total a invertir (siempre 100, sin "interés compuesto")
}

/** Configuración recomendada de cada estrategia (la que mejor funcionó en las pruebas, sin exagerar) */
export function defaultParams(strategy: Strategy, interval: BtInterval): Params {
  if (strategy === 'trend') return { tp: 0, sl: 8, maxBars: 0, dip: 0, stake: 100 }
  if (strategy === 'dca') return { tp: 0, sl: 0, maxBars: 0, dip: 0, stake: 100 }
  // Tus números de BNB: compra ~1,5% abajo, vende ~2% arriba, sin stop loss
  if (strategy === 'dip') return { tp: 2, sl: 0, maxBars: 0, dip: 1.5, stake: 100 }
  return { tp: 5, sl: 3, maxBars: interval === '4h' ? 42 : 10, dip: 0, stake: 100 }
}

export type ExitReason = 'tp' | 'sl' | 'time' | 'cross' | 'open' | 'rule' // open = sigue comprado al final · rule = su regla de salida

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
  trades: number // operaciones (en compra semanal: cantidad de compras)
  wins: number
  losses: number
  winRate: number // %
  total: number // USDT ganados o perdidos
  avgWin: number // %
  avgLoss: number // %
  maxDrawdown: number // USDT: la peor caída desde un máximo de ganancia
  worstStreak: number // pérdidas seguidas
  buyHold: number // USDT: si hubieras comprado 100 al inicio y no tocabas nada
  from: number // ms
  to: number // ms
}

export type Result = {
  strategy: Strategy
  trades: Trade[]
  stats: Stats
  equity: { time: number; value: number }[] // ganancia acumulada a lo largo del tiempo
}

export const START = 60 // las primeras 60 velas solo sirven para calcular las líneas
const net = (entry: number, exit: number) => (exit / entry) * (1 - FEE) * (1 - FEE) - 1

/**
 * La línea amarilla (promedio de 20 velas) y la azul (50) de cada vela, calculadas UNA vez por historial.
 * El bot que aprende hace miles de mini-pruebas sobre el mismo historial: recalcularlas cada vez sería lentísimo.
 */
type Lines = { s20: Float64Array; s50: Float64Array }
const linesCache = new WeakMap<Bar[], Lines>()
export function lines(bars: Bar[]): Lines {
  let l = linesCache.get(bars)
  if (!l) {
    const avg = (period: number) => {
      const out = new Float64Array(bars.length).fill(NaN)
      let sum = 0
      for (let i = 0; i < bars.length; i++) {
        sum += bars[i].close
        if (i >= period) sum -= bars[i - period].close
        if (i >= period - 1) out[i] = sum / period
      }
      return out
    }
    l = { s20: avg(20), s50: avg(50) }
    linesCache.set(bars, l)
  }
  return l
}

export function runStrategy(bars: Bar[], strategy: Strategy, p: Params, interval: BtInterval): Result {
  if (strategy === 'dca') return runDca(bars, p, interval)
  if (strategy === 'rebal') return runRebalance(bars, p, interval)
  if (strategy === 'half') {
    // Dos carteras de 50: las operaciones de las dos juntas, en el orden en que se cerraron
    const stake = p.stake / 2
    const trades = [...tradeTrend(bars, { ...defaultParams('trend', interval), stake }), ...tradePlanned(bars, turtleSignal, stake)].sort((a, b) => a.exitTime - b.exitTime)
    return { strategy, trades, stats: tradeStats(bars, trades), equity: tradeEquity(bars, trades) }
  }
  const trades =
    strategy === 'trend'
      ? tradeTrend(bars, p)
      : strategy === 'dip'
        ? tradeDip(bars, p)
        : strategy in PLANNED
          ? tradePlanned(bars, PLANNED[strategy as keyof typeof PLANNED], p.stake)
          : tradeBounce(bars, p)
  return { strategy, trades, stats: tradeStats(bars, trades), equity: tradeEquity(bars, trades) }
}

// ===== Rebote en la amarilla =====

/** ¿En esta vela se cumple la regla de compra del rebote? Solo usa velas hasta i (inclusive). */
export function bounceSignal(bars: Bar[], i: number): boolean {
  if (i < START) return false
  const { s20: a20, s50: a50 } = lines(bars)
  const s20 = a20[i]
  const s50 = a50[i]
  const rising = s20 > s50 && s50 > a50[i - 10]
  const b = bars[i]
  // "Tocar" = bajó hasta la amarilla pero cerró cerca o encima de ella (igual que en el análisis)
  const touch = b.low <= s20 * 1.005 && b.close >= s20 * 0.99
  return rising && touch
}

/** Operaciones del rebote. Con from/to se prueba solo un tramo: entra y sale dentro de [from, to). */
export function tradeBounce(bars: Bar[], p: Params, from = START, to = bars.length): Trade[] {
  const trades: Trade[] = []
  for (let i = Math.max(from, START); i < to - 1; i++) {
    if (!bounceSignal(bars, i)) continue
    const entryIdx = i + 1
    const entry = bars[entryIdx].open
    const tpPrice = entry * (1 + p.tp / 100)
    const slPrice = entry * (1 - p.sl / 100)
    let exit: { idx: number; price: number; reason: ExitReason } | null = null
    for (let j = entryIdx; j < to && !exit; j++) {
      const b = bars[j]
      // Si abrió por debajo del stop (un "salto"), se vende a ese precio, no al stop
      if (b.low <= slPrice) exit = { idx: j, price: Math.min(slPrice, b.open), reason: 'sl' }
      else if (b.high >= tpPrice) exit = { idx: j, price: Math.max(tpPrice, b.open), reason: 'tp' }
      else if (j - entryIdx + 1 >= p.maxBars) exit = { idx: j, price: b.close, reason: 'time' }
    }
    // Si quedó abierta al final del tramo, la contamos al último precio del tramo (nunca más allá: sería ver el futuro)
    if (!exit) exit = { idx: to - 1, price: bars[to - 1].close, reason: 'open' }
    trades.push(makeTrade(bars, entryIdx, entry, exit.idx, exit.price, exit.reason, p.stake))
    i = exit.idx // una operación a la vez
  }
  return trades
}

// ===== Seguir la tendencia =====

/** ¿La amarilla está encima de la azul en esta vela? */
export const above = (bars: Bar[], i: number) => {
  const { s20, s50 } = lines(bars)
  return s20[i] > s50[i]
}

/** ¿En esta vela la amarilla cruzó hacia arriba a la azul? (señal de compra de la tendencia) */
export const trendSignal = (bars: Bar[], i: number) => i >= START && above(bars, i) && !above(bars, i - 1)

export function tradeTrend(bars: Bar[], p: Params, from = START, to = bars.length): Trade[] {
  const trades: Trade[] = []
  for (let i = Math.max(from, START); i < to - 1; i++) {
    // Señal: en esta vela la amarilla pasó a estar encima de la azul (cruce hacia arriba)
    if (!trendSignal(bars, i)) continue
    const entryIdx = i + 1
    const entry = bars[entryIdx].open
    const slPrice = entry * (1 - p.sl / 100)
    let exit: { idx: number; price: number; reason: ExitReason } | null = null
    for (let j = entryIdx; j < to && !exit; j++) {
      const b = bars[j]
      if (b.low <= slPrice) exit = { idx: j, price: Math.min(slPrice, b.open), reason: 'sl' }
      // Si la vela anterior cerró con la amarilla debajo de la azul, vende al abrir esta
      else if (j > entryIdx && !above(bars, j - 1)) exit = { idx: j, price: b.open, reason: 'cross' }
    }
    if (!exit) exit = { idx: to - 1, price: bars[to - 1].close, reason: 'open' } // abierta al final del tramo: su último precio
    trades.push(makeTrade(bars, entryIdx, entry, exit.idx, exit.price, exit.reason, p.stake))
    i = exit.idx
  }
  return trades
}

// ===== POC, Fibonacci y Smart Money: cada señal trae su propio plan (stop, objetivo, tiempo) =====

export const PLANNED = { poc: pocSignal, fib: fibSignal, smc: smcSignal, rsi: rsiSignal, boll: bollSignal, turtle: turtleSignal, hybrid: hybridSignal, golden: goldenSignal, trendplus: trendPlusSignal } as const
export type PlannedStrategy = keyof typeof PLANNED

/** Convierte el plan en precios concretos con la compra real. null si el plan no tiene sentido (stop arriba de la compra, etc.) */
export function planPrices(plan: EntryPlan, entry: number): { sl: number; tp: number } | null {
  const sl = plan.sl ?? (plan.slPct ? entry * (1 - plan.slPct / 100) : 0)
  const tp = plan.tp ?? (plan.tpPct ? entry * (1 + plan.tpPct / 100) : plan.rr && sl ? entry + (entry - sl) * plan.rr : Infinity)
  if (sl >= entry || tp <= entry) return null
  return { sl, tp }
}

export function tradePlanned(bars: Bar[], signal: (bars: Bar[], i: number) => EntryPlan | null, stake: number): Trade[] {
  const trades: Trade[] = []
  for (let i = START; i < bars.length - 1; i++) {
    const plan = signal(bars, i)
    if (!plan) continue
    const entryIdx = i + 1
    const entry = bars[entryIdx].open
    const prices = planPrices(plan, entry)
    if (!prices) continue
    let exit: { idx: number; price: number; reason: ExitReason } | null = null
    for (let j = entryIdx; j < bars.length && !exit; j++) {
      const b = bars[j]
      if (prices.sl && b.low <= prices.sl) exit = { idx: j, price: Math.min(prices.sl, b.open), reason: 'sl' }
      else if (b.high >= prices.tp) exit = { idx: j, price: Math.max(prices.tp, b.open), reason: 'tp' }
      else if (plan.exitRule && j > entryIdx && exitBy(plan.exitRule, bars, j)) exit = { idx: j, price: b.close, reason: 'rule' }
      else if (plan.maxBars && j - entryIdx + 1 >= plan.maxBars) exit = { idx: j, price: b.close, reason: 'time' }
    }
    // Si quedó abierta al final, la contamos al precio de hoy (como "no tocar", que cuenta todo hasta hoy)
    if (!exit) exit = { idx: bars.length - 1, price: bars[bars.length - 1].close, reason: 'open' }
    trades.push(makeTrade(bars, entryIdx, entry, exit.idx, exit.price, exit.reason, stake))
    i = exit.idx
  }
  return trades
}

// ===== Tu estrategia: comprar en la caída =====

export function tradeDip(bars: Bar[], p: Params): Trade[] {
  const trades: Trade[] = []
  for (let i = START; i < bars.length - 1; i++) {
    const prev = bars[i]
    if (prev.close >= prev.open) continue // solo después de una vela que cerró bajando
    // Compra límite p.dip% abajo del cierre, válida durante la vela siguiente
    const limit = prev.close * (1 - p.dip / 100)
    const entryIdx = i + 1
    const e = bars[entryIdx]
    if (e.low > limit) continue // no bajó tanto: la orden no se ejecutó
    const entry = Math.min(limit, e.open) // si abrió más abajo, se compra al abrir
    const tpPrice = entry * (1 + p.tp / 100)
    const slPrice = p.sl > 0 ? entry * (1 - p.sl / 100) : 0
    let exit: { idx: number; price: number; reason: ExitReason } | null = null
    // En la vela de compra no sabemos qué pasó primero: solo contamos el stop (somos pesimistas)
    if (slPrice && e.low <= slPrice) exit = { idx: entryIdx, price: slPrice, reason: 'sl' }
    for (let j = entryIdx + 1; j < bars.length && !exit; j++) {
      const b = bars[j]
      if (slPrice && b.low <= slPrice) exit = { idx: j, price: Math.min(slPrice, b.open), reason: 'sl' }
      else if (b.high >= tpPrice) exit = { idx: j, price: Math.max(tpPrice, b.open), reason: 'tp' }
    }
    // Si nunca vendió, lo contamos con el último precio: es lo que valdría hoy
    if (!exit) exit = { idx: bars.length - 1, price: bars[bars.length - 1].close, reason: 'open' }
    trades.push(makeTrade(bars, entryIdx, entry, exit.idx, exit.price, exit.reason, p.stake))
    i = exit.idx
  }
  return trades
}

// ===== Rebalanceo 50/50 =====

/** Mitad moneda, mitad USDT; cada semana vuelve al 50/50 (pagando comisión por lo que compra o vende) */
function runRebalance(bars: Bar[], p: Params, interval: BtInterval): Result {
  const step = interval === '4h' ? 42 : 7
  const first = bars[START]
  let qty = ((p.stake / 2) * (1 - FEE)) / first.open
  let cash = p.stake / 2
  let peak = 0
  let maxDrawdown = 0
  const equity: Result['equity'] = []
  for (let i = START; i < bars.length; i++) {
    const price = bars[i].close
    if ((i - START) % step === 0 && i > START) {
      const target = (cash + qty * price) / 2
      const diff = target - qty * price // >0 compra, <0 vende
      if (diff > 0) {
        qty += (diff * (1 - FEE)) / price
        cash -= diff
      } else {
        qty += diff / price
        cash += -diff * (1 - FEE)
      }
    }
    if ((i - START) % 6 === 0 || i === bars.length - 1) {
      const value = cash + qty * price - p.stake
      equity.push({ time: bars[i].time * 1000, value })
      peak = Math.max(peak, value)
      maxDrawdown = Math.max(maxDrawdown, peak - value)
    }
  }
  const total = cash + qty * bars[bars.length - 1].close * (1 - FEE) - p.stake
  return { strategy: 'rebal', trades: [], stats: { ...emptyStats(bars), trades: equity.length, total, maxDrawdown }, equity }
}

// ===== Compra semanal =====

function runDca(bars: Bar[], p: Params, interval: BtInterval): Result {
  const step = interval === '4h' ? 42 : 7 // velas que hay en una semana
  const buys: number[] = []
  for (let i = START; i < bars.length; i += step) buys.push(i)
  const each = p.stake / buys.length

  // Cuánto se iría ganando (o perdiendo) semana a semana: lo que vale lo juntado − lo invertido
  let qty = 0
  let invested = 0
  let peak = 0
  let maxDrawdown = 0
  const equity: Result['equity'] = []
  for (let k = 0; k < buys.length; k++) {
    const i = buys[k]
    qty += (each * (1 - FEE)) / bars[i].open
    invested += each
    const value = qty * bars[i].close * (1 - FEE) - invested
    equity.push({ time: bars[i].time * 1000, value })
    peak = Math.max(peak, value)
    maxDrawdown = Math.max(maxDrawdown, peak - value)
  }
  const last = bars[bars.length - 1]
  const total = qty * last.close * (1 - FEE) - invested
  equity.push({ time: last.time * 1000, value: total })

  return {
    strategy: 'dca',
    trades: [],
    stats: {
      ...emptyStats(bars),
      trades: buys.length,
      total,
      maxDrawdown: Math.max(maxDrawdown, peak - total),
    },
    equity,
  }
}

// ===== Cálculos comunes =====

function makeTrade(bars: Bar[], entryIdx: number, entry: number, exitIdx: number, exit: number, reason: ExitReason, stake: number): Trade {
  const n = net(entry, exit)
  return {
    entryTime: bars[entryIdx].time * 1000,
    entry,
    exitTime: bars[exitIdx].time * 1000,
    exit,
    reason,
    pnlPct: n * 100,
    pnl: n * stake,
    bars: exitIdx - entryIdx + 1,
  }
}

function emptyStats(bars: Bar[]): Stats {
  const first = bars[START] ?? bars[0]
  const last = bars[bars.length - 1]
  return {
    trades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    total: 0,
    avgWin: 0,
    avgLoss: 0,
    maxDrawdown: 0,
    worstStreak: 0,
    buyHold: net(first.open, last.close) * 100,
    from: first.time * 1000,
    to: last.time * 1000,
  }
}

function tradeStats(bars: Bar[], trades: Trade[]): Stats {
  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl <= 0)
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
  return {
    ...emptyStats(bars),
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    total: equity,
    avgWin: avg(wins),
    avgLoss: avg(losses),
    maxDrawdown,
    worstStreak,
  }
}

function tradeEquity(bars: Bar[], trades: Trade[]): Result['equity'] {
  const points = [{ time: (bars[START] ?? bars[0]).time * 1000, value: 0 }]
  let total = 0
  for (const t of trades) {
    total += t.pnl
    points.push({ time: t.exitTime, value: total })
  }
  return points
}
