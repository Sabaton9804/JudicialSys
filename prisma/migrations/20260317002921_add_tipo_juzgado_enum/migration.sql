-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'ESCRIBIENTE',
    "area" TEXT NOT NULL DEFAULT 'SECRETARIA',
    "juzgadoId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcceso" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "usuarios_juzgadoId_fkey" FOREIGN KEY ("juzgadoId") REFERENCES "juzgados" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "juzgados" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipoJuzgado" TEXT NOT NULL DEFAULT 'CIVIL_MUNICIPAL',
    "ciudad" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "procesos" (
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
    "secretarioId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "procesos_juzgadoId_fkey" FOREIGN KEY ("juzgadoId") REFERENCES "juzgados" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "procesos_secretarioId_fkey" FOREIGN KEY ("secretarioId") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "providencias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "procesoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "numero" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asunto" TEXT NOT NULL,
    "contenido" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PROYECTADO',
    "proyectadoPorId" TEXT NOT NULL,
    "fechaProyeccion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisadoPorId" TEXT,
    "fechaRevision" DATETIME,
    "firmadoPorId" TEXT,
    "fechaFirma" DATETIME,
    "tipoAuto" TEXT,
    "recursos" TEXT,
    "notificado" BOOLEAN NOT NULL DEFAULT false,
    "fechaNotificacion" DATETIME,
    "observaciones" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "providencias_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "providencias_proyectadoPorId_fkey" FOREIGN KEY ("proyectadoPorId") REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "providencias_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "providencias_firmadoPorId_fkey" FOREIGN KEY ("firmadoPorId") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "memoriales" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "procesoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "numero" TEXT,
    "fechaPresentacion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "presentante" TEXT NOT NULL,
    "identificacion" TEXT,
    "asunto" TEXT NOT NULL,
    "contenido" TEXT,
    "folios" INTEGER,
    "anexos" TEXT,
    "recibidoPorId" TEXT,
    "fechaRecibido" DATETIME,
    "estado" TEXT NOT NULL DEFAULT 'RADICADO',
    "respuesta" TEXT,
    "observaciones" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "memoriales_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "memoriales_recibidoPorId_fkey" FOREIGN KEY ("recibidoPorId") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "terminos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "procesoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaInicio" DATETIME NOT NULL,
    "fechaVencimiento" DATETIME NOT NULL,
    "diasTermino" INTEGER NOT NULL,
    "diasHabiles" BOOLEAN NOT NULL DEFAULT true,
    "suspendido" BOOLEAN NOT NULL DEFAULT false,
    "fechaSuspension" DATETIME,
    "fechaReanudacion" DATETIME,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "fechaCompletado" DATETIME,
    "observaciones" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "terminos_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "procesoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "destinatarioId" TEXT,
    "direccion" TEXT,
    "email" TEXT,
    "autoNotificar" TEXT NOT NULL,
    "fechaAuto" DATETIME,
    "fechaEnvio" DATETIME,
    "fechaEntrega" DATETIME,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "medio" TEXT NOT NULL,
    "codigoRastreo" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "notificaciones_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notificacion_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notificacionId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "accion" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notificacion_logs_notificacionId_fkey" FOREIGN KEY ("notificacionId") REFERENCES "notificaciones" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notificacion_logs_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "oficios" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "procesoId" TEXT NOT NULL,
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
    CONSTRAINT "oficios_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audiencias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "procesoId" TEXT NOT NULL,
    "juzgadoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL,
    "duracion" INTEGER NOT NULL DEFAULT 60,
    "sala" TEXT,
    "enlaceVirtual" TEXT,
    "juez" TEXT NOT NULL,
    "secretario" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PROGRAMADA',
    "fechaFin" DATETIME,
    "acta" TEXT,
    "observaciones" TEXT,
    "motivoSuspension" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "audiencias_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "audiencias_juzgadoId_fkey" FOREIGN KEY ("juzgadoId") REFERENCES "juzgados" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "procesoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "plantillaId" TEXT,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contenido" TEXT,
    "archivoUrl" TEXT,
    "generado" BOOLEAN NOT NULL DEFAULT false,
    "fechaGeneracion" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "documentos_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documentos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "documentos_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "plantillas" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "plantillas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "descripcion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "notificaciones_sistema" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "procesoId" TEXT,
    "usuarioId" TEXT,
    "datos" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "fechaLeida" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "tareas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "procesoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" TEXT NOT NULL,
    "prioridad" TEXT NOT NULL DEFAULT 'MEDIA',
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "area" TEXT NOT NULL DEFAULT 'SECRETARIA',
    "responsableId" TEXT,
    "creadoPorId" TEXT NOT NULL,
    "fechaLimite" DATETIME,
    "fechaCompletado" DATETIME,
    "fechaRecordatorio" DATETIME,
    "observaciones" TEXT,
    "datos" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tareas_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tareas_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tareas_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "historial_tareas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tareaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "descripcion" TEXT,
    "datosAnteriores" TEXT,
    "datosNuevos" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "historial_tareas_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "tareas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "asignaciones_proceso" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "procesoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "fechaInicio" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFin" DATETIME,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "asignadoPor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "asignaciones_proceso_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "asignaciones_proceso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "historial_actuaciones" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "procesoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "area" TEXT,
    "tipo" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "descripcion" TEXT,
    "datos" TEXT,
    "ipOrigen" TEXT,
    "userAgent" TEXT,
    "anterior" TEXT,
    "nuevo" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "historial_actuaciones_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "archivos_proceso" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "procesoId" TEXT NOT NULL,
    "carpeta" TEXT NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivoPadreId" TEXT,
    "descripcion" TEXT,
    "subidoPorId" TEXT NOT NULL,
    "etiquetas" TEXT,
    "favorito" BOOLEAN NOT NULL DEFAULT false,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "fechaEliminacion" DATETIME,
    "eliminadoPorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "archivos_proceso_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "procesos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "archivos_proceso_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "archivos_proceso_eliminadoPorId_fkey" FOREIGN KEY ("eliminadoPorId") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "archivos_proceso_archivoPadreId_fkey" FOREIGN KEY ("archivoPadreId") REFERENCES "archivos_proceso" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "juzgados_codigo_key" ON "juzgados"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "procesos_radicado_key" ON "procesos"("radicado");

-- CreateIndex
CREATE INDEX "procesos_radicado_idx" ON "procesos"("radicado");

-- CreateIndex
CREATE INDEX "procesos_demandante_idx" ON "procesos"("demandante");

-- CreateIndex
CREATE INDEX "procesos_demandado_idx" ON "procesos"("demandado");

-- CreateIndex
CREATE INDEX "procesos_estado_idx" ON "procesos"("estado");

-- CreateIndex
CREATE INDEX "procesos_categoriaProceso_idx" ON "procesos"("categoriaProceso");

-- CreateIndex
CREATE INDEX "procesos_claseProceso_idx" ON "procesos"("claseProceso");

-- CreateIndex
CREATE INDEX "providencias_procesoId_idx" ON "providencias"("procesoId");

-- CreateIndex
CREATE INDEX "providencias_tipo_idx" ON "providencias"("tipo");

-- CreateIndex
CREATE INDEX "providencias_estado_idx" ON "providencias"("estado");

-- CreateIndex
CREATE INDEX "providencias_fecha_idx" ON "providencias"("fecha");

-- CreateIndex
CREATE INDEX "memoriales_procesoId_idx" ON "memoriales"("procesoId");

-- CreateIndex
CREATE INDEX "memoriales_tipo_idx" ON "memoriales"("tipo");

-- CreateIndex
CREATE INDEX "memoriales_fechaPresentacion_idx" ON "memoriales"("fechaPresentacion");

-- CreateIndex
CREATE INDEX "terminos_fechaVencimiento_idx" ON "terminos"("fechaVencimiento");

-- CreateIndex
CREATE INDEX "terminos_completado_idx" ON "terminos"("completado");

-- CreateIndex
CREATE INDEX "notificaciones_estado_idx" ON "notificaciones"("estado");

-- CreateIndex
CREATE INDEX "notificaciones_fechaEnvio_idx" ON "notificaciones"("fechaEnvio");

-- CreateIndex
CREATE INDEX "oficios_estado_idx" ON "oficios"("estado");

-- CreateIndex
CREATE INDEX "oficios_fechaEnvio_idx" ON "oficios"("fechaEnvio");

-- CreateIndex
CREATE INDEX "audiencias_fecha_idx" ON "audiencias"("fecha");

-- CreateIndex
CREATE INDEX "audiencias_estado_idx" ON "audiencias"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "plantillas_nombre_key" ON "plantillas"("nombre");

-- CreateIndex
CREATE INDEX "notificaciones_sistema_leida_idx" ON "notificaciones_sistema"("leida");

-- CreateIndex
CREATE INDEX "notificaciones_sistema_createdAt_idx" ON "notificaciones_sistema"("createdAt");

-- CreateIndex
CREATE INDEX "notificaciones_sistema_usuarioId_idx" ON "notificaciones_sistema"("usuarioId");

-- CreateIndex
CREATE INDEX "tareas_estado_idx" ON "tareas"("estado");

-- CreateIndex
CREATE INDEX "tareas_fechaLimite_idx" ON "tareas"("fechaLimite");

-- CreateIndex
CREATE INDEX "tareas_responsableId_idx" ON "tareas"("responsableId");

-- CreateIndex
CREATE INDEX "tareas_area_idx" ON "tareas"("area");

-- CreateIndex
CREATE INDEX "asignaciones_proceso_procesoId_idx" ON "asignaciones_proceso"("procesoId");

-- CreateIndex
CREATE INDEX "asignaciones_proceso_usuarioId_idx" ON "asignaciones_proceso"("usuarioId");

-- CreateIndex
CREATE INDEX "asignaciones_proceso_activo_idx" ON "asignaciones_proceso"("activo");

-- CreateIndex
CREATE INDEX "historial_actuaciones_procesoId_idx" ON "historial_actuaciones"("procesoId");

-- CreateIndex
CREATE INDEX "historial_actuaciones_fecha_idx" ON "historial_actuaciones"("fecha");

-- CreateIndex
CREATE INDEX "historial_actuaciones_tipo_idx" ON "historial_actuaciones"("tipo");

-- CreateIndex
CREATE INDEX "historial_actuaciones_area_idx" ON "historial_actuaciones"("area");

-- CreateIndex
CREATE INDEX "archivos_proceso_procesoId_idx" ON "archivos_proceso"("procesoId");

-- CreateIndex
CREATE INDEX "archivos_proceso_carpeta_idx" ON "archivos_proceso"("carpeta");

-- CreateIndex
CREATE INDEX "archivos_proceso_eliminado_idx" ON "archivos_proceso"("eliminado");
