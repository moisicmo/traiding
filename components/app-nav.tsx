'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { ChartCandlestick, ListChecks, Settings, Wallet } from 'lucide-react'

const TABS = [
  { href: '/', label: 'Gráfico', Icon: ChartCandlestick },
  { href: '/billetera', label: 'Billetera', Icon: Wallet },
  { href: '/ordenes', label: 'Órdenes', Icon: ListChecks },
  { href: '/ajustes', label: 'Ajustes', Icon: Settings },
]

// Computadora: menú arriba. iPhone: barra de pestañas abajo, como una app.
export function AppNav() {
  const pathname = usePathname()
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <>
      <nav className="hidden items-center gap-1 border-b border-border px-4 py-2 md:flex">
        <span className="mr-4 font-semibold">Trading</span>
        {TABS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium',
              active(href) ? 'bg-panel text-text' : 'text-muted hover:text-text',
            )}
          >
            <Icon size={16} /> {label}
          </Link>
        ))}
      </nav>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur md:hidden">
        <div className="grid h-16 grid-cols-4">
          {TABS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex flex-col items-center justify-center gap-1 text-[11px] font-medium',
                active(href) ? 'text-text' : 'text-muted',
              )}
            >
              <Icon size={22} strokeWidth={active(href) ? 2.2 : 1.8} />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
