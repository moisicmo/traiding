// Vigila tus órdenes de Binance, las guarda en SQLite y te avisa por Telegram cuando cambian.
//
// Cómo funciona (cada minuto):
//   1. Pide a Binance tus órdenes abiertas.
//   2. Si aparece una que no conocíamos → "📝 Nueva orden".
//   3. Si una abierta avanzó un poco → "⏳ Se ejecutó una parte".
//   4. Si una que estaba abierta ya no aparece → pregunta cómo terminó: ejecutada ✅, cancelada 🚫 o expirada ⌛.
import 'server-only'
import { db, getMeta, setMeta } from './db'
import { explainError, getOpenOrders, getOrder, hasBinanceKeys, type BinanceOrder } from './binance-account'
import { esc, notify as sendTelegram } from './telegram'

export type OrderRow = {
  symbol: string
  order_id: number
  side: 'BUY' | 'SELL'
  type: string
  price: number
  stop_price: number
  orig_qty: number
  executed_qty: number
  quote_qty: number
  status: BinanceOrder['status']
  created_at: number
  updated_at: number
}

const OPEN = ['NEW', 'PARTIALLY_FILLED']

const QUOTES = ['USDT', 'FDUSD', 'USDC', 'BTC', 'BNB', 'ETH', 'EUR', 'BRL', 'TRY']
/** "BNBUSDT" → ["BNB", "USDT"] */
export function splitSymbol(symbol: string): [string, string] {
  const quote = QUOTES.find((q) => symbol.endsWith(q) && symbol.length > q.length) ?? ''
  return [symbol.slice(0, symbol.length - quote.length), quote]
}

export const TYPE_LABEL: Record<string, string> = {
  LIMIT: 'Límite',
  LIMIT_MAKER: 'Límite',
  MARKET: 'Market',
  STOP_LOSS: 'Stop loss',
  STOP_LOSS_LIMIT: 'Stop-limit',
  TAKE_PROFIT: 'Take profit',
  TAKE_PROFIT_LIMIT: 'Take profit',
}

const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 })
/** Precios: 2 decimales (o más si el precio es muy chico) */
const px = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 10 ? 2 : n >= 1 ? 4 : 8 })

function upsert(o: BinanceOrder) {
  db()
    .prepare(
      `INSERT INTO orders (symbol, order_id, side, type, price, stop_price, orig_qty, executed_qty, quote_qty, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol, order_id) DO UPDATE SET
         executed_qty = excluded.executed_qty, quote_qty = excluded.quote_qty,
         status = excluded.status, updated_at = excluded.updated_at`,
    )
    .run(o.symbol, o.orderId, o.side, o.type, +o.price, +o.stopPrice, +o.origQty, +o.executedQty, +o.cummulativeQuoteQty, o.status, o.time, o.updateTime)
}

const findOrder = (symbol: string, orderId: number) =>
  db().prepare('SELECT * FROM orders WHERE symbol = ? AND order_id = ?').get(symbol, orderId) as OrderRow | undefined

export function listOrders({ open, limit = 50 }: { open: boolean; limit?: number }): OrderRow[] {
  const where = open ? `status IN ('NEW', 'PARTIALLY_FILLED')` : `status NOT IN ('NEW', 'PARTIALLY_FILLED')`
  return (db().prepare(`SELECT * FROM orders WHERE ${where} ORDER BY updated_at DESC LIMIT ?`).all(limit) as OrderRow[]).map((o) => ({ ...o }))
}

// ===== Mensajes de Telegram =====

function describe(o: BinanceOrder) {
  const [base, quote] = splitSymbol(o.symbol)
  const action = o.side === 'BUY' ? 'Comprar' : 'Vender'
  const stop = +o.stopPrice ? ` (se activa en ${px(+o.stopPrice)})` : ''
  return `${action} ${num(+o.origQty)} ${base} a ${px(+o.price)} ${quote}${stop}\n<i>${esc(TYPE_LABEL[o.type] ?? o.type)}</i>`
}

function filledMessage(o: BinanceOrder) {
  const [base, quote] = splitSymbol(o.symbol)
  const qty = +o.executedQty
  const total = +o.cummulativeQuoteQty
  const avg = qty ? total / qty : +o.price
  const title = o.side === 'BUY' ? '✅ <b>Compra ejecutada</b>' : '✅ <b>Venta ejecutada</b>'
  return `${title}\n${num(qty)} ${base} a ${px(avg)} ${quote}\nTotal: ${px(total)} ${quote}`
}

function endedMessage(o: BinanceOrder): string | null {
  if (o.status === 'FILLED') return filledMessage(o)
  if (o.status === 'CANCELED') return `🚫 <b>Orden cancelada</b>\n${describe(o)}`
  if (o.status === 'EXPIRED' || o.status === 'EXPIRED_IN_MATCH') {
    // En una OCO / TP-SL, cuando se ejecuta una parte la otra "expira" sola
    const why = o.orderListId !== -1 ? '\nSe canceló sola porque se ejecutó la otra parte (TP/SL).' : ''
    return `⌛ <b>Orden expirada</b>\n${describe(o)}${why}`
  }
  return null
}

// Si Telegram falla, igual seguimos guardando las órdenes
async function notify(html: string) {
  try {
    await sendTelegram(html)
  } catch (e) {
    console.error('[orders] No se pudo avisar por Telegram:', e)
  }
}

// ===== Sincronización =====

let running = false

export async function syncOrders(): Promise<void> {
  if (!hasBinanceKeys() || running) return
  running = true
  try {
    // La primera vez solo guardamos lo que ya existe, sin mandarte un aviso por cada orden vieja
    const firstRun = getMeta('orders_initialized') === null
    const open = await getOpenOrders()
    const seen = new Set<string>()

    for (const o of open) {
      seen.add(`${o.symbol}:${o.orderId}`)
      const prev = findOrder(o.symbol, o.orderId)
      upsert(o)
      if (firstRun) continue
      if (!prev) await notify(`📝 <b>Nueva orden</b>\n${describe(o)}`)
      else if (+o.executedQty > prev.executed_qty)
        await notify(`⏳ <b>Se ejecutó una parte</b>\n${num(+o.executedQty)} de ${num(+o.origQty)} ${splitSymbol(o.symbol)[0]}\n${describe(o)}`)
    }

    // Las que estaban abiertas y ya no aparecen: ¿cómo terminaron?
    const wasOpen = db().prepare(`SELECT symbol, order_id FROM orders WHERE status IN (${OPEN.map(() => '?').join(',')})`).all(...OPEN) as Pick<OrderRow, 'symbol' | 'order_id'>[]
    for (const row of wasOpen) {
      if (seen.has(`${row.symbol}:${row.order_id}`)) continue
      const o = await getOrder(row.symbol, row.order_id)
      upsert(o)
      const message = endedMessage(o)
      if (message && !firstRun) await notify(message)
    }

    setMeta('orders_initialized', '1')
    setMeta('orders_last_sync', String(Date.now()))
    setMeta('orders_last_error', '')
  } catch (e) {
    setMeta('orders_last_error', explainError(e))
    console.error('[orders] Error al sincronizar:', e)
  } finally {
    running = false
  }
}
