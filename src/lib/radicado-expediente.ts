import {
  esRadicadoValido,
  esAnioRadicacionPlausibleImportacionNueva,
  anioRadicacionEnCui,
  generarRadicado,
  normalizarRadicado,
} from '@/lib/radicado'

/**
 * Evita confundir fechas ISO (p. ej. 2017-05-15) con año + consecutivo del expediente (2026-311).
 */
function pareceFechaYmdTrasMatch(texto: string, m: RegExpMatchArray): boolean {
  const despues = texto.slice(m.index! + m[0].length)
  if (!/^\s*[-–]\s*\d/.test(despues)) return false
  const seg = m[2]
  const n = parseInt(seg, 10)
  if (seg.length === 2 && n >= 1 && n <= 12) {
    return /^\s*[-–]\s*\d{1,2}\b/.test(despues)
  }
  if (seg.length === 1 && n >= 1 && n <= 9) {
    return /^\s*[-–]\s*\d{2}\b/.test(despues)
  }
  return false
}

/**
 * Del texto del correo / ZIP intenta obtener el radicado de 23 dígitos que debe usarse en BD local:
 * - Número de 23 dígitos explícito (mismo prefijo de despacho que el juzgado), con año plausible
 * - Patrón expediente "2026-311" → año + consecutivo (no fechas ISO ni años fuera de ventana)
 *
 * La ventana sobre todos los dígitos concatenados del PDF puede fabricar un CUI falso con año antiguo;
 * por eso se exige año reciente salvo que venga de un patrón explícito coherente.
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
    if (!esRadicadoValido(chunk) || !chunk.startsWith(cod12)) continue
    const anioCui = anioRadicacionEnCui(chunk)
    if (anioCui === null || !esAnioRadicacionPlausibleImportacionNueva(anioCui)) continue
    return normalizarRadicado(chunk)!
  }
  const patrones = [
    /Expediente\s+judicial[^0-9]{0,120}?(\d{4})[\s\-–](\d{1,5})/i,
    /\b(\d{4})\s*[-–]\s*(\d{1,5})\b/,
  ]
  for (const re of patrones) {
    const mExp = texto.match(re)
    if (!mExp || pareceFechaYmdTrasMatch(texto, mExp)) continue
    const anio = parseInt(mExp[1], 10)
    const consecutivo = parseInt(mExp[2], 10)
    if (anio < 1990 || anio > 2100 || consecutivo < 1 || consecutivo > 99999) continue
    if (!esAnioRadicacionPlausibleImportacionNueva(anio)) continue
    return generarRadicado(cod12, anio, consecutivo, 1)
  }
  return undefined
}
