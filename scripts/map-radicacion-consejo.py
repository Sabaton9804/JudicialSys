"""
Mapeo BD consejo: qué columnas exige T103 y tablas hijas típicas para radicación.
Salida: scripts/reports/mapa-radicacion-consejo.txt
"""
import sys
from datetime import datetime
from pathlib import Path

try:
    import pyodbc
except ImportError:
    print("pip install pyodbc")
    sys.exit(1)

DSN = "csjsql"
OUT = Path(__file__).resolve().parent / "reports" / f"mapa-radicacion-consejo_{datetime.now():%Y%m%d_%H%M%S}.txt"

# Tablas con FK a T103 (radicación = cabecera + sujetos + 1ª actuación)
HIJAS = [
    "T103DAINFOPROC",
    "T110DRACTUPROC",
    "T120DRPONEPROC",
    "T121DRDOCSPROC",
    "T122DRDESTPROC",
    "T123DRDELIPROC",
    "T124DRTITUPROC",
    "T114DRNORMPROC",
    "T115DRFICHPROC",
]


def col_meta(cur, table: str):
    cur.execute(
        """
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
        """,
        (table,),
    )
    return cur.fetchall()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    lines = []
    conn = pyodbc.connect(f"DSN={DSN}", timeout=15)
    cur = conn.cursor()

    def emit(s=""):
        print(s)
        lines.append(s)

    emit("=== MAPA RADICACIÓN AUTOMÁTICA — BD consejo ===")
    emit(f"Generado: {datetime.now().isoformat(timespec='seconds')}")
    emit("")
    emit("NOTA: El radicado 23 dígitos NO viene del ciudadano; lo compone el juzgado:")
    emit("  ciudad(5)+circuito(2)+especialidad(2)+despacho(3)+año(4)+consecutivo(5)+instancia(2)")
    emit("  El sistema debe: (1) conocer código 12 del despacho, (2) obtener siguiente consecutivo")
    emit("  para ese despacho+año en T103, (3) armar A103LLAVPROC y campos derivados.")
    emit("")

    emit("--- T103DAINFOPROC: columnas NOT NULL (obligatorias en INSERT) ---")
    for r in col_meta(cur, "T103DAINFOPROC"):
        name, dtype, clen, null, default = r
        if null == "NO":
            sz = f"({clen})" if clen else ""
            d = (default or "").strip()[:40]
            emit(f"  * {name}  {dtype}{sz}  default={d!r}")

    emit("\n--- T103DAINFOPROC: columnas NULLABLE (rellenar según negocio / IA / catálogo) ---")
    for r in col_meta(cur, "T103DAINFOPROC"):
        name, dtype, clen, null, default = r
        if null == "YES":
            sz = f"({clen})" if clen else ""
            emit(f"    {name}  {dtype}{sz}")

    emit("\n--- T110DRACTUPROC: NOT NULL (primera actuación radicación) ---")
    for r in col_meta(cur, "T110DRACTUPROC"):
        name, dtype, clen, null, default = r
        if null == "NO":
            sz = f"({clen})" if clen else ""
            emit(f"  * {name}  {dtype}{sz}")

    emit("\n--- T122DRDESTPROC y T123DRDELIPROC: todas las columnas (sujetos / destinos) ---")
    for tbl in ("T122DRDESTPROC", "T123DRDELIPROC"):
        try:
            emit(f"\n  [{tbl}]")
            for r in col_meta(cur, tbl):
                name, dtype, clen, null, default = r
                sz = f"({clen})" if clen else ""
                emit(f"    {name} {dtype}{sz} {'NOT NULL' if null == 'NO' else 'NULL'}")
        except Exception as e:
            emit(f"  error {tbl}: {e}")

    emit("\n--- Tablas hijas: recuento columnas y NOT NULL (muestra) ---")
    for tbl in HIJAS:
        try:
            cur.execute(f"SELECT COUNT(*) FROM dbo.[{tbl}]")
            n = cur.fetchone()[0]
            meta = col_meta(cur, tbl)
            nn = [r[0] for r in meta if r[3] == "NO"]
            emit(f"\n  [{tbl}] filas={n:,} | NOT NULL ({len(nn)}): {', '.join(nn[:12])}")
            if len(nn) > 12:
                emit(f"      ... +{len(nn)-12} más")
        except Exception as e:
            emit(f"\n  [{tbl}] error: {e}")

    emit("\n--- Consulta siguiente consecutivo (plantilla — validar con DBA) ---")
    emit("  -- Por despacho implícito en ciudad+entidad+espe+desp+año:")
    emit("  SELECT MAX(CAST(A103NUMERADI AS INT)) FROM T103DAINFOPROC")
    emit("  WHERE A103CIUDRADI=? AND A103ENTIRADI=? AND A103ESPERADI=? AND A103NUENRADI=? AND A103ANORADI=?")
    emit("")

    emit("=== ROL IA vs SISTEMA (resumen operativo) ===")
    emit("IA / demanda en línea (texto + PDF) debe extraer para radicar:")
    emit("  - Nombre e identificación demandante y demandado (y tipo persona si consta)")
    emit("  - Clase/naturaleza del proceso en lenguaje natural -> mapeo a codigos T05x (config juzgado)")
    emit("  - Objeto / síntesis demanda (texto para expediente interno o folios)")
    emit("  - Cuantía si aplica")
    emit("  - Cualquier dato de competencia o pretensiones que el formulario oficial pida")
    emit("Sistema (servidor juzgado), NO la IA:")
    emit("  - A103LLAVPROC, A103NUMEPROC, A103CONSPROC, troceo radiación, A103ANORADI, A103NUMERADI")
    emit("  - Consecutivo único por despacho y año (MAX+1 o secuencia del proveedor)")
    emit("  - Códigos de usuario que radica, fechas/hora oficiales")
    emit("  - Primera fila T110 (código radicación) + triggers CPNU si aplica")
    emit("")

    conn.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n[Guardado: {OUT}]")


if __name__ == "__main__":
    main()
