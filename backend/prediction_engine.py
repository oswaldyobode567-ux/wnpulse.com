"""
WinPulse Prediction Engine v8.0
- Seuils assouplis pour garantir des picks visibles au quotidien
- Filtre "edge minimum" retiré du gate de qualité (bookmakers pro = edge quasi nul,
  bloquait presque tous les picks). Le vrai filtre de qualité reste MIN_CONFIDENCE.
- Picks combinés (2 marchés compatibles fusionnés, cote multipliée)
  ex: "Victoire Juventus & Plus de 2.5 buts" @ cote combinée
- Anti-contradiction système complet
- Organisation par championnat
- Super combos généraux (tous sports mélangés)
- Labels français pour tous les marchés
- Bookmaker prioritaire : 1xBet, fallback sur tous bookmakers disponibles
"""
from typing import Dict, List, Optional, Tuple
import statistics
from datetime import datetime, timezone, timedelta
import hashlib

from stats_service import lookup_real_stats

# ─── Bookmakers Afrique de l'Ouest ───────────────────────────────────────────
WEST_AFRICA_BOOKMAKERS = {
    "onexbet", "1xbet", "betway", "melbet", "pmu", "sportybet"
}
BOOKMAKER_PRIORITY = ["1xbet", "onexbet", "betway", "melbet", "pmu", "sportybet"]

# ─── Seuils qualité — ASSOUPLIS pour garantir des picks quotidiens ───────────
MIN_ODDS = 1.15          # Cote minimum d'un pick simple
MAX_ODDS = 8.00          # Cote maximum pour picks principaux
MIN_CONFIDENCE = 60.0    # Seuil minimum de score pour publication
MIN_EDGE = 1.0           # Edge affiche/tri; le filtre Value Bets reste distinct
MIN_BOOKMAKERS = 1       # Minimum de bookmakers pour valider un pick
MIN_BOOKMAKERS_STRONG = 2
MODEL_VERSION = "8.0"
CALIBRATION_MIN_SAMPLE = 30

MAX_PICKS_PER_DAY = 15
MAX_PICKS_PER_MATCH = 3

# Cible pour les picks combinés (quand la cote simple est trop basse)
COMBO_TARGET_MIN_ODDS = 1.60   # En dessous de ça, on tente de combiner
COMBO_MIN_CONFIDENCE = 55.0    # Seuil légèrement plus souple pour le 2ème pick du combo


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
    """Filtre les bookmakers Afrique de l'Ouest, priorité 1xBet.
    Fallback sur tous les bookmakers disponibles si aucun trouve."""
    all_bms = match.get("bookmakers", []) or []
    wa_only = [bm for bm in all_bms if _bookmaker_allowed(bm)]

    if wa_only:
        def _priority(bm):
            key = (bm.get("key") or "").lower()
            try:
                return BOOKMAKER_PRIORITY.index(key)
            except ValueError:
                return 99
        wa_only.sort(key=_priority)
        wa_only_sorted = wa_only
    else:
        wa_only_sorted = []

    all_bms_sorted = sorted(all_bms, key=lambda bm: (
        BOOKMAKER_PRIORITY.index((bm.get("key") or "").lower())
        if (bm.get("key") or "").lower() in BOOKMAKER_PRIORITY
        else 99
    ))

    # Toujours utiliser tous les bookmakers disponibles (max 6) pour maximiser
    # les donnees de marche, en gardant les bookmakers WA en tete de liste
    combined = wa_only_sorted + [b for b in all_bms_sorted if b not in wa_only_sorted]
    return combined[:6]


def _get_best_bookmaker_title(bookmakers: List[Dict]) -> str:
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
    "combo": "Combiné (IA)",
}


def _label_for_market(market_key: str) -> str:
    return MARKET_LABELS_FR.get(market_key, market_key.upper().replace("_", " "))


def _outcome_label_fr(market_key: str, outcome_name: str,
                       point: Optional[float] = None) -> str:
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
    a = (pick_a or "").lower()
    b = (pick_b or "").lower()
    for kw_a, kw_b in FORBIDDEN_COMBINATIONS:
        if kw_a in a and kw_b in b:
            return True
        if kw_a in b and kw_b in a:
            return True
    return False


def _validate_picks_compatibility(picks: List[Dict]) -> List[Dict]:
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


# ─── Ajustement base sur les vraies stats (football-data.org) ───────────────

def _form_win_rate(form: str) -> Optional[float]:
    """Taux de victoire pondere (W=1, D=0.5, L=0) sur une chaine de forme
    reelle du type 'WWDLW'. None si aucune donnee."""
    if not form:
        return None
    wins = form.count("W")
    draws = form.count("D")
    return (wins + 0.5 * draws) / len(form)


def _real_stats_confidence_delta(real_stats: Optional[Dict], pick: str,
                                  home: str, away: str) -> float:
    """
    Calcule un ajustement de confiance (-6 a +6 points) base sur la VRAIE
    forme recente et le VRAI historique H2H (football-data.org), uniquement
    quand ces donnees existent reellement pour ce match — sinon retourne 0
    et le pick garde exactement sa confiance basee sur les cotes, comme
    avant. Volontairement plafonne et modeste : c'est un ajustement du
    raisonnement, pas un remplacement du calcul principal base sur les cotes
    des bookmakers, qui reste la source de verite pour la cote elle-meme.
    """
    if not real_stats:
        return 0.0

    delta = 0.0
    pick_l = (pick or "").lower()
    home_l, away_l = home.lower(), away.lower()
    favors_home = home_l in pick_l and away_l not in pick_l
    favors_away = away_l in pick_l and home_l not in pick_l

    if favors_home or favors_away:
        wr_home = _form_win_rate(real_stats.get("form_home") or "")
        wr_away = _form_win_rate(real_stats.get("form_away") or "")
        if wr_home is not None and wr_away is not None:
            form_gap = wr_home - wr_away  # positif si domicile en meilleure forme
            delta += form_gap * 8 if favors_home else -form_gap * 8

        h2h = real_stats.get("h2h")
        if h2h and h2h.get("matches_found", 0) >= 3:
            total = h2h["home_wins"] + h2h["draws"] + h2h["away_wins"]
            if total > 0:
                h2h_home_rate = h2h["home_wins"] / total
                h2h_away_rate = h2h["away_wins"] / total
                gap = h2h_home_rate - h2h_away_rate
                delta += gap * 6 if favors_home else -gap * 6

    return max(-6.0, min(6.0, delta))


# ─── Calcul probabilités ─────────────────────────────────────────────────────

def _implied_probs(outcomes: List[Dict]) -> Dict[str, float]:
    raw = {o["name"]: 1.0 / float(o["price"]) for o in outcomes if o.get("price")}
    total = sum(raw.values())
    if total == 0:
        return {}
    return {k: v / total for k, v in raw.items()}


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, float(value)))


def _stability_score(consensus_probs: Dict[Tuple[str, Optional[float]], List[float]],
                     pick_key: Tuple[str, Optional[float]]) -> float:
    """Mesure la stabilité inter-bookmakers de la probabilité retenue."""
    values = consensus_probs.get(pick_key, [])
    if not values:
        return 0.0
    if len(values) == 1:
        return 50.0
    stdev = statistics.pstdev(values)
    # 0% d'écart -> 100 ; 10 points ou plus -> 0.
    return _clamp(100.0 - (stdev * 100.0 * 10.0))


def _wp_score(probability: float, stability: float, edge: float,
              num_books: int, synthetic: bool = False) -> float:
    """Score WNPulse v8 séparant probabilité, stabilité et value.

    Ce score n'est PAS une probabilité de victoire. Il sert à classer les
    picks. La probabilité brute reste exposée séparément dans model_probability.
    """
    prob_score = _clamp(probability * 100.0)
    edge_score = _clamp(50.0 + edge * 5.0)  # 0% edge=50, +10%=100
    book_score = _clamp(50.0 + max(0, num_books - 1) * 12.5)
    score = (prob_score * 0.55) + (stability * 0.20) + (edge_score * 0.15) + (book_score * 0.10)
    if synthetic:
        score -= 7.0  # estimation IA : moins de certitude qu'un marché réellement coté
    return round(_clamp(score), 1)


def _analyze_market(market_key: str, bookmakers: List[Dict],
                     home: str, away: str,
                     min_conf: float = None, min_edge: float = None) -> Optional[Dict]:
    """Analyse un marché et retourne le meilleur pick."""
    min_conf = MIN_CONFIDENCE if min_conf is None else min_conf
    min_edge = MIN_EDGE if min_edge is None else min_edge

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

    if not pick_odds or pick_odds < MIN_ODDS or pick_odds > MAX_ODDS:
        return None

    best_odd_prob = 1.0 / pick_odds
    edge = (pick_prob - best_odd_prob) * 100
    # NOTE: le filtre "if edge < min_edge: return None" a ete retire.
    # Avec des bookmakers professionnels (Pinnacle, Betfair...), l'edge est
    # quasi toujours proche de 0 meme sur des picks tres fiables (consensus fort),
    # ce qui bloquait presque tous les picks. On garde edge uniquement pour
    # l'affichage et le tri (confidence + edge*0.3).

    stability = _stability_score(consensus_probs, pick_key)
    confidence = _wp_score(pick_prob, stability, edge, num_books, synthetic=False)

    if confidence < min_conf:
        return None

    label = "safe" if confidence >= 75 else ("value" if confidence >= 65 else "risky")

    return {
        "market": market_key,
        "market_label": _label_for_market(market_key),
        "pick": _outcome_label_fr(market_key, pick_name, pick_point),
        "pick_raw": pick_name,
        "pick_point": pick_point,
        "pick_odds": pick_odds,
        "confidence": round(confidence, 1),
        "model_probability": round(pick_prob * 100.0, 1),
        "stability_score": round(stability, 1),
        "wp_score": round(confidence, 1),
        "label": label,
        "edge": round(edge, 2),
        "num_books": num_books,
        "source": "bookmaker",  # cote reelle, edge exploitable
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
        # IMPORTANT : cette cote est FABRIQUEE a partir de "prob" elle-meme
        # (via 1/(prob*margin)) — ce n'est jamais une vraie cote de bookmaker.
        # Calculer un "edge" en comparant cette cote a la meme "prob" revient
        # a comparer le modele a lui-meme : le resultat est mathematiquement
        # toujours proche de -(marge), quel que soit le match, et NE REFLETE
        # AUCUNE vraie opportunite de marche. On le met donc a 0 (non
        # applicable) plutot que d'afficher un faux edge trompeur.
        # Estimation synthétique : on la pénalise volontairement.
        conf = _wp_score(prob, 60.0, 0.0, 0, synthetic=True)
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
            "model_probability": round(prob * 100.0, 1),
            "stability_score": 60.0,
            "wp_score": round(conf, 1),
            "label": "safe" if conf >= 75 else ("value" if conf >= 65 else "risky"),
            "edge": 0,  # non applicable — cote estimee, pas une vraie cote de marche
            "num_books": 0,
            "synthetic": True,
            "source": "estime_ia",  # a distinguer de "bookmaker" (cote reelle)
        }

    if sport_key.startswith("soccer"):
        for combo, prob in [("1X", p_home+p_draw), ("X2", p_draw+p_away), ("12", p_home+p_away)]:
            labels = {"1X": "Victoire domicile ou Nul",
                      "X2": "Nul ou Victoire extérieure",
                      "12": "Victoire domicile ou extérieure"}
            mk = _mk("syn_double_chance", combo, f"Double chance {combo} — {labels[combo]}", prob)
            if mk:
                out.append(mk)

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

        p_btts = min(0.85, 0.35 + 4 * p_home * p_away)
        if p_btts >= 0.55:
            mk = _mk("syn_btts", "yes", "Oui — Les 2 équipes marquent", p_btts)
            if mk:
                out.append(mk)
        elif p_btts < 0.45:
            mk = _mk("syn_btts", "no", "Non — Au moins 1 équipe ne marque pas", 1-p_btts)
            if mk:
                out.append(mk)

        p_over25 = min(0.80, 0.30 + 2.5 * (1 - p_draw) * (p_home + p_away) / 1.6)
        if p_over25 >= 0.55:
            mk = _mk("syn_over_25", "over", "Plus de 2.5 buts", p_over25)
            if mk:
                out.append(mk)
        elif p_over25 <= 0.42:
            mk = _mk("syn_over_25", "under", "Moins de 2.5 buts", 1-p_over25)
            if mk:
                out.append(mk)

        p_over15 = min(0.92, 0.72 + 0.2 * (max(p_home, p_away) - 0.4))
        if p_over15 >= 0.70:
            mk = _mk("syn_over_15", "over", "Plus de 1.5 buts", p_over15)
            if mk:
                out.append(mk)

        p_h1 = min(0.80, 0.45 + 0.3 * (1 - p_draw))
        if p_h1 >= 0.60:
            mk = _mk("syn_over_05_h1", "over", "But en 1ère mi-temps", p_h1)
            if mk:
                out.append(mk)

        p_u15_h2 = min(0.75, 0.40 + 0.25 * p_draw)
        if p_u15_h2 >= 0.50:
            mk = _mk("syn_under_15_h2", "under", "Moins de 1.5 buts en 2ème mi-temps", p_u15_h2)
            if mk:
                out.append(mk)

        if p_home >= 0.50:
            p_cs = min(0.55, p_home * 0.55)
            mk = _mk("syn_clean_sheet_home", "home_cs", f"{home} sans encaisser", p_cs, 1.08)
            if mk:
                out.append(mk)
        if p_away >= 0.50:
            p_cs = min(0.55, p_away * 0.55)
            mk = _mk("syn_clean_sheet_away", "away_cs", f"{away} sans encaisser", p_cs, 1.08)
            if mk:
                out.append(mk)

        tightness = 1 - abs(p_home - p_away)
        p_cards_35 = 0.35 + tightness * 0.35
        p_cards_45 = 0.20 + tightness * 0.25
        if p_cards_35 >= 0.55:
            mk = _mk("syn_cards_over_35", "over", "Plus de 3.5 cartons jaunes", p_cards_35, 1.06)
            if mk:
                out.append(mk)
        if p_cards_45 >= 0.50:
            mk = _mk("syn_cards_over_45", "over", "Plus de 4.5 cartons jaunes", p_cards_45, 1.08)
            if mk:
                out.append(mk)

        attack = 1 - p_draw
        p_c95 = 0.45 + attack * 0.35
        p_c105 = 0.30 + attack * 0.30
        if p_c95 >= 0.60:
            mk = _mk("syn_corners_over_95", "over", "Plus de 9.5 corners", p_c95, 1.06)
            if mk:
                out.append(mk)
        if p_c105 >= 0.50:
            mk = _mk("syn_corners_over_105", "over", "Plus de 10.5 corners", p_c105, 1.08)
            if mk:
                out.append(mk)

        if p_home > p_away and p_home >= 0.42:
            p_fts = min(0.72, p_home * 0.85 + 0.1)
            mk = _mk("syn_first_to_score_home", "home", f"{home} marque en premier", p_fts)
            if mk:
                out.append(mk)
        elif p_away > p_home and p_away >= 0.42:
            p_fts = min(0.72, p_away * 0.85 + 0.1)
            mk = _mk("syn_first_to_score_away", "away", f"{away} marque en premier", p_fts)
            if mk:
                out.append(mk)

    elif sport_key.startswith("basketball"):
        p_over = min(0.75, 0.50 + (1 - p_draw) * 0.25)
        mk = _mk("syn_nba_over", "over", "Plus de points (match ouvert)", p_over)
        if mk:
            out.append(mk)
        if p_home > p_away + 0.10:
            mk = _mk("syn_nba_spread", "home", f"{home} favori (-points)", p_home * 0.85)
            if mk:
                out.append(mk)
        elif p_away > p_home + 0.10:
            mk = _mk("syn_nba_spread", "away", f"{away} favori (-points)", p_away * 0.85)
            if mk:
                out.append(mk)

    elif sport_key.startswith("icehockey"):
        p_over = min(0.72, 0.45 + (1 - p_draw) * 0.3)
        mk = _mk("syn_hockey_over", "over", "Plus de 5.5 buts", p_over)
        if mk:
            out.append(mk)

    elif sport_key.startswith("tennis"):
        fav_prob = max(p_home, p_away)
        if fav_prob >= 0.60:
            p_u25 = min(0.78, fav_prob * 0.82)
            fav_name = max(probs, key=probs.get) if probs else home
            mk = _mk("syn_tennis_under_sets", "under",
                     f"Victoire rapide en 2 sets ({fav_name})", p_u25)
            if mk:
                out.append(mk)

    return out


# ─── Picks combinés ────────────────────────────────────────────────────────

def _build_combined_pick(market_results: List[Dict]) -> Optional[Dict]:
    """
    Quand le meilleur pick simple a une cote trop basse (< COMBO_TARGET_MIN_ODDS),
    tente de le combiner avec le MEILLEUR 2eme marche compatible du meme match
    (celui qui maximise la confiance combinee, pas le premier trouve) pour
    obtenir une cote plus interessante sans sacrifier excessivement la fiabilite.
    Ex: "Victoire Juventus & Plus de 2.5 buts".

    Ne combine QUE si :
    - le pick principal est deja raisonnablement fiable (>= 62% seul)
    - la meilleure combinaison possible reste au-dessus d'un plancher de
      confiance correct (>= 52%)
    Sinon, retourne None et le pick simple est garde tel quel — pas de
    combinaison forcee qui degraderait un bon pick en "risque".
    """
    if not market_results:
        return None

    ranked = sorted(market_results, key=lambda x: x["confidence"], reverse=True)
    primary = ranked[0]

    if primary["pick_odds"] >= COMBO_TARGET_MIN_ODDS:
        return None  # cote deja suffisante, pas besoin de combiner

    if primary["confidence"] < 62:
        return None  # pick principal pas assez solide pour justifier une combinaison

    best_candidate = None
    best_combined_conf = 0.0

    for secondary in ranked[1:]:
        if secondary["market"] == primary["market"]:
            continue
        if secondary["confidence"] < COMBO_MIN_CONFIDENCE:
            continue
        if _are_contradictory(primary["pick"], secondary["pick"]):
            continue

        combined_odds = round(primary["pick_odds"] * secondary["pick_odds"], 2)
        if combined_odds < COMBO_TARGET_MIN_ODDS or combined_odds > MAX_ODDS * 1.5:
            continue

        # Probabilité naïve corrigée par corrélation : les marchés du même
        # match sont souvent dépendants. On pénalise donc les combinaisons
        # corrélées au lieu de multiplier aveuglément les confidences.
        same_match = True
        combined_prob = ((primary.get("model_probability", primary["confidence"]) / 100.0) *
                         (secondary.get("model_probability", secondary["confidence"]) / 100.0))
        correlation_penalty = 0.0
        if same_match:
            correlation_penalty = 0.15
        if primary.get("market") == secondary.get("market"):
            correlation_penalty += 0.10
        combined_conf = round(_clamp((combined_prob * (1.0 - correlation_penalty)) * 100.0), 1)
        if combined_conf > best_combined_conf:
            best_combined_conf = combined_conf
            best_candidate = (secondary, combined_odds, combined_conf)

    if not best_candidate or best_combined_conf < 52:
        return None  # aucune combinaison assez fiable — on garde le pick simple

    secondary, combined_odds, combined_conf = best_candidate

    return {
        "market": "combo",
        "market_label": "Combiné (IA)",
        "pick": f"{primary['pick']} & {secondary['pick']}",
        "pick_raw": f"{primary.get('pick_raw','')}+{secondary.get('pick_raw','')}",
        "pick_point": None,
        "pick_odds": combined_odds,
        "confidence": combined_conf,
        # Seuils de label adaptes : une confiance combinee (produit de 2
        # probabilites) est naturellement plus basse qu'un pick simple, meme
        # pour une tres bonne combinaison — les seuils sont donc plus bas
        # que pour un pick simple (safe >=62, value >=50) pour refleter ca
        # honnetement sans afficher "risque" a tort.
        "label": "safe" if combined_conf >= 62 else ("value" if combined_conf >= 50 else "risky"),
        "edge": round((primary.get("edge", 0) + secondary.get("edge", 0)) / 2, 2),
        "num_books": min(primary.get("num_books", 0), secondary.get("num_books", 0)),
        "is_combo": True,
        "combo_legs": [primary["pick"], secondary["pick"]],
        "source": "bookmaker",  # construit uniquement a partir de 2 marches reels
    }


# ─── Deep reasoning ──────────────────────────────────────────────────────────

def _deep_reasoning(match: Dict, home: str, away: str,
                     probs: Dict[str, float], real_stats: Optional[Dict] = None) -> Dict:
    seed_src = f"{match.get('id','')}|{home}|{away}"

    def _r(k):
        v = int(hashlib.sha1(f"{seed_src}::{k}".encode()).hexdigest()[:8], 16)
        return (v % 1000) / 1000.0

    p_home = probs.get(home, 0.33) or 0.33
    p_away = probs.get(away, 0.33) or 0.33
    seed = int(hashlib.sha1(seed_src.encode()).hexdigest()[:12], 16)

    # ─── H2H : reel si disponible (football-data.org), sinon estime ─────────
    real_h2h = (real_stats or {}).get("h2h")
    if real_h2h and real_h2h.get("matches_found", 0) > 0:
        h2h_home = real_h2h["home_wins"]
        h2h_draws = real_h2h["draws"]
        h2h_away = real_h2h["away_wins"]
        h2h_is_real = True
    else:
        h2h_home = round(3 + p_home * 5 + _r("h2h") * 2)
        h2h_draws = max(0, 10 - h2h_home - round(_r("draws") * 4 + 1))
        h2h_away = max(0, 10 - h2h_home - h2h_draws)
        h2h_is_real = False

    def _form(prob):
        opts = ["W", "W", "W", "D", "L", "L", "D", "W"]
        return "".join([
            "W" if _r(f"fh{i}") < (0.35 + prob * 0.4)
            else opts[int(_r(f"fh{i}") * len(opts))]
            for i in range(5)
        ])

    # ─── Forme recente : reelle si disponible, sinon estimee ────────────────
    real_form_home = (real_stats or {}).get("form_home") or ""
    real_form_away = (real_stats or {}).get("form_away") or ""
    if real_form_home:
        form_h = real_form_home
    else:
        form_h = _form(p_home)
    if real_form_away:
        form_a = real_form_away
    else:
        form_a = _form(p_away)
    form_is_real = bool(real_form_home or real_form_away)

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
    data_note = (
        " (forme/H2H reels — football-data.org)"
        if (h2h_is_real or form_is_real) else ""
    )
    summary = (
        f"{fav} est favori ({int(fav_prob*100)}% modèle IA){data_note}. "
        f"Forme récente : {home} {form_h} / {away} {form_a}. "
        f"H2H {'reel' if h2h_is_real else '10 derniers (estime)'} : "
        f"{h2h_home}V-{h2h_draws}N-{h2h_away}D. "
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
        "estimated_ai": not (h2h_is_real or form_is_real),
        "real_data_used": h2h_is_real or form_is_real,
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


def analyze_match(match: Dict, real_stats_map: Optional[Dict] = None) -> Dict:
    """Analyse complète d'un match — retourne le meilleur pick (simple ou combiné).

    real_stats_map (optionnel) : cache pre-charge de vraies stats
    football-data.org (forme + H2H reels), fourni par server.py via
    stats_service.get_real_stats_map(). Quand une vraie donnee existe pour
    ce match, elle AJUSTE la confiance de chaque marche avant le choix du
    meilleur pick (voir _real_stats_confidence_delta) — sinon le calcul
    reste identique a avant, base uniquement sur les cotes.
    """
    bookmakers = _filtered_bookmakers(match)
    home = match.get("home_team", "")
    away = match.get("away_team", "")
    sport_key = match.get("sport_key", "") or ""
    real_stats = lookup_real_stats(real_stats_map, home, away) if real_stats_map else None

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

    market_keys = set()
    for bm in bookmakers:
        for m in bm.get("markets", []):
            if m.get("key"):
                market_keys.add(m["key"])

    market_results = []
    for mk in ["h2h", "totals", "spreads", "btts", "draw_no_bet",
               "double_chance", "h2h_h1", "totals_h1", "totals_h2"]:
        if mk not in market_keys:
            continue
        res = _analyze_market(mk, bookmakers, home, away)
        if res:
            market_results.append(res)

    real_market_keys = {r["market"] for r in market_results}
    for syn in _synthetic_markets(bookmakers, home, away, sport_key):
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

    # ─── Ajustement base sur les vraies stats, AVANT le choix du pick ───────
    # C'est le changement cle : auparavant _deep_reasoning tournait apres
    # coup, juste pour l'affichage, sans influencer quel pick est choisi.
    # Ici, quand une vraie donnee forme/H2H existe, elle modifie directement
    # la confiance de chaque marche avant le tri — donc le choix du meilleur
    # pick peut reellement changer si les vraies stats contredisent ou
    # renforcent ce que les cotes seules suggeraient.
    if real_stats:
        for r in market_results:
            delta = _real_stats_confidence_delta(real_stats, r.get("pick", ""), home, away)
            if delta:
                r["confidence"] = round(max(0, min(100, r["confidence"] + delta)), 1)
                r["real_stats_adjustment"] = round(delta, 1)
                r["label"] = ("safe" if r["confidence"] >= 72
                              else ("value" if r["confidence"] >= 63 else "risky"))

    # ─── Tri : marches REELS toujours prioritaires sur les marches estimes ──
    # Avant, un marche synthetique (cote fabriquee, edge non applicable)
    # pouvait devancer un vrai marche de bookmaker si sa confiance affichee
    # etait plus haute — c'est ce qui produisait des picks a cote fictive
    # (ex: "Plus de 2.5 buts @ 1.19" invente) choisis comme pick principal
    # alors qu'un vrai marche jouable existait pour ce match. Desormais, les
    # marches "bookmaker" (cote reelle, edge exploitable) passent toujours
    # avant les marches "estime_ia", quelle que soit leur confiance relative.
    def _source_priority(x):
        return 0 if x.get("source") == "bookmaker" else 1

    market_results.sort(
        key=lambda x: (_source_priority(x), -(x["confidence"] + max(0, x["edge"]) * 0.8))
    )

    validated = _validate_picks_compatibility(market_results)
    best = validated[0] if validated else market_results[0]

    # Tentative de pick combine — uniquement a partir de marches REELS, pour
    # ne jamais combiner une cote fabriquee (estime_ia) avec une vraie cote
    # de bookmaker, ce qui produirait une cote combinee sans aucun sens.
    real_only = [r for r in (validated if validated else market_results)
                 if r.get("source") == "bookmaker"]
    combo = _build_combined_pick(real_only) if real_only else None
    if combo:
        best = combo
        if combo not in market_results:
            market_results.insert(0, combo)

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
        "model_probability": best.get("model_probability", best["confidence"]),
        "stability_score": best.get("stability_score", 0),
        "wp_score": best.get("wp_score", best["confidence"]),
        "model_version": MODEL_VERSION,
        "label": best["label"],
        "implied_probs": implied,
        "edge": best.get("edge", 0),
        "num_books": best.get("num_books", 0),
        "market": best["market"],
        "market_label": best["market_label"],
        "is_combo": best.get("is_combo", False),
        "markets": market_results,
        "is_live": _is_live_match(match),
        "is_finished": _is_finished_match(match),
        "bookmakers_used": [
            {"key": bm.get("key"), "title": bm.get("title")}
            for bm in bookmakers
        ],
        "best_bookmaker": best_bm,
        "reasoning": _deep_reasoning(match, home, away,
                                      {k: v/100 for k, v in implied.items()},
                                      real_stats=real_stats)
                     if implied else None,
    }


def analyze_all(matches: List[Dict], real_stats_map: Optional[Dict] = None) -> List[Dict]:
    return [analyze_match(m, real_stats_map=real_stats_map) for m in matches if m.get("bookmakers")]


def find_value_bets(matches: List[Dict], min_edge: float = 3.0, limit: int = 30) -> List[Dict]:
    """
    Detecte les VRAIS value bets : picks ou l'edge (probabilite consensus
    moins probabilite implicite de la meilleure cote) est POSITIF et
    significatif. Contrairement a /predictions/top qui classe par confiance,
    ici seul un edge >= min_edge qualifie un pick — un pick a 90% de
    confiance mais edge negatif n'est PAS un value bet, juste un favori net
    dont la cote ne compense pas le risque.
    """
    out = []
    for m in matches:
        analyzed = analyze_match(m)
        for mk in analyzed.get("markets", []):
            # Exclusion stricte des marches estimes (source="estime_ia") : leur
            # cote est fabriquee a partir du modele lui-meme, donc leur edge
            # ne reflete jamais une vraie opportunite de marche — seuls les
            # marches "bookmaker" (cote reelle) peuvent etre un vrai value bet.
            if mk.get("source") != "bookmaker":
                continue
            edge = mk.get("edge", 0)
            if edge < min_edge:
                continue
            if not mk.get("pick_odds"):
                continue
            implied_prob = round(100 / mk["pick_odds"], 1)
            our_prob = round(implied_prob + edge, 1)
            out.append({
                "sport_title": analyzed.get("sport_title"),
                "home_team": analyzed.get("home_team"),
                "away_team": analyzed.get("away_team"),
                "commence_time": analyzed.get("commence_time"),
                "market_label": mk.get("market_label"),
                "pick": mk.get("pick"),
                "pick_odds": mk["pick_odds"],
                "our_prob": our_prob,
                "implied_prob": implied_prob,
                "edge": round(edge, 1),
            })
    out.sort(key=lambda b: b["edge"], reverse=True)
    return out[:limit]


def top_predictions(matches: List[Dict], limit: int = 10,
                     real_stats_map: Optional[Dict] = None) -> List[Dict]:
    preds = analyze_all(matches, real_stats_map=real_stats_map)
    valid = [p for p in preds if p.get("pick") and p.get("confidence", 0) >= MIN_CONFIDENCE
             and p.get("pick_odds", 0) >= 1.0]
    # Poids sur l'edge augmente (0.3 -> 0.8) : privilegie les picks a vraie
    # valeur plutot que juste les plus "surs" en apparence, pour ameliorer
    # le ROI reel plutot que seulement le taux de reussite affiche.
    valid.sort(key=lambda p: p.get("wp_score", p["confidence"]) + max(0, p.get("edge", 0)) * 0.25,
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
    correlation_penalty = 0.0
    seen_matches = set()
    seen_markets = set()
    for p in legs:
        total_odds *= (p.get("pick_odds") or 1)
        combined_prob *= ((p.get("model_probability", p.get("confidence", 0)) or 0) / 100)
        mid = p.get("match_id")
        market = p.get("market")
        if mid in seen_matches:
            correlation_penalty += 0.15
        if market in seen_markets:
            correlation_penalty += 0.05
        if mid:
            seen_matches.add(mid)
        if market:
            seen_markets.add(market)
    combined_prob *= max(0.35, 1.0 - min(correlation_penalty, 0.50))
    return {
        "legs": legs,
        "total_odds": round(total_odds, 2),
        "avg_confidence": round(
            statistics.mean([p.get("confidence", 0) for p in legs]), 1),
        "combined_probability": round(combined_prob * 100, 1),
        "correlation_penalty": round(correlation_penalty, 2),
        "model_version": MODEL_VERSION,
    }


def _flatten_market_picks(matches: List[Dict]) -> List[Dict]:
    picks = []
    for m in matches:
        if not _is_upcoming(m.get("commence_time", "")):
            continue
        analyzed = analyze_match(m)
        for mk in analyzed.get("markets", []):
            if not mk.get("pick_odds"):
                continue
            if mk.get("pick_odds", 0) < 1.0:
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
                "model_probability": mk.get("model_probability", mk["confidence"]),
                "stability_score": mk.get("stability_score", 0),
                "wp_score": mk.get("wp_score", mk["confidence"]),
                "source": mk.get("source", "bookmaker"),
                "label": mk["label"],
                "edge": mk.get("edge", 0),
                "market": mk["market"],
                "market_label": mk["market_label"],
                "is_live": False,
                "best_bookmaker": analyzed.get("best_bookmaker", "1xBet"),
            })
    return picks


def _pick_diversified_multi(pool: List[Dict], legs: int) -> List[Dict]:
    selected, used_matches = [], set()
    for p in pool:
        mid = p.get("match_id")
        if mid in used_matches:
            continue
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
                min_confidence: float = None) -> Dict:
    min_confidence = MIN_CONFIDENCE if min_confidence is None else min_confidence
    picks = [p for p in _flatten_market_picks(matches)
             if p["confidence"] >= min_confidence]
    picks.sort(key=lambda p: p["confidence"], reverse=True)
    selected = _pick_diversified_multi(picks, legs)
    return {**_stats(selected),
            "generated_at": datetime.now(timezone.utc).isoformat()}


def build_multi_combos(matches: List[Dict]) -> Dict:
    all_picks = _flatten_market_picks(matches)

    safe_pool = sorted(
        [p for p in all_picks if p["confidence"] >= 72],
        key=lambda p: p["confidence"], reverse=True
    )
    safe_legs = _pick_diversified_multi(safe_pool, 2)

    bal_pool = sorted(
        [p for p in all_picks if 62 <= p["confidence"] <= 80],
        key=lambda p: (p["confidence"] * 0.5 + (p["pick_odds"] or 1) * 7
                       + max(0, p["edge"]) * 3),
        reverse=True
    )
    bal_legs = _pick_diversified_multi(bal_pool, 3)

    jack_pool = sorted(
        [p for p in all_picks
         if p["confidence"] >= MIN_CONFIDENCE and (p.get("pick_odds") or 0) >= 1.4],
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

    by_sport: Dict[str, List[Dict]] = {}
    for p in all_picks:
        sk = (p.get("sport_key") or "other").split("_")[0]
        by_sport.setdefault(sk, []).append(p)

    best_per_sport = []
    for sport, picks in by_sport.items():
        picks.sort(key=lambda x: x["confidence"] + max(0, x.get("edge", 0)) * 0.8,
                   reverse=True)
        if picks:
            best_per_sport.append(picks[0])

    super_safe_pool = sorted(
        [p for p in best_per_sport if p["confidence"] >= 72],
        key=lambda p: p["confidence"], reverse=True
    )
    super_safe_legs = _pick_diversified_multi(super_safe_pool, 2)

    super_bal_pool = sorted(
        [p for p in best_per_sport if p["confidence"] >= 65],
        key=lambda p: p["confidence"] + (p.get("pick_odds", 1) or 1) * 5,
        reverse=True
    )
    super_bal_legs = _pick_diversified_multi(super_bal_pool, 3)

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

def build_ultra_safe_combo(matches: List[Dict], min_legs: int = 2, max_legs: int = 3) -> Dict:
    """
    Niveau Ultra-Safe : combine 2 a 3 MATCHS DIFFERENTS (pas 2 marches du
    meme match), avec un vrai objectif de cote combinee (>= 1.5), pas
    seulement la confiance la plus haute. Avant, le tri par pure confiance
    pouvait selectionner des favoris a cote 1.02-1.08, donnant un combine
    a cote ridicule (~1.10) ou souvent vide si le seuil de confiance etait
    trop strict alors que des dizaines de matchs se jouaient.

    Regles :
    - Seuil de confiance avec repli progressif (80% -> 75% -> 70% minimum
      absolu) — suffisamment eleve pour rester "surs", mais pas au point
      d'exclure presque tous les picks disponibles
    - Parmi les picks au-dessus du seuil, priorise ceux dont la cote est
      la plus proche d'un objectif individuel (pour atteindre ~1.5-3.5 de
      cote totale sur l'ensemble du combine), au lieu de prendre les 2-3
      cotes les plus faibles par pure confiance
    - Exclut les picks "combo" (2 marches fusionnes dans un match) — on
      veut des favoris nets individuels, pas des probabilites jointes
    - Un seul pick par match, diversifie sur plusieurs matchs
    - Rappel de risque toujours inclus : aucun pari sportif n'est garanti,
      quel que soit le niveau de confiance affiche.
    """
    MIN_TOTAL_ODDS = 1.5
    TARGET_TOTAL_ODDS = 2.5  # objectif "audacieux" mais raisonnable

    all_picks = _flatten_market_picks(matches)
    single_picks = [p for p in all_picks if p.get("market") != "combo"]

    legs: List[Dict] = []
    used_threshold = None

    for threshold in [80, 75, 70]:
        pool = [p for p in single_picks if p["confidence"] >= threshold]
        if len(pool) < min_legs:
            continue

        # Vise une cote individuelle moyenne qui, une fois combinee sur
        # max_legs picks, approche TARGET_TOTAL_ODDS (racine n-ieme)
        target_per_leg = TARGET_TOTAL_ODDS ** (1.0 / max_legs)

        def _score(p):
            odds = p.get("pick_odds") or 1
            proximity = 1.0 / (1.0 + abs(odds - target_per_leg))
            return proximity * (0.4 + p["confidence"] / 200)

        ordered = sorted(pool, key=_score, reverse=True)
        candidate_legs = _pick_diversified_multi(ordered, max_legs)

        if len(candidate_legs) < min_legs:
            continue

        total_odds = 1.0
        for leg in candidate_legs:
            total_odds *= leg.get("pick_odds") or 1

        # Si la cote totale n'atteint pas le minimum avec max_legs picks,
        # tente d'ajouter un leg de plus (jusqu'a max_legs+1, plafonne a 4)
        # en choisissant parmi les picks restants celui qui rapproche le
        # plus la cote totale de MIN_TOTAL_ODDS sans creer de contradiction.
        if total_odds < MIN_TOTAL_ODDS and len(candidate_legs) < min(max_legs + 1, 4):
            used_match_ids = {l["match_id"] for l in candidate_legs}
            remaining = [p for p in ordered if p["match_id"] not in used_match_ids]
            for extra in remaining:
                if any(_are_contradictory(extra["pick"], l["pick"]) for l in candidate_legs):
                    continue
                candidate_legs.append(extra)
                total_odds *= extra.get("pick_odds") or 1
                break

        if total_odds >= MIN_TOTAL_ODDS:
            legs = candidate_legs
            used_threshold = threshold
            break
        elif not legs:
            # Garde le meilleur essai trouve meme si sous le seuil de cote,
            # au cas ou aucun seuil de confiance ne permette d'atteindre 1.5
            legs = candidate_legs
            used_threshold = threshold

    now = datetime.now(timezone.utc).isoformat()

    if len(legs) < min_legs:
        return {
            **_stats([]),
            "tier": "ultra_safe",
            "label": "🛡️ Ultra-Safe",
            "tagline": "Pas assez de matchs fiables disponibles aujourd'hui",
            "description": (
                "Aucun combine Ultra-Safe genere pour le moment : pas assez "
                "de picks fiables disponibles sur les matchs actuels. "
                "Reviens plus tard ou consulte les autres niveaux."
            ),
            "confidence_threshold_used": None,
            "generated_at": now,
        }

    final_odds = 1.0
    for leg in legs:
        final_odds *= leg.get("pick_odds") or 1
    odds_note = (
        "objectif de cote atteint" if final_odds >= MIN_TOTAL_ODDS
        else "cote limitee par le nombre de favoris nets disponibles aujourd'hui"
    )

    return {
        **_stats(legs),
        "tier": "ultra_safe",
        "label": "🛡️ Ultra-Safe",
        "tagline": f"{len(legs)} matchs, cote {round(final_odds, 2)} ({odds_note})",
        "description": (
            f"Combine de {len(legs)} matchs differents, favoris fiables "
            f"(confiance {used_threshold}%+) selectionnes pour viser une "
            f"cote combinee interessante plutot que les picks les plus surs "
            f"mais les moins payants. IMPORTANT : meme un favori net peut "
            f"perdre — aucun pari sportif n'est garanti a 100%. Ce niveau "
            f"reduit le risque, il ne l'elimine pas."
        ),
        "confidence_threshold_used": used_threshold,
        "generated_at": now,
    }


TODAY_TIER_TARGETS = [
    ("sure", "Sûr", "Cotes 1.5 → 3", 1.5, 3.0, 2, 65,
     "Petite cote, forte probabilité."),
    ("booster", "Booster", "Cotes 3 → 8", 3.0, 8.0, 3, 60,
     "Bon rapport risque/gain."),
    ("extra", "Extra", "Cotes 8 → 20", 8.0, 20.0, 4, 60,
     "Combiné signature WinPulse."),
    ("jackpot", "Jackpot", "Cotes 20 → 100+", 20.0, 200.0, 5, 60,
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
    today_matches = [m for m in matches if _is_today(m.get("commence_time", ""))]
    all_picks_today = _flatten_market_picks(today_matches)

    # Ultra-Safe est calcule sur les MEMES matchs du jour que le reste de
    # cet onglet — pas sur une fenetre de 7 jours comme avant.
    ultra_safe = build_ultra_safe_combo(today_matches)

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
        "ultra_safe": ultra_safe,
        "families": per_family,
    }
