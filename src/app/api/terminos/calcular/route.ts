import { NextRequest, NextResponse } from 'next/server'

// Días inhábiles en Colombia (ejemplo - debe actualizarse cada año)
const DIAS_INHABILES_2024 = [
  '2024-01-01', // Año Nuevo
  '2024-01-08', // Reyes Magos
  '2024-03-25', // San José
  '2024-03-28', // Jueves Santo
  '2024-03-29', // Viernes Santo
  '2024-05-01', // Día del Trabajo
  '2024-05-13', // Ascensión
  '2024-06-03', // Corpus Christi
  '2024-06-10', // Sagrado Corazón
  '2024-07-01', // San Pedro y San Pablo
  '2024-07-20', // Día de la Independencia
  '2024-08-07', // Batalla de Boyacá
  '2024-08-19', // Asunción
  '2024-10-14', // Día de la Raza
  '2024-11-04', // Todos los Santos
  '2024-11-11', // Independencia de Cartagena
  '2024-12-08', // Inmaculada Concepción
  '2024-12-25', // Navidad
]

// POST - Calcular fecha de vencimiento
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fechaInicio, diasTermino, diasHabiles = true } = body

    if (!fechaInicio || !diasTermino) {
      return NextResponse.json(
        { success: false, error: 'Fecha de inicio y días de término son requeridos' },
        { status: 400 }
      )
    }

    let fecha = new Date(fechaInicio)
    let diasRestantes = diasTermino

    if (diasHabiles) {
      // Contar solo días hábiles
      while (diasRestantes > 0) {
        fecha.setDate(fecha.getDate() + 1)
        
        // Verificar si es fin de semana
        const diaSemana = fecha.getDay()
        if (diaSemana === 0 || diaSemana === 6) continue
        
        // Verificar si es día inhábil
        const fechaStr = fecha.toISOString().split('T')[0]
        if (DIAS_INHABILES_2024.includes(fechaStr)) continue
        
        diasRestantes--
      }
    } else {
      // Contar días calendario
      fecha.setDate(fecha.getDate() + diasTermino)
    }

    // Ajustar si cae en fin de semana o día inhábil
    let ajustado = false
    let diaSemana = fecha.getDay()
    let fechaStr = fecha.toISOString().split('T')[0]
    
    while (diaSemana === 0 || diaSemana === 6 || DIAS_INHABILES_2024.includes(fechaStr)) {
      fecha.setDate(fecha.getDate() + 1)
      diaSemana = fecha.getDay()
      fechaStr = fecha.toISOString().split('T')[0]
      ajustado = true
    }

    return NextResponse.json({
      success: true,
      data: {
        fechaInicio,
        diasTermino,
        diasHabiles,
        fechaVencimiento: fecha.toISOString().split('T')[0],
        fechaVencimientoCompleta: fecha.toISOString(),
        ajustada: ajustado,
      }
    })
  } catch (error) {
    console.error('Error al calcular término:', error)
    return NextResponse.json(
      { success: false, error: 'Error al calcular término' },
      { status: 500 }
    )
  }
}
