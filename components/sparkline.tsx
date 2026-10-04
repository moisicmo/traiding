/** Mini gráfico de 30 días: el precio y, finita, la línea amarilla (promedio de 20 días) */
export function Sparkline({ prices, sma, up }: { prices: number[]; sma: number[]; up: boolean }) {
  const all = [...prices, ...sma]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const W = 100
  const H = 32
  const y = (v: number) => H - 2 - ((v - min) / (max - min || 1)) * (H - 4)
  const line = (values: number[]) => values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const color = up ? 'var(--color-up)' : 'var(--color-down)'

  return (
    <div className="relative h-12 w-full" aria-hidden>
      {/* El SVG se estira a lo ancho; por eso el punto final va aparte, para que quede redondo */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <polyline points={line(sma)} fill="none" stroke="var(--color-sma20)" strokeOpacity={0.7} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <polyline points={line(prices)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel"
        style={{ left: '100%', top: `${(y(prices[prices.length - 1]) / H) * 100}%`, background: color }}
      />
    </div>
  )
}
