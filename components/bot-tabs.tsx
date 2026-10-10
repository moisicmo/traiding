import Link from 'next/link'
import clsx from 'clsx'

/** Cambiar entre las pantallas del bot */
export function BotTabs({ current }: { current: 'test' | 'learn' | 'live' | 'real' }) {
  const tabs = [
    { key: 'test', href: '/bot', label: '🧪 Probar estrategias' },
    { key: 'learn', href: '/bot/aprende', label: '🧠 Bot que aprende' },
    { key: 'live', href: '/bot/vivo', label: '🟢 Bot en vivo' },
    { key: 'real', href: '/bot/real', label: '💰 Bot real' },
  ] as const
  return (
    <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={clsx(
            'shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium',
            t.key === current ? 'border-text bg-text text-bg' : 'border-border bg-panel text-muted hover:text-text',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
