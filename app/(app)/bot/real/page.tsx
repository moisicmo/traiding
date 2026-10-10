import clsx from 'clsx'
import { fmt } from '@/lib/binance'
import { getMeta } from '@/lib/db'
import { mySeed } from '@/lib/my-seed'
import { COMPETITOR_KEYS, COMPETITORS, getCapital, getStartedAt, HOLD, isRunning, listEquity, type Competitor, type Seed } from '@/lib/paper-bot'
import { getReal, isTestnet, listRealEquity, listRealOrders, realConfigured, realValue, tradePrices, type RealState } from '@/lib/real-bot'
import { COMPETITOR_COLORS, REAL_COLOR } from '@/lib/colors'
import { EquityCompare, type Curve } from '@/components/equity-compare'
import { PageHeader } from '@/components/page-header'
import { BotTabs } from '@/components/bot-tabs'
import { CoinIcon } from '@/components/coin-icon'
import { SubmitButton } from '@/components/submit-button'
import { add, panic, pause, reset, resume, start } from './actions'

export const metadata = { title: 'Bot real · Trading' }

const TZ = 'America/La_Paz'
const when = (ms: number) => new Date(ms).toLocaleString('es-BO', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const coin = (symbol: string) => symbol.replace(/USDT$/, '')
const money = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`
const tone = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted')

export default async function RealPage() {
  if (!realConfigured())
    return (
      <Shell>
        <Card title="🧪 Primero, la llave de práctica">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Entra a <b>testnet.binance.vision</b> e inicia sesión con GitHub. Es Binance de práctica: órdenes de verdad, dinero de mentira.
            </li>
            <li>
              Toca <b>Generate HMAC_SHA256 Key</b>, ponle un nombre y copia la <b>API Key</b> y el <b>Secret Key</b> (el secret se muestra una sola vez).
            </li>
            <li>
              En el <code>.env</code> del NAS agrega <code>BINANCE_TRADE_API_KEY=</code> y <code>BINANCE_TRADE_API_SECRET=</code> con esos valores (nunca los
              pegues en un chat).
            </li>
            <li>
              Reinicia: <code>sudo docker compose up -d --build</code>
            </li>
          </ol>
          <p className="mt-3 text-sm text-muted">
            Más adelante, para plata real: una llave nueva de tu cuenta con permiso de operar Spot, <b className="text-text">sin permiso de retiro</b>,
            restringida a la IP del NAS, y <code>BINANCE_TRADE_URL=https://api.binance.com</code>.
          </p>
        </Card>
      </Shell>
    )

  const s = getReal()
  const testnet = isTestnet()
  const startError = getMeta('real_start_error')
  const arenaOk = !!getStartedAt() && isRunning()

  // Todavía no empezó (o se vendió todo y quieres empezar de nuevo)
  if (!s || (!s.enabled && !Object.keys(s.holdings).length && !s.lastRun)) {
    const seed = await mySeed().catch(() => [] as Seed[])
    return (
      <Shell>
        <ModeBanner testnet={testnet} />
        <Card title="🚀 Empezar el bot" subtitle="Copia en tu Binance la cartera de un competidor de la competencia, en la misma proporción" className="mt-4">
          {!arenaOk && <p className="mb-3 rounded-lg bg-sma20/15 p-3 text-sm text-sma20">La competencia tiene que estar corriendo: el bot copia lo que hace ahí.</p>}
          {startError && <p className="mb-3 rounded-lg bg-down/15 p-3 text-sm text-down">No pudo empezar: {startError}</p>}
          <form action={start} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
            <label className="block text-sm text-muted sm:w-64">
              Copiar a
              <select name="follow" defaultValue="half" className="input mt-1">
                {COMPETITOR_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {COMPETITORS[k].emoji} {COMPETITORS[k].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-muted sm:w-48">
              Presupuesto (USDT)
              <input name="budget" inputMode="decimal" defaultValue={200} className="input tabular mt-1" />
              <span className="mt-1 block text-xs">Solo usa esto: el resto de tu cuenta no lo toca.</span>
            </label>
            <label className="block text-sm text-muted sm:w-48">
              Freno de pérdida (%)
              <input name="maxLoss" inputMode="decimal" defaultValue={20} className="input tabular mt-1" />
              <span className="mt-1 block text-xs">Si cae esto desde su mejor momento, vende todo y se apaga.</span>
            </label>
            {seed.length > 0 && (
              <label className="flex w-full items-start gap-2 rounded-xl bg-bg p-3 text-sm">
                <input type="checkbox" name="adopt" defaultChecked className="mt-1" />
                <span>
                  <b>Incluir lo que ya compraste:</b> {seed.map((x) => `${fmt(x.qty)} ${coin(x.symbol)} (a ${fmt(x.entry)})`).join(', ')}.
                  <span className="block text-muted">
                    Pasa a ser parte del presupuesto y el bot decide si lo vende o lo aguanta. Solo lo que esté libre: si tienes una orden abierta con esa
                    moneda, cancélala antes.
                  </span>
                </span>
              </label>
            )}
            <SubmitButton pending="Empezando…" className="rounded-lg bg-up px-6 py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-60">
              🚀 Empezar {testnet ? '(práctica)' : 'con PLATA REAL'}
            </SubmitButton>
          </form>
        </Card>
      </Shell>
    )
  }

  const prices = await tradePrices()
  const value = realValue(s, prices)
  const gain = value - s.budget
  const brake = s.peak * (1 - s.maxLoss / 100)
  const orders = listRealOrders()
  const holdings = Object.entries(s.holdings).filter(([, h]) => h.qty > 0)

  return (
    <Shell>
      <ModeBanner testnet={testnet} />
      <section
        className={clsx('mt-4 flex flex-wrap items-center gap-3 rounded-2xl border p-4', s.enabled ? 'border-up/40 bg-up/10' : 'border-sma20/40 bg-sma20/10')}
      >
        <p className={clsx('font-semibold', s.enabled ? 'text-up' : 'text-sma20')}>{s.enabled ? '🟢 Operando' : '⏸️ Apagado'}</p>
        <p className="text-sm text-muted">
          copia a {COMPETITORS[s.follow].emoji} {COMPETITORS[s.follow].label} · desde el {when(s.started)} · última revisión {s.lastRun ? when(s.lastRun) : '—'}
        </p>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <form action={s.enabled ? pause : resume} className="flex-1 sm:flex-none">
            <button className="w-full rounded-lg border border-border bg-panel px-4 py-2 text-sm font-semibold">{s.enabled ? '⏸️ Pausar' : '▶️ Seguir'}</button>
          </form>
          {holdings.length > 0 ? (
            <form action={panic} className="flex-1 sm:flex-none">
              <SubmitButton pending="Vendiendo…" className="w-full rounded-lg border border-down/50 bg-down/15 px-4 py-2 text-sm font-semibold text-down">
                🛑 Vender todo
              </SubmitButton>
            </form>
          ) : (
            !s.enabled && (
              <form action={reset} className="flex-1 sm:flex-none">
                <button className="w-full rounded-lg border border-border bg-panel px-4 py-2 text-sm font-semibold">Empezar de nuevo</button>
              </form>
            )
          )}
        </div>
        {s.stopped && <p className="w-full rounded-lg bg-down/15 p-3 text-sm text-down">{s.stopped}</p>}
        {s.lastError && <p className="w-full rounded-lg bg-sma20/15 p-3 text-sm text-sma20">⚠️ {s.lastError}</p>}
        {!s.enabled && !s.stopped && holdings.length > 0 && (
          <p className="w-full text-sm text-muted">En pausa: sigue teniendo sus monedas, pero no compra ni vende (tampoco el freno).</p>
        )}
      </section>

      <Card title="➕ Darle más fondos" subtitle="Suma USDT de tu cuenta: desde ahí el bot lo invierte junto con lo demás" className="mt-4">
        {startError && <p className="mb-3 rounded-lg bg-down/15 p-3 text-sm text-down">{startError}</p>}
        <form action={add} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block text-sm text-muted sm:w-48">
            Monto (USDT)
            <input name="amount" inputMode="decimal" placeholder="500" className="input tabular mt-1" />
          </label>
          <SubmitButton pending="Agregando…" className="rounded-lg border border-border bg-bg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
            ➕ Agregar
          </SubmitButton>
        </form>
        <p className="mt-2 text-xs text-muted">Tiene que estar libre en tu billetera Spot (lo del P2P llega a Fondos: pásalo a Spot primero).</p>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Kpi label="Vale ahora" value={`${value.toFixed(2)} USDT`} sub={`pusiste ${s.budget.toFixed(2)} USDT en total`} />
        <Kpi label="Ganancia" value={money(gain)} sub={`${money((gain / s.budget) * 100)}%`} className={tone(gain)} />
        <Kpi label="Freno" value={`${brake.toFixed(2)} USDT`} sub={`si baja de esto vende todo (mejor momento: ${s.peak.toFixed(2)})`} />
      </div>

      <Card
        title="📈 Contra los competidores"
        subtitle="Todos medidos como si hubieran empezado con 200 USDT (lo que agregues después no cuenta como ganancia). Los competidores son de mentira; tu bot, de verdad."
        className="mt-4"
      >
        <RaceChart s={s} />
      </Card>

      <Card title="Lo que tiene ahora" subtitle="Solo lo que es del bot (no el resto de tu cuenta)" className="mt-4">
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between rounded-xl bg-bg p-3">
            <span className="font-semibold">USDT</span>
            <span className="tabular">{s.cash.toFixed(2)}</span>
          </li>
          {holdings.map(([symbol, h]) => {
            const v = h.qty * (prices.get(symbol) ?? 0)
            return (
              <li key={symbol} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-bg p-3">
                <CoinIcon base={coin(symbol)} size={28} />
                <span className="flex-1 font-semibold">{coin(symbol)}</span>
                <span className="tabular text-muted">{fmt(h.qty)}</span>
                <span className="tabular w-24 text-right">{v.toFixed(2)}</span>
                <span className={clsx('tabular w-20 text-right', tone(v - h.cost))}>{money(v - h.cost)}</span>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card title={`Órdenes (${orders.length})`} subtitle="Cada compra y venta que hizo en Binance" className="mt-4">
        {orders.length ? (
          <ul className="space-y-2 text-sm">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-bg p-3">
                <span className={clsx('rounded px-2 py-0.5 text-xs font-semibold', o.side === 'BUY' ? 'bg-up/15 text-up' : 'bg-down/15 text-down')}>
                  {o.side === 'BUY' ? 'Compra' : 'Venta'}
                </span>
                <span className="font-semibold">{coin(o.symbol)}</span>
                <span className="tabular text-muted">
                  {fmt(o.qty)} por {o.quote.toFixed(2)} USDT
                </span>
                <span className="w-full text-xs text-muted sm:ml-auto sm:w-auto">
                  {when(o.ts)} · {o.reason}
                  {o.testnet ? ' · práctica' : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-bg p-4 text-sm text-muted">Todavía no hizo ninguna orden.</p>
        )}
      </Card>
    </Shell>
  )
}

const BASE = 200

/** El bot real contra el competidor que copia, los 3 que van mejor y "no tocar", desde que empezó el bot real */
function RaceChart({ s }: { s: RealState }) {
  const real = listRealEquity()
  if (real.length < 2)
    return <p className="rounded-xl bg-bg p-4 text-sm text-muted">Guarda una foto por hora: en un par de horas aparece el gráfico.</p>
  const from = real[0].ts
  const capital = getCapital() || BASE
  const equity = listEquity().filter((e) => e.ts >= from)
  const lineOf = (k: Competitor | 'hold') => equity.filter((e) => e.strategy === k).map((e) => ({ time: e.ts, value: (e.value * BASE) / capital }))
  const last = (k: Competitor) => lineOf(k).at(-1)?.value ?? 0
  const best = COMPETITOR_KEYS.filter((k) => k !== s.follow)
    .sort((a, b) => last(b) - last(a))
    .slice(0, 3)
  const name = (k: Competitor) => `${COMPETITORS[k].emoji} ${COMPETITORS[k].label}`
  const curves: Curve[] = [
    { label: '💰 Tu bot real', color: REAL_COLOR, points: real.map((r) => ({ time: r.ts, value: r.nav * BASE })) },
    { label: `${name(s.follow)} (al que copia)`, color: COMPETITOR_COLORS[s.follow], points: lineOf(s.follow) },
    ...best.map((k) => ({ label: name(k), color: COMPETITOR_COLORS[k], points: lineOf(k) })),
    { label: `${HOLD.emoji} ${HOLD.label}`, color: COMPETITOR_COLORS.hold, points: lineOf('hold'), dashed: true },
  ]
  return <EquityCompare curves={curves} />
}

function ModeBanner({ testnet }: { testnet: boolean }) {
  return testnet ? (
    <p className="mt-4 rounded-2xl border border-sma50/40 bg-sma50/10 p-4 text-sm">
      🧪 <b>Modo práctica (testnet):</b> órdenes de verdad en el Binance de prueba, con dinero de mentira. Sirve para cazar errores antes de usar plata
      real. Ojo: los precios de la testnet no son los reales.
    </p>
  ) : (
    <p className="mt-4 rounded-2xl border border-down/50 bg-down/10 p-4 text-sm text-down">
      💰 <b>PLATA REAL:</b> este bot compra y vende en tu cuenta de Binance. Puede perder dinero.
    </p>
  )
}

function Kpi({ label, value, sub, className }: { label: string; value: string; sub: string; className?: string }) {
  return (
    <section className="rounded-2xl border border-border bg-panel p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={clsx('tabular mt-1 text-2xl font-semibold', className)}>{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </section>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="safe-top mx-auto w-full max-w-screen-2xl px-4 py-6 md:px-6">
      <PageHeader title="Bot · Real" subtitle="Copia en tu Binance la cartera de un competidor, con freno de pérdida" refresh />
      <BotTabs current="real" />
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
