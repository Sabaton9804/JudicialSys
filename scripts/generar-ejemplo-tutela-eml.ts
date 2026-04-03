/**
 * Genera el .eml de ejemplo con ZIP adjunto (DEMANDA_*, PRUEBA_*, secuencia).
 * Ejecutar: npx tsx scripts/generar-ejemplo-tutela-eml.ts
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import JSZip from 'jszip'

const root = process.cwd()

const PDF_DEMANDA = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj
xref
0 4
0000000000 65535 f 
trailer<</Size 4/Root 1 0 R>>
startxref
120
%%EOF
`.replace(/\n/g, '\r\n')
)

const PDF_PRUEBA = PDF_DEMANDA

const SECUENCIA = `Secuencia sugerida — tutela en linea (ejemplo JudicialSys)
Referencia tramite web: 202600358

01 — Constancia del correo electronico (PDF generado al importar el .eml en JudicialSys)
02 — Escrito de demanda: DEMANDA_demanda_ejemplo_202600358.pdf
03 — Pruebas / anexos: PRUEBA_listado_anexos_ejemplo_202600358.pdf

Nota: En un correo real de la Rama, el ZIP con DEMANDA_ y PRUEBA_ suele obtenerse por enlace HTTPS
desde el cuerpo del mensaje; aqui va adjunto para que la importacion funcione sin red.
`

const HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Tutela 202600358</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222;">
<p><strong>Rama Judicial del Poder Publico de Colombia</strong></p>
<p><strong>RV: Generacion de Tutela en linea No 202600358</strong></p>
<p>Este mensaje de <strong>ejemplo</strong> incluye un <strong>ZIP adjunto</strong> con el escrito de demanda,
las pruebas (anexos) y un archivo de <strong>secuencia</strong>, como en un tramite real de tutela en linea.</p>
<p><strong>Lugar:</strong> BOGOTA, D.C.</p>
<p><strong>Accionante:</strong> EJEMPLO ACCIONANTE<br>
<strong>Documento:</strong> 12345678</p>
<p><strong>Accionado:</strong> ENTIDAD EJEMPLO</p>
<p style="font-size:12px;color:#555;">Al importar este .eml en JudicialSys se genera ademas el PDF del correo y se descomprime el ZIP adjunto.</p>
</body>
</html>
`

async function main() {
  const zip = new JSZip()
  zip.file('00_SECUENCIA_TUTELA.txt', SECUENCIA)
  zip.file('DEMANDA_demanda_ejemplo_202600358.pdf', PDF_DEMANDA)
  zip.file('PRUEBA_listado_anexos_ejemplo_202600358.pdf', PDF_PRUEBA)

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const zipName = 'tutela_tramite_202600358.zip'

  const b64 = zipBuffer.toString('base64').replace(/(.{76})/g, '$1\r\n').trimEnd()

  const boundary = '=_Part_Example_Tutela_202600358'
  const htmlPart = HTML.replace(/\r?\n/g, '\r\n')
  const eml = [
    'From: tutelaenlinea3@deaj.ramajudicial.gov.co',
    'To: Recepcion Tutelas Habeas Corpus - Bogota <recepcion.tutelas@ramajudicial.gov.co>',
    'Subject: RV: Generacion de Tutela en linea No 202600358',
    'Date: Wed, 1 Apr 2026 18:22:00 -0500',
    'Message-ID: <ejemplo-tutela-202600358-20260401@ramajudicial.gov.co>',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlPart,
    '',
    `--${boundary}`,
    `Content-Type: application/zip; name="${zipName}"`,
    `Content-Disposition: attachment; filename="${zipName}"`,
    'Content-Transfer-Encoding: base64',
    '',
    b64,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n')

  const outName = 'RV_Generacion_Tutela_en_linea_No_202600358.eml'
  const dirs = [
    join(root, 'public', 'ejemplos'),
    join(root, 'uploads', 'ejemplos'),
  ]
  for (const d of dirs) {
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, outName), eml, 'utf8')
  }
  writeFileSync(join(root, 'public', 'ejemplos', zipName), zipBuffer)

  console.log('OK:', outName, '+', zipName, `(${zipBuffer.length} bytes zip)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
