import Link from 'next/link'
import clsx from 'clsx'
import { fmt, isUsdtSymbol, type Bar } from '@/lib/binance'
import { defaultParams, runStrategy, STRATEGIES, type BtInterval, type Params, type Result, type Strategy, type Trade } from '@/lib/backtest'
import { BT_INTERVALS, getHistory } from '@/lib/history'
import { getMarket } from '@/lib/market'
import { PageHeader } from '@/components/page-header'
import { BacktestChart } from '@/components/backtest-chart'
import { PnlChart } from '@/components/pnl-chart'
import { CoinIcon } from '@/components/coin-icon'
import { BotForm } from '@/components/bot-form'
import { BotTabs } from '@/components/bot-tabs'

export const metadata = { title: 'Bot · Trading' }

const TZ = 'America/La_Paz'
const ALL_STRATEGIES = Object.keys(STRATEGIES) as Strategy[]
const money = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`
const pctText = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`
const tone = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted')
const date = (ms: number) => new Date(ms).toLocaleDateString('es-BO', { timeZone: TZ, day: 'numeric', month: 'short', year: '2-digit' })
const when = (ms: number) => new Date(ms).toLocaleString('es-BO', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const median = (list: number[]) => {
  const sorted = [...list].sort((a, b) => a - b)
  const m = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2
}

const REASON: Record<Trade['reason'], string> = { tp: 'Llegó a la ganancia', sl: 'Stop loss', time: 'Tiempo', cross: 'Terminó la subida', open: 'Sigue comprado (precio de hoy)', rule: 'Su regla de venta' }

type Search = { s?: string; i?: string; st?: string; tp?: string; sl?: string; max?: string; dip?: string }

function readParams(q: Search) {
  const interval: BtInterval = q.i === '1d' ? '1d' : '4h'
  const strategy: Strategy = q.st && q.st in STRATEGIES ? (q.st as Strategy) : 'bounce'
  const def = defaultParams(strategy, interval)
  const num = (v: string | undefined, d: number, min: number, max: number) => {
    const n = Number(String(v ?? '').replace(',', '.'))
    return v !== undefined && Number.isFinite(n) && n >= min && n <= max ? n : d
  }
  const params: Params = {
    tp: num(q.tp, def.tp, 0.3, 50),
    // En tu estrategia el stop loss puede ser 0 (sin stop)
    sl: num(q.sl, def.sl, strategy === 'dip' ? 0 : 0.3, 50),
    maxBars: Math.round(num(q.max, def.maxBars, 1, 500)),
    dip: num(q.dip, def.dip, 0.1, 30),
    stake: 100,
  }
  const symbol = q.s === 'ALL' ? 'ALL' : q.s && isUsdtSymbol(q.s) ? q.s : 'BNBUSDT'
  return { symbol, interval, strategy, params }
}

/** El veredicto en palabras: ¿sirve esta estrategia en esta moneda? */
function verdict(r: Result) {
  const { total, buyHold, trades } = r.stats
  if (r.strategy !== 'dca' && r.strategy !== 'rebal' && trades < 5) return { icon: '🤷', text: 'Muy pocas operaciones para sacar conclusiones', className: 'border-border text-muted' }
  if (total <= 0) return { icon: '❌', text: 'Perdió plata', className: 'border-down/40 bg-down/10 text-down' }
  if (total < buyHold) return { icon: '⚠️', text: 'Ganó, pero menos que comprar y no tocar', className: 'border-sma20/40 bg-sma20/10 text-sma20' }
  return { icon: '✅', text: 'Ganó más que comprar y no tocar', className: 'border-up/40 bg-up/10 text-up' }
}

export default async function BotPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { symbol, interval, strategy, params } = readParams(await searchParams)
  const market = await getMarket().catch(() => ({ coins: [], rejected: [] }))
  const coins = market.coins.map((c) => ({ symbol: c.symbol, base: c.base, name: c.name }))
  if (symbol !== 'ALL' && !coins.some((c) => c.symbol === symbol)) coins.unshift({ symbol, base: symbol.replace('USDT', ''), name: symbol.replace('USDT', '') })
  const link = (s: string, st: Strategy = strategy) => `/bot?st=${st}&s=${s}&i=${interval}`

  return (
    <main className="safe-top mx-auto w-full max-w-screen-2xl px-4 py-6 md:px-6">
      <PageHeader title="Bot · Probar estrategias" subtitle="Etapa 1: backtest. ¿Cuánto habría ganado cada estrategia en el pasado?" />
      <BotTabs current="test" />

      <details className="group mt-4 rounded-2xl border border-border bg-panel">
        <summary className="cursor-pointer list-none p-4 text-sm font-medium marker:hidden">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          🤖 Cómo decide cada estrategia
        </summary>
        <div className="grid gap-4 px-4 pb-4 text-sm leading-relaxed text-muted md:grid-cols-3">
          {ALL_STRATEGIES.map((s) => (
            <div key={s}>
              <p className="font-semibold text-text">
                {STRATEGIES[s].emoji} {STRATEGIES[s].label}
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {STRATEGIES[s].how.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          ))}
          <p className="md:col-span-3">
            Todas usan <b className="text-text">100 USDT</b>, cobran 0,1% de comisión al comprar y al vender, y se comparan con{' '}
            <b className="text-text">&quot;comprar y no tocar&quot;</b>: comprar 100 USDT al inicio y esperar. Si una estrategia gana menos que eso, no vale la pena el esfuerzo ni el riesgo.
          </p>
        </div>
      </details>

      <BotForm coins={coins} symbol={symbol} interval={interval} strategy={strategy} params={params} />

      {symbol === 'ALL' ? (
        <AllCoins coins={coins} interval={interval} link={link} />
      ) : (
        <OneCoin
          symbol={symbol}
          name={coins.find((c) => c.symbol === symbol)?.name ?? symbol}
          interval={interval}
          strategy={strategy}
          params={params}
          link={link}
        />
      )}

      <p className="mt-6 text-xs text-muted">
        El pasado no garantiza el futuro: un buen backtest es el requisito para seguir a la etapa 2 (bot con dinero de mentira), no una promesa de ganancia.
        Ojo: si pruebas muchas combinaciones hasta que una gane, puede ser casualidad.
      </p>
    </main>
  )
}

// ===== Una moneda: comparación de las 3 + detalle de la elegida =====

async function OneCoin({
  symbol,
  name,
  interval,
  strategy,
  params,
  link,
}: {
  symbol: string
  name: string
  interval: BtInterval
  strategy: Strategy
  params: Params
  link: (s: string, st?: Strategy) => string
}) {
  let bars: Bar[]
  try {
    bars = await getHistory(symbol, interval)
  } catch (e) {
    return <p className="mt-6 rounded-xl bg-down/15 p-4 text-down">No se pudo bajar el historial: {(e as Error).message}</p>
  }
  if (bars.length < 120) return <p className="mt-6 rounded-xl bg-panel p-4 text-muted">Esta moneda tiene muy poco historial para probar.</p>

  const result = runStrategy(bars, strategy, params, interval)
  // Todas con su configuración recomendada, para compararlas en igualdad de condiciones
  const compare = ALL_STRATEGIES.map((s) => runStrategy(bars, s, defaultParams(s, interval), interval))
  const s = result.stats
  const v = verdict(result)
  const isDca = strategy === 'dca' || strategy === 'rebal'

  return (
    <>
      <Comparison name={name} results={compare} buyHold={s.buyHold} current={strategy} link={(st) => link(symbol, st)} />

      <section className={clsx('mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border p-4', v.className)}>
        <span className="text-2xl">{v.icon}</span>
        <p className="font-semibold">
          {STRATEGIES[strategy].emoji} {STRATEGIES[strategy].label} en {name}: {v.text}
        </p>
        <p className="w-full text-sm opacity-80 sm:w-auto">
          del {date(s.from)} al {date(s.to)} · {BT_INTERVALS[interval].label.toLowerCase()}
        </p>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Ganancia de la estrategia" className="col-span-2 lg:col-span-1">
          <p className={clsx('text-3xl font-semibold', tone(s.total))}>
            {money(s.total)} <span className="text-base font-normal text-muted">USDT</span>
          </p>
          <p className="text-xs text-muted">{strategy === 'rebal' ? 'con 100 USDT, mitad moneda y mitad USDT' : isDca ? 'con 100 USDT repartidos en compras semanales' : 'usando 100 USDT por operación'}</p>
        </Tile>
        <Tile label="Comprar y no tocar">
          <p className={clsx('text-2xl font-semibold', tone(s.buyHold))}>{money(s.buyHold)}</p>
          <p className="text-xs text-muted">USDT con 100 al inicio</p>
        </Tile>
        {strategy === 'rebal' ? (
          <Tile label="Rebalanceos">
            <p className="text-2xl font-semibold">1 por semana</p>
            <p className="text-xs text-muted">vuelve al 50/50 cada semana</p>
          </Tile>
        ) : isDca ? (
          <Tile label="Compras">
            <p className="text-2xl font-semibold">{s.trades}</p>
            <p className="text-xs text-muted">de {(100 / s.trades).toFixed(2)} USDT, una por semana</p>
          </Tile>
        ) : (
          <Tile label="Operaciones">
            <p className="text-2xl font-semibold">{s.trades}</p>
            <p className="text-xs text-muted">
              {s.wins} ganadas · {s.losses} perdidas ({s.winRate.toFixed(0)}% aciertos)
            </p>
          </Tile>
        )}
        <Tile label="Peor caída">
          <p className="text-2xl font-semibold text-down">−{s.maxDrawdown.toFixed(2)}</p>
          <p className="text-xs text-muted">USDT perdidos desde su mejor momento</p>
        </Tile>
        {isDca ? (
          <Tile label="Sin vender nunca">
            <p className="text-2xl font-semibold">—</p>
            <p className="text-xs text-muted">no hay rachas: solo junta y espera</p>
          </Tile>
        ) : (
          <Tile label="Peor racha">
            <p className="text-2xl font-semibold">{s.worstStreak}</p>
            <p className="text-xs text-muted">
              pérdidas seguidas · promedio {pctText(s.avgWin)} / {pctText(s.avgLoss)}
            </p>
          </Tile>
        )}
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card
          title={isDca ? 'El precio en ese tiempo' : 'Dónde habría comprado y vendido'}
          subtitle={isDca ? 'Las compras semanales no se marcan: son todas las semanas' : 'Flecha azul = compra · verde/roja = venta con ganancia/pérdida · mueve y haz zoom'}
          className="xl:col-span-2"
        >
          <BacktestChart bars={bars} trades={result.trades} />
        </Card>
        <Card title="Ganancia acumulada" subtitle="Cómo habría crecido (o caído) con el tiempo">
          <PnlChart equity={result.equity} start={s.from} />
        </Card>
      </div>

      {!isDca && (
        <Card title={`Operaciones (${result.trades.length})`} subtitle="De la más nueva a la más vieja" className="mt-4">
          <TradesTable trades={result.trades} />
        </Card>
      )}
    </>
  )
}

/** Barras horizontales: cuánto ganó cada estrategia vs "no tocar", con el cero al medio */
function Comparison({
  name,
  results,
  buyHold,
  current,
  link,
}: {
  name: string
  results: Result[]
  buyHold: number
  current: Strategy
  link: (st: Strategy) => string
}) {
  const rows = [
    ...results.map((r) => ({ key: r.strategy as string, label: `${STRATEGIES[r.strategy].emoji} ${STRATEGIES[r.strategy].label}`, total: r.stats.total, href: link(r.strategy) })),
    { key: 'hold', label: '💤 Comprar y no tocar', total: buyHold, href: null },
  ].sort((a, b) => b.total - a.total)
  const max = Math.max(...rows.map((r) => Math.abs(r.total)), 1)
  const best = rows[0]

  return (
    <Card title={`¿Qué estrategia funcionó mejor en ${name}?`} subtitle="Todas con su configuración recomendada · toca una para ver su detalle" className="mt-4">
      <ul className="space-y-2">
        {rows.map((r) => {
          const w = (Math.abs(r.total) / max) * 50
          const body = (
            <>
              <span className="w-full shrink-0 text-sm sm:w-72">
                {r.label}
                {r === best && <span className="ml-1.5 whitespace-nowrap rounded bg-sma20/15 px-1.5 py-0.5 text-xs text-sma20">★ la mejor</span>}
              </span>
              {/* Barra con el cero al medio: verde a la derecha si ganó, roja a la izquierda si perdió */}
              <span className="relative h-5 flex-1">
                <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                <span
                  className={clsx('absolute inset-y-0.5 rounded', r.total >= 0 ? 'bg-up' : 'bg-down', r.key === 'hold' && 'opacity-50')}
                  style={r.total >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
                />
              </span>
              <span className={clsx('tabular w-20 shrink-0 text-right text-sm font-semibold', tone(r.total))}>{money(r.total)}</span>
            </>
          )
          return (
            <li key={r.key}>
              {r.href ? (
                <Link href={r.href} className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 hover:bg-bg sm:flex-nowrap', r.key === current && 'bg-bg ring-1 ring-sma20/50')}>
                  {body}
                </Link>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 sm:flex-nowrap">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">USDT ganados o perdidos con 100 USDT.</p>
    </Card>
  )
}

// ===== Todas las monedas: qué estrategia funciona en cada una =====

async function AllCoins({
  coins,
  interval,
  link,
}: {
  coins: { symbol: string; base: string; name: string }[]
  interval: BtInterval
  link: (s: string, st?: Strategy) => string
}) {
  const rows = (
    await Promise.all(
      coins.map(async (c) => {
        try {
          const bars = await getHistory(c.symbol, interval)
          if (bars.length < 120) return null
          const results = Object.fromEntries(ALL_STRATEGIES.map((s) => [s, runStrategy(bars, s, defaultParams(s, interval), interval)])) as Record<Strategy, Result>
          const hold = results.bounce.stats.buyHold
          const best = [...ALL_STRATEGIES].sort((a, b) => results[b].stats.total - results[a].stats.total)[0]
          return { ...c, results, hold, best: results[best].stats.total > hold ? best : ('hold' as const) }
        } catch {
          return null
        }
      }),
    )
  )
    .filter((r) => r !== null)
    .sort((a, b) => Math.max(...ALL_STRATEGIES.map((s) => b.results[s].stats.total)) - Math.max(...ALL_STRATEGIES.map((s) => a.results[s].stats.total)))

  return (
    <>
      {/* Resumen: en cuántas monedas fue la mejor, y el resultado típico (la mediana). No sumamos: una sola moneda
          que se disparó (como Zcash, que subió ~37 veces) arrastraría la suma y daría una idea equivocada. */}
      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...ALL_STRATEGIES, 'hold' as const].map((s) => {
          const value = (r: (typeof rows)[number]) => (s === 'hold' ? r.hold : r.results[s].stats.total)
          const bestIn = rows.filter((r) => r.best === s).length
          const won = rows.filter((r) => value(r) > 0).length
          const typical = median(rows.map(value))
          const label = s === 'hold' ? '💤 Comprar y no tocar' : `${STRATEGIES[s].emoji} ${STRATEGIES[s].label}`
          return (
            <Tile key={s} label={label}>
              <p className="text-2xl font-semibold">
                ★ {bestIn} <span className="text-base font-normal text-muted">de {rows.length} monedas</span>
              </p>
              <p className="text-xs text-muted">
                fue la mejor · ganó plata en {won} · resultado típico{' '}
                <span className={tone(typical)}>{money(typical)}</span>
              </p>
            </Tile>
          )
        })}
      </section>

      <Card title="Resultado por moneda" subtitle="USDT ganados con 100 USDT · ★ = lo que mejor funcionó · toca una moneda para ver el detalle" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-160 text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="py-2 font-normal">Moneda</th>
                {ALL_STRATEGIES.map((s) => (
                  <th key={s} className="py-2 text-right font-normal">
                    {STRATEGIES[s].emoji} {STRATEGIES[s].short}
                  </th>
                ))}
                <th className="py-2 text-right font-normal">💤 No tocar</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map((r) => (
                <tr key={r.symbol} className="border-b border-border last:border-0">
                  <td className="py-2">
                    <Link href={link(r.symbol, r.best === 'hold' ? 'bounce' : r.best)} className="flex items-center gap-2 font-medium hover:underline">
                      <CoinIcon base={r.base} size={22} /> {r.name}
                    </Link>
                  </td>
                  {ALL_STRATEGIES.map((s) => (
                    <td key={s} className={clsx('py-2 text-right', tone(r.results[s].stats.total), r.best === s && 'font-semibold')}>
                      {r.best === s && <span className="mr-1 text-sma20">★</span>}
                      {money(r.results[s].stats.total)}
                    </td>
                  ))}
                  <td className={clsx('py-2 text-right', tone(r.hold), r.best === 'hold' && 'font-semibold')}>
                    {r.best === 'hold' && <span className="mr-1 text-sma20">★</span>}
                    {money(r.hold)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

function TradesTable({ trades }: { trades: Trade[] }) {
  const list = [...trades].reverse().slice(0, 60)
  if (!list.length) return <p className="rounded-xl bg-bg p-4 text-sm text-muted">La estrategia no habría hecho ninguna operación.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-150 text-sm">
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
