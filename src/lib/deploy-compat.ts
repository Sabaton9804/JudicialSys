/**
 * Errores típicos cuando la app corre en Cloudflare Workers (OpenNext + build CF)
 * pero el proyecto asume Node local: SQLite en archivo y paquetes sustituidos por stubs.
 */

function texto(error: unknown): string {
  if (error instanceof Error) return `${error.message}\n${error.stack ?? ''}`
  return String(error)
}

/**
 * Si el error encaja en un caso conocido de entorno incompatible, devuelve un mensaje
 * orientativo para la API (español). Si no, null.
 */
export function mensajeErrorEntornoApi(error: unknown): string | null {
  const raw = texto(error)
  const low = raw.toLowerCase()

  if (raw.includes('mailparser no disponible en despliegue Cloudflare')) {
    return (
      'La importación desde .eml no está disponible en el Worker de Cloudflare: en el build CF se sustituye mailparser por un stub para reducir el tamaño del bundle. ' +
      'Use `npm run dev` en su PC o despliegue la app en un servidor Node (Docker, Railway, VPS, etc.). Consulte docs/DESPLIEGUE.md.'
    )
  }

  if (
    low.includes('sqlite_cantopen') ||
    low.includes('unable to open database file') ||
    (low.includes('enoent') && low.includes('.db')) ||
    low.includes('erofs') ||
    (low.includes('prisma') && low.includes('database') && low.includes('file:'))
  ) {
    return (
      'No se pudo usar la base de datos: en Cloudflare Workers una SQLite con `file:./...` no es persistente y suele fallar. ' +
      'Defina una base remota compatible con Prisma (PostgreSQL, Turso/LibSQL, Neon, etc.) o aloje la API en Node. Consulte docs/DESPLIEGUE.md.'
    )
  }

  if (
    low.includes('environment variable not found: database_url') ||
    low.includes('invalid `prisma') && low.includes('database_url')
  ) {
    return 'Falta DATABASE_URL o Prisma no puede conectar. Revise las variables del Worker o del contenedor.'
  }

  return null
}

export function jsonApiErrorConEntorno(
  error: unknown,
  fallback: string
): { body: { success: false; error: string; entornoIncompatible?: true }; status: number } {
  const orientado = mensajeErrorEntornoApi(error)
  if (orientado) {
    return {
      body: { success: false, error: orientado, entornoIncompatible: true },
      status: 503,
    }
  }
  const msg = error instanceof Error ? error.message : String(error)
  return {
    body: { success: false, error: (msg && msg.trim()) || fallback },
    status: 500,
  }
}
