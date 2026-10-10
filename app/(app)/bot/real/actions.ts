'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { explainError } from '@/lib/binance-account'
import { setMeta } from '@/lib/db'
import { COMPETITOR_KEYS, type Competitor } from '@/lib/paper-bot'
import { addFunds, pauseReal, resetReal, resumeReal, sellAllReal, startReal } from '@/lib/real-bot'

export async function start(form: FormData) {
  await requireUser()
  const follow = String(form.get('follow')) as Competitor
  const budget = Number(String(form.get('budget')).replace(',', '.'))
  const maxLoss = Number(String(form.get('maxLoss')).replace(',', '.'))
  setMeta('real_start_error', '')
  try {
    if (!COMPETITOR_KEYS.includes(follow)) throw new Error('Elige a quién copiar')
    if (!(budget >= 20 && budget <= 100_000)) throw new Error('El presupuesto tiene que ser entre 20 y 100.000 USDT')
    if (!(maxLoss >= 5 && maxLoss <= 50)) throw new Error('El freno tiene que ser entre 5% y 50%')
    await startReal({ follow, budget, maxLoss, adopt: form.get('adopt') === 'on' })
  } catch (e) {
    setMeta('real_start_error', explainError(e))
  }
  revalidatePath('/bot/real')
}

export async function pause() {
  await requireUser()
  pauseReal()
  revalidatePath('/bot/real')
}

export async function resume() {
  await requireUser()
  resumeReal()
  revalidatePath('/bot/real')
}

export async function panic() {
  await requireUser()
  await sellAllReal()
  revalidatePath('/bot/real')
}

export async function reset() {
  await requireUser()
  resetReal()
  revalidatePath('/bot/real')
}

export async function add(form: FormData) {
  await requireUser()
  const amount = Number(String(form.get('amount')).replace(',', '.'))
  setMeta('real_start_error', '')
  try {
    if (!(amount >= 5 && amount <= 100_000)) throw new Error('El monto tiene que ser entre 5 y 100.000 USDT')
    await addFunds(amount)
  } catch (e) {
    setMeta('real_start_error', explainError(e))
  }
  revalidatePath('/bot/real')
}
