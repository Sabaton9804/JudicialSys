import type { ArchivoImportRow } from '@/lib/proceso-import-shared'

/**
 * Flujo real Rama Judicial (tutelas / habeas corpus en línea):
 *
 * 1) **Correo de reparto (adjudicación)** — Mensaje electrónico mediante el cual el **Grupo de Reparto**
 *    comunica al juzgado la **asignación aleatoria** de la tutela a ese despacho. No es una “notificación”
 *    genérica: es el acto de **adjudicación** vía correo (p. ej. desde Recepción Tutelas / Centro de Servicios).
 *
 * 2) **Acta de reparto** — PDF que acompaña ese correo (p. ej. `SEC … J … .pdf`), que deja constancia
 *    escrita del reparto. Va **después** del correo y **antes** del material que baja de tutela en línea.
 *
 * 3) **Demanda** — `DEMANDA_….pdf` en el ZIP (se consolida en `Demanda.pdf`).
 *
 * 4) **Pruebas y anexos** — `PRUEBA_….pdf` (se consolidan en `PruebasAnexos.pdf`).
 *
 * 5) **Poder** — Si el ZIP trae `PODER_….pdf` u homónimos (se consolida en `Poder.pdf` → carpeta PODERES).
 *
 * 6) **Informe de ingreso** — Cuando aplique, según nombre o práctica del despacho.
 *
 * El ZIP con UUID (`DEMANDA_` / `PRUEBA_`) corresponde al trámite “tutela en línea”; el **correo de reparto**
 * y el **acta** son el trámite de **adjudicación al juzgado** (otro mensaje / mismos anexos en carpeta).
 */

export type RolDocumentoTutela =
  | 'CORREO_REPARTO'
  | 'CORREO_TUTELA_LINEA'
  | 'ACTA_REPARTO'
  | 'DEMANDA'
  | 'ANEXOS'
  | 'PODER'
  | 'INFORME_INGRESO'
  | 'SIN_CLASIFICAR'

/** Texto para UI o respuestas API (lenguaje alineado a la Rama). */
export const ETIQUETA_ROL_TUTELA: Record<RolDocumentoTutela, string> = {
  CORREO_REPARTO:
    'Correo de reparto (adjudicación de la tutela al despacho por el Grupo de Reparto)',
  CORREO_TUTELA_LINEA:
    'Correo de tutela en línea (notificación / generación; constancia en PDF)',
  ACTA_REPARTO: 'Acta de reparto (constancia PDF, p. ej. SEC … J …)',
  ANEXOS: 'Pruebas y anexos (PRUEBA_ en ZIP; consolidado PruebasAnexos.pdf)',
  DEMANDA: 'Demanda (DEMANDA_ en ZIP tutela en línea)',
  PODER: 'Poder / apoderamiento (PODER_ en ZIP; consolidado Poder.pdf)',
  INFORME_INGRESO: 'Informe de ingreso',
  SIN_CLASIFICAR: 'Sin clasificar automáticamente',
}

/** Orden judicial de incorporación: constancia de correo → acta → demanda → pruebas/anexos → poder → informe. */
const ORDEN_ROL: RolDocumentoTutela[] = [
  'CORREO_TUTELA_LINEA',
  'CORREO_REPARTO',
  'ACTA_REPARTO',
  'DEMANDA',
  'ANEXOS',
  'PODER',
  'INFORME_INGRESO',
  'SIN_CLASIFICAR',
]

/**
 * Intenta leer fecha/hora del patrón tutela en línea:
 * DEMANDA_3_26_2026, 3_16_28 PM.pdf
 */
export function parseTimestampNombreTutela(nombre: string): number {
  const base = nombre.split('/').pop() || nombre
  const m = base.match(
    /^[A-Z]+_(\d+)_(\d+)_(\d+),\s*(\d+)_(\d+)_(\d+)\s*(AM|PM)/i
  )
  if (!m) return 0
  const month = parseInt(m[1], 10)
  const day = parseInt(m[2], 10)
  const year = parseInt(m[3], 10)
  let hour = parseInt(m[4], 10)
  const minute = parseInt(m[5], 10)
  const second = parseInt(m[6], 10)
  const ap = m[7].toUpperCase()
  if (ap === 'PM' && hour < 12) hour += 12
  if (ap === 'AM' && hour === 12) hour = 0
  return new Date(year, month - 1, day, hour, minute, second).getTime()
}

function normalizarNombre(nombre: string): string {
  return nombre.split('/').pop() || nombre
}

/** Acta típica: prefijo SEC, expediente de reparto en PDF; o nombre normalizado ActaReparto.pdf. */
function esNombreActaReparto(n: string, lower: string): boolean {
  if (/^actareparto\.pdf$/i.test(n)) return true
  if (/^sec\s+\d+/i.test(n) || /\bsec\s*\d+\s*j\s*\d+/i.test(n)) return true
  if (lower.includes('acta') && lower.includes('reparto')) return true
  return false
}

/**
 * Infiere el rol por nombre. El “correo” aquí es **solo** el de adjudicación por reparto, no otros correos
 * (p. ej. el de “tutela en línea” con enlace al ZIP).
 */
export function inferirRolDocumentoTutela(nombre: string): RolDocumentoTutela {
  const n = normalizarNombre(nombre)
  const lower = n.toLowerCase()

  // Acta antes que “reparto” suelto (evita confundir acta con export del correo)
  if (esNombreActaReparto(n, lower)) return 'ACTA_REPARTO'

  /** PDF constancia generado en JudicialSys (nombre fijo; no confundir con “reparto” en la cadena) */
  if (/^correoreparto\.pdf$/i.test(n)) return 'CORREO_TUTELA_LINEA'

  // Correo de reparto: adjudicación (mensaje guardado como PDF/EML con nombre explícito)
  if (
    /^correo_reparto/i.test(n) ||
    /^reparto_correo/i.test(n) ||
    /adjudicaci[oó]n[_\s-]*reparto/i.test(n) ||
    /reparto[_\s-]*adjudicaci/i.test(n) ||
    /grupo[_\s-]*reparto/i.test(lower)
  ) {
    return 'CORREO_REPARTO'
  }
  if (lower.endsWith('.eml') && (lower.includes('reparto') || lower.includes('adjudic'))) {
    return 'CORREO_REPARTO'
  }
  // PDF del mensaje de reparto sin “acta” en el nombre (exportación manual)
  if (
    lower.endsWith('.pdf') &&
    lower.includes('reparto') &&
    !lower.includes('acta') &&
    !/^sec\s/i.test(n)
  ) {
    return 'CORREO_REPARTO'
  }

  // PDF generado desde .eml (paquete) o export “tutela en línea”
  if (/^correo_tutela_linea/i.test(n)) return 'CORREO_TUTELA_LINEA'
  if (
    (lower.includes('generación') || lower.includes('generacion')) &&
    lower.includes('tutela') &&
    lower.endsWith('.pdf')
  ) {
    return 'CORREO_TUTELA_LINEA'
  }
  if (
    lower.includes('tutela') &&
    (lower.includes('en_linea') || lower.includes('en linea')) &&
    lower.endsWith('.pdf')
  ) {
    return 'CORREO_TUTELA_LINEA'
  }

  if (/^demanda_/i.test(n)) return 'DEMANDA'
  if (/^demanda\.pdf$/i.test(n)) return 'DEMANDA'

  if (/^pruebasanexos\.pdf$/i.test(n) || /^anexosprueba\.pdf$/i.test(n)) return 'ANEXOS'
  if (/^prueba_/i.test(n)) return 'ANEXOS'

  if (/^poder_/i.test(n)) return 'PODER'
  if (/^poder\.pdf$/i.test(n)) return 'PODER'
  if (/apoderamiento/i.test(lower) && /\.pdf$/i.test(n)) return 'PODER'

  if (lower.includes('anexo') && !lower.includes('demanda')) return 'ANEXOS'

  if (lower.includes('informe') && (lower.includes('ingreso') || lower.includes('despacho'))) {
    return 'INFORME_INGRESO'
  }
  if (/^informe_/i.test(n) && lower.includes('ingreso')) return 'INFORME_INGRESO'

  return 'SIN_CLASIFICAR'
}

export type ItemOrdenadoTutela = {
  orden: number
  rol: RolDocumentoTutela
  nombre: string
}

/**
 * Orden: constancia correo (.eml) → acta SEC → demanda → pruebas/anexos → poder → informe.
 */
export function ordenarDocumentosTutela(
  nombres: string[]
): ItemOrdenadoTutela[] {
  const items = nombres.map((nombre) => ({
    nombre,
    rol: inferirRolDocumentoTutela(nombre),
  }))

  items.sort((a, b) => {
    const ia = ORDEN_ROL.indexOf(a.rol)
    const ib = ORDEN_ROL.indexOf(b.rol)
    if (ia !== ib) return ia - ib
    const ta = parseTimestampNombreTutela(a.nombre)
    const tb = parseTimestampNombreTutela(b.nombre)
    if (
      (a.rol === 'ANEXOS' || a.rol === 'DEMANDA' || a.rol === 'PODER') &&
      ta > 0 &&
      tb > 0
    ) {
      return ta - tb
    }
    return normalizarNombre(a.nombre).localeCompare(normalizarNombre(b.nombre), 'es')
  })

  return items.map((x, i) => ({
    orden: i + 1,
    rol: x.rol,
    nombre: x.nombre,
  }))
}

export function advertenciasOrden(items: ItemOrdenadoTutela[]): string[] {
  const adv: string[] = []
  const roles = new Set(items.map((i) => i.rol))
  if (!roles.has('CORREO_REPARTO') && !roles.has('CORREO_TUTELA_LINEA')) {
    adv.push(
      'No se detectó constancia de correo (reparto o tutela en línea). Si procesa un .eml completo con «Paquete ZIP», se genera el PDF del mensaje automáticamente.'
    )
  }
  if (!roles.has('ACTA_REPARTO')) {
    adv.push(
      'No se detectó el acta de reparto (p. ej. SEC … J ….pdf). Adjúntela en el mismo lote.'
    )
  }
  if (items.some((i) => i.rol === 'SIN_CLASIFICAR')) {
    adv.push(
      'Hay archivos sin clasificar. Revíselos: el correo de «tutela en línea» con el ZIP no sustituye al correo de adjudicación por reparto.'
    )
  }
  return adv
}

/** Orden de incorporación al expediente (mismo criterio que `ordenarDocumentosTutela`). */
export function ordenarArchivosImportacionPorRolTutela(
  archivos: ArchivoImportRow[]
): ArchivoImportRow[] {
  const nombres = archivos.map((a) => a.nombre)
  const ordenados = ordenarDocumentosTutela(nombres)
  const rank = new Map(ordenados.map((o) => [o.nombre, o.orden]))
  return [...archivos]
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const rx = rank.get(x.a.nombre) ?? 9999
      const ry = rank.get(y.a.nombre) ?? 9999
      if (rx !== ry) return rx - ry
      return x.i - y.i
    })
    .map(({ a }) => a)
}
