// Señales de compra de las técnicas "clásicas" del análisis técnico, convertidas en reglas EXACTAS
// (sin "a ojo") para poder compararlas en el backtest y en el bot en vivo.
// Cada función mira SOLO velas ya cerradas (hasta i) y devuelve el plan de la operación, o null.
import type { Bar } from './binance'

export type EntryPlan = {
  sl?: number // stop loss, precio exacto
  slPct?: number // o stop loss en % debajo de la compra
  tp?: number // venta con ganancia, precio exacto
  tpPct?: number // o en % arriba de la compra
  rr?: number // o "ganar R veces lo que se arriesga" (necesita sl)
  maxBars?: number // vender igual si pasan estas velas
  exitRule?: ExitRule // vender cuando una vela cerrada cumpla esta regla (RSI > 70, etc.)
  note: string // por qué compró, en palabras (para Telegram y la pantalla)
}

const px = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 10 ? 2 : n >= 1 ? 4 : 6 })

// ===== 📊 POC (Point of Control) =====
// Perfil de volumen de las últimas 120 velas (≈20 días en velas de 4 h): el precio con MÁS volumen es el POC.
// Compra si el precio venía ARRIBA del POC y baja a tocarlo (la idea: ahí "defienden" el precio).
const POC_WINDOW = 120
const POC_BINS = 40

export function poc(bars: Bar[], i: number): number | null {
  const from = i - POC_WINDOW
  if (from < 0) return null
  let lo = Infinity
  let hi = -Infinity
  for (let k = from; k < i; k++) {
    lo = Math.min(lo, bars[k].low)
    hi = Math.max(hi, bars[k].high)
  }
  if (!(hi > lo)) return null
  const step = (hi - lo) / POC_BINS
  const vol = new Float64Array(POC_BINS)
  for (let k = from; k < i; k++) {
    const b = bars[k]
    const typical = (b.high + b.low + b.close) / 3
    vol[Math.min(POC_BINS - 1, Math.floor((typical - lo) / step))] += b.volume
  }
  let best = 0
  for (let k = 1; k < POC_BINS; k++) if (vol[k] > vol[best]) best = k
  return lo + (best + 0.5) * step
}

export function pocSignal(bars: Bar[], i: number): EntryPlan | null {
  if (i < POC_WINDOW + 1) return null
  const level = poc(bars, i)
  if (!level) return null
  const b = bars[i]
  const wasAbove = bars[i - 1].close > level * 1.01
  const touches = b.low <= level * 1.003 && b.close >= level * 0.997
  if (!wasAbove || !touches) return null
  return { slPct: 4, tpPct: 6, maxBars: 60, note: `Bajó a tocar el POC (${px(level)}), el precio con más volumen de los últimos 20 días` }
}

// ===== 🌀 Fibonacci =====
// Busca la última subida de 10% o más (de un mínimo a un máximo, en las últimas 90 velas, con el máximo reciente).
// Compra si el precio retrocede al 61,8% de esa subida y rebota. Vende al volver al máximo; stop si pasa el 78,6%.
export function fibSignal(bars: Bar[], i: number): EntryPlan | null {
  const from = i - 90
  if (from < 0) return null
  let hiIdx = from
  for (let k = from; k < i; k++) if (bars[k].high > bars[hiIdx].high) hiIdx = k
  if (i - hiIdx > 30 || hiIdx === from) return null // el máximo tiene que ser reciente
  let loIdx = from
  for (let k = from; k < hiIdx; k++) if (bars[k].low < bars[loIdx].low) loIdx = k
  const H = bars[hiIdx].high
  const L = bars[loIdx].low
  if (H / L - 1 < 0.1) return null // la subida tiene que ser de 10% o más
  const f618 = H - 0.618 * (H - L)
  const f786 = H - 0.786 * (H - L)
  // Desde el máximo, todavía no tocó el 61,8% (esta es la primera vez) ni lo atravesó
  for (let k = hiIdx + 1; k < i; k++) if (bars[k].low <= f618 * 1.003) return null
  const b = bars[i]
  if (!(b.low <= f618 * 1.003 && b.close >= f618 && b.low > f786)) return null
  return { sl: f786 * 0.995, tp: H, maxBars: 60, note: `Retrocedió al 61,8% de Fibonacci (${px(f618)}) de la subida ${px(L)} → ${px(H)}` }
}

// ===== 🏦 Smart Money Concepts (versión simple) =====
// 1. Quiebre de estructura (BOS): una vela cierra por encima del máximo de las 18 anteriores (≈3 días).
// 2. Order block: la última vela ROJA antes de ese quiebre (donde "los grandes" habrían comprado).
// 3. Compra la PRIMERA vez que el precio vuelve a esa zona. Stop debajo del order block; gana el doble de lo que arriesga.
export function smcSignal(bars: Bar[], i: number): EntryPlan | null {
  for (let k = i - 1; k >= Math.max(20, i - 30); k--) {
    let prevHigh = -Infinity
    for (let m = k - 18; m < k; m++) prevHigh = Math.max(prevHigh, bars[m].high)
    if (!(bars[k].close > prevHigh)) continue // no hubo quiebre en k

    let ob = -1
    for (let m = k - 1; m >= k - 10; m--)
      if (bars[m].close < bars[m].open) {
        ob = m
        break
      }
    if (ob < 0) return null
    const top = bars[ob].high
    const bottom = bars[ob].low
    // Desde el quiebre: no volvió antes a la zona ni cerró debajo de ella
    for (let m = k + 1; m < i; m++) if (bars[m].low <= top || bars[m].close < bottom) return null
    const b = bars[i]
    if (!(b.low <= top && b.close >= bottom)) return null
    return { sl: bottom * 0.995, rr: 2, maxBars: 60, note: `Volvió al order block (${px(bottom)}–${px(top)}) después de un quiebre de estructura` }
  }
  return null
}

// ===== Indicadores (calculados una vez por historial y guardados) =====

const cache = new WeakMap<Bar[], Map<string, Float64Array>>()
function cached(bars: Bar[], key: string, compute: () => Float64Array) {
  let m = cache.get(bars)
  if (!m) cache.set(bars, (m = new Map()))
  let v = m.get(key)
  if (!v) m.set(key, (v = compute()))
  return v
}

/** Promedio simple de `period` cierres en cada vela (NaN si todavía no hay suficientes) */
export function smaArr(bars: Bar[], period: number) {
  return cached(bars, `sma${period}`, () => {
    const out = new Float64Array(bars.length).fill(NaN)
    let sum = 0
    for (let i = 0; i < bars.length; i++) {
      sum += bars[i].close
      if (i >= period) sum -= bars[i - period].close
      if (i >= period - 1) out[i] = sum / period
    }
    return out
  })
}

/** Desviación estándar de los últimos `period` cierres (para las bandas de Bollinger) */
function stdArr(bars: Bar[], period: number) {
  return cached(bars, `std${period}`, () => {
    const mean = smaArr(bars, period)
    const out = new Float64Array(bars.length).fill(NaN)
    for (let i = period - 1; i < bars.length; i++) {
      let s = 0
      for (let k = i - period + 1; k <= i; k++) s += (bars[k].close - mean[i]) ** 2
      out[i] = Math.sqrt(s / period)
    }
    return out
  })
}

/** RSI de 14 velas (método de Wilder): de 0 a 100 */
export function rsiArr(bars: Bar[], period = 14) {
  return cached(bars, `rsi${period}`, () => {
    const out = new Float64Array(bars.length).fill(NaN)
    let gain = 0
    let loss = 0
    for (let i = 1; i < bars.length; i++) {
      const ch = bars[i].close - bars[i - 1].close
      const g = Math.max(ch, 0)
      const l = Math.max(-ch, 0)
      if (i <= period) {
        gain += g / period
        loss += l / period
      } else {
        gain = (gain * (period - 1) + g) / period
        loss = (loss * (period - 1) + l) / period
      }
      if (i >= period) out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
    }
    return out
  })
}

const highest = (bars: Bar[], from: number, to: number) => {
  let h = -Infinity
  for (let k = from; k < to; k++) h = Math.max(h, bars[k].high)
  return h
}
const lowest = (bars: Bar[], from: number, to: number) => {
  let l = Infinity
  for (let k = from; k < to; k++) l = Math.min(l, bars[k].low)
  return l
}

// ===== 📉 RSI =====
// Compra cuando el RSI sale de "sobrevendido": estaba debajo de 30 y vuelve a subir de 30. Vende cuando pasa de 70.
export function rsiSignal(bars: Bar[], i: number): EntryPlan | null {
  const r = rsiArr(bars)
  if (!(r[i - 1] < 30 && r[i] >= 30)) return null
  return { slPct: 8, maxBars: 60, exitRule: 'rsi70', note: `El RSI salió de sobrevendido (${r[i - 1].toFixed(0)} → ${r[i].toFixed(0)})` }
}

// ===== 🎯 Bandas de Bollinger (20 velas, 2 desviaciones) =====
// Compra cuando el precio cerró debajo de la banda de abajo y vuelve a entrar. Vende al llegar a la línea del medio.
export function bollSignal(bars: Bar[], i: number): EntryPlan | null {
  if (i < 21) return null
  const mid = smaArr(bars, 20)
  const sd = stdArr(bars, 20)
  const lowerPrev = mid[i - 1] - 2 * sd[i - 1]
  const lower = mid[i] - 2 * sd[i]
  if (!(bars[i - 1].close < lowerPrev && bars[i].close > lower)) return null
  return { slPct: 5, maxBars: 30, exitRule: 'bollMid', note: `Volvió a entrar en las bandas de Bollinger por abajo (${px(lower)})` }
}

// ===== 🐢 Ruptura de las Tortugas =====
// Compra cuando el precio cierra arriba del máximo de las últimas 20 velas. Vende si cierra debajo del mínimo de las últimas 10.
export function turtleSignal(bars: Bar[], i: number): EntryPlan | null {
  if (i < 21) return null
  const prevHigh = highest(bars, i - 20, i)
  if (!(bars[i].close > prevHigh && bars[i - 1].close <= highest(bars, i - 21, i - 1))) return null
  return { slPct: 8, exitRule: 'turtle10', note: `Rompió el máximo de las últimas 20 velas (${px(prevHigh)})` }
}

// ===== ✨ Golden cross 50/200 =====
// Compra cuando la media de 50 velas cruza hacia arriba a la de 200 (la versión lenta de "tendencia"). Vende en el cruce contrario.
export function goldenSignal(bars: Bar[], i: number): EntryPlan | null {
  if (i < 201) return null
  const a = smaArr(bars, 50)
  const b = smaArr(bars, 200)
  if (!(a[i] > b[i] && a[i - 1] <= b[i - 1])) return null
  return { slPct: 10, exitRule: 'death', note: 'La media de 50 cruzó hacia arriba a la de 200 (golden cross)' }
}

// ===== 🛡️ Tendencia+ (filtro de la media de 200) =====
// Se queda DENTRO mientras el precio esté arriba de su media de 200 velas (≈33 días) y sale cuando cae claramente debajo.
// El margen de 5% evita entrar y salir por ruido. Sin stop loss fijo: la salida es la media.
export function trendPlusSignal(bars: Bar[], i: number): EntryPlan | null {
  if (i < 201) return null
  const m = smaArr(bars, 200)
  if (!(bars[i].close > m[i] * 1.05)) return null // basta con estar arriba: "dentro mientras esté arriba"
  return { exitRule: 'below200', note: `El precio superó su media de 200 velas por más de 5% (${px(m[i])}): tendencia de fondo alcista` }
}

export type ExitRule = 'rsi70' | 'bollMid' | 'turtle10' | 'death' | 'below200'

/** ¿La vela cerrada i dice "vender"? (según la regla de salida de cada técnica) */
export function exitBy(rule: ExitRule, bars: Bar[], i: number): boolean {
  if (rule === 'rsi70') return rsiArr(bars)[i] > 70
  if (rule === 'bollMid') return bars[i].close >= smaArr(bars, 20)[i]
  if (rule === 'turtle10') return i >= 10 && bars[i].close < lowest(bars, i - 10, i)
  if (rule === 'below200') return bars[i].close < smaArr(bars, 200)[i] * 0.95
  return smaArr(bars, 50)[i] < smaArr(bars, 200)[i] // death cross
}
