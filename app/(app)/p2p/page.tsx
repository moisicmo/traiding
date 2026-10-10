import Link from 'next/link'
import clsx from 'clsx'
import { listAlerts, listSnapshots, P2P_AMOUNT, takeSnapshot, type Ad, type Snapshot } from '@/lib/p2p'
import { PageHeader } from '@/components/page-header'
import { P2PChart } from '@/components/p2p-chart'
import { buildCandles, P2P_INTERVALS, type P2PInterval, type P2PSide } from '@/lib/p2p-candles'
import { P2PAlerts } from '@/components/p2p-alerts'
import { advise, listP2POrders, p2pSummary, recentSignal, type Advice, type P2POrder, type P2PSummary } from '@/lib/p2p-advisor'
import { hasBinanceKeys } from '@/lib/binance-account'

export const metadata = { title: 'P2P · Trading' }

const WEEK = 7 * 86_400_000
const SIDES: Record<P2PSide, string> = { sell: 'Vender', buy: 'Comprar' }

const bs = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
const laPazHour = (ms: number) => Number(new Date(ms).toLocaleString('en-US', { timeZone: 'America/La_Paz', hour: 'numeric', hour12: false })) % 24

export default async function P2PPage({ searchParams }: { searchParams: Promise<{ i?: string; s?: string }> }) {
  const params = await searchParams
  const interval: P2PInterval = params.i && params.i in P2P_INTERVALS ? (params.i as P2PInterval) : '1h'
  const side: P2PSide = params.s === 'buy' ? 'buy' : 'sell'
  const href = (next: { i?: P2PInterval; s?: P2PSide }) => `/p2p?i=${next.i ?? interval}&s=${next.s ?? side}`

  let live: Awaited<ReturnType<typeof takeSnapshot>> | null = null
  let error: string | null = null
  try {
    live = await takeSnapshot()
  } catch (e) {
    error = (e as Error).message
  }

  const history = listSnapshots(P2P_INTERVALS[interval].history)
  const candles = buildCandles(history, interval, side)
  const week = listSnapshots(WEEK)
  const alerts = listAlerts()
  const s = live?.snapshot
  const spread = s ? s.buy_best - s.sell_best : 0
  // Tu historial P2P y el consejo (con el precio de este momento)
  const orders = hasBinanceKeys() ? listP2POrders() : []
  const summary = orders.length ? p2pSummary(orders) : null
  const advice = advise(s ? [...week, s] : week, summary)
  const signal = recentSignal()

  return (
    <main className="safe-top mx-auto w-full max-w-2xl px-4 py-6">
      <PageHeader title="P2P USDT ↔ Bs" subtitle={`Binance P2P · precios para ${bs(P2P_AMOUNT)} Bs`} refresh />

      {error && <p className="mt-6 rounded-xl bg-down/15 p-4 text-down">{error}</p>}

      {advice && <AdviceCard advice={advice} signal={signal} />}

      {s && (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3">
            <PriceCard title="Comprar USDT" hint="lo que pagas" best={s.buy_best} avg={s.buy_avg} color="text-sma50" />
            <PriceCard title="Vender USDT" hint="lo que te pagan" best={s.sell_best} avg={s.sell_avg} color="text-up" />
          </section>

          <section className="mt-3 rounded-2xl border border-border bg-panel p-4 text-[15px] leading-relaxed">
            <p>
              Diferencia: <b className="tabular">{bs(spread)} Bs</b> por USDT{' '}
              <span className="text-muted">({((spread / s.sell_best) * 100).toFixed(2)}%)</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {spread <= 0.01
                ? 'Casi no hay diferencia: comprar y vender al mismo tiempo no deja ganancia ahora.'
                : `Si compras y vendes a los precios de los anuncios, pierdes ${bs(spread)} Bs por USDT.`}{' '}
              El librecambista gana publicando sus propios anuncios: compra más barato y vende más caro que estos precios. Fíjate
              abajo en qué horarios se separan más las líneas.
            </p>
          </section>
        </>
      )}

      <h2 className="mt-8 font-semibold">Precio del USDT en Bs</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Toggle options={(Object.keys(SIDES) as P2PSide[]).map((k) => ({ key: k, label: SIDES[k], href: href({ s: k }) }))} active={side} />
        <Toggle options={(Object.keys(P2P_INTERVALS) as P2PInterval[]).map((k) => ({ key: k, label: P2P_INTERVALS[k].label, href: href({ i: k }) }))} active={interval} />
      </div>
      {candles.length >= 2 ? (
        <>
          <div className="mt-3 overflow-hidden rounded-2xl border border-border">
            <P2PChart candles={candles} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Cada vela = {P2P_INTERVALS[interval].label} · hora de Bolivia · precio de {SIDES[side].toLowerCase()} USDT.
            {candles.length < 20 && ` La línea amarilla aparece con 20 velas (hay ${candles.length}).`}
            {candles.length >= 20 && candles.length < 50 && ` La línea azul aparece con 50 velas (hay ${candles.length}).`}
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-2xl border border-border bg-panel p-4 text-muted">
          Binance P2P no guarda historial, así que la app junta el precio cada 5 minutos desde que está prendida en el NAS. Todavía no
          hay suficientes datos para velas de {P2P_INTERVALS[interval].label}: prueba con 15m o vuelve en un rato.
        </p>
      )}

      <h2 className="mt-8 font-semibold">¿A qué hora se abre más la diferencia?</h2>
      <HourlySpread rows={week} />

      {summary && <MyP2P summary={summary} orders={orders} />}

      <h2 className="mt-8 font-semibold">Alertas</h2>
      {s && <P2PAlerts alerts={alerts} suggestion={{ buy: s.buy_best, sell: s.sell_best }} />}

      {live && (
        <>
          <h2 className="mt-8 font-semibold">Mejores anuncios ahora</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <AdList title="Para comprar USDT" ads={live.buyAds} />
            <AdList title="Para vender USDT" ads={live.sellAds} />
          </div>
        </>
      )}
    </main>
  )
}

const ACTION = {
  buy: { icon: '🟢', box: 'border-up/50 bg-up/10', text: 'text-up', word: '¡COMPRA!' },
  sell: { icon: '🔴', box: 'border-down/50 bg-down/10', text: 'text-down', word: '¡VENDE!' },
  wait: { icon: '⏸️', box: 'border-border bg-panel', text: 'text-muted', word: 'Espera' },
} as const

const usdt = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ago = (h: number) => (h < 1 ? `hace ${Math.max(1, Math.round(h * 60))} min` : `hace ${Math.round(h)} h`)

/** 🧭 El consejo de ahora + si el último aviso todavía vale (por si no pudiste actuar en ese momento) */
function AdviceCard({ advice, signal }: { advice: Advice; signal: ReturnType<typeof recentSignal> }) {
  const a = ACTION[advice.action]
  const nowPrice = signal ? (signal.action === 'buy' ? advice.buy : advice.sell) : 0
  return (
    <section className={clsx('mt-6 rounded-2xl border p-4', a.box)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">🧭 Consejero P2P · ahora</p>
      <p className={clsx('mt-1 text-2xl font-bold', a.text)}>
        {a.icon} {advice.title}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-relaxed">
        {advice.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {signal && (
        <p className="mt-3 rounded-xl bg-bg/60 p-3 text-sm">
          Te avisé <b>{ACTION[signal.action].word}</b> {ago(signal.hours)} a <b className="tabular">{bs(signal.price)} Bs</b>. Ahora{' '}
          {signal.action === 'buy' ? 'cuesta' : 'pagan'} <b className="tabular">{bs(nowPrice)} Bs</b>:{' '}
          {signal.action === advice.action ? (
            <b className={a.text}>todavía es buen momento ✅</b>
          ) : (
            <b>ese momento ya pasó, ahora conviene {advice.action === 'wait' ? 'esperar' : ACTION[advice.action].word.toLowerCase()}</b>
          )}
        </p>
      )}
      <p className="mt-2 text-xs text-muted">Solo es un consejo con reglas simples (compara con la última semana). Tú decides y operas en Binance.</p>
    </section>
  )
}

/** Tus compras y ventas P2P (leídas de Binance con tu llave de solo lectura) */
function MyP2P({ summary, orders }: { summary: P2PSummary; orders: P2POrder[] }) {
  return (
    <>
      <h2 className="mt-8 font-semibold">Tus compras y ventas P2P</h2>
      <section className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="USDT de P2P sin vender" value={usdt(summary.held)} />
        <Stat label="Te costaron (promedio)" value={summary.avgCost ? `${bs(summary.avgCost)} Bs` : '—'} />
        <Stat
          label="Ganado al vender"
          value={`${summary.realized >= 0 ? '+' : '−'}${bs(Math.abs(summary.realized))} Bs`}
          className={summary.realized > 0 ? 'text-up' : summary.realized < 0 ? 'text-down' : undefined}
        />
      </section>
      <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-panel px-4">
        {orders.slice(0, 15).map((o) => (
          <li key={o.order_number} className={clsx('flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5 text-sm', o.status !== 'COMPLETED' && 'opacity-50')}>
            <span className={clsx('rounded px-2 py-0.5 text-xs font-semibold', o.trade_type === 'BUY' ? 'bg-up/15 text-up' : 'bg-down/15 text-down')}>
              {o.trade_type === 'BUY' ? 'Compra' : 'Venta'}
            </span>
            <span className="tabular font-semibold">{usdt(o.amount)} USDT</span>
            <span className="tabular text-muted">
              a {bs(o.unit_price)} = {bs(o.total)} Bs
            </span>
            <span className="w-full text-xs text-muted sm:ml-auto sm:w-auto">
              {new Date(o.created).toLocaleString('es-BO', { timeZone: 'America/La_Paz', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {o.status !== 'COMPLETED' && ` · ${o.status === 'CANCELLED' ? 'cancelada' : o.status.toLowerCase()}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        «Sin vender» son los USDT que compraste en P2P y no vendiste en P2P (aunque después los hayas usado en otra cosa).
      </p>
    </>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={clsx('tabular mt-1 text-lg font-semibold', className)}>{value}</p>
    </div>
  )
}

function PriceCard({ title, hint, best, avg, color }: { title: string; hint: string; best: number; avg: number; color: string }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <p className="text-sm text-muted">{title}</p>
      <p className={clsx('tabular mt-1 text-2xl font-semibold', color)}>
        {bs(best)} <span className="text-sm font-normal text-muted">Bs</span>
      </p>
      <p className="mt-1 text-xs text-muted">
        {hint} · promedio top 5: <span className="tabular">{bs(avg)}</span>
      </p>
    </div>
  )
}

// Promedio de la diferencia (comprar − vender) por hora del día, hora de Bolivia, últimos 7 días
function HourlySpread({ rows }: { rows: Snapshot[] }) {
  const sums = Array.from({ length: 24 }, () => ({ total: 0, n: 0 }))
  for (const r of rows) {
    const h = laPazHour(r.ts)
    sums[h].total += r.buy_avg - r.sell_avg
    sums[h].n++
  }
  const hours = sums.map((x, h) => ({ h, spread: x.n ? x.total / x.n : null }))
  const withData = hours.filter((x) => x.spread !== null)
  if (withData.length < 6)
    return <p className="mt-3 rounded-2xl border border-border bg-panel p-4 text-muted">Se necesita al menos un día de datos para ver esto.</p>

  const max = Math.max(...withData.map((x) => x.spread!))
  const min = Math.min(...withData.map((x) => x.spread!))
  const top = [...withData].sort((a, b) => b.spread! - a.spread!).slice(0, 3)

  return (
    <div className="mt-3 rounded-2xl border border-border bg-panel p-4">
      <div className="flex h-28 items-end gap-0.5">
        {hours.map(({ h, spread }) => (
          <div key={h} className="flex h-full flex-1 flex-col justify-end" title={spread === null ? `${h}:00 sin datos` : `${h}:00 → ${bs(spread)} Bs`}>
            <div
              className={clsx('w-full rounded-t', spread === null ? 'bg-border' : top.some((t) => t.h === h) ? 'bg-sma20' : 'bg-sma50/60')}
              style={{ height: spread === null ? 2 : `${8 + ((spread - min) / (max - min || 1)) * 92}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
      <p className="mt-3 text-sm">
        Más diferencia (en amarillo): {top.map((t) => <b key={t.h} className="tabular">{t.h}:00 ({bs(t.spread!)} Bs) </b>)}
      </p>
      <p className="mt-1 text-xs text-muted">Promedio de los últimos 7 días, hora de Bolivia.</p>
    </div>
  )
}

function AdList({ title, ads }: { title: string; ads: Ad[] }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-panel p-4">
      <p className="text-sm text-muted">{title}</p>
      <ul className="mt-2 divide-y divide-border">
        {ads.slice(0, 5).map((a, i) => (
          <li key={i} className="py-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="truncate">
                {a.name} {a.merchant && <span className="text-xs text-sma20">✓</span>}
              </span>
              <b className="tabular">{bs(a.price)}</b>
            </div>
            <p className="truncate text-xs text-muted">
              {bs(a.min)}–{bs(a.max)} Bs · {a.banks.slice(0, 3).join(', ')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Toggle<T extends string>({ options, active }: { options: { key: T; label: string; href: string }[]; active: T }) {
  return (
    <div className="flex rounded-lg border border-border bg-panel p-0.5 text-sm">
      {options.map((o) => (
        <Link
          key={o.key}
          href={o.href}
          replace
          scroll={false}
          className={clsx('rounded-md px-3 py-1 font-medium', o.key === active ? 'bg-border text-text' : 'text-muted')}
        >
          {o.label}
        </Link>
      ))}
    </div>
  )
}
