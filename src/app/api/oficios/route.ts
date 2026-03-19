import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { EstadoOficio, TipoDestinatario } from '@prisma/client'
import { getUserFromHeader, procesoJuzgadoWhere } from '@/lib/auth-utils'

// GET - Listar oficios
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const pjw = procesoJuzgadoWhere(user)

    const { searchParams } = new URL(request.url)
    const estado = searchParams.get('estado') as EstadoOficio | null
    const tipoDestinatario = searchParams.get('tipoDestinatario') as TipoDestinatario | null
    const procesoId = searchParams.get('procesoId')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: any = { ...pjw }

    if (estado) where.estado = estado
    if (tipoDestinatario) where.tipoDestinatario = tipoDestinatario
    if (procesoId) where.procesoId = procesoId

    const oficios = await db.oficio.findMany({
      where,
      include: {
        proceso: {
          select: {
            radicado: true,
            demandante: true,
            demandado: true,
            ubicacionSecretariaId: true,
            ubicacionSecretaria: { select: { nombre: true, codigo: true } },
          }
        },
        providencia: {
          select: { numero: true, asunto: true, tipo: true }
        },
        ubicacion: { select: { nombre: true, codigo: true } },
        responsable: { select: { nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Calcular días transcurridos
    const now = new Date()
    const oficiosConDias = oficios.map(o => {
      const fechaEnvio = o.fechaEnvio ? new Date(o.fechaEnvio) : new Date(o.createdAt)
      const diasTranscurridos = Math.floor(
        (now.getTime() - fechaEnvio.getTime()) / (1000 * 60 * 60 * 24)
      )
      return { ...o, diasTranscurridos }
    })

    // Estadísticas
    const stats = {
      pendientes: await db.oficio.count({ where: { ...pjw, estado: 'PENDIENTE' } }),
      enviados: await db.oficio.count({ where: { ...pjw, estado: 'ENVIADO' } }),
      respondidos: await db.oficio.count({ where: { ...pjw, estado: 'RESPONDIDO' } }),
      sinRespuesta: await db.oficio.count({ where: { ...pjw, estado: 'SIN_RESPUESTA' } }),
    }

    return NextResponse.json({
      success: true,
      data: oficiosConDias,
      stats,
    })
  } catch (error) {
    console.error('Error al obtener oficios:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener oficios' },
      { status: 500 }
    )
  }
}

// POST - Crear oficio
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const oficio = await db.oficio.create({
      data: {
        procesoId: body.procesoId,
        ubicacionId: body.ubicacionId || null,
        responsableId: body.responsableId || null,
        providenciaId: body.providenciaId || null,
        numero: body.numero,
        destinatario: body.destinatario,
        destinatarioId: body.destinatarioId,
        tipoDestinatario: body.tipoDestinatario as TipoDestinatario,
        direccion: body.direccion,
        email: body.email,
        asunto: body.asunto,
        contenido: body.contenido,
        fechaEnvio: body.fechaEnvio ? new Date(body.fechaEnvio) : null,
        estado: body.estado || 'PENDIENTE',
        observaciones: body.observaciones,
      },
      include: {
        proceso: { select: { radicado: true } },
        ubicacion: { select: { nombre: true } },
        responsable: { select: { nombre: true } },
      }
    })

    return NextResponse.json({
      success: true,
      data: oficio,
      message: 'Oficio creado exitosamente'
    })
  } catch (error) {
    console.error('Error al crear oficio:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear oficio' },
      { status: 500 }
    )
  }
}

// PUT - Actualizar oficio
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updateData } = body

    if (updateData.fechaEnvio) {
      updateData.fechaEnvio = new Date(updateData.fechaEnvio)
    }
    if (updateData.fechaRespuesta) {
      updateData.fechaRespuesta = new Date(updateData.fechaRespuesta)
    }

    const oficio = await db.oficio.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: oficio,
      message: 'Oficio actualizado exitosamente'
    })
  } catch (error) {
    console.error('Error al actualizar oficio:', error)
    return NextResponse.json(
      { success: false, error: 'Error al actualizar oficio' },
      { status: 500 }
    )
  }
}
