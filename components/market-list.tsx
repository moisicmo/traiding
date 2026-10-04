'use client'

import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { fmt } from '@/lib/binance'
import type { Coin, Move, Place, Trend } from '@/lib/market'
import { CoinIcon } from './coin-icon'
import { Sparkline } from './sparkline'

const TREND: Record<Trend, { label: string; className: string }> = {
  up: { label: '↗ Subiendo', className: 'bg-up/15 text-up' },
  down: { label: '↘ Bajando', className: 'bg-down/15 text-down' },
  flat: { label: '→ De lado', className: 'bg-border text-muted' },
}
const MOVE: Record<Move, string> = { calm: 'Tranquila', moving: 'Movida', wild: 'Muy movida' }
const PLACE: Record<Place, string> = {
  touching: 'Tocando la amarilla',
  above: 'Encima de la amarilla',
  far: 'Lejos de la amarilla (cara)',
  below: 'Debajo de la amarilla',
}

const FILTERS = {
  all: { label: 'Todas', test: () => true },
  watch: { label: '👀 Para mirar', test: (c: Coin) => c.watch },
  up: { label: '↗ Subiendo', test: (c: Coin) => c.trend === 'up' },
  calm: { label: 'Tranquilas', test: (c: Coin) => c.move === 'calm' },
  beatsBtc: { label: 'Le ganan a BTC', test: (c: Coin) => c.base !== 'BTC' && c.vsBtc30d > 0 },
} as const
type Filter = keyof typeof FILTERS

export function MarketList({ coins }: { coins: Coin[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const shown = coins.filter(FILTERS[filter].test)

  return (
    <>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={clsx(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              key === filter ? 'border-text bg-text text-bg' : 'border-border bg-panel text-muted hover:text-text',
            )}
          >
            {FILTERS[key].label} <span className="opacity-60">{coins.filter(FILTERS[key].test).length}</span>
          </button>
        ))}
      </div>

      {shown.length ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((c) => (
            <li key={c.symbol}>
              <CoinCard c={c} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl border border-border bg-panel p-4 text-muted">
          {filter === 'watch'
            ? 'Hoy ninguna moneda está en esa situación. Es normal: las buenas oportunidades no aparecen todos los días.'
            : 'No hay monedas con este filtro ahora.'}
        </p>
      )}
    </>
  )
}

function CoinCard({ c }: { c: Coin }) {
  return (
    <Link
      href={`/grafico?s=${c.symbol}`}
      className={clsx(
        'block rounded-2xl border bg-panel p-4 transition-colors hover:border-muted active:scale-[0.99]',
        c.watch ? 'border-sma20/60' : 'border-border',
      )}
    >
      <div className="flex items-center gap-3">
        <CoinIcon base={c.base} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{c.name}</p>
          <p className="text-xs text-muted">
            {c.base}/USDT · desde {new Date(c.since).getUTCFullYear()}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular font-semibold">{fmt(c.price)}</p>
          <p className={clsx('tabular text-xs font-medium', c.change24h >= 0 ? 'text-up' : 'text-down')}>
            {c.change24h >= 0 ? '+' : ''}
            {c.change24h.toFixed(2)}% hoy
          </p>
        </div>
      </div>

      <div className="mt-3">
        <Sparkline prices={c.spark} sma={c.sparkSma20} up={c.change30d >= 0} />
        <p className="tabular mt-1 flex justify-between gap-2 text-[11px] text-muted">
          <span>
            30 días: <span className={c.change30d >= 0 ? 'text-up' : 'text-down'}>{c.change30d >= 0 ? '+' : ''}{c.change30d.toFixed(1)}%</span>
          </span>
          {c.base !== 'BTC' && (
            <span>
              vs Bitcoin:{' '}
              <span className={c.vsBtc30d >= 0 ? 'text-up' : 'text-down'}>
                {c.vsBtc30d >= 0 ? '+' : ''}
                {c.vsBtc30d.toFixed(1)}%
              </span>
            </span>
          )}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-medium">
        {c.watch && <span className="rounded-md bg-sma20/15 px-2 py-1 text-sma20">👀 Para mirar</span>}
        <span className={clsx('rounded-md px-2 py-1', TREND[c.trend].className)}>{TREND[c.trend].label}</span>
        <span className="rounded-md bg-border px-2 py-1 text-muted">
          {MOVE[c.move]} · ±{c.dailyMove.toFixed(1)}%/día
        </span>
      </div>
      <p className="mt-2 text-xs text-muted">{PLACE[c.place]}</p>
    </Link>
  )
}
