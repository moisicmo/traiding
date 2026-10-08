'use client'

import { useFormStatus } from 'react-dom'

/** Botón de formulario que se desactiva y cambia el texto mientras se envía */
export function SubmitButton({ children, pending: pendingText, className }: { children: React.ReactNode; pending: string; className?: string }) {
  const { pending } = useFormStatus()
  return (
    <button disabled={pending} className={className} aria-busy={pending}>
      {pending ? `⏳ ${pendingText}` : children}
    </button>
  )
}
