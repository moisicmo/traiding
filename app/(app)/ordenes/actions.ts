'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { saveGoals } from '@/lib/goals'

export async function updateGoals(form: FormData) {
  await requireUser()
  const pnl = Number(String(form.get('pnl')).replace(',', '.'))
  const ops = Math.round(Number(form.get('ops')))
  if (pnl > 0 && pnl < 1_000_000 && ops > 0 && ops < 10_000) saveGoals({ pnl, ops })
  revalidatePath('/ordenes')
}
