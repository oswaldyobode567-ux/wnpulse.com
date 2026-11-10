import ast
import sys
import unittest
from types import ModuleType
from unittest.mock import patch
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))
stats = ModuleType("stats_service")
stats.lookup_real_stats = lambda *_: None
# The ranking test uses the real quote and settlement logic, with no database.
with patch.dict(sys.modules, {"stats_service": stats}):
    import prediction_engine
    from ranking_evaluation import PROTOCOL, comparison_forecast, select_candidate, summarize


class RankingEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 10, 12, tzinfo=timezone.utc)
        self.match = {"id": "m1", "sport_key": "soccer_test", "home_team": "Alpha",
                      "away_team": "Beta", "commence_time": (self.now + timedelta(hours=1)).isoformat()}
        self.row = {"pick": "Alpha", "market": "h2h", "pick_raw": "Alpha", "pick_odds": 1.60,
                    "best_bookmaker": "Fixture", "estimated_win_probability": 69, "num_books": 3}
        self.add_quote()

    def add_quote(self, age=10):
        self.match["bookmakers"] = [{"title": "Fixture", "last_update": (self.now-timedelta(minutes=age)).isoformat(),
            "markets": [{"key": "h2h", "outcomes": [{"name": "Alpha", "price": 1.60}]}]}]

    def test_fresh_quote_with_evidence_can_be_selected(self):
        self.assertEqual(select_candidate([self.row], self.match, self.now)["pick"], "Alpha")
        self.add_quote(age=91)
        self.assertIsNone(select_candidate([self.row], self.match, self.now))

    def test_rejects_unsupported_price_low_evidence_and_conditional_only(self):
        for change in ({"pick_odds": 1.29}, {"num_books": 2}, {"synthetic": True},
                       {"estimated_win_probability": None, "confidence": 90},
                       {"estimated_win_probability": 60}, {"market":"corners"}):
            with self.subTest(change=change):
                self.assertIsNone(select_candidate([{**self.row, **change}], self.match, self.now))

    def test_preserves_published_baseline_on_abstention_and_does_not_capture_after_start(self):
        pred = {**self.row, "pick_odds": 1.77, "is_primary_official": True,
                "official_frozen_at": (self.now-timedelta(hours=2)).isoformat(), "markets": []}
        pair = comparison_forecast(pred, self.match, self.now)
        self.assertEqual(pair["baseline"]["pick_odds"], 1.77)
        self.assertIsNone(pair["challenger"])
        self.assertIsNone(comparison_forecast(pred, self.match, self.now+timedelta(hours=2)))

    def test_reports_coverage_and_fair_paired_comparison(self):
        won = {"result": "won", "unit_return": 1.6}
        lost = {"result": "lost", "unit_return": 0}
        rows = [{"state": "resolved", "evaluation": {"baseline": lost, "challenger": won, "same_selection": False}},
                {"state": "resolved", "evaluation": {"baseline": won, "challenger": None}},
                {"state": "pending"}]
        report = summarize(rows)
        self.assertEqual((report["coverage"], report["pending"], report["passed"]), (50, 1, 1))
        self.assertEqual(report["same_event_arms"]["baseline"]["roi"], -100)
        self.assertEqual(report["arms"]["challenger"]["roi"], 60)
        self.assertEqual(report["arms"]["challenger"]["net_per_100_events"], 30)
        self.assertFalse(report["automatic_promotion"])

    def test_verified_final_score_settles_abstention_without_inventing_bet(self):
        ns = {"_parse_iso": lambda v: datetime.fromisoformat(v), "_settlement_integer": int,
              "RANKING_PROTOCOL": PROTOCOL}
        tree = ast.parse((ROOT/"server.py").read_text())
        fn = next(node for node in tree.body if getattr(node, "name", None) == "_model_comparison_outcome")
        exec(compile(ast.Module(body=[fn], type_ignores=[]), "settlement", "exec"), ns)
        record = {**self.match, "protocol": PROTOCOL, "captured_at": self.now.isoformat(),
                  "comparison": {"baseline": self.row, "challenger": None}}
        score = {**self.match, "completed": True,
                 "scores": [{"name": "Alpha", "score": 2}, {"name": "Beta", "score": 1}]}
        with patch.dict(sys.modules, {"prediction_engine": prediction_engine}):
            outcome = ns["_model_comparison_outcome"](record, score)
            self.assertEqual(outcome["baseline"]["result"], "won")
            self.assertIsNone(outcome["challenger"])
            self.assertIsNone(ns["_model_comparison_outcome"](record, {**score, "completed": False}))
