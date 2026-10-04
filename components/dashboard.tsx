'use client'

import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { fmt, get24hChange, INTERVALS, SYMBOLS, type Interval, type Symbol } from '@/lib/binance'
import { analyze, type Analysis } from '@/lib/analysis'
import { PriceChart } from './price-chart'
import { Simulator } from './simulator'
import { AnalysisSheet, type SheetState } from './analysis-sheet'

export function Dashboard({ initialSymbol = 'BTCUSDT' }: { initialSymbol?: Symbol }) {
  const [symbol, setSymbol] = useState<Symbol>(initialSymbol)
  const [interval, setChartInterval] = useState<Interval>('1h')
  const [price, setPrice] = useState<number | null>(null)
  const [change, setChange] = useState<number | null>(null)
  const [stale, setStale] = useState(false)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [highlight, setHighlight] = useState<Analysis | null>(null)

  useEffect(() => {
    let cancelled = false
    get24hChange(symbol)
      .then((t) => {
        if (cancelled) return
        setChange(t.change)
        setStale(t.stale)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [symbol])

  useEffect(() => {
    if (price) document.title = `${fmt(price)} ${symbol}`
  }, [price, symbol])

  function changeSymbol(s: Symbol) {
    setSymbol(s)
    setPrice(null)
    setChange(null)
    setStale(false)
    setHighlight(null)
  }

  function changeInterval(i: Interval) {
    setChartInterval(i)
    setHighlight(null)
  }

  async function openAnalysis() {
    setSheet({ status: 'loading' })
    try {
      setSheet({ status: 'ready', analysis: await analyze(symbol) })
    } catch {
      setSheet({ status: 'error' })
    }
  }

  function showOnChart() {
    if (sheet?.status !== 'ready') return
    // El análisis es con velas de 1 día, así que cambiamos el gráfico a 1d
    setChartInterval('1d')
    setHighlight(sheet.analysis)
    setSheet(null)
  }

  const closeSheet = useCallback(() => setSheet(null), [])

  return (
    <div className="flex flex-1 flex-col md:min-h-0">
      <header className="safe-top sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
        <div className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-3">
          <div className="flex items-center gap-3 md:contents">
            <Segmented options={symbolOptions(symbol)} value={symbol} onChange={changeSymbol} />
            <div className="tabular ml-auto text-right leading-tight md:order-last">
              <div className="text-lg font-semibold md:text-xl">{price ? fmt(price) : '—'}</div>
              {change !== null && (
                <div className={clsx('text-xs md:text-sm', change >= 0 ? 'text-up' : 'text-down')}>
                  {change >= 0 ? '+' : ''}
                  {change.toFixed(2)}% 24h
                </div>
              )}
            </div>
          </div>
          <Segmented options={INTERVALS.map((i) => ({ value: i, label: i }))} value={interval} onChange={changeInterval} />
        </div>
      </header>

      {stale && (
        <p className="mx-4 mt-3 rounded-xl bg-down/15 p-3 text-sm text-down">
          ⚠️ Binance pausó o eliminó el par {symbol.replace('USDT', '/USDT')}: no se puede comprar ni vender, y el precio que ves está congelado.
        </p>
      )}

      <main className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        <section className="h-[58svh] shrink-0 md:h-auto md:min-w-0 md:flex-1">
          <PriceChart symbol={symbol} interval={interval} highlight={highlight} onPrice={setPrice} />
        </section>

        <aside className="safe-bottom border-t border-border bg-panel px-4 pt-4 pb-6 md:w-80 md:overflow-y-auto md:border-t-0 md:border-l">
          <button
            onClick={openAnalysis}
            className="w-full rounded-lg bg-[#2b3345] py-3 font-semibold hover:bg-[#343e54] active:bg-[#343e54]"
          >
            📊 Analizar últimos 2 meses
          </button>
          {highlight && (
            <button onClick={() => setHighlight(null)} className="mt-1 w-full py-2 text-sm text-muted underline">
              Quitar marcas del gráfico
            </button>
          )}

          <div className="mt-5">
            <Simulator symbol={symbol} price={price} />
          </div>
        </aside>
      </main>

      {sheet && <AnalysisSheet state={sheet} onClose={closeSheet} onShowOnChart={showOnChart} />}
    </div>
  )
}

// Los 4 accesos rápidos + la moneda abierta desde Mercado, si no es una de ellas
function symbolOptions(current: Symbol) {
  const list = SYMBOLS.map((s) => ({ value: s.value as Symbol, label: s.label as string }))
  if (!list.some((s) => s.value === current)) list.push({ value: current, label: current.replace('USDT', '') })
  return list
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={clsx('flex rounded-lg border border-border bg-panel p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            o.value === value ? 'bg-border text-text' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
