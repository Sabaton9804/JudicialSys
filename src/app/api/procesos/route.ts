import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { jsonApiErrorConEntorno } from '@/lib/deploy-compat'
import { EstadoProceso, CategoriaProceso, ClaseProceso } from '@prisma/client'
import { getUserFromHeader, juzgadoWhere } from '@/lib/auth-utils'
import { generarRadicado, normalizarRadicado } from '@/lib/radicado'
import { generarInformeIngresoDespacho } from '@/lib/plantillas/generar-informe-ingreso-despacho'

// GET - Listar todos los procesos
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const jw = juzgadoWhere(user)

    const { searchParams } = new URL(request.url)
    const estado = searchParams.get('estado') as EstadoProceso | null
    const categoria = searchParams.get('categoria') as CategoriaProceso | null
    const clase = searchParams.get('clase') as ClaseProceso | null
    const busqueda = searchParams.get('busqueda')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: any = { ...jw }

    if (estado) {
      where.estado = estado
    }
    
    if (categoria) {
      where.categoriaProceso = categoria
    }
    
    if (clase) {
      where.claseProceso = clase
    }

    if (busqueda) {
      where.OR = [
        { radicado: { contains: busqueda } },
        { demandante: { contains: busqueda } },
        { demandado: { contains: busqueda } },
        { demanda: { contains: busqueda } },
      ]
    }

    const [procesos, total] = await Promise.all([
      db.proceso.findMany({
        where,
        include: {
          ubicacionSecretaria: { select: { id: true, nombre: true, codigo: true } },
          terminos: {
            where: { completado: false },
            orderBy: { fechaVencimiento: 'asc' },
            take: 3,
          },
          audiencias: {
            where: { estado: 'PROGRAMADA' },
            orderBy: { fecha: 'asc' },
            take: 1,
          },
          providencias: {
            orderBy: { fecha: 'desc' },
            take: 3,
            select: { id: true, estado: true, tipo: true },
          },
          _count: {
            select: {
              notificaciones: true,
              oficios: true,
              memoriales: true,
              providencias: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.proceso.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: procesos,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      }
    })
  } catch (error) {
    console.error('Error al obtener procesos:', error)
    const { body, status } = jsonApiErrorConEntorno(error, 'Error al obtener procesos')
    return NextResponse.json(body, { status })
  }
}

// POST - Crear nuevo proceso
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const user = await getUserFromHeader(request)
    let juzgadoFinal = body.juzgadoId || user?.juzgadoId
    if (!juzgadoFinal || juzgadoFinal === 'default-juzgado') {
      const primerJuzgado = await db.juzgado.findFirst()
      juzgadoFinal = primerJuzgado?.id
    }
    if (!juzgadoFinal) {
      return NextResponse.json({ success: false, error: 'Se requiere juzgadoId. Cree un juzgado en Administración.' }, { status: 400 })
    }

    const radicadoManual =
      body.radicado != null && String(body.radicado).trim() !== ''
        ? normalizarRadicado(String(body.radicado))
        : null
    if (body.radicado != null && String(body.radicado).trim() !== '' && !radicadoManual) {
      return NextResponse.json(
        { success: false, error: 'Radicado inválido: debe tener exactamente 23 dígitos numéricos (CUI sin guiones).' },
        { status: 400 }
      )
    }
    if (radicadoManual) {
      const ya = await db.proceso.findUnique({ where: { radicado: radicadoManual } })
      if (ya) {
        return NextResponse.json({ success: false, error: 'Ese radicado ya existe en el sistema.' }, { status: 409 })
      }
    }

    // Radicado: manual (p. ej. proceso ya radicado en línea) o auto-generado (12 dígitos despacho + año + consecutivo)
    const codigoBase = '110013103051' // Bogotá, Circuito 31, Civil 03, Despacho 051
    const juzgado = await db.juzgado.findUnique({ where: { id: juzgadoFinal } })
    const codigo12 = (juzgado?.codigoRadicacion12?.replace(/\D/g, '') || codigoBase).slice(0, 12)
    const anio = new Date().getFullYear()
    let radicadoFinal: string
    let instanciaProceso: 'PRIMERA_INSTANCIA' | 'SEGUNDA_INSTANCIA'
    if (radicadoManual) {
      radicadoFinal = radicadoManual
      instanciaProceso = radicadoManual.slice(21, 23) === '01' ? 'SEGUNDA_INSTANCIA' : 'PRIMERA_INSTANCIA'
    } else {
      const ultimo = await db.proceso.findFirst({
        where: { juzgadoId: juzgadoFinal, radicado: { startsWith: codigo12 + String(anio) } },
        orderBy: { radicado: 'desc' },
      })
      const consec = ultimo && ultimo.radicado.length >= 21 ? parseInt(ultimo.radicado.slice(16, 21), 10) + 1 : 1
      radicadoFinal = generarRadicado(codigo12, anio, consec)
      instanciaProceso = body.instancia === 'SEGUNDA_INSTANCIA' ? 'SEGUNDA_INSTANCIA' : 'PRIMERA_INSTANCIA'
    }

    const proceso = await db.proceso.create({
      data: {
        radicado: radicadoFinal,
        instancia: instanciaProceso,
        categoriaProceso: body.categoriaProceso || 'CIVIL',
        claseProceso: body.claseProceso,
        demanda: body.demanda,
        demandante: body.demandante,
        demandanteId: body.demandanteId,
        demandado: body.demandado,
        demandadoId: body.demandadoId,
        cuantia: body.cuantia,
        moneda: body.moneda || 'COP',
        fechaRadicacion: body.fechaRadicacion ? new Date(body.fechaRadicacion) : new Date(),
        fechaReparto: body.fechaReparto ? new Date(body.fechaReparto) : null,
        estado: body.estado || 'ACTIVO',
        etapaProcesal: body.etapaProcesal || 'Admisión',
        observaciones: body.observaciones,
        juzgadoId: juzgadoFinal,
        oficialMayorId: body.oficialMayorId || null,
        secretarioId: body.secretarioId,
        tipoProcesoEstadisticaId: body.tipoProcesoEstadisticaId || null,
      },
      include: {
        terminos: true,
      }
    })

    // Crear Cuaderno principal por defecto (ley: instancia + cuadernos)
    await db.cuaderno.create({
      data: { procesoId: proceso.id, nombre: 'Cuaderno principal', orden: 0 }
    })

    // Crear notificación del sistema
    await db.notificacionSistema.create({
      data: {
        tipo: 'NUEVO_PROCESO',
        titulo: 'Nuevo proceso radicado',
        mensaje: `Se ha radicado el proceso ${proceso.radicado} - ${proceso.demandante} vs ${proceso.demandado}`,
        procesoId: proceso.id,
      }
    })

    // Registrar en historial
    await db.historialActuacion.create({
      data: {
        procesoId: proceso.id,
        tipo: 'CREACION_PROCESO',
        accion: 'Proceso creado',
        descripcion: `Radicado: ${proceso.radicado}. Clase: ${proceso.claseProceso}`,
        datos: JSON.stringify({
          categoria: proceso.categoriaProceso,
          clase: proceso.claseProceso,
          demandante: proceso.demandante,
          demandado: proceso.demandado
        })
      }
    })

    if (user?.id) {
      try {
        const inf = await generarInformeIngresoDespacho({
          procesoId: proceso.id,
          subidoPorId: user.id,
          regenerar: false,
          origenProceso: 'Radicación JudicialSys',
        })
        if (!inf.ok && inf.codigo !== 'VALIDACION') {
          console.warn('[informe ingreso]', inf.mensaje)
        }
      } catch (e) {
        console.warn('[informe ingreso] excepción', e)
      }
    }

    return NextResponse.json({
      success: true,
      data: proceso,
      message: 'Proceso creado exitosamente'
    })
  } catch (error) {
    console.error('Error al crear proceso:', error)
    return NextResponse.json(
      { success: false, error: 'Error al crear proceso' },
      { status: 500 }
    )
  }
}
