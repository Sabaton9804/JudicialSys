import { PDFDocument } from 'pdf-lib'
import {
  clasificarCarpetaNombre,
  esAdjuntoOutlookEmbeddedIgnorable,
  PDF_CANONICO_ANEXOS_PRUEBAS,
  PDF_CANONICO_ESCRITO_DEMANDA,
  PDF_CANONICO_PODER,
  rutaConActaRepartoSiEsSecPdf,
  type ArchivoImportRow,
} from '@/lib/proceso-import-shared'

export type InnerZipEntry = { relativePath: string; buffer: Buffer }

function esPrefijoDemandaLineaRama(leaf: string): boolean {
  return /^demanda_/i.test(leaf) || /^demanda\d/i.test(leaf)
}
function esPrefijoPruebaLineaRama(leaf: string): boolean {
  return /^prueba_/i.test(leaf) || /^prueba\d/i.test(leaf)
}
function esPrefijoPoderLineaRama(leaf: string): boolean {
  return /^poder_/i.test(leaf) || /^poder\d/i.test(leaf)
}

async function fusionarPdfs(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create()
  for (const buf of buffers) {
    const doc = await PDFDocument.load(buf)
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    for (const p of pages) merged.addPage(p)
  }
  return Buffer.from(await merged.save())
}

/**
 * Tras descomprimir el ZIP (tutela/demanda en línea): EscritoDemanda.pdf, AnexosPruebas.pdf, Poder.pdf (si aplica);
 * el resto (acta SEC, etc.) se conserva. Orden lógico: otros → demanda → pruebas → poder (luego se reordena al importar).
 */
export async function consolidarZipTutelaEnLinea(
  innerFiles: InnerZipEntry[],
  basePath: string
): Promise<ArchivoImportRow[]> {
  const demandaItems: { leaf: string; relativePath: string; buffer: Buffer }[] = []
  const pruebaItems: { leaf: string; relativePath: string; buffer: Buffer }[] = []
  const poderItems: { leaf: string; relativePath: string; buffer: Buffer }[] = []
  const otros: ArchivoImportRow[] = []

  for (const f of innerFiles) {
    const leaf = f.relativePath.split('/').pop() || f.relativePath
    if (esAdjuntoOutlookEmbeddedIgnorable(leaf)) continue
    if (esPrefijoDemandaLineaRama(leaf)) {
      if (leaf.toLowerCase().endsWith('.pdf'))
        demandaItems.push({ leaf, relativePath: f.relativePath, buffer: f.buffer })
      else {
        const innerMost = rutaConActaRepartoSiEsSecPdf(f.relativePath)
        otros.push({
          nombre: `${basePath}/${innerMost}`,
          buffer: f.buffer,
          carpeta: clasificarCarpetaNombre(innerMost),
        })
      }
      continue
    }
    if (esPrefijoPruebaLineaRama(leaf)) {
      if (leaf.toLowerCase().endsWith('.pdf'))
        pruebaItems.push({ leaf, relativePath: f.relativePath, buffer: f.buffer })
      else {
        const innerMost = rutaConActaRepartoSiEsSecPdf(f.relativePath)
        otros.push({
          nombre: `${basePath}/${innerMost}`,
          buffer: f.buffer,
          carpeta: clasificarCarpetaNombre(innerMost),
        })
      }
      continue
    }
    if (esPrefijoPoderLineaRama(leaf)) {
      if (leaf.toLowerCase().endsWith('.pdf'))
        poderItems.push({ leaf, relativePath: f.relativePath, buffer: f.buffer })
      else {
        const innerMost = rutaConActaRepartoSiEsSecPdf(f.relativePath)
        otros.push({
          nombre: `${basePath}/${innerMost}`,
          buffer: f.buffer,
          carpeta: clasificarCarpetaNombre(innerMost),
        })
      }
      continue
    }
    const innerMost = rutaConActaRepartoSiEsSecPdf(f.relativePath)
    otros.push({
      nombre: `${basePath}/${innerMost}`,
      buffer: f.buffer,
      carpeta: clasificarCarpetaNombre(innerMost),
    })
  }

  demandaItems.sort((a, b) => a.leaf.localeCompare(b.leaf, 'es'))
  pruebaItems.sort((a, b) => a.leaf.localeCompare(b.leaf, 'es'))
  poderItems.sort((a, b) => a.leaf.localeCompare(b.leaf, 'es'))

  const demandaPdfs = demandaItems.map((x) => x.buffer)
  const pruebaPdfs = pruebaItems.map((x) => x.buffer)
  const poderPdfs = poderItems.map((x) => x.buffer)

  const bloques: ArchivoImportRow[] = [...otros]

  if (demandaPdfs.length) {
    try {
      const buf =
        demandaPdfs.length === 1 ? demandaPdfs[0]! : await fusionarPdfs(demandaPdfs)
      bloques.push({
        nombre: `${basePath}/${PDF_CANONICO_ESCRITO_DEMANDA}`,
        buffer: buf,
        carpeta: 'DEMANDA',
      })
    } catch {
      for (const it of demandaItems) {
        const innerMost = rutaConActaRepartoSiEsSecPdf(it.relativePath)
        bloques.push({
          nombre: `${basePath}/${innerMost}`,
          buffer: it.buffer,
          carpeta: clasificarCarpetaNombre(innerMost),
        })
      }
    }
  }

  if (pruebaPdfs.length) {
    try {
      const buf =
        pruebaPdfs.length === 1 ? pruebaPdfs[0]! : await fusionarPdfs(pruebaPdfs)
      bloques.push({
        nombre: `${basePath}/${PDF_CANONICO_ANEXOS_PRUEBAS}`,
        buffer: buf,
        carpeta: 'ANEXOS',
      })
    } catch {
      for (const it of pruebaItems) {
        const innerMost = rutaConActaRepartoSiEsSecPdf(it.relativePath)
        bloques.push({
          nombre: `${basePath}/${innerMost}`,
          buffer: it.buffer,
          carpeta: clasificarCarpetaNombre(innerMost),
        })
      }
    }
  }

  if (poderPdfs.length) {
    try {
      const buf =
        poderPdfs.length === 1 ? poderPdfs[0]! : await fusionarPdfs(poderPdfs)
      bloques.push({
        nombre: `${basePath}/${PDF_CANONICO_PODER}`,
        buffer: buf,
        carpeta: 'PODERES',
      })
    } catch {
      for (const it of poderItems) {
        const innerMost = rutaConActaRepartoSiEsSecPdf(it.relativePath)
        bloques.push({
          nombre: `${basePath}/${innerMost}`,
          buffer: it.buffer,
          carpeta: clasificarCarpetaNombre(innerMost),
        })
      }
    }
  }

  return bloques
}
