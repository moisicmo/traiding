'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import clsx from 'clsx'

/** Título de pantalla + botón para volver a pedir los datos al servidor */
export function PageHeader({ title, subtitle, refresh = false }: { title: string; subtitle?: string; refresh?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {refresh && (
        <button
          onClick={() => startTransition(() => router.refresh())}
          disabled={pending}
          aria-label="Actualizar"
          className="rounded-lg border border-border bg-panel p-2.5 text-muted hover:text-text disabled:opacity-60"
        >
          <RefreshCw size={18} className={clsx(pending && 'animate-spin')} />
        </button>
      )}
    </header>
  )
}
