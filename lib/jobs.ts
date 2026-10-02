// Tareas automáticas que corren en el servidor (el NAS) mientras la app está prendida.
import 'server-only'
import { syncOrders } from './orders'

const EVERY_MINUTE = 60_000

const globalForJobs = globalThis as unknown as { tradingJobsStarted?: boolean }

export function startJobs() {
  if (globalForJobs.tradingJobsStarted) return // por si Next carga este archivo dos veces
  globalForJobs.tradingJobsStarted = true

  // Revisa tus órdenes de Binance cada minuto (la primera, a los 5 s de arrancar)
  setTimeout(syncOrders, 5_000)
  setInterval(syncOrders, EVERY_MINUTE)
  console.log('[jobs] Revisión de órdenes cada minuto activada')
}
