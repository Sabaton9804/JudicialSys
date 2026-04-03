/**
 * PDF del correo renderizando HTML con Chromium (equivalente a «Imprimir → Microsoft Print to PDF» en Outlook).
 * Solo ejecutar en Node (API routes / importación .eml).
 */
import type { ParsedMail } from 'mailparser'
import puppeteer from 'puppeteer'

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fechaEnviado(d: Date): string {
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  let h = d.getHours()
  const min = d.getMinutes()
  const ampm = h >= 12 ? 'p. m.' : 'a. m.'
  h = h % 12
  if (h === 0) h = 12
  return `${dias[d.getDay()]}, ${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()} ${h}:${String(min).padStart(2, '0')} ${ampm}`
}

function lineaAdjuntos(parsed: ParsedMail): string | null {
  const atts = parsed.attachments || []
  if (atts.length === 0) return null
  let totalBytes = 0
  const nombres: string[] = []
  for (const a of atts) {
    const fn = (a.filename || 'adjunto').replace(/[/\\]/g, '_')
    const sz =
      typeof (a as { size?: number }).size === 'number'
        ? (a as { size: number }).size
        : Buffer.isBuffer(a.content)
          ? a.content.length
          : 0
    totalBytes += sz
    nombres.push(fn)
  }
  const kb = Math.max(1, Math.round(totalBytes / 1024))
  const n = atts.length
  const pref = n === 1 ? '1 archivo adjunto' : `${n} archivos adjuntos`
  return `${pref} (${kb} KB) ${nombres.join('; ')}`
}

/** XSS básico: el HTML viene del correo institucional, pero evitamos scripts/iframes. */
function sanearHtmlCuerpo(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
}

/**
 * Documento HTML completo: cabecera tipo vista de impresión + cuerpo MIME tal cual (maquetación, tablas, imágenes).
 */
export function construirHtmlDocumentoImpresion(parsed: ParsedMail): string {
  const subject = parsed.subject || '(sin asunto)'
  const fromTxt = parsed.from?.text || String(parsed.from || '—')
  const toTxt = parsed.to?.text || String(parsed.to || '—')
  const ccRaw = parsed.cc ? parsed.cc.text || String(parsed.cc) : ''
  const ccTxt = ccRaw.trim()
  const fecha = parsed.date ? fechaEnviado(parsed.date) : '—'
  const adj = lineaAdjuntos(parsed)

  const bodyHtml =
    typeof parsed.html === 'string' && parsed.html.trim().length > 0
      ? sanearHtmlCuerpo(parsed.html)
      : `<pre style="white-space:pre-wrap;font-family:Segoe UI,Calibri,Arial,sans-serif;font-size:11pt">${escHtml(parsed.text || '(sin cuerpo)')}</pre>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(subject)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body {
    font-family: "Segoe UI", Calibri, "Helvetica Neue", Arial, sans-serif;
    font-size: 11pt;
    color: #222;
    line-height: 1.35;
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .meta { margin-bottom: 0.85em; }
  .meta .subject { font-size: 13pt; font-weight: 600; margin-bottom: 0.45em; color: #111; }
  .meta .row { margin: 0.2em 0; }
  .mail-body {
    border-top: 1px solid #d0d0d0;
    padding-top: 0.75em;
    margin-top: 0.25em;
  }
  .mail-body img { max-width: 100% !important; height: auto !important; }
  .mail-body table { border-collapse: collapse; max-width: 100%; }
</style>
</head>
<body>
<div class="meta">
  <div class="subject">${escHtml(subject)}</div>
  <div class="row"><strong>De:</strong> ${escHtml(fromTxt)}</div>
  <div class="row"><strong>Enviado:</strong> ${escHtml(fecha)}</div>
  <div class="row"><strong>Para:</strong> ${escHtml(toTxt)}</div>
  ${ccTxt ? `<div class="row"><strong>CC:</strong> ${escHtml(ccTxt)}</div>` : ''}
  ${adj ? `<div class="row"><strong>Adjuntos:</strong> ${escHtml(adj)}</div>` : ''}
</div>
<div class="mail-body">${bodyHtml}</div>
</body>
</html>`
}

export async function generarPdfCorreoChromium(parsed: ParsedMail): Promise<Buffer> {
  const html = construirHtmlDocumentoImpresion(parsed)
  if (html.length > 12_000_000) {
    throw new Error('HTML del correo demasiado grande para generar PDF')
  }

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || process.env.CHROME_PATH?.trim() || undefined

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: executablePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    const buf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    })
    return Buffer.from(buf)
  } finally {
    await browser.close()
  }
}
