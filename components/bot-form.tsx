'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { STRATEGIES, defaultParams, type BtInterval, type Params, type Strategy } from '@/lib/backtest'

type Props = {
  coins: { symbol: string; base: string; name: string }[]
  symbol: string
  interval: BtInterval
  strategy: Strategy
  params: Params
}

/** Formulario normal (GET): al probar, la página se recarga con los números nuevos en la dirección */
export function BotForm({ coins, symbol, interval, strategy: initial, params }: Props) {
  const [strategy, setStrategy] = useState<Strategy>(initial)
  // Al cambiar de estrategia, los campos vuelven a su configuración recomendada
  const p = strategy === initial ? params : defaultParams(strategy, interval)

  return (
    <form method="get" action="/bot" className="mt-3 rounded-2xl border border-border bg-panel p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {(Object.keys(STRATEGIES) as Strategy[]).map((s) => (
          <label
            key={s}
            className={clsx(
              'flex cursor-pointer flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-center text-sm font-medium transition-colors sm:flex-row sm:justify-center sm:gap-2',
              s === strategy ? 'border-sma20 bg-sma20/10 text-text' : 'border-border text-muted hover:text-text',
            )}
          >
            <input type="radio" name="st" value={s} checked={s === strategy} onChange={() => setStrategy(s)} className="sr-only" />
            <span className="text-lg">{STRATEGIES[s].emoji}</span>
            {STRATEGIES[s].label}
          </label>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 lg:grid-cols-[2fr_1.4fr_1fr_1fr_1fr_auto] lg:items-end">
        <Field label="Moneda" className="col-span-3 lg:col-span-1">
          <select name="s" defaultValue={symbol} className="input">
            <option value="ALL">🔎 Todas (comparar en las del filtro)</option>
            {coins.map((c) => (
              <option key={c.symbol} value={c.symbol}>
                {c.name} ({c.base}/USDT)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Velas" className="col-span-3 lg:col-span-1">
          <select name="i" defaultValue={interval} className="input">
            <option value="4h">Velas de 4 horas (~2 años)</option>
            <option value="1d">Velas de 1 día (~4 años)</option>
          </select>
        </Field>
        {strategy === 'dip' && (
          <Field label="Comprar si baja %">
            <input key={`dip-${strategy}`} name="dip" inputMode="decimal" defaultValue={p.dip} className="input tabular" />
          </Field>
        )}
        {(strategy === 'bounce' || strategy === 'dip') && (
          <Field label="Ganancia %">
            <input key={`tp-${strategy}`} name="tp" inputMode="decimal" defaultValue={p.tp} className="input tabular" />
          </Field>
        )}
        {(strategy === 'bounce' || strategy === 'trend' || strategy === 'dip') && (
          <Field label={strategy === 'dip' ? 'Stop loss % (0 = sin)' : 'Stop loss %'}>
            <input key={`sl-${strategy}`} name="sl" inputMode="decimal" defaultValue={p.sl} className="input tabular" />
          </Field>
        )}
        {strategy === 'bounce' && (
          <Field label="Máx. velas">
            <input key={`max-${strategy}`} name="max" inputMode="numeric" defaultValue={p.maxBars} className="input tabular" />
          </Field>
        )}
        <button
          className={clsx(
            'col-span-3 rounded-lg bg-sma20 px-6 py-2.5 font-semibold text-black active:opacity-80 lg:col-span-1 lg:col-start-6',
          )}
        >
          ▶ Probar
        </button>
      </div>
    </form>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={clsx('block min-w-0 text-sm text-muted', className)}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}
