import { getMarket, type Coin } from '@/lib/market'
import { PageHeader } from '@/components/page-header'
import { MarketList } from '@/components/market-list'

export const metadata = { title: 'Mercado · Trading' }

export default async function MercadoPage() {
  let coins: Coin[] = []
  let error: string | null = null
  try {
    coins = await getMarket()
  } catch (e) {
    error = (e as Error).message
  }
  const watch = coins.filter((c) => c.watch).length

  return (
    <main className="safe-top mx-auto w-full max-w-screen-2xl px-4 py-6 md:px-6">
      <PageHeader
        title="Mercado"
        subtitle={`Monedas conocidas contra USDT${watch ? ` · ${watch} para mirar hoy` : ''}`}
        refresh
      />

      <details className="group mt-4 rounded-2xl border border-border bg-panel">
        <summary className="cursor-pointer list-none p-4 text-sm font-medium marker:hidden">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          ¿Cómo leer esta pantalla?
        </summary>
        <ul className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-muted">
          <li>
            <b className="text-text">BTC/USDT</b> = compras Bitcoin pagando con USDT. Aquí todo es contra USDT, así el precio siempre está en dólares.
          </li>
          <li>
            <b className="text-text">El mini gráfico</b> son los últimos 30 días. La línea finita amarilla es el promedio de 20 días, la misma del gráfico grande.
          </li>
          <li>
            <b className="text-text">↗ Subiendo / ↘ Bajando / → De lado</b>: hacia dónde va en general (la amarilla contra la azul).
          </li>
          <li>
            <b className="text-text">Tranquila / Movida / Muy movida</b>: cuánto sube o baja en un día normal. Más movida = más ganancia posible, pero también más pérdida.
          </li>
          <li>
            <b className="text-sma20">👀 Para mirar</b>: viene subiendo y bajó a tocar la línea amarilla, la misma situación de tu compra de BNB que salió bien. No es una garantía: ábrela y mira el análisis antes de decidir.
          </li>
        </ul>
      </details>

      {error ? <p className="mt-6 rounded-xl bg-down/15 p-4 text-down">No se pudo conectar con Binance: {error}</p> : <MarketList coins={coins} />}

      <p className="mt-6 text-xs text-muted">Datos de Binance, se actualizan cada 5 minutos. No es un consejo de inversión.</p>
    </main>
  )
}
