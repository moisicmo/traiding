import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

// Solo estos correos pueden entrar
const allowedEmails = (process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

// Para desarrollar sin credenciales de Google. Nunca se respeta en producción.
export const authDisabled = process.env.NODE_ENV !== 'production' && process.env.AUTH_DISABLED === 'true'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase()
      return !!email && profile?.email_verified !== false && allowedEmails.includes(email)
    },
    // Lo usa proxy.ts: si devuelve false, redirige a /login
    authorized({ auth }) {
      return authDisabled || !!auth?.user
    },
  },
})
