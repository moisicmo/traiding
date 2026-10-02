import { redirect } from 'next/navigation'
import { auth, authDisabled } from '@/auth'
import { AppNav } from '@/components/app-nav'

// Todas las pantallas de la app (menos /login) comparten este layout: login obligatorio + menú
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!authDisabled && !(await auth())) redirect('/login')

  return (
    <div className="flex min-h-svh flex-col md:h-svh">
      <AppNav />
      {/* En el celular dejamos espacio abajo para la barra de pestañas */}
      <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:min-h-0 md:pb-0">{children}</div>
    </div>
  )
}
