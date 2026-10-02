'use client'

import dynamic from 'next/dynamic'

// El panel usa el gráfico, WebSocket y localStorage: solo existe en el navegador
const Dashboard = dynamic(() => import('./dashboard').then((m) => m.Dashboard), {
  ssr: false,
  loading: () => <div className="flex min-h-svh items-center justify-center text-muted">Cargando…</div>,
})

export function DashboardLoader(props: { userName: string | null; logout: () => Promise<void> }) {
  return <Dashboard {...props} />
}
