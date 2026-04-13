/**
 * Reemplazo mínimo de `next/dist/compiled/@vercel/og` para Workers CF:
 * evita resvg.wasm / yoga (~2 MiB+ sin comprimir) si Next los enlaza aunque no uses `next/og`.
 */
export class ImageResponse extends Response {
  constructor(..._args: unknown[]) {
    super(JSON.stringify({ error: 'ImageResponse no disponible en este despliegue' }), {
      status: 501,
      headers: { 'content-type': 'application/json' },
    })
  }
}
