import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { db } from '@/lib/db'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'
import { getFile } from '@/lib/storage'
import { bufferParecePdf, extraerTexto } from '@/lib/extract-documento'
import { parsearDemandaConIA, tieneClaveOpenAI } from '@/lib/parse-reparto-ai'
import type { DatosExtraidos } from '@/lib/parse-reparto'
import { demandaSgdeMetadataDesdeDatos } from '@/lib/sgde/demanda-sgde-metadata'
import { guardarDemandaSgdeMetadata } from '@/lib/sgde/persist-demanda-sgde-db'
import type { CarpetaArchivo } from '@prisma/client'

type ArchivoRow = {
  id: string
  carpeta: CarpetaArchivo
  nombreOriginal: string
  nombreArchivo: string
  bucketKey: string | null
  eliminado: boolean
  createdAt: Date
}

function prioridadNombreDemanda(nombreOriginal: string): number {
  const n = nombreOriginal.toLowerCase()
  if (n === 'escritodemanda.pdf' || n === 'demanda.pdf') return 100
  if (/^demanda_/.test(n)) return 90
  if (n.includes('demanda') && n.endsWith('.pdf')) return 70
  if (n.endsWith('.pdf')) return 50
  if (/\.docx?$/.test(n)) return 40
  return 10
}

function elegirArchivoDemanda(archivos: ArchivoRow[]): ArchivoRow | null {
  const candidatos = archivos.filter(
    (a) =>
      !a.eliminado &&
      a.carpeta === 'DEMANDA' &&
      /\.(pdf|doc|docx)$/i.test(a.nombreOriginal || a.nombreArchivo)
  )
  if (candidatos.length === 0) return null
  return [...candidatos].sort((a, b) => {
    const pa = prioridadNombreDemanda(a.nombreOriginal || a.nombreArchivo)
    const pb = prioridadNombreDemanda(b.nombreOriginal || b.nombreArchivo)
    if (pb !== pa) return pb - pa
    return b.createdAt.getTime() - a.createdAt.getTime()
  })[0]!
}

/**
 * POST — Extrae texto del escrito en carpeta DEMANDA y devuelve análisis estructurado (OpenAI).
 * Body opcional: { "archivoId": "..." } para elegir un archivo concreto del expediente.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromHeader(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }

    const { id: procesoId } = await params
    const jw = juzgadoWhere(user)

    const proceso = await db.proceso.findFirst({
      where: { id: procesoId, ...jw } as any,
      select: {
        id: true,
        radicado: true,
        archivos: {
          where: { eliminado: false },
          select: {
            id: true,
            carpeta: true,
            nombreOriginal: true,
            nombreArchivo: true,
            bucketKey: true,
            eliminado: true,
            createdAt: true,
          },
        },
        cuadernos: {
          select: {
            archivos: {
              where: { eliminado: false },
              select: {
                id: true,
                carpeta: true,
                nombreOriginal: true,
                nombreArchivo: true,
                bucketKey: true,
                eliminado: true,
                createdAt: true,
              },
            },
          },
        },
      },
    })

    if (!proceso) {
      return NextResponse.json({ success: false, error: 'Proceso no encontrado' }, { status: 404 })
    }

    const todos: ArchivoRow[] = [...proceso.archivos]
    for (const c of proceso.cuadernos) {
      for (const a of c.archivos) {
        if (!todos.some((x) => x.id === a.id)) todos.push(a)
      }
    }

    let body: { archivoId?: string } = {}
    try {
      const t = await request.text()
      if (t.trim()) body = JSON.parse(t) as { archivoId?: string }
    } catch {
      body = {}
    }

    let elegido: ArchivoRow | null = null
    if (body.archivoId?.trim()) {
      elegido = todos.find((a) => a.id === body.archivoId) ?? null
      if (!elegido) {
        return NextResponse.json({ success: false, error: 'Archivo no pertenece a este expediente' }, { status: 400 })
      }
      if (elegido.carpeta !== 'DEMANDA') {
        return NextResponse.json(
          { success: false, error: 'El análisis solo aplica a documentos en carpeta DEMANDA' },
          { status: 400 }
        )
      }
    } else {
      elegido = elegirArchivoDemanda(todos)
    }

    if (!elegido) {
      return NextResponse.json(
        {
          success: false,
          error: 'No hay un PDF o Word en carpeta DEMANDA. Suba el escrito o elija otro expediente.',
        },
        { status: 400 }
      )
    }

    const localPath = elegido.bucketKey
      ? null
      : path.join(process.cwd(), 'uploads', proceso.radicado, elegido.carpeta, elegido.nombreArchivo)

    const { buffer } = await getFile(elegido.bucketKey, localPath)
    const nombreParaExt = elegido.nombreOriginal || elegido.nombreArchivo
    const texto = (await extraerTexto(buffer, nombreParaExt)).trim()

    const MIN_CHARS = 25
    if (texto.length < MIN_CHARS) {
      const bytes = buffer.length
      const cabeceraPdf = bufferParecePdf(buffer)
      let hint =
        `Solo se leyeron ${texto.length} caracteres (se requieren al menos ${MIN_CHARS}). Tamaño del archivo: ${bytes} bytes.`
      if (bytes === 0) {
        hint += ' El archivo está vacío: vuelva a subirlo o elija otro documento.'
      } else if (!cabeceraPdf) {
        hint +=
          ' El contenido no parece un PDF (no empieza por %PDF): a veces el servidor devuelve HTML o un error en lugar del documento. Compruebe la descarga o suba de nuevo el PDF.'
      } else {
        hint +=
          ' El PDF es legible como binario pero no se obtuvo capa de texto: puede ser solo imagen escaneada sin OCR embebido, o fuentes muy especiales. Pruebe «Imprimir a PDF» desde Adobe/Edge o un OCR y vuelva a subir.'
      }
      return NextResponse.json(
        {
          success: false,
          error: hint,
          caracteresExtraidos: texto.length,
          tamanoBytes: bytes,
          cabeceraPdf,
          archivoUsado: {
            id: elegido.id,
            nombreOriginal: elegido.nombreOriginal,
            carpeta: elegido.carpeta,
          },
        },
        { status: 422 }
      )
    }

    if (!tieneClaveOpenAI()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Configure OPENAI_API_KEY en el servidor para obtener los datos de radicación desde la demanda.',
          textoExtraido: texto.length,
          archivoUsado: {
            id: elegido.id,
            nombreOriginal: elegido.nombreOriginal,
            carpeta: elegido.carpeta,
          },
        },
        { status: 503 }
      )
    }

    const datos: DatosExtraidos | null = await parsearDemandaConIA(texto)

    const metaSgde = datos ? demandaSgdeMetadataDesdeDatos(datos) : null
    let advertenciaPersistencia: string | undefined
    if (metaSgde && Object.keys(metaSgde).length > 0) {
      try {
        await guardarDemandaSgdeMetadata(procesoId, metaSgde)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('analizar-demanda: no se pudo guardar demandaSgdeMetadata:', msg)
        advertenciaPersistencia =
          'Los datos de la IA se muestran abajo, pero no se guardaron en la base (columna demandaSgdeMetadata). Ejecute en la raíz del proyecto: npx prisma db push && npx prisma generate, cierre el servidor de desarrollo y vuelva a iniciarlo.'
      }
    }

    return NextResponse.json({
      success: true,
      archivoUsado: {
        id: elegido.id,
        nombreOriginal: elegido.nombreOriginal,
        carpeta: elegido.carpeta,
      },
      caracteresTexto: texto.length,
      datos: datos ?? {},
      demandaSgdeMetadataGuardada: metaSgde,
      advertenciaPersistencia,
      usoIA: true,
    })
  } catch (error) {
    console.error('analizar-demanda:', error)
    const msg = error instanceof Error ? error.message : 'Error al obtener datos para radicación'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
