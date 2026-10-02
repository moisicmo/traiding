'use client'

import dynamic from 'next/dynamic'

// El panel usa el gráfico, WebSocket y localStorage: solo existe en el navegador
const Dashboard = dynamic(() => import('./dashboard').then((m) => m.Dashboard), {
  ssr: false,
  loading: () => <div className="flex flex-1 items-center justify-center py-20 text-muted">Cargando…</div>,
})

export function DashboardLoader() {
  return <Dashboard />
}
