/**
 * Etiquetas legibles para TipoMemorial (formato CPNU)
 * Se usan en actuaciones automáticas al cargar memoriales.
 */
import { TipoMemorial } from '@prisma/client'

export const TIPO_MEMORIAL_LABEL: Record<TipoMemorial, string> = {
  DEMANDA: 'Memorial demanda',
  REFORMA_DEMANDA: 'Memorial reforma demanda',
  CONTESTACION: 'Memorial contestación',
  EXCEPCIONES: 'Memorial excepciones',
  RECONVENCIÓN: 'Memorial reconvención',
  CONTESTACION_RECONVENCION: 'Memorial contestación reconvención',
  INCIDENTE: 'Memorial incidente',
  RECURSO_REPOSICION: 'Memorial recurso de reposición',
  RECURSO_APELACION: 'Memorial recurso de apelación',
  RECURSO_QUEJA: 'Memorial recurso de queja',
  RECURSO_CASACION: 'Memorial recurso de casación',
  SOLICITUD_PRUEBAS: 'Memorial solicitud de pruebas',
  ALEGATOS_CONCLUSION: 'Memorial alegatos de conclusión',
  DESISTIMIENTO: 'Memorial desistimiento',
  PODER: 'Memorial poder',
  SUSTITUCION_PODER: 'Memorial sustitución de poder',
  OTRO: 'Memorial',
}

export function getTipoMemorialLabel(tipo: TipoMemorial | string): string {
  return TIPO_MEMORIAL_LABEL[tipo as TipoMemorial] || `Memorial ${(tipo || '').replace(/_/g, ' ').toLowerCase()}`
}
