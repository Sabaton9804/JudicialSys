/**
 * Parsea documentos judiciales usando OpenAI (GPT) para mayor precisión.
 * Requiere OPENAI_API_KEY en .env
 */
import OpenAI from 'openai'
import type { DatosExtraidos } from './parse-reparto'

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

export async function parsearConIA(texto: string): Promise<DatosExtraidos | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey?.trim()) return null

  try {
    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Extrae los datos de este documento judicial:\n\n${texto.slice(0, 12000)}` }
      ],
      temperature: 0.1,
    })
    const content = completion.choices[0]?.message?.content?.trim()
    if (!content) return null

    const json = content.replace(/```json?\s*/g, '').replace(/```\s*$/g, '').trim()
    const parsed = JSON.parse(json) as Record<string, unknown>
    const datos: DatosExtraidos = {}
    if (parsed.demandante && typeof parsed.demandante === 'string') datos.demandante = parsed.demandante.slice(0, 500)
    if (parsed.demandado && typeof parsed.demandado === 'string') datos.demandado = parsed.demandado.slice(0, 500)
    if (parsed.demanda && typeof parsed.demanda === 'string') datos.demanda = parsed.demanda.slice(0, 500)
    if (parsed.radicado && typeof parsed.radicado === 'string') datos.radicado = parsed.radicado.replace(/\D/g, '').slice(0, 23)
    if (typeof parsed.cuantia === 'number') datos.cuantia = parsed.cuantia
    if (parsed.claseProceso && typeof parsed.claseProceso === 'string') datos.claseProceso = parsed.claseProceso
    return datos
  } catch (e) {
    console.error('Error parsearConIA:', e)
    return null
  }
}

export function tieneClaveOpenAI(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim()
}
