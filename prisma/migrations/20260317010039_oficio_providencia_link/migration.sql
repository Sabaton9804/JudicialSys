-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_oficios" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "procesoId" TEXT NOT NULL,
    "providenciaId" TEXT,
    "numero" TEXT,
    "destinatario" TEXT NOT NULL,
    "destinatarioId" TEXT,
    "tipoDestinatario" TEXT NOT NULL,
    "direccion" TEXT,
    "email" TEXT,
    "asunto" TEXT NOT NULL,
    "contenido" TEXT,
    "fechaEnvio" DATETIME,
    "fechaRespuesta" DATETIME,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "diasTranscurridos" INTEGER NOT NULL DEFAULT 0,
    "respuesta" TEXT,
    "observaciones" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "oficios_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "oficios_providenciaId_fkey" FOREIGN KEY ("providenciaId") REFERENCES "providencias" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_oficios" ("asunto", "contenido", "createdAt", "destinatario", "destinatarioId", "diasTranscurridos", "direccion", "email", "estado", "fechaEnvio", "fechaRespuesta", "id", "numero", "observaciones", "procesoId", "respuesta", "tipoDestinatario", "updatedAt") SELECT "asunto", "contenido", "createdAt", "destinatario", "destinatarioId", "diasTranscurridos", "direccion", "email", "estado", "fechaEnvio", "fechaRespuesta", "id", "numero", "observaciones", "procesoId", "respuesta", "tipoDestinatario", "updatedAt" FROM "oficios";
DROP TABLE "oficios";
ALTER TABLE "new_oficios" RENAME TO "oficios";
CREATE INDEX "oficios_estado_idx" ON "oficios"("estado");
CREATE INDEX "oficios_fechaEnvio_idx" ON "oficios"("fechaEnvio");
CREATE INDEX "oficios_providenciaId_idx" ON "oficios"("providenciaId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
