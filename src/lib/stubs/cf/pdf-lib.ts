/** Stub CF: sin pdf-lib en el worker. */
export const rgb = { r: 0, g: 0, b: 0 }
export const StandardFonts = { Helvetica: 'Helvetica' }
export class PDFDocument {
  static async create() {
    throw new Error('pdf-lib no disponible en despliegue Cloudflare (stub).')
  }
  static async load(_data: Uint8Array | ArrayBuffer) {
    void _data
    throw new Error('pdf-lib no disponible en despliegue Cloudflare (stub).')
  }
}
