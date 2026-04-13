import { NextRequest, NextResponse } from 'next/server'
import { getUserFromHeader } from '@/lib/auth-utils'
import {
  justiciaXxiPuenteResueltoSinEfectos,
  puenteJusticiaXxiRespondeHealth,
} from '@/lib/justicia-xxi-sql/bridge-client'

export const runtime = 'nodejs'

/**
 * Sugerencias no secretas para los formularios de Justicia XXI (valores típicos en .env del servidor).
 * No devuelve usuario ni contraseña SQL.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    /**
     * Sin usuario simulado en producción (p. ej. demo en Cloudflare): no devolvemos 401
     * para no inundar la consola; las pistas siguen sin incluir secretos.
     */
    if (!user && process.env.NODE_ENV === 'production') {
      return NextResponse.json({
        success: true,
        data: {
          sqlServer: '',
          sqlPort: '1433',
          sqlDatabase: 'consejo',
          suggestWindowsAuth: false,
          envListo: false,
          servidorEnEnv: false,
          puenteLocalActivo: false,
          puenteEscuchando: false,
        },
      })
    }

    const sqlServer = process.env.JUSTICIA_XXI_SQL_SERVER?.trim() ?? ''
    const sqlPort = process.env.JUSTICIA_XXI_SQL_PORT?.trim() || '1433'
    const sqlDatabase = process.env.JUSTICIA_XXI_SQL_DATABASE?.trim() || 'consejo'
    const wa = process.env.JUSTICIA_XXI_SQL_WINDOWS_AUTH?.toLowerCase()
    const suggestWindowsAuth = wa === '1' || wa === 'true' || wa === 'yes'
    const hasSqlUser = Boolean(process.env.JUSTICIA_XXI_SQL_USER?.trim())
    /** Bastante para conectar sin escribir en el formulario (servidor + Windows auth o usuario SQL en env). */
    const envListo = Boolean(sqlServer) && (suggestWindowsAuth || hasSqlUser)
    /** Solo indica si hay IP/host en .env (puede bastar si el usuario elige cuenta Windows en pantalla). */
    const servidorEnEnv = Boolean(sqlServer)

    const puenteLocalActivo = justiciaXxiPuenteResueltoSinEfectos()
    const puenteEscuchando = puenteLocalActivo ? await puenteJusticiaXxiRespondeHealth() : false

    return NextResponse.json({
      success: true,
      data: {
        sqlServer,
        sqlPort,
        sqlDatabase,
        suggestWindowsAuth,
        envListo,
        servidorEnEnv,
        /** True si hay URL+secreto (la app intentará el puente). No implica que el proceso esté en marcha. */
        puenteLocalActivo,
        /** True si GET /health del puente respondió (proceso realmente vivo). */
        puenteEscuchando,
      },
    })
  } catch (e) {
    console.error('sql-hints:', e)
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 })
  }
}
