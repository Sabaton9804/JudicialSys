import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { TipoJuzgado } from '@prisma/client'

// GET - Listar juzgados (para super admin y formularios)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tipoJuzgado = searchParams.get('tipoJuzgado') as TipoJuzgado | null
    const ciudad = searchParams.get('ciudad')
    const limit = parseInt(searchParams.get('limit') || '100')

    const where: Record<string, unknown> = {}
    if (tipoJuzgado) where.tipoJuzgado = tipoJuzgado
    if (ciudad) where.ciudad = { contains: ciudad }

    const juzgados = await db.juzgado.findMany({
      where,
      include: {
        _count: { select: { usuarios: true, procesos: true } }
      },
      orderBy: [{ ciudad: 'asc' }, { nombre: 'asc' }],
      take: limit,
    })

    return NextResponse.json({ success: true, data: juzgados })
  } catch (error) {
    console.error('Error listando juzgados:', error)
    return NextResponse.json(
      { success: false, error: 'Error al listar juzgados' },
      { status: 500 }
    )
  }
}

// POST - Crear juzgado (solo super admin en producción)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nombre, codigo, codigoRadicacion12, tipoJuzgado, ciudad, direccion, telefono, email } = body

    if (!nombre || !codigo || !ciudad) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: nombre, codigo, ciudad' },
        { status: 400 }
      )
    }

    const juzgado = await db.juzgado.create({
      data: {
        nombre,
        codigo,
        codigoRadicacion12: codigoRadicacion12 || null,
        tipoJuzgado: (tipoJuzgado as TipoJuzgado) || 'CIVIL_MUNICIPAL',
        ciudad,
        direccion: direccion || null,
        telefono: telefono || null,
        email: email || null,
      }
    })

    return NextResponse.json({ success: true, data: juzgado })
  } catch (error) {
    console.error('Error creando juzgado:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear juzgado' },
      { status: 500 }
    )
  }
}
