"""Deterministic prediction & confidence scoring + multi-market combo generator.

Supports H2H (1X2), TOTALS (Over/Under), SPREADS (handicap).
Each market is scored independently; combos can mix market types.
"""
from typing import Dict, List, Optional, Tuple
import statistics
from datetime import datetime, timezone


# ---------- Market analysis primitives ----------

def _implied_probs(outcomes: List[Dict]) -> Dict[str, float]:
    raw = {o["name"]: 1.0 / float(o["price"]) for o in outcomes if o.get("price")}
    total = sum(raw.values())
    if total == 0:
        return {}
    return {k: v / total for k, v in raw.items()}


def _label_for_market(market_key: str) -> str:
    return {
        "h2h": "Vainqueur",
        "totals": "Total points/buts",
        "spreads": "Handicap",
        "btts": "Les 2 équipes marquent",
    }.get(market_key, market_key.upper())


def _outcome_label(market_key: str, outcome_name: str, point: Optional[float] = None) -> str:
    if market_key == "h2h":
        return outcome_name
    if market_key == "totals":
        # outcome_name = "Over" or "Under"
        side = "+ de" if outcome_name.lower() == "over" else "- de"
        return f"{side} {point}" if point is not None else outcome_name
    if market_key == "spreads":
        sign = "+" if (point is not None and point >= 0) else ""
        return f"{outcome_name} ({sign}{point})" if point is not None else outcome_name
    return outcome_name


def _analyze_market(market_key: str, bookmakers: List[Dict], home: str, away: str) -> Optional[Dict]:
    """Aggregate one market type across bookmakers and produce a pick."""
    # group outcomes by (name, point) — point matters for totals/spreads
    consensus_probs: Dict[Tuple[str, Optional[float]], List[float]] = {}
    best_odds: Dict[Tuple[str, Optional[float]], float] = {}
    num_books = 0

    for bm in bookmakers:
        for m in bm.get("markets", []):
            if m.get("key") != market_key:
                continue
            outcomes = m.get("outcomes", [])
            ip = _implied_probs(outcomes)
            if not ip:
                continue
            num_books += 1
            for o in outcomes:
                key = (o["name"], o.get("point"))
                p = ip.get(o["name"], 0)
                consensus_probs.setdefault(key, []).append(p)
                price = float(o.get("price", 0))
                if price > best_odds.get(key, 0):
                    best_odds[key] = price

    if not consensus_probs:
        return None

    consensus = {k: statistics.mean(v) for k, v in consensus_probs.items()}
    variance_avg = statistics.mean([
        statistics.pstdev(v) if len(v) > 1 else 0
        for v in consensus_probs.values()
    ])

    pick_key = max(consensus, key=consensus.get)
    pick_prob = consensus[pick_key]
    pick_odds = best_odds.get(pick_key)
    pick_name, pick_point = pick_key

    best_odd_prob = 1.0 / pick_odds if pick_odds else pick_prob
    edge = (pick_prob - best_odd_prob) * 100

    base = pick_prob * 100
    var_penalty = min(variance_avg * 100, 20)
    confidence = max(0, min(100, base - var_penalty + max(0, edge) * 0.5))

    if confidence >= 70:
        label = "safe"
    elif confidence >= 55:
        label = "value"
    else:
        label = "risky"

    return {
        "market": market_key,
        "market_label": _label_for_market(market_key),
        "pick": _outcome_label(market_key, pick_name, pick_point),
        "pick_raw": pick_name,
        "pick_point": pick_point,
        "pick_odds": pick_odds,
        "confidence": round(confidence, 1),
        "label": label,
        "edge": round(edge, 2),
        "num_books": num_books,
    }


# ---------- Top-level match analyzer ----------

def analyze_match(match: Dict) -> Dict:
    """Returns the BEST pick across all available markets + per-market breakdown."""
    bookmakers = match.get("bookmakers", [])
    empty = {
        "match_id": match.get("id"), "pick": None, "pick_odds": None,
        "confidence": 0, "label": "unknown", "implied_probs": {}, "edge": 0,
        "num_books": 0, "markets": [], "market": "h2h", "market_label": "Vainqueur",
    }
    if not bookmakers:
        return empty

    home = match.get("home_team")
    away = match.get("away_team")

    # Detect available markets in the bookmakers
    market_keys = set()
    for bm in bookmakers:
        for m in bm.get("markets", []):
            if m.get("key"):
                market_keys.add(m["key"])

    market_results = []
    for mk in ["h2h", "totals", "spreads", "btts"]:
        if mk not in market_keys:
            continue
        res = _analyze_market(mk, bookmakers, home, away)
        if res:
            market_results.append(res)

    if not market_results:
        return empty

    # Best market = highest confidence × edge bonus
    best = max(market_results, key=lambda x: x["confidence"] + max(0, x["edge"]))

    # Implied probs for the h2h market (used by UI for display)
    implied = {}
    h2h_book = next((m for m in market_results if m["market"] == "h2h"), None)
    if h2h_book:
        # rebuild implied probs from h2h
        per_outcome = {}
        for bm in bookmakers:
            for m in bm.get("markets", []):
                if m.get("key") != "h2h":
                    continue
                ip = _implied_probs(m.get("outcomes", []))
                for n, p in ip.items():
                    per_outcome.setdefault(n, []).append(p)
        implied = {k: round(statistics.mean(v) * 100, 1) for k, v in per_outcome.items()}

    return {
        "match_id": match.get("id"),
        "sport_key": match.get("sport_key"),
        "sport_title": match.get("sport_title"),
        "home_team": home,
        "away_team": away,
        "commence_time": match.get("commence_time"),
        "pick": best["pick"],
        "pick_odds": best["pick_odds"],
        "confidence": best["confidence"],
        "label": best["label"],
        "implied_probs": implied,
        "edge": best["edge"],
        "num_books": best["num_books"],
        "market": best["market"],
        "market_label": best["market_label"],
        "markets": market_results,  # all market analyses
    }


def analyze_all(matches: List[Dict]) -> List[Dict]:
    return [analyze_match(m) for m in matches if m.get("bookmakers")]


def top_predictions(matches: List[Dict], limit: int = 6) -> List[Dict]:
    preds = analyze_all(matches)
    preds.sort(key=lambda p: p["confidence"], reverse=True)
    return preds[:limit]


# ---------- Combo generator ----------

def _pick_diversified_multi(pool: List[Dict], legs: int) -> List[Dict]:
    """Pick N legs ensuring (match, market) diversity — never two picks on the same match."""
    selected, used_matches = [], set()
    for p in pool:
        mid = p.get("match_id")
        if mid in used_matches:
            continue
        selected.append(p)
        used_matches.add(mid)
        if len(selected) >= legs:
            break
    return selected


def _flatten_market_picks(matches: List[Dict]) -> List[Dict]:
    """Flatten matches into a list of (match × market) picks, each scored."""
    picks = []
    for m in matches:
        analyzed = analyze_match(m) if not m.get("prediction") else m["prediction"]
        for mk in analyzed.get("markets", []):
            picks.append({
                "match_id": analyzed["match_id"],
                "sport_key": analyzed["sport_key"],
                "sport_title": analyzed["sport_title"],
                "home_team": analyzed["home_team"],
                "away_team": analyzed["away_team"],
                "commence_time": analyzed["commence_time"],
                "pick": mk["pick"],
                "pick_odds": mk["pick_odds"],
                "confidence": mk["confidence"],
                "label": mk["label"],
                "edge": mk["edge"],
                "market": mk["market"],
                "market_label": mk["market_label"],
            })
    return picks


def _stats(legs: List[Dict]) -> Dict:
    if not legs:
        return {"legs": [], "total_odds": 0, "avg_confidence": 0, "combined_probability": 0}
    total_odds = 1.0
    combined_prob = 1.0
    for p in legs:
        total_odds *= (p["pick_odds"] or 1)
        combined_prob *= (p["confidence"] / 100)
    return {
        "legs": legs,
        "total_odds": round(total_odds, 2),
        "avg_confidence": round(statistics.mean([p["confidence"] for p in legs]), 1),
        "combined_probability": round(combined_prob * 100, 1),
    }


def build_combo(matches: List[Dict], legs: int = 3, min_confidence: float = 65) -> Dict:
    """Legacy single combo (backward compat)."""
    picks = [p for p in _flatten_market_picks(matches) if p["pick_odds"] and p["confidence"] >= min_confidence]
    picks.sort(key=lambda p: p["confidence"], reverse=True)
    selected = _pick_diversified_multi(picks, legs)
    return {**_stats(selected), "generated_at": datetime.now(timezone.utc).isoformat()}


def build_multi_combos(matches: List[Dict]) -> Dict:
    """Generate three tiers of combos across all markets (h2h, totals, spreads).
    SAFE = highest confidence (target safe wins)
    BALANCED = confidence/odds balanced + value edge
    JACKPOT = optimised for high payout with positive edge
    """
    all_picks = [p for p in _flatten_market_picks(matches) if p["pick_odds"]]

    safe_pool = sorted(
        [p for p in all_picks if p["confidence"] >= 70],
        key=lambda p: p["confidence"], reverse=True,
    )
    safe_legs = _pick_diversified_multi(safe_pool, 3)

    bal_pool = sorted(
        [p for p in all_picks if 60 <= p["confidence"] <= 82],
        key=lambda p: (p["confidence"] * 0.55 + (p["pick_odds"] or 1) * 8 + max(0, p["edge"]) * 3),
        reverse=True,
    )
    balanced_legs = _pick_diversified_multi(bal_pool, 4)

    risky_pool = sorted(
        [p for p in all_picks if 50 <= p["confidence"] <= 72 and (p["pick_odds"] or 0) >= 1.7],
        key=lambda p: ((p["pick_odds"] or 1) * (p["confidence"] / 100)),
        reverse=True,
    )
    risky_legs = _pick_diversified_multi(risky_pool, 5)

    generated_at = datetime.now(timezone.utc).isoformat()

    # Safe combo is ALWAYS gratuit pour les Free users (acquisition + fidélisation quotidienne).
    # Les deux autres (Équilibre / Jackpot) restent réservés Pro / Elite.
    safe_is_free = True

    return {
        "safe": {
            **_stats(safe_legs),
            "tier": "safe",
            "label": "Sécurité",
            "tagline": "Le combiné le plus probable",
            "description": "Sélections diversifiées avec la plus haute confiance du jour, tous marchés confondus. Probabilité de chute minimale.",
            "free_today": safe_is_free,
            "generated_at": generated_at,
        },
        "balanced": {
            **_stats(balanced_legs),
            "tier": "balanced",
            "label": "Équilibre",
            "tagline": "Le meilleur rapport risque/gain",
            "description": "Picks combinant confiance solide et value edge sur plusieurs marchés (vainqueur, totaux, handicaps).",
            "free_today": False,
            "generated_at": generated_at,
        },
        "jackpot": {
            **_stats(risky_legs),
            "tier": "jackpot",
            "label": "Jackpot",
            "tagline": "Le combiné qui paye gros",
            "description": "Picks optimisés pour le gain maximal tout en conservant un edge positif. À jouer avec une mise raisonnable.",
            "free_today": False,
            "generated_at": generated_at,
        },
    }
