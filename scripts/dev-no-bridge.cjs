/**
 * Next.js sin puente Justicia XXI: fuerza JUSTICIA_XXI_BRIDGE_DISABLED=1
 * tras cargar .env, para que radicación use SQL directo desde Next (mssql + Tedious; usuario/clave SIJC).
 */
const { spawn } = require('child_process')
const path = require('path')

require('dotenv').config({ path: path.join(process.cwd(), '.env.local') })
require('dotenv').config({ path: path.join(process.cwd(), '.env') })
process.env.JUSTICIA_XXI_BRIDGE_DISABLED = '1'

console.log('[JudicialSys] JUSTICIA_XXI_BRIDGE_DISABLED=1 (SQL directo desde Next; sin puente en 3847)\n')

const child = spawn('npx', ['next', 'dev', '-p', '3000'], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd(),
  env: process.env,
})
child.on('exit', (code) => process.exit(code ?? 0))
