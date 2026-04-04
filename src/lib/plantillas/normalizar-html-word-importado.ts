/**
 * Tras importar .docx con Mammoth, Word suele dejar imágenes con float:left/right
 * y anchos fijos enormes; el resultado se ve “roto” en pantalla y en PDF.
 * Aquí se limpia solo el HTML importado (no afecta edición manual posterior).
 */
export function normalizarHtmlWordImportado(html: string): string {
  if (typeof document === 'undefined') return html
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div id="__w">${html}</div>`, 'text/html')
    const root = doc.getElementById('__w')
    if (!root) return html

    root.querySelectorAll('img').forEach((img) => {
      img.removeAttribute('width')
      img.removeAttribute('height')
      img.style.float = 'none'
      img.style.display = 'block'
      img.style.margin = '0.75em auto'
      img.style.maxWidth = '200px'
      img.style.maxHeight = '140px'
      img.style.width = 'auto'
      img.style.height = 'auto'
      img.style.objectFit = 'contain'
    })

    root.querySelectorAll('table').forEach((t) => {
      if (!t.style.width) t.style.width = '100%'
      t.style.borderCollapse = 'collapse'
    })

    return root.innerHTML
  } catch {
    return html
  }
}
