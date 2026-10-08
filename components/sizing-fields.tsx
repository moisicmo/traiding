'use client'

import { useState } from 'react'
import type { Sizing } from '@/lib/paper-bot'

/** "Monto por operación": automático, fijo o según el riesgo de cada estrategia */
export function SizingFields({ initial }: { initial: Sizing }) {
  const [mode, setMode] = useState(initial.mode)
  return (
    <>
      <label className="block text-sm text-muted sm:w-72">
        Monto por operación
        <select name="sizing" value={mode} onChange={(e) => setMode(e.target.value as Sizing['mode'])} className="input mt-1">
          <option value="auto">Automático: 1/4 de la cartera (máx. 4)</option>
          <option value="fixed">Monto fijo en USDT</option>
          <option value="risk">Según el riesgo de cada estrategia</option>
        </select>
        <span className="mt-1 block text-xs">
          {mode === 'auto' && 'Cada compra usa un cuarto de lo que vale la cartera.'}
          {mode === 'fixed' && 'Cada compra usa siempre el mismo monto, mientras le alcance la plata.'}
          {mode === 'risk' && 'Si salta el stop, cada operación pierde solo este % de la cartera: stop cerca = pone más, lejos = pone menos.'}
        </span>
      </label>
      {mode === 'fixed' && (
        <label className="block text-sm text-muted sm:w-40">
          USDT por compra
          <input name="amount" inputMode="decimal" defaultValue={initial.amount} className="input tabular mt-1" />
        </label>
      )}
      {mode === 'risk' && (
        <label className="block text-sm text-muted sm:w-40">
          % que arriesga
          <input name="risk" inputMode="decimal" defaultValue={initial.risk} className="input tabular mt-1" />
        </label>
      )}
    </>
  )
}
