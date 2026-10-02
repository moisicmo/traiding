'use client'

import { useActionState } from 'react'
import { Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { Alert } from '@/lib/p2p'
import { createAlert, removeAlert } from '@/app/(app)/p2p/actions'

const bs = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
const when = (ms: number) =>
  new Date(ms).toLocaleString('es-BO', { timeZone: 'America/La_Paz', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function P2PAlerts({ alerts, suggestion }: { alerts: Alert[]; suggestion: { buy: number; sell: number } }) {
  const [result, action, pending] = useActionState(createAlert, null)

  return (
    <div className="mt-3 space-y-3">
      <form action={action} className="space-y-3 rounded-2xl border border-border bg-panel p-4">
        <label className="block text-sm text-muted">
          Avisarme cuando…
          <select name="kind" className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base text-text">
            <option value="sell_above">VENDER USDT pague más de…</option>
            <option value="buy_below">COMPRAR USDT cueste menos de…</option>
          </select>
        </label>
        <label className="block text-sm text-muted">
          Precio en Bs
          <input
            name="price"
            inputMode="decimal"
            placeholder={`por ejemplo ${bs(suggestion.sell + 0.1)}`}
            className="tabular mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base text-text outline-none focus:border-muted"
          />
        </label>
        <button disabled={pending} className="w-full rounded-lg bg-[#2b3345] py-2.5 font-semibold hover:bg-[#343e54] disabled:opacity-50">
          {pending ? 'Guardando…' : 'Crear alerta'}
        </button>
        {result && <p className={clsx('text-sm', result.ok ? 'text-up' : 'text-down')}>{result.message}</p>}
      </form>

      {alerts.length > 0 && (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li key={a.id} className={clsx('flex items-center gap-3 rounded-2xl border border-border bg-panel p-3', a.triggered_at && 'opacity-60')}>
              <div className="flex-1 text-[15px]">
                {a.kind === 'sell_above' ? 'Vender USDT ≥ ' : 'Comprar USDT ≤ '}
                <b className="tabular">{bs(a.price)} Bs</b>
                <p className="text-xs text-muted">{a.triggered_at ? `✓ Avisado el ${when(a.triggered_at)}` : 'Esperando…'}</p>
              </div>
              <form action={removeAlert}>
                <input type="hidden" name="id" value={a.id} />
                <button aria-label="Borrar alerta" className="rounded-lg p-2 text-muted hover:text-down">
                  <Trash2 size={18} />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
