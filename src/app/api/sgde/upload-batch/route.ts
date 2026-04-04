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
import { clasificarTiposDocumentalesSgdeIA } from '@/lib/sgde/clasificar-tipo-documental-sgde-ia'
import { prioridadOrdenSubidaPrincipalPorNombre } from '@/lib/sgde/subir-archivos-locales-sgde'

export const runtime = 'nodejs'

const MAX_BYTES = 50 * 1024 * 1024
const MAX_FILES = 40
const NIVELES = new Set(['Reservado', 'Público', 'Confidencial', 'Publico'])
const MIME_OK = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export type BatchItemResult = {
  nombreOriginal: string
  nombreSgde: string
  ok: boolean
  tipoDocumental?: string
  error?: string
}

/**
 * Carga masiva al SGDE (equivalente al flujo MagnusPro: un login, varios archivos al mismo radicado/carpeta).
 * FormData: file (repetido por cada archivo), procesoId, sgdeUsuario, sgdePassword,
 * opcional: tipoDocumental, nivelAcceso, rutaDestino.
 * Si tipoDocumental es vacío o «Auto», se clasifica cada archivo con IA según el catálogo SGDE.
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

    const rawFiles = formData.getAll('file')
    const files = rawFiles.filter((v): v is File => v instanceof File && v.size > 0)

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: 'Adjunte al menos un archivo (PDF o DOCX)' }, { status: 400 })
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { success: false, error: `Máximo ${MAX_FILES} archivos por lote` },
        { status: 400 }
      )
    }

    const procesoId = formData.get('procesoId') as string | null
    const tipoDocumentalRaw = (formData.get('tipoDocumental') as string | null)?.trim() || 'Auto'
    const usarIaPorArchivo = !tipoDocumentalRaw || /^auto$/i.test(tipoDocumentalRaw)
    const tipoDocumentalFijo = usarIaPorArchivo ? 'Auto' : tipoDocumentalRaw
    let nivelAcceso = (formData.get('nivelAcceso') as string | null)?.trim() || 'Reservado'
    if (nivelAcceso === 'Publico') nivelAcceso = 'Público'
    if (!NIVELES.has(nivelAcceso)) nivelAcceso = 'Reservado'
    const rutaDestino = ((formData.get('rutaDestino') as string | null) || '01PrimeraInstancia/C01').trim()

    if (!procesoId) {
      return NextResponse.json({ success: false, error: 'Se requiere procesoId' }, { status: 400 })
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

    for (const file of files) {
      if (!MIME_OK.has(file.type)) {
        return NextResponse.json(
          {
            success: false,
            error: `Tipo no admitido: ${file.name} (${file.type || 'desconocido'}). Solo PDF o DOCX.`,
          },
          { status: 400 }
        )
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: `Archivo demasiado grande: ${file.name} (máx. ${MAX_BYTES / 1024 / 1024} MB)`,
          },
          { status: 400 }
        )
      }
    }

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
            'En el SGDE aún no existe expediente con este radicado, no se pudieron crear las carpetas (Primera instancia / Principal) o no hay acceso. Cree el expediente desde JudicialSys («Crear expediente en SGDE») y reintente.',
        },
        { status: 422 }
      )
    }

    const filesSorted = [...files].sort((a, b) => {
      const pa = prioridadOrdenSubidaPrincipalPorNombre(a.name)
      const pb = prioridadOrdenSubidaPrincipalPorNombre(b.name)
      if (pa !== pb) return pa - pb
      return a.name.localeCompare(b.name, 'es')
    })

    const tiposIa = usarIaPorArchivo
      ? await clasificarTiposDocumentalesSgdeIA(
          filesSorted.map((f) => ({
            nombreOriginal: f.name,
            carpeta: 'OTROS',
          }))
        )
      : null

    const resultados: BatchItemResult[] = []
    let okCount = 0
    let cursor = (await getMaxPaginaFinDoc(alfTicket, nodeUuid)) + 1

    for (let i = 0; i < filesSorted.length; i++) {
      const file = filesSorted[i]!
      const tipoDoc =
        usarIaPorArchivo && tiposIa ? tiposIa[i] ?? 'OtrosDocumentos' : tipoDocumentalFijo
      const ext = '.' + (file.name.split('.').pop() || 'pdf').toLowerCase()
      const baseName = file.name.replace(/[/\\]/g, '_')
      const nombreArchivoSgde =
        baseName.toLowerCase().endsWith('.pdf') || baseName.toLowerCase().endsWith('.docx')
          ? baseName
          : `${tipoDoc.replace(/\s+/g, '')}${ext === '.pdf' ? '.pdf' : '.docx'}`

      const buffer = Buffer.from(await file.arrayBuffer())
      let paginas = 1
      if (ext === '.pdf') paginas = await contarPaginasPdfSgde(buffer)
      const paginaInicioDoc = cursor
      const paginaFinDoc = cursor + paginas - 1

      const result = await subirArchivoSgde({
        token,
        alfTicket,
        buffer,
        nombreArchivoSgde,
        nodeUuid,
        tipoDocumental: tipoDoc,
        nivelAcceso,
        nomExpedienteCui: radicadoNorm,
        mimeType: file.type,
        extension: ext,
        paginaInicioDoc,
        paginaFinDoc,
      })

      if (result.ok) {
        cursor = paginaFinDoc + 1
        okCount++
        resultados.push({
          nombreOriginal: file.name,
          nombreSgde: nombreArchivoSgde,
          ok: true,
          tipoDocumental: tipoDoc,
        })
      } else {
        resultados.push({
          nombreOriginal: file.name,
          nombreSgde: nombreArchivoSgde,
          ok: false,
          tipoDocumental: tipoDoc,
          error: result.detalle || 'Error al registrar en SGDE',
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        radicado: proceso.radicado,
        rutaDestino,
        tipoDocumental: usarIaPorArchivo ? 'Auto (IA por archivo)' : tipoDocumentalFijo,
        nivelAcceso,
        total: filesSorted.length,
        subidosOk: okCount,
        fallidos: filesSorted.length - okCount,
        resultados,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
