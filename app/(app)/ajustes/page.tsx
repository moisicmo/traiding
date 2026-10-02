import { LogOut } from 'lucide-react'
import { auth, signOut } from '@/auth'
import { explainError, getKeyPermissions, hasBinanceKeys } from '@/lib/binance-account'
import { getMeta } from '@/lib/db'
import { telegramStatus } from '@/lib/telegram'
import { PageHeader } from '@/components/page-header'
import { TelegramPanel } from '@/components/telegram-panel'
import { BinanceSetup, type BinanceStatus } from '@/components/binance-setup'

export const metadata = { title: 'Ajustes · Trading' }

async function binanceStatus(): Promise<BinanceStatus> {
  if (!hasBinanceKeys()) return { configured: false }
  const lastSync = Number(getMeta('orders_last_sync')) || null
  try {
    const p = await getKeyPermissions()
    return {
      configured: true,
      readOnly: !p.enableSpotAndMarginTrading && !p.enableWithdrawals,
      canTrade: p.enableSpotAndMarginTrading,
      canWithdraw: p.enableWithdrawals,
      ipRestrict: p.ipRestrict,
      lastSync,
      error: getMeta('orders_last_error') || null,
    }
  } catch (e) {
    return { configured: true, lastSync, error: explainError(e) }
  }
}

export default async function AjustesPage() {
  const [session, telegram, binance] = await Promise.all([auth(), telegramStatus(), binanceStatus()])

  async function logout() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <main className="safe-top mx-auto w-full max-w-xl px-4 py-6">
      <PageHeader title="Ajustes" />

      <h2 className="mt-8 text-lg font-semibold">Binance</h2>
      <p className="text-muted">Para ver tu billetera y que te avise cuando se ejecute una orden.</p>
      <BinanceSetup status={binance} />

      <h2 className="mt-10 text-lg font-semibold">Notificaciones</h2>
      <p className="text-muted">Los avisos te llegan por Telegram, como un mensaje normal.</p>
      <TelegramPanel status={telegram} />

      <form action={logout} className="mt-10 border-t border-border pt-6">
        {session?.user?.email && <p className="mb-3 text-sm text-muted">Sesión iniciada como {session.user.email}</p>}
        <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-3 font-semibold text-down sm:w-auto sm:px-6">
          <LogOut size={18} /> Cerrar sesión
        </button>
      </form>
    </main>
  )
}
