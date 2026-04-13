# -*- coding: utf-8 -*-
"""
Informe: pantalla UniSoftware Radicacion Consejo <-> BD consejo (T103 + catalogos T05x).
Salida: scripts/reports/informe_radicacion_consejo_YYYYMMDD.txt
"""
import sys
from datetime import datetime
from pathlib import Path

import pyodbc

DSN = "csjsql"
OUT_DIR = Path(__file__).resolve().parent / "reports"


def fetch_all(cur, sql):
    cur.execute(sql)
    return cur.fetchall()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    lines = []

    def L(s=""):
        lines.append(s)

    conn = pyodbc.connect(f"DSN={DSN}", timeout=20)
    cur = conn.cursor()

    L("=" * 78)
    L("INFORME: RADICACION CONSEJO (UniSoftware) Y CATALOGOS EN BD consejo")
    L(f"Generado: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    L("Fuente catálogos: tablas T069, T052, T053, T071, T056, T058, T051, T057, T061, T070")
    L("(La BD local del juzgado suele ser la misma familia de códigos que usa el cliente Consejo.)")
    L("=" * 78)

    L("")
    L("1. MAPEO PANTALLA -> CAMPOS T103DAINFOPROC (y relacionados)")
    L("-" * 78)
    L("")
    L("Ventana 'Nuevo Proceso':")
    L("  Anio                    -> A103ANORADI (4 digitos)")
    L("  Consecutivo             -> A103NUMERADI (5 digitos, asignado por juzgado/sistema)")
    L("  Ciudad (ej. 11001)      -> A103CIUDRADI")
    L("  Corporacion/Despacho    -> A103ENTIRADI (2) — en CUI = 'circuito'")
    L("  Especialidad (ej. 03)   -> A103ESPERADI")
    L("  Numero de Despacho      -> A103NUENRADI (3)")
    L("  Instancia               -> A103CONSPROC (2, libro) + opcional A103CODIINST (T058)")
    L("")
    L("Seccion 'Basica':")
    L("  No. Proceso             -> A103LLAVPROC (23) / A103NUMEPROC (21) compuestos del anterior")
    L("  Fecha                   -> A103FECHPROC")
    L("  Hora                    -> A103HORAPROC")
    L("  Area                    -> A103CODIAREA  (cat. T069BAAREAGENE)")
    L("  Tipo de Proceso         -> A103CODIPROC  (cat. T052BAPROCGENE)")
    L("  Clase de Proceso        -> A103CODICLAS  (cat. T053BACLASGENE)")
    L("  Subclase                -> A103CODISUBC  (cat. T071BASUBCGENE)")
    L("  Tipo de Recurso         -> A103CODIRECU  (cat. T056BARECUGENE)")
    L("  'En' (origen/competencia) -> A103CODICIUO + A103CODIENTO + A103CODIESPO + A103CODINUMO")
    L("      (segmentos origen; ciudad/origen suele alinearse con DANE T065 y despacho T051)")
    L("")
    L("Pestaña 'Sujetos':")
    L("  Tipo de Sujeto          -> codigo T057BASUJEGENE (al insertar en tablas T122/T123/etc.)")
    L("  Numero (ID/NIT)         -> documento del sujeto en fila de destinatario/deligenciado")
    L("  Nombre                  -> nombre del sujeto")
    L("")
    L("Otros útiles post-radicacion:")
    L("  Ubicacion bandeja       -> A103CODIUBIC (T061BAUBICGENE)")
    L("  Tipo documento identidad-> T070BACAMPGENE (cédula, NIT, etc.)")
    L("")
    L("Primera actuacion al radicar (T110DRACTUPROC):")
    L("  Codigo tipico 00000001 'Radicacion', A110TIPOACTU 'R' (segun registro de ejemplo en BD).")
    L("")

    catalogos = [
        ("T069BAAREAGENE", "A069CODIAREA", "A069DESCAREA", "AREA (campo Area)"),
        ("T052BAPROCGENE", "A052CODIPROC", "A052DESCPROC", "TIPO DE PROCESO"),
        ("T053BACLASGENE", "A053CODICLAS", "A053DESCCLAS", "CLASE DE PROCESO"),
        ("T071BASUBCGENE", "A071CODISUBC", "A071DESCSUBC", "SUBCLASE"),
        ("T056BARECUGENE", "A056CODIRECU", "A056DESCRECU", "TIPO DE RECURSO"),
        ("T058BAINSTGENE", "A058CODIINST", "A058DESCINST", "INSTANCIA (lista auxiliar)"),
        ("T057BASUJEGENE", "A057CODISUJE", "A057DESCSUJE", "TIPO DE SUJETO (Sujetos)"),
    ]

    for table, ccode, cdesc, titulo in catalogos:
        L("")
        L(f"2.x {titulo}")
        L(f"    Tabla: {table}")
        L("-" * 78)
        try:
            rows = fetch_all(
                cur,
                f"SELECT [{ccode}], [{cdesc}] FROM dbo.[{table}] ORDER BY [{ccode}]",
            )
            for code, desc in rows:
                d = (desc or "").strip()
                L(f"  {code}  |  {d}")
            L(f"  (Total: {len(rows)} registros)")
        except Exception as e:
            L(f"  ERROR: {e}")

    L("")
    L("2.8 ENTIDAD / CORPORACION (referencia — T051BAENTIGENE)")
    L("    Usada en listas de entidad; relacionada con segmentos de radicacion/origen.")
    L("-" * 78)
    try:
        rows = fetch_all(
            cur,
            "SELECT A051CODIENTI, A051DESCENTI FROM dbo.T051BAENTIGENE ORDER BY A051CODIENTI",
        )
        for code, desc in rows:
            L(f"  {code}  |  {(desc or '').strip()}")
        L(f"  (Total: {len(rows)} registros)")
    except Exception as e:
        L(f"  ERROR: {e}")

    L("")
    L("2.9 UBICACION PROCESO (T061BAUBICGENE) — bandeja despacho/secretaria")
    L("-" * 78)
    try:
        rows = fetch_all(
            cur,
            "SELECT A061CODIUBIC, A061DESCUBIC FROM dbo.T061BAUBICGENE ORDER BY A061CODIUBIC",
        )
        for code, desc in rows:
            L(f"  {code}  |  {(desc or '').strip()}")
        L(f"  (Total: {len(rows)} registros)")
    except Exception as e:
        L(f"  ERROR: {e}")

    L("")
    L("2.10 TIPO DOCUMENTO IDENTIDAD (T070BACAMPGENE)")
    L("-" * 78)
    try:
        rows = fetch_all(
            cur,
            "SELECT A070CODICAMP, A070DESCCAMP FROM dbo.T070BACAMPGENE ORDER BY A070CODICAMP",
        )
        for code, desc in rows:
            L(f"  {code}  |  {(desc or '').strip()}")
        L(f"  (Total: {len(rows)} registros)")
    except Exception as e:
        L(f"  ERROR: {e}")

    L("")
    L("3. ACTUACION INICIAL (T054BAACTUGENE — extracto)")
    L("-" * 78)
    L("  La primera actuacion al crear proceso suele ser:")
    try:
        rows = fetch_all(
            cur,
            "SELECT A054CODIACTU, A054DESCACTU FROM dbo.T054BAACTUGENE WHERE A054CODIACTU IN ('00000001','00000002') ORDER BY A054CODIACTU",
        )
        for code, desc in rows:
            L(f"  {code}  |  {(desc or '').strip()}")
    except Exception as e:
        L(f"  ERROR: {e}")
    L("  Catalogo completo de actuaciones: 403 filas (ver dump-catalogos-radicacion.py).")

    L("")
    L("4. NOTAS PARA AUTOMATIZACION")
    L("-" * 78)
    L("  - Combinaciones Area+Tipo+Clase+Subclase deben ser las que el Consejo/juzgado permita;")
    L("    el catalogo lista valores posibles, no todas las combinaciones son validas.")
    L("  - Consecutivo y CUI de 23 digitos los asigna el juzgado al radicar (no vienen del ciudadano).")
    L("  - UniSoftware y Justicia XXI pueden compartir nomenclatura; validar en su instalacion.")
    L("")

    conn.close()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"informe_radicacion_consejo_{datetime.now():%Y%m%d_%H%M%S}.txt"
    path.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    print(f"\n[Archivo: {path}]")


if __name__ == "__main__":
    main()
