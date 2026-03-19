import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'

// GET - Listar ubicaciones de un juzgado
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const { searchParams } = new URL(request.url)
    const juzgadoId = searchParams.get('juzgadoId')

    if (!juzgadoId) {
      return NextResponse.json(
        { success: false, error: 'Se requiere juzgadoId' },
        { status: 400 }
      )
    }

    const jw = juzgadoWhere(user)
    if (Object.keys(jw).length && jw.juzgadoId !== juzgadoId && user?.rol !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'No tiene permiso para ver ubicaciones de este juzgado' },
        { status: 403 }
      )
    }

    const ubicaciones = await db.ubicacion.findMany({
      where: { juzgadoId },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    })

    return NextResponse.json({ success: true, data: ubicaciones })
  } catch (error) {
    console.error('Error listando ubicaciones:', error)
    return NextResponse.json(
      { success: false, error: 'Error al listar ubicaciones' },
      { status: 500 }
    )
  }
}

// POST - Crear ubicación
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const body = await request.json()
    const { juzgadoId, nombre, codigo, orden } = body

    if (!juzgadoId || !nombre) {
      return NextResponse.json(
        { success: false, error: 'Se requiere juzgadoId y nombre' },
        { status: 400 }
      )
    }

    const jw = juzgadoWhere(user)
    if (Object.keys(jw).length && jw.juzgadoId !== juzgadoId && user?.rol !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'No tiene permiso para crear ubicaciones en este juzgado' },
        { status: 403 }
      )
    }

    const ubicacion = await db.ubicacion.create({
      data: {
        juzgadoId,
        nombre: nombre.trim(),
        codigo: codigo?.trim() || null,
        orden: typeof orden === 'number' ? orden : 0,
      },
    })

    return NextResponse.json({ success: true, data: ubicacion })
  } catch (error) {
    console.error('Error creando ubicación:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear ubicación. Puede que el nombre ya exista en este juzgado.' },
      { status: 500 }
    )
  }
}
