import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'
import {
  contarPaginasPdfSgde,
  getMaxPaginaFinDoc,
  login,
  normalizarRadicadoSgde,
  resolverUuidCarpetaPriorizandoExpedienteAlmacenado,
  resolveSgdeCredentials,
  subirArchivoSgde,
} from '@/lib/sgde/client'
import { leerSgdeExpedienteAlmacenado } from '@/lib/sgde/persist-proceso-sgde-db'

export const runtime = 'nodejs'

const MAX_BYTES = 50 * 1024 * 1024
const NIVELES = new Set(['Reservado', 'Público', 'Confidencial', 'Publico'])
const MIME_OK = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

/**
 * Sube un documento al SGDE (misma API que subir_directo_sgde.py).
 * Credenciales: campos sgdeUsuario y sgdePassword en FormData, o SGDE_USER / SGDE_PASSWORD en el servidor.
 *
 * FormData: file, procesoId, tipoDocumental (ej. Auto, Sentencia),
 * opcional: sgdeUsuario, sgdePassword,
 * opcional: nivelAcceso (Reservado | Público | Confidencial),
 * opcional: nombreArchivoSgde (nombre visible en SGDE; si no, se deriva del tipo + extensión).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const formData = await request.formData()
    const cred = resolveSgdeCredentials({
      sgdeUsuario:
        formData.get('sgdeUsuario') != null ? String(formData.get('sgdeUsuario')) : undefined,
      sgdePassword:
        formData.get('sgdePassword') != null ? String(formData.get('sgdePassword')) : undefined,
    })
    if (!cred) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Indique usuario y contraseña del SGDE en el formulario o configure SGDE_USER y SGDE_PASSWORD en el servidor.',
        },
        { status: 400 }
      )
    }
    const file = formData.get('file') as File | null
    const procesoId = formData.get('procesoId') as string | null
    const tipoDocumental = (formData.get('tipoDocumental') as string | null)?.trim() || 'Auto'
    let nivelAcceso = (formData.get('nivelAcceso') as string | null)?.trim() || 'Reservado'
    if (nivelAcceso === 'Publico') nivelAcceso = 'Público'
    if (!NIVELES.has(nivelAcceso)) nivelAcceso = 'Reservado'
    const nombreArchivoSgdeRaw = (formData.get('nombreArchivoSgde') as string | null)?.trim()

    if (!file || !procesoId) {
      return NextResponse.json(
        { success: false, error: 'Se requiere file y procesoId' },
        { status: 400 }
      )
    }

    if (!MIME_OK.has(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Solo se admite PDF o DOCX para SGDE en esta ruta.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `Archivo demasiado grande (máx. ${MAX_BYTES / 1024 / 1024} MB)` },
        { status: 400 }
      )
    }

    const jw = juzgadoWhere(user)
    const proceso = await db.proceso.findFirst({
      where: { id: procesoId, ...jw },
    })
    if (!proceso) {
      return NextResponse.json(
        { success: false, error: 'Proceso no encontrado o sin permiso' },
        { status: 404 }
      )
    }

    const radicadoNorm = normalizarRadicadoSgde(proceso.radicado)
    if (radicadoNorm.length < 15) {
      return NextResponse.json(
        { success: false, error: 'Radicado del proceso no válido para búsqueda en SGDE' },
        { status: 400 }
      )
    }

    const ext = '.' + (file.name.split('.').pop() || 'pdf').toLowerCase()
    const nombreArchivoSgde =
      nombreArchivoSgdeRaw ||
      `${tipoDocumental.replace(/\s+/g, '')}${ext === '.pdf' ? '.pdf' : '.docx'}`

    const buffer = Buffer.from(await file.arrayBuffer())
    let paginasDoc = 1
    if (ext === '.pdf') paginasDoc = await contarPaginasPdfSgde(buffer)

    const { token, alfTicket } = await login(cred.usuario, cred.password)
    const sgdeExpedienteId = (await leerSgdeExpedienteAlmacenado(procesoId)).alfrescoId
    const nodeUuid = await resolverUuidCarpetaPriorizandoExpedienteAlmacenado(
      alfTicket,
      radicadoNorm,
      sgdeExpedienteId
    )
    if (!nodeUuid) {
      return NextResponse.json(
        {
          success: false,
          error:
            'En el SGDE aún no existe expediente con este radicado o no hay acceso. Cree el expediente desde JudicialSys y reintente.',
        },
        { status: 422 }
      )
    }

    const inicioIdx = (await getMaxPaginaFinDoc(alfTicket, nodeUuid)) + 1
    const paginaFinDoc = inicioIdx + paginasDoc - 1

    const result = await subirArchivoSgde({
      token,
      alfTicket,
      buffer,
      nombreArchivoSgde,
      nodeUuid,
      tipoDocumental,
      nivelAcceso,
      nomExpedienteCui: radicadoNorm,
      mimeType: file.type,
      extension: ext,
      paginaInicioDoc: inicioIdx,
      paginaFinDoc,
    })

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.detalle || 'Error al registrar documento en SGDE' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        radicado: proceso.radicado,
        nombreArchivoSgde,
        tipoDocumental,
        nivelAcceso,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
