import OpenAI from 'openai'
import type { CarpetaArchivo } from '@prisma/client'
import {
  normalizarCodigoTipoDocumentalSgde,
  textoCatalogoTipoDocumentalParaPrompt,
} from '@/lib/sgde/catalogo-tipo-documental-sgde'
import { tieneClaveOpenAI } from '@/lib/parse-reparto-ai'

const MODEL = process.env.OPENAI_MODEL_SGDE_TIPO?.trim() || 'gpt-4o-mini'

/** Fallback sin IA: carpeta JudicialSys → tipo documental SGDE más probable. */
export function tipoDocumentalDesdeCarpetaJudicialSys(carpeta: CarpetaArchivo | string): string {
  const c = String(carpeta)
  const map: Record<string, string> = {
    DEMANDA: 'EscritoDeDemanda',
    CONTESTACION: 'ContestacionDeLaDemanda',
    MEMORIALES: 'Memorial',
    PODERES: 'Poder',
    PRUEBAS: 'PruebaDocumental',
    ALEGATOS: 'Alegato',
    RECURSOS: 'RecursoDeApelacion',
    ANEXOS: 'DocumentoAnexo',
    ACTA_REPARTO: 'ActaDeReparto',
    CONSTANCIAS: 'ConstanciaDeCorreoElectronico',
    INFORME_INGRESO_DESPACHO: 'Informe',
    AUTOS: 'Auto',
    SENTENCIAS: 'Sentencia',
    OFICIOS: 'Oficio',
    NOTIFICACIONES: 'Notificacion',
    CITACIONES: 'Citacion',
    ESTADOS: 'EstadoDelProceso',
    OTROS: 'OtrosDocumentos',
  }
  return map[c] ?? 'OtrosDocumentos'
}

export type ItemClasificacionSgde = {
  nombreOriginal: string
  carpeta: string
  descripcion?: string | null
}

/**
 * Clasifica varios archivos en una sola llamada (mismo orden de salida que entrada).
 */
export async function clasificarTiposDocumentalesSgdeIA(
  items: ItemClasificacionSgde[]
): Promise<string[]> {
  if (items.length === 0) return []
  if (!tieneClaveOpenAI()) {
    return items.map((it) =>
      normalizarCodigoTipoDocumentalSgde(tipoDocumentalDesdeCarpetaJudicialSys(it.carpeta))
    )
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const lineas = items.map((it, i) => {
    const desc = it.descripcion?.trim() ? ` | nota: ${it.descripcion.trim().slice(0, 200)}` : ''
    return `${i + 1}. nombre: "${it.nombreOriginal}" | carpeta expediente: ${it.carpeta}${desc}`
  })

  const system = `Eres secretario judicial en Colombia. Debes asignar a cada archivo UN tipo documental del catálogo del SGDE (Sistema de Gestión Documental Electrónica de la Rama Judicial).

CATÁLOGO (usa EXACTAMENTE uno de los códigos \`codigo\` entre backticks, sin inventar códigos nuevos):
${textoCatalogoTipoDocumentalParaPrompt()}

Reglas:
- El nombre del archivo y la carpeta en JudicialSys son pistas fuertes (p. ej. DEMANDA, ActaReparto, DEMANDA_*, SEC*, CorreoReparto).
- Tutelas: solicitud inicial → SolicitudDeTutela o EscritoDeDemanda según contexto.
- Si no encaja bien, usa OtrosDocumentos.

Responde SOLO con un JSON válido de esta forma, sin markdown:
{"tipos":["EscritoDeDemanda","ActaDeReparto",...]}
El array "tipos" debe tener exactamente ${items.length} strings, en el mismo orden que los ítems listados.`

  const user = `Clasifica estos archivos:\n${lineas.join('\n')}`

  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })

  const text = res.choices[0]?.message?.content?.trim() ?? ''
  let tipos: unknown
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text) as { tipos?: unknown }
    tipos = parsed.tipos
  } catch {
    return items.map((it) =>
      normalizarCodigoTipoDocumentalSgde(tipoDocumentalDesdeCarpetaJudicialSys(it.carpeta))
    )
  }

  if (!Array.isArray(tipos) || tipos.length !== items.length) {
    return items.map((it) =>
      normalizarCodigoTipoDocumentalSgde(tipoDocumentalDesdeCarpetaJudicialSys(it.carpeta))
    )
  }

  return tipos.map((t, i) => {
    const raw = typeof t === 'string' ? t : ''
    let cod = normalizarCodigoTipoDocumentalSgde(raw)
    if (cod === 'OtrosDocumentos') {
      cod = normalizarCodigoTipoDocumentalSgde(tipoDocumentalDesdeCarpetaJudicialSys(items[i].carpeta))
    }
    return cod
  })
}
