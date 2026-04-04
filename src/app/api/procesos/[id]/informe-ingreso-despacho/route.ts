import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'
import { generarInformeIngresoDespacho } from '@/lib/plantillas/generar-informe-ingreso-despacho'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromHeader(request)
    if (!user?.id) {
      return NextResponse.json({ success: false, error: 'Indique usuario (Actuar como)' }, { status: 401 })
    }
    const { id: procesoId } = await params
    const jw = juzgadoWhere(user)
    const proceso = await db.proceso.findFirst({
      where: { id: procesoId, ...jw },
    })
    if (!proceso) {
      return NextResponse.json({ success: false, error: 'Proceso no encontrado' }, { status: 404 })
    }

    let body: { regenerar?: boolean; medioIngreso?: string; origenProceso?: string } = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const r = await generarInformeIngresoDespacho({
      procesoId,
      subidoPorId: user.id,
      regenerar: !!body.regenerar,
      medioIngreso: body.medioIngreso,
      origenProceso: body.origenProceso,
    })

    if (!r.ok) {
      const status =
        r.codigo === 'NOT_FOUND' ? 404 : r.codigo === 'VALIDACION' ? 400 : r.codigo === 'YA_EXISTE' ? 409 : 500
      return NextResponse.json({ success: false, error: r.mensaje, codigo: r.codigo }, { status })
    }

    return NextResponse.json({
      success: true,
      data: {
        archivoId: r.archivoId,
        version: r.version,
        regeneracion: r.regeneracion,
        plantillaId: r.plantillaId,
        plantillaVersion: r.plantillaVersion,
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ success: false, error: 'Error al generar informe' }, { status: 500 })
  }
}
