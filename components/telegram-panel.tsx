'use client'

import { useActionState } from 'react'
import clsx from 'clsx'
import type { TelegramStatus } from '@/lib/telegram'
import { findChats, sendTest, type ActionResult } from '@/app/(app)/ajustes/actions'

export function TelegramPanel({ status }: { status: TelegramStatus }) {
  const [chats, findAction, finding] = useActionState(findChats, null)
  const [test, testAction, testing] = useActionState(sendTest, null)
  const botOk = !!status.bot

  return (
    <ol className="mt-6 space-y-4">
      <Step n={1} done={botOk} title="Crear el bot">
        {botOk ? (
          <p>Conectado como <b>@{status.bot}</b>.</p>
        ) : status.hasToken ? (
          <p className="text-down">El token no funciona: {status.error}. Revisa TELEGRAM_BOT_TOKEN en el .env.</p>
        ) : (
          <>
            <p>En Telegram busca <b>@BotFather</b>, mándale <code>/newbot</code> y sigue los pasos.</p>
            <p className="mt-1">Te dará un token: ponlo en el <code>.env</code> como <code>TELEGRAM_BOT_TOKEN=...</code> y reinicia la app.</p>
          </>
        )}
      </Step>

      <Step n={2} done={status.hasChat} title="Conectar tu chat">
        {status.hasChat ? (
          <p>Tu chat está configurado.</p>
        ) : (
          <>
            <p>
              Abre tu bot{botOk && <> (<a className="underline" href={`https://t.me/${status.bot}`} target="_blank" rel="noreferrer">t.me/{status.bot}</a>)</>}, mándale{' '}
              <code>/start</code> y aprieta el botón.
            </p>
            <form action={findAction}>
              <Button disabled={!botOk || finding}>{finding ? 'Buscando…' : 'Buscar mi chat'}</Button>
            </form>
            <Result r={chats} />
            {chats?.chats && (
              <ul className="mt-2 space-y-1">
                {chats.chats.map((c) => (
                  <li key={c.id} className="rounded-lg bg-bg px-3 py-2">
                    {c.name}: <code className="select-all font-semibold">TELEGRAM_CHAT_ID={c.id}</code>
                  </li>
                ))}
              </ul>
            )}
            {chats?.chats && <p className="mt-2 text-sm text-muted">Copia esa línea al <code>.env</code> y reinicia la app.</p>}
          </>
        )}
      </Step>

      <Step n={3} done={test?.ok ?? false} title="Probar">
        <form action={testAction}>
          <Button disabled={!botOk || !status.hasChat || testing}>{testing ? 'Enviando…' : 'Enviar mensaje de prueba'}</Button>
        </form>
        <Result r={test} />
      </Step>
    </ol>
  )
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-border bg-panel p-4">
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
            done ? 'bg-up text-white' : 'bg-border text-muted',
          )}
        >
          {done ? '✓' : n}
        </span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="mt-2 pl-10 text-[15px] leading-relaxed [&_code]:rounded [&_code]:bg-bg [&_code]:px-1 [&_code]:text-sm">
        {children}
      </div>
    </li>
  )
}

function Button({ disabled, children }: { disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      disabled={disabled}
      className="mt-3 w-full rounded-lg bg-[#2b3345] px-4 py-2.5 font-semibold hover:bg-[#343e54] disabled:opacity-40 sm:w-auto"
    >
      {children}
    </button>
  )
}

function Result({ r }: { r: ActionResult | null }) {
  if (!r) return null
  return <p className={clsx('mt-2 text-sm', r.ok ? 'text-up' : 'text-down')}>{r.message}</p>
}
