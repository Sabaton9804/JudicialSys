import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'
import {
  cpnuConsultarPorRadicado,
  cpnuDetalleProceso,
  mapDetalleToProcesoConsulta,
  persistConsultaCpnuSql,
  radicadoCpnuValido,
} from '@/lib/cpnu/client'

export const runtime = 'nodejs'

/**
 * POST — Obtiene datos del proceso en la consulta pública CPNU y los guarda en el expediente.
 * No requiere credenciales; usa la API pública (:448/api/v2).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getUserFromHeader(request)
    const jw = juzgadoWhere(user)

    const proceso = await db.proceso.findFirst({
      where: { id, ...jw },
    })
    if (!proceso) {
      return NextResponse.json({ success: false, error: 'Proceso no encontrado' }, { status: 404 })
    }

    let radicado = proceso.radicado
    try {
      const body = await request.json()
      if (body?.radicado && typeof body.radicado === 'string') {
        radicado = body.radicado.replace(/\D/g, '')
      }
    } catch {
      /* sin body */
    }

    if (!radicadoCpnuValido(radicado)) {
      return NextResponse.json(
        { success: false, error: 'Radicado inválido: se requieren 23 dígitos (consulta CPNU).' },
        { status: 400 }
      )
    }

    const lista = await cpnuConsultarPorRadicado(radicado)
    const primero = lista.procesos?.[0]
    if (!primero || primero.esPrivado) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No hay resultados en la consulta pública para este radicado (o el proceso es privado). Verifique el número en consultaprocesos.ramajudicial.gov.co.',
        },
        { status: 422 }
      )
    }

    const detalle = await cpnuDetalleProceso(primero.idProceso)
    const data = mapDetalleToProcesoConsulta(detalle)

    await persistConsultaCpnuSql(db, id, data, proceso.fechaRadicacion)

    return NextResponse.json({
      success: true,
      data: {
        llaveProceso: detalle.llaveProceso,
        fechaConsultaCpnu: detalle.fechaConsulta ?? null,
      },
    })
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Error al sincronizar con CPNU'
    const msg =
      raw.length > 280 ? `${raw.slice(0, 280)}…` : raw
    console.error('sincronizar-cpnu:', e)
    return NextResponse.json({ success: false, error: msg }, { status: 502 })
  }
}
