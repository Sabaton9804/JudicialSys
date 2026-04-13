/**
 * Conexión a SQL Server del juzgado (Justicia XXI / BD consejo).
 * Caso habitual empleado judicial: usuario y contraseña SQL del SIJC + IP del servidor (Tedious, sin msnodesqlv8).
 * Puede armarse solo con datos del formulario en la app, solo con .env, o mezclando.
 */

import { parseSqlConnectionString } from '@tediousjs/connection-string'

export type CredencialesJusticiaXxiInput = {
  sqlServer?: string | null
  /** Puerto TCP (ej. 1433). Opcional si el servidor ya trae puerto o instancia con \ */
  sqlPort?: string | null
  sqlDatabase?: string | null
  sqlUser?: string | null
  /** Si no se envía (undefined), en modo mezcla puede tomarse de env. Cadena vacía = sin clave. */
  sqlPassword?: string | null
  /**
   * Igual que ODBC Trusted_Connection=Yes: identidad Windows del proceso Node.
   * El driver Tedious de `mssql` no implementa integrada (usa login SQL vacío → error).
   * JudicialSys usa `mssql/msnodesqlv8` con esta cadena (solo Windows, requiere `msnodesqlv8` instalado).
   */
  sqlWindowsAuth?: boolean | null
}

export type JusticiaXxiSqlConfig =
  | {
      ok: true
      mssqlConnect: string
      /**
       * true = usar `mssql/msnodesqlv8` con Trusted_Connection (Windows + addon nativo).
       * false/omitido = Tedious (`mssql` por defecto), usuario/clave SQL.
       */
      trustedConnectionWindows?: boolean
    }
  | { ok: false; motivo: string }

function inputAportaPartes(input?: CredencialesJusticiaXxiInput | null): boolean {
  if (!input) return false
  return Boolean(
    input.sqlServer?.trim() ||
      input.sqlPort?.trim() ||
      input.sqlUser?.trim() ||
      input.sqlDatabase?.trim() ||
      input.sqlWindowsAuth === true ||
      (input.sqlPassword != null && String(input.sqlPassword).length > 0)
  )
}

function windowsAuthActivo(input?: CredencialesJusticiaXxiInput | null): boolean {
  if (input?.sqlWindowsAuth === true) return true
  if (input?.sqlUser?.trim()) return false
  const v = process.env.JUSTICIA_XXI_SQL_WINDOWS_AUTH?.toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

/** Server en cadena ADO.NET: host,puerto o host\instancia */
function construirServerParaConexion(host: string, puerto?: string | null): string {
  const h = host.trim()
  const p = puerto?.trim() || ''
  if (!p || !/^\d{1,5}$/.test(p)) return h
  if (h.includes(',') || h.includes('\\')) return h
  return `${h},${p}`
}

/** Evita que `connect()` espere minutos si la IP no responde (VPN caída, firewall, etc.). */
function segundosTimeoutConexionSql(): number {
  const n = Number(process.env.JUSTICIA_XXI_SQL_CONNECTION_TIMEOUT_SEC)
  if (Number.isFinite(n) && n >= 5 && n <= 120) return Math.floor(n)
  return 25
}

function conTimeoutEnCadena(connectionString: string): string {
  if (/connection\s*timeout\s*=/i.test(connectionString)) return connectionString
  return `${connectionString};Connection Timeout=${segundosTimeoutConexionSql()}`
}

function cadenaPideTrustedOIntegrated(envFull: string): boolean {
  try {
    const p = parseSqlConnectionString(envFull, true, true)
    const integ = p['integrated security']
    const tc = String(p['trusted_connection'] ?? '').toLowerCase()
    return (
      integ === true ||
      String(integ).toLowerCase() === 'true' ||
      String(integ).toLowerCase() === 'sspi' ||
      tc === 'yes' ||
      tc === 'true'
    )
  } catch {
    return false
  }
}

/**
 * Resuelve la cadena de conexión: cadena completa en env (si no hay datos en formulario),
 * o Server + Database + User + Password mezclando formulario y variables opcionales.
 */
export function resolverConfigSqlJusticiaXxi(input?: CredencialesJusticiaXxiInput | null): JusticiaXxiSqlConfig {
  const envFull = process.env.JUSTICIA_XXI_SQL_CONNECTION_STRING?.trim()

  if (envFull && !inputAportaPartes(input)) {
    const withT = conTimeoutEnCadena(envFull)
    if (cadenaPideTrustedOIntegrated(envFull)) {
      return { ok: true, mssqlConnect: withT, trustedConnectionWindows: true }
    }
    return { ok: true, mssqlConnect: withT }
  }

  const serverRaw = (input?.sqlServer?.trim() || process.env.JUSTICIA_XXI_SQL_SERVER?.trim() || '')
  const portRaw = (input?.sqlPort?.trim() || process.env.JUSTICIA_XXI_SQL_PORT?.trim() || '')
  const server = construirServerParaConexion(serverRaw, portRaw)
  const database = (input?.sqlDatabase?.trim() || process.env.JUSTICIA_XXI_SQL_DATABASE?.trim() || 'consejo')
  const user = (input?.sqlUser?.trim() || process.env.JUSTICIA_XXI_SQL_USER?.trim() || '')

  let password: string
  if (input?.sqlPassword !== undefined && input?.sqlPassword !== null) {
    password = String(input.sqlPassword)
  } else {
    password = process.env.JUSTICIA_XXI_SQL_PASSWORD ?? ''
  }

  const winAuth = windowsAuthActivo(input)

  if (!server) {
    return {
      ok: false,
      motivo:
        'Falta el equipo servidor (IP o nombre). Si usa la misma conexión que el DSN csjsql, indique el servidor que aparece en ODBC.',
    }
  }

  if (!winAuth && !user) {
    return {
      ok: false,
      motivo:
        'Indique usuario y contraseña SQL, o active «Usar cuenta de Windows» si conecta como el DSN csjsql (Trusted_Connection).',
    }
  }

  /**
   * Por defecto Encrypt=false: Tedious + OpenSSL en Node fallan a menudo contra SQL antiguo
   * (`unsupported protocol`); el ODBC del juzgado (p. ej. SQLSRV32) suele no negociar TLS igual.
   * Para Azure / SQL moderno con TLS obligatorio: JUSTICIA_XXI_SQL_ENCRYPT=true
   */
  const encrypt = process.env.JUSTICIA_XXI_SQL_ENCRYPT === 'true'
  const trust = process.env.JUSTICIA_XXI_SQL_TRUST_CERT !== 'false'

  if (winAuth) {
    const parts = [
      `Server=${server}`,
      `Database=${database}`,
      'Trusted_Connection=yes',
      encrypt ? 'Encrypt=true' : 'Encrypt=false',
      trust ? 'TrustServerCertificate=true' : 'TrustServerCertificate=false',
    ]
    return { ok: true, mssqlConnect: conTimeoutEnCadena(parts.join(';')), trustedConnectionWindows: true }
  }

  const parts = [
    `Server=${server}`,
    `Database=${database}`,
    `User Id=${user}`,
    `Password=${password}`,
    encrypt ? 'Encrypt=true' : 'Encrypt=false',
    trust ? 'TrustServerCertificate=true' : 'TrustServerCertificate=false',
  ]
  return { ok: true, mssqlConnect: conTimeoutEnCadena(parts.join(';')) }
}

/** @deprecated Use resolverConfigSqlJusticiaXxi(null). */
export function obtenerConfigSqlJusticiaXxi(): JusticiaXxiSqlConfig {
  return resolverConfigSqlJusticiaXxi(null)
}

/** @deprecated Ya no es obligatorio JUSTICIA_XXI_SQL_ENABLED si usa credenciales en pantalla. */
export function justiciaXxiSqlHabilitadoEnEnv(): boolean {
  const v = process.env.JUSTICIA_XXI_SQL_ENABLED?.toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  return Boolean(process.env.JUSTICIA_XXI_SQL_CONNECTION_STRING?.trim())
}
