/**
 * API pública - Detalle de una providencia notificada (contenido completo).
 * Sin autenticación.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { EstadoProvidencia } from '@prisma/client'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const providencia = await db.providencia.findFirst({
      where: { id, estado: EstadoProvidencia.NOTIFICADO },
      include: {
        proceso: {
          select: {
            id: true,
            radicado: true,
            demandante: true,
            demandado: true,
            claseProceso: true,
            juzgado: { select: { nombre: true } },
          },
        },
        proyectadoPor: { select: { nombre: true } },
        revisadoPor: { select: { nombre: true } },
        firmadoPor: { select: { nombre: true } },
      },
    })

    if (!providencia) {
      return NextResponse.json(
        { success: false, error: 'Providencia no encontrada o no publicada' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        ...providencia,
        contenido: providencia.contenido,
      },
    })
  } catch (error) {
    console.error('Error al obtener providencia:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener providencia' },
      { status: 500 }
    )
  }
}
