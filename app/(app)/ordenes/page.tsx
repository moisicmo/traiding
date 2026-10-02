import clsx from 'clsx'
import { hasBinanceKeys } from '@/lib/binance-account'
import { getMeta } from '@/lib/db'
import { listOrders, splitSymbol, syncOrders, TYPE_LABEL, type OrderRow } from '@/lib/orders'
import { PageHeader } from '@/components/page-header'
import { SetupBinanceCard } from '@/components/setup-binance-card'

export const metadata = { title: 'Órdenes · Trading' }

const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 })
const px = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 10 ? 2 : n >= 1 ? 4 : 8 })
const when = (ms: number) =>
  new Date(ms).toLocaleString('es-BO', { timeZone: 'America/La_Paz', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const STATUS: Record<string, { label: string; className: string }> = {
  NEW: { label: 'Esperando', className: 'bg-sma20/15 text-sma20' },
  PARTIALLY_FILLED: { label: 'En parte', className: 'bg-sma20/15 text-sma20' },
  FILLED: { label: 'Ejecutada', className: 'bg-up/15 text-up' },
  CANCELED: { label: 'Cancelada', className: 'bg-border text-muted' },
  EXPIRED: { label: 'Expirada', className: 'bg-border text-muted' },
  EXPIRED_IN_MATCH: { label: 'Expirada', className: 'bg-border text-muted' },
  REJECTED: { label: 'Rechazada', className: 'bg-down/15 text-down' },
}

export default async function OrdenesPage() {
  if (!hasBinanceKeys())
    return (
      <Shell>
        <SetupBinanceCard />
      </Shell>
    )

  // Antes de mostrar, sincronizamos con Binance (lo mismo que hace la tarea de cada minuto)
  await syncOrders()
  const error = getMeta('orders_last_error')
  const open = listOrders({ open: true })
  const history = listOrders({ open: false, limit: 30 })

  return (
    <Shell>
      {error && <p className="mt-6 rounded-xl bg-down/15 p-4 text-down">{error}</p>}

      <h2 className="mt-6 font-semibold">Programadas ({open.length})</h2>
      {open.length ? (
        <ul className="mt-2 space-y-2">{open.map((o) => <OrderCard key={`${o.symbol}${o.order_id}`} o={o} />)}</ul>
      ) : (
        <p className="mt-2 text-muted">No tienes órdenes abiertas.</p>
      )}

      <h2 className="mt-8 font-semibold">Historial</h2>
      <p className="text-sm text-muted">Las órdenes que la app vio terminar (ejecutadas, canceladas o expiradas).</p>
      {history.length ? (
        <ul className="mt-2 space-y-2">{history.map((o) => <OrderCard key={`${o.symbol}${o.order_id}`} o={o} />)}</ul>
      ) : (
        <p className="mt-2 text-muted">Todavía no hay historial.</p>
      )}
    </Shell>
  )
}

function OrderCard({ o }: { o: OrderRow }) {
  const [base, quote] = splitSymbol(o.symbol)
  const status = STATUS[o.status] ?? { label: o.status, className: 'bg-border text-muted' }
  const filled = o.orig_qty ? (o.executed_qty / o.orig_qty) * 100 : 0
  const avg = o.executed_qty ? o.quote_qty / o.executed_qty : o.price

  return (
    <li className="rounded-2xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={clsx('rounded-md px-2 py-0.5 text-sm font-semibold', o.side === 'BUY' ? 'bg-up/15 text-up' : 'bg-down/15 text-down')}>
            {o.side === 'BUY' ? 'Compra' : 'Venta'}
          </span>
          <span className="font-semibold">{base}/{quote}</span>
        </div>
        <span className={clsx('rounded-md px-2 py-0.5 text-xs font-medium', status.className)}>{status.label}</span>
      </div>
      <dl className="tabular mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Precio</dt>
        <dd className="text-right">{px(o.status === 'FILLED' ? avg : o.price)} {quote}</dd>
        {o.stop_price > 0 && (
          <>
            <dt className="text-muted">Se activa en</dt>
            <dd className="text-right">{px(o.stop_price)} {quote}</dd>
          </>
        )}
        <dt className="text-muted">Cantidad</dt>
        <dd className="text-right">{num(o.orig_qty)} {base}</dd>
        <dt className="text-muted">Total</dt>
        <dd className="text-right">≈ {(o.orig_qty * (o.status === 'FILLED' ? avg : o.price)).toLocaleString('en-US', { maximumFractionDigits: 2 })} {quote}</dd>
        {o.status === 'PARTIALLY_FILLED' && (
          <>
            <dt className="text-muted">Ejecutado</dt>
            <dd className="text-right">{filled.toFixed(0)}%</dd>
          </>
        )}
      </dl>
      <p className="mt-2 text-xs text-muted">
        {TYPE_LABEL[o.type] ?? o.type} · creada {when(o.created_at)}
        {o.updated_at !== o.created_at && ` · actualizada ${when(o.updated_at)}`}
      </p>
    </li>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="safe-top mx-auto w-full max-w-2xl px-4 py-6">
      <PageHeader title="Órdenes" subtitle="Tus compras y ventas programadas en Binance" refresh />
      {children}
    </main>
  )
}
