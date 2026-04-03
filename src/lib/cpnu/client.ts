/**
 * Cliente HTTP a la API pública CPNU (Consulta de Procesos Nacional Unificada).
 * Base descubierta en el bundle del portal: :448/api/v2
 */

import type { PrismaClient } from '@prisma/client'

const DEFAULT_BASE = 'https://consultaprocesos.ramajudicial.gov.co:448/api/v2'

function getBaseUrl(): string {
  const b = process.env.CPNU_API_BASE_URL?.trim()
  return b && b.length > 0 ? b.replace(/\/$/, '') : DEFAULT_BASE
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export type CpnuProcesoLista = {
  idProceso: number
  idConexion: number
  llaveProceso: string
  fechaProceso: string
  despacho: string
  esPrivado?: boolean
}

export type CpnuDetalleProceso = {
  idRegProceso: number
  llaveProceso: string
  idConexion: number
  fechaProceso: string
  despacho: string
  ponente: string
  tipoProceso: string
  claseProceso: string
  subclaseProceso: string
  recurso: string
  ubicacion: string
  contenidoRadicacion: string | null
  fechaConsulta?: string
}

export type CpnuConsultaRadicacionResponse = {
  procesos: CpnuProcesoLista[]
  parametros?: { numero?: string }
}

function normRadicado(r: string): string {
  return r.replace(/\D/g, '')
}

/** Solo dígitos, 23 caracteres según Acuerdo 201/1997 */
export function radicadoCpnuValido(r: string): boolean {
  const d = normRadicado(r)
  return d.length === 23
}

export async function cpnuConsultarPorRadicado(radicado: string): Promise<CpnuConsultaRadicacionResponse> {
  const num = normRadicado(radicado)
  if (num.length !== 23) {
    throw new Error('El radicado debe tener 23 dígitos.')
  }
  const url = `${getBaseUrl()}/Procesos/Consulta/NumeroRadicacion?numero=${encodeURIComponent(num)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`CPNU respondió ${res.status}: ${text.slice(0, 200)}`)
  }
  return JSON.parse(text) as CpnuConsultaRadicacionResponse
}

export async function cpnuDetalleProceso(idProceso: number): Promise<CpnuDetalleProceso> {
  const url = `${getBaseUrl()}/Proceso/Detalle/${idProceso}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`CPNU detalle respondió ${res.status}: ${text.slice(0, 200)}`)
  }
  return JSON.parse(text) as CpnuDetalleProceso
}

/** Texto como en pantallas oficiales (mayúsculas) */
export function cpnuTextoPortal(s: string | null | undefined): string {
  if (s == null || typeof s !== 'string') return ''
  return s.trim().toUpperCase()
}

export type ProcesoConsultaCpnuMapped = {
  consultaDespacho: string | null
  consultaPonente: string | null
  consultaTipoProceso: string | null
  consultaClaseProceso: string | null
  consultaSubclaseProceso: string | null
  consultaRecurso: string | null
  consultaUbicacionExpediente: string | null
  fechaRadicacion?: Date
}

export function mapDetalleToProcesoConsulta(d: CpnuDetalleProceso): ProcesoConsultaCpnuMapped {
  return {
    consultaDespacho: cpnuTextoPortal(d.despacho) || null,
    consultaPonente: cpnuTextoPortal(d.ponente) || null,
    consultaTipoProceso: cpnuTextoPortal(d.tipoProceso) || null,
    consultaClaseProceso: cpnuTextoPortal(d.claseProceso) || null,
    consultaSubclaseProceso: cpnuTextoPortal(d.subclaseProceso) || null,
    consultaRecurso: cpnuTextoPortal(d.recurso) || null,
    consultaUbicacionExpediente: cpnuTextoPortal(d.ubicacion) || null,
    fechaRadicacion: d.fechaProceso ? new Date(d.fechaProceso) : undefined,
  }
}

/**
 * Persiste rubros CPNU con SQL directo para que funcione aunque `prisma generate`
 * no se haya ejecutado tras añadir columnas (p. ej. EPERM en Windows).
 */
export async function persistConsultaCpnuSql(
  db: PrismaClient,
  procesoId: string,
  m: ProcesoConsultaCpnuMapped,
  fechaRadicacionFallback: Date
): Promise<void> {
  const fecha = m.fechaRadicacion ?? fechaRadicacionFallback
  await db.$executeRaw`
    UPDATE procesos SET
      consultaDespacho = ${m.consultaDespacho},
      consultaPonente = ${m.consultaPonente},
      consultaTipoProceso = ${m.consultaTipoProceso},
      consultaClaseProceso = ${m.consultaClaseProceso},
      consultaSubclaseProceso = ${m.consultaSubclaseProceso},
      consultaRecurso = ${m.consultaRecurso},
      consultaUbicacionExpediente = ${m.consultaUbicacionExpediente},
      fechaRadicacion = ${fecha},
      updatedAt = ${new Date()}
    WHERE id = ${procesoId}
  `
}

/** Fusiona columnas consulta* leídas de SQLite (por si el cliente Prisma no las incluye en el SELECT). */
export async function mergeConsultaCpnuDesdeDb(
  db: PrismaClient,
  proceso: Record<string, unknown>,
  procesoId: string
): Promise<void> {
  try {
    const rows = await db.$queryRaw<
      Array<{
        consultaDespacho: string | null
        consultaPonente: string | null
        consultaTipoProceso: string | null
        consultaClaseProceso: string | null
        consultaSubclaseProceso: string | null
        consultaRecurso: string | null
        consultaUbicacionExpediente: string | null
      }>
    >`
      SELECT
        consultaDespacho,
        consultaPonente,
        consultaTipoProceso,
        consultaClaseProceso,
        consultaSubclaseProceso,
        consultaRecurso,
        consultaUbicacionExpediente
      FROM procesos
      WHERE id = ${procesoId}
      LIMIT 1
    `
    const r = rows[0]
    if (!r) return
    Object.assign(proceso, r)
  } catch {
    /* Tabla sin columnas CPNU (esquema antiguo) */
  }
}
