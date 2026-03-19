import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'

// GET - Listar tipos de proceso para estadística (por juzgado)
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const { searchParams } = new URL(request.url)
    const juzgadoId = searchParams.get('juzgadoId')
    const categoriaProceso = searchParams.get('categoriaProceso') as 'CIVIL' | 'CONSTITUCIONAL' | null

    if (!juzgadoId) {
      return NextResponse.json(
        { success: false, error: 'Se requiere juzgadoId' },
        { status: 400 }
      )
    }

    const jw = juzgadoWhere(user)
    if (Object.keys(jw).length && jw.juzgadoId !== juzgadoId && user?.rol !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'No tiene permiso para ver tipos de este juzgado' },
        { status: 403 }
      )
    }

    const where: { juzgadoId: string; categoriaProceso?: string } = { juzgadoId }
    if (categoriaProceso === 'CIVIL' || categoriaProceso === 'CONSTITUCIONAL') {
      where.categoriaProceso = categoriaProceso
    }

    const tipos = await db.tipoProcesoEstadistica.findMany({
      where,
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    })

    return NextResponse.json({ success: true, data: tipos })
  } catch (error) {
    console.error('Error listando tipos de proceso:', error)
    return NextResponse.json(
      { success: false, error: 'Error al listar tipos' },
      { status: 500 }
    )
  }
}

// POST - Crear tipo de proceso
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const body = await request.json()
    const { juzgadoId, nombre, codigo, orden, claseProceso, categoriaProceso } = body

    if (!juzgadoId || !nombre || !categoriaProceso) {
      return NextResponse.json(
        { success: false, error: 'Se requiere juzgadoId, nombre y categoriaProceso (CIVIL o CONSTITUCIONAL)' },
        { status: 400 }
      )
    }

    if (categoriaProceso !== 'CIVIL' && categoriaProceso !== 'CONSTITUCIONAL') {
      return NextResponse.json(
        { success: false, error: 'categoriaProceso debe ser CIVIL o CONSTITUCIONAL' },
        { status: 400 }
      )
    }

    const jw = juzgadoWhere(user)
    if (Object.keys(jw).length && jw.juzgadoId !== juzgadoId && user?.rol !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'No tiene permiso para crear tipos en este juzgado' },
        { status: 403 }
      )
    }

    const tipo = await db.tipoProcesoEstadistica.create({
      data: {
        juzgadoId,
        categoriaProceso,
        nombre: nombre.trim(),
        codigo: codigo?.trim() || null,
        orden: typeof orden === 'number' ? orden : 0,
        claseProceso: claseProceso || null,
      },
    })

    return NextResponse.json({ success: true, data: tipo })
  } catch (error) {
    console.error('Error creando tipo de proceso:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear. El nombre puede estar duplicado.' },
      { status: 500 }
    )
  }
}
