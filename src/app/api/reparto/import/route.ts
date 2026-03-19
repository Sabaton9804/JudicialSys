import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { uploadFile } from '@/lib/storage'
import JSZip from 'jszip'
import { extraerTexto } from '@/lib/extract-documento'
import { parsearTextoDocumentos } from '@/lib/parse-reparto'
import { parsearConIA, tieneClaveOpenAI } from '@/lib/parse-reparto-ai'
import { generarRadicado } from '@/lib/radicado'
import { getUserFromHeader } from '@/lib/auth-utils'

const CARPETAS = ['DEMANDA', 'ANEXOS', 'ACTA_REPARTO', 'INFORME_INGRESO_DESPACHO'] as const

function clasificarCarpeta(nombre: string): (typeof CARPETAS)[number] {
  const n = nombre.toLowerCase()
  if (n.includes('acta') || n.includes('reparto')) return 'ACTA_REPARTO'
  if (n.includes('informe') || n.includes('ingreso')) return 'INFORME_INGRESO_DESPACHO'
  if (n.includes('anexo')) return 'ANEXOS'
  return 'DEMANDA'
}

const EXT_EXTRACTIBLE = ['.pdf', '.doc', '.docx', '.txt']

// Juzgado por defecto: 51 Civil del Circuito de Bogotá D.C.
const CODIGO_JUZGADO_DEFAULT = '11-031-CIV-051'

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file || file.size === 0) {
      return NextResponse.json({ success: false, error: 'Seleccione un archivo ZIP' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'zip') {
      return NextResponse.json({ success: false, error: 'El archivo debe ser un ZIP (.zip)' }, { status: 400 })
    }

    // Juzgado por defecto: 51 Civil Circuito Bogotá (codigo 11-031-CIV-051)
    let juzgadoFinal = user?.juzgadoId || null
    if (!juzgadoFinal) {
      const juzgado = await db.juzgado.findFirst({ where: { codigo: CODIGO_JUZGADO_DEFAULT } })
      if (juzgado) {
        juzgadoFinal = juzgado.id
      } else {
        const primer = await db.juzgado.findFirst()
        if (!primer) {
          return NextResponse.json({
            success: false,
            error: 'No hay juzgados. Ejecute: npx tsx prisma/seed.ts'
          }, { status: 400 })
        }
        juzgadoFinal = primer.id
      }
    }

    // subidoPorId: usuario del header o primer usuario del juzgado (evita FK violation)
    let subidoPorId = user?.id
    if (!subidoPorId) {
      const usuarioJuzgado = await db.usuario.findFirst({ where: { juzgadoId: juzgadoFinal }, select: { id: true } })
      subidoPorId = usuarioJuzgado?.id
    }
    if (!subidoPorId) {
      const cualquiera = await db.usuario.findFirst({ select: { id: true } })
      if (!cualquiera) {
        return NextResponse.json({ success: false, error: 'No hay usuarios. Ejecute: npx tsx prisma/seed.ts' }, { status: 400 })
      }
      subidoPorId = cualquiera.id
    }

    const bytes = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(bytes)
    const textos: string[] = []
    const archivosParaGuardar: { nombre: string; buffer: Buffer; carpeta: string }[] = []

    for (const [nombreRel, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue
      const buffer = Buffer.from(await entry.async('arraybuffer'))
      const nombre = nombreRel.split('/').pop() || nombreRel
      const carpeta = clasificarCarpeta(nombre)

      archivosParaGuardar.push({ nombre, buffer, carpeta })

      if (EXT_EXTRACTIBLE.some(e => nombre.toLowerCase().endsWith(e))) {
        const texto = await extraerTexto(buffer, nombre)
        if (texto) textos.push(texto)
      }
    }

    let datos = parsearTextoDocumentos(textos)
    if (tieneClaveOpenAI() && textos.length > 0) {
      const textoCompleto = textos.join('\n\n').slice(0, 12000)
      const datosIA = await parsearConIA(textoCompleto)
      if (datosIA) {
        datos = { ...datos, ...datosIA }
      }
    }

    const codigoBase = '110013103051'
    const juzgado = await db.juzgado.findUnique({ where: { id: juzgadoFinal } })
    const codigo12 = (juzgado?.codigoRadicacion12?.replace(/\D/g, '') || codigoBase).slice(0, 12)
    const anio = new Date().getFullYear()
    const ultimo = await db.proceso.findFirst({
      where: { juzgadoId: juzgadoFinal, radicado: { startsWith: codigo12 + String(anio) } },
      orderBy: { radicado: 'desc' }
    })
    const consec = ultimo && ultimo.radicado.length >= 21 ? parseInt(ultimo.radicado.slice(16, 21), 10) + 1 : 1
    const radicadoFinal = generarRadicado(codigo12, anio, consec)

    const proceso = await db.proceso.create({
      data: {
        radicado: radicadoFinal,
        instancia: 'PRIMERA_INSTANCIA',
        categoriaProceso: datos.claseProceso === 'TUTELA' ? 'CONSTITUCIONAL' : 'CIVIL',
        claseProceso: datos.claseProceso || 'ORDINARIO',
        demanda: datos.demanda || 'Importado desde reparto',
        demandante: datos.demandante || 'Por definir',
        demandado: datos.demandado || 'Por definir',
        cuantia: datos.cuantia || null,
        moneda: 'COP',
        estado: 'ACTIVO',
        etapaProcesal: 'Admisión',
        observaciones: datos.radicado ? `Radicado en reparto: ${datos.radicado}` : 'Importado desde ZIP de reparto',
        juzgadoId: juzgadoFinal,
      }
    })

    // Crear Cuaderno principal por defecto (ley: siempre Primera/Segunda instancia, luego cuadernos)
    const cuadernoPrincipal = await db.cuaderno.create({
      data: { procesoId: proceso.id, nombre: 'Cuaderno principal', orden: 0 }
    })

    const timestamp = Date.now()

    for (const { nombre, buffer, carpeta } of archivosParaGuardar) {
      const ext = nombre.split('.').pop() || 'bin'
      const nombreArchivo = `${proceso.radicado}_${carpeta}_${timestamp}_${nombre.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const storageKey = `${proceso.radicado}/${carpeta}/${nombreArchivo}`
      const contentType = ext === 'pdf' ? 'application/pdf' : ext === 'docx' || ext === 'doc' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream'

      const storageResult = await uploadFile(storageKey, buffer, contentType)

      await db.archivoProceso.create({
        data: {
          procesoId: proceso.id,
          cuadernoId: cuadernoPrincipal.id,
          carpeta,
          nombreOriginal: nombre,
          nombreArchivo,
          ...(storageResult.type === 'bucket' ? { bucketKey: storageResult.key } : {}),
          tipoMime: contentType,
          tamano: buffer.length,
          version: 1,
          subidoPorId,
        }
      })
    }

    await db.historialActuacion.create({
      data: {
        procesoId: proceso.id,
        usuarioId: subidoPorId,
        tipo: 'CREACION_PROCESO',
        accion: 'Proceso importado desde reparto',
        descripcion: `ZIP con ${archivosParaGuardar.length} archivo(s). Datos extraídos: ${datos.demandante || '-'} vs ${datos.demandado || '-'}`,
        datos: JSON.stringify({ archivos: archivosParaGuardar.length, datosExtraidos: datos }),
      }
    })

    await db.notificacionSistema.create({
      data: {
        tipo: 'NUEVO_PROCESO',
        titulo: 'Proceso importado desde reparto',
        mensaje: `Se importó el proceso ${proceso.radicado} - ${proceso.demandante} vs ${proceso.demandado}`,
        procesoId: proceso.id,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        proceso: { id: proceso.id, radicado: proceso.radicado, demandante: proceso.demandante, demandado: proceso.demandado },
        archivosSubidos: archivosParaGuardar.length,
        datosExtraidos: datos,
        usoIA: tieneClaveOpenAI(),
      },
      message: `Proceso ${proceso.radicado} creado con ${archivosParaGuardar.length} archivo(s)`
    })
  } catch (error) {
    console.error('Error importando reparto:', error)
    return NextResponse.json(
      { success: false, error: String(error instanceof Error ? error.message : 'Error al importar') },
      { status: 500 }
    )
  }
}
