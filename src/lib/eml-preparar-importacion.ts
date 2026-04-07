import JSZip from 'jszip'
import { simpleParser } from 'mailparser'
import { convert } from 'html-to-text'
import { extraerTexto } from '@/lib/extract-documento'
import {
  clasificarCarpetaNombre,
  esAdjuntoOutlookEmbeddedIgnorable,
  nombreBaseActaRepartoSiEsSecPdf,
  PDF_CANONICO_CORREO_REPARTO,
  textoSugiereDemandaCivilEnLinea,
  type ArchivoImportRow,
} from '@/lib/proceso-import-shared'
import { generarPdfCorreoVistaImpresion } from '@/lib/correo-a-pdf'
import { descargarArchivosDesdeEnlacesHtml } from '@/lib/eml-descargar-enlaces'
import { consolidarZipTutelaEnLinea, type InnerZipEntry } from '@/lib/eml-tutela-zip-consolidar'
import { ordenarArchivosImportacionPorRolTutela } from '@/lib/tutela-orden-documentos'

const EXT = ['.pdf', '.doc', '.docx', '.txt']

/**
 * Lee un .eml: texto del cuerpo para parseo + adjuntos MIME + ZIP + enlaces HTTPS (Rama) + PDF del correo.
 * Sirve para **tutela en línea** y para **demanda en línea** (civil): el ZIP suele usar los mismos prefijos DEMANDA_/PRUEBA_/PODER_.
 */
export async function prepararImportacionDesdeEml(
  buffer: Buffer,
  nombreEml: string
): Promise<{
  archivos: ArchivoImportRow[]
  textosParaParseo: string[]
  referenciaTutelaLinea?: string
  forzarTutela: boolean
}> {
  const parsed = await simpleParser(buffer)
  const textos: string[] = []

  const html = typeof parsed.html === 'string' ? parsed.html : ''
  const cuerpoHtml = html ? convert(html, { wordwrap: 120 }) : ''
  if (cuerpoHtml) textos.push(`[Cuerpo del correo electrónico]\n${cuerpoHtml}`)
  if (parsed.text?.trim()) textos.push(`[Texto plano del correo]\n${parsed.text}`)

  const prefijo = nombreEml.replace(/\.eml$/i, '')
  const archivos: ArchivoImportRow[] = []

  for (const att of parsed.attachments || []) {
    const fname = (att.filename || `adjunto_${archivos.length}`).replace(/[/\\]/g, '_')
    const content = att.content
    if (!Buffer.isBuffer(content)) continue
    if (esAdjuntoOutlookEmbeddedIgnorable(fname)) continue

    if (fname.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(content)
      const prefijoZip = fname.replace(/\.zip$/i, '')
      const basePath = `${prefijo}/${prefijoZip}`
      const innerList: InnerZipEntry[] = []
      for (const [pathRel, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue
        const inner = pathRel.split('/').pop() || pathRel
        if (inner.startsWith('._') || inner === '.DS_Store') continue
        if (esAdjuntoOutlookEmbeddedIgnorable(inner)) continue
        const buf = Buffer.from(await entry.async('arraybuffer'))
        innerList.push({ relativePath: pathRel.replace(/\\/g, '/'), buffer: buf })
      }
      if (innerList.length) {
        const consolidados = await consolidarZipTutelaEnLinea(innerList, basePath)
        archivos.push(...consolidados)
        for (const row of consolidados) {
          const leaf = row.nombre.split('/').pop() || row.nombre
          if (EXT.some((e) => leaf.toLowerCase().endsWith(e))) {
            const t = await extraerTexto(row.buffer, leaf)
            if (t) textos.push(`[${leaf}]\n${t}`)
          }
        }
      }
    } else {
      const nombreBase = nombreBaseActaRepartoSiEsSecPdf(fname)
      const nombre = `${prefijo}/${nombreBase}`
      archivos.push({ nombre, buffer: content, carpeta: clasificarCarpetaNombre(nombreBase) })
      if (EXT.some((e) => nombreBase.toLowerCase().endsWith(e))) {
        const t = await extraerTexto(content, nombreBase)
        if (t) textos.push(`[${nombreBase}]\n${t}`)
      }
    }
  }

  const subject = parsed.subject || ''
  const ref = subject.match(/(?:No|N°|Nr\.?)\s*([\d]+)/i)?.[1]
  const sujeto = `${subject} ${cuerpoHtml} ${parsed.text || ''}`
  const forzarTutela = /tutela/i.test(sujeto)

  if (ref) {
    const contextoRef = `${subject} ${nombreEml} ${cuerpoHtml} ${parsed.text || ''}`
    const etiquetaRef = textoSugiereDemandaCivilEnLinea(contextoRef)
      ? 'Referencia demanda en línea (Rama)'
      : /tutela/i.test(sujeto)
        ? 'Referencia tutela en línea'
        : 'Referencia trámite web (Rama)'
    textos.unshift(`[${etiquetaRef}: ${ref}]`)
  }

  /** Enlaces https en el HTML (misma Rama): descarga ZIP/PDF y descomprime; ahí suelen venir acta, demanda, etc. */
  if (html) {
    const desc = await descargarArchivosDesdeEnlacesHtml(html, prefijo)
    archivos.push(...desc.archivos)
    for (const t of desc.textosExtra) textos.push(t)
    if (desc.avisos.length) {
      textos.push(`[Avisos de descarga automática de enlaces]\n${desc.avisos.join('\n')}`)
    }
  }

  const pdfBuf = await generarPdfCorreoVistaImpresion(parsed)

  const conCorreo: ArchivoImportRow[] = [
    {
      nombre: `${prefijo}/${PDF_CANONICO_CORREO_REPARTO}`,
      buffer: pdfBuf,
      carpeta: 'CONSTANCIAS',
    },
    ...archivos,
  ]

  return {
    archivos: ordenarArchivosImportacionPorRolTutela(conCorreo),
    textosParaParseo: textos,
    referenciaTutelaLinea: ref,
    forzarTutela,
  }
}
