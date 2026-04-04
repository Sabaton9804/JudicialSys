/**
 * Lista blanca ligera para HTML de plantillas: evita scripts y handlers.
 * No sustituye un motor DOMPurify completo; refuerza confianza en contenido guardado por admins.
 */
export function sanearHtmlPlantilla(html: string): string {
  let s = html
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  s = s.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
  s = s.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
  s = s.replace(/<embed\b[^>]*>/gi, '')
  s = s.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
  s = s.replace(/on\w+\s*=\s*[^\s>]+/gi, '')
  s = s.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
  s = s.replace(/href\s*=\s*["']data:[^"']*["']/gi, 'href="#"')
  return s
}
