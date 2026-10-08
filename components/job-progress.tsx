'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Job } from '@/lib/paper-bot'

/** Barra de progreso mientras la competencia se prepara (simulación del pasado). Al terminar, recarga la pantalla. */
export function JobProgress({ initial }: { initial: Job }) {
  const router = useRouter()
  const [job, setJob] = useState(initial)

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const res = await fetch('/api/bot/progress', { cache: 'no-store' })
        const next = (await res.json()) as Job | null
        if (!alive || !next) return
        setJob(next)
        if (next.status !== 'running') {
          router.refresh()
          return
        }
      } catch {
        // Si una consulta falla (internet, servidor ocupado), se reintenta en la siguiente
      }
      if (alive) timer = setTimeout(tick, 1500)
    }
    let timer = setTimeout(tick, 1500)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [router])

  return (
    <section className="mt-4 rounded-2xl border border-sma50/40 bg-sma50/10 p-5" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">🏁 Preparando la competencia…</p>
        <p className="tabular text-2xl font-semibold">{job.pct}%</p>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full bg-sma50 transition-all duration-500" style={{ width: `${Math.max(job.pct, 3)}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">{job.message}</p>
      <p className="mt-1 text-xs text-muted">Puede tardar uno o dos minutos. Puedes salir de esta pantalla: sigue en el servidor y te avisa por Telegram al terminar.</p>
    </section>
  )
}
