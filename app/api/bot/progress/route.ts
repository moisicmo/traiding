import { auth, authDisabled } from '@/auth'
import { getJob } from '@/lib/paper-bot'

// Progreso de "empezar la competencia" (lo consulta la barra de progreso cada segundo y medio)
export async function GET() {
  if (!authDisabled && !(await auth())) return Response.json({ error: 'No autorizado' }, { status: 401 })
  return Response.json(getJob(), { headers: { 'Cache-Control': 'no-store' } })
}
