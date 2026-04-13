/** Stub CF: evita empaquetar el SDK completo de OpenAI. */
export default class OpenAI {
  constructor(_opts?: unknown) {
    void _opts
  }
  get chat() {
    return {
      completions: {
        create: async () => {
          throw new Error('OpenAI no configurado en despliegue Cloudflare (stub).')
        },
      },
    }
  }
}
