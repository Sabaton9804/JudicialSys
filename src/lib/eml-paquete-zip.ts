import JSZip from 'jszip'
import { simpleParser } from 'mailparser'
import { correoElectronicoABufferPdf } from '@/lib/correo-a-pdf'
import {
  ETIQUETA_ROL_TUTELA,
  ordenarDocumentosTutela,
} from '@/lib/tutela-orden-documentos'
import {
  esAdjuntoOutlookEmbeddedIgnorable,
  nombreBaseActaRepartoSiEsSecPdf,
  rutaConActaRepartoSiEsSecPdf,
} from '@/lib/proceso-import-shared'

function prefijoSeguro(nombreEml: string): string {
  return nombreEml
    .replace(/\.eml$/i, '')
    .replace(/[^a-zA-Z0-9\u00C0-\u024F_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 72) || 'correo'
}

/**
 * Desde un .eml completo: genera PDF del correo, extrae adjuntos y ZIP internos,
 * ordena según roles (demanda, pruebas/anexos, acta, informe) y empaqueta un ZIP descargable.
 */
export async function construirZipPaqueteDesdeEml(
  emlBuffer: Buffer,
  nombreArchivoEml: string
): Promise<{ zipBuffer: Buffer; nombreZipSugerido: string }> {
  const parsed = await simpleParser(emlBuffer)
  const prefijo = prefijoSeguro(nombreArchivoEml)

  const pdfCorreo = await correoElectronicoABufferPdf(parsed)

  const archivos: { nombre: string; buffer: Buffer }[] = []
  archivos.push({
    nombre: `${prefijo}/CorreoReparto.pdf`,
    buffer: pdfCorreo,
  })

  for (const att of parsed.attachments || []) {
    const rawName = att.filename || `adjunto_${archivos.length}.bin`
    const fname = rawName.replace(/[/\\]/g, '_')
    const content = att.content
    if (!Buffer.isBuffer(content)) continue
    if (esAdjuntoOutlookEmbeddedIgnorable(fname)) continue

    if (fname.toLowerCase().endsWith('.zip')) {
      const z = await JSZip.loadAsync(content)
      const zipFolder = fname.replace(/\.zip$/i, '')
      for (const [pathRel, entry] of Object.entries(z.files)) {
        if (entry.dir) continue
        const inner = pathRel.split('/').pop() || pathRel
        if (inner.startsWith('._') || inner === '.DS_Store') continue
        if (esAdjuntoOutlookEmbeddedIgnorable(inner)) continue
        const buf = Buffer.from(await entry.async('arraybuffer'))
        const innerMost = rutaConActaRepartoSiEsSecPdf(pathRel.replace(/\\/g, '/'))
        archivos.push({
          nombre: `${prefijo}/${zipFolder}/${innerMost}`,
          buffer: buf,
        })
      }
    } else {
      const base = nombreBaseActaRepartoSiEsSecPdf(fname)
      archivos.push({ nombre: `${prefijo}/${base}`, buffer: content })
    }
  }

  const nombres = archivos.map((a) => a.nombre)
  const mapa = new Map(archivos.map((a) => [a.nombre, a.buffer]))
  const orden = ordenarDocumentosTutela(nombres)

  let indice = 'Paquete generado desde correo electrónico (.eml)\n'
  indice += 'Orden sugerido para incorporación al expediente / SGDE.\n\n'
  if (archivos.length <= 1) {
    indice +=
      'AVISO: Este .eml no trae adjuntos incrustados. Si el enlace al ZIP está solo en el cuerpo del mensaje, descargue ese archivo desde el navegador y súbalo aparte (pestaña Orden documentos o ZIP reparto).\n\n'
  }
  for (const row of orden) {
    const base = row.nombre.split('/').pop() || row.nombre
    indice += `${String(row.orden).padStart(2, '0')}. [${row.rol}] ${base}\n`
    indice += `    ${ETIQUETA_ROL_TUTELA[row.rol]}\n\n`
  }

  const zipOut = new JSZip()
  const raiz = zipOut.folder(prefijo) || zipOut
  raiz.file('00_INDICE_SECUENCIA.txt', indice)

  for (let i = 0; i < orden.length; i++) {
    const row = orden[i]
    const buf = mapa.get(row.nombre)
    if (!buf) continue
    const base = row.nombre.split('/').pop() || 'archivo'
    const safe = base.replace(/[^a-zA-Z0-9._\u00C0-\u024F-]/g, '_').slice(0, 100)
    const seq = String(i + 1).padStart(2, '0')
    raiz.file(`${seq}_${row.rol}_${safe}`, buf)
  }

  const zipBuffer = Buffer.from(
    await zipOut.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  )
  const nombreZipSugerido = `${prefijo}_paquete_documentos.zip`
  return { zipBuffer, nombreZipSugerido }
}
