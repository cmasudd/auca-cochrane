import csv
import importlib.util
import json
import sys
import unittest
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "export_monthly_csv.py"
SPEC = importlib.util.spec_from_file_location("export_monthly_csv", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ExportTests(unittest.TestCase):
    def test_month_bounds_crosses_year(self):
        start, end = MODULE.month_bounds("2026-12")
        self.assertEqual(start.isoformat(), "2026-12-01T00:00:00")
        self.assertEqual(end.isoformat(), "2027-01-01T00:00:00")

    def test_iter_months(self):
        self.assertEqual(
            list(MODULE.iter_months(date(2026, 7, 29), date(2026, 9, 1))),
            ["2026-07", "2026-08", "2026-09"],
        )

    def test_expected_auca_devices(self):
        stations = json.loads((ROOT / "config" / "stations.json").read_text(encoding="utf-8"))
        self.assertEqual([station["device_id"] for station in stations], [241, 242, 243, 244])
        self.assertEqual(
            [station["code"] for station in stations],
            ["HIRI-AUCA-1", "HIRI-AUCA-2", "HIRI-AUCA-3", "HIRI-AUCA-4"],
        )

    def test_sensitive_or_empty_diagnostics_are_not_published(self):
        published_ids = {
            variable_id
            for mapping in MODULE.MODEL_VARIABLES.values()
            for variable_id in mapping
        }
        self.assertFalse({4, 11, 12, 45, 46} & published_ids)

    def test_generated_files_match_contract(self):
        manifest_path = ROOT / "data" / "manifest.json"
        if not manifest_path.exists():
            self.skipTest("El backfill todavía no ha sido generado")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(manifest["schema_version"], 1)
        self.assertEqual(set(manifest["variables"]), set(MODULE.VARIABLE_META))
        for station in manifest["stations"]:
            for month, paths in station["months"].items():
                previous = None
                for relative in paths:
                    path = ROOT / relative
                    self.assertTrue(path.is_file())
                    self.assertLessEqual(path.stat().st_size, MODULE.MAX_FILE_BYTES)
                    with path.open(newline="", encoding="utf-8") as handle:
                        reader = csv.DictReader(handle)
                        self.assertEqual(reader.fieldnames, MODULE.CSV_HEADER)
                        for row in reader:
                            self.assertTrue(row["fecha"].startswith(month))
                            if previous is not None:
                                self.assertGreaterEqual(row["fecha"], previous)
                            previous = row["fecha"]


if __name__ == "__main__":
    unittest.main()
