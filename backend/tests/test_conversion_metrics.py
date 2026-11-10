import unittest
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1]))
from conversion_metrics import journey_key, summarize_journeys, record_published_roi, published_roi


class ConversionMetrics(unittest.TestCase):
    def test_attribution_counts_verified_live_once_and_excludes_refunds_and_sandbox(self):
        now = datetime(2026, 11, 10, tzinfo=timezone.utc)
        started = now - timedelta(hours=2)
        keys = [journey_key(hex(i)[2:].rjust(32, "0")) for i in range(4)]
        rows = [{"_id": key, "started_at": started.replace(tzinfo=None), "source": "telegram",
                 "events": ["visit", "pro", "pro"]} for key in keys]
        base = {"created_at": started+timedelta(minutes=5), "paid_at": started+timedelta(minutes=10),
                "user_id": "buyer", "status": "approved", "payment_status": "approved",
                "payment_provider": "fedapay", "payment_environment": "live",
                "activation_applied": True, "fedapay_verified_at": now}
        requests = [{**base, "journey_id": keys[0]}] * 2 + [
            {**base, "journey_id": keys[1], "payment_status": "refunded"},
            {**base, "journey_id": keys[2], "payment_environment": "sandbox"},
            {**base, "journey_id": keys[3], "activation_applied": False},
        ]
        def parse(value):
            return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)) if value else None
        totals = summarize_journeys(rows, requests, now, parse)["totals"]
        self.assertEqual((totals["visits"], totals["pro"], totals["checkout"], totals["paid"]), (4, 4, 3, 1))
        self.assertIsNone(journey_key("bad"))

    def test_roi_uses_valid_published_odds_and_excludes_void(self):
        bucket = {}
        for result, odds in [("won", 1.8), ("lost", 1.5), ("lost", None), ("void", 2.0), ("won", "NaN")]:
            record_published_roi(bucket, result, odds)
        self.assertEqual(published_roi(bucket), {"roi_sample": 2, "roi_percent": -10.0})
        self.assertIsNone(published_roi({})["roi_percent"])
