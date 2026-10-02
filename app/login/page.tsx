import { redirect } from 'next/navigation'
import { auth, authDisabled, signIn } from '@/auth'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (authDisabled || (await auth())) redirect('/')
  const { error } = await searchParams

  return (
    <main className="safe-top safe-bottom flex h-full items-center justify-center overflow-y-auto px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-panel p-8 text-center">
        <h1 className="text-xl font-semibold">Trading</h1>
        <p className="mt-1 text-sm text-muted">Entra con tu cuenta de Google</p>

        {error && (
          <p className="mt-6 rounded-lg bg-down/15 px-3 py-2 text-sm text-down">
            {error === 'AccessDenied' ? 'Esta cuenta no tiene acceso.' : 'No se pudo iniciar sesión. Intenta de nuevo.'}
          </p>
        )}

        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: '/' })
          }}
        >
          <button className="mt-6 w-full rounded-lg bg-text px-4 py-3 font-semibold text-bg active:opacity-80">
            Entrar con Google
          </button>
        </form>
      </div>
    </main>
  )
}
