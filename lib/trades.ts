// Tus operaciones ejecutadas en Binance Spot: se guardan en SQLite y sirven para dos cosas:
//   1. Calcular cuánto ganaste o perdiste en cada venta (con las comisiones exactas).
//   2. Avisarte por Telegram de las compras/ventas instantáneas (Market), que nunca quedan "esperando".
import 'server-only'
import { db, getMeta, setMeta } from './db'
import { BinanceError, explainError, getMyTrades, hasBinanceKeys, type BinanceTrade } from './binance-account'
import { splitSymbol } from './orders'
import { esc, notify } from './telegram'

/** Pares que siempre revisamos, además de los que aparecen en tus órdenes y tu billetera */
const DEFAULT_SYMBOLS = ['BTCUSDT', 'BNBUSDT', 'ETHUSDT', 'SOLUSDT']
const STABLES = ['USDT', 'USDC', 'FDUSD']

type TradeRow = {
  symbol: string
  id: number
  order_id: number
  is_buyer: number
  price: number
  qty: number
  quote_qty: number
  commission: number
  commission_asset: string
  time: number
}

// ===== Sincronización =====

function symbolsToWatch(): string[] {
  const set = new Set(DEFAULT_SYMBOLS)
  const rows = db().prepare('SELECT DISTINCT symbol FROM orders UNION SELECT DISTINCT symbol FROM trades').all() as { symbol: string }[]
  for (const r of rows) set.add(r.symbol)
  // Monedas que tienes en la billetera (las guarda la pantalla Billetera)
  const assets = JSON.parse(getMeta('wallet_assets') ?? '[]') as string[]
  for (const a of assets) if (!STABLES.includes(a)) set.add(`${a}USDT`)
  const bad = new Set(JSON.parse(getMeta('bad_symbols') ?? '[]') as string[])
  return [...set].filter((s) => !bad.has(s))
}

function insertTrade(t: BinanceTrade): boolean {
  const res = db()
    .prepare(
      `INSERT OR IGNORE INTO trades (symbol, id, order_id, is_buyer, price, qty, quote_qty, commission, commission_asset, time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(t.symbol, t.id, t.orderId, t.isBuyer ? 1 : 0, +t.price, +t.qty, +t.quoteQty, +t.commission, t.commissionAsset, t.time)
  return res.changes > 0
}

const px = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 10 ? 2 : n >= 1 ? 4 : 8 })
const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 })

/** Aviso para las órdenes que se ejecutaron sin pasar nunca por "esperando" (Market o límite inmediata) */
async function notifyInstant(trades: BinanceTrade[]) {
  const byOrder = new Map<string, BinanceTrade[]>()
  for (const t of trades) {
    const known = db().prepare('SELECT 1 FROM orders WHERE symbol = ? AND order_id = ?').get(t.symbol, t.orderId)
    if (known) continue // esa orden ya la avisó el vigilante de órdenes
    const key = `${t.symbol}:${t.orderId}`
    byOrder.set(key, [...(byOrder.get(key) ?? []), t])
  }
  for (const list of byOrder.values()) {
    const [base, quote] = splitSymbol(list[0].symbol)
    const qty = list.reduce((s, t) => s + +t.qty, 0)
    const total = list.reduce((s, t) => s + +t.quoteQty, 0)
    const title = list[0].isBuyer ? '✅ <b>Compra ejecutada</b>' : '✅ <b>Venta ejecutada</b>'
    try {
      await notify(`${title} <i>(al instante)</i>\n${num(qty)} ${esc(base)} a ${px(total / qty)} ${esc(quote)}\nTotal: ${px(total)} ${esc(quote)}`)
    } catch (e) {
      console.error('[trades] No se pudo avisar por Telegram:', e)
    }
  }
}

let running = false

export async function syncTrades(): Promise<void> {
  if (!hasBinanceKeys() || running) return
  running = true
  try {
    // La primera vez solo guardamos tu historial, sin mandarte un aviso por cada operación vieja
    const firstRun = getMeta('trades_initialized') === null
    const fresh: BinanceTrade[] = []

    for (const symbol of symbolsToWatch()) {
      const last = db().prepare('SELECT MAX(id) AS id FROM trades WHERE symbol = ?').get(symbol) as { id: number | null }
      let fromId = (last.id ?? -1) + 1
      try {
        for (;;) {
          const batch = await getMyTrades(symbol, fromId)
          for (const t of batch) if (insertTrade(t)) fresh.push(t)
          if (batch.length < 1000) break
          fromId = batch[batch.length - 1].id + 1
        }
      } catch (e) {
        // Par que no existe en Binance (por ejemplo una moneda que no se cambia contra USDT): no lo volvemos a pedir
        if (e instanceof BinanceError && e.code === -1121) {
          const bad = JSON.parse(getMeta('bad_symbols') ?? '[]') as string[]
          setMeta('bad_symbols', JSON.stringify([...bad, symbol]))
        } else throw e
      }
    }

    if (!firstRun && fresh.length) await notifyInstant(fresh)
    setMeta('trades_initialized', '1')
    setMeta('trades_last_error', '')
  } catch (e) {
    setMeta('trades_last_error', explainError(e))
    console.error('[trades] Error al sincronizar:', e)
  } finally {
    running = false
  }
}

// ===== Resultados (ganancia / pérdida) =====

export type ClosedOp = {
  symbol: string
  base: string
  quote: string
  time: number // cuándo vendiste
  qty: number
  buyAvg: number // precio promedio al que habías comprado (con comisiones)
  sellAvg: number // precio promedio al que vendiste (con comisiones)
  cost: number
  proceeds: number
  pnl: number
  pnlPct: number
  partial: boolean // vendiste más de lo que la app vio comprar (p. ej. lo recibiste por P2P o Convert)
}

export type OpenPosition = {
  symbol: string
  base: string
  quote: string
  qty: number
  avgCost: number
  cost: number
  price: number | null
  pnl: number | null
  pnlPct: number | null
}

export type Results = {
  ops: ClosedOp[] // de la más nueva a la más vieja
  open: OpenPosition[]
  total: number
  last30: number
  wins: number
  losses: number
}

const DAY = 86_400_000

/**
 * Empareja cada venta con las compras anteriores (la primera que compraste es la primera que vendes)
 * y calcula la ganancia neta. Solo pares contra dólares (USDT, USDC, FDUSD).
 */
export function computeResults(prices: Map<string, number>): Results {
  const now = Date.now()
  const rows = db().prepare('SELECT * FROM trades ORDER BY time, id').all() as TradeRow[]

  // Comisión pasada a dólares. Si se pagó con BNB (u otra moneda), la valoramos con su precio actual
  const feeInQuote = (t: TradeRow, base: string, quote: string) => {
    if (t.commission_asset === quote) return t.commission
    if (t.commission_asset === base) return 0 // se descuenta de la cantidad, no del dinero
    const price = prices.get(`${t.commission_asset}USDT`)
    return price ? t.commission * price : 0
  }

  const lots = new Map<string, { qty: number; unit: number }[]>()
  const sells = new Map<string, ClosedOp & { covered: number }>()

  for (const t of rows) {
    const [base, quote] = splitSymbol(t.symbol)
    if (!STABLES.includes(quote)) continue
    const queue = lots.get(t.symbol) ?? []
    lots.set(t.symbol, queue)
    const fee = feeInQuote(t, base, quote)
    const feeInBase = t.commission_asset === base ? t.commission : 0

    if (t.is_buyer) {
      const qty = t.qty - feeInBase
      if (qty > 0) queue.push({ qty, unit: (t.quote_qty + fee) / qty })
      continue
    }

    // Venta: consumimos las compras más viejas primero
    const sellQty = t.qty + feeInBase
    const proceeds = t.quote_qty - fee
    let need = sellQty
    let cost = 0
    while (need > 1e-12 && queue.length) {
      const lot = queue[0]
      const take = Math.min(lot.qty, need)
      cost += take * lot.unit
      lot.qty -= take
      need -= take
      if (lot.qty <= 1e-12) queue.shift()
    }
    const covered = sellQty - need
    // Lo que vendiste sin una compra registrada: lo contamos sin ganancia ni pérdida
    cost += (need / sellQty) * proceeds

    const key = `${t.symbol}:${t.order_id}`
    const op = sells.get(key) ?? { symbol: t.symbol, base, quote, time: t.time, qty: 0, buyAvg: 0, sellAvg: 0, cost: 0, proceeds: 0, pnl: 0, pnlPct: 0, partial: false, covered: 0 }
    op.time = Math.max(op.time, t.time)
    op.qty += t.qty
    op.cost += cost
    op.proceeds += proceeds
    op.covered += covered
    sells.set(key, op)
  }

  const ops: ClosedOp[] = [...sells.values()]
    .map(({ covered, ...op }) => ({
      ...op,
      buyAvg: op.cost / op.qty,
      sellAvg: op.proceeds / op.qty,
      pnl: op.proceeds - op.cost,
      pnlPct: op.cost ? ((op.proceeds - op.cost) / op.cost) * 100 : 0,
      partial: covered < op.qty * 0.95,
    }))
    .sort((a, b) => b.time - a.time)

  const open: OpenPosition[] = []
  for (const [symbol, queue] of lots) {
    const qty = queue.reduce((s, l) => s + l.qty, 0)
    const cost = queue.reduce((s, l) => s + l.qty * l.unit, 0)
    const price = prices.get(symbol) ?? null
    if (qty <= 0 || (price ?? 0) * qty < 1) continue // ignoramos restos de menos de 1 dólar
    const [base, quote] = splitSymbol(symbol)
    const value = price === null ? null : qty * price
    open.push({
      symbol,
      base,
      quote,
      qty,
      avgCost: cost / qty,
      cost,
      price,
      pnl: value === null ? null : value - cost,
      pnlPct: value === null ? null : ((value - cost) / cost) * 100,
    })
  }

  return {
    ops,
    open,
    total: ops.reduce((s, o) => s + o.pnl, 0),
    last30: ops.filter((o) => o.time >= now - 30 * DAY).reduce((s, o) => s + o.pnl, 0),
    wins: ops.filter((o) => o.pnl > 0).length,
    losses: ops.filter((o) => o.pnl <= 0).length,
  }
}
