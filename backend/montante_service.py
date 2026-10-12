
# Les états sont persistés par server.py dans MongoDB.

from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence
import math
import statistics
from itertools import combinations
import uuid


class MontanteService:
    VERSION = "2.0.0"

    def __init__(
        self,
        days: int = 10,
        max_picks_per_day: int = 2,
        min_confidence: float = 0.70,
        min_odds: float = 1.15,
        max_odds: float = 3.50,
        min_edge: float = -3.0,
        initial_bankroll: float = 10000.0,
        min_books: int = 3,
        min_stability: float = 65.0,
        max_odds_age_minutes: int = 30,
        min_lead_minutes: int = 5,
    ):
        if days not in (10, 15):
            raise ValueError("days doit être 10 ou 15")
        if max_picks_per_day != 2:
            raise ValueError("La Montante exige exactement deux matchs distincts par étape")
        self.days = days
        self.max_picks_per_day = max_picks_per_day
        self.min_confidence = min_confidence
        self.min_odds = min_odds
        self.max_odds = max_odds
        self.min_edge = min_edge
        self.initial_bankroll = float(initial_bankroll)
        self.min_books = max(3, int(min_books))
        self.min_stability = float(min_stability)
        self.max_odds_age_minutes = max(1, int(max_odds_age_minutes))
        self.min_lead_minutes = max(1, int(min_lead_minutes))
        self.last_diagnostic: Dict[str, Any] = {}
        self.state: Optional[Dict[str, Any]] = None

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _num(value: Any) -> Optional[float]:
        try:
            if value is None or value == "" or isinstance(value, bool):
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
        if not math.isfinite(bankroll) or bankroll <= 0:
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
        # No target odds, no reward for tiny prices and no artificially raised probability.
        if limit is not None and limit < 2:
            raise ValueError("Deux matchs sont nécessaires")
        candidates = []
        self.last_diagnostic = {"markets_checked": 0, "eligible": 0, "rejections": {}, "selected": 0, "selector_version": self.VERSION}
        for match in matches:
            if not isinstance(match, dict):
                continue
            for market in self._extract_markets(match):
                self.last_diagnostic["markets_checked"] += 1
                candidate = self._normalize(match, market)
                if candidate and self._qualifies(candidate):
                    candidates.append(candidate)
        # Keep the best documented market per event, then compare actual pairs.
        by_event = {}
        for item in candidates:
            current = by_event.get(item["event_id"])
            if current is None or (item["selection_score"], item["model_probability"], item["edge"]) > (current["selection_score"], current["model_probability"], current["edge"]):
                by_event[item["event_id"]] = item
        pool = sorted(by_event.values(), key=lambda p: (p["selection_score"], p["model_probability"]), reverse=True)[:40]
        self.last_diagnostic["eligible"] = len(by_event)
        choices = []
        for a, b in combinations(pool, 2):
            # Different IDs alone are insufficient: avoid sharing an actual team.
            teams_a = {self._name(a["home_team"]), self._name(a["away_team"])}
            teams_b = {self._name(b["home_team"]), self._name(b["away_team"])}
            if teams_a.intersection(teams_b):
                continue
            score = min(a["selection_score"], b["selection_score"]) * .7 + (a["selection_score"] + b["selection_score"]) * .15
            choices.append((score, a["model_probability"] * b["model_probability"], a, b))
        if not choices:
            self.last_diagnostic["waiting_reason"] = "Deux matchs distincts et suffisamment documentés ne sont pas disponibles."
            return []
        _, _, a, b = max(choices, key=lambda row: (row[0], row[1]))
        selected = sorted([a, b], key=lambda p: p["start_time"])
        self.last_diagnostic["selected"] = 2
        return selected

    def settle_day(
        self,
        picks: Sequence[Dict[str, Any]],
        results: Optional[Sequence[str]] = None,
        settlement_status: Optional[str] = None,
    ) -> Dict[str, Any]:
        # WIN -> jour suivant; LOSS -> montante terminée; PENDING -> attente.
        if not self.state or self.state["status"] != "ACTIVE":
            raise RuntimeError("Aucune montante ACTIVE.")

        if not picks:
            self.state["waiting_reason"] = "Aucun pronostic ne respecte les critères."
            self._touch()
            return self.get_state()

        if results is not None and len(results) != len(picks):
            raise ValueError("Un résultat est nécessaire pour chaque sélection")
        status = (settlement_status or self._status_from_results(results)).upper()
        if status == "PENDING":
            self.state["waiting_reason"] = "Résultats en attente."
            self._touch()
            return self.get_state()

        if status == "LOSS":
            stake_before = round(float(self.state["theoretical_bankroll"]), 2)
            potential_combined_odds = math.prod(float(p["odds"]) for p in picks)
            self.state["theoretical_bankroll"] = 0.0
            self._record(
                picks,
                "LOSS",
                potential_combined_odds,
                stake_before=stake_before,
                profit=-stake_before,
                bankroll_after=0.0,
            )
            self.state["status"] = "FAILED"
            self.state["failed_at"] = self._now()
            self._touch()
            return self.get_state()

        if status == "VOID":
            # Une journée entièrement remboursée ne doit ni faire perdre la
            # montante ni valider artificiellement un jour supplémentaire.
            stake_before = round(float(self.state["theoretical_bankroll"]), 2)
            self._record(
                picks,
                "VOID",
                1.0,
                stake_before=stake_before,
                profit=0.0,
                bankroll_after=stake_before,
            )
            self.state["waiting_reason"] = (
                "Journée remboursée : nouvelle sélection nécessaire pour ce jour."
            )
            self._touch()
            return self.get_state()

        if status != "WIN":
            raise ValueError("Statut invalide: WIN, LOSS, VOID ou PENDING.")

        # Réinvestissement intégral :
        # capital suivant = mise du jour + gain = mise * cote combinée.
        stake_before = round(float(self.state["theoretical_bankroll"]), 2)
        winning = [p for p, result in zip(picks, results) if str(result).upper().strip() == "WIN"] if results else picks
        combined_odds = math.prod(float(p["odds"]) for p in winning)
        bankroll_after = round(stake_before * combined_odds, 2)
        profit = round(bankroll_after - stake_before, 2)
        self.state["theoretical_bankroll"] = bankroll_after
        self._record(
            picks,
            "WIN",
            combined_odds,
            stake_before=stake_before,
            profit=profit,
            bankroll_after=bankroll_after,
        )

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
            "progress": (
                100.0
                if s["status"] == "COMPLETED"
                else round(((s["current_day"] - 1) / s["days"]) * 100, 1)
            ),
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
        # Les prédictions WinPulse exposent principalement ``pick_odds`` +
        # ``confidence``. Les inclure ici évite qu'un pick pourtant qualifié soit
        # ignoré par la Montante faute de clé générique ``odds``.
        if any(
            k in match
            for k in (
                "pick_odds", "odds", "odd", "price",
                "confidence", "probability", "win_probability",
                "estimated_win_probability", "model_probability",
            )
        ):
            result.append(match)
        return result

    @staticmethod
    def _name(value: Any) -> str:
        return str(value or "").strip().casefold()

    @staticmethod
    def _dt(value: Any) -> Optional[datetime]:
        try:
            result = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result.astimezone(timezone.utc)
        except (ValueError, TypeError):
            return None

    def _reject(self, reason: str) -> None:
        rejections = self.last_diagnostic.setdefault("rejections", {})
        rejections[reason] = rejections.get(reason, 0) + 1

    def _evidence(self, match: Dict, market: Dict, start: datetime) -> Optional[Dict]:
        key = market.get("market")
        if key not in ("h2h", "totals", "spreads"):
            self._reject("unsupported_market"); return None
        raw_pick = str(market.get("pick_raw") or "")
        point = self._num(market.get("pick_point"))
        if key != "h2h" and (not raw_pick or point is None or point % .5 != 0):
            self._reject("unsupported_line"); return None
        if key == "h2h":
            raw_pick = raw_pick or str(market.get("pick") or "")
        home, away = str(match.get("home_team") or ""), str(match.get("away_team") or "")
        sport = self._name(match.get("sport_key"))
        title = self._name(match.get("sport_title"))
        soccer = sport.startswith(("soccer", "football")) or (
            not any(word in sport + title for word in ("american", "nfl", "ncaaf")) and
            any(word in title for word in ("soccer", "football", "ligue", "la liga", "bundesliga", "serie a", "premier league"))
        )
        expected = {self._name(home), self._name(away)}
        if key == "h2h" and soccer:
            expected.add("draw")
        if key == "totals":
            expected = {"over", "under"}
        now = datetime.now(timezone.utc)
        snapshot = self._dt(match.get("_odds_snapshot_at"))
        values, prices, updates, books = [], [], [], set()
        raw_books = match.get("_bookmakers", match.get("bookmakers", []))
        for book in raw_books if isinstance(raw_books, list) else []:
            if not isinstance(book, dict):
                continue
            book_id = self._name(book.get("key") or book.get("title"))
            if not book_id or book_id in books:
                continue
            for data in book.get("markets", []) if isinstance(book.get("markets"), list) else []:
                if not isinstance(data, dict) or data.get("key") != key:
                    continue
                updated = self._dt(data.get("last_update") or book.get("last_update")) or snapshot
                if updated is None or not 0 <= (now - updated).total_seconds() <= self.max_odds_age_minutes * 60:
                    continue
                outcomes = data.get("outcomes") if isinstance(data.get("outcomes"), list) else []
                rows = []
                for outcome in outcomes:
                    if not isinstance(outcome, dict):
                        continue
                    name, price = self._name(outcome.get("name")), self._num(outcome.get("price"))
                    line = self._num(outcome.get("point"))
                    if price is None or price <= 1:
                        continue
                    if key == "totals" and line != point:
                        continue
                    if key == "spreads" and not (name == self._name(raw_pick) and line == point or name != self._name(raw_pick) and line == -point):
                        continue
                    rows.append((name, price, line))
                if {row[0] for row in rows} != expected or len(rows) != len(expected):
                    continue
                chosen = next((r for r in rows if r[0] == self._name(raw_pick)), None)
                if chosen is None:
                    continue
                denominator = sum(1 / r[1] for r in rows)
                if not .90 <= denominator <= 1.25:
                    continue  # Discard implausible or extreme-margin quote sets.
                values.append((1 / chosen[1]) / denominator)
                prices.append(chosen[1]); updates.append(updated.isoformat()); books.add(book_id)
                break
        if len(books) < self.min_books:
            self._reject("insufficient_fresh_complete_sources"); return None
        return {"num_books": len(books), "consensus": statistics.mean(values),
                "stability": max(0.0, 100 - statistics.pstdev(values) * 1000),
                "prices": prices, "odds_verified_at": min(updates)}

    def _normalize(self, match: Dict[str, Any], market: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if market.get("synthetic") or market.get("is_combo") or match.get("is_finished") or match.get("completed"):
            self._reject("synthetic_combo_or_finished"); return None
        odds = self._num(market.get("pick_odds"))
        # These engine fields are percentages. Confidence is NEVER a fallback.
        raw_probability = self._num(market.get("model_probability"))
        if raw_probability is None:
            raw_probability = self._num(market.get("estimated_win_probability"))
        start = self._dt(match.get("commence_time") or match.get("start_time"))
        event_id = match.get("match_id") or match.get("id") or match.get("event_id")
        pick = market.get("pick")
        if not event_id or not isinstance(pick, str) or not pick.strip() or odds is None or raw_probability is None or not 0 < raw_probability < 100:
            self._reject("missing_identity_pick_odds_or_probability"); return None
        if not start or (start - datetime.now(timezone.utc)).total_seconds() < self.min_lead_minutes * 60:
            self._reject("started_or_too_close"); return None
        if not self.min_odds <= odds <= self.max_odds:
            self._reject("odds_outside_range"); return None
        probability = raw_probability / 100
        evidence = self._evidence(match, market, start)
        if evidence is None:
            return None
        if not any(abs(odds - price) <= .005 for price in evidence["prices"]):
            self._reject("official_price_not_available_in_verified_sources"); return None
        # Catch corrupted singleton-market estimates, without inventing a correction.
        if abs(probability - evidence["consensus"]) > .08:
            self._reject("probability_inconsistent_with_available_market"); return None
        official_probability = probability
        integrity = match.get("analysis_integrity") if isinstance(match.get("analysis_integrity"), dict) else {}
        source = market.get("probability_source") or ("bookmaker_consensus" if market.get("source") == "bookmaker" or integrity.get("real_bookmaker_markets_only") is True else "engine_estimate")
        if source == "bookmaker_consensus":
            # Re-check this estimate using only complete, fresh market sources.
            probability = evidence["consensus"]
        confidence = self._num(market.get("confidence"))
        confidence = confidence / 100 if confidence is not None and confidence > 1 else confidence
        edge = (probability - 1 / odds) * 100  # Percentage points, not expected return.
        score = (probability * .55 + evidence["stability"] / 100 * .30 + min(evidence["num_books"], 6) / 6 * .15) * 100
        home, away = str(match.get("home_team") or ""), str(match.get("away_team") or "")
        if not home or not away:
            self._reject("missing_teams"); return None
        factors = [f"Estimation {'du consensus vérifié' if source == 'bookmaker_consensus' else 'du moteur'} : {probability * 100:.1f}% (non garantie).",
                   f"{evidence['num_books']} sources avec les issues du marché disponibles ; stabilité {evidence['stability']:.0f}/100.",
                   f"Cote {odds:g}, écart estimé {edge:+.2f} points avec sa probabilité implicite."]
        return {
            "event_id": str(event_id), "match_id": event_id, "home_team": home, "away_team": away,
            "league": match.get("league") or match.get("sport_title"), "sport_key": match.get("sport_key"),
            "sport_title": match.get("sport_title"), "start_time": start.isoformat(),
            "market": market.get("market"), "market_label": market.get("market_label"),
            "pick": pick, "pick_raw": market.get("pick_raw"), "pick_point": market.get("pick_point"),
            "odds": round(odds, 3), "confidence": confidence, "model_probability": probability,
            "probability_source": source, "official_model_probability": official_probability,
            "consensus_probability": evidence["consensus"], "edge": round(edge, 4),
            "num_books": evidence["num_books"], "stability_score": round(evidence["stability"], 1),
            "selection_score": round(score, 3), "selection_factors": factors,
            "odds_verified_at": evidence["odds_verified_at"], "selector_version": self.VERSION,
        }

    def _qualifies(self, item: Dict[str, Any]) -> bool:
        if item["model_probability"] < self.min_confidence:
            self._reject("probability_below_threshold"); return False
        if item["stability_score"] < self.min_stability:
            self._reject("sources_too_disperse"); return False
        if item["edge"] < self.min_edge:
            self._reject("excessively_negative_edge"); return False
        return True

    def _record(
        self,
        picks: Sequence[Dict[str, Any]],
        status: str,
        combined_odds: Optional[float] = None,
        *,
        stake_before: Optional[float] = None,
        profit: Optional[float] = None,
        bankroll_after: Optional[float] = None,
    ) -> None:
        self.state["history"].append({
            "day": self.state["current_day"],
            "status": status,
            "settled_at": self._now(),
            "combined_odds": round(combined_odds, 3) if combined_odds else None,
            "stake_before": round(stake_before, 2) if stake_before is not None else None,
            "profit": round(profit, 2) if profit is not None else None,
            "bankroll_after": round(bankroll_after, 2) if bankroll_after is not None else None,
            "picks": [self._clone(dict(p)) for p in picks],
        })

    @staticmethod
    def _status_from_results(results: Optional[Sequence[str]]) -> str:
        if not results:
            return "PENDING"
        values = [str(x).upper().strip() for x in results]
        if "LOSS" in values:
            return "LOSS"

        normalized = [
            "VOID" if x in {"VOID", "PUSH", "REFUNDED", "REMBOURSE"} else x
            for x in values
        ]
        if normalized and all(x in {"WIN", "VOID"} for x in normalized):
            return "WIN" if any(x == "WIN" for x in normalized) else "VOID"
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
