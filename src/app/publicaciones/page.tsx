'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  FileText,
  ArrowLeft,
  Eye,
  Building2,
  ExternalLink,
  Layers,
  Bell,
  Mail,
  Gavel,
  Send,
} from 'lucide-react'

/** Extrae mensaje legible del body de error (evita lanzar el JSON crudo al overlay de Next). */
function mensajeDesdeBodyError(text: string): string {
  const t = text?.trim()
  if (!t) return ''
  try {
    const j = JSON.parse(t) as { error?: string; message?: string; detail?: string }
    if (j && typeof j === 'object') {
      const base = j.error || j.message || ''
      if (j.detail) {
        return base ? `${base} (${j.detail})` : String(j.detail)
      }
      return base
    }
  } catch {
    // no es JSON
  }
  return t
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!res.ok) {
    const msg = mensajeDesdeBodyError(text) || `Error ${res.status}`
    throw new Error(msg)
  }
  return text ? JSON.parse(text) : null
}

export type CategoriaPublicacion =
  | 'AUTOS_Y_SENTENCIAS'
  | 'NOTIFICACIONES_POR_ESTADO'
  | 'NOTIFICACIONES_POR_AVISO'
  | 'OFICIOS'
  | 'TRASLADOS'

const CATEGORIAS: {
  id: CategoriaPublicacion
  label: string
  descripcion: string
  icon: typeof FileText
}[] = [
  {
    id: 'AUTOS_Y_SENTENCIAS',
    label: 'Autos y sentencias en el estado',
    descripcion:
      'Lista de procesos con providencia publicada en el estado; la parte ubica el suyo y lee el auto o sentencia (antes lista fijada; hoy en la plataforma).',
    icon: Gavel,
  },
  {
    id: 'NOTIFICACIONES_POR_ESTADO',
    label: 'Registros de notificación (medio estado)',
    descripcion:
      'Anotaciones de Secretaría sobre el acto notificado por publicación en el estado, aparte del texto completo de la providencia.',
    icon: Bell,
  },
  {
    id: 'NOTIFICACIONES_POR_AVISO',
    label: 'Notificaciones por aviso',
    descripcion: 'Notificaciones surtidas por aviso en estrado, edicto u otro medio.',
    icon: Mail,
  },
  {
    id: 'OFICIOS',
    label: 'Oficios',
    descripcion: 'Comunicaciones oficiales enviadas a terceros en el marco del proceso.',
    icon: Send,
  },
  {
    id: 'TRASLADOS',
    label: 'Traslados',
    descripcion: 'Órdenes de traslado de demanda, excepciones u otros (términos asociados).',
    icon: Layers,
  },
]

type Grupo = {
  fechaPublicacion: string
  juzgadoId: string
  juzgadoNombre: string
  items: Array<{
    kind: 'providencia' | 'notificacion' | 'oficio' | 'traslado'
    id: string
    titulo: string
    detalle: string
    radicado?: string
  }>
}

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

type EdicionVista = {
  edicionId: string | null
  numero: number | null
  anio: number | null
  etiqueta: string
  fechaPublicacion: string
  juzgadoId: string
  juzgadoNombre: string
  observacionEdicion: string | null
  filas: FilaEdicion[]
}

type DetalleResp =
  | { success: true; kind: 'providencia'; data: any }
  | { success: true; kind: 'notificacion'; data: any }
  | { success: true; kind: 'oficio'; data: any }
  | { success: true; kind: 'traslado'; data: any }

export default function ConsultaProcesosPage() {
  const [categoria, setCategoria] = useState<CategoriaPublicacion>('AUTOS_Y_SENTENCIAS')
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [ediciones, setEdiciones] = useState<EdicionVista[]>([])
  const [loading, setLoading] = useState(true)
  const [radicado, setRadicado] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [tipo, setTipo] = useState<string>('')
  const [detalle, setDetalle] = useState<DetalleResp | null>(null)
  const [modalTarget, setModalTarget] = useState<{ kind: Grupo['items'][0]['kind']; id: string } | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const fetchPublicaciones = async () => {
    setLoading(true)
    setErrorCarga(null)
    try {
      const params = new URLSearchParams()
      params.set('categoria', categoria)
      if (radicado) params.set('radicado', radicado)
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)
      if (tipo && categoria === 'AUTOS_Y_SENTENCIAS') params.set('tipo', tipo)
      const res = await fetch(`/api/publicaciones?${params}`)
      const json = await parseJson<{
        success?: boolean
        grupos?: Grupo[]
        ediciones?: EdicionVista[]
      }>(res)
      setGrupos(json?.grupos ?? [])
      setEdiciones(json?.ediciones ?? [])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudieron cargar las publicaciones.'
      setErrorCarga(msg)
      console.error(e)
      setGrupos([])
      setEdiciones([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPublicaciones()
  }, [categoria])

  const cerrarModal = () => {
    setModalTarget(null)
    setDetalle(null)
    setCargandoDetalle(false)
  }

  const abrirDetalle = async (kind: Grupo['items'][0]['kind'], id: string) => {
    setModalTarget({ kind, id })
    setDetalle(null)
    setCargandoDetalle(true)
    try {
      const res = await fetch(`/api/publicaciones/ver?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`)
      const json = await parseJson<DetalleResp>(res)
      if (json && 'success' in json && json.success) setDetalle(json as DetalleResp)
    } catch {
      setDetalle(null)
    } finally {
      setCargandoDetalle(false)
    }
  }

  const hoy = new Date().toISOString().slice(0, 10)

  const total = useMemo(() => {
    if (categoria === 'AUTOS_Y_SENTENCIAS' && ediciones.length > 0) {
      return ediciones.reduce((n, e) => n + e.filas.length, 0)
    }
    return grupos.reduce((n, g) => n + g.items.length, 0)
  }, [categoria, ediciones, grupos])

  const formatearFechaLarga = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

  const catInfo = CATEGORIAS.find((c) => c.id === categoria)

  return (
    <div className="min-h-screen pb-16">
      {/* Misma línea que el header del gestor: blanco + borde gris */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Volver al gestor
              </Button>
            </Link>
            <div className="hidden h-6 w-px bg-gray-200 sm:block" />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Consulta de procesos</h1>
              <p className="mt-0.5 text-sm text-slate-500">Sin cuenta · autos, sentencias y demás actuaciones publicadas</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
        {errorCarga && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <strong className="font-semibold">No se pudo cargar el listado.</strong> {errorCarga}
          </div>
        )}
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="border-l-4 border-cyan-500 pl-4">
            <p className="text-sm leading-relaxed text-slate-600">
              La <strong className="text-slate-800">notificación por estado</strong> se hace constar en un{' '}
              <strong className="text-slate-800">Estado N.º</strong> (lista del día): ahí van{' '}
              <strong>todas las providencias</strong> que Secretaría publica ese día, con radicado, partes, tipo de
              actuación, observación y fecha. <strong className="text-slate-800">Antes</strong> era la lista fija en
              Secretaría; <strong className="text-slate-800">hoy</strong> cada publicación en estado entra en la misma
              lista numerada. Use filtros y abra el detalle de cada auto o sentencia.
            </p>
          </div>
        </div>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Tipo de actuación</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {CATEGORIAS.map((c) => {
              const Icon = c.icon
              const active = categoria === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoria(c.id)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-cyan-300 bg-cyan-50 ring-1 ring-cyan-200'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        active ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className={`block text-sm font-semibold ${active ? 'text-cyan-900' : 'text-slate-900'}`}>
                        {c.label}
                      </span>
                      <span className="mt-1 block text-xs leading-snug text-slate-500">{c.descripcion}</span>
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="mb-10 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-900">
            <Search className="h-5 w-5 text-cyan-600" />
            Filtros
          </h2>
          <p className="mb-5 text-sm text-slate-500">
            {catInfo?.label}
            {categoria === 'AUTOS_Y_SENTENCIAS' ? ' — Opcional: solo autos o solo sentencias.' : ''}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Radicado</label>
              <Input
                placeholder="Número de radicado…"
                value={radicado}
                onChange={(e) => setRadicado(e.target.value)}
                className="border-gray-200 bg-white"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Si no aparece nada, compruebe el número (a veces sobra o falta un dígito) y que ya haya publicado en
                estado desde Secretaría con usuario simulado.
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Desde</label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} max={hoy} className="border-gray-200" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Hasta</label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} max={hoy} className="border-gray-200" />
            </div>
            {categoria === 'AUTOS_Y_SENTENCIAS' ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Providencia</label>
                <select
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="AUTO">Auto</option>
                  <option value="SENTENCIA">Sentencia</option>
                </select>
              </div>
            ) : (
              <div />
            )}
            <div className="flex items-end">
              <Button type="button" onClick={fetchPublicaciones} className="h-10 w-full bg-cyan-600 text-white hover:bg-cyan-700">
                <Search className="mr-2 h-4 w-4" />
                Aplicar
              </Button>
            </div>
          </div>
        </section>

        {modalTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={cerrarModal}>
            <div
              className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-row items-start justify-between gap-4 border-b border-gray-200 bg-slate-50 px-5 py-4">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <FileText className="h-5 w-5 shrink-0 text-cyan-600" />
                    <span className="truncate">
                      {cargandoDetalle && 'Consultando…'}
                      {!cargandoDetalle && detalle?.kind === 'providencia' &&
                        `${detalle.data.tipo} ${detalle.data.numero || ''}`.trim()}
                      {!cargandoDetalle &&
                        detalle?.kind === 'notificacion' &&
                        (detalle.data.tipo === 'POR_ESTADO' ? 'Registro de notificación (estado)' : 'Notificación')}
                      {!cargandoDetalle && detalle?.kind === 'oficio' && `Oficio ${detalle.data.numero || ''}`}
                      {!cargandoDetalle && detalle?.kind === 'traslado' && detalle.data.tipo}
                      {!cargandoDetalle && !detalle && 'No disponible'}
                    </span>
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {!cargandoDetalle && detalle?.kind === 'providencia' && detalle.data.proceso?.radicado}
                    {!cargandoDetalle &&
                      detalle &&
                      (detalle.kind === 'notificacion' || detalle.kind === 'oficio' || detalle.kind === 'traslado') &&
                      detalle.data.proceso?.radicado}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={cerrarModal} className="shrink-0 text-slate-600">
                  Cerrar
                </Button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto p-6 text-sm text-slate-700">
                {cargandoDetalle && <p className="text-slate-500">Cargando…</p>}
                {!cargandoDetalle && !detalle && (
                  <p className="text-slate-500">No se pudo cargar el registro o no está disponible públicamente.</p>
                )}
                {detalle?.kind === 'providencia' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <p>
                        <span className="font-medium text-slate-500">Proceso:</span> {detalle.data.proceso?.radicado}
                      </p>
                      <p>
                        <span className="font-medium text-slate-500">Juzgado:</span> {detalle.data.proceso?.juzgado?.nombre}
                      </p>
                      <p>
                        <span className="font-medium text-slate-500">Demandante:</span> {detalle.data.proceso?.demandante}
                      </p>
                      <p>
                        <span className="font-medium text-slate-500">Demandado:</span> {detalle.data.proceso?.demandado}
                      </p>
                      <p>
                        <span className="font-medium text-slate-500">Fecha notificación:</span>{' '}
                        {detalle.data.fechaNotificacion
                          ? new Date(detalle.data.fechaNotificacion).toLocaleDateString('es-CO', { dateStyle: 'long' })
                          : '—'}
                      </p>
                      <p>
                        <span className="font-medium text-slate-500">Firmado por:</span>{' '}
                        {detalle.data.firmadoPor?.nombre || '—'}
                      </p>
                    </div>
                    <div className="border-t border-gray-200 pt-4">
                      <p className="mb-2 font-semibold text-slate-900">Contenido</p>
                      <div className="whitespace-pre-wrap font-serif leading-relaxed text-slate-800">
                        {detalle.data.contenido || '(Sin contenido registrado)'}
                      </div>
                    </div>
                  </div>
                )}
                {detalle?.kind === 'notificacion' && (
                  <div className="space-y-3">
                    <p>
                      <span className="font-medium text-slate-500">Tipo:</span> {detalle.data.tipo}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Medio:</span> {detalle.data.medio}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Destinatario:</span> {detalle.data.destinatario}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Acto / auto:</span> {detalle.data.autoNotificar}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Juzgado:</span> {detalle.data.proceso?.juzgado?.nombre}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Envío / entrega:</span>{' '}
                      {[detalle.data.fechaEnvio, detalle.data.fechaEntrega]
                        .filter(Boolean)
                        .map((d: string) => new Date(d).toLocaleDateString('es-CO', { dateStyle: 'long' }))
                        .join(' · ') || '—'}
                    </p>
                  </div>
                )}
                {detalle?.kind === 'oficio' && (
                  <div className="space-y-3">
                    <p>
                      <span className="font-medium text-slate-500">Destinatario:</span> {detalle.data.destinatario}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Asunto:</span> {detalle.data.asunto}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Juzgado:</span> {detalle.data.proceso?.juzgado?.nombre}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Estado oficio:</span> {detalle.data.estado}
                    </p>
                    <div className="border-t border-gray-200 pt-3">
                      <p className="mb-1 font-semibold text-slate-900">Contenido</p>
                      <div className="whitespace-pre-wrap">{detalle.data.contenido || '—'}</div>
                    </div>
                  </div>
                )}
                {detalle?.kind === 'traslado' && (
                  <div className="space-y-3">
                    <p>
                      <span className="font-medium text-slate-500">Proceso:</span> {detalle.data.proceso?.radicado}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Juzgado:</span> {detalle.data.proceso?.juzgado?.nombre}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Inicio término:</span>{' '}
                      {new Date(detalle.data.fechaInicio).toLocaleDateString('es-CO', { dateStyle: 'long' })}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Vencimiento:</span>{' '}
                      {new Date(detalle.data.fechaVencimiento).toLocaleDateString('es-CO', { dateStyle: 'long' })}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Descripción:</span> {detalle.data.descripcion || '—'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-3">
            <h2 className="text-lg font-semibold text-slate-900">Listado</h2>
            {!loading && (
              <span className="text-sm text-slate-500">
                {total} actuación{total !== 1 ? 'es' : ''}
                {categoria === 'AUTOS_Y_SENTENCIAS' && ediciones.length > 0
                  ? ` · ${ediciones.length} lista${ediciones.length !== 1 ? 's' : ''} de estado`
                  : ` · ${grupos.length} grupo${grupos.length !== 1 ? 's' : ''}`}
              </span>
            )}
          </div>

          {loading ? (
            <p className="py-16 text-center text-slate-500">Cargando…</p>
          ) : categoria === 'AUTOS_Y_SENTENCIAS' && ediciones.length > 0 ? (
            <div className="space-y-8">
              {ediciones.map((ed) => (
                <article
                  key={ed.edicionId ?? `${ed.etiqueta}-${ed.juzgadoId}-${ed.fechaPublicacion}`}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                >
                  <header className="border-b border-cyan-100 bg-gradient-to-r from-cyan-50/90 to-white px-5 py-4">
                    <p className="text-lg font-semibold text-slate-900">{ed.etiqueta}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Fecha del estado:{' '}
                      <span className="font-medium capitalize">{formatearFechaLarga(ed.fechaPublicacion)}</span>
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                      <Building2 className="h-4 w-4 shrink-0 text-cyan-600" />
                      {ed.juzgadoNombre}
                    </p>
                    {ed.observacionEdicion ? (
                      <p className="mt-2 text-sm text-slate-500">
                        <span className="font-medium text-slate-600">Observación del estado:</span> {ed.observacionEdicion}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-500">
                      {ed.filas.length} actuación{ed.filas.length !== 1 ? 'es' : ''} en esta lista.
                    </p>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <th className="px-4 py-3">N.º proceso / radicado</th>
                          <th className="px-4 py-3">Partes</th>
                          <th className="px-4 py-3">Tipo de actuación</th>
                          <th className="px-4 py-3">Observación</th>
                          <th className="px-4 py-3">Fecha</th>
                          <th className="px-4 py-3 w-28"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {ed.filas.map((fila) => (
                          <tr key={fila.id} className="border-b border-gray-100 hover:bg-slate-50/80">
                            <td className="px-4 py-3 font-mono text-xs text-slate-900">{fila.radicado}</td>
                            <td className="px-4 py-3 text-slate-700">
                              <span className="font-medium">{fila.demandante}</span>
                              <span className="text-slate-400"> c. </span>
                              <span className="font-medium">{fila.demandado}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-800">{fila.tipoActuacion}</td>
                            <td className="px-4 py-3 text-slate-600 max-w-[200px]">{fila.observacion || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                              {new Date(fila.fecha).toLocaleDateString('es-CO', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-cyan-200 text-cyan-800 hover:bg-cyan-50"
                                onClick={() => abrirDetalle('providencia', fila.id)}
                              >
                                <Eye className="mr-1.5 h-3.5 w-3.5" />
                                Ver auto
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          ) : grupos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white py-14 text-center shadow-sm">
              <FileText className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <p className="text-slate-700">Nada coincide con los filtros en esta categoría.</p>
              <p className="mt-2 text-sm text-slate-500">
                Revise fechas o confirme en el gestor que los registros estén enviados o notificados.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {grupos.map((g) => (
                <article
                  key={`${g.fechaPublicacion}-${g.juzgadoId}`}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                >
                  <header className="border-b border-cyan-100 bg-gradient-to-r from-cyan-50/90 to-white px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Fecha · despacho</p>
                    <p className="mt-1 text-xl font-semibold capitalize text-slate-900">{formatearFechaLarga(g.fechaPublicacion)}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                      <Building2 className="h-4 w-4 text-cyan-600" />
                      {g.juzgadoNombre}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {g.items.length} entrada{g.items.length !== 1 ? 's' : ''} en esta fecha.
                    </p>
                  </header>
                  <ul>
                    {g.items.map((it) => (
                      <li
                        key={`${it.kind}-${it.id}`}
                        className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <Badge
                            variant="outline"
                            className="mb-2 border-cyan-200 bg-cyan-50/80 font-medium text-cyan-900"
                          >
                            {it.kind === 'providencia' && 'Providencia'}
                            {it.kind === 'notificacion' && 'Notificación'}
                            {it.kind === 'oficio' && 'Oficio'}
                            {it.kind === 'traslado' && 'Traslado'}
                          </Badge>
                          <p className="font-medium text-slate-900">{it.titulo}</p>
                          <p className="mt-0.5 text-sm text-slate-600">{it.detalle}</p>
                          {it.radicado && <p className="mt-1 text-xs text-cyan-700">Rad. {it.radicado}</p>}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-cyan-200 text-cyan-800 hover:bg-cyan-50"
                          onClick={() => abrirDetalle(it.kind, it.id)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Ver
                        </Button>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-12 border-t border-gray-200 pt-8 text-center text-xs text-slate-500">
          Otras consultas en la red judicial:{' '}
          <a
            href="https://publicacionesprocesales.ramajudicial.gov.co/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-cyan-600 hover:text-cyan-700 hover:underline"
          >
            ramajudicial.gov.co
            <ExternalLink className="ml-0.5 inline h-3 w-3" />
          </a>
        </footer>
      </main>
    </div>
  )
}
