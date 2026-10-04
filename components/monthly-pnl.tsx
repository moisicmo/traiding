'use client'

import { useState } from 'react'
import clsx from 'clsx'

export type Month = { key: string; label: string; pnl: number; count: number }

const money = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`

/** Ganancia por mes: barras verdes hacia arriba (ganaste) y rojas hacia abajo (perdiste), con el cero al medio */
export function MonthlyPnl({ months }: { months: Month[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...months.map((m) => Math.abs(m.pnl)), 0.01)
  const hasLoss = months.some((m) => m.pnl < 0)
  const shown = hover ?? months.length - 1
  const current = months[shown]

  return (
    <div>
      {/* Valor del mes señalado (por defecto, el más reciente): así no hace falta pasar el mouse para leerlo */}
      <p className="text-sm text-muted">
        {current.label}:{' '}
        <b className={clsx(current.pnl > 0 ? 'text-up' : current.pnl < 0 ? 'text-down' : 'text-text')}>{money(current.pnl)} USDT</b>
        {' · '}
        {current.count} {current.count === 1 ? 'venta' : 'ventas'}
      </p>

      <div className={clsx('relative mt-3 flex gap-1', hasLoss ? 'h-48' : 'h-40')} onMouseLeave={() => setHover(null)}>
        {months.map((m, i) => {
          const h = (Math.abs(m.pnl) / max) * 100
          return (
            <button
              key={m.key}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => setHover(i)}
              aria-label={`${m.label}: ${money(m.pnl)} USDT`}
              className={clsx('group flex h-full flex-1 flex-col rounded-md outline-none', i === shown && 'bg-bg')}
            >
              {/* Mitad de arriba: ganancias */}
              <div className={clsx('flex w-full flex-1 items-end justify-center px-0.5', !hasLoss && 'h-full')}>
                {m.pnl > 0 && <div className="w-full max-w-8 rounded-t bg-up" style={{ height: `${Math.max(h, 2)}%` }} />}
              </div>
              {/* La línea del cero */}
              <div className="h-px w-full bg-border" />
              {/* Mitad de abajo: pérdidas */}
              {hasLoss && (
                <div className="flex w-full flex-1 items-start justify-center px-0.5">
                  {m.pnl < 0 && <div className="w-full max-w-8 rounded-b bg-down" style={{ height: `${Math.max(h, 2)}%` }} />}
                </div>
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-muted">
        {months.map((m, i) => (
          <span key={m.key} className={clsx('flex-1 truncate text-center', i === shown && 'text-text')}>
            {m.label.split(' ')[0]}
          </span>
        ))}
      </div>
    </div>
  )
}
