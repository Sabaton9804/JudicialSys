'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Download, FileJson, Layers, Mail } from 'lucide-react'

const ARCHIVO = 'RV_Generacion_Tutela_en_linea_No_202600358.eml'
const ZIP_ADJUNTO = 'tutela_tramite_202600358.zip'
const RUTA_EML = `/ejemplos/${ARCHIVO}`
const RUTA_ZIP = `/ejemplos/${ZIP_ADJUNTO}`

export default function EjemploTutelaEmlPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/80 to-slate-50">
      <header className="bg-white/90 border-b border-emerald-100 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold text-emerald-950 flex items-center gap-2">
            <Mail className="w-5 h-5 text-emerald-600 shrink-0" />
            Ejemplo completo: correo + secuencia + demanda + pruebas
          </h1>
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver al gestor
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <Card className="border-emerald-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-600" />
              Qué trae este .eml
            </CardTitle>
            <CardDescription>
              No es solo el cuerpo HTML: el mensaje lleva un <strong>ZIP adjunto</strong> como en un trámite de tutela en
              línea. Al <strong>importar el .eml</strong> en JudicialSys obtiene:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside text-sm text-slate-700 space-y-2">
              <li>
                <strong>Correo:</strong> constancia en PDF generada desde el mensaje (
                <code className="text-xs bg-slate-100 px-1 rounded">CorreoReparto.pdf</code> o similar).
              </li>
              <li>
                <strong>Secuencia:</strong> archivo de texto{' '}
                <code className="text-xs bg-slate-100 px-1 rounded">00_SECUENCIA_TUTELA.txt</code> dentro del ZIP (orden
                sugerido).
              </li>
              <li>
                <strong>Demanda:</strong>{' '}
                <code className="text-xs bg-slate-100 px-1 rounded">DEMANDA_demanda_ejemplo_202600358.pdf</code>
              </li>
              <li>
                <strong>Pruebas / anexos:</strong>{' '}
                <code className="text-xs bg-slate-100 px-1 rounded">PRUEBA_listado_anexos_ejemplo_202600358.pdf</code>
              </li>
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              En producción, el ZIP suele bajarse por un enlace <code className="bg-slate-100 px-1">https://…ramajudicial.gov.co</code>; en
              este ejemplo va <strong>adjunto al correo</strong> para que todo entre en la importación sin depender de la red.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Descargas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                <a href={RUTA_EML} download={ARCHIVO}>
                  <Download className="w-4 h-4 mr-2" />
                  Descargar .eml
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={RUTA_ZIP} download={ZIP_ADJUNTO}>
                  <Download className="w-4 h-4 mr-2" />
                  Solo el ZIP adjunto
                </a>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={RUTA_EML} target="_blank" rel="noopener noreferrer">
                  <FileJson className="w-4 h-4 mr-1" />
                  Ver .eml
                </a>
              </Button>
            </div>
            <p className="text-sm text-slate-600">
              Regenerar archivos desde el código:{' '}
              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">npx tsx scripts/generar-ejemplo-tutela-eml.ts</code>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cómo importarlo</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
              <li>Página principal → <strong>Crear expediente</strong> → pestaña tutela / importar .eml.</li>
              <li>Seleccione el archivo descargado y envíe: se crea el expediente con todos los documentos anteriores.</li>
              <li>O use <strong>Paquete ZIP</strong> desde el mismo .eml para un ZIP ordenado sin tocar la base de datos.</li>
            </ol>
            <p className="mt-4 text-sm text-slate-500">
              <Link href="/guia" className="text-emerald-700 hover:underline">Guía de navegación</Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
