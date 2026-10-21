"""
WNPulse Prediction Engine v8.2
- Analyse uniquement des marches reels fournis par les bookmakers
- Plusieurs propositions par match avec probabilite de consensus et score de selection
- Pick principal simple ; combine uniquement comme suggestion secondaire si suffisamment solide
- Filtre "edge minimum" retiré du gate de qualité (bookmakers pro = edge quasi nul,
  bloquait presque tous les picks). Le vrai filtre de qualité reste MIN_CONFIDENCE.
- Anti-contradiction système complet
- Organisation par championnat
- Combos generaux conserves, mais uniquement a partir de picks reels
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

# ─── Seuils qualité ───────────────────────────────────────────────────────────
MIN_ODDS = 1.15          # Redescendu a 1.15 sur demande explicite (volume/attractivite prioritaires sur le ROI mesure ; decision assumee malgre le ROI negatif observe sur cette plage dans le track record reel)
MAX_ODDS = 8.00          # Cote maximum pour picks principaux
MIN_CONFIDENCE = 60.0    # Seuil minimum de score pour publication
MIN_EDGE = 1.0           # Edge affiche/tri; le filtre Value Bets reste distinct
MIN_BOOKMAKERS = 1       # Minimum pour analyser un marche disponible
MIN_BOOKMAKERS_STRONG = 2     # minimum pour une recommandation forte
MODEL_VERSION = "8.2"
CALIBRATION_MIN_SAMPLE = 30

# ─── Seuils de label et ciblage de "bonnes cotes" ────────────────────────────
# Recalibres pour donner davantage de picks "safe" a MIN_ODDS=1.15 (avant,
# 75/65 etait pense pour une distribution de cotes plus hautes). Un pick
# reste "safe" seulement si sa confiance est reellement elevee — ce n'est
# pas un abaissement artificiel de l'exigence, juste un ajustement coherent
# avec le nouveau MIN_ODDS.
SAFE_THRESHOLD = 70.0
VALUE_THRESHOLD = 60.0

# Plage de cotes jugee "interessante" (ni symbolique ni exageree) : parmi
# plusieurs marches surs pour le meme match, celui dont la cote tombe dans
# cette fourchette est prefere au marche le plus sur mais le moins payant
# (ex: favori ecrasant a 1.15) — objectif : moins de "petites cotes sans
# interet" affichees comme pick principal quand une alternative fiable et
# mieux payee existe pour le meme match.
GOOD_ODDS_MIN = 1.50
GOOD_ODDS_MAX = 4.00

MAX_PICKS_PER_DAY = 15
MAX_PICKS_PER_MATCH = 3

# Cible pour les picks combinés (quand la cote simple est trop basse)
COMBO_TARGET_MIN_ODDS = 1.50   # En dessous de ça, on tente de combiner
COMBO_MIN_CONFIDENCE = 70.0    # Seuil légèrement plus souple pour le 2ème pick du combo


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
    """Analyse UN vrai marche bookmaker.

    Important : aucune cote ni probabilite n'est inventee ici.
    Chaque proposition vient d'un marche reel fourni par les bookmakers.
    Le taux affiche est une probabilite de consensus, pas une garantie.
    """
    min_conf = MIN_CONFIDENCE if min_conf is None else min_conf

    consensus_probs: Dict[Tuple[str, Optional[float]], List[float]] = {}
    best_odds: Dict[Tuple[str, Optional[float]], float] = {}
    num_books = 0

    for bm in bookmakers:
        for m in bm.get("markets", []):
            if m.get("key") != market_key:
                continue
            outcomes = m.get("outcomes", []) or []
            ip = _implied_probs(outcomes)
            if not ip:
                continue
            num_books += 1
            for o in outcomes:
                try:
                    price = float(o.get("price", 0))
                except (TypeError, ValueError):
                    continue
                if price <= 1.0:
                    continue
                key = (o.get("name"), o.get("point"))
                p = ip.get(o.get("name"), 0.0)
                consensus_probs.setdefault(key, []).append(p)
                if price > best_odds.get(key, 0):
                    best_odds[key] = price

    if not consensus_probs or num_books < MIN_BOOKMAKERS:
        return None

    # Median plus mean: la mediane limite l'effet d'un bookmaker aberrant.
    consensus = {k: statistics.median(v) for k, v in consensus_probs.items()}
    pick_key = max(consensus, key=consensus.get)
    pick_prob = consensus[pick_key]
    pick_odds = best_odds.get(pick_key)
    pick_name, pick_point = pick_key

    if not pick_odds or pick_odds < MIN_ODDS or pick_odds > MAX_ODDS:
        return None

    best_odd_prob = 1.0 / pick_odds
    edge = (pick_prob - best_odd_prob) * 100.0
    stability = _stability_score(consensus_probs, pick_key)

    # IMPORTANT : confidence = probabilite de consensus, pas un score
    # marketing. Les autres signaux servent au classement via selection_score.
    # Ainsi un pick ne peut pas afficher 75% simplement parce qu'il a une cote
    # basse ou parce qu'il existe chez plusieurs bookmakers.
    confidence = _clamp(pick_prob * 100.0)

    if confidence < min_conf:
        return None

    label = "safe" if confidence >= SAFE_THRESHOLD else (
        "value" if confidence >= VALUE_THRESHOLD else "risky"
    )

    # Mesure de domination : utile pour eviter qu'un marche tres serre soit
    # presente comme un choix evident.
    ordered = sorted(consensus.values(), reverse=True)
    dominance = ((ordered[0] - ordered[1]) * 100.0) if len(ordered) > 1 else 100.0
    selection_score = (
        confidence * 0.60 +
        stability * 0.20 +
        min(100.0, 50.0 + max(0, num_books - 1) * 10.0) * 0.10 +
        _clamp(50.0 + edge * 4.0) * 0.10 +
        min(10.0, max(0.0, dominance)) * 0.40
    )

    return {
        "market": market_key,
        "market_label": _label_for_market(market_key),
        "pick": _outcome_label_fr(market_key, pick_name, pick_point),
        "pick_raw": pick_name,
        "pick_point": pick_point,
        "pick_odds": round(pick_odds, 2),
        "confidence": round(confidence, 1),
        "model_probability": round(pick_prob * 100.0, 1),
        "estimated_win_probability": round(pick_prob * 100.0, 1),
        "probability_source": "bookmaker_consensus",
        "stability_score": round(stability, 1),
        "dominance_score": round(max(0.0, dominance), 1),
        "selection_score": round(selection_score, 1),
        "wp_score": round(confidence, 1),
        "label": label,
        "edge": round(edge, 2),
        "num_books": num_books,
        "source": "bookmaker",
        "synthetic": False,
        "strong_candidate": bool(
            num_books >= MIN_BOOKMAKERS_STRONG and confidence >= SAFE_THRESHOLD
        ),
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
    """Desactive volontairement les marches synthetiques.

    Ancien comportement : fabrication de probabilites/cotes Over, BTTS,
    corners, cartons, etc. a partir du seul 1X2. Ces marches pouvaient donner
    l'impression que le moteur avait observe une vraie cote alors qu'elle
    etait calculee par une formule. Une analyse WNPulse ne peut proposer qu'un
    marche reellement fourni par les bookmakers.
    """
    return []


# ─── Picks combinés


# ─── Deep reasoning ──────────────────────────────────────────────────────────

def _deep_reasoning(match: Dict, home: str, away: str,
                     probs: Dict[str, float], real_stats: Optional[Dict] = None) -> Dict:
    """Retourne uniquement des donnees reelles disponibles.

    L'ancienne version fabriquait deterministiquement forme, H2H, xG,
    absences, arbitre et meteo quand les donnees reelles manquaient. Cela
    pouvait donner l'illusion d'une analyse specifique au match alors que ces
    informations n'etaient pas observees. Cette version ne fabrique plus rien.
    """
    stats = real_stats or {}
    real_data_used = bool(stats.get("real_data_used")) and not bool(stats.get("estimated_ai"))

    h2h = stats.get("h2h") if real_data_used else None
    form_home = stats.get("form_home") if real_data_used else None
    form_away = stats.get("form_away") if real_data_used else None

    summary_parts = []
    if probs:
        top = max(probs.items(), key=lambda kv: kv[1])
        summary_parts.append(
            f"Consensus bookmaker : {top[0]} autour de {top[1] * 100:.1f}%"
        )
    if form_home or form_away:
        summary_parts.append(
            f"Forme reelle disponible : {home} {form_home or 'N/D'} / "
            f"{away} {form_away or 'N/D'}"
        )
    if h2h and h2h.get("matches_found", 0) > 0:
        summary_parts.append(
            f"H2H reel : {h2h.get('home_wins', 0)}V-"
            f"{h2h.get('draws', 0)}N-{h2h.get('away_wins', 0)}D"
        )
    if not real_data_used:
        summary_parts.append(
            "Aucune statistique externe verifiee disponible : le moteur "
            "ne les invente pas et s'appuie uniquement sur les marches reels."
        )

    return {
        "h2h_last_10": ({
            "home_wins": h2h.get("home_wins", 0),
            "draws": h2h.get("draws", 0),
            "away_wins": h2h.get("away_wins", 0),
        } if h2h else None),
        "form_last_5": {"home": form_home, "away": form_away},
        "xg": stats.get("xg") if real_data_used else None,
        "home_record": stats.get("home_record") if real_data_used else None,
        "away_record": stats.get("away_record") if real_data_used else None,
        "key_absences": stats.get("key_absences") if real_data_used else None,
        "referee_yellows_avg": stats.get("referee_yellows_avg") if real_data_used else None,
        "weather": stats.get("weather") if real_data_used else None,
        "summary": " ".join(summary_parts),
        "estimated_ai": not real_data_used,
        "real_data_used": real_data_used,
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


def _market_sort_key(x: Dict) -> Tuple[float, float, float, float]:
    return (
        float(x.get("selection_score", x.get("confidence", 0))),
        float(x.get("confidence", 0)),
        float(x.get("edge", 0)),
        float(x.get("pick_odds", 0) or 0),
    )


def _top_recommendations(market_results: List[Dict], limit: int = 4) -> List[Dict]:
    """Retourne plusieurs propositions reelles, sans fabriquer de marche."""
    ordered = sorted(market_results, key=_market_sort_key, reverse=True)
    out = []
    seen = set()
    for item in ordered:
        key = (
            item.get("market"),
            item.get("pick_raw"),
            item.get("pick_point"),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(dict(item))
        if len(out) >= limit:
            break
    for i, item in enumerate(out):
        item["rank"] = i + 1
        item["is_primary_candidate"] = i == 0
    return out


def _build_combined_pick(market_results: List[Dict]) -> Optional[Dict]:
    """Construit un combine seulement si deux vrais marches sont solides.

    Le combine est une SUGGESTION secondaire. Il ne remplace jamais le pick
    principal. Sa probabilite est calculee de facon conservative et n'est pas
    presentee comme une garantie.
    """
    real = [
        x for x in market_results
        if x.get("source") == "bookmaker"
        and not x.get("synthetic", False)
        and not x.get("is_combo", False)
        and x.get("num_books", 0) >= MIN_BOOKMAKERS_STRONG
        and x.get("confidence", 0) >= SAFE_THRESHOLD
        and x.get("pick_odds", 0) >= 1.20
    ]
    if len(real) < 2:
        return None

    real = sorted(real, key=_market_sort_key, reverse=True)
    best = None
    for i, primary in enumerate(real):
        for secondary in real[i + 1:]:
            if primary.get("market") == secondary.get("market"):
                continue
            if _are_contradictory(primary.get("pick", ""), secondary.get("pick", "")):
                continue

            p1 = float(primary.get("model_probability", 0)) / 100.0
            p2 = float(secondary.get("model_probability", 0)) / 100.0
            if p1 <= 0 or p2 <= 0:
                continue

            # Meme match => dependance probable. Penalite conservative.
            conservative_prob = p1 * p2 * 0.85
            combined_odds = round(
                float(primary.get("pick_odds", 0)) * float(secondary.get("pick_odds", 0)), 2
            )
            if combined_odds <= 1.0 or combined_odds > MAX_ODDS * 1.5:
                continue

            combined_conf = round(conservative_prob * 100.0, 1)
            if combined_conf < 50.0:
                continue

            candidate = {
                "market": "combo",
                "market_label": "Combiné recommandé",
                "pick": f"{primary['pick']} & {secondary['pick']}",
                "pick_raw": f"{primary.get('pick_raw', '')}+{secondary.get('pick_raw', '')}",
                "pick_point": None,
                "pick_odds": combined_odds,
                "confidence": combined_conf,
                "model_probability": combined_conf,
                "estimated_win_probability": combined_conf,
                "probability_source": "conservative_product_of_real_market_probabilities",
                "stability_score": round(min(primary.get("stability_score", 0), secondary.get("stability_score", 0)), 1),
                "selection_score": round(combined_conf + min(combined_odds, 3) * 2, 1),
                "label": "safe" if combined_conf >= 60 else "value",
                "edge": round((primary.get("edge", 0) + secondary.get("edge", 0)) / 2, 2),
                "num_books": min(primary.get("num_books", 0), secondary.get("num_books", 0)),
                "is_combo": True,
                "combo_legs": [primary["pick"], secondary["pick"]],
                "source": "bookmaker",
                "synthetic": False,
                "correlation_penalty": 0.15,
            }
            if best is None or candidate["selection_score"] > best["selection_score"]:
                best = candidate
    return best


def analyze_match(match: Dict, real_stats_map: Optional[Dict] = None) -> Dict:
    """Analyse un match sans inventer de pronostic.

    - Tous les marches reels disponibles sont analyses.
    - Les marches synthetiques ne sont jamais proposes comme picks.
    - Plusieurs recommandations sont retournees avec probabilite consensus.
    - Le meilleur pick simple reste le pick principal.
    - Un combine peut etre fourni comme suggestion secondaire uniquement.
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
        "model_probability": 0,
        "estimated_win_probability": 0,
        "label": "unknown",
        "implied_probs": {},
        "edge": 0,
        "num_books": 0,
        "markets": [],
        "recommendations": [],
        "market": "h2h",
        "market_label": "Vainqueur (1X2)",
        "is_combo": False,
        "combo_suggestion": None,
        "official_track_eligible": False,
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
    for mk in [
        "h2h", "totals", "spreads", "btts", "draw_no_bet",
        "double_chance", "h2h_h1", "totals_h1", "totals_h2", "team_totals",
    ]:
        if mk not in market_keys:
            continue
        res = _analyze_market(mk, bookmakers, home, away, min_conf=0.0)
        if res:
            market_results.append(res)

    # IMPORTANT : _synthetic_markets n'est volontairement plus ajoute a
    # market_results. Une cote derivee d'une formule maison ne constitue pas
    # une cote de marche et ne doit pas etre presentee comme un vrai pari.
    if not market_results:
        return empty

    # Ajustement par les donnees REELLES uniquement. Les statistiques marquees
    # estimated_ai sont ignorees pour ne pas reintroduire de donnees inventees.
    real_data_used = bool(real_stats and real_stats.get("real_data_used") and not real_stats.get("estimated_ai"))
    if real_data_used:
        for r in market_results:
            delta = _real_stats_confidence_delta(real_stats, r.get("pick", ""), home, away)
            if delta:
                r["confidence"] = round(_clamp(r["confidence"] + delta), 1)
                r["real_stats_adjustment"] = round(delta, 1)
                r["label"] = (
                    "safe" if r["confidence"] >= SAFE_THRESHOLD
                    else ("value" if r["confidence"] >= VALUE_THRESHOLD else "risky")
                )

    market_results.sort(key=_market_sort_key, reverse=True)
    recommendations = _top_recommendations(market_results, limit=4)
    best = recommendations[0]

    # Combine optionnel : jamais de remplacement du pick principal.
    combo = _build_combined_pick(market_results)

    implied = {}
    probs = _h2h_probs(bookmakers, home, away)
    if probs:
        implied = {k: round(v * 100, 1) for k, v in probs.items()}

    # Eligibility Track Record : regles strictes, determinees AVANT resultat.
    official_track_eligible = bool(
        best.get("source") == "bookmaker"
        and not best.get("synthetic", False)
        and not best.get("is_combo", False)
        and best.get("confidence", 0) >= SAFE_THRESHOLD
        and best.get("edge", 0) >= 2.0
        and best.get("num_books", 0) >= 5
        and 1.20 <= (best.get("pick_odds") or 0) <= 2.20
        and not _is_live_match(match)
        and not _is_finished_match(match)
    )

    result = {
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
        "estimated_win_probability": best.get("estimated_win_probability", best.get("model_probability", best["confidence"])),
        "stability_score": best.get("stability_score", 0),
        "dominance_score": best.get("dominance_score", 0),
        "wp_score": best.get("wp_score", best["confidence"]),
        "selection_score": best.get("selection_score", best["confidence"]),
        "model_version": MODEL_VERSION,
        "label": best["label"],
        "implied_probs": implied,
        "edge": best.get("edge", 0),
        "num_books": best.get("num_books", 0),
        "market": best["market"],
        "market_label": best["market_label"],
        "is_combo": False,
        "markets": market_results,
        "recommendations": recommendations,
        "combo_suggestion": combo,
        "official_track_eligible": official_track_eligible,
        "analysis_integrity": {
            "real_bookmaker_markets_only": True,
            "synthetic_markets_excluded": True,
            "fabricated_stats_excluded": True,
            "real_external_stats_used": real_data_used,
        },
        "is_live": _is_live_match(match),
        "is_finished": _is_finished_match(match),
        "bookmakers_used": [
            {"key": bm.get("key"), "title": bm.get("title")}
            for bm in bookmakers
        ],
        "best_bookmaker": _get_best_bookmaker_title(bookmakers),
        "reasoning": _deep_reasoning(
            match, home, away,
            {k: v / 100 for k, v in implied.items()},
            real_stats=real_stats if real_data_used else None,
        ) if implied else None,
    }
    return result


def analyze_all(matches: List[Dict], real_stats_map: Optional[Dict] = None) -> List[Dict]:
    return [
        analyze_match(m, real_stats_map=real_stats_map)
        for m in matches
    ]


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
    """Retourne les meilleurs picks simples, sans repetiton artificielle.

    Chaque match garde un seul pick principal. Les alternatives restent dans
    ``analyze_match(...)["recommendations"]``.
    """
    preds = analyze_all(matches, real_stats_map=real_stats_map)
    valid = [
        p for p in preds
        if p.get("pick")
        and p.get("confidence", 0) >= MIN_CONFIDENCE
        and p.get("pick_odds", 0) >= MIN_ODDS
        and not p.get("is_combo", False)
    ]
    valid.sort(
        key=lambda p: (
            p.get("selection_score", p.get("confidence", 0)),
            p.get("edge", 0),
            p.get("pick_odds", 0),
        ),
        reverse=True,
    )
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
            if mk.get("source") != "bookmaker" or mk.get("synthetic", False) or mk.get("is_combo", False):
                continue
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

# Today-only selector. Public match predictions and other combo endpoints are unchanged.
TODAY_SELECTION_VERSION = "today-quality-1"
TODAY_QUALITY_PROFILES = (
    ("sure", "Safe", 3, 3, 70, 45, 2, 7, 0.40),
    ("booster", "Équilibré", 4, 6, 64, 35, 2, 9, 0.18),
    ("jackpot", "Jackpot", 5, 8, 60, 25, 1, 11, 0.07),
)


def _today_number(value, default=None):
    import math
    try:
        value = float(value)
        return value if math.isfinite(value) else default
    except (TypeError, ValueError):
        return default


def _today_quotes(match, market):
    """Actual same-market quotes, never attribute another market's bookmaker."""
    quotes = {}
    for book in match.get("bookmakers", []) or []:
        key = str(book.get("key") or book.get("title") or "").strip()
        if not key:
            continue
        for raw_market in book.get("markets", []) or []:
            if raw_market.get("key") != market.get("market"):
                continue
            for outcome in raw_market.get("outcomes", []) or []:
                if outcome.get("name") != market.get("pick_raw"):
                    continue
                if _today_number(outcome.get("point")) != _today_number(market.get("pick_point")):
                    continue
                price = _today_number(outcome.get("price"))
                if price and price > 1:
                    previous = quotes.get(key)
                    if not previous or price > previous["odds"]:
                        quotes[key] = {"odds":price, "title":book.get("title") or key,
                                       "last_update":raw_market.get("last_update") or book.get("last_update")}
    return quotes


def _today_pool(matches):
    candidates = []
    for match in matches:
        if not _is_upcoming(match.get("commence_time", "")) or match.get("completed") or match.get("is_finished"):
            continue
        analysis = analyze_match(match)
        for market in analysis.get("markets", []) or []:
            if market.get("source") != "bookmaker" or market.get("synthetic") or market.get("is_combo"):
                continue
            probability = _today_number(market.get("model_probability"))
            confidence = _today_number(market.get("confidence"))
            stability = _today_number(market.get("stability_score"))
            books = _today_number(market.get("num_books"))
            odds = _today_number(market.get("pick_odds"))
            if any(v is None for v in (probability, confidence, stability, books, odds)):
                continue
            if not (0 < probability < 100 and 0 <= confidence <= 100 and 0 <= stability <= 100 and odds > 1 and books >= 1):
                continue
            quotes = _today_quotes(match, market)
            if not quotes:
                continue
            quality = round(confidence*.50 + stability*.30 + min(100,books*25)*.20, 2)
            candidates.append({**market, **{k:match.get(k) for k in (
                "sport_key","sport_title","home_team","away_team","commence_time","country")},
                "match_id":str(match.get("id") or match.get("match_id") or ""),
                "quality_score":quality, "model_probability":probability, "confidence":confidence,
                "stability_score":stability, "num_books":int(books), "pick_odds":odds, "_quotes":quotes})
    return [p for p in candidates if p["match_id"]]


def _today_common_books(legs):
    if not legs:
        return set()
    return set.intersection(*(set(p["_quotes"]) for p in legs))


def _today_joint(legs):
    # Uncalibrated independence approximation, NOT an empirical success rate.
    import math
    return math.prod(p["model_probability"]/100 for p in legs)


def _today_team_overlap(a, b):
    teams_a = {str(a.get(k) or "").strip().casefold() for k in ("home_team","away_team")} - {""}
    teams_b = {str(b.get(k) or "").strip().casefold() for k in ("home_team","away_team")} - {""}
    return bool(teams_a & teams_b)


def _today_objective(legs, previous):
    mean = statistics.mean(p["quality_score"] for p in legs)
    leagues = [p.get("sport_key") for p in legs]
    concentration = len(legs)-len(set(leagues))
    shared = sum(str(p["match_id"]) in previous for p in legs)
    # Soft concentration/overlap preferences are heuristics, not correlation estimates.
    return mean - 1.5*concentration - 2*shared


def _today_select(pool, profile, previous, forbidden=()):
    key,label,preferred,maximum,min_conf,min_stability,min_books,gap,min_joint = profile
    eligible = [p for p in pool if p["confidence"]>=min_conf and p["stability_score"]>=min_stability and p["num_books"]>=min_books]
    eligible.sort(key=lambda p:(-p["quality_score"],-p["model_probability"],p["match_id"],p["market"],p["pick"]))
    # Bound search by distinct fixtures, retaining up to two genuine market alternatives each.
    per_match = {}
    for p in eligible:
        if p["match_id"] not in per_match and len(per_match)>=28:
            continue
        bucket = per_match.setdefault(p["match_id"],[])
        if len(bucket)<2:
            bucket.append(p)
    candidates = [p for bucket in per_match.values() for p in bucket]
    seeds = []
    for i,a in enumerate(candidates):
        for b in candidates[i+1:]:
            pair = [a,b]
            if a["match_id"]==b["match_id"] or _today_team_overlap(a,b) or not _today_common_books(pair):
                continue
            if _today_joint(pair)<min_joint or abs(a["quality_score"]-b["quality_score"])>gap:
                continue
            seeds.append(pair)
    seeds.sort(key=lambda legs:_today_objective(legs,previous),reverse=True)
    choices = []
    for seed in seeds[:24]:
        selected = list(seed)
        for candidate in candidates:
            if len(selected)>=maximum:
                break
            if any(candidate["match_id"]==p["match_id"] or _today_team_overlap(candidate,p) for p in selected):
                continue
            # Never lower criteria to fill a requested count. Beyond the nominal
            # length only candidates nearly as strong as the original pair qualify.
            allowed_gap = gap if len(selected)<preferred else 2
            if candidate["quality_score"] < statistics.mean(p["quality_score"] for p in seed)-allowed_gap:
                continue
            extended = selected+[candidate]
            if not _today_common_books(extended) or _today_joint(extended)<min_joint:
                continue
            selected = extended
        choices.append(selected)
    choices = [legs for legs in choices if tuple(sorted((p["match_id"],p["market"],p["pick"],str(p.get("pick_point"))) for p in legs)) not in forbidden]
    if not choices:
        return [],len(eligible)
    choices.sort(key=lambda legs:(_today_objective(legs,previous), min(len(legs),preferred)),reverse=True)
    return choices[0],len(eligible)


def _today_ticket(legs, profile, candidate_count):
    import math
    key,label,preferred,maximum,*_ = profile
    if not legs:
        return {"tier":key,"label":label,"legs":[],"leg_count":0,"total_odds":0,
                "avg_confidence":None,"combined_probability":None,"status":"preparing",
                "shortened":True,"preferred_legs":preferred,"maximum_legs":maximum,
                "candidate_count":candidate_count,"selection_version":TODAY_SELECTION_VERSION}
    common = _today_common_books(legs)
    bookmaker = max(sorted(common),key=lambda book:math.prod(p["_quotes"][book]["odds"] for p in legs))
    output = []
    for leg in sorted(legs,key=lambda p:(p["commence_time"],p["match_id"])):
        quote = leg["_quotes"][bookmaker]
        output.append({**{k:v for k,v in leg.items() if not k.startswith("_")},
                       "pick_odds":quote["odds"],"best_bookmaker":quote["title"],
                       "bookmaker_key":bookmaker,"quote_updated_at":quote["last_update"],
                       "edge":round(leg["model_probability"]-100/quote["odds"],2),
                       "selection_reason":{"confidence":leg["confidence"],"stability":leg["stability_score"],
                                           "bookmakers":leg["num_books"],"quality":leg["quality_score"]}})
    return {"tier":key,"label":label,"legs":output,"leg_count":len(output),
            "total_odds":round(math.prod(p["pick_odds"] for p in output),2),
            "avg_confidence":round(statistics.mean(p["confidence"] for p in output),1),
            "combined_probability":None,"independence_estimate":round(_today_joint(legs)*100,1),
            "probability_validated":False,"bookmaker":output[0]["best_bookmaker"],
            "bookmaker_key":bookmaker,"status":"ready","shortened":len(output)<preferred,
            "preferred_legs":preferred,"maximum_legs":maximum,"candidate_count":candidate_count,
            "selection_version":TODAY_SELECTION_VERSION}


# Retained solely as a benchmark, not used to choose new public tickets.
_legacy_build_today_combos_by_sport = build_today_combos_by_sport


def build_today_combos_by_sport(matches: List[Dict]) -> Dict:
    today_matches = [m for m in matches if _is_today(m.get("commence_time", "")) and _is_upcoming(m.get("commence_time", ""))]
    picks = _today_pool(today_matches)
    families = {}
    for family_key,family_label in SPORT_FAMILIES:
        pool = picks if family_key=="all" else [p for p in picks if str(p.get("sport_key") or "").startswith(family_key)]
        tiers,previous,ticket_sets = {},set(),set()
        for profile in TODAY_QUALITY_PROFILES:
            legs,count = _today_select(pool,profile,previous,ticket_sets)
            signature = tuple(sorted((p["match_id"],p["market"],p["pick"],str(p.get("pick_point"))) for p in legs))
            duplicate = signature in ticket_sets and bool(legs)
            # Don't advertise the exact same combination as another product.
            tier = _today_ticket([] if duplicate else legs,profile,count)
            if duplicate:
                tier["unavailable_reason"] = "duplicate"
            else:
                ticket_sets.add(signature)
                previous.update(p["match_id"] for p in legs)
            tiers[profile[0]] = tier
        for tier in tiers.values():
            tier["shared_matches"] = [p["match_id"] for p in tier["legs"] if sum(any(q["match_id"]==p["match_id"] for q in other["legs"]) for other in tiers.values())>1]
        families[family_key] = {"family_key":family_key,"family_label":family_label,
            "matches_today":sum(family_key=="all" or str(m.get("sport_key") or "").startswith(family_key) for m in today_matches),"tiers":tiers}
    return {"generated_at":datetime.now(timezone.utc).isoformat(),"total_matches_today":len(today_matches),
            "selection_version":TODAY_SELECTION_VERSION,"families":families}

# Experimental football model: never replaces the public selection.
def _shadow_analysis(match, stats_map=None):
    import math
    def number(value):
        try:
            value = float(value)
            return value if math.isfinite(value) else None
        except (ValueError, TypeError):
            return None
    result = {"version": "shadow-football-0.1", "mode": "shadow",
              "status": "market_only", "candidates": [], "calibrated": False}
    if not str(match.get("sport_key", "")).startswith("soccer"):
        result["reason"] = "sport_model_not_available"
        return result
    stats = lookup_real_stats(stats_map or {}, match.get("home_team", ""), match.get("away_team", "")) or {}
    cutoff = match.get("commence_time")
    try:
        kickoff = datetime.fromisoformat(cutoff.replace("Z", "+00:00"))
        kickoff = kickoff.replace(tzinfo=timezone.utc) if kickoff.tzinfo is None else kickoff
        now = datetime.now(timezone.utc)
        as_of = min(now, kickoff)
    except (ValueError, TypeError, AttributeError):
        result["reason"] = "invalid_kickoff"
        return result
    def history(rows):
        valid = []
        seen = set()
        for row in rows or []:
            try:
                played = datetime.fromisoformat(row["date"].replace("Z", "+00:00"))
                played = played.replace(tzinfo=timezone.utc) if played.tzinfo is None else played
                gf, ga = number(row.get("goals_for")), number(row.get("goals_against"))
                identity = row.get("id") or (row["date"], gf, ga)
                if played < as_of and 0 <= (as_of-played).days <= 365 and gf is not None and ga is not None and 0 <= gf <= 30 and 0 <= ga <= 30 and identity not in seen:
                    valid.append((played, gf, ga)); seen.add(identity)
            except (ValueError, TypeError, KeyError):
                continue
        return sorted(valid, reverse=True)[:10]
    home = history(stats.get("history_home"))
    away = history(stats.get("history_away"))
    result["sample"] = {"home": len(home), "away": len(away)}
    if len(home) < 5 or len(away) < 5:
        result["reason"] = "insufficient_observed_history"
        return result
    def rates(rows):
        weights = [math.exp(-math.log(2)*(as_of-r[0]).days/90) for r in rows]
        # Explicit weak prior to limit small-sample extremes, not a learned league baseline.
        return tuple((sum(w*r[i] for w,r in zip(weights,rows))+3*1.3)/(sum(weights)+3) for i in (1,2))
    hf, ha = rates(home); af, aa = rates(away)
    lh, la = max(.15,min(5,(hf+aa)/2)), max(.15,min(5,(af+ha)/2))
    ph = [math.exp(-lh)*lh**i/math.factorial(i) for i in range(21)]
    pa = [math.exp(-la)*la**i/math.factorial(i) for i in range(21)]
    grid = [(h,a,ph[h]*pa[a]) for h in range(21) for a in range(21)]
    mass = sum(v for _,_,v in grid)
    def probability(key, name, point):
        if key == "h2h":
            predicate = (lambda h,a:h>a) if name==match.get("home_team") else (lambda h,a:a>h) if name==match.get("away_team") else (lambda h,a:h==a) if name.lower()=="draw" else None
        elif key == "totals" and point is not None and point % 1 == .5:
            predicate = (lambda h,a:h+a>point) if name.lower()=="over" else (lambda h,a:h+a<point) if name.lower()=="under" else None
        elif key == "btts":
            predicate = (lambda h,a:h>0 and a>0) if name.lower()=="yes" else (lambda h,a:h==0 or a==0) if name.lower()=="no" else None
        else:
            predicate = None
        return sum(v for h,a,v in grid if predicate(h,a))/mass if predicate else None
    groups = {}
    for book in match.get("bookmakers", []) or []:
        book_id = book.get("key") or book.get("title")
        if not book_id:
            continue
        for market in book.get("markets", []) or []:
            key = market.get("key")
            if key not in ("h2h", "totals", "btts"):
                continue
            lines = {}
            for outcome in market.get("outcomes", []) or []:
                name = str(outcome.get("name", "")); odds = number(outcome.get("price"))
                point = number(outcome.get("point")) if key=="totals" else None
                if odds is not None and odds>1 and name:
                    lines.setdefault(point, {})[name]=(odds,outcome)
            for point, outcomes in lines.items():
                names = set(outcomes)
                expected = {match.get("home_team"),match.get("away_team"),"Draw"} if key=="h2h" else {"Over","Under"} if key=="totals" else {"Yes","No"}
                if names != expected:
                    continue
                margin = sum(1/v[0] for v in outcomes.values())
                for name,(odds,_) in outcomes.items():
                    p = probability(key,name,point)
                    if p is None:
                        continue
                    entry = groups.setdefault((key,point,name), {"probs":{},"odds":0,"bookmaker":None,"sport_probability":p})
                    entry["probs"][book_id]=(1/odds)/margin
                    if odds>entry["odds"]:
                        entry["odds"]=odds;entry["bookmaker"]=book.get("title") or book_id
    # Weight is deliberately conservative and experimental; validate before promotion.
    weight = .25 * min(1, min(len(home),len(away))/10)
    for (key,point,name),entry in groups.items():
        market_p = statistics.median(entry["probs"].values())
        p = weight*entry["sport_probability"]+(1-weight)*market_p
        result["candidates"].append({"market":key,"point":point,"pick":name,
            "odds":entry["odds"],"bookmaker":entry["bookmaker"],"num_books":len(entry["probs"]),
            "market_probability":round(100*market_p,2),"sport_probability":round(100*entry["sport_probability"],2),
            "experimental_probability":round(100*p,2),"expected_return":round(p*entry["odds"]-1,4)})
    result["candidates"].sort(key=lambda c:c["expected_return"],reverse=True)
    result.update(status="experimental" if groups else "market_only", reason="observed_history" if groups else "no_supported_quoted_market",
                  expected_goals={"home":round(lh,3),"away":round(la,3)},sport_weight=weight,
                  generated_at=now.isoformat(),as_of=as_of.isoformat())
    return result


_public_analyze_match = analyze_match


def analyze_match(match: Dict, real_stats_map: Optional[Dict] = None) -> Dict:
    # Keep public historical behaviour until prospective validation of the new model.
    home, away = match.get("home_team", ""), match.get("away_team", "")
    observed = lookup_real_stats(real_stats_map or {}, home, away)
    public_stats = {}
    if observed:
        key = "".join(c.lower() for c in home if c.isalnum()) + "|" + "".join(c.lower() for c in away if c.isalnum())
        public_stats[key] = {k:v for k,v in observed.items() if k not in ("real_data_used", "history_home", "history_away")}
    result = _public_analyze_match(match, real_stats_map=public_stats)
    result["analysis_status"] = "available" if result.get("pick") else "unavailable"
    result["unavailable_reason"] = None if result.get("pick") else (
        "no_bookmaker_quotes" if not match.get("bookmakers") else "no_eligible_quoted_selection")
    try:
        result["shadow_analysis"] = _shadow_analysis(match,real_stats_map)
    except Exception:
        # Experimental analysis must never take down the public feed.
        result["shadow_analysis"] = {"mode":"shadow","status":"error","reason":"experimental_analysis_failed","candidates":[]}
    return result

# Personalized construction reuses today's quality gates without limiting the feed.
PERSONAL_COMBO_VERSION = "personal-quality-1"


def _personal_window(period, zone_name="Africa/Porto-Novo", now=None):
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    try:
        zone = ZoneInfo(zone_name)
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        raise ValueError("Invalid timezone")
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(zone)
    midnight = local.replace(hour=0,minute=0,second=0,microsecond=0)
    if period=="today":
        start,end = local,midnight+timedelta(days=1)
    elif period=="tomorrow":
        start,end = midnight+timedelta(days=1),midnight+timedelta(days=2)
    elif period=="48h":
        return now.astimezone(timezone.utc),now.astimezone(timezone.utc)+timedelta(hours=48)
    elif period=="weekend":
        shift = -1 if local.weekday()==6 else (5-local.weekday())%7
        saturday = midnight+timedelta(days=shift)
        start,end = max(local,saturday),saturday+timedelta(days=2)
    else:
        raise ValueError("Invalid period")
    return start.astimezone(timezone.utc),end.astimezone(timezone.utc)


def _personal_match_time(match):
    if not isinstance(match.get("commence_time"),str) or "T" not in match["commence_time"]:
        return None
    try:
        value = datetime.fromisoformat(str(match.get("commence_time") or "").replace("Z","+00:00"))
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    except (TypeError,ValueError):
        return None


def personal_combo_options(matches, now=None):
    now = now or datetime.now(timezone.utc)
    sports,leagues,books = {},{},{}
    for match in matches:
        start = _personal_match_time(match)
        if not start or start<=now or match.get("completed") or match.get("is_finished"):
            continue
        key = str(match.get("sport_key") or "")
        sport = key.split("_",1)[0]
        if key and sport:
            sports[sport] = {"key":sport,"label":sport}
            leagues[key] = {"key":key,"sport":sport,"label":match.get("sport_title") or key}
        for book in match.get("bookmakers",[]) or []:
            identity = str(book.get("key") or book.get("title") or "").strip()
            if identity:
                books[identity] = {"key":identity,"label":book.get("title") or identity}
    return {"sports":sorted(sports.values(),key=lambda x:x["key"]),
            "leagues":sorted(leagues.values(),key=lambda x:x["label"]),
            "bookmakers":sorted(books.values(),key=lambda x:x["label"])}


def build_personalized_combos(matches, preferences, now=None):
    now = now or datetime.now(timezone.utc)
    profiles = {"safe":TODAY_QUALITY_PROFILES[0],"balanced":TODAY_QUALITY_PROFILES[1],"bold":TODAY_QUALITY_PROFILES[2]}
    profile_key = preferences.get("profile","balanced")
    if profile_key not in profiles:
        raise ValueError("Invalid profile")
    wanted = preferences.get("max_legs",4)
    if isinstance(wanted,bool) or not isinstance(wanted,int) or not 2<=wanted<=8:
        raise ValueError("Invalid match count")
    zone_name = preferences.get("timezone") or "Africa/Porto-Novo"
    period = preferences.get("period","today")
    start,end = _personal_window(period,zone_name,now)
    sports = set(preferences.get("sports") or [])
    leagues = set(preferences.get("leagues") or [])
    excluded = {str(v) for v in preferences.get("excluded_match_ids") or []}
    bookmaker = preferences.get("bookmaker") or "auto"
    selected_matches = []
    for match in matches:
        stamp = _personal_match_time(match)
        key = str(match.get("sport_key") or "")
        identity = str(match.get("id") or match.get("match_id") or "")
        if not stamp or not start<=stamp<end or stamp<=now or identity in excluded:
            continue
        if sports and key.split("_",1)[0] not in sports or leagues and key not in leagues:
            continue
        if match.get("is_finished") or match.get("completed"):
            continue
        selected_matches.append({**match,"commence_time":stamp.astimezone(timezone.utc).isoformat()})
    pool = _today_pool(selected_matches)
    if bookmaker!="auto":
        pool = [{**p,"_quotes":{bookmaker:p["_quotes"][bookmaker]}} for p in pool if bookmaker in p["_quotes"]]
    original = profiles[profile_key]
    maximum = min(wanted,original[3])
    profile = (original[0],original[1],min(original[2],maximum),maximum,*original[4:])
    legs,count = _today_select(pool,profile,set())
    principal = _today_ticket(legs,profile,count)
    signature = tuple(sorted((p["match_id"],p["market"],p["pick"],str(p.get("pick_point"))) for p in legs))
    alternatives,_ = _today_select(pool,profile,{p["match_id"] for p in legs},{signature}) if legs else ([],count)
    alternative = _today_ticket(alternatives,profile,count) if alternatives else None
    principal["shortened"] = bool(legs) and len(legs)<maximum
    if alternative:
        alternative["shortened"] = len(alternatives)<maximum
    shared = sorted({p["match_id"] for p in legs} & {p["match_id"] for p in alternatives})
    for ticket in (principal,alternative):
        if ticket is not None:
            ticket["shared_matches"] = shared
            ticket["selection_version"] = PERSONAL_COMBO_VERSION
    expires = min([now+timedelta(minutes=5)]+[_personal_match_time(p) for p in legs+alternatives if _personal_match_time(p)])
    return {"principal":principal,"alternative":alternative,
            "preferences":{**preferences,"max_legs":maximum,"timezone":zone_name},
            "period_start":start.isoformat(),"period_end":end.isoformat(),
            "available_matches":len(selected_matches),"eligible_selections":count,
            "generated_at":now.isoformat(),"expires_at":expires.isoformat(),
            "selection_version":PERSONAL_COMBO_VERSION}

# Dixon-Coles + Elo + market reference, observational mode only.
# No external dependency. Training is scheduled, never performed in analyze_match.
HYBRID_VERSION = "dc-elo-market-1"
HYBRID_MIN_FIXTURES = 240
HYBRID_MIN_EVAL = 40


def _hybrid_dt(value):
    try:
        result = datetime.fromisoformat(str(value).replace("Z","+00:00"))
        return (result if result.tzinfo else result.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)
    except (TypeError,ValueError):
        return None


def _hybrid_team(value):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD",str(value)).casefold() if c.isalnum() and not unicodedata.combining(c))


def _hybrid_number(value):
    import math
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError,ValueError):
        return None


def hybrid_training_rows(records, as_of=None):
    """One confirmed score per fixture; conflicting scores excluded, never cherry-picked."""
    import re
    as_of = as_of or datetime.now(timezone.utc)
    fixtures,conflicts = {},set()
    for record in records:
        league = str(record.get("sport_key") or "")
        # Cup/continental scores can include extra time; phase isn't available in track.
        if not league.startswith("soccer_") or any(k in league for k in ("cup","uefa","fifa","international","friendly")):
            continue
        kickoff,known = _hybrid_dt(record.get("commence_time")),_hybrid_dt(record.get("reconciled_at"))
        if not kickoff or not known or not kickoff < known <= as_of or (as_of-kickoff).days>1095:
            continue
        if record.get("result") not in ("won","lost","void"):
            continue
        score = re.fullmatch(r"\s*(\d+)\s*-\s*(\d+)\s*",str(record.get("final_score") or ""))
        if not score:
            continue
        goals = tuple(map(int,score.groups()))
        home,away = _hybrid_team(record.get("home_team") or ""),_hybrid_team(record.get("away_team") or "")
        if not home or not away or home==away or max(goals)>20:
            continue
        identity = (league,kickoff.isoformat(),home,away)
        row = fixtures.get(identity)
        if row and (row["hg"],row["ag"])!=goals:
            conflicts.add(identity);continue
        if not row:
            row = {"league":league,"id":str(record.get("match_id") or ""),"date":kickoff.isoformat(),"known_at":known.isoformat(),
                   "home":home,"away":away,"hg":goals[0],"ag":goals[1],"observations":[]}
            fixtures[identity] = row
        if known < _hybrid_dt(row["known_at"]):
            row["known_at"] = known.isoformat()
        # Only a genuinely pre-match, non-combined 1X2 forecast is a benchmark.
        probability = _hybrid_number(record.get("model_probability"))
        published = _hybrid_dt(record.get("created_at"))
        pick = _hybrid_team(record.get("pick") or "")
        target = "home" if pick==home else "away" if pick==away else "draw" if pick in ("draw","nul","matchnul") else None
        if record.get("market")=="h2h" and not record.get("is_combo") and target and published and published<kickoff and probability and 0<probability<100:
            row["observations"].append({"target":target,"probability":probability/100,"published_at":published.isoformat()})
    rows=[]
    for identity,row in fixtures.items():
        if identity in conflicts:
            continue
        # One first-published baseline per fixture, not one trial per market/refresh.
        row["observations"].sort(key=lambda o:o["published_at"])
        row["observation"] = row.pop("observations")[0] if row["observations"] else None
        rows.append(row)
    return sorted(rows,key=lambda r:(r["date"],r["id"],r["home"]))


def _hybrid_elo(rows):
    """Feature is based only on scores confirmed before this kickoff."""
    import heapq
    ratings,counts,queue = {},{},[]
    features=[]
    for index,row in enumerate(rows):
        while queue and queue[0][0]<row["date"]:
            _,_,h,a,hg,ag = heapq.heappop(queue)
            rh,ra = ratings.get(h,1500.),ratings.get(a,1500.)
            expectation = 1/(1+10**((ra-rh-50)/400))
            delta = 20*((1 if hg>ag else 0 if hg<ag else .5)-expectation)
            ratings[h],ratings[a] = rh+delta,ra-delta
            counts[h],counts[a] = counts.get(h,0)+1,counts.get(a,0)+1
        h,a = row["home"],row["away"]
        features.append(max(-1.5,min(1.5,(ratings.get(h,1500)-ratings.get(a,1500))/400)))
        heapq.heappush(queue,(row["known_at"],index,h,a,row["hg"],row["ag"]))
    while queue:
        _,_,h,a,hg,ag = heapq.heappop(queue)
        rh,ra = ratings.get(h,1500.),ratings.get(a,1500.)
        delta = 20*((1 if hg>ag else 0 if hg<ag else .5)-1/(1+10**((ra-rh-50)/400)))
        ratings[h],ratings[a] = rh+delta,ra-delta
        counts[h],counts[a] = counts.get(h,0)+1,counts.get(a,0)+1
    return features,ratings,counts


def _hybrid_tau(h,a,lh,la,rho):
    # tau, derivative wrt lambda_home, lambda_away, rho.
    if h==0 and a==0:return 1-lh*la*rho,-la*rho,-lh*rho,-lh*la
    if h==0 and a==1:return 1+lh*rho,rho,0,lh
    if h==1 and a==0:return 1+la*rho,0,rho,la
    if h==1 and a==1:return 1-rho,0,0,-1
    return 1.,0.,0.,0.


def _hybrid_fit(rows):
    """Regularized, recency-weighted Dixon-Coles maximum-likelihood via Adam."""
    import math
    teams = sorted({r[k] for r in rows for k in ("home","away")})
    index = {team:i for i,team in enumerate(teams)};size=len(teams)
    features,ratings,counts = _hybrid_elo(rows)
    mean_goals = sum(r["hg"]+r["ag"] for r in rows)/(2*len(rows))
    # [mu, home advantage, Elo coefficient, rho, attacks..., concessions...]
    parameters=[math.log(max(.3,mean_goals)),.15,0.,0.]+[0.]*(2*size)
    first,second=[0.]*len(parameters),[0.]*len(parameters)
    latest=max(_hybrid_dt(r["known_at"]) for r in rows)
    weights=[math.exp(-math.log(2)*(latest-_hybrid_dt(r["date"])).total_seconds()/86400/180) for r in rows]
    total=sum(weights);best_loss=float('inf');best=None;initial=None
    for step in range(1,161):
        gradient=[0.]*len(parameters);loss=0.
        for row,feature,w in zip(rows,features,weights):
            hi,ai=index[row["home"]],index[row["away"]]
            lh=math.exp(max(-2.3,min(math.log(5),parameters[0]+parameters[1]+parameters[4+hi]+parameters[4+size+ai]+parameters[2]*feature)))
            la=math.exp(max(-2.3,min(math.log(5),parameters[0]+parameters[4+ai]+parameters[4+size+hi]-parameters[2]*feature)))
            tau,dh,da,dr=_hybrid_tau(row["hg"],row["ag"],lh,la,parameters[3])
            if tau<=0 or not math.isfinite(tau):raise ValueError("Invalid DC mass")
            loss+=w*(lh-row["hg"]*math.log(lh)+math.lgamma(row["hg"]+1)+la-row["ag"]*math.log(la)+math.lgamma(row["ag"]+1)-math.log(tau))/total
            gh=w*(lh-row["hg"]-dh*lh/tau)/total;ga=w*(la-row["ag"]-da*la/tau)/total
            gradient[0]+=gh+ga;gradient[1]+=gh;gradient[2]+=(gh-ga)*feature;gradient[3]-=w*dr/tau/total
            gradient[4+hi]+=gh;gradient[4+size+ai]+=gh;gradient[4+ai]+=ga;gradient[4+size+hi]+=ga
        for i in range(2,len(parameters)):
            strength=.02 if i<4 else .02/max(1,size)
            loss+=strength*parameters[i]**2;gradient[i]+=2*strength*parameters[i]
        if initial is None:initial=loss
        if loss<best_loss:best_loss=loss;best=parameters[:]
        for i,g in enumerate(gradient):
            if not math.isfinite(g):raise ValueError("Nonfinite gradient")
            first[i]=.9*first[i]+.1*g;second[i]=.999*second[i]+.001*g*g
            parameters[i]-=.025*(first[i]/(1-.9**step))/(math.sqrt(second[i]/(1-.999**step))+1e-8)
        parameters[0]=max(-1,min(1.2,parameters[0]));parameters[1]=max(-.3,min(.6,parameters[1]));parameters[2]=max(-.5,min(.5,parameters[2]));parameters[3]=max(-.15,min(.035,parameters[3]))
        for offset in (4,4+size):
            mean=statistics.mean(parameters[offset:offset+size])
            for j in range(offset,offset+size):parameters[j]=max(-1.2,min(1.2,parameters[j]-mean))
            parameters[0]+=mean
    if best is None:raise ValueError("Training failed")
    return {"teams":teams,"parameters":best,"ratings":ratings,"counts":counts,
            "trained_until":latest.isoformat(),"loss_initial":initial,"loss_final":best_loss,
            "iterations":160,"converged":False,"optimization":"bounded_adam_fixed_budget"}


def _hybrid_grid(model, home, away):
    import math
    home,away=_hybrid_team(home),_hybrid_team(away)
    teams=model["teams"]
    if home not in teams or away not in teams or min(model["counts"].get(home,0),model["counts"].get(away,0))<5:return None
    hi,ai=teams.index(home),teams.index(away);size=len(teams);p=model["parameters"]
    feature=max(-1.5,min(1.5,(model["ratings"].get(home,1500)-model["ratings"].get(away,1500))/400))
    lh=math.exp(max(-2.3,min(math.log(5),p[0]+p[1]+p[4+hi]+p[4+size+ai]+p[2]*feature)))
    la=math.exp(max(-2.3,min(math.log(5),p[0]+p[4+ai]+p[4+size+hi]-p[2]*feature)))
    ph=[math.exp(-lh)*lh**g/math.factorial(g) for g in range(25)]
    pa=[math.exp(-la)*la**g/math.factorial(g) for g in range(25)]
    grid=[(h,a,ph[h]*pa[a]*_hybrid_tau(h,a,lh,la,p[3])[0]) for h in range(25) for a in range(25)]
    mass=sum(v for _,_,v in grid)
    if mass<=0 or any(v<0 for _,_,v in grid):raise ValueError("Invalid grid")
    return [(h,a,v/mass) for h,a,v in grid],lh,la


def _hybrid_result_probability(grid,target):
    return sum(v for h,a,v in grid if (h>a if target=="home" else a>h if target=="away" else h==a))


def _hybrid_adjust(probability,temperature):
    import math
    p=max(1e-6,min(1-1e-6,probability))
    return 1/(1+math.exp(-math.log(p/(1-p))/temperature))


def _hybrid_validation(model,history,rows):
    # Goal parameters stay fixed; Elo receives only earlier confirmed results.
    import copy
    observations=[]
    for row in rows:
        past=[r for r in history if r["known_at"]<row["date"]]
        _,ratings,counts=_hybrid_elo(past)
        current={**model,"ratings":ratings,"counts":counts}
        predicted=_hybrid_grid(current,row["home"],row["away"])
        observation=row.get("observation")
        if predicted and observation:
            target=observation["target"]
            truth=1 if (row["hg"]>row["ag"] if target=="home" else row["ag"]>row["hg"] if target=="away" else row["hg"]==row["ag"]) else 0
            observations.append((observation["probability"],_hybrid_result_probability(predicted[0],target),truth,row["id"]))
    return observations


def _hybrid_metrics(observations,weight=0.,temperature=1.):
    import math
    losses,briers=[],[]
    for market,sport,truth,_ in observations:
        p=_hybrid_adjust((1-weight)*market+weight*sport,temperature)
        losses.append(-math.log(p if truth else 1-p));briers.append((p-truth)**2)
    return {"n":len(losses),"log_loss":statistics.mean(losses) if losses else None,
            "brier":statistics.mean(briers) if briers else None,"losses":losses}


def train_hybrid_models(records,as_of=None):
    import math, json
    as_of=as_of or datetime.now(timezone.utc)
    rows=hybrid_training_rows(records,as_of)
    grouped={}
    for row in rows:grouped.setdefault(row["league"],[]).append(row)
    output={}
    for league,history in grouped.items():
        history=history[-3000:]
        report={"version":HYBRID_VERSION,"sport_key":league,"mode":"shadow","automatic_promotion":False,
                "as_of":as_of.isoformat(),"fixtures":len(history),"status":"insufficient_history","model":None,
                "dataset_sha256":hashlib.sha256(json.dumps(history,sort_keys=True).encode()).hexdigest()}
        output[league]=report
        if len(history)<HYBRID_MIN_FIXTURES:continue
        teams={r[k] for r in history for k in ("home","away")}
        if not 6<=len(teams)<=80:
            report["status"]="heterogeneous_competition";continue
        a,b=int(len(history)*.6),int(len(history)*.8)
        # Keep all simultaneous fixtures on the same side of each boundary.
        while a>0 and history[a-1]["date"]==history[a]["date"]:a-=1
        while b>0 and history[b-1]["date"]==history[b]["date"]:b-=1
        if a<120 or b-a<30 or len(history)-b<30:continue
        training=[r for r in history[:a] if r["known_at"]<history[a]["date"]]
        pre_eval=[r for r in history[:b] if r["known_at"]<history[b]["date"]]
        if len(training)<120:continue
        try:
            first=_hybrid_fit(training)
            calibration=_hybrid_validation(first,history,history[a:b])
            # Calibration is selected on the middle segment only. Evaluation is untouched.
            candidates=[(0.,1.)]+[(w,t) for w in (.1,.2,.3) for t in (.9,1.,1.1)]
            chosen=min(candidates,key=lambda wt:(_hybrid_metrics(calibration,*wt)["log_loss"],wt[0],abs(wt[1]-1))) if len(calibration)>=HYBRID_MIN_EVAL else (0.,1.)
            evaluation_model=_hybrid_fit(pre_eval)
            evaluation=_hybrid_validation(evaluation_model,history,history[b:])
            baseline=_hybrid_metrics(evaluation);challenger=_hybrid_metrics(evaluation,*chosen)
            differences=[a-b for a,b in zip(baseline["losses"],challenger["losses"])]
            interval_low=(statistics.mean(differences)-1.96*statistics.stdev(differences)/math.sqrt(len(differences))) if len(differences)>1 else None
            report.update(status="shadow_ready",model=_hybrid_fit(history),blend_weight=chosen[0],temperature=chosen[1],
                calibration_matches=len(calibration),evaluation_matches=len(evaluation),
                baseline={k:v for k,v in baseline.items() if k!="losses"},
                challenger={k:v for k,v in challenger.items() if k!="losses"},
                paired_logloss_gain_ci95_low=interval_low,
                interval_method="normal_approximation_without_temporal_correlation_adjustment",
                improvement_candidate=bool(len(evaluation)>=HYBRID_MIN_EVAL and len(calibration)>=HYBRID_MIN_EVAL
                    and chosen[0]>0 and interval_low is not None and interval_low>0
                    and challenger["brier"]<=baseline["brier"]),
                split={"training_end":history[a]["date"],"calibration_end":history[b]["date"]})
        except Exception as exc:
            report.update(status="training_failed",error=type(exc).__name__)
    return output


def _hybrid_shadow(match,stats_map=None):
    import math
    result={"version":HYBRID_VERSION,"mode":"shadow","status":"market_only","calibrated":False,"candidates":[]}
    league=str(match.get("sport_key") or "")
    report=(stats_map or {}).get("__hybrid_models__",{}).get(league)
    if not league.startswith("soccer_"):
        result["reason"]="sport_model_not_available";return result
    if not report or not report.get("model"):
        result["reason"]="insufficient_confirmed_league_history";return result
    kickoff=_hybrid_dt(match.get("commence_time"));as_of=_hybrid_dt(report.get("as_of"));now=datetime.now(timezone.utc)
    if not kickoff or not as_of or not as_of<now<kickoff or (now-as_of).days>7:
        result["reason"]="stale_or_inapplicable_model";return result
    prediction=_hybrid_grid(report["model"],match.get("home_team"),match.get("away_team"))
    if not prediction:
        result["reason"]="team_history_insufficient";return result
    grid,lh,la=prediction
    groups={}
    for book in match.get("bookmakers",[]) or []:
        book_id=str(book.get("key") or book.get("title") or "")
        if not book_id:continue
        h2h_reference={}
        for raw_market in book.get("markets",[]) or []:
            if raw_market.get("key")=="h2h":
                h2h_reference={str(o.get("name")):_hybrid_number(o.get("price")) for o in raw_market.get("outcomes",[]) or []}
                if set(h2h_reference)=={match.get("home_team"),match.get("away_team"),"Draw"} and all(p and p>1 for p in h2h_reference.values()):
                    overround=sum(1/p for p in h2h_reference.values())
                    h2h_reference={k:(1/p)/overround for k,p in h2h_reference.items()}
                else:h2h_reference={}
                break
        for market in book.get("markets",[]) or []:
            key=market.get("key")
            if key not in ("h2h","totals","btts","double_chance","draw_no_bet"):continue
            lines={}
            for outcome in market.get("outcomes",[]) or []:
                point=_hybrid_number(outcome.get("point")) if key=="totals" else None
                price=_hybrid_number(outcome.get("price"));name=str(outcome.get("name") or "")
                if price and price>1 and name:lines.setdefault(point,{})[name]=price
            expected={match.get("home_team"),match.get("away_team"),"Draw"} if key=="h2h" else {"Over","Under"} if key=="totals" else {"1X","X2","12"} if key=="double_chance" else {match.get("home_team"),match.get("away_team")} if key=="draw_no_bet" else {"Yes","No"}
            for point,quotes in lines.items():
                if set(quotes)!=expected or key=="totals" and (point is None or point%1!=.5):continue
                margin=sum(1/price for price in quotes.values())
                for name,price in quotes.items():
                    push=0.
                    reference=(1/price)/margin
                    if key=="double_chance":
                        # These outcomes overlap: summing inverse odds and normalizing
                        # to one would be wrong. Use this bookmaker's 1X2 reference.
                        if not h2h_reference:continue
                        covered={"1X":[match.get("home_team"),"Draw"],"X2":["Draw",match.get("away_team")],"12":[match.get("home_team"),match.get("away_team")]}[name]
                        reference=sum(h2h_reference[n] for n in covered)
                        targets=["home" if n==match.get("home_team") else "away" if n==match.get("away_team") else "draw" for n in covered]
                        probability=sum(_hybrid_result_probability(grid,t) for t in targets)
                    elif key=="draw_no_bet":
                        push=_hybrid_result_probability(grid,"draw")
                        probability=_hybrid_result_probability(grid,"home" if name==match.get("home_team") else "away")/(1-push)
                    elif key=="h2h":
                        target="home" if name==match.get("home_team") else "away" if name==match.get("away_team") else "draw"
                        probability=_hybrid_result_probability(grid,target)
                    elif key=="totals":probability=sum(v for h,a,v in grid if (h+a>point if name=="Over" else h+a<point))
                    else:probability=sum(v for h,a,v in grid if (h>0 and a>0 if name=="Yes" else h==0 or a==0))
                    entry=groups.setdefault((key,point,name),{"probs":{},"sport":probability,"push":push,"odds":0,"bookmaker":None})
                    entry["probs"][book_id]=reference
                    if price>entry["odds"]:entry.update(odds=price,bookmaker=book.get("title") or book_id)
    for (key,point,name),entry in groups.items():
        market=statistics.median(entry["probs"].values())
        # The learned blend/temperature has only been calibrated on 1X2.
        weight=report.get("blend_weight",0) if key=="h2h" else .2
        probability=_hybrid_adjust((1-weight)*market+weight*entry["sport"],report.get("temperature",1) if key=="h2h" else 1)
        result["candidates"].append({"market":key,"point":point,"pick":name,"odds":entry["odds"],"bookmaker":entry["bookmaker"],
            "num_books":len(entry["probs"]),"market_probability":round(market*100,2),"sport_probability":round(entry["sport"]*100,2),
            "experimental_probability":round(probability*100,2),
            "push_probability":round(entry["push"]*100,2),
            "probability_basis":"conditional_on_no_draw" if key=="draw_no_bet" else "unconditional",
            "expected_return":round((1-entry["push"])*(probability*entry["odds"]-1),4),
            "sport_weight":weight,"calibration_available":key=="h2h" and report.get("calibration_matches",0)>=HYBRID_MIN_EVAL})
    result["candidates"].sort(key=lambda p:p["expected_return"],reverse=True)
    result.update(status="experimental" if groups else "market_only",reason="trained_dc_elo" if groups else "no_supported_quoted_market",
        trained_as_of=as_of.isoformat(),generated_at=now.isoformat(),as_of=now.isoformat(),
        expected_goals={"home":round(lh,3),"away":round(la,3)},
        training_fixtures=report.get("fixtures"),evaluation=report.get("challenger"),baseline=report.get("baseline"),
        improvement_candidate=report.get("improvement_candidate",False),automatic_promotion=False)
    return result


# Resolve the existing wrapper's shadow hook without modifying the public engine.
_legacy_poisson_shadow_analysis = _shadow_analysis
_shadow_analysis = _hybrid_shadow
