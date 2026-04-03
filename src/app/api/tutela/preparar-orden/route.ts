import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { expandirEmlParaOrden } from '@/lib/eml-expand'
import {
  advertenciasOrden,
  ETIQUETA_ROL_TUTELA,
  ordenarDocumentosTutela,
  type ItemOrdenadoTutela,
} from '@/lib/tutela-orden-documentos'
import { esAdjuntoOutlookEmbeddedIgnorable } from '@/lib/proceso-import-shared'

export const runtime = 'nodejs'

function origenDesdeNombre(nombre: string): PrepararOrdenItem['origen'] {
  const slash = nombre.indexOf('/')
  if (slash < 0) return 'directo'
  const head = nombre.slice(0, slash)
  if (head.toLowerCase().endsWith('.eml')) return 'eml'
  return 'zip'
}

export type PrepararOrdenItem = ItemOrdenadoTutela & {
  etiqueta: string
  tamanoBytes?: number
  origen: 'zip' | 'directo' | 'eml'
}

/**
 * Recibe uno o más archivos (PDF, **.eml exportado desde Outlook**, ZIP de tutela en línea).
 * Si sube un **.eml** del correo de reparto, se expande: cuerdo del mensaje como `CORREO_REPARTO_*.html` + adjuntos (y ZIP internos).
 * Devuelve el orden sugerido para SGDE.
 *
 * **Outlook:** mensaje → Archivo → Guardar como → formato *.eml (o arrastre a carpeta). Luego suba ese archivo aquí.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const nombres: string[] = []
    const tamanos = new Map<string, number>()

    for (const [, value] of formData.entries()) {
      if (!(value instanceof File) || value.size === 0) continue
      const file = value
      const ext = file.name.split('.').pop()?.toLowerCase()

      if (ext === 'eml') {
        const buf = Buffer.from(await file.arrayBuffer())
        const expandidos = await expandirEmlParaOrden(buf, file.name)
        for (const e of expandidos) {
          nombres.push(e.nombre)
          tamanos.set(e.nombre, e.tamano)
        }
      } else if (ext === 'zip') {
        const zip = await JSZip.loadAsync(await file.arrayBuffer())
        const prefijoZip = file.name.replace(/\.zip$/i, '')
        for (const [pathRel, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue
          const inner = pathRel.split('/').pop() || pathRel
          if (inner.startsWith('._') || inner === '.DS_Store') continue
          if (esAdjuntoOutlookEmbeddedIgnorable(inner)) continue
          const nombreLogico = `${prefijoZip}/${inner}`
          nombres.push(nombreLogico)
          const buf = Buffer.from(await entry.async('arraybuffer'))
          tamanos.set(nombreLogico, buf.length)
        }
      } else {
        nombres.push(file.name)
        tamanos.set(file.name, file.size)
      }
    }

    if (nombres.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Adjunte al menos un archivo (ZIP de tutela, PDFs, .eml desde Outlook).' },
        { status: 400 }
      )
    }

    const ordenBase = ordenarDocumentosTutela(nombres)
    const orden: PrepararOrdenItem[] = ordenBase.map((row) => ({
      ...row,
      etiqueta: ETIQUETA_ROL_TUTELA[row.rol],
      tamanoBytes: tamanos.get(row.nombre),
      origen: origenDesdeNombre(row.nombre),
    }))

    return NextResponse.json({
      success: true,
      orden,
      advertencias: advertenciasOrden(ordenBase),
      descripcionOrden:
        'Secuencia: 1 Constancia del correo (PDF) · 2 Acta de reparto (SEC…) · 3 Demanda · 4 Pruebas y anexos (PRUEBA_) · 5 Poder si aplica · 6 Informe. Suba el .eml de Outlook y el ZIP de tutela en línea en el mismo envío.',
      instruccionesOutlook:
        'En Outlook: abra el correo de reparto → Archivo → Guardar como → elija formato .eml (mensaje de Internet). Ese archivo puede subirse solo o junto al ZIP descargado del trámite en línea.',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al preparar orden'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
