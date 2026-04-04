/**
 * Márgenes del área de edición inspirados en los márgenes de página de Word (valores en mm).
 * padding CSS: arriba derecha abajo izquierda cuando hay 4 valores; 2 valores = sup/inf | izq/der.
 */
export type PresetMargenWord = {
  id: string
  label: string
  /** Valor CSS de padding */
  padding: string
}

export const MARGENES_PRESETS_WORD: PresetMargenWord[] = [
  { id: 'normal', label: 'Normal (2,5 cm — predeterminado Word)', padding: '25.4mm' },
  { id: 'estrecho', label: 'Estrecho (1,27 cm — ½ pulgada)', padding: '12.7mm' },
  { id: 'moderado', label: 'Moderado (2,5 cm arriba/abajo, 1,9 cm lados)', padding: '25.4mm 19.05mm' },
  { id: 'amplio', label: 'Amplio (2,5 cm arriba/abajo, 3,2 cm lados)', padding: '25.4mm 32mm' },
  { id: 'minimo', label: 'Muy estrecho (1 cm)', padding: '10mm' },
  { id: 'simetrico', label: 'Simétrico ancho (3 cm todos)', padding: '30mm' },
]

export function paddingDesdeMmCuatro(arriba: number, derecha: number, abajo: number, izquierda: number): string {
  return `${arriba}mm ${derecha}mm ${abajo}mm ${izquierda}mm`
}
