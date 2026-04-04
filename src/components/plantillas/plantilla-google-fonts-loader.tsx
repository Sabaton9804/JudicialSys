'use client'

import { useEffect } from 'react'
import { urlsGoogleFontsCss } from '@/lib/plantillas/fuentes-editor-plantilla'

const LINK_ID_PREFIX = 'plantilla-editor-gf-'

/**
 * Carga en el documento las hojas de estilo de Google Fonts usadas en el selector de fuentes.
 */
export function PlantillaGoogleFontsLoader() {
  useEffect(() => {
    const urls = urlsGoogleFontsCss()
    urls.forEach((href, i) => {
      const id = `${LINK_ID_PREFIX}${i}`
      if (document.getElementById(id)) return
      const link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      link.href = href
      document.head.appendChild(link)
    })
  }, [])
  return null
}
