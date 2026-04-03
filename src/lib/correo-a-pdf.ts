import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { convert } from 'html-to-text'
import type { ParsedMail } from 'mailparser'

const A4_W = 595.28
const A4_H = 841.89
const MARGIN = 48
const DEFAULT_MAX_CHARS = 92
/** Evita PDF de decenas de páginas por HTML con imágenes base64 o avisos kilométricos. */
const MAX_CUERPO_PDF_CARACTERES = 12_000

const UNICODE_A_WINANSI: Record<string, string> = {
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '-',
  '\u2013': '-',
  '\u2014': '-',
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u00A0': ' ',
  '\u202F': ' ',
  '\u2009': ' ',
  '\u2007': ' ',
  '\u2026': '...',
}

/**
 * Texto compatible con Helvetica WinAnsi (evita "?" en fechas tipo "p. m." por espacios Unicode).
 */
function textoSeguroPdf(s: string): string {
  let out = ''
  for (const ch of s) {
    const m = UNICODE_A_WINANSI[ch]
    if (m) {
      out += m
      continue
    }
    const c = ch.charCodeAt(0)
    if (c === 9 || c === 10 || c === 13) {
      out += ch
      continue
    }
    if (c >= 32 && c <= 255) {
      out += ch
      continue
    }
    out += '?'
  }
  return out
}

function partirLineas(texto: string, maxChars: number = DEFAULT_MAX_CHARS): string[] {
  const lineas: string[] = []
  for (const parrafo of texto.split(/\r?\n/)) {
    let resto = parrafo
    while (resto.length > maxChars) {
      lineas.push(resto.slice(0, maxChars))
      resto = resto.slice(maxChars)
    }
    lineas.push(resto)
  }
  return lineas
}

/** Fecha legible en español sin caracteres fuera de Latin-1 (evita "3:25?p.?m."). */
function fechaEstiloCorreo(d: Date): string {
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  let h = d.getHours()
  const min = d.getMinutes()
  const ampm = h >= 12 ? 'p. m.' : 'a. m.'
  h = h % 12
  if (h === 0) h = 12
  return `${dias[d.getDay()]}, ${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()} ${h}:${String(min).padStart(2, '0')} ${ampm}`
}

function lineaAdjuntosOutlook(parsed: ParsedMail): string | null {
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

/** Quita lo que infla el HTML a megas (base64, img, scripts) antes de html-to-text. */
function sanearHtmlCorreoPdf(html: string): string {
  let s = html
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  s = s.replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=\s\r\n]+/gi, ' ')
  s = s.replace(/data:[^"'>\s]{400,}/gi, ' ')
  s = s.replace(/<img\b[^>]*>/gi, ' ')
  s = s.replace(/<svg\b[^>]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
  return s
}

function htmlATextoCorreo(html: string): string {
  const limpio = sanearHtmlCorreoPdf(html)
  return convert(limpio, {
    wordwrap: 88,
    preserveNewlines: true,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'svg', format: 'skip' },
    ],
  })
}

/**
 * Cuerpo legible sin repetir megabytes: prioriza texto plano si es razonable; si no, HTML saneado.
 */
function cuerpoParaPdf(parsed: ParsedMail): string {
  const html = typeof parsed.html === 'string' ? parsed.html : ''
  const plain = parsed.text?.trim() || ''

  if (!html) return plain || '(sin cuerpo)'

  const desdeHtml = htmlATextoCorreo(html)
  if (!plain) return desdeHtml

  const lenH = desdeHtml.length
  const lenP = plain.length

  if (lenP > 0 && lenP < lenH / 3 && lenP < 80_000) {
    return plain
  }

  if (lenH > 200_000 && lenP > 500) {
    return plain
  }

  return desdeHtml
}

function truncarCuerpoPdf(texto: string): string {
  const t = texto.trim()
  if (t.length <= MAX_CUERPO_PDF_CARACTERES) return t
  return (
    t.slice(0, MAX_CUERPO_PDF_CARACTERES).trimEnd() +
    '\n\n[… Texto truncado para este PDF constancia. El mensaje completo permanece en el archivo .eml importado.]'
  )
}

function compactarSaltosExcesivos(s: string): string {
  return s.replace(/\n{4,}/g, '\n\n\n')
}

/**
 * Fallback sin Chromium: PDF por texto (pdf-lib), cuerpo acotado.
 * @see generarPdfCorreoVistaImpresion — intenta primero Chromium (como CorreoReparto.pdf / Imprimir a PDF).
 */
export async function generarPdfCorreoVistaImpresionTexto(parsed: ParsedMail): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let cuerpoRaw = cuerpoParaPdf(parsed)
  cuerpoRaw = compactarSaltosExcesivos(cuerpoRaw)
  cuerpoRaw = truncarCuerpoPdf(cuerpoRaw)
  const cuerpo = textoSeguroPdf(cuerpoRaw)

  const subject = textoSeguroPdf(parsed.subject || '(sin asunto)')
  const fromTxt = textoSeguroPdf(parsed.from?.text || String(parsed.from || '—'))
  const toTxt = textoSeguroPdf(parsed.to?.text || String(parsed.to || '—'))
  const ccRaw = parsed.cc ? parsed.cc.text || String(parsed.cc) : ''
  const ccTxt = ccRaw.trim() ? textoSeguroPdf(ccRaw) : ''
  const enviado = parsed.date ? fechaEstiloCorreo(parsed.date) : null
  const adj = lineaAdjuntosOutlook(parsed)

  type Bloque = { lineas: string[]; size: number; bold: boolean }
  const bloques: Bloque[] = []

  bloques.push({ lineas: partirLineas(subject, 72), size: 12, bold: true })
  bloques.push({ lineas: [''], size: 5, bold: false })
  bloques.push({ lineas: partirLineas(`De: ${fromTxt}`, 88), size: 9, bold: false })
  if (enviado) {
    bloques.push({
      lineas: partirLineas(`Enviado: ${enviado}`, 88),
      size: 9,
      bold: false,
    })
  }
  bloques.push({ lineas: partirLineas(`Para: ${toTxt}`, 88), size: 9, bold: false })
  if (ccTxt) {
    bloques.push({ lineas: partirLineas(`CC: ${ccTxt}`, 88), size: 9, bold: false })
  }
  if (adj) {
    bloques.push({ lineas: partirLineas(adj, 88), size: 9, bold: false })
  }
  bloques.push({ lineas: [textoSeguroPdf('—'.repeat(76))], size: 8, bold: false })
  bloques.push({ lineas: [''], size: 4, bold: false })
  bloques.push({
    lineas: partirLineas(cuerpo, 88),
    size: 9,
    bold: false,
  })

  let page = pdf.addPage([A4_W, A4_H])
  let y = A4_H - MARGIN

  const lineHeight = (size: number) => Math.max(10, size * 1.35)

  for (const bloque of bloques) {
    const f = bloque.bold ? fontBold : font
    for (const linea of bloque.lineas) {
      if (y < MARGIN + 36) {
        page = pdf.addPage([A4_W, A4_H])
        y = A4_H - MARGIN
      }
      const lh = lineHeight(bloque.size)
      const t = linea.length === 0 ? ' ' : linea
      page.drawText(t, {
        x: MARGIN,
        y,
        size: bloque.size,
        font: f,
        color: rgb(0.08, 0.09, 0.1),
      })
      y -= lh
    }
  }

  return Buffer.from(await pdf.save())
}

/**
 * PDF tipo **vista de impresión Outlook** (HTML + Chromium). Si no hay Chromium o falla, usa {@link generarPdfCorreoVistaImpresionTexto}.
 */
export async function generarPdfCorreoVistaImpresion(parsed: ParsedMail): Promise<Buffer> {
  try {
    const { generarPdfCorreoChromium } = await import('./correo-a-pdf-chromium')
    return await generarPdfCorreoChromium(parsed)
  } catch (e) {
    console.warn('[correo-a-pdf] PDF Chromium no disponible, usando fallback texto:', e)
    return generarPdfCorreoVistaImpresionTexto(parsed)
  }
}

/**
 * PDF con cabeceras y cuerpo del correo (texto plano / ya convertido desde HTML).
 * @deprecated Preferir {@link generarPdfCorreoVistaImpresion} para importación .eml.
 */
export async function generarPdfConstanciaCorreo(params: {
  titulo: string
  lineasCabecera: string[]
  cuerpo: string
}): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  const cuerpoCorto = truncarCuerpoPdf(compactarSaltosExcesivos(params.cuerpo || '(sin cuerpo)'))

  const bloques = [
    params.titulo,
    '',
    ...params.lineasCabecera,
    '',
    '—'.repeat(56),
    '',
    cuerpoCorto,
  ]
  const alineado: string[] = []
  for (const b of bloques) {
    alineado.push(...partirLineas(b, DEFAULT_MAX_CHARS))
  }

  let page = pdf.addPage([A4_W, A4_H])
  let y = A4_H - MARGIN
  const LINE_H = 11

  for (const linea of alineado) {
    if (y < MARGIN + 40) {
      page = pdf.addPage([A4_W, A4_H])
      y = A4_H - MARGIN
    }
    const line = textoSeguroPdf(linea)
    page.drawText(line, {
      x: MARGIN,
      y,
      size: 9,
      font,
      color: rgb(0.12, 0.12, 0.14),
    })
    y -= LINE_H
  }

  return Buffer.from(await pdf.save())
}

/** Compatibilidad con `eml-paquete-zip.ts` — PDF del mensaje parseado por mailparser. */
export async function correoElectronicoABufferPdf(parsed: ParsedMail): Promise<Buffer> {
  return generarPdfCorreoVistaImpresion(parsed)
}
