const err = () => {
  throw new Error('mammoth no disponible en despliegue Cloudflare (stub).')
}
export default {
  convertToHtml: err,
  extractRawText: err,
}
