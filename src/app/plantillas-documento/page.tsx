'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichEditorHtml } from '@/components/plantillas/rich-editor-html'
import { toast } from 'sonner'
import { Info, Loader2, ArrowLeft, Save, FileUp } from 'lucide-react'
import { useUserStore } from '@/stores/user-store'
import { apiFetch } from '@/lib/api-fetch'
import {
  METADATOS_TIPOS_PLANTILLA,
  htmlPlantillaPorDefecto,
  nombrePlantillaSugerido,
  type TipoPlantillaDocumento,
} from '@/lib/plantillas/tipos-plantilla-documento'
import { GRUPOS_VARIABLES_INFORME_INGRESO } from '@/lib/plantillas/variables-informe-ingreso-ux'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  return (text ? JSON.parse(text) : {}) as T
}

const VARIABLES_AYUDA = `Nombres permitidos (en el texto: {{nombre}} exactamente como aquí):

Datos del proceso:
  radicado, radicadoSoloDigitos, numeroProcesoCompleto, anioRadicacion,
  demandante, demandado, claseProceso, categoriaProceso, instancia, etapaProcesal,
  textoTipoProceso, fechaLarga, fechaCorta, fechaRadicacionIso,
  fechaIngresoDespacho, diasTranscurridos, medioIngreso, origenProceso,
  observacionesSecretaria, tipoDecision

Juzgado y secretaría:
  juzgadoNombre, juzgadoDireccion, juzgadoCiudad, juzgadoEmail, juzgadoTelefono,
  secretarioNombre, secretarioCargo, fechaGeneracion`

export default function PlantillasDocumentoPage() {
  const { user: simulatedUser } = useUserStore()
  const [loading, setLoading] = useState(true)
  const [lista, setLista] = useState<
    Array<{
      id: string
      nombre: string
      tipo: string
      version: number
      activa: boolean
      juzgadoId: string | null
      htmlContenido: string
      juzgado?: { nombre: string } | null
    }>
  >([])
  const [tipoPlantilla, setTipoPlantilla] = useState<TipoPlantillaDocumento>('INFORME_INGRESO_DESPACHO')
  const [nombre, setNombre] = useState(() => nombrePlantillaSugerido('INFORME_INGRESO_DESPACHO'))
  const [html, setHtml] = useState(() => htmlPlantillaPorDefecto('INFORME_INGRESO_DESPACHO'))
  const [guardando, setGuardando] = useState(false)
  const [importandoWord, setImportandoWord] = useState(false)
  const wordInputRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    if (!simulatedUser?.id) return
    setLoading(true)
    try {
      const res = await apiFetch(
        `/api/plantillas-documento?tipo=${encodeURIComponent(tipoPlantilla)}`,
        {},
        simulatedUser.id
      )
      const data = await parseJson<{ success?: boolean; data?: typeof lista }>(res)
      if (data.success && Array.isArray(data.data)) setLista(data.data)
    } catch {
      toast.error('No se pudieron cargar las plantillas')
    } finally {
      setLoading(false)
    }
  }, [simulatedUser?.id, tipoPlantilla])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const importarDesdeWord = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportandoWord(true)
    try {
      const { importarDocxAHtml } = await import('@/lib/plantillas/import-docx-a-html')
      const { html: siguiente, advertencias } = await importarDocxAHtml(file)
      setHtml(siguiente)
      toast.success('Word cargado en el editor', {
        description:
          'Si venía datos de un caso de ejemplo, bórrelos y use el menú verde «Elegir dato a insertar» para colocar radicado, partes, fechas, etc.',
      })
      if (advertencias.length > 0) {
        toast.warning('Avisos al convertir', {
          description: advertencias.slice(0, 5).join(' · '),
        })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo importar el archivo')
    } finally {
      setImportandoWord(false)
    }
  }

  const guardarNueva = async () => {
    if (!simulatedUser?.id) {
      toast.error('Seleccione usuario (Actuar como)')
      return
    }
    setGuardando(true)
    try {
      const res = await apiFetch(
        '/api/plantillas-documento',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: tipoPlantilla,
            nombre: nombre.trim(),
            htmlContenido: html,
            activa: true,
          }),
        },
        simulatedUser.id
      )
      const data = await parseJson<{ success?: boolean; error?: string }>(res)
      if (!data.success) {
        toast.error(data.error || 'Error al guardar')
        return
      }
      toast.success('Plantilla creada')
      void cargar()
    } catch {
      toast.error('Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const metaTipo = METADATOS_TIPOS_PLANTILLA.find((m) => m.tipo === tipoPlantilla)

  if (!simulatedUser?.id) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 max-w-lg mx-auto space-y-4">
        <h1 className="text-lg font-semibold text-gray-900">Plantillas de documentos</h1>
        <p className="text-gray-700 text-sm">
          En la página principal, elija <strong>«Actuar como»</strong> (arriba a la derecha) para identificar su usuario.
        </p>
        <Button asChild variant="outline">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Inicio
            </Link>
          </Button>
          <h1 className="text-xl font-semibold text-gray-900">Plantillas de documentos</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{metaTipo?.titulo ?? 'Plantilla de documento'}</CardTitle>
            <CardDescription>
              Elija el tipo de documento abajo. Use el menú verde <strong>«Elegir dato a insertar»</strong> para radicado,
              partes y fechas. La plantilla de su juzgado tiene prioridad; si no hay, la global; si no, el modelo inicial
              de ese tipo.
              {tipoPlantilla === 'INFORME_INGRESO_DESPACHO' ? (
                <>
                  {' '}
                  El <strong>informe de ingreso</strong> también puede generarse solo al crear o actualizar el expediente.
                </>
              ) : (
                <>
                  {' '}
                  La generación automática al ingresar el expediente aplica por ahora solo al informe de ingreso; las demás
                  plantillas quedan guardadas para copiar, imprimir o integraciones futuras.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pl-tipo">Tipo de documento</Label>
              <Select
                value={tipoPlantilla}
                onValueChange={(v) => {
                  const t = v as TipoPlantillaDocumento
                  setTipoPlantilla(t)
                  setHtml(htmlPlantillaPorDefecto(t))
                  setNombre(nombrePlantillaSugerido(t))
                }}
              >
                <SelectTrigger id="pl-tipo" className="w-full max-w-lg bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METADATOS_TIPOS_PLANTILLA.map((m) => (
                    <SelectItem key={m.tipo} value={m.tipo}>
                      {m.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {metaTipo ? (
                <p className="text-xs text-slate-600 max-w-2xl">{metaTipo.descripcion}</p>
              ) : null}
            </div>
            <Alert className="border-sky-200 bg-sky-50/80 text-slate-800">
              <Info className="text-sky-700" />
              <AlertTitle className="text-slate-900 whitespace-normal !line-clamp-none min-h-0 leading-snug">
                Sin códigos técnicos
              </AlertTitle>
              <AlertDescription className="text-slate-700 space-y-2">
                <p>
                  No tiene que memorizar nada raro. Haga clic donde va el dato en el texto (o borre un ejemplo que vino de
                  Word) y pulse <strong>Elegir dato a insertar</strong>: elija «Número de radicación», «Demandante», «Fecha
                  en letras», etc.
                  {tipoPlantilla === 'INFORME_INGRESO_DESPACHO'
                    ? ' Al generar el informe desde el expediente, el sistema pondrá el valor correcto de ese caso.'
                    : ' Esos datos se rellenarán cuando exista generación desde el expediente para este tipo de documento.'}
                </p>
                <p>
                  Si trae un Word con datos de otro proceso, bórrelos y vuelva a insertar los datos con ese menú.
                </p>
              </AlertDescription>
            </Alert>
            <details className="rounded-md border border-slate-200 bg-slate-50/80 text-sm">
              <summary className="cursor-pointer select-none px-3 py-2 font-medium text-slate-700">
                Referencia avanzada (nombres internos)
              </summary>
              <pre className="text-[11px] leading-relaxed border-t border-slate-200 p-3 overflow-x-auto whitespace-pre-wrap text-slate-600">
                {VARIABLES_AYUDA}
              </pre>
            </details>
            {loading ? (
              <div className="flex items-center gap-2 text-gray-600">
                <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
              </div>
            ) : (
              <ul className="text-sm space-y-2 border rounded-md p-3 bg-white">
                {lista.length === 0 ? (
                  <li className="text-gray-500">
                    No hay plantillas guardadas de este tipo. Puede crear una abajo o cambiar de tipo en el selector.
                  </li>
                ) : (
                  lista.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-baseline gap-2 border-b border-gray-100 pb-2 last:border-0">
                      <span className="font-medium">{p.nombre}</span>
                      <span className="text-gray-500 text-xs">v{p.version}</span>
                      <span className="text-xs text-gray-400">{p.juzgadoId ? p.juzgado?.nombre || 'Juzgado' : 'Global'}</span>
                      <span className="text-[10px] uppercase text-slate-400">{p.tipo.replace(/_/g, ' ')}</span>
                      {!p.activa && <span className="text-amber-600 text-xs">(inactiva)</span>}
                    </li>
                  ))
                )}
              </ul>
            )}
            <div className="space-y-2">
              <Label htmlFor="pl-nombre">Nombre de la nueva plantilla</Label>
              <Input
                id="pl-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Informe ingreso J51 Civil"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pl-html-editor">Contenido del documento</Label>
              <p className="text-xs text-slate-500">
                Debajo de la barra de formato verá la franja verde: ahí inserta los datos del expediente sin escribir
                códigos. El PDF final usa página A4.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={wordInputRef}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(ev) => void importarDesdeWord(ev)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={importandoWord}
                  onClick={() => wordInputRef.current?.click()}
                >
                  {importandoWord ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileUp className="w-4 h-4 mr-2" />
                  )}
                  Importar desde Word (.docx)
                </Button>
                <span className="text-xs text-slate-500">
                  Sustituye el contenido del editor. Logos y escudos se ajustan automáticamente (Word suele dejarlos muy
                  grandes o a un lado). Solo .docx (no .doc antiguo).
                </span>
              </div>
              <RichEditorHtml
                key={tipoPlantilla}
                id="pl-html-editor"
                value={html}
                onChange={setHtml}
                variableInsercionGrupos={GRUPOS_VARIABLES_INFORME_INGRESO}
              />
            </div>
            <Button type="button" onClick={() => void guardarNueva()} disabled={guardando}>
              {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar como nueva plantilla
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
