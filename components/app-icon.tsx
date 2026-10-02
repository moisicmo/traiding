// Ícono de la app: tres velas (roja, verde, verde) sobre fondo oscuro
export function AppIcon({ size }: { size: number }) {
  const u = size / 16
  const candle = (x: number, top: number, height: number, color: string) => (
    <div
      style={{
        position: 'absolute',
        left: x * u,
        top: top * u,
        width: 2.4 * u,
        height: height * u,
        background: color,
        borderRadius: 0.4 * u,
      }}
    />
  )
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0f1218' }}>
      {candle(3.4, 6, 5, '#ef5350')}
      {candle(6.8, 5, 6, '#26a69a')}
      {candle(10.2, 2.8, 7, '#26a69a')}
    </div>
  )
}
