'use client'

import { useEffect, useRef } from 'react'
import { ColorType, createChart, LineSeries, LineType, type UTCTimestamp } from 'lightweight-charts'
import { COLORS } from './price-chart'

// El gráfico muestra la hora en UTC: corremos −4 h para ver fechas de Bolivia
const LA_PAZ_OFFSET = -4 * 3600
const PANEL = '#171b23' // mismo fondo que la tarjeta, para que el gráfico no se vea como un recuadro aparte

/** Ganancia acumulada: empieza en 0 y sube o baja con cada venta (escalón por venta) */
export function PnlChart({
  points = [],
  equity,
  start,
}: {
  points?: { time: number; pnl: number }[] // ganancia de cada venta (se va sumando)
  equity?: { time: number; value: number }[] // o la ganancia ya acumulada en cada momento
  start: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const chart = createChart(ref.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: PANEL }, textColor: COLORS.muted, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: COLORS.grid } },
      timeScale: { timeVisible: false, borderVisible: false },
      rightPriceScale: { borderVisible: false },
      handleScroll: { vertTouchDrag: false },
      localization: { priceFormatter: (p: number) => `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(2)}` },
    })
    const series = chart.addSeries(LineSeries, {
      color: COLORS.sma50,
      lineWidth: 2,
      lineType: LineType.WithSteps,
      priceLineVisible: false,
      crosshairMarkerRadius: 5,
    })

    // Una fecha solo puede tener un punto: juntamos las ventas del mismo segundo
    const data: { time: UTCTimestamp; value: number }[] = [{ time: (Math.floor(start / 1000) + LA_PAZ_OFFSET) as UTCTimestamp, value: 0 }]
    let total = 0
    const steps = equity ?? [...points].sort((a, b) => a.time - b.time).map((p) => ({ time: p.time, value: (total += p.pnl) }))
    for (const p of steps) {
      const time = (Math.floor(p.time / 1000) + LA_PAZ_OFFSET) as UTCTimestamp
      const last = data[data.length - 1]
      if (time <= last.time) last.value = p.value
      else data.push({ time, value: p.value })
    }
    series.setData(data)
    // Línea del cero: arriba = ganando, abajo = perdiendo
    series.createPriceLine({ price: 0, color: COLORS.muted, lineWidth: 1, lineStyle: 0, axisLabelVisible: false })
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [points, equity, start])

  return <div ref={ref} className="h-64 w-full lg:h-72" />
}
