import { NextRequest, NextResponse } from 'next/server'
import { crearProcesoDesdeImportacion } from '@/lib/proceso-import-shared'
import { prepararImportacionDesdeEml } from '@/lib/eml-preparar-importacion'
import { extraerRadicadoPreferidoDesdeTextosImportacion } from '@/lib/radicado-expediente'
import { getUserFromHeader } from '@/lib/auth-utils'

const CODIGO_JUZGADO_DEFAULT = '11-031-CIV-051'
const CODIGO12_DEFAULT = '110013103051'

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file || file.size === 0) {
      return NextResponse.json({ success: false, error: 'Seleccione un archivo .eml' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'eml') {
      return NextResponse.json({ success: false, error: 'El archivo debe ser un correo (.eml)' }, { status: 400 })
    }

    let juzgadoFinal = user?.juzgadoId || null
    if (!juzgadoFinal) {
      const juzgado = await import('@/lib/db').then((m) =>
        m.db.juzgado.findFirst({ where: { codigo: CODIGO_JUZGADO_DEFAULT } })
      )
      if (juzgado) {
        juzgadoFinal = juzgado.id
      } else {
        const { db } = await import('@/lib/db')
        const primer = await db.juzgado.findFirst()
        if (!primer) {
          return NextResponse.json({
            success: false,
            error: 'No hay juzgados. Ejecute: npx tsx prisma/seed.ts',
          }, { status: 400 })
        }
        juzgadoFinal = primer.id
      }
    }

    const { db } = await import('@/lib/db')
    let subidoPorId = user?.id
    if (!subidoPorId) {
      const usuarioJuzgado = await db.usuario.findFirst({
        where: { juzgadoId: juzgadoFinal },
        select: { id: true },
      })
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
    const buffer = Buffer.from(bytes)
    const prep = await prepararImportacionDesdeEml(buffer, file.name)

    const juzgadoRow = await db.juzgado.findUnique({ where: { id: juzgadoFinal } })
    const codigo12 = (juzgadoRow?.codigoRadicacion12?.replace(/\D/g, '') || CODIGO12_DEFAULT).slice(0, 12)
    const radicadoPreferido = extraerRadicadoPreferidoDesdeTextosImportacion(prep.textosParaParseo, codigo12)

    const result = await crearProcesoDesdeImportacion({
      archivosParaGuardar: prep.archivos,
      textosParaParseo: prep.textosParaParseo,
      juzgadoId: juzgadoFinal,
      subidoPorId,
      observacionesOrigen: `Importado desde correo (.eml): ${file.name}`,
      forzarTutela: prep.forzarTutela,
      radicadoPreferido,
    })

    return NextResponse.json({
      success: true,
      data: {
        proceso: result.proceso,
        archivosSubidos: result.archivosSubidos,
        datosExtraidos: result.datosExtraidos,
        usoIA: result.usoIA,
        fusionadoEnExpedienteExistente: result.fusionadoEnExpedienteExistente,
      },
      message: result.fusionadoEnExpedienteExistente
        ? `Documentos importados al expediente local ${result.proceso.radicado} (${result.archivosSubidos} archivo(s))`
        : `Proceso ${result.proceso.radicado} creado con ${result.archivosSubidos} archivo(s)`,
    })
  } catch (error) {
    console.error('Error creando proceso desde .eml:', error)
    return NextResponse.json(
      { success: false, error: String(error instanceof Error ? error.message : 'Error al importar') },
      { status: 500 }
    )
  }
}
