import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - Listar notificaciones del sistema
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const leida = searchParams.get('leida')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: any = {}
    if (leida !== null) {
      where.leida = leida === 'true'
    }

    const notificaciones = await db.notificacionSistema.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const noLeidas = await db.notificacionSistema.count({
      where: { leida: false }
    })

    return NextResponse.json({
      success: true,
      data: notificaciones,
      noLeidas,
    })
  } catch (error) {
    console.error('Error al obtener notificaciones del sistema:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener notificaciones' },
      { status: 500 }
    )
  }
}

// PUT - Marcar como leída
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, todas } = body

    if (todas) {
      await db.notificacionSistema.updateMany({
        where: { leida: false },
        data: { leida: true, fechaLeida: new Date() }
      })

      return NextResponse.json({
        success: true,
        message: 'Todas las notificaciones marcadas como leídas'
      })
    }

    if (id) {
      await db.notificacionSistema.update({
        where: { id },
        data: { leida: true, fechaLeida: new Date() }
      })

      return NextResponse.json({
        success: true,
        message: 'Notificación marcada como leída'
      })
    }

    return NextResponse.json(
      { success: false, error: 'Se requiere id o todas=true' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error al actualizar notificación:', error)
    return NextResponse.json(
      { success: false, error: 'Error al actualizar notificación' },
      { status: 500 }
    )
  }
}
