import sql from 'mssql'
import { db } from '@/lib/db'
import { desglosarRadicado23 } from '@/lib/radicado'
import { resolverConfigSqlJusticiaXxi, type CredencialesJusticiaXxiInput } from './config'
import { mensajeConexionSqlParaUsuario } from './mensaje-conexion-amigable'
import { mapearClaseProcesoJusticiaXxi } from './mapeo-clase-codigos'
import { justiciaXxiPuenteConfigurado, radicarMediantePuenteLocal } from './bridge-client'

export type ResultadoRadicacionJusticiaXxi =
  | { ok: true; yaExistia: boolean; llave: string }
  | { ok: false; codigo: 'no_config' | 'no_radicado' | 'sql' | 'no_proceso'; mensaje: string }

/**
 * Inserta cabecera T103 + primera actuación T110 en BD tipo Justicia XXI (consejo).
 * @param credenciales Opcional: servidor, base, usuario y contraseña desde el formulario (mezcla con .env).
 * Puede fallar por triggers, permisos o reglas del juzgado: revisar mensaje SQL.
 */
export async function radicarProcesoEnSqlJusticiaXxi(
  procesoId: string,
  credenciales?: CredencialesJusticiaXxiInput | null
): Promise<ResultadoRadicacionJusticiaXxi> {
  if (justiciaXxiPuenteConfigurado()) {
    return radicarMediantePuenteLocal(procesoId, credenciales ?? null)
  }

  const cfg = resolverConfigSqlJusticiaXxi(credenciales ?? null)
  if (!cfg.ok) {
    return { ok: false, codigo: 'no_config', mensaje: cfg.motivo }
  }

  let mod: typeof sql = sql
  if (cfg.trustedConnectionWindows) {
    if (process.platform !== 'win32') {
      return {
        ok: false,
        codigo: 'no_config',
        mensaje:
          'La opción «cuenta de Windows» hacia SQL Server solo funciona cuando JudicialSys (Node.js) se ejecuta en Windows. En otro sistema desmarque la casilla y use usuario y contraseña SQL.',
      }
    }
    try {
      mod = (await import('mssql/msnodesqlv8')) as typeof sql
    } catch (loadErr) {
      const det = loadErr instanceof Error ? loadErr.message : String(loadErr)
      return {
        ok: false,
        codigo: 'no_config',
        mensaje: `No se pudo cargar el conector nativo para Windows (msnodesqlv8). Use usuario y contraseña SQL (SIJC) sin «cuenta de Windows», o ejecute en el proyecto: npm install msnodesqlv8 (requiere compilación en Windows). Detalle: ${det}`,
      }
    }
  }

  const proceso = await db.proceso.findUnique({
    where: { id: procesoId },
    include: { juzgado: true },
  })
  if (!proceso) {
    return { ok: false, codigo: 'no_proceso', mensaje: 'Proceso no encontrado' }
  }

  const rad23 = proceso.radicado.replace(/\D/g, '')
  const d = desglosarRadicado23(rad23)
  if (!d) {
    return {
      ok: false,
      codigo: 'no_radicado',
      mensaje: 'El radicado del expediente local no es un CUI de 23 dígitos válido',
    }
  }

  const cod = mapearClaseProcesoJusticiaXxi(proceso.claseProceso, proceso.categoriaProceso)

  const origCiu =
    process.env.JUSTICIA_XXI_ORIGEN_CODICIUO?.replace(/\D/g, '').padStart(5, '0').slice(0, 5) ||
    d.ciudadDane.padStart(5, '0').slice(0, 5)
  const origEnt =
    process.env.JUSTICIA_XXI_ORIGEN_CODIENTO?.replace(/\D/g, '').padStart(2, '0').slice(0, 2) || d.circuito
  const origEsp =
    process.env.JUSTICIA_XXI_ORIGEN_CODIESPO?.replace(/\D/g, '').padStart(2, '0').slice(0, 2) || d.especialidad
  const origNum =
    process.env.JUSTICIA_XXI_ORIGEN_CODINUMO?.replace(/\D/g, '').padStart(3, '0').slice(0, 3) ||
    d.numeroDespacho

  const numeProc = rad23.slice(0, 21)
  const consProc = rad23.slice(21, 23)

  const now = new Date()
  const fechaProc = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const horaStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

  let pool: sql.ConnectionPool | undefined
  try {
    pool = await mod.connect(cfg.mssqlConnect)

    const chk = await pool
      .request()
      .input('llav', mod.VarChar(23), rad23)
      .query('SELECT 1 AS x FROM dbo.T103DAINFOPROC WHERE A103LLAVPROC = @llav')

    if (chk.recordset?.length) {
      return { ok: true, yaExistia: true, llave: rad23 }
    }

    const tr = new mod.Transaction(pool)
    await tr.begin()

    try {
      const r1 = new mod.Request(tr)
      r1.input('llav', mod.VarChar(23), rad23)
      r1.input('nume', mod.VarChar(21), numeProc)
      r1.input('cons', mod.VarChar(2), consProc)
      r1.input('ciu', mod.VarChar(5), d.ciudadDane.padStart(5, '0').slice(0, 5))
      r1.input('ent', mod.VarChar(2), d.circuito)
      r1.input('esp', mod.VarChar(2), d.especialidad)
      r1.input('nud', mod.VarChar(3), d.numeroDespacho.padStart(3, '0').slice(0, 3))
      r1.input('anio', mod.VarChar(4), d.anioRadicacion)
      r1.input('numed', mod.VarChar(5), d.consecutivo.padStart(5, '0').slice(0, 5))
      r1.input('fech', mod.DateTime, fechaProc)
      r1.input('hora', mod.VarChar(8), horaStr)
      r1.input('area', mod.VarChar(4), cod.codiarea.padStart(4, '0').slice(0, 4))
      r1.input('proc', mod.VarChar(4), cod.codiproc.padStart(4, '0').slice(0, 4))
      r1.input('clas', mod.VarChar(4), cod.codiclas.padStart(4, '0').slice(0, 4))
      r1.input('subc', mod.VarChar(4), cod.codisubc.padStart(4, '0').slice(0, 4))
      r1.input('recu', mod.VarChar(4), cod.codirecu.padStart(4, '0').slice(0, 4))
      r1.input('ociu', mod.VarChar(5), origCiu)
      r1.input('oent', mod.VarChar(2), origEnt)
      r1.input('oesp', mod.VarChar(2), origEsp)
      r1.input('onum', mod.VarChar(3), origNum)

      await r1.query(`
        INSERT INTO dbo.T103DAINFOPROC (
          A103LLAVPROC, A103NUMEPROC, A103CONSPROC,
          A103CIUDRADI, A103ENTIRADI, A103ESPERADI, A103NUENRADI, A103ANORADI, A103NUMERADI,
          A103FECHPROC, A103HORAPROC,
          A103CODIAREA, A103CODIPROC, A103CODICLAS, A103CODISUBC, A103CODIRECU,
          A103CODICIUO, A103CODIENTO, A103CODIESPO, A103CODINUMO
        ) VALUES (
          @llav, @nume, @cons,
          @ciu, @ent, @esp, @nud, @anio, @numed,
          @fech, @hora,
          @area, @proc, @clas, @subc, @recu,
          @ociu, @oent, @oesp, @onum
        )
      `)

      const r2 = new mod.Request(tr)
      const descActu = 'Radicación de Proceso'
      const anot = `JudicialSys: ${proceso.demandante?.slice(0, 80) || ''} / ${proceso.demandado?.slice(0, 80) || ''}`.slice(
        0,
        1000
      )

      r2.input('llav', mod.VarChar(23), rad23)
      r2.input('consactu', mod.Int, 1)
      r2.input('nume', mod.VarChar(21), numeProc)
      r2.input('cons', mod.VarChar(2), consProc)
      r2.input('cactu', mod.VarChar(8), '00000001')
      r2.input('cpad', mod.VarChar(8), '00000001')
      r2.input('desc', mod.VarChar(150), descActu)
      r2.input('anot', mod.VarChar(1000), anot)
      r2.input('freg', mod.DateTime, fechaProc)
      r2.input('finic', mod.DateTime, fechaProc)
      r2.input('ffin', mod.DateTime, fechaProc)
      r2.input('fdes', mod.DateTime, fechaProc)
      r2.input('foli', mod.VarChar(250), '1')
      r2.input('cuad', mod.VarChar(15), '1')

      await r2.query(`
        INSERT INTO dbo.T110DRACTUPROC (
          A110LLAVPROC, A110CONSACTU, A110NUMEPROC, A110CONSPROC,
          A110CODIACTU, A110CODIPADR, A110DESCACTU, A110ANOTACTU,
          A110FECHREGI, A110FECHINIC, A110FECHFINA, A110FECHDESA,
          A110TIPOACTU, A110FLAGTERM, A110TIPOTERM, A110NUMDTERM, A110LEGAJUDI,
          A110FLAGUBIC, A110FOLIPROC, A110CUADPROC
        ) VALUES (
          @llav, @consactu, @nume, @cons,
          @cactu, @cpad, @desc, @anot,
          @freg, @finic, @ffin, @fdes,
          'R', 'NO', 'N', 0, 'N',
          'S', @foli, @cuad
        )
      `)

      await tr.commit()
    } catch (inner) {
      try {
        await tr.rollback()
      } catch {
        /* ignore */
      }
      throw inner
    }

    return { ok: true, yaExistia: false, llave: rad23 }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[justicia-xxi-sql] conexión o consulta:', msg)
    return { ok: false, codigo: 'sql', mensaje: mensajeConexionSqlParaUsuario(msg) }
  } finally {
    if (pool) {
      try {
        await pool.close()
      } catch {
        /* ignore */
      }
    }
  }
}

/** Auditoría en JudicialSys tras un envío exitoso a SQL (opcional). */
export async function registrarHistorialRadicacionJusticiaXxi(
  procesoId: string,
  usuarioId: string | null | undefined,
  llave: string,
  yaExistia: boolean
): Promise<void> {
  if (!usuarioId) return
  await db.historialActuacion.create({
    data: {
      procesoId,
      usuarioId,
      tipo: 'ACTUALIZACION_PROCESO',
      accion: yaExistia
        ? 'Justicia XXI (SQL): proceso ya existía en T103'
        : 'Justicia XXI (SQL): radicación insertada en T103/T110',
      descripcion: `CUI ${llave}`,
      datos: JSON.stringify({ justiciaXxiSql: true, yaExistia }),
    },
  })
}
