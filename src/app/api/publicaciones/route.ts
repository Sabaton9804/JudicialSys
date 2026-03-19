/**
 * API pública — consulta de publicaciones procesales (categorías alineadas al portal nacional:
 * autos/sentencias, notificaciones por estado y por aviso, oficios, traslados).
 * Sin autenticación.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  EstadoProvidencia,
  TipoNotificacion,
  EstadoNotificacion,
  EstadoOficio,
  TipoAuto,
} from '@prisma/client'
import { getTipoAutoLabel } from '@/lib/tipo-auto-labels'
import { formatoEstadoNumero } from '@/lib/edicion-estado'

export type CategoriaPublicacion =
  | 'AUTOS_Y_SENTENCIAS'
  | 'NOTIFICACIONES_POR_ESTADO'
  | 'NOTIFICACIONES_POR_AVISO'
  | 'OFICIOS'
  | 'TRASLADOS'

const NOTIF_PUBLICAS = [EstadoNotificacion.ENVIADA, EstadoNotificacion.ENTREGADA]

/**
 * El ciudadano a veces escribe un dígito de más o de menos que el radicado guardado.
 * Prisma `contains` exige que el CAMPO contenga el texto buscado; si el usuario pega
 * `...5000` y en BD está `...500`, no coincidía. Probamos variantes (truncar final, solo dígitos).
 */
function buildProcesoRadicadoWhere(radicado: string | null) {
  if (!radicado?.trim()) return undefined
  const r = radicado.trim()
  const digits = r.replace(/\D/g, '')
  const variants = new Set<string>()
  variants.add(r)
  if (digits.length >= 10) variants.add(digits)
  for (let i = 1; i <= 4; i++) {
    if (r.length - i >= 10) variants.add(r.slice(0, -i))
    if (digits.length - i >= 10) variants.add(digits.slice(0, -i))
  }
  const list = [...variants].filter((q) => q.length >= 10)
  if (list.length === 0) {
    return { radicado: { contains: r } }
  }
  return {
    OR: list.map((q) => ({
      radicado: { contains: q },
    })),
  }
}

type ItemLista = {
  kind: 'providencia' | 'notificacion' | 'oficio' | 'traslado'
  id: string
  titulo: string
  detalle: string
  radicado?: string
  fechaRef: Date
  juzgadoId: string
  juzgadoNombre: string
}

function agruparPorFechaJuzgado(items: ItemLista[]) {
  const mapa = new Map<
    string,
    {
      fechaPublicacion: string
      juzgadoId: string
      juzgadoNombre: string
      items: Array<{
        kind: ItemLista['kind']
        id: string
        titulo: string
        detalle: string
        radicado?: string
      }>
    }
  >()

  for (const raw of items) {
    const fechaPub = raw.fechaRef.toISOString().slice(0, 10)
    const key = `${fechaPub}|${raw.juzgadoId}`
    const { fechaRef, juzgadoId: _j, juzgadoNombre: _n, ...rest } = raw
    if (!mapa.has(key)) {
      mapa.set(key, {
        fechaPublicacion: fechaPub,
        juzgadoId: raw.juzgadoId,
        juzgadoNombre: raw.juzgadoNombre,
        items: [],
      })
    }
    mapa.get(key)!.items.push(rest)
  }

  return Array.from(mapa.values()).sort((a, b) => {
    if (a.fechaPublicacion !== b.fechaPublicacion) {
      return b.fechaPublicacion.localeCompare(a.fechaPublicacion)
    }
    return a.juzgadoNombre.localeCompare(b.juzgadoNombre, 'es')
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const radicado = searchParams.get('radicado')
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const tipoProv = searchParams.get('tipo') as 'AUTO' | 'SENTENCIA' | null
    const limit = Math.min(parseInt(searchParams.get('limit') || '80'), 150)

    const catRaw = searchParams.get('categoria') || 'AUTOS_Y_SENTENCIAS'
    const categoria = (['AUTOS_Y_SENTENCIAS', 'NOTIFICACIONES_POR_ESTADO', 'NOTIFICACIONES_POR_AVISO', 'OFICIOS', 'TRASLADOS'].includes(
      catRaw
    )
      ? catRaw
      : 'AUTOS_Y_SENTENCIAS') as CategoriaPublicacion

    const filtroProcesoRadicado = buildProcesoRadicadoWhere(radicado)

    if (categoria === 'AUTOS_Y_SENTENCIAS') {
      const where: Record<string, unknown> = { estado: EstadoProvidencia.NOTIFICADO }
      if (filtroProcesoRadicado) where.proceso = filtroProcesoRadicado
      if (tipoProv) where.tipo = tipoProv
      if (desde || hasta) {
        const fn: Record<string, Date> = {}
        if (desde) fn.gte = new Date(`${desde}T00:00:00`)
        if (hasta) fn.lte = new Date(`${hasta}T23:59:59`)
        where.fechaNotificacion = fn
      }

      const rows = await db.providencia.findMany({
        where,
        include: {
          proceso: {
            select: {
              id: true,
              radicado: true,
              demandante: true,
              demandado: true,
              claseProceso: true,
              juzgadoId: true,
              juzgado: { select: { id: true, nombre: true } },
            },
          },
          firmadoPor: { select: { nombre: true } },
          edicionEstado: {
            select: {
              id: true,
              numero: true,
              anio: true,
              fechaPublicacion: true,
              observacion: true,
            },
          },
        },
        orderBy: { fechaNotificacion: 'desc' },
        take: limit,
      })

      const items: ItemLista[] = []
      type FilaEdicion = {
        kind: 'providencia'
        id: string
        radicado: string
        demandante: string
        demandado: string
        tipoActuacion: string
        observacion: string | null
        fecha: string
        titulo: string
        detalle: string
      }
      const edicionBuckets = new Map<
        string,
        {
          edicionId: string | null
          numero: number | null
          anio: number | null
          observacionEdicion: string | null
          fechaPublicacion: string
          juzgadoId: string
          juzgadoNombre: string
          filas: FilaEdicion[]
        }
      >()

      for (const p of rows) {
        const fn = p.fechaNotificacion
        if (!fn) continue

        items.push({
          kind: 'providencia',
          id: p.id,
          titulo: `${p.tipo}${p.numero ? ` ${p.numero}` : ''}`.trim(),
          detalle: p.asunto,
          radicado: p.proceso.radicado,
          fechaRef: fn,
          juzgadoId: p.proceso.juzgadoId,
          juzgadoNombre: p.proceso.juzgado?.nombre ?? 'Juzgado',
        })

        const ed = p.edicionEstado
        const bucketKey = ed?.id ?? `legacy|${fn.toISOString().slice(0, 10)}|${p.proceso.juzgadoId}`
        if (!edicionBuckets.has(bucketKey)) {
          edicionBuckets.set(bucketKey, {
            edicionId: ed?.id ?? null,
            numero: ed?.numero ?? null,
            anio: ed?.anio ?? null,
            observacionEdicion: ed?.observacion ?? null,
            fechaPublicacion: (ed?.fechaPublicacion ?? fn).toISOString().slice(0, 10),
            juzgadoId: p.proceso.juzgadoId,
            juzgadoNombre: p.proceso.juzgado?.nombre ?? 'Juzgado',
            filas: [],
          })
        }
        const tipoActuacion = getTipoAutoLabel(p.tipoAuto as TipoAuto | null, p.tipo, p.asunto)
        edicionBuckets.get(bucketKey)!.filas.push({
          kind: 'providencia',
          id: p.id,
          radicado: p.proceso.radicado,
          demandante: p.proceso.demandante,
          demandado: p.proceso.demandado,
          tipoActuacion,
          observacion: p.observaciones ?? null,
          fecha: fn.toISOString(),
          titulo: `${p.tipo}${p.numero ? ` ${p.numero}` : ''}`.trim(),
          detalle: p.asunto,
        })
      }

      for (const b of edicionBuckets.values()) {
        b.filas.sort((a, c) => a.radicado.localeCompare(c.radicado, 'es'))
      }

      const ediciones = Array.from(edicionBuckets.values())
        .map((b) => ({
          ...b,
          etiqueta:
            b.numero != null && b.anio != null
              ? `Estado N.º ${formatoEstadoNumero(b.numero)} de ${b.anio}`
              : `Publicación en el estado (${b.fechaPublicacion})`,
        }))
        .sort((a, b) => {
          if (a.fechaPublicacion !== b.fechaPublicacion) {
            return b.fechaPublicacion.localeCompare(a.fechaPublicacion)
          }
          return (b.numero ?? 0) - (a.numero ?? 0)
        })

      const grupos = agruparPorFechaJuzgado(items)

      return NextResponse.json({
        success: true,
        categoria,
        ediciones,
        grupos,
        data: rows.map((p) => ({
          id: p.id,
          kind: 'providencia' as const,
          tipo: p.tipo,
          numero: p.numero,
          asunto: p.asunto,
          fechaNotificacion: p.fechaNotificacion,
          firmadoPor: p.firmadoPor?.nombre,
          proceso: p.proceso,
        })),
      })
    }

    if (categoria === 'NOTIFICACIONES_POR_ESTADO') {
      const where: Record<string, unknown> = {
        tipo: TipoNotificacion.POR_ESTADO,
        estado: { in: NOTIF_PUBLICAS },
      }
      if (filtroProcesoRadicado) where.proceso = filtroProcesoRadicado
      if (desde || hasta) {
        const fe: Record<string, Date> = {}
        if (desde) fe.gte = new Date(`${desde}T00:00:00`)
        if (hasta) fe.lte = new Date(`${hasta}T23:59:59`)
        where.fechaEnvio = fe
      }

      const rows = await db.notificacion.findMany({
        where,
        include: {
          proceso: {
            select: {
              radicado: true,
              juzgadoId: true,
              juzgado: { select: { nombre: true } },
            },
          },
        },
        orderBy: { fechaEnvio: 'desc' },
        take: limit,
      })

      const items: ItemLista[] = rows.map((n) => {
        const f = n.fechaEnvio ?? n.fechaEntrega ?? n.createdAt
        const short = n.autoNotificar.length > 90 ? `${n.autoNotificar.slice(0, 90)}…` : n.autoNotificar
        return {
          kind: 'notificacion' as const,
          id: n.id,
          titulo: `Registro notificación (estado): ${short}`,
          detalle: `${n.destinatario} · ${n.medio}`,
          radicado: n.proceso.radicado,
          fechaRef: f,
          juzgadoId: n.proceso.juzgadoId,
          juzgadoNombre: n.proceso.juzgado?.nombre ?? 'Juzgado',
        }
      })

      return NextResponse.json({ success: true, categoria, grupos: agruparPorFechaJuzgado(items), data: rows })
    }

    if (categoria === 'NOTIFICACIONES_POR_AVISO') {
      const where: Record<string, unknown> = {
        tipo: TipoNotificacion.POR_AVISO,
        estado: { in: NOTIF_PUBLICAS },
      }
      if (filtroProcesoRadicado) where.proceso = filtroProcesoRadicado
      if (desde || hasta) {
        const fe: Record<string, Date> = {}
        if (desde) fe.gte = new Date(`${desde}T00:00:00`)
        if (hasta) fe.lte = new Date(`${hasta}T23:59:59`)
        where.fechaEnvio = fe
      }

      const rows = await db.notificacion.findMany({
        where,
        include: {
          proceso: {
            select: {
              radicado: true,
              juzgadoId: true,
              juzgado: { select: { nombre: true } },
            },
          },
        },
        orderBy: { fechaEnvio: 'desc' },
        take: limit,
      })

      const items: ItemLista[] = rows.map((n) => {
        const f = n.fechaEnvio ?? n.fechaEntrega ?? n.createdAt
        const short = n.autoNotificar.length > 80 ? `${n.autoNotificar.slice(0, 80)}…` : n.autoNotificar
        return {
          kind: 'notificacion' as const,
          id: n.id,
          titulo: `Notificación por aviso: ${short}`,
          detalle: n.destinatario,
          radicado: n.proceso.radicado,
          fechaRef: f,
          juzgadoId: n.proceso.juzgadoId,
          juzgadoNombre: n.proceso.juzgado?.nombre ?? 'Juzgado',
        }
      })

      return NextResponse.json({ success: true, categoria, grupos: agruparPorFechaJuzgado(items), data: rows })
    }

    if (categoria === 'OFICIOS') {
      const where: Record<string, unknown> = {
        OR: [
          { estado: { in: [EstadoOficio.ENVIADO, EstadoOficio.RESPONDIDO, EstadoOficio.SIN_RESPUESTA] } },
          { fechaEnvio: { not: null } },
        ],
      }
      if (filtroProcesoRadicado) where.proceso = filtroProcesoRadicado
      if (desde || hasta) {
        const fe: Record<string, Date> = {}
        if (desde) fe.gte = new Date(`${desde}T00:00:00`)
        if (hasta) fe.lte = new Date(`${hasta}T23:59:59`)
        where.fechaEnvio = fe
      }

      const rows = await db.oficio.findMany({
        where,
        include: {
          proceso: {
            select: {
              radicado: true,
              juzgadoId: true,
              juzgado: { select: { nombre: true } },
            },
          },
        },
        orderBy: { fechaEnvio: 'desc' },
        take: limit,
      })

      const items: ItemLista[] = rows
        .map((o) => {
          const f = o.fechaEnvio ?? o.updatedAt
          return {
            kind: 'oficio' as const,
            id: o.id,
            titulo: `Oficio${o.numero ? ` ${o.numero}` : ''} — ${o.asunto}`,
            detalle: o.destinatario,
            radicado: o.proceso.radicado,
            fechaRef: f,
            juzgadoId: o.proceso.juzgadoId,
            juzgadoNombre: o.proceso.juzgado?.nombre ?? 'Juzgado',
          }
        })
        .filter((i) => i.fechaRef)

      return NextResponse.json({ success: true, categoria, grupos: agruparPorFechaJuzgado(items), data: rows })
    }

    if (categoria === 'TRASLADOS') {
      // SQLite (Prisma) no admite mode: 'insensitive'; LIKE en SQLite ya es tolerante a mayúsculas en ASCII.
      const where: Record<string, unknown> = {
        tipo: { contains: 'Traslado' },
      }
      if (filtroProcesoRadicado) where.proceso = filtroProcesoRadicado
      if (desde || hasta) {
        const fi: Record<string, Date> = {}
        if (desde) fi.gte = new Date(`${desde}T00:00:00`)
        if (hasta) fi.lte = new Date(`${hasta}T23:59:59`)
        where.fechaInicio = fi
      }

      const rows = await db.termino.findMany({
        where,
        include: {
          proceso: {
            select: {
              radicado: true,
              juzgadoId: true,
              juzgado: { select: { nombre: true } },
            },
          },
        },
        orderBy: { fechaInicio: 'desc' },
        take: limit,
      })

      const items: ItemLista[] = rows.map((t) => ({
        kind: 'traslado' as const,
        id: t.id,
        titulo: t.tipo,
        detalle: t.descripcion || `Término hasta ${t.fechaVencimiento.toISOString().slice(0, 10)}`,
        radicado: t.proceso.radicado,
        fechaRef: t.fechaInicio,
        juzgadoId: t.proceso.juzgadoId,
        juzgadoNombre: t.proceso.juzgado?.nombre ?? 'Juzgado',
      }))

      return NextResponse.json({ success: true, categoria, grupos: agruparPorFechaJuzgado(items), data: rows })
    }

    return NextResponse.json({ success: false, error: 'Categoría inválida' }, { status: 400 })
  } catch (error) {
    console.error('Error al obtener publicaciones:', error)
    const isDev = process.env.NODE_ENV === 'development'
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Error desconocido'
    return NextResponse.json(
      {
        success: false,
        error: 'Error al obtener publicaciones',
        ...(isDev ? { detail } : {}),
      },
      { status: 500 }
    )
  }
}
