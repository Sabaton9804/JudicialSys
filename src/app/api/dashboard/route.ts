import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { jsonApiErrorConEntorno } from '@/lib/deploy-compat'
import { getUserFromHeader, juzgadoWhere, procesoJuzgadoWhere } from '@/lib/auth-utils'

// GET - Estadísticas del dashboard separadas por área
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const jw = juzgadoWhere(user)
    const pjw = procesoJuzgadoWhere(user)

    const now = new Date()
    const hoyInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const hoyFin = new Date(hoyInicio.getTime() + 24 * 60 * 60 * 1000)
    const tresDias = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const semanaFin = new Date(hoyInicio.getTime() + 7 * 24 * 60 * 60 * 1000)

    // ==================== ESTADÍSTICAS GENERALES ====================
    const [
      totalProcesos,
      procesosActivos,
      procesosCiviles,
      procesosConstitucionales,
      procesosTutelas,
      alertasNoLeidas,
    ] = await Promise.all([
      db.proceso.count({ where: jw }),
      db.proceso.count({ where: { ...jw, estado: 'ACTIVO' } }),
      db.proceso.count({ where: { ...jw, categoriaProceso: 'CIVIL' } }),
      db.proceso.count({ where: { ...jw, categoriaProceso: 'CONSTITUCIONAL' } }),
      db.proceso.count({ where: { ...jw, claseProceso: 'TUTELA', estado: 'ACTIVO' } }),
      db.notificacionSistema.count({ where: { leida: false } }),
    ])

    // ==================== ESTADÍSTICAS DE DESPACHO ====================
    const [
      providenciasPendientesFirma,
      providenciasProyectadas,
      autosProferidos,
      sentenciasProferidas,
      tareasDespachoPendientes,
    ] = await Promise.all([
      db.providencia.count({ where: { ...pjw, estado: 'PENDIENTE_FIRMA' } }),
      db.providencia.count({ where: { ...pjw, estado: 'PROYECTADO' } }),
      db.providencia.count({ where: { ...pjw, tipo: 'AUTO', estado: 'FIRMADO' } }),
      db.providencia.count({ where: { ...pjw, tipo: 'SENTENCIA', estado: 'FIRMADO' } }),
      db.tarea.count({ where: { ...pjw, area: 'DESPACHO', estado: 'PENDIENTE' } }),
    ])

    // Providencias pendientes de firma (para el Juez)
    const providenciasParaFirma = await db.providencia.findMany({
      where: { ...pjw, estado: 'PENDIENTE_FIRMA' },
      include: {
        proceso: { select: { id: true, radicado: true, demandante: true, demandado: true } },
        proyectadoPor: { select: { nombre: true } }
      },
      orderBy: { fechaProyeccion: 'asc' },
      take: 10,
    })

    // Procesos que requieren acción del Despacho (con providencia para firmar) - expedientes
    const procesosParaFirmaDespacho = await db.proceso.findMany({
      where: {
        ...jw,
        providencias: { some: { estado: 'PENDIENTE_FIRMA' } }
      },
      include: {
        oficialMayor: { select: { id: true, nombre: true, rol: true } },
        secretario: { select: { id: true, nombre: true } },
        providencias: {
          where: { estado: 'PENDIENTE_FIRMA' },
          include: { proyectadoPor: { select: { nombre: true } } },
          orderBy: { fechaProyeccion: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    })

    // Providencias proyectadas - para que la Dra/revisor las revise y apruebe para firma
    const providenciasParaRevisar = await db.providencia.findMany({
      where: { ...pjw, estado: { in: ['PROYECTADO', 'EN_REVISION'] } },
      include: {
        proceso: { select: { id: true, radicado: true, demandante: true, demandado: true } },
        proyectadoPor: { select: { nombre: true } },
      },
      orderBy: { fechaProyeccion: 'asc' },
      take: 15,
    })

    // Providencias en corrección (devueltas por la Dra para que el sustanciador corrija)
    const providenciasCorreccion = await db.providencia.findMany({
      where: { ...pjw, estado: 'CORRECCION' },
      include: {
        proceso: { select: { radicado: true, demandante: true, demandado: true } },
        proyectadoPor: { select: { nombre: true } }
      },
      orderBy: { fechaProyeccion: 'asc' },
      take: 10,
    })

    // ==================== ESTADÍSTICAS DE SECRETARÍA ====================
    const [
      terminosVencidos,
      terminosPorVencer,
      terminosVigentes,
      notificacionesPendientes,
      notificacionesEnProceso,
      oficiosPendientes,
      oficiosSinRespuesta,
      memorialesPendientes,
      tareasSecretariaPendientes,
      audienciasHoy,
      audienciasSemana,
    ] = await Promise.all([
      db.termino.count({ where: { ...pjw, completado: false, fechaVencimiento: { lt: now } } }),
      db.termino.count({ where: { ...pjw, completado: false, fechaVencimiento: { gte: now, lte: tresDias } } }),
      db.termino.count({ where: { ...pjw, completado: false, fechaVencimiento: { gt: tresDias } } }),
      db.notificacion.count({ where: { ...pjw, estado: 'PENDIENTE' } }),
      db.notificacion.count({ where: { ...pjw, estado: 'EN_PROCESO' } }),
      db.oficio.count({ where: { ...pjw, estado: 'PENDIENTE' } }),
      db.oficio.count({ where: { ...pjw, estado: 'SIN_RESPUESTA' } }),
      db.memorial.count({ where: { ...pjw, estado: 'RADICADO' } }),
      db.tarea.count({ where: { ...pjw, area: 'SECRETARIA', estado: 'PENDIENTE' } }),
      db.audiencia.count({ where: { ...jw, estado: 'PROGRAMADA', fecha: { gte: hoyInicio, lt: hoyFin } } }),
      db.audiencia.count({ where: { ...jw, estado: 'PROGRAMADA', fecha: { gte: hoyInicio, lt: semanaFin } } }),
    ])

    // Términos críticos
    const terminosCriticos = await db.termino.findMany({
      where: {
        ...pjw,
        completado: false,
        fechaVencimiento: { lte: tresDias }
      },
      include: {
        proceso: {
          select: { radicado: true, demandante: true, demandado: true, categoriaProceso: true, claseProceso: true }
        }
      },
      orderBy: { fechaVencimiento: 'asc' },
      take: 10,
    })

    // Próximas audiencias
    const proximasAudiencias = await db.audiencia.findMany({
      where: {
        ...jw,
        estado: 'PROGRAMADA',
        fecha: { gte: now }
      },
      include: {
        proceso: {
          select: { radicado: true, demandante: true, demandado: true, categoriaProceso: true }
        }
      },
      orderBy: { fecha: 'asc' },
      take: 5,
    })

    // Procesos que requieren acción de Secretaría (con providencia para publicar) - expedientes
    const procesosParaPublicarSecretaria = await db.proceso.findMany({
      where: {
        ...jw,
        providencias: { some: { estado: 'FIRMADO' } }
      },
      include: {
        providencias: {
          where: { estado: 'FIRMADO' },
          include: { firmadoPor: { select: { nombre: true } } },
          orderBy: { fechaFirma: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    })

    // Providencias firmadas pendientes de publicar en estado (Secretaría)
    const [providenciasParaPublicarCount, providenciasParaPublicarLista] = await Promise.all([
      db.providencia.count({ where: { ...pjw, estado: 'FIRMADO' } }),
      db.providencia.findMany({
        where: { ...pjw, estado: 'FIRMADO' },
        include: {
          proceso: { select: { radicado: true, demandante: true, demandado: true } },
          firmadoPor: { select: { nombre: true } }
        },
        orderBy: { fechaFirma: 'asc' },
        take: 10,
      })
    ])

    // Memoriales pendientes de traslado
    const memorialesPendientesLista = await db.memorial.findMany({
      where: { ...pjw, estado: 'RADICADO' },
      include: {
        proceso: { select: { radicado: true, demandante: true, demandado: true } },
        recibidoPor: { select: { nombre: true } }
      },
      orderBy: { fechaPresentacion: 'desc' },
      take: 10,
    })

    // Oficios pendientes
    const oficiosPendientesLista = await db.oficio.findMany({
      where: { ...pjw, estado: { in: ['PENDIENTE', 'SIN_RESPUESTA'] } },
      include: {
        proceso: { select: { radicado: true, demandante: true, demandado: true } }
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    })

    // Alertas recientes
    const alertasRecientes = await db.notificacionSistema.findMany({
      where: { leida: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    // Procesos por tipo estadística (oficial) - separados CIVIL y TUTELA
    const procesosConTipoEst = await db.proceso.findMany({
      where: { ...jw, estado: 'ACTIVO', tipoProcesoEstadisticaId: { not: null } },
      select: { tipoProcesoEstadistica: { select: { nombre: true, categoriaProceso: true } } }
    })
    const procesosPorTipoCivil: Array<{ clase: string; cantidad: number }> = []
    const procesosPorTipoTutela: Array<{ clase: string; cantidad: number }> = []
    const mapCivil: Record<string, number> = {}
    const mapTutela: Record<string, number> = {}
    for (const p of procesosConTipoEst) {
      const nombre = p.tipoProcesoEstadistica?.nombre ?? 'Sin tipo'
      const cat = p.tipoProcesoEstadistica?.categoriaProceso
      if (cat === 'CONSTITUCIONAL') {
        mapTutela[nombre] = (mapTutela[nombre] ?? 0) + 1
      } else {
        mapCivil[nombre] = (mapCivil[nombre] ?? 0) + 1
      }
    }
    procesosPorTipoCivil.push(...Object.entries(mapCivil).map(([clase, cantidad]) => ({ clase, cantidad })).sort((a, b) => b.cantidad - a.cantidad))
    procesosPorTipoTutela.push(...Object.entries(mapTutela).map(([clase, cantidad]) => ({ clase, cantidad })).sort((a, b) => b.cantidad - a.cantidad))
    const procesosPorClase = await db.proceso.groupBy({
      by: ['claseProceso'],
      _count: { id: true },
      where: { ...jw, estado: 'ACTIVO' }
    })

    // ==================== TUTELAS (prioridad máxima - Art. 86 CP, 10 días) ====================
    const tutelasActivas = await db.proceso.findMany({
      where: { ...jw, claseProceso: 'TUTELA', estado: 'ACTIVO' },
      include: {
        terminos: {
          where: { completado: false },
          orderBy: { fechaVencimiento: 'asc' },
          take: 1,
        },
        oficialMayor: { select: { nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    const tutelasConDias = tutelasActivas.map((p) => {
      const term = p.terminos?.[0]
      const limite = term?.fechaVencimiento ?? p.fechaLimiteDespacho
      const diasRestantes = limite
        ? Math.ceil((new Date(limite).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null
      return {
        id: p.id,
        radicado: p.radicado,
        demandante: p.demandante,
        demandado: p.demandado,
        demanda: p.demanda,
        oficialMayor: p.oficialMayor?.nombre,
        diasRestantes,
        fechaLimite: limite,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        // ==================== RESUMEN GENERAL ====================
        resumen: {
          procesos: {
            total: totalProcesos,
            activos: procesosActivos,
            civiles: procesosCiviles,
            constitucionales: procesosConstitucionales,
            tutelas: procesosTutelas,
          },
          tutelasActivas: tutelasConDias,
          alertas: alertasNoLeidas,
          procesosPorTipoCivil: procesosPorTipoCivil.length > 0 ? procesosPorTipoCivil : procesosPorClase.filter(p => p.claseProceso !== 'TUTELA').map(p => ({ clase: p.claseProceso, cantidad: p._count.id })),
          procesosPorTipoTutela: procesosPorTipoTutela.length > 0 ? procesosPorTipoTutela : procesosPorClase.filter(p => p.claseProceso === 'TUTELA').map(p => ({ clase: p.claseProceso, cantidad: p._count.id })),
        },

        // ==================== DESPACHO ====================
        despacho: {
          providencias: {
            pendientesFirma: providenciasPendientesFirma,
            proyectadas: providenciasProyectadas,
            autosProferidos: autosProferidos,
            sentenciasProferidas: sentenciasProferidas,
          },
          tareasPendientes: tareasDespachoPendientes,
          paraRevisar: providenciasParaRevisar,
          paraFirma: providenciasParaFirma,
          enCorreccion: providenciasCorreccion,
          procesosParaFirma: procesosParaFirmaDespacho,
        },

        // ==================== SECRETARÍA ====================
        secretaria: {
          procesosParaPublicar: procesosParaPublicarSecretaria,
          providenciasParaPublicar: {
            count: providenciasParaPublicarCount,
            lista: providenciasParaPublicarLista,
          },
          terminos: {
            vigentes: terminosVigentes,
            porVencer: terminosPorVencer,
            vencidos: terminosVencidos,
            total: terminosVigentes + terminosPorVencer + terminosVencidos,
          },
          notificaciones: {
            pendientes: notificacionesPendientes,
            enProceso: notificacionesEnProceso,
          },
          oficios: {
            pendientes: oficiosPendientes,
            sinRespuesta: oficiosSinRespuesta,
            lista: oficiosPendientesLista,
          },
          memoriales: {
            pendientes: memorialesPendientes,
            lista: memorialesPendientesLista,
          },
          audiencias: {
            hoy: audienciasHoy,
            semana: audienciasSemana,
            proximas: proximasAudiencias,
          },
          tareasPendientes: tareasSecretariaPendientes,
        },

        // ==================== ALERTAS Y CRÍTICOS ====================
        alertas: {
          terminosCriticos: terminosCriticos.map(t => ({
            ...t,
            diasRestantes: Math.ceil(
              (t.fechaVencimiento.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            ),
          })),
          alertasRecientes,
        }
      }
    })
  } catch (error) {
    console.error('Error al obtener dashboard:', error)
    const { body, status } = jsonApiErrorConEntorno(error, 'Error al obtener estadísticas')
    return NextResponse.json(body, { status })
  }
}
