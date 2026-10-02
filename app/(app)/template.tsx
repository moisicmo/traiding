'use client'

import { useLayoutEffect } from 'react'

// Se vuelve a montar en cada cambio de pestaña: anima la entrada y vuelve el scroll arriba
export default function Template({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    document.getElementById('app-scroll')?.scrollTo(0, 0)
  }, [])

  return <div className="animate-page flex flex-1 flex-col md:min-h-0">{children}</div>
}
