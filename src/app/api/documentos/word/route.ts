import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Document, Packer, Paragraph, TextRun, AlignmentType, Header, Footer, PageNumber } from 'docx'

// Fuentes del sistema
const FONT_SPANISH = 'Times New Roman'

// Formatear fecha en español
function formatDateSpanish(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}

// Función para crear documento Word de Oficio
async function crearOficio(data: Record<string, unknown>) {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT_SPANISH, size: 24 }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'RAMA JUDICIAL DEL PODER PÚBLICO', bold: true, size: 20, font: FONT_SPANISH })
              ]
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: String(data.juzgado || 'JUZGADO CIVIL DEL CIRCUITO DE BOGOTÁ D.C.'), size: 18, font: FONT_SPANISH })
              ]
            })
          ]
        })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'Página ', size: 18, font: FONT_SPANISH }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18 }),
                new TextRun({ text: ' de ', size: 18, font: FONT_SPANISH }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 })
              ]
            })
          ]
        })
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 400 },
          children: [
            new TextRun({ text: `Bogotá D.C., ${formatDateSpanish(new Date())}`, size: 24, font: FONT_SPANISH })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [
            new TextRun({ text: `OFICIO No. ${String(data.numeroOficio || '0001')}`, bold: true, size: 28, font: FONT_SPANISH })
          ]
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: 'Señores', bold: true, size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: String(data.destinatario || 'DESTINATARIO'), size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: String(data.direccionDestinatario || 'Dirección'), size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 400 },
          children: [new TextRun({ text: String(data.ciudadDestinatario || 'Ciudad'), size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 300 },
          children: [
            new TextRun({ text: 'ASUNTO: ', bold: true, size: 24, font: FONT_SPANISH }),
            new TextRun({ text: String(data.asunto || 'Solicitud de información'), size: 24, font: FONT_SPANISH })
          ]
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: 'Respetados Señores:', size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ 
              text: 'De manera atenta, y en cumplimiento de las funciones constitucionales y legales asignadas a este Despacho Judicial, me permito solicitar se sirva:', 
              size: 24, font: FONT_SPANISH 
            })
          ]
        }),
        new Paragraph({
          spacing: { after: 300 },
          children: [new TextRun({ text: String(data.cuerpoOficio || 'Proporcionar la información solicitada.'), size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 300 },
          children: [
            new TextRun({ 
              text: 'Lo anterior, de conformidad con lo establecido en el artículo 42 del Código General del Proceso y demás normas concordantes.', 
              size: 24, font: FONT_SPANISH 
            })
          ]
        }),
        new Paragraph({
          spacing: { after: 400 },
          children: [
            new TextRun({ 
              text: 'Se advierte que el incumplimiento de esta solicitud dentro del término legalmente establecido, dará lugar a las sanciones previstas en el artículo 44 del Código General del Proceso.', 
              size: 24, font: FONT_SPANISH 
            })
          ]
        }),
        new Paragraph({
          spacing: { after: 600 },
          children: [new TextRun({ text: 'Atentamente,', size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: '__________________________', size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: String(data.nombreSecretario || 'Juan Pérez Rodríguez'), bold: true, size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 400 },
          children: [new TextRun({ text: 'Secretario(a)', size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { before: 400 },
          children: [
            new TextRun({ text: 'Proceso: ', bold: true, size: 20, font: FONT_SPANISH }),
            new TextRun({ text: String(data.radicado || 'N/A'), size: 20, font: FONT_SPANISH })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Demandante: ', bold: true, size: 20, font: FONT_SPANISH }),
            new TextRun({ text: String(data.demandante || 'N/A'), size: 20, font: FONT_SPANISH })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Demandado: ', bold: true, size: 20, font: FONT_SPANISH }),
            new TextRun({ text: String(data.demandado || 'N/A'), size: 20, font: FONT_SPANISH })
          ]
        })
      ]
    }]
  })
  return await Packer.toBuffer(doc)
}

// Función para crear Constancia
async function crearConstancia(data: Record<string, unknown>) {
  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT_SPANISH, size: 24 } } }
    },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'RAMA JUDICIAL DEL PODER PÚBLICO', bold: true, size: 20, font: FONT_SPANISH })]
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: String(data.juzgado || 'JUZGADO CIVIL DEL CIRCUITO DE BOGOTÁ D.C.'), size: 18, font: FONT_SPANISH })]
            })
          ]
        })
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 600, after: 600 },
          children: [new TextRun({ text: 'CONSTANCIA SECRETARIAL', bold: true, size: 32, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 300 },
          children: [
            new TextRun({ 
              text: `El(la) suscrito(a) Secretario(a) del ${String(data.juzgado || 'Juzgado Civil del Circuito de Bogotá D.C.')}, en cumplimiento de sus funciones legales, hace constar:`, 
              size: 24, font: FONT_SPANISH 
            })
          ]
        }),
        new Paragraph({
          spacing: { after: 400 },
          children: [new TextRun({ text: String(data.cuerpoConstancia || 'Contenido de la constancia.'), size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 400 },
          children: [
            new TextRun({ 
              text: `La presente constancia se expide a solicitud de la parte interesada, el día ${formatDateSpanish(new Date())}.`, 
              size: 24, font: FONT_SPANISH 
            })
          ]
        }),
        new Paragraph({
          spacing: { before: 400, after: 600 },
          children: [new TextRun({ text: 'Atentamente,', size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: '__________________________', size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: String(data.nombreSecretario || 'Juan Pérez Rodríguez'), bold: true, size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Secretario(a)', size: 24, font: FONT_SPANISH })]
        })
      ]
    }]
  })
  return await Packer.toBuffer(doc)
}

// Función para crear Aviso de Notificación
async function crearAvisoNotificacion(data: Record<string, unknown>) {
  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT_SPANISH, size: 24 } } }
    },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'RAMA JUDICIAL DEL PODER PÚBLICO', bold: true, size: 20, font: FONT_SPANISH })]
            })
          ]
        })
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 200 },
          children: [new TextRun({ text: 'AVISO DE NOTIFICACIÓN PERSONAL', bold: true, size: 28, font: FONT_SPANISH })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: '(Artículo 293 C.G.P.)', size: 22, font: FONT_SPANISH, italics: true })]
        }),
        new Paragraph({
          spacing: { after: 300 },
          children: [
            new TextRun({ 
              text: `EL(LA) SUSCRITO(A) SECRETARIO(A) DEL ${String(data.juzgado || 'JUZGADO CIVIL DEL CIRCUITO DE BOGOTÁ D.C.')}`, 
              size: 24, font: FONT_SPANISH 
            })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [new TextRun({ text: 'HACE SABER A:', bold: true, size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: String(data.destinatario || 'DESTINATARIO'), bold: true, size: 26, font: FONT_SPANISH })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: String(data.direccionDestinatario || 'Dirección'), size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 300 },
          children: [
            new TextRun({ 
              text: `Que dentro del proceso ${String(data.claseProceso || 'ordinario civil')} radicado con el número ${String(data.radicado || 'N/A')}, instaurado por ${String(data.demandante || 'N/A')} en contra de ${String(data.demandado || 'N/A')}, se ha proferido el siguiente proveído:`, 
              size: 24, font: FONT_SPANISH 
            })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: String(data.autoNotificar || 'Auto admisorio de demanda'), bold: true, size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { after: 400 },
          children: [
            new TextRun({ 
              text: 'Por lo anterior, se le cita para que comparezca a este Despacho Judicial, dentro de los tres (3) días siguientes a la fecha de este aviso, en el horario de 8:00 a.m. a 4:00 p.m., con el fin de que se le notifique personalmente del auto antes mencionado.', 
              size: 24, font: FONT_SPANISH 
            })
          ]
        }),
        new Paragraph({
          spacing: { after: 400 },
          children: [
            new TextRun({ 
              text: 'Se le advierte que de no comparecer dentro del término señalado, se procederá a efectuar la notificación por aviso, de conformidad con lo establecido en el artículo 293 del Código General del Proceso.', 
              size: 24, font: FONT_SPANISH 
            })
          ]
        }),
        new Paragraph({
          spacing: { before: 400, after: 400 },
          children: [
            new TextRun({ 
              text: `El presente aviso se expide el día ${formatDateSpanish(new Date())}.`, 
              size: 24, font: FONT_SPANISH 
            })
          ]
        }),
        new Paragraph({
          spacing: { before: 400 },
          children: [new TextRun({ text: 'Atentamente,', size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          spacing: { before: 400, after: 100 },
          children: [new TextRun({ text: '__________________________', size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          children: [new TextRun({ text: String(data.nombreSecretario || 'Juan Pérez Rodríguez'), bold: true, size: 24, font: FONT_SPANISH })]
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Secretario(a)', size: 24, font: FONT_SPANISH })]
        })
      ]
    }]
  })
  return await Packer.toBuffer(doc)
}

// POST - Generar documento Word
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tipo, procesoId, variables } = body

    let proceso = null
    if (procesoId) {
      proceso = await db.proceso.findUnique({ where: { id: procesoId } })
    }

    const data = {
      ...variables,
      radicado: proceso?.radicado || variables?.radicado,
      demandante: proceso?.demandante || variables?.demandante,
      demandado: proceso?.demandado || variables?.demandado,
      claseProceso: proceso?.claseProceso || variables?.claseProceso,
      juzgado: 'Juzgado Civil del Circuito de Bogotá D.C.',
      nombreSecretario: 'Juan Pérez Rodríguez',
    }

    let buffer: Buffer
    let filename: string

    switch (tipo) {
      case 'OFICIO':
        buffer = await crearOficio(data)
        filename = `oficio-${data.radicado || 'documento'}.docx`
        break
      case 'CONSTANCIA':
        buffer = await crearConstancia(data)
        filename = `constancia-${data.radicado || 'documento'}.docx`
        break
      case 'AVISO_NOTIFICACION':
        buffer = await crearAvisoNotificacion(data)
        filename = `aviso-notificacion-${data.radicado || 'documento'}.docx`
        break
      default:
        buffer = await crearOficio(data)
        filename = `documento-${data.radicado || 'documento'}.docx`
    }

    if (procesoId) {
      await db.documento.create({
        data: {
          procesoId,
          tipo: tipo || 'OFICIO',
          nombre: filename,
          contenido: `Documento generado: ${filename}`,
          generado: true,
          fechaGeneracion: new Date(),
        }
      })
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      }
    })
  } catch (error) {
    console.error('Error al generar documento Word:', error)
    return NextResponse.json(
      { success: false, error: 'Error al generar documento Word' },
      { status: 500 }
    )
  }
}
