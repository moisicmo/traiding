import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Trading',
  description: 'Mi herramienta de trading: gráficos, análisis y simulador',
  // 'black': iOS deja la barra de estado aparte (negra) y la app ocupa exactamente el resto de la pantalla.
  // Con 'black-translucent' iOS calculaba mal el alto y quedaba un espacio vacío bajo las pestañas.
  appleWebApp: { capable: true, title: 'Trading', statusBarStyle: 'black' },
}

export const viewport: Viewport = {
  themeColor: '#0f1218',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
