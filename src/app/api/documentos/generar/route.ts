import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { TipoDocumento } from '@prisma/client'

// Función para formatear fechas
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  try {
    const d = new Date(date)
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

// Función para reemplazar variables en la plantilla
function remplazarVariables(contenido: string, variables: Record<string, any>): string {
  let resultado = contenido
  
  // Reemplazar variables simples {{variable}}
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    resultado = resultado.replace(regex, String(value ?? ''))
  }
  
  // Formatear fechas {{fecha:variable}}
  resultado = resultado.replace(/\{\{fecha:(\w+)\}\}/g, (_, key) => {
    const value = variables[key]
    return formatDate(value)
  })
  
  return resultado
}

// POST - Generar documento
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { procesoId, plantillaId, tipo, variables, nombre } = body

    // Obtener el proceso
    const proceso = await db.proceso.findUnique({
      where: { id: procesoId }
    })

    if (!proceso) {
      return NextResponse.json(
        { success: false, error: 'Proceso no encontrado' },
        { status: 404 }
      )
    }

    // Obtener la plantilla
    let plantilla = null
    if (plantillaId) {
      plantilla = await db.plantilla.findUnique({
        where: { id: plantillaId }
      })
    } else if (tipo) {
      plantilla = await db.plantilla.findFirst({
        where: { tipo: tipo as TipoDocumento, activa: true }
      })
    }

    if (!plantilla) {
      return NextResponse.json(
        { success: false, error: 'Plantilla no encontrada' },
        { status: 404 }
      )
    }

    // Preparar variables automáticas
    const variablesAutomaticas = {
      radicado: proceso.radicado,
      demandante: proceso.demandante,
      demandado: proceso.demandado,
      claseProceso: proceso.claseProceso,
      cuantia: proceso.cuantia?.toLocaleString('es-CO') || '',
      fechaRadicacion: proceso.fechaRadicacion,
      fechaActual: new Date(),
      juzgado: 'Juzgado Civil del Circuito de Bogotá D.C.',
      ciudad: 'Bogotá D.C.',
      ...variables,
    }

    // Generar contenido
    const contenidoGenerado = remplazarVariables(plantilla.contenido, variablesAutomaticas)

    // Crear documento
    const documento = await db.documento.create({
      data: {
        procesoId,
        plantillaId: plantilla.id,
        tipo: plantilla.tipo,
        nombre: nombre || `${plantilla.nombre} - ${proceso.radicado}`,
        contenido: contenidoGenerado,
        generado: true,
        fechaGeneracion: new Date(),
      },
      include: {
        proceso: {
          select: { radicado: true }
        },
        plantilla: {
          select: { nombre: true }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        ...documento,
        contenido: contenidoGenerado,
      },
      message: 'Documento generado exitosamente'
    })
  } catch (error) {
    console.error('Error al generar documento:', error)
    return NextResponse.json(
      { success: false, error: 'Error al generar documento' },
      { status: 500 }
    )
  }
}
