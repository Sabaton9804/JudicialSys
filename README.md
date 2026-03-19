# JudicialSys

Aplicación web (Next.js + Prisma) para gestión judicial interna de juzgado: expedientes, memoriales, providencias, oficios, términos, emplazamientos/notificaciones, etc.

## Desarrollo local

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Documentación funcional: [`docs/COMO_FUNCIONA.md`](docs/COMO_FUNCIONA.md).

## GitHub y despliegue

Instrucciones para publicar el código en GitHub y opciones en Cloudflare: [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).
