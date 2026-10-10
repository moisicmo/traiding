// 🧭 Consejero P2P: "¡COMPRA!", "¡VENDE!" o "espera", con el porqué. Solo mira y avisa: nunca opera.
// Usa el precio del USDT en Bs que la app guarda cada 5 minutos y tus compras/ventas P2P (con la llave de solo lectura).
import 'server-only'
import { db, getMeta, setMeta } from './db'
import { getP2POrders, hasBinanceKeys } from './binance-account'
import { listSnapshots, type Snapshot } from './p2p'
import { notify } from './telegram'

const DAY = 86_400_000
const WINDOW = 7 * DAY // compara con la última semana
const CHEAP = 0.3 // comprar: precio en el 30% más bajo de la semana
const EXPENSIVE = 0.7 // vender: lo que pagan, en el 30% más alto de la semana
const QUIET = 0.006 // si en la semana se movió menos de 0,6%, no hay oportunidad
const MIN_PROFIT = 0.01 // vender solo si gana al menos 1% sobre lo que te costaron
const RENOTIFY = 12 * 3_600_000 // la misma señal se repite por Telegram como mucho cada 12 h

const bs = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
const pct = (n: number) => `${(n * 100).toLocaleString('es-BO', { maximumFractionDigits: 1 })}%`

// ===== Tu historial P2P =====

function ensureTable() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS p2p_orders (
      order_number TEXT PRIMARY KEY, trade_type TEXT NOT NULL, amount REAL NOT NULL, total REAL NOT NULL,
      unit_price REAL NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL, counterpart TEXT NOT NULL
    );
  `)
}

export type P2POrder = { order_number: string; trade_type: 'BUY' | 'SELL'; amount: number; total: number; unit_price: number; status: string; created: number; counterpart: string }

/** Trae tus órdenes P2P de USDT/BOB. La primera vez, el último año (de a 30 días); después, solo lo nuevo */
export async function syncP2POrders() {
  if (!hasBinanceKeys()) return
  ensureTable()
  const now = Date.now()
  const last = Number(getMeta('p2p_orders_synced') ?? 0)
  if (now - last < 15 * 60_000) return // cada 15 minutos alcanza
  const from = last ? last - 2 * DAY : now - 365 * DAY
  const insert = db().prepare(
    'INSERT OR REPLACE INTO p2p_orders (order_number, trade_type, amount, total, unit_price, status, created, counterpart) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (let start = from; start < now; start += 30 * DAY) {
    const end = Math.min(start + 30 * DAY - 1, now)
    for (const type of ['BUY', 'SELL'] as const) {
      for (let page = 1; page <= 10; page++) {
        const res = await getP2POrders(type, start, end, page)
        const list = res.data ?? []
        for (const o of list)
          if (o.asset === 'USDT' && o.fiat === 'BOB')
            insert.run(o.orderNumber, o.tradeType, +o.amount, +o.totalPrice, +o.unitPrice, o.orderStatus, o.createTime, o.counterPartNickName ?? '')
        if (list.length < 100) break
      }
    }
  }
  setMeta('p2p_orders_synced', String(now))
}

export function listP2POrders(): P2POrder[] {
  ensureTable()
  return (db().prepare('SELECT * FROM p2p_orders ORDER BY created DESC').all() as P2POrder[]).map((r) => ({ ...r }))
}

export type P2PSummary = {
  held: number // USDT comprados en P2P que todavía no vendiste en P2P
  avgCost: number | null // lo que te costó cada uno, en promedio (Bs)
  realized: number // Bs ganados (o perdidos) en las ventas, contra lo que te costaron
  bought: number // USDT comprados en total
  sold: number
}

/** Empareja cada venta con tus compras más viejas (la primera que compraste es la primera que vendes) */
export function p2pSummary(orders = listP2POrders()): P2PSummary {
  const lots: { qty: number; unit: number }[] = []
  let realized = 0
  let bought = 0
  let sold = 0
  for (const o of [...orders].filter((x) => x.status === 'COMPLETED').sort((a, b) => a.created - b.created)) {
    if (o.trade_type === 'BUY') {
      lots.push({ qty: o.amount, unit: o.total / o.amount })
      bought += o.amount
      continue
    }
    sold += o.amount
    let need = o.amount
    let cost = 0
    let covered = 0
    while (need > 1e-9 && lots.length) {
      const take = Math.min(lots[0].qty, need)
      cost += take * lots[0].unit
      covered += take
      lots[0].qty -= take
      need -= take
      if (lots[0].qty <= 1e-9) lots.shift()
    }
    // Solo cuenta ganancia de lo que sabemos cuánto costó (USDT que llegaron de otro lado no tienen costo conocido)
    realized += covered * o.unit_price - cost
  }
  const held = lots.reduce((s, l) => s + l.qty, 0)
  const cost = lots.reduce((s, l) => s + l.qty * l.unit, 0)
  return { held, avgCost: held > 0.01 ? cost / held : null, realized, bought, sold }
}

// ===== El consejo =====

export type Advice = {
  action: 'buy' | 'sell' | 'wait'
  title: string
  reasons: string[]
  buy: number // lo que cuesta comprar ahora
  sell: number // lo que pagan si vendes ahora
  ts: number
}

const range = (xs: number[]) => ({ low: Math.min(...xs), high: Math.max(...xs), avg: xs.reduce((s, x) => s + x, 0) / xs.length })

export function advise(week: Snapshot[] = listSnapshots(WINDOW), summary: P2PSummary | null = null): Advice | null {
  const now = week.at(-1)
  if (!now) return null
  const base = { buy: now.buy_best, sell: now.sell_best, ts: now.ts }
  if (now.ts - week[0].ts < DAY)
    return { ...base, action: 'wait', title: 'Juntando datos', reasons: ['Necesito al menos 1 día de precios para comparar. La app guarda el precio cada 5 minutos.'] }

  const b = range(week.map((s) => s.buy_best))
  const v = range(week.map((s) => s.sell_best))
  const posBuy = b.high > b.low ? (now.buy_best - b.low) / (b.high - b.low) : 0.5
  const posSell = v.high > v.low ? (now.sell_best - v.low) / (v.high - v.low) : 0.5
  const recent = week.filter((s) => s.ts >= now.ts - DAY)
  const dayAvg = range(recent.map((s) => s.buy_best)).avg
  const trend =
    dayAvg > b.avg * 1.003
      ? 'En el último día viene subiendo (el boliviano pierde valor).'
      : dayAvg < b.avg * 0.997
        ? 'En el último día viene bajando.'
        : 'En el último día está estable.'
  const weekText = (r: typeof b) => `en 7 días estuvo entre ${bs(r.low)} y ${bs(r.high)} Bs`

  if ((b.high - b.low) / b.low < QUIET && (v.high - v.low) / v.low < QUIET)
    return {
      ...base,
      action: 'wait',
      title: 'Espera: el precio está muy quieto',
      reasons: [`Comprar cuesta ${bs(now.buy_best)} Bs y ${weekText(b)}: se movió menos de ${pct(QUIET)}, así que no hay un momento mejor que otro.`, trend],
    }

  const cost = summary?.avgCost ?? null
  const gainPer = cost ? now.sell_best - cost : null

  if (posSell >= EXPENSIVE && (cost === null || now.sell_best >= cost * (1 + MIN_PROFIT))) {
    const reasons = [`Te pagan ${bs(now.sell_best)} Bs por USDT: está en la parte ALTA de la semana (${weekText(v)}).`]
    if (cost && gainPer !== null && summary)
      reasons.push(
        `Tus USDT de P2P te costaron ${bs(cost)} Bs en promedio: ganarías ${bs(gainPer)} Bs por cada uno (${pct(gainPer / cost)}). Si vendes los ${summary.held.toLocaleString('es-BO', { maximumFractionDigits: 2 })} que tienes, unos ${bs(gainPer * summary.held)} Bs.`,
      )
    reasons.push(trend, 'Vende solo si de verdad necesitas bolivianos: a la larga, el USDT suele subir.')
    return { ...base, action: 'sell', title: '¡VENDE!', reasons }
  }

  if (posBuy <= CHEAP) {
    const reasons = [
      `Comprar cuesta ${bs(now.buy_best)} Bs: está en la parte BAJA de la semana (${weekText(b)}).`,
      `Es ${pct((b.high - now.buy_best) / b.high)} más barato que lo más caro de la semana.`,
      trend,
    ]
    if (cost) reasons.push(`Tus USDT de P2P te costaron ${bs(cost)} Bs en promedio.`)
    return { ...base, action: 'buy', title: '¡COMPRA!', reasons }
  }

  const reasons = [`Comprar cuesta ${bs(now.buy_best)} Bs y te pagan ${bs(now.sell_best)} Bs: está en el MEDIO de la semana (${weekText(b)}).`, trend]
  if (posSell >= EXPENSIVE && cost && gainPer !== null)
    reasons.push(`Te pagan bien, pero todavía no cubre lo que te costaron tus USDT (${bs(cost)} Bs) más un margen de ${pct(MIN_PROFIT)}.`)
  reasons.push(`Te aviso cuando comprar baje cerca de ${bs(b.low + (b.high - b.low) * CHEAP)} Bs o cuando vender suba cerca de ${bs(v.low + (v.high - v.low) * EXPENSIVE)} Bs.`)
  return { ...base, action: 'wait', title: 'Espera: no es un buen momento', reasons }
}

// ===== El último aviso (para decirte "¿todavía es buen momento?" cuando entras más tarde) =====

export type LastSignal = { action: 'buy' | 'sell'; price: number; ts: number }
export const getLastSignal = () => JSON.parse(getMeta('p2p_last_signal') ?? 'null') as LastSignal | null
/** El último aviso, si fue en los últimos 2 días, con cuántas horas pasaron */
export function recentSignal() {
  const last = getLastSignal()
  const hours = last ? (Date.now() - last.ts) / 3_600_000 : Infinity
  return last && hours < 48 ? { ...last, hours } : null
}

/** Después de cada foto de precio (cada 5 minutos): si aparece una señal nueva, avisa por Telegram */
export async function checkAdvice() {
  try {
    await syncP2POrders()
  } catch (e) {
    console.error('[p2p] No se pudo leer tu historial P2P:', e)
  }
  const advice = advise(undefined, safeSummary())
  if (!advice || advice.action === 'wait') return
  const last = getLastSignal()
  if (last && last.action === advice.action && advice.ts - last.ts < RENOTIFY) return
  const price = advice.action === 'buy' ? advice.buy : advice.sell
  setMeta('p2p_last_signal', JSON.stringify({ action: advice.action, price, ts: advice.ts } satisfies LastSignal))
  try {
    await notify(`${advice.action === 'buy' ? '🟢' : '🔴'} <b>P2P: ${advice.title}</b>\n${advice.reasons.map((r) => `• ${r}`).join('\n')}`)
  } catch (e) {
    console.error('[p2p] No se pudo avisar por Telegram:', e)
  }
}

export function safeSummary() {
  try {
    return hasBinanceKeys() ? p2pSummary() : null
  } catch {
    return null
  }
}
