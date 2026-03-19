import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { EstadoNotificacion, TipoNotificacion, MedioNotificacion } from '@prisma/client'
import { getUserFromHeader, procesoJuzgadoWhere } from '@/lib/auth-utils'

async function puedeAccederProceso(
  user: { juzgadoId: string | null; rol: string } | null,
  procesoId: string
): Promise<boolean> {
  const proceso = await db.proceso.findUnique({
    where: { id: procesoId },
    select: { juzgadoId: true },
  })
  if (!proceso) return false
  if (!user || user.rol === 'SUPER_ADMIN') return true
  if (!user.juzgadoId) return false
  return proceso.juzgadoId === user.juzgadoId
}

// GET - Listar notificaciones (emplazamientos y demás), filtradas por juzgado del usuario
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const pjw = procesoJuzgadoWhere(user)

    const { searchParams } = new URL(request.url)
    const estado = searchParams.get('estado') as EstadoNotificacion | null
    const tipo = searchParams.get('tipo') as TipoNotificacion | null
    const procesoId = searchParams.get('procesoId')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = { ...pjw }

    if (estado) where.estado = estado
    if (tipo) where.tipo = tipo
    if (procesoId) where.procesoId = procesoId

    const notificaciones = await db.notificacion.findMany({
      where,
      include: {
        proceso: {
          select: {
            radicado: true,
            demandante: true,
            demandado: true,
          },
        },
        logs: {
          take: 5,
          orderBy: { fecha: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const stats = {
      pendientes: await db.notificacion.count({ where: { ...pjw, estado: 'PENDIENTE' } }),
      enProceso: await db.notificacion.count({ where: { ...pjw, estado: 'EN_PROCESO' } }),
      enviadas: await db.notificacion.count({ where: { ...pjw, estado: 'ENVIADA' } }),
      entregadas: await db.notificacion.count({ where: { ...pjw, estado: 'ENTREGADA' } }),
      fallidas: await db.notificacion.count({ where: { ...pjw, estado: 'FALLIDA' } }),
    }

    return NextResponse.json({
      success: true,
      data: notificaciones,
      stats,
    })
  } catch (error) {
    console.error('Error al obtener notificaciones:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener notificaciones' },
      { status: 500 }
    )
  }
}

// POST - Crear notificación (p. ej. emplazamiento / notificación personal)
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const body = await request.json()

    if (!body.procesoId) {
      return NextResponse.json({ success: false, error: 'procesoId requerido' }, { status: 400 })
    }

    const ok = await puedeAccederProceso(user, body.procesoId)
    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Proceso no encontrado o no autorizado' },
        { status: 403 }
      )
    }

    const notificacion = await db.notificacion.create({
      data: {
        procesoId: body.procesoId,
        tipo: body.tipo as TipoNotificacion,
        destinatario: body.destinatario,
        destinatarioId: body.destinatarioId ?? null,
        direccion: body.direccion ?? null,
        email: body.email ?? null,
        autoNotificar: body.autoNotificar,
        fechaAuto: body.fechaAuto ? new Date(body.fechaAuto) : null,
        medio: (body.medio as MedioNotificacion) || 'FISICO',
        estado: 'PENDIENTE',
        observaciones: body.observaciones ?? null,
      },
      include: {
        proceso: {
          select: { radicado: true },
        },
      },
    })

    await db.notificacionLog.create({
      data: {
        notificacionId: notificacion.id,
        usuarioId: user?.id ?? null,
        accion: 'CREACION',
        descripcion: 'Notificación creada',
      },
    })

    return NextResponse.json({
      success: true,
      data: notificacion,
      message: 'Notificación creada exitosamente',
    })
  } catch (error) {
    console.error('Error al crear notificación:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear notificación' },
      { status: 500 }
    )
  }
}

// PUT - Actualizar estado u observaciones
export async function PUT(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const pjw = procesoJuzgadoWhere(user)
    const body = await request.json()
    const { id, estado, observaciones } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'id requerido' }, { status: 400 })
    }

    const existente = await db.notificacion.findFirst({
      where: { id, ...pjw },
    })
    if (!existente) {
      return NextResponse.json(
        { success: false, error: 'Notificación no encontrada' },
        { status: 404 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (estado) {
      updateData.estado = estado as EstadoNotificacion
      if (estado === 'ENVIADA') updateData.fechaEnvio = new Date()
      if (estado === 'ENTREGADA') updateData.fechaEntrega = new Date()
    }
    if (observaciones !== undefined) updateData.observaciones = observaciones

    const notificacion = await db.notificacion.update({
      where: { id },
      data: updateData,
    })

    await db.notificacionLog.create({
      data: {
        notificacionId: id,
        usuarioId: user?.id ?? null,
        accion: String(estado || 'ACTUALIZACION'),
        descripcion: observaciones || (estado ? `Estado: ${estado}` : 'Actualización'),
      },
    })

    return NextResponse.json({
      success: true,
      data: notificacion,
      message: 'Notificación actualizada',
    })
  } catch (error) {
    console.error('Error al actualizar notificación:', error)
    return NextResponse.json(
      { success: false, error: 'Error al actualizar notificación' },
      { status: 500 }
    )
  }
}
