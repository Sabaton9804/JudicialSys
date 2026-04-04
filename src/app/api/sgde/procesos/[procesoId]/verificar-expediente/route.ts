import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'
import {
  buscarNodoExpedienteId,
  leerNodoExpedientePorId,
  login,
  normalizarRadicadoSgde,
  resolveSgdeCredentials,
} from '@/lib/sgde/client'
import { leerSgdeExpedienteAlmacenado } from '@/lib/sgde/persist-proceso-sgde-db'

export const runtime = 'nodejs'

/**
 * POST: comprueba con el SGDE si el UUID guardado en JudicialSys es accesible y si la búsqueda
 * por CUI devuelve el mismo nodo (detecta vínculos viejos o erróneos).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ procesoId: string }> }
) {
  try {
    const user = await getUserFromHeader(request)
    const { procesoId } = await params
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const cred = resolveSgdeCredentials({
      sgdeUsuario: typeof body.sgdeUsuario === 'string' ? body.sgdeUsuario : undefined,
      sgdePassword: typeof body.sgdePassword === 'string' ? body.sgdePassword : undefined,
    })
    if (!cred) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Indique usuario y contraseña del SGDE o configure SGDE_USER y SGDE_PASSWORD en el servidor.',
        },
        { status: 400 }
      )
    }

    const jw = juzgadoWhere(user)
    const proceso = await db.proceso.findFirst({
      where: { id: procesoId, ...jw } as any,
    })
    if (!proceso) {
      return NextResponse.json({ success: false, error: 'Proceso no encontrado' }, { status: 404 })
    }

    const almacen = await leerSgdeExpedienteAlmacenado(proceso.id)
    const uuidGuardado = almacen.alfrescoId
    if (!uuidGuardado) {
      return NextResponse.json(
        {
          success: false,
          error: 'Este proceso no tiene UUID de expediente SGDE guardado en JudicialSys.',
        },
        { status: 422 }
      )
    }

    const radicado = normalizarRadicadoSgde(proceso.radicado)
    if (radicado.length !== 23) {
      return NextResponse.json(
        {
          success: false,
          error: 'El radicado debe tener 23 dígitos para comparar con la búsqueda en SGDE.',
        },
        { status: 422 }
      )
    }

    const { alfTicket } = await login(cred.usuario, cred.password)

    const lectura = await leerNodoExpedientePorId(alfTicket, uuidGuardado, {
      incluirPropiedadesRama: true,
    })
    const uuidPorBusqueda = await buscarNodoExpedienteId(alfTicket, radicado)

    const nodoAccesible = lectura.ok === true
    const coincideConBusqueda =
      nodoAccesible && uuidPorBusqueda != null && uuidPorBusqueda === lectura.nodeId

    const lecturaJson =
      lectura.ok === true
        ? {
            cmName: lectura.cmName,
            nomExpediente: lectura.nomExpediente,
            nodeType: lectura.nodeType,
            propiedadesRama: lectura.propiedadesRama,
          }
        : { errorHttp: lectura.status, detalle: lectura.detalle }

    const interpretacion = !nodoAccesible
      ? 'El UUID guardado en JudicialSys no se pudo leer en SGDE (revocado, borrado o sin permiso). Puede quitar el vínculo y volver a crear o enlazar.'
      : !uuidPorBusqueda
        ? 'La búsqueda por CUI no devolvió expediente; el nodo existe por UUID pero el índice puede no coincidir con el listado aún, o el CUI en metadatos difiere.'
        : !coincideConBusqueda
          ? 'La búsqueda por CUI encontró otro UUID distinto al guardado en JudicialSys. El vínculo local puede estar desactualizado: considere quitar vínculo y enlazar el correcto.'
          : 'El expediente existe en SGDE y coincide la búsqueda por CUI con el UUID vinculado. Si no lo ve en la lista, use el filtro por expediente (CUI) o revise despacho y permisos.'

    return NextResponse.json({
      success: true,
      uuidEnJudicialSys: uuidGuardado,
      radicado23: radicado,
      nodoAccesible,
      lectura: lecturaJson,
      busquedaPorCui: {
        uuid: uuidPorBusqueda,
        encontrado: uuidPorBusqueda != null,
      },
      coincideConBusqueda,
      interpretacion,
      notaEstadoLista:
        'La columna «Estado» del listado web (p. ej. En trámite) la rellena el flujo del portal; la creación por API puede no escribir el mismo metadato. Opcional: variables SGDE_EXPEDIENTE_ESTADO_PROP y SGDE_EXPEDIENTE_ESTADO_VALOR según instructivo CSJ.',
    })
  } catch (error) {
    console.error('verificar-expediente SGDE:', error)
    const msg = error instanceof Error ? error.message : 'Error al verificar en SGDE'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
