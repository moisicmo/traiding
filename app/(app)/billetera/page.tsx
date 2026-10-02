import { explainError, getBalances, hasBinanceKeys, type Balance } from '@/lib/binance-account'
import { PageHeader } from '@/components/page-header'
import { SetupBinanceCard } from '@/components/setup-binance-card'

export const metadata = { title: 'Billetera · Trading' }

const usd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 1 ? 4 : 8 })

export default async function BilleteraPage() {
  if (!hasBinanceKeys())
    return (
      <Shell>
        <SetupBinanceCard />
      </Shell>
    )

  let balances: Balance[]
  try {
    balances = await getBalances()
  } catch (e) {
    return (
      <Shell>
        <p className="mt-6 rounded-xl bg-down/15 p-4 text-down">{explainError(e)}</p>
      </Shell>
    )
  }

  const total = balances.reduce((sum, b) => sum + (b.value ?? 0), 0)
  // Saldos que valen menos de 1 centavo: los juntamos para no llenar la pantalla
  const main = balances.filter((b) => b.value === null || b.value >= 0.01)
  const dust = balances.length - main.length

  return (
    <Shell>
      <section className="mt-6 rounded-2xl border border-border bg-panel p-5">
        <p className="text-sm text-muted">Valor total</p>
        <p className="tabular mt-1 text-3xl font-semibold">
          {usd(total)} <span className="text-lg font-normal text-muted">USDT</span>
        </p>
        <p className="mt-1 text-sm text-muted">Spot + Fondos, al precio de este momento</p>
      </section>

      <ul className="mt-4 space-y-2">
        {main.map((b) => {
          const share = total && b.value ? (b.value / total) * 100 : 0
          return (
            <li key={b.asset} className="rounded-2xl border border-border bg-panel p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-semibold">{b.asset}</span>
                <span className="tabular font-semibold">{b.value === null ? '—' : `${usd(b.value)} USDT`}</span>
              </div>
              <div className="tabular mt-0.5 flex justify-between gap-3 text-sm text-muted">
                <span>{qty(b.total)} {b.asset.replace(' (Earn)', '')}</span>
                <span>{share.toFixed(1)}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
                <div className="h-full rounded-full bg-sma50" style={{ width: `${share}%` }} />
              </div>
              <p className="tabular mt-2 text-xs text-muted">
                {[
                  b.spot > 0 && `Spot ${qty(b.spot)}`,
                  b.inOrders > 0 && `(${qty(b.inOrders)} en órdenes)`,
                  b.funding > 0 && `Fondos ${qty(b.funding)}`,
                  b.price !== null && b.asset !== 'USDT' && `precio ${usd(b.price)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          )
        })}
      </ul>
      {dust > 0 && <p className="mt-3 text-sm text-muted">+ {dust} saldos muy pequeños (menos de 0.01 USDT)</p>}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="safe-top mx-auto w-full max-w-2xl px-4 py-6 md:overflow-y-auto">
      <PageHeader title="Billetera" subtitle="Tus saldos reales en Binance" refresh />
      {children}
    </main>
  )
}
