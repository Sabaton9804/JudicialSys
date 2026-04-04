/**
 * Fuentes para el editor de plantillas. `google: true` → se cargan desde Google Fonts en el cliente.
 * Incluye fuentes de sistema y ~80 familias de Google para vista previa.
 */
export type EntradaFuenteEditor = {
  label: string
  /** Valor CSS para font-family */
  value: string
  /** Si se solicita desde fonts.googleapis.com */
  google?: boolean
}

function g(label: string, cssName: string): EntradaFuenteEditor {
  return { label, value: `'${cssName}', sans-serif`, google: true }
}

function gs(label: string, cssName: string): EntradaFuenteEditor {
  return { label, value: `'${cssName}', serif`, google: true }
}

function gm(label: string, cssName: string): EntradaFuenteEditor {
  return { label, value: `'${cssName}', monospace`, google: true }
}

export const FUENTES_EDITOR: EntradaFuenteEditor[] = [
  { label: 'Predeterminada (heredada)', value: '' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Arial Narrow', value: '"Arial Narrow", "Arial MT Narrow", Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Lucida Console', value: '"Lucida Console", monospace' },
  { label: 'Palatino Linotype', value: '"Palatino Linotype", Palatino, serif' },
  { label: 'Segoe UI', value: '"Segoe UI", Tahoma, sans-serif' },
  { label: 'Calibri', value: 'Calibri, "Segoe UI", sans-serif' },
  { label: 'Cambria', value: 'Cambria, Georgia, serif' },
  { label: 'Candara', value: 'Candara, Verdana, sans-serif' },
  { label: 'Consolas', value: 'Consolas, monospace' },
  { label: 'Constantia', value: 'Constantia, Georgia, serif' },
  { label: 'Corbel', value: 'Corbel, sans-serif' },
  { label: 'Franklin Gothic', value: '"Franklin Gothic Medium", Arial, sans-serif' },
  { label: 'Garamond', value: 'Garamond, Georgia, serif' },
  { label: 'Century Gothic', value: '"Century Gothic", sans-serif' },
  g('Roboto', 'Roboto'),
  g('Open Sans', 'Open Sans'),
  g('Lato', 'Lato'),
  g('Montserrat', 'Montserrat'),
  g('Source Sans 3', 'Source Sans 3'),
  g('Raleway', 'Raleway'),
  g('PT Sans', 'PT Sans'),
  g('Nunito', 'Nunito'),
  g('Ubuntu', 'Ubuntu'),
  g('Rubik', 'Rubik'),
  g('Work Sans', 'Work Sans'),
  g('Fira Sans', 'Fira Sans'),
  g('Noto Sans', 'Noto Sans'),
  g('Inter', 'Inter'),
  g('DM Sans', 'DM Sans'),
  g('Barlow', 'Barlow'),
  g('Cabin', 'Cabin'),
  g('Lexend', 'Lexend'),
  g('Manrope', 'Manrope'),
  g('Mulish', 'Mulish'),
  g('Outfit', 'Outfit'),
  g('Poppins', 'Poppins'),
  g('Quicksand', 'Quicksand'),
  g('Space Grotesk', 'Space Grotesk'),
  g('Titillium Web', 'Titillium Web'),
  g('Exo 2', 'Exo 2'),
  g('Oswald', 'Oswald'),
  g('Bebas Neue', 'Bebas Neue'),
  g('Anton', 'Anton'),
  g('Teko', 'Teko'),
  g('Rajdhani', 'Rajdhani'),
  g('Orbitron', 'Orbitron'),
  g('Dosis', 'Dosis'),
  g('Josefin Sans', 'Josefin Sans'),
  g('Karla', 'Karla'),
  g('Signika Negative', 'Signika Negative'),
  g('Varela Round', 'Varela Round'),
  g('Asap', 'Asap'),
  g('Hind', 'Hind'),
  g('Mukta', 'Mukta'),
  g('Noto Sans JP', 'Noto Sans JP'),
  gs('Merriweather', 'Merriweather'),
  gs('Playfair Display', 'Playfair Display'),
  gs('Lora', 'Lora'),
  gs('Libre Baskerville', 'Libre Baskerville'),
  gs('EB Garamond', 'EB Garamond'),
  gs('Crimson Text', 'Crimson Text'),
  gs('Spectral', 'Spectral'),
  gs('Bitter', 'Bitter'),
  gs('Domine', 'Domine'),
  gs('Alegreya', 'Alegreya'),
  gs('Cormorant Garamond', 'Cormorant Garamond'),
  gs('Cinzel', 'Cinzel'),
  gs('Zilla Slab', 'Zilla Slab'),
  gs('Newsreader', 'Newsreader'),
  gs('Fraunces', 'Fraunces'),
  gs('Source Serif 4', 'Source Serif 4'),
  gm('Roboto Mono', 'Roboto Mono'),
  gm('Source Code Pro', 'Source Code Pro'),
  gm('Fira Code', 'Fira Code'),
  gm('JetBrains Mono', 'JetBrains Mono'),
  gm('IBM Plex Mono', 'IBM Plex Mono'),
  g('Dancing Script', 'Dancing Script'),
  g('Pacifico', 'Pacifico'),
  g('Lobster', 'Lobster'),
  g('Satisfy', 'Satisfy'),
  g('Caveat', 'Caveat'),
  g('Great Vibes', 'Great Vibes'),
  g('Permanent Marker', 'Permanent Marker'),
  g('Shadows Into Light', 'Shadows Into Light'),
  g('Indie Flower', 'Indie Flower'),
  g('Amatic SC', 'Amatic SC'),
  g('Righteous', 'Righteous'),
  g('Figtree', 'Figtree'),
  g('Sora', 'Sora'),
  g('Epilogue', 'Epilogue'),
  g('Red Hat Display', 'Red Hat Display'),
]

/** Nombres de familia para la API de Google Fonts (mismo texto que label de entradas google). */
export function nombresFuentesGoogle(): string[] {
  return FUENTES_EDITOR.filter((f) => f.google).map((f) => f.label)
}

/** Construye una o varias URLs de CSS (lotes para no exceder límites de URL). */
export function urlsGoogleFontsCss(): string[] {
  const names = nombresFuentesGoogle()
  const batchSize = 35
  const urls: string[] = []
  for (let i = 0; i < names.length; i += batchSize) {
    const chunk = names.slice(i, i + batchSize)
    const q = chunk.map((n) => `family=${encodeURIComponent(n)}`).join('&')
    urls.push(`https://fonts.googleapis.com/css2?${q}&display=swap`)
  }
  return urls
}
