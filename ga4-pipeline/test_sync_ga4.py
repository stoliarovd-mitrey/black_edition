"""Regression tests for GA4 calendar boundaries and status consistency."""
import importlib.util
import os
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

os.environ.setdefault("GA4_SHEET_ID", "test-not-a-real-spreadsheet")
spec = importlib.util.spec_from_file_location("sync_ga4", Path(__file__).with_name("sync_ga4.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CollectorCalendarTest(unittest.TestCase):
    def setUp(self):
        # Friday 13 Nov, 09:25 Moscow = Thu 12 Nov, 22:25 Los Angeles.
        self.now = datetime(2026, 11, 13, 6, 25, tzinfo=timezone.utc)
        self.bootstrap = date(2026, 6, 24)

    def test_property_dates_differ(self):
        ru_start, ru_end, ru_settled = module.collection_window(
            "ru", self.now, self.bootstrap, 35
        )
        gl_start, gl_end, gl_settled = module.collection_window(
            "global", self.now, self.bootstrap, 35
        )
        self.assertEqual(ru_end.isoformat(), "2026-11-12")
        self.assertEqual(gl_end.isoformat(), "2026-11-11")
        self.assertEqual(ru_settled.isoformat(), "2026-11-11")
        self.assertEqual(gl_settled.isoformat(), "2026-11-10")
        self.assertEqual((ru_end - ru_start).days, 34)
        self.assertEqual((gl_end - gl_start).days, 34)

    def test_preliminary_status_is_identical_in_daily_and_checks(self):
        settled = date(2026, 11, 10)
        self.assertEqual(module.day_status("2026-11-10", settled), "OK")
        self.assertEqual(module.day_status("2026-11-11", settled), "PRELIMINARY")
        row = module.to_sheet_row(
            "Daily", "global", ["20261111"], ["10", "12", "6", "0.5", "1", "60"],
            module.day_status("2026-11-11", settled)
        )
        self.assertEqual(row[0], "2026-11-11")
        self.assertEqual(row[-1], "PRELIMINARY")

    def test_full_backfill_starts_at_bootstrap(self):
        start, end, _ = module.collection_window(
            "global", self.now, self.bootstrap, 35, full_backfill=True
        )
        self.assertEqual(start, self.bootstrap)
        self.assertEqual(end.isoformat(), "2026-11-11")


if __name__ == "__main__":
    unittest.main()
