import clsx from 'clsx'
import { fmt } from '@/lib/binance'
import { getHistory } from '@/lib/history'
import { getMarket } from '@/lib/market'
import { CYCLE, EXAM, holdBenchmark, monthlyGains, PAUSE_AFTER, PAUSE_CYCLES, simulate, SLOTS, STUDY, type CoinSeries, type SimResult } from '@/lib/learner'
import { PageHeader } from '@/components/page-header'
import { BotTabs } from '@/components/bot-tabs'
import { EquityCompare } from '@/components/equity-compare'
import { COLORS } from '@/lib/colors'

export const metadata = { title: 'Bot que aprende · Trading' }

const TZ = 'America/La_Paz'
const money = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`
const tone = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted')
const date = (ms: number) => new Date(ms).toLocaleDateString('es-BO', { timeZone: TZ, day: 'numeric', month: 'short', year: '2-digit' })
const monthLabel = (key: string) =>
  new Date(`${key}-15T12:00:00Z`).toLocaleDateString('es-BO', { timeZone: 'UTC', month: 'short', year: '2-digit' }).replace('.', '')

const GRAY = COLORS.muted

type Search = { c?: string; a?: string }

export default async function AprendePage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams
  const num = (v: string | undefined, d: number, max: number) => {
    const n = Number(String(v ?? '').replace(',', '.'))
    return v !== undefined && Number.isFinite(n) && n >= 0 && n <= max ? n : d
  }
  const capital = Math.max(10, num(q.c, 200, 1_000_000))
  const monthly = num(q.a, 0, 100_000)

  // Las monedas del filtro de seguridad, con ~2 años de velas de 4 h
  const market = await getMarket().catch(() => ({ coins: [], rejected: [] }))
  const coins: CoinSeries[] = (
    await Promise.all(
      market.coins.map(async (c) => {
        try {
          return { symbol: c.symbol, base: c.base, name: c.name, bars: await getHistory(c.symbol, '4h') }
        } catch {
          return null
        }
      }),
    )
  ).filter((c) => c !== null)
  const master = coins.find((c) => c.base === 'BTC')?.bars ?? coins[0]?.bars
  if (!master || master.length < 2000)
    return (
      <Shell>
        <p className="mt-6 rounded-xl bg-down/15 p-4 text-down">No se pudo bajar el historial de Binance. Intenta de nuevo en un rato.</p>
      </Shell>
    )

  const cfg = { capital, monthly }
  const learn = simulate(coins, master, { ...cfg, mode: 'learn' })
  const trend = simulate(coins, master, { ...cfg, mode: 'trend' })
  const hold = holdBenchmark(coins, master, cfg)
  const invested = learn.totalInvested

  const options = [
    { key: 'learn', label: '🧠 Bot que aprende', final: learn.final, color: COLORS.sma50 },
    { key: 'trend', label: '📈 Siempre tendencia (sin aprender)', final: trend.final, color: COLORS.sma20 },
    { key: 'hold', label: '💤 No tocar (repartido)', final: hold.final, color: GRAY },
  ].sort((a, b) => b.final - a.final)
  const winner = options[0]
  const months = Math.max(1, (learn.to - learn.from) / (30.44 * 86_400_000))

  // Ganancia por mes de las dos que operan y de "no tocar", para la tabla
  const gains = {
    learn: new Map(monthlyGains(learn.equity, learn.invested).map((m) => [m.key, m.gain])),
    trend: new Map(monthlyGains(trend.equity, trend.invested).map((m) => [m.key, m.gain])),
    hold: new Map(monthlyGains(hold.equity, learn.invested).map((m) => [m.key, m.gain])),
  }
  const monthKeys = [...gains.learn.keys()]

  return (
    <Shell>
      <details className="group mt-4 rounded-2xl border border-border bg-panel">
        <summary className="cursor-pointer list-none p-4 text-sm font-medium marker:hidden">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          🧠 Cómo aprende este bot
        </summary>
        <ol className="list-decimal space-y-1.5 px-4 pb-4 pl-9 text-sm leading-relaxed text-muted">
          <li>
            Cada semana <b className="text-text">estudia</b> los últimos ~{Math.round(STUDY / 6 / 30)} meses de cada moneda con &quot;rebote&quot; y &quot;tendencia&quot;.
          </li>
          <li>
            <b className="text-text">Se examina</b> con los ~{Math.round(EXAM / 6 / 30)} meses más recientes, que no usó para estudiar (así no memoriza el pasado).
          </li>
          <li>Usa en cada moneda la estrategia que ganó en los dos. Si ninguna ganó, esa semana no opera esa moneda.</li>
          <li>
            <b className="text-text">Aprende de sus errores:</b> si pierde {PAUSE_AFTER} veces seguidas en una moneda, la pausa {PAUSE_CYCLES} semanas.
          </li>
          <li>
            Opera la semana siguiente vela por vela (cada 4 horas), sin ver el futuro, con máximo {SLOTS} operaciones a la vez, reinvirtiendo todo, y vuelve a
            empezar. Cobra 0,1% de comisión al comprar y al vender.
          </li>
          <li>
            Se compara con <b className="text-text">&quot;siempre tendencia&quot;</b> (las mismas reglas, pero sin aprender) y con{' '}
            <b className="text-text">&quot;no tocar&quot;</b> (repartir la plata entre las mismas monedas y esperar).
          </li>
        </ol>
      </details>

      <form method="get" action="/bot/aprende" className="mt-3 grid grid-cols-2 gap-3 rounded-2xl border border-border bg-panel p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-sm text-muted">
          Capital inicial (USDT)
          <input name="c" inputMode="decimal" defaultValue={capital} className="input tabular mt-1" />
        </label>
        <label className="block text-sm text-muted">
          Aporte cada mes (USDT)
          <input name="a" inputMode="decimal" defaultValue={monthly} className="input tabular mt-1" />
        </label>
        <button className="col-span-2 rounded-lg bg-sma20 px-6 py-2.5 font-semibold text-black active:opacity-80 sm:col-span-1">▶ Simular</button>
      </form>

      <section
        className={clsx(
          'mt-4 rounded-2xl border p-4',
          winner.key === 'learn' ? 'border-up/40 bg-up/10 text-up' : 'border-sma20/40 bg-sma20/10 text-sma20',
        )}
      >
        <p className="font-semibold">
          {winner.key === 'learn' ? '✅ El bot que aprende fue el mejor' : `⚠️ Aprender no ayudó: la mejor fue ${winner.label.replace(/ \(.*\)/, '')}`}
        </p>
        <p className="mt-1 text-sm opacity-90">
          Del {date(learn.from)} al {date(learn.to)} ({Math.round(months)} meses) · {coins.length} monedas del filtro de seguridad · pusiste{' '}
          {invested.toFixed(0)} USDT en total
        </p>
      </section>

      <section className="mt-3 grid gap-3 md:grid-cols-3">
        {[
          { key: 'learn', label: '🧠 Bot que aprende', r: learn },
          { key: 'trend', label: '📈 Siempre tendencia', r: trend },
          { key: 'hold', label: '💤 No tocar', r: { ...hold, trades: null } },
        ].map(({ key, label, r }) => {
          const gain = r.final - invested
          const avgMonth = gain / months
          const wins = r.trades?.filter((t) => t.pnl > 0).length
          return (
            <div key={key} className={clsx('rounded-2xl border bg-panel p-4', key === winner.key ? 'border-sma20/60' : 'border-border')}>
              <p className="text-sm text-muted">
                {label}
                {key === winner.key && <span className="ml-1.5 whitespace-nowrap rounded bg-sma20/15 px-1.5 py-0.5 text-xs text-sma20">★ la mejor</span>}
              </p>
              <p className={clsx('mt-1 text-3xl font-semibold', tone(gain))}>
                {money(gain)} <span className="text-base font-normal text-muted">USDT</span>
              </p>
              <p className="text-xs text-muted">
                terminaría con {r.final.toFixed(0)} USDT · promedio {money(avgMonth)}/mes
              </p>
              {r.trades && (
                <p className="mt-1 text-xs text-muted">
                  {r.trades.length} operaciones · {wins} ganadas ({r.trades.length ? Math.round(((wins ?? 0) / r.trades.length) * 100) : 0}%)
                </p>
              )}
            </div>
          )
        })}
      </section>

      <Card title="Cuánto valdría tu cartera" subtitle="La línea punteada es lo que fuiste poniendo; por encima de ella, ganas" className="mt-4">
        <EquityCompare
          curves={[
            { label: '🧠 Aprende', color: COLORS.sma50, points: learn.equity },
            { label: '📈 Siempre tendencia', color: COLORS.sma20, points: trend.equity },
            { label: '💤 No tocar', color: GRAY, points: hold.equity },
            { label: 'Lo que pusiste', color: COLORS.text, points: learn.invested, dashed: true },
          ]}
        />
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Ganancia de cada mes" subtitle="USDT ganados o perdidos ese mes (sin contar tus aportes)">
          <div className="overflow-x-auto">
            <table className="w-full min-w-96 text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 font-normal">Mes</th>
                  <th className="py-2 text-right font-normal">🧠 Aprende</th>
                  <th className="py-2 text-right font-normal">📈 Tendencia</th>
                  <th className="py-2 text-right font-normal">💤 No tocar</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {[...monthKeys].reverse().map((k) => (
                  <tr key={k} className="border-b border-border last:border-0">
                    <td className="py-1.5 text-muted">{monthLabel(k)}</td>
                    {(['learn', 'trend', 'hold'] as const).map((s) => {
                      const g = gains[s].get(k) ?? 0
                      return (
                        <td key={s} className={clsx('py-1.5 text-right', tone(g))}>
                          {money(g)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <LearnedLog result={learn} />
      </div>

      <p className="mt-6 text-xs text-muted">
        Ojo: las monedas son las que pasan el filtro de seguridad HOY, así que el pasado se ve un poco mejor de lo que fue (en ese momento no sabíamos cuáles
        iban a seguir siendo grandes). El pasado no garantiza el futuro.
      </p>
    </Shell>
  )
}

/** Lo que el bot aprendió semana a semana (las últimas primero) */
function LearnedLog({ result }: { result: SimResult }) {
  const weeks = [...result.cycles].reverse().slice(0, 16)
  const last = weeks[0]
  return (
    <Card title="Lo que aprendió" subtitle={`Revisa cada ${CYCLE / 6} días qué estrategia usar en cada moneda`}>
      {last && (
        <div className="rounded-xl bg-bg p-3 text-sm">
          <p className="font-medium">Esta semana usaría:</p>
          <p className="mt-1 text-muted">
            {last.active.length
              ? last.active.map((a) => `${a.base} → ${a.strategy === 'trend' ? '📈 tendencia' : '🟡 rebote'}`).join(' · ')
              : 'Ninguna moneda: ninguna estrategia ganó en el estudio y en el examen.'}
          </p>
          {last.paused.length > 0 && <p className="mt-1 text-down">En pausa por errores: {last.paused.join(', ')}</p>}
        </div>
      )}
      <ul className="mt-3 space-y-2 text-sm">
        {weeks
          .filter((w) => w.events.length)
          .map((w) => (
            <li key={w.time}>
              <p className="text-xs text-muted">Semana del {date(w.time)}</p>
              <ul className="mt-0.5 list-disc pl-5">
                {w.events.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </li>
          ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        Última operación: {result.trades.length ? `${result.trades[result.trades.length - 1].base} a ${fmt(result.trades[result.trades.length - 1].exit)}` : '—'}
      </p>
    </Card>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="safe-top mx-auto w-full max-w-screen-2xl px-4 py-6 md:px-6">
      <PageHeader title="Bot · Bot que aprende" subtitle="Simulación: ¿aprender cada semana le gana a usar siempre la misma regla?" />
      <BotTabs current="learn" />
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
