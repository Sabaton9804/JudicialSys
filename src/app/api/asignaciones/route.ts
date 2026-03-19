import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - Listar asignaciones
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const procesoId = searchParams.get('procesoId')
    const usuarioId = searchParams.get('usuarioId')
    const activo = searchParams.get('activo')

    const where: any = {}
    if (procesoId) where.procesoId = procesoId
    if (usuarioId) where.usuarioId = usuarioId
    if (activo !== null) where.activo = activo === 'true'

    const asignaciones = await db.asignacionProceso.findMany({
      where,
      include: {
        proceso: {
          select: {
            id: true,
            radicado: true,
            demandante: true,
            demandado: true,
            claseProceso: true,
            estado: true,
            etapaProcesal: true,
          }
        },
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
            rol: true,
          }
        }
      },
      orderBy: { fechaInicio: 'desc' }
    })

    // Estadísticas por usuario
    const estadisticasUsuarios = await db.usuario.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        rol: true,
        _count: {
          select: {
            asignaciones: { where: { activo: true } }
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: asignaciones,
      estadisticasUsuarios: estadisticasUsuarios.map(u => ({
        ...u,
        procesosActivos: u._count.asignaciones
      }))
    })
  } catch (error) {
    console.error('Error al obtener asignaciones:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener asignaciones' },
      { status: 500 }
    )
  }
}

// POST - Crear asignación
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Si es responsable principal, desactivar asignaciones anteriores
    if (body.rol === 'RESPONSABLE_PRINCIPAL') {
      await db.asignacionProceso.updateMany({
        where: {
          procesoId: body.procesoId,
          rol: 'RESPONSABLE_PRINCIPAL',
          activo: true
        },
        data: { activo: false, fechaFin: new Date() }
      })
    }

    const asignacion = await db.asignacionProceso.create({
      data: {
        procesoId: body.procesoId,
        usuarioId: body.usuarioId,
        rol: body.rol,
        observaciones: body.observaciones,
        asignadoPor: body.asignadoPor,
      },
      include: {
        proceso: {
          select: { radicado: true }
        },
        usuario: {
          select: { nombre: true }
        }
      }
    })

    // Registrar en historial
    await db.historialActuacion.create({
      data: {
        procesoId: body.procesoId,
        usuarioId: body.asignadoPor || null,
        tipo: 'ASIGNACION',
        accion: `Proceso asignado a ${asignacion.usuario?.nombre}`,
        descripcion: `Asignación como ${body.rol}`,
        datos: JSON.stringify(asignacion),
      }
    })

    // Crear notificación
    await db.notificacionSistema.create({
      data: {
        tipo: 'ASIGNACION_PROCESO',
        titulo: 'Nuevo proceso asignado',
        mensaje: `Se te ha asignado el proceso ${asignacion.proceso?.radicado} como ${body.rol}`,
        procesoId: body.procesoId,
        usuarioId: body.usuarioId,
      }
    })

    return NextResponse.json({
      success: true,
      data: asignacion,
      message: 'Asignación creada exitosamente'
    })
  } catch (error) {
    console.error('Error al crear asignación:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear asignación' },
      { status: 500 }
    )
  }
}

// PUT - Actualizar/Finalizar asignación
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updateData } = body

    const asignacion = await db.asignacionProceso.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json({
      success: true,
      data: asignacion,
      message: 'Asignación actualizada'
    })
  } catch (error) {
    console.error('Error al actualizar asignación:', error)
    return NextResponse.json(
      { success: false, error: 'Error al actualizar asignación' },
      { status: 500 }
    )
  }
}
