import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

/** Archivo local (no va a git) cuando no puede usarse JUSTICIA_XXI_BRIDGE_SECRET en .env */
export const JUSTICIA_XXI_BRIDGE_SECRET_FILE = join(process.cwd(), '.judicialsys-bridge-secret')

const MIN_LEN = 16

/** Solo lectura (p. ej. sql-hints); no crea archivo. */
export function leerSecretPuenteSoloLectura(): string | null {
  const env = process.env.JUSTICIA_XXI_BRIDGE_SECRET?.trim()
  if (env && env.length >= MIN_LEN) return env
  try {
    if (existsSync(JUSTICIA_XXI_BRIDGE_SECRET_FILE)) {
      const f = readFileSync(JUSTICIA_XXI_BRIDGE_SECRET_FILE, 'utf8').trim()
      if (f.length >= MIN_LEN) return f
    }
  } catch {
    /* ignorar lectura rota */
  }
  return null
}

/**
 * Secreto Bearer del puente: variable de entorno, o archivo `.judicialsys-bridge-secret`.
 * Si `crearSiFalta` y no hay ninguno, genera y guarda el archivo (modo desarrollo / primer arranque).
 */
export function leerOCrearSecretPuenteJusticiaXxi(crearSiFalta: boolean): string | null {
  const ya = leerSecretPuenteSoloLectura()
  if (ya) return ya

  if (!crearSiFalta) return null

  const secret = randomBytes(24).toString('base64url')
  try {
    writeFileSync(JUSTICIA_XXI_BRIDGE_SECRET_FILE, `${secret}\n`, { encoding: 'utf8', mode: 0o600 })
    console.warn(
      `[justicia-xxi-bridge] Secreto guardado en ${JUSTICIA_XXI_BRIDGE_SECRET_FILE} (ignorado por git). Opcional: copie el valor a JUSTICIA_XXI_BRIDGE_SECRET en .env`
    )
  } catch (e) {
    console.error('[justicia-xxi-bridge] No se pudo escribir el archivo de secreto:', e)
    return null
  }
  return secret
}
