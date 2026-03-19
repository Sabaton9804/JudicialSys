-- AlterTable
ALTER TABLE "juzgados" ADD COLUMN "codigoRadicacion12" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_procesos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "radicado" TEXT NOT NULL,
    "categoriaProceso" TEXT NOT NULL,
    "claseProceso" TEXT NOT NULL,
    "demanda" TEXT NOT NULL,
    "demandante" TEXT NOT NULL,
    "demandanteId" TEXT,
    "demandado" TEXT NOT NULL,
    "demandadoId" TEXT,
    "cuantia" REAL,
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "fechaRadicacion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaReparto" DATETIME,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "etapaProcesal" TEXT,
    "observaciones" TEXT,
    "juzgadoId" TEXT NOT NULL,
    "juezId" TEXT,
    "secretarioId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "procesos_juzgadoId_fkey" FOREIGN KEY ("juzgadoId") REFERENCES "juzgados" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "procesos_juezId_fkey" FOREIGN KEY ("juezId") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "procesos_secretarioId_fkey" FOREIGN KEY ("secretarioId") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_procesos" ("categoriaProceso", "claseProceso", "createdAt", "cuantia", "demanda", "demandado", "demandadoId", "demandante", "demandanteId", "estado", "etapaProcesal", "fechaRadicacion", "fechaReparto", "id", "juzgadoId", "moneda", "observaciones", "radicado", "secretarioId", "updatedAt") SELECT "categoriaProceso", "claseProceso", "createdAt", "cuantia", "demanda", "demandado", "demandadoId", "demandante", "demandanteId", "estado", "etapaProcesal", "fechaRadicacion", "fechaReparto", "id", "juzgadoId", "moneda", "observaciones", "radicado", "secretarioId", "updatedAt" FROM "procesos";
DROP TABLE "procesos";
ALTER TABLE "new_procesos" RENAME TO "procesos";
CREATE UNIQUE INDEX "procesos_radicado_key" ON "procesos"("radicado");
CREATE INDEX "procesos_radicado_idx" ON "procesos"("radicado");
CREATE INDEX "procesos_demandante_idx" ON "procesos"("demandante");
CREATE INDEX "procesos_demandado_idx" ON "procesos"("demandado");
CREATE INDEX "procesos_estado_idx" ON "procesos"("estado");
CREATE INDEX "procesos_categoriaProceso_idx" ON "procesos"("categoriaProceso");
CREATE INDEX "procesos_claseProceso_idx" ON "procesos"("claseProceso");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
