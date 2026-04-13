"""Volcado de catálogos T05x relacionados con radicación (BD consejo)."""
import sys
from datetime import datetime
from pathlib import Path

import pyodbc

DSN = "csjsql"
OUT = Path(__file__).resolve().parent / "reports" / f"catalogos-radicacion_{datetime.now():%Y%m%d_%H%M%S}.txt"

# Tablas típicas Justicia XXI por prefijo de columnas en T103
CANDIDATAS = [
    "T050BACONSGENE",  # consecutivo?
    "T051BAENTIGENE",
    "T052BAPROCGENE",  # tipo proceso -> A103CODIPROC
    "T053BACLASGENE",  # clase -> A103CODICLAS
    "T054BAACTUGENE",  # actuaciones
    "T055BAFORMGENE",
    "T056BARECUGENE",  # recurso -> A103CODIRECU
    "T057BASUJEGENE",
    "T058BAINSTGENE",  # instancia -> A103CODIINST
    "T059BANORMGENE",
    "T060BADECIGENE",
    "T061BAUBICGENE",  # ubicación
    "T062BAESPEGENE",  # especialidad?
    "T063BAPROVGENE",
    "T064BADELIGENE",  # delito?
    "T065BACIUDGENE",
    "T066BAENTINORM",
    "T067BAREBAGENE",
    "T068BADESCGENE",
    "T069BAAREAGENE",  # area -> A103CODIAREA
    "T070BACAMPGENE",
    "T071BASUBCGENE",  # subclase -> A103CODISUBC
]


def cols(cur, table):
    cur.execute(
        """
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME=?
        ORDER BY ORDINAL_POSITION
        """,
        (table,),
    )
    return cur.fetchall()


def table_exists(cur, table):
    cur.execute(
        "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME=?",
        (table,),
    )
    return cur.fetchone() is not None


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    lines = []

    def emit(s=""):
        print(s)
        lines.append(s)

    conn = pyodbc.connect(f"DSN={DSN}", timeout=20)
    cur = conn.cursor()

    emit("=== CATALOGOS RADICACION — consejo ===")
    emit(f"{datetime.now().isoformat(timespec='seconds')}")
    emit("")

    for tbl in CANDIDATAS:
        if not table_exists(cur, tbl):
            emit(f"[{tbl}] NO EXISTE")
            emit("")
            continue
        meta = cols(cur, tbl)
        emit(f"=== {tbl} ({len(meta)} columnas) ===")
        emit("  " + ", ".join(f"{c[0]}:{c[1]}{f'({c[2]})' if c[2] else ''}" for c in meta[:12]))
        if len(meta) > 12:
            emit(f"  ... +{len(meta)-12} columnas")

        # Primeras columnas varchar con CODI o DESC en el nombre para ORDER BY
        code_col = None
        desc_col = None
        for c in meta:
            n = c[0].upper()
            if "CODI" in n and code_col is None:
                code_col = c[0]
            if ("DESC" in n or "NOMB" in n) and desc_col is None:
                desc_col = c[0]
        if not code_col:
            code_col = meta[0][0] if meta else None

        try:
            cur.execute(f"SELECT COUNT(*) FROM dbo.[{tbl}]")
            cnt = cur.fetchone()[0]
            emit(f"  Filas: {cnt:,}")
        except Exception as e:
            emit(f"  COUNT error: {e}")
            emit("")
            continue

        if cnt == 0 or not code_col:
            emit("")
            continue

        # Listar todo si pocas filas; si muchas, TOP 500 ordenado por código
        limit = min(cnt, 800) if cnt > 800 else cnt
        order = f"[{code_col}]"
        if desc_col:
            sel = f"[{code_col}], [{desc_col}]"
        else:
            sel = f"[{code_col}]"

        try:
            if cnt <= 800:
                q = f"SELECT {sel} FROM dbo.[{tbl}] ORDER BY {order}"
                cur.execute(q)
            else:
                q = f"SELECT TOP 500 {sel} FROM dbo.[{tbl}] ORDER BY {order}"
                cur.execute(q)
            rows = cur.fetchall()
            emit(f"  Muestra ({len(rows)} filas):")
            for r in rows:
                a = r[0]
                b = r[1] if len(r) > 1 else ""
                bs = (str(b)[:80] + "…") if b and len(str(b)) > 80 else str(b)
                emit(f"    {a!s} | {bs}")
        except Exception as e:
            emit(f"  SELECT error: {e}")

        emit("")

    conn.close()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n[Informe: {OUT}]")


if __name__ == "__main__":
    main()
