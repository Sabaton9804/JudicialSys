import { db } from '@/lib/db'

/**
 * Lectura/escritura de sgdeContenedorExpedientesUuid vía SQL para cuando el cliente Prisma
 * no proyecta el campo (Unknown field 'sgdeContenedorExpedientesUuid' en select de Juzgado).
 */
export async function leerContenedorExpedientesJuzgado(juzgadoId: string): Promise<string | null> {
  const rows = await db.$queryRawUnsafe<Array<{ sgdeContenedorExpedientesUuid: string | null }>>(
    'SELECT sgdeContenedorExpedientesUuid FROM juzgados WHERE id = ? LIMIT 1',
    juzgadoId
  )
  const v = rows[0]?.sgdeContenedorExpedientesUuid
  return v?.trim() || null
}

export async function guardarContenedorExpedientesJuzgado(
  juzgadoId: string,
  uuid: string
): Promise<void> {
  await db.$executeRawUnsafe(
    'UPDATE juzgados SET sgdeContenedorExpedientesUuid = ?, updatedAt = datetime(\'now\') WHERE id = ?',
    uuid,
    juzgadoId
  )
}
