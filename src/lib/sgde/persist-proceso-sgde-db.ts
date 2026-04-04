import { db } from '@/lib/db'

/**
 * Lectura/escritura de sgdeExpedienteAlfrescoId / sgdeExpedienteCreadoAt vía SQL cuando el cliente
 * Prisma no incluye esos campos (Unknown argument 'sgdeExpedienteAlfrescoId').
 */
export async function leerSgdeExpedienteAlmacenado(procesoId: string): Promise<{
  alfrescoId: string | null
  creadoAt: Date | null
}> {
  const rows = await db.$queryRawUnsafe<
    Array<{ sgdeExpedienteAlfrescoId: string | null; sgdeExpedienteCreadoAt: string | null }>
  >(
    'SELECT sgdeExpedienteAlfrescoId, sgdeExpedienteCreadoAt FROM procesos WHERE id = ? LIMIT 1',
    procesoId
  )
  const r = rows[0]
  if (!r) return { alfrescoId: null, creadoAt: null }
  const id = r.sgdeExpedienteAlfrescoId?.trim() || null
  let creadoAt: Date | null = null
  if (r.sgdeExpedienteCreadoAt) {
    const d = new Date(r.sgdeExpedienteCreadoAt)
    if (!Number.isNaN(d.getTime())) creadoAt = d
  }
  return { alfrescoId: id, creadoAt }
}

export async function guardarSgdeExpedienteEnProceso(
  procesoId: string,
  nodeId: string,
  creadoAt: Date
): Promise<void> {
  await db.$executeRawUnsafe(
    `UPDATE procesos SET sgdeExpedienteAlfrescoId = ?, sgdeExpedienteCreadoAt = ?, updatedAt = datetime('now') WHERE id = ?`,
    nodeId,
    creadoAt.toISOString(),
    procesoId
  )
}

/** Borra el vínculo local con SGDE (no borra nada en el gestor). */
export async function limpiarSgdeExpedienteEnProceso(procesoId: string): Promise<void> {
  await db.$executeRawUnsafe(
    `UPDATE procesos SET sgdeExpedienteAlfrescoId = NULL, sgdeExpedienteCreadoAt = NULL, updatedAt = datetime('now') WHERE id = ?`,
    procesoId
  )
}
