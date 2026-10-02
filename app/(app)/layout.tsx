import { redirect } from 'next/navigation'
import { auth, authDisabled } from '@/auth'
import { AppNav } from '@/components/app-nav'

// Todas las pantallas de la app (menos /login) comparten este layout: login obligatorio + menú
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!authDisabled && !(await auth())) redirect('/login')

  return (
    // Alto fijo de pantalla: arriba el menú (computadora), al medio el contenido con scroll, abajo las pestañas (iPhone)
    <div className="flex h-full flex-col">
      <AppNav position="top" />
      <div id="app-scroll" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {children}
      </div>
      <AppNav position="bottom" />
    </div>
  )
}
