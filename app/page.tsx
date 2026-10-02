import { redirect } from 'next/navigation'
import { auth, authDisabled, signOut } from '@/auth'
import { DashboardLoader } from '@/components/dashboard-loader'

export default async function Home() {
  const session = await auth()
  if (!authDisabled && !session) redirect('/login')

  async function logout() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return <DashboardLoader userName={session?.user?.name ?? null} logout={logout} />
}
