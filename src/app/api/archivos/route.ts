import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - Listar archivos del proceso
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const procesoId = searchParams.get('procesoId')
    const carpeta = searchParams.get('carpeta')
    const eliminado = searchParams.get('eliminado')

    if (!procesoId) {
      return NextResponse.json(
        { success: false, error: 'procesoId es requerido' },
        { status: 400 }
      )
    }

    const where: any = { procesoId }
    if (carpeta) where.carpeta = carpeta
    if (eliminado !== null) where.eliminado = eliminado === 'true'
    else where.eliminado = false // Por defecto no mostrar eliminados

    const archivos = await db.archivoProceso.findMany({
      where,
      include: {
        subidoPor: {
          select: { id: true, nombre: true }
        },
        versiones: {
          where: { eliminado: false },
          orderBy: { version: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Estructura de carpetas (radicación + expediente)
    const carpetasDisponibles = [
      { id: 'DEMANDA', nombre: 'Demanda', icono: 'file-text' },
      { id: 'ANEXOS', nombre: 'Anexos', icono: 'paperclip' },
      { id: 'ACTA_REPARTO', nombre: 'Acta de Reparto', icono: 'file-check' },
      { id: 'INFORME_INGRESO_DESPACHO', nombre: 'Informe de Ingreso al Despacho', icono: 'file-input' },
      { id: 'CONTESTACION', nombre: 'Contestación', icono: 'file-text' },
      { id: 'MEMORIALES', nombre: 'Memoriales', icono: 'file-signature' },
      { id: 'PODERES', nombre: 'Poderes', icono: 'file' },
      { id: 'PRUEBAS', nombre: 'Pruebas', icono: 'folder-open' },
      { id: 'ALEGATOS', nombre: 'Alegatos', icono: 'file' },
      { id: 'RECURSOS', nombre: 'Recursos', icono: 'file' },
      { id: 'AUTOS', nombre: 'Autos', icono: 'file' },
      { id: 'SENTENCIAS', nombre: 'Sentencias', icono: 'gavel' },
      { id: 'OFICIOS', nombre: 'Oficios', icono: 'mail' },
      { id: 'OTROS', nombre: 'Otros Documentos', icono: 'folder' },
    ]

    // Agrupar por carpeta
    const archivosPorCarpeta = carpetasDisponibles.map(carpeta => ({
      ...carpeta,
      archivos: archivos.filter(a => a.carpeta === carpeta.id),
      total: archivos.filter(a => a.carpeta === carpeta.id).length
    }))

    // Estadísticas
    const stats = {
      totalArchivos: archivos.length,
      tamanoTotal: archivos.reduce((sum, a) => sum + a.tamano, 0),
      porCarpeta: archivosPorCarpeta.map(c => ({
        carpeta: c.id,
        nombre: c.nombre,
        total: c.total
      }))
    }

    return NextResponse.json({
      success: true,
      data: archivos,
      archivosPorCarpeta,
      carpetasDisponibles,
      stats
    })
  } catch (error) {
    console.error('Error al obtener archivos:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener archivos' },
      { status: 500 }
    )
  }
}

// POST - Registrar archivo subido
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Verificar si es una nueva versión
    let version = 1
    let archivoPadreId = null

    if (body.archivoOriginalId) {
      const original = await db.archivoProceso.findUnique({
        where: { id: body.archivoOriginalId }
      })
      if (original) {
        version = original.version + 1
        archivoPadreId = original.id
      }
    }

    const archivo = await db.archivoProceso.create({
      data: {
        procesoId: body.procesoId,
        carpeta: body.carpeta,
        nombreOriginal: body.nombreOriginal,
        nombreArchivo: body.nombreArchivo,
        tipoMime: body.tipoMime,
        tamano: body.tamano,
        version,
        archivoPadreId,
        descripcion: body.descripcion,
        subidoPorId: body.subidoPorId,
        etiquetas: body.etiquetas ? JSON.stringify(body.etiquetas) : null,
      },
      include: {
        subidoPor: {
          select: { nombre: true }
        }
      }
    })

    // Registrar en historial
    await db.historialActuacion.create({
      data: {
        procesoId: body.procesoId,
        usuarioId: body.subidoPorId,
        tipo: 'ARCHIVO',
        accion: `Archivo subido: ${body.nombreOriginal}`,
        descripcion: `Subido a carpeta: ${body.carpeta}`,
        datos: JSON.stringify(archivo),
      }
    })

    return NextResponse.json({
      success: true,
      data: archivo,
      message: 'Archivo registrado exitosamente'
    })
  } catch (error) {
    console.error('Error al registrar archivo:', error)
    return NextResponse.json(
      { success: false, error: 'Error al registrar archivo' },
      { status: 500 }
    )
  }
}
