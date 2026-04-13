/**
 * Puente HTTP local: misma radicación que Next. Usuario/clave SQL (SIJC) = sin binarios nativos.
 * Cuenta Windows (Trusted Connection) solo si además ejecuta: npm install msnodesqlv8
 * La app Next.js, con JUSTICIA_XXI_BRIDGE_URL + JUSTICIA_XXI_BRIDGE_SECRET, reenvía aquí.
 *
 * Importante: use Node.js (no Bun). Si msnodesqlv8 falla: Visual Studio Build Tools + npm rebuild msnodesqlv8
 *
 * Tras cargar .env, se elimina JUSTICIA_XXI_BRIDGE_URL para no reenviar el puente a sí mismo.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { config as loadEnv } from 'dotenv'
import { leerOCrearSecretPuenteJusticiaXxi } from '@/lib/justicia-xxi-sql/bridge-secret'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

delete process.env.JUSTICIA_XXI_BRIDGE_URL

const PORT = Number(process.env.JUSTICIA_XXI_BRIDGE_PORT || '3847')
const SECRET_RAW = leerOCrearSecretPuenteJusticiaXxi(true)
const BIND = (process.env.JUSTICIA_XXI_BRIDGE_BIND || '127.0.0.1').trim()

if (!SECRET_RAW) {
  console.error(
    'No hay JUSTICIA_XXI_BRIDGE_SECRET ni se pudo crear .judicialsys-bridge-secret. Compruebe permisos en la carpeta del proyecto.'
  )
  process.exit(1)
}

const SECRET_BUF = Buffer.from(SECRET_RAW, 'utf8')

function readBody(req: IncomingMessage, maxBytes = 256_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (c: Buffer) => {
      total += c.length
      if (total > maxBytes) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function bearerOk(req: IncomingMessage): boolean {
  const a = req.headers.authorization?.trim()
  if (!a?.toLowerCase().startsWith('bearer ')) return false
  const token = a.slice(7).trim()
  const tokBuf = Buffer.from(token, 'utf8')
  if (tokBuf.length !== SECRET_BUF.length) return false
  try {
    return timingSafeEqual(tokBuf, SECRET_BUF)
  } catch {
    return false
  }
}

function credencialesDesdeJson(b: Record<string, unknown>) {
  const win =
    b.justiciaXxiSqlWindowsAuth === true ||
    b.justiciaXxiSqlWindowsAuth === 'true' ||
    b.justiciaXxiSqlWindowsAuth === 1
  return {
    sqlServer: typeof b.justiciaXxiSqlServer === 'string' ? b.justiciaXxiSqlServer.trim() : undefined,
    sqlPort: typeof b.justiciaXxiSqlPort === 'string' ? b.justiciaXxiSqlPort.trim() : undefined,
    sqlDatabase: typeof b.justiciaXxiSqlDatabase === 'string' ? b.justiciaXxiSqlDatabase.trim() : undefined,
    sqlUser: typeof b.justiciaXxiSqlUser === 'string' ? b.justiciaXxiSqlUser.trim() : undefined,
    sqlPassword:
      typeof b.justiciaXxiSqlPassword === 'string' && b.justiciaXxiSqlPassword.length > 0
        ? b.justiciaXxiSqlPassword
        : undefined,
    sqlWindowsAuth: win ? true : undefined,
  }
}

function rutaSinQuery(url: string | undefined): string {
  const p = url?.split('?')[0] ?? '/'
  const sinBarraFinal = p.replace(/\/+$/, '')
  return sinBarraFinal === '' ? '/' : sinBarraFinal
}

const server = createServer(async (req, res) => {
  const path = rutaSinQuery(req.url)
  if (req.method === 'GET' && path === '/health') {
    json(res, 200, { ok: true, service: 'justicia-xxi-bridge' })
    return
  }
  if (req.method !== 'POST' || path !== '/radicar') {
    json(res, 404, { ok: false, error: 'not found' })
    return
  }
  if (!bearerOk(req)) {
    json(res, 401, { ok: false, error: 'unauthorized' })
    return
  }
  let raw: string
  try {
    raw = await readBody(req)
  } catch {
    json(res, 413, { ok: false, error: 'payload too large' })
    return
  }
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    json(res, 400, { ok: false, error: 'invalid json' })
    return
  }
  const procesoId = typeof body.procesoId === 'string' ? body.procesoId : ''
  if (!procesoId) {
    json(res, 400, { ok: false, codigo: 'no_config', mensaje: 'procesoId requerido' })
    return
  }

  const { radicarProcesoEnSqlJusticiaXxi } = await import('@/lib/justicia-xxi-sql/radicar-proceso')
  const credenciales = credencialesDesdeJson(body)
  const t0 = Date.now()
  const srv = credenciales.sqlServer?.trim() || process.env.JUSTICIA_XXI_SQL_SERVER?.trim() || '(env)'
  console.log(`[justicia-xxi-bridge] POST /radicar procesoId=${procesoId.slice(0, 8)}… SQL server≈${srv}`)
  const resultado = await radicarProcesoEnSqlJusticiaXxi(procesoId, credenciales)
  console.log(
    `[justicia-xxi-bridge] fin radicar ${Date.now() - t0} ms ok=${resultado.ok}` +
      (resultado.ok ? '' : ` codigo=${resultado.codigo}`)
  )

  if (!resultado.ok) {
    const status =
      resultado.codigo === 'no_proceso' ? 404 : resultado.codigo === 'no_config' ? 503 : 400
    json(res, status, resultado)
    return
  }
  json(res, 200, resultado)
})

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[justicia-xxi-bridge] El puerto ${PORT} ya está en uso (${BIND}). Seguramente hay otra ventana con «npm run justicia-xxi:bridge» abierta: ciérrala o mate el proceso.\n` +
        `  PowerShell:  Get-NetTCPConnection -LocalPort ${PORT} | Select-Object OwningProcess\n` +
        `  O use otro puerto:  $env:JUSTICIA_XXI_BRIDGE_PORT=3848  npm run justicia-xxi:bridge\n` +
        `  (Si cambia el puerto, en desarrollo añada JUSTICIA_XXI_BRIDGE_URL=http://127.0.0.1:3848 en .env)`
    )
    process.exit(1)
  }
  throw err
})

server.listen(PORT, BIND, () => {
  console.log(`[justicia-xxi-bridge] http://${BIND}:${PORT} — POST /radicar (Authorization: Bearer …)`)
  console.log(`[justicia-xxi-bridge] Comprobar vivo: http://${BIND === '0.0.0.0' ? '127.0.0.1' : BIND}:${PORT}/health`)
  console.log('[justicia-xxi-bridge] Mismo DATABASE_URL que la app; cuenta Windows hacia SQL desde este proceso.')
})
