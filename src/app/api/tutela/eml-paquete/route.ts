import { NextRequest, NextResponse } from 'next/server'
import { construirZipPaqueteDesdeEml } from '@/lib/eml-paquete-zip'

export const runtime = 'nodejs'

const MAX_BYTES = 45 * 1024 * 1024

/**
 * Un solo archivo .eml → ZIP con: PDF del correo (constancia), índice de secuencia,
 * y archivos renumerados por rol (demanda, anexos/pruebas, acta, etc.).
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file || file.size === 0) {
      return NextResponse.json({ success: false, error: 'Suba un archivo .eml' }, { status: 400 })
    }
    if (!file.name.toLowerCase().endsWith('.eml')) {
      return NextResponse.json(
        { success: false, error: 'El archivo debe ser .eml (mensaje guardado desde Outlook)' },
        { status: 400 }
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `El .eml supera el máximo permitido (${MAX_BYTES / 1024 / 1024} MB)` },
        { status: 400 }
      )
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const { zipBuffer, nombreZipSugerido } = await construirZipPaqueteDesdeEml(buf, file.name)

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${nombreZipSugerido}"`,
        'Content-Length': String(zipBuffer.length),
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al generar paquete'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
