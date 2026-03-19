'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { toast, Toaster } from 'sonner'
import {
  ArrowLeft, FileText, File, FolderOpen, FolderPlus, ChevronDown, ChevronRight,
  Eye, Download, Upload, FileSignature, History
} from 'lucide-react'
import { useUserStore } from '@/stores/user-store'
import { apiFetch } from '@/lib/api-fetch'

async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const text = await res.text()
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    if (!res.ok) throw new Error(text.startsWith('<!') ? `API ${res.status}` : text.slice(0, 200))
    throw new Error('La respuesta no es JSON')
  }
  return (text ? JSON.parse(text) : null) as T
}

const getClaseProcesoLabel = (clase: string) => {
  const labels: Record<string, string> = {
    EJECUTIVO_SINGULAR: 'Ejecutivo Singular',
    ORDINARIO: 'Ordinario',
    VERBAL: 'Verbal',
    TUTELA: 'Acción de Tutela',
    HABEAS_CORPUS: 'Hábeas Corpus',
  }
  return labels[clase] || clase.replace(/_/g, ' ')
}

export default function ExpedientePage() {
  const params = useParams()
  const id = params.id as string
  const { user: simulatedUser } = useUserStore()

  const [proceso, setProceso] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [cuadernosExpandidos, setCuadernosExpandidos] = useState<Set<string>>(new Set())
  const [showVisorPdf, setShowVisorPdf] = useState<string | null>(null)
  const [showNuevoCuaderno, setShowNuevoCuaderno] = useState(false)
  const [nombreNuevoCuaderno, setNombreNuevoCuaderno] = useState('')
  const [showUploadArchivo, setShowUploadArchivo] = useState(false)
  const [carpetaParaUpload, setCarpetaParaUpload] = useState('OTROS')
  const [cuadernoParaUpload, setCuadernoParaUpload] = useState<string | null>(null)

  const activeArea = simulatedUser?.area || 'SECRETARIA'

  const fetchProceso = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await apiFetch(`/api/procesos/${id}`, {}, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; data?: any }>(res)
      if (data.success && data.data) setProceso(data.data)
      else toast.error('No se pudo cargar el expediente')
    } catch (e) {
      toast.error('Error al cargar el expediente')
    } finally {
      setLoading(false)
    }
  }, [id, simulatedUser?.id])

  useEffect(() => {
    fetchProceso()
  }, [fetchProceso])

  const handleFirmarProvidencia = async (providenciaId: string) => {
    if (!simulatedUser?.id) {
      toast.error('Seleccione un usuario (Juez) para firmar')
      return
    }
    try {
      const res = await apiFetch('/api/providencias', {
        method: 'PUT',
        body: JSON.stringify({ id: providenciaId, firmadoPorId: simulatedUser.id, estado: 'FIRMADO' }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser.id)
      const data = await parseJsonResponse<{ success?: boolean; id?: string }>(res)
      if (data?.success || data?.id) {
        toast.success('Providencia firmada')
        fetchProceso()
      } else toast.error('Error al firmar')
    } catch {
      toast.error('Error al firmar')
    }
  }

  const handlePublicarEnEstado = async (providenciaId: string) => {
    if (!simulatedUser?.id) {
      toast.error('Seleccione un usuario (“Simular usuario”) para publicar en estado.')
      return
    }
    try {
      const res = await apiFetch('/api/providencias', {
        method: 'PUT',
        body: JSON.stringify({ id: providenciaId, publicarEnEstado: true }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser.id)
      const text = await res.text()
      let data: { error?: string; id?: string } | null = null
      try {
        data = text ? (JSON.parse(text) as { error?: string; id?: string }) : null
      } catch {
        toast.error('Respuesta inválida del servidor')
        return
      }
      if (!res.ok) {
        toast.error(data?.error || `No se pudo publicar (${res.status})`)
        return
      }
      if (data?.id) {
        toast.success('Providencia publicada en estado')
        fetchProceso()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al publicar')
    }
  }

  const handleAprobarParaFirma = async (providenciaId: string) => {
    if (!simulatedUser?.id) {
      toast.error('Seleccione un usuario para aprobar')
      return
    }
    try {
      const res = await apiFetch('/api/providencias', {
        method: 'PUT',
        body: JSON.stringify({ id: providenciaId, aprobarParaFirma: true, revisadoPorId: simulatedUser.id }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser.id)
      const data = await parseJsonResponse<{ success?: boolean; id?: string }>(res)
      if (data?.success || data?.id) {
        toast.success('Aprobada para firma del Juez')
        fetchProceso()
      } else toast.error('Error al aprobar')
    } catch {
      toast.error('Error al aprobar')
    }
  }

  const [showDevolverCorreccion, setShowDevolverCorreccion] = useState(false)
  const [providenciaParaDevolver, setProvidenciaParaDevolver] = useState<string | null>(null)
  const [observacionesCorreccion, setObservacionesCorreccion] = useState('')
  const correccionFileInputRef = useRef<HTMLInputElement>(null)

  const handleDevolverCorreccion = async () => {
    if (!providenciaParaDevolver || !simulatedUser?.id) return
    try {
      const res = await apiFetch('/api/providencias', {
        method: 'PUT',
        body: JSON.stringify({
          id: providenciaParaDevolver,
          devolverCorreccion: true,
          observacionesCorreccion: observacionesCorreccion || 'Revisar y corregir.',
        }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser.id)
      const data = await parseJsonResponse<{ success?: boolean; id?: string }>(res)
      if (data?.success || data?.id) {
        toast.success('Devuelta para corrección')
        setShowDevolverCorreccion(false)
        setProvidenciaParaDevolver(null)
        setObservacionesCorreccion('')
        fetchProceso()
      } else toast.error('Error al devolver')
    } catch {
      toast.error('Error al devolver')
    }
  }

  const handleReenviarParaRevision = async (providenciaId: string) => {
    if (!simulatedUser?.id) return
    try {
      const res = await apiFetch('/api/providencias', {
        method: 'PUT',
        body: JSON.stringify({ id: providenciaId, reenviarParaRevision: true }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser.id)
      const data = await parseJsonResponse<{ success?: boolean; id?: string }>(res)
      if (data?.success || data?.id) {
        toast.success('Reenviada para revisión')
        fetchProceso()
      } else toast.error('Error al reenviar')
    } catch {
      toast.error('Error al reenviar')
    }
  }

  const handleSubirWordCorreccion = async (e: React.ChangeEvent<HTMLInputElement>, providenciaId: string) => {
    const file = e.target.files?.[0]
    if (!file || !simulatedUser?.id) return
    try {
      const fd = new FormData()
      fd.append('file', file)
      const resExtract = await fetch('/api/providencias/extraer-word', { method: 'POST', body: fd })
      const json = await parseJsonResponse<{ success?: boolean; contenido?: string }>(resExtract)
      if (!json?.success || json.contenido === undefined) {
        toast.error('No se pudo extraer el texto')
        return
      }
      const resUpdate = await apiFetch('/api/providencias', {
        method: 'PUT',
        body: JSON.stringify({ id: providenciaId, contenido: json.contenido }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser.id)
      const data = await parseJsonResponse<{ id?: string }>(resUpdate)
      if (data?.id) {
        toast.success('Contenido actualizado. Haga clic en Reenviar para revisión.')
        fetchProceso()
      } else toast.error('Error al actualizar')
    } catch {
      toast.error('Error al procesar el archivo')
    }
    e.target.value = ''
  }

  const toggleCuaderno = (cid: string) => {
    setCuadernosExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(cid)) next.delete(cid)
      else next.add(cid)
      return next
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Cargando expediente...</p>
      </div>
    )
  }

  if (!proceso) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600">Expediente no encontrado</p>
        <Link href="/">
          <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" />Volver</Button>
        </Link>
      </div>
    )
  }

  const provPendienteFirma = (proceso.providencias || []).find((p: any) => p.estado === 'PENDIENTE_FIRMA')
  const provParaRevisar = (proceso.providencias || []).find((p: any) => p.estado === 'PROYECTADO' || p.estado === 'EN_REVISION')
  const provEnCorreccion = (proceso.providencias || []).find((p: any) => p.estado === 'CORRECCION')
  const provFirmada = (proceso.providencias || []).find((p: any) => p.estado === 'FIRMADO')
  const provNotificada = (proceso.providencias || []).find((p: any) => p.estado === 'NOTIFICADO')
  const cuadernos = proceso.cuadernos || []
  const archivosSinCuaderno = (proceso.archivos || []).filter((a: any) => !a.cuadernoId)
  const esPdf = (tipo: string) => tipo === 'application/pdf'

  const renderArchivo = (a: any) => (
    <div key={a.id} className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded text-sm group">
      <div className="flex items-center gap-2 min-w-0">
        <File className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="truncate">{a.nombreOriginal}</span>
        <span className="text-xs text-gray-400 shrink-0">{new Date(a.createdAt).toLocaleDateString('es-CO')}</span>
      </div>
      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {esPdf(a.tipoMime) ? (
          <Button size="sm" variant="ghost" onClick={() => setShowVisorPdf(a.id)} title="Ver">
            <Eye className="w-4 h-4" />
          </Button>
        ) : (
          <Button size="sm" variant="ghost" asChild>
            <a href={`/api/archivos/${a.id}`} target="_blank" rel="noopener noreferrer"><Eye className="w-4 h-4" /></a>
          </Button>
        )}
        <Button size="sm" variant="ghost" asChild>
          <a href={`/api/archivos/${a.id}?dl=1`} download><Download className="w-4 h-4" /></a>
        </Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Volver</Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Expediente {proceso.radicado}</h1>
              <p className="text-sm text-gray-500">
                {proceso.instancia === 'SEGUNDA_INSTANCIA' ? 'Segunda instancia' : 'Primera instancia'} — {proceso.demandante} vs {proceso.demandado}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Acción requerida */}
        {/* Para firma del Juez */}
        {provPendienteFirma && activeArea === 'DESPACHO' && (
          <Card className="border-2 border-purple-300 bg-purple-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSignature className="w-5 h-5 text-purple-600" />
                Providencia aprobada — Requiere tu firma
              </CardTitle>
              <CardDescription>Revisada por la Dra. Revisa el expediente y firma la providencia.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4"><Badge className={provPendienteFirma.tipo === 'AUTO' ? 'bg-blue-100' : 'bg-green-100'}>{provPendienteFirma.tipo}</Badge> {provPendienteFirma.asunto}</p>
              <Button onClick={() => handleFirmarProvidencia(provPendienteFirma.id)} className="bg-purple-600 hover:bg-purple-700">
                <FileSignature className="w-4 h-4 mr-2" />Firmar providencia
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Para revisión de la Dra — aprobar o devolver */}
        {provParaRevisar && activeArea === 'DESPACHO' && !provPendienteFirma && (
          <Card className="border-2 border-amber-300 bg-amber-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-600" />
                Providencia proyectada — Requiere tu revisión
              </CardTitle>
              <CardDescription>El sustanciador proyectó esta providencia. Revísala y aprueba para firma o devuélvela para corrección.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4"><Badge className={provParaRevisar.tipo === 'AUTO' ? 'bg-blue-100' : 'bg-green-100'}>{provParaRevisar.tipo}</Badge> {provParaRevisar.asunto}</p>
              <p className="text-sm text-gray-600 mb-4">Proyectado por: {provParaRevisar.proyectadoPor?.nombre || '—'}</p>
              <div className="flex gap-2">
                <Button onClick={() => handleAprobarParaFirma(provParaRevisar.id)} className="bg-amber-600 hover:bg-amber-700">
                  <FileSignature className="w-4 h-4 mr-2" />Aprobar para firma
                </Button>
                <Button variant="outline" onClick={() => { setProvidenciaParaDevolver(provParaRevisar.id); setShowDevolverCorreccion(true); }} className="border-amber-500 text-amber-700">
                  Devolver para corrección
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* En corrección — sustanciador debe corregir y reenviar */}
        {provEnCorreccion && activeArea === 'DESPACHO' && !provPendienteFirma && !provParaRevisar && (
          <Card className="border-2 border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-red-600" />
                Providencia devuelta para corrección
              </CardTitle>
              <CardDescription>La Dra devolvió esta providencia. Corrija el contenido (descargue plantilla, edite en Word, suba) y reenvíe para revisión.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-2"><Badge className={provEnCorreccion.tipo === 'AUTO' ? 'bg-blue-100' : 'bg-green-100'}>{provEnCorreccion.tipo}</Badge> {provEnCorreccion.asunto}</p>
              {provEnCorreccion.observaciones && <p className="text-sm text-gray-700 mb-4 italic">Observaciones: {provEnCorreccion.observaciones}</p>}
              <div className="flex gap-2 flex-wrap">
                <input ref={correccionFileInputRef} type="file" accept=".doc,.docx" className="hidden" onChange={(ev) => handleSubirWordCorreccion(ev, provEnCorreccion.id)} />
                <Button variant="outline" onClick={() => correccionFileInputRef.current?.click()} className="border-red-400 text-red-700">
                  <Upload className="w-4 h-4 mr-2" />Subir Word corregido
                </Button>
                <Button onClick={() => handleReenviarParaRevision(provEnCorreccion.id)} variant="outline" className="border-red-400 text-red-700">
                  Reenviar para revisión
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {provFirmada && activeArea === 'SECRETARIA' && !provNotificada && (
          <Card className="border-2 border-cyan-300 bg-cyan-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-600" />
                Providencia firmada — Publicar en estado
              </CardTitle>
              <CardDescription>Notifique a las partes (Art. 295 CGP). Al publicar queda visible en Consulta de procesos.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4"><Badge className={provFirmada.tipo === 'AUTO' ? 'bg-blue-100' : 'bg-green-100'}>{provFirmada.tipo}</Badge> {provFirmada.asunto}</p>
              <Button onClick={() => handlePublicarEnEstado(provFirmada.id)} className="bg-cyan-600 hover:bg-cyan-700">
                <FileText className="w-4 h-4 mr-2" />Publicar en estado
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Providencia ya publicada — visible en portal */}
        {provNotificada && (
          <Card className="border-2 border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-600" />
                Providencia publicada y desanotada
              </CardTitle>
              <CardDescription>Notificada a las partes. Los interesados pueden verla en Consulta de procesos.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4"><Badge className={provNotificada.tipo === 'AUTO' ? 'bg-blue-100' : 'bg-green-100'}>{provNotificada.tipo}</Badge> {provNotificada.asunto}</p>
              <Button asChild variant="outline" className="border-green-500 text-green-700 hover:bg-green-100">
                <Link href="/publicaciones" target="_blank">
                  <Eye className="w-4 h-4 mr-2" />
                  Ver en Consulta de procesos
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Ingresar al Despacho (Secretaría) */}
        {activeArea === 'SECRETARIA' && !proceso.oficialMayorId && (
          <Card className="border-cyan-200">
            <CardContent className="pt-6">
              <Link href={`/?ingresar=${proceso.id}`}>
                <Button className="bg-cyan-600 hover:bg-cyan-700">
                  Ingresar al Despacho
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Datos del proceso */}
        <Card>
          <CardHeader>
            <CardTitle>Datos del proceso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-gray-500">Instancia:</span> {proceso.instancia === 'SEGUNDA_INSTANCIA' ? 'Segunda instancia' : 'Primera instancia'}</div>
              <div><span className="text-gray-500">Radicado:</span> {proceso.radicado}</div>
              <div><span className="text-gray-500">Oficial Mayor:</span> {proceso.oficialMayor?.nombre || proceso.secretario?.nombre || 'Sin asignar'}</div>
              <div><span className="text-gray-500">Categoría:</span> {proceso.categoriaProceso}</div>
              <div><span className="text-gray-500">Clase:</span> {getClaseProcesoLabel(proceso.claseProceso)}</div>
              <div><span className="text-gray-500">Estado:</span> {proceso.estado}</div>
              <div><span className="text-gray-500">Etapa:</span> {proceso.etapaProcesal}</div>
              {proceso.fechaEntradaDespacho && <div><span className="text-gray-500">Entrada Despacho:</span> {new Date(proceso.fechaEntradaDespacho).toLocaleDateString('es-CO')}</div>}
              {proceso.fechaLimiteDespacho && <div><span className="text-gray-500">Límite Despacho:</span> {new Date(proceso.fechaLimiteDespacho).toLocaleDateString('es-CO')}</div>}
            </div>
          </CardContent>
        </Card>

        {/* Actuaciones (formato CPNU - publicación automática) */}
        {(proceso.historial?.length || 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-cyan-600" />
                Actuaciones
              </CardTitle>
              <CardDescription>Registro automático de actuaciones (como Consulta de Procesos). Las más recientes primero.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="px-4 py-2 font-medium">Fecha actuación</th>
                      <th className="px-4 py-2 font-medium">Actuación</th>
                      <th className="px-4 py-2 font-medium">Anotación</th>
                      <th className="px-4 py-2 font-medium">Inicia término</th>
                      <th className="px-4 py-2 font-medium">Finaliza término</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proceso.historial.map((h: any) => (
                      <tr key={h.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-nowrap">{new Date(h.fecha).toLocaleString('es-CO')}</td>
                        <td className="px-4 py-2 font-medium">{h.accion}</td>
                        <td className="px-4 py-2 max-w-xs truncate" title={h.descripcion}>{h.descripcion || '—'}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{h.fechaInicioTermino ? new Date(h.fechaInicioTermino).toLocaleDateString('es-CO') : '—'}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{h.fechaFinTermino ? new Date(h.fechaFinTermino).toLocaleDateString('es-CO') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cuadernos y documentos */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Expediente — Cuadernos</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setShowNuevoCuaderno(true); setNombreNuevoCuaderno(''); }}>
                  <FolderPlus className="w-4 h-4 mr-1" />Crear cuaderno
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setCarpetaParaUpload('OTROS'); setCuadernoParaUpload(null); setShowUploadArchivo(true); }}>
                  <Upload className="w-4 h-4 mr-1" />Incorporar documento
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {cuadernos.length === 0 && archivosSinCuaderno.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">Sin cuadernos ni documentos.</p>
              ) : (
                <>
                  {cuadernos.map((c: any) => {
                    const expanded = cuadernosExpandidos.size === 0 || cuadernosExpandidos.has(c.id)
                    const archivos = c.archivos || []
                    return (
                      <div key={c.id} className="border rounded-lg overflow-hidden">
                        <button type="button" className="w-full flex items-center gap-2 p-3 hover:bg-gray-50 text-left" onClick={() => toggleCuaderno(c.id)}>
                          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <FolderOpen className="w-4 h-4 text-amber-600" />
                          <span className="font-medium">{c.nombre}</span>
                          <span className="text-xs text-gray-400">({archivos.length})</span>
                        </button>
                        {expanded && (
                          <div className="pl-6 pr-4 pb-4 border-t">
                            {archivos.length === 0 ? (
                              <p className="py-2 text-xs text-gray-500">
                                Sin documentos. <button type="button" className="text-blue-600 hover:underline" onClick={() => { setCuadernoParaUpload(c.id); setCarpetaParaUpload('OTROS'); setShowUploadArchivo(true); }}>Incorporar</button>
                              </p>
                            ) : archivos.map((a: any) => renderArchivo(a))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {archivosSinCuaderno.length > 0 && (() => {
                    const exp = cuadernosExpandidos.size === 0 || cuadernosExpandidos.has('sin-cuaderno')
                    return (
                      <div className="border rounded-lg overflow-hidden">
                        <button type="button" className="w-full flex items-center gap-2 p-3 hover:bg-gray-50 text-left" onClick={() => toggleCuaderno('sin-cuaderno')}>
                          {exp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <FolderOpen className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-600">Sin cuaderno</span>
                          <span className="text-xs text-gray-400">({archivosSinCuaderno.length})</span>
                        </button>
                        {exp && <div className="pl-6 pr-4 pb-4 border-t">{archivosSinCuaderno.map((a: any) => renderArchivo(a))}</div>}
                      </div>
                    )
                  })()}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tareas */}
        {(proceso.tareas?.length || 0) > 0 && (
          <Card>
            <CardHeader><CardTitle>Tareas ({proceso.tareas.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {proceso.tareas.map((t: any) => (
                  <div key={t.id} className="flex justify-between items-center p-2 bg-amber-50 rounded text-sm">
                    <span>{t.titulo} — {t.responsable?.nombre || 'Sin asignar'}</span>
                    <Badge variant="outline">{t.estado}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Visor PDF */}
      <Dialog open={!!showVisorPdf} onOpenChange={(o) => { if (!o) setShowVisorPdf(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] w-full">
          <DialogHeader><DialogTitle>Documento PDF</DialogTitle></DialogHeader>
          {showVisorPdf && (
            <iframe src={`/api/archivos/${showVisorPdf}`} className="w-full h-[70vh] border rounded" title="Visor PDF" />
          )}
        </DialogContent>
      </Dialog>

      {/* Crear cuaderno */}
      <Dialog open={showNuevoCuaderno} onOpenChange={setShowNuevoCuaderno}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo cuaderno</DialogTitle>
            <DialogDescription>Organice los documentos del expediente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault()
            if (!nombreNuevoCuaderno.trim()) { toast.error('Escriba el nombre'); return }
            try {
              const res = await apiFetch(`/api/procesos/${id}/cuadernos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: nombreNuevoCuaderno.trim() }),
              }, simulatedUser?.id)
              const data = await parseJsonResponse<{ success?: boolean }>(res)
              if (data?.success) { toast.success('Cuaderno creado'); setShowNuevoCuaderno(false); setNombreNuevoCuaderno(''); fetchProceso(); }
              else toast.error('Error')
            } catch { toast.error('Error'); }
          }} className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={nombreNuevoCuaderno} onChange={(e) => setNombreNuevoCuaderno(e.target.value)} placeholder="Ej. Cuaderno principal, Medidas cautelares, Incidente de nulidad" required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNuevoCuaderno(false)}>Cancelar</Button>
              <Button type="submit">Crear</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Subir archivo */}
      <Dialog open={showUploadArchivo} onOpenChange={(o) => { if (!o) { setShowUploadArchivo(false); setCuadernoParaUpload(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir documento</DialogTitle>
            <DialogDescription>{proceso.radicado}</DialogDescription>
          </DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault()
            const form = e.currentTarget
            const fileInput = form.querySelector('input[type="file"]') as HTMLInputElement
            if (!fileInput?.files?.[0]) { toast.error('Seleccione un archivo'); return }
            const fd = new FormData()
            fd.append('file', fileInput.files[0])
            fd.append('procesoId', id)
            fd.append('carpeta', carpetaParaUpload)
            if (cuadernoParaUpload) fd.append('cuadernoId', cuadernoParaUpload)
            if (simulatedUser?.id) fd.append('subidoPorId', simulatedUser.id)
            try {
              const res = await apiFetch('/api/archivos/upload', { method: 'POST', body: fd }, simulatedUser?.id)
              const data = await parseJsonResponse<{ success?: boolean }>(res)
              if (data?.success) { toast.success('Archivo subido'); setShowUploadArchivo(false); fetchProceso(); }
              else toast.error('Error')
            } catch { toast.error('Error'); }
          }} className="space-y-4">
            <div>
              <Label>Cuaderno (opcional)</Label>
              <select className="w-full border rounded px-3 py-2" value={cuadernoParaUpload || ''} onChange={(e) => setCuadernoParaUpload(e.target.value || null)}>
                <option value="">Sin cuaderno</option>
                {cuadernos.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label>Tipo</Label>
              <select className="w-full border rounded px-3 py-2" value={carpetaParaUpload} onChange={(e) => setCarpetaParaUpload(e.target.value)}>
                <option value="DEMANDA">Demanda</option>
                <option value="ANEXOS">Anexos</option>
                <option value="OTROS">Otros</option>
              </select>
            </div>
            <div>
              <Label>Archivo</Label>
              <Input type="file" accept=".pdf,.doc,.docx,.jpg,.png" required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowUploadArchivo(false)}>Cancelar</Button>
              <Button type="submit">Subir</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Devolver para corrección */}
      <Dialog open={showDevolverCorreccion} onOpenChange={(o) => { if (!o) { setShowDevolverCorreccion(false); setProvidenciaParaDevolver(null); setObservacionesCorreccion(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver para corrección</DialogTitle>
            <DialogDescription>Indique las observaciones para que el sustanciador corrija la providencia.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Observaciones</Label>
              <Input
                value={observacionesCorreccion}
                onChange={(e) => setObservacionesCorreccion(e.target.value)}
                placeholder="Ej. Corregir fundamentos jurídicos, ajustar resolutivos..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDevolverCorreccion(false)}>Cancelar</Button>
              <Button onClick={handleDevolverCorreccion} className="bg-amber-600 hover:bg-amber-700">Devolver</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
