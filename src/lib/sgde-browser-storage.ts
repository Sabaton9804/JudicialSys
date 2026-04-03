/**
 * Credenciales SGDE solo en el navegador (localStorage).
 * Uso interno: no sustituye un login corporativo seguro; evita repetir usuario/clave en cada expediente.
 */

const KEY = 'judicialsys_sgde_credentials_v1'

export type SgdeCredencialesGuardadas = { usuario: string; password: string }

export function cargarSgdeDesdeNavegador(): SgdeCredencialesGuardadas | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return null
    const u = (data as { usuario?: string }).usuario
    const p = (data as { password?: string }).password
    if (typeof u !== 'string' || typeof p !== 'string' || !u.trim() || !p) return null
    return { usuario: u.trim(), password: p }
  } catch {
    return null
  }
}

export function guardarSgdeEnNavegador(usuario: string, password: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ usuario: usuario.trim(), password })
    )
  } catch {
    /* quota / privado */
  }
}

export function borrarSgdeDelNavegador(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
