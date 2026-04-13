/**
 * Nombre legible de carpeta de expediente para UI y mensajes.
 * Convención: primera letra en mayúscula, resto en minúsculas donde aplica (p. ej. «Poderes», no «PODERES»).
 */
const ETIQUETAS: Record<string, string> = {
  DEMANDA: 'Demanda',
  CONTESTACION: 'Contestación',
  MEMORIALES: 'Memoriales',
  PODERES: 'Poderes',
  PRUEBAS: 'Pruebas',
  ALEGATOS: 'Alegatos',
  RECURSOS: 'Recursos',
  ANEXOS: 'Anexos',
  ACTA_REPARTO: 'Acta de reparto',
  INFORME_INGRESO_DESPACHO: 'Informe ingreso despacho',
  AUTOS: 'Autos',
  SENTENCIAS: 'Sentencias',
  OFICIOS: 'Oficios',
  NOTIFICACIONES: 'Notificaciones',
  CITACIONES: 'Citaciones',
  CONSTANCIAS: 'Constancias',
  ESTADOS: 'Estados',
  OTROS: 'Otros',
}

export function etiquetaCarpetaExpediente(carpeta: string | null | undefined): string {
  const c = String(carpeta ?? '').trim()
  if (!c) return ''
  return ETIQUETAS[c] ?? c
}
