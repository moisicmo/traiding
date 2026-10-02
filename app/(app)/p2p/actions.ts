'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/auth'
import { addAlert, deleteAlert, type AlertKind } from '@/lib/p2p'

export type AlertResult = { ok: boolean; message: string } | null

export async function createAlert(_prev: AlertResult, form: FormData): Promise<AlertResult> {
  await requireUser()
  const kind = form.get('kind') as AlertKind
  const price = Number(String(form.get('price')).replace(',', '.'))
  if (kind !== 'buy_below' && kind !== 'sell_above') return { ok: false, message: 'Elige un tipo de alerta.' }
  if (!(price > 0 && price < 1000)) return { ok: false, message: 'Escribe un precio en Bs, por ejemplo 12.30' }
  addAlert(kind, price)
  revalidatePath('/p2p')
  return { ok: true, message: 'Alerta creada. Te aviso por Telegram (se revisa cada 5 minutos).' }
}

export async function removeAlert(form: FormData) {
  await requireUser()
  deleteAlert(Number(form.get('id')))
  revalidatePath('/p2p')
}
