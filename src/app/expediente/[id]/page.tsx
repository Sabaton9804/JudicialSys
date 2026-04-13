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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast, Toaster } from 'sonner'
import {
  ArrowLeft, FileText, FolderOpen,
  Eye, Download, Upload, FileSignature, History, Scale, RefreshCw, ClipboardCheck, Loader2, FolderPlus, Clipboard,
  CheckCircle2, X, Search, Unlink, ChevronLeft, ChevronRight, Maximize2, Minimize2,
} from 'lucide-react'
import { useUserStore, type SimulatedUser } from '@/stores/user-store'
import { apiFetch } from '@/lib/api-fetch'
import { etiquetaCarpetaExpediente } from '@/lib/etiqueta-carpeta-expediente'
import { cn } from '@/lib/utils'

const ROLES_LABEL: Record<string, string> = {
  JUEZ: 'Juez',
  OFICIAL_MAYOR: 'Oficial Mayor',
  SECRETARIO: 'Secretario',
  ESCRIBIENTE: 'Escribiente',
  ASISTENTE_JUDICIAL: 'Asistente Judicial',
  ADMIN: 'Administrador (Juzgado)',
  SUPER_ADMIN: 'Super Administrador',
}

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
  const { user: simulatedUser, setUser: setSimulatedUser } = useUserStore()

  const [usuariosLista, setUsuariosLista] = useState<
    Array<{ id: string; nombre: string; email: string; rol: string; area: string; juzgadoId: string | null }>
  >([])

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
  const [analizarDemandaLoading, setAnalizarDemandaLoading] = useState(false)
  const [analizarDemandaArchivoId, setAnalizarDemandaArchivoId] = useState('')
  type AnalisisDemandaVista = {
    datos: Record<string, unknown>
    archivoUsado?: { id: string; nombreOriginal: string; carpeta: string }
    caracteresTexto?: number
  }
  const [analizarDemandaVista, setAnalizarDemandaVista] = useState<AnalisisDemandaVista | null>(null)
  const [analizarDemandaError, setAnalizarDemandaError] = useState<string | null>(null)
  const [sgdeBatchTipo, setSgdeBatchTipo] = useState('Auto')
  const [sgdeBatchNivel, setSgdeBatchNivel] = useState('Reservado')
  const [sgdeBatchRuta, setSgdeBatchRuta] = useState('01PrimeraInstancia/C01')
  /** Tras crear expediente, subir PDF/DOCX locales al SGDE con tipo documental inferido por IA. */
  const [sgdeSubirArchivosAlCrear, setSgdeSubirArchivosAlCrear] = useState(true)
  const [justiciaXxiRadicando, setJusticiaXxiRadicando] = useState(false)
  const [jxSqlServer, setJxSqlServer] = useState('')
  const [jxSqlPort, setJxSqlPort] = useState('1433')
  const [jxSqlDatabase, setJxSqlDatabase] = useState('consejo')
  /** True si .env del servidor ya trae servidor + (Windows auth o usuario SQL). */
  const [jxSqlHintsEnvListo, setJxSqlHintsEnvListo] = useState(false)
  /** True si JUSTICIA_XXI_SQL_SERVER está en .env (aunque el formulario muestre el campo vacío). */
  const [jxSqlServidorEnEnv, setJxSqlServidorEnEnv] = useState(false)
  const [jxSqlPuenteLocalActivo, setJxSqlPuenteLocalActivo] = useState(false)
  /** True si el proceso del puente respondió a /health (no solo que haya .env/secreto). */
  const [jxSqlPuenteEscuchando, setJxSqlPuenteEscuchando] = useState(false)
  const jxSqlHintsYaAplicados = useRef(false)
  const [jxSqlUser, setJxSqlUser] = useState('')
  const [jxSqlPassword, setJxSqlPassword] = useState('')
  const [jxSqlWindowsAuth, setJxSqlWindowsAuth] = useState(false)
  const [sgdeBatchLoading, setSgdeBatchLoading] = useState(false)
  const [sgdeCrearExpedienteLoading, setSgdeCrearExpedienteLoading] = useState(false)
  /** Último resultado de «Crear expediente en SGDE» (persistente hasta cerrar o nueva acción). */
  const [sgdeCrearExpedienteResultado, setSgdeCrearExpedienteResultado] = useState<null | {
    nodeId: string
    radicado: string
    yaRegistrado: boolean
    yaExiste: boolean
    estructuraOk: boolean
    estructuraError?: string
    mapeo?: { serie: string; subserie: string; nombreExpediente: string; despacho: string }
    diagnostico?: {
      contenedorOrigen: 'juzgado_bd' | 'env' | 'resolver'
      parentNodeUuid: string
      busquedaPorCuiUuid: string | null
      busquedaCoincideConNodo: boolean
      notaCuiDistinto: string
      advertenciaBusqueda?: string
    }
    cargaArchivosSgde?: {
      subidosOk: number
      total: number
      aviso?: string
      resultados: Array<{
        archivoId: string
        nombreOriginal: string
        ok: boolean
        tipoDocumental?: string
        error?: string
      }>
    }
    metadatosExpedienteOpcionales?: { aplicado: boolean; detalle?: string }
  }>(null)
  const [sgdeVerificarLoading, setSgdeVerificarLoading] = useState(false)
  const [sgdeVerificarResultado, setSgdeVerificarResultado] = useState<Record<string, unknown> | null>(null)
  const [sgdeDesvincularOpen, setSgdeDesvincularOpen] = useState(false)
  const [sgdeDesvincularLoading, setSgdeDesvincularLoading] = useState(false)
  const sgdeBatchFileRef = useRef<HTMLInputElement>(null)
  /** Visor SGDE tipo galería (PDFs de la misma carpeta, navegación anterior/siguiente). */
  const [sgdeVisor, setSgdeVisor] = useState<null | {
    blobUrl: string
    pdfs: Array<{ nodeId: string; nombre: string }>
    index: number
    nombreCarpeta: string
  }>(null)
  const [sgdeVisorLoading, setSgdeVisorLoading] = useState(false)
  const [sgdeVisorFullscreen, setSgdeVisorFullscreen] = useState(false)
  /** Una sola consulta automática al abrir el expediente si hay credenciales guardadas en el navegador. */
  const sgdeAutoFetchHecho = useRef(false)

  const activeArea = simulatedUser?.area || 'SECRETARIA'

  /**
   * Archivos en BD local: unión de `proceso.archivos` y archivos por cuaderno.
   * Sin deduplicar fuerte, puede verse cada pieza **dos veces** (mismo archivo en raíz y en cuaderno,
   * o dos filas en BD con distinto `id` tras reimportar).
   */
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
    const byId = new Map<string, any>()
    for (const a of list) {
      if (a?.id && !byId.has(a.id)) byId.set(a.id, a)
    }
    let deduped = [...byId.values()]
    const fingerprint = (a: { carpeta?: string; nombreOriginal?: string; nombreArchivo?: string; tamano?: number }) =>
      `${String(a.carpeta || '')}|${String(a.nombreOriginal || a.nombreArchivo || '').trim().toLowerCase()}|${a.tamano ?? 0}`
    const seenFp = new Set<string>()
    deduped = deduped.filter((a) => {
      const k = fingerprint(a)
      if (seenFp.has(k)) return false
      seenFp.add(k)
      return true
    })
    return deduped
  }, [proceso])

  const archivosDemandaAnalisis = useMemo(() => {
    return archivosLocales.filter(
      (a: { carpeta?: string; nombreOriginal?: string }) =>
        a.carpeta === 'DEMANDA' && /\.(pdf|doc|docx)$/i.test(a.nombreOriginal || '')
    )
  }, [archivosLocales])

  const archivosInformeIngreso = useMemo(
    () =>
      archivosLocales.filter(
        (a: { carpeta?: string }) => a.carpeta === 'INFORME_INGRESO_DESPACHO'
      ),
    [archivosLocales]
  )

  const [informePdfLoading, setInformePdfLoading] = useState(false)

  /** Radicado solo dígitos — es el CUI que debe pegar en el portal SGDE (mismo proceso). */
  const radicadoDigitosCui = useMemo(
    () => (proceso?.radicado ? String(proceso.radicado).replace(/\D/g, '') : ''),
    [proceso?.radicado]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/usuarios?activo=true&limit=200')
        const data = await res.json()
        if (cancelled || !data?.success || !Array.isArray(data.data)) return
        setUsuariosLista(data.data)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Misma lógica que la página principal: si no hay usuario (p. ej. primera visita al expediente), elegir uno por defecto. */
  useEffect(() => {
    if (simulatedUser || usuariosLista.length === 0) return
    const defaultUser = usuariosLista.find((u) => u.juzgadoId) || usuariosLista[0]
    setSimulatedUser({
      id: defaultUser.id,
      nombre: defaultUser.nombre,
      email: defaultUser.email,
      rol: defaultUser.rol,
      area: defaultUser.area,
      juzgadoId: defaultUser.juzgadoId,
    })
  }, [usuariosLista, simulatedUser, setSimulatedUser])

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

  /** Rellena servidor/puerto/base y «cuenta Windows» desde .env del servidor (equivalente a no repetir el DSN a mano). */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch('/api/justicia-xxi/sql-hints', {}, simulatedUser?.id)
        if (!res.ok || cancelled) return
        const data = await parseJsonResponse<{
          success?: boolean
          data?: {
            sqlServer?: string
            sqlPort?: string
            sqlDatabase?: string
            suggestWindowsAuth?: boolean
            envListo?: boolean
            servidorEnEnv?: boolean
            puenteLocalActivo?: boolean
            puenteEscuchando?: boolean
          }
        }>(res)
        const d = data?.data
        if (!d || cancelled) return
        setJxSqlPuenteLocalActivo(Boolean(d.puenteLocalActivo))
        setJxSqlPuenteEscuchando(Boolean(d.puenteEscuchando))
        setJxSqlHintsEnvListo(Boolean(d.envListo))
        setJxSqlServidorEnEnv(Boolean(d.servidorEnEnv))
        if (jxSqlHintsYaAplicados.current) return
        jxSqlHintsYaAplicados.current = true
        if (d.sqlServer?.trim()) setJxSqlServer(d.sqlServer.trim())
        setJxSqlPort(d.sqlPort?.trim() || '1433')
        if (d.sqlDatabase?.trim()) setJxSqlDatabase(d.sqlDatabase.trim())
        if (d.suggestWindowsAuth) {
          setJxSqlWindowsAuth(true)
          setJxSqlUser('')
          setJxSqlPassword('')
        }
      } catch {
        /* sin .env o sin sesión: el formulario queda manual */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [simulatedUser?.id])

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

  const generarInformeIngresoDespacho = async (regenerar: boolean) => {
    if (!id || !simulatedUser?.id) {
      toast.error('Seleccione con qué usuario actúa («Actuar como»).')
      return
    }
    setInformePdfLoading(true)
    try {
      const res = await apiFetch(
        `/api/procesos/${id}/informe-ingreso-despacho`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regenerar }),
        },
        simulatedUser.id
      )
      const data = await parseJsonResponse<{
        success?: boolean
        error?: string
        codigo?: string
      }>(res)
      if (!data.success) {
        toast.error(data.error || 'No se pudo generar el informe')
        return
      }
      toast.success(
        regenerar ? 'Nueva versión del informe de ingreso guardada en el expediente.' : 'Informe de ingreso generado.'
      )
      await fetchProceso()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar informe')
    } finally {
      setInformePdfLoading(false)
    }
  }

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

  const cargarDatosParaRadicacion = async () => {
    if (!id || !simulatedUser?.id) {
      toast.error(
        'Indique con qué usuario actúa: use el selector «Actuar como» arriba a la derecha (o vaya al inicio y elija usuario).'
      )
      return
    }
    setAnalizarDemandaLoading(true)
    setAnalizarDemandaError(null)
    try {
      const bodyObj =
        analizarDemandaArchivoId.trim() ? { archivoId: analizarDemandaArchivoId.trim() } : {}
      const res = await apiFetch(
        `/api/procesos/${id}/analizar-demanda`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyObj),
        },
        simulatedUser.id
      )
      const data = await parseJsonResponse<{
        success?: boolean
        error?: string
        datos?: Record<string, unknown>
        archivoUsado?: { id: string; nombreOriginal: string; carpeta: string }
        caracteresTexto?: number
        advertenciaPersistencia?: string
      }>(res)
      if (!res.ok || !data.success) {
        setAnalizarDemandaVista(null)
        setAnalizarDemandaError(data.error || `Error (${res.status})`)
        return
      }
      if (data.advertenciaPersistencia) {
        toast.warning(data.advertenciaPersistencia, { duration: 12_000 })
      }
      setAnalizarDemandaVista({
        datos: data.datos ?? {},
        archivoUsado: data.archivoUsado,
        caracteresTexto: data.caracteresTexto,
      })
      void fetchProceso()
    } catch (e) {
      setAnalizarDemandaVista(null)
      setAnalizarDemandaError(e instanceof Error ? e.message : 'Error al obtener los datos para radicar')
    } finally {
      setAnalizarDemandaLoading(false)
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

  const cargarBlobDocumentoSgde = useCallback(
    async (nodeId: string): Promise<Blob> => {
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
        } catch {
          /* ignore */
        }
        throw new Error(msg)
      }
      return res.blob()
    },
    [id, sgdeUsuario, sgdePassword, simulatedUser?.id]
  )

  const cerrarVisorSgde = useCallback(() => {
    setSgdeVisor((prev) => {
      if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl)
      return null
    })
    setSgdeVisorFullscreen(false)
  }, [])

  const sgdeVisorRef = useRef(sgdeVisor)
  sgdeVisorRef.current = sgdeVisor
  const sgdeVisorNavegandoRef = useRef(false)

  const sgdeVisorIrA = useCallback(
    async (delta: number) => {
      const v = sgdeVisorRef.current
      if (!v || sgdeVisorNavegandoRef.current) return
      const next = v.index + delta
      if (next < 0 || next >= v.pdfs.length) return
      const item = v.pdfs[next]!
      sgdeVisorNavegandoRef.current = true
      setSgdeVisorLoading(true)
      try {
        const blob = await cargarBlobDocumentoSgde(item.nodeId)
        const lower = item.nombre.toLowerCase()
        const isPdf = blob.type.includes('pdf') || lower.endsWith('.pdf')
        if (!isPdf) {
          toast.error('Este archivo no es PDF; use Descargar.')
          return
        }
        const url = URL.createObjectURL(blob)
        setSgdeVisor((prev) => {
          if (!prev) return null
          if (prev.blobUrl) URL.revokeObjectURL(prev.blobUrl)
          return { ...prev, blobUrl: url, index: next }
        })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al cargar el documento')
      } finally {
        sgdeVisorNavegandoRef.current = false
        setSgdeVisorLoading(false)
      }
    },
    [cargarBlobDocumentoSgde]
  )

  useEffect(() => {
    if (!sgdeVisor) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        void sgdeVisorIrA(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        void sgdeVisorIrA(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sgdeVisor, sgdeVisorIrA])

  const abrirDocumentoSgde = async (
    nodeId: string,
    nombre: string,
    carpeta: { nombreCarpeta: string; documentos: SgdeDocFila[] }
  ) => {
    if (!sgdeUsuario.trim() || !sgdePassword) {
      toast.error('Escriba usuario y contraseña del SGDE arriba.')
      return
    }
    const esPdf = (d: SgdeDocFila) =>
      /\.pdf$/i.test(d.nombre) || String(d.formato || '').toUpperCase() === 'PDF'
    const pdfs = carpeta.documentos.filter(esPdf)
    const lista =
      pdfs.length > 0
        ? pdfs.map((d) => ({ nodeId: d.nodeId, nombre: d.nombre }))
        : [{ nodeId, nombre }]
    let idx = lista.findIndex((x) => x.nodeId === nodeId)
    if (idx < 0) idx = 0
    try {
      const blob = await cargarBlobDocumentoSgde(nodeId)
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
      setSgdeVisor((prev) => {
        if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl)
        return { blobUrl: url, pdfs: lista, index: idx, nombreCarpeta: carpeta.nombreCarpeta }
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al abrir el documento')
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

  const crearExpedienteSgde = async () => {
    if (!id) return
    if (!simulatedUser?.id) {
      toast.error(
        'Seleccione con qué usuario actúa («Actuar como» arriba a la derecha) para registrar el expediente en SGDE.'
      )
      return
    }
    if (!sgdeUsuario.trim() || !sgdePassword) {
      toast.error('Escriba usuario y contraseña del SGDE arriba.')
      return
    }
    setSgdeCrearExpedienteLoading(true)
    setSgdeCrearExpedienteResultado(null)
    try {
      const body: Record<string, string | boolean> = {
        sgdeUsuario: sgdeUsuario.trim(),
        sgdePassword: sgdePassword,
        ...(sgdeSubirArchivosAlCrear ? { subirArchivosLocales: true } : {}),
      }
      const res = await apiFetch(
        `/api/sgde/procesos/${id}/crear-expediente`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        simulatedUser.id
      )
      const data = await parseJsonResponse<{
        success?: boolean
        error?: string
        detalle?: string
        yaRegistrado?: boolean
        yaExiste?: boolean
        nodeId?: string
        message?: string
        radicado?: string
        estructuraPrimeraInstancia?: { creadaOExistente: boolean; error?: string }
        mapeoSgde?: { serie: string; subserie: string; nombreExpediente: string; despacho: string }
        diagnostico?: {
          contenedorOrigen: 'juzgado_bd' | 'env' | 'resolver'
          parentNodeUuid: string
          busquedaPorCuiUuid: string | null
          busquedaCoincideConNodo: boolean
          notaCuiDistinto: string
          advertenciaBusqueda?: string
        }
        cargaArchivosSgde?: {
          subidosOk: number
          total: number
          aviso?: string
          resultados: Array<{
            archivoId: string
            nombreOriginal: string
            ok: boolean
            tipoDocumental?: string
            error?: string
          }>
        }
        metadatosExpedienteOpcionales?: { aplicado: boolean; detalle?: string }
      }>(res)
      if (!res.ok || !data.success) {
        const extra = data.detalle ? ` ${data.detalle.slice(0, 120)}` : ''
        toast.error((data.error || 'No se pudo crear el expediente') + extra)
        return
      }
      const nodeId = data.nodeId ?? ''
      const radicado = data.radicado ?? ''
      const ep = data.estructuraPrimeraInstancia
      const estructuraOk = ep?.creadaOExistente === true
      const estructuraError =
        ep?.creadaOExistente === false && typeof ep?.error === 'string' ? ep.error : undefined

      if (data.yaRegistrado) {
        toast.warning('No se creó de nuevo en SGDE', {
          description:
            data.message ||
            'JudicialSys ya tenía un UUID guardado. Para ejecutar la creación automática otra vez: «Quitar vínculo» y pulse el botón verde.',
        })
      } else if (data.yaExiste) {
        toast.success('Vinculado correctamente', {
          description: 'El expediente ya existía en SGDE; JudicialSys guardó el mismo UUID.',
        })
      } else {
        toast.success('Creado correctamente en SGDE', {
          description:
            estructuraOk
              ? 'El expediente quedó registrado y se prepararon las carpetas Primera instancia / Principal cuando fue necesario.'
              : 'El nodo expediente quedó creado en el gestor. Revise el panel de resultado por si faltó alguna subcarpeta.',
        })
      }

      if (nodeId) {
        setSgdeCrearExpedienteResultado({
          nodeId,
          radicado,
          yaRegistrado: Boolean(data.yaRegistrado),
          yaExiste: Boolean(data.yaExiste),
          estructuraOk,
          estructuraError: estructuraOk ? undefined : estructuraError,
          mapeo: data.mapeoSgde,
          diagnostico: data.diagnostico,
          cargaArchivosSgde: data.cargaArchivosSgde,
          metadatosExpedienteOpcionales: data.metadatosExpedienteOpcionales,
        })
      }

      await fetchProceso()
      void fetchDocumentosSgde()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear el expediente en SGDE')
    } finally {
      setSgdeCrearExpedienteLoading(false)
    }
  }

  const verificarVinculoSgde = async () => {
    if (!id) return
    if (!simulatedUser?.id) {
      toast.error('Seleccione con qué usuario actúa («Actuar como» arriba a la derecha).')
      return
    }
    if (!sgdeUsuario.trim() || !sgdePassword) {
      toast.error('Escriba usuario y contraseña del SGDE.')
      return
    }
    setSgdeVerificarLoading(true)
    setSgdeVerificarResultado(null)
    try {
      const res = await apiFetch(
        `/api/sgde/procesos/${id}/verificar-expediente`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sgdeUsuario: sgdeUsuario.trim(),
            sgdePassword: sgdePassword,
          }),
        },
        simulatedUser.id
      )
      const data = (await parseJsonResponse(res)) as {
        success?: boolean
        error?: string
        nodoAccesible?: boolean
        interpretacion?: string
      }
      if (!res.ok || !data.success) {
        toast.error(data.error || 'No se pudo verificar')
        return
      }
      setSgdeVerificarResultado(data as Record<string, unknown>)
      if (data.nodoAccesible) {
        toast.success('SGDE reconoce el UUID guardado en JudicialSys')
      } else {
        toast.error('El UUID guardado no es accesible en SGDE con estas credenciales')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al verificar')
    } finally {
      setSgdeVerificarLoading(false)
    }
  }

  const desvincularVinculoSgde = async () => {
    if (!id || !simulatedUser?.id) return
    setSgdeDesvincularLoading(true)
    try {
      const res = await apiFetch(
        `/api/sgde/procesos/${id}/desvincular-expediente`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        simulatedUser.id
      )
      const data = (await parseJsonResponse(res)) as { success?: boolean; error?: string; message?: string }
      if (!res.ok || !data.success) {
        toast.error(data.error || 'No se pudo quitar el vínculo')
        return
      }
      toast.success(data.message || 'Vínculo eliminado en JudicialSys')
      setSgdeDesvincularOpen(false)
      setSgdeVerificarResultado(null)
      setSgdeCrearExpedienteResultado(null)
      await fetchProceso()
      void fetchDocumentosSgde()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al desvincular')
    } finally {
      setSgdeDesvincularLoading(false)
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
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="flex flex-col gap-1 sm:items-end shrink-0">
            <Label className="text-[11px] text-gray-500 sm:text-right">Actuar como (usuario simulado)</Label>
            <Select
              value={simulatedUser?.id || ''}
              onValueChange={(uid) => {
                if (uid === '__empty__') return
                const u = usuariosLista.find((x) => x.id === uid)
                if (u) {
                  const next: SimulatedUser = {
                    id: u.id,
                    nombre: u.nombre,
                    email: u.email,
                    rol: u.rol,
                    area: u.area,
                    juzgadoId: u.juzgadoId,
                  }
                  setSimulatedUser(next)
                } else setSimulatedUser(null)
              }}
            >
              <SelectTrigger className="w-full sm:w-[260px]">
                <SelectValue placeholder="Elija usuario…" />
              </SelectTrigger>
              <SelectContent>
                {usuariosLista.length === 0 ? (
                  <SelectItem value="__empty__" disabled>
                    Cargando usuarios…
                  </SelectItem>
                ) : (
                  usuariosLista.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre} ({ROLES_LABEL[u.rol] || u.rol})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
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

        {/* Datos para radicación — escrito en carpeta DEMANDA */}
        <Card className="border-violet-200 bg-violet-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-violet-950">
              <ClipboardCheck className="w-5 h-5 text-violet-600 shrink-0" />
              Radicación — verificación desde la demanda
            </CardTitle>
            <CardDescription>
              Extrae del PDF o Word en carpeta <strong>DEMANDA</strong> los datos de identificación que suelen exigirse
              al radicar (tipo y clase de proceso, partes, apoderados), según CGP, para contrastarlos con el expediente.
              No sustituye la revisión del secretario ni el acto de radicación en el sistema oficial.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {archivosDemandaAnalisis.length === 0 ? (
              <p className="text-sm text-gray-700">
                No hay documentos PDF o Word en carpeta <Badge variant="outline">DEMANDA</Badge>. Suba el escrito desde
                la importación o el repositorio local para poder verificar los datos de radicación.
              </p>
            ) : (
              <>
                {archivosDemandaAnalisis.length > 1 && (
                  <div className="flex flex-col gap-1.5 max-w-md">
                    <Label htmlFor="radicacion-demanda-archivo" className="text-xs text-gray-600">
                      Escrito a tomar (opcional: por defecto <code className="text-[11px]">EscritoDemanda.pdf</code> o el más
                      reciente)
                    </Label>
                    <select
                      id="radicacion-demanda-archivo"
                      className="border border-violet-200 rounded-md px-3 py-2 text-sm bg-white"
                      value={analizarDemandaArchivoId}
                      onChange={(e) => setAnalizarDemandaArchivoId(e.target.value)}
                    >
                      <option value="">Automático (recomendado)</option>
                      {archivosDemandaAnalisis.map((a: { id: string; nombreOriginal: string }) => (
                        <option key={a.id} value={a.id}>
                          {a.nombreOriginal}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <Button
                  type="button"
                  onClick={() => void cargarDatosParaRadicacion()}
                  disabled={analizarDemandaLoading}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  {analizarDemandaLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ClipboardCheck className="w-4 h-4 mr-2" />
                  )}
                  Obtener datos para radicar
                </Button>
              </>
            )}
            {analizarDemandaError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                {analizarDemandaError}
              </div>
            )}
            {analizarDemandaVista && Object.keys(analizarDemandaVista.datos).length > 0 && (
              <div className="rounded-lg border border-violet-100 bg-white p-4 space-y-3 text-sm">
                {analizarDemandaVista.archivoUsado && (
                  <p className="text-xs text-gray-500">
                    Fuente: <span className="font-medium text-gray-800">{analizarDemandaVista.archivoUsado.nombreOriginal}</span>
                    {analizarDemandaVista.caracteresTexto != null && (
                      <> · {analizarDemandaVista.caracteresTexto.toLocaleString('es-CO')} caracteres extraídos</>
                    )}
                  </p>
                )}
                {analizarDemandaVista.datos.informeDemandaProcesal ? (
                  <>
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-900 border border-violet-50 rounded-md p-3 bg-violet-50/30 max-h-[min(70vh,32rem)] overflow-y-auto">
                      {String(analizarDemandaVista.datos.informeDemandaProcesal)}
                    </pre>
                    {(
                      [
                        ['SGDE — Serie (inferida por IA)', analizarDemandaVista.datos.sgdeSerie],
                        ['SGDE — Subserie (inferida por IA)', analizarDemandaVista.datos.sgdeSubserie],
                        ['SGDE — Categoría (inferida por IA)', analizarDemandaVista.datos.sgdeCategoriaProceso],
                        ['SGDE — Nombre expediente (sugerido)', analizarDemandaVista.datos.sgdeNombreExpediente],
                        ['SGDE — Código subserie (solo si consta en el escrito)', analizarDemandaVista.datos.sgdeCodigoSubserie],
                      ] as [string, unknown][]
                    ).some(([, v]) => v != null && String(v).trim() !== '') ? (
                      <dl className="mt-3 space-y-2 border-t border-violet-100 pt-3">
                        {(
                          [
                            ['SGDE — Serie (inferida por IA)', analizarDemandaVista.datos.sgdeSerie],
                            ['SGDE — Subserie (inferida por IA)', analizarDemandaVista.datos.sgdeSubserie],
                            ['SGDE — Categoría (inferida por IA)', analizarDemandaVista.datos.sgdeCategoriaProceso],
                            ['SGDE — Nombre expediente (sugerido)', analizarDemandaVista.datos.sgdeNombreExpediente],
                            ['SGDE — Código subserie (solo si consta en el escrito)', analizarDemandaVista.datos.sgdeCodigoSubserie],
                          ] as [string, unknown][]
                        ).map(([label, val]) =>
                          val != null && String(val).trim() !== '' ? (
                            <ExpedienteDlRow key={label} label={label}>
                              {String(val)}
                            </ExpedienteDlRow>
                          ) : null
                        )}
                      </dl>
                    ) : null}
                  </>
                ) : (
                  <dl className="space-y-2">
                    {(
                      [
                        ['Demandante / accionante', analizarDemandaVista.datos.demandante],
                        ['Demandado / accionado', analizarDemandaVista.datos.demandado],
                        ['Clase CGP', analizarDemandaVista.datos.claseProcesoGrupoCGP],
                        [
                          'Clase (sistema)',
                          analizarDemandaVista.datos.claseProceso
                            ? getClaseProcesoLabel(String(analizarDemandaVista.datos.claseProceso))
                            : null,
                        ],
                        ['Tipo de proceso', analizarDemandaVista.datos.tipoProcesoDescripcion],
                        ['Apoderados demandante', analizarDemandaVista.datos.apoderadosDemandante],
                        ['Apoderados demandado', analizarDemandaVista.datos.apoderadosDemandado],
                        ['Radicado (si consta)', analizarDemandaVista.datos.radicado],
                        ['Doc. demandante', analizarDemandaVista.datos.documentoDemandante],
                        ['Doc. demandado', analizarDemandaVista.datos.documentoDemandado],
                        ['Observaciones', analizarDemandaVista.datos.observacionesExtraccion],
                        ['SGDE — Serie (inferida por IA)', analizarDemandaVista.datos.sgdeSerie],
                        ['SGDE — Subserie (inferida por IA)', analizarDemandaVista.datos.sgdeSubserie],
                        ['SGDE — Categoría (inferida por IA)', analizarDemandaVista.datos.sgdeCategoriaProceso],
                        ['SGDE — Nombre expediente (sugerido)', analizarDemandaVista.datos.sgdeNombreExpediente],
                        ['SGDE — Código subserie (solo si consta en el escrito)', analizarDemandaVista.datos.sgdeCodigoSubserie],
                      ] as [string, unknown][]
                    ).map(([label, val]) =>
                      val != null && String(val).trim() !== '' ? (
                        <ExpedienteDlRow key={label} label={label}>
                          {String(val)}
                        </ExpedienteDlRow>
                      ) : null
                    )}
                  </dl>
                )}
              </div>
            )}
            {analizarDemandaVista && Object.keys(analizarDemandaVista.datos).length === 0 && !analizarDemandaError && (
              <p className="text-sm text-amber-800">
                No se obtuvieron datos reconocibles. Revise que el PDF tenga texto seleccionable o la configuración del
                servidor.
              </p>
            )}
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

        <Card className="border-slate-200 bg-slate-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <FileText className="w-5 h-5 text-slate-700 shrink-0" />
              Informe de ingreso al despacho
            </CardTitle>
            <CardDescription>
              Documento de constancia de ingreso (PDF) según la plantilla del juzgado o la plantilla global. Las versiones
              quedan en la carpeta <code className="text-[11px]">INFORME_INGRESO_DESPACHO</code>; al regenerar se crea una
              nueva versión sin borrar la anterior.
              <Link href="/plantillas-documento" className="text-cyan-700 underline font-medium">
                {' '}
                Editar plantillas
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {archivosInformeIngreso.length > 0 && (
              <ul className="text-sm space-y-1.5">
                {archivosInformeIngreso.map((a: any) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate max-w-[min(280px,55vw)]" title={a.nombreOriginal}>
                      {a.nombreOriginal}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      v{a.version ?? 1}
                    </Badge>
                    <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                      <a href={`/api/archivos/${a.id}`} target="_blank" rel="noopener noreferrer">
                        Ver PDF
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={informePdfLoading || archivosInformeIngreso.length > 0}
                onClick={() => void generarInformeIngresoDespacho(false)}
              >
                {informePdfLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Generar informe
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={informePdfLoading || archivosInformeIngreso.length === 0}
                onClick={() => void generarInformeIngresoDespacho(true)}
              >
                Regenerar (nueva versión)
              </Button>
            </div>
          </CardContent>
        </Card>

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
                            {a.carpeta ? etiquetaCarpetaExpediente(a.carpeta) : '—'}
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
                      Indique usuario y contraseña del SGDE (se guardan solo en este navegador). Puede{' '}
                      <strong>crear el expediente aquí mismo</strong> con el botón verde: no necesita abrir el portal web.{' '}
                      <strong>Actualizar lista</strong> muestra documentos del expediente ya existente en el gestor.
                    </>
                  )
                  : (
                    <>
                      Credenciales guardadas en este equipo. <strong>Crear expediente en SGDE</strong> usa la API de la Rama;{' '}
                      <strong>Actualizar lista</strong> consulta carpetas y archivos en el SGDE.
                    </>
                  )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
              <p className="font-semibold text-slate-900 mb-1">JudicialSys y SGDE</p>
              <p className="leading-relaxed text-slate-700">
                Este expediente vive en <strong>JudicialSys</strong> (local). El <strong>SGDE</strong> es el gestor de la Rama: el botón verde{' '}
                <strong>crea allí</strong> el expediente por API; «Actualizar lista» solo muestra documentos si ese expediente ya existe en el gestor.
              </p>
            </div>
            <div className="rounded-lg border border-cyan-200 bg-cyan-50/80 px-4 py-3 text-sm text-slate-800">
              <p className="font-semibold text-cyan-950 mb-2">CUI (radicado) usado al crear en SGDE</p>
              <p className="text-xs text-slate-600 mb-2">
                Es el mismo número del proceso (23 dígitos habitualmente). La creación automática lo envía sola; no hace falta copiarlo al portal.
              </p>
              {radicadoDigitosCui ? (
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-xs sm:text-sm font-mono bg-white border border-cyan-200 rounded px-2 py-1.5 break-all max-w-full">
                    {radicadoDigitosCui}
                  </code>
                  <span className="text-xs text-slate-500 tabular-nums">({radicadoDigitosCui.length} dígitos)</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-cyan-400 text-cyan-900"
                    onClick={() => {
                      void navigator.clipboard.writeText(radicadoDigitosCui)
                      toast.success('CUI (radicado) copiado al portapapeles')
                    }}
                  >
                    <Clipboard className="w-4 h-4 mr-1" />
                    Copiar CUI
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-amber-800">Asigne radicado en JudicialSys antes de crear en SGDE.</p>
              )}
              <details className="mt-3 border-t border-cyan-100 pt-2 text-xs text-slate-600">
                <summary className="cursor-pointer font-medium text-cyan-900 list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden">
                  <span className="text-cyan-600">▸</span> Solo si prefiere el portal web (respaldo manual)
                </summary>
                <div className="mt-2 space-y-2 pl-1 border-l-2 border-cyan-200 pl-3">
                  <p>
                    Puede crear el expediente usted mismo en el SGDE con el mismo CUI: menú <strong>Expedientes</strong> →{' '}
                    <strong>nuevo expediente</strong>, pegar el CUI y <strong>Guardar</strong>. Debe coincidir con el radicado de este expediente.
                  </p>
                  <p>
                    Si el formulario pide 21 dígitos o muestra error de longitud, complete el CUI hasta 23 dígitos según el instructivo actual del gestor.
                  </p>
                </div>
              </details>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50/90 px-4 py-3 text-sm text-slate-800 space-y-3">
              <p className="font-semibold text-violet-950">Registrar en Justicia XXI</p>
              <p className="text-xs text-slate-700 leading-snug">
                <strong>Recomendado (SIJC):</strong> usuario y contraseña SQL del sistema judicial (p. ej. el que muestra el portal), IP del servidor SQL, puerto 1433 y base <code className="text-[10px]">consejo</code>.{' '}
                <strong>Pasos:</strong> 1) IP (la misma que en ODBC o la que le dé tecnología). 2) Usuario y clave SQL — <em>sin</em> marcar «cuenta de Windows». 3) Pulse Registrar. Solo si sistemas le dijo explícitamente Trusted_Connection/Windows, marque la casilla y omita usuario.
              </p>
              {jxSqlPuenteLocalActivo && !jxSqlPuenteEscuchando ? (
                <p className="text-[11px] text-amber-950 bg-amber-50 rounded px-2 py-1 border border-amber-300">
                  <strong>Puente configurado pero no responde</strong> en <code className="text-[10px]">127.0.0.1:3847</code>.
                  En consola, carpeta del proyecto: <code className="text-[10px]">npm run dev</code> (sube puente + web; deje esa ventana abierta). Luego{' '}
                  <code className="text-[10px]">http://127.0.0.1:3847/health</code> y recargue esta página.
                </p>
              ) : null}
              {jxSqlPuenteLocalActivo && jxSqlPuenteEscuchando ? (
                <p className="text-[11px] text-sky-900 bg-sky-50 rounded px-2 py-1 border border-sky-200">
                  <strong>Puente en marcha:</strong> la conexión a SQL la abre el proceso en su PC.{' '}
                  <strong>Sigue haciendo falta</strong> indicar IP, puerto y base (o en <code className="text-[10px]">.env</code>).
                </p>
              ) : null}
              {jxSqlHintsEnvListo ? (
                <p className="text-[11px] text-emerald-800 bg-emerald-50 rounded px-2 py-1 border border-emerald-200">
                  Los datos ya vienen del servidor: revise y pulse Registrar.
                </p>
              ) : (
                <p className="text-[11px] text-violet-800/90">
                  Opcional: quien instaló el programa puede guardar la IP en el <code className="text-[10px]">.env</code> (<code className="text-[10px]">JUSTICIA_XXI_SQL_SERVER</code>) para no escribirla cada vez.
                </p>
              )}
              <details className="text-[11px] text-slate-600 rounded border border-violet-100 bg-white/60 px-2 py-1.5">
                <summary className="cursor-pointer font-medium text-violet-900 select-none">
                  ¿Por qué falla aunque el portal del juzgado sí abre? (ayuda técnica)
                </summary>
                <div className="mt-2 space-y-2 pl-1 border-l-2 border-violet-100">
                  <p>
                    JudicialSys no usa el DSN de Windows; usa los mismos <em>datos</em> (IP, puerto, base). La conexión la hace un programa en red (Next.js o, si usa puente, el script del puente en su PC), no “solo el navegador”.
                  </p>
                  <p>
                    Con <strong>usuario y clave del SIJC</strong> (autenticación SQL) suele bastar: mismo esquema que el portal, sin integrada de Windows ni <code className="text-[10px]">msnodesqlv8</code>. Si ODBC es solo Windows, pida un login SQL o use el puente con cuenta Windows avanzada.
                  </p>
                </div>
              </details>
              <label className="flex items-start gap-2 text-xs text-violet-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={jxSqlWindowsAuth}
                  onChange={(e) => {
                    const on = e.target.checked
                    setJxSqlWindowsAuth(on)
                    if (on) {
                      setJxSqlUser('')
                      setJxSqlPassword('')
                    }
                  }}
                  className="mt-0.5"
                />
                <span>
                  <strong>Solo si aplica:</strong> cuenta de Windows / Trusted_Connection (avanzado). La mayoría usa usuario y clave SQL del SIJC arriba, <em>sin</em> marcar esto.
                </span>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-[1fr_5.5rem] gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="exp-jx-server" className="text-xs text-violet-950">
                      IP del servidor SQL
                    </Label>
                    <Input
                      id="exp-jx-server"
                      value={jxSqlServer}
                      onChange={(e) => setJxSqlServer(e.target.value)}
                      placeholder="Escriba aquí la IP o el nombre (no use solo el texto gris de ejemplo)"
                      autoComplete="off"
                      className="text-sm bg-white"
                    />
                    {!jxSqlServer.trim() && !jxSqlServidorEnEnv ? (
                      <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        <strong>El campo de servidor está vacío.</strong> Lo gris dentro del cuadro es solo pista: haga
                        clic, escriba la misma IP que en ODBC (DSN csjsql → Server) o pídala a sistemas. También puede
                        definir <code className="text-[10px]">JUSTICIA_XXI_SQL_SERVER</code> en el <code className="text-[10px]">.env</code> del servidor Next.js.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="exp-jx-port" className="text-xs text-violet-950">
                      Puerto
                    </Label>
                    <Input
                      id="exp-jx-port"
                      value={jxSqlPort}
                      onChange={(e) => setJxSqlPort(e.target.value)}
                      placeholder="1433"
                      inputMode="numeric"
                      autoComplete="off"
                      className="text-sm bg-white"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="exp-jx-db" className="text-xs text-violet-950">
                    Nombre de la base de datos
                  </Label>
                  <Input
                    id="exp-jx-db"
                    value={jxSqlDatabase}
                    onChange={(e) => setJxSqlDatabase(e.target.value)}
                    onBlur={() => setJxSqlDatabase((d) => (d.trim() ? d : 'consejo'))}
                    placeholder="consejo"
                    autoComplete="off"
                    className="text-sm bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="exp-jx-user" className="text-xs text-violet-950">
                    Usuario SQL (SIJC)
                  </Label>
                  <Input
                    id="exp-jx-user"
                    value={jxSqlUser}
                    onChange={(e) => setJxSqlUser(e.target.value)}
                    autoComplete="username"
                    disabled={jxSqlWindowsAuth}
                    className="text-sm bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="exp-jx-pass" className="text-xs text-violet-950">
                    Contraseña SQL
                  </Label>
                  <Input
                    id="exp-jx-pass"
                    type="password"
                    value={jxSqlPassword}
                    onChange={(e) => setJxSqlPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={jxSqlWindowsAuth}
                    className="text-sm bg-white"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                {jxSqlWindowsAuth
                  ? jxSqlPuenteLocalActivo && jxSqlPuenteEscuchando
                    ? 'No se envían credenciales SQL. La identidad de Windows es la del proceso del puente en su PC (npm run justicia-xxi:bridge), no la del servidor Next.js.'
                    : jxSqlPuenteLocalActivo && !jxSqlPuenteEscuchando
                      ? 'Arranque el puente en otra ventana o «Registrar» fallará al contactar 127.0.0.1:3847.'
                      : 'No se envían credenciales SQL; se usa la identidad de Windows del equipo donde corre el servidor Next.js.'
                  : 'La contraseña no se guarda en JudicialSys después de usarla.'}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-violet-400 text-violet-900"
                disabled={justiciaXxiRadicando || !id}
                onClick={async () => {
                  if (!jxSqlWindowsAuth && !jxSqlUser.trim()) {
                    toast.error('Escriba el usuario SQL o active «cuenta de Windows»')
                    return
                  }
                  if (!jxSqlWindowsAuth && jxSqlUser.trim() && !jxSqlPassword.trim()) {
                    toast.error(
                      'Con usuario SQL hace falta la contraseña que le dio sistemas. Si su conexión es solo Windows (como el DSN csjsql con Trusted_Connection), marque «cuenta de Windows» y deje usuario vacío.',
                      { duration: 12000 }
                    )
                    return
                  }
                  if (!jxSqlServer.trim() && !jxSqlServidorEnEnv) {
                    toast.error(
                      'Falta el equipo servidor (IP o nombre). Ej.: 172.16.155.193 — la misma que en ODBC para csjsql. O defina JUSTICIA_XXI_SQL_SERVER en el .env donde corre Next.js.',
                      { duration: 10000 }
                    )
                    return
                  }
                  setJusticiaXxiRadicando(true)
                  if (jxSqlPuenteLocalActivo && jxSqlPuenteEscuchando) {
                    toast.info(
                      'Puente Justicia XXI: la operación puede tardar varios minutos (conexión e inserción en SQL). No cierre la ventana del puente ni pulse de nuevo el botón.',
                      { duration: 10000 }
                    )
                  }
                  try {
                    const body: Record<string, string | boolean> = { procesoId: id }
                    if (jxSqlServer.trim()) body.justiciaXxiSqlServer = jxSqlServer.trim()
                    if (jxSqlPort.trim()) body.justiciaXxiSqlPort = jxSqlPort.trim()
                    body.justiciaXxiSqlDatabase = jxSqlDatabase.trim() || 'consejo'
                    if (jxSqlWindowsAuth) {
                      body.justiciaXxiSqlWindowsAuth = true
                    } else {
                      body.justiciaXxiSqlUser = jxSqlUser.trim()
                      if (jxSqlPassword.length > 0) body.justiciaXxiSqlPassword = jxSqlPassword
                    }

                    const res = await apiFetch(
                      '/api/justicia-xxi/radicar',
                      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
                      simulatedUser?.id
                    )
                    const data = await parseJsonResponse<{
                      success?: boolean
                      error?: string
                      message?: string
                      data?: { llave: string; yaExistia: boolean }
                    }>(res)
                    if (data?.success && data.data) {
                      toast.success(
                        data.data.yaExistia
                          ? `Ese radicado ya estaba en Justicia XXI (${data.data.llave}).`
                          : data.message || `Registrado en Justicia XXI (${data.data.llave}).`,
                        { duration: 7000 }
                      )
                    } else {
                      toast.error(data?.error || 'No se pudo registrar en Justicia XXI', { duration: 9000 })
                    }
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Error al llamar la API', { duration: 8000 })
                  } finally {
                    setJusticiaXxiRadicando(false)
                  }
                }}
              >
                {justiciaXxiRadicando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando a SQL…
                  </>
                ) : (
                  <>Registrar en Justicia XXI</>
                )}
              </Button>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm space-y-3">
              <p className="font-semibold text-emerald-950 flex items-center gap-2">
                <FolderPlus className="w-4 h-4 shrink-0" />
                Crear expediente en SGDE (automático)
              </p>
              <p className="leading-relaxed text-slate-800">
                <strong>No tiene que usar el formulario web del portal.</strong> Al pulsar el botón, el servidor inicia sesión en el SGDE
                y crea el expediente en el gestor (Alfresco) con el mismo CUI de arriba. Serie, subserie, despacho y nombre se toman de
                este proceso (y de lo inferido por IA cuando aplica). Si falta radicado de 23 dígitos o credenciales, el sistema lo
                indicará.
              </p>
              <label className="flex items-start gap-2 cursor-pointer text-slate-800">
                <Checkbox
                  checked={sgdeSubirArchivosAlCrear}
                  onCheckedChange={(v) => setSgdeSubirArchivosAlCrear(v === true)}
                  disabled={Boolean(proceso?.sgdeExpedienteAlfrescoId)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-snug">
                  Subir también al SGDE los <strong>PDF y DOCX</strong> de este expediente (carpeta Principal). El{' '}
                  <strong>tipo documental</strong> se asigna con IA según el catálogo SGDE (requiere{' '}
                  <code className="text-xs bg-white/80 px-1 rounded">OPENAI_API_KEY</code> en el servidor; si no hay, se usa la carpeta JudicialSys).
                </span>
              </label>
              <Button
                type="button"
                variant="secondary"
                className="bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-700 font-medium"
                disabled={
                  sgdeCrearExpedienteLoading ||
                  sgdeLoading ||
                  !proceso ||
                  Boolean(proceso?.sgdeExpedienteAlfrescoId)
                }
                onClick={() => void crearExpedienteSgde()}
              >
                {sgdeCrearExpedienteLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FolderPlus className="w-4 h-4 mr-2" />
                )}
                {proceso?.sgdeExpedienteAlfrescoId
                  ? 'Ya hay vínculo — use «Quitar vínculo» para crear de nuevo'
                  : sgdeCrearExpedienteLoading
                    ? 'Creando en SGDE…'
                    : 'Crear expediente en SGDE ahora'}
              </Button>
              {proceso?.sgdeExpedienteAlfrescoId ? (
                <div className="space-y-3">
                  <p className="text-xs text-emerald-900">
                    <span className="font-medium">UUID guardado en JudicialSys:</span>{' '}
                    <span className="font-mono break-all">{proceso.sgdeExpedienteAlfrescoId}</span>
                  </p>
                  <p className="text-xs text-slate-700">
                    El botón verde está desactivado porque <strong>ya hay un vínculo guardado</strong>. Para volver a ejecutar la creación
                    automática, pulse <strong>Quitar vínculo</strong> (solo borra el enlace local, no el expediente en la Rama).
                  </p>
                  <p className="text-xs text-amber-950 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2 leading-relaxed">
                    Si no ve el expediente en la lista del SGDE, use <strong>Comprobar en SGDE</strong> para validar el UUID con sus
                    credenciales.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-emerald-600 text-emerald-900 bg-white hover:bg-emerald-50"
                      disabled={sgdeVerificarLoading || sgdeCrearExpedienteLoading}
                      onClick={() => void verificarVinculoSgde()}
                    >
                      {sgdeVerificarLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4 mr-2" />
                      )}
                      Comprobar en SGDE
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-slate-400 text-slate-800"
                      disabled={sgdeDesvincularLoading}
                      onClick={() => setSgdeDesvincularOpen(true)}
                    >
                      <Unlink className="w-4 h-4 mr-2" />
                      Quitar vínculo en JudicialSys
                    </Button>
                  </div>
                  {sgdeVerificarResultado ? (
                    <div
                      className={`rounded-md border px-3 py-2 text-xs space-y-1.5 ${
                        sgdeVerificarResultado.nodoAccesible
                          ? 'border-emerald-300 bg-white text-slate-800'
                          : 'border-red-200 bg-red-50 text-red-950'
                      }`}
                    >
                      <p className="font-semibold">
                        {sgdeVerificarResultado.nodoAccesible
                          ? 'El SGDE respondió al UUID guardado'
                          : 'El SGDE no devolvió ese expediente con sus credenciales'}
                      </p>
                      {typeof sgdeVerificarResultado.interpretacion === 'string' ? (
                        <p className="leading-relaxed opacity-95">{sgdeVerificarResultado.interpretacion}</p>
                      ) : null}
                      {sgdeVerificarResultado.nodoAccesible &&
                      sgdeVerificarResultado.lectura &&
                      typeof sgdeVerificarResultado.lectura === 'object' &&
                      sgdeVerificarResultado.lectura !== null &&
                      'cmName' in sgdeVerificarResultado.lectura ? (
                        <p className="font-mono text-[11px] break-all">
                          Nodo: {(sgdeVerificarResultado.lectura as { cmName?: string }).cmName ?? '—'} · CUI en metadatos:{' '}
                          {(sgdeVerificarResultado.lectura as { nomExpediente?: string }).nomExpediente ?? '—'}
                        </p>
                      ) : null}
                      {sgdeVerificarResultado.busquedaPorCui &&
                      typeof sgdeVerificarResultado.busquedaPorCui === 'object' ? (
                        <p className="text-[11px] font-mono break-all">
                          Búsqueda por CUI → UUID:{' '}
                          {(sgdeVerificarResultado.busquedaPorCui as { uuid?: string | null }).uuid ?? 'ninguno'}
                        </p>
                      ) : null}
                      {typeof sgdeVerificarResultado.notaEstadoLista === 'string' ? (
                        <p className="text-[11px] text-slate-600 border-t border-slate-200 pt-1.5 mt-1.5 leading-relaxed">
                          {sgdeVerificarResultado.notaEstadoLista}
                        </p>
                      ) : null}
                      {sgdeVerificarResultado.lectura &&
                      typeof sgdeVerificarResultado.lectura === 'object' &&
                      sgdeVerificarResultado.lectura !== null &&
                      'propiedadesRama' in sgdeVerificarResultado.lectura &&
                      sgdeVerificarResultado.lectura.propiedadesRama &&
                      typeof sgdeVerificarResultado.lectura.propiedadesRama === 'object' ? (
                        <details className="text-[11px] mt-1">
                          <summary className="cursor-pointer text-slate-700 font-medium">
                            Metadatos rama:* en el nodo (diagnóstico)
                          </summary>
                          <pre className="mt-1 max-h-36 overflow-auto rounded border bg-white p-2 text-[10px] leading-tight">
                            {JSON.stringify(
                              (sgdeVerificarResultado.lectura as { propiedadesRama?: Record<string, string> })
                                .propiedadesRama,
                              null,
                              2
                            )}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {sgdeCrearExpedienteResultado ? (
                <div className="relative rounded-lg border border-emerald-300 bg-white shadow-sm">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-8 w-8 text-slate-500 hover:text-slate-800"
                    onClick={() => setSgdeCrearExpedienteResultado(null)}
                    aria-label="Cerrar resultado"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Alert className="border-0 bg-transparent pr-10">
                    <CheckCircle2 className="text-emerald-600" />
                    <AlertTitle className="text-emerald-950">
                      {sgdeCrearExpedienteResultado.yaRegistrado
                        ? 'Sin nueva creación: ya había vínculo guardado'
                        : sgdeCrearExpedienteResultado.yaExiste
                          ? 'Vinculado con expediente que ya existía en SGDE'
                          : 'Creado en SGDE por API'}
                    </AlertTitle>
                    <AlertDescription className="text-slate-700 space-y-2">
                      <p>
                        <span className="font-medium text-slate-900">CUI (radicado): </span>
                        <span className="font-mono tabular-nums">
                          {sgdeCrearExpedienteResultado.radicado || radicadoDigitosCui || '—'}
                        </span>
                      </p>
                      <p className="break-all">
                        <span className="font-medium text-slate-900">UUID en SGDE: </span>
                        <span className="font-mono text-xs">{sgdeCrearExpedienteResultado.nodeId}</span>
                      </p>
                      {sgdeCrearExpedienteResultado.mapeo ? (
                        <p className="text-xs">
                          <span className="font-medium">Serie / Subserie enviados: </span>
                          {sgdeCrearExpedienteResultado.mapeo.serie} — {sgdeCrearExpedienteResultado.mapeo.subserie}
                        </p>
                      ) : null}
                      {sgdeCrearExpedienteResultado.mapeo?.despacho ? (
                        <p className="text-xs">
                          <span className="font-medium">Despacho (metadato enviado): </span>
                          {sgdeCrearExpedienteResultado.mapeo.despacho}
                        </p>
                      ) : null}
                      {sgdeCrearExpedienteResultado.diagnostico ? (
                        <div className="text-xs space-y-1 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <p className="text-slate-700">{sgdeCrearExpedienteResultado.diagnostico.notaCuiDistinto}</p>
                          <p>
                            <span className="font-medium text-slate-800">Origen carpeta expedientes: </span>
                            {sgdeCrearExpedienteResultado.diagnostico.contenedorOrigen === 'juzgado_bd'
                              ? 'guardado para este juzgado en JudicialSys'
                              : sgdeCrearExpedienteResultado.diagnostico.contenedorOrigen === 'env'
                                ? 'variable SGDE_PARENT_EXPEDIENTES_NODE_ID'
                                : 'resolución automática por código de radicación'}
                          </p>
                          <p className="font-mono text-[11px] break-all">
                            <span className="font-sans font-medium text-slate-800">UUID carpeta padre: </span>
                            {sgdeCrearExpedienteResultado.diagnostico.parentNodeUuid}
                          </p>
                          <p className="font-mono text-[11px] break-all">
                            <span className="font-sans font-medium text-slate-800">Búsqueda API por CUI → UUID: </span>
                            {sgdeCrearExpedienteResultado.diagnostico.busquedaPorCuiUuid ?? 'ninguno'}
                            {sgdeCrearExpedienteResultado.diagnostico.busquedaCoincideConNodo ? (
                              <span className="font-sans text-emerald-700"> (coincide con el nodo creado)</span>
                            ) : (
                              <span className="font-sans text-amber-800"> (no coincide o vacío)</span>
                            )}
                          </p>
                          {sgdeCrearExpedienteResultado.diagnostico.advertenciaBusqueda ? (
                            <p className="text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                              {sgdeCrearExpedienteResultado.diagnostico.advertenciaBusqueda}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {!sgdeCrearExpedienteResultado.yaRegistrado &&
                      !sgdeCrearExpedienteResultado.estructuraOk &&
                      sgdeCrearExpedienteResultado.estructuraError ? (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                          <span className="font-medium">Carpetas internas: </span>
                          {sgdeCrearExpedienteResultado.estructuraError}
                        </p>
                      ) : null}
                      {!sgdeCrearExpedienteResultado.yaRegistrado && sgdeCrearExpedienteResultado.estructuraOk ? (
                        <p className="text-xs text-emerald-800">
                          Carpetas <strong>Primera instancia</strong> y cuaderno <strong>Principal</strong> comprobadas o creadas.
                        </p>
                      ) : null}
                      {sgdeCrearExpedienteResultado.metadatosExpedienteOpcionales?.aplicado ? (
                        <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                          Se aplicó el metadato de estado configurado en el servidor (
                          <code className="text-[10px]">SGDE_EXPEDIENTE_ESTADO_PROP</code> /{' '}
                          <code className="text-[10px]">VALOR</code>).
                        </p>
                      ) : sgdeCrearExpedienteResultado.metadatosExpedienteOpcionales?.detalle ? (
                        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                          Metadato de estado opcional no aplicado:{' '}
                          {sgdeCrearExpedienteResultado.metadatosExpedienteOpcionales.detalle.slice(0, 200)}
                        </p>
                      ) : null}
                      {sgdeCrearExpedienteResultado.cargaArchivosSgde ? (
                        <div className="text-xs space-y-1 rounded border border-cyan-200 bg-cyan-50/80 px-2 py-1.5">
                          <p className="font-medium text-cyan-950">Carga de archivos locales al SGDE</p>
                          {sgdeCrearExpedienteResultado.cargaArchivosSgde.aviso ? (
                            <p className="text-amber-900">{sgdeCrearExpedienteResultado.cargaArchivosSgde.aviso}</p>
                          ) : (
                            <p>
                              Subidos:{' '}
                              <strong>
                                {sgdeCrearExpedienteResultado.cargaArchivosSgde.subidosOk}/
                                {sgdeCrearExpedienteResultado.cargaArchivosSgde.total}
                              </strong>{' '}
                              (tipo documental por IA o carpeta JudicialSys).
                            </p>
                          )}
                          {sgdeCrearExpedienteResultado.cargaArchivosSgde.resultados?.length ? (
                            <ul className="list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto">
                              {sgdeCrearExpedienteResultado.cargaArchivosSgde.resultados.map((r) => (
                                <li key={r.archivoId} className="font-mono text-[11px]">
                                  {r.ok ? '✓' : '✗'} {r.nombreOriginal}{' '}
                                  {r.tipoDocumental ? (
                                    <span className="text-slate-600">({r.tipoDocumental})</span>
                                  ) : null}
                                  {r.error ? <span className="text-red-700"> — {r.error.slice(0, 80)}</span> : null}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="border-t border-slate-200 pt-2 mt-2 space-y-1.5 text-xs text-slate-600">
                        <p className="font-medium text-slate-800">¿No aparece en «Lista de expedientes»?</p>
                        <p>
                          El índice de búsqueda del SGDE puede tardar <strong>varios minutos</strong> (a veces más) en mostrar un
                          expediente recién creado por API, aunque el UUID sea válido. Busque por <strong>CUI completo</strong> (23
                          dígitos), <strong>Estado: Todos</strong>, y reintente tras unos minutos.
                        </p>
                        <p>
                          Si la columna <strong>Estado</strong> sale vacía o distinta a «En trámite», es normal: el formulario web del
                          portal rellena metadatos de trámite que nuestra creación por API no envía por defecto. Quien administre el
                          servidor puede definir <code className="text-[10px] bg-slate-100 px-1 rounded">SGDE_EXPEDIENTE_ESTADO_PROP</code>{' '}
                          y <code className="text-[10px] bg-slate-100 px-1 rounded">SGDE_EXPEDIENTE_ESTADO_VALOR</code> según el
                          instructivo del modelo documental (CSJ/UTDI).
                        </p>
                        <p>
                          Si acaba de crear por API, busque por CUI en <strong>Expediente</strong>, <strong>Estado: Todos</strong> y
                          despacho vacío si hace falta. Si el mensaje fue «sin nueva creación», no se llamó otra vez al SGDE: use{' '}
                          <strong>Quitar vínculo</strong> y vuelva a pulsar crear, o <strong>Comprobar en SGDE</strong>.
                        </p>
                        <p>
                          <Link
                            href="https://siugj-sgde.ramajudicial.gov.co/expedientes/lista-expedientes"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-700 font-medium underline hover:text-cyan-900"
                          >
                            Abrir lista de expedientes en SGDE
                          </Link>
                        </p>
                      </div>
                    </AlertDescription>
                  </Alert>
                </div>
              ) : null}
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
                varios PDF/DOCX al expediente abierto en el SGDE. Máximo 40 archivos por lote. Deje <strong>Tipo documental</strong> en{' '}
                <code className="text-[11px] bg-white px-1 rounded">Auto</code> para que la IA asigne un tipo del catálogo SGDE a{' '}
                <em>cada</em> archivo; o escriba un tipo fijo para todo el lote.
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
                  /no hay carpeta|aún no hay|no existe expediente|no se encontró el expediente en sgde/i.test(sgdeError)
                    ? 'rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950'
                    : 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900'
                }
              >
                <p className="font-medium">{sgdeError}</p>
                {/no hay carpeta|aún no hay|no existe expediente|no se encontró el expediente en sgde/i.test(sgdeError) &&
                  proceso?.radicado && (
                  <p className="mt-2 text-xs leading-relaxed text-sky-900/90">
                    <strong>No es un error de su expediente en JudicialSys.</strong> Este listado solo lee lo que ya existe en el
                    gestor de la Rama. Mientras no cree allí el expediente con el mismo radicado (
                    <span className="font-mono">{proceso.radicado}</span>), la consulta devolverá vacío: es lo esperado.
                    Use arriba <strong>Crear expediente en SGDE</strong> o el portal web, luego pulse <strong>Actualizar lista</strong>.
                    Los archivos que tenga solo en JudicialSys no se copian solos al SGDE.
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
                                  onClick={() => void abrirDocumentoSgde(d.nodeId, d.nombre, carpeta)}
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

            <AlertDialog open={sgdeDesvincularOpen} onOpenChange={setSgdeDesvincularOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Quitar vínculo SGDE en JudicialSys?</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-700">
                    Se borrará el UUID guardado en este expediente. <strong>No elimina</strong> expedientes en el portal de la Rama
                    Judicial. Después podrá volver a pulsar «Crear expediente en SGDE» para crear o enlazar de nuevo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={sgdeDesvincularLoading}>Cancelar</AlertDialogCancel>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={sgdeDesvincularLoading}
                    onClick={() => void desvincularVinculoSgde()}
                  >
                    {sgdeDesvincularLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Quitar vínculo
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
        open={!!sgdeVisor}
        onOpenChange={(o) => {
          if (!o) cerrarVisorSgde()
        }}
      >
        <DialogContent
          showCloseButton={false}
          className={cn(
            'gap-0 p-0 overflow-hidden border-0 shadow-2xl flex min-h-0 flex-col bg-[#f3f2f1] text-slate-900',
            sgdeVisorFullscreen
              ? '!fixed !inset-0 !left-0 !top-0 !z-50 !h-screen !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 !rounded-none'
              : 'max-w-[min(96vw,1520px)] w-[min(96vw,1520px)] h-[min(92vh,920px)] max-h-[92vh] rounded-xl border border-slate-200/80'
          )}
        >
          <DialogTitle className="sr-only">
            {sgdeVisor
              ? `${sgdeVisor.pdfs[sgdeVisor.index]?.nombre || 'Documento'} — ${sgdeVisor.nombreCarpeta}`
              : 'Visor de documento SGDE'}
          </DialogTitle>
          {sgdeVisor && (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-black/10 bg-[#1b1b1b] px-3 py-2.5 text-white sm:px-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold tracking-tight sm:text-sm" title={sgdeVisor.pdfs[sgdeVisor.index]?.nombre}>
                    {sgdeVisor.pdfs[sgdeVisor.index]?.nombre || 'Documento'}
                  </p>
                  <p className="truncate text-[11px] text-white/65">
                    {sgdeVisor.nombreCarpeta}
                    <span className="mx-1.5 opacity-50">·</span>
                    {sgdeVisor.index + 1} de {sgdeVisor.pdfs.length}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-white hover:bg-white/10"
                    title={sgdeVisorFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                    onClick={() => setSgdeVisorFullscreen((f) => !f)}
                  >
                    {sgdeVisorFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-white hover:bg-white/10"
                    title="Cerrar"
                    onClick={() => cerrarVisorSgde()}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="relative min-h-0 flex-1 bg-[#525659]">
                <div className="absolute inset-0 flex">
                  <div className="flex w-12 shrink-0 items-center justify-center sm:w-14">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={sgdeVisorLoading || sgdeVisor.index <= 0}
                      className="h-11 w-11 rounded-full border border-white/20 bg-black/35 text-white shadow-md backdrop-blur-sm hover:bg-black/50 disabled:opacity-30"
                      title="Anterior (←)"
                      onClick={() => void sgdeVisorIrA(-1)}
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                  </div>

                  <div className="relative min-h-0 min-w-0 flex-1">
                    {sgdeVisorLoading && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/25">
                        <Loader2 className="h-10 w-10 animate-spin text-white" />
                      </div>
                    )}
                    <iframe
                      key={sgdeVisor.blobUrl}
                      src={sgdeVisor.blobUrl}
                      className="absolute inset-0 h-full w-full border-0"
                      title="PDF SGDE"
                    />
                  </div>

                  <div className="flex w-12 shrink-0 items-center justify-center sm:w-14">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={sgdeVisorLoading || sgdeVisor.index >= sgdeVisor.pdfs.length - 1}
                      className="h-11 w-11 rounded-full border border-white/20 bg-black/35 text-white shadow-md backdrop-blur-sm hover:bg-black/50 disabled:opacity-30"
                      title="Siguiente (→)"
                      onClick={() => void sgdeVisorIrA(1)}
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-black/10 bg-white px-3 py-2 text-center text-[11px] leading-relaxed text-slate-500 sm:px-4">
                Botones laterales o flechas del teclado para pasar al PDF anterior o siguiente en esta carpeta. Si el teclado no
                responde, haga clic en la barra superior y reintente. Vista segura vía JudicialSys.
              </div>
            </>
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
