'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, BookOpen, Home } from 'lucide-react'

export default function GuiaPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-slate-600" />
            Guía de navegación
          </h1>
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver al gestor
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>¿Dónde está cada cosa?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <Home className="w-4 h-4" />
                1. Barra lateral izquierda (menú)
              </h3>
              <p className="text-slate-600 text-sm mb-2">Es la columna a la izquierda con los íconos. Si está colapsada, haz clic en el ícono de menú abajo para expandirla.</p>
              <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                <li><strong>Tutelas</strong> — Acciones de tutela</li>
                <li><strong>Dashboard / Expedientes</strong> — Vista principal</li>
                <li><strong>Mi agenda</strong> — Solo Despacho</li>
                <li><strong>Procesos</strong> — Todos los procesos</li>
                <li><strong>Tareas</strong> — Proyectar auto, notificar, etc.</li>
                <li><strong>Publicar en Estado</strong> — Solo Secretaría</li>
                <li><strong>Memoriales, Oficios, Términos, Audiencias</strong> — Secretaría</li>
                <li><strong>Consulta de procesos</strong> — Consulta pública sin sesión (enlace en cyan)</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800 mb-2">2. Barra superior (header)</h3>
              <p className="text-slate-600 text-sm mb-2">Arriba del contenido: badge DESPACHO/SECRETARÍA, título, botón Consulta de procesos, Crear expediente, buscador, campana, selector de usuario.</p>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800 mb-2">3. Cambiar de área</h3>
              <p className="text-slate-600 text-sm">En la barra lateral, arriba, hay botones: <strong>Despacho</strong>, <strong>Secretaría</strong>, <strong>Administración</strong>. Elige uno. Luego en el selector de usuario (arriba a la derecha) elige un usuario de ese área.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accesos rápidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Quiero…</th>
                    <th className="text-left py-2 font-medium">Dónde ir</th>
                  </tr>
                </thead>
                <tbody className="text-slate-600">
                  <tr className="border-b"><td className="py-2">Proyectar un auto en Word</td><td className="py-2">Despacho → Tareas → <strong>Proyectar</strong> en la fila, o Dashboard → Acciones Rápidas → Nueva Providencia</td></tr>
                  <tr className="border-b"><td className="py-2">Revisar providencia (Dra)</td><td className="py-2">Despacho → Dashboard (card &quot;Providencias para revisar&quot;)</td></tr>
                  <tr className="border-b"><td className="py-2">Firmar providencia (Juez)</td><td className="py-2">Despacho → Dashboard (card &quot;Expedientes que requieren tu firma&quot;)</td></tr>
                  <tr className="border-b"><td className="py-2">Publicar en estado</td><td className="py-2">Secretaría → <strong>Publicar en Estado</strong> en el menú</td></tr>
                  <tr className="border-b"><td className="py-2">Consulta de procesos</td><td className="py-2">Menú lateral → <strong>Consulta de procesos</strong> (enlace cyan al final)</td></tr>
                  <tr className="border-b"><td className="py-2">Crear oficio, término, audiencia</td><td className="py-2">Secretaría → Oficios/Términos/Audiencias → botón <strong>Nuevo</strong></td></tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rutas directas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><Link href="/" className="text-blue-600 hover:underline">/</Link> — Gestor (página principal)</p>
            <p><Link href="/publicaciones" className="text-blue-600 hover:underline">/publicaciones</Link> — Consulta de procesos (sin sesión)</p>
            <p>
              <Link href="/ejemplos/tutela-eml" className="text-blue-600 hover:underline">/ejemplos/tutela-eml</Link> —{' '}
              Ejemplo <code className="bg-slate-100 px-1 rounded text-xs">RV_Generacion_Tutela_en_linea_No_202600358.eml</code> (descarga e instrucciones)
            </p>
          </CardContent>
        </Card>

        <p className="text-sm text-slate-500">Si algo no aparece, ejecute <code className="bg-slate-100 px-1 rounded">npx prisma db seed</code> para cargar datos de prueba.</p>
      </main>
    </div>
  )
}
