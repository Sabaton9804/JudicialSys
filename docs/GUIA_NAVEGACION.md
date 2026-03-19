# Guía de navegación — JudicialSys

## ¿Dónde está cada cosa?

### Pantalla principal (gestor)

Al abrir la app en `http://localhost:3000` verás:

1. **Barra lateral izquierda (menú)**
   - **Tutelas** — Acciones de tutela (Art. 86 CP)
   - **Dashboard / Expedientes** — Vista principal según el área
   - **Mi agenda** — Planner del Oficial Mayor (solo Despacho)
   - **Procesos** — Todos los procesos del juzgado
   - **Tareas** — Tareas internas (proyectar auto, notificar, etc.)
   - **Publicar en Estado** — Providencias firmadas para notificar (solo Secretaría)
   - **Memoriales, Oficios, Términos, Audiencias** — Módulos de Secretaría
   - **Consulta de procesos** — Consulta pública sin sesión (abre en nueva pestaña)

2. **Barra superior (header)**
   - Badge: DESPACHO, SECRETARÍA o ADMINISTRACIÓN
   - Título según la pestaña activa
   - Botón **Consulta de procesos** (actuaciones visibles sin login)
   - Botón **Crear expediente**
   - Buscador de procesos
   - Campana de notificaciones
   - Selector **Simular usuario** — elige con qué usuario actúas

3. **Área central**
   - Contenido del módulo seleccionado (dashboard, tabla de procesos, etc.)

### Cambiar de área

- En el selector de usuario (arriba a la derecha) elige un usuario de **Despacho** (Juez, Oficial Mayor) o **Secretaría** (Secretario, Escribiente).
- El menú lateral cambia según el área.

### Accesos rápidos

| Quiero… | Dónde ir |
|---------|-----------|
| Proyectar un auto en Word | Despacho → Tareas → clic en **Proyectar** en la fila de la tarea, o Dashboard → Acciones Rápidas → **Nueva Providencia** |
| Revisar providencia (Dra) | Despacho → Dashboard (card "Providencias para revisar") o abrir el expediente |
| Firmar providencia (Juez) | Despacho → Dashboard (card "Expedientes que requieren tu firma") o abrir el expediente |
| Publicar en estado | Secretaría → **Publicar en Estado** o Dashboard → Providencias para Publicar |
| Consulta pública por radicado | Menú lateral → **Consulta de procesos** (o barra superior) |
| Crear oficio, término, audiencia | Secretaría → Oficios / Términos / Audiencias → botón **Nuevo** |
| Ver expediente de un proceso | Clic en "Ver expediente" en cualquier lista |

### Rutas directas

- **Gestor:** `/` (página principal)
- **Expediente:** `/expediente/[id]` (se abre al hacer clic en "Ver expediente")
- **Consulta de procesos:** `/publicaciones` (actuaciones publicadas, acceso público)

---

*Si algo no aparece, ejecute `npx prisma db seed` para cargar datos de prueba.*
