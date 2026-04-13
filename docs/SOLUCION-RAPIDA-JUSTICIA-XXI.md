# Solución rápida — que Justicia XXI (SQL) funcione

Dos caminos. Use **uno** según lo que le dé sistemas.

---

## Camino 1 — Sin puente (el más simple si TI le da usuario SQL)

No hace falta `msnodesqlv8` ni segundo proceso ni puerto 3847.

1. **VPN de la Rama conectada.**
2. En `.env` o `.env.local`:

```env
JUSTICIA_XXI_BRIDGE_DISABLED=1
JUSTICIA_XXI_SQL_SERVER=172.16.155.193
JUSTICIA_XXI_SQL_PORT=1433
JUSTICIA_XXI_SQL_DATABASE=consejo
JUSTICIA_XXI_SQL_USER=el_usuario_que_de_TI
JUSTICIA_XXI_SQL_PASSWORD=la_clave_que_de_TI
```

3. **Una sola terminal:** `npm run dev`
4. En el expediente: **desmarque** «Cuenta de Windows» y deje vacío si ya está todo en `.env`, o rellene usuario/clave en el formulario.

Si `Test-NetConnection ... -Port 1433` da `True` y el login SQL es correcto, esto suele ser lo que menos se rompe.

---

## Camino 2 — Con puente (cuenta Windows / Trusted Connection)

### Un solo comando (por defecto)

Desde la raíz del repo:

```bash
npm run dev
```

Eso levanta **el puente** y **Next** en la **misma** ventana (dos procesos con `concurrently`). **Deje esa ventana abierta.**

Si no quiere el puente (solo Next): `npm run dev:no-bridge` o en `.env` ponga `JUSTICIA_XXI_BRIDGE_DISABLED=1`.

### Si dice que 3847 está en uso

En PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 3847 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
```

Luego otra vez: `npm run dev` (o `npm run dev:bridge:fresh` para matar puertos y arrancar)

### Comprobar puente

Navegador: `http://127.0.0.1:3847/health` → debe salir `{"ok":true,"service":"justicia-xxi-bridge"}`.

### Red al SQL

Con VPN:

```powershell
Test-NetConnection SU_IP_SQL -Port 1433
```

`TcpTestSucceeded : True` es obligatorio antes de culpar a la app.

---

## Si sigue fallando

| Síntoma | Acción |
|--------|--------|
| `fetch failed` al puente | Arranque `npm run dev` (incluye puente) o mate el proceso en 3847 y reinicie. |
| Timeout largo / error SQL | Pruebe `JUSTICIA_XXI_SQL_ENCRYPT=true` en `.env`. Pida usuario SQL (camino 1). |
| 400 / mensaje de login | TI debe crear login en SQL y permisos sobre `consejo` (no sysadmin; mínimo para insertar en tablas que use la app). |

---

## Resumen brutal

- **Que “sirva” con menos dolor:** Camino 1 (usuario SQL + `JUSTICIA_XXI_BRIDGE_DISABLED=1` + una terminal).
- **Debe usar Windows integrada:** Camino 2 con `npm run dev` y VPN + red al 1433 OK.
