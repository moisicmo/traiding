import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  output: 'standalone',
  // El indicador de desarrollo abajo a la izquierda tapaba la pestaña "Gráfico"
  devIndicators: { position: 'top-right' },
  turbopack: {
    root: path.resolve(__dirname),
  },
}

export default nextConfig
