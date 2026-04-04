/**
 * Contexto normativo colombiano inyectado en el system prompt del bot de IA (análisis de demandas).
 * No sustituye el texto legal oficial: orienta terminología y criterios (CGP, tutela, Decreto 2591/1991).
 * Texto completo: consultar Secretaría del Senado, Rama Judicial, Corte Constitucional.
 *
 * Ampliación opcional en despliegue:
 * - NORMATIVA_IA_APPEND: texto plano adicional (p. ej. extractos pegados).
 * - NORMATIVA_IA_APPEND_FILE: ruta a un .txt/.md con extractos del CGP o del decreto (máx. ~12k caracteres leídos).
 */

import fs from 'fs'
import path from 'path'

export const CONTEXTO_NORMATIVO_CGP_Y_TUTELAS = `
[NORMATIVA DE REFERENCIA — COLOMBIA — USO INTERNO DEL MODELO]

1) CÓDIGO GENERAL DEL PROCESO (CGP) — Ley 1437 de 2011
- Es el cuerpo normativo que regula el proceso civil, laboral, contencioso administrativo y otros procesos definidos en la ley, con principios de oralidad, concentración, inmediación y buena fe procesal.
- Estructura general (orientación): disposiciones preliminares; actuaciones procesales comunes; procesos según su naturaleza (p. ej. ejecutivos, ordinarios, verbales, posesorios, arbitrales, etc. según el Libro y Título que corresponda al asunto).
- Para clasificar un escrito civil, use la terminología del CGP: proceso ejecutivo, ordinario, verbal, monitorio o pertenencia cuando aplique; liquidación, sucesorio, divisorio, tercerías, etc., según el tipo de pretensión y el Libro aplicable.
- No confunda la acción de tutela (constitucional, art. 86 C.P.) con un proceso civil completo del CGP: pueden relacionarse en subsidio o complemento según el caso, pero la tutela tiene régimen propio.

2) ACCIÓN DE TUTELA — Constitución Política, artículo 86
- Toda persona puede reclamar ante jueces civiles la protección inmediata de sus derechos fundamentales cuando queden vulnerados o amenazados por la acción u omisión de cualquier autoridad pública o de particulares en determinados casos.
- La tutela es un mecanismo sumario y preferente; el juez decide en breve plazo (la reglamentación y la jurisprudencia desarrollan plazos y efectos).

3) DECRETO 2591 DE 1991 — Reglamentación parcial del artículo 86 de la Constitución (acción de tutela)
- Regula requisitos y trámite de la acción de tutela ante la jurisdicción ordinaria: interposición, audiencia, prueba, decisión y recursos en los términos allí previstos (sin citar aquí el texto completo).
- Indicios en un escrito alineados con este decreto y el art. 86: mención a derechos fundamentales vulnerados, pretensión de protección inmediata, accionante/accionado, a veces solicitud de audiencia o medidas; no es un proceso ejecutivo u ordinario “clásico” del CGP aunque se tramite ante juez civil.

4) JURISPRUDENCIA CONSTITUCIONAL (marco conceptual)
- La Corte Constitucional ha desarrollado extensamente la tutela (sentencias tipo T-…): límites, competencia, acumulación, tutela laboral, de grupos, etc. Para identificar un escrito de tutela, basta reconocer el tipo de acción; no se exige citar sentencias.

5) INSTRUCCIÓN PARA EL MODELO
- Use este bloque solo para acotar lenguaje y clasificación procesal coherente con el ordenamiento colombiano.
- No invente números de artículos ni citas textuales si no están en el escrito del usuario; aquí solo tiene marco normativo general.
`.trim()

const MAX_ANEXO_CHARS = 12000

function leerAnexoDesdeArchivo(): string | null {
  const p = process.env.NORMATIVA_IA_APPEND_FILE?.trim()
  if (!p) return null
  try {
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p)
    if (!fs.existsSync(abs)) return null
    return fs.readFileSync(abs, 'utf8').slice(0, MAX_ANEXO_CHARS)
  } catch {
    return null
  }
}

/**
 * Contexto base + opcional extracto largo (archivo o env) para acercar el modelo al texto legal que usted adjunte.
 */
export function getContextoNormativoParaDemanda(): string {
  let out = CONTEXTO_NORMATIVO_CGP_Y_TUTELAS
  const desdeArchivo = leerAnexoDesdeArchivo()
  if (desdeArchivo) {
    out += `\n\n[Extracto normativo adicional — archivo]\n${desdeArchivo}`
    return out
  }
  const extra = process.env.NORMATIVA_IA_APPEND?.trim()
  if (extra) {
    out += `\n\n[Extracto normativo adicional — variable de entorno]\n${extra.slice(0, MAX_ANEXO_CHARS)}`
  }
  return out
}
