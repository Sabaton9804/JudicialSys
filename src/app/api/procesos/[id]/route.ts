import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'

// Include base para proceso (sin cuadernos - por si el schema no está actualizado)
const includeBase = {
  oficialMayor: { select: { id: true, nombre: true, rol: true } },
  secretario: { select: { id: true, nombre: true } },
  memoriales: { orderBy: { fechaPresentacion: 'desc' } },
  providencias: {
    include: {
      proyectadoPor: { select: { nombre: true } },
      firmadoPor: { select: { nombre: true } }
    },
    orderBy: { fecha: 'desc' }
  },
  terminos: { orderBy: { fechaVencimiento: 'asc' } },
  notificaciones: { orderBy: { createdAt: 'desc' } },
  oficios: {
    include: { providencia: { select: { numero: true, asunto: true } } },
    orderBy: { createdAt: 'desc' }
  },
  audiencias: { orderBy: { fecha: 'asc' } },
  tareas: {
    include: { responsable: { select: { nombre: true } } },
    orderBy: { createdAt: 'desc' }
  },
  documentos: { orderBy: { createdAt: 'desc' } },
  archivos: {
    where: { eliminado: false },
    include: { subidoPor: { select: { nombre: true } } },
    orderBy: { createdAt: 'desc' }
  },
  historial: {
    orderBy: { fecha: 'desc' },
    take: 100,
  },
}

// GET - Obtener un proceso por ID (vista completa como unidad)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await getUserFromHeader(request)
    const jw = juzgadoWhere(user)

    // Intentar con cuadernos primero; si falla (ej. Prisma no actualizado), usar include base
    let proceso: Awaited<ReturnType<typeof db.proceso.findFirst>>
    try {
      proceso = await db.proceso.findFirst({
        where: { id, ...jw } as any,
        include: {
          ...includeBase,
          archivos: {
            where: { eliminado: false },
            include: { subidoPor: { select: { nombre: true } }, cuaderno: { select: { id: true, nombre: true } } },
            orderBy: { createdAt: 'desc' }
          },
          cuadernos: {
            include: {
              archivos: {
                where: { eliminado: false },
                include: { subidoPor: { select: { nombre: true } } },
                orderBy: [{ orden: 'asc' }, { createdAt: 'asc' }],
              },
            },
            orderBy: { orden: 'asc' },
          },
        },
      })
    } catch (includeError) {
      console.warn('Query con cuadernos falló, usando include base:', includeError)
      proceso = await db.proceso.findFirst({
        where: { id, ...jw } as any,
        include: includeBase,
      })
    }

    if (!proceso) {
      return NextResponse.json(
        { success: false, error: 'Proceso no encontrado' },
        { status: 404 }
      )
    }

    // Asegurar que cuadernos exista para la UI
    if (!(proceso as any).cuadernos) {
      (proceso as any).cuadernos = []
    }

    return NextResponse.json({
      success: true,
      data: proceso
    })
  } catch (error) {
    console.error('Error al obtener proceso:', error)
    const msg = error instanceof Error ? error.message : 'Error al obtener proceso'
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    )
  }
}

// PUT - Actualizar proceso
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const proceso = await db.proceso.update({
      where: { id },
      data: {
        ...body,
        updatedAt: new Date(),
      }
    })

    return NextResponse.json({
      success: true,
      data: proceso,
      message: 'Proceso actualizado exitosamente'
    })
  } catch (error) {
    console.error('Error al actualizar proceso:', error)
    return NextResponse.json(
      { success: false, error: 'Error al actualizar proceso' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar proceso
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    await db.proceso.delete({
      where: { id }
    })

    return NextResponse.json({
      success: true,
      message: 'Proceso eliminado exitosamente'
    })
  } catch (error) {
    console.error('Error al eliminar proceso:', error)
    return NextResponse.json(
      { success: false, error: 'Error al eliminar proceso' },
      { status: 500 }
    )
  }
}
