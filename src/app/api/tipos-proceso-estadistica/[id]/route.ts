import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'

// PUT - Actualizar tipo de proceso
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromHeader(request)
    const { id } = await params
    const body = await request.json()
    const { nombre, codigo, orden, activo, claseProceso } = body

    const existente = await db.tipoProcesoEstadistica.findUnique({ where: { id } })
    if (!existente) {
      return NextResponse.json(
        { success: false, error: 'Tipo no encontrado' },
        { status: 404 }
      )
    }

    const jw = juzgadoWhere(user)
    if (Object.keys(jw).length && jw.juzgadoId !== existente.juzgadoId && user?.rol !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'No tiene permiso para modificar este tipo' },
        { status: 403 }
      )
    }

    const data: Record<string, unknown> = {}
    if (nombre !== undefined) data.nombre = nombre.trim()
    if (codigo !== undefined) data.codigo = codigo?.trim() || null
    if (typeof orden === 'number') data.orden = orden
    if (typeof activo === 'boolean') data.activo = activo
    if (claseProceso !== undefined) data.claseProceso = claseProceso || null

    const tipo = await db.tipoProcesoEstadistica.update({
      where: { id },
      data,
    })

    return NextResponse.json({ success: true, data: tipo })
  } catch (error) {
    console.error('Error actualizando tipo:', error)
    return NextResponse.json(
      { success: false, error: 'Error al actualizar' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar tipo de proceso
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromHeader(request)
    const { id } = await params

    const existente = await db.tipoProcesoEstadistica.findUnique({ where: { id } })
    if (!existente) {
      return NextResponse.json(
        { success: false, error: 'Tipo no encontrado' },
        { status: 404 }
      )
    }

    const jw = juzgadoWhere(user)
    if (Object.keys(jw).length && jw.juzgadoId !== existente.juzgadoId && user?.rol !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'No tiene permiso para eliminar este tipo' },
        { status: 403 }
      )
    }

    await db.tipoProcesoEstadistica.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error eliminando tipo:', error)
    return NextResponse.json(
      { success: false, error: 'Error al eliminar' },
      { status: 500 }
    )
  }
}
