'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { pauseBot, resumeBot, sellAll, startBot } from '@/lib/paper-bot'

export async function start(form: FormData) {
  await requireUser()
  const capital = Number(String(form.get('capital')).replace(',', '.'))
  const months = Number(form.get('months') ?? 0)
  if (capital >= 20 && capital <= 1_000_000) await startBot(capital, [0, 1, 2, 3, 6].includes(months) ? months : 0)
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
