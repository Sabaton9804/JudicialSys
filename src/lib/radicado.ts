/**
 * Código Único de Radicación de Procesos - Acuerdo 201 de 1997 (Consejo Superior de la Judicatura)
 * Estructura de 23 dígitos:
 * - 5 dígitos: Código Ciudad/Departamento (DANE)
 * - 2 dígitos: Código Corporación (01 Juzgado, 02 Tribunal, etc.)
 * - 2 dígitos: Código Especialidad (01 Civil, 02 Laboral, etc.)
 * - 3 dígitos: Código Juzgado
 * - 4 dígitos: Año de radicación
 * - 5 dígitos: Número consecutivo del proceso
 * - 2 dígitos: Instancia (01 primera, 02 segunda)
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

/** Genera radicado de 23 dígitos. codigoDespacho12 = primeros 12 dígitos del juzgado */
export function generarRadicado(
  codigoDespacho12: string,
  anio: number,
  consecutivo: number,
  instancia: number = 1
): string {
  const despacho = codigoDespacho12.replace(/\D/g, '').padStart(12, '0').slice(0, 12)
  const anioStr = String(anio).padStart(4, '0')
  const consecStr = String(consecutivo).padStart(5, '0')
  const instStr = String(instancia).padStart(2, '0')
  return `${despacho}${anioStr}${consecStr}${instStr}`
}
