const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** Día 1–31 en palabras (español), para fechas judiciales. */
export function diaUnoATreintaYUnoPalabras(n: number): string {
  const m: Record<number, string> = {
    1: 'uno',
    2: 'dos',
    3: 'tres',
    4: 'cuatro',
    5: 'cinco',
    6: 'seis',
    7: 'siete',
    8: 'ocho',
    9: 'nueve',
    10: 'diez',
    11: 'once',
    12: 'doce',
    13: 'trece',
    14: 'catorce',
    15: 'quince',
    16: 'dieciséis',
    17: 'diecisiete',
    18: 'dieciocho',
    19: 'diecinueve',
    20: 'veinte',
    21: 'veintiuno',
    22: 'veintidós',
    23: 'veintitrés',
    24: 'veinticuatro',
    25: 'veinticinco',
    26: 'veintiséis',
    27: 'veintisiete',
    28: 'veintiocho',
    29: 'veintinueve',
    30: 'treinta',
    31: 'treinta y uno',
  }
  return m[n] ?? String(n)
}

/**
 * Ej.: "Bogotá, D.C. Veintisiete (27) de marzo de 2026"
 */
export function fechaLargaCiudadColombia(fecha: Date, ciudadLinea: string): string {
  const d = fecha.getDate()
  const mes = MESES[fecha.getMonth()] ?? ''
  const anio = fecha.getFullYear()
  const diaPal = diaUnoATreintaYUnoPalabras(d)
  const cap = (s: string) => (s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s)
  return `${ciudadLinea} ${cap(diaPal)} (${d}) de ${mes} de ${anio}`.trim()
}
