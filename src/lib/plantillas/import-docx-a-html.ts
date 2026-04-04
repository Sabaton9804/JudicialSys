import mammoth from 'mammoth'
import { normalizarHtmlWordImportado } from '@/lib/plantillas/normalizar-html-word-importado'

/**
 * Convierte un .docx a HTML (incluye imágenes embebidas como data URI).
 * Solo .docx (Office Open XML); el formato .doc antiguo no está soportado por mammoth.
 */
export async function importarDocxAHtml(file: File): Promise<{
  html: string
  advertencias: string[]
}> {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.docx')) {
    throw new Error(
      'Use un archivo .docx (Word 2007 o posterior). El formato .doc antiguo no es compatible; guárdelo en Word como «.docx».'
    )
  }
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.convertToHtml({ arrayBuffer })
  const advertencias = result.messages
    .filter((m) => m.type === 'warning')
    .map((m) => m.message)
  const html = normalizarHtmlWordImportado(result.value)
  return { html, advertencias }
}
