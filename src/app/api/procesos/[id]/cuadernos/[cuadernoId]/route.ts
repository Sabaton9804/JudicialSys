import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, procesoJuzgadoWhere } from '@/lib/auth-utils'

// PUT - Actualizar cuaderno
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cuadernoId: string }> }
) {
  try {
    const { id: procesoId, cuadernoId } = await params
    const body = await request.json()
    const { nombre, orden } = body

    const user = await getUserFromHeader(request)
    const pjw = procesoJuzgadoWhere(user)

    const cuaderno = await db.cuaderno.findFirst({
      where: { id: cuadernoId, procesoId, ...pjw } as any,
    })
    if (!cuaderno) {
      return NextResponse.json({ success: false, error: 'Cuaderno no encontrado' }, { status: 404 })
    }

    const data: { nombre?: string; orden?: number } = {}
    if (typeof nombre === 'string' && nombre.trim()) data.nombre = nombre.trim()
    if (typeof orden === 'number') data.orden = orden

    const updated = await db.cuaderno.update({
      where: { id: cuadernoId },
      data,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Cuaderno actualizado',
    })
  } catch (error) {
    console.error('Error al actualizar cuaderno:', error)
    return NextResponse.json(
      { success: false, error: 'Error al actualizar cuaderno' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar cuaderno (los archivos quedan sin cuaderno)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cuadernoId: string }> }
) {
  try {
    const { id: procesoId, cuadernoId } = await params

    const user = await getUserFromHeader(request)
    const pjw = procesoJuzgadoWhere(user)

    const cuaderno = await db.cuaderno.findFirst({
      where: { id: cuadernoId, procesoId, ...pjw } as any,
    })
    if (!cuaderno) {
      return NextResponse.json({ success: false, error: 'Cuaderno no encontrado' }, { status: 404 })
    }

    // Quitar cuadernoId de los archivos
    await db.archivoProceso.updateMany({
      where: { cuadernoId },
      data: { cuadernoId: null },
    })

    await db.cuaderno.delete({
      where: { id: cuadernoId },
    })

    return NextResponse.json({
      success: true,
      message: 'Cuaderno eliminado',
    })
  } catch (error) {
    console.error('Error al eliminar cuaderno:', error)
    return NextResponse.json(
      { success: false, error: 'Error al eliminar cuaderno' },
      { status: 500 }
    )
  }
}
