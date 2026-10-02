// Se ejecuta una vez cuando arranca el servidor de Next.js
export async function register() {
  // Las tareas automáticas usan SQLite y crypto de Node: solo en el runtime de Node.js
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startJobs } = await import('./lib/jobs')
    startJobs()
  }
}
