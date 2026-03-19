import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { uploadFile } from '@/lib/storage'

// Configuración de carpetas permitidas
const CARPETAS_PERMITIDAS = [
  'DEMANDA',
  'ANEXOS',
  'ACTA_REPARTO',
  'INFORME_INGRESO_DESPACHO',
  'CONTESTACION',
  'MEMORIALES',
  'PODERES',
  'PRUEBAS',
  'ALEGATOS',
  'RECURSOS',
  'AUTOS',
  'SENTENCIAS',
  'OFICIOS',
  'NOTIFICACIONES',
  'CITACIONES',
  'CONSTANCIAS',
  'ESTADOS',
  'OTROS'
]

// Tamaño máximo de archivo: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024

// Tipos MIME permitidos
const TIPOS_PERMITIDOS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
]

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    const file = formData.get('file') as File | null
    const procesoId = formData.get('procesoId') as string
    const carpeta = formData.get('carpeta') as string
    const cuadernoId = formData.get('cuadernoId') as string | null
    const ordenStr = formData.get('orden') as string | null
    const descripcion = formData.get('descripcion') as string
    const subidoPorId = formData.get('subidoPorId') as string
    const archivoOriginalId = formData.get('archivoOriginalId') as string | null
    const etiquetasStr = formData.get('etiquetas') as string | null

    // Validaciones
    if (!file || !procesoId || !carpeta) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: file, procesoId, carpeta' },
        { status: 400 }
      )
    }

    if (!CARPETAS_PERMITIDAS.includes(carpeta)) {
      return NextResponse.json(
        { success: false, error: `Carpeta no permitida. Use: ${CARPETAS_PERMITIDAS.join(', ')}` },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `Archivo demasiado grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      )
    }

    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Tipo de archivo no permitido: ${file.type}` },
        { status: 400 }
      )
    }

    // Verificar proceso existe
    const proceso = await db.proceso.findUnique({
      where: { id: procesoId }
    })

    if (!proceso) {
      return NextResponse.json(
        { success: false, error: 'Proceso no encontrado' },
        { status: 404 }
      )
    }

    let subidoPorFinal = subidoPorId
    if (!subidoPorFinal) {
      const u = await db.usuario.findFirst({ where: { juzgadoId: proceso.juzgadoId }, select: { id: true } })
      subidoPorFinal = u?.id || (await db.usuario.findFirst({ select: { id: true } }))?.id
    }
    if (!subidoPorFinal) {
      return NextResponse.json({ success: false, error: 'No hay usuarios. Ejecute: npx tsx prisma/seed.ts' }, { status: 400 })
    }

    // Generar nombre único para el archivo
    const timestamp = Date.now()
    const extension = file.name.split('.').pop() || 'bin'
    const nombreArchivo = `${proceso.radicado}_${carpeta}_${timestamp}.${extension}`
    const storageKey = `${proceso.radicado}/${carpeta}/${nombreArchivo}`

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const storageResult = await uploadFile(storageKey, buffer, file.type)

    // Calcular versión
    let version = 1
    let archivoPadreId = null

    if (archivoOriginalId) {
      const original = await db.archivoProceso.findUnique({
        where: { id: archivoOriginalId }
      })
      if (original) {
        version = original.version + 1
        archivoPadreId = original.id
      }
    }

    // Parsear etiquetas
    const etiquetas = etiquetasStr ? JSON.parse(etiquetasStr) : null

    const orden = ordenStr ? parseInt(ordenStr, 10) : 0

    // Registrar en base de datos
    const archivo = await db.archivoProceso.create({
      data: {
        procesoId,
        cuadernoId: cuadernoId || null,
        carpeta,
        orden: isNaN(orden) ? 0 : orden,
        nombreOriginal: file.name,
        nombreArchivo,
        ...(storageResult.type === 'bucket' ? { bucketKey: storageResult.key } : {}),
        tipoMime: file.type,
        tamano: file.size,
        version,
        archivoPadreId,
        descripcion,
        subidoPorId: subidoPorFinal,
        etiquetas: etiquetas ? JSON.stringify(etiquetas) : null,
      },
      include: {
        subidoPor: {
          select: { nombre: true }
        }
      }
    })

    // Publicación automática (formato CPNU)
    const carpetasMemorial = ['MEMORIALES', 'DEMANDA', 'CONTESTACION', 'PODERES', 'PRUEBAS', 'ALEGATOS', 'RECURSOS'];
    const esMemorial = carpetasMemorial.includes(carpeta);

    await db.historialActuacion.create({
      data: {
        procesoId,
        usuarioId: subidoPorId || null,
        tipo: esMemorial ? 'MEMORIAL_RECIBIDO' : 'ARCHIVO',
        accion: esMemorial ? `Memorial recibido - ${file.name}` : `Archivo subido: ${file.name}`,
        descripcion: esMemorial
          ? `Documento incorporado a expediente. ${descripcion ? `Observación: ${descripcion}` : `Carpeta: ${carpeta}`}.`
          : `Carpeta: ${carpeta}, Tamaño: ${(file.size / 1024).toFixed(2)} KB`,
        datos: JSON.stringify({
          archivoId: archivo.id,
          nombreOriginal: file.name,
          carpeta,
          tamano: file.size,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      data: archivo,
      message: 'Archivo subido exitosamente'
    })

  } catch (error) {
    console.error('Error al subir archivo:', error)
    return NextResponse.json(
      { success: false, error: 'Error al subir archivo' },
      { status: 500 }
    )
  }
}
