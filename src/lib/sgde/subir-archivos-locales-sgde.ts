import path from 'path'
import type { ArchivoProceso, CarpetaArchivo } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * Orden de piezas en «Primera instancia / Principal» (SGDE usa rama:idDocumento en secuencia de subida).
 * 1 Correo reparto → 2 Acta reparto → 3 Pruebas/anexos → 4 Demanda; el resto al final.
 */
export function prioridadOrdenSubidaPrincipalPorNombre(nombreOriginal: string): number {
  const base = (nombreOriginal || '').trim().toLowerCase()
  const n = base.normalize('NFD').replace(/\p{M}/gu, '')

  if (n.includes('correo') && n.includes('reparto')) return 1
  if (n.includes('acta') && n.includes('reparto')) return 2
  if (n.includes('prueba') || n.includes('pruebasanexos') || n.includes('anexosprueba')) return 3
  if (n.includes('demanda') && /\.(pdf|docx)$/i.test(base)) return 4

  return 100
}

function prioridadOrdenSubidaPrincipal(a: ArchivoProceso): number {
  const base = (a.nombreOriginal || a.nombreArchivo || '').trim().toLowerCase()
  const n = base.normalize('NFD').replace(/\p{M}/gu, '')
  const porNombre = prioridadOrdenSubidaPrincipalPorNombre(a.nombreOriginal || a.nombreArchivo || '')
  if (porNombre < 100) return porNombre

  if (a.carpeta === 'CONSTANCIAS' && n.includes('correo')) return 1
  if (a.carpeta === 'ACTA_REPARTO') return 2
  if (a.carpeta === 'ANEXOS' || a.carpeta === 'PRUEBAS') return 3
  if (a.carpeta === 'DEMANDA' && /\.(pdf|docx)$/i.test(base)) return 4

  return 100
}
import { getFile } from '@/lib/storage'
import {
  contarPaginasPdfSgde,
  getMaxPaginaFinDoc,
  login,
  normalizarRadicadoSgde,
  resolverUuidCarpetaPriorizandoExpedienteAlmacenado,
  subirArchivoSgde,
} from '@/lib/sgde/client'
import { clasificarTiposDocumentalesSgdeIA } from '@/lib/sgde/clasificar-tipo-documental-sgde-ia'
import { leerSgdeExpedienteAlmacenado } from '@/lib/sgde/persist-proceso-sgde-db'

const MIME_OK = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export type ResultadoSubidaArchivoLocalSgde = {
  archivoId: string
  nombreOriginal: string
  ok: boolean
  tipoDocumental?: string
  error?: string
}

export type SubirArchivosLocalesParams = {
  procesoId: string
  radicado: string
  usuario: string
  password: string
  rutaDestino?: string
  nivelAcceso?: string
  maxArchivos?: number
}

/**
 * Sube al SGDE los PDF/DOCX del repositorio local del proceso, clasificando tipo documental con IA.
 */
export async function subirArchivosLocalesProcesoSgde(
  params: SubirArchivosLocalesParams
): Promise<{
  subidosOk: number
  total: number
  resultados: ResultadoSubidaArchivoLocalSgde[]
  aviso?: string
}> {
  const {
    procesoId,
    radicado,
    usuario,
    password,
    nivelAcceso = 'Reservado',
    maxArchivos = 40,
  } = params

  const procesoRow = await db.proceso.findUnique({
    where: { id: procesoId },
    select: { radicado: true },
  })
  const radicadoCarpeta = procesoRow?.radicado ?? radicado
  const radicadoNorm = normalizarRadicadoSgde(radicado)
  const archivos = await db.archivoProceso.findMany({
    where: { procesoId, eliminado: false },
    orderBy: [{ carpeta: 'asc' }, { createdAt: 'asc' }],
  })

  const list = archivos
    .filter((a) => !a.eliminado && MIME_OK.has(a.tipoMime))
    .filter((a) => /\.(pdf|docx)$/i.test(a.nombreOriginal || a.nombreArchivo))
    .sort((a, b) => {
      const pa = prioridadOrdenSubidaPrincipal(a)
      const pb = prioridadOrdenSubidaPrincipal(b)
      if (pa !== pb) return pa - pb
      return a.createdAt.getTime() - b.createdAt.getTime()
    })
    .slice(0, maxArchivos)

  if (list.length === 0) {
    return {
      subidosOk: 0,
      total: 0,
      resultados: [],
      aviso: 'No hay PDF o DOCX en el expediente local para subir.',
    }
  }

  const items = list.map((a) => ({
    nombreOriginal: a.nombreOriginal || a.nombreArchivo,
    carpeta: a.carpeta as CarpetaArchivo,
    descripcion: a.descripcion,
  }))
  const tipos = await clasificarTiposDocumentalesSgdeIA(items)

  const { token, alfTicket } = await login(usuario, password)
  const sgdeExpedienteId = (await leerSgdeExpedienteAlmacenado(procesoId)).alfrescoId
  const nodeUuid = await resolverUuidCarpetaPriorizandoExpedienteAlmacenado(
    alfTicket,
    radicadoNorm,
    sgdeExpedienteId
  )
  if (!nodeUuid) {
    return {
      subidosOk: 0,
      total: list.length,
      resultados: list.map((a) => ({
        archivoId: a.id,
        nombreOriginal: a.nombreOriginal,
        ok: false,
        error: 'No se localizó la carpeta destino en SGDE (Primera instancia / Principal).',
      })),
    }
  }

  const resultados: ResultadoSubidaArchivoLocalSgde[] = []
  let subidosOk = 0

  type Preparado = {
    a: (typeof list)[number]
    buffer: Buffer
    ext: string
    nombreSgde: string
    tipoDocumental: string
    paginas: number
  }

  const preparados: Array<Preparado | null> = new Array(list.length).fill(null)
  const errorLectura: Array<string | null> = new Array(list.length).fill(null)

  for (let i = 0; i < list.length; i++) {
    const a = list[i]!
    const tipoDocumental = tipos[i] ?? 'OtrosDocumentos'
    try {
      const localPath = a.bucketKey
        ? null
        : path.join(process.cwd(), 'uploads', radicadoCarpeta, a.carpeta, a.nombreArchivo)
      const { buffer } = await getFile(a.bucketKey, localPath)
      const ext = (a.nombreOriginal || a.nombreArchivo).toLowerCase().endsWith('.docx')
        ? '.docx'
        : '.pdf'
      const baseName = (a.nombreOriginal || a.nombreArchivo).replace(/[/\\]/g, '_')
      const nombreSgde =
        baseName.toLowerCase().endsWith('.pdf') || baseName.toLowerCase().endsWith('.docx')
          ? baseName
          : `${tipoDocumental.replace(/\s+/g, '')}${ext}`
      let paginas = 1
      if (ext === '.pdf') paginas = await contarPaginasPdfSgde(buffer)
      preparados[i] = { a, buffer, ext, nombreSgde, tipoDocumental, paginas }
    } catch (e) {
      errorLectura[i] = e instanceof Error ? e.message : 'Error al leer archivo'
    }
  }

  let cursor = (await getMaxPaginaFinDoc(alfTicket, nodeUuid)) + 1

  for (let i = 0; i < list.length; i++) {
    const errRead = errorLectura[i]
    const a = list[i]!
    const tipoDocumental = tipos[i] ?? 'OtrosDocumentos'
    if (errRead) {
      resultados.push({
        archivoId: a.id,
        nombreOriginal: a.nombreOriginal,
        ok: false,
        tipoDocumental,
        error: errRead,
      })
      continue
    }
    const prep = preparados[i]!
    const { buffer, ext, nombreSgde, paginas } = prep
    const paginaInicioDoc = cursor
    const paginaFinDoc = cursor + paginas - 1
    try {
      const r = await subirArchivoSgde({
        token,
        alfTicket,
        buffer,
        nombreArchivoSgde: nombreSgde,
        nodeUuid,
        tipoDocumental,
        nivelAcceso,
        nomExpedienteCui: radicadoNorm,
        mimeType: a.tipoMime,
        extension: ext,
        paginaInicioDoc,
        paginaFinDoc,
      })
      if (r.ok) {
        cursor = paginaFinDoc + 1
        subidosOk++
        resultados.push({
          archivoId: a.id,
          nombreOriginal: a.nombreOriginal,
          ok: true,
          tipoDocumental,
        })
      } else {
        resultados.push({
          archivoId: a.id,
          nombreOriginal: a.nombreOriginal,
          ok: false,
          tipoDocumental,
          error: r.detalle,
        })
      }
    } catch (e) {
      resultados.push({
        archivoId: a.id,
        nombreOriginal: a.nombreOriginal,
        ok: false,
        tipoDocumental,
        error: e instanceof Error ? e.message : 'Error al subir archivo',
      })
    }
  }

  return { subidosOk, total: list.length, resultados }
}
