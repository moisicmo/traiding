import clsx from 'clsx'
import { capitalNeeded, type DayStatus, type Progress } from '@/lib/goals'
import { updateGoals } from '@/app/(app)/ordenes/actions'

const usd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const DOT: Record<DayStatus, { className: string; label: string }> = {
  win: { className: 'bg-up', label: 'venta con ganancia' },
  loss: { className: 'bg-down/50', label: 'solo pérdidas' },
  none: { className: 'bg-border', label: 'sin ventas' },
}

export function GoalsPanel({ p }: { p: Progress }) {
  const capital = capitalNeeded(p)

  return (
    <section className="mt-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <GoalCard
          label="Ganancia del mes"
          value={`${p.monthPnl >= 0 ? '+' : '−'}${usd(Math.abs(p.monthPnl))}`}
          target={`de ${usd(p.goals.pnl)} USDT`}
          ratio={p.monthPnl / p.goals.pnl}
          missing={`Te faltan ${usd(Math.max(p.goals.pnl - p.monthPnl, 0))} USDT este mes`}
        />
        <GoalCard
          label="Operaciones del mes"
          value={String(p.monthOps)}
          target={`de ${p.goals.ops} ventas`}
          ratio={p.monthOps / p.goals.ops}
          missing={`Te ${p.goals.ops - p.monthOps === 1 ? 'falta 1 venta' : `faltan ${p.goals.ops - p.monthOps} ventas`} este mes`}
        />

        <div className="rounded-2xl border border-border bg-panel p-4 md:col-span-2 xl:col-span-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-muted">Racha</p>
            <p className="text-xs text-muted">Mejor: {p.best} {p.best === 1 ? 'día' : 'días'}</p>
          </div>
          <p className="mt-1 text-3xl font-semibold">
            {p.streak > 0 ? '🔥' : '🌱'} {p.streak} <span className="text-base font-normal text-muted">{p.streak === 1 ? 'día' : 'días'}</span>
          </p>
          <p className={clsx('mt-1 text-sm', p.todayDone ? 'text-up' : 'text-muted')}>
            {p.todayDone
              ? '✓ Hoy ya tienes una venta con ganancia'
              : p.streak > 0
                ? 'Te falta una venta con ganancia hoy (sin forzarla)'
                : 'Una venta con ganancia empieza tu racha'}
          </p>

          {/* Últimos 14 días */}
          <div className="mt-3 grid grid-cols-14 gap-1">
            {p.last14.map((d, i) => (
              <div key={d.key} className="flex flex-col items-center gap-1" title={`${d.key}: ${DOT[d.status].label}`}>
                <div className={clsx('size-full aspect-square max-w-6 rounded', DOT[d.status].className, i === 13 && 'ring-2 ring-text/40')} />
                <span className="text-[9px] leading-none text-muted">{d.label.split(' ')[0]}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
            {(Object.keys(DOT) as DayStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={clsx('inline-block size-2 rounded-sm', DOT[s].className)} /> {DOT[s].label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="group mt-3 rounded-2xl border border-border bg-panel">
        <summary className="cursor-pointer list-none p-4 text-sm font-medium marker:hidden">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          Editar metas
        </summary>
        <form action={updateGoals} className="grid gap-3 px-4 pb-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-sm text-muted">
            Ganancia por mes (USDT)
            <input
              name="pnl"
              inputMode="decimal"
              defaultValue={p.goals.pnl}
              className="tabular mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base text-text outline-none focus:border-muted"
            />
          </label>
          <label className="block text-sm text-muted">
            Operaciones (ventas) por mes
            <input
              name="ops"
              inputMode="numeric"
              defaultValue={p.goals.ops}
              className="tabular mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base text-text outline-none focus:border-muted"
            />
          </label>
          <button className="rounded-lg bg-[#2b3345] px-5 py-2.5 font-semibold hover:bg-[#343e54]">Guardar</button>
          <p className="text-sm text-muted sm:col-span-3">
            {capital !== null ? (
              <>
                Con tu ritmo (≈{p.avgPct!.toFixed(1)}% de ganancia por operación y {p.goals.ops} operaciones al mes), para ganar{' '}
                <b className="text-text">{usd(p.goals.pnl)} USDT</b> al mes necesitarías tener invertidos unos{' '}
                <b className="text-text">{usd(capital)} USDT</b>. Si es mucho, baja la meta y súbela cuando la cumplas.
              </>
            ) : (
              'Cuando tengas algunas ventas con ganancia, aquí te digo cuánto necesitarías invertir para llegar a tu meta.'
            )}
          </p>
        </form>
      </details>
    </section>
  )
}

function GoalCard({ label, value, target, ratio, missing }: { label: string; value: string; target: string; ratio: number; missing: string }) {
  const done = ratio >= 1
  const pct = Math.max(0, Math.min(ratio, 1)) * 100
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <p className={clsx('text-xs font-medium', done ? 'text-up' : 'text-muted')}>{done ? '✓ ¡Cumplida!' : `${Math.round(pct)}%`}</p>
      </div>
      <p className="mt-1 text-3xl font-semibold">
        {value} <span className="text-base font-normal text-muted">{target}</span>
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg">
        <div className={clsx('h-full rounded-full transition-all', done ? 'bg-up' : 'bg-sma50')} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">{done ? 'Ya llegaste: puedes subir la meta en "Editar metas"' : missing}</p>
    </div>
  )
}
