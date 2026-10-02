'use client'

import { useState } from 'react'
import { coinName, fmt, type Symbol } from '@/lib/binance'

// Simulador de trading con dinero ficticio (paper trading).
// Por ahora se guarda en este navegador; más adelante pasará a la base de datos.
const FEE = 0.001 // Binance cobra ~0.1% por operación
const START_USDT = 1000
const STORAGE_KEY = 'wallet'

type Position = { qty: number; cost: number }
type Wallet = { usdt: number; coins: Partial<Record<Symbol, Position>>; history: string[] }

const newWallet = (): Wallet => ({ usdt: START_USDT, coins: {}, history: [] })

function loadWallet(): Wallet {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') ?? newWallet()
  } catch {
    return newWallet()
  }
}

export function Simulator({ symbol, price }: { symbol: Symbol; price: number | null }) {
  const [wallet, setWallet] = useState(loadWallet)
  const [amount, setAmount] = useState('100')
  const coin = coinName(symbol)

  function save(next: Wallet, text: string) {
    next.history = [`${new Date().toLocaleString('es')} · ${text}`, ...next.history].slice(0, 50)
    setWallet(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {}
  }

  function buy() {
    const usdt = +amount
    if (!price || !(usdt > 0)) return
    if (usdt > wallet.usdt) return alert('No tienes suficiente USDT')

    const qty = (usdt * (1 - FEE)) / price
    const pos = wallet.coins[symbol] ?? { qty: 0, cost: 0 }
    save(
      {
        ...wallet,
        usdt: wallet.usdt - usdt,
        // cost = cuánto USDT has metido en total (para calcular la ganancia)
        coins: { ...wallet.coins, [symbol]: { qty: pos.qty + qty, cost: pos.cost + usdt } },
      },
      `Compra ${qty.toFixed(6)} ${coin} a ${fmt(price)}`,
    )
  }

  function sell() {
    const pos = wallet.coins[symbol]
    if (!price || !pos) return
    const received = pos.qty * price * (1 - FEE)
    const profit = received - pos.cost
    const coins = { ...wallet.coins }
    delete coins[symbol]
    save(
      { ...wallet, usdt: wallet.usdt + received, coins },
      `Venta ${pos.qty.toFixed(6)} ${coin} a ${fmt(price)} → ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USDT`,
    )
  }

  function reset() {
    if (!confirm(`¿Reiniciar con ${START_USDT} USDT?`)) return
    const fresh = newWallet()
    setWallet(fresh)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
    } catch {}
  }

  const pos = wallet.coins[symbol]
  const posValue = pos && price ? pos.qty * price : 0
  // Las otras monedas se valoran por lo que costaron (aproximación: no tenemos su precio aquí)
  const others = Object.entries(wallet.coins)
    .filter(([s]) => s !== symbol)
    .reduce((sum, [, p]) => sum + (p?.cost ?? 0), 0)
  const total = wallet.usdt + posValue + others
  const pnl = total - START_USDT

  return (
    <section>
      <h2 className="font-semibold">Simulador <span className="font-normal text-muted">(dinero ficticio)</span></h2>

      <dl className="tabular mt-3 space-y-1.5 text-sm">
        <Row label="USDT" value={wallet.usdt.toFixed(2)} />
        <Row label={coin} value={pos ? pos.qty.toFixed(6) : '0'} />
        <Row label="Valor total" value={`${total.toFixed(2)} USDT`} />
        <Row
          label="Ganancia / pérdida"
          value={`${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} (${((pnl / START_USDT) * 100).toFixed(2)}%)`}
          className={pnl >= 0 ? 'text-up' : 'text-down'}
        />
      </dl>

      <label className="mt-4 block text-sm text-muted">
        Monto en USDT
        <input
          type="number"
          inputMode="decimal"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="tabular mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base text-text outline-none focus:border-muted"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={buy} className="rounded-lg bg-up py-3 font-semibold text-white active:opacity-80">
          Comprar
        </button>
        <button onClick={sell} className="rounded-lg bg-down py-3 font-semibold text-white active:opacity-80">
          Vender todo
        </button>
      </div>
      <button onClick={reset} className="mt-2 py-1 text-sm text-muted underline">
        Reiniciar cuenta
      </button>

      {wallet.history.length > 0 && (
        <>
          <h3 className="mt-5 text-sm text-muted">Historial</h3>
          <ul className="mt-1 divide-y divide-border text-sm">
            {wallet.history.slice(0, 30).map((h, i) => (
              <li key={i} className="py-2">{h}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Row({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-semibold ${className}`}>{value}</dd>
    </div>
  )
}
