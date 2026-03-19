import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, procesoJuzgadoWhere } from '@/lib/auth-utils'

// GET - Listar términos
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const pjw = procesoJuzgadoWhere(user)

    const { searchParams } = new URL(request.url)
    const estado = searchParams.get('estado') // vigente, por_vencer, vencido
    const procesoId = searchParams.get('procesoId')
    const diasLimite = parseInt(searchParams.get('diasLimite') || '3')

    const now = new Date()
    const fechaLimite = new Date(now.getTime() + diasLimite * 24 * 60 * 60 * 1000)

    const where: any = { ...pjw, completado: false }

    if (procesoId) {
      where.procesoId = procesoId
    }

    // Filtro por estado
    if (estado === 'vencido') {
      where.fechaVencimiento = { lt: now }
    } else if (estado === 'por_vencer') {
      where.fechaVencimiento = {
        gte: now,
        lte: fechaLimite
      }
    } else if (estado === 'vigente') {
      where.fechaVencimiento = { gt: fechaLimite }
    }

    const terminos = await db.termino.findMany({
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
        ubicacion: { select: { nombre: true, codigo: true } },
        responsable: { select: { nombre: true } },
      },
      orderBy: { fechaVencimiento: 'asc' }
    })

    // Agregar campo calculado de estado
    const terminosConEstado = terminos.map(t => {
      const diasRestantes = Math.ceil(
        (t.fechaVencimiento.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
      
      let estadoCalculado = 'vigente'
      if (diasRestantes < 0) estadoCalculado = 'vencido'
      else if (diasRestantes <= diasLimite) estadoCalculado = 'por_vencer'

      return {
        ...t,
        diasRestantes,
        estadoCalculado,
      }
    })

    // Estadísticas
    const stats = {
      vigentes: terminosConEstado.filter(t => t.estadoCalculado === 'vigente').length,
      porVencer: terminosConEstado.filter(t => t.estadoCalculado === 'por_vencer').length,
      vencidos: terminosConEstado.filter(t => t.estadoCalculado === 'vencido').length,
      total: terminosConEstado.length,
    }

    return NextResponse.json({
      success: true,
      data: terminosConEstado,
      stats,
    })
  } catch (error) {
    console.error('Error al obtener términos:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener términos' },
      { status: 500 }
    )
  }
}

// POST - Crear término
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const termino = await db.termino.create({
      data: {
        procesoId: body.procesoId,
        ubicacionId: body.ubicacionId || null,
        responsableId: body.responsableId || null,
        tipo: body.tipo,
        descripcion: body.descripcion,
        fechaInicio: new Date(body.fechaInicio),
        fechaVencimiento: new Date(body.fechaVencimiento),
        diasTermino: body.diasTermino,
        diasHabiles: body.diasHabiles ?? true,
      },
      include: {
        proceso: { select: { radicado: true } },
        ubicacion: { select: { nombre: true } },
        responsable: { select: { nombre: true } },
      }
    })

    // Calcular días restantes
    const diasRestantes = Math.ceil(
      (termino.fechaVencimiento.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )

    // Crear alerta si está por vencer
    if (diasRestantes <= 3 && diasRestantes > 0) {
      await db.notificacionSistema.create({
        data: {
          tipo: 'TERMINO_POR_VENCER',
          titulo: 'Término por vencer',
          mensaje: `El término "${termino.tipo}" del proceso ${termino.proceso?.radicado} vence en ${diasRestantes} días`,
          procesoId: termino.procesoId,
        }
      })
    } else if (diasRestantes <= 0) {
      await db.notificacionSistema.create({
        data: {
          tipo: 'TERMINO_VENCIDO',
          titulo: 'Término vencido',
          mensaje: `El término "${termino.tipo}" del proceso ${termino.proceso?.radicado} ha vencido`,
          procesoId: termino.procesoId,
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: termino,
      message: 'Término creado exitosamente'
    })
  } catch (error) {
    console.error('Error al crear término:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear término' },
      { status: 500 }
    )
  }
}
