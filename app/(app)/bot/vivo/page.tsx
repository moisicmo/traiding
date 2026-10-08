import clsx from 'clsx'
import { getPrices } from '@/lib/binance-account'
import { fmt } from '@/lib/binance'
import { getMeta } from '@/lib/db'
import { COLORS } from '@/lib/colors'
import {
  COMPETITOR_KEYS,
  COMPETITORS,
  daysRunning,
  getCapital,
  getCash,
  getStartedAt,
  hadOldBot,
  HOLD,
  holdValue,
  isRunning,
  listEquity,
  listPositions,
  listTrades,
  portfolioValue,
  REASONS,
  SLOTS,
  type Competitor,
} from '@/lib/paper-bot'
import { PageHeader } from '@/components/page-header'
import { BotTabs } from '@/components/bot-tabs'
import { CoinIcon } from '@/components/coin-icon'
import { EquityCompare } from '@/components/equity-compare'
import { pause, panic, resume, start } from './actions'

export const metadata = { title: 'Bot en vivo · Trading' }

const TZ = 'America/La_Paz'
const money = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`
const pctText = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`
const tone = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted')
const when = (ms: number) => new Date(ms).toLocaleString('es-BO', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const coin = (symbol: string) => symbol.replace('USDT', '')

// Un color por competidor (líneas del gráfico y marquitas); "no tocar" en gris
const COLOR: Record<Competitor | 'hold', string> = {
  trend: COLORS.sma50,
  poc: '#b98bff',
  fib: '#ff9f43',
  smc: '#ff6fae',
  hold: COLORS.muted,
}
const NAME = (k: Competitor | 'hold') => (k === 'hold' ? `${HOLD.emoji} ${HOLD.label}` : `${COMPETITORS[k].emoji} ${COMPETITORS[k].label}`)

export default async function VivoPage() {
  const started = getStartedAt()

  if (!started)
    return (
      <Shell>
        <section className="mt-4 rounded-2xl border border-border bg-panel p-5">
          <h2 className="text-lg font-semibold">🏁 Competencia de técnicas con dinero de mentira</h2>
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
          <form action={start} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block text-sm text-muted sm:w-56">
              Capital ficticio de cada uno (USDT)
              <input name="capital" inputMode="decimal" defaultValue={200} className="input tabular mt-1" />
            </label>
            <button className="rounded-lg bg-up px-6 py-2.5 font-semibold text-white active:opacity-80">🏁 Empezar la competencia</button>
          </form>
        </section>
      </Shell>
    )

  const prices = await getPrices()
  const running = isRunning()
  const capital = getCapital()
  const positions = listPositions()
  const trades = listTrades()
  const equity = listEquity()
  const days = daysRunning(started)
  const lastRun = Number(getMeta('arena_last_run')) || null
  const error = getMeta('arena_last_error')

  // Tabla de posiciones
  const board = [
    ...COMPETITOR_KEYS.map((k) => {
      const mine = trades.filter((t) => t.strategy === k)
      return {
        key: k as Competitor | 'hold',
        value: portfolioValue(k, prices),
        closed: mine.length,
        wins: mine.filter((t) => t.pnl > 0).length,
        open: positions.filter((p) => p.strategy === k).length,
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
          desde el {when(started)} ({Math.floor(days)} {Math.floor(days) === 1 ? 'día' : 'días'}) · {capital} USDT ficticios cada uno · última revisión{' '}
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
                    : `${r.closed} cerradas · ${r.wins} ganadas · ${r.open}/${SLOTS} abiertas · ${r.cash!.toFixed(0)} libres`}
                </span>
              </li>
            )
          })}
        </ol>
      </Card>

      {equity.length >= 2 && (
        <Card title="La carrera" subtitle="Cuánto vale cada cartera, hora por hora" className="mt-4">
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
                      compró a {fmt(p.entry)} · hoy {fmt(price)} · stop {fmt(p.sl)}
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

      <Card title={`Operaciones cerradas (${trades.length})`} subtitle="De la más nueva a la más vieja" className="mt-4">
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
          <form action={start} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block text-sm text-muted sm:w-56">
              Capital ficticio de cada uno (USDT)
              <input name="capital" inputMode="decimal" defaultValue={capital} className="input tabular mt-1" />
            </label>
            <button className="rounded-lg border border-down/50 px-6 py-2.5 font-semibold text-down">Borrar todo y empezar de nuevo</button>
          </form>
        </div>
      </details>
    </Shell>
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
