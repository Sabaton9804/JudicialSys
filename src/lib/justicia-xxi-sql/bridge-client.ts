import type { CredencialesJusticiaXxiInput } from './config'
import type { ResultadoRadicacionJusticiaXxi } from './radicar-proceso'
import { leerOCrearSecretPuenteJusticiaXxi, leerSecretPuenteSoloLectura } from './bridge-secret'

function baseUrlPuente(): string | null {
  if (process.env.JUSTICIA_XXI_BRIDGE_DISABLED === '1') return null
  const u = process.env.JUSTICIA_XXI_BRIDGE_URL?.trim()
  if (u) return u.replace(/\/$/, '')
  if (process.env.NODE_ENV === 'production') return null
  return 'http://127.0.0.1:3847'
}

function secretPuente(): string | null {
  const crear = process.env.NODE_ENV !== 'production'
  return leerOCrearSecretPuenteJusticiaXxi(crear)
}

/**
 * En desarrollo: URL por defecto http://127.0.0.1:3847 y secreto en .judicialsys-bridge-secret
 * (creado al arrancar el puente o al primer uso). En producción hace falta JUSTICIA_XXI_BRIDGE_URL
 * y JUSTICIA_XXI_BRIDGE_SECRET (o el mismo archivo desplegado de forma segura).
 */
export function justiciaXxiPuenteConfigurado(): boolean {
  return Boolean(baseUrlPuente() && secretPuente())
}

/** Para UI/API sin efectos secundarios: ¿hay URL de puente y secreto ya existente? */
export function justiciaXxiPuenteResueltoSinEfectos(): boolean {
  if (process.env.JUSTICIA_XXI_BRIDGE_DISABLED === '1') return false
  return Boolean(baseUrlPuente() && leerSecretPuenteSoloLectura())
}

/** Comprueba si el proceso del puente está vivo (GET /health). Solo servidor Next; no use en el navegador. */
export async function puenteJusticiaXxiRespondeHealth(): Promise<boolean> {
  const base = baseUrlPuente()
  if (!base) return false
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return false
    const j = (await res.json().catch(() => null)) as { ok?: boolean; service?: string } | null
    return j?.ok === true && j?.service === 'justicia-xxi-bridge'
  } catch {
    return false
  }
}

function cadenasCausaError(err: unknown, maxDepth = 6): string[] {
  const out: string[] = []
  let cur: unknown = err
  for (let i = 0; i < maxDepth && cur; i++) {
    if (cur instanceof Error && cur.message) out.push(cur.message)
    const next =
      cur instanceof Error && 'cause' in cur
        ? (cur as Error & { cause?: unknown }).cause
        : undefined
    cur = next ?? null
  }
  return out
}

function mensajeFalloContactoPuente(base: string, err: unknown): string {
  const cadenas = cadenasCausaError(err)
  const texto = cadenas.join(' ').toLowerCase()
  const refused =
    texto.includes('econnrefused') ||
    texto.includes('connection refused') ||
    (cadenas.length === 0 && texto.includes('fetch failed'))

  const partes = [
    `No se pudo contactar el puente en ${base}.`,
    refused
      ? 'Nadie escucha en ese puerto (conexión rechazada).'
      : 'Falló la petición HTTP al puente.',
  ]

  partes.push(
    'Compruebe: 1) Otra ventana con «npm run justicia-xxi:bridge» abierta y sin error. 2) Mismo puerto (3847 o el de JUSTICIA_XXI_BRIDGE_PORT).'
  )

  if (process.env.WSL_DISTRO_NAME && (base.includes('127.0.0.1') || base.includes('localhost'))) {
    partes.push(
      '3) Si Next.js corre en WSL y el puente en Windows: en .env use JUSTICIA_XXI_BRIDGE_URL=http://IPV4_DE_WINDOWS:3847 (ipconfig). En la terminal del puente use JUSTICIA_XXI_BRIDGE_BIND=0.0.0.0 para que escuche en la red (y permita el puerto en el firewall de Windows).'
    )
  }

  if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
    partes.push(
      '4) Tiene proxy HTTP definido: pruebe NO_PROXY=127.0.0.1,localhost en el entorno donde corre «npm run dev».'
    )
  }

  if (cadenas.length) {
    partes.push(`Detalle: ${cadenas[0]}`)
  }

  return partes.join(' ')
}

/** Tiempo máximo que Next espera al puente (login SQL + inserts pueden superar 2 min en redes lentas). */
const BRIDGE_FETCH_MS = (() => {
  const n = Number(process.env.JUSTICIA_XXI_BRIDGE_FETCH_MS)
  if (Number.isFinite(n) && n >= 5000) return Math.min(n, 600_000)
  return 180_000
})()

export async function radicarMediantePuenteLocal(
  procesoId: string,
  credenciales?: CredencialesJusticiaXxiInput | null
): Promise<ResultadoRadicacionJusticiaXxi> {
  const base = baseUrlPuente()
  const secret = secretPuente()
  if (!base || !secret) {
    return {
      ok: false,
      codigo: 'no_config',
      mensaje:
        'Puente Justicia XXI: en producción defina JUSTICIA_XXI_BRIDGE_URL y JUSTICIA_XXI_BRIDGE_SECRET. En desarrollo arranque «npm run justicia-xxi:bridge» (se crea .judicialsys-bridge-secret si hace falta).',
    }
  }
  const url = `${base}/radicar`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        procesoId,
        justiciaXxiSqlServer: credenciales?.sqlServer,
        justiciaXxiSqlPort: credenciales?.sqlPort,
        justiciaXxiSqlDatabase: credenciales?.sqlDatabase,
        justiciaXxiSqlUser: credenciales?.sqlUser,
        justiciaXxiSqlPassword: credenciales?.sqlPassword,
        justiciaXxiSqlWindowsAuth: credenciales?.sqlWindowsAuth,
      }),
      signal: AbortSignal.timeout(BRIDGE_FETCH_MS),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      if (data.ok === false && typeof data.codigo === 'string' && typeof data.mensaje === 'string') {
        const c = data.codigo
        if (c === 'no_config' || c === 'no_radicado' || c === 'sql' || c === 'no_proceso') {
          return { ok: false, codigo: c, mensaje: data.mensaje }
        }
      }
      return {
        ok: false,
        codigo: 'sql',
        mensaje:
          typeof data.mensaje === 'string'
            ? data.mensaje
            : `El puente Justicia XXI respondió HTTP ${res.status}`,
      }
    }
    if (data.ok === true && typeof data.llave === 'string' && typeof data.yaExistia === 'boolean') {
      return { ok: true, llave: data.llave, yaExistia: data.yaExistia }
    }
    return {
      ok: false,
      codigo: 'sql',
      mensaje: 'Respuesta inválida del puente Justicia XXI',
    }
  } catch (e) {
    const abortado =
      e instanceof Error &&
      (e.name === 'TimeoutError' ||
        e.name === 'AbortError' ||
        /aborted|timeout/i.test(e.message))
    return {
      ok: false,
      codigo: 'sql',
      mensaje: abortado
        ? `El puente en ${base} no respondió en ${BRIDGE_FETCH_MS / 1000} s (SQL lento o sin red al servidor). Puede subir JUSTICIA_XXI_BRIDGE_FETCH_MS o revisar firewall/VPN hacia el SQL.`
        : mensajeFalloContactoPuente(base, e),
    }
  }
}
