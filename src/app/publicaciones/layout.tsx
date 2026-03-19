import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Consulta de procesos',
  description:
    'Consulta pública por radicado: providencias notificadas, notificaciones, oficios y traslados. Sin sesión.',
}

/** Misma base visual que el gestor (slate / cyan) — hereda fuentes del layout raíz. */
export default function ConsultaProcesosLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-50 text-slate-900">{children}</div>
}
