'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { ArrowLeftRight, Bot, ChartCandlestick, ListChecks, Settings, Wallet } from 'lucide-react'

const TABS = [
  { href: '/', label: 'Mercado', Icon: ChartCandlestick },
  { href: '/bot', label: 'Bot', Icon: Bot },
  { href: '/billetera', label: 'Billetera', Icon: Wallet },
  { href: '/ordenes', label: 'Órdenes', Icon: ListChecks },
  { href: '/p2p', label: 'P2P', Icon: ArrowLeftRight },
  { href: '/ajustes', label: 'Ajustes', Icon: Settings },
]

// Mercado también queda marcado mientras ves el gráfico de una moneda
const matches = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' || pathname.startsWith('/grafico') : pathname.startsWith(href)

// Computadora: menú arriba. iPhone: barra de pestañas abajo, como una app.
export function AppNav({ position }: { position: 'top' | 'bottom' }) {
  const pathname = usePathname()
  // Al tocar una pestaña la marcamos enseguida, sin esperar a que cargue la pantalla
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null)
  const activeHref = tapped && tapped.from === pathname ? tapped.href : TABS.find((t) => matches(pathname, t.href))?.href
  const activeIndex = TABS.findIndex((t) => t.href === activeHref)
  const tap = (href: string) => href !== activeHref && setTapped({ href, from: pathname })

  if (position === 'top')
    return (
      <nav className="hidden shrink-0 items-center gap-1 border-b border-border px-4 py-2 md:flex">
        <span className="mr-4 font-semibold">Trading</span>
        {TABS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => tap(href)}
            className={clsx(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              href === activeHref ? 'bg-panel text-text' : 'text-muted hover:text-text',
            )}
          >
            <Icon size={16} /> {label}
          </Link>
        ))}
      </nav>
    )

  return (
    <nav className="safe-bottom shrink-0 border-t border-border bg-bg md:hidden">
      <div className="relative grid h-16 grid-cols-6">
        {/* Fondo que se desliza hasta la pestaña activa */}
        {activeIndex >= 0 && (
          <div
            aria-hidden
            className="absolute inset-y-1.5 left-0 w-1/6 px-1.5 transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          >
            <div className="h-full rounded-2xl bg-panel" />
          </div>
        )}
        {TABS.map(({ href, label, Icon }) => {
          const active = href === activeHref
          return (
            <Link
              key={href}
              href={href}
              onClick={() => tap(href)}
              className={clsx(
                'relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-200 active:scale-95',
                active ? 'text-text' : 'text-muted',
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} className={clsx('transition-transform duration-200', active && '-translate-y-px')} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
