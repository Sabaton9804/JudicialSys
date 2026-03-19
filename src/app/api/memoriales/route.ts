import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { TipoMemorial, EstadoMemorial } from '@prisma/client';
import { getUserFromHeader, procesoJuzgadoWhere } from '@/lib/auth-utils';
import { getTipoMemorialLabel } from '@/lib/tipo-memorial-labels';

// GET - Listar memoriales con filtros
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request);
    const pjw = procesoJuzgadoWhere(user);

    const searchParams = request.nextUrl.searchParams;
    const procesoId = searchParams.get('procesoId');
    const tipo = searchParams.get('tipo') as TipoMemorial | null;
    const estado = searchParams.get('estado') as EstadoMemorial | null;
    const pendientes = searchParams.get('pendientes') === 'true';

    const where: any = { ...pjw };
    
    if (procesoId) where.procesoId = procesoId;
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;
    if (pendientes) where.estado = EstadoMemorial.RADICADO;

    const memoriales = await db.memorial.findMany({
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
        recibidoPor: {
          select: { nombre: true, rol: true }
        }
      },
      orderBy: { fechaPresentacion: 'desc' }
    });

    return NextResponse.json(memoriales);
  } catch (error) {
    console.error('Error al obtener memoriales:', error);
    return NextResponse.json(
      { error: 'Error al obtener memoriales' },
      { status: 500 }
    );
  }
}

// POST - Registrar nuevo memorial
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    const memorial = await db.memorial.create({
      data: {
        procesoId: data.procesoId,
        tipo: data.tipo as TipoMemorial,
        numero: data.numero,
        fechaPresentacion: new Date(data.fechaPresentacion || Date.now()),
        presentante: data.presentante,
        identificacion: data.identificacion,
        asunto: data.asunto,
        contenido: data.contenido,
        folios: data.folios,
        anexos: data.anexos,
        recibidoPorId: data.recibidoPorId,
        fechaRecibido: new Date(),
        estado: EstadoMemorial.RADICADO,
        observaciones: data.observaciones,
      },
      include: {
        proceso: { select: { radicado: true } }
      }
    });

    // Publicación automática (formato CPNU) — con el solo cargue queda publicado
    const etiqueta = getTipoMemorialLabel(data.tipo as TipoMemorial);
    const anotacion = [
      `Presentante: ${data.presentante}`,
      data.asunto && `Asunto: ${data.asunto}`,
      data.folios != null && `Folios: ${data.folios}`,
      data.observaciones && `Observación: ${data.observaciones}`,
    ].filter(Boolean).join('. ');

    await db.historialActuacion.create({
      data: {
        procesoId: data.procesoId,
        area: 'SECRETARIA',
        tipo: 'MEMORIAL_RECIBIDO',
        accion: etiqueta,
        descripcion: anotacion,
        datos: JSON.stringify({
          memorialId: memorial.id,
          tipo: data.tipo,
          presentante: data.presentante,
          numero: data.numero,
          folios: data.folios,
          anexos: data.anexos,
        }),
      },
    });

    // Crear tarea para el Despacho si es necesario
    if (['DEMANDA', 'SOLICITUD_PRUEBAS', 'INCIDENTE', 'RECURSO_APELACION', 'RECURSO_REPOSICION'].includes(data.tipo)) {
      await db.tarea.create({
        data: {
          procesoId: data.procesoId,
          titulo: `Revisar memorial: ${data.tipo}`,
          descripcion: `Se recibió memorial de ${data.presentante}. Asunto: ${data.asunto}`,
          tipo: 'MEMORIAL',
          prioridad: data.tipo === 'RECURSO_APELACION' ? 'URGENTE' : 'MEDIA',
          area: 'DESPACHO',
          observaciones: `Memorial No. ${data.numero}. Folios: ${data.folios}`,
        }
      });
    }

    return NextResponse.json(memorial, { status: 201 });
  } catch (error) {
    console.error('Error al crear memorial:', error);
    return NextResponse.json(
      { error: 'Error al crear memorial' },
      { status: 500 }
    );
  }
}

// PUT - Actualizar estado del memorial
export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    const { id, ...updateData } = data;

    const memorial = await db.memorial.update({
      where: { id },
      data: {
        estado: updateData.estado as EstadoMemorial,
        respuesta: updateData.respuesta,
        observaciones: updateData.observaciones,
      },
      include: {
        proceso: { select: { radicado: true } }
      }
    });

    return NextResponse.json(memorial);
  } catch (error) {
    console.error('Error al actualizar memorial:', error);
    return NextResponse.json(
      { error: 'Error al actualizar memorial' },
      { status: 500 }
    );
  }
}
