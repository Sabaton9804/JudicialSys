import { db } from '@/lib/db'
import { uploadFile } from '@/lib/storage'
import { sanearHtmlPlantilla } from '@/lib/plantillas/sanitize-html-plantilla'
import { reemplazarVariablesPlantilla } from '@/lib/plantillas/reemplazar-variables'
import { htmlCompletoAPdfChromium } from '@/lib/plantillas/html-to-pdf-documento'
import {
  envolverHtmlInformePdf,
  HTML_PLANTILLA_INFORME_INGRESO_DEFAULT,
} from '@/lib/plantillas/default-plantilla-informe'
import { construirVariablesInformeIngreso } from '@/lib/plantillas/variables-informe-ingreso'

export type ResultadoGenerarInforme = {
  ok: true
  archivoId: string
  version: number
  regeneracion: boolean
  plantillaId: string | null
  plantillaVersion: number
} | { ok: false; codigo: string; mensaje: string }

async function resolverPlantillaHtml(juzgadoId: string): Promise<{ html: string; plantillaId: string | null; plantillaVersion: number }> {
  const propia = await db.plantillaDocumento.findFirst({
    where: {
      juzgadoId,
      tipo: 'INFORME_INGRESO_DESPACHO',
      activa: true,
    },
    orderBy: { updatedAt: 'desc' },
  })
  if (propia) {
    return { html: propia.htmlContenido, plantillaId: propia.id, plantillaVersion: propia.version }
  }
  const global = await db.plantillaDocumento.findFirst({
    where: {
      juzgadoId: null,
      tipo: 'INFORME_INGRESO_DESPACHO',
      activa: true,
    },
    orderBy: { updatedAt: 'desc' },
  })
  if (global) {
    return { html: global.htmlContenido, plantillaId: global.id, plantillaVersion: global.version }
  }
  return { html: HTML_PLANTILLA_INFORME_INGRESO_DEFAULT, plantillaId: null, plantillaVersion: 0 }
}

/** Validación mínima para no generar documentos manifiestamente incompletos. */
export function validarProcesoParaInformeIngreso(proceso: {
  radicado: string
  demandante: string
  demandado: string
  claseProceso: string | null | undefined
}): { ok: true } | { ok: false; mensaje: string } {
  if (!proceso.radicado?.trim()) return { ok: false, mensaje: 'Falta radicado.' }
  if (!proceso.claseProceso) return { ok: false, mensaje: 'Falta clase de proceso.' }
  if (!proceso.demandante?.trim()) return { ok: false, mensaje: 'Falta demandante.' }
  if (!proceso.demandado?.trim()) return { ok: false, mensaje: 'Falta demandado.' }
  return { ok: true }
}

export async function generarInformeIngresoDespacho(params: {
  procesoId: string
  subidoPorId: string
  regenerar?: boolean
  medioIngreso?: string
  origenProceso?: string
}): Promise<ResultadoGenerarInforme> {
  const { procesoId, subidoPorId, regenerar } = params

  const proceso = await db.proceso.findUnique({
    where: { id: procesoId },
    include: {
      juzgado: true,
      secretario: true,
    },
  })
  if (!proceso) {
    return { ok: false, codigo: 'NOT_FOUND', mensaje: 'Proceso no encontrado.' }
  }

  const v = validarProcesoParaInformeIngreso(proceso)
  if (!v.ok) {
    return { ok: false, codigo: 'VALIDACION', mensaje: v.mensaje }
  }

  const existentes = await db.archivoProceso.findMany({
    where: {
      procesoId,
      carpeta: 'INFORME_INGRESO_DESPACHO',
      eliminado: false,
    },
    orderBy: { version: 'desc' },
    take: 1,
  })
  const ultimo = existentes[0]

  if (ultimo && !regenerar) {
    return {
      ok: false,
      codigo: 'YA_EXISTE',
      mensaje: 'Ya existe un informe de ingreso. Use regenerar para crear una nueva versión.',
    }
  }

  const { html: plantillaRaw, plantillaId, plantillaVersion } = await resolverPlantillaHtml(proceso.juzgadoId)
  const plantillaSana = sanearHtmlPlantilla(plantillaRaw)
  const vars = construirVariablesInformeIngreso({
    proceso,
    juzgado: proceso.juzgado,
    secretario: proceso.secretario,
    medioIngreso: params.medioIngreso,
    origenProceso: params.origenProceso,
  })
  const cuerpo = reemplazarVariablesPlantilla(plantillaSana, vars)
  const htmlFull = envolverHtmlInformePdf(cuerpo)

  let pdf: Buffer
  try {
    pdf = await htmlCompletoAPdfChromium(htmlFull)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al generar PDF'
    return { ok: false, codigo: 'PDF', mensaje: msg }
  }

  const version = ultimo ? ultimo.version + 1 : 1
  const timestamp = Date.now()
  const nombreOriginal =
    version > 1
      ? `InformeIngresoDespacho_v${version}.pdf`
      : 'InformeIngresoDespacho.pdf'
  const nombreArchivo = `${proceso.radicado}_INFORME_INGRESO_DESPACHO_${timestamp}.pdf`
  const carpeta = 'INFORME_INGRESO_DESPACHO' as const
  const storageKey = `${proceso.radicado}/${carpeta}/${nombreArchivo}`

  const storageResult = await uploadFile(storageKey, pdf, 'application/pdf')

  const archivo = await db.archivoProceso.create({
    data: {
      procesoId,
      cuadernoId: null,
      carpeta,
      orden: 0,
      nombreOriginal,
      nombreArchivo,
      ...(storageResult.type === 'bucket' ? { bucketKey: storageResult.key } : {}),
      tipoMime: 'application/pdf',
      tamano: pdf.length,
      version,
      archivoPadreId: ultimo?.id ?? null,
      descripcion: regenerar
        ? `Regeneración (plantilla ${plantillaId ?? 'por defecto'} v${plantillaVersion}).`
        : `Generado automáticamente (plantilla ${plantillaId ?? 'por defecto'} v${plantillaVersion}).`,
      subidoPorId,
      etiquetas: JSON.stringify({
        tipo: 'INFORME_INGRESO_DESPACHO',
        plantillaId,
        plantillaVersion,
        regeneracion: !!regenerar,
      }),
    },
  })

  await db.historialActuacion.create({
    data: {
      procesoId,
      usuarioId: subidoPorId,
      tipo: 'DOCUMENTO',
      accion: regenerar ? 'Informe de ingreso al despacho (nueva versión)' : 'Informe de ingreso al despacho generado',
      descripcion: `PDF incorporado al expediente. Versión ${version}. Radicado ${proceso.radicado}.`,
      datos: JSON.stringify({
        archivoId: archivo.id,
        plantillaId,
        plantillaVersion,
        versionArchivo: version,
        regeneracion: !!regenerar,
      }),
    },
  })

  return {
    ok: true,
    archivoId: archivo.id,
    version,
    regeneracion: !!regenerar,
    plantillaId,
    plantillaVersion,
  }
}
