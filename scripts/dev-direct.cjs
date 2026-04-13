/**

 * Equivalente multiplataforma a JUSTICIA_XXI_BRIDGE_DISABLED=1 next dev

 * (en Windows, VAR=1 cmd no aplica; este script fuerza la variable y arranca Next).

 */

const { spawn } = require('child_process')

const path = require('path')



require('dotenv').config({ path: path.join(process.cwd(), '.env.local') })

require('dotenv').config({ path: path.join(process.cwd(), '.env') })

process.env.JUSTICIA_XXI_BRIDGE_DISABLED = '1'



console.log('[JudicialSys] dev:direct — JUSTICIA_XXI_BRIDGE_DISABLED=1 (sin puente HTTP)\n')



const child = spawn('npx', ['next', 'dev', '-p', '3000'], {

  stdio: 'inherit',

  shell: true,

  cwd: process.cwd(),

  env: process.env,

})

child.on('exit', (code) => process.exit(code ?? 0))

