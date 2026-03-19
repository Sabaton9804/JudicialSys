/**
 * Extrae texto de documentos PDF y DOCX para importación desde reparto
 */
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

export async function extraerTextoPdf(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    await parser.destroy()
    return result?.text || ''
  } catch (e) {
    console.error('Error extrayendo PDF:', e)
    return ''
  }
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
  if (ext === 'pdf') return extraerTextoPdf(buffer)
  if (['doc', 'docx'].includes(ext)) return extraerTextoDocx(buffer)
  if (['txt', 'text'].includes(ext)) return buffer.toString('utf-8')
  return ''
}
