"""Deterministic prediction & confidence scoring.

We use bookmaker consensus + market efficiency theory:
- Convert each bookmaker's odds to implied probability
- Remove the vig (margin) per bookmaker
- Compute the consensus probability across books (mean) and the variance
- The pick = outcome with the highest consensus prob
- Confidence = consensus_prob * (1 - normalized_variance) * 100

This runs on every match without consuming any LLM credit.
"""
from typing import Dict, List, Optional
import statistics
from datetime import datetime, timezone


def _implied_probs(outcomes: List[Dict]) -> Dict[str, float]:
    raw = {o["name"]: 1.0 / float(o["price"]) for o in outcomes if o.get("price")}
    total = sum(raw.values())
    if total == 0:
        return {}
    return {k: v / total for k, v in raw.items()}  # remove vig


def analyze_match(match: Dict) -> Dict:
    """Return prediction object with pick, confidence, label, reasoning."""
    bookmakers = match.get("bookmakers", [])
    if not bookmakers:
        return {
            "match_id": match.get("id"),
            "pick": None,
            "pick_odds": None,
            "confidence": 0,
            "label": "unknown",
            "implied_probs": {},
            "edge": 0,
            "num_books": 0,
        }

    # Collect implied probs per outcome across all books
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
        return {
            "match_id": match.get("id"), "pick": None, "pick_odds": None,
            "confidence": 0, "label": "unknown", "implied_probs": {}, "edge": 0, "num_books": 0,
        }

    consensus = {name: statistics.mean(probs) for name, probs in per_outcome.items()}
    variance_avg = statistics.mean([
        statistics.pstdev(probs) if len(probs) > 1 else 0
        for probs in per_outcome.values()
    ])

    pick = max(consensus, key=consensus.get)
    pick_prob = consensus[pick]
    pick_odds = best_odds.get(pick)

    # Edge = difference between best book odds-implied prob and consensus (value spotting)
    best_odd_prob = 1.0 / pick_odds if pick_odds else pick_prob
    edge = (pick_prob - best_odd_prob) * 100  # positive = value bet

    # Confidence: scale pick_prob, penalize variance
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


def build_combo(matches: List[Dict], legs: int = 3, min_confidence: float = 65) -> Dict:
    """Build a parlay combining the highest-confidence picks across different sports."""
    preds = analyze_all(matches)
    preds = [p for p in preds if p["pick_odds"] and p["confidence"] >= min_confidence]
    preds.sort(key=lambda p: p["confidence"], reverse=True)

    # Diversify across sports
    selected: List[Dict] = []
    used_sports = set()
    for p in preds:
        if p["sport_key"] in used_sports:
            continue
        selected.append(p)
        used_sports.add(p["sport_key"])
        if len(selected) >= legs:
            break

    # Fallback: fill if not enough diversity
    if len(selected) < legs:
        for p in preds:
            if p in selected:
                continue
            selected.append(p)
            if len(selected) >= legs:
                break

    total_odds = 1.0
    for p in selected:
        total_odds *= p["pick_odds"]

    avg_conf = statistics.mean([p["confidence"] for p in selected]) if selected else 0
    # Combined probability of ALL legs winning
    combined_prob = 1.0
    for p in selected:
        combined_prob *= (p["confidence"] / 100)

    return {
        "legs": selected,
        "total_odds": round(total_odds, 2),
        "avg_confidence": round(avg_conf, 1),
        "combined_probability": round(combined_prob * 100, 1),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
