// Tareas automáticas que corren en el servidor (el NAS) mientras la app está prendida.
import 'server-only'
import { syncOrders } from './orders'
import { syncTrades } from './trades'
import { recordP2P } from './p2p'
import { getPrices, hasBinanceKeys } from './binance-account'
import { computeResults } from './trades'
import { checkGoals } from './goals'
import { runBot } from './paper-bot'
import { runReal } from './real-bot'

const EVERY_MINUTE = 60_000
const EVERY_5_MINUTES = 5 * 60_000

const globalForJobs = globalThis as unknown as { tradingJobsStarted?: boolean }

export function startJobs() {
  if (globalForJobs.tradingJobsStarted) return // por si Next carga este archivo dos veces
  globalForJobs.tradingJobsStarted = true

  // Revisa tus órdenes y operaciones de Binance cada minuto (la primera, a los 5 s de arrancar).
  // Primero las órdenes: así las operaciones de órdenes que ya avisamos no se avisan dos veces.
  const syncAccount = async () => {
    await syncOrders()
    await syncTrades()
  }
  setTimeout(syncAccount, 5_000)
  setInterval(syncAccount, EVERY_MINUTE)
  // Guarda el precio del USDT en el P2P (USDT/BOB) cada 5 minutos y revisa tus alertas
  setTimeout(recordP2P, 10_000)
  setInterval(recordP2P, EVERY_5_MINUTES)

  // Metas y racha: avisa cuando cumples una meta y recuerda la racha a las 20:00 (hora de Bolivia)
  setInterval(async () => {
    if (!hasBinanceKeys()) return
    try {
      await checkGoals(computeResults(await getPrices()).ops)
    } catch (e) {
      console.error('[goals] Error al revisar metas:', e)
    }
  }, EVERY_5_MINUTES)

  // Bot en vivo con dinero de mentira: revisa cada 5 minutos (las velas son de 4 h; el stop loss se vigila más seguido)
  // Y justo después, el bot real (si lo prendiste) copia la cartera del competidor que elegiste
  const bots = async () => {
    await runBot()
    await runReal()
  }
  setTimeout(bots, 20_000)
  setInterval(bots, EVERY_5_MINUTES)

  console.log('[jobs] Órdenes cada minuto · P2P, metas y bot cada 5 minutos')
}
