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
import type { EntryPlan } from './signals'
import { esc, notify } from './telegram'

export const SLOTS = 4
export const STOP_LOSS = defaultParams('trend', '4h').sl // 8%
const MIN_ORDER = 5 // Binance no deja operar menos de 5 USDT
const H4 = 4 * 3_600_000

export const COMPETITORS = {
  trend: { emoji: '📈', label: 'Tendencia', how: 'Compra cuando la amarilla cruza hacia arriba a la azul; vende al cruce hacia abajo o con stop −8%' },
  poc: { emoji: '📊', label: 'POC', how: 'Compra cuando el precio baja a tocar el nivel con más volumen; vende con +6%, −4% o a los ~10 días' },
  fib: { emoji: '🌀', label: 'Fibonacci', how: 'Compra en el retroceso del 61,8% de una subida; vende al volver al máximo; stop pasado el 78,6%' },
  smc: { emoji: '🏦', label: 'Smart Money', how: 'Compra al volver al order block después de un quiebre; vende ganando 2 veces lo arriesgado' },
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
}

const rows = <T>(sql: string, ...args: (string | number)[]) => {
  ensureTables()
  return (db().prepare(sql).all(...args) as T[]).map((r) => ({ ...r })) // objetos normales (node:sqlite da objetos sin prototipo)
}

export const isRunning = () => getMeta('arena_enabled') === '1'
export const getCapital = () => Number(getMeta('arena_capital') ?? 0)
export const getStartedAt = () => Number(getMeta('arena_started') ?? 0) || null
/** ¿Había un bot de la versión anterior (una sola estrategia) prendido? */
export const hadOldBot = () => !!Number(getMeta('bot_started') ?? 0)
export const getCash = (s: Competitor) => Number(getMeta(`arena_cash_${s}`) ?? 0)
const setCash = (s: Competitor, v: number) => setMeta(`arena_cash_${s}`, String(v))
/** Días desde que se prendió el bot */
export const daysRunning = (started: number) => Math.max(0, (Date.now() - started) / 86_400_000)
export const listPositions = (s?: Competitor) =>
  s
    ? rows<BotPosition>('SELECT * FROM arena_positions WHERE strategy = ? ORDER BY entry_time', s)
    : rows<BotPosition>('SELECT * FROM arena_positions ORDER BY entry_time')
export const listTrades = (limit = 200) => rows<BotTrade>('SELECT * FROM arena_trades ORDER BY exit_time DESC LIMIT ?', limit)
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

export async function startBot(capital: number) {
  ensureTables()
  const prices = await getPrices()
  const coins = (await getMarket()).coins
  const hold: Record<string, number> = {}
  for (const c of coins) hold[c.symbol] = ((capital / coins.length) * (1 - FEE)) / c.price

  db().exec('DELETE FROM arena_positions; DELETE FROM arena_trades; DELETE FROM arena_equity;')
  for (const s of COMPETITOR_KEYS) setCash(s, capital)
  setMeta('arena_seen', '{}')
  setMeta('arena_capital', String(capital))
  setMeta('arena_hold', JSON.stringify(hold))
  setMeta('arena_started', String(Date.now()))
  setMeta('arena_enabled', '1')
  setMeta('arena_last_error', '')
  setMeta('bot_enabled', '0') // apaga el bot de la versión anterior
  snapshot(prices, true)
  await safeNotify(
    `🏁 <b>Empieza la competencia (dinero de mentira)</b>\n` +
      `Cada uno con ${capital} USDT ficticios en ${coins.length} monedas:\n` +
      `${COMPETITOR_KEYS.map((s) => `${COMPETITORS[s].emoji} ${COMPETITORS[s].label}`).join(' · ')} · ${HOLD.emoji} ${HOLD.label}`,
  )
  await runBot() // por si ya hay señales
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
  const res = await fetch(`${REST}/klines?symbol=${symbol}&interval=4h&limit=200`, { cache: 'no-store' })
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

/** La señal de cada competidor en la última vela cerrada (null = no compra) */
function signalFor(s: Competitor, bars: Bar[]): EntryPlan | null {
  const last = bars.length - 1
  if (s === 'trend') return trendSignal(bars, last) ? { slPct: STOP_LOSS, note: 'La amarilla cruzó hacia arriba a la azul: empieza una subida' } : null
  return PLANNED[s](bars, last)
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
      } else if (p.strategy === 'trend' && !above(d.bars, last) && d.bars[last].time * 1000 >= p.entry_time) reason = 'cross'
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
    for (const strategy of COMPETITOR_KEYS) {
      for (const symbol of filter) {
        const d = data.get(symbol)
        if (!d) continue
        const key = `${strategy}:${symbol}`
        const candle = d.bars[d.bars.length - 1].time
        if (seen[key] === candle) continue // esa vela ya la revisó
        seen[key] = candle
        const plan = signalFor(strategy, d.bars)
        if (!plan) continue
        const held = listPositions(strategy)
        if (held.length >= SLOTS || held.some((p) => p.symbol === symbol)) continue

        const entry = d.live.close
        const levels = planPrices(plan, entry)
        if (!levels) continue // el precio ya se fue (por ejemplo, ya pasó el objetivo)
        const size = Math.min(portfolioValue(strategy, prices) / SLOTS, getCash(strategy))
        if (size < MIN_ORDER) continue
        setCash(strategy, getCash(strategy) - size)
        db()
          .prepare(
            'INSERT INTO arena_positions (strategy, symbol, entry, qty, size, sl, tp, max_until, note, entry_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            strategy,
            symbol,
            entry,
            (size * (1 - FEE)) / entry,
            size,
            levels.sl,
            Number.isFinite(levels.tp) ? levels.tp : null,
            plan.maxBars ? Date.now() + plan.maxBars * H4 : null,
            plan.note,
            Date.now(),
          )
        await safeNotify(
          `🛒 <b>${tag(strategy)} compró ${esc(coinOf(symbol))}</b> <i>(dinero de mentira)</i>\n` +
            `${size.toFixed(2)} USDT a ${px(entry)}\n` +
            `Stop loss ${px(levels.sl)}${Number.isFinite(levels.tp) ? ` · objetivo ${px(levels.tp)}` : ''}\n` +
            `<i>${esc(plan.note)}</i>`,
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

/** Una foto por hora de cuánto vale cada cartera y la de "no tocar" */
function snapshot(prices: Map<string, number>, force = false) {
  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000
  const last = db().prepare('SELECT MAX(ts) AS ts FROM arena_equity').get() as { ts: number | null }
  if (!force && last.ts === hour) return
  const insert = db().prepare('INSERT OR REPLACE INTO arena_equity (ts, strategy, value) VALUES (?, ?, ?)')
  for (const s of COMPETITOR_KEYS) insert.run(hour, s, portfolioValue(s, prices))
  insert.run(hour, 'hold', holdValue(prices))
}
