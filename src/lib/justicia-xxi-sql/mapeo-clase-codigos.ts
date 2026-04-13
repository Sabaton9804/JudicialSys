import type { CategoriaProceso, ClaseProceso } from '@prisma/client'

/** Códigos T069/T052/T053/T071/T056 para T103DAINFOPROC (valores típicos civil). */
export type CodigosClasificacionT103 = {
  codiarea: string
  codiproc: string
  codiclas: string
  codisubc: string
  codirecu: string
}

/**
 * Mapeo heurístico clase JudicialSys → catálogos Consejo.
 * Ajuste con JUSTICIA_XXI_MAP_JSON si necesita otro criterio.
 */
export function mapearClaseProcesoJusticiaXxi(
  clase: ClaseProceso,
  categoria: CategoriaProceso
): CodigosClasificacionT103 {
  if (categoria === 'CONSTITUCIONAL' || clase === 'TUTELA' || clase === 'ACCION_DE_TUTELA_CONTRA_PROVIDENCIA') {
    return { codiarea: '0003', codiproc: '3009', codiclas: '3082', codisubc: '0000', codirecu: '0000' }
  }
  if (clase === 'ACCION_POPULAR') {
    return { codiarea: '0003', codiproc: '3001', codiclas: '3012', codisubc: '3044', codirecu: '0000' }
  }
  if (clase === 'ACCION_DE_GRUPO') {
    return { codiarea: '0003', codiproc: '3001', codiclas: '3013', codisubc: '3087', codirecu: '0000' }
  }
  if (clase === 'ACCION_DE_CUMPLIMIENTO') {
    return { codiarea: '0003', codiproc: '3001', codiclas: '3014', codisubc: '3087', codirecu: '0000' }
  }
  if (clase === 'ORDINARIO') {
    return { codiarea: '0003', codiproc: '3001', codiclas: '3001', codisubc: '3087', codirecu: '0000' }
  }
  if (clase === 'HABEAS_CORPUS') {
    return { codiarea: '0003', codiproc: '3002', codiclas: '3090', codisubc: '3087', codirecu: '0000' }
  }
  if (clase === 'EJECUTIVO_SINGULAR') {
    return { codiarea: '0003', codiproc: '3006', codiclas: '3056', codisubc: '3053', codirecu: '0000' }
  }
  if (clase === 'EJECUTIVO_HIPOTECARIO') {
    return { codiarea: '0003', codiproc: '3006', codiclas: '3057', codisubc: '0000', codirecu: '0000' }
  }
  if (clase === 'EJECUTIVO_PRENDARIO') {
    return { codiarea: '0003', codiproc: '3006', codiclas: '3058', codisubc: '0000', codirecu: '0000' }
  }
  if (clase === 'VERBAL') {
    return { codiarea: '0003', codiproc: '3015', codiclas: '3003', codisubc: '3087', codirecu: '0000' }
  }
  if (clase === 'VERBAL_SUMARIO') {
    return { codiarea: '0003', codiproc: '3015', codiclas: '3004', codisubc: '3087', codirecu: '0000' }
  }
  if (clase === 'LIQUIDACION' || clase === 'SUCESORIO') {
    return { codiarea: '0003', codiproc: '3008', codiclas: '3070', codisubc: '0000', codirecu: '0000' }
  }
  if (clase === 'DIVISORIO') {
    return { codiarea: '0003', codiproc: '3001', codiclas: '3054', codisubc: '3087', codirecu: '0000' }
  }
  // Declarativo ordinario u otras clases civiles
  return { codiarea: '0003', codiproc: '3001', codiclas: '3001', codisubc: '3087', codirecu: '0000' }
}
