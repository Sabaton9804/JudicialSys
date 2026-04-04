import { db } from '@/lib/db'
import type { DemandaSgdeMetadataGuardada } from '@/lib/sgde/demanda-sgde-metadata'

/**
 * Persistencia de demandaSgdeMetadata vía SQL: evita errores cuando el cliente de Prisma
 * no se ha regenerado tras añadir el campo (Unknown argument 'demandaSgdeMetadata').
 */
export async function guardarDemandaSgdeMetadata(
  procesoId: string,
  meta: DemandaSgdeMetadataGuardada
): Promise<void> {
  const json = JSON.stringify(meta)
  await db.$executeRawUnsafe(
    'UPDATE procesos SET demandaSgdeMetadata = ?, updatedAt = datetime(\'now\') WHERE id = ?',
    json,
    procesoId
  )
}

/** Lee metadatos SGDE; usa SQL para que funcione aunque findFirst del cliente antiguo no proyecte la columna. */
export async function leerDemandaSgdeMetadata(
  procesoId: string
): Promise<DemandaSgdeMetadataGuardada | null> {
  const rows = await db.$queryRawUnsafe<Array<{ demandaSgdeMetadata: string | null }>>(
    'SELECT demandaSgdeMetadata FROM procesos WHERE id = ? LIMIT 1',
    procesoId
  )
  const raw = rows[0]?.demandaSgdeMetadata
  if (raw == null || raw === '') return null
  try {
    return JSON.parse(raw) as DemandaSgdeMetadataGuardada
  } catch {
    return null
  }
}
