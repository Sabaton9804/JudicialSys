function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Sustituye {{clave}} por valores escapados (contenido de plantilla, no HTML crudo de usuario).
 */
export function reemplazarVariablesPlantilla(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key]
    return v != null ? escHtml(String(v)) : ''
  })
}
