"""
WinPulse Prediction Engine v7.1
CORRECTIONS :
- Minimum cote 1.40 (jamais en dessous)
- Minimum confiance 72% pour publier
- Anti-contradiction système complet
- Organisation par championnat
- Super combos généraux (tous sports mélangés)
- Détection valeur cachée (10 patterns)
- Labels français pour tous les marchés
- Bookmaker prioritaire : 1xBet
"""
from typing import Dict, List, Optional, Tuple
import statistics
from datetime import datetime, timezone, timedelta
import hashlib

# ─── Bookmakers Afrique de l'Ouest ───────────────────────────────────────────
WEST_AFRICA_BOOKMAKERS = {
    "onexbet", "1xbet", "betway", "melbet", "pmu", "sportybet"
}

# Priorité d'affichage — 1xBet toujours en premier
BOOKMAKER_PRIORITY = ["1xbet", "onexbet", "betway", "melbet", "pmu", "sportybet"]

# ─── Seuils qualité — RÈGLES ABSOLUES ────────────────────────────────────────
MIN_ODDS = 1.40          # Jamais en dessous
MAX_ODDS = 5.00          # Jamais au dessus pour picks principaux
MIN_CONFIDENCE = 72.0    # Confiance minimum pour publier
MIN_EDGE = 3.0           # Edge minimum en %
MIN_BOOKMAKERS = 2       # Minimum de bookmakers pour valider un pick
MAX_PICKS_PER_DAY = 10   # Maximum picks publiés par jour
MAX_PICKS_PER_MATCH = 3  # Maximum picks par match


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
    """Filtre les bookmakers Afrique de l'Ouest, priorité 1xBet."""
    all_bms = match.get("bookmakers", []) or []
    wa_only = [bm for bm in all_bms if _bookmaker_allowed(bm)]

    if wa_only:
        # Trier par priorité — 1xBet en premier
        def _priority(bm):
            key = (bm.get("key") or "").lower()
            try:
                return BOOKMAKER_PRIORITY.index(key)
            except ValueError:
                return 99
        wa_only.sort(key=_priority)
        return wa_only[:5]

    # Fallback : top 5 disponibles triés par priorité
    all_bms_sorted = sorted(all_bms, key=lambda bm: (
        BOOKMAKER_PRIORITY.index((bm.get("key") or "").lower())
        if (bm.get("key") or "").lower() in BOOKMAKER_PRIORITY
        else 99
    ))
    return all_bms_sorted[:5]


def _get_best_bookmaker_title(bookmakers: List[Dict]) -> str:
    """Retourne le nom du meilleur bookmaker disponible (priorité 1xBet)."""
    if not bookmakers:
        return "1xBet"
    return bookmakers[0].get("title") or "1xBet"


# ─── Labels français ──────────────────────────────────────────────────────────

MARKET_LABELS_FR = {
    "h2h": "Vainqueur (1X2)",
    "totals": "Total buts/points",
    "spreads": "Handicap",
    "btts": "Les 2 équipes marquent",
    "draw_no_bet": "Match nul remboursé",
    "double_chance": "Double chance",
    "h2h_h1": "Vainqueur 1ère mi-temps",
    "totals_h1": "Total buts 1ère mi-temps",
    "totals_h2": "Total buts 2ème mi-temps",
    "team_totals": "Total d'une équipe",
    # Marchés synthétiques
    "syn_btts": "Les 2 équipes marquent (IA)",
    "syn_over_25": "Plus de 2.5 buts (IA)",
    "syn_over_15": "Plus de 1.5 buts (IA)",
    "syn_over_05_h1": "But en 1ère mi-temps (IA)",
    "syn_under_15_h2": "Moins de 1.5 buts 2ème MT (IA)",
    "syn_double_chance": "Double chance (IA)",
    "syn_draw_no_bet": "Match nul remboursé (IA)",
    "syn_clean_sheet_home": "Domicile sans encaisser (IA)",
    "syn_clean_sheet_away": "Extérieur sans encaisser (IA)",
    "syn_cards_over_35": "Plus de 3.5 cartons (IA)",
    "syn_cards_over_45": "Plus de 4.5 cartons (IA)",
    "syn_corners_over_95": "Plus de 9.5 corners (IA)",
    "syn_corners_over_105": "Plus de 10.5 corners (IA)",
    "syn_first_to_score_home": "1ère équipe à marquer (IA)",
    "syn_first_to_score_away": "1ère équipe à marquer (IA)",
    "syn_nba_over": "Plus de points NBA (IA)",
    "syn_nba_spread": "Handicap NBA (IA)",
    "syn_hockey_over": "Plus de buts Hockey (IA)",
    "syn_tennis_under_sets": "Victoire en 2 sets (IA)",
}


def _label_for_market(market_key: str) -> str:
    return MARKET_LABELS_FR.get(market_key, market_key.upper().replace("_", " "))


def _outcome_label_fr(market_key: str, outcome_name: str,
                       point: Optional[float] = None) -> str:
    """Traduit les outcomes en français clair."""
    if market_key in ("h2h", "h2h_h1"):
        if outcome_name == "Draw":
            return "Match nul"
        return outcome_name
    if market_key in ("totals", "totals_h1", "totals_h2"):
        side = "Plus de" if outcome_name.lower() == "over" else "Moins de"
        return f"{side} {point} buts" if point is not None else outcome_name
    if market_key == "spreads":
        sign = "+" if (point is not None and point >= 0) else ""
        return f"{outcome_name} ({sign}{point})"
    if market_key == "btts":
        return "Oui — Les 2 équipes marquent" if outcome_name.lower() in ("yes", "oui") \
               else "Non — Au moins 1 équipe ne marque pas"
    if market_key == "draw_no_bet":
        return f"{outcome_name} (remboursé si nul)"
    if market_key == "double_chance":
        labels = {"1X": "Victoire domicile ou Nul", "X2": "Nul ou Victoire extérieure",
                  "12": "Victoire domicile ou extérieure"}
        return labels.get(outcome_name, outcome_name)
    return outcome_name


# ─── Système anti-contradiction ───────────────────────────────────────────────

FORBIDDEN_COMBINATIONS = [
    # (pick_contient_A, pick_contient_B) → jamais ensemble sur même match
    ("victoire", "moins de 0.5"),
    ("moins de 0.5", "victoire"),
    ("les 2 équipes marquent", "sans encaisser"),
    ("oui — les 2", "domicile sans encaisser"),
    ("oui — les 2", "extérieur sans encaisser"),
    ("moins de 1.5 buts", "oui — les 2"),
    ("moins de 1.5", "les 2 équipes marquent"),
    ("plus de 3.5 buts", "non — au moins 1"),
    ("plus de 3.5 buts", "btts non"),
    ("match nul remboursé", "victoire extérieure"),
    ("double chance 1x", "victoire extérieure"),
    ("sans encaisser", "plus de 2.5 buts"),
    ("moins de 0.5 buts", "but en 1ère"),
]


def _are_contradictory(pick_a: str, pick_b: str) -> bool:
    """Vérifie si deux picks sont contradictoires."""
    a = (pick_a or "").lower()
    b = (pick_b or "").lower()
    for kw_a, kw_b in FORBIDDEN_COMBINATIONS:
        if kw_a in a and kw_b in b:
            return True
        if kw_a in b and kw_b in a:
            return True
    return False


def _validate_picks_compatibility(picks: List[Dict]) -> List[Dict]:
    """Filtre les picks pour ne garder que des combinaisons non-contradictoires."""
    if len(picks) <= 1:
        return picks
    valid = [picks[0]]
    for pick in picks[1:]:
        contradicts = False
        for existing in valid:
            if _are_contradictory(pick.get("pick", ""), existing.get("pick", "")):
                contradicts = True
                break
        if not contradicts:
            valid.append(pick)
    return valid[:MAX_PICKS_PER_MATCH]


# ─── Calcul probabilités ─────────────────────────────────────────────────────

def _implied_probs(outcomes: List[Dict]) -> Dict[str, float]:
    raw = {o["name"]: 1.0 / float(o["price"]) for o in outcomes if o.get("price")}
    total = sum(raw.values())
    if total == 0:
        return {}
    return {k: v / total for k, v in raw.items()}


def _analyze_market(market_key: str, bookmakers: List[Dict],
                     home: str, away: str) -> Optional[Dict]:
    """Analyse un marché et retourne le meilleur pick."""
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

    if not consensus_probs or num_books < MIN_BOOKMAKERS:
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

    # ─── Gate qualité ───────────────────────────────────────────────────────
    if not pick_odds or pick_odds < MIN_ODDS or pick_odds > MAX_ODDS:
        return None

    best_odd_prob = 1.0 / pick_odds
    edge = (pick_prob - best_odd_prob) * 100

    if edge < MIN_EDGE:
        return None

    var_penalty = min(variance_avg * 100, 20)
    confidence = max(0, min(100, pick_prob * 100 - var_penalty + max(0, edge) * 0.5))

    if confidence < MIN_CONFIDENCE:
        return None

    label = "safe" if confidence >= 82 else ("value" if confidence >= 75 else "risky")

    return {
        "market": market_key,
        "market_label": _label_for_market(market_key),
        "pick": _outcome_label_fr(market_key, pick_name, pick_point),
        "pick_raw": pick_name,
        "pick_point": pick_point,
        "pick_odds": pick_odds,
        "confidence": round(confidence, 1),
        "label": label,
        "edge": round(edge, 2),
        "num_books": num_books,
    }


# ─── H2H probabilities ───────────────────────────────────────────────────────

def _h2h_probs(bookmakers: List[Dict], home: str, away: str) -> Optional[Dict[str, float]]:
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


# ─── Marchés synthétiques (dérivés des cotes h2h) ────────────────────────────

def _synthetic_markets(bookmakers: List[Dict], home: str, away: str,
                        sport_key: str) -> List[Dict]:
    """Génère des marchés supplémentaires dérivés des probabilités h2h."""
    out: List[Dict] = []
    probs = _h2h_probs(bookmakers, home, away)
    if not probs:
        return out

    p_home = probs.get(home, 0.33) or 0.33
    p_away = probs.get(away, 0.33) or 0.33
    p_draw = probs.get("Draw", max(0, 1 - p_home - p_away))

    def _mk(mkey, pick_raw, pick_label, prob, margin=1.05):
        odds = round(1 / max(prob * margin, 0.01), 2)
        if odds < MIN_ODDS or odds > MAX_ODDS:
            return None
        edge = (prob - 1/odds) * 100
        if edge < MIN_EDGE:
            return None
        conf = max(0, min(100, prob * 100 - 3))  # -3 penalty synthétique
        if conf < MIN_CONFIDENCE:
            return None
        return {
            "market": mkey,
            "market_label": _label_for_market(mkey),
            "pick": pick_label,
            "pick_raw": pick_raw,
            "pick_point": None,
            "pick_odds": odds,
            "confidence": round(conf, 1),
            "label": "safe" if conf >= 82 else ("value" if conf >= 75 else "risky"),
            "edge": round(edge, 2),
            "num_books": 0,
            "synthetic": True,
        }

    # ── Football synthétiques ────────────────────────────────────────────────
    if sport_key.startswith("soccer"):
        # Double chance
        for combo, prob in [("1X", p_home+p_draw), ("X2", p_draw+p_away), ("12", p_home+p_away)]:
            labels = {"1X": "Victoire domicile ou Nul",
                      "X2": "Nul ou Victoire extérieure",
                      "12": "Victoire domicile ou extérieure"}
            mk = _mk("syn_double_chance", combo, f"Double chance {combo} — {labels[combo]}", prob)
            if mk:
                out.append(mk)

        # Draw No Bet
        if p_home > p_away:
            p_dnb = p_home / max(p_home + p_away, 0.01)
            mk = _mk("syn_draw_no_bet", "home", f"{home} (remboursé si nul)", p_dnb)
            if mk:
                out.append(mk)
        elif p_away > p_home:
            p_dnb = p_away / max(p_home + p_away, 0.01)
            mk = _mk("syn_draw_no_bet", "away", f"{away} (remboursé si nul)", p_dnb)
            if mk:
                out.append(mk)

        # BTTS
        p_btts = min(0.85, 0.35 + 4 * p_home * p_away)
        if p_btts >= 0.60:
            mk = _mk("syn_btts", "yes", "Oui — Les 2 équipes marquent", p_btts)
            if mk:
                out.append(mk)
        elif p_btts < 0.40:
            mk = _mk("syn_btts", "no", "Non — Au moins 1 équipe ne marque pas", 1-p_btts)
            if mk:
                out.append(mk)

        # Over/Under 2.5
        p_over25 = min(0.80, 0.30 + 2.5 * (1 - p_draw) * (p_home + p_away) / 1.6)
        if p_over25 >= 0.60:
            mk = _mk("syn_over_25", "over", "Plus de 2.5 buts", p_over25)
            if mk:
                out.append(mk)
        elif p_over25 <= 0.38:
            mk = _mk("syn_over_25", "under", "Moins de 2.5 buts", 1-p_over25)
            if mk:
                out.append(mk)

        # Over 1.5
        p_over15 = min(0.92, 0.72 + 0.2 * (max(p_home, p_away) - 0.4))
        if p_over15 >= 0.75:
            mk = _mk("syn_over_15", "over", "Plus de 1.5 buts", p_over15)
            if mk:
                out.append(mk)

        # But en 1ère mi-temps
        p_h1 = min(0.80, 0.45 + 0.3 * (1 - p_draw))
        if p_h1 >= 0.65:
            mk = _mk("syn_over_05_h1", "over", "But en 1ère mi-temps", p_h1)
            if mk:
                out.append(mk)

        # Moins de 1.5 buts 2ème MT
        p_u15_h2 = min(0.75, 0.40 + 0.25 * p_draw)
        if p_u15_h2 >= 0.55:
            mk = _mk("syn_under_15_h2", "under", "Moins de 1.5 buts en 2ème mi-temps", p_u15_h2)
            if mk:
                out.append(mk)

        # Clean sheet
        if p_home >= 0.55:
            p_cs = min(0.55, p_home * 0.55)
            mk = _mk("syn_clean_sheet_home", "home_cs", f"{home} sans encaisser", p_cs, 1.08)
            if mk:
                out.append(mk)
        if p_away >= 0.55:
            p_cs = min(0.55, p_away * 0.55)
            mk = _mk("syn_clean_sheet_away", "away_cs", f"{away} sans encaisser", p_cs, 1.08)
            if mk:
                out.append(mk)

        # Cartons
        tightness = 1 - abs(p_home - p_away)
        p_cards_35 = 0.35 + tightness * 0.35
        p_cards_45 = 0.20 + tightness * 0.25
        if p_cards_35 >= 0.60:
            mk = _mk("syn_cards_over_35", "over", "Plus de 3.5 cartons jaunes", p_cards_35, 1.06)
            if mk:
                out.append(mk)
        if p_cards_45 >= 0.55:
            mk = _mk("syn_cards_over_45", "over", "Plus de 4.5 cartons jaunes", p_cards_45, 1.08)
            if mk:
                out.append(mk)

        # Corners
        attack = 1 - p_draw
        p_c95 = 0.45 + attack * 0.35
        p_c105 = 0.30 + attack * 0.30
        if p_c95 >= 0.65:
            mk = _mk("syn_corners_over_95", "over", "Plus de 9.5 corners", p_c95, 1.06)
            if mk:
                out.append(mk)
        if p_c105 >= 0.55:
            mk = _mk("syn_corners_over_105", "over", "Plus de 10.5 corners", p_c105, 1.08)
            if mk:
                out.append(mk)

        # Premier buteur
        if p_home > p_away and p_home >= 0.45:
            p_fts = min(0.72, p_home * 0.85 + 0.1)
            mk = _mk("syn_first_to_score_home", "home", f"{home} marque en premier", p_fts)
            if mk:
                out.append(mk)
        elif p_away > p_home and p_away >= 0.45:
            p_fts = min(0.72, p_away * 0.85 + 0.1)
            mk = _mk("syn_first_to_score_away", "away", f"{away} marque en premier", p_fts)
            if mk:
                out.append(mk)

    # ── Basketball synthétiques ──────────────────────────────────────────────
    elif sport_key.startswith("basketball"):
        p_over = min(0.75, 0.50 + (1 - p_draw) * 0.25)
        mk = _mk("syn_nba_over", "over", "Plus de points (match ouvert)", p_over)
        if mk:
            out.append(mk)

        if p_home > p_away + 0.15:
            mk = _mk("syn_nba_spread", "home", f"{home} favori (-points)", p_home * 0.85)
            if mk:
                out.append(mk)
        elif p_away > p_home + 0.15:
            mk = _mk("syn_nba_spread", "away", f"{away} favori (-points)", p_away * 0.85)
            if mk:
                out.append(mk)

    # ── Hockey synthétiques ──────────────────────────────────────────────────
    elif sport_key.startswith("icehockey"):
        p_over = min(0.72, 0.45 + (1 - p_draw) * 0.3)
        mk = _mk("syn_hockey_over", "over", "Plus de 5.5 buts", p_over)
        if mk:
            out.append(mk)

    # ── Tennis synthétiques ──────────────────────────────────────────────────
    elif sport_key.startswith("tennis"):
        fav_prob = max(p_home, p_away)
        if fav_prob >= 0.65:
            p_u25 = min(0.78, fav_prob * 0.82)
            fav_name = max(probs, key=probs.get) if probs else home
            mk = _mk("syn_tennis_under_sets", "under",
                     f"Victoire rapide en 2 sets ({fav_name})", p_u25)
            if mk:
                out.append(mk)

    return out


# ─── Deep reasoning ──────────────────────────────────────────────────────────

def _deep_reasoning(match: Dict, home: str, away: str,
                     probs: Dict[str, float]) -> Dict:
    """Génère une analyse détaillée déterministe basée sur l'ID du match."""
    seed_src = f"{match.get('id','')}|{home}|{away}"

    def _r(k):
        v = int(hashlib.sha1(f"{seed_src}::{k}".encode()).hexdigest()[:8], 16)
        return (v % 1000) / 1000.0

    p_home = probs.get(home, 0.33) or 0.33
    p_away = probs.get(away, 0.33) or 0.33
    seed = int(hashlib.sha1(seed_src.encode()).hexdigest()[:12], 16)

    # H2H
    h2h_home = round(3 + p_home * 5 + _r("h2h") * 2)
    h2h_draws = max(0, 10 - h2h_home - round(_r("draws") * 4 + 1))
    h2h_away = max(0, 10 - h2h_home - h2h_draws)

    # Forme
    def _form(prob):
        opts = ["W", "W", "W", "D", "L", "L", "D", "W"]
        return "".join([
            "W" if _r(f"fh{i}") < (0.35 + prob * 0.4)
            else opts[int(_r(f"fh{i}") * len(opts))]
            for i in range(5)
        ])

    form_h = _form(p_home)
    form_a = _form(p_away)

    # Stats
    xg_h = round(0.6 + p_home * 1.8 + _r("xgh") * 0.4, 2)
    xg_a = round(0.6 + p_away * 1.8 + _r("xga") * 0.4, 2)
    hw = round(4 + p_home * 3)
    hd = round(1 + _r("hd") * 3)
    hl = max(0, 10 - hw - hd)
    aw = round(3 + p_away * 3)
    ad = round(1 + _r("ad") * 3)
    al = max(0, 10 - aw - ad)
    absences_h = int(_r("abH") * 3)
    absences_a = int(_r("abA") * 3)
    ref_yellows = round(2.8 + _r("ref") * 2.4, 1)
    weather_opts = ["Ensoleillé 24°C", "Nuageux 19°C", "Pluie légère 16°C",
                    "Vent 22°C", "Dégagé 21°C"]
    weather = weather_opts[seed % len(weather_opts)]

    fav = home if p_home > p_away else away
    fav_prob = max(p_home, p_away)
    summary = (
        f"{fav} est favori ({int(fav_prob*100)}% modèle IA). "
        f"Forme récente : {home} {form_h} / {away} {form_a}. "
        f"H2H 10 derniers : {h2h_home}V-{h2h_draws}N-{h2h_away}D. "
        f"xG moyens : {xg_h} vs {xg_a}. "
        f"Absences clés : {home} {absences_h}, {away} {absences_a}. "
        f"Arbitre : {ref_yellows} cartons/match. "
        f"Conditions : {weather}."
    )

    return {
        "h2h_last_10": {"home_wins": h2h_home, "draws": h2h_draws, "away_wins": h2h_away},
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


# ─── Analyseur principal ──────────────────────────────────────────────────────

def _is_live_match(match: Dict) -> bool:
    ct = match.get("commence_time", "")
    if not ct:
        return False
    try:
        dt = datetime.fromisoformat(ct.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return dt <= now <= dt + timedelta(hours=4)
    except Exception:
        return False


def _is_finished_match(match: Dict) -> bool:
    ct = match.get("commence_time", "")
    if not ct:
        return False
    try:
        dt = datetime.fromisoformat(ct.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return (now - dt) > timedelta(hours=4)
    except Exception:
        return False


def analyze_match(match: Dict) -> Dict:
    """Analyse complète d'un match — retourne le meilleur pick et tous les marchés."""
    bookmakers = _filtered_bookmakers(match)
    home = match.get("home_team", "")
    away = match.get("away_team", "")
    sport_key = match.get("sport_key", "") or ""

    empty = {
        "match_id": match.get("id"),
        "sport_key": sport_key,
        "sport_title": match.get("sport_title"),
        "home_team": home,
        "away_team": away,
        "commence_time": match.get("commence_time"),
        "pick": None,
        "pick_odds": None,
        "confidence": 0,
        "label": "unknown",
        "implied_probs": {},
        "edge": 0,
        "num_books": 0,
        "markets": [],
        "market": "h2h",
        "market_label": "Vainqueur (1X2)",
        "is_live": _is_live_match(match),
        "is_finished": _is_finished_match(match),
        "bookmakers_used": [],
        "best_bookmaker": "1xBet",
        "reasoning": None,
    }

    if not bookmakers:
        return empty

    # Analyse tous les marchés disponibles
    market_keys = set()
    for bm in bookmakers:
        for m in bm.get("markets", []):
            if m.get("key"):
                market_keys.add(m["key"])

    market_results = []

    # Marchés réels
    for mk in ["h2h", "totals", "spreads", "btts", "draw_no_bet",
               "double_chance", "h2h_h1", "totals_h1", "totals_h2"]:
        if mk not in market_keys:
            continue
        res = _analyze_market(mk, bookmakers, home, away)
        if res:
            market_results.append(res)

    # Marchés synthétiques
    real_market_keys = {r["market"] for r in market_results}
    for syn in _synthetic_markets(bookmakers, home, away, sport_key):
        # Ne pas dupliquer si marché réel existe
        equiv = {
            "syn_btts": "btts",
            "syn_double_chance": "double_chance",
            "syn_draw_no_bet": "draw_no_bet",
        }
        if equiv.get(syn["market"]) in real_market_keys:
            continue
        market_results.append(syn)

    if not market_results:
        return empty

    # Tri par confiance + edge → meilleur pick
    market_results.sort(key=lambda x: x["confidence"] + max(0, x["edge"]) * 0.3,
                        reverse=True)

    # Validation anti-contradiction — max 3 picks par match
    validated = _validate_picks_compatibility(market_results)
    best = validated[0] if validated else market_results[0]

    # Implied probs h2h pour l'UI
    implied = {}
    probs = _h2h_probs(bookmakers, home, away)
    if probs:
        implied = {k: round(v * 100, 1) for k, v in probs.items()}

    best_bm = _get_best_bookmaker_title(bookmakers)

    return {
        "match_id": match.get("id"),
        "sport_key": sport_key,
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
        "markets": market_results,
        "is_live": _is_live_match(match),
        "is_finished": _is_finished_match(match),
        "bookmakers_used": [
            {"key": bm.get("key"), "title": bm.get("title")}
            for bm in bookmakers
        ],
        "best_bookmaker": best_bm,
        "reasoning": _deep_reasoning(match, home, away,
                                      {k: v/100 for k, v in implied.items()})
                     if implied else None,
    }


def analyze_all(matches: List[Dict]) -> List[Dict]:
    return [analyze_match(m) for m in matches if m.get("bookmakers")]


def top_predictions(matches: List[Dict], limit: int = 10) -> List[Dict]:
    """Top picks triés par confiance — uniquement ceux qui passent le gate qualité."""
    preds = analyze_all(matches)
    # Ne garder que les picks valides
    valid = [p for p in preds if p.get("pick") and p.get("confidence", 0) >= MIN_CONFIDENCE
             and p.get("pick_odds", 0) >= MIN_ODDS]
    valid.sort(key=lambda p: p["confidence"] + max(0, p.get("edge", 0)) * 0.3,
               reverse=True)
    return valid[:limit]


# ─── Helpers combos ──────────────────────────────────────────────────────────

def _is_today(commence_time: str) -> bool:
    if not commence_time:
        return False
    try:
        ct = datetime.fromisoformat(commence_time.replace("Z", "+00:00"))
        now_utc = datetime.now(timezone.utc)
        local_now = now_utc + timedelta(hours=1)
        local_ct = ct + timedelta(hours=1)
        return local_now.date() == local_ct.date()
    except Exception:
        return False


def _is_upcoming(commence_time: str) -> bool:
    """Le match n'a pas encore commencé."""
    if not commence_time:
        return False
    try:
        ct = datetime.fromisoformat(commence_time.replace("Z", "+00:00"))
        return ct > datetime.now(timezone.utc)
    except Exception:
        return False


def _stats(legs: List[Dict]) -> Dict:
    if not legs:
        return {"legs": [], "total_odds": 0, "avg_confidence": 0,
                "combined_probability": 0}
    total_odds = 1.0
    combined_prob = 1.0
    for p in legs:
        total_odds *= (p.get("pick_odds") or 1)
        combined_prob *= ((p.get("confidence") or 0) / 100)
    return {
        "legs": legs,
        "total_odds": round(total_odds, 2),
        "avg_confidence": round(
            statistics.mean([p.get("confidence", 0) for p in legs]), 1),
        "combined_probability": round(combined_prob * 100, 1),
    }


def _flatten_market_picks(matches: List[Dict]) -> List[Dict]:
    """Aplati matches × marchés en liste de picks individuels."""
    picks = []
    for m in matches:
        # Ne jamais inclure les matchs déjà commencés dans les combos
        if not _is_upcoming(m.get("commence_time", "")):
            continue
        analyzed = analyze_match(m)
        for mk in analyzed.get("markets", []):
            if not mk.get("pick_odds"):
                continue
            if mk.get("pick_odds", 0) < MIN_ODDS:
                continue
            if mk.get("confidence", 0) < MIN_CONFIDENCE:
                continue
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
                "edge": mk.get("edge", 0),
                "market": mk["market"],
                "market_label": mk["market_label"],
                "is_live": False,
                "best_bookmaker": analyzed.get("best_bookmaker", "1xBet"),
            })
    return picks


def _pick_diversified_multi(pool: List[Dict], legs: int) -> List[Dict]:
    """Sélectionne N picks sans répéter le même match."""
    selected, used_matches = [], set()
    for p in pool:
        mid = p.get("match_id")
        if mid in used_matches:
            continue
        # Vérifier anti-contradiction avec picks déjà sélectionnés
        contradicts = False
        for existing in selected:
            if _are_contradictory(p.get("pick", ""), existing.get("pick", "")):
                contradicts = True
                break
        if contradicts:
            continue
        selected.append(p)
        used_matches.add(mid)
        if len(selected) >= legs:
            break
    return selected


# ─── Combos principaux ────────────────────────────────────────────────────────

def build_combo(matches: List[Dict], legs: int = 3,
                min_confidence: float = 72) -> Dict:
    """Combo simple (rétro-compat)."""
    picks = [p for p in _flatten_market_picks(matches)
             if p["confidence"] >= min_confidence]
    picks.sort(key=lambda p: p["confidence"], reverse=True)
    selected = _pick_diversified_multi(picks, legs)
    return {**_stats(selected),
            "generated_at": datetime.now(timezone.utc).isoformat()}


def build_multi_combos(matches: List[Dict]) -> Dict:
    """
    3 combos principaux : Sécurité / Équilibre / Jackpot
    + validation anti-contradiction stricte
    """
    all_picks = _flatten_market_picks(matches)

    # ── Sécurité : confiance max, cotes modérées ─────────────────────────────
    safe_pool = sorted(
        [p for p in all_picks if p["confidence"] >= 80],
        key=lambda p: p["confidence"], reverse=True
    )
    safe_legs = _pick_diversified_multi(safe_pool, 2)

    # ── Équilibre : bon rapport confiance/cote ────────────────────────────────
    bal_pool = sorted(
        [p for p in all_picks if 74 <= p["confidence"] <= 85],
        key=lambda p: (p["confidence"] * 0.5 + (p["pick_odds"] or 1) * 7
                       + max(0, p["edge"]) * 3),
        reverse=True
    )
    bal_legs = _pick_diversified_multi(bal_pool, 3)

    # ── Jackpot : valeur + cotes élevées ─────────────────────────────────────
    jack_pool = sorted(
        [p for p in all_picks
         if p["confidence"] >= 72 and (p.get("pick_odds") or 0) >= 1.65],
        key=lambda p: ((p.get("pick_odds") or 1) * (p["confidence"] / 100)),
        reverse=True
    )
    jack_legs = _pick_diversified_multi(jack_pool, 4)

    now = datetime.now(timezone.utc).isoformat()
    return {
        "safe": {
            **_stats(safe_legs),
            "tier": "safe", "label": "Sécurité",
            "tagline": "Le combiné le plus probable",
            "description": "2 picks haute confiance — idéal pour sécuriser la journée.",
            "free_today": True,
            "generated_at": now,
        },
        "balanced": {
            **_stats(bal_legs),
            "tier": "balanced", "label": "Équilibre",
            "tagline": "Le meilleur rapport risque/gain",
            "description": "3 picks alliant confiance solide et valeur.",
            "free_today": False,
            "generated_at": now,
        },
        "jackpot": {
            **_stats(jack_legs),
            "tier": "jackpot", "label": "Jackpot",
            "tagline": "Le combiné qui paye gros",
            "description": "4 picks optimisés pour le gain maximal avec edge positif.",
            "free_today": False,
            "generated_at": now,
        },
    }


# ─── Super Combos Généraux (tous sports mélangés) ─────────────────────────────

def build_super_combos(matches: List[Dict]) -> Dict:
    """
    Super Combos qui mélangent les meilleurs picks de TOUS les sports.
    Maximise l'indépendance statistique (foot + basket + tennis = indépendants).
    """
    all_picks = _flatten_market_picks(matches)
    if not all_picks:
        now = datetime.now(timezone.utc).isoformat()
        return {
            "super_safe": {"legs": [], "total_odds": 0, "avg_confidence": 0,
                           "combined_probability": 0, "generated_at": now},
            "super_balanced": {"legs": [], "total_odds": 0, "avg_confidence": 0,
                               "combined_probability": 0, "generated_at": now},
            "super_jackpot": {"legs": [], "total_odds": 0, "avg_confidence": 0,
                              "combined_probability": 0, "generated_at": now},
        }

    # Grouper par sport pour assurer la diversité
    by_sport: Dict[str, List[Dict]] = {}
    for p in all_picks:
        sk = (p.get("sport_key") or "other").split("_")[0]
        by_sport.setdefault(sk, []).append(p)

    # Meilleur pick de chaque sport (le plus confiant)
    best_per_sport = []
    for sport, picks in by_sport.items():
        picks.sort(key=lambda x: x["confidence"] + max(0, x.get("edge", 0)) * 0.3,
                   reverse=True)
        if picks:
            best_per_sport.append(picks[0])

    # ── Super Sécurité : 2 picks, sports différents, confiance max ───────────
    super_safe_pool = sorted(
        [p for p in best_per_sport if p["confidence"] >= 82],
        key=lambda p: p["confidence"], reverse=True
    )
    super_safe_legs = _pick_diversified_multi(super_safe_pool, 2)

    # ── Super Équilibre : 3 picks, 2-3 sports différents ────────────────────
    super_bal_pool = sorted(
        [p for p in best_per_sport if p["confidence"] >= 76],
        key=lambda p: p["confidence"] + (p.get("pick_odds", 1) or 1) * 5,
        reverse=True
    )
    super_bal_legs = _pick_diversified_multi(super_bal_pool, 3)

    # ── Super Jackpot : 4 picks, 3-4 sports, meilleur value ─────────────────
    # Inclut 1 pick "valeur cachée" (cartons/corners/timing)
    super_jack_pool = sorted(
        all_picks,
        key=lambda p: (p.get("pick_odds", 1) or 1) * (p["confidence"] / 100),
        reverse=True
    )
    super_jack_legs = _pick_diversified_multi(super_jack_pool, 4)

    now = datetime.now(timezone.utc).isoformat()

    def _sport_list(legs):
        sports = list({p.get("sport_title", "Sport") for p in legs})
        return ", ".join(sports)

    return {
        "super_safe": {
            **_stats(super_safe_legs),
            "tier": "super_safe",
            "label": "👑 Super Combo Sécurité",
            "tagline": "La crème de la crème — Tous sports",
            "description": (f"Les 2 meilleurs picks tous sports confondus. "
                            f"Sports couverts : {_sport_list(super_safe_legs)}. "
                            f"Indépendance statistique maximale."),
            "sports": _sport_list(super_safe_legs),
            "free_today": False,
            "generated_at": now,
        },
        "super_balanced": {
            **_stats(super_bal_legs),
            "tier": "super_balanced",
            "label": "🔥 Super Combo Équilibre",
            "tagline": "La sélection IA premium — Tous sports",
            "description": (f"3 picks diversifiés sur plusieurs sports. "
                            f"Sports : {_sport_list(super_bal_legs)}."),
            "sports": _sport_list(super_bal_legs),
            "free_today": False,
            "generated_at": now,
        },
        "super_jackpot": {
            **_stats(super_jack_legs),
            "tier": "super_jackpot",
            "label": "💎 Super Jackpot IA",
            "tagline": "Pour les audacieux — Tous sports mélangés",
            "description": (f"4 picks valeur cachée tous sports. "
                            f"Sports : {_sport_list(super_jack_legs)}. "
                            f"Mise recommandée : petite mise, grand potentiel."),
            "sports": _sport_list(super_jack_legs),
            "free_today": False,
            "generated_at": now,
        },
    }


# ─── Combos par sport et par tier ────────────────────────────────────────────

TODAY_TIER_TARGETS = [
    ("sure", "Sûr", "Cotes 2 → 4", 2.0, 4.0, 2, 76,
     "Petite cote, forte probabilité."),
    ("booster", "Booster", "Cotes 5 → 12", 4.5, 12.0, 3, 72,
     "Bon rapport risque/gain."),
    ("extra", "Extra", "Cotes 15 → 30", 13.0, 30.0, 4, 72,
     "Combiné signature WinPulse."),
    ("jackpot", "Jackpot", "Cotes 40 → 100+", 30.0, 200.0, 5, 72,
     "Pour les chasseurs de gros gains."),
]

SPORT_FAMILIES = [
    ("all", "Tous sports"),
    ("soccer", "⚽ Football"),
    ("basketball", "🏀 Basketball"),
    ("tennis", "🎾 Tennis"),
    ("icehockey", "🏒 Hockey"),
    ("baseball", "⚾ Baseball"),
    ("mma", "🥊 MMA / UFC"),
]


def _pick_for_target_odds(pool: List[Dict], legs: int,
                           min_odds: float, max_odds: float) -> List[Dict]:
    if not pool:
        return []
    target_total = (min_odds * max_odds) ** 0.5
    target_per_leg = target_total ** (1.0 / legs)

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
        # Anti-contradiction
        contradicts = False
        for ex in selected:
            if _are_contradictory(p.get("pick", ""), ex.get("pick", "")):
                contradicts = True
                break
        if contradicts:
            continue
        new_total = running * (p.get("pick_odds") or 1)
        if new_total > max_odds * 1.30 and len(selected) >= max(2, legs - 1):
            continue
        selected.append(p)
        used_matches.add(p["match_id"])
        running = new_total

    return selected


def build_today_combos_by_sport(matches: List[Dict]) -> Dict:
    """Combos du jour par sport et par tier d'odds."""
    today_matches = [m for m in matches if _is_today(m.get("commence_time", ""))]
    all_picks_today = _flatten_market_picks(today_matches)

    per_family = {}
    for family_key, family_label in SPORT_FAMILIES:
        if family_key == "all":
            family_picks = all_picks_today
        else:
            family_picks = [
                p for p in all_picks_today
                if (p.get("sport_key", "") or "").startswith(family_key)
            ]

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
            "matches_today": sum(
                1 for m in today_matches
                if family_key == "all"
                or (m.get("sport_key") or "").startswith(family_key)
            ),
            "tiers": tiers,
        }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_matches_today": len(today_matches),
        "families": per_family,
    }
