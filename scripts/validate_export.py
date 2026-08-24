#!/usr/bin/env python3
"""Valida contrato, orden, rutas y tamaños de la publicación AUCA."""

from __future__ import annotations

import csv
import json
import sys
from datetime import datetime
from pathlib import Path

from export_monthly_csv import CSV_HEADER, MAX_FILE_BYTES, ROOT, VARIABLE_META


def fail(message: str) -> None:
    raise ValueError(message)


def main() -> None:
    data_dir = ROOT / "data"
    manifest_path = data_dir / "manifest.json"
    latest_path = data_dir / "latest.csv"
    if not manifest_path.is_file() or not latest_path.is_file():
        fail("Faltan manifest.json o latest.csv")

    temporaries = list(data_dir.rglob("*.tmp"))
    if temporaries:
        fail("Temporales pendientes: " + ", ".join(map(str, temporaries)))

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1:
        fail("schema_version no compatible")
    if manifest.get("max_csv_bytes") != MAX_FILE_BYTES:
        fail("max_csv_bytes no coincide con el exportador")
    if set(manifest.get("variables", {})) != set(VARIABLE_META):
        fail("Las variables del manifiesto no coinciden")

    configured = json.loads((ROOT / "config" / "stations.json").read_text(encoding="utf-8"))
    expected_codes = {station["code"] for station in configured}
    published_codes = {station["code"] for station in manifest.get("stations", [])}
    if published_codes != expected_codes:
        fail(f"Estaciones publicadas inesperadas: {published_codes ^ expected_codes}")

    for station in manifest["stations"]:
        for month, relative_paths in station.get("months", {}).items():
            previous = None
            for relative in relative_paths:
                path = ROOT / relative
                if not path.is_file():
                    fail(f"No existe {relative}")
                if path.stat().st_size > MAX_FILE_BYTES:
                    fail(f"{relative} supera 40 MiB")
                with path.open(newline="", encoding="utf-8") as handle:
                    reader = csv.DictReader(handle)
                    if reader.fieldnames != CSV_HEADER:
                        fail(f"Encabezado incorrecto en {relative}")
                    for row_number, row in enumerate(reader, start=2):
                        value = row["fecha"]
                        if not value.startswith(month):
                            fail(f"Fecha fuera de mes en {relative}:{row_number}")
                        parsed = datetime.fromisoformat(value)
                        if previous and parsed < previous:
                            fail(f"Orden incorrecto en {relative}:{row_number}")
                        previous = parsed

    with latest_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != ["codigo", "fecha", "variable", "valor"]:
            fail("Encabezado incorrecto en latest.csv")
        for row in reader:
            if row["codigo"] not in expected_codes:
                fail(f"Código inesperado en latest.csv: {row['codigo']}")
            if row["variable"] not in VARIABLE_META:
                fail(f"Variable inesperada en latest.csv: {row['variable']}")
            datetime.fromisoformat(row["fecha"])
            float(row["valor"])

    print("Validación correcta: manifiesto, latest y CSV mensuales")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1) from error
