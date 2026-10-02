'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts'
import { getKlines, signed, toBar, WS, type Bar, type Interval, type Symbol } from '@/lib/binance'
import { sma } from '@/lib/indicators'
import { AHEAD, FLAT, type Analysis, type Direction } from '@/lib/analysis'

export const COLORS = {
  bg: '#0f1218',
  grid: '#1c212b',
  muted: '#8a93a6',
  text: '#e6e8ec',
  up: '#26a69a',
  down: '#ef5350',
  sma20: '#f5c542',
  sma50: '#4c8dff',
}
const ODDS_MIN_W = 96 // ancho mínimo de la columna de probabilidades (px), para que se lea en el celular
const BOX_COLOR: Record<Direction, string> = { up: COLORS.up, down: COLORS.down, flat: COLORS.muted }

type Api = {
  chart: IChartApi
  candles: ISeriesApi<'Candlestick'>
  volume: ISeriesApi<'Histogram'>
  sma20: ISeriesApi<'Line'>
  sma50: ISeriesApi<'Line'>
  markers: ISeriesMarkersPluginApi<Time>
}

const volumeBar = (b: Bar) => ({
  time: b.time,
  value: b.volume,
  color: b.close >= b.open ? `${COLORS.up}55` : `${COLORS.down}55`,
})

type Props = {
  symbol: Symbol
  interval: Interval
  /** Análisis a dibujar encima del gráfico (cuadros, flechas, probabilidades) */
  highlight: Analysis | null
  onPrice: (price: number) => void
}

export function PriceChart({ symbol, interval, highlight, onPrice }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const api = useRef<Api | null>(null)
  const bars = useRef<Bar[]>([])
  const [loaded, setLoaded] = useState('') // "BTCUSDT-1h" cuando terminan de cargar esas velas
  const [error, setError] = useState(false)

  const onPriceRef = useRef(onPrice)
  useEffect(() => {
    onPriceRef.current = onPrice
  })

  // 1. Crear el gráfico una sola vez
  useEffect(() => {
    const chart = createChart(boxRef.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: COLORS.bg }, textColor: COLORS.muted, attributionLogo: false },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      timeScale: { timeVisible: true, secondsVisible: false },
      // En el celular, arrastrar hacia arriba/abajo mueve la página, no el gráfico
      handleScroll: { vertTouchDrag: false },
    })
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderVisible: false,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    })
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    // Medias móviles: el indicador más básico para ver la tendencia
    const sma20 = chart.addSeries(LineSeries, { color: COLORS.sma20, lineWidth: 1, title: 'SMA 20' })
    const sma50 = chart.addSeries(LineSeries, { color: COLORS.sma50, lineWidth: 1, title: 'SMA 50' })

    api.current = { chart, candles, volume, sma20, sma50, markers: createSeriesMarkers(candles, []) }
    return () => {
      chart.remove()
      api.current = null
    }
  }, [])

  // 2. Cargar el historial y escuchar el precio en vivo
  useEffect(() => {
    const a = api.current!
    let cancelled = false
    let socket: WebSocket | null = null

    getKlines(symbol, interval)
      .then((data) => {
        if (cancelled) return
        bars.current = data
        a.candles.setData(data)
        a.volume.setData(data.map(volumeBar))
        a.sma20.setData(sma(data, 20))
        a.sma50.setData(sma(data, 50))
        a.chart.timeScale().fitContent()
        onPriceRef.current(data[data.length - 1].close)
        setError(false)
        setLoaded(`${symbol}-${interval}`)

        // WebSocket: Binance nos empuja cada actualización de la vela en tiempo real
        socket = new WebSocket(`${WS}/${symbol.toLowerCase()}@kline_${interval}`)
        socket.onmessage = (msg) => {
          const k = JSON.parse(msg.data).k
          const bar = toBar([k.t, k.o, k.h, k.l, k.c, k.v])
          const list = bars.current
          if (list.length && list[list.length - 1].time === bar.time) list[list.length - 1] = bar
          else list.push(bar)

          a.candles.update(bar)
          a.volume.update(volumeBar(bar))
          const s20 = sma(list.slice(-20), 20)[0]
          const s50 = sma(list.slice(-50), 50)[0]
          if (s20) a.sma20.update(s20)
          if (s50) a.sma50.update(s50)
          onPriceRef.current(bar.close)
        }
      })
      .catch(() => !cancelled && setError(true))

    return () => {
      cancelled = true
      socket?.close()
    }
  }, [symbol, interval])

  // 3. Dibujar el análisis encima (solo cuando el gráfico ya muestra esa moneda en velas de 1 día)
  useEffect(() => {
    const a = api.current
    const canvas = overlayRef.current
    if (!a || !canvas) return
    const ready = highlight && loaded === `${highlight.symbol}-1d`
    if (!ready) {
      a.markers.setMarkers([])
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    a.markers.setMarkers(markersFor(highlight))
    // Los 60 días + espacio vacío a la derecha para la columna de probabilidades.
    // En pantallas chicas reservamos más velas vacías para que la columna tenga al menos ODDS_MIN_W px.
    const firstIdx = bars.current.findIndex((b) => b.time === highlight.days[0].time)
    const shown = bars.current.length - firstIdx + 3
    const plotW = boxRef.current!.clientWidth - a.chart.priceScale('right').width()
    const colPx = ODDS_MIN_W + 16
    const right = Math.max(AHEAD + 6, Math.ceil((shown * colPx) / Math.max(plotW - colPx, 50)))
    a.chart.timeScale().setVisibleLogicalRange({ from: firstIdx - 3, to: bars.current.length - 1 + right })

    // Redibuja en cada cuadro mientras haya marcas, así siguen al gráfico al moverlo o hacer zoom
    let frame = 0
    const loop = () => {
      drawOverlay(canvas, boxRef.current!, a, highlight)
      frame = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(frame)
  }, [highlight, loaded])

  return (
    <div className="relative h-full w-full">
      <div ref={boxRef} className="h-full w-full" />
      {/* La librería no trae rectángulos: dibujamos los cuadros en un canvas transparente encima */}
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 z-10" />
      {error && (
        <p className="absolute inset-x-4 top-4 z-20 rounded-lg bg-down/15 px-3 py-2 text-sm text-down">
          No se pudo conectar con Binance. Revisa tu internet.
        </p>
      )}
    </div>
  )
}

function markersFor(h: Analysis): SeriesMarker<Time>[] {
  const touchText = { rebotó: '✓ rebotó', cayó: '✗ cayó', pendiente: '?' }
  return [
    ...h.yellow.touches.map((t) => ({
      time: t.bar.time,
      position: 'belowBar' as const,
      color: COLORS.sma20,
      shape: 'arrowUp' as const,
      text: touchText[t.result],
    })),
    ...h.volume.top.map((b) => ({
      time: b.time,
      position: 'aboveBar' as const,
      color: COLORS.sma50,
      shape: 'circle' as const,
      text: 'Vol. alto',
    })),
  ].sort((x, y) => x.time - y.time)
}

// Convierte fecha → posición X y precio → posición Y con las funciones del gráfico
function drawOverlay(canvas: HTMLCanvasElement, container: HTMLDivElement, a: Api, h: Analysis) {
  const dpr = window.devicePixelRatio || 1
  const w = container.clientWidth
  const hgt = container.clientHeight
  if (canvas.width !== w * dpr || canvas.height !== hgt * dpr) {
    canvas.width = w * dpr
    canvas.height = hgt * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${hgt}px`
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, hgt)

  // Solo dentro del área de velas (no encima de los números de los ejes)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w - a.chart.priceScale('right').width(), hgt - a.chart.timeScale().height())
  ctx.clip()

  const ts = a.chart.timeScale()
  const half = ts.options().barSpacing / 2 + 2

  // Cuadros punteados de cada tramo
  h.stairs.blocks.forEach((b, i) => {
    const x1 = ts.timeToCoordinate(b.from.time)
    const x2 = ts.timeToCoordinate(b.to.time)
    const y1 = a.candles.priceToCoordinate(b.high)
    const y2 = a.candles.priceToCoordinate(b.low)
    if (x1 === null || x2 === null || y1 === null || y2 === null) return

    const color = BOX_COLOR[b.color]
    const x = x1 - half
    const y = y1 - 4
    const bw = x2 - x1 + half * 2
    const bh = y2 - y1 + 8
    ctx.fillStyle = `${color}18`
    ctx.fillRect(x, y, bw, bh)
    ctx.setLineDash([6, 4])
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, bw, bh)
    ctx.setLineDash([])

    // Etiqueta con fondo, debajo del cuadro para no tapar las marcas de arriba
    const label = `Tramo ${i + 1}`
    ctx.font = '600 12px system-ui, sans-serif'
    const tw = ctx.measureText(label).width
    const ly = y + bh + 3
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(x, ly, tw + 12, 18)
    ctx.strokeRect(x, ly, tw + 12, 18)
    ctx.fillStyle = color
    ctx.fillText(label, x + 6, ly + 13)
  })

  drawOdds(ctx, a, h, half)
  ctx.restore()
}

// Columna a la derecha de la última vela: 3 zonas (sube / igual / baja) con su probabilidad.
// La altura de cada zona es el movimiento "normal" que tuvo en el pasado.
function drawOdds(ctx: CanvasRenderingContext2D, a: Api, h: Analysis, half: number) {
  const o = h.odds
  if (o.n < 15) return
  const ts = a.chart.timeScale()
  const lastX = ts.timeToCoordinate(h.days[h.days.length - 1].time)
  if (lastX === null) return

  const x = lastX + half + 4
  const w = Math.max(ts.options().barSpacing * AHEAD, ODDS_MIN_W)
  const compact = w < 120 // en el celular: textos más cortos
  const p = h.price
  const zones = [
    { top: p * (1 + o.medUp / 100), bottom: p * (1 + FLAT / 100), color: COLORS.up, text: `↑ ${o.pUp.toFixed(0)}%${compact ? '' : ' sube'}`, sub: o.medUp },
    { top: p * (1 + FLAT / 100), bottom: p * (1 - FLAT / 100), color: COLORS.muted, text: `= ${o.pFlat.toFixed(0)}%`, sub: 0 },
    { top: p * (1 - FLAT / 100), bottom: p * (1 + o.medDown / 100), color: COLORS.down, text: `↓ ${o.pDown.toFixed(0)}%${compact ? '' : ' baja'}`, sub: o.medDown },
  ]

  const topY = a.candles.priceToCoordinate(zones[0].top)
  let headerY = topY === null ? null : topY - 6 // título "próximos 7 días" arriba de la columna
  for (const z of zones) {
    const y1 = a.candles.priceToCoordinate(z.top)
    const y2 = a.candles.priceToCoordinate(z.bottom)
    if (y1 === null || y2 === null) continue
    // Fondo sólido primero, para tapar las etiquetas del gráfico que queden debajo
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(x, y1, w, y2 - y1)
    ctx.fillStyle = `${z.color}30`
    ctx.fillRect(x, y1, w, y2 - y1)
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = z.color
    ctx.lineWidth = 1
    ctx.strokeRect(x, y1, w, y2 - y1)
    ctx.setLineDash([])

    // Texto dentro de la zona si cabe; si la zona es muy baja, justo arriba (sube) o abajo (baja)
    const sub = z.sub ? (compact ? signed(z.sub) : `normal ${signed(z.sub)}`) : ''
    const mid = (y1 + y2) / 2
    let line1 = sub ? mid - 2 : mid + 4
    if (sub && y2 - y1 < 30) {
      if (z.sub > 0) {
        line1 = y1 - 18
        headerY = y1 - 34
      } else {
        line1 = y2 + 14
      }
    }
    ctx.fillStyle = z.color === COLORS.muted ? COLORS.text : z.color
    ctx.font = '700 12px system-ui, sans-serif'
    ctx.fillText(z.text, x + 6, line1)
    if (sub) {
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillText(sub, x + 6, line1 + 14)
    }
  }
  if (headerY !== null) {
    ctx.fillStyle = COLORS.muted
    ctx.font = '11px system-ui, sans-serif'
    ctx.fillText(compact ? `en ${AHEAD} días` : `próximos ${AHEAD} días`, x + 2, headerY)
  }
}
