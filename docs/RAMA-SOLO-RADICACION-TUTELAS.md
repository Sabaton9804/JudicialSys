# Rama `solo-radicacion-tutelas`

## Objetivo

Interfaz **solo Radicación y Tutelas** (menú lateral y cabecera reducidos), sin fusionar con `main` hasta que decidan.

## Cómo está implementado

- `src/config/judicialsys-shell.ts` exporta `SHELL_SOLO_RADICACION_TUTELAS = true`.
- `src/app/page.tsx` usa ese flag para ocultar áreas (Despacho/Admin), enlaces a procesos/publicaciones/plantillas y limitar datos cargados en Secretaría (`fetchJuzgados` + tutelas cuando aplica).

## Volver al panel completo

1. Cambiar en `judicialsys-shell.ts` a `false`, o eliminar el archivo y las referencias en `page.tsx`.
2. O trabajar en `main`, donde esta rama no aplica.

## Git

```bash
git checkout solo-radicacion-tutelas   # esta variante
git checkout main                      # aplicación completa
```

Publicar solo esta rama en Cloudflare/Pages: conectar el mismo repo y elegir la rama `solo-radicacion-tutelas` en el proyecto de build.
