import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { TipoDocumento } from '@prisma/client'

// GET - Listar plantillas
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo') as TipoDocumento | null
    const activa = searchParams.get('activa')

    const where: any = {}
    if (tipo) where.tipo = tipo
    if (activa !== null) where.activa = activa === 'true'

    const plantillas = await db.plantilla.findMany({
      where,
      orderBy: { nombre: 'asc' }
    })

    return NextResponse.json({
      success: true,
      data: plantillas
    })
  } catch (error) {
    console.error('Error al obtener plantillas:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener plantillas' },
      { status: 500 }
    )
  }
}

// POST - Crear plantilla
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const plantilla = await db.plantilla.create({
      data: {
        nombre: body.nombre,
        tipo: body.tipo as TipoDocumento,
        contenido: body.contenido,
        descripcion: body.descripcion,
        activa: body.activa ?? true,
      }
    })

    return NextResponse.json({
      success: true,
      data: plantilla,
      message: 'Plantilla creada exitosamente'
    })
  } catch (error) {
    console.error('Error al crear plantilla:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear plantilla' },
      { status: 500 }
    )
  }
}

// PUT - Actualizar plantilla
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updateData } = body

    const plantilla = await db.plantilla.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json({
      success: true,
      data: plantilla,
      message: 'Plantilla actualizada exitosamente'
    })
  } catch (error) {
    console.error('Error al actualizar plantilla:', error)
    return NextResponse.json(
      { success: false, error: 'Error al actualizar plantilla' },
      { status: 500 }
    )
  }
}
