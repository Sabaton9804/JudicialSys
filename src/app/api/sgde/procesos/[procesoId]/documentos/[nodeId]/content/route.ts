import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'
import {
  login,
  fetchNodeContentBinary,
  normalizarRadicadoSgde,
  nodoEsHijoDeAlgunCuadernoPrimeraInstancia,
  resolveSgdeCredentials,
} from '@/lib/sgde/client'

export const runtime = 'nodejs'

async function contentHandler(
  request: NextRequest,
  procesoId: string,
  nodeId: string,
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
    return NextResponse.json({ success: false, error: 'Radicado no válido' }, { status: 400 })
  }

  const inline =
    bodyJson !== undefined
      ? bodyJson.inline === true
      : request.nextUrl.searchParams.get('inline') === '1'

  const { alfTicket } = await login(cred.usuario, cred.password)
  if (!alfTicket) {
    return NextResponse.json({ success: false, error: 'Sin ticket Alfresco' }, { status: 502 })
  }

  const ok = await nodoEsHijoDeAlgunCuadernoPrimeraInstancia(alfTicket, radicadoNorm, nodeId)
  if (!ok) {
    return NextResponse.json(
      { success: false, error: 'El documento no pertenece a este expediente en SGDE' },
      { status: 403 }
    )
  }

  const content = await fetchNodeContentBinary(alfTicket, nodeId)
  if (!content) {
    return NextResponse.json(
      { success: false, error: 'No se pudo obtener el archivo en SGDE' },
      { status: 502 }
    )
  }

  const disposition = inline ? 'inline' : 'attachment'
  const safeName = content.fileName.replace(/[/\\]/g, '_')

  return new NextResponse(new Uint8Array(content.buffer), {
    headers: {
      'Content-Type': content.contentType,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(safeName)}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

/**
 * Descarga con credenciales solo por entorno. Preferir POST con JSON.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ procesoId: string; nodeId: string }> }
) {
  try {
    const { procesoId, nodeId } = await params
    return await contentHandler(request, procesoId, nodeId, undefined)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

/**
 * Descarga/visualización con credenciales en el cuerpo (mismo usuario que al listar).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ procesoId: string; nodeId: string }> }
) {
  try {
    const { procesoId, nodeId } = await params
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    return await contentHandler(request, procesoId, nodeId, body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
