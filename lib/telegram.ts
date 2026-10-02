// Notificaciones por Telegram (Bot API). Solo corre en el servidor: el token nunca llega al navegador.
// Docs: https://core.telegram.org/bots/api
import 'server-only'

const token = () => process.env.TELEGRAM_BOT_TOKEN
const chatId = () => process.env.TELEGRAM_CHAT_ID

async function call<T>(method: string, body?: object): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
  })
  const data = (await res.json()) as { ok: boolean; result: T; description?: string }
  if (!data.ok) throw new Error(data.description ?? `Telegram respondió ${res.status}`)
  return data.result
}

/** Escapa el texto para usarlo dentro de un mensaje con formato HTML */
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export type TelegramStatus = {
  hasToken: boolean
  bot: string | null // @usuario del bot, si el token es válido
  hasChat: boolean
  error: string | null
}

export async function telegramStatus(): Promise<TelegramStatus> {
  const status: TelegramStatus = { hasToken: !!token(), bot: null, hasChat: !!chatId(), error: null }
  if (!status.hasToken) return status
  try {
    status.bot = (await call<{ username: string }>('getMe')).username
  } catch (e) {
    status.error = (e as Error).message
  }
  return status
}

/** Chats que le escribieron al bot hace poco (para encontrar tu TELEGRAM_CHAT_ID) */
export async function recentChats() {
  type Update = { message?: { chat: { id: number; first_name?: string; username?: string; title?: string } } }
  const updates = await call<Update[]>('getUpdates')
  const chats = new Map<number, string>()
  for (const u of updates) {
    const c = u.message?.chat
    if (c) chats.set(c.id, c.title ?? [c.first_name, c.username && `@${c.username}`].filter(Boolean).join(' '))
  }
  return [...chats].map(([id, name]) => ({ id, name }))
}

/**
 * Envía un mensaje a tu chat. Acepta formato HTML simple: <b>, <i>, <code>, <a href>.
 * Si Telegram no está configurado, no hace nada (devuelve false).
 */
export async function notify(html: string): Promise<boolean> {
  if (!token() || !chatId()) return false
  await call('sendMessage', { chat_id: chatId(), text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
  return true
}
