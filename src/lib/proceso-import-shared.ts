import { db } from '@/lib/db'
import { uploadFile } from '@/lib/storage'
import {
  generarRadicado,
  anioRadicacionEnCui,
  esAnioRadicacionPlausibleImportacionNueva,
} from '@/lib/radicado'
import { parsearTextoDocumentos, type DatosExtraidos } from '@/lib/parse-reparto'
import {
  extraerTextoDemandaDesdeTextosImportacion,
  parsearConIA,
  parsearDemandaConIA,
  tieneClaveOpenAI,
} from '@/lib/parse-reparto-ai'
import type { CarpetaArchivo, ClaseProceso } from '@prisma/client'

export type ArchivoImportRow = {
  nombre: string
  buffer: Buffer
  carpeta: CarpetaArchivo
}

const CODIGO_BASE_DEFAULT = '110013103051'

/**
 * Acta de reparto del Grupo de Reparto: PDF con nombre tipo "SEC 9822 J 51.pdf".
 * En expediente debe figurar como ActaReparto.pdf (misma pieza que la «secuencia de reparto» del correo).
 */
export function nombreBaseActaRepartoSiEsSecPdf(basename: string): string {
  const b = basename.trim()
  if (!/\.pdf$/i.test(b)) return basename
  if (!/^sec\s+\d+/i.test(b)) return basename
  return 'ActaReparto.pdf'
}

/** Aplica renombre ActaReparto al último segmento de una ruta (p. ej. dentro de un ZIP). */
export function rutaConActaRepartoSiEsSecPdf(rutaRelativa: string): string {
  const parts = rutaRelativa.split('/').filter(Boolean)
  if (parts.length === 0) return rutaRelativa
  const last = parts[parts.length - 1]!
  parts[parts.length - 1] = nombreBaseActaRepartoSiEsSecPdf(last)
  return parts.join('/')
}

/**
 * Imágenes incrustadas de Outlook (firma, HTML) que no son documentos del proceso.
 * Ej.: Outlook-Escala de .png, Outlook-cw2zwvzv.png
 */
export function esAdjuntoOutlookEmbeddedIgnorable(nombreArchivo: string): boolean {
  const base = (nombreArchivo.split(/[/\\]/).pop() || nombreArchivo).trim()
  return /^Outlook-.+\.(png|gif|jpe?g|webp)$/i.test(base)
}

/** Alineado a reglas de nombres en SGDE: sin caracteres de ruta ni metacaracteres de sistema. */
export function sanitizarNombreDocumentoExpediente(nombre: string): string {
  let s = nombre.trim()
  s = s.replace(/[/\\:*?"<>|#]/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s || 'documento'
}

export function clasificarCarpetaNombre(nombre: string): CarpetaArchivo {
  const base = nombre.split('/').pop() || nombre
  const n = base.toLowerCase()
  if (/secuencia/i.test(n) && (n.startsWith('00') || /\.txt$/i.test(base))) return 'CONSTANCIAS'
  if (/^demanda_/i.test(base)) return 'DEMANDA'
  if (/^demanda\.pdf$/i.test(base)) return 'DEMANDA'
  if (/^prueba_/i.test(base)) return 'ANEXOS'
  if (/^pruebasanexos\.pdf$/i.test(base)) return 'ANEXOS'
  if (/^anexosprueba\.pdf$/i.test(base)) return 'ANEXOS'
  if (/^poder\.pdf$/i.test(base)) return 'PODERES'
  if (/^poder_/i.test(base)) return 'PODERES'
  if (/apoderamiento/i.test(n) && /\.pdf$/i.test(base)) return 'PODERES'
  if (/^actareparto\.pdf$/i.test(base)) return 'ACTA_REPARTO'
  if (/^correoreparto\.pdf$/i.test(base)) return 'CONSTANCIAS'
  if (n.includes('acta') || n.includes('reparto') || /^sec\s+\d+/i.test(base)) return 'ACTA_REPARTO'
  if (n.includes('informe') || n.includes('ingreso')) return 'INFORME_INGRESO_DESPACHO'
  if (n.includes('anexo')) return 'ANEXOS'
  return 'DEMANDA'
}

async function adjuntarArchivosACuaderno(params: {
  procesoId: string
  cuadernoId: string
  radicado: string
  archivosParaGuardar: ArchivoImportRow[]
  subidoPorId: string
}): Promise<number> {
  const { procesoId, cuadernoId, radicado, archivosParaGuardar, subidoPorId } = params
  const timestamp = Date.now()
  for (const { nombre, buffer, carpeta } of archivosParaGuardar) {
    const ext = nombre.split('.').pop() || 'bin'
    const nombreArchivo = `${radicado}_${carpeta}_${timestamp}_${nombre.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const storageKey = `${radicado}/${carpeta}/${nombreArchivo}`
    const contentType =
      ext === 'pdf'
        ? 'application/pdf'
        : ext === 'docx' || ext === 'doc'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/octet-stream'

    const storageResult = await uploadFile(storageKey, buffer, contentType)

    await db.archivoProceso.create({
      data: {
        procesoId,
        cuadernoId,
        carpeta,
        nombreOriginal: sanitizarNombreDocumentoExpediente(nombre.split('/').pop() || nombre),
        nombreArchivo,
        ...(storageResult.type === 'bucket' ? { bucketKey: storageResult.key } : {}),
        tipoMime: contentType,
        tamano: buffer.length,
        version: 1,
        subidoPorId,
      },
    })
  }
  return archivosParaGuardar.length
}

export async function crearProcesoDesdeImportacion(params: {
  archivosParaGuardar: ArchivoImportRow[]
  textosParaParseo: string[]
  juzgadoId: string
  subidoPorId: string
  observacionesOrigen: string
  forzarTutela?: boolean
  /** Si el correo/documentos indican un radicado de 23 dígitos (mismo despacho), se usa ese en BD o se fusiona si ya existe */
  radicadoPreferido?: string
}): Promise<{
  proceso: {
    id: string
    radicado: string
    demandante: string
    demandado: string
    demanda: string
  }
  datosExtraidos: DatosExtraidos
  archivosSubidos: number
  usoIA: boolean
  fusionadoEnExpedienteExistente: boolean
}> {
  const {
    archivosParaGuardar,
    textosParaParseo,
    juzgadoId,
    subidoPorId,
    observacionesOrigen,
    forzarTutela,
    radicadoPreferido,
  } = params

  let datos = parsearTextoDocumentos(textosParaParseo)
  if (tieneClaveOpenAI() && textosParaParseo.length > 0) {
    const textoDemanda = extraerTextoDemandaDesdeTextosImportacion(textosParaParseo)
    if (textoDemanda) {
      const datosDemanda = await parsearDemandaConIA(textoDemanda)
      if (datosDemanda) datos = { ...datos, ...datosDemanda }
    } else {
      const textoCompleto = textosParaParseo.join('\n\n').slice(0, 12000)
      const datosIA = await parsearConIA(textoCompleto)
      if (datosIA) datos = { ...datos, ...datosIA }
    }
  }

  const obsIa = [
    datos.tipoProcesoDescripcion ? `Tipo (IA): ${datos.tipoProcesoDescripcion}` : '',
    datos.claseProcesoGrupoCGP ? `Clase CGP (IA): ${datos.claseProcesoGrupoCGP}` : '',
    datos.apoderadosDemandante ? `Apod. demandante (IA): ${datos.apoderadosDemandante.slice(0, 220)}` : '',
    datos.apoderadosDemandado ? `Apod. demandado (IA): ${datos.apoderadosDemandado.slice(0, 220)}` : '',
    datos.pretensiones ? `Pretensiones: ${datos.pretensiones}` : '',
    datos.derechosVulnerados ? `Derechos invocados: ${datos.derechosVulnerados}` : '',
    datos.observacionesExtraccion ? datos.observacionesExtraccion : '',
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 1200)

  const esTutela = forzarTutela || datos.claseProceso === 'TUTELA' || /tutela/i.test(textosParaParseo.join(' '))
  const claseFinal = (esTutela ? 'TUTELA' : datos.claseProceso || 'ORDINARIO') as ClaseProceso
  const categoriaFinal = claseFinal === 'TUTELA' ? 'CONSTITUCIONAL' : 'CIVIL'

  const juzgado = await db.juzgado.findUnique({ where: { id: juzgadoId } })
  const codigo12 = (juzgado?.codigoRadicacion12?.replace(/\D/g, '') || CODIGO_BASE_DEFAULT).slice(0, 12)

  let radicadoObjetivo: string | undefined
  if (radicadoPreferido) {
    const limpio = radicadoPreferido.replace(/\D/g, '')
    if (limpio.length === 23 && limpio.startsWith(codigo12)) {
      const yaExiste = await db.proceso.findFirst({
        where: { juzgadoId, radicado: limpio },
        select: { id: true },
      })
      if (yaExiste) {
        radicadoObjetivo = limpio
      } else {
        const anioCui = anioRadicacionEnCui(limpio)
        if (anioCui !== null && esAnioRadicacionPlausibleImportacionNueva(anioCui)) {
          radicadoObjetivo = limpio
        }
      }
    }
  }

  let obs = observacionesOrigen
  if (datos.radicado) obs += ` · Ref. documentos: ${datos.radicado}`
  if (obsIa) obs = `${obs} · ${obsIa}`.slice(0, 2000)

  if (radicadoObjetivo) {
    const existente = await db.proceso.findFirst({
      where: { juzgadoId, radicado: radicadoObjetivo },
    })
    if (existente) {
      let cuaderno = await db.cuaderno.findFirst({
        where: { procesoId: existente.id },
        orderBy: { orden: 'asc' },
      })
      if (!cuaderno) {
        cuaderno = await db.cuaderno.create({
          data: { procesoId: existente.id, nombre: 'Cuaderno principal', orden: 0 },
        })
      }
      const archivosSubidos = await adjuntarArchivosACuaderno({
        procesoId: existente.id,
        cuadernoId: cuaderno.id,
        radicado: existente.radicado,
        archivosParaGuardar,
        subidoPorId,
      })

      const upd: {
        demandante?: string
        demandado?: string
        demanda?: string
        observaciones?: string
        demandanteId?: string | null
        demandadoId?: string | null
      } = {}
      if (datos.demandante && existente.demandante === 'Por definir') upd.demandante = datos.demandante
      if (datos.demandado && existente.demandado === 'Por definir') upd.demandado = datos.demandado
      if (datos.documentoDemandante && !existente.demandanteId) upd.demandanteId = datos.documentoDemandante
      if (datos.documentoDemandado && !existente.demandadoId) upd.demandadoId = datos.documentoDemandado
      const obsNueva = [existente.observaciones, obs].filter(Boolean).join(' · ').slice(0, 2000)
      if (obsNueva !== existente.observaciones) upd.observaciones = obsNueva
      if (Object.keys(upd).length > 0) {
        await db.proceso.update({ where: { id: existente.id }, data: upd })
      }

      const actualizado = await db.proceso.findUniqueOrThrow({ where: { id: existente.id } })

      await db.historialActuacion.create({
        data: {
          procesoId: existente.id,
          usuarioId: subidoPorId,
          tipo: 'DOCUMENTO',
          accion: 'Importación a expediente existente (correo / documentos)',
          descripcion: `Añadidos ${archivosSubidos} archivo(s). ${datos.demandante || '-'} vs ${datos.demandado || '-'}`,
          datos: JSON.stringify({ fusionado: true, archivos: archivosParaGuardar.length, datosExtraidos: datos }),
        },
      })

      return {
        proceso: {
          id: actualizado.id,
          radicado: actualizado.radicado,
          demandante: actualizado.demandante,
          demandado: actualizado.demandado,
          demanda: actualizado.demanda,
        },
        datosExtraidos: datos,
        archivosSubidos,
        usoIA: tieneClaveOpenAI(),
        fusionadoEnExpedienteExistente: true,
      }
    }
  }

  const anio = new Date().getFullYear()
  let radicadoFinal: string
  if (radicadoObjetivo) {
    radicadoFinal = radicadoObjetivo
  } else {
    const ultimo = await db.proceso.findFirst({
      where: { juzgadoId, radicado: { startsWith: codigo12 + String(anio) } },
      orderBy: { radicado: 'desc' },
    })
    const consec =
      ultimo && ultimo.radicado.length >= 21 ? parseInt(ultimo.radicado.slice(16, 21), 10) + 1 : 1
    radicadoFinal = generarRadicado(codigo12, anio, consec)
  }

  const proceso = await db.proceso.create({
    data: {
      radicado: radicadoFinal,
      instancia: 'PRIMERA_INSTANCIA',
      categoriaProceso: categoriaFinal,
      claseProceso: claseFinal,
      demanda: datos.demanda || 'Proceso creado desde importación (correo/documentos)',
      demandante: datos.demandante || 'Por definir',
      demandado: datos.demandado || 'Por definir',
      demandanteId: datos.documentoDemandante ?? null,
      demandadoId: datos.documentoDemandado ?? null,
      cuantia: datos.cuantia || null,
      moneda: 'COP',
      estado: 'ACTIVO',
      etapaProcesal: 'Admisión',
      observaciones: obs.slice(0, 2000),
      juzgadoId,
    },
  })

  const cuadernoPrincipal = await db.cuaderno.create({
    data: { procesoId: proceso.id, nombre: 'Cuaderno principal', orden: 0 },
  })

  const archivosSubidos = await adjuntarArchivosACuaderno({
    procesoId: proceso.id,
    cuadernoId: cuadernoPrincipal.id,
    radicado: proceso.radicado,
    archivosParaGuardar,
    subidoPorId,
  })

  await db.historialActuacion.create({
    data: {
      procesoId: proceso.id,
      usuarioId: subidoPorId,
      tipo: 'CREACION_PROCESO',
      accion: 'Proceso creado desde importación',
      descripcion: `Datos extraídos: ${datos.demandante || '-'} vs ${datos.demandado || '-'}`,
      datos: JSON.stringify({ archivos: archivosParaGuardar.length, datosExtraidos: datos, radicadoPreferido: radicadoObjetivo ?? null }),
    },
  })

  await db.notificacionSistema.create({
    data: {
      tipo: 'NUEVO_PROCESO',
      titulo: 'Nuevo proceso desde importación',
      mensaje: `Se creó el proceso ${proceso.radicado} - ${proceso.demandante} vs ${proceso.demandado}`,
      procesoId: proceso.id,
    },
  })

  return {
    proceso: {
      id: proceso.id,
      radicado: proceso.radicado,
      demandante: proceso.demandante,
      demandado: proceso.demandado,
      demanda: proceso.demanda,
    },
    datosExtraidos: datos,
    archivosSubidos,
    usoIA: tieneClaveOpenAI(),
    fusionadoEnExpedienteExistente: false,
  }
}
