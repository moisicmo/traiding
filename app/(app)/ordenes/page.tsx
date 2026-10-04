import clsx from 'clsx'
import { getPrices, hasBinanceKeys } from '@/lib/binance-account'
import { getMeta } from '@/lib/db'
import { listOrders, splitSymbol, syncOrders, TYPE_LABEL, type OrderRow } from '@/lib/orders'
import { computeResults, syncTrades, type ClosedOp, type OpenPosition, type Results } from '@/lib/trades'
import { PageHeader } from '@/components/page-header'
import { SetupBinanceCard } from '@/components/setup-binance-card'
import { PnlChart } from '@/components/pnl-chart'
import { MonthlyPnl, type Month } from '@/components/monthly-pnl'

export const metadata = { title: 'Órdenes · Trading' }

const TZ = 'America/La_Paz'
const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 })
const px = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 10 ? 2 : n >= 1 ? 4 : 8 })
const money = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pctText = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`
const tone = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted')
const when = (ms: number) => new Date(ms).toLocaleString('es-BO', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const date = (ms: number) => new Date(ms).toLocaleDateString('es-BO', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' })

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
  await syncTrades()
  const error = getMeta('orders_last_error') || getMeta('trades_last_error')
  const open = listOrders({ open: true })
  const history = listOrders({ open: false, limit: 30 })
  const results = computeResults(await getPrices())
  const months = monthly(results.ops)

  return (
    <Shell>
      {error && <p className="mt-6 rounded-xl bg-down/15 p-4 text-down">{error}</p>}

      <Kpis r={results} openCount={open.length} />

      {/* Gráficos: lado a lado en pantalla grande, uno debajo del otro en el celular */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Ganancia acumulada" subtitle="Cómo creció tu ganancia con cada venta" className="lg:col-span-2">
          {results.ops.length && results.since ? (
            <PnlChart points={results.ops.map((o) => ({ time: o.time, pnl: o.pnl }))} start={results.since} />
          ) : (
            <Empty>Cuando vendas algo, aquí vas a ver cómo crece tu ganancia.</Empty>
          )}
        </Card>
        <Card title="Por mes" subtitle="Toca o pasa el mouse sobre un mes">
          {months.length ? <MonthlyPnl months={months} /> : <Empty>Todavía no hay ventas.</Empty>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={`Programadas (${open.length})`} subtitle="Esperando a que el precio llegue">
          {open.length ? (
            <ul className="space-y-2">{open.map((o) => <OrderCard key={`${o.symbol}${o.order_id}`} o={o} />)}</ul>
          ) : (
            <Empty>No tienes órdenes abiertas.</Empty>
          )}
        </Card>
        <Card title="Comprado y sin vender" subtitle="Cuánto ganarías o perderías si vendieras ahora">
          {results.open.length ? (
            <ul className="space-y-2">{results.open.map((p) => <OpenCard key={p.symbol} p={p} />)}</ul>
          ) : (
            <Empty>No tienes nada comprado sin vender (o son restos de menos de 1 USDT).</Empty>
          )}
        </Card>
      </div>

      <Card title="Operaciones cerradas" subtitle="Cada venta comparada con lo que te costó comprar, con comisiones" className="mt-4">
        {results.ops.length ? <ClosedTable ops={results.ops} /> : <Empty>Todavía no vendiste nada en Spot.</Empty>}
      </Card>

      <details className="group mt-4 rounded-2xl border border-border bg-panel">
        <summary className="cursor-pointer list-none p-4 font-semibold marker:hidden">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          Historial de órdenes ({history.length})
          <span className="ml-2 text-sm font-normal text-muted">ejecutadas, canceladas o expiradas</span>
        </summary>
        <div className="px-4 pb-4">
          {history.length ? (
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {history.map((o) => <OrderCard key={`${o.symbol}${o.order_id}`} o={o} />)}
            </ul>
          ) : (
            <Empty>Todavía no hay historial.</Empty>
          )}
        </div>
      </details>
    </Shell>
  )
}

/** Suma la ganancia de cada mes (hora de Bolivia), desde el primer mes con ventas hasta hoy, máximo 12 */
function monthly(ops: ClosedOp[]): Month[] {
  if (!ops.length) return []
  const key = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).slice(0, 7)
  const sums = new Map<string, { pnl: number; count: number }>()
  for (const o of ops) {
    const k = key(o.time)
    const m = sums.get(k) ?? { pnl: 0, count: 0 }
    m.pnl += o.pnl
    m.count++
    sums.set(k, m)
  }
  // Todos los meses seguidos (también los que no tuvieron ventas), terminando en el actual
  const first = [...sums.keys()].sort()[0]
  const [y0, m0] = first.split('-').map(Number)
  const [y1, m1] = key(Math.max(...ops.map((o) => o.time), new Date().getTime())).split('-').map(Number)
  const list: Month[] = []
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y++, (m = 1)) : m++) {
    const k = `${y}-${String(m).padStart(2, '0')}`
    const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-BO', { timeZone: 'UTC', month: 'short', year: '2-digit' }).replace('.', '')
    list.push({ key: k, label, ...(sums.get(k) ?? { pnl: 0, count: 0 }) })
  }
  return list.slice(-12)
}

function Kpis({ r, openCount }: { r: Results; openCount: number }) {
  const total = r.wins + r.losses
  const rate = total ? (r.wins / total) * 100 : 0
  return (
    <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Ganancia total" className="col-span-2 lg:col-span-1">
        <p className={clsx('text-4xl font-semibold tracking-tight', tone(r.total))}>
          {money(r.total)} <span className="text-base font-normal text-muted">USDT</span>
        </p>
        <p className="mt-1 text-xs text-muted">
          {r.since ? `Todas tus ventas desde el ${date(r.since)}` : 'Todavía no hay operaciones'}
          {total > 0 && ` · ${total} ${total === 1 ? 'venta' : 'ventas'}`}
        </p>
      </Tile>
      <Tile label="Últimos 30 días">
        <p className={clsx('text-2xl font-semibold', tone(r.last30))}>{money(r.last30)}</p>
        <p className="mt-1 text-xs text-muted">USDT ganados este último mes</p>
      </Tile>
      <Tile label="Aciertos">
        <p className="text-2xl font-semibold">{total ? `${Math.round(rate)}%` : '—'}</p>
        {/* Medidor: qué parte de tus ventas fueron con ganancia */}
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
          <div className="h-full rounded-full bg-up" style={{ width: `${rate}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted">{total ? `${r.wins} de ${total} ventas con ganancia` : 'Sin ventas todavía'}</p>
      </Tile>
      <Tile label="Sin vender" className="col-span-2 lg:col-span-1">
        <p className={clsx('text-2xl font-semibold', tone(r.unrealized))}>{money(r.unrealized)}</p>
        <p className="mt-1 text-xs text-muted">
          USDT si vendieras hoy lo que tienes comprado · {openCount} {openCount === 1 ? 'orden esperando' : 'órdenes esperando'}
        </p>
      </Tile>
    </section>
  )
}

function Tile({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={clsx('rounded-2xl border border-border bg-panel p-4', className)}>
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function Card({ title, subtitle, className, children }: { title: string; subtitle?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={clsx('min-w-0 rounded-2xl border border-border bg-panel p-4', className)}>
      <h2 className="font-semibold">{title}</h2>
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-bg p-4 text-sm text-muted">{children}</p>
}

/** Tabla en pantalla grande, tarjetas en el celular */
function ClosedTable({ ops }: { ops: ClosedOp[] }) {
  const list = ops.slice(0, 50)
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead className="text-left text-muted">
          <tr className="border-b border-border">
            <th className="py-2 font-normal">Fecha</th>
            <th className="py-2 font-normal">Par</th>
            <th className="py-2 text-right font-normal">Cantidad</th>
            <th className="py-2 text-right font-normal">Compraste a</th>
            <th className="py-2 text-right font-normal">Vendiste a</th>
            <th className="py-2 text-right font-normal">Resultado</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {list.map((op, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              <td className="py-2.5 text-muted">{date(op.time)}</td>
              <td className="py-2.5 font-medium">
                {op.base}/{op.quote}
                {op.partial && <span className="ml-1 text-sma20" title="Parte de lo vendido no tenía compra registrada: resultado aproximado">*</span>}
              </td>
              <td className="py-2.5 text-right">{num(op.qty)}</td>
              <td className="py-2.5 text-right">{px(op.buyAvg)}</td>
              <td className="py-2.5 text-right">{px(op.sellAvg)}</td>
              <td className={clsx('py-2.5 text-right font-semibold', tone(op.pnl))}>
                {money(op.pnl)} <span className="font-normal">({pctText(op.pnlPct)})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="space-y-2 md:hidden">
        {list.map((op, i) => (
          <li key={i} className="rounded-xl bg-bg p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">
                {op.base}/{op.quote}
                {op.partial && <span className="ml-1 text-sma20">*</span>}
              </span>
              <span className={clsx('tabular font-semibold', tone(op.pnl))}>
                {money(op.pnl)} <span className="text-sm font-normal">({pctText(op.pnlPct)})</span>
              </span>
            </div>
            <p className="tabular mt-1 text-sm">
              Compraste a <b>{px(op.buyAvg)}</b> → vendiste a <b>{px(op.sellAvg)}</b>
            </p>
            <p className="tabular mt-0.5 text-xs text-muted">
              {num(op.qty)} {op.base} · {date(op.time)}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-muted">
        Precios con comisión incluida. Solo cuenta Spot contra dólares (USDT, USDC); lo que recibiste por P2P, depósitos o Convert no
        tiene precio de compra conocido{ops.some((o) => o.partial) && ' (marcado con *: resultado aproximado)'}.
      </p>
    </>
  )
}

function OpenCard({ p }: { p: OpenPosition }) {
  return (
    <li className="rounded-xl bg-bg p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{p.base}/{p.quote}</span>
        {p.pnl !== null && p.pnlPct !== null && (
          <span className={clsx('tabular font-semibold', tone(p.pnl))}>
            {money(p.pnl)} <span className="text-sm font-normal">({pctText(p.pnlPct)})</span>
          </span>
        )}
      </div>
      <p className="tabular mt-1 text-sm">
        {num(p.qty)} {p.base} · compraste a <b>{px(p.avgCost)}</b>
        {p.price !== null && <> · hoy <b>{px(p.price)}</b></>}
      </p>
    </li>
  )
}

function OrderCard({ o }: { o: OrderRow }) {
  const [base, quote] = splitSymbol(o.symbol)
  const status = STATUS[o.status] ?? { label: o.status, className: 'bg-border text-muted' }
  const filled = o.orig_qty ? (o.executed_qty / o.orig_qty) * 100 : 0
  const avg = o.executed_qty ? o.quote_qty / o.executed_qty : o.price

  return (
    <li className="rounded-xl bg-bg p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={clsx('rounded-md px-2 py-0.5 text-sm font-semibold', o.side === 'BUY' ? 'bg-up/15 text-up' : 'bg-down/15 text-down')}>
            {o.side === 'BUY' ? 'Compra' : 'Venta'}
          </span>
          <span className="font-semibold">{base}/{quote}</span>
        </div>
        <span className={clsx('rounded-md px-2 py-0.5 text-xs font-medium', status.className)}>{status.label}</span>
      </div>
      <dl className="tabular mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
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
      <p className="mt-1.5 text-xs text-muted">
        {TYPE_LABEL[o.type] ?? o.type} · creada {when(o.created_at)}
        {o.updated_at !== o.created_at && ` · actualizada ${when(o.updated_at)}`}
      </p>
    </li>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="safe-top mx-auto w-full max-w-screen-2xl px-4 py-6 md:px-6">
      <PageHeader title="Órdenes y resultados" subtitle="Tus compras, ventas y cuánto vas ganando en Binance" refresh />
      {children}
    </main>
  )
}
