import Link from 'next/link'
import clsx from 'clsx'
import { listAlerts, listSnapshots, P2P_AMOUNT, takeSnapshot, type Ad, type Snapshot } from '@/lib/p2p'
import { PageHeader } from '@/components/page-header'
import { P2PChart } from '@/components/p2p-chart'
import { P2PAlerts } from '@/components/p2p-alerts'

export const metadata = { title: 'P2P · Trading' }

const HOUR = 3600_000
const RANGES = { '24h': { label: '24 horas', ms: 24 * HOUR }, '7d': { label: '7 días', ms: 7 * 24 * HOUR } } as const
type Range = keyof typeof RANGES

const bs = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
const laPazHour = (ms: number) => Number(new Date(ms).toLocaleString('en-US', { timeZone: 'America/La_Paz', hour: 'numeric', hour12: false })) % 24

export default async function P2PPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams
  const range: Range = r === '7d' ? '7d' : '24h'

  let live: Awaited<ReturnType<typeof takeSnapshot>> | null = null
  let error: string | null = null
  try {
    live = await takeSnapshot()
  } catch (e) {
    error = (e as Error).message
  }

  const history = listSnapshots(RANGES[range].ms)
  const week = range === '7d' ? history : listSnapshots(RANGES['7d'].ms)
  const alerts = listAlerts()
  const s = live?.snapshot
  const spread = s ? s.buy_best - s.sell_best : 0

  return (
    <main className="safe-top mx-auto w-full max-w-2xl px-4 py-6">
      <PageHeader title="P2P USDT ↔ Bs" subtitle={`Binance P2P · precios para ${bs(P2P_AMOUNT)} Bs`} refresh />

      {error && <p className="mt-6 rounded-xl bg-down/15 p-4 text-down">{error}</p>}

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

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-semibold">Cómo se movió</h2>
        <div className="flex rounded-lg border border-border bg-panel p-0.5 text-sm">
          {(Object.keys(RANGES) as Range[]).map((key) => (
            <Link
              key={key}
              href={`/p2p?r=${key}`}
              replace
              scroll={false}
              className={clsx('rounded-md px-3 py-1 font-medium', key === range ? 'bg-border text-text' : 'text-muted')}
            >
              {RANGES[key].label}
            </Link>
          ))}
        </div>
      </div>
      {history.length >= 2 ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-border">
          <P2PChart points={history.map((h) => ({ ts: h.ts, buy: h.buy_best, sell: h.sell_best }))} />
        </div>
      ) : (
        <p className="mt-3 rounded-2xl border border-border bg-panel p-4 text-muted">
          La app guarda el precio cada 5 minutos desde que está prendida en el NAS. En un rato vas a ver aquí el gráfico.
        </p>
      )}

      <h2 className="mt-8 font-semibold">¿A qué hora se abre más la diferencia?</h2>
      <HourlySpread rows={week} />

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
