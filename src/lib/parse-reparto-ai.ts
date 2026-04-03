/**
 * Parsea documentos judiciales usando OpenAI (GPT) para mayor precisión.
 * Requiere OPENAI_API_KEY en .env
 *
 * Prioridad: si en la importación hay texto extraído del **escrito de demanda** (Demanda.pdf / DEMANDA_*),
 * se usa `parsearDemandaConIA` con un prompt específico; si no, se analiza el conjunto de textos con `parsearConIA`.
 */
import OpenAI from 'openai'
import type { DatosExtraidos } from './parse-reparto'

/** Coincide con enum ClaseProceso en Prisma (subconjunto habitual en escritos). */
const CLASES_PROCESO_VALIDAS = new Set([
  'EJECUTIVO_SINGULAR',
  'EJECUTIVO_HIPOTECARIO',
  'EJECUTIVO_PRENDARIO',
  'ORDINARIO',
  'VERBAL',
  'VERBAL_SUMARIO',
  'POSESORIO',
  'LIQUIDACION',
  'SUCESORIO',
  'DIVISORIO',
  'RENDICION_CUENTAS',
  'TERCERIAS',
  'TUTELA',
  'HABEAS_CORPUS',
  'HABEAS_DATA',
  'ACCION_POPULAR',
  'ACCION_DE_GRUPO',
  'ACCION_DE_CUMPLIMIENTO',
  'ACCION_DE_TUTELA_CONTRA_PROVIDENCIA',
])

export function normalizarClaseProcesoIA(valor: string | null | undefined): string | undefined {
  if (!valor || typeof valor !== 'string') return undefined
  let s = valor.trim().toUpperCase().replace(/\s+/g, '_')
  if (CLASES_PROCESO_VALIDAS.has(s)) return s
  if (s.includes('TUTELA')) return 'TUTELA'
  if (s.includes('HIPOTEC')) return 'EJECUTIVO_HIPOTECARIO'
  if (s.includes('PRENDAR')) return 'EJECUTIVO_PRENDARIO'
  if (s.includes('EJECUTIV')) return 'EJECUTIVO_SINGULAR'
  if (s.includes('ORDINAR')) return 'ORDINARIO'
  if (s.includes('VERBAL')) return 'VERBAL'
  if (s.includes('HABEAS') && s.includes('DATA')) return 'HABEAS_DATA'
  if (s.includes('HABEAS')) return 'HABEAS_CORPUS'
  return undefined
}

const SYSTEM_PROMPT = `Eres un asistente que extrae datos estructurados de documentos judiciales colombianos (demandas, actas de reparto, etc.).

Extrae y devuelve ÚNICAMENTE un JSON válido con estas claves (usa null si no encuentras el dato):
{
  "demandante": "nombre o razón social del demandante/actor",
  "demandado": "nombre o razón social del demandado",
  "demanda": "breve descripción del objeto de la demanda (máx 200 caracteres)",
  "radicado": "número de radicado si aparece (ej: 11001310305120250000101)",
  "cuantia": número en pesos (solo el número, sin puntos de miles),
  "claseProceso": "TUTELA" | "EJECUTIVO_SINGULAR" | "EJECUTIVO_HIPOTECARIO" | "ORDINARIO" | "VERBAL" | null
}

Responde SOLO con el JSON, sin explicaciones ni markdown.`

const SYSTEM_PROMPT_DEMANDA = `Eres un asistente jurídico especializado en lectura de escritos de demanda y tutelas colombianas (Rama Judicial).

Analiza ÚNICAMENTE el texto del escrito de demanda que envía el usuario. Devuelve SOLO un JSON válido (sin markdown) con estas claves; usa null si no aparece información clara:
{
  "demandante": "nombre completo o razón social del demandante, accionante o peticionario",
  "demandado": "nombre completo o razón social del demandado, accionado o entidad demandada",
  "demanda": "síntesis del objeto del proceso en máximo 280 caracteres",
  "radicado": "solo dígitos del número de radicado de 23 dígitos si consta",
  "cuantia": número en pesos colombianos (solo número) o null si no hay cuantía o no aplica (p. ej. tutela)",
  "claseProceso": "uno de: EJECUTIVO_SINGULAR, EJECUTIVO_HIPOTECARIO, EJECUTIVO_PRENDARIO, ORDINARIO, VERBAL, VERBAL_SUMARIO, TUTELA, HABEAS_CORPUS, HABEAS_DATA, ACCION_POPULAR, ACCION_DE_GRUPO, ACCION_DE_CUMPLIMIENTO, ACCION_DE_TUTELA_CONTRA_PROVIDENCIA, POSESORIO, LIQUIDACION, DIVISORIO — el que mejor encaje según el escrito",
  "tipoProcesoDescripcion": "tipo o subtipo en lenguaje natural (ej. tutela de salud, ejecución de títulos, verbal civil por sumas de dinero)",
  "derechosVulnerados": "si es tutela u acción constitucional, derechos invocados (breve lista); si no aplica, null",
  "pretensiones": "qué pide el actor en el petitorio (breve)",
  "documentoDemandante": "cédula o NIT del demandante si consta",
  "documentoDemandado": "NIT, cédula o identificación del demandado si consta",
  "observacionesExtraccion": "cualquier dato útil adicional en una sola frase (ej. cuantía indeterminada, múltiples demandados); null si nada relevante"
}

Reglas: no inventes datos; si hay varios demandados, resume el principal en "demandado" y menciona el resto en observacionesExtraccion. Responde SOLO con el JSON.`

function limpiarDocumentoIdentidad(s: string): string | undefined {
  const t = s.replace(/[^\d]/g, '')
  if (t.length >= 5 && t.length <= 16) return t
  return undefined
}

function jsonDesdeRespuestaIA(content: string): Record<string, unknown> | null {
  const json = content.replace(/```json?\s*/gi, '').replace(/```\s*$/g, '').trim()
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

function mapearParsedADatos(parsed: Record<string, unknown>): DatosExtraidos {
  const datos: DatosExtraidos = {}
  if (parsed.demandante && typeof parsed.demandante === 'string')
    datos.demandante = parsed.demandante.slice(0, 500)
  if (parsed.demandado && typeof parsed.demandado === 'string')
    datos.demandado = parsed.demandado.slice(0, 500)
  if (parsed.demanda && typeof parsed.demanda === 'string')
    datos.demanda = parsed.demanda.slice(0, 500)
  if (parsed.radicado && typeof parsed.radicado === 'string')
    datos.radicado = parsed.radicado.replace(/\D/g, '').slice(0, 23)
  if (typeof parsed.cuantia === 'number' && !Number.isNaN(parsed.cuantia)) datos.cuantia = parsed.cuantia
  const clase = normalizarClaseProcesoIA(
    typeof parsed.claseProceso === 'string' ? parsed.claseProceso : undefined
  )
  if (clase) datos.claseProceso = clase

  if (parsed.tipoProcesoDescripcion && typeof parsed.tipoProcesoDescripcion === 'string')
    datos.tipoProcesoDescripcion = parsed.tipoProcesoDescripcion.slice(0, 400)
  if (parsed.derechosVulnerados && typeof parsed.derechosVulnerados === 'string')
    datos.derechosVulnerados = parsed.derechosVulnerados.slice(0, 600)
  if (parsed.pretensiones && typeof parsed.pretensiones === 'string')
    datos.pretensiones = parsed.pretensiones.slice(0, 800)
  if (parsed.documentoDemandante && typeof parsed.documentoDemandante === 'string') {
    const d = limpiarDocumentoIdentidad(parsed.documentoDemandante)
    if (d) datos.documentoDemandante = d
  }
  if (parsed.documentoDemandado && typeof parsed.documentoDemandado === 'string') {
    const d = limpiarDocumentoIdentidad(parsed.documentoDemandado)
    if (d) datos.documentoDemandado = d
  }
  if (parsed.observacionesExtraccion && typeof parsed.observacionesExtraccion === 'string')
    datos.observacionesExtraccion = parsed.observacionesExtraccion.slice(0, 800)

  return datos
}

/**
 * Busca en los textos de importación el bloque correspondiente al PDF de demanda consolidado o DEMANDA_*.pdf
 * (formato `[nombreArchivo]\\ncontenido` generado en importación EML/ZIP).
 */
export function extraerTextoDemandaDesdeTextosImportacion(textos: string[]): string | null {
  const MIN_CHARS = 40
  for (const bloque of textos) {
    const linea = bloque.split('\n')[0] ?? ''
    if (/^\[Demanda\.pdf\]/i.test(linea) || /^\[DEMANDA_/i.test(linea)) {
      const cuerpo = bloque.replace(/^\[[^\]]+\]\s*\n?/, '').trim()
      if (cuerpo.length >= MIN_CHARS) return cuerpo.slice(0, 16000)
    }
  }
  return null
}

export async function parsearDemandaConIA(textoDemanda: string): Promise<DatosExtraidos | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey?.trim()) return null
  const t = textoDemanda.trim()
  if (t.length < 40) return null

  try {
    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_DEMANDA?.trim() || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_DEMANDA },
        { role: 'user', content: `Texto del escrito de demanda:\n\n${t.slice(0, 16000)}` },
      ],
      temperature: 0.15,
    })
    const content = completion.choices[0]?.message?.content?.trim()
    if (!content) return null
    const parsed = jsonDesdeRespuestaIA(content)
    if (!parsed) return null
    const datos = mapearParsedADatos(parsed)
    return Object.keys(datos).length ? datos : null
  } catch (e) {
    console.error('Error parsearDemandaConIA:', e)
    return null
  }
}

export async function parsearConIA(texto: string): Promise<DatosExtraidos | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey?.trim()) return null

  try {
    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Extrae los datos de este documento judicial:\n\n${texto.slice(0, 12000)}` },
      ],
      temperature: 0.1,
    })
    const content = completion.choices[0]?.message?.content?.trim()
    if (!content) return null
    const parsed = jsonDesdeRespuestaIA(content)
    if (!parsed) return null
    const datos = mapearParsedADatos(parsed)
    return Object.keys(datos).length ? datos : null
  } catch (e) {
    console.error('Error parsearConIA:', e)
    return null
  }
}

export function tieneClaveOpenAI(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim()
}
