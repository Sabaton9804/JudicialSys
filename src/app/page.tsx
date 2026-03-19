'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast, Toaster } from 'sonner'
import { 
  AlertTriangle, Bell, Calendar, Clock, FileText, Gavel, Home, Mail, Menu,
  Search, Users, Building2, CheckCircle2, XCircle, AlertCircle, Timer,
  Send, Plus, RefreshCw, Wifi, WifiOff, Download, Eye, Upload,   FolderOpen, File,
  ClipboardList, UserPlus, History, Archive, Briefcase, Play, CheckSquare, BarChart3,
  MessageSquare, PenTool, BookOpen, Scale, FileSignature, Shield, Pencil, MapPin, Trash2, ExternalLink
} from 'lucide-react'
import { useWebSocket } from '@/hooks/use-websocket'
import { useUserStore } from '@/stores/user-store'
import { apiFetch } from '@/lib/api-fetch'

// ==================== HELPERS ====================
/** Parsea la respuesta como JSON. Si la API devuelve HTML (error 404/500), lanza un error conciso sin volcar HTML en consola. */
async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const text = await res.text()
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    if (!res.ok) {
      const shortMsg = text.startsWith('<!') ? `API ${res.status}: ${res.statusText}` : (text.slice(0, 200) || `Error ${res.status}`)
      throw new Error(shortMsg)
    }
    throw new Error('La respuesta no es JSON')
  }
  try {
    return (text ? JSON.parse(text) : null) as T
  } catch {
    throw new Error('Respuesta JSON inválida')
  }
}

// ==================== TYPES ====================
interface Proceso {
  id: string
  radicado: string
  demandante: string
  demandado: string
  juzgadoId?: string
  categoriaProceso: string
  claseProceso: string
  ubicacionSecretaria?: { id: string; nombre: string; codigo: string | null } | null
  demanda: string
  estado: string
  etapaProcesal: string
  _count?: { notificaciones: number; oficios: number; memoriales: number; providencias: number }
  providencias?: { id: string; estado: string; tipo: string }[]
  terminos?: { id: string; tipo: string; completado: boolean; fechaVencimiento: string }[]
}

interface Providencia {
  id: string
  tipo: string
  numero: string
  asunto: string
  estado: string
  fecha: string
  tipoAuto?: string
  proceso?: { radicado: string; demandante: string; demandado: string }
  proyectadoPor?: { nombre: string; rol: string }
  firmadoPor?: { nombre: string; rol: string }
}

interface Memorial {
  id: string
  tipo: string
  numero: string
  asunto: string
  estado: string
  fechaPresentacion: string
  presentante: string
  folios?: number
  proceso?: { radicado: string; demandante: string; demandado: string }
  recibidoPor?: { nombre: string }
}

interface Tarea {
  id: string
  procesoId: string
  titulo: string
  descripcion?: string
  tipo: string
  prioridad: string
  estado: string
  area: string
  fechaLimite?: string
  diasRestantes?: number
  estadoCalculado?: string
  proceso?: { radicado: string; demandante: string; demandado: string }
  responsable?: { id: string; nombre: string }
  createdAt: string
}

interface UsuarioAdmin {
  id: string
  email: string
  nombre: string
  rol: string
  area: string
  juzgadoId: string | null
  activo: boolean
  juzgado?: { id: string; nombre: string; codigo: string; tipoJuzgado: string; ciudad: string } | null
}

interface JuzgadoAdmin {
  id: string
  nombre: string
  codigo: string
  tipoJuzgado: string
  ciudad: string
  _count?: { usuarios: number; procesos: number }
}

interface DashboardData {
  resumen: {
    procesos: { total: number; activos: number; civiles: number; constitucionales: number; tutelas?: number }
    tutelasActivas?: { id: string; radicado: string; demandante: string; demandado: string; demanda?: string; oficialMayor?: string; diasRestantes: number | null; fechaLimite: Date | null }[]
    alertas: number
    procesosPorTipoCivil: { clase: string; cantidad: number }[]
    procesosPorTipoTutela: { clase: string; cantidad: number }[]
  }
  despacho: {
    providencias: { pendientesFirma: number; proyectadas: number; autosProferidos: number; sentenciasProferidas: number }
    tareasPendientes: number
    paraFirma: any[]
    paraRevisar: any[]
    enCorreccion: any[]
    procesosParaFirma: any[]
  }
  secretaria: {
    procesosParaPublicar: any[]
    providenciasParaPublicar: { count: number; lista: any[] }
    terminos: { vigentes: number; porVencer: number; vencidos: number; total: number }
    notificaciones: { pendientes: number; enProceso: number }
    oficios: { pendientes: number; sinRespuesta: number; lista: any[] }
    memoriales: { pendientes: number; lista: any[] }
    audiencias: { hoy: number; semana: number; proximas: any[] }
    tareasPendientes: number
  }
  alertas: {
    terminosCriticos: any[]
    alertasRecientes: any[]
  }
}

// ==================== MAIN COMPONENT ====================
const ROLES_LABEL: Record<string, string> = {
  JUEZ: 'Juez',
  OFICIAL_MAYOR: 'Oficial Mayor',
  SECRETARIO: 'Secretario',
  ESCRIBIENTE: 'Escribiente',
  ASISTENTE_JUDICIAL: 'Asistente Judicial',
  ADMIN: 'Administrador (Juzgado)',
  SUPER_ADMIN: 'Super Administrador',
}

export default function GestorSecretariaJudicial() {
  const [activeArea, setActiveArea] = useState<'DESPACHO' | 'SECRETARIA' | 'ADMIN'>('SECRETARIA')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  
  // Data states
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [procesos, setProcesos] = useState<Proceso[]>([])
  const [providencias, setProvidencias] = useState<Providencia[]>([])
  const [providenciasFirmadas, setProvidenciasFirmadas] = useState<Providencia[]>([])
  const [memoriales, setMemoriales] = useState<Memorial[]>([])
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [tareasStats, setTareasStats] = useState<any>(null)
  
  // Dialog states
  const [showNuevaTarea, setShowNuevaTarea] = useState(false)
  const [showNuevaProvidencia, setShowNuevaProvidencia] = useState(false)
  const [providenciaProcesoId, setProvidenciaProcesoId] = useState('')
  const [providenciaTipo, setProvidenciaTipo] = useState<'AUTO' | 'SENTENCIA'>('AUTO')
  const [providenciaAsunto, setProvidenciaAsunto] = useState('')
  const [providenciaContenido, setProvidenciaContenido] = useState('')
  const providenciaFileInputRef = useRef<HTMLInputElement>(null)
  const [showNuevoMemorial, setShowNuevoMemorial] = useState(false)
  const [showNuevoOficio, setShowNuevoOficio] = useState(false)
  const [showNuevaNotificacion, setShowNuevaNotificacion] = useState(false)
  const [showNuevoTermino, setShowNuevoTermino] = useState(false)
  const [showNuevaAudiencia, setShowNuevaAudiencia] = useState(false)
  const [showNuevoUsuario, setShowNuevoUsuario] = useState(false)
  const [showNuevoJuzgado, setShowNuevoJuzgado] = useState(false)
  const [showNuevoProceso, setShowNuevoProceso] = useState(false)
  const [nuevoProcesoTipo, setNuevoProcesoTipo] = useState<'general' | 'tutela'>('general')
  const [formClaseProceso, setFormClaseProceso] = useState<string>('')
  const [formCategoriaProceso, setFormCategoriaProceso] = useState<string>('CIVIL')
  const [formInstancia, setFormInstancia] = useState<string>('PRIMERA_INSTANCIA')
  const [formJuzgadoId, setFormJuzgadoId] = useState<string>('')
  const [formOficialMayorId, setFormOficialMayorId] = useState<string>('')
  const [showIngresarDespacho, setShowIngresarDespacho] = useState(false)
  const [procesoParaIngresar, setProcesoParaIngresar] = useState<any>(null)
  const [showCrearExpediente, setShowCrearExpediente] = useState(false)
  const [crearExpedienteTab, setCrearExpedienteTab] = useState<'reparto' | 'manual'>('reparto')
  const [importandoReparto, setImportandoReparto] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState<UsuarioAdmin | null>(null)
  const [showUbicacionesJuzgado, setShowUbicacionesJuzgado] = useState(false)
  const [juzgadoParaUbicaciones, setJuzgadoParaUbicaciones] = useState<JuzgadoAdmin | null>(null)
  const [ubicaciones, setUbicaciones] = useState<{ id: string; nombre: string; codigo: string | null; orden: number; activo: boolean }[]>([])
  const [nuevaUbicacionNombre, setNuevaUbicacionNombre] = useState('')
  const [nuevaUbicacionCodigo, setNuevaUbicacionCodigo] = useState('')
  const [showTiposEstadisticaJuzgado, setShowTiposEstadisticaJuzgado] = useState(false)
  const [juzgadoParaTipos, setJuzgadoParaTipos] = useState<JuzgadoAdmin | null>(null)
  const [tiposProcesoEstadistica, setTiposProcesoEstadistica] = useState<{ id: string; nombre: string; codigo: string | null; orden: number; activo: boolean; categoriaProceso: string }[]>([])
  const [tiposProcesoParaForm, setTiposProcesoParaForm] = useState<{ id: string; nombre: string }[]>([])
  const [formTipoProcesoEstadisticaId, setFormTipoProcesoEstadisticaId] = useState<string>('')
  const [nuevaTipoNombre, setNuevaTipoNombre] = useState('')
  const [nuevaTipoCodigo, setNuevaTipoCodigo] = useState('')
  const [tabTiposEstadistica, setTabTiposEstadistica] = useState<'CIVIL' | 'CONSTITUCIONAL'>('CIVIL')
  
  // Admin data
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([])
  const [juzgados, setJuzgados] = useState<JuzgadoAdmin[]>([])
  
  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const { user: simulatedUser, setUser: setSimulatedUser } = useUserStore()
  const searchParams = useSearchParams()
  const router = useRouter()

  // Datos para módulos Secretaría
  const [oficios, setOficios] = useState<any[]>([])
  const [oficiosStats, setOficiosStats] = useState<any>(null)
  const [notificacionesJudiciales, setNotificacionesJudiciales] = useState<any[]>([])
  const [notificacionesStats, setNotificacionesStats] = useState<any>(null)
  const [terminos, setTerminos] = useState<any[]>([])
  const [terminosStats, setTerminosStats] = useState<any>(null)
  const [audiencias, setAudiencias] = useState<any[]>([])
  const [audienciasStats, setAudienciasStats] = useState<any>(null)
  const [plannerData, setPlannerData] = useState<any[]>([])
  const [plannerStats, setPlannerStats] = useState<any>(null)

  // WebSocket connection
  const { isConnected } = useWebSocket({
    juzgadoId: 'default-juzgado',
    onNotificacion: (data) => {
      toast.info(data.titulo, { description: data.mensaje })
      fetchDashboard()
    }
  })

  // ==================== FETCH FUNCTIONS ====================
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await apiFetch('/api/dashboard', {}, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; data?: DashboardData }>(res)
      if (data.success) {
        setDashboardData(data.data ?? null)
      }
    } catch (error) {
      console.error('Dashboard:', error instanceof Error ? error.message : error)
    }
  }, [simulatedUser?.id])

  const fetchProcesos = useCallback(async (opts?: { clase?: string; categoria?: string }) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('busqueda', searchQuery)
      if (opts?.clase) params.set('clase', opts.clase)
      if (opts?.categoria) params.set('categoria', opts.categoria)
      const url = params.toString() ? `/api/procesos?${params}` : '/api/procesos'
      const res = await apiFetch(url, {}, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; data?: Proceso[] }>(res)
      if (data.success) {
        setProcesos(data.data ?? [])
      }
    } catch (error) {
      console.error('Procesos:', error instanceof Error ? error.message : error)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, simulatedUser?.id])

  const fetchProcesosCiviles = useCallback(() => fetchProcesos({ categoria: 'CIVIL' }), [fetchProcesos])
  const fetchTutelas = useCallback(() => fetchProcesos({ clase: 'TUTELA' }), [fetchProcesos])

  const fetchProvidencias = useCallback(async () => {
    try {
      const res = await apiFetch('/api/providencias', {}, simulatedUser?.id)
      const data = await parseJsonResponse<Providencia[]>(res)
      setProvidencias(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Providencias:', error instanceof Error ? error.message : error)
    }
  }, [simulatedUser?.id])

  const fetchProvidenciasFirmadas = useCallback(async () => {
    try {
      const res = await apiFetch('/api/providencias?estado=FIRMADO', {}, simulatedUser?.id)
      const data = await parseJsonResponse<Providencia[]>(res)
      setProvidenciasFirmadas(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Providencias firmadas:', error instanceof Error ? error.message : error)
    }
  }, [simulatedUser?.id])

  const openExpediente = useCallback((procesoId: string) => {
    router.push(`/expediente/${procesoId}`)
  }, [router])

  const fetchMemoriales = useCallback(async () => {
    try {
      const res = await apiFetch('/api/memoriales', {}, simulatedUser?.id)
      const data = await parseJsonResponse<Memorial[] | { error?: string }>(res)
      setMemoriales(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Memoriales:', error instanceof Error ? error.message : error)
    }
  }, [simulatedUser?.id])

  const fetchTareas = useCallback(async (area?: string) => {
    try {
      const url = area ? `/api/tareas?area=${area}` : '/api/tareas'
      const res = await apiFetch(url, {}, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; data?: Tarea[]; stats?: any }>(res)
      if (data.success) {
        setTareas(data.data ?? [])
        setTareasStats(data.stats ?? null)
      }
    } catch (error) {
      console.error('Tareas:', error instanceof Error ? error.message : error)
    }
  }, [simulatedUser?.id])

  const fetchOficios = useCallback(async () => {
    try {
      const res = await apiFetch('/api/oficios', {}, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; data?: any[]; stats?: any }>(res)
      if (data.success) {
        setOficios(data.data ?? [])
        setOficiosStats(data.stats ?? null)
      }
    } catch (error) {
      console.error('Oficios:', error instanceof Error ? error.message : error)
    }
  }, [simulatedUser?.id])

  const fetchNotificacionesJudiciales = useCallback(async () => {
    try {
      const res = await apiFetch('/api/notificaciones', {}, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; data?: any[]; stats?: any }>(res)
      if (data.success) {
        setNotificacionesJudiciales(data.data ?? [])
        setNotificacionesStats(data.stats ?? null)
      }
    } catch (error) {
      console.error('Notificaciones judiciales:', error instanceof Error ? error.message : error)
    }
  }, [simulatedUser?.id])

  const fetchTerminos = useCallback(async () => {
    try {
      const res = await apiFetch('/api/terminos', {}, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; data?: any[]; stats?: any }>(res)
      if (data.success) {
        setTerminos(data.data ?? [])
        setTerminosStats(data.stats ?? null)
      }
    } catch (error) {
      console.error('Términos:', error instanceof Error ? error.message : error)
    }
  }, [simulatedUser?.id])

  const fetchPlanner = useCallback(async () => {
    try {
      const res = await apiFetch('/api/planner', {}, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; data?: any[]; stats?: any }>(res)
      if (data.success) {
        setPlannerData(data.data ?? [])
        setPlannerStats(data.stats ?? null)
      }
    } catch (error) {
      console.error('Planner:', error instanceof Error ? error.message : error)
    }
  }, [simulatedUser?.id])

  const fetchAudiencias = useCallback(async () => {
    try {
      const res = await apiFetch('/api/audiencias', {}, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; data?: any[]; stats?: any }>(res)
      if (data.success) {
        setAudiencias(data.data ?? [])
        setAudienciasStats(data.stats ?? null)
      }
    } catch (error) {
      console.error('Audiencias:', error instanceof Error ? error.message : error)
    }
  }, [simulatedUser?.id])

  const fetchUsuarios = useCallback(async () => {
    try {
      const res = await fetch('/api/usuarios')
      const data = await parseJsonResponse<{ success: boolean; data?: UsuarioAdmin[] }>(res)
      if (data.success) setUsuarios(data.data ?? [])
    } catch (error) {
      console.error('Usuarios:', error instanceof Error ? error.message : error)
    }
  }, [])

  const fetchJuzgados = useCallback(async () => {
    try {
      const res = await fetch('/api/juzgados')
      const data = await parseJsonResponse<{ success: boolean; data?: JuzgadoAdmin[] }>(res)
      if (data.success) setJuzgados(data.data ?? [])
    } catch (error) {
      console.error('Juzgados:', error instanceof Error ? error.message : error)
    }
  }, [])

  const fetchUbicaciones = useCallback(async (juzgadoId: string) => {
    try {
      const res = await apiFetch(`/api/ubicaciones?juzgadoId=${juzgadoId}`, {}, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; data?: { id: string; nombre: string; codigo: string | null; orden: number; activo: boolean }[] }>(res)
      if (data.success) setUbicaciones(data.data ?? [])
    } catch (error) {
      console.error('Ubicaciones:', error instanceof Error ? error.message : error)
      setUbicaciones([])
    }
  }, [simulatedUser?.id])

  const fetchTiposProcesoEstadistica = useCallback(async (juzgadoId: string) => {
    try {
      const res = await apiFetch(`/api/tipos-proceso-estadistica?juzgadoId=${juzgadoId}`, {}, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; data?: { id: string; nombre: string; codigo: string | null; orden: number; activo: boolean }[] }>(res)
      if (data.success) setTiposProcesoEstadistica(data.data ?? [])
    } catch (error) {
      console.error('Tipos proceso:', error instanceof Error ? error.message : error)
      setTiposProcesoEstadistica([])
    }
  }, [simulatedUser?.id])

  const fetchTiposParaForm = useCallback(async (juzgadoId: string, categoriaProceso: string) => {
    try {
      const res = await apiFetch(`/api/tipos-proceso-estadistica?juzgadoId=${juzgadoId}&categoriaProceso=${categoriaProceso}`, {}, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; data?: { id: string; nombre: string }[] }>(res)
      if (data.success) setTiposProcesoParaForm(data.data ?? [])
    } catch {
      setTiposProcesoParaForm([])
    }
  }, [simulatedUser?.id])

  useEffect(() => {
    if (formJuzgadoId && formCategoriaProceso) fetchTiposParaForm(formJuzgadoId, formCategoriaProceso)
    else setTiposProcesoParaForm([])
  }, [formJuzgadoId, formCategoriaProceso, fetchTiposParaForm])

  // Initial fetch
  useEffect(() => {
    fetchDashboard()
    fetchTareas()
  }, [fetchDashboard, fetchTareas])

  // Cargar usuarios al inicio para selector de usuario simulado
  useEffect(() => {
    fetchUsuarios()
  }, [fetchUsuarios])

  // Al cambiar a Despacho, mostrar Expedientes por defecto
  useEffect(() => {
    if (activeArea === 'DESPACHO' && !['dashboard', 'planner', 'tutelas', 'procesos', 'tareas'].includes(activeTab)) {
      setActiveTab('dashboard')
    }
  }, [activeArea])

  // Fetch on area/tab change
  useEffect(() => {
    if (activeArea === 'ADMIN') {
      fetchUsuarios()
      fetchJuzgados()
    } else if (activeArea === 'DESPACHO') {
      fetchProvidencias()
      fetchPlanner()
    } else if (activeArea === 'SECRETARIA') {
      fetchMemoriales()
      fetchProcesos()
    }
    if (activeArea !== 'ADMIN') fetchTareas(activeArea)
    if (activeTab === 'oficios') fetchOficios()
    if (activeTab === 'emplazamientos') fetchNotificacionesJudiciales()
    if (activeTab === 'terminos') fetchTerminos()
    if (activeTab === 'audiencias') fetchAudiencias()
    if (activeTab === 'proveer') fetchProvidenciasFirmadas()
    if (activeTab === 'planner') fetchPlanner()
    if (activeTab === 'procesos') fetchProcesosCiviles()
    if (activeTab === 'tutelas') fetchTutelas()
  }, [activeArea, activeTab, fetchProvidencias, fetchProvidenciasFirmadas, fetchMemoriales, fetchTareas, fetchUsuarios, fetchJuzgados, fetchOficios, fetchNotificacionesJudiciales, fetchTerminos, fetchAudiencias, fetchPlanner, fetchProcesos, fetchProcesosCiviles, fetchTutelas])

  // Manejar ?ingresar=procesoId (desde expediente en pestaña aparte)
  useEffect(() => {
    const ingresarId = searchParams.get('ingresar')
    if (!ingresarId || !simulatedUser?.id) return
    ;(async () => {
      try {
        const res = await apiFetch(`/api/procesos/${ingresarId}`, {}, simulatedUser.id)
        const data = await parseJsonResponse<{ success: boolean; data?: any }>(res)
        if (data.success && data.data) {
          setProcesoParaIngresar(data.data)
          setShowIngresarDespacho(true)
          window.history.replaceState({}, '', '/')
        }
      } catch { /* ignore */ }
    })()
  }, [searchParams, simulatedUser?.id])

  // Usuario simulado por defecto (primer usuario con juzgado)
  useEffect(() => {
    if (!simulatedUser && usuarios.length > 0) {
      const defaultUser = usuarios.find(u => u.juzgadoId) || usuarios[0]
      setSimulatedUser({
        id: defaultUser.id,
        nombre: defaultUser.nombre,
        email: defaultUser.email,
        rol: defaultUser.rol,
        area: defaultUser.area,
        juzgadoId: defaultUser.juzgadoId,
      })
    }
  }, [usuarios, simulatedUser, setSimulatedUser])

  // ==================== HANDLERS ====================
  const handleFirmarProvidencia = async (providenciaId: string) => {
    if (!simulatedUser?.id) {
      toast.error('Seleccione un usuario (Juez) para firmar')
      return
    }
    try {
      const res = await apiFetch('/api/providencias', {
        method: 'PUT',
        body: JSON.stringify({ 
          id: providenciaId, 
          firmadoPorId: simulatedUser.id,
          estado: 'FIRMADO'
        }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser.id)
      const data = await parseJsonResponse<unknown>(res)
      if (data != null) {
        toast.success('Providencia firmada exitosamente')
        fetchProvidencias()
        fetchProvidenciasFirmadas()
        fetchDashboard()
      }
    } catch (error) {
      toast.error('Error al firmar providencia')
    }
  }

  const handlePublicarEnEstado = async (providenciaId: string) => {
    if (!simulatedUser?.id) {
      toast.error('Seleccione un usuario arriba (“Simular usuario”) para publicar en estado.')
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
        toast.success('Providencia publicada en estado. Término de ejecutoria iniciado.')
        fetchProvidencias()
        fetchProvidenciasFirmadas()
        fetchDashboard()
        fetchTerminos()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al publicar en estado')
    }
  }

  const handleIngresarDespacho = async (formData: FormData) => {
    if (!procesoParaIngresar?.id || !simulatedUser?.id) return
    try {
      const res = await apiFetch(`/api/procesos/${procesoParaIngresar.id}/ingresar-despacho`, {
        method: 'POST',
        body: JSON.stringify({
          oficialMayorId: formData.get('oficialMayorId'),
          fechaEntradaDespacho: formData.get('fechaEntradaDespacho') || new Date().toISOString().slice(0, 10),
          fechaLimiteDespacho: formData.get('fechaLimiteDespacho'),
        }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser.id)
      const data = await parseJsonResponse<{ success: boolean }>(res)
      if (data?.success) {
        toast.success('Proceso ingresado al Despacho')
        setShowIngresarDespacho(false)
        setProcesoParaIngresar(null)
        if (activeTab === 'tutelas') fetchTutelas()
        else if (activeTab === 'procesos') fetchProcesosCiviles()
        fetchDashboard()
        fetchPlanner()
      } else {
        toast.error((data as any)?.error || 'Error')
      }
    } catch (error) {
      toast.error('Error al ingresar al Despacho')
    }
  }

  const handleCrearTarea = async (formData: FormData) => {
    if (!simulatedUser?.id) {
      toast.error('Seleccione un usuario para crear la tarea')
      return
    }
    try {
      const res = await apiFetch('/api/tareas', {
        method: 'POST',
        body: JSON.stringify({
          procesoId: formData.get('procesoId'),
          titulo: formData.get('titulo'),
          descripcion: formData.get('descripcion'),
          tipo: formData.get('tipo'),
          prioridad: formData.get('prioridad'),
          area: activeArea,
          responsableId: (formData.get('responsableId') as string) === '__sin_asignar__' ? null : (formData.get('responsableId') as string) || null,
          creadoPorId: simulatedUser?.id,
          fechaLimite: formData.get('fechaLimite') || null,
        }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; error?: string }>(res)
      if (data.success) {
        toast.success('Tarea creada exitosamente')
        setShowNuevaTarea(false)
        fetchTareas(activeArea)
      } else {
        toast.error(data.error)
      }
    } catch (error) {
      toast.error('Error al crear tarea')
    }
  }

  const handleCambiarEstadoTarea = async (tareaId: string, nuevoEstado: string) => {
    try {
      const res = await apiFetch('/api/tareas', {
        method: 'PUT',
        body: JSON.stringify({ id: tareaId, estado: nuevoEstado }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser?.id)
      const data = await parseJsonResponse<{ success: boolean; error?: string }>(res)
      if (data.success) {
        toast.success('Estado actualizado')
        fetchTareas(activeArea)
      } else {
        toast.error(data.error)
      }
    } catch (error) {
      toast.error('Error al actualizar tarea')
    }
  }

  const handleCrearUsuario = async (formData: FormData) => {
    try {
      const rol = formData.get('rol') as string
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        body: JSON.stringify({
          email: formData.get('email'),
          nombre: formData.get('nombre'),
          password: formData.get('password'),
          rol,
          area: formData.get('area'),
          juzgadoId: rol === 'SUPER_ADMIN' ? null : formData.get('juzgadoId') || undefined,
        }),
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await parseJsonResponse<{ success: boolean; error?: string }>(res)
      if (data.success) {
        toast.success('Usuario creado exitosamente')
        setShowNuevoUsuario(false)
        fetchUsuarios()
      } else {
        toast.error(data.error)
      }
    } catch (error) {
      toast.error('Error al crear usuario')
    }
  }

  const handleActualizarUsuario = async (formData: FormData) => {
    if (!usuarioEditando) return
    try {
      const rol = formData.get('rol') as string
      const res = await fetch(`/api/usuarios/${usuarioEditando.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nombre: formData.get('nombre'),
          password: formData.get('password') || undefined,
          rol,
          area: formData.get('area'),
          juzgadoId: rol === 'SUPER_ADMIN' ? null : formData.get('juzgadoId') || undefined,
          activo: formData.get('activo') === 'on',
        }),
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await parseJsonResponse<{ success: boolean; error?: string }>(res)
      if (data.success) {
        toast.success('Usuario actualizado')
        setUsuarioEditando(null)
        fetchUsuarios()
      } else {
        toast.error(data.error)
      }
    } catch (error) {
      toast.error('Error al actualizar usuario')
    }
  }

  const handleCrearProvidencia = async (formDataOrData: FormData | { procesoId: string; tipo: string; numero?: string; asunto: string; contenido?: string; tipoAuto?: string }) => {
    if (!simulatedUser?.id) {
      toast.error('Seleccione un usuario para proyectar')
      return
    }
    const data = formDataOrData instanceof FormData
      ? {
          procesoId: formDataOrData.get('procesoId'),
          tipo: formDataOrData.get('tipo'),
          numero: formDataOrData.get('numero'),
          asunto: formDataOrData.get('asunto'),
          contenido: formDataOrData.get('contenido'),
          tipoAuto: formDataOrData.get('tipoAuto') || null,
        }
      : formDataOrData
    try {
      const res = await apiFetch('/api/providencias', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          proyectadoPorId: simulatedUser.id,
        }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser.id)
      const result = await parseJsonResponse<{ id?: string }>(res)
      if (result?.id) {
        toast.success('Providencia proyectada')
        setShowNuevaProvidencia(false)
        setProvidenciaContenido('')
        setProvidenciaProcesoId('')
        setProvidenciaAsunto('')
        fetchProvidencias()
        fetchDashboard()
      } else {
        toast.error('Error al crear providencia')
      }
    } catch (error) {
      toast.error('Error al crear providencia')
    }
  }

  const handleDescargarPlantillaProvidencia = () => {
    if (!providenciaProcesoId) {
      toast.error('Seleccione un proceso primero')
      return
    }
    const url = `/api/providencias/plantilla-word?procesoId=${providenciaProcesoId}&tipo=${providenciaTipo}&asunto=${encodeURIComponent(providenciaAsunto)}`
    window.open(url, '_blank')
  }

  const handleSubirWordProvidencia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/providencias/extraer-word', { method: 'POST', body: fd })
      const json = await parseJsonResponse<{ success?: boolean; contenido?: string }>(res)
      if (json?.success && json.contenido !== undefined) {
        setProvidenciaContenido(json.contenido)
        toast.success('Contenido cargado desde Word')
      } else {
        toast.error('No se pudo extraer el texto')
      }
    } catch {
      toast.error('Error al procesar el archivo')
    }
    e.target.value = ''
  }

  const handleCrearMemorial = async (formData: FormData) => {
    try {
      const res = await apiFetch('/api/memoriales', {
        method: 'POST',
        body: JSON.stringify({
          procesoId: formData.get('procesoId'),
          tipo: formData.get('tipo'),
          numero: formData.get('numero'),
          presentante: formData.get('presentante'),
          identificacion: formData.get('identificacion'),
          asunto: formData.get('asunto'),
          contenido: formData.get('contenido'),
          folios: parseInt(String(formData.get('folios') || 0)) || null,
          recibidoPorId: simulatedUser?.id,
        }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser?.id)
      const data = await parseJsonResponse<{ id?: string }>(res)
      if (data?.id) {
        toast.success('Memorial radicado')
        setShowNuevoMemorial(false)
        fetchMemoriales()
        fetchDashboard()
      } else {
        toast.error('Error al radicar memorial')
      }
    } catch (error) {
      toast.error('Error al radicar memorial')
    }
  }

  const handleCrearNotificacionJudicial = async (formData: FormData) => {
    try {
      const res = await apiFetch('/api/notificaciones', {
        method: 'POST',
        body: JSON.stringify({
          procesoId: formData.get('procesoId'),
          tipo: formData.get('tipo'),
          destinatario: formData.get('destinatario'),
          destinatarioId: formData.get('destinatarioId') || null,
          direccion: formData.get('direccion') || null,
          email: formData.get('email') || null,
          autoNotificar: formData.get('autoNotificar'),
          fechaAuto: formData.get('fechaAuto') || null,
          medio: formData.get('medio') || 'FISICO',
          observaciones: formData.get('observaciones') || null,
        }),
        headers: { 'Content-Type': 'application/json' },
      }, simulatedUser?.id)
      const data = await parseJsonResponse<{ success?: boolean }>(res)
      if (data?.success) {
        toast.success('Notificación / emplazamiento registrado')
        setShowNuevaNotificacion(false)
        fetchNotificacionesJudiciales()
        fetchDashboard()
      } else {
        toast.error('No se pudo registrar')
      }
    } catch {
      toast.error('Error al registrar notificación')
    }
  }

  const handleCrearOficio = async (formData: FormData) => {
    try {
      const res = await apiFetch('/api/oficios', {
        method: 'POST',
        body: JSON.stringify({
          procesoId: formData.get('procesoId'),
          ubicacionId: formData.get('ubicacionId') || null,
          responsableId: (formData.get('responsableId') as string) === '__sin_asignar__' ? null : (formData.get('responsableId') as string) || null,
          providenciaId: formData.get('providenciaId') || null,
          numero: formData.get('numero') || null,
          destinatario: formData.get('destinatario'),
          destinatarioId: formData.get('destinatarioId') || null,
          tipoDestinatario: formData.get('tipoDestinatario'),
          direccion: formData.get('direccion') || null,
          email: formData.get('email') || null,
          asunto: formData.get('asunto'),
          contenido: formData.get('contenido') || null,
        }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser?.id)
      const data = await parseJsonResponse<{ success?: boolean; data?: { id: string } }>(res)
      if (data?.success) {
        toast.success('Oficio creado')
        setShowNuevoOficio(false)
        fetchOficios()
        fetchDashboard()
      } else {
        toast.error('Error al crear oficio')
      }
    } catch (error) {
      toast.error('Error al crear oficio')
    }
  }

  const handleCrearTermino = async (formData: FormData) => {
    try {
      const res = await apiFetch('/api/terminos', {
        method: 'POST',
        body: JSON.stringify({
          procesoId: formData.get('procesoId'),
          ubicacionId: formData.get('ubicacionId') || null,
          responsableId: (formData.get('responsableId') as string) === '__sin_asignar__' ? null : (formData.get('responsableId') as string) || null,
          tipo: formData.get('tipo'),
          descripcion: formData.get('descripcion') || null,
          fechaInicio: formData.get('fechaInicio'),
          fechaVencimiento: formData.get('fechaVencimiento'),
          diasTermino: parseInt(String(formData.get('diasTermino') || 0)) || 1,
          diasHabiles: formData.get('diasHabiles') !== 'false',
        }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser?.id)
      const data = await parseJsonResponse<{ success?: boolean; data?: { id: string } }>(res)
      if (data?.success) {
        toast.success('Término creado')
        setShowNuevoTermino(false)
        fetchTerminos()
        fetchDashboard()
      } else {
        toast.error('Error al crear término')
      }
    } catch (error) {
      toast.error('Error al crear término')
    }
  }

  const handleCrearAudiencia = async (formData: FormData) => {
    try {
      const procesoId = formData.get('procesoId') as string
      const proceso = procesos.find(p => p.id === procesoId)
      const res = await apiFetch('/api/audiencias', {
        method: 'POST',
        body: JSON.stringify({
          procesoId,
          juzgadoId: proceso?.juzgadoId || juzgados[0]?.id || 'default-juzgado',
          tipo: formData.get('tipo'),
          fecha: formData.get('fecha'),
          duracion: parseInt(String(formData.get('duracion') || 60)) || 60,
          sala: formData.get('sala') || null,
          juez: formData.get('juez'),
          secretario: formData.get('secretario') || null,
          observaciones: formData.get('observaciones') || null,
        }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser?.id)
      const data = await parseJsonResponse<{ success?: boolean; data?: { id: string } }>(res)
      if (data?.success) {
        toast.success('Audiencia programada')
        setShowNuevaAudiencia(false)
        fetchAudiencias()
        fetchDashboard()
      } else {
        toast.error('Error al crear audiencia')
      }
    } catch (error) {
      toast.error('Error al crear audiencia')
    }
  }

  const handleCrearProceso = async (formData: FormData) => {
    try {
      // Radix Select no envía valores en FormData; usar estado del formulario
      const claseProceso = (formData.get('claseProceso') as string) || formClaseProceso
      const categoriaProceso = (formData.get('categoriaProceso') as string) || formCategoriaProceso
      let juzgadoId = (formData.get('juzgadoId') as string) || formJuzgadoId || simulatedUser?.juzgadoId
      let oficialMayorId = (formData.get('oficialMayorId') as string) || formOficialMayorId || null
      if (juzgadoId === '__sin_juzgado__') juzgadoId = ''
      if (oficialMayorId === '__sin_asignar__') oficialMayorId = null
      if (!claseProceso) {
        toast.error('Seleccione la clase de proceso (ej: Acción de Tutela)')
        return
      }
      const instancia = formInstancia || 'PRIMERA_INSTANCIA'
      const res = await apiFetch('/api/procesos', {
        method: 'POST',
        body: JSON.stringify({
          instancia: instancia === 'SEGUNDA_INSTANCIA' ? 'SEGUNDA_INSTANCIA' : 'PRIMERA_INSTANCIA',
          categoriaProceso: categoriaProceso || 'CIVIL',
          claseProceso,
          demanda: formData.get('demanda'),
          demandante: formData.get('demandante'),
          demandanteId: formData.get('demandanteId'),
          demandado: formData.get('demandado'),
          demandadoId: formData.get('demandadoId'),
          cuantia: parseFloat(String(formData.get('cuantia') || 0)) || null,
          etapaProcesal: formData.get('etapaProcesal') || 'Admisión',
          juzgadoId: juzgadoId || undefined,
          oficialMayorId: oficialMayorId || null,
          tipoProcesoEstadisticaId: (formTipoProcesoEstadisticaId && formTipoProcesoEstadisticaId !== '__sin_tipo__') ? formTipoProcesoEstadisticaId : null,
        }),
        headers: { 'Content-Type': 'application/json' }
      }, simulatedUser?.id)
      const data = await parseJsonResponse<{ success?: boolean; data?: { id: string } }>(res)
      if (data?.success) {
        toast.success('Proceso creado')
        setShowNuevoProceso(false)
        fetchProcesos(activeTab === 'tutelas' ? { clase: 'TUTELA' } : { categoria: 'CIVIL' })
        fetchDashboard()
      } else {
        toast.error((data as any)?.error || 'Error al crear proceso')
      }
    } catch (error) {
      toast.error('Error al crear proceso')
    }
  }

  const handleImportarReparto = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fileInput = form.querySelector('input[type="file"]') as HTMLInputElement
    const file = fileInput?.files?.[0]
    if (!file) {
      toast.error('Seleccione un archivo ZIP')
      return
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('El archivo debe ser un ZIP (.zip)')
      return
    }
    setImportandoReparto(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch('/api/reparto/import', { method: 'POST', body: fd }, simulatedUser?.id)
      const data = await parseJsonResponse<{ success?: boolean; data?: { proceso: { radicado: string }; archivosSubidos: number; datosExtraidos: any }; error?: string }>(res)
      if (data?.success && data.data) {
        toast.success(`Proceso ${data.data.proceso.radicado} creado con ${data.data.archivosSubidos} archivo(s)`)
                setShowCrearExpediente(false)
        fileInput.value = ''
        if (activeTab === 'tutelas') fetchTutelas()
        else if (activeTab === 'procesos') fetchProcesosCiviles()
        fetchDashboard()
        if (data.data.proceso?.id) openExpediente(data.data.proceso.id)
      } else {
        const err = (data as any)?.error || 'Error al crear expediente'
        toast.error(err, { duration: 6000 })
      }
    } catch (error) {
      toast.error('Error al importar desde reparto')
    } finally {
      setImportandoReparto(false)
    }
  }

  const handleCrearJuzgado = async (formData: FormData) => {
    try {
      const res = await fetch('/api/juzgados', {
        method: 'POST',
        body: JSON.stringify({
          nombre: formData.get('nombre'),
          codigo: formData.get('codigo'),
          codigoRadicacion12: formData.get('codigoRadicacion12') || null,
          tipoJuzgado: formData.get('tipoJuzgado'),
          ciudad: formData.get('ciudad'),
          direccion: formData.get('direccion'),
          telefono: formData.get('telefono'),
          email: formData.get('email'),
        }),
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await parseJsonResponse<{ success?: boolean }>(res)
      if (data?.success) {
        toast.success('Juzgado creado')
        setShowNuevoJuzgado(false)
        fetchJuzgados()
      } else {
        toast.error('Error al crear juzgado')
      }
    } catch (error) {
      toast.error('Error al crear juzgado')
    }
  }

  const handleAgregarUbicacion = async () => {
    if (!juzgadoParaUbicaciones || !nuevaUbicacionNombre.trim()) return
    try {
      const res = await apiFetch('/api/ubicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          juzgadoId: juzgadoParaUbicaciones.id,
          nombre: nuevaUbicacionNombre.trim(),
          codigo: nuevaUbicacionCodigo.trim() || null,
        }),
      }, simulatedUser?.id)
      const data = await parseJsonResponse<{ success?: boolean; data?: { id: string; nombre: string; codigo: string | null; orden: number; activo: boolean } }>(res)
      if (data?.success && data.data) {
        setUbicaciones(prev => [...prev, data.data!])
        setNuevaUbicacionNombre('')
        setNuevaUbicacionCodigo('')
        toast.success('Ubicación agregada')
      } else {
        toast.error('Error al agregar. El nombre puede estar duplicado.')
      }
    } catch {
      toast.error('Error al agregar ubicación')
    }
  }

  const handleEliminarUbicacion = async (id: string) => {
    if (!confirm('¿Eliminar esta ubicación? Los usuarios y tareas asignados quedarán sin ubicación.')) return
    try {
      const res = await apiFetch(`/api/ubicaciones/${id}`, { method: 'DELETE' }, simulatedUser?.id)
      const data = await parseJsonResponse<{ success?: boolean }>(res)
      if (data?.success) {
        setUbicaciones(prev => prev.filter(u => u.id !== id))
        toast.success('Ubicación eliminada')
      } else {
        toast.error('Error al eliminar')
      }
    } catch {
      toast.error('Error al eliminar')
    }
  }

  const handleAgregarTipoEstadistica = async () => {
    if (!juzgadoParaTipos || !nuevaTipoNombre.trim()) return
    try {
      const res = await apiFetch('/api/tipos-proceso-estadistica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          juzgadoId: juzgadoParaTipos.id,
          categoriaProceso: tabTiposEstadistica,
          nombre: nuevaTipoNombre.trim(),
          codigo: nuevaTipoCodigo.trim() || null,
        }),
      }, simulatedUser?.id)
      const data = await parseJsonResponse<{ success?: boolean; data?: { id: string; nombre: string; codigo: string | null; orden: number; activo: boolean; categoriaProceso: string } }>(res)
      if (data?.success && data.data) {
        setTiposProcesoEstadistica(prev => [...prev, data.data!])
        setNuevaTipoNombre('')
        setNuevaTipoCodigo('')
        toast.success('Tipo agregado')
      } else {
        toast.error((data as any)?.error || 'Error al agregar')
      }
    } catch {
      toast.error('Error al agregar tipo')
    }
  }

  const handleEliminarTipoEstadistica = async (id: string) => {
    if (!confirm('¿Eliminar este tipo? Los procesos con este tipo quedarán sin clasificación estadística.')) return
    try {
      const res = await apiFetch(`/api/tipos-proceso-estadistica/${id}`, { method: 'DELETE' }, simulatedUser?.id)
      const data = await parseJsonResponse<{ success?: boolean }>(res)
      if (data?.success) {
        setTiposProcesoEstadistica(prev => prev.filter(t => t.id !== id))
        toast.success('Tipo eliminado')
      } else {
        toast.error('Error al eliminar')
      }
    } catch {
      toast.error('Error al eliminar tipo')
    }
  }

  // ==================== HELPERS ====================
  const getPrioridadBadge = (prioridad: string) => {
    const config: Record<string, { bg: string; text: string }> = {
      URGENTE: { bg: 'bg-red-100', text: 'text-red-800' },
      ALTA: { bg: 'bg-orange-100', text: 'text-orange-800' },
      MEDIA: { bg: 'bg-amber-100', text: 'text-amber-800' },
      BAJA: { bg: 'bg-green-100', text: 'text-green-800' },
    }
    const c = config[prioridad] || config.MEDIA
    return <Badge className={`${c.bg} ${c.text} hover:${c.bg}`}>{prioridad}</Badge>
  }

  const getEstadoProvidenciaBadge = (estado: string) => {
    const config: Record<string, { bg: string; text: string }> = {
      PROYECTADO: { bg: 'bg-blue-100', text: 'text-blue-800' },
      EN_REVISION: { bg: 'bg-purple-100', text: 'text-purple-800' },
      CORRECCION: { bg: 'bg-orange-100', text: 'text-orange-800' },
      PENDIENTE_FIRMA: { bg: 'bg-amber-100', text: 'text-amber-800' },
      FIRMADO: { bg: 'bg-green-100', text: 'text-green-800' },
      NOTIFICADO: { bg: 'bg-cyan-100', text: 'text-cyan-800' },
    }
    const c = config[estado] || { bg: 'bg-gray-100', text: 'text-gray-800' }
    return <Badge className={`${c.bg} ${c.text} hover:${c.bg}`}>{estado.replace('_', ' ')}</Badge>
  }

  const getEstadoTareaBadge = (estado: string) => {
    const config: Record<string, { bg: string; text: string }> = {
      PENDIENTE: { bg: 'bg-gray-100', text: 'text-gray-800' },
      EN_PROGRESO: { bg: 'bg-blue-100', text: 'text-blue-800' },
      COMPLETADA: { bg: 'bg-green-100', text: 'text-green-800' },
      VENCIDA: { bg: 'bg-red-100', text: 'text-red-800' },
      CANCELADA: { bg: 'bg-gray-200', text: 'text-gray-600' },
    }
    const c = config[estado] || config.PENDIENTE
    return <Badge className={`${c.bg} ${c.text} hover:${c.bg}`}>{estado.replace('_', ' ')}</Badge>
  }

  const getClaseProcesoLabel = (clase: string) => {
    const labels: Record<string, string> = {
      EJECUTIVO_SINGULAR: 'Ejecutivo Singular',
      EJECUTIVO_HIPOTECARIO: 'Ejecutivo Hipotecario',
      ORDINARIO: 'Ordinario',
      VERBAL: 'Verbal',
      TUTELA: 'Acción de Tutela',
      HABEAS_CORPUS: 'Hábeas Corpus',
    }
    return labels[clase] || clase.replace(/_/g, ' ')
  }

  const getPasoActual = (p: Proceso): { label: string; color: string } => {
    const provs = p.providencias || []
    const terms = p.terminos || []
    const hayPendienteFirma = provs.some(x => x.estado === 'PENDIENTE_FIRMA')
    const hayFirmada = provs.some(x => x.estado === 'FIRMADO')
    const hayNotificada = provs.some(x => x.estado === 'NOTIFICADO')
    const termEjecutoria = terms.find(t => t.tipo === 'EJECUTORIA')
    const ejecutoriaVencida = termEjecutoria && new Date(termEjecutoria.fechaVencimiento) < new Date()
    if (hayPendienteFirma) return { label: 'Firma', color: 'bg-amber-100 text-amber-800' }
    if (hayFirmada) return { label: 'Publicar', color: 'bg-cyan-100 text-cyan-800' }
    if (hayNotificada && termEjecutoria && !ejecutoriaVencida) return { label: 'Ejecutoria', color: 'bg-blue-100 text-blue-800' }
    if (ejecutoriaVencida) return { label: 'Cumplir', color: 'bg-green-100 text-green-800' }
    if (provs.some(x => ['PROYECTADO', 'EN_REVISION', 'CORRECCION'].includes(x.estado))) return { label: 'Proyección', color: 'bg-purple-100 text-purple-800' }
    return { label: 'En trámite', color: 'bg-gray-100 text-gray-800' }
  }

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Toaster position="top-right" />
      
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white border-r border-gray-200 transition-all duration-300 flex flex-col`}>
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center">
              <Scale className="w-5 h-5 text-white" />
            </div>
            {sidebarOpen && (
              <div>
                <h1 className="font-bold text-gray-900">JudicialSys</h1>
                <p className="text-xs text-gray-500">Juzgado Civil Circuito</p>
              </div>
            )}
          </div>
        </div>

        {/* Area Selector */}
        {sidebarOpen && (
          <div className="p-4 border-b border-gray-200">
            <p className="text-xs font-medium text-gray-500 mb-2">ÁREA DE TRABAJO</p>
            <div className="flex flex-col gap-1">
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveArea('DESPACHO')}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                    activeArea === 'DESPACHO' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <PenTool className="w-4 h-4 inline mr-1" />
                  Despacho
                </button>
                <button
                  onClick={() => setActiveArea('SECRETARIA')}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                    activeArea === 'SECRETARIA' 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <BookOpen className="w-4 h-4 inline mr-1" />
                  Secretaría
                </button>
              </div>
              <button
                onClick={() => { setActiveArea('ADMIN'); setActiveTab('usuarios'); }}
                className={`w-full px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  activeArea === 'ADMIN' 
                    ? 'bg-amber-100 text-amber-700' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Shield className="w-4 h-4 inline mr-1" />
                Administración
              </button>
            </div>
          </div>
        )}

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {activeArea === 'ADMIN' ? (
              <>
                {[
                  { id: 'usuarios', icon: Users, label: 'Usuarios' },
                  { id: 'juzgados', icon: Building2, label: 'Juzgados' },
                ].map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        activeTab === item.id 
                          ? 'bg-amber-50 text-amber-700 font-medium' 
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      {sidebarOpen && <span>{item.label}</span>}
                    </button>
                  </li>
                ))}
              </>
            ) : activeArea === 'DESPACHO' ? (
              <>
                {[
                  { id: 'tutelas', icon: Scale, label: 'Tutelas', badge: dashboardData?.resumen?.procesos?.tutelas },
                  { id: 'dashboard', icon: Home, label: 'Expedientes' },
                  { id: 'planner', icon: Calendar, label: 'Mi agenda', badge: plannerStats?.pendientes },
                  { id: 'procesos', icon: Briefcase, label: 'Todos los Procesos' },
                  { id: 'tareas', icon: ClipboardList, label: 'Tareas', badge: dashboardData?.despacho.tareasPendientes },
                ].map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        item.id === 'tutelas'
                          ? activeTab === 'tutelas'
                            ? 'bg-violet-100 text-violet-800 font-semibold border border-violet-200'
                            : 'text-violet-700 hover:bg-violet-50 font-medium'
                          : activeTab === item.id 
                            ? 'bg-purple-50 text-purple-700 font-medium' 
                            : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <item.icon className={item.id === 'tutelas' ? 'w-5 h-5 text-violet-600' : 'w-5 h-5'} />
                      {sidebarOpen && (
                        <>
                          <span>{item.label}</span>
                          {item.badge != null && item.badge > 0 && (
                            <Badge className={`ml-auto ${item.id === 'tutelas' ? 'bg-violet-200 text-violet-800' : 'bg-red-100 text-red-700'}`}>
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </>
            ) : (
              <>
                {[
                  { id: 'tutelas', icon: Scale, label: 'Tutelas', badge: dashboardData?.resumen?.procesos?.tutelas },
                  { id: 'dashboard', icon: Home, label: 'Dashboard' },
                  { id: 'proveer', icon: FileText, label: 'Publicar en Estado', badge: dashboardData?.secretaria?.providenciasParaPublicar?.count },
                  { id: 'memoriales', icon: Mail, label: 'Memoriales' },
                  { id: 'oficios', icon: Send, label: 'Oficios' },
                  { id: 'emplazamientos', icon: UserPlus, label: 'Emplazamientos', badge: dashboardData?.secretaria?.notificaciones?.pendientes },
                  { id: 'terminos', icon: Timer, label: 'Términos' },
                  { id: 'audiencias', icon: Calendar, label: 'Audiencias' },
                  { id: 'tareas', icon: ClipboardList, label: 'Tareas', badge: dashboardData?.secretaria.tareasPendientes },
                ].map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        item.id === 'tutelas'
                          ? activeTab === 'tutelas'
                            ? 'bg-violet-100 text-violet-800 font-semibold border border-violet-200'
                            : 'text-violet-700 hover:bg-violet-50 font-medium'
                          : activeTab === item.id 
                            ? 'bg-blue-50 text-blue-700 font-medium' 
                            : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <item.icon className={item.id === 'tutelas' ? 'w-5 h-5 text-violet-600' : 'w-5 h-5'} />
                      {sidebarOpen && (
                        <>
                          <span>{item.label}</span>
                          {item.badge != null && item.badge > 0 && (
                            <Badge className={`ml-auto ${item.id === 'tutelas' ? 'bg-violet-200 text-violet-800' : 'bg-red-100 text-red-700'}`}>
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </>
            )}
            <li className="border-t border-gray-200 pt-2 mt-2">
              <button
                onClick={() => setActiveTab('procesos')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  activeTab === 'procesos' 
                    ? 'bg-amber-50 text-amber-700 font-medium' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Briefcase className="w-5 h-5" />
                {sidebarOpen && <span>Procesos</span>}
              </button>
            </li>
            <li>
              <a
                href="/publicaciones"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-cyan-600 hover:bg-cyan-50 font-medium"
              >
                <FileText className="w-5 h-5" />
                {sidebarOpen && <span>Consulta de procesos</span>}
                {sidebarOpen && <ExternalLink className="w-4 h-4 ml-auto opacity-60" />}
              </a>
            </li>
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <a
            href="/guia"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors mb-2"
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            {sidebarOpen && <span>Guía de navegación</span>}
          </a>
          <div className={`flex items-center gap-2 mb-2 text-sm ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
            {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {sidebarOpen && <span>{isConnected ? 'Conectado' : 'Desconectado'}</span>}
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
            {sidebarOpen && <span>Colapsar</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge className={
                  activeArea === 'DESPACHO' ? 'bg-purple-100 text-purple-700' :
                  activeArea === 'ADMIN' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                }>
                  {activeArea === 'DESPACHO' ? 'DESPACHO' : activeArea === 'ADMIN' ? 'ADMINISTRACIÓN' : 'SECRETARÍA'}
                </Badge>
                <h2 className="text-xl font-semibold text-gray-900">
                  {activeTab === 'dashboard' && 'Dashboard'}
                  {activeTab === 'dashboard' && activeArea === 'DESPACHO' && 'Expedientes'}
                  {activeTab === 'dashboard' && activeArea === 'SECRETARIA' && 'Dashboard'}
                  {activeTab === 'proveer' && 'Publicar en Estado'}
                  {activeTab === 'memoriales' && 'Memoriales Recibidos'}
                  {activeTab === 'oficios' && 'Gestión de Oficios'}
                  {activeTab === 'emplazamientos' && 'Emplazamientos y notificaciones'}
                  {activeTab === 'terminos' && 'Control de Términos'}
                  {activeTab === 'audiencias' && 'Agenda de Audiencias'}
                  {activeTab === 'planner' && 'Mi agenda'}
                  {activeTab === 'tutelas' && 'Acciones de Tutela'}
                  {activeTab === 'tareas' && 'Tareas Internas'}
                  {activeTab === 'procesos' && 'Procesos Judiciales'}
                  {activeTab === 'usuarios' && 'Gestión de Usuarios'}
                  {activeTab === 'juzgados' && 'Juzgados'}
                </h2>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {activeArea === 'ADMIN' ? 'Super usuario: asignar cargos y juzgados' : 'Juzgado Primero Civil del Circuito de Bogotá D.C.'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" size="sm" className="text-slate-600 hover:text-slate-800 shrink-0">
                <a href="/publicaciones" target="_blank" rel="noopener noreferrer">
                  <FileText className="w-4 h-4 mr-2" />
                  Consulta de procesos
                </a>
              </Button>
              <Button onClick={() => { setShowCrearExpediente(true); setCrearExpedienteTab('reparto'); }} variant="outline" size="sm" className="border-amber-500 text-amber-700 hover:bg-amber-50 shrink-0">
                <Plus className="w-4 h-4 mr-2" />
                Crear expediente
              </Button>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input 
                  placeholder="Buscar proceso..." 
                  className="pl-10 w-64"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (activeTab === 'tutelas' ? fetchTutelas() : activeTab === 'procesos' ? fetchProcesosCiviles() : null)}
                />
              </div>
              <Button variant="outline" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                {dashboardData?.resumen.alertas && dashboardData.resumen.alertas > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                    {dashboardData.resumen.alertas}
                  </span>
                )}
              </Button>
              <Select
                value={simulatedUser?.id || ''}
                onValueChange={(id) => {
                  if (id === '__empty__') return
                  const u = usuarios.find(x => x.id === id)
                  if (u) setSimulatedUser({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, area: u.area, juzgadoId: u.juzgadoId })
                  else setSimulatedUser(null)
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Simular usuario..." />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.length === 0 ? (
                    <SelectItem value="__empty__" disabled>
                      No hay usuarios. Ejecute: npx prisma db seed
                    </SelectItem>
                  ) : (
                    usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nombre} ({ROLES_LABEL[u.rol] || u.rol})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {simulatedUser && (
                <div className="flex items-center gap-2">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className={activeArea === 'DESPACHO' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}>
                      {simulatedUser.nombre.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-sm">
                    <p className="font-medium text-gray-900">{simulatedUser.nombre}</p>
                    <p className="text-xs text-gray-500">{ROLES_LABEL[simulatedUser.rol] || simulatedUser.rol}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6">
          
          {/* ==================== DASHBOARD ==================== */}
          {activeTab === 'dashboard' && dashboardData && (
            <div className="space-y-6">
              {/* ========== CREAR EXPEDIENTE ========== */}
              <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-amber-50/80 border border-amber-200/60">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-amber-600" />
                  <span className="text-sm text-gray-700">Cargue el ZIP de reparto o ingrese los datos manualmente.</span>
                </div>
                <Button onClick={() => { setShowCrearExpediente(true); setCrearExpedienteTab('reparto'); }} size="sm" className="bg-amber-500 hover:bg-amber-600 shrink-0">
                  <Plus className="w-4 h-4 mr-1" />
                  Crear expediente
                </Button>
              </div>

              {/* ========== TUTELAS - PRIORIDAD MÁXIMA (Art. 86 CP) ========== */}
              {(dashboardData.resumen?.tutelasActivas?.length ?? 0) > 0 ? (
                <Card className="border-2 border-violet-400 bg-gradient-to-br from-violet-600 to-violet-800 text-white shadow-xl overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <CardContent className="relative p-6">
                    <div className="flex items-start justify-between gap-6 flex-wrap">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur">
                          <Scale className="w-9 h-9 text-white" />
                        </div>
                        <div>
                          <p className="text-violet-200 text-sm font-semibold uppercase tracking-widest">Acción de Tutela</p>
                          <p className="text-3xl font-bold">{dashboardData.resumen.tutelasActivas.length} tutela{dashboardData.resumen.tutelasActivas.length !== 1 ? 's' : ''} en trámite</p>
                          <p className="text-violet-200 text-sm mt-1">Art. 86 C.P. — Término 10 días calendario. Protección inmediata de derechos fundamentales.</p>
                        </div>
                      </div>
                      <Button onClick={() => setActiveTab('tutelas')} size="lg" className="bg-white text-violet-700 hover:bg-violet-50 font-semibold shadow-lg">
                        <Scale className="w-5 h-5 mr-2" />
                        Ver todas las tutelas
                      </Button>
                    </div>
                    <div className="mt-6 space-y-2 max-h-48 overflow-y-auto">
                      {dashboardData.resumen.tutelasActivas.slice(0, 6).map((t: any) => (
                        <div key={t.id} className={`flex items-center justify-between p-3 rounded-xl ${(t.diasRestantes ?? 999) < 0 ? 'bg-red-500/30' : (t.diasRestantes ?? 999) <= 3 ? 'bg-amber-500/20' : 'bg-white/10'}`}>
                          <div>
                            <p className="font-medium">{t.radicado} — {t.demandante} vs {t.demandado}</p>
                            <p className="text-sm text-violet-200">{t.oficialMayor ? `Oficial: ${t.oficialMayor}` : 'Sin asignar'}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            {t.diasRestantes != null && (
                              <Badge className={
                                t.diasRestantes < 0 ? 'bg-red-500 text-white border-0' :
                                t.diasRestantes <= 3 ? 'bg-amber-400 text-amber-900 border-0' :
                                'bg-white/20 text-white border-0'
                              }>
                                {t.diasRestantes < 0 ? `${Math.abs(t.diasRestantes)} vencido` : `${t.diasRestantes} días`}
                              </Badge>
                            )}
                            <Button type="button" size="sm" variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border-0" onClick={() => openExpediente(t.id)}>
                              <Eye className="w-4 h-4 mr-1" />
                              Ver
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-2 border-violet-300 bg-gradient-to-r from-violet-50 to-white">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-violet-100 rounded-xl flex items-center justify-center">
                          <Scale className="w-8 h-8 text-violet-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-violet-600 uppercase tracking-wide">Acción de Tutela</p>
                          <p className="text-xl font-bold text-gray-900">0 tutelas en trámite</p>
                          <p className="text-sm text-gray-500">Art. 86 C.P. — Procedimiento preferente. Término 10 días calendario.</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => { setShowCrearExpediente(true); setCrearExpedienteTab('reparto'); }} variant="outline" className="border-cyan-500 text-cyan-700 hover:bg-cyan-50">
                          <FolderOpen className="w-4 h-4 mr-2" />
                          Crear expediente
                        </Button>
                        <Button onClick={() => { setNuevoProcesoTipo('tutela'); setFormClaseProceso('TUTELA'); setFormCategoriaProceso('CONSTITUCIONAL'); setShowNuevoProceso(true); }} className="bg-violet-600 hover:bg-violet-700">
                          <Plus className="w-4 h-4 mr-2" />
                          Nueva Tutela
                        </Button>
                        <Button onClick={() => setActiveTab('tutelas')} variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50">
                          Ver módulo Tutelas
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Siguiente paso - Acción prioritaria */}
              {(() => {
                const despachoFirma = dashboardData.despacho.providencias.pendientesFirma
                const secretariaPublicar = dashboardData.secretaria?.providenciasParaPublicar?.count ?? 0
                const secretariaMemoriales = dashboardData.secretaria.memoriales.pendientes
                const terminosVencidos = dashboardData.secretaria.terminos.vencidos
                const terminosPorVencer = dashboardData.secretaria.terminos.porVencer
                const despachoParaRevisar = (dashboardData.despacho.paraRevisar || []).length
                if (activeArea === 'DESPACHO' && despachoFirma > 0) {
                  return (
                    <Card className="border-2 border-purple-300 bg-gradient-to-r from-purple-50 to-white">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center">
                            <Briefcase className="w-7 h-7 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-purple-600 uppercase tracking-wide">Expedientes que requieren tu firma</p>
                            <p className="text-xl font-bold text-gray-900">{despachoFirma} proceso{despachoFirma > 1 ? 's' : ''} con providencia aprobada</p>
                            <p className="text-sm text-gray-500 mt-0.5">Revisa el expediente completo y firma la providencia</p>
                          </div>
                        </div>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {(dashboardData.despacho.procesosParaFirma || []).map((proc: any) => {
                            const prov = proc.providencias?.[0]
                            const asignado = proc.oficialMayor?.nombre || proc.secretario?.nombre || 'Sin asignar'
                            return (
                              <div key={proc.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-purple-100 hover:border-purple-200">
                                <div>
                                  <p className="font-medium text-gray-900">{proc.radicado} — {proc.demandante} vs {proc.demandado}</p>
                                  <p className="text-sm text-purple-600 font-medium">Asignado a: {asignado}</p>
                                  {prov && (
                                    <p className="text-sm text-gray-500">{prov.tipo} {prov.numero || ''}: {prov.asunto} (Proyectado: {prov.proyectadoPor?.nombre})</p>
                                  )}
                                </div>
                                <Button type="button" size="sm" onClick={() => openExpediente(proc.id)} className="bg-purple-600 hover:bg-purple-700">
                                  <Eye className="w-4 h-4 mr-1" />
                                  Ver expediente
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )
                }
                if (activeArea === 'DESPACHO' && despachoParaRevisar > 0 && despachoFirma === 0) {
                  return (
                    <Card className="border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-white">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center">
                            <FileText className="w-7 h-7 text-amber-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-amber-600 uppercase tracking-wide">Providencias para revisar</p>
                            <p className="text-xl font-bold text-gray-900">{despachoParaRevisar} providencia{despachoParaRevisar > 1 ? 's' : ''} proyectada{despachoParaRevisar > 1 ? 's' : ''}</p>
                            <p className="text-sm text-gray-500 mt-0.5">Revise y apruebe para firma del Juez o devuelva para corrección</p>
                          </div>
                        </div>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {(dashboardData.despacho.paraRevisar || []).map((prov: any) => (
                            <div key={prov.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-100 hover:border-amber-200">
                              <div>
                                <p className="font-medium text-gray-900">{prov.proceso?.radicado} — {prov.proceso?.demandante} vs {prov.proceso?.demandado}</p>
                                <p className="text-sm text-amber-600">{prov.tipo}: {prov.asunto}</p>
                                <p className="text-sm text-gray-500">Proyectado por: {prov.proyectadoPor?.nombre}</p>
                              </div>
                              <Button type="button" size="sm" onClick={() => openExpediente(prov.proceso?.id)} className="bg-amber-600 hover:bg-amber-700">
                                <Eye className="w-4 h-4 mr-1" />
                                Ver expediente
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                }
                if (activeArea === 'SECRETARIA' && secretariaPublicar > 0) {
                  return (
                    <Card className="border-2 border-cyan-300 bg-gradient-to-r from-cyan-50 to-white">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-cyan-100 rounded-xl flex items-center justify-center">
                              <Briefcase className="w-7 h-7 text-cyan-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-cyan-600 uppercase tracking-wide">Procesos para publicar en estado</p>
                              <p className="text-xl font-bold text-gray-900">{secretariaPublicar} proceso{secretariaPublicar > 1 ? 's' : ''} con providencia firmada</p>
                              <p className="text-sm text-gray-500 mt-0.5">Notificar a las partes (Art. 295 CGP) e iniciar término de ejecutoria</p>
                            </div>
                          </div>
                          <Button onClick={() => setActiveTab('proveer')} className="bg-cyan-600 hover:bg-cyan-700 text-white">
                            <FileText className="w-4 h-4 mr-2" />
                            Ver todos
                          </Button>
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {(dashboardData.secretaria?.procesosParaPublicar || []).slice(0, 5).map((proc: any) => {
                            const prov = proc.providencias?.[0]
                            return (
                              <div key={proc.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-cyan-100">
                                <div>
                                  <p className="font-medium text-gray-900">{proc.radicado} — {proc.demandante} vs {proc.demandado}</p>
                                  {prov && <p className="text-sm text-gray-500">{prov.tipo} firmado por {prov.firmadoPor?.nombre}</p>}
                                </div>
                                <Button type="button" size="sm" variant="outline" onClick={() => openExpediente(proc.id)}>
                                  Ver expediente
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )
                }
                if (activeArea === 'SECRETARIA' && (terminosVencidos > 0 || terminosPorVencer > 0)) {
                  return (
                    <Card className="border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-white">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center">
                              <Timer className="w-7 h-7 text-amber-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-amber-600 uppercase tracking-wide">Tu siguiente paso</p>
                              <p className="text-xl font-bold text-gray-900">
                                {terminosVencidos > 0 ? `${terminosVencidos} término${terminosVencidos > 1 ? 's' : ''} vencido${terminosVencidos > 1 ? 's' : ''}` : `${terminosPorVencer} por vencer`}
                              </p>
                              <p className="text-sm text-gray-500 mt-0.5">Revisar el control de términos</p>
                            </div>
                          </div>
                          <Button onClick={() => setActiveTab('terminos')} className="bg-amber-600 hover:bg-amber-700 text-white">
                            <Timer className="w-4 h-4 mr-2" />
                            Ver Términos
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                }
                if (activeArea === 'SECRETARIA' && secretariaMemoriales > 0) {
                  return (
                    <Card className="border-2 border-blue-300 bg-gradient-to-r from-blue-50 to-white">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
                              <Mail className="w-7 h-7 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-blue-600 uppercase tracking-wide">Tu siguiente paso</p>
                              <p className="text-xl font-bold text-gray-900">{secretariaMemoriales} memorial{secretariaMemoriales > 1 ? 'es' : ''} para trasladar</p>
                              <p className="text-sm text-gray-500 mt-0.5">Radicar y enviar al Despacho</p>
                            </div>
                          </div>
                          <Button onClick={() => setActiveTab('memoriales')} className="bg-blue-600 hover:bg-blue-700 text-white">
                            <Mail className="w-4 h-4 mr-2" />
                            Ver Memoriales
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                }
                return (
                  <Card className="border border-gray-200 bg-gray-50/50">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          <CheckCircle2 className="w-12 h-12 text-green-500" />
                          <div>
                            <p className="font-medium text-gray-900">Sin expedientes pendientes</p>
                            <p className="text-sm text-gray-500">Revisa todos los procesos o proyecta una nueva providencia</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {activeArea === 'DESPACHO' && (
                            <Button onClick={() => setShowNuevaProvidencia(true)} variant="outline">
                              <Plus className="w-4 h-4 mr-2" />
                              Nueva Providencia
                            </Button>
                          )}
                          <Button onClick={() => setActiveTab('procesos')} variant="outline">
                            <Briefcase className="w-4 h-4 mr-2" />
                            Ver todos los procesos
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-4">Flujo: Ingreso → Proyección → Firma → Publicar → Ejecutoria → Cumplir órdenes</p>
                    </CardContent>
                  </Card>
                )
              })()}

              {/* Alertas Críticas */}
              {(dashboardData.secretaria.terminos.vencidos > 0 || 
                dashboardData.secretaria.terminos.porVencer > 0 || 
                dashboardData.despacho.providencias.pendientesFirma > 0) && (
                <Card className="border-red-200 bg-red-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-red-800 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Alertas Críticas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4">
                      {dashboardData.secretaria.terminos.vencidos > 0 && (
                        <div className="flex items-center gap-2 bg-red-100 px-4 py-2 rounded-lg">
                          <XCircle className="w-5 h-5 text-red-600" />
                          <span className="text-red-800 font-medium">
                            {dashboardData.secretaria.terminos.vencidos} términos vencidos
                          </span>
                        </div>
                      )}
                      {dashboardData.secretaria.terminos.porVencer > 0 && (
                        <div className="flex items-center gap-2 bg-amber-100 px-4 py-2 rounded-lg">
                          <AlertCircle className="w-5 h-5 text-amber-600" />
                          <span className="text-amber-800 font-medium">
                            {dashboardData.secretaria.terminos.porVencer} términos por vencer
                          </span>
                        </div>
                      )}
                      {dashboardData.despacho.providencias.pendientesFirma > 0 && (
                        <div className="flex items-center gap-2 bg-purple-100 px-4 py-2 rounded-lg">
                          <FileSignature className="w-5 h-5 text-purple-600" />
                          <span className="text-purple-800 font-medium">
                            {dashboardData.despacho.providencias.pendientesFirma} providencias para firma
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Resumen General */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="md:col-span-1 border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-violet-600 uppercase tracking-wide">Tutelas</p>
                        <p className="text-3xl font-bold text-violet-700">{dashboardData.resumen.procesos.tutelas}</p>
                        <p className="text-xs text-gray-500 mt-1">Art. 86 C.P. — 10 días</p>
                      </div>
                      <div className="w-14 h-14 bg-violet-100 rounded-xl flex items-center justify-center">
                        <Scale className="w-8 h-8 text-violet-600" />
                      </div>
                    </div>
                    <Button onClick={() => setActiveTab('tutelas')} variant="outline" size="sm" className="mt-3 w-full border-violet-300 text-violet-700 hover:bg-violet-50">
                      Ver tutelas
                    </Button>
                  </CardContent>
                </Card>
                <Card className="border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-white">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-amber-700 uppercase tracking-wide">Procesos Civiles</p>
                        <p className="text-2xl font-bold text-gray-900">{dashboardData.resumen.procesos.civiles}</p>
                        <p className="text-xs text-gray-500 mt-1">Ejecutivos, declarativos, ordinarios, etc.</p>
                      </div>
                      <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                        <Briefcase className="w-6 h-6 text-amber-600" />
                      </div>
                    </div>
                    <Button onClick={() => setActiveTab('procesos')} variant="outline" size="sm" className="mt-3 w-full border-amber-300 text-amber-700 hover:bg-amber-50">
                      Ver procesos
                    </Button>
                  </CardContent>
                </Card>

                {activeArea === 'DESPACHO' ? (
                  <>
                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500">Para Firma</p>
                            <p className="text-2xl font-bold text-purple-600">{dashboardData.despacho.providencias.pendientesFirma}</p>
                          </div>
                          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                            <FileSignature className="w-6 h-6 text-purple-600" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500">Autos Proferidos</p>
                            <p className="text-2xl font-bold text-blue-600">{dashboardData.despacho.providencias.autosProferidos}</p>
                          </div>
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Gavel className="w-6 h-6 text-blue-600" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500">Sentencias</p>
                            <p className="text-2xl font-bold text-green-600">{dashboardData.despacho.providencias.sentenciasProferidas}</p>
                          </div>
                          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-6 h-6 text-green-600" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <>
                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500">Términos Activos</p>
                            <p className="text-2xl font-bold text-blue-600">{dashboardData.secretaria.terminos.total}</p>
                          </div>
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Timer className="w-6 h-6 text-blue-600" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500">Oficios Pendientes</p>
                            <p className="text-2xl font-bold text-amber-600">{dashboardData.secretaria.oficios.pendientes}</p>
                          </div>
                          <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                            <Mail className="w-6 h-6 text-amber-600" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500">Audiencias Semana</p>
                            <p className="text-2xl font-bold text-green-600">{dashboardData.secretaria.audiencias.semana}</p>
                          </div>
                          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <Calendar className="w-6 h-6 text-green-600" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>

              {/* Estadística por tipo oficial (Procesos civiles | Tutelas por derecho) */}
              {((dashboardData.resumen?.procesosPorTipoCivil?.length ?? 0) > 0 || (dashboardData.resumen?.procesosPorTipoTutela?.length ?? 0) > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-amber-600" />
                      Estadística por tipo (oficial)
                    </CardTitle>
                    <CardDescription>Clasificación para reportes a la Rama Judicial. Procesos civiles y tutelas separados.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold text-amber-700 mb-3 flex items-center gap-2">
                          <Briefcase className="w-4 h-4" />
                          Procesos civiles
                        </h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {(dashboardData.resumen?.procesosPorTipoCivil ?? []).map((t: { clase: string; cantidad: number }) => (
                            <div key={t.clase} className="flex justify-between items-center py-1.5 px-3 rounded-lg bg-amber-50/80 border border-amber-100">
                              <span className="text-sm truncate">{t.clase}</span>
                              <Badge variant="outline" className="shrink-0 bg-amber-100 text-amber-800 border-amber-200">{t.cantidad}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-violet-700 mb-3 flex items-center gap-2">
                          <Scale className="w-4 h-4" />
                          Tutelas por derecho
                        </h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {(dashboardData.resumen?.procesosPorTipoTutela ?? []).map((t: { clase: string; cantidad: number }) => (
                            <div key={t.clase} className="flex justify-between items-center py-1.5 px-3 rounded-lg bg-violet-50/80 border border-violet-100">
                              <span className="text-sm truncate">{t.clase}</span>
                              <Badge variant="outline" className="shrink-0 bg-violet-100 text-violet-800 border-violet-200">{t.cantidad}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Acciones Rápidas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {activeArea === 'DESPACHO' ? (
                      <>
                        <Button onClick={() => setShowNuevaProvidencia(true)} className="bg-purple-500 hover:bg-purple-600">
                          <Plus className="w-4 h-4 mr-2" />
                          Nueva Providencia
                        </Button>
                        <Button onClick={() => { setNuevoProcesoTipo('general'); setFormClaseProceso(''); setFormCategoriaProceso('CIVIL'); setShowNuevoProceso(true); }} variant="outline">
                          <Briefcase className="w-4 h-4 mr-2" />
                          Nuevo proceso civil
                        </Button>
                        <Button onClick={() => setActiveTab('procesos')} variant="outline">
                          <Briefcase className="w-4 h-4 mr-2" />
                          Ver procesos
                        </Button>
                      </>
                    ) : (
                      <>
                        {(dashboardData.secretaria?.providenciasParaPublicar?.count ?? 0) > 0 && (
                          <Button onClick={() => setActiveTab('proveer')} className="bg-cyan-600 hover:bg-cyan-700">
                            <FileText className="w-4 h-4 mr-2" />
                            Publicar en Estado ({dashboardData.secretaria.providenciasParaPublicar.count})
                          </Button>
                        )}
                        <Button onClick={() => setShowNuevoMemorial(true)} className="bg-blue-500 hover:bg-blue-600">
                          <Plus className="w-4 h-4 mr-2" />
                          Registrar Memorial
                        </Button>
                        <Button onClick={() => { setNuevoProcesoTipo('general'); setFormClaseProceso(''); setFormCategoriaProceso('CIVIL'); setShowNuevoProceso(true); }} variant="outline" className="border-amber-300 text-amber-700">
                          <Briefcase className="w-4 h-4 mr-2" />
                          Nuevo proceso civil
                        </Button>
                        <Button onClick={() => { setNuevoProcesoTipo('tutela'); setFormClaseProceso('TUTELA'); setFormCategoriaProceso('CONSTITUCIONAL'); setShowNuevoProceso(true); }} className="bg-violet-600 hover:bg-violet-700">
                          <Scale className="w-4 h-4 mr-2" />
                          Nueva Tutela
                        </Button>
                        <Button onClick={() => setActiveTab('procesos')} variant="outline">
                          <Briefcase className="w-4 h-4 mr-2" />
                          Ver procesos civiles
                        </Button>
                        <Button onClick={() => setActiveTab('tutelas')} variant="outline" className="border-violet-300 text-violet-700">
                          <Scale className="w-4 h-4 mr-2" />
                          Ver tutelas
                        </Button>
                        <Button onClick={() => setShowNuevaTarea(true)} variant="outline">
                          <ClipboardList className="w-4 h-4 mr-2" />
                          Nueva Tarea
                        </Button>
                      </>
                    )}
                    <Button onClick={() => { fetchDashboard(); toast.success('Datos actualizados'); }} variant="outline">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Actualizar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Listados pendientes */}
              {activeArea === 'SECRETARIA' && (dashboardData.secretaria?.providenciasParaPublicar?.lista?.length ?? 0) > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5 text-cyan-600" />
                      Providencias para Publicar en Estado
                    </CardTitle>
                    <CardDescription>Notifique a las partes e inicie el término de ejecutoria</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Radicado</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Asunto</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Firmado por</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {dashboardData.secretaria.providenciasParaPublicar.lista.map((p: any) => (
                            <tr key={p.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 font-medium">{p.proceso?.radicado}</td>
                              <td className="px-6 py-4">
                                <Badge className={p.tipo === 'AUTO' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}>{p.tipo}</Badge>
                              </td>
                              <td className="px-6 py-4">{p.asunto}</td>
                              <td className="px-6 py-4 text-sm">{p.firmadoPor?.nombre}</td>
                              <td className="px-6 py-4">
                                <Button size="sm" onClick={() => handlePublicarEnEstado(p.id)} className="bg-cyan-600 hover:bg-cyan-700">
                                  Publicar en estado
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeArea === 'SECRETARIA' && dashboardData.secretaria.memoriales.lista.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Mail className="w-5 h-5 text-blue-600" />
                      Memoriales Pendientes de Traslado
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Radicado</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Presentante</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Asunto</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {dashboardData.secretaria.memoriales.lista.map((m: any) => (
                            <tr key={m.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 font-medium">{m.proceso?.radicado}</td>
                              <td className="px-6 py-4">
                                <Badge variant="outline">{m.tipo}</Badge>
                              </td>
                              <td className="px-6 py-4">{m.presentante}</td>
                              <td className="px-6 py-4">{m.asunto}</td>
                              <td className="px-6 py-4">
                                <Badge className="bg-amber-100 text-amber-700">{m.estado}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ==================== PLANNER (DESPACHO - Oficial Mayor) ==================== */}
          {activeTab === 'planner' && activeArea === 'DESPACHO' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-500">Pendientes de proyección</p>
                    <p className="text-2xl font-bold text-amber-600">{plannerStats?.pendientes ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-500">Por vencer (≤3 días)</p>
                    <p className="text-2xl font-bold text-orange-600">{plannerStats?.porVencer ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-500">Vencidos</p>
                    <p className="text-2xl font-bold text-red-600">{plannerStats?.vencidos ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-500">Total asignados</p>
                    <p className="text-2xl font-bold text-purple-600">{plannerData.length}</p>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Procesos asignados</CardTitle>
                  <CardDescription>Procesos ingresados al Despacho con fecha de entrada y límite. Ordenados por fecha límite.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Radicado</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Demandante vs Demandado</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Entrada</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Límite</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Días rest.</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {plannerData.map((p: any) => (
                          <tr key={p.id} className={`hover:bg-gray-50 ${(p.diasRestantes ?? 999) < 0 ? 'bg-red-50' : (p.diasRestantes ?? 999) <= 3 ? 'bg-amber-50' : ''}`}>
                            <td className="px-6 py-4 font-mono font-medium">{p.radicado}</td>
                            <td className="px-6 py-4 text-sm">{p.demandante} vs {p.demandado}</td>
                            <td className="px-6 py-4 text-sm">{p.fechaEntradaDespacho ? new Date(p.fechaEntradaDespacho).toLocaleDateString('es-CO') : '-'}</td>
                            <td className="px-6 py-4 text-sm">{p.fechaLimiteDespacho ? new Date(p.fechaLimiteDespacho).toLocaleDateString('es-CO') : '-'}</td>
                            <td className="px-6 py-4">
                              {p.diasRestantes != null ? (
                                <Badge className={
                                  p.diasRestantes < 0 ? 'bg-red-100 text-red-800' :
                                  p.diasRestantes <= 3 ? 'bg-amber-100 text-amber-800' :
                                  'bg-green-100 text-green-800'
                                }>
                                  {p.diasRestantes < 0 ? `${Math.abs(p.diasRestantes)} vencido` : p.diasRestantes}
                                </Badge>
                              ) : '-'}
                            </td>
                            <td className="px-6 py-4">
                              <Badge className={p.estadoPlanner === 'PENDIENTE_PROYECCION' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}>
                                {p.estadoPlanner === 'PENDIENTE_PROYECCION' ? 'Pendiente proyección' : 'En trámite'}
                              </Badge>
                            </td>
                            <td className="px-6 py-4">
                              <Button type="button" size="sm" variant="outline" onClick={() => openExpediente(p.id)}>
                                Ver expediente
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {plannerData.length === 0 && (
                          <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">No hay procesos asignados. La Secretaría debe ingresar procesos al Despacho.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ==================== PUBLICAR EN ESTADO (SECRETARÍA) ==================== */}
          {activeTab === 'proveer' && activeArea === 'SECRETARIA' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Providencias firmadas para publicar en estado</CardTitle>
                  <CardDescription>Notifique a las partes según Art. 295 CGP. Al publicar se inicia el término de ejecutoria (3 días).</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Radicado</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Número</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Asunto</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Firmado por</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {providenciasFirmadas.map((p) => (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">{p.proceso?.radicado}</td>
                            <td className="px-6 py-4">
                              <Badge className={p.tipo === 'AUTO' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}>
                                {p.tipo}
                              </Badge>
                            </td>
                            <td className="px-6 py-4">{p.numero || '-'}</td>
                            <td className="px-6 py-4">{p.asunto}</td>
                            <td className="px-6 py-4 text-sm">{p.firmadoPor?.nombre}</td>
                            <td className="px-6 py-4">
                              <Button size="sm" onClick={() => handlePublicarEnEstado(p.id)} className="bg-cyan-600 hover:bg-cyan-700">
                                Publicar en estado
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {providenciasFirmadas.length === 0 && (
                          <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No hay providencias firmadas pendientes de publicar</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ==================== MEMORIALES (SECRETARÍA) ==================== */}
          {activeTab === 'memoriales' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Todos</Button>
                  <Button variant="outline" size="sm" className="bg-amber-50 text-amber-700">Radicados</Button>
                  <Button variant="outline" size="sm" className="bg-blue-50 text-blue-700">Trasladados</Button>
                </div>
                <Button onClick={() => setShowNuevoMemorial(true)} className="bg-blue-500 hover:bg-blue-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Registrar Memorial
                </Button>
              </div>

              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Radicado</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Presentante</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Asunto</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Folios</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {memoriales.map((m) => (
                          <tr key={m.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">{m.proceso?.radicado}</td>
                            <td className="px-6 py-4">
                              <Badge variant="outline">{m.tipo.replace(/_/g, ' ')}</Badge>
                            </td>
                            <td className="px-6 py-4">{m.presentante}</td>
                            <td className="px-6 py-4">{m.asunto}</td>
                            <td className="px-6 py-4">{m.folios || '-'}</td>
                            <td className="px-6 py-4">
                              <Badge className={m.estado === 'RADICADO' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}>
                                {m.estado}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-sm">{new Date(m.fechaPresentacion).toLocaleDateString('es-CO')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ==================== TAREAS ==================== */}
          {activeTab === 'tareas' && (
            <div className="space-y-6">
              {activeArea === 'DESPACHO' && (
                <Card className="bg-purple-50 border-purple-200">
                  <CardContent className="p-4">
                    <p className="text-sm text-purple-800">
                      <strong>¿Cómo proyectar un auto en Word?</strong> Para tareas tipo &quot;Proyectar Auto&quot; o &quot;Proyectar Sentencia&quot;, haga clic en <strong>Proyectar</strong> en la columna Acciones. Se abrirá el formulario donde puede descargar la plantilla Word, editarla y subirla para cargar el contenido.
                    </p>
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-amber-500">
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-500">Pendientes</p>
                    <p className="text-2xl font-bold text-amber-600">{tareasStats?.pendientes || 0}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-500">En Progreso</p>
                    <p className="text-2xl font-bold text-blue-600">{tareasStats?.enProgreso || 0}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-500">Completadas</p>
                    <p className="text-2xl font-bold text-green-600">{tareasStats?.completadas || 0}</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-500">
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-500">Vencidas</p>
                    <p className="text-2xl font-bold text-red-600">{tareasStats?.vencidas || 0}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end gap-2">
                {activeArea === 'DESPACHO' && (
                  <Button onClick={() => setShowNuevaProvidencia(true)} variant="outline" className="border-purple-300 text-purple-700">
                    <FileText className="w-4 h-4 mr-2" />
                    Nueva Providencia (Word)
                  </Button>
                )}
                <Button onClick={() => setShowNuevaTarea(true)} className={activeArea === 'DESPACHO' ? 'bg-purple-500 hover:bg-purple-600' : 'bg-blue-500 hover:bg-blue-600'}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nueva Tarea
                </Button>
              </div>

              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Proceso</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tarea</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Prioridad</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Vencimiento</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {tareas.map((tarea) => (
                          <tr key={tarea.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">{tarea.proceso?.radicado}</td>
                            <td className="px-6 py-4">
                              <p className="font-medium">{tarea.titulo}</p>
                              <p className="text-sm text-gray-500">{tarea.responsable?.nombre || 'Sin asignar'}</p>
                            </td>
                            <td className="px-6 py-4">
                              <Badge variant="outline">{tarea.tipo.replace(/_/g, ' ')}</Badge>
                            </td>
                            <td className="px-6 py-4">{getPrioridadBadge(tarea.prioridad)}</td>
                            <td className="px-6 py-4">
                              {tarea.fechaLimite ? (
                                <div>
                                  <p className="text-sm">{new Date(tarea.fechaLimite).toLocaleDateString('es-CO')}</p>
                                  <p className={`text-xs ${
                                    (tarea.diasRestantes || 0) < 0 ? 'text-red-600' : 
                                    (tarea.diasRestantes || 0) <= 3 ? 'text-amber-600' : 'text-gray-500'
                                  }`}>
                                    {(tarea.diasRestantes || 0) < 0 
                                      ? `${Math.abs(tarea.diasRestantes || 0)} días vencido`
                                      : `${tarea.diasRestantes} días`
                                    }
                                  </p>
                                </div>
                              ) : '-'}
                            </td>
                            <td className="px-6 py-4">{getEstadoTareaBadge(tarea.estadoCalculado || tarea.estado)}</td>
                            <td className="px-6 py-4">
                              <div className="flex gap-1 items-center">
                                {['PROYECTAR_AUTO', 'PROYECTAR_SENTENCIA'].includes(tarea.tipo) && activeArea === 'DESPACHO' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setProvidenciaProcesoId(tarea.procesoId)
                                      setProvidenciaTipo(tarea.tipo === 'PROYECTAR_SENTENCIA' ? 'SENTENCIA' : 'AUTO')
                                      setProvidenciaAsunto(tarea.titulo || '')
                                      setShowNuevaProvidencia(true)
                                    }}
                                    title="Proyectar en Word"
                                  >
                                    <FileText className="w-4 h-4 mr-1" />
                                    Proyectar
                                  </Button>
                                )}
                                {tarea.procesoId && (
                                  <Button variant="ghost" size="sm" asChild>
                                    <Link href={`/expediente/${tarea.procesoId}`} title="Ver expediente">
                                      <Eye className="w-4 h-4" />
                                    </Link>
                                  </Button>
                                )}
                                {tarea.estado === 'PENDIENTE' && (
                                  <Button variant="ghost" size="sm" onClick={() => handleCambiarEstadoTarea(tarea.id, 'EN_PROGRESO')} title="Iniciar">
                                    <Play className="w-4 h-4" />
                                  </Button>
                                )}
                                {tarea.estado === 'EN_PROGRESO' && (
                                  <Button variant="ghost" size="sm" onClick={() => handleCambiarEstadoTarea(tarea.id, 'COMPLETADA')} title="Completar">
                                    <CheckSquare className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ==================== TUTELAS (Acciones de Tutela - Art. 86 CP) ==================== */}
          {activeTab === 'tutelas' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-violet-600 to-violet-800 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                    <Scale className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Acción de Tutela</h2>
                    <p className="text-violet-200">Art. 86 Constitución Política — Decreto 2591 de 1991</p>
                  </div>
                </div>
                <p className="text-violet-100 text-sm max-w-2xl">
                  Procedimiento <strong className="text-white">preferente y sumario</strong>. Término máximo <strong className="text-amber-300">10 días calendario</strong> para resolver. 
                  Protección inmediata de derechos constitucionales fundamentales. Fallo de inmediato cumplimiento.
                </p>
              </div>
              <div className="flex justify-between items-center gap-2">
                <p className="text-sm text-gray-500">{procesos.length} tutela{procesos.length !== 1 ? 's' : ''} en trámite</p>
                <div className="flex gap-2">
                  <Button onClick={() => { setShowCrearExpediente(true); setCrearExpedienteTab('reparto'); }} variant="outline" className="border-cyan-500 text-cyan-700 hover:bg-cyan-50">
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Crear expediente
                  </Button>
                  <Button onClick={() => { setNuevoProcesoTipo('tutela'); setFormClaseProceso('TUTELA'); setFormCategoriaProceso('CONSTITUCIONAL'); setShowNuevoProceso(true); }} className="bg-purple-500 hover:bg-purple-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Tutela
                  </Button>
                </div>
              </div>
              <Card>
                <CardContent className="p-0">
                  {procesos.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-500">
                      <Scale className="w-12 h-12 mx-auto mb-3 text-purple-200" />
                      <p>No hay tutelas en trámite.</p>
                      <p className="text-sm mt-1">Cree una nueva tutela o verifique que existan procesos con clase &quot;Acción de Tutela&quot;.</p>
                      <Button onClick={() => setShowNuevoProceso(true)} className="mt-4 bg-purple-500 hover:bg-purple-600">
                        <Plus className="w-4 h-4 mr-2" />
                        Nueva Tutela
                      </Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Radicado</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Paso</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Demandante</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Demandado</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Etapa</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {procesos.map((p) => {
                            const paso = getPasoActual(p)
                            return (
                            <tr key={p.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 font-mono font-medium">{p.radicado}</td>
                              <td className="px-6 py-4">
                                <Badge className={paso.color}>{paso.label}</Badge>
                              </td>
                              <td className="px-6 py-4">{p.demandante}</td>
                              <td className="px-6 py-4">{p.demandado}</td>
                              <td className="px-6 py-4">{p.etapaProcesal}</td>
                              <td className="px-6 py-4">
                                <Badge className={p.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                                  {p.estado}
                                </Badge>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex gap-2">
                                  <Button type="button" size="sm" variant="outline" onClick={() => openExpediente(p.id)}>
                                    <Eye className="w-4 h-4 mr-1" />
                                    Ver
                                  </Button>
                                  {activeArea === 'SECRETARIA' && !(p as any).oficialMayorId && (
                                    <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700" onClick={() => { setProcesoParaIngresar(p); setShowIngresarDespacho(true); }}>
                                      Ingresar al Despacho
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )})}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ==================== PROCESOS ==================== */}
          {activeTab === 'procesos' && (
            <div className="space-y-6">
              <div className="flex justify-end gap-2">
                <Button onClick={() => { setShowCrearExpediente(true); setCrearExpedienteTab('reparto'); }} variant="outline" className="border-cyan-500 text-cyan-700 hover:bg-cyan-50">
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Crear expediente
                </Button>
                <Button onClick={() => { setNuevoProcesoTipo('general'); setShowNuevoProceso(true); }} className="bg-amber-500 hover:bg-amber-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo proceso
                </Button>
              </div>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Radicado</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Paso</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ubicación</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Clase</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Demandante</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Demandado</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Etapa</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {procesos.map((p) => {
                          const paso = getPasoActual(p)
                          return (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">{p.radicado}</td>
                            <td className="px-6 py-4">
                              <Badge className={paso.color}>{paso.label}</Badge>
                            </td>
                            <td className="px-6 py-4 text-gray-600">{p.ubicacionSecretaria?.nombre || '—'}</td>
                            <td className="px-6 py-4 text-sm">{getClaseProcesoLabel(p.claseProceso)}</td>
                            <td className="px-6 py-4">{p.demandante}</td>
                            <td className="px-6 py-4">{p.demandado}</td>
                            <td className="px-6 py-4">{p.etapaProcesal}</td>
                            <td className="px-6 py-4">
                              <Badge className={p.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                                {p.estado}
                              </Badge>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={() => openExpediente(p.id)}>
                                  <Eye className="w-4 h-4 mr-1" />
                                  Ver
                                </Button>
                                {activeArea === 'SECRETARIA' && !(p as any).oficialMayorId && (
                                  <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700" onClick={() => { setProcesoParaIngresar(p); setShowIngresarDespacho(true); }}>
                                    Ingresar al Despacho
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ==================== OFICIOS (SECRETARÍA) ==================== */}
          {activeTab === 'oficios' && activeArea === 'SECRETARIA' && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button onClick={() => setShowNuevoOficio(true)} className="bg-blue-500 hover:bg-blue-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Oficio
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Pendientes</p><p className="text-2xl font-bold text-amber-600">{oficiosStats?.pendientes ?? 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Enviados</p><p className="text-2xl font-bold text-blue-600">{oficiosStats?.enviados ?? 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Respondidos</p><p className="text-2xl font-bold text-green-600">{oficiosStats?.respondidos ?? 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Sin respuesta</p><p className="text-2xl font-bold text-red-600">{oficiosStats?.sinRespuesta ?? 0}</p></CardContent></Card>
              </div>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-6 py-3">Proceso</th>
                          <th className="text-left px-6 py-3">Ubicación</th>
                          <th className="text-left px-6 py-3">Responsable</th>
                          <th className="text-left px-6 py-3">Destinatario</th>
                          <th className="text-left px-6 py-3">Asunto</th>
                          <th className="text-left px-6 py-3">Estado</th>
                          <th className="text-left px-6 py-3">Días</th>
                        </tr>
                      </thead>
                      <tbody>
                        {oficios.map((o: any) => (
                          <tr key={o.id} className="border-b hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">{o.proceso?.radicado}</td>
                            <td className="px-6 py-4 text-gray-600">{o.ubicacion?.nombre || o.proceso?.ubicacionSecretaria?.nombre || '—'}</td>
                            <td className="px-6 py-4">{o.responsable?.nombre || 'Sin asignar'}</td>
                            <td className="px-6 py-4">{o.destinatario}</td>
                            <td className="px-6 py-4">{o.asunto}</td>
                            <td className="px-6 py-4"><Badge variant="outline">{o.estado}</Badge></td>
                            <td className="px-6 py-4">{o.diasTranscurridos ?? 0} días</td>
                          </tr>
                        ))}
                        {oficios.length === 0 && (
                          <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">No hay oficios registrados</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ==================== EMPLAZAMIENTOS / NOTIFICACIONES (SECRETARÍA) ==================== */}
          {activeTab === 'emplazamientos' && activeArea === 'SECRETARIA' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                <p className="text-sm text-gray-600 max-w-2xl">
                  Registro interno de <strong>emplazamientos</strong> y otras notificaciones al demandado o terceros
                  (personal, por aviso, estado, etc.). Complementa los <strong>términos</strong> y la{' '}
                  <a href="/publicaciones" target="_blank" rel="noopener noreferrer" className="text-cyan-700 underline">
                    consulta pública
                  </a>{' '}
                  cuando el ítem esté en estado público.
                </p>
                <Button onClick={() => setShowNuevaNotificacion(true)} className="bg-blue-500 hover:bg-blue-600 shrink-0">
                  <Plus className="w-4 h-4 mr-2" />
                  Registrar notificación
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Pendientes</p><p className="text-2xl font-bold text-amber-600">{notificacionesStats?.pendientes ?? 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">En proceso</p><p className="text-2xl font-bold text-slate-600">{notificacionesStats?.enProceso ?? 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Enviadas</p><p className="text-2xl font-bold text-blue-600">{notificacionesStats?.enviadas ?? 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Entregadas</p><p className="text-2xl font-bold text-green-600">{notificacionesStats?.entregadas ?? 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Fallidas</p><p className="text-2xl font-bold text-red-600">{notificacionesStats?.fallidas ?? 0}</p></CardContent></Card>
              </div>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-6 py-3">Radicado</th>
                          <th className="text-left px-6 py-3">Destinatario</th>
                          <th className="text-left px-6 py-3">Tipo</th>
                          <th className="text-left px-6 py-3">Medio</th>
                          <th className="text-left px-6 py-3">Auto / acto</th>
                          <th className="text-left px-6 py-3">Estado</th>
                          <th className="text-left px-6 py-3">F. entrega</th>
                        </tr>
                      </thead>
                      <tbody>
                        {notificacionesJudiciales.map((n: any) => (
                          <tr key={n.id} className="border-b hover:bg-gray-50">
                            <td className="px-6 py-4 font-mono font-medium">{n.proceso?.radicado ?? '—'}</td>
                            <td className="px-6 py-4">
                              <div>{n.destinatario}</div>
                              {n.destinatarioId && <div className="text-xs text-gray-500">{n.destinatarioId}</div>}
                            </td>
                            <td className="px-6 py-4">
                              {n.tipo === 'PERSONAL' && 'Personal'}
                              {n.tipo === 'POR_AVISO' && 'Por aviso'}
                              {n.tipo === 'POR_ESTADO' && 'Por estado'}
                              {n.tipo === 'ELECTRONICA' && 'Electrónica'}
                              {n.tipo === 'FIJACION_CARTEL' && 'Fijación en cartel'}
                              {!['PERSONAL', 'POR_AVISO', 'POR_ESTADO', 'ELECTRONICA', 'FIJACION_CARTEL'].includes(n.tipo) && n.tipo}
                            </td>
                            <td className="px-6 py-4">
                              {n.medio === 'FISICO' && 'Físico'}
                              {n.medio === 'CORREO_ELECTRONICO' && 'Correo'}
                              {n.medio === 'VENTANILLA_VIRTUAL' && 'Ventanilla virtual'}
                              {n.medio === 'ESTADO' && 'Lista de estado'}
                              {n.medio === 'CARTEL' && 'Cartel'}
                              {!['FISICO', 'CORREO_ELECTRONICO', 'VENTANILLA_VIRTUAL', 'ESTADO', 'CARTEL'].includes(n.medio) && n.medio}
                            </td>
                            <td className="px-6 py-4 max-w-[200px] truncate" title={n.autoNotificar}>{n.autoNotificar}</td>
                            <td className="px-6 py-4">
                              <select
                                className="border rounded-md px-2 py-1.5 text-xs bg-white max-w-[140px]"
                                value={n.estado}
                                onChange={async (e) => {
                                  const nuevo = e.target.value
                                  try {
                                    const res = await apiFetch('/api/notificaciones', {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ id: n.id, estado: nuevo }),
                                    }, simulatedUser?.id)
                                    const data = await parseJsonResponse<{ success?: boolean }>(res)
                                    if (data?.success) {
                                      toast.success('Estado actualizado')
                                      fetchNotificacionesJudiciales()
                                      fetchDashboard()
                                    } else toast.error('No se pudo actualizar')
                                  } catch {
                                    toast.error('Error al actualizar')
                                  }
                                }}
                              >
                                <option value="PENDIENTE">Pendiente</option>
                                <option value="EN_PROCESO">En proceso</option>
                                <option value="ENVIADA">Enviada</option>
                                <option value="ENTREGADA">Entregada / Surtida</option>
                                <option value="FALLIDA">Fallida</option>
                                <option value="DEVUELTA">Devuelta</option>
                              </select>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {n.fechaEntrega
                                ? new Date(n.fechaEntrega).toLocaleDateString('es-CO')
                                : n.fechaEnvio
                                  ? `Envío ${new Date(n.fechaEnvio).toLocaleDateString('es-CO')}`
                                  : '—'}
                            </td>
                          </tr>
                        ))}
                        {notificacionesJudiciales.length === 0 && (
                          <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">No hay notificaciones registradas. Use «Registrar notificación» para emplazamientos u otros medios.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ==================== TÉRMINOS (SECRETARÍA) ==================== */}
          {activeTab === 'terminos' && activeArea === 'SECRETARIA' && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button onClick={() => setShowNuevoTermino(true)} className="bg-blue-500 hover:bg-blue-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Término
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Vigentes</p><p className="text-2xl font-bold text-green-600">{terminosStats?.vigentes ?? 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Por vencer</p><p className="text-2xl font-bold text-amber-600">{terminosStats?.porVencer ?? 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Vencidos</p><p className="text-2xl font-bold text-red-600">{terminosStats?.vencidos ?? 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Total</p><p className="text-2xl font-bold">{terminosStats?.total ?? 0}</p></CardContent></Card>
              </div>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-6 py-3">Proceso</th>
                          <th className="text-left px-6 py-3">Ubicación</th>
                          <th className="text-left px-6 py-3">Responsable</th>
                          <th className="text-left px-6 py-3">Tipo</th>
                          <th className="text-left px-6 py-3">Vencimiento</th>
                          <th className="text-left px-6 py-3">Días restantes</th>
                          <th className="text-left px-6 py-3">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {terminos.map((t: any) => (
                          <tr key={t.id} className="border-b hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">{t.proceso?.radicado}</td>
                            <td className="px-6 py-4 text-gray-600">{t.ubicacion?.nombre || t.proceso?.ubicacionSecretaria?.nombre || '—'}</td>
                            <td className="px-6 py-4">{t.responsable?.nombre || 'Sin asignar'}</td>
                            <td className="px-6 py-4">{t.tipo}</td>
                            <td className="px-6 py-4">{new Date(t.fechaVencimiento).toLocaleDateString('es-CO')}</td>
                            <td className="px-6 py-4">{t.diasRestantes ?? '-'}</td>
                            <td className="px-6 py-4">
                              <Badge className={
                                t.estadoCalculado === 'vencido' ? 'bg-red-100 text-red-700' :
                                t.estadoCalculado === 'por_vencer' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                              }>{t.estadoCalculado || 'vigente'}</Badge>
                            </td>
                          </tr>
                        ))}
                        {terminos.length === 0 && (
                          <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">No hay términos activos</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ==================== AUDIENCIAS (SECRETARÍA) ==================== */}
          {activeTab === 'audiencias' && activeArea === 'SECRETARIA' && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button onClick={() => setShowNuevaAudiencia(true)} className="bg-blue-500 hover:bg-blue-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Nueva Audiencia
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Hoy</p><p className="text-2xl font-bold text-purple-600">{audienciasStats?.hoy ?? 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Esta semana</p><p className="text-2xl font-bold text-blue-600">{audienciasStats?.semana ?? 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Programadas</p><p className="text-2xl font-bold">{audienciasStats?.programadas ?? 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Realizadas</p><p className="text-2xl font-bold text-green-600">{audienciasStats?.realizadas ?? 0}</p></CardContent></Card>
              </div>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-6 py-3">Proceso</th>
                          <th className="text-left px-6 py-3">Tipo</th>
                          <th className="text-left px-6 py-3">Fecha</th>
                          <th className="text-left px-6 py-3">Juez</th>
                          <th className="text-left px-6 py-3">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audiencias.map((a: any) => (
                          <tr key={a.id} className="border-b hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">{a.proceso?.radicado}</td>
                            <td className="px-6 py-4">{a.tipo}</td>
                            <td className="px-6 py-4">{new Date(a.fecha).toLocaleString('es-CO')}</td>
                            <td className="px-6 py-4">{a.juez}</td>
                            <td className="px-6 py-4"><Badge variant="outline">{a.estado}</Badge></td>
                          </tr>
                        ))}
                        {audiencias.length === 0 && (
                          <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No hay audiencias programadas</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ==================== ADMIN - JUZGADOS ==================== */}
          {activeArea === 'ADMIN' && activeTab === 'juzgados' && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Juzgados registrados</CardTitle>
                    <CardDescription>Tipos: Civil Municipal, Pequeñas Causas, Circuito, Promiscuo, etc.</CardDescription>
                  </div>
                  <Button onClick={() => setShowNuevoJuzgado(true)} className="bg-amber-500 hover:bg-amber-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo juzgado
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left px-4 py-3">Código</th>
                          <th className="text-left px-4 py-3">Nombre</th>
                          <th className="text-left px-4 py-3">Tipo</th>
                          <th className="text-left px-4 py-3">Ciudad</th>
                          <th className="text-left px-4 py-3">Usuarios</th>
                          <th className="text-left px-4 py-3">Procesos</th>
                          <th className="text-left px-4 py-3">Ubicaciones</th>
                          <th className="text-left px-4 py-3">Tipos Estadística</th>
                        </tr>
                      </thead>
                      <tbody>
                        {juzgados.map((j) => (
                          <tr key={j.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono">{j.codigo}</td>
                            <td className="px-4 py-3 font-medium">{j.nombre}</td>
                            <td className="px-4 py-3"><Badge variant="outline">{j.tipoJuzgado.replace(/_/g, ' ')}</Badge></td>
                            <td className="px-4 py-3">{j.ciudad}</td>
                            <td className="px-4 py-3">{j._count?.usuarios ?? 0}</td>
                            <td className="px-4 py-3">{j._count?.procesos ?? 0}</td>
                            <td className="px-4 py-3">
                              <Button variant="outline" size="sm" onClick={() => { setJuzgadoParaUbicaciones(j); setShowUbicacionesJuzgado(true); setNuevaUbicacionNombre(''); setNuevaUbicacionCodigo(''); fetchUbicaciones(j.id); }}>
                                <MapPin className="w-4 h-4 mr-1" />
                                Ubicaciones
                              </Button>
                            </td>
                            <td className="px-4 py-3">
                              <Button variant="outline" size="sm" onClick={() => { setJuzgadoParaTipos(j); setShowTiposEstadisticaJuzgado(true); setNuevaTipoNombre(''); setNuevaTipoCodigo(''); fetchTiposProcesoEstadistica(j.id); }}>
                                <BarChart3 className="w-4 h-4 mr-1" />
                                Tipos
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ==================== ADMIN - USUARIOS ==================== */}
          {activeArea === 'ADMIN' && activeTab === 'usuarios' && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Usuarios del sistema</CardTitle>
                    <CardDescription>Asigne cargos (rol) y juzgado a cada funcionario. Super Admin no tiene juzgado.</CardDescription>
                  </div>
                  <Button onClick={() => { setUsuarioEditando(null); setShowNuevoUsuario(true); }} className="bg-amber-500 hover:bg-amber-600">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Nuevo usuario
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left px-4 py-3">Nombre</th>
                          <th className="text-left px-4 py-3">Email</th>
                          <th className="text-left px-4 py-3">Cargo</th>
                          <th className="text-left px-4 py-3">Área</th>
                          <th className="text-left px-4 py-3">Juzgado</th>
                          <th className="text-left px-4 py-3">Estado</th>
                          <th className="text-left px-4 py-3">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usuarios.map((u) => (
                          <tr key={u.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{u.nombre}</td>
                            <td className="px-4 py-3">{u.email}</td>
                            <td className="px-4 py-3"><Badge variant="outline">{ROLES_LABEL[u.rol] || u.rol}</Badge></td>
                            <td className="px-4 py-3">{u.area === 'DESPACHO' ? 'Despacho' : 'Secretaría'}</td>
                            <td className="px-4 py-3">{u.juzgado?.nombre ?? '—'}</td>
                            <td className="px-4 py-3">
                              <Badge className={u.activo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>
                            </td>
                            <td className="px-4 py-3">
                              <Button variant="ghost" size="icon" onClick={() => { setUsuarioEditando(u); setShowNuevoUsuario(true); }}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Placeholder para otros tabs */}
          {!['dashboard', 'proveer', 'planner', 'tutelas', 'memoriales', 'oficios', 'emplazamientos', 'terminos', 'audiencias', 'tareas', 'procesos', 'usuarios', 'juzgados'].includes(activeTab) && (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-gray-500">Módulo en desarrollo: {activeTab}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Dialog Nueva Tarea */}
      <Dialog open={showNuevaTarea} onOpenChange={setShowNuevaTarea}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nueva Tarea - {activeArea === 'DESPACHO' ? 'Despacho' : 'Secretaría'}</DialogTitle>
            <DialogDescription>
              Cree una nueva tarea para el área de {activeArea === 'DESPACHO' ? 'Despacho' : 'Secretaría'}
            </DialogDescription>
          </DialogHeader>
          <form action={handleCrearTarea} className="space-y-4">
            <div className="space-y-2">
              <Label>Proceso</Label>
              <Select name="procesoId">
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proceso" />
                </SelectTrigger>
                <SelectContent>
                  {procesos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.radicado} - {p.demandante}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Título</Label>
              <Input name="titulo" placeholder="Título de la tarea" required />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea name="descripcion" placeholder="Descripción de la tarea" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select name="tipo" defaultValue="OTRO">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activeArea === 'DESPACHO' ? (
                      <>
                        <SelectItem value="PROYECTAR_AUTO">Proyectar Auto</SelectItem>
                        <SelectItem value="PROYECTAR_SENTENCIA">Proyectar Sentencia</SelectItem>
                        <SelectItem value="REVISAR_PROVIDENCIA">Revisar Providencia</SelectItem>
                        <SelectItem value="FIRMAR_PROVIDENCIA">Firmar Providencia</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="NOTIFICACION">Notificación</SelectItem>
                        <SelectItem value="OFICIO">Oficio</SelectItem>
                        <SelectItem value="TRASLADO">Traslado</SelectItem>
                        <SelectItem value="MEMORIAL">Memorial</SelectItem>
                      </>
                    )}
                    <SelectItem value="OTRO">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select name="prioridad" defaultValue="MEDIA">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="URGENTE">Urgente</SelectItem>
                    <SelectItem value="ALTA">Alta</SelectItem>
                    <SelectItem value="MEDIA">Media</SelectItem>
                    <SelectItem value="BAJA">Baja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Responsable</Label>
              <Select name="responsableId">
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__sin_asignar__">Sin asignar</SelectItem>
                  {usuarios.filter(u => u.juzgadoId).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nombre} ({ROLES_LABEL[u.rol]})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha Límite</Label>
              <Input name="fechaLimite" type="date" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNuevaTarea(false)}>Cancelar</Button>
              <Button type="submit" className={activeArea === 'DESPACHO' ? 'bg-purple-500 hover:bg-purple-600' : 'bg-blue-500 hover:bg-blue-600'}>
                Crear Tarea
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Nueva Providencia */}
      <Dialog open={showNuevaProvidencia} onOpenChange={(open) => {
        setShowNuevaProvidencia(open)
        if (!open) { setProvidenciaContenido(''); setProvidenciaProcesoId(''); setProvidenciaAsunto(''); }
      }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Nueva Providencia</DialogTitle>
            <DialogDescription>Proyectar auto o sentencia para revisión y firma del Juez. Use la plantilla Word para redactar con el formato del juzgado.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault()
            handleCrearProvidencia({
              procesoId: providenciaProcesoId,
              tipo: providenciaTipo,
              numero: (e.currentTarget.elements.namedItem('numero') as HTMLInputElement)?.value || '',
              asunto: providenciaAsunto,
              contenido: providenciaContenido,
            })
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>Proceso</Label>
              <Select name="procesoId" required value={providenciaProcesoId} onValueChange={setProvidenciaProcesoId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar proceso" /></SelectTrigger>
                <SelectContent>
                  {procesos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.radicado} - {p.demandante}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select name="tipo" required value={providenciaTipo} onValueChange={(v) => setProvidenciaTipo(v as 'AUTO' | 'SENTENCIA')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO">Auto</SelectItem>
                    <SelectItem value="SENTENCIA">Sentencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Número</Label>
                <Input name="numero" placeholder="Ej. 001" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Asunto</Label>
              <Input name="asunto" placeholder="Breve descripción" required value={providenciaAsunto} onChange={(e) => setProvidenciaAsunto(e.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Contenido</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleDescargarPlantillaProvidencia} disabled={!providenciaProcesoId}>
                    <Download className="w-4 h-4 mr-1" />
                    Plantilla Word
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => providenciaFileInputRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-1" />
                    Subir Word
                  </Button>
                  <input ref={providenciaFileInputRef} type="file" accept=".doc,.docx" className="hidden" onChange={handleSubirWordProvidencia} />
                </div>
              </div>
              <Textarea name="contenido" placeholder="Escriba aquí o suba un archivo Word editado..." rows={6} value={providenciaContenido} onChange={(e) => setProvidenciaContenido(e.target.value)} />
              <p className="text-xs text-gray-500">Descargue la plantilla, edítela en Word y súbala para cargar el contenido automáticamente.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNuevaProvidencia(false)}>Cancelar</Button>
              <Button type="submit" className="bg-purple-500 hover:bg-purple-600">Proyectar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Nuevo Memorial */}
      <Dialog open={showNuevoMemorial} onOpenChange={setShowNuevoMemorial}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Registrar Memorial</DialogTitle>
            <DialogDescription>Radicar memorial presentado por las partes.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCrearMemorial(new FormData(e.currentTarget)); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Proceso</Label>
              <Select name="procesoId" required>
                <SelectTrigger><SelectValue placeholder="Seleccionar proceso" /></SelectTrigger>
                <SelectContent>
                  {procesos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.radicado} - {p.demandante}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select name="tipo" required>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEMANDA">Demanda</SelectItem>
                    <SelectItem value="SOLICITUD_PRUEBAS">Solicitud de pruebas</SelectItem>
                    <SelectItem value="INCIDENTE">Incidente</SelectItem>
                    <SelectItem value="RECURSO_APELACION">Recurso de apelación</SelectItem>
                    <SelectItem value="RECURSO_REPOSICION">Recurso de reposición</SelectItem>
                    <SelectItem value="OTRO">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Número</Label>
                <Input name="numero" placeholder="Radicado" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Presentante</Label>
                <Input name="presentante" placeholder="Nombre completo" required />
              </div>
              <div className="space-y-2">
                <Label>Identificación (CC/NIT)</Label>
                <Input name="identificacion" placeholder="Cédula o NIT" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Asunto</Label>
              <Input name="asunto" placeholder="Breve descripción" required />
            </div>
            <div className="space-y-2">
              <Label>Folios</Label>
              <Input name="folios" type="number" min={1} placeholder="0" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNuevoMemorial(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-500 hover:bg-blue-600">Radicar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Nuevo Oficio */}
      <Dialog open={showNuevoOficio} onOpenChange={setShowNuevoOficio}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nuevo Oficio</DialogTitle>
            <DialogDescription>Crear oficio para solicitar información o documentación.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCrearOficio(new FormData(e.currentTarget)); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Proceso</Label>
              <Select name="procesoId" required>
                <SelectTrigger><SelectValue placeholder="Seleccionar proceso" /></SelectTrigger>
                <SelectContent>
                  {procesos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.radicado} - {p.demandante}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de destinatario</Label>
              <Select name="tipoDestinatario" required>
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENTIDAD_PUBLICA">Entidad pública</SelectItem>
                  <SelectItem value="REGISTRO_INSTRUMENTOS">Registro de instrumentos</SelectItem>
                  <SelectItem value="BANCO">Banco</SelectItem>
                  <SelectItem value="NOTARIA">Notaría</SelectItem>
                  <SelectItem value="CAMARA_COMERCIO">Cámara de comercio</SelectItem>
                  <SelectItem value="OTRO">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Destinatario</Label>
                <Input name="destinatario" placeholder="Nombre o entidad" required />
              </div>
              <div className="space-y-2">
                <Label>NIT / Identificación</Label>
                <Input name="destinatarioId" placeholder="Opcional" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Asunto</Label>
              <Input name="asunto" placeholder="Asunto del oficio" required />
            </div>
            <div className="space-y-2">
              <Label>Número (opcional)</Label>
              <Input name="numero" placeholder="Ej. 001-2025" />
            </div>
            <div className="space-y-2">
              <Label>Contenido (opcional)</Label>
              <Textarea name="contenido" placeholder="Texto del oficio..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Responsable</Label>
              <Select name="responsableId">
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__sin_asignar__">Sin asignar</SelectItem>
                  {usuarios.filter(u => u.juzgadoId).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nombre} ({ROLES_LABEL[u.rol]})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNuevoOficio(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-500 hover:bg-blue-600">Crear Oficio</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: notificación / emplazamiento */}
      <Dialog open={showNuevaNotificacion} onOpenChange={setShowNuevaNotificacion}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Registrar notificación</DialogTitle>
            <DialogDescription>
              Emplazamiento (típicamente tipo <strong>Personal</strong> y medio <strong>Físico</strong>) u otras notificaciones procesales.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleCrearNotificacionJudicial(new FormData(e.currentTarget))
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Proceso</Label>
              <select
                name="procesoId"
                required
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                defaultValue=""
              >
                <option value="" disabled>Seleccionar proceso</option>
                {procesos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.radicado} — {p.demandado}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <select name="tipo" required className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                  <option value="PERSONAL">Personal (emplazamiento habitual)</option>
                  <option value="POR_AVISO">Por aviso</option>
                  <option value="POR_ESTADO">Por lista de estado</option>
                  <option value="ELECTRONICA">Electrónica</option>
                  <option value="FIJACION_CARTEL">Fijación en cartel / edicto</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Medio</Label>
                <select name="medio" required className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                  <option value="FISICO">Físico (citador / domicilio)</option>
                  <option value="CORREO_ELECTRONICO">Correo electrónico</option>
                  <option value="VENTANILLA_VIRTUAL">Ventanilla virtual</option>
                  <option value="ESTADO">Lista de estado</option>
                  <option value="CARTEL">Cartel / estrado</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Destinatario</Label>
                <Input name="destinatario" placeholder="Nombre del notificado" required />
              </div>
              <div className="space-y-2">
                <Label>Identificación (opcional)</Label>
                <Input name="destinatarioId" placeholder="CC / NIT" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Dirección o correo (opcional)</Label>
              <Input name="direccion" placeholder="Dirección de notificación" />
            </div>
            <div className="space-y-2">
              <Label>Correo (si aplica)</Label>
              <Input name="email" type="email" placeholder="correo@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Auto o acto que se notifica</Label>
              <Input name="autoNotificar" placeholder="Ej. Auto admisorio de demanda" required />
            </div>
            <div className="space-y-2">
              <Label>Fecha del auto (opcional)</Label>
              <Input name="fechaAuto" type="date" />
            </div>
            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea name="observaciones" placeholder="Ej. intentos de notificación, datos del citador…" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNuevaNotificacion(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-500 hover:bg-blue-600">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Nuevo Término */}
      <Dialog open={showNuevoTermino} onOpenChange={setShowNuevoTermino}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nuevo Término</DialogTitle>
            <DialogDescription>Registrar término procesal (traslado, emplazamiento, etc.).</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCrearTermino(new FormData(e.currentTarget)); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Proceso</Label>
              <Select name="procesoId" required>
                <SelectTrigger><SelectValue placeholder="Seleccionar proceso" /></SelectTrigger>
                <SelectContent>
                  {procesos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.radicado} - {p.demandante}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de término</Label>
              <Select name="tipo" required>
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Traslado demanda">Traslado demanda</SelectItem>
                  <SelectItem value="Traslado excepciones">Traslado excepciones</SelectItem>
                  <SelectItem value="Emplazamiento">Emplazamiento</SelectItem>
                  <SelectItem value="Ejecutoria">Ejecutoria</SelectItem>
                  <SelectItem value="Pruebas">Pruebas</SelectItem>
                  <SelectItem value="Alegatos">Alegatos</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Input name="descripcion" placeholder="Breve descripción" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha inicio</Label>
                <Input name="fechaInicio" type="date" required />
              </div>
              <div className="space-y-2">
                <Label>Fecha vencimiento</Label>
                <Input name="fechaVencimiento" type="date" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Días del término</Label>
                <Input name="diasTermino" type="number" min={1} defaultValue={10} required />
              </div>
              <div className="space-y-2">
                <Label>Días hábiles</Label>
                <Select name="diasHabiles" defaultValue="true">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Sí</SelectItem>
                    <SelectItem value="false">No (calendario)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Responsable</Label>
              <Select name="responsableId">
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__sin_asignar__">Sin asignar</SelectItem>
                  {usuarios.filter(u => u.juzgadoId).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nombre} ({ROLES_LABEL[u.rol]})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNuevoTermino(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-500 hover:bg-blue-600">Crear Término</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Nueva Audiencia */}
      <Dialog open={showNuevaAudiencia} onOpenChange={setShowNuevaAudiencia}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nueva Audiencia</DialogTitle>
            <DialogDescription>Programar audiencia para el proceso.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCrearAudiencia(new FormData(e.currentTarget)); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Proceso</Label>
              <Select name="procesoId" required>
                <SelectTrigger><SelectValue placeholder="Seleccionar proceso" /></SelectTrigger>
                <SelectContent>
                  {procesos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.radicado} - {p.demandante}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select name="tipo" required>
                  <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INICIAL">Inicial</SelectItem>
                    <SelectItem value="INSTRUCCION">Instrucción</SelectItem>
                    <SelectItem value="JUZGAMIENTO">Juzgamiento</SelectItem>
                    <SelectItem value="CONCILIACION">Conciliación</SelectItem>
                    <SelectItem value="PRUEBAS">Pruebas</SelectItem>
                    <SelectItem value="ESPECIAL">Especial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duración (min)</Label>
                <Input name="duracion" type="number" min={15} defaultValue={60} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input name="fecha" type="datetime-local" required />
              </div>
              <div className="space-y-2">
                <Label>Sala</Label>
                <Input name="sala" placeholder="Ej. Sala 1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Juez</Label>
                <Input name="juez" placeholder="Nombre del juez" required />
              </div>
              <div className="space-y-2">
                <Label>Secretario</Label>
                <Input name="secretario" placeholder="Opcional" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea name="observaciones" placeholder="Opcional" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNuevaAudiencia(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-500 hover:bg-blue-600">Programar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Nuevo Proceso */}
      <Dialog open={showNuevoProceso} onOpenChange={(open) => {
        if (!open) { setNuevoProcesoTipo('general'); setFormClaseProceso(''); setFormCategoriaProceso('CIVIL'); setFormInstancia('PRIMERA_INSTANCIA'); setFormJuzgadoId(''); setFormOficialMayorId(''); setFormTipoProcesoEstadisticaId(''); }
        setShowNuevoProceso(open)
      }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>{nuevoProcesoTipo === 'tutela' ? 'Nueva Tutela' : 'Nuevo Proceso'}</DialogTitle>
            <DialogDescription>
              {nuevoProcesoTipo === 'tutela' ? 'Acción de Tutela (Art. 86 C.P.). Término 10 días calendario.' : 'Radicar nuevo proceso judicial.'}
            </DialogDescription>
          </DialogHeader>
          <form key={nuevoProcesoTipo} onSubmit={(e) => { e.preventDefault(); handleCrearProceso(new FormData(e.currentTarget)); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Instancia (por ley)</Label>
              <Select name="instancia" value={formInstancia} onValueChange={setFormInstancia}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIMERA_INSTANCIA">Primera instancia</SelectItem>
                  <SelectItem value="SEGUNDA_INSTANCIA">Segunda instancia</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Por defecto: Primera instancia. Luego se crean cuadernos (principal, medidas cautelares, etc.).</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select name="categoriaProceso" value={formCategoriaProceso || (nuevoProcesoTipo === 'tutela' ? 'CONSTITUCIONAL' : 'CIVIL')} onValueChange={setFormCategoriaProceso}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CIVIL">Civil</SelectItem>
                    <SelectItem value="CONSTITUCIONAL">Constitucional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Clase</Label>
                <Select name="claseProceso" value={formClaseProceso || (nuevoProcesoTipo === 'tutela' ? 'TUTELA' : undefined)} onValueChange={setFormClaseProceso} required>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EJECUTIVO_SINGULAR">Ejecutivo Singular</SelectItem>
                    <SelectItem value="EJECUTIVO_HIPOTECARIO">Ejecutivo Hipotecario</SelectItem>
                    <SelectItem value="ORDINARIO">Ordinario</SelectItem>
                    <SelectItem value="VERBAL">Verbal</SelectItem>
                    <SelectItem value="TUTELA">Acción de Tutela</SelectItem>
                    <SelectItem value="HABEAS_CORPUS">Hábeas Corpus</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Demanda (objeto)</Label>
              <Input name="demanda" placeholder="Breve descripción del objeto" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Demandante</Label>
                <Input name="demandante" required />
              </div>
              <div className="space-y-2">
                <Label>Demandado</Label>
                <Input name="demandado" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cuantía (COP)</Label>
                <Input name="cuantia" type="number" placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Juzgado</Label>
                <Select name="juzgadoId" value={formJuzgadoId} onValueChange={setFormJuzgadoId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {juzgados.map((j) => (
                      <SelectItem key={j.id} value={j.id}>{j.codigo} - {j.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {tiposProcesoParaForm.length > 0 && (
              <div className="space-y-2">
                <Label>Tipo para estadística oficial</Label>
                <Select name="tipoProcesoEstadisticaId" value={formTipoProcesoEstadisticaId} onValueChange={setFormTipoProcesoEstadisticaId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar (opcional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__sin_tipo__">Sin clasificar</SelectItem>
                    {tiposProcesoParaForm.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">Clasificación para reportes estadísticos oficiales del juzgado.</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Oficial Mayor asignado (Despacho)</Label>
              <Select name="oficialMayorId" value={formOficialMayorId} onValueChange={setFormOficialMayorId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar oficial" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__sin_asignar__">Sin asignar</SelectItem>
                  {usuarios.filter(u => u.rol === 'OFICIAL_MAYOR').map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">El secretario asigna al ingresar el proceso al Despacho. El oficial proyecta la providencia.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNuevoProceso(false)}>Cancelar</Button>
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600">Crear</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Crear expediente */}
      <Dialog open={showCrearExpediente} onOpenChange={(o) => { setShowCrearExpediente(o); if (!o) setImportandoReparto(false); }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-600" />
              Crear expediente
            </DialogTitle>
            <DialogDescription>
              Cargue el ZIP de reparto para extraer los datos automáticamente, o ingrese los datos manualmente.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={crearExpedienteTab} onValueChange={(v) => setCrearExpedienteTab(v as 'reparto' | 'manual')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="reparto">Cargar desde reparto</TabsTrigger>
              <TabsTrigger value="manual">Datos manuales</TabsTrigger>
            </TabsList>
            <TabsContent value="reparto" className="mt-4">
              <form onSubmit={handleImportarReparto} className="space-y-4">
                <div className="space-y-2">
                  <Label>Archivo ZIP de reparto</Label>
                  <Input type="file" accept=".zip" required disabled={importandoReparto} />
                  <p className="text-xs text-gray-500">Documentos, acta de reparto, informe. Se extraen demandante, demandado, demanda y se crea el expediente.</p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowCrearExpediente(false)} disabled={importandoReparto}>Cancelar</Button>
                  <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={importandoReparto}>
                    {importandoReparto ? 'Creando...' : 'Crear expediente'}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
            <TabsContent value="manual" className="mt-4">
              <form onSubmit={(e) => { e.preventDefault(); setShowCrearExpediente(false); setShowNuevoProceso(true); setNuevoProcesoTipo('general'); }} className="space-y-4">
                <p className="text-sm text-gray-600">Ingrese los datos del expediente manualmente.</p>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowCrearExpediente(false)}>Cancelar</Button>
                  <Button type="submit" className="bg-amber-500 hover:bg-amber-600">Ir al formulario</Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Dialog Ingresar al Despacho */}
      <Dialog open={showIngresarDespacho} onOpenChange={(open) => { if (!open) setProcesoParaIngresar(null); setShowIngresarDespacho(open); }}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Ingresar proceso al Despacho</DialogTitle>
            <DialogDescription>
              {procesoParaIngresar ? `${procesoParaIngresar.radicado} - ${procesoParaIngresar.demandante} vs ${procesoParaIngresar.demandado}` : 'Asigne oficial y fechas.'}
            </DialogDescription>
          </DialogHeader>
          {procesoParaIngresar && (
            <form onSubmit={(e) => { e.preventDefault(); handleIngresarDespacho(new FormData(e.currentTarget)); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Oficial Mayor</Label>
                <Select name="oficialMayorId" required>
                  <SelectTrigger><SelectValue placeholder="Seleccionar oficial" /></SelectTrigger>
                  <SelectContent>
                    {usuarios.filter(u => u.rol === 'OFICIAL_MAYOR').map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fecha de entrada</Label>
                  <Input name="fechaEntradaDespacho" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
                </div>
                <div className="space-y-2">
                  <Label>Fecha límite</Label>
                  <Input name="fechaLimiteDespacho" type="date" required />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setShowIngresarDespacho(false); setProcesoParaIngresar(null); }}>Cancelar</Button>
                <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700">Ingresar al Despacho</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Nuevo Juzgado */}
      <Dialog open={showNuevoJuzgado} onOpenChange={setShowNuevoJuzgado}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nuevo Juzgado</DialogTitle>
            <DialogDescription>Registrar un nuevo juzgado en el sistema.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCrearJuzgado(new FormData(e.currentTarget)); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input name="nombre" placeholder="Ej. Juzgado Primero Civil del Circuito" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Código</Label>
                <Input name="codigo" placeholder="11-001-CIV-01" required />
              </div>
              <div className="space-y-2">
                <Label>Código Radicación (12 dígitos)</Label>
                <Input name="codigoRadicacion12" placeholder="110013103051 (Bogotá-Circuito31-Civil03-Despacho051)" maxLength={12} />
                <p className="text-xs text-gray-500">ciudad(5)+circuito(2)+civil(2)+despacho(3). Auto-genera año + consecutivo.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select name="tipoJuzgado" defaultValue="CIVIL_MUNICIPAL">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CIVIL_MUNICIPAL">Civil Municipal</SelectItem>
                    <SelectItem value="CIVIL_MUNICIPAL_PEQUENAS_CAUSAS">Pequeñas Causas</SelectItem>
                    <SelectItem value="CIVIL_CIRCUITO">Civil Circuito</SelectItem>
                    <SelectItem value="CIVIL_CIRCUITO_ESPECIALIZADO">Civil Circuito Especializado</SelectItem>
                    <SelectItem value="PROMISCUO_MUNICIPAL">Promiscuo Municipal</SelectItem>
                    <SelectItem value="PROMISCUO_CIRCUITO">Promiscuo Circuito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ciudad</Label>
              <Input name="ciudad" placeholder="Bogotá D.C." required />
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Input name="direccion" placeholder="Opcional" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input name="telefono" placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input name="email" type="email" placeholder="Opcional" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNuevoJuzgado(false)}>Cancelar</Button>
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600">Crear</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Tipos de Proceso para Estadística (por juzgado) - Civiles y Tutelas separados */}
      <Dialog open={showTiposEstadisticaJuzgado} onOpenChange={(o) => { if (!o) { setShowTiposEstadisticaJuzgado(false); setJuzgadoParaTipos(null); setTiposProcesoEstadistica([]); setTabTiposEstadistica('CIVIL'); } }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-600" />
              Tipos para estadística oficial
            </DialogTitle>
            <DialogDescription>
              {juzgadoParaTipos ? (
                <>Procesos civiles y tutelas son separados. Configure los tipos que reporta su juzgado.</>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {juzgadoParaTipos && (
            <div className="space-y-4">
              <Tabs value={tabTiposEstadistica} onValueChange={(v) => setTabTiposEstadistica(v as 'CIVIL' | 'CONSTITUCIONAL')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="CIVIL">Procesos civiles (24)</TabsTrigger>
                  <TabsTrigger value="CONSTITUCIONAL">Tutelas por derecho (12)</TabsTrigger>
                </TabsList>
                <div className="mt-4 space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder={tabTiposEstadistica === 'CIVIL' ? 'Nombre (ej. EJECUTIVOS)' : 'Nombre (ej. SALUD)'}
                      value={nuevaTipoNombre}
                      onChange={(e) => setNuevaTipoNombre(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAgregarTipoEstadistica(); } }}
                      className="flex-1"
                    />
                    <Input placeholder="Código" className="w-24" value={nuevaTipoCodigo} onChange={(e) => setNuevaTipoCodigo(e.target.value)} />
                    <Button type="button" onClick={handleAgregarTipoEstadistica} disabled={!nuevaTipoNombre.trim()} className="bg-amber-500 hover:bg-amber-600 shrink-0">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                    {tiposProcesoEstadistica.filter(t => t.categoriaProceso === tabTiposEstadistica).length === 0 ? (
                      <p className="p-4 text-sm text-gray-500 text-center">
                        {tabTiposEstadistica === 'CIVIL' ? 'No hay tipos civiles. Ejecute el seed o agregue (EJECUTIVOS, DECLARATIVOS VERBAL PERTENENCIA, etc.).' : 'No hay tipos de tutela. Ejecute el seed o agregue (SALUD, EDUCACIÓN, SEGURIDAD SOCIAL, etc.).'}
                      </p>
                    ) : (
                      tiposProcesoEstadistica.filter(t => t.categoriaProceso === tabTiposEstadistica).map((t) => (
                        <div key={t.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium truncate">{t.nombre}</span>
                            {t.codigo && <Badge variant="outline" className="text-xs shrink-0">{t.codigo}</Badge>}
                          </div>
                          <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0" onClick={() => handleEliminarTipoEstadistica(t.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Ubicaciones de Secretaría (por juzgado) */}
      <Dialog open={showUbicacionesJuzgado} onOpenChange={(o) => { if (!o) { setShowUbicacionesJuzgado(false); setJuzgadoParaUbicaciones(null); setUbicaciones([]); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-cyan-600" />
              Ubicaciones de Secretaría
            </DialogTitle>
            <DialogDescription>
              {juzgadoParaUbicaciones ? (
                <>Configure las ubicaciones/mesas de Secretaría para <strong>{juzgadoParaUbicaciones.nombre}</strong>. Ej: Términos, Oficios, Letra, Emplazamiento.</>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {juzgadoParaUbicaciones && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Nombre (ej. Términos)"
                  value={nuevaUbicacionNombre}
                  onChange={(e) => setNuevaUbicacionNombre(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAgregarUbicacion(); } }}
                />
                <Input
                  placeholder="Código (opcional)"
                  className="w-24"
                  value={nuevaUbicacionCodigo}
                  onChange={(e) => setNuevaUbicacionCodigo(e.target.value)}
                />
                <Button
                  type="button"
                  onClick={handleAgregarUbicacion}
                  disabled={!nuevaUbicacionNombre.trim()}
                  className="bg-cyan-600 hover:bg-cyan-700 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {ubicaciones.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500 text-center">No hay ubicaciones. Agregue Términos, Oficios, Letra, Emplazamiento, etc.</p>
                ) : (
                  ubicaciones.map((u) => (
                    <div key={u.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{u.nombre}</span>
                        {u.codigo && <Badge variant="outline" className="text-xs">{u.codigo}</Badge>}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleEliminarUbicacion(u.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Crear/Editar Usuario */}
      <Dialog open={showNuevoUsuario} onOpenChange={(open) => { if (!open) { setShowNuevoUsuario(false); setUsuarioEditando(null); } }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{usuarioEditando ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
            <DialogDescription>
              {usuarioEditando ? 'Modifique el cargo, área o juzgado del funcionario.' : 'Asigne un cargo (rol) y juzgado al nuevo funcionario.'}
            </DialogDescription>
          </DialogHeader>
          <form action={usuarioEditando ? handleActualizarUsuario : handleCrearUsuario} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input name="nombre" placeholder="Ej. Dr. Carlos Rodríguez" required defaultValue={usuarioEditando?.nombre} />
            </div>
            {!usuarioEditando && (
              <div className="space-y-2">
                <Label>Email</Label>
                <Input name="email" type="email" placeholder="correo@ramajudicial.gov.co" required />
              </div>
            )}
            <div className="space-y-2">
              <Label>Contraseña {usuarioEditando && '(dejar vacío para no cambiar)'}</Label>
              <Input name="password" type="password" placeholder="••••••••" required={!usuarioEditando} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cargo (rol)</Label>
                <Select name="rol" defaultValue={usuarioEditando?.rol || 'ESCRIBIENTE'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="JUEZ">{ROLES_LABEL.JUEZ}</SelectItem>
                    <SelectItem value="OFICIAL_MAYOR">{ROLES_LABEL.OFICIAL_MAYOR}</SelectItem>
                    <SelectItem value="SECRETARIO">{ROLES_LABEL.SECRETARIO}</SelectItem>
                    <SelectItem value="ESCRIBIENTE">{ROLES_LABEL.ESCRIBIENTE}</SelectItem>
                    <SelectItem value="ASISTENTE_JUDICIAL">{ROLES_LABEL.ASISTENTE_JUDICIAL}</SelectItem>
                    <SelectItem value="ADMIN">{ROLES_LABEL.ADMIN}</SelectItem>
                    <SelectItem value="SUPER_ADMIN">{ROLES_LABEL.SUPER_ADMIN}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Área</Label>
                <Select name="area" defaultValue={usuarioEditando?.area || 'SECRETARIA'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DESPACHO">Despacho</SelectItem>
                    <SelectItem value="SECRETARIA">Secretaría</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2" id="juzgado-field">
              <Label>Juzgado (Super Admin no tiene juzgado)</Label>
              <Select name="juzgadoId" defaultValue={usuarioEditando?.juzgadoId || ''}>
                <SelectTrigger><SelectValue placeholder="Seleccionar juzgado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__sin_juzgado__">— Sin juzgado (Super Admin) —</SelectItem>
                  {juzgados.map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.codigo} - {j.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {usuarioEditando && (
              <div className="flex items-center gap-2">
                <input type="checkbox" name="activo" id="activo" defaultChecked={usuarioEditando.activo} className="rounded" />
                <Label htmlFor="activo" className="font-normal">Usuario activo</Label>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowNuevoUsuario(false); setUsuarioEditando(null); }}>Cancelar</Button>
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600">
                {usuarioEditando ? 'Guardar cambios' : 'Crear usuario'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Label component
function Label({ children, className, htmlFor }: { children: React.ReactNode; className?: string; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className={`text-sm font-medium text-gray-700 ${className}`}>{children}</label>
}
