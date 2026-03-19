import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getFile } from '@/lib/storage'
import path from 'path'

/** GET - Ver/descargar archivo del expediente (bucket o disco local) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const archivo = await db.archivoProceso.findUnique({
      where: { id, eliminado: false },
      include: { proceso: { select: { radicado: true } } }
    })
    if (!archivo) {
      return NextResponse.json({ success: false, error: 'Archivo no encontrado' }, { status: 404 })
    }

    const localPath = archivo.bucketKey
      ? null
      : path.join(process.cwd(), 'uploads', archivo.proceso.radicado, archivo.carpeta, archivo.nombreArchivo)

    const { buffer, contentType: storedContentType } = await getFile(archivo.bucketKey, localPath)
    const contentType = storedContentType || archivo.tipoMime || 'application/octet-stream'
    const disposition = request.nextUrl.searchParams.get('dl') ? 'attachment' : 'inline'
    const filename = archivo.nombreOriginal || archivo.nombreArchivo

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(filename)}"`,
      },
    })
  } catch (error) {
    console.error('Error sirviendo archivo:', error)
    return NextResponse.json({ success: false, error: 'Error al obtener archivo' }, { status: 500 })
  }
}

/** PATCH - Mover archivo a cuaderno o actualizar orden */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { cuadernoId, orden } = body

    const archivo = await db.archivoProceso.findUnique({
      where: { id, eliminado: false },
      include: { proceso: { select: { id: true } } },
    })
    if (!archivo) {
      return NextResponse.json({ success: false, error: 'Archivo no encontrado' }, { status: 404 })
    }

    const data: { cuadernoId?: string | null; orden?: number } = {}
    if (cuadernoId !== undefined) data.cuadernoId = cuadernoId || null
    if (typeof orden === 'number') data.orden = orden

    const updated = await db.archivoProceso.update({
      where: { id },
      data,
      include: { subidoPor: { select: { nombre: true } }, cuaderno: { select: { id: true, nombre: true } } },
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Archivo actualizado',
    })
  } catch (error) {
    console.error('Error al actualizar archivo:', error)
    return NextResponse.json(
      { success: false, error: 'Error al actualizar archivo' },
      { status: 500 }
    )
  }
}
