/**
 * Código Único de Radicación de Procesos - Acuerdo 201 de 1997 (Consejo Superior de la Judicatura)
 * Estructura de 23 dígitos (sin guiones), p. ej. despacho Bogotá civil circuito:
 * - 5 dígitos: ciudad DANE (11001 = Bogotá D.C.)
 * - 2 dígitos: circuito (31)
 * - 2 dígitos: especialidad (03 = civil)
 * - 3 dígitos: juzgado de origen / despacho (051)
 * → Primeros 12 dígitos = código del despacho (ej. 110013103051)
 * - 4 dígitos: año de radicación
 * - 5 dígitos: consecutivo del proceso en ese despacho y año
 * - 2 dígitos: instancia en el radicado (en este sistema: 00 = primera instancia; 01 = segunda)
 */

export const RADICADO_LENGTH = 23

/** Valida que el radicado tenga exactamente 23 dígitos numéricos (sin guiones ni espacios) */
export function esRadicadoValido(radicado: string): boolean {
  const limpio = radicado.replace(/\D/g, '')
  return limpio.length === RADICADO_LENGTH && /^\d+$/.test(limpio)
}

/** Normaliza radicado a 23 dígitos (quita guiones, espacios) - retorna null si no es válido */
export function normalizarRadicado(radicado: string): string | null {
  const limpio = radicado.replace(/\D/g, '')
  if (limpio.length !== RADICADO_LENGTH || !/^\d+$/.test(limpio)) return null
  return limpio
}

/** Formatea radicado para mostrar: 25000 234 20 002 014 01267 00 (con espacios para legibilidad) */
export function formatearRadicado(radicado: string): string {
  const limpio = radicado.replace(/\D/g, '')
  if (limpio.length !== RADICADO_LENGTH) return radicado
  return `${limpio.slice(0, 5)} ${limpio.slice(5, 7)} ${limpio.slice(7, 9)} ${limpio.slice(9, 12)} ${limpio.slice(12, 16)} ${limpio.slice(16, 21)} ${limpio.slice(21, 23)}`
}

/**
 * Genera radicado de 23 dígitos. `codigoDespacho12` = ciudad+circuito+especialidad+juzgado (12 dígitos).
 * @param instancia 1 = primera instancia → sufijo "00" en el radicado; 2 = segunda → "01"
 */
export function generarRadicado(
  codigoDespacho12: string,
  anio: number,
  consecutivo: number,
  instancia: 1 | 2 = 1
): string {
  const despacho = codigoDespacho12.replace(/\D/g, '').padStart(12, '0').slice(0, 12)
  const anioStr = String(anio).padStart(4, '0')
  const consecStr = String(consecutivo).padStart(5, '0')
  const instStr = instancia === 1 ? '00' : '01'
  return `${despacho}${anioStr}${consecStr}${instStr}`
}

/** Año de radicación (dígitos 13–16 del CUI de 23 dígitos). */
export function anioRadicacionEnCui(radicado23: string): number | null {
  const d = radicado23.replace(/\D/g, '')
  if (d.length !== RADICADO_LENGTH || !/^\d+$/.test(d)) return null
  return parseInt(d.slice(12, 16), 10)
}

/**
 * Al importar correo/ZIP/PDF, solo se acepta un CUI cuyo año esté cerca del año actual.
 * Evita falsos positivos (p. ej. ventana sobre todos los dígitos del PDF que alinea 2017 por cédulas/fechas).
 */
export function esAnioRadicacionPlausibleImportacionNueva(
  anio: number,
  anioReferencia: number = new Date().getFullYear()
): boolean {
  return anio >= anioReferencia - 2 && anio <= anioReferencia + 1
}
