import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { TipoDocumento } from '@prisma/client'

// GET - Listar documentos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const procesoId = searchParams.get('procesoId')
    const tipo = searchParams.get('tipo') as TipoDocumento | null
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: any = {}
    if (procesoId) where.procesoId = procesoId
    if (tipo) where.tipo = tipo

    const documentos = await db.documento.findMany({
      where,
      include: {
        proceso: {
          select: { radicado: true }
        },
        plantilla: {
          select: { nombre: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({
      success: true,
      data: documentos
    })
  } catch (error) {
    console.error('Error al obtener documentos:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener documentos' },
      { status: 500 }
    )
  }
}
