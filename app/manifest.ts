import type { MetadataRoute } from 'next'

// Permite "Agregar a pantalla de inicio" en el iPhone y abrirla como una app
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Trading',
    short_name: 'Trading',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1218',
    theme_color: '#0f1218',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
