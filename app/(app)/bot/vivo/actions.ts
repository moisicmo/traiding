'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { pauseBot, resumeBot, sellAll, startBot } from '@/lib/paper-bot'

export async function start(form: FormData) {
  await requireUser()
  const capital = Number(String(form.get('capital')).replace(',', '.'))
  // "Desde": una fecha del pasado (máximo 1 año). Vacío o hoy = solo en vivo
  const raw = String(form.get('from') ?? '')
  const from = raw ? Date.parse(`${raw}T04:00:00Z`) : NaN // medianoche de Bolivia
  const valid = Number.isFinite(from) && from < Date.now() - 86_400_000 && from >= Date.now() - 366 * 86_400_000
  if (capital >= 20 && capital <= 1_000_000) await startBot(capital, valid ? from : null)
  revalidatePath('/bot/vivo')
}

export async function pause() {
  await requireUser()
  pauseBot()
  revalidatePath('/bot/vivo')
}

export async function resume() {
  await requireUser()
  resumeBot()
  revalidatePath('/bot/vivo')
}

export async function panic() {
  await requireUser()
  await sellAll()
  revalidatePath('/bot/vivo')
}
