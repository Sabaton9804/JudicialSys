/**
 * Extrae texto de documentos PDF y DOCX para importación desde reparto
 */
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

/** Fallback: algunos PDF devuelven 0 caracteres con PDFParse pero sí exponen items en getTextContent (pdf.js). */
async function extraerTextoPdfConPdfJsDist(buffer: Buffer): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = new Uint8Array(buffer)
    const loadingTask = pdfjs.getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
    })
    const pdf = await loadingTask.promise
    const partes: string[] = []
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const textContent = await page.getTextContent({
        includeMarkedContent: true,
        disableNormalization: false,
      })
      for (const raw of textContent.items) {
        const item = raw as { str?: string; hasEOL?: boolean }
        if (typeof item.str === 'string' && item.str.length > 0) {
          partes.push(item.str)
          if (item.hasEOL) partes.push('\n')
        }
      }
      partes.push('\n\n')
      await page.cleanup()
    }
    await pdf.destroy()
    return normalizarTextoExtraido(partes.join(''))
  } catch (e) {
    console.error('extraerTextoPdfConPdfJsDist:', e)
    return ''
  }
}

/** Cabecera estándar de un PDF (aunque el nombre del archivo no lleve .pdf). */
export function bufferParecePdf(buffer: Buffer): boolean {
  if (buffer.length < 5) return false
  const h = buffer.subarray(0, 5).toString('latin1')
  return h.startsWith('%PDF')
}

/** DOCX/DOC modernos son ZIP (PK…). */
function bufferPareceZipOffice(buffer: Buffer): boolean {
  if (buffer.length < 4) return false
  return buffer[0] === 0x50 && buffer[1] === 0x4b
}

function normalizarTextoExtraido(s: string): string {
  return s.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim()
}

/**
 * Varios modos de extracción: algunos PDF con capa de texto/OCR responden mejor
 * con `lineEnforce: false` o con normalización explícita en getTextContent.
 */
export async function extraerTextoPdf(buffer: Buffer): Promise<string> {
  const ejecutar = async (opts: Record<string, unknown> = {}) => {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText(opts)
      await parser.destroy()
      return normalizarTextoExtraido(result?.text || '')
    } catch (e) {
      try {
        await parser.destroy()
      } catch {
        /* ignore */
      }
      console.error('Error extrayendo PDF:', e)
      return ''
    }
  }

  let mejor = await ejecutar()
  if (mejor.length < 80) {
    const t2 = await ejecutar({ lineEnforce: false, includeMarkedContent: true })
    if (t2.length > mejor.length) mejor = t2
  }
  if (mejor.length < 80) {
    const t3 = await ejecutar({ lineEnforce: false, disableNormalization: false })
    if (t3.length > mejor.length) mejor = t3
  }
  if (mejor.length === 0) {
    const fb = await extraerTextoPdfConPdfJsDist(buffer)
    if (fb.length > mejor.length) mejor = fb
  }
  return mejor
}

export async function extraerTextoDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    return result?.value || ''
  } catch (e) {
    console.error('Error extrayendo DOCX:', e)
    return ''
  }
}

export async function extraerTexto(buffer: Buffer, nombreArchivo: string): Promise<string> {
  const ext = nombreArchivo.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf' || bufferParecePdf(buffer)) return extraerTextoPdf(buffer)
  if (['doc', 'docx'].includes(ext) || bufferPareceZipOffice(buffer)) return extraerTextoDocx(buffer)
  if (['txt', 'text'].includes(ext)) return buffer.toString('utf-8')
  return ''
}
