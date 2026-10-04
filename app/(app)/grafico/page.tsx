import { DashboardLoader } from '@/components/dashboard-loader'
import { isUsdtSymbol } from '@/lib/binance'

export const metadata = { title: 'Gráfico · Trading' }

export default async function GraficoPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams
  return <DashboardLoader symbol={s && isUsdtSymbol(s) ? s : undefined} />
}
