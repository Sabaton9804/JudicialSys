'use client'

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react'
import {
  cargarSgdeDesdeNavegador,
  guardarSgdeEnNavegador,
  borrarSgdeDelNavegador,
} from '@/lib/sgde-browser-storage'
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
  ArrowLeft, FileText, FolderOpen,
  Eye, Download, Upload, FileSignature, History, Scale, RefreshCw
} from 'lucide-react'
import { useUserStore } from '@/stores/user-store'
import { apiFetch } from '@/lib/api-fetch'
import { cn } from '@/lib/utils'

async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const text = await res.text()
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    if (!res.ok) throw new Error(text.startsWith('<!') ? `API ${res.status}` : text.slice(0, 200))
    throw new Error('La respuesta no es JSON')
  }
  return (text ? JSON.parse(text) : null) as T
}

function ExpedienteDlRow({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(9.5rem,12rem)_1fr] sm:gap-x-5 py-2.5 border-b border-gray-100 last:border-0',
        className
      )}
    >
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 leading-snug">{children}</dd>
    </div>
  )
}

function AccesoSgdeBadge({ texto }: { texto: string }) {
  const t = (texto || '').toLowerCase()
  const reservado = t.includes('reserv')
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-normal text-xs tabular-nums',
        reservado
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-gray-200 bg-white text-gray-700'
      )}
    >
      {texto?.trim() || '—'}
    </Badge>
  )
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
  type SgdeDocFila = {
    nodeId: string
    nombre: string
    tipoDocumental: string
    idDocumento: number | null
    formato: string
    tamano: number | null
    acceso: string
    fechaPublicacion: string
  }
  const [sgdeCarpetas, setSgdeCarpetas] = useState<
    Array<{ nombreCarpeta: string; folderNodeId: string; documentos: SgdeDocFila[] }>
  >([])
  const [sgdeLoading, setSgdeLoading] = useState(false)
  const [sgdeError, setSgdeError] = useState<string | null>(null)
  const [sgdeConsultado, setSgdeConsultado] = useState(false)
  const [sgdeUsuario, setSgdeUsuario] = useState('')
  const [sgdePassword, setSgdePassword] = useState('')
  /** Tras hidratar: false si hay credenciales en localStorage (formulario oculto). Inicial true hasta leer el navegador. */
  const [sgdeMostrarFormularioLogin, setSgdeMostrarFormularioLogin] = useState(true)
  /** Si hay credenciales guardadas en disco (para mostrar «Cancelar» al editar). */
  const [sgdeCredencialesEnDisco, setSgdeCredencialesEnDisco] = useState(false)
  const [cpnuSyncLoading, setCpnuSyncLoading] = useState(false)
  const [sgdeBatchTipo, setSgdeBatchTipo] = useState('Auto')
  const [sgdeBatchNivel, setSgdeBatchNivel] = useState('Reservado')
  const [sgdeBatchRuta, setSgdeBatchRuta] = useState('01PrimeraInstancia/C01')
  const [sgdeBatchLoading, setSgdeBatchLoading] = useState(false)
  const sgdeBatchFileRef = useRef<HTMLInputElement>(null)
  const [showVisorSgdeBlob, setShowVisorSgdeBlob] = useState<string | null>(null)
  /** Una sola consulta automática al abrir el expediente si hay credenciales guardadas en el navegador. */
  const sgdeAutoFetchHecho = useRef(false)

  const activeArea = simulatedUser?.area || 'SECRETARIA'

  /** Archivos en BD local (misma lista que API; cuadernos pueden duplicar — deduplicar por id) */
  const archivosLocales = useMemo(() => {
    if (!proceso) return []
    const list: any[] = Array.isArray(proceso.archivos) ? [...proceso.archivos] : []
    if (Array.isArray(proceso.cuadernos)) {
      for (const c of proceso.cuadernos) {
        if (Array.isArray(c.archivos)) {
          for (const a of c.archivos) {
            if (!list.some((x) => x.id === a.id)) list.push({ ...a, _cuaderno: c.nombre })
          }
        }
      }
    }
    return list
  }, [proceso])

  useEffect(() => {
    const saved = cargarSgdeDesdeNavegador()
    if (saved) {
      setSgdeUsuario(saved.usuario)
      setSgdePassword(saved.password)
      setSgdeMostrarFormularioLogin(false)
      setSgdeCredencialesEnDisco(true)
    } else {
      setSgdeMostrarFormularioLogin(true)
      setSgdeCredencialesEnDisco(false)
    }
  }, [])

  useEffect(() => {
    sgdeAutoFetchHecho.current = false
  }, [id])

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

  const sincronizarCpnu = async () => {
    if (!id) return
    setCpnuSyncLoading(true)
    try {
      const res = await apiFetch(`/api/procesos/${id}/sincronizar-cpnu`, { method: 'POST' }, simulatedUser?.id)
      const data = await parseJsonResponse<{ success?: boolean; error?: string }>(res)
      if (data.success) {
        toast.success('Datos actualizados desde la consulta pública (CPNU).')
        await fetchProceso()
      } else {
        toast.error(data.error || 'No se pudo sincronizar con CPNU.')
      }
    } catch {
      toast.error('Error al sincronizar con CPNU.')
    } finally {
      setCpnuSyncLoading(false)
    }
  }

  const fetchDocumentosSgde = useCallback(async () => {
    if (!id) return
    if (!sgdeUsuario.trim() || !sgdePassword) {
      toast.error('Escriba usuario y contraseña del SGDE.')
      return
    }
    setSgdeLoading(true)
    setSgdeError(null)
    setSgdeConsultado(true)
    try {
      const res = await apiFetch(
        `/api/sgde/procesos/${id}/documentos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sgdeUsuario: sgdeUsuario.trim(),
            sgdePassword: sgdePassword,
          }),
        },
        simulatedUser?.id
      )
      const data = await parseJsonResponse<{
        success?: boolean
        error?: string
        data?: {
          carpetas?: Array<{ nombreCarpeta: string; folderNodeId: string; documentos: SgdeDocFila[] }>
        }
      }>(res)
      if (!data.success) {
        setSgdeError(data.error || 'No se pudo consultar el SGDE')
        setSgdeCarpetas([])
        return
      }
      setSgdeCarpetas(data.data?.carpetas ?? [])
      guardarSgdeEnNavegador(sgdeUsuario.trim(), sgdePassword)
      setSgdeCredencialesEnDisco(true)
      setSgdeMostrarFormularioLogin(false)
    } catch (e) {
      setSgdeError(e instanceof Error ? e.message : 'Error de red')
      setSgdeCarpetas([])
    } finally {
      setSgdeLoading(false)
    }
  }, [id, simulatedUser?.id, sgdeUsuario, sgdePassword])

  useEffect(() => {
    if (!id) return
    if (!sgdeUsuario.trim() || !sgdePassword) return
    if (sgdeAutoFetchHecho.current) return
    sgdeAutoFetchHecho.current = true
    void fetchDocumentosSgde()
  }, [id, sgdeUsuario, sgdePassword, fetchDocumentosSgde])

  const olvidarCredencialesSgde = () => {
    borrarSgdeDelNavegador()
    setSgdeUsuario('')
    setSgdePassword('')
    setSgdeCarpetas([])
    setSgdeError(null)
    setSgdeConsultado(false)
    sgdeAutoFetchHecho.current = false
    setSgdeCredencialesEnDisco(false)
    setSgdeMostrarFormularioLogin(true)
    toast.message('Credenciales SGDE borradas de este navegador.')
  }

  const abrirDocumentoSgde = async (nodeId: string, nombre: string) => {
    if (!sgdeUsuario.trim() || !sgdePassword) {
      toast.error('Escriba usuario y contraseña del SGDE arriba.')
      return
    }
    try {
      const res = await apiFetch(
        `/api/sgde/procesos/${id}/documentos/${nodeId}/content`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sgdeUsuario: sgdeUsuario.trim(),
            sgdePassword: sgdePassword,
            inline: true,
          }),
        },
        simulatedUser?.id
      )
      if (!res.ok) {
        const errText = await res.text()
        let msg = 'No se pudo obtener el documento del SGDE'
        try {
          const j = JSON.parse(errText) as { error?: string }
          if (j.error) msg = j.error
        } catch { /* ignore */ }
        toast.error(msg)
        return
      }
      const blob = await res.blob()
      const lower = nombre.toLowerCase()
      const isPdf = blob.type.includes('pdf') || lower.endsWith('.pdf')
      if (!isPdf) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = nombre || 'documento'
        a.click()
        URL.revokeObjectURL(url)
        toast.message('Si no se abrió solo, use Descargar.')
        return
      }
      const url = URL.createObjectURL(blob)
      setShowVisorSgdeBlob((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    } catch {
      toast.error('Error al abrir el documento')
    }
  }

  const descargarDocumentoSgde = async (nodeId: string, nombre: string) => {
    if (!sgdeUsuario.trim() || !sgdePassword) {
      toast.error('Escriba usuario y contraseña del SGDE arriba.')
      return
    }
    try {
      const res = await apiFetch(
        `/api/sgde/procesos/${id}/documentos/${nodeId}/content`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sgdeUsuario: sgdeUsuario.trim(),
            sgdePassword: sgdePassword,
            inline: false,
          }),
        },
        simulatedUser?.id
      )
      if (!res.ok) {
        const errText = await res.text()
        let msg = 'No se pudo descargar'
        try {
          const j = JSON.parse(errText) as { error?: string }
          if (j.error) msg = j.error
        } catch { /* ignore */ }
        toast.error(msg)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre || 'documento'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Error al descargar')
    }
  }

  const handleSubirLoteSgde = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sgdeUsuario.trim() || !sgdePassword) {
      toast.error('Indique usuario y contraseña del SGDE arriba (o pulse Consultar para guardarlas en este navegador).')
      return
    }
    const input = sgdeBatchFileRef.current
    const files = input?.files
    if (!files?.length) {
      toast.error('Seleccione uno o más archivos PDF o DOCX')
      return
    }
    setSgdeBatchLoading(true)
    try {
      const fd = new FormData()
      for (let i = 0; i < files.length; i++) {
        fd.append('file', files[i])
      }
      fd.append('procesoId', id)
      fd.append('sgdeUsuario', sgdeUsuario.trim())
      fd.append('sgdePassword', sgdePassword)
      fd.append('tipoDocumental', sgdeBatchTipo.trim() || 'Auto')
      fd.append('nivelAcceso', sgdeBatchNivel)
      fd.append('rutaDestino', sgdeBatchRuta.trim() || '01PrimeraInstancia/C01')
      const res = await apiFetch('/api/sgde/upload-batch', { method: 'POST', body: fd }, simulatedUser?.id)
      const data = await parseJsonResponse<{
        success?: boolean
        error?: string
        data?: {
          subidosOk: number
          total: number
          fallidos: number
          resultados: Array<{ nombreOriginal: string; ok: boolean; error?: string }>
        }
      }>(res)
      if (!data.success || !data.data) {
        toast.error(data.error || 'No se pudo completar la carga masiva')
        return
      }
      const { subidosOk, total, fallidos } = data.data
      toast.success(
        `SGDE: ${subidosOk}/${total} documento(s) registrados${fallidos ? ` · ${fallidos} error(es)` : ''}`
      )
      if (input) input.value = ''
      void fetchDocumentosSgde()
    } catch {
      toast.error('Error de red al subir el lote al SGDE')
    } finally {
      setSgdeBatchLoading(false)
    }
  }

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
  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-gray-600 shrink-0">
                <ArrowLeft className="w-4 h-4 mr-1" />Volver
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900">
                Expediente <span className="font-mono font-semibold">{proceso.radicado}</span>
              </h1>
              <p className="text-sm text-gray-500 truncate">
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

        {/* Datos del proceso — si hay rubros CPNU, coinciden con consultaprocesos.ramajudicial.gov.co */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1.5 min-w-0">
                <CardTitle>Datos del proceso</CardTitle>
                <CardDescription>
                  {proceso.consultaTipoProceso || proceso.consultaDespacho
                    ? 'Rubros tomados de la consulta pública (CPNU). La clasificación interna del sistema aparece debajo.'
                    : 'Use «Sincronizar con CPNU» para traer los mismos datos que en consultaprocesos.ramajudicial.gov.co (sin usuario ni contraseña).'}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-cyan-500 text-cyan-700 hover:bg-cyan-50"
                disabled={cpnuSyncLoading}
                onClick={() => void sincronizarCpnu()}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${cpnuSyncLoading ? 'animate-spin' : ''}`} />
                Sincronizar con CPNU
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {(proceso.consultaDespacho ||
              proceso.consultaPonente ||
              proceso.consultaTipoProceso ||
              proceso.consultaClaseProceso ||
              proceso.consultaSubclaseProceso ||
              proceso.consultaRecurso ||
              proceso.consultaUbicacionExpediente) && (
              <div className="rounded-lg border border-cyan-100 bg-cyan-50/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800 mb-3">
                  Consulta de procesos (Rama Judicial)
                </p>
                <dl className="max-w-4xl">
                  <ExpedienteDlRow label="Radicado">
                    <span className="font-mono text-[13px] tracking-tight">{proceso.radicado}</span>
                  </ExpedienteDlRow>
                  {proceso.fechaRadicacion && (
                    <ExpedienteDlRow label="Fecha de radicación">
                      {new Date(proceso.fechaRadicacion).toLocaleDateString('es-CO')}
                    </ExpedienteDlRow>
                  )}
                  {proceso.consultaDespacho && (
                    <ExpedienteDlRow label="Despacho">{proceso.consultaDespacho}</ExpedienteDlRow>
                  )}
                  {proceso.consultaPonente && (
                    <ExpedienteDlRow label="Ponente">{proceso.consultaPonente}</ExpedienteDlRow>
                  )}
                  {proceso.consultaTipoProceso && (
                    <ExpedienteDlRow label="Tipo de proceso">{proceso.consultaTipoProceso}</ExpedienteDlRow>
                  )}
                  {proceso.consultaClaseProceso && (
                    <ExpedienteDlRow label="Clase de proceso">{proceso.consultaClaseProceso}</ExpedienteDlRow>
                  )}
                  {proceso.consultaSubclaseProceso && (
                    <ExpedienteDlRow label="Subclase de proceso">{proceso.consultaSubclaseProceso}</ExpedienteDlRow>
                  )}
                  {proceso.consultaRecurso && (
                    <ExpedienteDlRow label="Recurso">{proceso.consultaRecurso}</ExpedienteDlRow>
                  )}
                  {proceso.consultaUbicacionExpediente && (
                    <ExpedienteDlRow label="Ubicación del expediente">{proceso.consultaUbicacionExpediente}</ExpedienteDlRow>
                  )}
                </dl>
              </div>
            )}
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-3">Registro en JudicialSys</p>
              <dl className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-0">
                <ExpedienteDlRow label="Instancia">
                  {proceso.instancia === 'SEGUNDA_INSTANCIA' ? 'Segunda instancia' : 'Primera instancia'}
                </ExpedienteDlRow>
                <ExpedienteDlRow label="Radicado">
                  <span className="font-mono text-[13px]">{proceso.radicado}</span>
                </ExpedienteDlRow>
                <ExpedienteDlRow label="Oficial Mayor">
                  {proceso.oficialMayor?.nombre || proceso.secretario?.nombre || 'Sin asignar'}
                </ExpedienteDlRow>
                <ExpedienteDlRow label="Categoría">{proceso.categoriaProceso}</ExpedienteDlRow>
                <ExpedienteDlRow label="Clase">{getClaseProcesoLabel(proceso.claseProceso)}</ExpedienteDlRow>
                <ExpedienteDlRow label="Estado">
                  <Badge variant="secondary" className="font-medium">
                    {proceso.estado}
                  </Badge>
                </ExpedienteDlRow>
                <ExpedienteDlRow label="Etapa">{proceso.etapaProcesal || '—'}</ExpedienteDlRow>
                {proceso.fechaEntradaDespacho && (
                  <ExpedienteDlRow label="Entrada Despacho">
                    {new Date(proceso.fechaEntradaDespacho).toLocaleDateString('es-CO')}
                  </ExpedienteDlRow>
                )}
                {proceso.fechaLimiteDespacho && (
                  <ExpedienteDlRow label="Límite Despacho">
                    {new Date(proceso.fechaLimiteDespacho).toLocaleDateString('es-CO')}
                  </ExpedienteDlRow>
                )}
              </dl>
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

        {/* Repositorio local — aquí se ve si la importación guardó adjuntos */}
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-950">
              <FolderOpen className="w-5 h-5 text-emerald-700 shrink-0" />
              Archivos del expediente (JudicialSys — local)
            </CardTitle>
            <CardDescription>
              Incluye el <strong>PDF del correo</strong> (<code className="text-[11px]">CorreoReparto.pdf</code>), adjuntos del .eml, contenido de ZIP adjuntos, y si el HTML trae enlaces <code className="text-[11px]">https://…ramajudicial.gov.co</code>, intenta descargarlos (p. ej. ZIP con acta y demanda).{' '}
              <strong>No confundir con el SGDE</strong> (bloque siguiente).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {archivosLocales.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm text-gray-800 space-y-2">
                <p>
                  <strong>Aún no hay archivos en el repositorio local</strong>. Si importó un <strong>.eml</strong> reciente, debería existir al menos{' '}
                  <code className="text-xs bg-white px-1 rounded">CorreoReparto.pdf</code>.
                </p>
                <p className="text-gray-600">
                  Vuelva a importar desde Tutelas o adjunte al <strong>correo el ZIP</strong> de tutela en línea (descargado en el navegador) para que entren acta, demanda y demás.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-emerald-100 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-emerald-100 bg-emerald-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
                      <th className="px-4 py-2">Carpeta</th>
                      <th className="px-4 py-2">Nombre</th>
                      <th className="px-4 py-2">Tamaño</th>
                      <th className="px-4 py-2">Subido por</th>
                      <th className="px-4 py-2 text-right w-32">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {archivosLocales.map((a: any) => (
                      <tr key={a.id} className="hover:bg-emerald-50/50">
                        <td className="px-4 py-2">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {a.carpeta || '—'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 font-medium text-gray-900 max-w-[min(280px,40vw)] truncate" title={a.nombreOriginal || a.nombreArchivo}>
                          {a.nombreOriginal || a.nombreArchivo}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-gray-600">
                          {typeof a.tamano === 'number' ? `${(a.tamano / 1024).toFixed(1)} KB` : '—'}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{a.subidoPor?.nombre || '—'}</td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                            <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-800" asChild>
                              <a href={`/api/archivos/${a.id}`} target="_blank" rel="noopener noreferrer">
                                <Eye className="w-4 h-4 mr-1 inline" />
                                Abrir
                              </a>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-700" asChild>
                              <a href={`/api/archivos/${a.id}?dl=1`} download title="Descargar">
                                <Download className="w-4 h-4" />
                              </a>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SGDE — consulta con usuario/contraseña en página */}
        <Card className="border-cyan-200">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-cyan-600 shrink-0" />
                SGDE — Gestor documental (Rama Judicial)
                <Badge variant="outline" className="ml-1 font-normal text-gray-600 border-gray-300">
                  Consulta externa
                </Badge>
              </CardTitle>
              <CardDescription>
                {sgdeMostrarFormularioLogin
                  ? (
                    <>
                      Escriba usuario y contraseña del SGDE; tras una consulta exitosa quedarán guardados solo en este navegador y no volverán a mostrarse aquí. La vista replica el árbol del portal: <strong>Primera instancia</strong> y debajo cada cuaderno (Principal, Medidas cautelares, etc.).
                    </>
                  )
                  : (
                    <>
                      Credenciales guardadas en este equipo. Use <strong>Actualizar lista</strong> para refrescar el gestor. La vista replica el árbol del portal: <strong>Primera instancia</strong> y los cuadernos con sus archivos.
                    </>
                  )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
              <p className="font-semibold text-slate-900 mb-1">JudicialSys ≠ SGDE</p>
              <p className="leading-relaxed text-slate-700">
                Los datos de arriba (<span className="font-mono text-xs">Registro en JudicialSys</span>) están en <strong>su base de datos local</strong>.
                El SGDE es el gestor de la Rama: solo muestra documentos si ese mismo radicado existe allí y sus credenciales tienen acceso.
                Si el expediente lo creó por importación (.eml), seed o prueba, <strong>es normal</strong> que SGDE no liste nada: no es un fallo del expediente local.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!sgdeMostrarFormularioLogin && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-cyan-500 text-cyan-700 hover:bg-cyan-50"
                  onClick={() => setSgdeMostrarFormularioLogin(true)}
                >
                  Cambiar credenciales
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-gray-600"
                onClick={olvidarCredencialesSgde}
              >
                Olvidar credenciales en este equipo
              </Button>
            </div>
            {sgdeMostrarFormularioLogin && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
                  <div className="space-y-1.5">
                    <Label htmlFor="sgde-usuario">Usuario SGDE</Label>
                    <Input
                      id="sgde-usuario"
                      name="sgde-usuario"
                      autoComplete="username"
                      value={sgdeUsuario}
                      onChange={(e) => setSgdeUsuario(e.target.value)}
                      placeholder="Usuario del gestor"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sgde-password">Contraseña</Label>
                    <Input
                      id="sgde-password"
                      name="sgde-password"
                      type="password"
                      autoComplete="current-password"
                      value={sgdePassword}
                      onChange={(e) => setSgdePassword(e.target.value)}
                      placeholder="Contraseña"
                    />
                  </div>
                </div>
                {sgdeCredencialesEnDisco && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-gray-600 -mt-1"
                    onClick={() => {
                      const saved = cargarSgdeDesdeNavegador()
                      if (saved) {
                        setSgdeUsuario(saved.usuario)
                        setSgdePassword(saved.password)
                        setSgdeMostrarFormularioLogin(false)
                      }
                    }}
                  >
                    Cancelar y volver a la vista sin formulario
                  </Button>
                )}
              </div>
            )}
            {!sgdeMostrarFormularioLogin && (
              <p className="text-sm text-gray-700 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2">
                <span className="font-medium text-gray-900">Sesión lista.</span>{' '}
                Las credenciales no se muestran en pantalla.
              </p>
            )}
            <Button
              type="button"
              variant="default"
              className="bg-cyan-600 hover:bg-cyan-700"
              disabled={sgdeLoading}
              onClick={() => void fetchDocumentosSgde()}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${sgdeLoading ? 'animate-spin' : ''}`} />
              {sgdeConsultado ? 'Actualizar lista' : 'Consultar documentos'}
            </Button>

            <div className="rounded-lg border border-cyan-200 bg-white p-4 space-y-3">
              <p className="text-sm font-semibold text-cyan-900 flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Carga masiva al SGDE
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Equivalente al flujo <strong>MagnusPro</strong> de la suite de escritorio: un solo inicio de sesión en la Rama y
                varios PDF/DOCX al expediente abierto en el SGDE. Máximo 40 archivos por lote; mismo tipo documental y carpeta
                para todos (ajuste y repita si necesita otro destino).
              </p>
              <form onSubmit={handleSubirLoteSgde} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sgde-batch-tipo">Tipo documental</Label>
                    <Input
                      id="sgde-batch-tipo"
                      value={sgdeBatchTipo}
                      onChange={(e) => setSgdeBatchTipo(e.target.value)}
                      placeholder="Auto, Sentencia…"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sgde-batch-nivel">Nivel de acceso</Label>
                    <select
                      id="sgde-batch-nivel"
                      value={sgdeBatchNivel}
                      onChange={(e) => setSgdeBatchNivel(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="Reservado">Reservado</option>
                      <option value="Público">Público</option>
                      <option value="Confidencial">Confidencial</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                    <Label htmlFor="sgde-batch-ruta">Carpeta en SGDE</Label>
                    <Input
                      id="sgde-batch-ruta"
                      value={sgdeBatchRuta}
                      onChange={(e) => setSgdeBatchRuta(e.target.value)}
                      placeholder="01PrimeraInstancia/C01"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sgde-batch-files">Archivos (PDF o DOCX)</Label>
                  <Input
                    id="sgde-batch-files"
                    ref={sgdeBatchFileRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="cursor-pointer"
                  />
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  className="bg-cyan-100 text-cyan-950 hover:bg-cyan-200 border border-cyan-300"
                  disabled={sgdeBatchLoading || sgdeLoading}
                >
                  <Upload className={`w-4 h-4 mr-2 ${sgdeBatchLoading ? 'opacity-50' : ''}`} />
                  {sgdeBatchLoading ? 'Subiendo…' : 'Subir lote al SGDE'}
                </Button>
              </form>
            </div>

            {sgdeMostrarFormularioLogin && !sgdeConsultado && (
              <p className="text-sm text-gray-600">
                Tras la primera consulta exitosa, el formulario se ocultará. Use «Olvidar credenciales» si cambia de equipo o de usuario.
              </p>
            )}
            {sgdeError && (
              <div
                className={
                  /no se encontró el expediente en sgde/i.test(sgdeError)
                    ? 'rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950'
                    : 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900'
                }
              >
                <p className="font-medium">{sgdeError}</p>
                {/no se encontró el expediente en sgde/i.test(sgdeError) && proceso?.radicado && (
                  <p className="mt-2 text-xs leading-relaxed text-sky-900/90">
                    El radicado <span className="font-mono">{proceso.radicado}</span> sigue siendo válido en JudicialSys.
                    Este aviso solo indica que en el <strong>SGDE de la Rama</strong> no hay carpeta para ese número (o no hay permiso).
                    Los documentos que incorpore por importación o carga en JudicialSys quedan en el almacenamiento de este sistema; no pasan por el SGDE hasta que alguien los suba al gestor de la Rama.
                  </p>
                )}
              </div>
            )}
            {sgdeConsultado && !sgdeLoading && !sgdeError && sgdeCarpetas.length === 0 && (
              <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                No hay resultados del SGDE para este radicado. El expediente local no se ve afectado.
              </p>
            )}
            {sgdeCarpetas.length > 0 && proceso?.radicado && (
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                <span className="font-mono text-xs sm:text-[13px] tracking-tight">{proceso.radicado}</span>
                <span className="mx-2 text-gray-400">›</span>
                <span className="font-medium text-gray-900">Primera instancia</span>
              </div>
            )}
            {sgdeCarpetas.map((carpeta) => (
              <div
                key={carpeta.folderNodeId}
                className="rounded-lg border border-gray-200 bg-white overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50/80 px-4 py-3">
                  <FolderOpen className="w-4 h-4 text-amber-800 shrink-0" />
                  <span className="font-semibold text-gray-900">{carpeta.nombreCarpeta}</span>
                  <Badge variant="secondary" className="ml-auto bg-white text-amber-950 border-amber-200 font-medium">
                    {carpeta.documentos.length} documento{carpeta.documentos.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                {carpeta.documentos.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-center text-gray-500">Sin documentos en esta carpeta.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                          <th className="px-4 py-3 font-medium">Nombre</th>
                          <th className="px-4 py-3 font-medium">Tipo documental</th>
                          <th className="px-4 py-3 font-medium w-16">Orden</th>
                          <th className="px-4 py-3 font-medium">Acceso</th>
                          <th className="px-4 py-3 font-medium w-28 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {carpeta.documentos.map((d) => (
                          <tr key={d.nodeId} className="transition-colors hover:bg-gray-50">
                            <td className="px-4 py-2.5 max-w-[220px] truncate font-medium text-gray-900" title={d.nombre}>
                              {d.nombre}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600">{d.tipoDocumental || '—'}</td>
                            <td className="px-4 py-2.5 tabular-nums text-gray-700">{d.idDocumento ?? '—'}</td>
                            <td className="px-4 py-2.5">
                              <AccesoSgdeBadge texto={d.acceso || '—'} />
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex justify-end gap-0.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-cyan-700 hover:bg-cyan-50"
                                  title="Ver / abrir"
                                  onClick={() => void abrirDocumentoSgde(d.nodeId, d.nombre)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-gray-600 hover:bg-gray-100"
                                  title="Descargar"
                                  onClick={() => void descargarDocumentoSgde(d.nodeId, d.nombre)}
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
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

      <Dialog
        open={!!showVisorSgdeBlob}
        onOpenChange={(o) => {
          if (!o) {
            setShowVisorSgdeBlob((prev) => {
              if (prev) URL.revokeObjectURL(prev)
              return null
            })
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] w-full">
          <DialogHeader>
            <DialogTitle>Documento SGDE (PDF)</DialogTitle>
            <DialogDescription>Vista previa desde el gestor judicial. El archivo se obtiene de forma segura por el servidor.</DialogDescription>
          </DialogHeader>
          {showVisorSgdeBlob && (
            <iframe src={showVisorSgdeBlob} className="w-full h-[70vh] border rounded" title="PDF SGDE" />
          )}
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
