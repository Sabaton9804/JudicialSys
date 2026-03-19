import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'

// PUT - Actualizar ubicación
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromHeader(request)
    const { id } = await params
    const body = await request.json()
    const { nombre, codigo, orden, activo } = body

    const existente = await db.ubicacion.findUnique({ where: { id } })
    if (!existente) {
      return NextResponse.json(
        { success: false, error: 'Ubicación no encontrada' },
        { status: 404 }
      )
    }

    const jw = juzgadoWhere(user)
    if (Object.keys(jw).length && jw.juzgadoId !== existente.juzgadoId && user?.rol !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'No tiene permiso para modificar esta ubicación' },
        { status: 403 }
      )
    }

    const data: Record<string, unknown> = {}
    if (nombre !== undefined) data.nombre = nombre.trim()
    if (codigo !== undefined) data.codigo = codigo?.trim() || null
    if (typeof orden === 'number') data.orden = orden
    if (typeof activo === 'boolean') data.activo = activo

    const ubicacion = await db.ubicacion.update({
      where: { id },
      data,
    })

    return NextResponse.json({ success: true, data: ubicacion })
  } catch (error) {
    console.error('Error actualizando ubicación:', error)
    return NextResponse.json(
      { success: false, error: 'Error al actualizar ubicación' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar ubicación
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromHeader(request)
    const { id } = await params

    const existente = await db.ubicacion.findUnique({ where: { id } })
    if (!existente) {
      return NextResponse.json(
        { success: false, error: 'Ubicación no encontrada' },
        { status: 404 }
      )
    }

    const jw = juzgadoWhere(user)
    if (Object.keys(jw).length && jw.juzgadoId !== existente.juzgadoId && user?.rol !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'No tiene permiso para eliminar esta ubicación' },
        { status: 403 }
      )
    }

    await db.ubicacion.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error eliminando ubicación:', error)
    return NextResponse.json(
      { success: false, error: 'Error al eliminar ubicación' },
      { status: 500 }
    )
  }
}
