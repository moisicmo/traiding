'use client'

import { useState } from 'react'

// Íconos de un repositorio público. Si una moneda no tiene, mostramos su inicial en un círculo.
const ICON = (base: string) => `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${base.toLowerCase()}.svg`

export function CoinIcon({ base, size = 36 }: { base: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed)
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-border font-semibold text-text"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        aria-hidden
      >
        {base.slice(0, 1)}
      </span>
    )
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ícono externo pequeño, no necesita optimización
    <img src={ICON(base)} alt="" width={size} height={size} className="shrink-0" onError={() => setFailed(true)} />
  )
}
