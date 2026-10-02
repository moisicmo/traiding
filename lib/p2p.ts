// Precio del USDT en bolivianos (BOB) en el P2P de Binance.
// Ojo: esta ruta no es oficial (es la que usa la propia página de Binance P2P), podría cambiar algún día.
import 'server-only'
import { db } from './db'
import { notify } from './telegram'

const SEARCH = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search'

/** Monto típico de tus operaciones: solo contamos anuncios que acepten este monto (muchos piden mínimos altos) */
export const P2P_AMOUNT = Number(process.env.P2P_AMOUNT_BOB) || 1000

export type Ad = { price: number; min: number; max: number; name: string; merchant: boolean; banks: string[] }

/** tradeType BUY = anuncios donde TÚ compras USDT · SELL = anuncios donde TÚ vendes USDT */
export async function searchAds(tradeType: 'BUY' | 'SELL', rows = 10): Promise<Ad[]> {
  const res = await fetch(SEARCH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: 'USDT', fiat: 'BOB', tradeType, page: 1, rows, payTypes: [], transAmount: P2P_AMOUNT }),
    cache: 'no-store',
  })
  type Raw = {
    adv: { price: string; minSingleTransAmount: string; dynamicMaxSingleTransAmount?: string; maxSingleTransAmount: string; tradeMethods: { tradeMethodName?: string; identifier: string }[] }
    advertiser: { nickName: string; userType: string }
  }
  const data = (await res.json()) as { success: boolean; data?: Raw[]; message?: string }
  if (!data.success || !data.data) throw new Error(`Binance P2P: ${data.message ?? res.status}`)
  return data.data.map((a) => ({
    price: +a.adv.price,
    min: +a.adv.minSingleTransAmount,
    max: +(a.adv.dynamicMaxSingleTransAmount ?? a.adv.maxSingleTransAmount),
    name: a.advertiser.nickName,
    merchant: a.advertiser.userType === 'merchant',
    banks: a.adv.tradeMethods.map((m) => m.tradeMethodName ?? m.identifier),
  }))
}

export type Snapshot = { ts: number; buy_best: number; buy_avg: number; sell_best: number; sell_avg: number }

const avg = (ads: Ad[]) => ads.slice(0, 5).reduce((s, a) => s + a.price, 0) / Math.min(ads.length, 5)

export async function takeSnapshot(): Promise<{ snapshot: Snapshot; buyAds: Ad[]; sellAds: Ad[] }> {
  const [buyAds, sellAds] = await Promise.all([searchAds('BUY'), searchAds('SELL')])
  if (!buyAds.length || !sellAds.length) throw new Error('Binance P2P no devolvió anuncios')
  const snapshot = { ts: Date.now(), buy_best: buyAds[0].price, buy_avg: avg(buyAds), sell_best: sellAds[0].price, sell_avg: avg(sellAds) }
  return { snapshot, buyAds, sellAds }
}

export function saveSnapshot(s: Snapshot) {
  db().prepare('INSERT OR REPLACE INTO p2p_prices (ts, buy_best, buy_avg, sell_best, sell_avg) VALUES (?, ?, ?, ?, ?)').run(s.ts, s.buy_best, s.buy_avg, s.sell_best, s.sell_avg)
}

export function listSnapshots(sinceMs: number): Snapshot[] {
  return (db().prepare('SELECT * FROM p2p_prices WHERE ts >= ? ORDER BY ts').all(Date.now() - sinceMs) as Snapshot[]).map((r) => ({ ...r }))
}

// ===== Alertas =====

export type AlertKind = 'buy_below' | 'sell_above'
export type Alert = { id: number; kind: AlertKind; price: number; created_at: number; triggered_at: number | null }

// node:sqlite devuelve objetos "sin prototipo": los copiamos a objetos normales para poder pasarlos a componentes del navegador
export const listAlerts = () =>
  (db().prepare('SELECT * FROM p2p_alerts ORDER BY triggered_at IS NOT NULL, created_at DESC').all() as Alert[]).map((a) => ({ ...a }))

export function addAlert(kind: AlertKind, price: number) {
  db().prepare('INSERT INTO p2p_alerts (kind, price, created_at) VALUES (?, ?, ?)').run(kind, price, Date.now())
}

export function deleteAlert(id: number) {
  db().prepare('DELETE FROM p2p_alerts WHERE id = ?').run(id)
}

const bs = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

async function checkAlerts(s: Snapshot) {
  const pending = db().prepare('SELECT * FROM p2p_alerts WHERE triggered_at IS NULL').all() as Alert[]
  for (const a of pending) {
    const hit = a.kind === 'buy_below' ? s.buy_best <= a.price : s.sell_best >= a.price
    if (!hit) continue
    const text =
      a.kind === 'buy_below'
        ? `💵 <b>P2P: comprar USDT bajó</b>\nAhora cuesta <b>${bs(s.buy_best)} Bs</b> (tu alerta: ${bs(a.price)} Bs o menos)`
        : `💵 <b>P2P: vender USDT subió</b>\nAhora pagan <b>${bs(s.sell_best)} Bs</b> (tu alerta: ${bs(a.price)} Bs o más)`
    try {
      await notify(`${text}\n<i>Para ${bs(P2P_AMOUNT)} Bs</i>`)
      db().prepare('UPDATE p2p_alerts SET triggered_at = ? WHERE id = ?').run(Date.now(), a.id)
    } catch (e) {
      console.error('[p2p] No se pudo avisar por Telegram:', e)
    }
  }
}

/** Tarea de cada 5 minutos: guarda el precio y revisa las alertas */
export async function recordP2P() {
  try {
    const { snapshot } = await takeSnapshot()
    saveSnapshot(snapshot)
    await checkAlerts(snapshot)
  } catch (e) {
    console.error('[p2p] Error al guardar el precio:', e)
  }
}
