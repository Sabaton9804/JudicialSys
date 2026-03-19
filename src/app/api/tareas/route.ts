import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { EstadoTarea, PrioridadTarea, TipoTarea, AreaJuzgado } from '@prisma/client'
import { getUserFromHeader, procesoJuzgadoWhere } from '@/lib/auth-utils'

// GET - Listar tareas
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const pjw = procesoJuzgadoWhere(user)

    const { searchParams } = new URL(request.url)
    const estado = searchParams.get('estado') as EstadoTarea | null
    const prioridad = searchParams.get('prioridad') as PrioridadTarea | null
    const tipo = searchParams.get('tipo') as TipoTarea | null
    const area = searchParams.get('area') as AreaJuzgado | null
    const procesoId = searchParams.get('procesoId')
    const responsableId = searchParams.get('responsableId')
    const vencidas = searchParams.get('vencidas') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: any = { ...pjw }

    if (estado) where.estado = estado
    if (prioridad) where.prioridad = prioridad
    if (tipo) where.tipo = tipo
    if (area) where.area = area
    if (procesoId) where.procesoId = procesoId
    if (responsableId) where.responsableId = responsableId

    // Filtrar tareas vencidas
    if (vencidas) {
      where.fechaLimite = { lt: new Date() }
      where.estado = { not: 'COMPLETADA' }
    }

    const tareas = await db.tarea.findMany({
      where,
      include: {
        proceso: {
          select: {
            radicado: true,
            demandante: true,
            demandado: true,
            claseProceso: true,
          }
        },
        responsable: {
          select: { id: true, nombre: true, email: true }
        },
        creadoPor: {
          select: { id: true, nombre: true }
        }
      },
      orderBy: [
        { prioridad: 'desc' },
        { fechaLimite: 'asc' }
      ],
      take: limit,
    })

    // Calcular días restantes y estado calculado
    const now = new Date()
    const tareasConEstado = tareas.map(t => {
      let diasRestantes = null
      let estadoCalculado = t.estado

      if (t.fechaLimite) {
        diasRestantes = Math.ceil(
          (new Date(t.fechaLimite).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )
        
        if (diasRestantes < 0 && t.estado !== 'COMPLETADA' && t.estado !== 'CANCELADA') {
          estadoCalculado = 'VENCIDA'
        }
      }

      return {
        ...t,
        diasRestantes,
        estadoCalculado,
      }
    })

    // Estadísticas
    const stats = {
      pendientes: await db.tarea.count({ where: { ...pjw, estado: 'PENDIENTE' } }),
      enProgreso: await db.tarea.count({ where: { ...pjw, estado: 'EN_PROGRESO' } }),
      completadas: await db.tarea.count({ where: { ...pjw, estado: 'COMPLETADA' } }),
      vencidas: await db.tarea.count({
        where: {
          ...pjw,
          fechaLimite: { lt: now },
          estado: { notIn: ['COMPLETADA', 'CANCELADA'] }
        }
      }),
      urgentes: await db.tarea.count({ where: { ...pjw, prioridad: 'URGENTE', estado: { not: 'COMPLETADA' } } }),
    }

    return NextResponse.json({
      success: true,
      data: tareasConEstado,
      stats,
    })
  } catch (error) {
    console.error('Error al obtener tareas:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener tareas' },
      { status: 500 }
    )
  }
}

// POST - Crear tarea
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const tarea = await db.tarea.create({
      data: {
        procesoId: body.procesoId,
        titulo: body.titulo,
        descripcion: body.descripcion,
        tipo: body.tipo as TipoTarea,
        prioridad: body.prioridad as PrioridadTarea || 'MEDIA',
        area: body.area as AreaJuzgado || 'SECRETARIA',
        responsableId: body.responsableId,
        creadoPorId: body.creadoPorId || 'default-user',
        fechaLimite: body.fechaLimite ? new Date(body.fechaLimite) : null,
        fechaRecordatorio: body.fechaRecordatorio ? new Date(body.fechaRecordatorio) : null,
        observaciones: body.observaciones,
        datos: body.datos ? JSON.stringify(body.datos) : null,
      },
      include: {
        proceso: {
          select: { radicado: true }
        },
        responsable: {
          select: { nombre: true }
        }
      }
    })

    // Crear historial
    await db.historialTarea.create({
      data: {
        tareaId: tarea.id,
        usuarioId: body.creadoPorId || 'default-user',
        accion: 'CREACION',
        descripcion: 'Tarea creada',
        datosNuevos: JSON.stringify(tarea),
      }
    })

    // Crear notificación del sistema
    await db.notificacionSistema.create({
      data: {
        tipo: 'NUEVA_TAREA',
        titulo: 'Nueva tarea asignada',
        mensaje: `Se te ha asignado la tarea "${tarea.titulo}" del proceso ${tarea.proceso?.radicado}`,
        procesoId: body.procesoId,
        usuarioId: body.responsableId,
      }
    })

    return NextResponse.json({
      success: true,
      data: tarea,
      message: 'Tarea creada exitosamente'
    })
  } catch (error) {
    console.error('Error al crear tarea:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear tarea' },
      { status: 500 }
    )
  }
}

// PUT - Actualizar tarea
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updateData } = body

    // Obtener tarea anterior para historial
    const tareaAnterior = await db.tarea.findUnique({
      where: { id }
    })

    if (!tareaAnterior) {
      return NextResponse.json(
        { success: false, error: 'Tarea no encontrada' },
        { status: 404 }
      )
    }

    // Preparar datos de actualización
    const dataToUpdate: any = { ...updateData }
    if (updateData.fechaLimite) {
      dataToUpdate.fechaLimite = new Date(updateData.fechaLimite)
    }
    if (updateData.fechaRecordatorio) {
      dataToUpdate.fechaRecordatorio = new Date(updateData.fechaRecordatorio)
    }
    if (updateData.fechaCompletado) {
      dataToUpdate.fechaCompletado = new Date(updateData.fechaCompletado)
    }

    const tarea = await db.tarea.update({
      where: { id },
      data: dataToUpdate,
      include: {
        proceso: {
          select: { radicado: true }
        }
      }
    })

    // Crear historial
    await db.historialTarea.create({
      data: {
        tareaId: id,
        usuarioId: body.usuarioId || 'default-user',
        accion: updateData.estado || 'ACTUALIZACION',
        descripcion: body.comentario || `Estado actualizado a ${updateData.estado || tarea.estado}`,
        datosAnteriores: JSON.stringify(tareaAnterior),
        datosNuevos: JSON.stringify(tarea),
      }
    })

    return NextResponse.json({
      success: true,
      data: tarea,
      message: 'Tarea actualizada exitosamente'
    })
  } catch (error) {
    console.error('Error al actualizar tarea:', error)
    return NextResponse.json(
      { success: false, error: 'Error al actualizar tarea' },
      { status: 500 }
    )
  }
}
