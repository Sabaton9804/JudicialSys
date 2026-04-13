/**
 * Stub para builds Cloudflare (JUDICIALSYS_CF_BUILD=1): excluye Tedious y el driver nativo.
 * Radicación directa a SQL Server y el pool SIJC requieren Node/VPS o el puente Justicia XXI (HTTP).
 */
function noSql(): never {
  throw new Error(
    'Driver SQL Server (mssql) no está incluido en el Worker de Cloudflare. Configure JUSTICIA_XXI_BRIDGE_URL y el puente local, o despliegue en Node.js/VPS.'
  )
}

export class ConnectionPool {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_cfg: unknown) {}
  async connect(): Promise<this> {
    noSql()
  }
  request() {
    return {
      query: async (): Promise<never> => noSql(),
    }
  }
  async close(): Promise<void> {}
}

const StubRequest = class {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_tr?: unknown) {}
  input(): this {
    return this
  }
  async query(): Promise<never> {
    noSql()
  }
}

const StubTransaction = class {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_pool: unknown) {}
  async begin(): Promise<void> {
    noSql()
  }
  async commit(): Promise<void> {}
  async rollback(): Promise<void> {}
}

function stubType() {
  return class {}
}

export default {
  ConnectionPool,
  async connect(): Promise<never> {
    noSql()
  },
  VarChar: stubType(),
  Int: stubType(),
  DateTime: stubType(),
  Transaction: StubTransaction,
  Request: StubRequest,
}
