import { getMarket, RULES, type Market } from '@/lib/market'
import { PageHeader } from '@/components/page-header'
import { MarketList } from '@/components/market-list'

export const metadata = { title: 'Mercado · Trading' }

export default async function MercadoPage() {
  let market: Market = { coins: [], rejected: [] }
  let error: string | null = null
  try {
    market = await getMarket()
  } catch (e) {
    error = (e as Error).message
  }
  const { coins, rejected } = market
  const watch = coins.filter((c) => c.watch).length

  return (
    <main className="safe-top mx-auto w-full max-w-screen-2xl px-4 py-6 md:px-6">
      <PageHeader
        title="Mercado"
        subtitle={`${coins.length} monedas pasan el filtro de seguridad${watch ? ` · ${watch} para mirar hoy` : ''}`}
        refresh
      />

      {/* El filtro de seguridad, siempre a la vista */}
      <details className="group mt-4 rounded-2xl border border-border bg-panel">
        <summary className="cursor-pointer list-none p-4 text-sm font-medium marker:hidden">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          🛡️ Filtro de seguridad: {coins.length} monedas pasan{rejected.length > 0 && `, ${rejected.length} no`}
          <span className="ml-1 font-normal text-muted">· ver reglas</span>
        </summary>
        <div className="px-4 pb-4">
          <ul className="flex flex-wrap gap-1.5 text-xs text-muted">
            {[
              `+${RULES.minYears} años en Binance`,
              `+${RULES.minVolume / 1e6} millones USD por día`,
              `+${RULES.minTrades / 1000} mil operaciones por día`,
              'Sin monedas meme',
              `Sin subidas locas (máx. +${RULES.maxPump30d}% en 30 días)`,
              `Sin movimientos bruscos (máx. ±${RULES.maxDailyMove}% por día)`,
            ].map((r) => (
              <li key={r} className="rounded-md bg-bg px-2 py-1">
                ✓ {r}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Se revisa solo: si una moneda nueva cumple las reglas con el tiempo, aparece aquí; si una deja de cumplirlas, sale.
          </p>
        </div>
      </details>

      <details className="group mt-3 rounded-2xl border border-border bg-panel">
        <summary className="cursor-pointer list-none p-4 text-sm font-medium marker:hidden">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          ¿Cómo leer esta pantalla?
        </summary>
        <ul className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-muted">
          <li>
            <b className="text-text">BTC/USDT</b> = compras Bitcoin pagando con USDT. Aquí todo es contra USDT, así el precio siempre está
            en dólares.
          </li>
          <li>
            <b className="text-text">El mini gráfico</b> son los últimos 30 días. La línea finita amarilla es el promedio de 20 días, la
            misma del gráfico grande.
          </li>
          <li>
            <b className="text-text">↗ Subiendo / ↘ Bajando / → De lado</b>: hacia dónde va en general (la amarilla contra la azul).
          </li>
          <li>
            <b className="text-text">Tranquila / Movida / Muy movida</b>: cuánto sube o baja en un día normal. Más movida = más ganancia
            posible, pero también más pérdida.
          </li>
          <li>
            <b className="text-text">vs Bitcoin</b>: cuánto mejor (o peor) le fue que a Bitcoin en 30 días. Es lo mismo que mostraría el par
            &quot;moneda/BTC&quot;, pero en un número fácil: si es positivo, esa moneda creció más que Bitcoin.
          </li>
          <li>
            <b className="text-sma20">👀 Para mirar</b>: viene subiendo y bajó a tocar la línea amarilla, la misma situación de tu compra de
            BNB que salió bien. No es una garantía: ábrela y mira el análisis antes de decidir.
          </li>
        </ul>
      </details>

      {error ? (
        <p className="mt-6 rounded-xl bg-down/15 p-4 text-down">No se pudo conectar con Binance: {error}</p>
      ) : (
        <MarketList coins={coins} />
      )}

      {rejected.length > 0 && (
        <details className="group mt-6 rounded-2xl border border-border bg-panel">
          <summary className="cursor-pointer list-none p-4 text-sm font-medium marker:hidden">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
            🚫 {rejected.length} monedas con mucho movimiento hoy que NO pasan el filtro
          </summary>
          <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3">
            {rejected.map((r) => (
              <li key={r.base} className="rounded-xl bg-bg p-3 text-sm">
                <b>{r.name !== r.base ? `${r.name} (${r.base})` : r.base}</b>
                <ul className="mt-1 space-y-0.5 text-xs text-down">
                  {r.reasons.map((reason) => (
                    <li key={reason}>✗ {reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-6 text-xs text-muted">Datos de Binance, se actualizan cada 5 minutos. No es un consejo de inversión.</p>
    </main>
  )
}
