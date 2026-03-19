import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, procesoJuzgadoWhere } from '@/lib/auth-utils'

/**
 * POST - Ingresar proceso al Despacho (Secretaría asigna a Oficial Mayor)
 * Body: { oficialMayorId, fechaEntradaDespacho?, fechaLimiteDespacho }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await getUserFromHeader(request)
    const pjw = procesoJuzgadoWhere(user)

    const body = await request.json()
    const { oficialMayorId, fechaEntradaDespacho, fechaLimiteDespacho } = body

    if (!oficialMayorId) {
      return NextResponse.json(
        { success: false, error: 'Se requiere oficialMayorId' },
        { status: 400 }
      )
    }
    if (!fechaLimiteDespacho) {
      return NextResponse.json(
        { success: false, error: 'Se requiere fechaLimiteDespacho' },
        { status: 400 }
      )
    }

    const proceso = await db.proceso.findFirst({
      where: { id, ...pjw },
      include: { oficialMayor: { select: { nombre: true } } },
    })

    if (!proceso) {
      return NextResponse.json(
        { success: false, error: 'Proceso no encontrado' },
        { status: 404 }
      )
    }

    const fechaEntrada = fechaEntradaDespacho ? new Date(fechaEntradaDespacho) : new Date()
    const fechaLimite = new Date(fechaLimiteDespacho)

    const actualizado = await db.proceso.update({
      where: { id },
      data: {
        oficialMayorId,
        fechaEntradaDespacho: fechaEntrada,
        fechaLimiteDespacho: fechaLimite,
        updatedAt: new Date(),
      },
      include: {
        oficialMayor: { select: { id: true, nombre: true } },
      },
    })

    await db.historialActuacion.create({
      data: {
        procesoId: id,
        area: 'SECRETARIA',
        tipo: 'INGRESO_DESPACHO',
        accion: 'Proceso ingresado al Despacho',
        descripcion: `Asignado al Oficial Mayor. Entrada: ${fechaEntrada.toLocaleDateString('es-CO')}. Límite: ${fechaLimite.toLocaleDateString('es-CO')}.`,
        datos: JSON.stringify({
          oficialMayorId,
          fechaEntradaDespacho: fechaEntrada.toISOString(),
          fechaLimiteDespacho: fechaLimite.toISOString(),
        }),
      },
    })

    return NextResponse.json({
      success: true,
      data: actualizado,
      message: 'Proceso ingresado al Despacho',
    })
  } catch (error) {
    console.error('Error al ingresar proceso al Despacho:', error)
    return NextResponse.json(
      { success: false, error: 'Error al ingresar proceso' },
      { status: 500 }
    )
  }
}
