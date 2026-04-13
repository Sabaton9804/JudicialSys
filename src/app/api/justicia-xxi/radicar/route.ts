import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  radicarProcesoEnSqlJusticiaXxi,
  registrarHistorialRadicacionJusticiaXxi,
} from '@/lib/justicia-xxi-sql/radicar-proceso'
import { getUserFromHeader } from '@/lib/auth-utils'

export const runtime = 'nodejs'

/**
 * POST { procesoId: string }
 * Registra el expediente local en SQL Server (Justicia XXI) si está configurado el entorno.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromHeader(request)
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const procesoId = typeof body.procesoId === 'string' ? body.procesoId : ''

    const win =
      body.justiciaXxiSqlWindowsAuth === true ||
      body.justiciaXxiSqlWindowsAuth === 'true' ||
      body.justiciaXxiSqlWindowsAuth === 1
    const credenciales = {
      sqlServer: typeof body.justiciaXxiSqlServer === 'string' ? body.justiciaXxiSqlServer.trim() : undefined,
      sqlPort: typeof body.justiciaXxiSqlPort === 'string' ? body.justiciaXxiSqlPort.trim() : undefined,
      sqlDatabase: typeof body.justiciaXxiSqlDatabase === 'string' ? body.justiciaXxiSqlDatabase.trim() : undefined,
      sqlUser: typeof body.justiciaXxiSqlUser === 'string' ? body.justiciaXxiSqlUser.trim() : undefined,
      sqlPassword:
        typeof body.justiciaXxiSqlPassword === 'string' && body.justiciaXxiSqlPassword.length > 0
          ? body.justiciaXxiSqlPassword
          : undefined,
      sqlWindowsAuth: win ? true : undefined,
    }

    if (!procesoId) {
      return NextResponse.json({ success: false, error: 'procesoId requerido' }, { status: 400 })
    }

    const proceso = await db.proceso.findUnique({
      where: { id: procesoId },
      select: { id: true, juzgadoId: true },
    })
    if (!proceso) {
      return NextResponse.json({ success: false, error: 'Proceso no encontrado' }, { status: 404 })
    }

    if (user?.juzgadoId && proceso.juzgadoId !== user.juzgadoId && user.rol !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Sin permiso para este proceso' }, { status: 403 })
    }

    const resultado = await radicarProcesoEnSqlJusticiaXxi(procesoId, credenciales)

    if (!resultado.ok) {
      const status =
        resultado.codigo === 'no_config' ? 503 : resultado.codigo === 'no_proceso' ? 404 : 400
      return NextResponse.json(
        {
          success: false,
          error: resultado.mensaje,
          codigo: resultado.codigo,
        },
        { status }
      )
    }

    const subidoPorId =
      user?.id ||
      (await db.usuario.findFirst({ where: { juzgadoId: proceso.juzgadoId }, select: { id: true } }))?.id ||
      (await db.usuario.findFirst({ select: { id: true } }))?.id

    if (subidoPorId) {
      await registrarHistorialRadicacionJusticiaXxi(
        procesoId,
        subidoPorId,
        resultado.llave,
        resultado.yaExistia
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        llave: resultado.llave,
        yaExistia: resultado.yaExistia,
      },
      message: resultado.yaExistia
        ? 'Ese radicado ya estaba en Justicia XXI.'
        : 'Registrado en Justicia XXI.',
    })
  } catch (e) {
    console.error('justicia-xxi/radicar:', e)
    return NextResponse.json(
      { success: false, error: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    )
  }
}
