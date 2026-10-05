// 🟢 Bot en vivo con DINERO DE MENTIRA (etapa 2).
// Las mismas reglas que "siempre tendencia" en el backtest, pero con precios reales de ahora:
//   COMPRA  cuando en la última vela de 4 h CERRADA la amarilla cruzó hacia arriba a la azul.
//   VENDE   cuando en una vela cerrada la amarilla quedó debajo de la azul, o si el precio toca el stop loss (8%).
// Cartera: máximo 4 operaciones a la vez, cada una con 1/4 del valor total, reinvirtiendo todo, 0,1% de comisión.
// Nunca toca tu cuenta real de Binance: solo lee precios públicos.
import 'server-only'
import { REST, toBar, type Bar } from './binance'
import { above, defaultParams, FEE, START, trendSignal } from './backtest'
import { db, deleteMeta, getMeta, setMeta } from './db'
import { getPrices } from './binance-account'
import { getMarket } from './market'
import { esc, notify } from './telegram'

export const SLOTS = 4
export const STOP_LOSS = defaultParams('trend', '4h').sl // 8%
const MIN_ORDER = 5 // Binance no deja operar menos de 5 USDT

export type BotPosition = { symbol: string; entry: number; qty: number; size: number; entry_time: number }
export type BotTrade = BotPosition & { id: number; exit: number; pnl: number; reason: string; exit_time: number }

const rows = <T>(sql: string, ...args: (string | number)[]) =>
  (db().prepare(sql).all(...args) as T[]).map((r) => ({ ...r })) // objetos normales (node:sqlite da objetos sin prototipo)

export const isRunning = () => getMeta('bot_enabled') === '1'
export const getCash = () => Number(getMeta('bot_cash') ?? 0)
export const getCapital = () => Number(getMeta('bot_capital') ?? 0)
export const getStartedAt = () => Number(getMeta('bot_started') ?? 0) || null
/** Días desde que se prendió el bot */
export const daysRunning = (started: number) => Math.max(0, (Date.now() - started) / 86_400_000)
export const listPositions = () => rows<BotPosition>('SELECT * FROM bot_positions ORDER BY entry_time')
export const listTrades = (limit = 100) => rows<BotTrade>('SELECT * FROM bot_trades ORDER BY exit_time DESC LIMIT ?', limit)
export const listEquity = () => rows<{ ts: number; value: number; hold: number }>('SELECT * FROM bot_equity ORDER BY ts')

/** "No tocar": al prender el bot, repartimos el capital entre las monedas del filtro y no las tocamos más */
function holdValue(prices: Map<string, number>) {
  const hold = JSON.parse(getMeta('bot_hold') ?? '{}') as Record<string, number>
  return Object.entries(hold).reduce((s, [symbol, qty]) => s + qty * (prices.get(symbol) ?? 0), 0)
}

export function portfolioValue(prices: Map<string, number>) {
  return getCash() + listPositions().reduce((s, p) => s + p.qty * (prices.get(p.symbol) ?? p.entry), 0)
}

// ===== Prender, pausar, reiniciar =====

export async function startBot(capital: number) {
  const prices = await getPrices()
  const coins = (await getMarket()).coins
  const hold: Record<string, number> = {}
  for (const c of coins) hold[c.symbol] = ((capital / coins.length) * (1 - FEE)) / c.price

  db().exec('DELETE FROM bot_positions; DELETE FROM bot_trades; DELETE FROM bot_equity;')
  for (const key of ['bot_seen']) deleteMeta(key)
  setMeta('bot_capital', String(capital))
  setMeta('bot_cash', String(capital))
  setMeta('bot_hold', JSON.stringify(hold))
  setMeta('bot_started', String(Date.now()))
  setMeta('bot_enabled', '1')
  setMeta('bot_last_error', '')
  snapshot(prices, true)
  await safeNotify(
    `🟢 <b>Bot prendido (dinero de mentira)</b>\nEmpieza con ${capital} USDT ficticios en ${coins.length} monedas.\nEstrategia: seguir la tendencia (velas de 4 h, stop loss ${STOP_LOSS}%).`,
  )
  await runBot() // por si ya hay una señal
}

export function pauseBot() {
  setMeta('bot_enabled', '0')
}

export function resumeBot() {
  setMeta('bot_enabled', '1')
}

/** Vende todo lo abierto al precio de ahora (botón de pánico) */
export async function sellAll() {
  const prices = await getPrices()
  for (const p of listPositions()) closePosition(p, prices.get(p.symbol) ?? p.entry, 'manual')
  await safeNotify('🛑 <b>Bot: vendí todo</b> (botón de pánico). Sigue prendido, pero sin operaciones abiertas.')
}

// ===== El ciclo: cada 5 minutos =====

async function closedBars(symbol: string): Promise<{ bars: Bar[]; live: Bar } | null> {
  const res = await fetch(`${REST}/klines?symbol=${symbol}&interval=4h&limit=100`, { cache: 'no-store' })
  if (!res.ok) return null
  const all = ((await res.json()) as Parameters<typeof toBar>[0][]).map(toBar)
  if (all.length < START + 2) return null
  // La última vela siempre es la que se está formando: las reglas solo miran velas CERRADAS
  return { bars: all.slice(0, -1), live: all[all.length - 1] }
}

function closePosition(p: BotPosition, price: number, reason: 'sl' | 'cross' | 'manual') {
  const proceeds = p.qty * price * (1 - FEE)
  const pnl = proceeds - p.size
  setMeta('bot_cash', String(getCash() + proceeds))
  db().prepare('DELETE FROM bot_positions WHERE symbol = ?').run(p.symbol)
  db()
    .prepare('INSERT INTO bot_trades (symbol, entry, exit, size, pnl, reason, entry_time, exit_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(p.symbol, p.entry, price, p.size, pnl, reason, p.entry_time, Date.now())
  return pnl
}

const px = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 10 ? 2 : n >= 1 ? 4 : 6 })
const coinOf = (symbol: string) => symbol.replace('USDT', '')

async function safeNotify(html: string) {
  try {
    await notify(html)
  } catch (e) {
    console.error('[bot] No se pudo avisar por Telegram:', e)
  }
}

let running = false

export async function runBot() {
  if (!isRunning() || running) return
  running = true
  try {
    const seen = JSON.parse(getMeta('bot_seen') ?? '{}') as Record<string, number> // última vela revisada por moneda
    const filter = (await getMarket()).coins.map((c) => c.symbol)
    const positions = listPositions()
    const symbols = [...new Set([...positions.map((p) => p.symbol), ...filter])]
    const data = new Map<string, { bars: Bar[]; live: Bar }>()
    for (const s of symbols) {
      const d = await closedBars(s)
      if (d) data.set(s, d)
    }

    // 1. Salidas
    for (const p of positions) {
      const d = data.get(p.symbol)
      if (!d) continue
      const slPrice = p.entry * (1 - STOP_LOSS / 100)
      const last = d.bars.length - 1
      // ¿Algún momento desde que compró tocó el stop? (velas cerradas desde la compra + la que se está formando)
      const lows = [...d.bars.filter((b) => b.time * 1000 + 4 * 3_600_000 > p.entry_time), d.live].map((b) => b.low)
      let reason: 'sl' | 'cross' | null = null
      let price = d.live.close
      if (Math.min(...lows) <= slPrice) {
        reason = 'sl'
        price = Math.min(slPrice, d.live.close)
      } else if (!above(d.bars, last) && d.bars[last].time * 1000 >= p.entry_time) reason = 'cross'
      if (!reason) continue

      const pnl = closePosition(p, price, reason)
      const pct = (pnl / p.size) * 100
      await safeNotify(
        `${pnl > 0 ? '✅' : '❌'} <b>Bot vendió ${esc(coinOf(p.symbol))}</b> <i>(dinero de mentira)</i>\n` +
          `Compró a ${px(p.entry)} → vendió a ${px(price)}\n` +
          `Resultado: <b>${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)</b>\n` +
          `<i>${reason === 'sl' ? `Stop loss: bajó ${STOP_LOSS}%` : 'Terminó la subida: la amarilla cruzó hacia abajo a la azul'}</i>`,
      )
    }

    // 2. Entradas
    const prices = new Map([...data].map(([s, d]) => [s, d.live.close]))
    for (const symbol of filter) {
      const d = data.get(symbol)
      if (!d) continue
      const last = d.bars.length - 1
      const candle = d.bars[last].time
      if (seen[symbol] === candle) continue // esa vela ya la revisamos
      seen[symbol] = candle
      if (!trendSignal(d.bars, last)) continue
      const held = listPositions()
      if (held.length >= SLOTS || held.some((p) => p.symbol === symbol)) continue

      const size = Math.min(portfolioValue(prices) / SLOTS, getCash())
      if (size < MIN_ORDER) continue
      const entry = d.live.close
      setMeta('bot_cash', String(getCash() - size))
      db()
        .prepare('INSERT INTO bot_positions (symbol, entry, qty, size, entry_time) VALUES (?, ?, ?, ?, ?)')
        .run(symbol, entry, (size * (1 - FEE)) / entry, size, Date.now())
      await safeNotify(
        `🛒 <b>Bot compró ${esc(coinOf(symbol))}</b> <i>(dinero de mentira)</i>\n` +
          `${size.toFixed(2)} USDT a ${px(entry)}\n` +
          `Stop loss en ${px(entry * (1 - STOP_LOSS / 100))} (−${STOP_LOSS}%)\n` +
          `<i>La amarilla cruzó hacia arriba a la azul: empieza una subida</i>`,
      )
    }
    setMeta('bot_seen', JSON.stringify(seen))

    snapshot(await getPrices())
    setMeta('bot_last_run', String(Date.now()))
    setMeta('bot_last_error', '')
  } catch (e) {
    setMeta('bot_last_error', (e as Error).message)
    console.error('[bot] Error:', e)
  } finally {
    running = false
  }
}

/** Una foto por hora de cuánto vale la cartera del bot y la de "no tocar" */
function snapshot(prices: Map<string, number>, force = false) {
  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000
  const last = db().prepare('SELECT MAX(ts) AS ts FROM bot_equity').get() as { ts: number | null }
  if (!force && last.ts === hour) return
  db().prepare('INSERT OR REPLACE INTO bot_equity (ts, value, hold) VALUES (?, ?, ?)').run(hour, portfolioValue(prices), holdValue(prices))
}

export { holdValue }
