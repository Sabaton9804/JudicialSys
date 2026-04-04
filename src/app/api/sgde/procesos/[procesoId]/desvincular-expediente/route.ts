import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'
import { limpiarSgdeExpedienteEnProceso } from '@/lib/sgde/persist-proceso-sgde-db'

export const runtime = 'nodejs'

/**
 * POST: elimina solo el vínculo en JudicialSys (sgdeExpedienteAlfrescoId). No borra el expediente en SGDE.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ procesoId: string }> }
) {
  try {
    const user = await getUserFromHeader(request)
    const { procesoId } = await params

    const jw = juzgadoWhere(user)
    const proceso = await db.proceso.findFirst({
      where: { id: procesoId, ...jw } as any,
    })
    if (!proceso) {
      return NextResponse.json({ success: false, error: 'Proceso no encontrado' }, { status: 404 })
    }

    await limpiarSgdeExpedienteEnProceso(procesoId)

    return NextResponse.json({
      success: true,
      message:
        'Se quitó el vínculo en JudicialSys. El expediente en SGDE (si existía) no se ha eliminado. Puede volver a usar «Crear expediente en SGDE».',
    })
  } catch (error) {
    console.error('desvincular-expediente:', error)
    const msg = error instanceof Error ? error.message : 'Error al desvincular'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
