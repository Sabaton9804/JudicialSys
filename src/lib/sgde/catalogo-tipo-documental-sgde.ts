/**
 * Catálogo de tipos documentales para metadato `rama:tipoDocumental` en SGDE (Alfresco).
 * Los códigos están en camelCase: `tipoDocumentalLegible` en client.ts los convierte a texto legible para el gestor.
 *
 * Referencia: vocabulario habitual en expediente judicial electrónico / TRD proceso judicial (Rama Judicial).
 * Ajustar la lista si su despacho exige etiquetas distintas en el desplegable del SGDE.
 */

export type EntradaTipoDocumentalSgde = {
  /** Valor técnico (camelCase) enviado a la API de carga */
  codigo: string
  /** Descripción para prompts de IA y documentación */
  descripcion: string
}

/** Lista cerrada para clasificación automática (IA debe devolver uno de estos `codigo`). */
export const CATALOGO_TIPOS_DOCUMENTALES_SGDE: readonly EntradaTipoDocumentalSgde[] = [
  { codigo: 'EscritoDeDemanda', descripcion: 'Escrito de demanda o solicitud inicial' },
  { codigo: 'SolicitudDeTutela', descripcion: 'Solicitud de tutela (escrito constitucional)' },
  { codigo: 'ContestacionDeLaDemanda', descripcion: 'Contestación de la demanda' },
  { codigo: 'Contestacion', descripcion: 'Contestación u oposición (genérica)' },
  { codigo: 'Replica', descripcion: 'Réplica' },
  { codigo: 'Duplica', descripcion: 'Dúplica' },
  { codigo: 'Memorial', descripcion: 'Memorial, exposición o escrito de parte' },
  { codigo: 'Alegato', descripcion: 'Alegato de conclusión u oralidad escrita' },
  { codigo: 'EscritoDePruebas', descripcion: 'Escrito de pruebas o cruce' },
  { codigo: 'PruebaDocumental', descripcion: 'Prueba documental (anexos probatorios)' },
  { codigo: 'PruebaTestimonial', descripcion: 'Prueba testimonial, interrogatorio o declaración' },
  { codigo: 'DocumentoAnexo', descripcion: 'Anexo o documento de apoyo no probatorio principal' },
  { codigo: 'ListaDePruebas', descripcion: 'Lista de pruebas o inventario' },
  { codigo: 'Poder', descripcion: 'Poder, apoderamiento o mandato' },
  { codigo: 'DocumentoDeIdentidad', descripcion: 'Documento de identificación de parte o apoderado' },
  { codigo: 'RecursoDeApelacion', descripcion: 'Recurso de apelación' },
  { codigo: 'RecursoDeReposicion', descripcion: 'Recurso de reposición u otros recursos ordinarios' },
  { codigo: 'Ponencia', descripcion: 'Ponencia o proyecto de decisión' },
  { codigo: 'Sentencia', descripcion: 'Sentencia' },
  { codigo: 'Auto', descripcion: 'Auto u orden judicial genérica' },
  { codigo: 'Providencia', descripcion: 'Providencia o decisión intermedia' },
  { codigo: 'AutoApertura', descripcion: 'Auto de apertura, admisión o trámite' },
  { codigo: 'AutoDePruebas', descripcion: 'Auto que ordena o cierra pruebas' },
  { codigo: 'Oficio', descripcion: 'Oficio judicial o comunicación oficial' },
  { codigo: 'Citacion', descripcion: 'Citación a audiencia o acto' },
  { codigo: 'Notificacion', descripcion: 'Notificación o emplazamiento' },
  { codigo: 'Informe', descripcion: 'Informe pericial, concepto técnico o informe de entidad' },
  { codigo: 'Dictamen', descripcion: 'Dictamen o concepto jurídico' },
  { codigo: 'Acta', descripcion: 'Acta procesal genérica' },
  { codigo: 'ActaDeAudiencia', descripcion: 'Acta de audiencia' },
  { codigo: 'ActaDeReparto', descripcion: 'Acta de reparto o sorteo' },
  { codigo: 'ConstanciaDeCorreoElectronico', descripcion: 'Constancia de notificación por correo electrónico' },
  { codigo: 'Certificado', descripcion: 'Certificado expedido por autoridad o entidad' },
  { codigo: 'EstadoDelProceso', descripcion: 'Estado de proceso o certificación de despacho' },
  { codigo: 'OtrosDocumentos', descripcion: 'Otro documento no listado arriba' },
] as const

const CODIGOS_SET = new Set(CATALOGO_TIPOS_DOCUMENTALES_SGDE.map((e) => e.codigo))

export function esCodigoTipoDocumentalSgdeValido(c: string): boolean {
  return CODIGOS_SET.has(c.trim())
}

/** Texto para prompt de modelo (lista numerada). */
export function textoCatalogoTipoDocumentalParaPrompt(): string {
  return CATALOGO_TIPOS_DOCUMENTALES_SGDE.map(
    (e, i) => `${i + 1}. \`${e.codigo}\` — ${e.descripcion}`
  ).join('\n')
}

/**
 * Si el modelo devuelve texto libre o mayúsculas, intenta acercarlo al catálogo.
 */
export function normalizarCodigoTipoDocumentalSgde(raw: string): string {
  const s = raw.trim()
  if (esCodigoTipoDocumentalSgdeValido(s)) return s
  const compact = s.replace(/\s+/g, '')
  for (const c of CODIGOS_SET) {
    if (c.toLowerCase() === compact.toLowerCase()) return c
  }
  const lower = s.toLowerCase()
  for (const e of CATALOGO_TIPOS_DOCUMENTALES_SGDE) {
    if (e.descripcion.toLowerCase() === lower) return e.codigo
  }
  return 'OtrosDocumentos'
}
