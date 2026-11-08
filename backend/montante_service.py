
# Les états sont persistés par server.py dans MongoDB.

from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence
import math
import statistics
from itertools import combinations
import uuid


class MontanteService:
    VERSION = "3.0.0"

    def __init__(
        self,
        days: int = 10,
        max_picks_per_day: int = 2,
        min_confidence: float = 0.70,
        min_odds: float = 1.15,
        max_odds: float = 3.50,
        min_edge: float = 0.0,
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
        self.last_observation: Dict[str, Any] = {}
        self.last_eligible: List[Dict[str, Any]] = []
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
        # Keep one candidate per event. Diversity is never a reason to add a weak pick.
        by_event = {}
        for item in candidates:
            current = by_event.get(item["event_id"])
            if current is None or self._rank(item) > self._rank(current):
                by_event[item["event_id"]] = item
        self.last_eligible = self._clone(sorted(by_event.values(), key=self._rank, reverse=True))
        pool = self.last_eligible[:40]
        self.last_diagnostic["eligible"] = len(by_event)
        pairs = []
        for a, b in combinations(pool, 2):
            teams_a = {self._name(a["home_team"]), self._name(a["away_team"])}
            teams_b = {self._name(b["home_team"]), self._name(b["away_team"])}
            if teams_a.intersection(teams_b):
                continue
            same_league = bool(a.get("sport_key") and a["sport_key"] == b.get("sport_key"))
            # A ranking penalty, NOT a claimed estimate of correlation or adjusted probability.
            pair_score = .6 * min(a["selection_score"], b["selection_score"]) + .4 * (
                a["selection_score"] + b["selection_score"]) / 2 - (2.0 if same_league else 0)
            pairs.append((pair_score, a["model_probability"] * b["model_probability"], a, b))
        self.last_observation = {"selector_version": self.VERSION, "recorded_at": self._now(),
            "contenders": sorted(candidates, key=self._rank, reverse=True)[:20],
            "selected": [], "baseline_pair": [], "baseline_policy": "legacy_score_on_same_v3_eligible_pool"}
        if not pairs:
            self.last_diagnostic["waiting_reason"] = "Deux matchs distincts et suffisamment documentés ne sont pas disponibles."
            return []
        _, _, a, b = max(pairs, key=lambda row: (row[0], row[1]))
        baseline = max(pairs, key=lambda row: (
            .7 * min(row[2]["legacy_selection_score"], row[3]["legacy_selection_score"])
            + .15 * (row[2]["legacy_selection_score"] + row[3]["legacy_selection_score"]), row[1]))
        selected = sorted([a, b], key=lambda p: p["start_time"])
        self.last_observation["selected"] = self._clone(selected)
        self.last_observation["baseline_pair"] = self._clone(list(baseline[2:]))
        self.last_diagnostic["selected"] = 2
        return selected

    @staticmethod
    def _rank(item):
        return item["selection_score"], item["expected_return"], item["model_probability"]

    @staticmethod
    def pair_summary(picks):
        if len(picks) != 2:
            return None
        a, b = picks
        p_win = a["model_probability"] * b["model_probability"]
        p_no_loss = (1-a["estimated_loss_probability"]) * (1-b["estimated_loss_probability"])
        p_all_void = a["push_probability"] * b["push_probability"]
        expected_return = (1+a["expected_return"]) * (1+b["expected_return"]) - 1
        return {"combined_odds": round(a["odds"] * b["odds"], 3),
            "independence_estimate": round(p_win*100, 1),
            "both_win_probability": round(p_win*100, 1),
            "loss_probability": round((1-p_no_loss)*100, 1),
            "all_refunded_probability": round(p_all_void*100, 1),
            "advance_probability": round((p_no_loss-p_all_void)*100, 1),
            "expected_return": round(expected_return, 4),
            "probability_validated": False,
            "assumption": "Indépendance supposée, non démontrée ; gain, remboursement et perte distingués.",
            "same_competition": bool(a.get("sport_key") and a["sport_key"] == b.get("sport_key")),
            "minimum_sources": min(a["num_books"], b["num_books"]),
            "selector_version": MontanteService.VERSION}

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
        if key not in ("h2h", "totals", "spreads", "btts", "draw_no_bet", "double_chance", "team_totals"):
            self._reject("unsupported_market"); return None
        raw_pick = self._name(market.get("pick_raw") or (market.get("pick") if key == "h2h" else ""))
        point = self._num(market.get("pick_point"))
        if key in ("totals", "spreads", "team_totals") and (point is None or abs(point*2-round(point*2)) > 1e-8):
            self._reject("unsupported_line"); return None
        home, away = self._name(match.get("home_team")), self._name(match.get("away_team"))
        sport = self._name(match.get("sport_key"))
        soccer = sport.startswith("soccer_")
        if key in ("btts", "double_chance", "draw_no_bet", "team_totals") and not soccer:
            self._reject("market_sport_settlement_not_verified"); return None
        if key == "h2h":
            expected = {home, away, "draw"} if soccer else {home, away}
        elif key in ("totals", "team_totals"):
            expected = {"over", "under"}
        elif key == "btts":
            expected = {"yes", "no"}
        elif key == "double_chance":
            expected = {"1x", "x2", "12"}
        else:
            expected = {home, away}
        if raw_pick not in expected:
            self._reject("selection_identity_not_verified"); return None
        team = self._name(market.get("team"))
        if key == "team_totals" and team not in (home, away):
            self._reject("missing_team_total_identity"); return None
        now = datetime.now(timezone.utc)
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
                # Cache write time must never turn an undated/old quote into a fresh one.
                updated = self._dt(data.get("last_update") or book.get("last_update"))
                if updated is None or not 0 <= (now-updated).total_seconds() <= self.max_odds_age_minutes*60:
                    continue
                rows = []
                for outcome in data.get("outcomes", []) if isinstance(data.get("outcomes"), list) else []:
                    if not isinstance(outcome, dict):
                        continue
                    name, price = self._name(outcome.get("name")), self._num(outcome.get("price"))
                    line = self._num(outcome.get("point"))
                    if price is None or price <= 1:
                        continue
                    if key in ("totals", "team_totals") and line != point:
                        continue
                    if key == "team_totals" and self._name(outcome.get("description")) != team:
                        continue
                    if key == "spreads" and not (name == raw_pick and line == point or name != raw_pick and line == -point):
                        continue
                    rows.append((name, price, line))
                if {r[0] for r in rows} != expected or len(rows) != len(expected):
                    continue
                chosen = next((r for r in rows if r[0] == raw_pick), None)
                if chosen is None:
                    continue
                denominator = sum(1/r[1] for r in rows)
                # Double chance overlaps: normalizing its three prices would be invalid.
                if key == "double_chance":
                    if not 1.65 <= denominator <= 2.50:
                        continue
                    h2h = self._book_h2h(book, home, away, now)
                    if not h2h:
                        continue
                    covering = {"1x": (home,"draw"), "x2": (away,"draw"), "12": (home,away)}[raw_pick]
                    probability = sum(h2h[n] for n in covering)
                else:
                    if not .90 <= denominator <= 1.25:
                        continue
                    probability = (1/chosen[1])/denominator
                values.append(probability)
                prices.append(chosen[1]); updates.append(updated.isoformat()); books.add(book_id)
                break
        if len(books) < self.min_books:
            self._reject("insufficient_fresh_complete_sources"); return None
        return {"num_books":len(books), "consensus":statistics.median(values),
            "stability":max(0.,100-statistics.pstdev(values)*1000), "prices":prices,
            "odds_verified_at":min(updates)}

    def _book_h2h(self, book, home, away, now):
        for data in book.get("markets") or []:
            if not isinstance(data, dict) or data.get("key") != "h2h":
                continue
            stamp = self._dt(data.get("last_update") or book.get("last_update"))
            if not stamp or not 0 <= (now-stamp).total_seconds() <= self.max_odds_age_minutes*60:
                continue
            outcomes = data.get("outcomes") or []
            if len(outcomes) != 3 or any(not isinstance(o,dict) for o in outcomes):
                continue
            prices = {self._name(o.get("name")):self._num(o.get("price")) for o in outcomes}
            if set(prices) != {home,away,"draw"} or any(p is None or p <= 1 for p in prices.values()):
                continue
            margin = sum(1/p for p in prices.values())
            if .90 <= margin <= 1.25:
                return {n:(1/p)/margin for n,p in prices.items()}
        return None

    def _distribution(self, market, evidence):
        """All outputs are unconditional fractions; never substitute a conditional % for wins."""
        key, point = market.get("market"), self._num(market.get("pick_point"))
        refund_possible = key == "draw_no_bet" or (key in ("totals","spreads","team_totals") and point is not None and point.is_integer())
        source = market.get("probability_source") or "bookmaker_consensus"
        model_source = source in ("dixon_coles_pilot", "hybrid_pilot", "hybrid_retrospective")
        if model_source:
            win = self._num(market.get("estimated_win_probability"))
            push = self._num(market.get("push_probability"))
            loss = self._num(market.get("estimated_loss_probability"))
            if not refund_possible:
                push = 0. if push is None else push
            if win is None and market.get("probability_basis", "unconditional") == "unconditional":
                win = self._num(market.get("model_probability"))
            if win is None and push is not None and market.get("probability_basis") in ("conditional_on_no_draw", "conditional_on_no_push"):
                conditional = self._num(market.get("model_probability"))
                if conditional is not None and 0 <= conditional <= 100:
                    win = conditional*(1-push/100)
            if loss is None and win is not None and push is not None:
                loss = 100-win-push
            if any(v is None or not 0 <= v <= 100 for v in (win,push,loss)) or abs(win+push+loss-100) > .2:
                self._reject("incomplete_payout_distribution"); return None
            if not refund_possible and push > .01:
                self._reject("unexpected_refund_mass"); return None
            conditional = win/(100-push) if push < 100 else 0.
            disagreement = abs(conditional-evidence["consensus"])
            # Large differences are flagged rather than automatically called model superiority.
            if disagreement > .20 and not market.get("probability_validated"):
                self._reject("extreme_unvalidated_model_disagreement"); return None
            return win/100,push/100,loss/100,source,disagreement
        if source != "bookmaker_consensus":
            self._reject("unsupported_probability_provenance"); return None
        # Integer lines cannot be evaluated fully from the pair of prices alone.
        # A model must provide their full distribution; do not guess refund mass.
        if refund_possible:
            self._reject("refund_distribution_unavailable"); return None
        return evidence["consensus"],0.,1-evidence["consensus"],source,0.

    def _normalize(self, match: Dict[str, Any], market: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if market.get("synthetic") or market.get("is_combo") or market.get("analysis_only") or market.get("selection_available") is False or match.get("is_finished") or match.get("completed"):
            self._reject("synthetic_combo_finished_or_analysis_only"); return None
        odds = self._num(market.get("pick_odds"))
        start = self._dt(match.get("commence_time") or match.get("start_time"))
        event_id = match.get("match_id") or match.get("id") or match.get("event_id")
        pick = market.get("pick")
        if not event_id or not isinstance(pick,str) or not pick.strip() or odds is None:
            self._reject("missing_identity_pick_or_odds"); return None
        if not start or (start-datetime.now(timezone.utc)).total_seconds() < self.min_lead_minutes*60:
            self._reject("started_or_too_close"); return None
        if not self.min_odds <= odds <= self.max_odds:
            self._reject("odds_outside_range"); return None
        evidence = self._evidence(match,market,start)
        if evidence is None:
            return None
        if not any(abs(odds-price) <= .005 for price in evidence["prices"]):
            self._reject("official_price_not_available_in_verified_sources"); return None
        distribution = self._distribution(market,evidence)
        if distribution is None:
            return None
        win,push,loss,source,disagreement = distribution
        conditional = win/(1-push) if push < 1 else 0.
        expected_return = win*(odds-1)-loss
        edge = (conditional-1/odds)*100
        legacy = (conditional*.55+evidence["stability"]/100*.30+min(evidence["num_books"],6)/6*.15)*100
        # Ranking heuristic, not a probability or calibrated confidence interval.
        score = (win*.70+min(.15,max(-.15,expected_return))*.20
            + evidence["stability"]/100*.07+min(evidence["num_books"],6)/6*.03)*100
        if source != "bookmaker_consensus" and not market.get("probability_validated"):
            score -= 2.0 + 10*disagreement
        home,away = str(match.get("home_team") or ""),str(match.get("away_team") or "")
        if not home or not away:
            self._reject("missing_teams"); return None
        factors = [f"Gain estimé {win*100:.1f}% ; remboursement {push*100:.1f}% ; perte {loss*100:.1f}%.",
            f"{evidence['num_books']} sources complètes et récentes ; accord {evidence['stability']:.0f}/100.",
            f"Cote {odds:g} ; rendement théorique {expected_return*100:+.1f}% par unité, non garanti."]
        return {"event_id":str(event_id),"match_id":event_id,"home_team":home,"away_team":away,
            "league":match.get("league") or match.get("sport_title"),"sport_key":match.get("sport_key"),
            "sport_title":match.get("sport_title"),"start_time":start.isoformat(),
            "market":market.get("market"),"market_label":market.get("market_label"),
            "pick":pick,"pick_raw":market.get("pick_raw"),"pick_point":market.get("pick_point"),"team":market.get("team"),
            "odds":round(odds,3),"confidence":win,"model_probability":win,
            "estimated_win_probability":win,"push_probability":push,"estimated_loss_probability":loss,
            "probability_basis":"unconditional","probability_source":source,
            "probability_validated":bool(market.get("probability_validated")),
            "official_model_probability":(self._num(market.get("model_probability"))/100 if self._num(market.get("model_probability")) is not None else None),
            "upstream_probability_basis":market.get("probability_basis","unconditional"), "probability_units":"fraction_0_1",
            "consensus_probability":evidence["consensus"],"edge":round(edge,4),
            "expected_return":round(expected_return,6),"model_market_disagreement":round(disagreement*100,2),
            "num_books":evidence["num_books"],"stability_score":round(evidence["stability"],1),
            "selection_score":round(score,3),"legacy_selection_score":round(legacy,3),"selection_factors":factors,
            "odds_verified_at":evidence["odds_verified_at"],"selector_version":self.VERSION}

    def _qualifies(self, item: Dict[str, Any]) -> bool:
        if item["model_probability"] < self.min_confidence:
            self._reject("unconditional_win_probability_below_threshold"); return False
        if item["stability_score"] < self.min_stability:
            self._reject("sources_too_disperse"); return False
        if item["edge"] < max(0.,self.min_edge) or item["expected_return"] < -1e-6:
            self._reject("negative_expected_return"); return False
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



def evaluate_selection_observations(observations, results, evaluate):
    """Read-only prospective report. No prices reconstructed, no retroactive model promotion."""
    by_event = {}
    for row in results:
        by_event.setdefault(str(row.get("match_id")), []).append(row)
    groups = {"selected": [], "baseline_pair": [], "contenders": []}
    breakdown = {"market": {}, "sport": {}, "odds_band": {}, "source": {}}
    seen = {k:set() for k in groups}
    pairs = {"selected": [], "baseline_pair": []}
    pending = {k:0 for k in groups}
    seen_pairs = {k:set() for k in pairs}

    def resolve(pick, captured):
        kickoff = MontanteService._dt(pick.get("start_time"))
        if not kickoff or not captured or captured >= kickoff:
            return None
        docs = []
        for row in by_event.get(str(pick.get("match_id")), []):
            at = MontanteService._dt(row.get("commence_time"))
            if not at or abs((at-kickoff).total_seconds()) > 60:
                continue
            if any(row.get(k) != pick.get(k) for k in ("home_team","away_team")):
                continue
            docs.append(row)
        # Use exact selection results when present. Never borrow an opposite bet's outcome.
        exact = [r.get("result") for r in docs if r.get("pick") == pick.get("pick")
            and r.get("market") == pick.get("market") and r.get("pick_point") == pick.get("pick_point")
            and r.get("team") == pick.get("team")]
        known = set(exact)
        if len(known) == 1:
            return next(iter(known))
        if len(known) > 1:
            return None
        # For shadow alternatives only use unambiguous, confirmed scores for this event.
        import re
        scores = set()
        for row in docs:
            stamp = MontanteService._dt(row.get("reconciled_at"))
            score = re.fullmatch(r"(\d+)\s*-\s*(\d+)", str(row.get("final_score") or ""))
            if stamp and stamp > kickoff and score:
                scores.add(tuple(map(int,score.groups())))
        if len(scores) != 1:
            return None
        return evaluate(pick,*next(iter(scores)))

    def summary(rows):
        wins = sum(x[0] == "won" for x in rows)
        losses = sum(x[0] == "lost" for x in rows)
        void = sum(x[0] == "void" for x in rows)
        return {"evaluated":len(rows),"wins":wins,"losses":losses,"refunds":void,
            "win_rate_excluding_refunds":round(100*wins/(wins+losses),2) if wins+losses else None,
            "roi_flat_unit":round(sum(x[1]-1 for x in rows)/len(rows),4) if rows else None,
            "mean_three_outcome_brier":round(sum(x[2] for x in rows if x[2] is not None)/sum(x[2] is not None for x in rows),5)
                if any(x[2] is not None for x in rows) else None}

    for row in observations:
        captured = MontanteService._dt(row.get("captured_at"))
        for key in groups:
            evaluated_pair = []
            for pick in row.get(key) or []:
                identity = (str(pick.get("match_id")),pick.get("market"),pick.get("pick_raw"),pick.get("pick_point"),pick.get("team"))
                result = resolve(pick,captured)
                odds = MontanteService._num(pick.get("odds"))
                if result not in ("won","lost","void") or odds is None or odds <= 1:
                    if identity not in seen[key]:
                        pending[key] += 1
                        seen[key].add(identity)
                    continue
                unit_return = odds if result == "won" else 1. if result == "void" else 0.
                evaluated_pair.append((result,unit_return,None))
                if identity in seen[key]:
                    continue
                seen[key].add(identity)
                probabilities = [MontanteService._num(pick.get(k)) for k in (
                    "model_probability","push_probability","estimated_loss_probability")]
                brier = None
                if all(p is not None and 0<=p<=1 for p in probabilities) and abs(sum(probabilities)-1)<.002:
                    brier = sum((p-int(result == outcome))**2 for p,outcome in zip(probabilities,("won","void","lost")))
                record = (result,unit_return,brier)
                groups[key].append(record)
                if key == "selected":
                    band = "1.15–1.49" if odds < 1.5 else "1.50–1.99" if odds < 2 else "2.00+"
                    for dimension,value in (("market",pick.get("market")),("sport",pick.get("sport_key")),
                                            ("odds_band",band),("source",pick.get("probability_source"))):
                        breakdown[dimension].setdefault(str(value or "unknown"),[]).append(record)
            if key in pairs and len(row.get(key) or []) == 2 and len(evaluated_pair) == 2:
                pair_result = "lost" if any(x[0]=="lost" for x in evaluated_pair) else "void" if all(x[0]=="void" for x in evaluated_pair) else "won"
                pair_identity = tuple(sorted((str(p.get("match_id")),str(p.get("market")),str(p.get("pick_raw")),str(p.get("pick_point")),str(p.get("team"))) for p in row[key]))
                if pair_identity not in seen_pairs[key]:
                    seen_pairs[key].add(pair_identity)
                    pairs[key].append((pair_result,math.prod(x[1] for x in evaluated_pair),None))
    return {"selector_version":MontanteService.VERSION,"observations":len(observations),
        "sample_limit":200,"method":"first_pre_match_snapshot_only", "automatic_promotion":False,
        "baseline_policy":"legacy_score_on_same_v3_eligible_pool_not_exact_v2_replay",
        "note":"Comparaison prospective exploratoire ; échantillons possiblement liés. Aucun taux futur garanti.",
        "selections":{key:{**summary(rows),"pending_or_unresolved":pending[key]} for key,rows in groups.items()},
        "pairs":{key:summary(rows) for key,rows in pairs.items()},
        "breakdown":{key:{value:summary(rows) for value,rows in values.items()} for key,values in breakdown.items()}}
