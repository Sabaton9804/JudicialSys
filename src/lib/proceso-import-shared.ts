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
 * Nombres de PDF consolidados / constancia en importación EML-ZIP (PascalCase: una mayúscula inicial por palabra).
 * Compatibilidad: siguen reconociéndose `Demanda.pdf`, `PruebasAnexos.pdf` y `AnexosPrueba.pdf` en carpetas y parseo.
 */
export const PDF_CANONICO_CORREO_REPARTO = 'CorreoReparto.pdf'
export const PDF_CANONICO_ACTA_REPARTO = 'ActaReparto.pdf'
export const PDF_CANONICO_ANEXOS_PRUEBAS = 'AnexosPruebas.pdf'
export const PDF_CANONICO_ESCRITO_DEMANDA = 'EscritoDemanda.pdf'
export const PDF_CANONICO_PODER = 'Poder.pdf'

/** PDF con nombre consolidado estándar (sin prefijo `link_` al guardar desde enlace). Incluye legados. */
export function esPdfNombreConsolidadoTramiteLinea(leaf: string): boolean {
  const s = (leaf.split('/').pop() || leaf).trim().toLowerCase()
  const canon = new Set([
    PDF_CANONICO_CORREO_REPARTO.toLowerCase(),
    PDF_CANONICO_ACTA_REPARTO.toLowerCase(),
    PDF_CANONICO_ANEXOS_PRUEBAS.toLowerCase(),
    PDF_CANONICO_ESCRITO_DEMANDA.toLowerCase(),
    PDF_CANONICO_PODER.toLowerCase(),
    'demanda.pdf',
    'pruebasanexos.pdf',
    'anexosprueba.pdf',
  ])
  return canon.has(s)
}

/**
 * Correo/ZIP «Demanda en línea» (civil, Rama), p. ej. asunto o archivo
 * `RV_ Generación de la Demanda en línea No … .eml`. No debe clasificarse como tutela.
 */
export function textoSugiereDemandaCivilEnLinea(texto: string): boolean {
  if (!texto.trim()) return false
  return (
    /demanda\s+en\s+l[ií]nea/i.test(texto) ||
    /generaci[oó]n\s+de\s+la\s+demanda/i.test(texto)
  )
}

/**
 * Acta de reparto: PDF del correo con nombre tipo "SEC 9822 J 51.pdf" (Grupo de Reparto)
 * o "JUZ 51CC ACTA REPARTO 10091.pdf" (juzgado). En expediente se unifica como ActaReparto.pdf.
 */
export function nombreBaseActaRepartoSiEsSecPdf(basename: string): string {
  const b = basename.trim()
  if (!/\.pdf$/i.test(b)) return basename
  if (/^sec\s+\d+/i.test(b)) return 'ActaReparto.pdf'
  const lower = b.toLowerCase()
  if (lower.includes('acta') && lower.includes('reparto')) return 'ActaReparto.pdf'
  return basename
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
  const rutaNorm = nombre.replace(/\\/g, '/')
  const base = rutaNorm.split('/').pop() || nombre
  const n = base.toLowerCase()
  const segmentos = rutaNorm.split('/').filter(Boolean)
  if (segmentos.length >= 2) {
    const carpetasPadre = segmentos.slice(0, -1)
    if (carpetasPadre.some((s) => /^poderes$/i.test(s.trim()))) return 'PODERES'
  }
  if (/secuencia/i.test(n) && (n.startsWith('00') || /\.txt$/i.test(base))) return 'CONSTANCIAS'
  // Tutela/demanda en línea (Rama): DEMANDA_1_… o DEMANDA25032026_… (sin guion bajo tras la palabra)
  if (/^demanda_/i.test(base) || /^demanda\d/i.test(base)) return 'DEMANDA'
  if (/^(demanda|escritodemanda)\.pdf$/i.test(base)) return 'DEMANDA'
  if (/^prueba_/i.test(base) || /^prueba\d/i.test(base)) return 'ANEXOS'
  if (/^(pruebasanexos|anexosprueba|anexospruebas)\.pdf$/i.test(base)) return 'ANEXOS'
  if (/^poder\.pdf$/i.test(base)) return 'PODERES'
  if (/^poder_/i.test(base) || /^poder\d/i.test(base)) return 'PODERES'
  if (/^poderes(?:[._\s-]|$)/i.test(base) || /\bpoderes\b/i.test(base)) return 'PODERES'
  if (/\bpoder\b/i.test(n) && !/demandante/i.test(n) && !/^demanda[_\d]/i.test(base)) return 'PODERES'
  if (/apoderamiento/i.test(n) && /\.pdf$/i.test(base)) return 'PODERES'
  if (/^actareparto\.pdf$/i.test(base)) return 'ACTA_REPARTO'
  if (/^correoreparto\.pdf$/i.test(base)) return 'CONSTANCIAS'
  // Acta reparto civil: p. ej. "12133 JDO 51 CCTO.pdf" (JDO + CCTO, sin "acta" en el nombre)
  if (/\bjdo\b/i.test(base) && /\bccto\b/i.test(n) && /\.pdf$/i.test(base)) return 'ACTA_REPARTO'
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

  const textoContextoImport = `${observacionesOrigen}\n${textosParaParseo.join('\n')}`
  const pistasDemandaCivilEnLinea = textoSugiereDemandaCivilEnLinea(textoContextoImport)

  let esTutela = Boolean(
    forzarTutela || datos.claseProceso === 'TUTELA' || /tutela/i.test(textosParaParseo.join(' '))
  )
  if (pistasDemandaCivilEnLinea) esTutela = false

  const claseProcesoDatos = datos.claseProceso as ClaseProceso | undefined
  const claseNoTutela =
    pistasDemandaCivilEnLinea && claseProcesoDatos === 'TUTELA' ? undefined : claseProcesoDatos

  const claseFinal = (esTutela ? 'TUTELA' : claseNoTutela || 'ORDINARIO') as ClaseProceso
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
