import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { RolUsuario, AreaJuzgado } from '@prisma/client'
import { hashPassword } from '@/lib/password-hash'

// GET - Listar usuarios (filtrable por juzgadoId para super admin)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const juzgadoId = searchParams.get('juzgadoId')
    const rol = searchParams.get('rol') as RolUsuario | null
    const area = searchParams.get('area') as AreaJuzgado | null
    const activo = searchParams.get('activo')
    const limit = parseInt(searchParams.get('limit') || '100')

    const where: Record<string, unknown> = {}
    if (juzgadoId) where.juzgadoId = juzgadoId
    if (rol) where.rol = rol
    if (area) where.area = area
    if (activo !== null && activo !== undefined && activo !== '') {
      where.activo = activo === 'true'
    }

    const usuarios = await db.usuario.findMany({
      where,
      include: {
        juzgado: {
          select: { id: true, nombre: true, codigo: true, tipoJuzgado: true, ciudad: true }
        }
      },
      orderBy: [{ nombre: 'asc' }],
      take: limit,
    })

    return NextResponse.json({ success: true, data: usuarios })
  } catch (error) {
    console.error('Error listando usuarios:', error)
    return NextResponse.json(
      { success: false, error: 'Error al listar usuarios' },
      { status: 500 }
    )
  }
}

// POST - Crear usuario
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, nombre, password, rol, area, juzgadoId } = body

    if (!email || !nombre || !password) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: email, nombre, password' },
        { status: 400 }
      )
    }

    // SUPER_ADMIN no tiene juzgado; el resto debe tenerlo
    const rolValido = (rol as RolUsuario) || RolUsuario.ESCRIBIENTE
    const areaValida = (area as AreaJuzgado) || AreaJuzgado.SECRETARIA

    if (rolValido !== 'SUPER_ADMIN' && rolValido !== 'ADMIN' && !juzgadoId) {
      return NextResponse.json(
        { success: false, error: 'Los funcionarios deben estar asignados a un juzgado' },
        { status: 400 }
      )
    }

    const juzgadoIdFinal = (rolValido === 'SUPER_ADMIN' ? null : juzgadoId) || null

    const existente = await db.usuario.findUnique({ where: { email } })
    if (existente) {
      return NextResponse.json(
        { success: false, error: 'Ya existe un usuario con ese correo' },
        { status: 400 }
      )
    }

    const passwordHash = await hashPassword(password, 10)
    const usuario = await db.usuario.create({
      data: {
        email,
        nombre,
        password: passwordHash,
        rol: rolValido,
        area: areaValida,
        juzgadoId: juzgadoIdFinal,
      },
      include: {
        juzgado: {
          select: { id: true, nombre: true, codigo: true, tipoJuzgado: true, ciudad: true }
        }
      }
    })

    return NextResponse.json({ success: true, data: usuario })
  } catch (error) {
    console.error('Error creando usuario:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear usuario' },
      { status: 500 }
    )
  }
}
