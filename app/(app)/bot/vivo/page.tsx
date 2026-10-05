import clsx from 'clsx'
import { getPrices } from '@/lib/binance-account'
import { fmt } from '@/lib/binance'
import { getMeta } from '@/lib/db'
import { COLORS } from '@/lib/colors'
import {
  daysRunning,
  getCapital,
  getCash,
  getStartedAt,
  holdValue,
  isRunning,
  listEquity,
  listPositions,
  listTrades,
  portfolioValue,
  SLOTS,
  STOP_LOSS,
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
const REASON: Record<string, string> = { sl: 'Stop loss', cross: 'Terminó la subida', manual: 'Vendido a mano' }

export default async function VivoPage() {
  const started = getStartedAt()

  if (!started)
    return (
      <Shell>
        <section className="mt-4 rounded-2xl border border-border bg-panel p-5">
          <h2 className="text-lg font-semibold">Prender el bot con dinero de mentira</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">
            <li>Corre en tu NAS las 24 horas con <b className="text-text">precios reales</b>, pero compra y vende con dinero ficticio: nunca toca tu cuenta de Binance.</li>
            <li>
              Usa <b className="text-text">📈 seguir la tendencia</b> en velas de 4 horas, con stop loss de {STOP_LOSS}%, en las monedas del filtro de seguridad.
            </li>
            <li>Máximo {SLOTS} operaciones a la vez, reinvirtiendo las ganancias. Te avisa por Telegram cada compra y venta.</li>
            <li>Se compara con &quot;no tocar&quot;: repartir el mismo capital entre las mismas monedas el día que lo prendes.</li>
            <li>Paciencia: la tendencia opera poco. Pueden pasar días sin compras, y es normal.</li>
          </ul>
          <form action={start} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block text-sm text-muted sm:w-56">
              Capital ficticio (USDT)
              <input name="capital" inputMode="decimal" defaultValue={200} className="input tabular mt-1" />
            </label>
            <button className="rounded-lg bg-up px-6 py-2.5 font-semibold text-white active:opacity-80">🟢 Prender el bot</button>
          </form>
        </section>
      </Shell>
    )

  const prices = await getPrices()
  const running = isRunning()
  const capital = getCapital()
  const value = portfolioValue(prices)
  const hold = holdValue(prices)
  const positions = listPositions()
  const trades = listTrades()
  const equity = listEquity()
  const wins = trades.filter((t) => t.pnl > 0).length
  const days = daysRunning(started)
  const lastRun = Number(getMeta('bot_last_run')) || null
  const error = getMeta('bot_last_error')

  return (
    <Shell>
      <section
        className={clsx(
          'mt-4 flex flex-wrap items-center gap-3 rounded-2xl border p-4',
          running ? 'border-up/40 bg-up/10' : 'border-sma20/40 bg-sma20/10',
        )}
      >
        <p className={clsx('font-semibold', running ? 'text-up' : 'text-sma20')}>{running ? '🟢 Prendido' : '⏸️ En pausa'}</p>
        <p className="text-sm text-muted">
          desde el {when(started)} ({Math.floor(days)} {Math.floor(days) === 1 ? 'día' : 'días'}) · última revisión{' '}
          {lastRun ? when(lastRun) : '—'} · dinero de mentira
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

      <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Valor de la cartera" className="col-span-2 lg:col-span-1">
          <p className="text-3xl font-semibold">
            {value.toFixed(2)} <span className="text-base font-normal text-muted">USDT</span>
          </p>
          <p className={clsx('text-sm', tone(value - capital))}>
            {money(value - capital)} ({pctText(((value - capital) / capital) * 100)}) desde {capital}
          </p>
        </Tile>
        <Tile label="💤 No tocar (para comparar)">
          <p className={clsx('text-2xl font-semibold', tone(hold - capital))}>{money(hold - capital)}</p>
          <p className="text-xs text-muted">
            {value >= hold ? '✓ el bot va ganando' : '✗ el bot va perdiendo'} por {Math.abs(value - hold).toFixed(2)} USDT
          </p>
        </Tile>
        <Tile label="Operaciones cerradas">
          <p className="text-2xl font-semibold">{trades.length}</p>
          <p className="text-xs text-muted">{trades.length ? `${wins} ganadas · ${trades.length - wins} perdidas` : 'todavía ninguna'}</p>
        </Tile>
        <Tile label="Disponible">
          <p className="text-2xl font-semibold">{getCash().toFixed(2)}</p>
          <p className="text-xs text-muted">
            USDT sin usar · {positions.length} de {SLOTS} lugares ocupados
          </p>
        </Tile>
      </section>

      <Card title={`Comprado ahora (${positions.length})`} subtitle={`Se vende si la amarilla cruza hacia abajo a la azul, o si baja ${STOP_LOSS}%`} className="mt-4">
        {positions.length ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {positions.map((p) => {
              const price = prices.get(p.symbol) ?? p.entry
              const pnl = p.qty * price * 0.999 - p.size
              return (
                <li key={p.symbol} className="flex items-center gap-3 rounded-xl bg-bg p-3">
                  <CoinIcon base={coin(p.symbol)} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{coin(p.symbol)}/USDT</p>
                    <p className="tabular text-xs text-muted">
                      compró a {fmt(p.entry)} · hoy {fmt(price)} · stop {fmt(p.entry * (1 - STOP_LOSS / 100))}
                    </p>
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
          <p className="rounded-xl bg-bg p-4 text-sm text-muted">
            Nada comprado. El bot espera a que alguna moneda empiece una subida (la amarilla cruce hacia arriba a la azul). Puede tardar días.
          </p>
        )}
      </Card>

      {equity.length >= 2 && (
        <Card title="Cuánto valdría la cartera" subtitle="Bot vs no tocar, desde que lo prendiste" className="mt-4">
          <EquityCompare
            curves={[
              { label: '🟢 Bot', color: COLORS.sma50, points: equity.map((e) => ({ time: e.ts, value: e.value })) },
              { label: '💤 No tocar', color: COLORS.muted, points: equity.map((e) => ({ time: e.ts, value: e.hold })) },
              { label: 'Capital inicial', color: COLORS.text, points: equity.map((e) => ({ time: e.ts, value: capital })), dashed: true },
            ]}
          />
        </Card>
      )}

      <Card title={`Operaciones cerradas (${trades.length})`} subtitle="De la más nueva a la más vieja" className="mt-4">
        {trades.length ? (
          <ul className="space-y-2">
            {trades.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl bg-bg p-3 text-sm">
                <CoinIcon base={coin(t.symbol)} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {coin(t.symbol)} <span className="font-normal text-muted">· {REASON[t.reason] ?? t.reason}</span>
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
          <p className="rounded-xl bg-bg p-4 text-sm text-muted">Todavía no cerró ninguna operación.</p>
        )}
      </Card>

      <details className="group mt-4 rounded-2xl border border-border bg-panel">
        <summary className="cursor-pointer list-none p-4 text-sm font-medium text-muted marker:hidden">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          Reiniciar el bot desde cero
        </summary>
        <form action={start} className="flex flex-col gap-3 px-4 pb-4 sm:flex-row sm:items-end">
          <label className="block text-sm text-muted sm:w-56">
            Capital ficticio (USDT)
            <input name="capital" inputMode="decimal" defaultValue={capital} className="input tabular mt-1" />
          </label>
          <button className="rounded-lg border border-down/50 px-6 py-2.5 font-semibold text-down">Borrar todo y empezar de nuevo</button>
        </form>
      </details>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="safe-top mx-auto w-full max-w-screen-2xl px-4 py-6 md:px-6">
      <PageHeader title="Bot · En vivo" subtitle="Etapa 2: el bot opera con precios reales y dinero de mentira" refresh />
      <BotTabs current="live" />
      {children}
    </main>
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
