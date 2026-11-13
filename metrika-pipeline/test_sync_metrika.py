import unittest
from datetime import date
from unittest.mock import patch
import sync_metrika as m


class MetricaTests(unittest.TestCase):
    def test_market_selection_uses_exact_domains_and_mirrors(self):
        self.assertEqual(m.markets_for_counter({"id": 1, "site2": {"site": "https://www.caviar.global/"}}), ["global"])
        self.assertEqual(m.markets_for_counter({"id": 1, "site": "vk.com/caviar.iphone", "mirrors2": [{"site": "caviar-phone.ru/catalog/"}]}), [])
        self.assertEqual(m.markets_for_counter({"id": 1, "site": "caviar.global.example.com"}), [])
        self.assertEqual(m.markets_for_counter({"id": 1, "site": "caviar-cn.com"}), [])

    def test_period_is_73_days_and_filter_has_both_ru_domains(self):
        for year, start, end in m.date_windows():
            self.assertEqual((date.fromisoformat(end)-date.fromisoformat(start)).days+1, 73)
        self.assertIn("'caviar-phone.ru'", m.domain_filter("ru"))
        self.assertIn("'caviar-phones.ru'", m.domain_filter("ru"))
        self.assertNotIn("caviar-cn.com", m.domain_filter("global"))

    def test_report_pagination_starts_at_one_and_uses_returned_metric_order(self):
        calls = []
        def fake(session, method, url, **kwargs):
            calls.append(kwargs["params"])
            n = len(calls)
            return {"query": {"metrics": ["ym:s:users", "ym:s:visits"], "dimensions": ["ym:s:date"]},
                "total_rows": 2, "totals": [7, 10], "sampled": n == 2,
                "data": [{"dimensions": [{"name": "2025-09-0" + str(n)}], "metrics": [5, 5]}]}
        with patch.object(m, "api_json", side_effect=fake):
            rows, meta = m.report(None, 1, "ru", "2025-09-01", "2025-11-12", ["ym:s:date"])
        self.assertEqual([c["offset"] for c in calls], [1, 2])
        self.assertEqual(meta["totals"]["ym:s:users"], 7)
        self.assertEqual(sum(r[1]["ym:s:users"] for r in rows), 10)
        self.assertTrue(any(p["sampled"] for p in meta["pages"]))

    def test_total_does_not_sum_grouped_unique_users(self):
        payload = {"query": {"metrics": ["ym:s:users", "ym:s:visits"]}, "totals": [7, 10],
            "data": [{"metrics": [999, 999]}]}
        with patch.object(m, "api_json", return_value=payload):
            rows, _ = m.report(None, 1, "global", "2024-09-01", "2024-11-12", [])
        self.assertEqual(rows, [({}, {"ym:s:users": 7, "ym:s:visits": 10})])


if __name__ == "__main__":
    unittest.main()
