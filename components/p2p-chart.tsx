'use client'

import { useEffect, useRef } from 'react'
import { CandlestickSeries, ColorType, createChart, LineSeries } from 'lightweight-charts'
import type { Bar } from '@/lib/binance'
import { sma } from '@/lib/indicators'
import { COLORS } from '@/lib/colors'

const PRICE = { type: 'price' as const, precision: 3, minMove: 0.001 }

/** Velas del precio del USDT en Bs, con la línea amarilla (20 velas) y la azul (50 velas), igual que el gráfico de BTC */
export function P2PChart({ candles }: { candles: Bar[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const chart = createChart(ref.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: COLORS.bg }, textColor: COLORS.muted, attributionLogo: false },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      timeScale: { timeVisible: true, secondsVisible: false },
      handleScroll: { vertTouchDrag: false },
    })
    chart
      .addSeries(CandlestickSeries, {
        upColor: COLORS.up,
        downColor: COLORS.down,
        borderVisible: false,
        wickUpColor: COLORS.up,
        wickDownColor: COLORS.down,
        priceFormat: PRICE,
      })
      .setData(candles)
    if (candles.length >= 20)
      chart.addSeries(LineSeries, { color: COLORS.sma20, lineWidth: 1, title: 'SMA 20', priceFormat: PRICE }).setData(sma(candles, 20))
    if (candles.length >= 50)
      chart.addSeries(LineSeries, { color: COLORS.sma50, lineWidth: 1, title: 'SMA 50', priceFormat: PRICE }).setData(sma(candles, 50))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [candles])

  return <div ref={ref} className="h-72 w-full md:h-96" />
}
