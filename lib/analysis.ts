// Análisis automático de los últimos 2 meses.
// Usa velas de 1 día y aplica, con reglas simples, las mismas ideas que se leen a ojo en el gráfico.
// No es IA ni una predicción: cada conclusión sale de una regla que puedes leer aquí abajo.
import { getKlines, type Bar, type Symbol } from './binance'
import { median, pct, smaAt } from './indicators'

export const DAYS = 60
export const AHEAD = 7 // probabilidades: cuántos días hacia adelante miramos
export const FLAT = 2 // moverse menos de ±2% cuenta como "quedó casi igual"

export type Direction = 'up' | 'down' | 'flat'

export type Block = { from: Bar; to: Bar; high: number; low: number; color: Direction }
export type Touch = { bar: Bar; result: 'rebotó' | 'cayó' | 'pendiente' }
export type YellowPlace = 'touching' | 'above' | 'far' | 'below'

export type Odds = {
  trend: 'alcista' | 'bajista'
  place: 'tocando' | 'encima' | 'debajo'
  n: number
  years: number
  pUp: number
  pFlat: number
  pDown: number
  medUp: number
  medDown: number
  baseUp: number
}

export type Analysis = {
  symbol: Symbol
  days: Bar[]
  price: number
  summary: { first: number; change: number; maxBar: Bar; minBar: Bar; fromMax: number }
  trend: { kind: Direction; s20: number; s50: number; slope: number }
  stairs: { kind: Direction; blocks: Block[] }
  yellow: { kind: YellowPlace; dist: number; touches: Touch[] }
  volume: { mostlyUp: boolean; top: Bar[] }
  odds: Odds
  verdict: string
}

export async function analyze(symbol: Symbol): Promise<Analysis> {
  // 1000 días (el máximo de Binance): los últimos 60 para el análisis
  // y todo el resto para buscar situaciones parecidas en el pasado
  const all = await getKlines(symbol, '1d', 1000)
  const start = all.length - DAYS
  const days = all.slice(start)
  const last = all.length - 1
  const price = all[last].close

  const trend = trendOf(all, last)
  const stairs = stairsOf(days)
  const yellow = yellowLine(all, start, last, price)

  return {
    symbol,
    days,
    price,
    summary: summary(days, price),
    trend,
    stairs,
    yellow,
    volume: volumeOf(days),
    odds: probabilities(all),
    verdict: verdict(trend.kind, stairs.kind, yellow.kind),
  }
}

// 1. ¿Cuánto subió o bajó? ¿Cuál fue lo más alto y lo más bajo?
function summary(days: Bar[], price: number) {
  const first = days[0].open
  let maxBar = days[0]
  let minBar = days[0]
  for (const b of days) {
    if (b.high > maxBar.high) maxBar = b
    if (b.low < minBar.low) minBar = b
  }
  return { first, change: pct(first, price), maxBar, minBar, fromMax: pct(maxBar.high, price) }
}

// 2. Tendencia: ¿hacia dónde van la línea amarilla (20 días) y la azul (50 días)?
function trendOf(all: Bar[], last: number) {
  const s20 = smaAt(all, last, 20)!
  const s50 = smaAt(all, last, 50)!
  const slope = pct(smaAt(all, last - 10, 50)!, s50) // cuánto se movió la azul en 10 días

  const kind: Direction = s20 > s50 && slope > 1 ? 'up' : s20 < s50 && slope < -1 ? 'down' : 'flat'
  return { kind, s20, s50, slope }
}

// 3. Escalera: partimos los 60 días en 4 tramos y vemos si cada tramo llega más alto y más bajo que el anterior
function stairsOf(days: Bar[]) {
  const size = Math.floor(days.length / 4)
  const blocks: Block[] = []
  for (let i = 0; i < 4; i++) {
    const part = days.slice(i * size, i === 3 ? days.length : (i + 1) * size)
    const high = Math.max(...part.map((b) => b.high))
    const low = Math.min(...part.map((b) => b.low))
    const prev = blocks[i - 1]
    const color: Direction = !prev
      ? 'flat'
      : high > prev.high && low > prev.low
        ? 'up'
        : high < prev.high && low < prev.low
          ? 'down'
          : 'flat'
    blocks.push({ from: part[0], to: part[part.length - 1], high, low, color })
  }
  const ups = blocks.filter((b) => b.color === 'up').length
  const downs = blocks.filter((b) => b.color === 'down').length
  const kind: Direction = ups >= 2 ? 'up' : downs >= 2 ? 'down' : 'flat'
  return { kind, blocks }
}

// 4. La línea amarilla como "piso": ¿cuántas veces la tocó y qué pasó 5 días después?
function yellowLine(all: Bar[], start: number, last: number, price: number) {
  const touches: Touch[] = []
  for (let i = start; i <= last; i++) {
    const s20 = smaAt(all, i, 20)!
    const b = all[i]
    // "Tocar" = la vela bajó hasta la amarilla pero cerró cerca o encima de ella
    if (b.low <= s20 * 1.005 && b.close >= s20 * 0.99) {
      const later = all[i + 5]
      touches.push({ bar: b, result: !later ? 'pendiente' : later.close > b.close ? 'rebotó' : 'cayó' })
      i += 5 // no contar la misma caída varias veces
    }
  }
  const dist = pct(smaAt(all, last, 20)!, price)
  const kind: YellowPlace = Math.abs(dist) <= 2 ? 'touching' : dist > 6 ? 'far' : dist > 0 ? 'above' : 'below'
  return { kind, dist, touches }
}

// 5. Volumen: ¿los 3 días con más movimiento fueron de subida o de bajada?
function volumeOf(days: Bar[]) {
  const top = [...days].sort((a, b) => b.volume - a.volume).slice(0, 3)
  return { mostlyUp: top.filter((b) => b.close > b.open).length >= 2, top }
}

// 6. Probabilidades según el histórico.
// Describimos la situación de hoy con 2 preguntas simples, buscamos en los ~1000 días
// anteriores los días con la MISMA situación y contamos qué pasó 7 días después.
function situation(all: Bar[], i: number) {
  const s20 = smaAt(all, i, 20)!
  const s50 = smaAt(all, i, 50)!
  const dist = pct(s20, all[i].close)
  return {
    trend: s20 > s50 ? 'alcista' : 'bajista',
    place: Math.abs(dist) <= 2 ? 'tocando' : dist > 0 ? 'encima' : 'debajo',
  } as const
}

function probabilities(all: Bar[]): Odds {
  const last = all.length - 1
  const now = situation(all, last)

  const changes: number[] = [] // cuánto se movió 7 días después, en los días parecidos
  const allChanges: number[] = [] // lo mismo para cualquier día (para comparar)
  for (let i = 49; i + AHEAD <= last; i++) {
    const change = pct(all[i].close, all[i + AHEAD].close)
    allChanges.push(change)
    const s = situation(all, i)
    if (s.trend === now.trend && s.place === now.place) changes.push(change)
  }

  const n = changes.length
  const ups = changes.filter((c) => c > FLAT)
  const downs = changes.filter((c) => c < -FLAT)
  const pUp = n ? (ups.length / n) * 100 : 0
  const pDown = n ? (downs.length / n) * 100 : 0
  return {
    ...now,
    n,
    years: (last - 49) / 365,
    pUp,
    pDown,
    pFlat: n ? 100 - pUp - pDown : 0,
    medUp: median(ups),
    medDown: median(downs),
    baseUp: (allChanges.filter((c) => c > FLAT).length / allChanges.length) * 100,
  }
}

// Conclusión juntando todo
function verdict(trend: Direction, stairs: Direction, yellow: YellowPlace) {
  const bullish = trend === 'up' && stairs !== 'down'
  if (bullish && yellow === 'touching')
    return 'Viene subiendo y ahora bajó a tocar la amarilla. Espero: si rebota, compro. Si cierra varios días por debajo, mejor no.'
  if (bullish && yellow === 'far')
    return 'La tendencia es buena, pero subió muy rápido. Comprar ahora es comprar caro. Prefiero esperar a que descanse y se acerque a la amarilla.'
  if (bullish && yellow === 'below')
    return 'Venía subiendo, pero perdió la amarilla. Puede ser el fin de la subida. Espero a que la recupere antes de comprar.'
  if (bullish)
    return 'La tendencia está a favor. Si ya tengo, lo mantengo. Si quiero comprar, espero un descanso hacia la amarilla para entrar más barato.'
  if (trend === 'down')
    return 'La tendencia va en contra. No compro hasta que la amarilla vuelva a cruzar por encima de la azul.'
  return 'No hay una dirección clara. Cuando el precio va de lado es fácil perder plata. Mejor espero a que elija un camino.'
}
