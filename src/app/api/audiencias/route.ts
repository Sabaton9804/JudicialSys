import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { EstadoAudiencia, TipoAudiencia } from '@prisma/client'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'

// GET - Listar audiencias
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const jw = juzgadoWhere(user)

    const { searchParams } = new URL(request.url)
    const estado = searchParams.get('estado') as EstadoAudiencia | null
    const tipo = searchParams.get('tipo') as TipoAudiencia | null
    const procesoId = searchParams.get('procesoId')
    const fechaDesde = searchParams.get('fechaDesde')
    const fechaHasta = searchParams.get('fechaHasta')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: any = { ...jw }

    if (estado) where.estado = estado
    if (tipo) where.tipo = tipo
    if (procesoId) where.procesoId = procesoId
    
    if (fechaDesde || fechaHasta) {
      where.fecha = {}
      if (fechaDesde) where.fecha.gte = new Date(fechaDesde)
      if (fechaHasta) where.fecha.lte = new Date(fechaHasta)
    }

    const audiencias = await db.audiencia.findMany({
      where,
      include: {
        proceso: {
          select: {
            radicado: true,
            demandante: true,
            demandado: true,
            claseProceso: true,
          }
        }
      },
      orderBy: { fecha: 'asc' },
      take: limit,
    })

    // Estadísticas
    const now = new Date()
    const hoyInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const hoyFin = new Date(hoyInicio.getTime() + 24 * 60 * 60 * 1000)
    const semanaFin = new Date(hoyInicio.getTime() + 7 * 24 * 60 * 60 * 1000)

    const stats = {
      programadas: await db.audiencia.count({ where: { ...jw, estado: 'PROGRAMADA' } }),
      realizadas: await db.audiencia.count({ where: { ...jw, estado: 'REALIZADA' } }),
      suspendidas: await db.audiencia.count({ where: { ...jw, estado: 'SUSPENDIDA' } }),
      hoy: await db.audiencia.count({ 
        where: { ...jw, estado: 'PROGRAMADA', fecha: { gte: hoyInicio, lt: hoyFin } } 
      }),
      semana: await db.audiencia.count({ 
        where: { ...jw, estado: 'PROGRAMADA', fecha: { gte: hoyInicio, lt: semanaFin } } 
      }),
    }

    return NextResponse.json({
      success: true,
      data: audiencias,
      stats,
    })
  } catch (error) {
    console.error('Error al obtener audiencias:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener audiencias' },
      { status: 500 }
    )
  }
}

// POST - Crear audiencia
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const audiencia = await db.audiencia.create({
      data: {
        procesoId: body.procesoId,
        juzgadoId: body.juzgadoId || 'default-juzgado',
        tipo: body.tipo as TipoAudiencia,
        fecha: new Date(body.fecha),
        duracion: body.duracion || 60,
        sala: body.sala,
        enlaceVirtual: body.enlaceVirtual,
        juez: body.juez,
        secretario: body.secretario,
        estado: body.estado || 'PROGRAMADA',
        observaciones: body.observaciones,
      },
      include: {
        proceso: {
          select: { radicado: true }
        }
      }
    })

    // Crear notificación del sistema
    await db.notificacionSistema.create({
      data: {
        tipo: 'NUEVA_AUDIENCIA',
        titulo: 'Nueva audiencia programada',
        mensaje: `Audiencia de ${audiencia.tipo} programada para el proceso ${audiencia.proceso?.radicado}`,
        procesoId: audiencia.procesoId,
      }
    })

    return NextResponse.json({
      success: true,
      data: audiencia,
      message: 'Audiencia creada exitosamente'
    })
  } catch (error) {
    console.error('Error al crear audiencia:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear audiencia' },
      { status: 500 }
    )
  }
}

// PUT - Actualizar audiencia
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updateData } = body

    if (updateData.fecha) {
      updateData.fecha = new Date(updateData.fecha)
    }
    if (updateData.fechaFin) {
      updateData.fechaFin = new Date(updateData.fechaFin)
    }

    const audiencia = await db.audiencia.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: audiencia,
      message: 'Audiencia actualizada exitosamente'
    })
  } catch (error) {
    console.error('Error al actualizar audiencia:', error)
    return NextResponse.json(
      { success: false, error: 'Error al actualizar audiencia' },
      { status: 500 }
    )
  }
}
