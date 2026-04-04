import { HTML_PLANTILLA_INFORME_INGRESO_DEFAULT } from '@/lib/plantillas/default-plantilla-informe'

/** Debe coincidir con el enum `TipoPlantillaDocumento` en `schema.prisma`. */
export const TIPOS_PLANTILLA = ['INFORME_INGRESO_DESPACHO', 'OFICIO', 'CONSTANCIA', 'MEMORIAL'] as const
export type TipoPlantillaDocumento = (typeof TIPOS_PLANTILLA)[number]

const HTML_OFICIO_DEFAULT = `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111; line-height: 1.45;">
<p style="text-align: right; margin-bottom: 1.2em;">{{juzgadoCiudad}}, {{fechaLarga}}</p>
<p><strong>Señor(a)</strong></p>
<p style="margin: 0.6em 0;"><strong>Referencia:</strong> Radicación {{radicado}}</p>
<p style="text-align: justify; margin: 1em 0;">Asunto: <strong>{{textoTipoProceso}}</strong>. Partes: <strong>{{demandante}}</strong> c. <strong>{{demandado}}</strong>.</p>
<p style="text-align: justify;">(Redacte aquí el cuerpo del oficio.)</p>
<p style="margin-top: 2em;">Cordialmente,</p>
<div style="margin-top: 2em;">
  <div style="font-weight: bold;">{{secretarioNombre}}</div>
  <div>{{secretarioCargo}}</div>
  <div style="margin-top: 0.35em;">{{juzgadoNombre}}</div>
</div>
</div>`

const HTML_CONSTANCIA_DEFAULT = `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111; line-height: 1.45;">
<p style="text-align: center; font-weight: bold; text-transform: uppercase; margin-bottom: 0.5em;">{{juzgadoNombre}}</p>
<p style="text-align: center; margin-bottom: 1.5em;">{{juzgadoDireccion}} — {{juzgadoCiudad}}</p>
<p style="text-align: center; font-weight: bold; margin-bottom: 1em;">CONSTANCIA</p>
<p style="text-align: justify;">El suscrito secretario certifica que, revisado el expediente del proceso <strong>{{textoTipoProceso}}</strong>, radicación <strong>{{radicado}}</strong>, a cargo de <strong>{{demandante}}</strong> contra <strong>{{demandado}}</strong>:</p>
<p style="text-align: justify;">(Complete el texto de la constancia.)</p>
<p style="margin-top: 2em; text-align: center;">Se expide en {{juzgadoCiudad}}, a los {{fechaLarga}}.</p>
<p style="margin-top: 2.5em; text-align: center;">
  <span style="font-weight: bold;">{{secretarioNombre}}</span><br/>
  {{secretarioCargo}}
</p>
</div>`

const HTML_MEMORIAL_DEFAULT = `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111; line-height: 1.45;">
<p style="text-align: center; font-weight: bold; text-transform: uppercase;">{{juzgadoNombre}}</p>
<p style="text-align: center; margin-bottom: 1em;">Radicación {{radicado}}</p>
<p style="text-align: justify;"><strong>REFERENTE:</strong> Proceso <strong>{{textoTipoProceso}}</strong>. Demandante: <strong>{{demandante}}</strong>. Demandado: <strong>{{demandado}}</strong>.</p>
<p style="text-align: justify; margin-top: 1em;"><strong>I.</strong> (Hechos)</p>
<p style="text-align: justify;"><strong>II.</strong> (Consideraciones)</p>
<p style="text-align: justify;"><strong>III.</strong> (Peticiones)</p>
<p style="margin-top: 2em;">Atentamente,</p>
<p style="margin-top: 2em; font-weight: bold;">{{demandante}}</p>
<p style="font-size: 10pt;">C.C. {{juzgadoEmail}}</p>
</div>`

export type MetaTipoPlantilla = {
  tipo: TipoPlantillaDocumento
  titulo: string
  descripcion: string
  /** Solo el informe se genera solo al crear/regenerar desde el expediente. */
  generacionAutomaticaDesdeExpediente: boolean
}

export const METADATOS_TIPOS_PLANTILLA: MetaTipoPlantilla[] = [
  {
    tipo: 'INFORME_INGRESO_DESPACHO',
    titulo: 'Informe de ingreso al despacho',
    descripcion:
      'Se puede generar automáticamente al crear el expediente y desde la ficha del proceso.',
    generacionAutomaticaDesdeExpediente: true,
  },
  {
    tipo: 'OFICIO',
    titulo: 'Oficio / comunicación',
    descripcion:
      'Plantilla para oficios y comunicaciones. Guárdela y úsela cuando exista flujo de generación o copie el texto.',
    generacionAutomaticaDesdeExpediente: false,
  },
  {
    tipo: 'CONSTANCIA',
    titulo: 'Constancia',
    descripcion: 'Certificaciones y constancias de secretaría.',
    generacionAutomaticaDesdeExpediente: false,
  },
  {
    tipo: 'MEMORIAL',
    titulo: 'Memorial / escrito',
    descripcion: 'Presentaciones de las partes (hechos, consideraciones, peticiones).',
    generacionAutomaticaDesdeExpediente: false,
  },
]

export function htmlPlantillaPorDefecto(tipo: TipoPlantillaDocumento): string {
  switch (tipo) {
    case 'INFORME_INGRESO_DESPACHO':
      return HTML_PLANTILLA_INFORME_INGRESO_DEFAULT
    case 'OFICIO':
      return HTML_OFICIO_DEFAULT
    case 'CONSTANCIA':
      return HTML_CONSTANCIA_DEFAULT
    case 'MEMORIAL':
      return HTML_MEMORIAL_DEFAULT
  }
}

export function nombrePlantillaSugerido(tipo: TipoPlantillaDocumento): string {
  const m = METADATOS_TIPOS_PLANTILLA.find((x) => x.tipo === tipo)
  return m ? `${m.titulo} — personalizado` : 'Plantilla — personalizada'
}

export const TIPOS_PLANTILLA_VALIDOS: TipoPlantillaDocumento[] = [...TIPOS_PLANTILLA]

export function esTipoPlantillaDocumento(s: string): s is TipoPlantillaDocumento {
  return (TIPOS_PLANTILLA as readonly string[]).includes(s)
}
