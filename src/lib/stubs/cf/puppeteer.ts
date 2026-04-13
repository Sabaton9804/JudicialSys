/**
 * Stub para builds Cloudflare (JUDICIALSYS_CF_BUILD=1): no incluye Chromium ni el paquete puppeteer.
 * La generación de PDF con Chromium solo está soportada en despliegue Node/VPS.
 */
export default {
  async launch(): Promise<never> {
    throw new Error(
      'Puppeteer/Chromium no está disponible en el Worker de Cloudflare. Despliegue en Node.js o use rutas que generen PDF sin Chromium (p. ej. pdf-lib).'
    )
  },
}
