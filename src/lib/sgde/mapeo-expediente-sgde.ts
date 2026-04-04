import type { CategoriaProceso, ClaseProceso } from '@prisma/client'

export {
  CATEGORIA_ESPERADA_POR_CLASE,
  normalizarSubserieSgdeCatalogo,
  serieSgdeDesdeCategoria,
  serieYSubserieSgde,
  SERIE_SGDE_POR_CATEGORIA,
  subserieSgdeDesdeClase,
  SUBSERIE_SGDE_POR_CLASE,
  SUBSERIE_TUTELA_CATALOGO_SGDE,
  textoCatalogoSgdeParaPrompt,
} from '@/lib/sgde/catalogo-sgde-serie-subserie'

/**
 * «Nombre expediente» en SGDE (distinto del CUI): denominación útil para identificar el asunto.
 * Criterio habitual en instructivos: partes principales (demandante vs demandado) o denominación del proceso.
 * El CUI de 23 dígitos va en el campo CUI / nombre técnico del nodo, no sustituye este título.
 */
export function nombreExpedienteTituloDesdeProceso(p: {
  demandante: string
  demandado: string
  claseProceso: ClaseProceso
  categoriaProceso: CategoriaProceso
  /** Si la IA definió categoría para SGDE, úsese para el prefijo (p. ej. tutela). */
  categoriaProcesoSgde?: CategoriaProceso
}): string {
  const cat = p.categoriaProcesoSgde ?? p.categoriaProceso
  const d = (p.demandante || '').replace(/\s+/g, ' ').trim()
  const dd = (p.demandado || '').replace(/\s+/g, ' ').trim()
  let s = `${d} vs ${dd}`.trim()
  if (s.length < 3) s = 'Expediente'
  if (cat === 'CONSTITUCIONAL' && p.claseProceso === 'TUTELA') {
    if (!/^tutela\b/i.test(s)) s = `Tutela — ${s}`
  }
  return s.slice(0, 240)
}

/** Texto de despacho/oficina productora para metadatos SGDE (mismo criterio que el desplegable del portal). */
export function despachoSgdeDesdeProceso(p: {
  consultaDespacho: string | null | undefined
  juzgadoNombre: string | null | undefined
}): string {
  const a = (p.consultaDespacho || '').replace(/\s+/g, ' ').trim()
  const b = (p.juzgadoNombre || '').replace(/\s+/g, ' ').trim()
  // CPNU suele devolver el despacho en MAYÚSCULAS; el nombre del juzgado en JudicialSys suele coincidir
  // con el texto del listado SGDE («Juzgado 051 Civil…»). Preferir juzgado cuando la consulta es solo mayúsculas.
  const consultaSoloMayus =
    a.length >= 12 && /[A-ZÁÉÍÓÚÑ]/.test(a) && !/[a-záéíóúñ]/.test(a)
  const juzgadoTieneMezclaMinusculas = b.length >= 3 && /[a-záéíóúñ]/.test(b)
  if (consultaSoloMayus && juzgadoTieneMezclaMinusculas) {
    return b.slice(0, 500)
  }
  return (a || b).slice(0, 500)
}

function tituloOracionUbicacionSgde(t: string): string {
  const small = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'al', 'o', 'u'])
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => {
      if (/^\d+$/.test(w)) return w
      if (i > 0 && small.has(w)) return w
      if (w.length === 0) return w
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

/**
 * El listado del SGDE suele mostrar «Juzgado 051 Civil del Circuito de Bogotá» (tipo oración).
 * La consulta CPNU a veces trae TODO EN MAYÚSCULAS; si se envía así a rama:nomOficinaProductora, la
 * columna «Ubicación actual» queda en mayúsculas y no coincide con expedientes creados a mano en el portal.
 */
export function normalizarUbicacionDespachoSgde(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim().slice(0, 500)
  if (t.length < 8) return t

  const tieneMinuscula = /[a-záéíóúñ]/.test(t)
  // Bloque largo sin ninguna minúscula = pegado tipo CPNU (todo mayúsculas)
  if (!tieneMinuscula && t.length >= 10 && /[A-ZÁÉÍÓÚÑ]/.test(t)) {
    return tituloOracionUbicacionSgde(t)
  }

  const letters = t.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '')
  if (letters.length < 5) return t
  const upperCount = letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length
  if (upperCount / letters.length < 0.75) return t
  return tituloOracionUbicacionSgde(t)
}
