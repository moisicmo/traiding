'use client'

import { useEffect, useRef } from 'react'
import { ColorType, createChart, LineSeries, type UTCTimestamp } from 'lightweight-charts'
import { COLORS } from './price-chart'

type Point = { ts: number; buy: number; sell: number }

// El gráfico muestra la hora en UTC: corremos los tiempos −4 h para ver la hora de Bolivia
const LA_PAZ_OFFSET = -4 * 3600

export function P2PChart({ points }: { points: Point[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const chart = createChart(ref.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: COLORS.bg }, textColor: COLORS.muted, attributionLogo: false },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      timeScale: { timeVisible: true, secondsVisible: false },
      handleScroll: { vertTouchDrag: false },
      localization: { priceFormatter: (p: number) => p.toFixed(3) },
    })
    const toLine = (key: 'buy' | 'sell') =>
      points.map((p) => ({ time: (Math.floor(p.ts / 1000) + LA_PAZ_OFFSET) as UTCTimestamp, value: p[key] }))
    chart.addSeries(LineSeries, { color: COLORS.sma50, lineWidth: 2, title: 'Comprar' }).setData(toLine('buy'))
    chart.addSeries(LineSeries, { color: COLORS.up, lineWidth: 2, title: 'Vender' }).setData(toLine('sell'))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [points])

  return <div ref={ref} className="h-64 w-full md:h-80" />
}
