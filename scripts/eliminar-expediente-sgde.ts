/**
 * Elimina un expediente en SGDE por CUI (23 dígitos). Requiere permisos de borrado en Alfresco.
 *
 * Credenciales: SGDE_USER y SGDE_PASSWORD (variables de entorno o en .env.local / .env).
 *
 * Uso:
 *   npm run sgde:eliminar-expediente -- 11001310305120260030800
 * Borrado definitivo (solo admin/propietario en Alfresco):
 *   npm run sgde:eliminar-expediente -- 11001310305120260030800 --permanente
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { eliminarExpedientePorRadicadoSgde, login, resolveSgdeCredentials } from '../src/lib/sgde/client'

config({ path: resolve(process.cwd(), '.env.local'), quiet: true })
config({ path: resolve(process.cwd(), '.env'), quiet: true })

const args = process.argv.slice(2)
const permanente = args.some((a) => a === '--permanente' || a === '-p')
const radicado = (args.find((a) => !a.startsWith('-')) ?? '').replace(/\D/g, '')

function imprimirAyudaCredenciales(): void {
  console.error('')
  console.error('No se encontraron SGDE_USER y SGDE_PASSWORD.')
  console.error('')
  console.error('Opción A — PowerShell (solo esta ventana):')
  console.error('  $env:SGDE_USER = "su_usuario_del_portal_sgde"')
  console.error('  $env:SGDE_PASSWORD = "su_contraseña"')
  console.error('  npm run sgde:eliminar-expediente -- ' + (radicado.length === 23 ? radicado : '11001310305120260030800'))
  console.error('')
  console.error('Opción B — Archivo .env.local en la raíz del proyecto (junto a package.json):')
  console.error('  SGDE_USER=su_usuario')
  console.error('  SGDE_PASSWORD=su_contraseña')
  console.error('')
  console.error('Puede copiar .env.example a .env.local y rellenar esas dos variables.')
  console.error('')
}

async function main() {
  if (radicado.length !== 23) {
    console.error('Uso: npm run sgde:eliminar-expediente -- <CUI de 23 dígitos> [--permanente]')
    console.error('Por defecto envía el expediente a la papelera (permisos de usuario normal).')
    console.error('Use --permanente solo si su usuario puede borrar definitivamente en Alfresco.')
    process.exit(1)
  }
  const cred = resolveSgdeCredentials(undefined)
  if (!cred) {
    imprimirAyudaCredenciales()
    process.exit(1)
  }
  const { alfTicket } = await login(cred.usuario, cred.password)
  const res = await eliminarExpedientePorRadicadoSgde(alfTicket, radicado, {
    permanent: permanente,
  })
  if (!res.ok) {
    console.error('No se pudo eliminar:', res.error, res.status != null ? `(HTTP ${res.status})` : '')
    process.exit(1)
  }
  if (permanente) {
    console.log('Expediente eliminado de forma permanente en SGDE.')
  } else {
    console.log('Expediente enviado a la papelera de SGDE (borrado lógico).')
    console.log('Si necesita borrado físico definitivo, use --permanente con un usuario administrador.')
  }
  console.log('CUI:', res.radicado)
  console.log('UUID nodo:', res.nodeId)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
