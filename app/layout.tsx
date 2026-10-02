import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Trading',
  description: 'Mi herramienta de trading: gráficos, análisis y simulador',
  appleWebApp: { capable: true, title: 'Trading', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: '#0f1218',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-svh antialiased">{children}</body>
    </html>
  )
}
