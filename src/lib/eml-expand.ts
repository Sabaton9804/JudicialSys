import JSZip from 'jszip'
import { simpleParser } from 'mailparser'
import {
  esAdjuntoOutlookEmbeddedIgnorable,
  nombreBaseActaRepartoSiEsSecPdf,
  rutaConActaRepartoSiEsSecPdf,
} from '@/lib/proceso-import-shared'

export function slugAsunto(asunto: string): string {
  const t = asunto.replace(/[^\w\u00C0-\u024F\s-]/g, '').replace(/\s+/g, '_').trim()
  return t.slice(0, 80) || 'mensaje'
}

export type EntradaOrdenArchivo = {
  nombre: string
  tamano: number
}

/**
 * Outlook: Archivo → Guardar como → “Formato mensaje de Outlook (*.eml)” (o arrastrar a carpeta como .eml).
 * Expande el .eml en: 1) cuerpo como CORREO_REPARTO_*.html (orden judicial: mensaje de adjudicación) y 2) adjuntos (PDF, ZIP, etc.).
 * Los ZIP anidados se listan como en un ZIP suelto.
 */
export async function expandirEmlParaOrden(
  buffer: Buffer,
  nombreArchivoEml: string
): Promise<EntradaOrdenArchivo[]> {
  const parsed = await simpleParser(buffer)
  const prefijo = nombreArchivoEml.replace(/\.eml$/i, '')
  const salida: EntradaOrdenArchivo[] = []

  const asunto = slugAsunto(parsed.subject || '')
  const html =
    typeof parsed.html === 'string' && parsed.html.length > 0
      ? parsed.html
      : parsed.textAsHtml ||
        `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body><pre>${escapeHtml(
          parsed.text || '(sin cuerpo)'
        )}</pre></body></html>`

  const bodyBuf = Buffer.from(html, 'utf8')
  const nombreCuerpo = `${prefijo}/CORREO_REPARTO_${asunto}.html`
  salida.push({ nombre: nombreCuerpo, tamano: bodyBuf.length })

  for (const att of parsed.attachments || []) {
    const rawName = att.filename || `adjunto_${salida.length}.bin`
    const fname = rawName.replace(/[/\\]/g, '_')
    const content = att.content
    if (!Buffer.isBuffer(content)) continue
    if (esAdjuntoOutlookEmbeddedIgnorable(fname)) continue

    if (fname.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(content)
      const prefijoZip = `${prefijo}/${fname.replace(/\.zip$/i, '')}`
      for (const [pathRel, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue
        const inner = pathRel.split('/').pop() || pathRel
        if (inner.startsWith('._') || inner === '.DS_Store') continue
        if (esAdjuntoOutlookEmbeddedIgnorable(inner)) continue
        const buf = Buffer.from(await entry.async('arraybuffer'))
        const innerMost = rutaConActaRepartoSiEsSecPdf(pathRel.replace(/\\/g, '/'))
        salida.push({
          nombre: `${prefijoZip}/${innerMost}`,
          tamano: buf.length,
        })
      }
    } else {
      const base = nombreBaseActaRepartoSiEsSecPdf(fname)
      salida.push({
        nombre: `${prefijo}/${base}`,
        tamano: content.length,
      })
    }
  }

  return salida
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
