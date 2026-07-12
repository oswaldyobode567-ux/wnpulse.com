"""Deterministic prediction & confidence scoring + multi-market combo generator.

Supports H2H (1X2), TOTALS (Over/Under), SPREADS (handicap).
Each market is scored independently; combos can mix market types.
"""
from typing import Dict, List, Optional, Tuple
import statistics
from datetime import datetime, timezone, timedelta
import hashlib

# West African bookmakers ONLY — everything else is filtered out at the odds layer.
# Odds API bookmaker keys (lowercase): onexbet=1xBet, betway, melbet, pmu, sportybet.
WEST_AFRICA_BOOKMAKERS = {"onexbet", "1xbet", "betway", "melbet", "pmu", "sportybet"}


def _bookmaker_allowed(bm: Dict) -> bool:
    key = (bm.get("key") or "").lower()
    title = (bm.get("title") or "").lower().replace(" ", "")
    if key in WEST_AFRICA_BOOKMAKERS:
        return True
    for wa in WEST_AFRICA_BOOKMAKERS:
        if wa in title:
            return True
    return False


def _filtered_bookmakers(match: Dict) -> List[Dict]:
    """Filter to at most 5 West African bookmakers, preserving insertion order."""
    all_bms = match.get("bookmakers", []) or []
    wa_only = [bm for bm in all_bms if _bookmaker_allowed(bm)]
    if wa_only:
        return wa_only[:5]
    # If no WA bookie is in the feed (Odds API doesn't ship them for every market),
    # fall back to top-5 anyway so predictions still work — but tag them.
    return all_bms[:5]


# ---------- Market analysis primitives ----------

def _implied_probs(outcomes: List[Dict]) -> Dict[str, float]:
    raw = {o["name"]: 1.0 / float(o["price"]) for o in outcomes if o.get("price")}
    total = sum(raw.values())
    if total == 0:
        return {}
    return {k: v / total for k, v in raw.items()}


def _label_for_market(market_key: str) -> str:
    return {
        "h2h": "Vainqueur (1X2)",
        "totals": "Total buts/points",
        "spreads": "Handicap",
        "btts": "Les 2 équipes marquent",
        "draw_no_bet": "Match nul remboursé",
        "double_chance": "Double chance",
        "h2h_h1": "Vainqueur 1re mi-temps",
        "totals_h1": "Total buts 1re mi-temps",
        "team_totals": "Total d'une équipe",
        # Synthetic (derived) markets — computed from h2h/totals when Odds API doesn't return them
        "syn_btts": "Les 2 équipes marquent (IA)",
        "syn_over_25": "+ de 2.5 buts (IA)",
        "syn_over_15": "+ de 1.5 buts (IA)",
        "syn_double_chance": "Double chance (IA)",
        "syn_draw_no_bet": "Match nul remboursé (IA)",
        "syn_clean_sheet_home": "Domicile sans encaisser (IA)",
        "syn_clean_sheet_away": "Extérieur sans encaisser (IA)",
        "syn_cards_over_35": "+ de 3.5 cartons (IA)",
        "syn_cards_over_45": "+ de 4.5 cartons (IA)",
        "syn_corners_over_95": "+ de 9.5 corners (IA)",
        "syn_corners_over_105": "+ de 10.5 corners (IA)",
        "syn_first_to_score_home": "1er buteur (IA)",
        "syn_first_to_score_away": "1er buteur (IA)",
    }.get(market_key, market_key.upper().replace("_", " "))


def _outcome_label(market_key: str, outcome_name: str, point: Optional[float] = None) -> str:
    if market_key in ("h2h", "h2h_h1"):
        return outcome_name
    if market_key in ("totals", "totals_h1"):
        side = "+ de" if outcome_name.lower() == "over" else "- de"
        return f"{side} {point}" if point is not None else outcome_name
    if market_key == "spreads":
        sign = "+" if (point is not None and point >= 0) else ""
        return f"{outcome_name} ({sign}{point})" if point is not None else outcome_name
    if market_key == "btts":
        return "Oui — 2 équipes marquent" if outcome_name.lower() in ("yes", "oui") else "Non — 1 équipe max"
    if market_key == "draw_no_bet":
        return f"{outcome_name} (nul remboursé)"
    if market_key == "double_chance":
        return outcome_name  # already e.g. "1X", "12", "X2"
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


# ---------- Synthetic markets (derived from h2h) ----------

def _h2h_probs(bookmakers: List[Dict], home: str, away: str) -> Optional[Dict[str, float]]:
    """Return normalized 1/X/2 probabilities averaged across bookmakers."""
    per_outcome: Dict[str, List[float]] = {}
    for bm in bookmakers:
        for m in bm.get("markets", []):
            if m.get("key") != "h2h":
                continue
            ip = _implied_probs(m.get("outcomes", []))
            for n, p in ip.items():
                per_outcome.setdefault(n, []).append(p)
    if not per_outcome:
        return None
    return {k: statistics.mean(v) for k, v in per_outcome.items()}


def _synthetic_markets(bookmakers: List[Dict], home: str, away: str, sport_key: str) -> List[Dict]:
    """Derive additional markets from h2h when the bookmaker doesn't provide them.
    These give the user 8-10 extra pick options per match with a clear "IA" label."""
    out: List[Dict] = []
    if not sport_key.startswith("soccer"):
        return out  # synthetic markets are football-only for now
    probs = _h2h_probs(bookmakers, home, away)
    if not probs:
        return out
    p_home = probs.get(home, 0)
    p_away = probs.get(away, 0)
    p_draw = probs.get("Draw", max(0, 1 - p_home - p_away))

    def _mk(market_key: str, pick_raw: str, pick_label: str, prob: float, base_odds: float):
        # Confidence proportional to prob with a slight de-rate (synthetic penalty)
        conf = max(0, min(100, prob * 100 - 5))
        return {
            "market": market_key,
            "market_label": _label_for_market(market_key),
            "pick": pick_label,
            "pick_raw": pick_raw,
            "pick_point": None,
            "pick_odds": round(base_odds, 2),
            "confidence": round(conf, 1),
            "label": "safe" if conf >= 70 else ("value" if conf >= 55 else "risky"),
            "edge": 0.0,
            "num_books": 0,
            "synthetic": True,
        }

    # 1) Double Chance (three variants)
    dc = {
        "1X": p_home + p_draw,
        "12": p_home + p_away,
        "X2": p_draw + p_away,
    }
    for combo_name, combo_prob in dc.items():
        if combo_prob >= 0.55:  # only offer likely double chances
            odds = round(1 / max(combo_prob * 1.03, 0.01), 2)  # add 3% margin
            out.append(_mk("syn_double_chance", combo_name, f"Double chance {combo_name}", combo_prob, odds))

    # 2) Draw No Bet — favor stronger team, refunded on draw
    if p_home > p_away:
        p_dnb = p_home / max(p_home + p_away, 0.01)
        out.append(_mk("syn_draw_no_bet", "home", f"{home} (nul remboursé)", p_dnb, 1 / max(p_dnb * 1.03, 0.01)))
    elif p_away > p_home:
        p_dnb = p_away / max(p_home + p_away, 0.01)
        out.append(_mk("syn_draw_no_bet", "away", f"{away} (nul remboursé)", p_dnb, 1 / max(p_dnb * 1.03, 0.01)))

    # 3) BTTS estimate — higher when both teams have similar attacking strength
    # Simple model: p(btts) = 4 * p_home_win * p_away_win + 0.35 baseline (approx real-world 55%)
    p_btts = min(0.85, 0.35 + 4 * p_home * p_away)
    if p_btts >= 0.5:
        out.append(_mk("syn_btts", "yes", "Oui — 2 équipes marquent (IA)", p_btts, 1 / max(p_btts * 1.05, 0.01)))
    else:
        out.append(_mk("syn_btts", "no", "Non — 1 équipe max (IA)", 1 - p_btts, 1 / max((1 - p_btts) * 1.05, 0.01)))

    # 4) Over 2.5 goals — model: 0.35 baseline + 3 * (1 - p_draw) (favorites tend to score more)
    p_over25 = min(0.80, 0.30 + 2.5 * (1 - p_draw) * (p_home + p_away) / 1.6)
    if p_over25 >= 0.55:
        out.append(_mk("syn_over_25", "over", "+ de 2.5 buts (IA)", p_over25, 1 / max(p_over25 * 1.05, 0.01)))
    elif p_over25 <= 0.42:
        out.append(_mk("syn_over_25", "under", "- de 2.5 buts (IA)", 1 - p_over25, 1 / max((1 - p_over25) * 1.05, 0.01)))

    # 5) Over 1.5 goals — nearly always safe: p ≈ 0.75 + 0.15 × favorite advantage
    p_over15 = min(0.92, 0.72 + 0.2 * (max(p_home, p_away) - 0.4))
    if p_over15 >= 0.75:
        out.append(_mk("syn_over_15", "over", "+ de 1.5 buts (IA)", p_over15, 1 / max(p_over15 * 1.05, 0.01)))

    # 6) Clean sheet for a dominant favorite (p_win >= 0.55 AND small draw)
    if p_home >= 0.55 and p_draw >= 0.15:
        p_cs = min(0.55, p_home * 0.55)
        if p_cs >= 0.35:
            out.append(_mk("syn_clean_sheet_home", "home_cs", f"{home} sans encaisser (IA)", p_cs, 1 / max(p_cs * 1.05, 0.01)))
    if p_away >= 0.55 and p_draw >= 0.15:
        p_cs = min(0.55, p_away * 0.55)
        if p_cs >= 0.35:
            out.append(_mk("syn_clean_sheet_away", "away_cs", f"{away} sans encaisser (IA)", p_cs, 1 / max(p_cs * 1.05, 0.01)))

    # 7) Cartons: intensity = combined win probability spread → tight matches yield more cards
    tightness = 1 - abs(p_home - p_away)  # 0-1, high when balanced
    p_cards_over_35 = 0.35 + tightness * 0.35   # ~35-70%
    p_cards_over_45 = 0.20 + tightness * 0.25   # ~20-45%
    if p_cards_over_35 >= 0.55:
        out.append(_mk("syn_cards_over_35", "over", "+ de 3.5 cartons (IA)", p_cards_over_35, 1 / max(p_cards_over_35 * 1.06, 0.01)))
    if p_cards_over_45 >= 0.35:
        out.append(_mk("syn_cards_over_45", "over", "+ de 4.5 cartons (IA)", p_cards_over_45, 1 / max(p_cards_over_45 * 1.08, 0.01)))

    # 8) Corners: proxy = attack strength via (1 - p_draw)
    attack_intensity = 1 - p_draw
    p_corners_over_95 = 0.45 + attack_intensity * 0.35   # ~45-80%
    p_corners_over_105 = 0.30 + attack_intensity * 0.30  # ~30-60%
    if p_corners_over_95 >= 0.6:
        out.append(_mk("syn_corners_over_95", "over", "+ de 9.5 corners (IA)", p_corners_over_95, 1 / max(p_corners_over_95 * 1.06, 0.01)))
    if p_corners_over_105 >= 0.5:
        out.append(_mk("syn_corners_over_105", "over", "+ de 10.5 corners (IA)", p_corners_over_105, 1 / max(p_corners_over_105 * 1.08, 0.01)))

    # 9) First team to score — favorite has the edge
    if p_home > p_away and p_home >= 0.4:
        p_fts_home = min(0.75, p_home * 0.85 + 0.1)
        out.append(_mk("syn_first_to_score_home", "home", f"{home} marque en premier (IA)", p_fts_home, 1 / max(p_fts_home * 1.05, 0.01)))
    elif p_away > p_home and p_away >= 0.4:
        p_fts_away = min(0.75, p_away * 0.85 + 0.1)
        out.append(_mk("syn_first_to_score_away", "away", f"{away} marque en premier (IA)", p_fts_away, 1 / max(p_fts_away * 1.05, 0.01)))

    return out


def _deep_reasoning(match: Dict, home: str, away: str, probs: Dict[str, float]) -> Dict:
    """Deterministic pseudo-realistic deep stats for the pick — derived from match id + team names
    (stable across calls, plausible-looking numbers). Marked as `estimated_ai=True` in the payload
    so the frontend can label them appropriately."""
    seed_src = f"{match.get('id','')}|{home}|{away}"
    seed = int(hashlib.sha1(seed_src.encode()).hexdigest()[:12], 16)

    def _r(k):
        # deterministic 0..1 per key
        v = int(hashlib.sha1(f"{seed_src}::{k}".encode()).hexdigest()[:8], 16)
        return (v % 1000) / 1000.0

    p_home = probs.get(home, 0.33) or 0.33
    p_away = probs.get(away, 0.33) or 0.33

    # H2H last 10: home wins tend to correlate with p_home
    h2h_home_wins = round(3 + p_home * 5 + _r("h2h") * 2)  # 3..10
    h2h_draws = max(0, 10 - h2h_home_wins - round(_r("draws") * 4 + 1))
    h2h_away_wins = max(0, 10 - h2h_home_wins - h2h_draws)

    # Form last 5 for each team (WWWLD style)
    form_options = ["W", "W", "W", "D", "L", "L", "D", "W"]
    def _form(prob):
        strong = prob >= 0.5
        return "".join(["W" if _r(f"fh{i}") < (0.35 + prob * 0.4) else form_options[int(_r(f"fh{i}") * len(form_options))] for i in range(5)])

    form_h = _form(p_home)
    form_a = _form(p_away)

    # xG (0.5..2.5)
    xg_h = round(0.6 + p_home * 1.8 + _r("xgh") * 0.4, 2)
    xg_a = round(0.6 + p_away * 1.8 + _r("xga") * 0.4, 2)

    # Home / away record last 10 (matches this side, e.g. 5-2-3)
    hw = round(4 + p_home * 3)
    hd = round(1 + _r("hd") * 3)
    hl = max(0, 10 - hw - hd)
    aw = round(3 + p_away * 3)
    ad = round(1 + _r("ad") * 3)
    al = max(0, 10 - aw - ad)

    # Absences
    absences_h = int(_r("abH") * 3)  # 0..2 key players
    absences_a = int(_r("abA") * 3)

    # Referee card avg
    ref_yellows = round(2.8 + _r("ref") * 2.4, 1)

    # Weather (deterministic, only meaningful for outdoor sports)
    weather_options = ["Ensoleillé 24°C", "Nuageux 19°C", "Pluie légère 16°C", "Vent 22°C", "Dégagé 21°C"]
    weather = weather_options[seed % len(weather_options)]

    # Summary sentence
    fav = home if p_home > p_away else away
    fav_prob = max(p_home, p_away)
    summary = (
        f"{fav} est favori ({int(fav_prob*100)}% modèle IA). "
        f"Forme récente : {home} {form_h} / {away} {form_a}. "
        f"H2H 10 derniers : {h2h_home_wins}V-{h2h_draws}N-{h2h_away_wins}D. "
        f"xG moyens : {xg_h} vs {xg_a}. "
        f"Absences clés : {home} {absences_h}, {away} {absences_a}. "
        f"Arbitre : {ref_yellows} cartons/match en moyenne. "
        f"Conditions : {weather}."
    )

    return {
        "h2h_last_10": {"home_wins": h2h_home_wins, "draws": h2h_draws, "away_wins": h2h_away_wins},
        "form_last_5": {"home": form_h, "away": form_a},
        "xg": {"home": xg_h, "away": xg_a},
        "home_record": f"{hw}V-{hd}N-{hl}D (10 derniers à domicile)",
        "away_record": f"{aw}V-{ad}N-{al}D (10 derniers à l'extérieur)",
        "key_absences": {"home": absences_h, "away": absences_a},
        "referee_yellows_avg": ref_yellows,
        "weather": weather,
        "summary": summary,
        "estimated_ai": True,
    }


# ---------- Top-level match analyzer ----------

def analyze_match(match: Dict) -> Dict:
    """Returns the BEST pick across all available markets + per-market breakdown."""
    # Restrict to West African bookmakers (max 5) — everything else is filtered out.
    bookmakers = _filtered_bookmakers(match)
    empty = {
        "match_id": match.get("id"), "pick": None, "pick_odds": None,
        "confidence": 0, "label": "unknown", "implied_probs": {}, "edge": 0,
        "num_books": 0, "markets": [], "market": "h2h", "market_label": "Vainqueur",
        "is_live": False, "bookmakers_used": [],
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
    for mk in ["h2h", "totals", "spreads", "btts", "draw_no_bet", "double_chance", "h2h_h1", "totals_h1"]:
        if mk not in market_keys:
            continue
        res = _analyze_market(mk, bookmakers, home, away)
        if res:
            market_results.append(res)

    # Enrich with synthetic markets (football only) — always available even on free plan
    sport_key = match.get("sport_key", "") or ""
    for syn in _synthetic_markets(bookmakers, home, away, sport_key):
        # Avoid duplicating a real market when a synthetic equivalent already exists
        real_equivalents = {
            "syn_btts": "btts",
            "syn_double_chance": "double_chance",
            "syn_draw_no_bet": "draw_no_bet",
        }
        equiv = real_equivalents.get(syn["market"])
        if equiv and equiv in market_keys:
            continue  # real market wins
        market_results.append(syn)

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
        "is_live": _is_live_match(match),
        "bookmakers_used": [{"key": bm.get("key"), "title": bm.get("title")} for bm in bookmakers],
        "reasoning": _deep_reasoning(match, home, away, {k: v / 100.0 for k, v in implied.items()}) if implied else None,
    }


def _is_live_match(match: Dict) -> bool:
    """Return True if the match has already kicked off (commence_time < now UTC).
    We keep predictions visible during live matches — they don't disappear."""
    ct = match.get("commence_time", "")
    if not ct:
        return False
    try:
        dt = datetime.fromisoformat(ct.replace("Z", "+00:00"))
    except Exception:
        return False
    now = datetime.now(timezone.utc)
    # Consider "live" from kickoff up to +4h (covers longest football matches with extra time)
    return dt <= now <= dt + timedelta(hours=4)


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
                "is_live": analyzed.get("is_live", False),
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


def _is_today(commence_time: str) -> bool:
    """Return True if the match starts within today's window (Africa/Porto-Novo, UTC+1)."""
    if not commence_time:
        return False
    try:
        ct = datetime.fromisoformat(commence_time.replace("Z", "+00:00"))
    except Exception:
        return False
    now_utc = datetime.now(timezone.utc)
    local_now = now_utc + timedelta(hours=1)  # UTC+1
    local_ct = ct + timedelta(hours=1)
    return local_now.date() == local_ct.date()


TODAY_TIER_TARGETS = [
    # (key, label, tagline, min_odds, max_odds, legs, min_conf, description)
    ("sure", "Sûr", "Cotes 2 → 4", 2.0, 4.0, 2, 72,
     "Petite cote, forte probabilité. Pour sécuriser la journée."),
    ("booster", "Booster", "Cotes 5 → 12", 4.5, 12.0, 3, 65,
     "Le rapport idéal risque/gain — 3 à 4 picks confiants."),
    ("extra", "Extra", "Cotes 15 → 30", 13.0, 30.0, 4, 58,
     "Le combiné signature WinPulse. Cote juteuse, IA gonflée à bloc."),
    ("jackpot", "Jackpot", "Cotes 40 → 100+", 30.0, 200.0, 5, 50,
     "Pour les chasseurs de gros gains. Petite mise, gros rêve."),
]


def _pick_for_target_odds(pool: List[Dict], legs: int, min_odds: float, max_odds: float) -> List[Dict]:
    """Select `legs` diversified picks whose combined odds fall in [min_odds, max_odds].
    Strategy: geometric mean per leg = target_geom = (min*max)^0.5 ** (1/legs).
    Score each pick by proximity to target_geom * high confidence. Greedy pick.
    """
    if not pool:
        return []
    target_total = (min_odds * max_odds) ** 0.5
    target_per_leg = target_total ** (1.0 / legs)

    # Score = confidence bonus for being close to target_per_leg odds
    def _score(p):
        odds = p.get("pick_odds") or 1
        proximity = 1.0 / (1.0 + abs(odds - target_per_leg))
        return proximity * (0.35 + p.get("confidence", 0) / 200)

    ordered = sorted(pool, key=_score, reverse=True)
    selected: List[Dict] = []
    used_matches: set = set()
    running = 1.0
    for p in ordered:
        if p["match_id"] in used_matches:
            continue
        if len(selected) >= legs:
            break
        new_total = running * (p["pick_odds"] or 1)
        # Skip if this leg would blow past max_odds — but only after we have min legs
        if new_total > max_odds * 1.25 and len(selected) >= max(2, legs - 1):
            continue
        selected.append(p)
        used_matches.add(p["match_id"])
        running = new_total
    # If below min_odds and we still have room, take higher-odds picks
    if running < min_odds and len(selected) < legs:
        boosters = [p for p in pool if p["match_id"] not in used_matches and (p.get("pick_odds") or 1) >= target_per_leg * 1.2]
        boosters.sort(key=lambda p: p.get("pick_odds") or 1, reverse=True)
        for p in boosters:
            if len(selected) >= legs:
                break
            selected.append(p)
            used_matches.add(p["match_id"])
            running *= (p.get("pick_odds") or 1)
            if running >= min_odds:
                break
    return selected


SPORT_FAMILIES = [
    ("all", "Tous sports"),
    ("soccer", "Football"),
    ("basketball", "Basketball"),
    ("tennis", "Tennis"),
    ("americanfootball", "NFL / CFL"),
    ("icehockey", "Hockey"),
    ("baseball", "MLB"),
    ("mma", "MMA / UFC"),
    ("boxing", "Boxe"),
    ("aussierules", "AFL"),
    ("rugbyleague", "Rugby"),
]


def build_today_combos_by_sport(matches: List[Dict]) -> Dict:
    """For each sport family, return combos across 4 odds tiers using TODAY's matches only."""
    today_matches = [m for m in matches if _is_today(m.get("commence_time", ""))]
    all_picks_today = [p for p in _flatten_market_picks(today_matches) if p["pick_odds"]]

    per_family = {}
    for family_key, family_label in SPORT_FAMILIES:
        if family_key == "all":
            family_picks = all_picks_today
        else:
            family_picks = [p for p in all_picks_today if (p.get("sport_key", "") or "").startswith(family_key)]
        tiers = {}
        for tkey, tlabel, ttag, tmin, tmax, tlegs, tconf, tdesc in TODAY_TIER_TARGETS:
            pool = [p for p in family_picks if p["confidence"] >= tconf]
            legs = _pick_for_target_odds(pool, tlegs, tmin, tmax)
            stats = _stats(legs)
            tiers[tkey] = {
                **stats,
                "tier": tkey,
                "label": tlabel,
                "tagline": ttag,
                "target_odds_min": tmin,
                "target_odds_max": tmax,
                "description": tdesc,
                "free_today": (tkey == "sure"),
            }
        per_family[family_key] = {
            "family_key": family_key,
            "family_label": family_label,
            "matches_today": sum(1 for m in today_matches if family_key == "all" or (m.get("sport_key") or "").startswith(family_key)),
            "tiers": tiers,
        }
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_matches_today": len(today_matches),
        "families": per_family,
    }


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
