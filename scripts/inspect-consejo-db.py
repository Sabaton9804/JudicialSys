"""
Inspección completa BD Justicia XXI (DSN csjsql → base consejo).
- Columnas completas T103DAINFOPROC, T110DRACTUPROC
- Índices, FKs hacia/desde esas tablas
- Definición SQL de triggers (OBJECT_DEFINITION)
Salida: consola + archivo en scripts/reports/
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

try:
    import pyodbc
except ImportError:
    print("ERROR: pip install pyodbc")
    sys.exit(1)

DSN = "csjsql"
TABLES = ("T103DAINFOPROC", "T110DRACTUPROC")

REPORTS_DIR = Path(__file__).resolve().parent / "reports"


class Reporter:
    def __init__(self) -> None:
        self.lines: list[str] = []

    def emit(self, s: str = "") -> None:
        print(s)
        self.lines.append(s)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(self.lines) + "\n", encoding="utf-8")
        print(f"\n[Informe guardado: {path}]")


def fmt_col(row) -> str:
    name, dtype, char_len, num_prec, num_scale, nullable, col_default = row
    extra = []
    if char_len and dtype in ("varchar", "nvarchar", "char", "nchar"):
        extra.append(f"({char_len})")
    elif num_prec is not None:
        extra.append(f"({num_prec},{num_scale or 0})")
    null = "NULL" if nullable == "YES" else "NOT NULL"
    d = (col_default or "").strip()
    if len(d) > 60:
        d = d[:57] + "..."
    defpart = f" default={d}" if d else ""
    return f"  {name}: {dtype}{''.join(extra)} {null}{defpart}"


def all_columns(cur, table: str, rep: Reporter) -> None:
    rep.emit(f"\n=== COLUMNAS COMPLETAS {table} ===")
    cur.execute(
        """
        SELECT c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH,
               c.NUMERIC_PRECISION, c.NUMERIC_SCALE, c.IS_NULLABLE, c.COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_SCHEMA = 'dbo' AND c.TABLE_NAME = ?
        ORDER BY c.ORDINAL_POSITION
        """,
        (table,),
    )
    rows = cur.fetchall()
    rep.emit(f"  Total columnas: {len(rows)}")
    for r in rows:
        rep.emit(fmt_col(r))


def indexes_on_table(cur, table: str, rep: Reporter) -> None:
    """Sin FOR XML (.value): compatible SQL 2008 R2 sin forzar ARITHABORT."""
    rep.emit(f"\n=== ÍNDICES {table} ===")
    obj = f"dbo.{table}"
    cur.execute(
        """
        SELECT i.index_id, i.name, i.type_desc, i.is_unique, i.is_primary_key,
               ic.key_ordinal, c.name AS col_name, ic.is_descending_key
        FROM sys.indexes i
        JOIN sys.index_columns ic
          ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        JOIN sys.columns c
          ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE i.object_id = OBJECT_ID(?) AND i.name IS NOT NULL
        ORDER BY i.index_id, ic.key_ordinal
        """,
        (obj,),
    )
    rows = cur.fetchall()
    by_index: dict[tuple, dict] = {}
    for r in rows:
        idx_id, name, type_desc, is_u, is_pk, ko, col, is_desc = r
        key = (idx_id, name, type_desc, is_u, is_pk)
        if key not in by_index:
            by_index[key] = {"cols": []}
        suf = " DESC" if is_desc else ""
        by_index[key]["cols"].append(f"{col}{suf}")
    if not by_index:
        rep.emit("  (sin índices con nombre)")
    for (idx_id, name, type_desc, is_u, is_pk), data in sorted(
        by_index.items(), key=lambda x: x[0][0]
    ):
        cols_s = ", ".join(data["cols"])
        rep.emit(f"  {name} | {type_desc} | unique={is_u} PK={is_pk} | ({cols_s})")


def foreign_keys(cur, table: str, rep: Reporter) -> None:
    rep.emit(f"\n=== FOREIGN KEYS (referencian {table}) ===")
    cur.execute(
        """
        SELECT fk.name, OBJECT_SCHEMA_NAME(fk.parent_object_id) + '.' + OBJECT_NAME(fk.parent_object_id),
               cp.name, OBJECT_SCHEMA_NAME(fk.referenced_object_id) + '.' + OBJECT_NAME(fk.referenced_object_id),
               cr.name
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        JOIN sys.columns cp ON cp.object_id = fkc.parent_object_id AND cp.column_id = fkc.parent_column_id
        JOIN sys.columns cr ON cr.object_id = fkc.referenced_object_id AND cr.column_id = fkc.referenced_column_id
        WHERE fk.referenced_object_id = OBJECT_ID(?)
        ORDER BY fk.name
        """,
        (f"dbo.{table}",),
    )
    rows = cur.fetchall()
    if not rows:
        rep.emit("  (ninguna FK apunta a esta tabla)")
    else:
        for r in rows:
            rep.emit(f"  {r[0]}: {r[1]}.{r[2]} -> {r[3]}.{r[4]}")

    rep.emit(f"\n=== FOREIGN KEYS ({table} referencia otras) ===")
    cur.execute(
        """
        SELECT fk.name, cp.name,
               OBJECT_SCHEMA_NAME(fk.referenced_object_id) + '.' + OBJECT_NAME(fk.referenced_object_id),
               cr.name
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        JOIN sys.columns cp ON cp.object_id = fkc.parent_object_id AND cp.column_id = fkc.parent_column_id
        JOIN sys.columns cr ON cr.object_id = fkc.referenced_object_id AND cr.column_id = fkc.referenced_column_id
        WHERE fk.parent_object_id = OBJECT_ID(?)
        ORDER BY fk.name
        """,
        (f"dbo.{table}",),
    )
    rows = cur.fetchall()
    if not rows:
        rep.emit("  (esta tabla no tiene FK salientes listadas)")
    else:
        for r in rows:
            rep.emit(f"  {r[0]}: {r[1]} -> {r[2]}.{r[3]}")


def trigger_definitions(cur, rep: Reporter) -> None:
    rep.emit("\n=== TRIGGERS: nombres ===")
    cur.execute(
        """
        SELECT t.object_id, t.name, OBJECT_NAME(t.parent_id) AS parent_tbl
        FROM sys.triggers t
        WHERE OBJECT_NAME(t.parent_id) IN ('T103DAINFOPROC', 'T110DRACTUPROC')
        ORDER BY parent_tbl, t.name
        """
    )
    trigs = cur.fetchall()
    for oid, name, ptbl in trigs:
        rep.emit(f"  {ptbl}: {name} (object_id={oid})")

    rep.emit("\n=== Metadatos triggers (cifrado / definición) ===")
    for oid, name, ptbl in trigs:
        cur.execute("SELECT OBJECTPROPERTY(?, 'IsEncrypted')", (oid,))
        is_enc = cur.fetchone()[0]
        cur.execute(
            "SELECT DATALENGTH(m.definition) FROM sys.sql_modules m WHERE m.object_id = ?",
            (oid,),
        )
        r = cur.fetchone()
        def_bytes = r[0] if r else None
        rep.emit(f"  {ptbl}.{name}: IsEncrypted={is_enc}, sql_modules.def_size={def_bytes}")

    rep.emit("\n=== DEFINICIONES SQL (OBJECT_DEFINITION) ===")
    for oid, name, ptbl in trigs:
        rep.emit("\n" + "-" * 72)
        rep.emit(f"-- TRIGGER: {name} ON {ptbl}")
        rep.emit("-" * 72)
        cur.execute("SELECT OBJECT_DEFINITION(?)", (oid,))
        defn = cur.fetchone()[0]
        if defn:
            rep.emit(defn)
        else:
            rep.emit(
                "  (OBJECT_DEFINITION NULL: trigger cifrado o metadatos no visibles con este usuario)"
            )


def table_counts(cur, rep: Reporter) -> None:
    rep.emit("\n=== CONTEO FILAS (tablas nucleares) ===")
    for tbl in ("T103DAINFOPROC", "T110DRACTUPROC", "T054BAACTUGENE"):
        try:
            cur.execute(f"SELECT COUNT_BIG(*) FROM dbo.[{tbl}]")
            n = cur.fetchone()[0]
            rep.emit(f"  {tbl}: {n:,}")
        except Exception as ex:
            rep.emit(f"  {tbl}: error {ex}")


def sample_row_full(cur, table: str, rep: Reporter) -> None:
    rep.emit(f"\n=== MUESTRA TOP 1 {table} (todas las columnas) ===")
    try:
        cur.execute(f"SELECT TOP 1 * FROM dbo.[{table}]")
        cols = [d[0] for d in cur.description]
        row = cur.fetchone()
        if not row:
            rep.emit("  (sin filas)")
            return
        for i, name in enumerate(cols):
            v = row[i]
            vs = repr(v) if v is not None else "NULL"
            if len(vs) > 200:
                vs = vs[:197] + "..."
            rep.emit(f"  {name}: {vs}")
    except Exception as ex:
        rep.emit(f"  error: {ex}")


def main() -> None:
    rep = Reporter()
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = REPORTS_DIR / f"inspect-consejo_{ts}.txt"

    try:
        conn = pyodbc.connect(f"DSN={DSN}", timeout=30)
    except Exception as e:
        print(f"CONEXIÓN FALLIDA (DSN={DSN}): {e}")
        sys.exit(2)

    cur = conn.cursor()
    rep.emit("=== INSPECCIÓN BD CONSEJO / Justicia XXI ===")
    rep.emit(f"Generado: {datetime.now().isoformat(timespec='seconds')}")
    rep.emit("")
    cur.execute("SELECT DB_NAME(), @@SERVERNAME, @@VERSION")
    row = cur.fetchone()
    rep.emit(f"Base: {row[0]}")
    rep.emit(f"Servidor: {row[1]}")
    rep.emit(f"Versión SQL Server:\n{row[2]}")

    cur.execute(
        """
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE'
        """
    )
    rep.emit(f"\nTotal tablas dbo: {cur.fetchone()[0]}")

    table_counts(cur, rep)

    for tbl in TABLES:
        all_columns(cur, tbl, rep)
        indexes_on_table(cur, tbl, rep)
        foreign_keys(cur, tbl, rep)
        sample_row_full(cur, tbl, rep)

    trigger_definitions(cur, rep)

    conn.close()
    rep.emit("\n=== FIN INSPECCIÓN ===")
    rep.save(out_path)


if __name__ == "__main__":
    main()
