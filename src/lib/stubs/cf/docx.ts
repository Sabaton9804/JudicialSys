/** Stub CF: la ruta `/api/documentos/word` no genera DOCX real en Workers free. */
export const AlignmentType = { CENTER: 'center' }
export const PageNumber = { CURRENT: 'current' }
export class TextRun {
  constructor(public text?: string) {}
}
export class Paragraph {
  constructor(_opts?: unknown) {}
}
export class Header {
  constructor(_opts?: unknown) {}
}
export class Footer {
  constructor(_opts?: unknown) {}
}
export class Document {
  constructor(_opts?: unknown) {}
}
export const Packer = {
  async toBuffer(_doc: unknown): Promise<Buffer> {
    void _doc
    return Buffer.from('')
  },
}
