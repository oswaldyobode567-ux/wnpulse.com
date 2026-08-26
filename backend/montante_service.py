"""
WNPulse - Module indépendant de montante.
Aucune modification requise dans server.py, odds_service.py ou prediction_engine.py.
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence
import math
import uuid


class MontanteService:
    VERSION = "1.0.0"

    def __init__(
        self,
        days: int = 10,
        max_picks_per_day: int = 2,
        min_confidence: float = 0.70,
        min_odds: float = 1.20,
        max_odds: float = 1.50,
        min_edge: float = 0.0,
        initial_bankroll: float = 10000.0,
    ):
        if days not in (10, 15):
            raise ValueError("days doit être 10 ou 15")
        if max_picks_per_day not in (1, 2):
            raise ValueError("max_picks_per_day doit être 1 ou 2")
        self.days = days
        self.max_picks_per_day = max_picks_per_day
        self.min_confidence = min_confidence
        self.min_odds = min_odds
        self.max_odds = max_odds
        self.min_edge = min_edge
        self.initial_bankroll = float(initial_bankroll)
        self.state: Optional[Dict[str, Any]] = None

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _num(value: Any) -> Optional[float]:
        try:
            if value is None or value == "":
                return None
            n = float(value)
            return n if math.isfinite(n) else None
        except (TypeError, ValueError):
            return None

    def create(self, days: Optional[int] = None,
               initial_bankroll: Optional[float] = None) -> Dict[str, Any]:
        duration = days if days is not None else self.days
        bankroll = float(initial_bankroll if initial_bankroll is not None
                         else self.initial_bankroll)
        if duration not in (10, 15):
            raise ValueError("days doit être 10 ou 15")
        if bankroll <= 0:
            raise ValueError("initial_bankroll doit être positif")
        now = self._now()
        self.state = {
            "id": f"mnt_{uuid.uuid4().hex[:12]}",
            "version": self.VERSION,
            "status": "ACTIVE",
            "days": duration,
            "current_day": 1,
            "initial_bankroll": bankroll,
            "theoretical_bankroll": bankroll,
            "started_at": now,
            "updated_at": now,
            "failed_at": None,
            "completed_at": None,
            "waiting_reason": None,
            "history": [],
        }
        return self.get_state()

    def get_state(self) -> Dict[str, Any]:
        if self.state is None:
            return {"status": "NONE", "message": "Aucune montante active."}
        return self._clone(self.state)

    def select_daily_picks(
        self, matches: Iterable[Dict[str, Any]], limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Sélectionne 1 ou 2 marchés qualifiés sans forcer un pronostic."""
        wanted = min(limit or self.max_picks_per_day, self.max_picks_per_day)
        candidates = []

        for match in matches:
            if not isinstance(match, dict):
                continue
            for market in self._extract_markets(match):
                candidate = self._normalize(match, market)
                if candidate and self._qualifies(candidate):
                    candidates.append(candidate)

        candidates.sort(
            key=lambda x: (x["confidence"], x["edge"], x["odds_quality"]),
            reverse=True,
        )

        selected = []
        used_events = set()
        for item in candidates:
            if item["event_id"] in used_events:
                continue
            selected.append(item)
            used_events.add(item["event_id"])
            if len(selected) >= wanted:
                break
        return selected

    def settle_day(
        self,
        picks: Sequence[Dict[str, Any]],
        results: Optional[Sequence[str]] = None,
        settlement_status: Optional[str] = None,
    ) -> Dict[str, Any]:
        """WIN -> jour suivant; LOSS -> montante terminée; PENDING -> attente."""
        if not self.state or self.state["status"] != "ACTIVE":
            raise RuntimeError("Aucune montante ACTIVE.")

        if not picks:
            self.state["waiting_reason"] = "Aucun pronostic ne respecte les critères."
            self._touch()
            return self.get_state()

        status = (settlement_status or self._status_from_results(results)).upper()
        if status == "PENDING":
            self.state["waiting_reason"] = "Résultats en attente."
            self._touch()
            return self.get_state()

        if status == "LOSS":
            self._record(picks, "LOSS")
            self.state["status"] = "FAILED"
            self.state["failed_at"] = self._now()
            self._touch()
            return self.get_state()

        if status != "WIN":
            raise ValueError("Statut invalide: WIN, LOSS ou PENDING.")

        combined_odds = math.prod(float(p["odds"]) for p in picks)
        self.state["theoretical_bankroll"] = round(
            self.state["theoretical_bankroll"] * combined_odds, 2
        )
        self._record(picks, "WIN", combined_odds)

        if self.state["current_day"] >= self.state["days"]:
            self.state["status"] = "COMPLETED"
            self.state["completed_at"] = self._now()
        else:
            self.state["current_day"] += 1

        self.state["waiting_reason"] = None
        self._touch()
        return self.get_state()

    def restart(self, days: Optional[int] = None,
                initial_bankroll: Optional[float] = None) -> Dict[str, Any]:
        return self.create(days, initial_bankroll)

    def dashboard(self) -> Dict[str, Any]:
        s = self.get_state()
        if s["status"] == "NONE":
            return {"status": "NONE", "title": "Aucune montante active"}
        return {
            "id": s["id"],
            "status": s["status"],
            "days": s["days"],
            "current_day": s["current_day"],
            "progress": round(((s["current_day"] - 1) / s["days"]) * 100, 1),
            "initial_bankroll": s["initial_bankroll"],
            "theoretical_bankroll": s["theoretical_bankroll"],
            "started_at": s["started_at"],
            "updated_at": s["updated_at"],
            "history": s["history"],
            "waiting_reason": s["waiting_reason"],
        }

    def export_state(self) -> Dict[str, Any]:
        return self.get_state()

    def import_state(self, state: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(state, dict):
            raise ValueError("État invalide")
        self.state = self._clone(state)
        return self.get_state()

    def _extract_markets(self, match: Dict[str, Any]) -> List[Dict[str, Any]]:
        result = []
        for key in ("recommendations", "markets"):
            value = match.get(key)
            if isinstance(value, list):
                result.extend(x for x in value if isinstance(x, dict))
        if isinstance(match.get("pick"), dict):
            result.append(match["pick"])
        if any(k in match for k in ("odds", "odd", "confidence", "probability")):
            result.append(match)
        return result

    def _normalize(self, match: Dict[str, Any],
                   market: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        odds = self._num(market.get("odds", market.get("odd", market.get("price"))))
        confidence = self._num(
            market.get("confidence",
                       market.get("probability", market.get("win_probability")))
        )
        if odds is None or confidence is None:
            return None
        if confidence > 1:
            confidence /= 100.0

        edge = self._num(
            market.get("edge", market.get("value", market.get("expected_value")))
        ) or 0.0

        event_id = str(
            match.get("id") or match.get("event_id") or
            f'{match.get("home_team", match.get("home", ""))}_'
            f'{match.get("away_team", match.get("away", ""))}'
        )
        market_name = (
            market.get("market") or market.get("market_name") or
            market.get("selection") or market.get("pick") or "Pronostic"
        )
        return {
            "event_id": event_id,
            "match_id": match.get("id") or match.get("event_id"),
            "home_team": match.get("home_team") or match.get("home") or "",
            "away_team": match.get("away_team") or match.get("away") or "",
            "league": match.get("league") or match.get("competition"),
            "start_time": match.get("commence_time") or match.get("start_time"),
            "market": market_name,
            "pick": market.get("pick", market.get("selection", market_name)),
            "odds": round(odds, 3),
            "confidence": round(confidence, 4),
            "edge": round(edge, 4),
            "odds_quality": max(0.0, 1.0 - abs(odds - 1.32) / 0.30),
        }

    def _qualifies(self, item: Dict[str, Any]) -> bool:
        return (
            self.min_odds <= item["odds"] <= self.max_odds and
            item["confidence"] >= self.min_confidence and
            item["edge"] >= self.min_edge
        )

    def _record(self, picks: Sequence[Dict[str, Any]], status: str,
                combined_odds: Optional[float] = None) -> None:
        self.state["history"].append({
            "day": self.state["current_day"],
            "status": status,
            "settled_at": self._now(),
            "combined_odds": round(combined_odds, 3) if combined_odds else None,
            "picks": [self._clone(dict(p)) for p in picks],
        })

    @staticmethod
    def _status_from_results(results: Optional[Sequence[str]]) -> str:
        if not results:
            return "PENDING"
        values = [str(x).upper().strip() for x in results]
        if "LOSS" in values:
            return "LOSS"
        if all(x == "WIN" for x in values):
            return "WIN"
        return "PENDING"

    def _touch(self) -> None:
        self.state["updated_at"] = self._now()

    @staticmethod
    def _clone(value: Any) -> Any:
        if isinstance(value, dict):
            return {k: MontanteService._clone(v) for k, v in value.items()}
        if isinstance(value, list):
            return [MontanteService._clone(v) for v in value]
        return value


def create_montante_service(**kwargs: Any) -> MontanteService:
    return MontanteService(**kwargs)
