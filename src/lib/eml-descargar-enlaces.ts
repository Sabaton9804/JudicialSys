import JSZip from 'jszip'
import {
  clasificarCarpetaNombre,
  esAdjuntoOutlookEmbeddedIgnorable,
  nombreBaseActaRepartoSiEsSecPdf,
  type ArchivoImportRow,
} from '@/lib/proceso-import-shared'
import { extraerTexto } from '@/lib/extract-documento'
import { consolidarZipTutelaEnLinea, type InnerZipEntry } from '@/lib/eml-tutela-zip-consolidar'

const EXT_TXT = ['.pdf', '.doc', '.docx', '.txt']

/** Solo dominios de la Rama / entorno judicial (evita SSRF a redes internas). */
export function urlPermitidaDescargaJudicial(urlStr: string): boolean {
  try {
    const u = new URL(urlStr)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const h = u.hostname.toLowerCase()
    if (h.startsWith('ejemplo.') || h.includes('.ejemplo.')) return false
    return h === 'ramajudicial.gov.co' || h.endsWith('.ramajudicial.gov.co')
  } catch {
    return false
  }
}

/** Expande enlaces de Outlook Safe Links al destino real (p. ej. cendoj.ramajudicial.gov.co). */
export function expandirUrlSiSafelinks(urlStr: string): string {
  try {
    const u = new URL(urlStr)
    if (/safelinks\.protection\.outlook\.com$/i.test(u.hostname)) {
      const inner = u.searchParams.get('url')
      if (inner) return decodeURIComponent(inner)
    }
  } catch {
    /* vacío */
  }
  return urlStr
}

function inferirBaseRama(html: string): string {
  const m =
    /https?:\/\/([a-z0-9.-]+\.ramajudicial\.gov\.co)/i.exec(html) ||
    /https%3A%2F%2F([a-z0-9.-]+\.ramajudicial\.gov\.co)/i.exec(html)
  if (m?.[1]) return `https://${m[1]}`
  return 'https://www.ramajudicial.gov.co'
}

/** Convierte href relativo o protocol-relative en URL absoluta si es posible. */
function normalizarHrefAUrl(href: string, baseRama: string): string | null {
  const h = href.trim().replace(/&amp;/g, '&')
  if (!h || h.startsWith('mailto:') || h.startsWith('javascript:') || h.startsWith('#')) return null
  if (/^https?:\/\//i.test(h)) return h.split('#')[0] ?? h
  if (h.startsWith('//')) return `https:${h}`.split('#')[0] ?? `https:${h}`
  try {
    if (h.startsWith('/')) return new URL(h, baseRama).href.split('#')[0] ?? new URL(h, baseRama).href
    return new URL(h, baseRama + '/').href.split('#')[0] ?? null
  } catch {
    return null
  }
}

/**
 * Extrae candidatos a descarga: href (absolutos, relativos, //), y enlaces típicos de tutela en línea.
 */
export function extraerEnlacesHttpsDelHtml(html: string): string[] {
  const baseRama = inferirBaseRama(html)
  const set = new Set<string>()

  const quoted = /href\s*=\s*["']([^"']+)["']/gi
  let m
  while ((m = quoted.exec(html))) {
    const raw = m[1]?.trim()
    if (!raw) continue
    const u = normalizarHrefAUrl(raw, baseRama)
    if (u) set.add(expandirUrlSiSafelinks(u))
  }

  const unquoted = /href\s*=\s*([^\s<>"']+)/gi
  while ((m = unquoted.exec(html))) {
    const raw = m[1]?.trim().replace(/[,;]+$/, '')
    if (!raw) continue
    const u = normalizarHrefAUrl(raw, baseRama)
    if (u) set.add(expandirUrlSiSafelinks(u))
  }

  const srcQuoted = /src\s*=\s*["']([^"']+)["']/gi
  while ((m = srcQuoted.exec(html))) {
    const raw = m[1]?.trim()
    if (!raw) continue
    const u = normalizarHrefAUrl(raw, baseRama)
    if (u) set.add(expandirUrlSiSafelinks(u))
  }

  return [...set]
}

function esBufferProbableZip(buf: Buffer): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)
  )
}

export type ResultadoEnlace = { ok: true; archivos: ArchivoImportRow[] } | { ok: false; url: string; error: string }

/**
 * Descarga enlaces permitidos; si es ZIP, descomprime y clasifica archivos (acta, demanda, etc.).
 */
export async function descargarArchivosDesdeEnlacesHtml(
  html: string,
  prefijoNombre: string
): Promise<{ archivos: ArchivoImportRow[]; textosExtra: string[]; avisos: string[] }> {
  const urls = extraerEnlacesHttpsDelHtml(html)
  const archivos: ArchivoImportRow[] = []
  const textosExtra: string[] = []
  const avisos: string[] = []
  let avisoZipTutelaLinea = false

  for (const url of urls) {
    if (!urlPermitidaDescargaJudicial(url)) {
      avisos.push(`Omitido (dominio no permitido): ${url}`)
      continue
    }
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 90_000)
      let referer = 'https://www.ramajudicial.gov.co/'
      try {
        const u0 = new URL(url)
        if (u0.hostname.endsWith('.ramajudicial.gov.co') || u0.hostname === 'ramajudicial.gov.co') {
          referer = `${u0.protocol}//${u0.hostname}/`
        }
      } catch {
        /* vacío */
      }
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'JudicialSys/1.0 (importación EML; expediente judicial)',
          Accept: 'application/zip,application/pdf,application/octet-stream,*/*',
          Referer: referer,
        },
        redirect: 'follow',
      })
      clearTimeout(timer)
      if (!res.ok) {
        avisos.push(`HTTP ${res.status}: ${url}`)
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      const max = 52 * 1024 * 1024
      if (buf.length > max) {
        avisos.push(`Archivo demasiado grande (${url})`)
        continue
      }
      const cd = res.headers.get('content-disposition') || ''
      const mName = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd)
      const fromUrl = new URL(url).pathname.split('/').pop() || 'descarga'
      let baseName = (mName?.[1] || fromUrl).replace(/[/\\]/g, '_')
      if (!baseName.includes('.')) baseName += '.bin'

      const ct = (res.headers.get('content-type') || '').toLowerCase()

      const pareceOfficeZip =
        /\.(docx|xlsx|pptx|odt|ods|odp)$/i.test(baseName)
      const tratarComoZip =
        baseName.toLowerCase().endsWith('.zip') ||
        ct.includes('zip') ||
        (esBufferProbableZip(buf) && !pareceOfficeZip)

      if (tratarComoZip) {
        let zip: JSZip | null = null
        try {
          zip = await JSZip.loadAsync(buf)
        } catch {
          zip = null
        }
        if (zip) {
          const nFiles = Object.values(zip.files).filter((e) => !e.dir).length
          if (nFiles === 0) zip = null
        }
        if (zip) {
          if (!avisoZipTutelaLinea) {
            avisoZipTutelaLinea = true
            textosExtra.push(
              '[ZIP desde enlace del correo — típico enlace «Archivo» en tutela en línea: DEMANDA_, PRUEBA_ y PODER_ dentro del ZIP; se consolidan en Demanda.pdf, PruebasAnexos.pdf y Poder.pdf si aplica]'
            )
          }
          const prefijoZip = baseName.replace(/\.(zip|bin)$/i, '') || 'descarga'
          const basePath = `${prefijoNombre}/zip_link_${prefijoZip}`
          const innerList: InnerZipEntry[] = []
          for (const [pathRel, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue
            const inner = pathRel.split('/').pop() || pathRel
            if (inner.startsWith('._') || inner === '.DS_Store') continue
            if (esAdjuntoOutlookEmbeddedIgnorable(inner)) continue
            const innerBuf = Buffer.from(await entry.async('arraybuffer'))
            innerList.push({
              relativePath: pathRel.replace(/\\/g, '/'),
              buffer: innerBuf,
            })
          }
          if (innerList.length === 0) {
            avisos.push(`ZIP sin archivos útiles (solo carpetas o metadatos): ${url}`)
            continue
          }
          const consolidados = await consolidarZipTutelaEnLinea(innerList, basePath)
          archivos.push(...consolidados)
          for (const row of consolidados) {
            const leaf = row.nombre.split('/').pop() || row.nombre
            if (EXT_TXT.some((e) => leaf.toLowerCase().endsWith(e))) {
              const t = await extraerTexto(row.buffer, leaf)
              if (t) textosExtra.push(`[${leaf}]\n${t}`)
            }
          }
        } else if (baseName.toLowerCase().endsWith('.pdf') || ct.includes('pdf')) {
          const baseRen = nombreBaseActaRepartoSiEsSecPdf(baseName)
          archivos.push({
            nombre: `${prefijoNombre}/link_${baseRen}`,
            buffer: buf,
            carpeta: clasificarCarpetaNombre(baseRen),
          })
          const t = await extraerTexto(buf, baseRen)
          if (t) textosExtra.push(`[${baseRen}]\n${t}`)
        } else {
          avisos.push(
            `Respuesta con firma ZIP pero no se pudo abrir como ZIP (¿HTML de error o enlace caducado?): ${url}`
          )
          archivos.push({
            nombre: `${prefijoNombre}/link_${baseName}`,
            buffer: buf,
            carpeta: clasificarCarpetaNombre(baseName),
          })
        }
      } else if (baseName.toLowerCase().endsWith('.pdf') || ct.includes('pdf')) {
        const baseRen = nombreBaseActaRepartoSiEsSecPdf(baseName)
        archivos.push({
          nombre: `${prefijoNombre}/link_${baseRen}`,
          buffer: buf,
          carpeta: clasificarCarpetaNombre(baseRen),
        })
        const t = await extraerTexto(buf, baseRen)
        if (t) textosExtra.push(`[${baseRen}]\n${t}`)
      } else {
        archivos.push({
          nombre: `${prefijoNombre}/link_${baseName}`,
          buffer: buf,
          carpeta: clasificarCarpetaNombre(baseName),
        })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error'
      avisos.push(`No descargado (${msg}): ${url}`)
    }
  }

  return { archivos, textosExtra, avisos }
}
