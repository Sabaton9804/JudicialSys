import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, procesoJuzgadoWhere } from '@/lib/auth-utils'

/**
 * GET - Planner del Oficial Mayor: procesos asignados con fecha entrada y límite
 * Filtra por oficialMayorId = usuario actual (si es OFICIAL_MAYOR)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const pjw = procesoJuzgadoWhere(user)

    // Si es Oficial Mayor, filtrar solo sus procesos asignados
    const where: any = { ...pjw, oficialMayorId: { not: null } }
    if (user?.rol === 'OFICIAL_MAYOR' && user?.id) {
      where.oficialMayorId = user.id
    }

    const procesos = await db.proceso.findMany({
      where,
      include: {
        oficialMayor: { select: { id: true, nombre: true } },
        providencias: {
          where: { estado: { in: ['PROYECTADO', 'PENDIENTE_FIRMA', 'EN_REVISION', 'CORRECCION'] } },
          orderBy: { fecha: 'desc' },
          take: 1,
        },
      },
      orderBy: [
        { fechaLimiteDespacho: 'asc' },
        { fechaEntradaDespacho: 'desc' },
      ],
    })

    const now = new Date()
    const conDias = procesos.map((p) => {
      const limite = p.fechaLimiteDespacho
      const diasRestantes = limite
        ? Math.ceil((limite.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null
      const tieneProvidenciaPendiente = p.providencias?.some(
        (pv) => ['PROYECTADO', 'PENDIENTE_FIRMA', 'EN_REVISION', 'CORRECCION'].includes(pv.estado)
      )
      const necesitaProyeccion = !tieneProvidenciaPendiente || p.providencias?.length === 0
      return {
        ...p,
        diasRestantes,
        estadoPlanner: necesitaProyeccion ? 'PENDIENTE_PROYECCION' : 'EN_TRAMITE',
      }
    })

    return NextResponse.json({
      success: true,
      data: conDias,
      stats: {
        pendientes: conDias.filter((p) => p.estadoPlanner === 'PENDIENTE_PROYECCION').length,
        porVencer: conDias.filter((p) => (p.diasRestantes ?? 999) <= 3 && (p.diasRestantes ?? 999) >= 0).length,
        vencidos: conDias.filter((p) => (p.diasRestantes ?? 999) < 0).length,
      },
    })
  } catch (error) {
    console.error('Error al obtener planner:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener planner' },
      { status: 500 }
    )
  }
}
