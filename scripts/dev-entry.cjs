/**
 * Arranque desarrollo: puente (3847) + Next (3000) sin depender de comillas en cmd.exe.
 * Solo Next: JUSTICIA_XXI_BRIDGE_DISABLED=1 en .env, npm run dev / dev:no-bridge / dev:direct
 * Puente + Next: npm run dev:with-bridge o npm run dev:bridge
 */
const { spawn } = require('child_process')
const path = require('path')

require('dotenv').config({ path: path.join(process.cwd(), '.env.local') })
require('dotenv').config({ path: path.join(process.cwd(), '.env') })

const noBridge = process.env.JUSTICIA_XXI_BRIDGE_DISABLED === '1'

let bridgeProc
let webProc
let shuttingDown = false

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  try {
    if (bridgeProc) bridgeProc.kill()
  } catch (_) {}
  try {
    if (webProc) webProc.kill()
  } catch (_) {}
  setTimeout(() => process.exit(typeof code === 'number' ? code : 0), 400)
}

function spawnLogged(name, cmd, args) {
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd(),
    env: process.env,
  })
  child.on('error', (err) => console.error(`[${name}]`, err))
  return child
}

if (noBridge) {
  console.log('[JudicialSys] Modo: solo Next (JUSTICIA_XXI_BRIDGE_DISABLED=1)\n')
  webProc = spawnLogged('web', 'npx', ['next', 'dev', '-p', '3000'])
  webProc.on('exit', (c) => process.exit(c ?? 0))
  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))
} else {
  console.log('[JudicialSys] Modo: puente Justicia XXI + Next. No cierre esta ventana.\n')
  bridgeProc = spawnLogged('puente', 'npm', ['run', 'justicia-xxi:bridge'])

  bridgeProc.on('exit', (code) => {
    if (!shuttingDown) {
      console.error('\n[JudicialSys] El puente terminó (código ' + code + '). Si fue error, revise arriba.')
      if (webProc) shutdown(code ?? 1)
      else process.exit(code ?? 1)
    }
  })

  // Dar tiempo a que el puente abra el puerto antes de Next (evita carreras en Windows).
  setTimeout(() => {
    if (shuttingDown) return
    webProc = spawnLogged('web', 'npx', ['next', 'dev', '-p', '3000'])
    webProc.on('exit', (code) => {
      if (!shuttingDown) {
        console.error('\n[JudicialSys] Next terminó. Cerrando puente…')
        shutdown(code ?? 0)
      }
    })
  }, 2500)

  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))
}
