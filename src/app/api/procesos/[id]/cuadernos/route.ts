import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'

// GET - Listar cuadernos del proceso con sus archivos
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: procesoId } = await params
    const user = await getUserFromHeader(request)
    const jw = juzgadoWhere(user)

    const proceso = await db.proceso.findFirst({
      where: { id: procesoId, ...jw },
      select: { id: true },
    })
    if (!proceso) {
      return NextResponse.json({ success: false, error: 'Proceso no encontrado' }, { status: 404 })
    }

    const cuadernos = await db.cuaderno.findMany({
      where: { procesoId },
      include: {
        archivos: {
          where: { eliminado: false },
          include: { subidoPor: { select: { nombre: true } } },
          orderBy: [{ orden: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { orden: 'asc' },
    })

    // Archivos sin cuaderno (para mostrar en "Sin asignar" o cuaderno por defecto)
    const archivosSinCuaderno = await db.archivoProceso.findMany({
      where: { procesoId, cuadernoId: null, eliminado: false },
      include: { subidoPor: { select: { nombre: true } } },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      success: true,
      data: { cuadernos, archivosSinCuaderno },
    })
  } catch (error) {
    console.error('Error al listar cuadernos:', error)
    return NextResponse.json(
      { success: false, error: 'Error al listar cuadernos' },
      { status: 500 }
    )
  }
}

// POST - Crear cuaderno
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: procesoId } = await params
    const body = await request.json()
    const { nombre } = body

    if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
      return NextResponse.json(
        { success: false, error: 'El nombre del cuaderno es requerido' },
        { status: 400 }
      )
    }

    const user = await getUserFromHeader(request)
    const jw = juzgadoWhere(user)

    const proceso = await db.proceso.findFirst({
      where: { id: procesoId, ...jw },
      select: { id: true },
    })
    if (!proceso) {
      return NextResponse.json({ success: false, error: 'Proceso no encontrado' }, { status: 404 })
    }

    const maxOrden = await db.cuaderno.aggregate({
      where: { procesoId },
      _max: { orden: true },
    })
    const orden = (maxOrden._max.orden ?? -1) + 1

    const cuaderno = await db.cuaderno.create({
      data: {
        procesoId,
        nombre: nombre.trim(),
        orden,
      },
    })

    return NextResponse.json({
      success: true,
      data: cuaderno,
      message: 'Cuaderno creado',
    })
  } catch (error) {
    console.error('Error al crear cuaderno:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear cuaderno' },
      { status: 500 }
    )
  }
}
