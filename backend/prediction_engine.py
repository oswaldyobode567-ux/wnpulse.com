"""Deterministic prediction & confidence scoring + multi-tier combo generator.

We use bookmaker consensus + market efficiency theory:
- Convert each bookmaker's odds to implied probability (remove vig)
- Compute consensus probability across books + variance
- Confidence = consensus_prob * (1 - normalized_variance) * 100
- Label SAFE >=70, VALUE 55-70, RISKY <55
"""
from typing import Dict, List, Optional
import statistics
from datetime import datetime, timezone


def _implied_probs(outcomes: List[Dict]) -> Dict[str, float]:
    raw = {o["name"]: 1.0 / float(o["price"]) for o in outcomes if o.get("price")}
    total = sum(raw.values())
    if total == 0:
        return {}
    return {k: v / total for k, v in raw.items()}


def analyze_match(match: Dict) -> Dict:
    bookmakers = match.get("bookmakers", [])
    empty = {
        "match_id": match.get("id"), "pick": None, "pick_odds": None,
        "confidence": 0, "label": "unknown", "implied_probs": {}, "edge": 0, "num_books": 0,
    }
    if not bookmakers:
        return empty

    per_outcome: Dict[str, List[float]] = {}
    best_odds: Dict[str, float] = {}
    for bm in bookmakers:
        for market in bm.get("markets", []):
            if market.get("key") != "h2h":
                continue
            ip = _implied_probs(market.get("outcomes", []))
            for name, p in ip.items():
                per_outcome.setdefault(name, []).append(p)
            for o in market.get("outcomes", []):
                price = float(o.get("price", 0))
                if price > best_odds.get(o["name"], 0):
                    best_odds[o["name"]] = price

    if not per_outcome:
        return empty

    consensus = {name: statistics.mean(probs) for name, probs in per_outcome.items()}
    variance_avg = statistics.mean([
        statistics.pstdev(probs) if len(probs) > 1 else 0
        for probs in per_outcome.values()
    ])

    pick = max(consensus, key=consensus.get)
    pick_prob = consensus[pick]
    pick_odds = best_odds.get(pick)

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
        "match_id": match.get("id"),
        "sport_key": match.get("sport_key"),
        "sport_title": match.get("sport_title"),
        "home_team": match.get("home_team"),
        "away_team": match.get("away_team"),
        "commence_time": match.get("commence_time"),
        "pick": pick,
        "pick_odds": pick_odds,
        "confidence": round(confidence, 1),
        "label": label,
        "implied_probs": {k: round(v * 100, 1) for k, v in consensus.items()},
        "edge": round(edge, 2),
        "num_books": len(bookmakers),
    }


def analyze_all(matches: List[Dict]) -> List[Dict]:
    return [analyze_match(m) for m in matches if m.get("bookmakers")]


def top_predictions(matches: List[Dict], limit: int = 6) -> List[Dict]:
    preds = analyze_all(matches)
    preds.sort(key=lambda p: p["confidence"], reverse=True)
    return preds[:limit]


def _pick_diversified(pool: List[Dict], legs: int) -> List[Dict]:
    """Pick N legs ensuring sport diversity when possible."""
    selected, used_sports = [], set()
    for p in pool:
        if p["sport_key"] in used_sports:
            continue
        selected.append(p)
        used_sports.add(p["sport_key"])
        if len(selected) >= legs:
            break
    if len(selected) < legs:
        for p in pool:
            if p in selected:
                continue
            selected.append(p)
            if len(selected) >= legs:
                break
    return selected


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
    """Legacy single combo (backward compat with /predictions/combo)."""
    preds = analyze_all(matches)
    preds = [p for p in preds if p["pick_odds"] and p["confidence"] >= min_confidence]
    preds.sort(key=lambda p: p["confidence"], reverse=True)
    selected = _pick_diversified(preds, legs)
    return {**_stats(selected), "generated_at": datetime.now(timezone.utc).isoformat()}


def build_multi_combos(matches: List[Dict]) -> Dict:
    """Generate three tiers of combos for the day:
    - SAFE: 3 legs, highest confidence (target safe wins)
    - BALANCED: 4 legs, confidence/odds balanced
    - JACKPOT: 5 legs, optimised for high payout while keeping a positive edge
    """
    preds = [p for p in analyze_all(matches) if p["pick_odds"]]

    # SAFE: highest confidence first, prefer >=70
    safe_pool = sorted(
        [p for p in preds if p["confidence"] >= 65],
        key=lambda p: p["confidence"], reverse=True,
    )
    safe_legs = _pick_diversified(safe_pool, 3)

    # BALANCED: confidence 60-80, prefer value edge
    bal_pool = sorted(
        [p for p in preds if 58 <= p["confidence"] <= 82],
        key=lambda p: (p["confidence"] * 0.55 + (p["pick_odds"] or 1) * 8), reverse=True,
    )
    balanced_legs = _pick_diversified(bal_pool, 4)

    # JACKPOT: higher odds with non-trivial confidence
    risky_pool = sorted(
        [p for p in preds if 50 <= p["confidence"] <= 72 and (p["pick_odds"] or 0) >= 1.8],
        key=lambda p: ((p["pick_odds"] or 1) * (p["confidence"] / 100)), reverse=True,
    )
    risky_legs = _pick_diversified(risky_pool, 5)

    generated_at = datetime.now(timezone.utc).isoformat()
    return {
        "safe": {
            **_stats(safe_legs),
            "tier": "safe",
            "label": "Sécurité",
            "tagline": "Le combiné le plus probable",
            "description": "3 sélections diversifiées avec la plus haute confiance du jour. Probabilité de chute minimale.",
            "generated_at": generated_at,
        },
        "balanced": {
            **_stats(balanced_legs),
            "tier": "balanced",
            "label": "Équilibre",
            "tagline": "Le meilleur rapport risque/gain",
            "description": "4 picks combinant confiance solide et value edge. Le combiné préféré des parieurs réguliers.",
            "generated_at": generated_at,
        },
        "jackpot": {
            **_stats(risky_legs),
            "tier": "jackpot",
            "label": "Jackpot",
            "tagline": "Le combiné qui paye gros",
            "description": "5 picks optimisés pour le gain maximal tout en conservant un edge positif. À jouer avec une mise raisonnable.",
            "generated_at": generated_at,
        },
    }
