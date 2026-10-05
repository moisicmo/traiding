'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { pauseBot, resumeBot, sellAll, startBot } from '@/lib/paper-bot'

export async function start(form: FormData) {
  await requireUser()
  const capital = Number(String(form.get('capital')).replace(',', '.'))
  if (capital >= 20 && capital <= 1_000_000) await startBot(capital)
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
