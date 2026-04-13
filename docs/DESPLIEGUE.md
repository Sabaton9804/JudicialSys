# GitHub y Cloudflare

## 1. Subir el código a GitHub

### Requisitos

- Cuenta en [GitHub](https://github.com).
- [Git](https://git-scm.com/) instalado (o GitHub Desktop).

### Crear el repositorio en GitHub

1. En GitHub: **New repository**.
2. Nombre (ej. `judicial-sys`), descripción opcional.
3. **Público** si querés que sea visible para todos.
4. **No** marques “Add README” si ya tenés código local (evitás conflicto de primer commit).

### En tu PC (carpeta del proyecto)

Si aún no configuraste el remoto:

```bash
cd ruta/al/proyecto
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git branch -M main
git push -u origin main
```

Si GitHub pide autenticación, usá un **Personal Access Token** (classic) con permiso `repo`, o el **GitHub CLI** (`gh auth login`).

### Qué **no** sube el repo (por `.gitignore`)

- `node_modules/`, `.next/`
- `.env` (secretos locales)
- `*.db` (SQLite local; cada entorno genera la suya)
- Contenido de `uploads/` (solo se mantiene la carpeta con `.gitkeep`)

En el servidor o en CI hay que definir variables (p. ej. copiar de `.env.example` y completar `DATABASE_URL`, etc.).

---

## 2. Hacerlo “público en Cloudflare”

Cloudflare puede implicar **dos cosas distintas**:

| Objetivo | Qué usar |
|----------|-----------|
| Dominio + HTTPS delante de tu app | **DNS** en Cloudflare apuntando al servidor donde corre Next (A/CNAME al VPS, Railway, etc.). |
| Hosting de la app en la infraestructura de Cloudflare | **Cloudflare Pages** o **Workers** (con adaptador tipo OpenNext). |

### Importante sobre **este** proyecto

JudicialSys hoy está pensado para un **servidor Node tradicional** (o contenedor):

- **`output: "standalone"`** en `next.config.ts` → build listo para `node server.js`.
- **Prisma con SQLite en archivo** (`file:./prisma/dev.db`) → en **Cloudflare Workers/Pages** el sistema de archivos no sirve para una BD persistente como en tu PC. Haría falta migrar a **PostgreSQL**, **Neon**, **Turso**, **Cloudflare D1**, etc., y ajustar `schema.prisma` y variables de entorno.
- Dependencias nativas como **`bcrypt`** suelen dar problemas en el runtime **edge** de Cloudflare; a veces hay que cambiar a `bcryptjs` u otra estrategia.

Por eso, para tener la app **online pronto** sin reescribir el backend:

1. Desplegá la app en un servicio con **Node** (Railway, Render, Fly.io, VPS con Docker, etc.).
2. En **Cloudflare**: dominio → DNS → registro **CNAME** al host que te dé ese proveedor (o proxy naranja si querés CDN/WAF).

### Si insistís en **Cloudflare Pages** como hosting de Next

Es viable, pero es un **proyecto aparte**: adaptar el build (p. ej. [@opennextjs/cloudflare](https://opennext.js.org/cloudflare)), base de datos remota compatible con Prisma en edge/serverless, y revisar cada ruta API. No es “conectar el repo y listo” con el estado actual del código.

Pasos generales (referencia, no sustituyen la migración):

1. Conectar el repo en **Cloudflare Dashboard → Workers & Pages → Create → Connect to Git**.
2. **Instalación de dependencias:** que el proyecto use **npm** con `package-lock.json` en la raíz. No versionar `bun.lock` desactualizado: Cloudflare detecta Bun y ejecuta `bun install --frozen-lockfile`, que falla si el lock no coincide con `package.json`.
3. **Comando de build:** `npm run build:cloudflare` (genera `.open-next/`; no basta con `npm run build`).
4. **Variables de entorno en el panel** (`DATABASE_URL`, claves S3, etc.) y, en **Variables de entorno del build**, `PUPPETEER_SKIP_DOWNLOAD=1` para no descargar Chromium en CI (ahorra cientos de MB y tiempo; en Workers el PDF vía Puppeteer no aplica igual que en Node local).

---

## 3. Resumen práctico

1. **GitHub**: `git push` al remoto `origin` en rama `main` (o la que usen).
2. **Cloudflare “público”** más directo hoy: **DNS + proxy** hacia un host Node donde despleguen el `standalone` de Next.
3. **Cloudflare como único hosting** del Next completo: posible, pero requiere **cambio de base de datos y ajustes de runtime**; planificar aparte.

Si más adelante definís “solo Pages estático” o “migración a Postgres + OpenNext”, se puede acotar el trabajo en issues concretos.
