// 🟢 Bot en vivo con DINERO DE MENTIRA (etapa 2): una COMPETENCIA entre técnicas.
// Cada competidor tiene su propia cartera ficticia (mismo capital, mismas monedas, mismos precios reales):
//   📈 Tendencia   compra cuando la amarilla cruza hacia arriba a la azul; vende al cruce hacia abajo o stop −8%
//   📊 POC         compra al tocar el nivel con más volumen; +6% / −4% / ~10 días
//   🌀 Fibonacci   compra en el retroceso del 61,8%; vende en el máximo; stop pasado el 78,6%
//   🏦 Smart Money compra al volver al order block tras un quiebre; 2:1; stop debajo del order block
//   💤 No tocar    reparte todo el primer día entre las monedas y espera
// Reglas comunes: velas de 4 h CERRADAS, máximo 4 operaciones por cartera, cada una con 1/4 del valor, reinvierte, 0,1% de comisión.
// Nunca toca tu cuenta real de Binance: solo lee precios públicos.
import 'server-only'
import { REST, toBar, type Bar } from './binance'
import { above, defaultParams, FEE, planPrices, PLANNED, trendSignal } from './backtest'
import { db, getMeta, setMeta } from './db'
import { getPrices } from './binance-account'
import { getMarket } from './market'
import { exitBy, type EntryPlan, type ExitRule } from './signals'
import { esc, notify } from './telegram'

export const SLOTS = 4
export const STOP_LOSS = defaultParams('trend', '4h').sl // 8%
const MIN_ORDER = 5 // Binance no deja operar menos de 5 USDT
const H4 = 4 * 3_600_000

export const COMPETITORS = {
  learn: { emoji: '🧠', label: 'Aprende', how: 'Cada día mira cómo le fue a cada competidor en los últimos 14 días y copia las compras de los 3 mejores (si nadie gana, espera en USDT)' },
  trendplus: { emoji: '🛡️', label: 'Tendencia+', how: 'Se queda dentro mientras el precio esté más de 5% arriba de su media de 200 velas; sale cuando cae más de 5% debajo' },
  trend: { emoji: '📈', label: 'Tendencia', how: 'Compra cuando la amarilla cruza hacia arriba a la azul; vende al cruce hacia abajo o con stop −8%' },
  poc: { emoji: '📊', label: 'POC', how: 'Compra cuando el precio baja a tocar el nivel con más volumen; vende con +6%, −4% o a los ~10 días' },
  fib: { emoji: '🌀', label: 'Fibonacci', how: 'Compra en el retroceso del 61,8% de una subida; vende al volver al máximo; stop pasado el 78,6%' },
  smc: { emoji: '🏦', label: 'Smart Money', how: 'Compra al volver al order block después de un quiebre; vende ganando 2 veces lo arriesgado' },
  rsi: { emoji: '📉', label: 'RSI', how: 'Compra cuando el RSI sale de sobrevendido (vuelve a subir de 30); vende cuando pasa de 70, stop −8%' },
  boll: { emoji: '〰️', label: 'Bollinger', how: 'Compra cuando el precio vuelve a entrar por la banda de abajo; vende en la línea del medio, stop −5%' },
  turtle: { emoji: '🐢', label: 'Tortugas', how: 'Compra al romper el máximo de 20 velas; vende al perder el mínimo de 10 velas, stop −8%' },
  golden: { emoji: '✨', label: 'Golden cross', how: 'Compra cuando la media de 50 cruza hacia arriba a la de 200; vende en el cruce contrario, stop −10%' },
  rebal: { emoji: '⚖️', label: 'Rebalanceo', how: 'Mitad en USDT y mitad repartida entre las monedas; cada semana vuelve al 50/50' },
} as const
export type Competitor = keyof typeof COMPETITORS
export const COMPETITOR_KEYS = Object.keys(COMPETITORS) as Competitor[]
export const HOLD = { emoji: '💤', label: 'No tocar', how: 'Reparte todo el primer día entre las monedas del filtro y espera' }

export type BotPosition = {
  strategy: Competitor
  symbol: string
  entry: number
  qty: number
  size: number
  sl: number
  tp: number | null
  max_until: number | null // ms: vender igual si llega esta hora
  exit_rule: ExitRule | null // su regla de venta (RSI > 70, etc.)
  source: Competitor | null // 🧠 Aprende: de quién copió esta compra (vende con su receta)
  note: string
  entry_time: number
}
export type BotTrade = { id: number; strategy: Competitor; symbol: string; entry: number; exit: number; size: number; pnl: number; reason: string; entry_time: number; exit_time: number }

// Tablas propias de la competencia (las del bot anterior, de una sola estrategia, quedan sin usar)
function ensureTables() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS arena_positions (
      strategy TEXT NOT NULL, symbol TEXT NOT NULL,
      entry REAL NOT NULL, qty REAL NOT NULL, size REAL NOT NULL,
      sl REAL NOT NULL, tp REAL, max_until INTEGER, note TEXT NOT NULL DEFAULT '',
      entry_time INTEGER NOT NULL,
      PRIMARY KEY (strategy, symbol)
    );
    CREATE TABLE IF NOT EXISTS arena_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT, strategy TEXT NOT NULL, symbol TEXT NOT NULL,
      entry REAL NOT NULL, exit REAL NOT NULL, size REAL NOT NULL, pnl REAL NOT NULL, reason TEXT NOT NULL,
      entry_time INTEGER NOT NULL, exit_time INTEGER NOT NULL
    );
    -- Valor de cada cartera (y de "hold") una vez por hora
    CREATE TABLE IF NOT EXISTS arena_equity (
      ts INTEGER NOT NULL, strategy TEXT NOT NULL, value REAL NOT NULL,
      PRIMARY KEY (ts, strategy)
    );
  `)
  // Columna agregada después (bases de datos que ya existían)
  for (const col of ['exit_rule TEXT', 'source TEXT'])
    try {
      db().exec(`ALTER TABLE arena_positions ADD COLUMN ${col}`)
    } catch {}
}

const rows = <T>(sql: string, ...args: (string | number)[]) => {
  ensureTables()
  return (db().prepare(sql).all(...args) as T[]).map((r) => ({ ...r })) // objetos normales (node:sqlite da objetos sin prototipo)
}

export const isRunning = () => getMeta('arena_enabled') === '1'
export const getCapital = () => Number(getMeta('arena_capital') ?? 0)
export const getStartedAt = () => Number(getMeta('arena_started') ?? 0) || null
/** Desde cuándo corre en vivo (si empezó con simulación, es posterior a getStartedAt) */
export const getLiveSince = () => Number(getMeta('arena_live_since') ?? 0) || null
/** ¿Había un bot de la versión anterior (una sola estrategia) prendido? */
export const hadOldBot = () => !!Number(getMeta('bot_started') ?? 0)
export const getCash = (s: Competitor) => Number(getMeta(`arena_cash_${s}`) ?? 0)
const setCash = (s: Competitor, v: number) => setMeta(`arena_cash_${s}`, String(v))
/** "2026-10-08" en hora de Bolivia, corrido `offset` días (para el campo de fecha) */
export const boliviaDay = (offset = 0) => new Date(Date.now() + offset * 86_400_000 - 4 * 3_600_000).toISOString().slice(0, 10)
/** Días desde que se prendió el bot */
export const daysRunning = (started: number) => Math.max(0, (Date.now() - started) / 86_400_000)
export const listPositions = (s?: Competitor) =>
  s
    ? rows<BotPosition>('SELECT * FROM arena_positions WHERE strategy = ? ORDER BY entry_time', s)
    : rows<BotPosition>('SELECT * FROM arena_positions ORDER BY entry_time')
export const listTrades = (limit = 200) => rows<BotTrade>('SELECT * FROM arena_trades ORDER BY exit_time DESC LIMIT ?', limit)
/** Cuántas operaciones cerró cada competidor y cuántas ganó (todas, no solo las últimas) */
export const tradeCounts = () =>
  new Map(
    rows<{ strategy: string; n: number; w: number }>('SELECT strategy, COUNT(*) AS n, SUM(pnl > 0) AS w FROM arena_trades GROUP BY strategy').map((r) => [
      r.strategy,
      { closed: r.n, wins: r.w },
    ]),
  )
export const listEquity = () => rows<{ ts: number; strategy: string; value: number }>('SELECT * FROM arena_equity ORDER BY ts')

/** "No tocar": al prender, repartimos el capital entre las monedas del filtro y no las tocamos más */
export function holdValue(prices: Map<string, number>) {
  const hold = JSON.parse(getMeta('arena_hold') ?? '{}') as Record<string, number>
  return Object.entries(hold).reduce((s, [symbol, qty]) => s + qty * (prices.get(symbol) ?? 0), 0)
}

export function portfolioValue(s: Competitor, prices: Map<string, number>) {
  return getCash(s) + listPositions(s).reduce((sum, p) => sum + p.qty * (prices.get(p.symbol) ?? p.entry), 0)
}

// ===== Prender, pausar, reiniciar =====

/**
 * Empieza la competencia. Con `from` (una fecha del pasado), primero SIMULA desde ahí hasta hoy con las mismas reglas
 * (vela por vela, sin ver el futuro) y después sigue en vivo con lo que haya quedado comprado.
 */
export async function startBot(capital: number, from: number | null = null) {
  ensureTables()
  const coins = (await getMarket()).coins
  db().exec('DELETE FROM arena_positions; DELETE FROM arena_trades; DELETE FROM arena_equity;')
  setMeta('arena_capital', String(capital))
  setMeta('arena_last_error', '')
  setMeta('arena_live_since', String(Date.now()))
  setMeta('bot_enabled', '0') // apaga el bot de la versión anterior

  let summary = ''
  const fromDate = from ? new Date(from).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  if (from) {
    summary = await replay(coins.map((c) => c.symbol), capital, from)
    setMeta('arena_started', String(from))
  } else {
    const hold: Record<string, number> = {}
    for (const c of coins) hold[c.symbol] = ((capital / coins.length) * (1 - FEE)) / c.price
    for (const s of COMPETITOR_KEYS) setCash(s, capital)
    setMeta('arena_seen', '{}')
    setMeta('arena_learn_follow', '[]')
    setMeta('arena_learn_log', '[]')
    setMeta('arena_learn_last', String(Date.now()))
    setMeta('arena_hold', JSON.stringify(hold))
    setMeta('arena_started', String(Date.now()))
    const prices = await getPrices()
    rebalance(coins.map((c) => c.symbol), prices, Date.now())
    snapshot(prices, true)
  }
  setMeta('arena_enabled', '1')
  await safeNotify(
    `🏁 <b>Empieza la competencia (dinero de mentira)</b>\n` +
      `Cada uno con ${capital} USDT ficticios en ${coins.length} monedas:\n` +
      `${COMPETITOR_KEYS.map((s) => `${COMPETITORS[s].emoji} ${COMPETITORS[s].label}`).join(' · ')} · ${HOLD.emoji} ${HOLD.label}` +
      (summary ? `\n\n<b>Simulación desde el ${fromDate}:</b>\n${summary}\n\nDesde ahora sigue en vivo.` : ''),
  )
  await runBot() // por si ya hay señales
}

// ===== Simulación del pasado (mismas reglas que en vivo) =====

/** Velas de 4 h desde `from` (más 200 de antes para calcular las líneas). La última es la que se está formando. */
async function historySince(symbol: string, from: number): Promise<Bar[]> {
  const out: Parameters<typeof toBar>[0][] = []
  let start = from - 300 * H4
  for (;;) {
    const res = await fetch(`${REST}/klines?symbol=${symbol}&interval=4h&limit=1000&startTime=${start}`, { cache: 'no-store' })
    if (!res.ok) break
    const batch = (await res.json()) as Parameters<typeof toBar>[0][]
    out.push(...batch)
    if (batch.length < 1000) break
    start = batch[batch.length - 1][0] + 1
  }
  return out.map(toBar)
}

type SimPosition = Omit<BotPosition, 'strategy'>
type SimTrade = Omit<BotTrade, 'id'>

async function replay(symbols: string[], capital: number, from: number): Promise<string> {
  const series = new Map<string, Bar[]>()
  for (const s of symbols) {
    const bars = await historySince(s, from)
    if (bars.length > 320) series.set(s, bars)
  }
  const index = new Map([...series].map(([s, bars]) => [s, new Map(bars.map((b, i) => [b.time * 1000, i]))]))
  const times = [...new Set([...series.values()].flatMap((bars) => bars.slice(0, -1).map((b) => b.time * 1000)))].filter((t) => t >= from).sort((a, b) => a - b)

  // "No tocar": compra todo al abrir la primera vela
  const hold: Record<string, number> = {}
  const firstPrices = [...series].map(([s, bars]) => [s, bars[index.get(s)!.get(times[0]) ?? -1]?.open] as const).filter(([, p]) => p)
  for (const [s, p] of firstPrices) hold[s] = ((capital / firstPrices.length) * (1 - FEE)) / p!

  const cash = Object.fromEntries(COMPETITOR_KEYS.map((k) => [k, capital])) as Record<Competitor, number>
  const open = Object.fromEntries(COMPETITOR_KEYS.map((k) => [k, new Map<string, SimPosition>()])) as Record<Competitor, Map<string, SimPosition>>
  const trades: (SimTrade & { strategy: Competitor })[] = []
  const equity: { ts: number; strategy: string; value: number }[] = []
  const hist = Object.fromEntries(COMPETITOR_KEYS.map((k) => [k, [] as number[]])) as Record<Competitor, number[]>
  let follow: Competitor[] = []
  const learnLog: LearnLog[] = []

  for (const [n, t] of times.entries()) {
    // 🧠 Aprende: una vez por día elige a quién copiar según los últimos 14 días
    if (n % 6 === 0 && n >= 6) {
      const next = rankFollow((k) => {
        const h = hist[k]
        return [h[Math.max(0, h.length - 1 - LEARN_BARS)], h[h.length - 1]]
      })
      if (next.join() !== follow.join()) learnLog.push({ ts: t, follow: next })
      follow = next
    }
    const prices = new Map<string, number>()
    for (const [s, bars] of series) {
      const i = index.get(s)!.get(t)
      if (i !== undefined) prices.set(s, bars[i].close)
    }

    // ⚖️ Rebalanceo: al empezar y después cada semana (42 velas de 4 h), al precio de cierre de esta vela
    if ((t - times[0]) % (42 * H4) === 0) {
      const target = rebalTargets(symbols.filter((s) => prices.has(s)), cash.rebal + [...open.rebal].reduce((sum, [sym, q]) => sum + q.qty * (prices.get(sym) ?? q.entry), 0))
      cash.rebal = applyRebalance(open.rebal, target, prices, cash.rebal, t + H4)
    }

    for (const k of COMPETITOR_KEYS) {
      // 1. Salidas en esta vela
      for (const [s, p] of open[k]) {
        const bars = series.get(s)!
        const i = index.get(s)!.get(t)
        if (i === undefined || t < p.entry_time) continue
        const b = bars[i]
        let exit: { price: number; reason: string } | null = null
        if (b.low <= p.sl) exit = { price: Math.min(p.sl, b.open), reason: 'sl' }
        else if (p.tp && b.high >= p.tp) exit = { price: Math.max(p.tp, b.open), reason: 'tp' }
        else if ((p.source ?? k) === 'trend' && !above(bars, i)) exit = { price: b.close, reason: 'cross' }
        else if (p.exit_rule && t > p.entry_time && exitBy(p.exit_rule, bars, i)) exit = { price: b.close, reason: 'rule' }
        else if (p.max_until && t + H4 >= p.max_until) exit = { price: b.close, reason: 'time' }
        if (!exit) continue
        const proceeds = p.qty * exit.price * (1 - FEE)
        cash[k] += proceeds
        trades.push({ strategy: k, symbol: s, entry: p.entry, exit: exit.price, size: p.size, pnl: proceeds - p.size, reason: exit.reason, entry_time: p.entry_time, exit_time: t + H4 })
        open[k].delete(s)
      }
      // 2. Entradas: señal en esta vela cerrada → compra al abrir la siguiente
      for (const s of symbols) {
        const bars = series.get(s)
        const i = index.get(s)?.get(t)
        if (!bars || i === undefined || i + 1 >= bars.length || open[k].has(s) || open[k].size >= SLOTS) continue
        const { plan, source } = k === 'learn' ? copyBest(follow, bars, i) : { plan: signalFor(k, bars, i), source: null }
        if (!plan) continue
        const entry = bars[i + 1].open
        const levels = planPrices(plan, entry)
        if (!levels) continue
        const value = cash[k] + [...open[k]].reduce((sum, [sym, q]) => sum + q.qty * (prices.get(sym) ?? q.entry), 0)
        const size = Math.min(value / SLOTS, cash[k])
        if (size < MIN_ORDER) continue
        cash[k] -= size
        const entryTime = bars[i + 1].time * 1000
        open[k].set(s, {
          symbol: s,
          entry,
          qty: (size * (1 - FEE)) / entry,
          size,
          sl: levels.sl,
          tp: Number.isFinite(levels.tp) ? levels.tp : null,
          max_until: plan.maxBars ? entryTime + plan.maxBars * H4 : null,
          exit_rule: plan.exitRule ?? null,
          source,
          note: source ? `Copiado de ${tag(source)}: ${plan.note}` : plan.note,
          entry_time: entryTime,
        })
      }
      const value = cash[k] + [...open[k]].reduce((sum, [sym, q]) => sum + q.qty * (prices.get(sym) ?? q.entry), 0)
      equity.push({ ts: t + H4, strategy: k, value })
      hist[k].push(value)
    }
    equity.push({ ts: t + H4, strategy: 'hold', value: Object.entries(hold).reduce((sum, [sym, q]) => sum + q * (prices.get(sym) ?? 0), 0) })
  }

  // Guardar el resultado: desde acá sigue el bot en vivo
  const insT = db().prepare('INSERT INTO arena_trades (strategy, symbol, entry, exit, size, pnl, reason, entry_time, exit_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  for (const tr of trades) insT.run(tr.strategy, tr.symbol, tr.entry, tr.exit, tr.size, tr.pnl, tr.reason, tr.entry_time, tr.exit_time)
  for (const k of COMPETITOR_KEYS) for (const p of open[k].values()) insertPosition(k, p)
  setMeta('arena_learn_follow', JSON.stringify(follow))
  setMeta('arena_learn_log', JSON.stringify(learnLog.slice(-40)))
  setMeta('arena_learn_last', String(times[times.length - 1]))
  setMeta('arena_rebal_last', String(Math.floor((times[times.length - 1] - times[0]) / (42 * H4)) * 42 * H4 + times[0] + H4))
  const insE = db().prepare('INSERT OR REPLACE INTO arena_equity (ts, strategy, value) VALUES (?, ?, ?)')
  for (const e of equity) insE.run(e.ts, e.strategy, e.value)
  for (const k of COMPETITOR_KEYS) setCash(k, cash[k])
  setMeta('arena_hold', JSON.stringify(hold))
  // Las velas ya simuladas no se vuelven a revisar en vivo
  const last = times[times.length - 1]
  setMeta('arena_seen', JSON.stringify(Object.fromEntries(COMPETITOR_KEYS.flatMap((k) => symbols.map((s) => [`${k}:${s}`, last / 1000])))))

  const final = (k: string) => equity.filter((e) => e.strategy === k).at(-1)?.value ?? capital
  return [...COMPETITOR_KEYS, 'hold']
    .map((k) => ({ k, v: final(k) }))
    .sort((a, b) => b.v - a.v)
    .map(({ k, v }, i) => `${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} ${k === 'hold' ? `${HOLD.emoji} ${HOLD.label}` : tag(k as Competitor)}: ${v.toFixed(2)} (${v >= capital ? '+' : ''}${(v - capital).toFixed(2)})`)
    .join('\n')
}

export function pauseBot() {
  setMeta('arena_enabled', '0')
}

export function resumeBot() {
  setMeta('arena_enabled', '1')
}

/** Vende todo lo abierto de todas las carteras al precio de ahora (botón de pánico) */
export async function sellAll() {
  const prices = await getPrices()
  for (const p of listPositions()) closePosition(p, prices.get(p.symbol) ?? p.entry, 'manual')
  await safeNotify('🛑 <b>Bot: vendí todo</b> (botón de pánico) en todas las carteras. Sigue prendido, pero sin operaciones abiertas.')
}

// ===== El ciclo: cada 5 minutos =====

async function closedBars(symbol: string): Promise<{ bars: Bar[]; live: Bar } | null> {
  const res = await fetch(`${REST}/klines?symbol=${symbol}&interval=4h&limit=300`, { cache: 'no-store' })
  if (!res.ok) return null
  const all = ((await res.json()) as Parameters<typeof toBar>[0][]).map(toBar)
  if (all.length < 62) return null
  // La última vela siempre es la que se está formando: las reglas solo miran velas CERRADAS
  return { bars: all.slice(0, -1), live: all[all.length - 1] }
}

function closePosition(p: BotPosition, price: number, reason: string) {
  const proceeds = p.qty * price * (1 - FEE)
  const pnl = proceeds - p.size
  setCash(p.strategy, getCash(p.strategy) + proceeds)
  db().prepare('DELETE FROM arena_positions WHERE strategy = ? AND symbol = ?').run(p.strategy, p.symbol)
  db()
    .prepare('INSERT INTO arena_trades (strategy, symbol, entry, exit, size, pnl, reason, entry_time, exit_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(p.strategy, p.symbol, p.entry, price, p.size, pnl, reason, p.entry_time, Date.now())
  return pnl
}

const px = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 10 ? 2 : n >= 1 ? 4 : 6 })
const coinOf = (symbol: string) => symbol.replace('USDT', '')
const tag = (s: Competitor) => `${COMPETITORS[s].emoji} ${COMPETITORS[s].label}`
export const REASONS: Record<string, string> = {
  sl: 'Stop loss',
  tp: 'Llegó al objetivo',
  cross: 'Terminó la subida',
  time: 'Pasó el tiempo máximo',
  manual: 'Vendido a mano',
}

async function safeNotify(html: string) {
  try {
    await notify(html)
  } catch (e) {
    console.error('[bot] No se pudo avisar por Telegram:', e)
  }
}

/** La señal de cada competidor en la vela i (por defecto, la última cerrada). null = no compra */
function signalFor(s: Competitor, bars: Bar[], i = bars.length - 1): EntryPlan | null {
  if (s === 'rebal' || s === 'learn') return null // no tienen señal propia: uno se reacomoda cada semana, el otro copia a los mejores
  if (s === 'trend') return trendSignal(bars, i) ? { slPct: STOP_LOSS, note: 'La amarilla cruzó hacia arriba a la azul: empieza una subida' } : null
  return PLANNED[s](bars, i)
}

let running = false

export async function runBot() {
  if (!isRunning() || running) return
  running = true
  try {
    ensureTables()
    const seen = JSON.parse(getMeta('arena_seen') ?? '{}') as Record<string, number> // "estrategia:moneda" → última vela revisada
    const filter = (await getMarket()).coins.map((c) => c.symbol)
    const open = listPositions()
    const symbols = [...new Set([...open.map((p) => p.symbol), ...filter])]
    const data = new Map<string, { bars: Bar[]; live: Bar }>()
    for (const s of symbols) {
      const d = await closedBars(s)
      if (d) data.set(s, d)
    }

    // 1. Salidas
    for (const p of open) {
      const d = data.get(p.symbol)
      if (!d) continue
      const since = [...d.bars.filter((b) => b.time * 1000 + H4 > p.entry_time), d.live] // velas desde la compra + la que se forma
      const last = d.bars.length - 1
      let reason: string | null = null
      let price = d.live.close
      if (Math.min(...since.map((b) => b.low)) <= p.sl) {
        reason = 'sl'
        price = Math.min(p.sl, d.live.close)
      } else if (p.tp && Math.max(...since.map((b) => b.high)) >= p.tp) {
        reason = 'tp'
        price = Math.max(p.tp, d.live.close)
      } else if ((p.source ?? p.strategy) === 'trend' && !above(d.bars, last) && d.bars[last].time * 1000 >= p.entry_time) reason = 'cross'
      else if (p.exit_rule && d.bars[last].time * 1000 > p.entry_time && exitBy(p.exit_rule, d.bars, last)) reason = 'rule'
      else if (p.max_until && Date.now() >= p.max_until) reason = 'time'
      if (!reason) continue

      const pnl = closePosition(p, price, reason)
      const pct = (pnl / p.size) * 100
      await safeNotify(
        `${pnl > 0 ? '✅' : '❌'} <b>${tag(p.strategy)} vendió ${esc(coinOf(p.symbol))}</b> <i>(dinero de mentira)</i>\n` +
          `Compró a ${px(p.entry)} → vendió a ${px(price)}\n` +
          `Resultado: <b>${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)</b>\n` +
          `<i>${REASONS[reason]}</i>`,
      )
    }

    // 2. Entradas: cada competidor revisa cada moneda en la última vela cerrada
    const prices = new Map([...data].map(([s, d]) => [s, d.live.close]))

    // ⚖️ Rebalanceo semanal
    if (Date.now() - Number(getMeta('arena_rebal_last') ?? 0) >= 42 * H4) {
      rebalance(filter, prices, Date.now())
      await safeNotify(`⚖️ <b>Rebalanceo semanal</b> <i>(dinero de mentira)</i>\nVolvió a 50% USDT y 50% repartido entre ${filter.length} monedas.`)
    }
    // 🧠 Aprende: una vez por día decide a quién copiar
    if (Date.now() - Number(getMeta('arena_learn_last') ?? 0) >= 6 * H4) await updateFollow()
    const follow = JSON.parse(getMeta('arena_learn_follow') ?? '[]') as Competitor[]

    for (const strategy of COMPETITOR_KEYS) {
      for (const symbol of filter) {
        const d = data.get(symbol)
        if (!d) continue
        const key = `${strategy}:${symbol}`
        const candle = d.bars[d.bars.length - 1].time
        if (seen[key] === candle) continue // esa vela ya la revisó
        seen[key] = candle
        const { plan, source } = strategy === 'learn' ? copyBest(follow, d.bars, d.bars.length - 1) : { plan: signalFor(strategy, d.bars), source: null }
        if (!plan) continue
        const held = listPositions(strategy)
        if (held.length >= SLOTS || held.some((p) => p.symbol === symbol)) continue

        const entry = d.live.close
        const levels = planPrices(plan, entry)
        if (!levels) continue // el precio ya se fue (por ejemplo, ya pasó el objetivo)
        const size = Math.min(portfolioValue(strategy, prices) / SLOTS, getCash(strategy))
        if (size < MIN_ORDER) continue
        setCash(strategy, getCash(strategy) - size)
        insertPosition(strategy, {
          symbol,
          entry,
          qty: (size * (1 - FEE)) / entry,
          size,
          sl: levels.sl,
          tp: Number.isFinite(levels.tp) ? levels.tp : null,
          max_until: plan.maxBars ? Date.now() + plan.maxBars * H4 : null,
          exit_rule: plan.exitRule ?? null,
          source,
          note: source ? `Copiado de ${tag(source)}: ${plan.note}` : plan.note,
          entry_time: Date.now(),
        })
        const levelsText = [levels.sl > 0 && `Stop loss ${px(levels.sl)}`, Number.isFinite(levels.tp) && `objetivo ${px(levels.tp)}`].filter(Boolean).join(' · ')
        await safeNotify(
          `🛒 <b>${tag(strategy)} compró ${esc(coinOf(symbol))}</b> <i>(dinero de mentira)</i>\n` +
            `${size.toFixed(2)} USDT a ${px(entry)}\n` +
            (levelsText ? `${levelsText}\n` : '') +
            `<i>${esc(source ? `Copiado de ${tag(source)}: ${plan.note}` : plan.note)}</i>`,
        )
      }
    }
    setMeta('arena_seen', JSON.stringify(seen))

    snapshot(await getPrices())
    setMeta('arena_last_run', String(Date.now()))
    setMeta('arena_last_error', '')
  } catch (e) {
    setMeta('arena_last_error', (e as Error).message)
    console.error('[bot] Error:', e)
  } finally {
    running = false
  }
}

// ===== 🧠 Aprende: copia a los 3 competidores que mejor vienen los últimos 14 días =====

export const LEARN_BARS = 84 // 14 días de velas de 4 h
const LEARN_TOP = 3
const LEARN_FROM: Competitor[] = COMPETITOR_KEYS.filter((k) => k !== 'learn' && k !== 'rebal')
export type LearnLog = { ts: number; follow: Competitor[] }

/** Los 3 mejores con ganancia en el período (lo que valían al inicio y al final de los 14 días) */
function rankFollow(valuesOf: (k: Competitor) => [number | undefined, number | undefined]): Competitor[] {
  return LEARN_FROM.map((k) => {
    const [a, b] = valuesOf(k)
    return { k, r: a && b ? b / a - 1 : 0 }
  })
    .filter((x) => x.r > 0)
    .sort((x, y) => y.r - x.r)
    .slice(0, LEARN_TOP)
    .map((x) => x.k)
}

/** La primera señal de compra entre los que sigue (en orden: el mejor primero) */
function copyBest(follow: Competitor[], bars: Bar[], i: number): { plan: EntryPlan | null; source: Competitor | null } {
  for (const src of follow) {
    const plan = signalFor(src, bars, i)
    if (plan) return { plan, source: src }
  }
  return { plan: null, source: null }
}

/** En vivo: decide a quién seguir con lo que valía cada cartera hace 14 días y ahora */
async function updateFollow() {
  const now = Date.now()
  const valueAt = (k: Competitor, ts: number) =>
    (db().prepare('SELECT value FROM arena_equity WHERE strategy = ? AND ts <= ? ORDER BY ts DESC LIMIT 1').get(k, ts) as { value: number } | undefined)?.value ??
    (db().prepare('SELECT value FROM arena_equity WHERE strategy = ? ORDER BY ts LIMIT 1').get(k) as { value: number } | undefined)?.value
  const next = rankFollow((k) => [valueAt(k, now - LEARN_BARS * H4), valueAt(k, now)])
  const prev = JSON.parse(getMeta('arena_learn_follow') ?? '[]') as Competitor[]
  setMeta('arena_learn_last', String(now))
  if (next.join() === prev.join()) return
  setMeta('arena_learn_follow', JSON.stringify(next))
  const log = JSON.parse(getMeta('arena_learn_log') ?? '[]') as LearnLog[]
  setMeta('arena_learn_log', JSON.stringify([...log, { ts: now, follow: next }].slice(-40)))
  await safeNotify(
    next.length
      ? `🧠 <b>Aprende ahora copia a:</b> ${next.map(tag).join(', ')}\n<i>Los que mejor vienen en los últimos 14 días</i>`
      : `🧠 <b>Aprende deja de copiar:</b> ningún competidor gana en los últimos 14 días. Espera en USDT.`,
  )
}

export const learnState = () => ({
  follow: JSON.parse(getMeta('arena_learn_follow') ?? '[]') as Competitor[],
  log: (JSON.parse(getMeta('arena_learn_log') ?? '[]') as LearnLog[]).reverse(),
})

function insertPosition(strategy: Competitor, p: SimPosition) {
  db()
    .prepare(
      'INSERT OR REPLACE INTO arena_positions (strategy, symbol, entry, qty, size, sl, tp, max_until, exit_rule, source, note, entry_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(strategy, p.symbol, p.entry, p.qty, p.size, p.sl, p.tp, p.max_until, p.exit_rule, p.source ?? null, p.note, p.entry_time)
}

// ===== ⚖️ Rebalanceo: 50% USDT, 50% repartido en partes iguales entre las monedas =====

function rebalTargets(symbols: string[], total: number) {
  const each = symbols.length ? total / 2 / symbols.length : 0
  return new Map(symbols.map((s) => [s, each]))
}

/** Lleva cada moneda a su valor objetivo (comprando o vendiendo, con comisión) y devuelve el USDT que queda */
function applyRebalance(open: Map<string, SimPosition>, target: Map<string, number>, prices: Map<string, number>, cash: number, time: number) {
  for (const [s, p] of open) if (!target.has(s) && prices.has(s)) {
    cash += p.qty * prices.get(s)! * (1 - FEE) // monedas que salieron del filtro: se venden
    open.delete(s)
  }
  for (const [s, value] of target) {
    const price = prices.get(s)
    if (!price) continue
    const p = open.get(s)
    const now = (p?.qty ?? 0) * price
    const diff = value - now
    if (Math.abs(diff) < 1) continue // no vale la pena mover menos de 1 USDT
    const qty = (p?.qty ?? 0) + (diff > 0 ? (diff * (1 - FEE)) / price : diff / price)
    cash += diff > 0 ? -diff : -diff * (1 - FEE)
    open.set(s, { symbol: s, entry: price, qty, size: qty * price, sl: 0, tp: null, max_until: null, exit_rule: null, source: null, note: 'Rebalanceo semanal 50/50', entry_time: time })
  }
  return cash
}

/** Rebalanceo en vivo (guarda en la base de datos) */
function rebalance(symbols: string[], prices: Map<string, number>, time: number) {
  const open = new Map(listPositions('rebal').map((p) => [p.symbol, p as SimPosition]))
  const total = getCash('rebal') + [...open].reduce((sum, [sym, q]) => sum + q.qty * (prices.get(sym) ?? q.entry), 0)
  const cash = applyRebalance(open, rebalTargets(symbols.filter((s) => prices.has(s)), total), prices, getCash('rebal'), time)
  db().prepare('DELETE FROM arena_positions WHERE strategy = ?').run('rebal')
  for (const p of open.values()) insertPosition('rebal', p)
  setCash('rebal', cash)
  setMeta('arena_rebal_last', String(time))
}

/** Una foto por hora de cuánto vale cada cartera y la de "no tocar" */
function snapshot(prices: Map<string, number>, force = false) {
  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000
  const last = db().prepare('SELECT MAX(ts) AS ts FROM arena_equity').get() as { ts: number | null }
  if (!force && last.ts === hour) return
  const insert = db().prepare('INSERT OR REPLACE INTO arena_equity (ts, strategy, value) VALUES (?, ?, ?)')
  for (const s of COMPETITOR_KEYS) insert.run(hour, s, portfolioValue(s, prices))
  insert.run(hour, 'hold', holdValue(prices))
}
