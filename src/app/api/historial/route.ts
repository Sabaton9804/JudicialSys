import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { TipoActuacion } from '@prisma/client'

// GET - Historial de actuaciones
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const procesoId = searchParams.get('procesoId')
    const tipo = searchParams.get('tipo') as TipoActuacion | null
    const usuarioId = searchParams.get('usuarioId')
    const fechaDesde = searchParams.get('fechaDesde')
    const fechaHasta = searchParams.get('fechaHasta')
    const limit = parseInt(searchParams.get('limit') || '100')

    const where: any = {}
    if (procesoId) where.procesoId = procesoId
    if (tipo) where.tipo = tipo
    if (usuarioId) where.usuarioId = usuarioId

    if (fechaDesde || fechaHasta) {
      where.fecha = {}
      if (fechaDesde) where.fecha.gte = new Date(fechaDesde)
      if (fechaHasta) where.fecha.lte = new Date(fechaHasta)
    }

    const historial = await db.historialActuacion.findMany({
      where,
      include: {
        proceso: {
          select: {
            radicado: true,
            demandante: true,
            demandado: true,
          }
        }
      },
      orderBy: { fecha: 'desc' },
      take: limit,
    })

    // Formatear para presentación
    const historialFormateado = historial.map(h => ({
      ...h,
      datos: h.datos ? JSON.parse(h.datos) : null,
      anterior: h.anterior ? JSON.parse(h.anterior) : null,
      nuevo: h.nuevo ? JSON.parse(h.nuevo) : null,
      fechaFormateada: new Date(h.fecha).toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      icono: getIconoTipo(h.tipo),
      color: getColorTipo(h.tipo),
    }))

    // Timeline agrupado por fecha
    const timeline = historialFormateado.reduce((acc: any, h) => {
      const fecha = new Date(h.fecha).toLocaleDateString('es-CO')
      if (!acc[fecha]) {
        acc[fecha] = []
      }
      acc[fecha].push(h)
      return acc
    }, {})

    return NextResponse.json({
      success: true,
      data: historialFormateado,
      timeline,
      total: historial.length,
    })
  } catch (error) {
    console.error('Error al obtener historial:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener historial' },
      { status: 500 }
    )
  }
}

// POST - Registrar actuación
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const actuacion = await db.historialActuacion.create({
      data: {
        procesoId: body.procesoId,
        usuarioId: body.usuarioId,
        tipo: body.tipo as TipoActuacion,
        accion: body.accion,
        descripcion: body.descripcion,
        datos: body.datos ? JSON.stringify(body.datos) : null,
        ipOrigen: body.ipOrigen,
        userAgent: body.userAgent,
        anterior: body.anterior ? JSON.stringify(body.anterior) : null,
        nuevo: body.nuevo ? JSON.stringify(body.nuevo) : null,
      }
    })

    return NextResponse.json({
      success: true,
      data: actuacion,
      message: 'Actuación registrada'
    })
  } catch (error) {
    console.error('Error al registrar actuación:', error)
    return NextResponse.json(
      { success: false, error: 'Error al registrar actuación' },
      { status: 500 }
    )
  }
}

// Helper functions
function getIconoTipo(tipo: TipoActuacion): string {
  const iconos: Record<TipoActuacion, string> = {
    CREACION_PROCESO: 'file-plus',
    ACTUALIZACION_PROCESO: 'edit',
    CAMBIO_ESTADO: 'refresh-cw',
    INGRESO_DESPACHO: 'log-in',
    AUTO_PROFERIDO: 'file-text',
    NOTIFICACION: 'bell',
    OFICIO: 'mail',
    AUDIENCIA: 'calendar',
    TERMINO: 'clock',
    TAREA: 'check-square',
    ASIGNACION: 'user-plus',
    DOCUMENTO: 'file',
    ARCHIVO: 'folder',
    OBSERVACION: 'message-square',
    OTRO: 'more-horizontal',
  }
  return iconos[tipo] || 'circle'
}

function getColorTipo(tipo: TipoActuacion): string {
  const colores: Record<TipoActuacion, string> = {
    CREACION_PROCESO: 'green',
    ACTUALIZACION_PROCESO: 'blue',
    CAMBIO_ESTADO: 'purple',
    INGRESO_DESPACHO: 'amber',
    AUTO_PROFERIDO: 'red',
    NOTIFICACION: 'cyan',
    OFICIO: 'orange',
    AUDIENCIA: 'pink',
    TERMINO: 'yellow',
    TAREA: 'indigo',
    ASIGNACION: 'teal',
    DOCUMENTO: 'gray',
    ARCHIVO: 'slate',
    OBSERVACION: 'violet',
    OTRO: 'neutral',
  }
  return colores[tipo] || 'gray'
}
