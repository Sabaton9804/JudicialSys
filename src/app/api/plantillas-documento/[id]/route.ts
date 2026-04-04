import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader } from '@/lib/auth-utils'
import { sanearHtmlPlantilla } from '@/lib/plantillas/sanitize-html-plantilla'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromHeader(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }
    const { id } = await params
    const row = await db.plantillaDocumento.findUnique({
      where: { id },
      include: { juzgado: { select: { nombre: true } } },
    })
    if (!row) {
      return NextResponse.json({ success: false, error: 'No encontrada' }, { status: 404 })
    }
    if (user.rol !== 'SUPER_ADMIN' && row.juzgadoId && row.juzgadoId !== user.juzgadoId) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 403 })
    }
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ success: false, error: 'Error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromHeader(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }
    const { id } = await params
    const existing = await db.plantillaDocumento.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'No encontrada' }, { status: 404 })
    }
    if (user.rol !== 'SUPER_ADMIN' && existing.juzgadoId && existing.juzgadoId !== user.juzgadoId) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const data: {
      nombre?: string
      htmlContenido?: string
      activa?: boolean
      version?: number
    } = {}
    if (body.nombre != null) data.nombre = String(body.nombre).trim()
    if (body.htmlContenido != null) {
      data.htmlContenido = sanearHtmlPlantilla(String(body.htmlContenido))
      data.version = existing.version + 1
    }
    if (typeof body.activa === 'boolean') data.activa = body.activa

    const row = await db.plantillaDocumento.update({
      where: { id },
      data,
    })
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ success: false, error: 'Error al actualizar' }, { status: 500 })
  }
}
