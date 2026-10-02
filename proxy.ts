// Revisión rápida en cada visita: sin sesión → a /login.
// Las páginas vuelven a verificar con auth() (ver app/page.tsx).
export { auth as proxy } from '@/auth'

export const config = {
  // Todo menos el login, las rutas de Auth.js y los archivos que el iPhone pide sin sesión (íconos, manifest)
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest).*)'],
}
