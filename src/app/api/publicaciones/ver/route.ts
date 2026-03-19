/**
 * Detalle público de un ítem de publicaciones (providencia, notificación, oficio, traslado).
 * GET /api/publicaciones/ver?kind=providencia|notificacion|oficio|traslado&id=
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  EstadoProvidencia,
  EstadoNotificacion,
  EstadoOficio,
} from '@prisma/client'

const NOTIF_PUBLICAS = [EstadoNotificacion.ENVIADA, EstadoNotificacion.ENTREGADA]

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const kind = searchParams.get('kind')
    const id = searchParams.get('id')
    if (!kind || !id) {
      return NextResponse.json({ success: false, error: 'Parámetros kind e id requeridos' }, { status: 400 })
    }

    if (kind === 'providencia') {
      const p = await db.providencia.findFirst({
        where: { id, estado: EstadoProvidencia.NOTIFICADO },
        include: {
          proceso: {
            select: {
              id: true,
              radicado: true,
              demandante: true,
              demandado: true,
              claseProceso: true,
              juzgado: { select: { nombre: true } },
            },
          },
          firmadoPor: { select: { nombre: true } },
        },
      })
      if (!p) {
        return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404 })
      }
      return NextResponse.json({ success: true, kind: 'providencia', data: p })
    }

    if (kind === 'notificacion') {
      const n = await db.notificacion.findFirst({
        where: { id, estado: { in: NOTIF_PUBLICAS } },
        include: {
          proceso: {
            select: {
              radicado: true,
              demandante: true,
              demandado: true,
              juzgado: { select: { nombre: true } },
            },
          },
        },
      })
      if (!n) {
        return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404 })
      }
      return NextResponse.json({ success: true, kind: 'notificacion', data: n })
    }

    if (kind === 'oficio') {
      const o = await db.oficio.findFirst({
        where: {
          id,
          OR: [{ estado: { in: [EstadoOficio.ENVIADO, EstadoOficio.RESPONDIDO, EstadoOficio.SIN_RESPUESTA] } }, { fechaEnvio: { not: null } }],
        },
        include: {
          proceso: {
            select: {
              radicado: true,
              demandante: true,
              demandado: true,
              juzgado: { select: { nombre: true } },
            },
          },
        },
      })
      if (!o) {
        return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404 })
      }
      return NextResponse.json({ success: true, kind: 'oficio', data: o })
    }

    if (kind === 'traslado') {
      const t = await db.termino.findFirst({
        where: {
          id,
          tipo: { contains: 'Traslado' },
        },
        include: {
          proceso: {
            select: {
              radicado: true,
              demandante: true,
              demandado: true,
              juzgado: { select: { nombre: true } },
            },
          },
        },
      })
      if (!t) {
        return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404 })
      }
      return NextResponse.json({ success: true, kind: 'traslado', data: t })
    }

    return NextResponse.json({ success: false, error: 'Tipo no soportado' }, { status: 400 })
  } catch (error) {
    console.error('publicaciones/ver:', error)
    return NextResponse.json({ success: false, error: 'Error al consultar' }, { status: 500 })
  }
}
