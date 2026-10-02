import clsx from 'clsx'

export type BinanceStatus =
  | { configured: false }
  | {
      configured: true
      readOnly?: boolean
      canTrade?: boolean
      canWithdraw?: boolean
      ipRestrict?: boolean
      lastSync: number | null
      error: string | null
    }

const ago = (ms: number) => {
  const min = Math.round((Date.now() - ms) / 60_000)
  return min < 1 ? 'hace menos de un minuto' : min === 1 ? 'hace 1 minuto' : `hace ${min} minutos`
}

export function BinanceSetup({ status }: { status: BinanceStatus }) {
  if (!status.configured)
    return (
      <ol className="mt-4 list-decimal space-y-2 rounded-2xl border border-border bg-panel p-4 pl-9 text-[15px] leading-relaxed [&_code]:rounded [&_code]:bg-bg [&_code]:px-1 [&_code]:text-sm">
        <li>En Binance: <b>Perfil → Gestión de API → Crear API</b> → &quot;Generada por el sistema&quot;.</li>
        <li>Ponle un nombre (por ejemplo <i>trading-nas</i>) y confirma con tu 2FA.</li>
        <li>
          Deja marcado <b>solo &quot;Habilitar lectura&quot;</b>. <span className="text-down">No actives trading ni retiros.</span>
        </li>
        <li>Copia la <b>API key</b> y la <b>Secret key</b> (la secret se muestra una sola vez).</li>
        <li>
          En el <code>.env</code> del NAS: <code>BINANCE_API_KEY=...</code> y <code>BINANCE_API_SECRET=...</code>, y corre{' '}
          <code>sudo docker compose up -d</code>.
        </li>
      </ol>
    )

  return (
    <div className="mt-4 space-y-2 rounded-2xl border border-border bg-panel p-4 text-[15px]">
      {status.error ? (
        <p className="text-down">{status.error}</p>
      ) : (
        <p className="text-up">✓ Conectado</p>
      )}
      {status.readOnly !== undefined && (
        <p className={clsx(status.readOnly ? 'text-up' : 'text-down')}>
          {status.readOnly
            ? '✓ La API key es de solo lectura'
            : `⚠️ La API key tiene permisos de más (${[status.canTrade && 'trading', status.canWithdraw && 'retiros'].filter(Boolean).join(' y ')}). Crea una nueva solo de lectura.`}
        </p>
      )}
      {status.ipRestrict === false && (
        <p className="text-muted">Sugerencia: en Binance puedes restringir la key a la IP pública del NAS para más seguridad.</p>
      )}
      <p className="text-muted">
        Revisión de órdenes: {status.lastSync ? ago(status.lastSync) : 'todavía no corrió'} · cada minuto
      </p>
    </div>
  )
}
