/**
 * Parsea documentos judiciales usando OpenAI (GPT) para mayor precisión.
 * Requiere OPENAI_API_KEY en .env
 *
 * Prioridad: si en la importación hay texto extraído del **escrito de demanda** (EscritoDemanda.pdf / Demanda.pdf legado / DEMANDA_*),
 * se usa `parsearDemandaConIA` con un prompt específico; si no, se analiza el conjunto de textos con `parsearConIA`.
 */
import OpenAI from 'openai'
import { getContextoNormativoParaDemanda } from '@/lib/normativa/contexto-ia-cgp-tutelas'
import { textoCatalogoSgdeParaPrompt } from '@/lib/sgde/catalogo-sgde-serie-subserie'
import type { DatosExtraidos } from './parse-reparto'

const SEP_NORMATIVA_TAREA = '\n\n---\n\n'

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

/** Instrucciones de identificación procesal (CGP) — salida texto + JSON auxiliar para el sistema. */
const SYSTEM_PROMPT_DEMANDA = `Actúa como un abogado experto en derecho procesal civil colombiano, con dominio del Código General del Proceso.

Tu función es leer una demanda judicial y extraer únicamente la información básica de identificación del proceso, sin realizar análisis jurídico ni desarrollar contenido.

REGLAS ESTRICTAS
- NO resumas hechos, pretensiones o pruebas.
- NO hagas interpretaciones jurídicas complejas.
- Para partes, documentos y datos fácticos: SOLO extrae lo literal o claramente identificable en el escrito.
- Si un dato literal no aparece, escribe exactamente: "No se identifica en el documento".
- NO inventes nombres, números ni hechos que no estén en el escrito.
- Usa lenguaje técnico, claro y conciso.
- EXCEPCIÓN (campos sgde* en el JSON): el escrito de demanda casi NUNCA trae las etiquetas "Serie", "Subserie" ni el vocabulario exacto del catálogo SGDE. Para esos campos debes INFERIR y SUGERIR valores razonables según el tipo de proceso que se desprende del escrito (p. ej. acción de tutela → Constitucional y subserie exacta del catálogo SGDE "Acciones Constitucionales de Tutela", no solo la palabra "Tutela"; proceso ejecutivo → Civil / Ejecutivo). No copies texto que diga "Serie:" porque normalmente no existirá: clasifica tú.

TAREAS
1) TIPO DE PROCESO — Identificar el tipo (ej.: ejecutivo, verbal, pertenencia, monitorio, ordinario, tutela, etc.). Solo inferir si es evidente en el texto.
2) CLASE DE PROCESO — Clasificar en UNA de estas categorías: Declarativo, Ejecutivo, Liquidatorio, Especial (si no es claro: "No se identifica en el documento").
3) PARTES PROCESALES — Demandante(s) y demandado(s): nombre completo o razón social; tipo de persona (natural o jurídica); identificación si aparece; calidad procesal solo si está expresamente indicada.
4) APODERADOS — Apoderado(s) del demandante y del demandado. Si no aparecen, indicarlo con la frase de no identificación.
5) CLASIFICACIÓN SUGERIDA PARA SGDE (solo en el JSON, campos sgde*) — A partir del análisis del escrito, sugerir Serie, Subserie y categoría como las usaría un usuario al crear el expediente en el gestor documental, aunque el escrito no use esas palabras.

FORMATO DE RESPUESTA OBLIGATORIO (primero escribe exactamente este esquema numerado, en español):

1. Tipo de proceso:
2. Clase de proceso:

3. Demandante(s):

4. Demandado(s):

5. Apoderados:

Después del punto 5, deja UNA línea en blanco y luego exactamente esta línea separadora:
---METADATOS_JSON---
En la línea siguiente, UN solo objeto JSON minificado (sin markdown, sin texto antes ni después) con estas claves para integración interna. En demandante, demandado, documentos y apoderados use valores del documento o "No se identifica en el documento". En los campos sgde* use la clasificación inferida (ver abajo), no exija literalidad.
{"demandante":"","demandado":"","tipoProceso":"","claseProcesoGrupo":"","tipoPersonaDemandante":"","tipoPersonaDemandado":"","documentoDemandante":"","documentoDemandado":"","apoderadosDemandante":"","apoderadosDemandado":"","claseProceso":"","sgdeSerie":"","sgdeSubserie":"","sgdeNombreExpediente":"","sgdeCodigoSubserie":"","sgdeCategoriaProceso":""}

En "claseProceso" usa cuando sea posible un valor del sistema: ORDINARIO, VERBAL, TUTELA, EJECUTIVO_SINGULAR, EJECUTIVO_HIPOTECARIO, EJECUTIVO_PRENDARIO, VERBAL_SUMARIO, u otro coherente con el escrito; si no aplica, "No se identifica en el documento".

CAMPOS SGDE (inferidos — el escrito no los trae como tal; tú sugieres según el tipo de proceso):
- "sgdeCategoriaProceso": "CIVIL" o "CONSTITUCIONAL" según la naturaleza de la acción (tutela, hábeas, etc. → CONSTITUCIONAL; resto típico del proceso civil → CIVIL).
- "sgdeSerie": use EXACTAMENTE el texto de la columna «Serie» en la tabla siguiente (Civil o Constitucional), coherente con sgdeCategoriaProceso y con "claseProceso".
- "sgdeSubserie": use EXACTAMENTE el texto de la columna «Subserie» de la fila que corresponda a "claseProceso" en la tabla (mismo texto que el gestor SGDE). No abrevie (p. ej. tutela → "Acciones Constitucionales de Tutela").
- "sgdeNombreExpediente": arma una denominación breve para listados (idealmente partes "X vs Y" si constan); si faltan partes claras, una referencia corta al tipo de proceso. NO es el CUI.
- "sgdeCodigoSubserie": solo si en el escrito aparece un código o referencia documental explícita de subserie; si no, "No se identifica en el documento" (es lo normal).

TABLA INTERNA — Serie y Subserie SGDE por clase de proceso (JudicialSys / Prisma). Copie el par que corresponda a la clase inferida:
${textoCatalogoSgdeParaPrompt()}`

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

/** Extrae un objeto JSON aunque venga rodeado de espacios o texto suelto. */
function extraerJsonObjeto(s: string): Record<string, unknown> | null {
  const t = s.trim()
  const directo = jsonDesdeRespuestaIA(t)
  if (directo) return directo
  const i = t.indexOf('{')
  const j = t.lastIndexOf('}')
  if (i >= 0 && j > i) {
    try {
      return JSON.parse(t.slice(i, j + 1)) as Record<string, unknown>
    } catch {
      return null
    }
  }
  return null
}

const SEPARADOR_METADATOS_DEMANDA = '---METADATOS_JSON---'

function parsearRespuestaDemandaIA(content: string): DatosExtraidos | null {
  const datos: DatosExtraidos = {}
  const idx = content.indexOf(SEPARADOR_METADATOS_DEMANDA)
  if (idx >= 0) {
    const informe = content.slice(0, idx).trim()
    if (informe) datos.informeDemandaProcesal = informe.slice(0, 14000)
    const jsonPart = content.slice(idx + SEPARADOR_METADATOS_DEMANDA.length).trim()
    const parsed = extraerJsonObjeto(jsonPart)
    if (parsed) Object.assign(datos, mapearParsedADatos(parsed))
  } else {
    const parsed = extraerJsonObjeto(content)
    if (parsed && Object.keys(parsed).length > 0) {
      Object.assign(datos, mapearParsedADatos(parsed))
    } else {
      const t = content.trim()
      if (t.length >= 20) datos.informeDemandaProcesal = t.slice(0, 14000)
    }
  }
  return Object.keys(datos).length ? datos : null
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
  else if (parsed.tipoProceso && typeof parsed.tipoProceso === 'string')
    datos.tipoProcesoDescripcion = parsed.tipoProceso.slice(0, 400)
  if (parsed.claseProcesoGrupo && typeof parsed.claseProcesoGrupo === 'string')
    datos.claseProcesoGrupoCGP = parsed.claseProcesoGrupo.slice(0, 120)
  if (parsed.apoderadosDemandante && typeof parsed.apoderadosDemandante === 'string')
    datos.apoderadosDemandante = parsed.apoderadosDemandante.slice(0, 2000)
  if (parsed.apoderadosDemandado && typeof parsed.apoderadosDemandado === 'string')
    datos.apoderadosDemandado = parsed.apoderadosDemandado.slice(0, 2000)
  if (parsed.tipoPersonaDemandante && typeof parsed.tipoPersonaDemandante === 'string')
    datos.tipoPersonaDemandante = parsed.tipoPersonaDemandante.slice(0, 200)
  if (parsed.tipoPersonaDemandado && typeof parsed.tipoPersonaDemandado === 'string')
    datos.tipoPersonaDemandado = parsed.tipoPersonaDemandado.slice(0, 200)
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

  if (parsed.sgdeSerie && typeof parsed.sgdeSerie === 'string')
    datos.sgdeSerie = parsed.sgdeSerie.slice(0, 120)
  if (parsed.sgdeSubserie && typeof parsed.sgdeSubserie === 'string')
    datos.sgdeSubserie = parsed.sgdeSubserie.slice(0, 120)
  if (parsed.sgdeNombreExpediente && typeof parsed.sgdeNombreExpediente === 'string')
    datos.sgdeNombreExpediente = parsed.sgdeNombreExpediente.slice(0, 300)
  if (parsed.sgdeCodigoSubserie && typeof parsed.sgdeCodigoSubserie === 'string')
    datos.sgdeCodigoSubserie = parsed.sgdeCodigoSubserie.slice(0, 120)
  if (parsed.sgdeCategoriaProceso && typeof parsed.sgdeCategoriaProceso === 'string') {
    const u = parsed.sgdeCategoriaProceso.trim().toUpperCase()
    if (u === 'CIVIL' || u === 'CONSTITUCIONAL') datos.sgdeCategoriaProceso = u
    else if (/CONSTITUC/.test(u)) datos.sgdeCategoriaProceso = 'CONSTITUCIONAL'
    else if (u.includes('CIVIL')) datos.sgdeCategoriaProceso = 'CIVIL'
  }

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
    if (
      /^\[EscritoDemanda\.pdf\]/i.test(linea) ||
      /^\[Demanda\.pdf\]/i.test(linea) ||
      /^\[DEMANDA_/i.test(linea)
    ) {
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
        {
          role: 'system',
          content: getContextoNormativoParaDemanda() + SEP_NORMATIVA_TAREA + SYSTEM_PROMPT_DEMANDA,
        },
        { role: 'user', content: `Texto del escrito de demanda:\n\n${t.slice(0, 16000)}` },
      ],
      temperature: 0.15,
    })
    const content = completion.choices[0]?.message?.content?.trim()
    if (!content) return null
    return parsearRespuestaDemandaIA(content)
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
        {
          role: 'system',
          content: getContextoNormativoParaDemanda() + SEP_NORMATIVA_TAREA + SYSTEM_PROMPT,
        },
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
