import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader } from '@/lib/auth-utils'
import { sanearHtmlPlantilla } from '@/lib/plantillas/sanitize-html-plantilla'
import { esTipoPlantillaDocumento } from '@/lib/plantillas/tipos-plantilla-documento'

export const runtime = 'nodejs'

/** GET: listar plantillas (filtrar por tipo y juzgado) */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo')
    const where: Record<string, unknown> =
      user.rol !== 'SUPER_ADMIN' && user.juzgadoId
        ? {
            AND: [
              ...(tipo && esTipoPlantillaDocumento(tipo) ? [{ tipo }] : []),
              { OR: [{ juzgadoId: user.juzgadoId }, { juzgadoId: null }] },
            ],
          }
        : tipo && esTipoPlantillaDocumento(tipo)
          ? { tipo }
          : {}

    const list = await db.plantillaDocumento.findMany({
      where,
      orderBy: [{ tipo: 'asc' }, { updatedAt: 'desc' }],
      include: {
        juzgado: { select: { nombre: true, codigo: true } },
        createdBy: { select: { nombre: true } },
      },
    })
    return NextResponse.json({ success: true, data: list })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ success: false, error: 'Error al listar plantillas' }, { status: 500 })
  }
}

/** POST: crear plantilla */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }
    const body = await request.json()
    const tipo = body.tipo as string
    const nombre = String(body.nombre ?? '').trim()
    const htmlContenido = String(body.htmlContenido ?? '')
    let juzgadoId: string | null = body.juzgadoId != null ? String(body.juzgadoId) : null
    if (user.rol !== 'SUPER_ADMIN') {
      juzgadoId = user.juzgadoId
    }
    if (juzgadoId === '') juzgadoId = null

    if (!esTipoPlantillaDocumento(tipo)) {
      return NextResponse.json({ success: false, error: 'Tipo de plantilla no soportado' }, { status: 400 })
    }
    if (!nombre || htmlContenido.length < 20) {
      return NextResponse.json({ success: false, error: 'Nombre y contenido HTML requeridos' }, { status: 400 })
    }

    const sane = sanearHtmlPlantilla(htmlContenido)
    const row = await db.plantillaDocumento.create({
      data: {
        tipo,
        nombre,
        htmlContenido: sane,
        juzgadoId,
        createdById: user.id,
        version: 1,
        activa: body.activa !== false,
      },
    })
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ success: false, error: 'Error al crear plantilla' }, { status: 500 })
  }
}
