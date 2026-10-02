import Link from 'next/link'

export function SetupBinanceCard() {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-panel p-5">
      <h2 className="font-semibold">Conecta tu cuenta de Binance</h2>
      <p className="mt-2 text-muted">
        Para ver tus saldos y órdenes, la app necesita una API key de <b className="text-text">solo lectura</b>. Los pasos están en{' '}
        <Link href="/ajustes" className="text-text underline">Ajustes</Link>.
      </p>
    </div>
  )
}
