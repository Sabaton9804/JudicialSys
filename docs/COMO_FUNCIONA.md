# Cómo funciona JudicialSys

> **Véase también:**
> - [Referentes internacionales](./REFERENTES_INTERNACIONALES.md) — modelos de justicia digital (Estonia, Singapur, España, Chile, Brasil).
> - [Roadmap sistema judicial](./ROADMAP_SISTEMA_JUDICIAL.md) — lo que falta para un sistema completo (autenticación, formularios, integraciones, etc.).

---

## 1. Simular usuario

**Problema:** Si el selector "Simular usuario..." no muestra opciones, es porque no hay usuarios en la base de datos.

**Solución:** Ejecuta el seed para crear usuarios de prueba:
```bash
npx prisma db seed
```

Si la base está vacía o corrupta, reinicia todo:
```bash
npx prisma migrate reset
```
(Confirma cuando Prisma lo pida.)

**Qué hace:** El selector permite elegir con qué usuario "actúas" en la app (sin login real). Según el usuario elegido:
- **Super Admin:** Ve todo (todos los juzgados).
- **Juez, Oficial, Secretario, etc.:** Solo ve datos de su juzgado asignado.

---

## 2. Áreas: Despacho y Secretaría

- **Despacho:** Juez y Oficiales Mayores. El trabajo se organiza por **procesos (expedientes)**. Cada proceso contiene memoriales, providencias proyectadas, etc. El Juez firma la providencia desde el expediente completo.
- **Secretaría:** Secretario, Escribientes, Asistente (memoriales, emplazamientos/notificaciones, oficios, términos, audiencias, tareas).

---

## 3. Memoriales

**Qué son:** Escritos que presentan las partes (demandas, recursos, solicitudes, etc.).

**Flujo:**
1. **Registrar memorial:** Secretaría → Memoriales → "Registrar Memorial".
2. Campos: Proceso, tipo (Demanda, Recurso de apelación, etc.), presentante, asunto, folios.
3. Al radicar, se crea una tarea en Despacho si el tipo lo requiere (demanda, recurso de apelación, etc.).
4. Estados: RADICADO → TRASLADADO (cuando se envía al Despacho).

**Dónde verlos:** Secretaría → Memoriales.

---

## 4. Emplazamientos y notificaciones (Secretaría)

**Qué son:** Registro interno de **emplazamientos** (notificación personal al demandado u otros sujetos) y de otras **notificaciones procesales** (por aviso, por estado, electrónica, fijación en cartel, etc.), vinculadas a un proceso.

**Flujo:**
1. Secretaría → **Emplazamientos** → **Registrar notificación**.
2. Elija proceso, tipo (p. ej. Personal para emplazamiento), medio (p. ej. Físico), destinatario y el auto o acto que se notifica.
3. En la tabla puede **cambiar el estado** (Pendiente → En proceso → Enviada → Entregada / Surtida, etc.); al marcar Enviada o Entregada se registran fechas de envío o entrega.
4. Para **plazos** asociados (traslado, término de contestación, etc.) use además **Términos** (p. ej. tipo «Emplazamiento» o «Traslado demanda»).

**Relación con la consulta pública:** Los ítems que cumplan criterios de publicación pueden verse en **Consulta de procesos** (`/publicaciones`) según su categoría (notificaciones por estado, por aviso, etc.).

---

## 5. Oficios

**Qué son:** Comunicaciones oficiales a entidades (bancos, notarías, etc.) para solicitar información o documentos. Pueden vincularse a la providencia que los ordena.

**Flujo:**
1. Se crean desde la API (por ahora no hay formulario en la UI). Opcionalmente se asocia `providenciaId` a la providencia que ordenó el oficio.
2. Estados: PENDIENTE → ENVIADO → RESPONDIDO o SIN_RESPUESTA.
3. Se registran días transcurridos desde el envío.

**Dónde verlos:** Secretaría → Oficios (tabla con destinatario, asunto, estado, días). En la vista de proceso se muestra la providencia asociada.

---

## 6. Términos

**Qué son:** Plazos procesales (traslado de demanda, pruebas, término de ejecutoria, etc.) con fecha de vencimiento.

**Flujo:**
1. Se crean asociados a un proceso (por ahora vía API). Al **publicar en estado** una providencia firmada, se crea automáticamente un término de ejecutoria (3 días, Art. 295 CGP).
2. Estados calculados: **vigente**, **por_vencer** (≤3 días), **vencido**.
3. Si están por vencer o vencidos, se generan alertas en el dashboard.

**Dónde verlos:** Secretaría → Términos (tabla con proceso, tipo, vencimiento, días restantes, estado).

---

## 7. Audiencias

**Qué son:** Citaciones a juicio, conciliaciones, etc., con fecha, sala y juez.

**Flujo:**
1. Se crean asociadas a un proceso (por ahora vía API).
2. Estados: PROGRAMADA → REALIZADA o SUSPENDIDA.
3. El dashboard muestra cuántas hay hoy y esta semana.

**Dónde verlos:** Secretaría → Audiencias (tabla con proceso, tipo, fecha, juez, estado).

---

## 8. Tareas

**Qué son:** Actividades internas (notificar, proyectar auto, revisar memorial, etc.) asignadas a un responsable.

**Flujo:**
1. **Crear tarea:** Botón "Nueva Tarea" → Proceso, título, tipo, prioridad, responsable, fecha límite.
2. Estados: PENDIENTE → EN_PROGRESO → COMPLETADA (o VENCIDA si pasa la fecha).
3. Se pueden cambiar de estado con los botones de la tabla.

**Dónde verlos:** Despacho o Secretaría → Tareas (según el área activa).

---

## 9. Resumen por módulo

| Módulo           | Área      | Acciones principales                                                      |
|------------------|-----------|--------------------------------------------------------------------------|
| Memoriales       | Secretaría| Registrar memorial (botón "Registrar Memorial")                           |
| Publicar en Estado | Secretaría| Publicar providencias firmadas (notifica partes, crea término ejecutoria) |
| Emplazamientos   | Secretaría| Registrar notificación / emplazamiento; actualizar estados               |
| Oficios          | Secretaría| Ver lista y estadísticas (crear por API, vincular a providencia)        |
| Términos         | Secretaría| Ver lista y estadísticas (crear por API; ejecutoria se crea al publicar)  |
| Audiencias       | Secretaría| Ver lista y estadísticas (crear por API)                                 |
| Tareas           | Ambas     | Crear tarea, cambiar estado (Pendiente → En progreso → Completada)       |
| Procesos         | Todas     | Ver proceso como unidad (memoriales, providencias, oficios, términos)    |

---

## 10. Procesos y Expedientes

- **Radicado 23 dígitos:** Según Acuerdo 201/1997. Estructura: ciudad(5)+circuito(2)+especialidad(2)+despacho(3)+año(4)+consecutivo(5)+instancia(2). Ejemplo: 11001-31-03-051 (Bogotá, Circuito 31, Civil 03, Despacho 051) + año + consecutivo. Si el juzgado tiene `codigoRadicacion12` configurado, se auto-genera al crear proceso.
- **Asignación:** El secretario asigna al **Oficial Mayor** cuando ingresa el proceso al Despacho. Ese oficial proyecta la providencia. El Juez firma (un solo despacho). En Despacho se muestra "Asignado a: [nombre del Oficial Mayor]".
- **Procesos = Expedientes:** La unidad de trabajo es el **proceso**. Todo (memoriales, providencias, oficios, términos) vive dentro del proceso.
- **Despacho:** Vista "Expedientes" muestra procesos con providencia proyectada pendiente de firma. Al hacer clic en "Ver expediente" se abre el expediente completo: memoriales, providencias, oficios, etc. La providencia a firmar aparece destacada con botón "Firmar providencia".
- **Secretaría:** Igual: procesos con providencia firmada para publicar. "Ver expediente" abre el expediente con la acción "Publicar en estado" destacada.
- **Nueva Providencia:** Despacho → Acciones rápidas o "Sin expedientes" → "Nueva Providencia" (seleccionar proceso).
- **Todos los procesos:** Menú "Todos los Procesos" para ver la lista completa con columna "Paso" (Firma, Publicar, Ejecutoria, etc.).

**Flujo completo:** Secretaría ingresa proceso → Despacho proyecta auto → Juez firma (desde el expediente) → Secretaría publica en estado → Espera término ejecutoria → Secretaría cumple órdenes (oficios).

---

## 11. Administración

- **Usuarios:** Crear/editar usuarios, asignar cargo (rol) y juzgado.
- **Juzgados:** Crear juzgados (nombre, código, tipo, ciudad).
