export type ParsedMail = { text?: string; html?: string; subject?: string }

export async function simpleParser(_source: unknown): Promise<ParsedMail> {
  void _source
  throw new Error('mailparser no disponible en despliegue Cloudflare (stub).')
}
