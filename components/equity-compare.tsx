'use client'

import { useEffect, useRef } from 'react'
import { ColorType, createChart, LineSeries, type UTCTimestamp } from 'lightweight-charts'
import { COLORS } from '@/lib/colors'

const PANEL = '#171b23'
const LA_PAZ_OFFSET = -4 * 3600

export type Curve = { label: string; color: string; points: { time: number; value: number }[]; dashed?: boolean }

/** Varias curvas de "cuánto vale la cartera" en el mismo gráfico, con su leyenda */
export function EquityCompare({ curves }: { curves: Curve[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const chart = createChart(ref.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: PANEL }, textColor: COLORS.muted, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: COLORS.grid } },
      timeScale: { borderVisible: false },
      rightPriceScale: { borderVisible: false },
      handleScroll: { vertTouchDrag: false },
      localization: { priceFormatter: (p: number) => p.toFixed(0) },
    })
    for (const c of curves) {
      const seen = new Set<number>()
      const data = c.points
        .map((p) => ({ time: (Math.floor(p.time / 1000) + LA_PAZ_OFFSET) as UTCTimestamp, value: p.value }))
        .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)))
      chart.addSeries(LineSeries, { color: c.color, lineWidth: 2, lineStyle: c.dashed ? 2 : 0, priceLineVisible: false, title: '' }).setData(data)
    }
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [curves])

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {curves.map((c) => (
          <li key={c.label} className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-5 rounded" style={{ background: c.color, opacity: c.dashed ? 0.7 : 1 }} />
            {c.label}
          </li>
        ))}
      </ul>
      <div ref={ref} className="h-72 w-full lg:h-96" />
    </div>
  )
}
