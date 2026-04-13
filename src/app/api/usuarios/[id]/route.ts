import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { RolUsuario, AreaJuzgado } from '@prisma/client'
import { hashPassword } from '@/lib/password-hash'

// PATCH - Actualizar usuario
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { nombre, password, rol, area, juzgadoId, activo } = body

    const usuarioActual = await db.usuario.findUnique({ where: { id } })
    if (!usuarioActual) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      )
    }

    const data: Record<string, unknown> = {}
    if (nombre !== undefined) data.nombre = nombre
    if (rol !== undefined) data.rol = rol as RolUsuario
    if (area !== undefined) data.area = area as AreaJuzgado
    if (activo !== undefined) data.activo = activo
    if (password !== undefined && password !== '') {
      data.password = await hashPassword(password, 10)
    }

    if (rol === 'SUPER_ADMIN') {
      data.juzgadoId = null
    } else if (juzgadoId !== undefined) {
      data.juzgadoId = juzgadoId || null
    }

    const usuario = await db.usuario.update({
      where: { id },
      data,
      include: {
        juzgado: {
          select: { id: true, nombre: true, codigo: true, tipoJuzgado: true, ciudad: true }
        }
      }
    })

    return NextResponse.json({ success: true, data: usuario })
  } catch (error) {
    console.error('Error actualizando usuario:', error)
    return NextResponse.json(
      { success: false, error: 'Error al actualizar usuario' },
      { status: 500 }
    )
  }
}
