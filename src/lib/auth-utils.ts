import { db } from './db'

/**
 * Obtiene el usuario desde el header X-User-Id (simulación sin login).
 * Si no hay header o el usuario no existe, retorna null.
 */
export async function getUserFromHeader(request: Request): Promise<{ id: string; juzgadoId: string | null; rol: string } | null> {
  const userId = request.headers.get('x-user-id')
  if (!userId) return null
  const user = await db.usuario.findUnique({
    where: { id: userId, activo: true },
    select: { id: true, juzgadoId: true, rol: true }
  })
  return user
}

/**
 * Construye el filtro where para juzgado (en Proceso, etc.).
 * Si el usuario es SUPER_ADMIN o no hay usuario, retorna {} (sin filtro).
 * Si tiene juzgadoId, retorna { juzgadoId }.
 */
export function juzgadoWhere(user: { juzgadoId: string | null; rol: string } | null): Record<string, string> {
  if (!user || user.rol === 'SUPER_ADMIN') return {}
  if (user.juzgadoId) return { juzgadoId: user.juzgadoId }
  return {}
}

/**
 * Filtro para entidades relacionadas con Proceso (providencias, memoriales, oficios, etc.)
 */
export function procesoJuzgadoWhere(user: { juzgadoId: string | null; rol: string } | null): Record<string, unknown> {
  const jw = juzgadoWhere(user)
  if (Object.keys(jw).length === 0) return {}
  return { proceso: jw }
}
