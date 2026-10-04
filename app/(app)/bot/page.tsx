import Link from 'next/link'
import clsx from 'clsx'
import { fmt, isUsdtSymbol } from '@/lib/binance'
import { DEFAULT_PARAMS, runBacktest, type Params, type Result, type Trade } from '@/lib/backtest'
import { BT_INTERVALS, getHistory, type BtInterval } from '@/lib/history'
import { getMarket } from '@/lib/market'
import { PageHeader } from '@/components/page-header'
import { BacktestChart } from '@/components/backtest-chart'
import { PnlChart } from '@/components/pnl-chart'
import { CoinIcon } from '@/components/coin-icon'

export const metadata = { title: 'Bot · Trading' }

const TZ = 'America/La_Paz'
const money = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`
const pctText = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`
const tone = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted')
const date = (ms: number) => new Date(ms).toLocaleDateString('es-BO', { timeZone: TZ, day: 'numeric', month: 'short', year: '2-digit' })
const when = (ms: number) => new Date(ms).toLocaleString('es-BO', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const REASON = { tp: 'Take profit', sl: 'Stop loss', time: 'Tiempo' } as const

type Search = { s?: string; i?: string; tp?: string; sl?: string; max?: string }

function readParams(q: Search) {
  const num = (v: string | undefined, def: number, min: number, max: number) => {
    const n = Number(String(v ?? '').replace(',', '.'))
    return Number.isFinite(n) && n >= min && n <= max ? n : def
  }
  const interval: BtInterval = q.i === '1d' ? '1d' : '4h'
  const params: Params = {
    tp: num(q.tp, DEFAULT_PARAMS.tp, 0.3, 50),
    sl: num(q.sl, DEFAULT_PARAMS.sl, 0.3, 50),
    maxBars: Math.round(num(q.max, DEFAULT_PARAMS.maxBars, 1, 500)),
    stake: DEFAULT_PARAMS.stake,
  }
  const symbol = q.s === 'ALL' ? 'ALL' : q.s && isUsdtSymbol(q.s) ? q.s : 'BNBUSDT'
  return { symbol, interval, params }
}

/** El veredicto en palabras: ¿sirve esta estrategia en esta moneda? */
function verdict(r: Result) {
  const { total, buyHold, trades } = r.stats
  if (trades < 5) return { icon: '🤷', text: 'Muy pocas operaciones para sacar conclusiones', className: 'border-border text-muted' }
  if (total <= 0) return { icon: '❌', text: 'Perdió plata', className: 'border-down/40 bg-down/10 text-down' }
  if (total < buyHold) return { icon: '⚠️', text: 'Ganó, pero menos que comprar y no tocar', className: 'border-sma20/40 bg-sma20/10 text-sma20' }
  return { icon: '✅', text: 'Ganó más que comprar y no tocar', className: 'border-up/40 bg-up/10 text-up' }
}

export default async function BotPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { symbol, interval, params } = readParams(await searchParams)
  const market = await getMarket().catch(() => ({ coins: [], rejected: [] }))
  const coins = market.coins.map((c) => ({ symbol: c.symbol, base: c.base, name: c.name }))
  if (symbol !== 'ALL' && !coins.some((c) => c.symbol === symbol)) coins.unshift({ symbol, base: symbol.replace('USDT', ''), name: symbol.replace('USDT', '') })

  const query = (s: string) => `/bot?s=${s}&i=${interval}&tp=${params.tp}&sl=${params.sl}&max=${params.maxBars}`

  return (
    <main className="safe-top mx-auto w-full max-w-screen-2xl px-4 py-6 md:px-6">
      <PageHeader title="Bot · Probar estrategia" subtitle="Etapa 1: backtest. ¿Cuánto habría ganado este bot en el pasado?" />

      <details className="group mt-4 rounded-2xl border border-border bg-panel">
        <summary className="cursor-pointer list-none p-4 text-sm font-medium marker:hidden">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          🤖 Cómo decide este bot (estrategia &quot;rebote en la línea amarilla&quot;)
        </summary>
        <ul className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-muted">
          <li><b className="text-text">Compra</b> cuando viene subiendo (la amarilla sobre la azul, y la azul en alza) y el precio baja a tocar la amarilla. Igual que tu compra de BNB.</li>
          <li><b className="text-text">Vende</b> cuando llega a la ganancia (take profit), a la pérdida máxima (stop loss), o si pasan demasiadas velas sin que pase nada (máx. velas).</li>
          <li><b className="text-text">Siempre usa 100 USDT por operación</b> y cobra 0,1% de comisión al comprar y al vender, como Binance.</li>
          <li>Solo mira el pasado de cada momento (nunca el futuro), y si en una misma vela se tocan la ganancia y la pérdida, cuenta la pérdida.</li>
          <li><b className="text-text">&quot;Comprar y no tocar&quot;</b> es la comparación clave: si el bot gana menos que eso, no vale la pena el esfuerzo ni el riesgo.</li>
        </ul>
      </details>

      {/* Parámetros: es un formulario normal, al probar se recarga la página con los números nuevos */}
      <form method="get" action="/bot" className="mt-3 grid grid-cols-3 gap-3 rounded-2xl border border-border bg-panel p-4 lg:grid-cols-[2fr_1.4fr_1fr_1fr_1fr_auto] lg:items-end">
        <Field label="Moneda" className="col-span-3 lg:col-span-1">
          <select name="s" defaultValue={symbol} className="input">
            <option value="ALL">🔎 Todas (las del filtro de seguridad)</option>
            {coins.map((c) => (
              <option key={c.symbol} value={c.symbol}>
                {c.name} ({c.base}/USDT)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Velas" className="col-span-3 lg:col-span-1">
          <select name="i" defaultValue={interval} className="input">
            {(Object.keys(BT_INTERVALS) as BtInterval[]).map((k) => (
              <option key={k} value={k}>
                {BT_INTERVALS[k].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ganancia %">
          <input name="tp" inputMode="decimal" defaultValue={params.tp} className="input tabular" />
        </Field>
        <Field label="Stop loss %">
          <input name="sl" inputMode="decimal" defaultValue={params.sl} className="input tabular" />
        </Field>
        <Field label="Máx. velas">
          <input name="max" inputMode="numeric" defaultValue={params.maxBars} className="input tabular" />
        </Field>
        <button className="col-span-3 rounded-lg bg-sma20 px-6 py-2.5 font-semibold text-black active:opacity-80 lg:col-span-1">▶ Probar</button>
      </form>

      {symbol === 'ALL' ? (
        <AllCoins coins={coins} interval={interval} params={params} query={query} />
      ) : (
        <OneCoin symbol={symbol} name={coins.find((c) => c.symbol === symbol)?.name ?? symbol} interval={interval} params={params} />
      )}

      <p className="mt-6 text-xs text-muted">
        El pasado no garantiza el futuro: un buen backtest es el requisito para seguir a la etapa 2 (bot con dinero de mentira), no una promesa de ganancia.
      </p>
    </main>
  )
}

async function OneCoin({ symbol, name, interval, params }: { symbol: string; name: string; interval: BtInterval; params: Params }) {
  let bars
  try {
    bars = await getHistory(symbol, interval)
  } catch (e) {
    return <p className="mt-6 rounded-xl bg-down/15 p-4 text-down">No se pudo bajar el historial: {(e as Error).message}</p>
  }
  if (bars.length < 120) return <p className="mt-6 rounded-xl bg-panel p-4 text-muted">Esta moneda tiene muy poco historial para probar.</p>

  const result = runBacktest(bars, params)
  const s = result.stats
  const v = verdict(result)

  return (
    <>
      <section className={clsx('mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border p-4', v.className)}>
        <span className="text-2xl">{v.icon}</span>
        <p className="font-semibold">
          {name}: {v.text}
        </p>
        <p className="w-full text-sm opacity-80 sm:w-auto">
          del {date(s.from)} al {date(s.to)} · {BT_INTERVALS[interval].label.toLowerCase()}
        </p>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Ganancia del bot" className="col-span-2 lg:col-span-1">
          <p className={clsx('text-3xl font-semibold', tone(s.total))}>
            {money(s.total)} <span className="text-base font-normal text-muted">USDT</span>
          </p>
          <p className="text-xs text-muted">usando 100 USDT por operación</p>
        </Tile>
        <Tile label="Comprar y no tocar">
          <p className={clsx('text-2xl font-semibold', tone(s.buyHold))}>{money(s.buyHold)}</p>
          <p className="text-xs text-muted">USDT con 100 al inicio</p>
        </Tile>
        <Tile label="Operaciones">
          <p className="text-2xl font-semibold">{s.trades}</p>
          <p className="text-xs text-muted">
            {s.wins} ganadas · {s.losses} perdidas ({s.winRate.toFixed(0)}% aciertos)
          </p>
        </Tile>
        <Tile label="Peor caída">
          <p className="text-2xl font-semibold text-down">−{s.maxDrawdown.toFixed(2)}</p>
          <p className="text-xs text-muted">USDT perdidos desde su mejor momento</p>
        </Tile>
        <Tile label="Peor racha">
          <p className="text-2xl font-semibold">{s.worstStreak}</p>
          <p className="text-xs text-muted">pérdidas seguidas · promedio {pctText(s.avgWin)} / {pctText(s.avgLoss)}</p>
        </Tile>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Dónde habría comprado y vendido" subtitle="Flecha azul = compra · verde/roja = venta con ganancia/pérdida · mueve y haz zoom" className="xl:col-span-2">
          <BacktestChart bars={bars} trades={result.trades} />
        </Card>
        <Card title="Ganancia acumulada del bot" subtitle="Cómo habría crecido (o caído) operación por operación">
          {result.trades.length ? (
            <PnlChart points={result.trades.map((t) => ({ time: t.exitTime, pnl: t.pnl }))} start={s.from} />
          ) : (
            <p className="rounded-xl bg-bg p-4 text-sm text-muted">El bot no habría hecho ninguna operación.</p>
          )}
        </Card>
      </div>

      <Card title={`Operaciones (${result.trades.length})`} subtitle="De la más nueva a la más vieja" className="mt-4">
        <TradesTable trades={result.trades} />
      </Card>
    </>
  )
}

async function AllCoins({
  coins,
  interval,
  params,
  query,
}: {
  coins: { symbol: string; base: string; name: string }[]
  interval: BtInterval
  params: Params
  query: (s: string) => string
}) {
  const rows = (
    await Promise.all(
      coins.map(async (c) => {
        try {
          const bars = await getHistory(c.symbol, interval)
          return bars.length < 120 ? null : { ...c, result: runBacktest(bars, params) }
        } catch {
          return null
        }
      }),
    )
  )
    .filter((r) => r !== null)
    .sort((a, b) => b.result.stats.total - a.result.stats.total)

  const winners = rows.filter((r) => r.result.stats.total > 0).length
  const beatHold = rows.filter((r) => r.result.stats.total > r.result.stats.buyHold && r.result.stats.total > 0).length
  const sum = rows.reduce((s, r) => s + r.result.stats.total, 0)

  return (
    <>
      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Monedas probadas">
          <p className="text-2xl font-semibold">{rows.length}</p>
        </Tile>
        <Tile label="Ganó plata en">
          <p className={clsx('text-2xl font-semibold', winners > rows.length / 2 ? 'text-up' : 'text-down')}>
            {winners} de {rows.length}
          </p>
        </Tile>
        <Tile label="Le ganó a comprar y no tocar en">
          <p className="text-2xl font-semibold">
            {beatHold} de {rows.length}
          </p>
        </Tile>
        <Tile label="Suma de todas">
          <p className={clsx('text-2xl font-semibold', tone(sum))}>{money(sum)}</p>
          <p className="text-xs text-muted">USDT (100 por operación en cada moneda)</p>
        </Tile>
      </section>

      <Card title="Resultado por moneda" subtitle="Toca una moneda para ver sus operaciones en el gráfico" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="py-2 font-normal">Moneda</th>
                <th className="py-2 text-right font-normal">Operaciones</th>
                <th className="py-2 text-right font-normal">Aciertos</th>
                <th className="py-2 text-right font-normal">Ganancia del bot</th>
                <th className="py-2 text-right font-normal">Peor caída</th>
                <th className="py-2 text-right font-normal">Comprar y no tocar</th>
                <th className="py-2 pl-3 font-normal">Veredicto</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map((r) => {
                const s = r.result.stats
                const v = verdict(r.result)
                return (
                  <tr key={r.symbol} className="border-b border-border last:border-0">
                    <td className="py-2">
                      <Link href={query(r.symbol)} className="flex items-center gap-2 font-medium hover:underline">
                        <CoinIcon base={r.base} size={22} /> {r.name}
                      </Link>
                    </td>
                    <td className="py-2 text-right">{s.trades}</td>
                    <td className="py-2 text-right">{s.winRate.toFixed(0)}%</td>
                    <td className={clsx('py-2 text-right font-semibold', tone(s.total))}>{money(s.total)}</td>
                    <td className="py-2 text-right text-down">−{s.maxDrawdown.toFixed(1)}</td>
                    <td className={clsx('py-2 text-right', tone(s.buyHold))}>{money(s.buyHold)}</td>
                    <td className="py-2 pl-3 whitespace-nowrap">
                      {v.icon} <span className="text-muted">{v.text}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

function TradesTable({ trades }: { trades: Trade[] }) {
  const list = [...trades].reverse().slice(0, 60)
  if (!list.length) return <p className="rounded-xl bg-bg p-4 text-sm text-muted">El bot no habría hecho ninguna operación.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead className="text-left text-muted">
          <tr className="border-b border-border">
            <th className="py-2 font-normal">Compra</th>
            <th className="py-2 text-right font-normal">Precio</th>
            <th className="py-2 pl-4 font-normal">Venta</th>
            <th className="py-2 text-right font-normal">Precio</th>
            <th className="py-2 pl-4 font-normal">Por qué vendió</th>
            <th className="py-2 text-right font-normal">Resultado</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {list.map((t) => (
            <tr key={t.entryTime} className="border-b border-border last:border-0">
              <td className="py-2 text-muted">{when(t.entryTime)}</td>
              <td className="py-2 text-right">{fmt(t.entry)}</td>
              <td className="py-2 pl-4 text-muted">{when(t.exitTime)}</td>
              <td className="py-2 text-right">{fmt(t.exit)}</td>
              <td className="py-2 pl-4">{REASON[t.reason]}</td>
              <td className={clsx('py-2 text-right font-semibold', tone(t.pnl))}>
                {money(t.pnl)} <span className="font-normal">({pctText(t.pnlPct)})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={clsx('block min-w-0 text-sm text-muted', className)}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
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
