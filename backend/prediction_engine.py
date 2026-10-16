"""WNPulse Prediction Engine v9.0 — marchés réels et lignes indépendantes.
Chaque sélection conserve sa cote, son opérateur et son identité de règlement.
Le classement multi-critères est heuristique ; les probabilités viennent du
consensus de marché, sans prétendre à un modèle sportif entraîné.
Les formes/H2H réels enrichissent les explications sans bonus arbitraire.
"""
from typing import Dict, List, Optional, Tuple
import statistics
import os
import math
import re
import unicodedata
from datetime import datetime, timezone, timedelta
import hashlib

from stats_service import lookup_real_stats

# Profil de présentation, pas une certification ni une pondération sportive.
BOOKMAKER_PROFILE = os.environ.get("WNPULSE_BOOKMAKER_PROFILE", "europe").strip().lower()
FR_BOOKMAKERS = ("betclicfr", "winamaxfr", "unibetfr", "pmufr", "netbetfr")
EU_BOOKMAKERS = FR_BOOKMAKERS + ("bet365", "pinnacle", "unibetuk", "unibeteu", "williamhill", "ladbrokesuk", "paddypower", "betway", "bwin", "betsson", "nordicbet")
BOOKMAKER_PRIORITY = tuple(re.sub(r"[^a-z0-9]", "", v.lower()) for v in os.environ.get("WNPULSE_BOOKMAKER_PRIORITY", "").split(",") if v.strip()) or (FR_BOOKMAKERS if BOOKMAKER_PROFILE == "fr" else EU_BOOKMAKERS)
# Exclusions éditoriales configurables, sans jugement automatique sur une licence.
EXCLUDED_BOOKMAKERS = set(filter(None, (re.sub(r"[^a-z0-9]", "", v.lower()) for v in os.environ.get("WNPULSE_EXCLUDED_BOOKMAKERS", "").split(","))))

# ─── Seuils qualité ───────────────────────────────────────────────────────────
MIN_ODDS = 1.15          # Redescendu a 1.15 sur demande explicite (volume/attractivite prioritaires sur le ROI mesure ; decision assumee malgre le ROI negatif observe sur cette plage dans le track record reel)
MAX_ODDS = 8.00          # Cote maximum pour picks principaux
MIN_CONFIDENCE = 60.0    # Filtre des Top Picks/combinés ; principal : plancher configurable de 55%.
MIN_EDGE = 1.0           # Edge affiche/tri; le filtre Value Bets reste distinct
MIN_BOOKMAKERS = 1       # Minimum pour analyser un marche disponible
MIN_BOOKMAKERS_STRONG = 2     # minimum pour une recommandation forte
MODEL_VERSION = "9.0.1-market-lines"
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


def _book_key(book: Dict) -> str:
    value = str(book.get("key") or book.get("title") or "")
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", value)


def _book_family(key: str) -> str:
    # Deux flux du même opérateur ne sont pas deux opinions indépendantes.
    if key in ("onexbet", "1xbet"):
        return "1xbet"
    for brand in ("unibet", "betclic", "winamax", "netbet", "pmu", "bet365", "ladbrokes", "williamhill", "betfair", "betsson"):
        if key.startswith(brand):
            return brand
    return key


def _bookmaker_allowed(book: Dict) -> bool:
    key = _book_key(book)
    if not key or key in EXCLUDED_BOOKMAKERS or _book_family(key) in EXCLUDED_BOOKMAKERS:
        return False
    # Les exchanges demandent des commissions et règles propres : hors sélection.
    if "betfair" in key or "matchbook" in key or "smarkets" in key:
        return False
    return BOOKMAKER_PROFILE != "fr" or key in FR_BOOKMAKERS


def _filtered_bookmakers(match: Dict) -> List[Dict]:
    books = [book for book in match.get("bookmakers", []) or [] if isinstance(book, dict) and _bookmaker_allowed(book)]
    def priority(book):
        key = _book_key(book)
        return BOOKMAKER_PRIORITY.index(key) if key in BOOKMAKER_PRIORITY else len(BOOKMAKER_PRIORITY)
    return sorted(books, key=priority)


def _get_best_bookmaker_title(bookmakers: List[Dict]) -> str:
    return (bookmakers[0].get("title") or bookmakers[0].get("key") or "") if bookmakers else ""


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
    if market_key in ("totals", "alternate_totals", "totals_h1", "totals_h2"):
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


def _finite(value) -> Optional[float]:
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError, OverflowError):
        return None


def _canonical_market(key: str) -> str:
    return {"alternate_totals": "totals", "alternate_spreads": "spreads", "alternate_team_totals": "team_totals"}.get(key, key)


def _quote_time(book: Dict, market: Dict):
    raw = market.get("last_update") or book.get("last_update")
    if not raw:
        return None, "unknown"
    try:
        date = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - date).total_seconds()
        max_age = max(300, _finite(os.environ.get("WNPULSE_MAX_QUOTE_AGE_SECONDS", "86400")) or 86400)
        return str(raw), "stale" if age > max_age or age < -300 else "current"
    except (ValueError, TypeError):
        return None, "unknown"


def _safe_h2h_consensus(bookmakers: List[Dict], home: str, away: str, soccer: bool = True) -> Dict[str, float]:
    probabilities = {}
    for book in bookmakers:
        family = _book_family(_book_key(book))
        if family in probabilities:
            continue
        for market in book.get("markets", []) or []:
            if market.get("key") != "h2h" or _quote_time(book, market)[1] == "stale":
                continue
            prices = {outcome.get("name"): _finite(outcome.get("price")) for outcome in market.get("outcomes", []) or [] if isinstance(outcome, dict)}
            required = {home, away, "Draw"} if soccer or "Draw" in prices else {home, away}
            if not required.issubset(prices) or not all(prices[name] and prices[name] > 1 for name in required):
                continue
            raw = {name: 1 / prices[name] for name in required}
            total = sum(raw.values())
            probabilities[family] = {name: value / total for name, value in raw.items()}
            break
    if not probabilities:
        return {}
    names = next(iter(probabilities.values())).keys()
    median = {name: statistics.median(row[name] for row in probabilities.values()) for name in names}
    total = sum(median.values())
    return {name: value / total for name, value in median.items()}


def _market_candidates(market_key: str, bookmakers: List[Dict], home: str, away: str,
                       sport_key: str = "", min_conf: float = 0.0) -> List[Dict]:
    """Analyse chaque issue d'une ligne complète avec sa vraie cote et sa source.

    Demi-lignes uniquement pour totals/handicaps : sans modèle de remboursement,
    les lignes entières/asiatiques ne sont pas présentées comme probabilités brutes.
    Double chance et DNB utilisent le 1X2 cohérent, jamais une normalisation de
    trois événements qui se chevauchent. Les montants/cotes ne sont pas fabriqués.
    """
    canonical = _canonical_market(market_key)
    soccer = sport_key.startswith("soccer")
    h2h = _safe_h2h_consensus(bookmakers, home, away, soccer=True) if canonical in ("double_chance", "draw_no_bet") else {}
    groups = {}
    for book in bookmakers:
        family = _book_family(_book_key(book))
        for market in book.get("markets", []) or []:
            if _canonical_market(market.get("key")) != canonical:
                continue
            quote_time, status = _quote_time(book, market)
            local = {}
            for outcome in market.get("outcomes", []) or []:
                if not isinstance(outcome, dict):
                    continue
                outcome_time, outcome_status = _quote_time(book, {"last_update": outcome.get("quote_updated_at") or market.get("last_update")})
                if outcome_status == "stale":
                    continue
                price = _finite(outcome.get("price"))
                if price is None or price <= 1 or price > 1000:
                    continue
                name = str(outcome.get("name") or "").strip()
                point = _finite(outcome.get("point"))
                team = str(outcome.get("description") or "").strip() if canonical == "team_totals" else ""
                if canonical in ("totals", "team_totals", "spreads"):
                    if point is None or abs(point * 2 - round(point * 2)) > 1e-8 or float(point).is_integer():
                        continue
                    if canonical == "team_totals" and team not in (home, away):
                        continue
                    if canonical == "spreads":
                        if name not in (home, away):
                            continue
                        line = point if name == home else -point
                    else:
                        if point < 0 or name.lower() not in ("over", "under"):
                            continue
                        name = name.capitalize()
                        line = point
                else:
                    line = None
                if canonical == "double_chance":
                    name = {"home/draw": "1X", "draw/away": "X2", "home/away": "12", "draw/home": "1X", "away/draw": "X2", "away/home": "12"}.get(name.lower(), name.upper())
                    if name not in ("1X", "X2", "12"):
                        continue
                if canonical == "btts":
                    name = {"yes": "Yes", "no": "No"}.get(name.lower(), name)
                key = (line, team)
                local.setdefault(key, {})[name] = {"price": price, "point": point, "team": team, "book": book, "time": outcome_time, "status": outcome_status}
            for key, outcomes in local.items():
                expected = ({home, away, "Draw"} if soccer else ({home, away, "Draw"} if "Draw" in outcomes else {home, away})) if canonical == "h2h" else ({home, away} if canonical in ("spreads", "draw_no_bet") else {"Over", "Under"} if canonical in ("totals", "team_totals") else {"Yes", "No"} if canonical == "btts" else {"1X", "X2", "12"})
                if not expected.issubset(outcomes):
                    continue
                # Priorité de région, puis source la plus fraîche d'une même marque.
                family_rows = groups.setdefault(key, {})
                existing = family_rows.get(family)
                if existing is None or ((quote_time or "") > (next(iter(existing.values())).get("time") or "")):
                    family_rows[family] = {name: outcomes[name] for name in expected}
    result = []
    for (line, team), families in groups.items():
        all_names = next(iter(families.values())).keys()
        if canonical in ("double_chance", "draw_no_bet"):
            if not h2h or "Draw" not in h2h:
                continue
            if canonical == "double_chance":
                consensus = {"1X": h2h[home] + h2h["Draw"], "X2": h2h[away] + h2h["Draw"], "12": h2h[home] + h2h[away]}
            else:
                consensus = {home: h2h[home], away: h2h[away]}
            per_family = {name: [consensus[name]] for name in all_names}
        else:
            per_family = {name: [] for name in all_names}
            for outcomes in families.values():
                total = sum(1 / row["price"] for row in outcomes.values())
                for name, row in outcomes.items():
                    per_family[name].append((1 / row["price"]) / total)
            medians = {name: statistics.median(values) for name, values in per_family.items()}
            total = sum(medians.values())
            consensus = {name: value / total for name, value in medians.items()}
        for name in all_names:
            probability = consensus[name]
            if probability * 100 < min_conf:
                continue
            quotes = [outcomes[name] for outcomes in families.values() if MIN_ODDS <= outcomes[name]["price"] <= MAX_ODDS]
            if not quotes:
                continue
            isolated_quote = False
            if len(quotes) >= 3:
                median_price = statistics.median(row["price"] for row in quotes)
                confirmed = [row for row in quotes if row["price"] <= median_price * 1.35 or sum(other["price"] >= row["price"] * .90 for other in quotes) >= 2]
                isolated_quote = len(confirmed) < len(quotes)
                quotes = confirmed or quotes
            preferred = [row for row in quotes if _book_key(row["book"]) in BOOKMAKER_PRIORITY]
            quote = max(preferred or quotes, key=lambda row: row["price"])
            price, point = quote["price"], quote["point"]
            if not MIN_ODDS <= price <= MAX_ODDS:
                continue
            push = h2h.get("Draw", 0) if canonical == "draw_no_bet" else 0.0
            pricing_probability = probability / (1 - push) if push < 1 else 0
            edge = (pricing_probability - 1 / price) * 100
            expected_return = probability * price - (1 - push)
            values = per_family[name]
            stability = _clamp(100 - statistics.pstdev(values) * 1000) if len(values) > 1 else 50.0
            count = len(families)
            confidence = probability * 100
            # Pareto-like editorial ranking, explicitly heuristic, not a trained win probability.
            odds_utility = 100 if 1.50 <= price <= 2.50 else 100 * max(0, (price - 1) / .5) if price < 1.50 else max(0, 100 - (price - 2.50) * 30)
            value_score = _clamp(50 + expected_return * 200)
            score = confidence * .40 + stability * .20 + min(100, count * 20) * .15 + odds_utility * .15 + value_score * .10
            notes = []
            if isolated_quote:
                notes.append("Une cote isolée non confirmée a été écartée de la comparaison de prix.")
            if count == 1:
                notes.append("Une seule marque fournit cette ligne : consensus non confirmé.")
                score -= 8
            if quote["status"] == "unknown":
                notes.append("Horodatage de la cote non fourni par la source.")
                score -= 3
            if canonical in ("double_chance", "draw_no_bet"):
                notes.append("Probabilité issue du consensus 1X2 ; cote issue du marché réellement coté.")
            pick = _outcome_label_fr(canonical, name, point)
            if canonical in ("totals", "team_totals"):
                unit = "buts" if soccer or sport_key.startswith("icehockey") else "points"
                pick = f"{'Plus de' if name == 'Over' else 'Moins de'} {point:g} {unit}"
                if canonical == "team_totals":
                    pick = f"{team} — {pick}"
            identity = f"{canonical}|full_time|{team}|{name}|{point}"
            result.append({
                "market": canonical, "market_label": "Total d'une équipe" if canonical == "team_totals" else _label_for_market(canonical),
                "pick": pick, "pick_raw": name, "pick_point": point, "pick_team": team or None,
                "selection_id": identity, "pick_odds": round(price, 3),
                "best_bookmaker": quote["book"].get("title") or quote["book"].get("key"),
                "best_bookmaker_key": quote["book"].get("key"), "quote_updated_at": quote["time"], "quote_status": quote["status"],
                "confidence": round(confidence, 1), "model_probability": round(confidence, 1), "estimated_win_probability": round(confidence, 1),
                "probability_source": "bookmaker_h2h_consensus" if canonical in ("double_chance", "draw_no_bet") else "bookmaker_consensus",
                "probability_basis": "win_with_push" if push else "unconditional", "push_probability": round(push * 100, 1),
                "non_loss_probability": round((probability + push) * 100, 1),
                "expected_return_pct": round(expected_return * 100, 2), "edge": round(edge, 2),
                "stability_score": round(stability, 1), "dominance_score": 0, "selection_score": round(score, 1), "wp_score": round(confidence, 1),
                "num_books": count, "label": "safe" if confidence >= SAFE_THRESHOLD else "value" if confidence >= VALUE_THRESHOLD else "risky",
                "source": "bookmaker", "synthetic": False, "is_combo": False,
                "strong_candidate": count >= MIN_BOOKMAKERS_STRONG and confidence >= SAFE_THRESHOLD,
                "quality_notes": notes,
                "selection_explanation": f"Sélection comparée aux autres marchés disponibles ; probabilité de marché {confidence:.1f}%, cote observée {price:g}, {count} marque(s) pour cette ligne. Le classement est une règle de sélection, pas une probabilité supplémentaire.",
            })
    return result


def _analyze_market(market_key: str, bookmakers: List[Dict], home: str, away: str,
                    min_conf: float = None, min_edge: float = None) -> Optional[Dict]:
    candidates = _market_candidates(market_key, bookmakers, home, away, min_conf=MIN_CONFIDENCE if min_conf is None else min_conf)
    return max(candidates, key=_market_sort_key) if candidates else None


# ─── H2H probabilities ───────────────────────────────────────────────────────

def _h2h_probs(bookmakers: List[Dict], home: str, away: str, soccer: bool = True) -> Optional[Dict[str, float]]:
    # Les identités 1X2 servent également à la double chance et au DNB.
    values = _safe_h2h_consensus(bookmakers, home, away, soccer=soccer)
    return values or None


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
    ordered = sorted(market_results, key=_market_sort_key, reverse=True)
    out, seen_markets, seen_events = [], set(), set()
    for item in ordered:
        # One recommendation per family; all outcomes remain in markets/builder.
        family = item.get("market")
        if family in seen_markets:
            continue
        seen_markets.add(family)
        seen_events.add(item.get("selection_id"))
        selected = dict(item)
        selected["rank"] = len(out) + 1
        selected["is_primary_candidate"] = not out
        out.append(selected)
        if len(out) >= limit:
            break
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
        "has_prediction": False,
        "analysis_status": "unavailable",
        "analysis_reason": "no_usable_market",
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
        "best_bookmaker": "",
        "reasoning": None,
    }

    if not bookmakers:
        empty["analysis_reason"] = "no_allowed_bookmaker"
        return empty

    market_keys = set()
    for bm in bookmakers:
        for m in bm.get("markets", []):
            if m.get("key"):
                market_keys.add(m["key"])

    market_results = []
    for market_key in ("h2h", "totals", "alternate_totals", "spreads", "alternate_spreads", "btts", "draw_no_bet", "double_chance", "team_totals", "alternate_team_totals"):
        if market_key in market_keys:
            market_results.extend(_market_candidates(market_key, bookmakers, home, away, sport_key=sport_key))
    # Une même sélection peut être transmise dans totals ET alternate_totals.
    unique = {}
    for candidate in market_results:
        identity = candidate["selection_id"]
        current = unique.get(identity)
        if current is None or candidate["num_books"] > current["num_books"] or (candidate["num_books"] == current["num_books"] and candidate["pick_odds"] > current["pick_odds"]):
            unique[identity] = candidate
    market_results = list(unique.values())
    if not market_results:
        return empty

    # La forme et les H2H sont explicatifs. Sans validation historique, aucun
    # ajout arbitraire de +/-6 points à une probabilité n'est appliqué.
    real_data_used = bool(real_stats and real_stats.get("real_data_used") and not real_stats.get("estimated_ai"))
    market_results.sort(key=_market_sort_key, reverse=True)
    primary_floor = _finite(os.environ.get("WNPULSE_MIN_PRIMARY_PROBABILITY", "0"))
    primary_floor = max(0.0, min(95.0, primary_floor if primary_floor is not None else 0.0))
    eligible = [candidate for candidate in market_results if candidate["confidence"] >= primary_floor]
    if not eligible:
        empty["analysis_reason"] = "below_configured_threshold"
        empty["markets"] = market_results
        return empty
    recommendations = _top_recommendations(eligible, limit=4)
    best = recommendations[0]
    recommended_ids = {candidate["selection_id"] for candidate in recommendations}
    market_results = recommendations + [candidate for candidate in market_results if candidate["selection_id"] not in recommended_ids]

    # Combine optionnel : jamais de remplacement du pick principal.
    combo = None  # Aucun combiné de même match sans cote réelle dédiée.

    implied = {}
    probs = _h2h_probs(bookmakers, home, away, soccer=sport_key.startswith("soccer"))
    if probs:
        implied = {k: round(v * 100, 1) for k, v in probs.items()}

    # Eligibility Track Record : regles strictes, determinees AVANT resultat.
    official_track_eligible = bool(
        best.get("source") == "bookmaker"
        and not best.get("synthetic", False)
        and not best.get("is_combo", False)
        and best.get("probability_basis") == "unconditional"
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
        "has_prediction": True,
        "analysis_status": "ready",
        "analysis_reason": None,
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
        "best_bookmaker": best.get("best_bookmaker", ""),
        "best_bookmaker_key": best.get("best_bookmaker_key"),
        "bookmaker_profile": BOOKMAKER_PROFILE,
        "pick_raw": best.get("pick_raw"),
        "pick_point": best.get("pick_point"),
        "pick_team": best.get("pick_team"),
        "selection_id": best.get("selection_id"),
        "probability_source": best.get("probability_source"),
        "probability_basis": best.get("probability_basis"),
        "expected_return_pct": best.get("expected_return_pct"),
        "push_probability": best.get("push_probability"),
        "selection_explanation": best.get("selection_explanation"),
        "quote_updated_at": best.get("quote_updated_at"),
        "quote_status": best.get("quote_status"),
        "quality_notes": best.get("quality_notes", []),
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
        if m.get("bookmakers")
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
            if mk.get("probability_basis") != "unconditional":
                continue
            implied_prob = round(100 / mk["pick_odds"], 1)
            our_prob = round(implied_prob + edge, 1)
            out.append({
                "sport_title": analyzed.get("sport_title"),
                "home_team": analyzed.get("home_team"),
                "away_team": analyzed.get("away_team"),
                "commence_time": analyzed.get("commence_time"),
                "market_label": mk.get("market_label"),
                "best_bookmaker": mk.get("best_bookmaker"),
                "probability_source": mk.get("probability_source"),
                "expected_return_pct": mk.get("expected_return_pct"),
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
            # Les combinés existants ne modélisent pas les remboursements partiels.
            if mk.get("push_probability", 0) > 0:
                continue
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
                "best_bookmaker": mk.get("best_bookmaker", ""),
                "best_bookmaker_key": mk.get("best_bookmaker_key"),
                "pick_raw": mk.get("pick_raw"), "pick_point": mk.get("pick_point"),
                "pick_team": mk.get("pick_team"), "selection_id": mk.get("selection_id"),
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
