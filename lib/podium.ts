// Métricas para comparar competidores con datos: no solo cuánto ganaron, también cuánto sufrieron en el camino.
type Point = { ts: number; value: number }

export type Metrics = {
  gain: number // % desde el inicio
  maxDrawdown: number // % de la peor caída desde un máximo (negativo)
  monthly: number // ganancia promedio por mes, % (con interés compuesto)
  ratio: number // ganancia ÷ peor caída: cuánto ganó por cada % que llegó a caer (más alto = mejor)
}

export function metrics(points: Point[], capital: number): Metrics {
  let peak = capital
  let dd = 0
  for (const p of points) {
    peak = Math.max(peak, p.value)
    dd = Math.min(dd, p.value / peak - 1)
  }
  const last = points[points.length - 1]?.value ?? capital
  const months = points.length > 1 ? (points[points.length - 1].ts - points[0].ts) / (30.44 * 86_400_000) : 0
  const growth = last / capital
  return {
    gain: (growth - 1) * 100,
    maxDrawdown: dd * 100,
    monthly: months >= 1 ? (Math.pow(growth, 1 / months) - 1) * 100 : (growth - 1) * 100,
    ratio: dd < 0 ? (growth - 1) / -dd : growth > 1 ? Infinity : 0,
  }
}
