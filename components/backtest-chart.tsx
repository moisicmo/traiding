'use client'

import { useEffect, useRef } from 'react'
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, LineSeries, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts'
import type { Bar } from '@/lib/binance'
import type { Trade } from '@/lib/backtest'
import { sma } from '@/lib/indicators'
import { COLORS } from '@/lib/colors'

const PANEL = '#171b23'

/** Las velas con dónde habría comprado (flecha azul) y vendido el bot (verde si ganó, roja si perdió) */
export function BacktestChart({ bars, trades }: { bars: Bar[]; trades: Trade[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const chart = createChart(ref.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: PANEL }, textColor: COLORS.muted, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: COLORS.grid } },
      timeScale: { timeVisible: true, secondsVisible: false, borderVisible: false },
      rightPriceScale: { borderVisible: false },
      handleScroll: { vertTouchDrag: false },
    })
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderVisible: false,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    })
    candles.setData(bars)
    chart.addSeries(LineSeries, { color: COLORS.sma20, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }).setData(sma(bars, 20))
    chart.addSeries(LineSeries, { color: COLORS.sma50, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }).setData(sma(bars, 50))

    const markers: SeriesMarker<Time>[] = []
    for (const t of trades) {
      markers.push({ time: (t.entryTime / 1000) as UTCTimestamp, position: 'belowBar', shape: 'arrowUp', color: COLORS.sma50 })
      markers.push({
        time: (t.exitTime / 1000) as UTCTimestamp,
        position: 'aboveBar',
        shape: 'arrowDown',
        color: t.pnl > 0 ? COLORS.up : COLORS.down,
      })
    }
    createSeriesMarkers(candles, markers.sort((a, b) => (a.time as number) - (b.time as number)))

    // Empezamos mostrando los últimos ~3 meses; se puede mover y hacer zoom para ver todo
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 540), to: bars.length + 5 })
    return () => chart.remove()
  }, [bars, trades])

  return <div ref={ref} className="h-80 w-full lg:h-96" />
}
