import type { ClaseProceso } from '@prisma/client'
import type { DatosExtraidos } from '@/lib/parse-reparto'
import { normalizarSubserieSgdeCatalogo, SUBSERIE_SGDE_POR_CLASE } from '@/lib/sgde/catalogo-sgde-serie-subserie'

const CLASES_KNOWN = new Set<string>(Object.keys(SUBSERIE_SGDE_POR_CLASE))

/** Metadatos SGDE guardados en Proceso.demandaSgdeMetadata: la IA infiere Serie/Subserie (no suelen venir en el escrito). */
export type DemandaSgdeMetadataGuardada = {
  serie?: string
  subserie?: string
  nombreExpediente?: string
  codigoSubserie?: string
  categoriaProceso?: 'CIVIL' | 'CONSTITUCIONAL'
}

export function esTextoNoIdentifica(s: string | null | undefined): boolean {
  if (s == null || !String(s).trim()) return true
  return /no\s+se\s+identifica/i.test(String(s).trim())
}

export function demandaSgdeMetadataDesdeDatos(datos: DatosExtraidos): DemandaSgdeMetadataGuardada | null {
  const o: DemandaSgdeMetadataGuardada = {}
  if (datos.sgdeSerie && !esTextoNoIdentifica(datos.sgdeSerie)) o.serie = datos.sgdeSerie.trim().slice(0, 120)
  if (datos.sgdeSubserie && !esTextoNoIdentifica(datos.sgdeSubserie)) {
    let sub = datos.sgdeSubserie.trim().slice(0, 120)
    const cp = datos.claseProceso?.trim()
    if (cp && CLASES_KNOWN.has(cp)) {
      sub = normalizarSubserieSgdeCatalogo(sub, cp as ClaseProceso)
    }
    o.subserie = sub
  }
  if (datos.sgdeNombreExpediente && !esTextoNoIdentifica(datos.sgdeNombreExpediente))
    o.nombreExpediente = datos.sgdeNombreExpediente.trim().slice(0, 300)
  if (datos.sgdeCodigoSubserie && !esTextoNoIdentifica(datos.sgdeCodigoSubserie))
    o.codigoSubserie = datos.sgdeCodigoSubserie.trim().slice(0, 120)
  if (datos.sgdeCategoriaProceso === 'CIVIL' || datos.sgdeCategoriaProceso === 'CONSTITUCIONAL')
    o.categoriaProceso = datos.sgdeCategoriaProceso

  return Object.keys(o).length ? o : null
}
