/**
 * Edición del estado (lista fijada en Secretaría): un Estado N.º por año agrupa
 * las providencias publicadas el mismo día (mismo juzgado).
 */
import { db } from '@/lib/db'

/** Busca la edición del día para el juzgado; si no existe, crea la siguiente (N.º correlativo por año). */
export async function findOrCreateEdicionEstadoDelDia(juzgadoId: string) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  const start = new Date(y, m, d, 0, 0, 0, 0)
  const end = new Date(y, m, d, 23, 59, 59, 999)

  const existing = await db.edicionEstado.findFirst({
    where: {
      juzgadoId,
      fechaPublicacion: { gte: start, lte: end },
    },
    orderBy: { numero: 'desc' },
  })
  if (existing) return existing

  const agg = await db.edicionEstado.aggregate({
    where: { juzgadoId, anio: y },
    _max: { numero: true },
  })
  const nextNum = (agg._max.numero ?? 0) + 1

  return db.edicionEstado.create({
    data: {
      juzgadoId,
      numero: nextNum,
      anio: y,
      fechaPublicacion: now,
    },
  })
}

export function formatoEstadoNumero(numero: number): string {
  return String(numero).padStart(3, '0')
}
