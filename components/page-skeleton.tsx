// Lo que se ve mientras la pantalla pide los datos a Binance
export function PageSkeleton({ title, cards = 3 }: { title: string; cards?: number }) {
  return (
    <main className="safe-top mx-auto w-full max-w-2xl px-4 py-6" aria-busy="true">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-2 h-4 w-48 animate-pulse rounded bg-panel" />
      <div className="mt-6 h-28 animate-pulse rounded-2xl bg-panel" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-panel" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </main>
  )
}
