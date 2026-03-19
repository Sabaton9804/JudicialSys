/**
 * Etiquetas legibles para TipoAuto (formato CPNU / Consulta de Procesos)
 * Se usan en actuaciones automáticas al firmar y notificar providencias.
 */
import { TipoAuto } from '@prisma/client'

export const TIPO_AUTO_LABEL: Record<TipoAuto, string> = {
  ADMISORIO: 'Auto admite demanda',
  INADMISORIO: 'Auto inadmite demanda',
  RECONVENIENTE: 'Auto admite reconvención',
  SANEAMIENTO: 'Auto de saneamiento',
  PROBATORIO: 'Auto probatorio',
  APELACION: 'Auto de apelación',
  SUSPENSION: 'Auto de suspensión',
  REANUDACION: 'Auto de reanudación',
  ARCHIVO: 'Auto de archivo',
  LEVANTAMIENTO_MEDIDA: 'Auto levanta medida',
  PRACTICA_PRUEBAS: 'Auto practica pruebas',
  NULIDAD: 'Auto de nulidad',
  TRASLADO_DEMANDA: 'Auto traslada demanda',
  TRASLADO_EXCEPCIONES: 'Auto traslada excepciones',
  FIJACION_FECHA_AUDIENCIA: 'Auto fija fecha de audiencia',
  NOMBRAMIENTO_PERITO: 'Auto nombra perito',
  OFICIO: 'Auto de oficio',
  INTERLOCUTORIO: 'Auto interlocutorio',
  DE_SUSTANCIACION: 'Auto de sustanciación',
  OTRO: 'Auto',
}

export function getTipoAutoLabel(tipoAuto: TipoAuto | null, tipoProvidencia: string, asunto: string): string {
  if (tipoAuto && TIPO_AUTO_LABEL[tipoAuto]) {
    return TIPO_AUTO_LABEL[tipoAuto]
  }
  if (tipoProvidencia === 'SENTENCIA') {
    return 'Sentencia'
  }
  return asunto || 'Providencia'
}
