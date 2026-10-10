'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { pauseBot, resumeBot, sellAll, startBotInBackground, type Sizing } from '@/lib/paper-bot'
import { mySeed } from '@/lib/my-seed'

export async function start(form: FormData) {
  await requireUser()
  const capital = Number(String(form.get('capital')).replace(',', '.'))
  // "Desde": una fecha del pasado (máximo 1 año). Vacío o hoy = solo en vivo
  const raw = String(form.get('from') ?? '')
  const from = raw ? Date.parse(`${raw}T04:00:00Z`) : NaN // medianoche de Bolivia
  const valid = Number.isFinite(from) && from < Date.now() - 86_400_000 && from >= Date.now() - 366 * 86_400_000
  // Monto por operación: automático (1/4), fijo (USDT) o según el riesgo (% de la cartera que arriesga cada operación)
  const mode = String(form.get('sizing'))
  const amount = Number(String(form.get('amount') ?? '').replace(',', '.'))
  const risk = Number(String(form.get('risk') ?? '').replace(',', '.'))
  const sizing: Sizing = {
    mode: mode === 'fixed' || mode === 'risk' ? mode : 'auto',
    amount: amount >= 5 && amount <= capital ? amount : 100,
    risk: risk >= 0.5 && risk <= 10 ? risk : 2,
  }
  // "Empezar con mi cartera": todos arrancan con tus monedas reales (y empieza hoy, sin simulación)
  const seed = form.get('mine') === 'on' ? await mySeed() : []
  if (capital >= 20 && capital <= 1_000_000) startBotInBackground(capital, valid ? from : null, sizing, seed)
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
