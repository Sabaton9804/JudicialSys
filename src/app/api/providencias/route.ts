import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { TipoProvidencia, EstadoProvidencia, TipoAuto } from '@prisma/client';
import { getUserFromHeader, procesoJuzgadoWhere } from '@/lib/auth-utils';
import { getTipoAutoLabel } from '@/lib/tipo-auto-labels';
import { findOrCreateEdicionEstadoDelDia } from '@/lib/edicion-estado';

// GET - Listar providencias con filtros
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request);
    const pjw = procesoJuzgadoWhere(user);

    const searchParams = request.nextUrl.searchParams;
    const procesoId = searchParams.get('procesoId');
    const tipo = searchParams.get('tipo') as TipoProvidencia | null;
    const estado = searchParams.get('estado') as EstadoProvidencia | null;
    const pendientesFirma = searchParams.get('pendientesFirma') === 'true';

    const where: any = { ...pjw };
    
    if (procesoId) where.procesoId = procesoId;
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;
    if (pendientesFirma) where.estado = EstadoProvidencia.PENDIENTE_FIRMA;

    const providencias = await db.providencia.findMany({
      where,
      include: {
        proceso: {
          select: {
            radicado: true,
            demandante: true,
            demandado: true,
            categoriaProceso: true,
            claseProceso: true,
          }
        },
        proyectadoPor: {
          select: { nombre: true, rol: true, area: true }
        },
        revisadoPor: {
          select: { nombre: true, rol: true }
        },
        firmadoPor: {
          select: { nombre: true, rol: true }
        }
      },
      orderBy: { fecha: 'desc' }
    });

    return NextResponse.json(providencias);
  } catch (error) {
    console.error('Error al obtener providencias:', error);
    return NextResponse.json(
      { error: 'Error al obtener providencias' },
      { status: 500 }
    );
  }
}

// POST - Crear nueva providencia
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    const providencia = await db.providencia.create({
      data: {
        procesoId: data.procesoId,
        tipo: data.tipo as TipoProvidencia,
        numero: data.numero,
        fecha: new Date(data.fecha || Date.now()),
        asunto: data.asunto,
        contenido: data.contenido,
        estado: EstadoProvidencia.PROYECTADO,
        tipoAuto: data.tipoAuto as TipoAuto || null,
        proyectadoPorId: data.proyectadoPorId,
        fechaProyeccion: new Date(),
        recursos: data.recursos,
        observaciones: data.observaciones,
      },
      include: {
        proceso: {
          select: { radicado: true }
        }
      }
    });

    // Marcar tarea "Proyectar auto/sentencia" como completada si existe
    const tipoTarea = data.tipo === 'SENTENCIA' ? 'PROYECTAR_SENTENCIA' : 'PROYECTAR_AUTO';
    await db.tarea.updateMany({
      where: {
        procesoId: data.procesoId,
        tipo: tipoTarea,
        estado: { in: ['PENDIENTE', 'EN_PROGRESO'] },
      },
      data: { estado: 'COMPLETADA', fechaCompletado: new Date() },
    });

    // Actuación automática (formato CPNU)
    const etiqueta = getTipoAutoLabel(data.tipoAuto as TipoAuto | null, data.tipo, data.asunto);
    await db.historialActuacion.create({
      data: {
        procesoId: data.procesoId,
        area: 'DESPACHO',
        tipo: data.tipo === 'AUTO' ? 'AUTO_PROFERIDO' : 'SENTENCIA_PROFERIDA',
        accion: `${etiqueta} - Proyectado`,
        descripcion: `Proyectado para revisión y firma. ${data.numero ? `Nº ${data.numero}.` : ''}`.trim(),
        datos: JSON.stringify({ providenciaId: providencia.id, tipoAuto: data.tipoAuto }),
      }
    });

    return NextResponse.json(providencia, { status: 201 });
  } catch (error) {
    console.error('Error al crear providencia:', error);
    return NextResponse.json(
      { error: 'Error al crear providencia' },
      { status: 500 }
    );
  }
}

// PUT - Actualizar providencia (cambiar estado, firmar, etc.)
export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    const { id, ...updateData } = data;

    const providenciaActual = await db.providencia.findUnique({
      where: { id },
      include: { proceso: true }
    });

    if (!providenciaActual) {
      return NextResponse.json(
        { error: 'Providencia no encontrada' },
        { status: 404 }
      );
    }

    // Preparar datos de actualización
    const datosActualizacion: any = {};
    
    if (updateData.estado) datosActualizacion.estado = updateData.estado;
    // Aprobar para firma: la Dra/revisor aprueba → pasa a PENDIENTE_FIRMA para que el Juez firme
    if (updateData.aprobarParaFirma === true && updateData.revisadoPorId) {
      if (providenciaActual.estado !== EstadoProvidencia.PROYECTADO && providenciaActual.estado !== EstadoProvidencia.EN_REVISION && providenciaActual.estado !== EstadoProvidencia.CORRECCION) {
        return NextResponse.json(
          { error: 'Solo se puede aprobar una providencia proyectada o en corrección' },
          { status: 400 }
        );
      }
      datosActualizacion.revisadoPorId = updateData.revisadoPorId;
      datosActualizacion.fechaRevision = new Date();
      datosActualizacion.estado = EstadoProvidencia.PENDIENTE_FIRMA;
    } else if (updateData.revisadoPorId) {
      datosActualizacion.revisadoPorId = updateData.revisadoPorId;
      datosActualizacion.fechaRevision = new Date();
    }
    // Devolver para corrección: la Dra pide cambios al sustanciador
    if (updateData.devolverCorreccion === true) {
      if (providenciaActual.estado !== EstadoProvidencia.PROYECTADO && providenciaActual.estado !== EstadoProvidencia.EN_REVISION) {
        return NextResponse.json(
          { error: 'Solo se puede devolver una providencia proyectada o en revisión' },
          { status: 400 }
        );
      }
      datosActualizacion.estado = EstadoProvidencia.CORRECCION;
      if (updateData.observacionesCorreccion) datosActualizacion.observaciones = updateData.observacionesCorreccion;
    }
    // Reenviar para revisión: el sustanciador corrige y vuelve a enviar a la Dra
    if (updateData.reenviarParaRevision === true) {
      if (providenciaActual.estado !== EstadoProvidencia.CORRECCION) {
        return NextResponse.json(
          { error: 'Solo se puede reenviar una providencia en corrección' },
          { status: 400 }
        );
      }
      datosActualizacion.estado = EstadoProvidencia.PROYECTADO;
    }
    if (updateData.firmadoPorId) {
      datosActualizacion.firmadoPorId = updateData.firmadoPorId;
      datosActualizacion.fechaFirma = new Date();
      datosActualizacion.estado = EstadoProvidencia.FIRMADO;
    }
    // Publicar en estado (Secretaría): notificar a las partes e incorporar a la lista del Estado N.º del día
    if (updateData.publicarEnEstado === true) {
      if (providenciaActual.estado !== EstadoProvidencia.FIRMADO) {
        return NextResponse.json(
          { error: 'Solo se puede publicar en estado una providencia firmada' },
          { status: 400 }
        );
      }
      const edicion = await findOrCreateEdicionEstadoDelDia(providenciaActual.proceso.juzgadoId);
      datosActualizacion.edicionEstadoId = edicion.id;
      datosActualizacion.notificado = true;
      datosActualizacion.fechaNotificacion = new Date();
      datosActualizacion.estado = EstadoProvidencia.NOTIFICADO;
    }
    if (updateData.contenido) datosActualizacion.contenido = updateData.contenido;
    if (updateData.observaciones) datosActualizacion.observaciones = updateData.observaciones;

    const providencia = await db.providencia.update({
      where: { id },
      data: datosActualizacion,
      include: {
        proceso: { select: { radicado: true } },
        firmadoPor: { select: { nombre: true, rol: true } }
      }
    });

    // Etiqueta legible para actuación (formato CPNU: "Auto admite demanda", "Sentencia", etc.)
    const etiquetaProvidencia = getTipoAutoLabel(
      providenciaActual.tipoAuto as TipoAuto | null,
      providenciaActual.tipo,
      providenciaActual.asunto
    );

    // Publicación automática: crear actuaciones en formato CPNU (como Consulta de Procesos)
    if (updateData.firmadoPorId) {
      await db.historialActuacion.create({
        data: {
          procesoId: providenciaActual.procesoId,
          area: 'DESPACHO',
          tipo: providenciaActual.tipo === 'SENTENCIA' ? 'SENTENCIA_PROFERIDA' : 'PROVIDENCIA_FIRMADA',
          accion: etiquetaProvidencia,
          descripcion: `Firmado por ${providencia.firmadoPor?.nombre}. ${providenciaActual.numero ? `Nº ${providenciaActual.numero}.` : ''} ${providenciaActual.observaciones || ''}`.trim(),
          anterior: JSON.stringify({ estado: providenciaActual.estado }),
          nuevo: JSON.stringify({ estado: 'FIRMADO' }),
          datos: JSON.stringify({ providenciaId: id, tipoAuto: providenciaActual.tipoAuto, numero: providenciaActual.numero }),
        }
      });
    }

    if (updateData.publicarEnEstado) {
      const fechaInicio = new Date();
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 3);

      // Crear término de ejecutoria (3 días - Art. 295 CGP)
      await db.termino.create({
        data: {
          procesoId: providenciaActual.procesoId,
          tipo: 'EJECUTORIA',
          descripcion: `Término de ejecutoria - ${etiquetaProvidencia} ${providenciaActual.numero || ''}`,
          fechaInicio,
          fechaVencimiento,
          diasTermino: 3,
          diasHabiles: true,
        }
      });

      // Actuación automática: notificado (formato CPNU - se desanota en automático)
      await db.historialActuacion.create({
        data: {
          procesoId: providenciaActual.procesoId,
          area: 'SECRETARIA',
          tipo: 'NOTIFICACION_REALIZADA',
          accion: `${etiquetaProvidencia} - Notificado`,
          descripcion: `Notificado a las partes (Art. 295 CGP). Término de ejecutoria: ${fechaInicio.toLocaleDateString('es-CO')} a ${fechaVencimiento.toLocaleDateString('es-CO')}. ${providenciaActual.observaciones ? `Observación: ${providenciaActual.observaciones}` : ''}`.trim(),
          fechaInicioTermino: fechaInicio,
          fechaFinTermino: fechaVencimiento,
          anterior: JSON.stringify({ estado: 'FIRMADO' }),
          nuevo: JSON.stringify({ estado: 'NOTIFICADO' }),
          datos: JSON.stringify({ providenciaId: id, numero: providenciaActual.numero }),
        }
      });
    }

    return NextResponse.json(providencia);
  } catch (error) {
    console.error('Error al actualizar providencia:', error);
    return NextResponse.json(
      { error: 'Error al actualizar providencia' },
      { status: 500 }
    );
  }
}
