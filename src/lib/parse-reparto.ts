/**
 * Parsea texto extraído de documentos judiciales para obtener demandante, demandado, demanda, etc.
 * Patrones comunes en documentos colombianos (demandas, actas de reparto)
 */
export interface DatosExtraidos {
  demandante?: string
  demandado?: string
  demanda?: string
  radicado?: string
  cuantia?: number
  /** Valor del enum `ClaseProceso` en Prisma (ej. TUTELA, ORDINARIO). */
  claseProceso?: string
  observaciones?: string
  /** Tipo o subtipo según el escrito (texto libre: ej. tutela por salud, ejecución singular). */
  tipoProcesoDescripcion?: string
  /** En tutela: derechos constitucionales invocados. */
  derechosVulnerados?: string
  /** Síntesis de pretensiones o petitorio. */
  pretensiones?: string
  /** CC, NIT o documento del demandante/accionante si consta. */
  documentoDemandante?: string
  /** CC, NIT o documento del demandado/accionado si consta. */
  documentoDemandado?: string
  /** Otros datos relevantes en una sola cadena (IA). */
  observacionesExtraccion?: string
}

const PATRONES = {
  accionante: [
    /(?:accionante|accionantes)\s*[:\-]\s*([^\n\r]+)/i,
    /(?:accionante|accionantes)\s*<\/strong>\s*:\s*([^\n\r<]+)/i,
  ],
  accionado: [
    /(?:accionado|accionados)\s*[:\-]\s*([^\n\r]+)/i,
    /(?:accionado|accionados)\s*<\/strong>\s*:\s*([^\n\r<]+)/i,
  ],
  demandante: [
    /(?:demandante|actor|peticionario)\s*[:\-]\s*([^\n\r]+)/i,
    /(?:señor(?:a)?|sr\.?|sra\.?)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\s\.]+(?:S\.?A\.?S\.?|S\.?A\.?|LTDA\.?|INC\.?)?)/,
    /(?:contra|vs\.?|versus)\s+([^\n]+)/i, // a veces el demandado está después de "contra"
  ],
  demandado: [
    /(?:demandado|demandada|demandados?)\s*[:\-]\s*([^\n\r]+)/i,
    /(?:contra|vs\.?|versus)\s+([^\n\r]+)/i,
    /(?:en\s+contra\s+de)\s+([^\n\r]+)/i,
  ],
  demanda: [
    /(?:objeto\s+de\s+la\s+demanda|objeto\s+demanda|pretensiones?)\s*[:\-]\s*([^\n\r]{10,200})/i,
    /(?:solicita|pide|pretende)\s+que\s+([^\n\r]{20,300})/i,
    /(?:demanda|acción)\s*[:\-]\s*([^\n\r]{15,200})/i,
  ],
  radicado: [
    /(?:radicado|radicación|número\s+de\s+proceso)\s*[:\-]?\s*(\d[\d\-\s]{10,30})/i,
    /(\d{5}[\-\s]?\d{2}[\-\s]?\d{2}[\-\s]?\d{3}[\-\s]?\d{4}[\-\s]?\d{5})/,
    /(\d{23})/, // 23 dígitos Acuerdo 201/1997
  ],
  cuantia: [
    /(?:cuantía|cuantia|valor)\s*[:\-]?\s*(?: pesos|COP)?\s*[\$]?\s*([\d.,]+)/i,
    /([\d.,]+)\s*(?:pesos|millones?|millón)/i,
  ],
  claseProceso: [
    /(?:clase|tipo\s+de\s+proceso)\s*[:\-]\s*(ejecutivo|ordinario|verbal|tutela|hipotecario|prendario)/i,
    /(?:acción\s+de\s+)?tutela/i,
    /proceso\s+(?:civil\s+)?(ejecutivo|ordinario|verbal)/i,
  ],
}

function limpiar(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, 500)
}

function extraerPrimerMatch(texto: string, patrones: RegExp[]): string | undefined {
  for (const p of patrones) {
    const m = texto.match(p)
    if (m?.[1]) return limpiar(m[1])
  }
  return undefined
}

function extraerCuantia(texto: string): number | undefined {
  for (const p of PATRONES.cuantia) {
    const m = texto.match(p)
    if (m?.[1]) {
      const num = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
      if (!isNaN(num) && num > 0) return num
    }
  }
  return undefined
}

function extraerRadicado(texto: string): string | undefined {
  const r1 = extraerPrimerMatch(texto, PATRONES.radicado)
  if (r1) return r1.replace(/\D/g, '').slice(0, 23)
  return undefined
}

export function parsearTextoDocumentos(textos: string[]): DatosExtraidos {
  const textoCompleto = textos.join('\n\n')
  const datos: DatosExtraidos = {}

  const demandante = extraerPrimerMatch(textoCompleto, PATRONES.demandante)
  const demandado = extraerPrimerMatch(textoCompleto, PATRONES.demandado)
  const accionante = extraerPrimerMatch(textoCompleto, PATRONES.accionante)
  const accionado = extraerPrimerMatch(textoCompleto, PATRONES.accionado)
  if (demandante) datos.demandante = demandante
  else if (accionante) datos.demandante = accionante
  if (demandado) datos.demandado = demandado
  else if (accionado) datos.demandado = accionado

  const demanda = extraerPrimerMatch(textoCompleto, PATRONES.demanda)
  if (demanda) datos.demanda = demanda

  const radicado = extraerRadicado(textoCompleto)
  if (radicado) datos.radicado = radicado

  const cuantia = extraerCuantia(textoCompleto)
  if (cuantia) datos.cuantia = cuantia

  const clase = extraerPrimerMatch(textoCompleto, PATRONES.claseProceso)
  if (clase) {
    const c = clase.toLowerCase()
    if (c.includes('tutela')) datos.claseProceso = 'TUTELA'
    else if (c.includes('ejecutivo') && c.includes('hipotec')) datos.claseProceso = 'EJECUTIVO_HIPOTECARIO'
    else if (c.includes('ejecutivo')) datos.claseProceso = 'EJECUTIVO_SINGULAR'
    else if (c.includes('ordinario')) datos.claseProceso = 'ORDINARIO'
    else if (c.includes('verbal')) datos.claseProceso = 'VERBAL'
  }

  return datos
}
