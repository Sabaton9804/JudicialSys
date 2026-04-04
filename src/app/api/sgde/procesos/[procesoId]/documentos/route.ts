import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'
import {
  login,
  listarDocumentosPorCuadernosSgde,
  normalizarRadicadoSgde,
  resolveSgdeCredentials,
} from '@/lib/sgde/client'

export const runtime = 'nodejs'

async function listarHandler(
  request: NextRequest,
  procesoId: string,
  bodyJson: Record<string, unknown> | undefined
) {
  const user = await getUserFromHeader(request)
  const cred = resolveSgdeCredentials(bodyJson)
  if (!cred) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Indique usuario y contraseña del SGDE en el formulario, o configure SGDE_USER y SGDE_PASSWORD en el servidor.',
      },
      { status: 400 }
    )
  }

  const jw = juzgadoWhere(user)
  const proceso = await db.proceso.findFirst({
    where: { id: procesoId, ...jw },
  })
  if (!proceso) {
    return NextResponse.json({ success: false, error: 'Proceso no encontrado' }, { status: 404 })
  }

  const radicadoNorm = normalizarRadicadoSgde(proceso.radicado)
  if (radicadoNorm.length < 15) {
    return NextResponse.json(
      { success: false, error: 'Radicado no válido para consultar en SGDE' },
      { status: 400 }
    )
  }

  const { alfTicket } = await login(cred.usuario, cred.password)
  if (!alfTicket) {
    return NextResponse.json(
      { success: false, error: 'Sesión SGDE sin ticket Alfresco (alfTicket)' },
      { status: 502 }
    )
  }

  const carpetas = await listarDocumentosPorCuadernosSgde(alfTicket, radicadoNorm)
  if (carpetas.length === 0) {
    return NextResponse.json(
      {
        success: false,
        motivo: 'expediente_no_en_sgde',
        error:
          'En el SGDE aún no hay carpeta para este radicado, o su usuario no tiene acceso. Si el expediente no lo ha creado en el gestor de la Rama, es normal: créelo primero y vuelva a consultar.',
      },
      { status: 422 }
    )
  }

  const documentosTotales = carpetas.reduce((n, c) => n + c.documentos.length, 0)

  return NextResponse.json({
    success: true,
    configured: true,
    data: {
      radicado: proceso.radicado,
      /** Misma jerarquía que el portal: Primera instancia → [Principal | Medidas cautelares | …] */
      carpetas,
      /** Lista plana (compatibilidad); suma de todos los cuadernos */
      documentos: carpetas.flatMap((c) => c.documentos),
      documentosTotales,
    },
  })
}

/**
 * Lista documentos (credenciales solo por entorno).
 * Preferir POST con JSON { sgdeUsuario, sgdePassword }.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ procesoId: string }> }
) {
  try {
    const { procesoId } = await params
    return await listarHandler(request, procesoId, undefined)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

/**
 * Lista documentos con credenciales en el cuerpo (formulario de la página).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ procesoId: string }> }
) {
  try {
    const { procesoId } = await params
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    return await listarHandler(request, procesoId, body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
