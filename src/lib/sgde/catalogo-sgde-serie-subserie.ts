import type { CategoriaProceso, ClaseProceso } from '@prisma/client'

/**
 * Catálogo SGDE (Rama Judicial): serie y subserie como suelen aparecer en el formulario
 * «Creación de expediente» y en listados. Sirve como fuente única para la app y para prompts de IA.
 *
 * Serie: coincide con `categoriaProceso` (Civil | Constitucional).
 * Subserie: etiqueta del desplegable «Subserie»; donde el gestor usa nombres largos
 * («Acciones Constitucionales de …»), se usa ese texto para homogeneizar con expedientes creados a mano.
 */

/** Serie SGDE — campo «Serie» (Civil / Constitucional). */
export const SERIE_SGDE_POR_CATEGORIA: Record<CategoriaProceso, string> = {
  CIVIL: 'Civil',
  CONSTITUCIONAL: 'Constitucional',
}

/**
 * Subserie SGDE — campo «Subserie», una entrada por cada `ClaseProceso` del sistema.
 * Los procesos civiles suelen usar la denominación del CGP / listado civil; las acciones
 * constitucionales usan el texto del catálogo cuando el SGDE lo muestra como «Acciones Constitucionales de …».
 */
export const SUBSERIE_SGDE_POR_CLASE: Record<ClaseProceso, string> = {
  // —— Procesos civiles (Serie: Civil) ——
  EJECUTIVO_SINGULAR: 'Ejecutivo',
  EJECUTIVO_HIPOTECARIO: 'Ejecutivo',
  EJECUTIVO_PRENDARIO: 'Ejecutivo',
  ORDINARIO: 'Ordinario',
  VERBAL: 'Verbal',
  VERBAL_SUMARIO: 'Verbal sumario',
  POSESORIO: 'Posesorio',
  LIQUIDACION: 'Liquidación',
  SUCESORIO: 'Sucesorio',
  DIVISORIO: 'Divisorio',
  RENDICION_CUENTAS: 'Rendición de cuentas',
  TERCERIAS: 'Tercerías',

  // —— Acciones constitucionales (Serie: Constitucional) ——
  TUTELA: 'Acciones Constitucionales de Tutela',
  HABEAS_CORPUS: 'Acciones Constitucionales de Hábeas Corpus',
  HABEAS_DATA: 'Acciones Constitucionales de Hábeas Data',
  ACCION_POPULAR: 'Acción popular',
  ACCION_DE_GRUPO: 'Acción de grupo',
  ACCION_DE_CUMPLIMIENTO: 'Acción de cumplimiento',
  ACCION_DE_TUTELA_CONTRA_PROVIDENCIA: 'Acciones Constitucionales de Tutela contra providencia',
}

/** Alias export (tutela) para código que ya importaba esta constante. */
export const SUBSERIE_TUTELA_CATALOGO_SGDE = SUBSERIE_SGDE_POR_CLASE.TUTELA

/**
 * Categoría esperada en JudicialSys para cada clase (coherencia serie ↔ subserie).
 * No altera datos en BD: sirve para validación y para IA.
 */
export const CATEGORIA_ESPERADA_POR_CLASE: Record<ClaseProceso, CategoriaProceso> = {
  EJECUTIVO_SINGULAR: 'CIVIL',
  EJECUTIVO_HIPOTECARIO: 'CIVIL',
  EJECUTIVO_PRENDARIO: 'CIVIL',
  ORDINARIO: 'CIVIL',
  VERBAL: 'CIVIL',
  VERBAL_SUMARIO: 'CIVIL',
  POSESORIO: 'CIVIL',
  LIQUIDACION: 'CIVIL',
  SUCESORIO: 'CIVIL',
  DIVISORIO: 'CIVIL',
  RENDICION_CUENTAS: 'CIVIL',
  TERCERIAS: 'CIVIL',

  TUTELA: 'CONSTITUCIONAL',
  HABEAS_CORPUS: 'CONSTITUCIONAL',
  HABEAS_DATA: 'CONSTITUCIONAL',
  ACCION_POPULAR: 'CONSTITUCIONAL',
  ACCION_DE_GRUPO: 'CONSTITUCIONAL',
  ACCION_DE_CUMPLIMIENTO: 'CONSTITUCIONAL',
  ACCION_DE_TUTELA_CONTRA_PROVIDENCIA: 'CONSTITUCIONAL',
}

export function serieSgdeDesdeCategoria(c: CategoriaProceso): string {
  return SERIE_SGDE_POR_CATEGORIA[c]
}

export function subserieSgdeDesdeClase(clase: ClaseProceso): string {
  return SUBSERIE_SGDE_POR_CLASE[clase]
}

/** Serie + subserie coherentes con la clase (la serie se toma de la categoría del proceso). */
export function serieYSubserieSgde(categoria: CategoriaProceso, clase: ClaseProceso): {
  serie: string
  subserie: string
} {
  return {
    serie: serieSgdeDesdeCategoria(categoria),
    subserie: subserieSgdeDesdeClase(clase),
  }
}

/**
 * Normaliza texto de subserie (IA o pegado manual) al catálogo cuando coincide un alias corto.
 */
export function normalizarSubserieSgdeCatalogo(subserie: string, claseProceso: ClaseProceso): string {
  const t = subserie.trim()
  if (!t) return t
  const canon = SUBSERIE_SGDE_POR_CLASE[claseProceso]

  if (t.toLowerCase() === canon.toLowerCase()) return canon

  const aliasPorClase: Partial<Record<ClaseProceso, RegExp[]>> = {
    TUTELA: [/^tutela$/i, /^acción(es)?\s+de\s+tutela$/i],
    HABEAS_CORPUS: [/^hábeas\s*corpus$/i, /^habeas\s*corpus$/i],
    HABEAS_DATA: [/^hábeas\s*data$/i, /^habeas\s*data$/i],
    ACCION_POPULAR: [/^acción\s+popular$/i],
    ACCION_DE_GRUPO: [/^acción\s+de\s+grupo$/i],
    ACCION_DE_CUMPLIMIENTO: [/^acción\s+de\s+cumplimiento$/i],
    ACCION_DE_TUTELA_CONTRA_PROVIDENCIA: [/^tutela\s+contra\s+providencia$/i],
    EJECUTIVO_SINGULAR: [/^ejecutivo\s+singular$/i],
    EJECUTIVO_HIPOTECARIO: [/^ejecutivo\s+hipotecario$/i],
    EJECUTIVO_PRENDARIO: [/^ejecutivo\s+prendario$/i],
  }

  const patterns = aliasPorClase[claseProceso]
  if (patterns?.some((re) => re.test(t))) {
    return canon
  }

  return t
}

/** Lista legible para prompts (tabla serie / subserie por clase). */
export function textoCatalogoSgdeParaPrompt(): string {
  const civil = Object.entries(CATEGORIA_ESPERADA_POR_CLASE)
    .filter(([, cat]) => cat === 'CIVIL')
    .map(([clase]) => clase as ClaseProceso)
  const constit = Object.entries(CATEGORIA_ESPERADA_POR_CLASE)
    .filter(([, cat]) => cat === 'CONSTITUCIONAL')
    .map(([clase]) => clase as ClaseProceso)

  const line = (c: ClaseProceso) =>
    `- ${c}: Serie «${SERIE_SGDE_POR_CATEGORIA[CATEGORIA_ESPERADA_POR_CLASE[c]]}», Subserie «${SUBSERIE_SGDE_POR_CLASE[c]}»`

  return [
    'CIVIL:',
    ...civil.map(line),
    '',
    'CONSTITUCIONAL:',
    ...constit.map(line),
  ].join('\n')
}
