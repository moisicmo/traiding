import clsx from 'clsx'
import { getPrices } from '@/lib/binance-account'
import { fmt } from '@/lib/binance'
import { getMeta } from '@/lib/db'
import { COLORS } from '@/lib/colors'
import {
  boliviaDay,
  COMPETITOR_KEYS,
  COMPETITORS,
  daysRunning,
  getCapital,
  getCash,
  getJob,
  getSizing,
  maxOpen,
  getLiveSince,
  getStartedAt,
  hadOldBot,
  HOLD,
  holdValue,
  isRunning,
  listEquity,
  listPositions,
  listTrades,
  portfolioValue,
  learn2Leader,
  learn2Log,
  learnState,
  REASONS,
  tradeCounts,
  SLOTS,
  type Competitor,
} from '@/lib/paper-bot'
import { PageHeader } from '@/components/page-header'
import { BotTabs } from '@/components/bot-tabs'
import { CoinIcon } from '@/components/coin-icon'
import { EquityCompare } from '@/components/equity-compare'
import { pause, panic, resume, start } from './actions'
import { JobProgress } from '@/components/job-progress'
import { metrics } from '@/lib/podium'
import { SubmitButton } from '@/components/submit-button'
import { SizingFields } from '@/components/sizing-fields'

export const metadata = { title: 'Bot en vivo · Trading' }

const TZ = 'America/La_Paz'
const money = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`
const pctText = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`
const tone = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted')
const when = (ms: number) => new Date(ms).toLocaleString('es-BO', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const coin = (symbol: string) => symbol.replace('USDT', '')

// Un color por competidor (líneas del gráfico y marquitas); "no tocar" en gris
const COLOR: Record<Competitor | 'hold', string> = {
  learn: '#ffffff',
  learn2: '#e879f9',
  trendplus: '#7c83ff',
  trend: COLORS.sma50,
  poc: '#b98bff',
  fib: '#ff9f43',
  smc: '#ff6fae',
  rsi: '#2ec4b6',
  boll: '#ffd23f',
  turtle: '#8bd450',
  hybrid: '#d4ff3a',
  half: '#ff8a65',
  golden: '#c49a6c',
  rebal: '#5ad1ff',
  hold: COLORS.muted,
}
const NAME = (k: Competitor | 'hold') => (k === 'hold' ? `${HOLD.emoji} ${HOLD.label}` : `${COMPETITORS[k].emoji} ${COMPETITORS[k].label}`)

export default async function VivoPage({ searchParams }: { searchParams: Promise<{ top?: string }> }) {
  const top = (await searchParams).top === '5' ? 5 : 3
  const job = getJob()
  // Mientras se prepara la competencia, solo la barra de progreso (el resto se está borrando y rearmando)
  if (job?.status === 'running')
    return (
      <Shell>
        <JobProgress initial={job} />
      </Shell>
    )
  const started = getStartedAt()

  if (!started)
    return (
      <Shell>
        <section className="mt-4 rounded-2xl border border-border bg-panel p-5">
          <h2 className="text-lg font-semibold">🏁 Competencia de técnicas con dinero de mentira</h2>
          {job?.status === 'error' && (
            <p className="mt-2 rounded-lg bg-down/15 p-3 text-sm text-down">No se pudo preparar la competencia: {job.message}. Intenta de nuevo.</p>
          )}
          {hadOldBot() && (
            <p className="mt-2 rounded-lg bg-sma20/10 p-3 text-sm text-sma20">
              Nueva versión: ahora compiten varias técnicas a la vez. Para que la carrera sea justa, todas empiezan juntas desde cero (el bot anterior de
              solo tendencia se apaga).
            </p>
          )}
          <p className="mt-2 text-sm text-muted">
            Corre en tu NAS las 24 horas con <b className="text-text">precios reales</b>, pero con dinero ficticio: nunca toca tu cuenta de Binance. Cada
            competidor tiene su propia cartera con el mismo capital, en las monedas del filtro de seguridad, con máximo {SLOTS} operaciones a la vez:
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {[...COMPETITOR_KEYS, 'hold' as const].map((k) => (
              <li key={k} className="rounded-xl bg-bg p-3 text-sm">
                <b>{NAME(k)}</b>
                <p className="mt-0.5 text-muted">{k === 'hold' ? HOLD.how : COMPETITORS[k].how}</p>
              </li>
            ))}
          </ul>
          <form action={start} className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
            <label className="block text-sm text-muted sm:w-56">
              Capital de cada uno (USDT)
              <input name="capital" inputMode="decimal" defaultValue={200} className="input tabular mt-1" />
            </label>
            <FromDate />
            <SizingFields initial={getSizing()} />
            <SubmitButton pending="Empezando…" className="rounded-lg bg-up px-6 py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-60">
              🏁 Empezar la competencia
            </SubmitButton>
          </form>
        </section>
      </Shell>
    )

  const prices = await getPrices()
  const running = isRunning()
  const capital = getCapital()
  const sizing = getSizing()
  const sizingText =
    sizing.mode === 'fixed' ? `${sizing.amount} USDT por compra` : sizing.mode === 'risk' ? `cada compra arriesga ${sizing.risk}% de la cartera` : `1/4 de la cartera por compra (máx. ${maxOpen(sizing)})`
  // El rebalanceo, Aprende v2 y Mitad y mitad son copias de una cartera entera: se resumen en la tabla, no operación por operación
  const positions = listPositions().filter((p) => p.strategy !== 'rebal' && p.strategy !== 'learn2' && p.strategy !== 'half')
  const trades = listTrades()
  const counts = tradeCounts()
  const learn = learnState()
  const leader = learn2Leader()
  const leaderLog = learn2Log()
  const equity = listEquity()
  const days = daysRunning(started)
  const liveSince = getLiveSince()
  const simulated = liveSince !== null && liveSince - started > 86_400_000 // empezó con simulación del pasado
  const lastRun = Number(getMeta('arena_last_run')) || null
  const error = getMeta('arena_last_error')

  // Tabla de posiciones
  const board = [
    ...COMPETITOR_KEYS.map((k) => {
      const c = counts.get(k) ?? { closed: 0, wins: 0 }
      return {
        key: k as Competitor | 'hold',
        value: portfolioValue(k, prices),
        closed: c.closed,
        wins: c.wins,
        open: listPositions(k).length,
        cash: getCash(k),
      }
    }),
    { key: 'hold' as const, value: holdValue(prices), closed: null, wins: null, open: null, cash: null },
  ].sort((a, b) => b.value - a.value)

  return (
    <Shell>
      <section
        className={clsx('mt-4 flex flex-wrap items-center gap-3 rounded-2xl border p-4', running ? 'border-up/40 bg-up/10' : 'border-sma20/40 bg-sma20/10')}
      >
        <p className={clsx('font-semibold', running ? 'text-up' : 'text-sma20')}>{running ? '🟢 Compitiendo' : '⏸️ En pausa'}</p>
        <p className="text-sm text-muted">
          desde el {when(started)} ({Math.floor(days)} {Math.floor(days) === 1 ? 'día' : 'días'})
          {simulated && liveSince && <> · simulado hasta el {when(liveSince)}, en vivo desde ahí</>} · {capital} USDT ficticios cada uno · {sizingText} · última revisión{' '}
          {lastRun ? when(lastRun) : '—'}
        </p>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <form action={running ? pause : resume} className="flex-1 sm:flex-none">
            <button className="w-full rounded-lg border border-border bg-panel px-4 py-2 text-sm font-semibold">{running ? '⏸️ Pausar' : '▶️ Seguir'}</button>
          </form>
          {positions.length > 0 && (
            <form action={panic} className="flex-1 sm:flex-none">
              <button className="w-full rounded-lg border border-down/50 bg-down/10 px-4 py-2 text-sm font-semibold text-down">🛑 Vender todo</button>
            </form>
          )}
        </div>
        {error && <p className="w-full text-sm text-down">Último error: {error}</p>}
        {job?.status === 'error' && <p className="w-full text-sm text-down">No se pudo preparar la competencia: {job.message}. Intenta de nuevo.</p>}
      </section>

      <Card title="🏆 Tabla de posiciones" subtitle="Quién va ganando ahora (el valor incluye lo que tiene comprado, al precio de este momento)" className="mt-4">
        <ol className="space-y-2">
          {board.map((r, i) => {
            const gain = r.value - capital
            return (
              <li key={r.key} className={clsx('flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-bg p-3', i === 0 && 'ring-1 ring-sma20/50')}>
                <span className="w-6 text-center text-lg">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                <span className="inline-block size-3 shrink-0 rounded-full" style={{ background: COLOR[r.key] }} />
                <span className="min-w-36 flex-1 font-semibold">{NAME(r.key)}</span>
                <span className="tabular w-24 text-right font-semibold">{r.value.toFixed(2)}</span>
                <span className={clsx('tabular w-36 text-right text-sm', tone(gain))}>
                  {money(gain)} ({pctText((gain / capital) * 100)})
                </span>
                <span className="w-full text-xs text-muted sm:w-56 sm:text-right">
                  {r.closed === null
                    ? 'compró todo el primer día'
                    : r.key === 'rebal'
                      ? `${r.cash!.toFixed(0)} en USDT · resto en ${r.open} monedas · se reacomoda cada semana`
                      : r.key === 'half'
                        ? `copia mitad 🐢 Tortugas y mitad 📈 Tendencia · ${r.open} monedas · ${r.cash!.toFixed(0)} libres`
                      : r.key === 'learn2'
                        ? `${leader ? `copia a ${COMPETITORS[leader].emoji} ${COMPETITORS[leader].label}` : 'no copia a nadie'} · ${r.open} monedas · ${r.cash!.toFixed(0)} libres`
                      : `${r.closed} cerradas · ${r.wins} ganadas · ${r.open}${sizing.mode === 'auto' ? `/${SLOTS}` : ''} abiertas · ${r.cash!.toFixed(0)} libres`}
                </span>
              </li>
            )
          })}
        </ol>
      </Card>

      <Card title="🧠 A quién copian los que aprenden" className="mt-4">
        <p className="text-sm">
          <b>🪞 Aprende v2</b> (copia la cartera completa del mejor de los últimos 30 días):{' '}
          {leader ? <Badge k={leader} /> : <span className="text-muted">nadie, está en USDT</span>}
        </p>
        {leaderLog.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-muted">Sus cambios de líder ({leaderLog.length})</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {leaderLog.map((l) => (
                <li key={l.ts} className="flex flex-wrap items-center gap-1">
                  <span className="w-28 text-muted">{when(l.ts)}</span>
                  {l.leader ? <Badge k={l.leader} /> : <span className="text-muted">a nadie</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
        <hr className="my-3 border-border" />
        <p className="text-sm font-semibold">🧠 Aprende (copia las compras nuevas de los 3 mejores de los últimos 14 días)</p>
        <p className="text-sm">
          Ahora copia a:{' '}
          {learn.follow.length ? (
            learn.follow.map((k, i) => (
              <span key={k}>
                {i > 0 && ' · '}
                <Badge k={k} />
              </span>
            ))
          ) : (
            <span className="text-muted">nadie (ningún competidor gana en los últimos 14 días, así que espera en USDT)</span>
          )}
        </p>
        {learn.log.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-muted">Sus cambios de opinión ({learn.log.length})</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {learn.log.map((l) => (
                <li key={l.ts} className="flex flex-wrap items-center gap-1">
                  <span className="w-28 text-muted">{when(l.ts)}</span>
                  {l.follow.length ? l.follow.map((k) => <Badge key={k} k={k} />) : <span className="text-muted">a nadie</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {equity.length >= 2 && <Podium equity={equity} capital={capital} counts={counts} top={top} />}

      {equity.length >= 2 && (
        <Card
          title="La carrera"
          subtitle={
            simulated && liveSince
              ? `Cuánto vale cada cartera · hasta el ${when(liveSince)} es simulación con datos reales del pasado, después es en vivo`
              : 'Cuánto vale cada cartera, hora por hora'
          }
          className="mt-4"
        >
          <EquityCompare
            curves={[
              ...[...COMPETITOR_KEYS, 'hold' as const].map((k) => ({
                label: NAME(k),
                color: COLOR[k],
                points: equity.filter((e) => e.strategy === k).map((e) => ({ time: e.ts, value: e.value })),
              })),
              {
                label: 'Capital inicial',
                color: COLORS.text,
                points: equity.filter((e) => e.strategy === 'hold').map((e) => ({ time: e.ts, value: capital })),
                dashed: true,
              },
            ]}
          />
        </Card>
      )}

      <Card title={`Comprado ahora (${positions.length})`} subtitle="Cada uno vende según sus propias reglas" className="mt-4">
        {positions.length ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {positions.map((p) => {
              const price = prices.get(p.symbol) ?? p.entry
              const pnl = p.qty * price * 0.999 - p.size
              return (
                <li key={`${p.strategy}${p.symbol}`} className="flex items-center gap-3 rounded-xl bg-bg p-3">
                  <CoinIcon base={coin(p.symbol)} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {coin(p.symbol)}/USDT <Badge k={p.strategy} />
                    </p>
                    <p className="tabular text-xs text-muted">
                      compró a {fmt(p.entry)} · hoy {fmt(price)}
                      {p.sl > 0 ? ` · stop ${fmt(p.sl)}` : ''}
                      {p.tp ? ` · objetivo ${fmt(p.tp)}` : ''}
                    </p>
                    {p.note && <p className="truncate text-xs text-muted">{p.note}</p>}
                  </div>
                  <p className={clsx('tabular text-right font-semibold', tone(pnl))}>
                    {money(pnl)}
                    <span className="block text-xs font-normal">{pctText((pnl / p.size) * 100)}</span>
                  </p>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-xl bg-bg p-4 text-sm text-muted">Nadie tiene nada comprado. Cada técnica espera su señal; puede tardar horas o días.</p>
        )}
      </Card>

      <Card title={`Operaciones cerradas (${[...counts.values()].reduce((s, c) => s + c.closed, 0)})`} subtitle="Las 200 más nuevas" className="mt-4">
        {trades.length ? (
          <ul className="space-y-2">
            {trades.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl bg-bg p-3 text-sm">
                <CoinIcon base={coin(t.symbol)} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {coin(t.symbol)} <Badge k={t.strategy} /> <span className="font-normal text-muted">· {REASONS[t.reason] ?? t.reason}</span>
                  </p>
                  <p className="tabular text-xs text-muted">
                    {fmt(t.entry)} → {fmt(t.exit)} · {when(t.entry_time)} → {when(t.exit_time)}
                  </p>
                </div>
                <p className={clsx('tabular text-right font-semibold', tone(t.pnl))}>
                  {money(t.pnl)}
                  <span className="block text-xs font-normal">{pctText((t.pnl / t.size) * 100)}</span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-bg p-4 text-sm text-muted">Todavía nadie cerró una operación.</p>
        )}
      </Card>

      <details className="group mt-4 rounded-2xl border border-border bg-panel">
        <summary className="cursor-pointer list-none p-4 text-sm font-medium text-muted marker:hidden">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          Reglas de cada competidor · reiniciar la competencia
        </summary>
        <div className="px-4 pb-4">
          <ul className="grid gap-2 sm:grid-cols-2">
            {[...COMPETITOR_KEYS, 'hold' as const].map((k) => (
              <li key={k} className="rounded-xl bg-bg p-3 text-sm">
                <b>{NAME(k)}</b>
                <p className="mt-0.5 text-muted">{k === 'hold' ? HOLD.how : COMPETITORS[k].how}</p>
              </li>
            ))}
          </ul>
          <form action={start} className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
            <label className="block text-sm text-muted sm:w-56">
              Capital de cada uno (USDT)
              <input name="capital" inputMode="decimal" defaultValue={capital} className="input tabular mt-1" />
            </label>
            <FromDate />
            <SizingFields initial={getSizing()} />
            <SubmitButton pending="Empezando…" className="rounded-lg border border-down/50 px-6 py-2.5 font-semibold text-down disabled:opacity-60">
              Borrar todo y empezar de nuevo
            </SubmitButton>
          </form>
        </div>
      </details>
    </Shell>
  )
}

/** Desde cuándo empieza la competencia: una fecha del pasado simula desde ahí y después sigue en vivo */
function FromDate() {
  const day = boliviaDay
  return (
    <label className="block text-sm text-muted sm:w-64">
      Empezar desde (fecha)
      <input type="date" name="from" defaultValue={day(-91)} min={day(-365)} max={day(0)} className="input mt-1" />
      <span className="mt-1 block text-xs">Simula desde esa fecha y sigue en vivo. Hoy = solo en vivo. Máximo 1 año.</span>
    </label>
  )
}

/** 🏆 Podio: los N mejores, solos en un gráfico, con las métricas para elegir */
function Podium({
  equity,
  capital,
  counts,
  top,
}: {
  equity: { ts: number; strategy: string; value: number }[]
  capital: number
  counts: Map<string, { closed: number; wins: number }>
  top: number
}) {
  const keys = [...COMPETITOR_KEYS, 'hold' as const]
  const rows = keys
    .map((k) => {
      const points = equity.filter((e) => e.strategy === k).map((e) => ({ ts: e.ts, value: e.value }))
      return { k, points, m: metrics(points, capital), c: k === 'hold' ? null : counts.get(k) }
    })
    .sort((a, b) => b.m.gain - a.m.gain)
  const best = rows.filter((r) => r.k !== 'hold').slice(0, top)
  const hold = rows.find((r) => r.k === 'hold')!
  // "Más estable" solo entre los que operaron lo suficiente (con pocas operaciones, el resultado puede ser suerte)
  const FEW = 20
  const isFew = (r: (typeof rows)[number]) => !!r.c && r.c.closed < FEW && r.k !== 'rebal' && r.k !== 'learn2' && r.k !== 'half'
  const safest = [...best].filter((r) => !isFew(r)).sort((a, b) => b.m.ratio - a.m.ratio)[0]

  return (
    <Card title={`🏆 Podio: los ${top} mejores`} subtitle="Solo los que más ganaron, comparados con no tocar. Para elegir, mira también cuánto llegaron a caer." className="mt-4">
      <div className="mb-3 flex gap-2 text-sm">
        {[3, 5].map((n) => (
          <a
            key={n}
            href={`?top=${n}`}
            className={clsx('rounded-full border px-3 py-1', n === top ? 'border-text bg-text text-bg' : 'border-border text-muted hover:text-text')}
          >
            Top {n}
          </a>
        ))}
      </div>

      <EquityCompare
        curves={[
          ...best.map((r) => ({ label: NAME(r.k), color: COLOR[r.k], points: r.points.map((p) => ({ time: p.ts, value: p.value })) })),
          { label: NAME('hold'), color: COLOR.hold, points: hold.points.map((p) => ({ time: p.ts, value: p.value })), dashed: true },
        ]}
      />

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-150 text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-border">
              <th className="py-2 font-normal">Competidor</th>
              <th className="py-2 text-right font-normal">Ganancia</th>
              <th className="py-2 text-right font-normal">Por mes</th>
              <th className="py-2 text-right font-normal" title="Lo máximo que llegó a caer desde su mejor momento">
                Peor caída
              </th>
              <th className="py-2 text-right font-normal" title="Ganancia dividida por la peor caída: cuánto ganó por cada % que llegó a caer">
                Ganancia / caída
              </th>
              <th className="py-2 text-right font-normal">Operaciones</th>
              <th className="py-2 text-right font-normal">Aciertos</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {[...best, hold].map((r) => (
              <tr key={r.k} className={clsx('border-b border-border last:border-0', r.k === 'hold' && 'text-muted')}>
                <td className="py-2">
                  <span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: COLOR[r.k] }} />
                  {NAME(r.k)}
                  {r === safest && <span className="ml-2 rounded bg-up/15 px-1.5 py-0.5 text-xs text-up">más estable</span>}
                </td>
                <td className={clsx('py-2 text-right font-semibold', tone(r.m.gain))}>{pctText(r.m.gain)}</td>
                <td className={clsx('py-2 text-right', tone(r.m.monthly))}>{pctText(r.m.monthly)}</td>
                <td className="py-2 text-right text-down">{pctText(r.m.maxDrawdown)}</td>
                <td className="py-2 text-right">{Number.isFinite(r.m.ratio) ? r.m.ratio.toFixed(2) : '—'}</td>
                <td className="py-2 text-right">
                  {r.c ? r.c.closed : '—'}
                  {isFew(r) && (
                    <span className="ml-1.5 rounded bg-sma20/15 px-1.5 py-0.5 text-xs text-sma20" title="Con tan pocas operaciones, el resultado todavía puede ser suerte">
                      ⚠️ pocas
                    </span>
                  )}
                </td>
                <td className="py-2 text-right">{r.c && r.c.closed ? `${Math.round((r.c.wins / r.c.closed) * 100)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        <b>Cómo elegir:</b> el que más gana no siempre es el mejor para ti. Si uno llegó a caer −40% en el camino, con plata real es muy difícil
        aguantarlo sin vender. &quot;Ganancia / caída&quot; mide cuánto ganó por cada % que llegó a caer: más alto = más ganancia con menos sustos.
        Con menos de {FEW} operaciones (⚠️ pocas), el resultado todavía puede ser suerte.
      </p>
    </Card>
  )
}

function Badge({ k }: { k: Competitor }) {
  return (
    <span className="ml-1 rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: `${COLOR[k]}26`, color: COLOR[k] }}>
      {COMPETITORS[k].emoji} {COMPETITORS[k].label}
    </span>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="safe-top mx-auto w-full max-w-screen-2xl px-4 py-6 md:px-6">
      <PageHeader title="Bot · Competencia en vivo" subtitle="Etapa 2: varias técnicas compiten con precios reales y dinero de mentira" refresh />
      <BotTabs current="live" />
      {children}
    </main>
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
