'use server'

import { requireUser } from '@/auth'
import { notify, recentChats } from '@/lib/telegram'

export type ActionResult = { ok: boolean; message: string; chats?: { id: number; name: string }[] }

export async function findChats(): Promise<ActionResult> {
  await requireUser()
  try {
    const chats = await recentChats()
    return chats.length
      ? { ok: true, message: 'Encontré estos chats:', chats }
      : { ok: false, message: 'Todavía no hay mensajes. Abre tu bot en Telegram, mándale /start y vuelve a intentar.' }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function sendTest(): Promise<ActionResult> {
  await requireUser()
  try {
    const time = new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' })
    const sent = await notify(`✅ <b>Trading</b>\nLas notificaciones funcionan.\n<i>${time}</i>`)
    return sent
      ? { ok: true, message: 'Mensaje enviado. Revisa Telegram.' }
      : { ok: false, message: 'Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en el .env.' }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
