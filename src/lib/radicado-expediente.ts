import { esRadicadoValido, generarRadicado, normalizarRadicado } from '@/lib/radicado'

/**
 * Del texto del correo / ZIP intenta obtener el radicado de 23 dígitos que debe usarse en BD local:
 * - Número de 23 dígitos explícito (mismo prefijo de despacho que el juzgado)
 * - Patrón expediente "2026-300" → año + consecutivo sobre codigoDespacho12
 */
export function extraerRadicadoPreferidoDesdeTextosImportacion(
  textos: string[],
  codigoDespacho12: string
): string | undefined {
  const cod12 = codigoDespacho12.replace(/\D/g, '').padStart(12, '0').slice(0, 12)
  const texto = textos.join('\n')
  const soloDigitos = texto.replace(/\D/g, '')
  for (let i = 0; i + 23 <= soloDigitos.length; i++) {
    const chunk = soloDigitos.slice(i, i + 23)
    if (esRadicadoValido(chunk) && chunk.startsWith(cod12)) {
      return normalizarRadicado(chunk)!
    }
  }
  const mExp =
    texto.match(/Expediente\s+judicial[^0-9]{0,120}?(\d{4})[\s\-–](\d{1,5})/i) ||
    texto.match(/\b(\d{4})\s*[-–]\s*(\d{1,5})\b/)
  if (mExp) {
    const anio = parseInt(mExp[1], 10)
    const consecutivo = parseInt(mExp[2], 10)
    if (anio >= 1990 && anio <= 2100 && consecutivo >= 1 && consecutivo <= 99999) {
      return generarRadicado(cod12, anio, consecutivo, 1)
    }
  }
  return undefined
}
