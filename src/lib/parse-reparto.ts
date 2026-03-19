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
  claseProceso?: string
  observaciones?: string
}

const PATRONES = {
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
  if (demandante) datos.demandante = demandante
  if (demandado) datos.demandado = demandado

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
