#!/usr/bin/env python3
"""Publica mediciones AUCA como CSV mensuales para GitHub Pages.

El trabajo se ejecuta junto a MariaDB, consulta una estación/sensor/mes a la
vez con paginación keyset y reemplaza archivos completos de forma atómica.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

import mysql.connector


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "config" / "stations.json"
DEFAULT_OUTPUT = ROOT / "data"
DEFAULT_ENV_FILE = Path("/var/www/api_sensores/.env")
TIMEZONE = ZoneInfo("America/Santiago")
MAX_FILE_BYTES = 40 * 1024 * 1024
BATCH_SIZE = 5_000
PART_RE = re.compile(r"^(?P<month>\d{4}-\d{2})-part-(?P<part>\d{3})\.csv$")

CSV_HEADER = [
    "fecha",
    "pm1_ugm3",
    "pm25_ugm3",
    "pm10_ugm3",
    "temperatura_c",
    "humedad_pct",
    "temperatura_interna_c",
    "humedad_interna_pct",
    "relay",
    "senal",
]

VARIABLE_META: dict[str, dict[str, Any]] = {
    "pm1": {
        "column": "pm1_ugm3",
        "label": "Material particulado PM1",
        "shortLabel": "PM1",
        "unit": "µg/m³",
        "color": "#75b8c2",
        "decimals": 0,
        "category": "ambiente",
    },
    "pm25": {
        "column": "pm25_ugm3",
        "label": "Material particulado PM2.5",
        "shortLabel": "PM2.5",
        "unit": "µg/m³",
        "color": "#1f5d58",
        "decimals": 0,
        "category": "ambiente",
    },
    "pm10": {
        "column": "pm10_ugm3",
        "label": "Material particulado PM10",
        "shortLabel": "PM10",
        "unit": "µg/m³",
        "color": "#e3a83c",
        "decimals": 0,
        "category": "ambiente",
    },
    "temp": {
        "column": "temperatura_c",
        "label": "Temperatura ambiental",
        "shortLabel": "Temperatura",
        "unit": "°C",
        "color": "#b94b3d",
        "decimals": 1,
        "category": "ambiente",
    },
    "hum": {
        "column": "humedad_pct",
        "label": "Humedad ambiental",
        "shortLabel": "Humedad",
        "unit": "%",
        "color": "#4f86a6",
        "decimals": 1,
        "category": "ambiente",
    },
    "temp_internal": {
        "column": "temperatura_interna_c",
        "label": "Temperatura interna del equipo",
        "shortLabel": "Temp. interna",
        "unit": "°C",
        "color": "#9d5f37",
        "decimals": 1,
        "category": "operacion",
    },
    "hum_internal": {
        "column": "humedad_interna_pct",
        "label": "Humedad interna del equipo",
        "shortLabel": "Hum. interna",
        "unit": "%",
        "color": "#7a6ca8",
        "decimals": 1,
        "category": "operacion",
    },
    "relay": {
        "column": "relay",
        "label": "Estado del calefactor",
        "shortLabel": "Calefactor",
        "unit": "estado",
        "color": "#8dad6a",
        "decimals": 0,
        "category": "operacion",
    },
    "signal": {
        "column": "senal",
        "label": "Señal telefónica",
        "shortLabel": "Señal",
        "unit": "nivel",
        "color": "#486a68",
        "decimals": 0,
        "category": "operacion",
    },
}

# Solo variables que pasaron el perfil de datos del 24-08-2026. GPS y
# velocidad se excluyen por no ser necesarios; satélites (-1) y voltaje (0)
# se excluyen porque no contienen información útil en el período revisado.
MODEL_VARIABLES: dict[str, dict[int, str]] = {
    "PMS5003": {3: "temp", 6: "hum", 7: "pm1", 8: "pm25", 9: "pm10"},
    "CALEFACTORCMAS": {57: "relay", 58: "temp_internal", 59: "hum_internal"},
    "SIM7600G": {15: "signal"},
}


@dataclass(frozen=True)
class Source:
    sensor_id: int
    variables: dict[int, str]


def load_env_file(path: Path) -> None:
    """Carga KEY=VALUE sin mostrar ni reemplazar secretos del entorno."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key:
            os.environ.setdefault(key, value)


def db_config(env_file: Path) -> dict[str, Any]:
    load_env_file(env_file)
    required = ["DB_USER", "DB_PASSWORD", "DB_HOST", "DB_NAME"]
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        raise RuntimeError("Faltan variables de MariaDB: " + ", ".join(missing))
    return {
        "user": os.environ["DB_USER"],
        "password": os.environ["DB_PASSWORD"],
        "host": os.environ["DB_HOST"],
        "database": os.environ["DB_NAME"],
        "port": int(os.environ.get("DB_PORT", "3306")),
        "connection_timeout": 15,
    }


def load_stations(path: Path) -> list[dict[str, Any]]:
    stations = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(stations, list) or not stations:
        raise ValueError("config/stations.json debe ser una lista no vacía")
    return stations


def month_bounds(month: str) -> tuple[datetime, datetime]:
    start = datetime.strptime(month, "%Y-%m")
    end = (
        start.replace(year=start.year + 1, month=1)
        if start.month == 12
        else start.replace(month=start.month + 1)
    )
    return start, end


def iter_months(start: date, end: date) -> Iterable[str]:
    current = start.replace(day=1)
    last = end.replace(day=1)
    while current <= last:
        yield current.strftime("%Y-%m")
        current += timedelta(days=monthrange(current.year, current.month)[1])


def discover_sources(connection, device_id: int) -> list[Source]:
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT s.id_sensor, st.modelo
            FROM sensores_en_dispositivo AS sd
            JOIN sensores AS s ON s.id_sensor = sd.id_sensor
            JOIN sensores_tipo AS st ON st.id_sensor_tipo = s.id_sensor_tipo
            WHERE sd.id_dispositivo = %s
            ORDER BY s.id_sensor
            """,
            (device_id,),
        )
        sources = [
            Source(int(row["id_sensor"]), MODEL_VARIABLES[row["modelo"]])
            for row in cursor.fetchall()
            if row["modelo"] in MODEL_VARIABLES
        ]
    finally:
        cursor.close()
    if not sources:
        raise RuntimeError(f"Dispositivo {device_id} sin sensores publicables")
    return sources


def first_measurement(connection, sources: list[Source]) -> date | None:
    first: datetime | None = None
    for source in sources:
        cursor = connection.cursor()
        try:
            cursor.execute(
                """
                SELECT fecha FROM datos FORCE INDEX (idx_datos_sensor_fecha)
                WHERE id_sensor = %s ORDER BY fecha ASC LIMIT 1
                """,
                (source.sensor_id,),
            )
            row = cursor.fetchone()
        finally:
            cursor.close()
        if row and (first is None or row[0] < first):
            first = row[0]
    return first.date() if first else None


def serialize_row(row: dict[str, Any]) -> str:
    buffer = io.StringIO(newline="")
    csv.DictWriter(buffer, fieldnames=CSV_HEADER, lineterminator="\n").writerow(row)
    return buffer.getvalue()


def open_part(station_dir: Path, month: str, part_number: int):
    final_path = station_dir / f"{month}-part-{part_number:03d}.csv"
    temporary = final_path.with_suffix(".csv.tmp")
    handle = temporary.open("w", newline="", encoding="utf-8")
    handle.write(",".join(CSV_HEADER) + "\n")
    return final_path, temporary, handle


def finalize_part(handle, temporary: Path, final_path: Path) -> None:
    handle.flush()
    os.fsync(handle.fileno())
    handle.close()
    os.replace(temporary, final_path)


def export_month(connection, station, sources, month: str, output_dir: Path) -> int:
    start, end = month_bounds(month)
    snapshots: dict[datetime, dict[str, str]] = {}
    measurements = 0

    for source in sources:
        variable_ids = sorted(source.variables)
        placeholders = ", ".join(["%s"] * len(variable_ids))
        last_date, last_id = start, 0
        while True:
            cursor = connection.cursor(dictionary=True)
            try:
                cursor.execute(
                    f"""
                    SELECT id_dato, fecha, id_variable, valor
                    FROM datos FORCE INDEX (idx_datos_sensor_fecha)
                    WHERE id_sensor = %s
                      AND id_variable IN ({placeholders})
                      AND fecha >= %s AND fecha < %s
                      AND (fecha > %s OR (fecha = %s AND id_dato > %s))
                    ORDER BY fecha ASC, id_dato ASC
                    LIMIT %s
                    """,
                    (
                        source.sensor_id,
                        *variable_ids,
                        start,
                        end,
                        last_date,
                        last_date,
                        last_id,
                        BATCH_SIZE,
                    ),
                )
                rows = cursor.fetchall()
            finally:
                cursor.close()

            for row in rows:
                key = source.variables[int(row["id_variable"])]
                raw_value = float(row["valor"])
                # El firmware AUCA usa exactamente -1 cuando falta una lectura.
                value = "" if raw_value == -1 else format(raw_value, ".10g")
                snapshots.setdefault(row["fecha"], {})[VARIABLE_META[key]["column"]] = value
                measurements += 1
            if len(rows) < BATCH_SIZE:
                break
            last = rows[-1]
            last_date, last_id = last["fecha"], int(last["id_dato"])

    station_dir = output_dir / station["code"]
    station_dir.mkdir(parents=True, exist_ok=True)
    completed: list[Path] = []
    part_number = 1
    final_path, temporary, handle = open_part(station_dir, month, part_number)
    rows_in_part = 0

    try:
        for moment in sorted(snapshots):
            line = serialize_row({"fecha": moment.isoformat(sep=" "), **snapshots[moment]})
            line_bytes = len(line.encode("utf-8"))
            if rows_in_part and handle.tell() + line_bytes > MAX_FILE_BYTES:
                finalize_part(handle, temporary, final_path)
                completed.append(final_path)
                part_number += 1
                final_path, temporary, handle = open_part(station_dir, month, part_number)
                rows_in_part = 0
            handle.write(line)
            rows_in_part += 1
        finalize_part(handle, temporary, final_path)
        completed.append(final_path)
    except Exception:
        if not handle.closed:
            handle.close()
        temporary.unlink(missing_ok=True)
        raise

    completed_set = set(completed)
    for obsolete in station_dir.glob(f"{month}-part-*.csv"):
        if obsolete not in completed_set:
            obsolete.unlink()
    return measurements


def latest_rows(connection, stations, sources_by_station):
    output: list[list[Any]] = []
    station_latest: dict[str, datetime] = {}
    for station in stations:
        for source in sources_by_station[station["code"]]:
            variable_ids = sorted(source.variables)
            placeholders = ", ".join(["%s"] * len(variable_ids))
            cursor = connection.cursor(dictionary=True)
            try:
                cursor.execute(
                    f"""
                    SELECT fecha, id_variable, valor
                    FROM datos FORCE INDEX (idx_datos_sensor_fecha)
                    WHERE id_sensor = %s AND id_variable IN ({placeholders})
                    ORDER BY fecha DESC LIMIT %s
                    """,
                    (source.sensor_id, *variable_ids, max(30, len(variable_ids) * 8)),
                )
                rows = cursor.fetchall()
            finally:
                cursor.close()

            seen: set[int] = set()
            for row in rows:
                variable_id = int(row["id_variable"])
                raw_value = float(row["valor"])
                if variable_id in seen or variable_id not in source.variables or raw_value == -1:
                    continue
                seen.add(variable_id)
                key = source.variables[variable_id]
                output.append(
                    [station["code"], row["fecha"].isoformat(sep=" "), key, format(raw_value, ".10g")]
                )
                current = station_latest.get(station["code"])
                if current is None or row["fecha"] > current:
                    station_latest[station["code"]] = row["fecha"]
                if len(seen) == len(source.variables):
                    break
    return output, station_latest


def atomic_text(path: Path, content: str) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        handle.write(content)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def write_latest(output_dir: Path, rows: list[list[Any]]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["codigo", "fecha", "variable", "valor"])
    writer.writerows(rows)
    atomic_text(output_dir / "latest.csv", buffer.getvalue())


def aware_iso(value: datetime) -> str:
    return value.replace(tzinfo=TIMEZONE).isoformat(timespec="seconds")


def write_manifest(output_dir, stations, station_latest) -> None:
    manifest_stations = []
    for station in stations:
        months: dict[str, list[str]] = {}
        station_dir = output_dir / station["code"]
        if station_dir.exists():
            for path in sorted(station_dir.glob("*.csv")):
                match = PART_RE.match(path.name)
                if match:
                    months.setdefault(match.group("month"), []).append(str(path.relative_to(ROOT)))
        latest = station_latest.get(station["code"])
        manifest_stations.append(
            {**station, "latest_at": aware_iso(latest) if latest else None, "months": months}
        )

    newest = max(station_latest.values(), default=datetime.now())
    payload = {
        "schema_version": 1,
        "updated_at": aware_iso(newest),
        "timezone": "America/Santiago",
        "max_csv_bytes": MAX_FILE_BYTES,
        "variables": VARIABLE_META,
        "stations": manifest_stations,
    }
    atomic_text(
        output_dir / "manifest.json",
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Exporta CSV mensuales de AUCA Cochrane")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--all", action="store_true", help="exporta todos los meses disponibles")
    parser.add_argument("--month", action="append", help="mes YYYY-MM; puede repetirse")
    parser.add_argument("--station", action="append", help="código AUCA; puede repetirse")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    stations = load_stations(args.config)
    export_stations = stations
    if args.station:
        requested = set(args.station)
        export_stations = [station for station in stations if station["code"] in requested]
        unknown = requested - {station["code"] for station in export_stations}
        if unknown:
            raise SystemExit("Estaciones desconocidas: " + ", ".join(sorted(unknown)))

    connection = mysql.connector.connect(**db_config(args.env_file))
    connection.autocommit = True
    total = 0
    try:
        sources_by_station = {
            station["code"]: discover_sources(connection, station["device_id"])
            for station in stations
        }
        today = date.today()
        for station in export_stations:
            if args.all:
                first = first_measurement(connection, sources_by_station[station["code"]])
                months = list(iter_months(first, today)) if first else []
            else:
                months = args.month or [today.strftime("%Y-%m")]
            for month in months:
                count = export_month(
                    connection,
                    station,
                    sources_by_station[station["code"]],
                    month,
                    args.output_dir,
                )
                total += count
                print(f"{station['code']} {month}: {count} mediciones", flush=True)

        latest, station_latest = latest_rows(connection, stations, sources_by_station)
        write_latest(args.output_dir, latest)
        write_manifest(args.output_dir, stations, station_latest)
    finally:
        connection.close()
    print(f"Exportación terminada: {total} mediciones procesadas", flush=True)


if __name__ == "__main__":
    main()
