/**
 * Crea la base `consejo` y tablas mínimas T103/T110 para probar la radicación en tu PC.
 * Requisito: contenedor arriba (docker compose -f docker-compose.justicia-xxi-local.yml up -d)
 */
import sql from 'mssql'

/** Misma clave que MSSQL_SA_PASSWORD en docker-compose.justicia-xxi-local.yml */
const LOCAL_SA_PASSWORD = 'LocalDev9!Judicial'

const SERVER = process.env.JUSTICIA_XXI_LOCAL_HOST ?? '127.0.0.1'
const PORT = Number(process.env.JUSTICIA_XXI_LOCAL_PORT ?? '14333')

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

const DDL_CONSEJO = `
IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'consejo')
  CREATE DATABASE consejo;
`

const DDL_T103 = `
IF OBJECT_ID(N'dbo.T103DAINFOPROC', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.T103DAINFOPROC (
    A103LLAVPROC   VARCHAR(23)  NOT NULL PRIMARY KEY,
    A103NUMEPROC   VARCHAR(21)  NOT NULL,
    A103CONSPROC   VARCHAR(2)   NOT NULL,
    A103CIUDRADI   VARCHAR(5)   NOT NULL,
    A103ENTIRADI   VARCHAR(2)   NOT NULL,
    A103ESPERADI   VARCHAR(2)   NOT NULL,
    A103NUENRADI   VARCHAR(3)   NOT NULL,
    A103ANORADI    VARCHAR(4)   NOT NULL,
    A103NUMERADI   VARCHAR(5)   NOT NULL,
    A103FECHPROC   DATETIME     NOT NULL,
    A103HORAPROC   VARCHAR(8)   NOT NULL,
    A103CODIAREA   VARCHAR(4)   NOT NULL,
    A103CODIPROC   VARCHAR(4)   NOT NULL,
    A103CODICLAS   VARCHAR(4)   NOT NULL,
    A103CODISUBC   VARCHAR(4)   NOT NULL,
    A103CODIRECU   VARCHAR(4)   NOT NULL,
    A103CODICIUO   VARCHAR(5)   NOT NULL,
    A103CODIENTO   VARCHAR(2)   NOT NULL,
    A103CODIESPO   VARCHAR(2)   NOT NULL,
    A103CODINUMO   VARCHAR(3)   NOT NULL
  );
END
`

const DDL_T110 = `
IF OBJECT_ID(N'dbo.T110DRACTUPROC', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.T110DRACTUPROC (
    A110LLAVPROC   VARCHAR(23) NOT NULL,
    A110CONSACTU  INT         NOT NULL,
    A110NUMEPROC  VARCHAR(21) NOT NULL,
    A110CONSPROC  VARCHAR(2)  NOT NULL,
    A110CODIACTU  VARCHAR(8)  NOT NULL,
    A110CODIPADR  VARCHAR(8)  NOT NULL,
    A110DESCACTU  VARCHAR(150) NOT NULL,
    A110ANOTACTU  VARCHAR(1000) NOT NULL,
    A110FECHREGI  DATETIME    NOT NULL,
    A110FECHINIC  DATETIME    NOT NULL,
    A110FECHFINA  DATETIME    NOT NULL,
    A110FECHDESA  DATETIME    NOT NULL,
    A110TIPOACTU  VARCHAR(2)  NOT NULL,
    A110FLAGTERM  VARCHAR(2)  NOT NULL,
    A110TIPOTERM  VARCHAR(2)  NOT NULL,
    A110NUMDTERM  INT         NOT NULL,
    A110LEGAJUDI  VARCHAR(2)  NOT NULL,
    A110FLAGUBIC  VARCHAR(2)  NOT NULL,
    A110FOLIPROC  VARCHAR(250) NOT NULL,
    A110CUADPROC  VARCHAR(15) NOT NULL,
    CONSTRAINT PK_T110_LOCAL PRIMARY KEY (A110LLAVPROC, A110CONSACTU)
  );
END
`

async function main() {
  const base = {
    server: `${SERVER},${PORT}`,
    user: 'sa',
    password: LOCAL_SA_PASSWORD,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    connectionTimeout: 15_000,
    requestTimeout: 60_000,
  } as const

  const open = (database: string) =>
    new sql.ConnectionPool({ ...base, database }).connect()

  let master: sql.ConnectionPool | undefined
  for (let i = 0; i < 30; i++) {
    try {
      master = await open('master')
      break
    } catch {
      console.log(`Esperando a SQL Server… intento ${i + 1}/30`)
      await sleep(2000)
    }
  }
  if (!master) {
    console.error('No se pudo conectar. ¿Está Docker arriba? npm run justicia-xxi:local:up')
    process.exit(1)
  }

  let consejoPool: sql.ConnectionPool | undefined
  try {
    await master.request().query(DDL_CONSEJO)
    await master.close()
    master = undefined

    consejoPool = await open('consejo')
    await consejoPool.request().query(DDL_T103)
    await consejoPool.request().query(DDL_T110)
    await consejoPool.close()
    consejoPool = undefined

    console.log('Listo: base «consejo» y tablas T103/T110 de prueba creadas.')
    console.log('')
    console.log('En JudicialSys use:')
    console.log(`  Equipo servidor: ${SERVER}`)
    console.log(`  Puerto: ${PORT}`)
    console.log('  Base: consejo')
    console.log('  Usuario: sa')
    console.log('  Contraseña: LocalDev9!Judicial (cámbiela en docker-compose e init-db.ts si desea)')
  } finally {
    if (master) await master.close().catch(() => {})
    if (consejoPool) await consejoPool.close().catch(() => {})
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
