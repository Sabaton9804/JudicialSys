/**
 * Plantilla por defecto si no hay registro en BD (INFORME_INGRESO_DESPACHO).
 * Variables: ver construirVariablesInformeIngreso en variables-informe-ingreso.ts
 */
export const HTML_PLANTILLA_INFORME_INGRESO_DEFAULT = `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111; line-height: 1.4;">
<div style="text-align: center; margin-bottom: 1.2em;">
  <div style="font-weight: bold; text-transform: uppercase; font-size: 10pt;">REPÚBLICA DE COLOMBIA</div>
  <div style="margin: 0.4em 0; font-size: 9pt;">RAMA JUDICIAL DEL PODER PÚBLICO</div>
  <div style="font-weight: bold; text-transform: uppercase; margin-top: 0.6em;">{{juzgadoNombre}}</div>
  <div style="margin-top: 0.35em;">{{juzgadoDireccion}}</div>
  <div style="margin-top: 0.25em;">Correo: {{juzgadoEmail}}</div>
</div>
<div style="text-align: center; font-weight: bold; text-transform: uppercase; margin: 1.4em 0 1em;">INFORME DE INGRESO AL DESPACHO</div>
<div style="text-align: center; font-weight: bold; margin-bottom: 1.2em;">{{fechaLarga}}</div>
<p style="text-align: justify; margin: 0 0 1em;">
  En la fecha ingresa al Despacho del señor juez, <strong>{{textoTipoProceso}}</strong>, la cual fue recibida por <strong>{{medioIngreso}}</strong>.
</p>
<p style="margin-top: 1.5em;">Cordialmente,</p>
<div style="text-align: center; margin-top: 2.5em;">
  <div style="font-weight: bold; text-transform: uppercase;">{{secretarioNombre}}</div>
  <div style="font-weight: bold; margin-top: 0.25em;">{{secretarioCargo}}</div>
</div>
</div>`

export function envolverHtmlInformePdf(cuerpoInterno: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe de ingreso al despacho</title>
<style>
  @page { size: A4; margin: 18mm; }
  body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Plantillas importadas desde Word: Mammoth suele dejar escudos con float y tamaños desproporcionados */
  body img {
    float: none !important;
    display: block;
    margin: 0.75em auto;
    max-width: 200px;
    max-height: 140px;
    width: auto !important;
    height: auto !important;
    object-fit: contain;
  }
  body table { width: 100%; border-collapse: collapse; }
  body td, body th { border: 1px solid #333; padding: 4px 8px; vertical-align: top; }
  body p { orphans: 3; widows: 3; }
</style>
</head>
<body>
${cuerpoInterno}
</body>
</html>`
}
