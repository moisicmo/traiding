import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { auth, authDisabled } from '@/auth'
import { telegramStatus } from '@/lib/telegram'
import { TelegramPanel } from '@/components/telegram-panel'

export const metadata = { title: 'Notificaciones · Trading' }

export default async function NotificacionesPage() {
  if (!authDisabled && !(await auth())) redirect('/login')
  const status = await telegramStatus()

  return (
    <main className="safe-top safe-bottom mx-auto max-w-xl px-4 py-6">
      <Link href="/" className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft size={16} /> Volver
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Notificaciones</h1>
      <p className="mt-1 text-muted">Los avisos te llegan por Telegram, como un mensaje normal.</p>
      <TelegramPanel status={status} />
    </main>
  )
}
