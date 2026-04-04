/**
 * Etiquetas en lenguaje jurídico para insertar datos del expediente en plantillas.
 * El token es el nombre interno que se guarda como {{token}}.
 */
export type GrupoVariableInsercion = {
  titulo: string
  items: { label: string; token: string }[]
}

export const GRUPOS_VARIABLES_INFORME_INGRESO: GrupoVariableInsercion[] = [
  {
    titulo: 'Proceso y radicación',
    items: [
      { label: 'Número de radicación', token: 'radicado' },
      { label: 'Radicado solo dígitos', token: 'radicadoSoloDigitos' },
      { label: 'Número completo del proceso', token: 'numeroProcesoCompleto' },
      { label: 'Año de radicación', token: 'anioRadicacion' },
      { label: 'Descripción del tipo de proceso', token: 'textoTipoProceso' },
      { label: 'Clase de proceso', token: 'claseProceso' },
      { label: 'Categoría del proceso', token: 'categoriaProceso' },
      { label: 'Instancia', token: 'instancia' },
      { label: 'Etapa procesal', token: 'etapaProcesal' },
    ],
  },
  {
    titulo: 'Partes',
    items: [
      { label: 'Demandante', token: 'demandante' },
      { label: 'Demandado', token: 'demandado' },
    ],
  },
  {
    titulo: 'Fechas y plazos',
    items: [
      { label: 'Fecha en letras (ciudad y día)', token: 'fechaLarga' },
      { label: 'Fecha corta (AAAA-MM-DD)', token: 'fechaCorta' },
      { label: 'Fecha de radicación (completa)', token: 'fechaRadicacionIso' },
      { label: 'Fecha de ingreso al despacho', token: 'fechaIngresoDespacho' },
      { label: 'Días transcurridos desde el ingreso', token: 'diasTranscurridos' },
    ],
  },
  {
    titulo: 'Medio y origen',
    items: [
      { label: 'Medio por el que ingresó', token: 'medioIngreso' },
      { label: 'Origen / sistema', token: 'origenProceso' },
    ],
  },
  {
    titulo: 'Juzgado',
    items: [
      { label: 'Nombre del juzgado', token: 'juzgadoNombre' },
      { label: 'Dirección del juzgado', token: 'juzgadoDireccion' },
      { label: 'Ciudad', token: 'juzgadoCiudad' },
      { label: 'Correo del juzgado', token: 'juzgadoEmail' },
      { label: 'Teléfono del juzgado', token: 'juzgadoTelefono' },
    ],
  },
  {
    titulo: 'Secretaría y firma',
    items: [
      { label: 'Nombre del secretario', token: 'secretarioNombre' },
      { label: 'Cargo (p. ej. Secretario)', token: 'secretarioCargo' },
      { label: 'Fecha en que se genera el documento', token: 'fechaGeneracion' },
    ],
  },
  {
    titulo: 'Otros',
    items: [
      { label: 'Observaciones de secretaría', token: 'observacionesSecretaria' },
      { label: 'Tipo de decisión', token: 'tipoDecision' },
    ],
  },
]
