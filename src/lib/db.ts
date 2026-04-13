import { PrismaClient } from '@prisma/client'
import sql from 'mssql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/** Pool Tedious (usuario/clave SIJC). Misma convención que JUSTICIA_XXI_SQL_* en config. */
const globalForMssql = globalThis as unknown as {
  mssqlPool: sql.ConnectionPool | undefined
}

function segundosTimeoutConexionSql(): number {
  const n = Number(process.env.JUSTICIA_XXI_SQL_CONNECTION_TIMEOUT_SEC)
  if (Number.isFinite(n) && n >= 5 && n <= 120) return Math.floor(n)
  return 25
}

function buildMssqlPoolConfig(): sql.config | null {
  const server = process.env.JUSTICIA_XXI_SQL_SERVER?.trim()
  if (!server) return null

  const port = Number(process.env.JUSTICIA_XXI_SQL_PORT?.trim() || '1433')
  const database = process.env.JUSTICIA_XXI_SQL_DATABASE?.trim() || 'consejo'
  const user = process.env.JUSTICIA_XXI_SQL_USER?.trim() || ''
  const password = process.env.JUSTICIA_XXI_SQL_PASSWORD ?? ''

  if (!user) return null

  return {
    server,
    port: Number.isFinite(port) ? port : 1433,
    database,
    user,
    password,
    options: {
      // Red interna SIJC: sin TLS negociado en el pool de prueba / consultas directas
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: segundosTimeoutConexionSql() * 1000,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
  }
}

/**
 * Pool compartido hacia SQL Server (BD consejo / SIJC). Requiere usuario y contraseña SQL (no Windows integrada).
 */
export async function getMssqlPool(): Promise<sql.ConnectionPool> {
  const g = globalForMssql
  if (g.mssqlPool) return g.mssqlPool

  const cfg = buildMssqlPoolConfig()
  if (!cfg) {
    throw new Error(
      'Falta configuración SQL en .env.local: JUSTICIA_XXI_SQL_SERVER, JUSTICIA_XXI_SQL_USER y JUSTICIA_XXI_SQL_PASSWORD (puerto 1433 y base «consejo» por defecto).'
    )
  }

  const pool = new sql.ConnectionPool(cfg)
  await pool.connect()
  g.mssqlPool = pool
  return pool
}

/** Ejecuta T-SQL en el pool SIJC (solo servidor / rutas API). */
export async function query<T = unknown>(text: string): Promise<sql.IResult<T>> {
  const pool = await getMssqlPool()
  return pool.request().query<T>(text)
}
