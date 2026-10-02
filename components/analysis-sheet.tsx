'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { coinName, fmt, signed, type Bar } from '@/lib/binance'
import { AHEAD, FLAT, type Analysis, type Direction } from '@/lib/analysis'

const day = (b: Bar) => new Date(b.time * 1000).toLocaleDateString('es', { day: 'numeric', month: 'short' })

export type SheetState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; analysis: Analysis }

type Props = { state: SheetState; onClose: () => void; onShowOnChart: () => void }

export function AnalysisSheet({ state, onClose, onShowOnChart }: Props) {
  // Cerrar con Escape y no dejar que la página de atrás se mueva
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center md:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="safe-bottom relative max-h-[92svh] w-full overflow-y-auto rounded-t-2xl border border-border bg-panel px-5 pt-5 pb-6 leading-relaxed md:max-w-2xl md:rounded-2xl md:p-7">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 rounded-lg p-2 text-muted hover:bg-bg active:bg-bg"
        >
          <X size={20} />
        </button>

        {state.status === 'loading' && <p className="py-10 text-center text-muted">Analizando…</p>}
        {state.status === 'error' && (
          <p className="py-10 text-center text-down">No se pudo conectar con Binance. Intenta de nuevo.</p>
        )}
        {state.status === 'ready' && <Content a={state.analysis} onShowOnChart={onShowOnChart} />}
      </div>
    </div>
  )
}

function Content({ a, onShowOnChart }: { a: Analysis; onShowOnChart: () => void }) {
  const { summary: s, trend: t, stairs, yellow: y, volume: v, odds: o } = a
  const days = a.days

  return (
    <>
      <h2 className="pr-10 text-xl font-semibold">{coinName(a.symbol)}: últimos 2 meses</h2>
      <p className="text-sm text-muted">
        Del {day(days[0])} al {day(days[days.length - 1])} · cada vela = 1 día
      </p>

      <Section title="📈 Resumen">
        <p>
          Empezó en <b>{fmt(s.first)}</b> y hoy está en <b>{fmt(a.price)}</b>:{' '}
          {Math.abs(s.change) < 3 ? (
            'casi no se movió'
          ) : (
            <b className={s.change > 0 ? 'text-up' : 'text-down'}>
              {s.change > 0 ? 'subió' : 'bajó'} {signed(s.change)}
            </b>
          )}
          .
        </p>
        <ul className="mt-1 list-disc pl-5">
          <li>Lo más alto: <b>{fmt(s.maxBar.high)}</b> ({day(s.maxBar)})</li>
          <li>Lo más bajo: <b>{fmt(s.minBar.low)}</b> ({day(s.minBar)})</li>
          <li>Hoy está a <b>{signed(s.fromMax)}</b> de su punto más alto.</li>
        </ul>
      </Section>

      <Section title="🧭 Tendencia (las líneas)">
        <p>
          {t.kind === 'up' && (
            <>La <b>azul</b> va subiendo y la <b>amarilla</b> está por encima de ella. <b className="text-up">Tendencia alcista</b>: lo reciente va mejor que lo de antes.</>
          )}
          {t.kind === 'down' && (
            <>La <b>azul</b> va bajando y la <b>amarilla</b> está por debajo de ella. <b className="text-down">Tendencia bajista</b>: lo reciente va peor que lo de antes.</>
          )}
          {t.kind === 'flat' && (
            <>Las líneas no van en una dirección clara (la azul casi plana o cruzándose con la amarilla). <b>Sin tendencia clara</b>.</>
          )}
        </p>
        <Muted>
          Amarilla (20 días): {fmt(t.s20)} · Azul (50 días): {fmt(t.s50)} · La azul se movió {signed(t.slope)} en 10 días.
        </Muted>
      </Section>

      <Section title="🪜 La forma del movimiento">
        <p>
          {stairs.kind === 'up' && <>Sube en <b>escalones</b>: cada tramo llega más alto y sus caídas se quedan más arriba que antes. Es la forma típica de una subida sana: sube, descansa, sube.</>}
          {stairs.kind === 'down' && <>Baja en <b>escalones</b>: cada tramo llega más bajo y sus rebotes no alcanzan lo de antes.</>}
          {stairs.kind === 'flat' && <>No forma una escalera clara: los tramos se pisan entre sí, va más bien <b>de lado</b>.</>}
        </p>
        <ul className="mt-1 list-disc pl-5">
          {stairs.blocks.map((b, i) => (
            <li key={i}>
              <b>Tramo {i + 1}</b> ({day(b.from)} – {day(b.to)}): entre <b>{fmt(b.low)}</b> y <b>{fmt(b.high)}</b>{' '}
              <Dot dir={b.color} />
            </li>
          ))}
        </ul>
        <Muted>En el gráfico: cuadro verde = ese tramo quedó más arriba que el anterior, rojo = más abajo, gris = no está claro.</Muted>
      </Section>

      <Section title="🟡 La línea amarilla como piso">
        <p>
          {y.kind === 'touching' && <>Ahora mismo el precio está <b>tocando la amarilla</b> ({signed(y.dist)}). Es un momento clave: si rebota, la subida puede seguir; si la atraviesa hacia abajo, se está cansando.</>}
          {y.kind === 'above' && <>El precio está <b>{signed(y.dist)} por encima</b> de la amarilla.</>}
          {y.kind === 'far' && <>El precio está <b>{signed(y.dist)} por encima</b> de la amarilla. Está bastante lejos: subió rápido y suele volver a acercarse a la línea.</>}
          {y.kind === 'below' && <>El precio está <b className="text-down">{signed(y.dist)} por debajo</b> de la amarilla: perdió ese &quot;piso&quot;, señal de debilidad.</>}
        </p>
        {y.touches.length ? (
          <>
            <p className="mt-1">Veces que la tocó:</p>
            <ul className="list-disc pl-5">
              {y.touches.map((tc) => (
                <li key={tc.bar.time}>
                  {day(tc.bar)}: la tocó y {tc.result === 'pendiente' ? 'todavía no se sabe' : tc.result === 'rebotó' ? 'rebotó ✓' : 'siguió bajando ✗'}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1">En estos 2 meses no bajó a tocarla.</p>
        )}
      </Section>

      <Section title="📊 Volumen (las barras de abajo)">
        <p>
          {v.mostlyUp ? (
            <>La mayoría de los días con <b>más movimiento</b> fueron de <b className="text-up">subida</b>: cuando sube, sube con mucha gente comprando. Eso hace la subida más &quot;seria&quot;.</>
          ) : (
            <>La mayoría de los días con <b>más movimiento</b> fueron de <b className="text-down">bajada</b>: cuando cae, mucha gente vende a la vez.</>
          )}
        </p>
        <ul className="mt-1 list-disc pl-5">
          {v.top.map((b) => {
            const change = ((b.close - b.open) / b.open) * 100
            return (
              <li key={b.time}>
                {day(b)}: {change > 0 ? '🟢 subió' : '🔴 bajó'} {signed(change)}
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title="🎲 ¿Qué pasó antes en situaciones parecidas?">
        {o.n < 15 ? (
          <p>
            Hoy la tendencia es <b>{o.trend}</b> y el precio está <b>{placeText[o.place]}</b>, pero en el pasado casi no hubo
            días así ({o.n}). No hay suficientes casos para sacar una probabilidad.
          </p>
        ) : (
          <>
            <p>
              Hoy la tendencia es <b>{o.trend}</b> y el precio está <b>{placeText[o.place]}</b>. En los últimos{' '}
              {o.years.toFixed(1)} años hubo <b>{o.n} días</b> en esa misma situación. Esto pasó <b>{AHEAD} días después</b>:
            </p>
            <OddsRow label="🟢 Subió" p={o.pUp} color="bg-up" extra={o.medUp ? `Cuando subió, lo normal fue ${signed(o.medUp)}` : ''} />
            <OddsRow label="⚪ Casi igual" p={o.pFlat} color="bg-muted" extra={`Se movió menos de ±${FLAT}%`} />
            <OddsRow label="🔴 Bajó" p={o.pDown} color="bg-down" extra={o.medDown ? `Cuando bajó, lo normal fue ${signed(o.medDown)}` : ''} />
            <Muted>
              Para comparar: tomando <i>cualquier</i> día, subió más de {FLAT}% el {o.baseUp.toFixed(0)}% de las veces. Si el
              número de arriba es parecido, la situación de hoy no da mucha ventaja.
            </Muted>
            {o.n < 40 && <Muted>⚠️ Son pocos casos: tómalo con pinzas.</Muted>}
            <Muted>
              Ojo: días seguidos se parecen mucho entre sí, así que en realidad son menos &quot;casos distintos&quot; de lo que
              parece. El pasado no garantiza el futuro.
            </Muted>
          </>
        )}
      </Section>

      <Section title="🧠 ¿Qué pensaría un trader?">
        <p className="rounded border-l-3 border-sma20 bg-bg px-4 py-3 italic">&quot;{a.verdict}&quot;</p>
      </Section>

      <button
        onClick={onShowOnChart}
        className="mt-6 w-full rounded-lg bg-sma20 py-3 font-semibold text-black active:opacity-80"
      >
        👁 Ver en el gráfico
      </button>
      <Muted>Esto es una lectura automática con reglas simples, no una predicción ni un consejo financiero.</Muted>
    </>
  )
}

const placeText = { tocando: 'tocando la amarilla', encima: 'por encima de la amarilla', debajo: 'por debajo de la amarilla' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-1.5 font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm text-muted">{children}</p>
}

function Dot({ dir }: { dir: Direction }) {
  const color = { up: 'bg-up', down: 'bg-down', flat: 'bg-muted' }[dir]
  return <span className={`inline-block size-2 rounded-full align-middle ${color}`} />
}

function OddsRow({ label, p, color, extra }: { label: string; p: number; color: string; extra: string }) {
  return (
    <div className="mt-3">
      <div className="grid grid-cols-[6.5rem_1fr_2.75rem] items-center gap-3">
        <span>{label}</span>
        <div className="h-3 overflow-hidden rounded-full bg-bg">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${p}%` }} />
        </div>
        <b className="tabular text-right">{p.toFixed(0)}%</b>
      </div>
      {extra && <p className="mt-0.5 pl-[7.25rem] text-sm text-muted">{extra}</p>}
    </div>
  )
}
