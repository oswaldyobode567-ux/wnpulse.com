"""The Odds API client with MongoDB caching.
CORRECTIONS v7.1 :
- Cache TTL = 6 heures (au lieu de 60 min) → préserve les crédits
- Fetch 1x/jour à 06h00 WAT via worker (voir server.py)
- JAMAIS d'appel API sur requête utilisateur → toujours depuis le cache
- Filtre matchs amicaux automatique
- Inclut matchs live et terminés (24h) — ne disparaissent plus
- Scores via un endpoint distinct des cotes ; coût selon daysFrom et l'offre fournisseur

CORRECTIONS v8.4 :
- Integration odds-api.io comme source secondaire de cotes (ligues mineures)
- Integration BSD Sports Addon comme enrichissement (predictions ML CatBoost)
- Parallélisation des fetchs et des scores
- Cache utilisateur strictement MongoDB, jamais de fetch réseau
- TTL dynamique selon la proximité du prochain match
- Fusion multi-source robuste par équipes + horaire
- Normalisation équipes/bookmakers et qualité pondérée
- Correction reconciliation odds-api.io : statut settled + fallback horaire > 4h
- Ajout des sondes de diagnostic compatibles avec server.py corrige
- Suppression du doublon odds-api.io
  fusionnees dans le reasoning des matchs, sans remplacer le moteur maison
"""
import os
import time
import random
import hashlib
import asyncio
import math
import unicodedata
import re
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional

import httpx
from pymongo import UpdateOne
import logging
logger = logging.getLogger("winpulse.odds_service")

ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "").strip()
ODDS_API_BASE = "https://api.the-odds-api.com/v4"

# Etat de consommation The Odds API. Il est mis a jour a chaque reponse afin que
# le dashboard/refresh manuel puisse distinguer une vraie absence de matchs d'un
# quota epuise, d'une cle invalide ou d'un rate limit.
ODDS_API_USAGE_STATE: Dict[str, object] = {
    "remaining": None,
    "used": None,
    "last_cost": None,
    "quota_exhausted": False,
    "rate_limited": False,
    "last_http_status": None,
    "last_error_code": None,
    "last_error": None,
    "last_checked_at": None,
    "last_successful_fetch_at": None,
}


def _header_int(headers, name: str):
    try:
        value = headers.get(name)
        return int(value) if value is not None and str(value).strip() != "" else None
    except Exception:
        return None


def _record_odds_api_response(response, context: str = "") -> None:
    """Memorise le quota et les erreurs fournisseur sans exposer la cle API."""
    ODDS_API_USAGE_STATE["remaining"] = _header_int(response.headers, "x-requests-remaining")
    ODDS_API_USAGE_STATE["used"] = _header_int(response.headers, "x-requests-used")
    ODDS_API_USAGE_STATE["last_cost"] = _header_int(response.headers, "x-requests-last")
    ODDS_API_USAGE_STATE["last_http_status"] = int(response.status_code)
    ODDS_API_USAGE_STATE["last_checked_at"] = datetime.now(timezone.utc).isoformat()

    if response.status_code == 429:
        ODDS_API_USAGE_STATE["rate_limited"] = True

    if response.status_code >= 400:
        code = None
        message = None
        try:
            payload = response.json()
            if isinstance(payload, dict):
                code = payload.get("error_code") or payload.get("code")
                message = payload.get("message") or payload.get("error")
        except Exception:
            message = (response.text or "")[:300]
        ODDS_API_USAGE_STATE["last_error_code"] = code
        ODDS_API_USAGE_STATE["last_error"] = message or f"HTTP {response.status_code} ({context})"
        text = f"{code or ''} {message or ''}".upper()
        if "OUT_OF_USAGE_CREDITS" in text or "USAGE CREDIT" in text:
            ODDS_API_USAGE_STATE["quota_exhausted"] = True


def _provider_status_snapshot() -> Dict[str, object]:
    return dict(ODDS_API_USAGE_STATE)


def _reset_refresh_transient_state() -> None:
    # On reteste a chaque nouveau refresh : le quota peut avoir ete recharge ou
    # remis a zero depuis le precedent appel.
    ODDS_API_USAGE_STATE["quota_exhausted"] = False
    ODDS_API_USAGE_STATE["rate_limited"] = False
    ODDS_API_USAGE_STATE["last_error_code"] = None
    ODDS_API_USAGE_STATE["last_error"] = None

# ─── Nouvelles sources secondaires ───────────────────────────────────────────
ODDS_API_IO_KEY = os.environ.get("ODDS_API_IO_KEY", "").strip()
ODDS_API_IO_BASE = "https://api.odds-api.io/v3"

BSD_API_KEY = os.environ.get("BSD_API_KEY", "").strip()
BSD_API_BASE = "https://sports.bzzoiro.com/api"

# Ligues mineures d'ete a completer via odds-api.io en secours (slugs confirmes
# depuis /v3/leagues?sport=football). Inclut les qualifications UEFA qui ne
# sont actuellement PAS disponibles sur The Odds API (verifie le 23/07/2026 :
# aucune competition UEFA dans /v4/sports actif), mais bien presentes ici.
ODDS_API_IO_LEAGUES = [
    "norway-eliteserien",
    "sweden-allsvenskan",
    "finland-veikkausliiga",
    "denmark-superligaen",
    "brazil-brasileiro-serie-b",
    "italy-coppa-italia",
    # UEFA : les tours de barrage sont des slugs distincts et doivent être
    # interrogés explicitement, sinon des matchs européens actifs disparaissent.
    "international-clubs-uefa-champions-league-qualification",
    "international-clubs-uefa-champions-league-playoff-round",
    "international-clubs-uefa-europa-league-qualification",
    "international-clubs-uefa-europa-league-playoff-round",
    "international-clubs-uefa-conference-league-qualification",
    "international-clubs-uefa-conference-league-playoff-round",
]

# Hockey — sport distinct, gere separement (voir ODDS_API_IO_HOCKEY_LEAGUES)
ODDS_API_IO_HOCKEY_LEAGUES = [
    "sweden-shl",
    "usa-nhl",
    "russia-khl",
]

# Basketball — sport distinct. Pas d'Euroleague masculine active en juillet
# (intersaison), mais qualifications FIBA Afrique confirmees actives et
# pertinentes pour l'audience ouest-africaine.
ODDS_API_IO_BASKETBALL_LEAGUES = [
    "international-fiba-world-cup-african-qualifiers-group-e",
    "international-fiba-world-cup-african-qualifiers-group-f",
    "international-eurocup-group-a",
]

# Mapping des noms de marches odds-api.io -> noms internes (a confirmer/ajuster
# une fois un exemple reel de reponse /v3/odds obtenu)
ODDS_API_IO_MARKET_MAP = {
    "ML": "h2h",
    "Moneyline": "h2h",
    "Totals": "totals",
    "Both Teams To Score": "btts",
    "Draw No Bet": "draw_no_bet",
}

# Cache dynamique. Les requetes utilisateur ne declenchent jamais de fetch reseau.
CACHE_TTL_LONG_MINUTES = int(os.environ.get("ODDS_CACHE_TTL_LONG_MINUTES", "360"))
CACHE_TTL_DAY_MINUTES = int(os.environ.get("ODDS_CACHE_TTL_DAY_MINUTES", "120"))
CACHE_TTL_SOON_MINUTES = int(os.environ.get("ODDS_CACHE_TTL_SOON_MINUTES", "30"))
CACHE_TTL_NEAR_MINUTES = int(os.environ.get("ODDS_CACHE_TTL_NEAR_MINUTES", "5"))
STALE_CACHE_MAX_HOURS = int(os.environ.get("ODDS_STALE_CACHE_MAX_HOURS", "24"))
BOOKMAKER_WEIGHTS = {"pinnacle":1.00,"bet365":0.95,"1xbet":0.90,"betway":0.88,"sportybet":0.86,"melbet":0.84,"pmu":0.82}

def _normalize_bookmaker_key(name: str) -> str:
    value = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "", value.lower())

def _cache_ttl_for_matches(matches: List[Dict]) -> int:
    now=datetime.now(timezone.utc); nearest=None
    for m in matches or []:
        try:
            ct=datetime.fromisoformat(str(m.get("commence_time","")).replace("Z","+00:00"))
            if ct.tzinfo is None: ct=ct.replace(tzinfo=timezone.utc)
            if ct>=now and (nearest is None or ct<nearest): nearest=ct
        except Exception: continue
    if nearest is None: return CACHE_TTL_LONG_MINUTES
    hours=(nearest-now).total_seconds()/3600
    if hours<1: return CACHE_TTL_NEAR_MINUTES
    if hours<6: return CACHE_TTL_SOON_MINUTES
    if hours<24: return CACHE_TTL_DAY_MINUTES
    return CACHE_TTL_LONG_MINUTES

def _bookmaker_quality(name: str) -> float:
    return BOOKMAKER_WEIGHTS.get(_normalize_bookmaker_key(name), 0.75)

def _annotate_bookmakers(matches: List[Dict]) -> List[Dict]:
    for match in matches:
        for bm in match.get("bookmakers", []):
            title=bm.get("title") or bm.get("key") or ""
            bm["key"]=_normalize_bookmaker_key(bm.get("key") or title)
            bm["quality_weight"]=_bookmaker_quality(title)
    return matches

# Mots-clés identifiant les matchs amicaux à filtrer
FRIENDLY_KEYWORDS = [
    "friendly", "amical", "test match", "pre-season", "preseason",
    "friendlies", "club friendlies", "international friendlies",
    "exhibition", "preparation", "preparatory"
]

SUPPORTED_SPORTS = [
    {"key": "soccer", "label": "Football", "icon": "Trophy", "group": "soccer"},
    {"key": "basketball_nba", "label": "Basketball NBA", "icon": "Dribbble", "group": "basketball"},
    {"key": "basketball_euroleague", "label": "Basketball Euroleague", "icon": "Dribbble", "group": "basketball"},
    {"key": "tennis", "label": "Tennis", "icon": "CircleDot", "group": "tennis"},
    {"key": "icehockey_nhl", "label": "Hockey NHL", "icon": "Snowflake", "group": "hockey"},
    {"key": "baseball_mlb", "label": "Baseball MLB", "icon": "Target", "group": "baseball"},
    {"key": "mma_mixed_martial_arts", "label": "MMA", "icon": "Swords", "group": "mma"},
    {"key": "americanfootball_nfl", "label": "Football américain NFL", "icon": "Goal", "group": "american_football"},
]

# Toutes les ligues à fetcher — organisées par priorité
REAL_SPORT_KEYS = [
    # ═══ FOOTBALL — Priorité absolue ═══
    # Coupe du Monde FIFA 2026
    "soccer_fifa_world_cup",
    # Qualifications Coupe du Monde
    "soccer_world_wc_qualification_africa",
    "soccer_world_wc_qualification_europe",
    "soccer_world_wc_qualification_concacaf",
    "soccer_world_wc_qualification_asia",
    # Compétitions africaines
    "soccer_africa_caf_champions_league",
    "soccer_africa_africa_cup_of_nations",
    # Qualifications Champions League (actives en juillet)
    "soccer_uefa_champs_league",
    "soccer_uefa_europa_league",
    "soccer_uefa_europa_conference_league",
    # Top 5 européens
    "soccer_epl",
    "soccer_spain_la_liga",
    "soccer_germany_bundesliga",
    "soccer_germany_bundesliga2",
    "soccer_france_ligue_one",
    "soccer_france_ligue_two",
    "soccer_italy_serie_a",
    # Autres ligues européennes
    "soccer_netherlands_eredivisie",
    "soccer_portugal_primeira_liga",
    "soccer_turkey_super_league",
    "soccer_belgium_first_div",
    "soccer_efl_champ",
    "soccer_scotland_premiership",
    "soccer_greece_super_league",
    # Ligues actives été (juillet-août)
    "soccer_norway_eliteserien",
    "soccer_sweden_allsvenskan",
    "soccer_finland_veikkausliiga",
    "soccer_denmark_superliga",
    # Amérique
    "soccer_usa_mls",
    "soccer_brazil_campeonato",
    "soccer_brazil_serie_b",
    "soccer_argentina_primera_division",
    "soccer_conmebol_copa_libertadores",
    "soccer_conmebol_copa_america",
    "soccer_concacaf_gold_cup",
    "soccer_mexico_ligamx",
    # Asie / Reste du monde
    "soccer_china_superleague",
    "soccer_japan_j_league",
    "soccer_saudi_arabia_pro_league",
    # ═══ BASKETBALL ═══
    "basketball_nba",
    "basketball_euroleague",
    "basketball_nba_summer_league",
    # ═══ TENNIS ═══
    "tennis_atp_wimbledon",
    "tennis_wta_wimbledon",
    "tennis_atp",
    "tennis_wta",
    "tennis_atp_us_open",
    "tennis_wta_us_open",
    # ═══ HOCKEY ═══
    "icehockey_nhl",
    "icehockey_sweden_hockey_league",
    "icehockey_ahl",
    # ═══ BASEBALL ═══
    "baseball_mlb",
    # ═══ MMA ═══
    "mma_mixed_martial_arts",
    # ═══ FOOTBALL AMÉRICAIN ═══
    "americanfootball_nfl",
]

# Ligues pour lesquelles on fetch les marchés enrichis
DEEP_MARKET_SPORTS = {
    "soccer_fifa_world_cup",
    "soccer_epl",
    "soccer_spain_la_liga",
    "soccer_germany_bundesliga",
    "soccer_france_ligue_one",
    "soccer_italy_serie_a",
    "soccer_uefa_champs_league",
    "soccer_uefa_europa_league",
    "soccer_africa_caf_champions_league",
    "soccer_africa_africa_cup_of_nations",
    "soccer_conmebol_copa_libertadores",
    "soccer_conmebol_copa_america",
    "soccer_world_wc_qualification_africa",
    "basketball_nba",
    "icehockey_nhl",
    "baseball_mlb",
    "tennis_atp_wimbledon",
    "tennis_wta_wimbledon",
}

SOCCER_MARKETS = "h2h,totals"
BASKET_MARKETS = "h2h,totals,spreads"
TENNIS_MARKETS = "h2h"
HOCKEY_MARKETS = "h2h,totals"
DEFAULT_MARKETS = "h2h"


def _is_friendly(match: Dict) -> bool:
    """Détecte si un match est amical — à filtrer sauf si évidence forte."""
    sport_title = (match.get("sport_title") or "").lower()
    sport_key = (match.get("sport_key") or "").lower()
    home = (match.get("home_team") or "").lower()
    away = (match.get("away_team") or "").lower()

    # Vérification sur le titre de la ligue
    for kw in FRIENDLY_KEYWORDS:
        if kw in sport_title or kw in sport_key:
            return True

    # Vérification sur les noms d'équipes (U21, B teams, reserves)
    for team in [home, away]:
        if any(x in team for x in ["u21", "u23", "under-21", "under-23", "reserve", "b team", "ii", " b "]):
            return True

    return False


def _sport_group_from_key(sport_key: str) -> str:
    key = str(sport_key or "").lower().strip()
    if key.startswith("soccer"):
        return "football"
    if key.startswith("basketball"):
        return "basketball"
    if key.startswith("tennis"):
        return "tennis"
    if key.startswith("icehockey") or key.startswith("ice_hockey"):
        return "hockey"
    if key.startswith("baseball"):
        return "baseball"
    if key.startswith("mma"):
        return "mma"
    if key.startswith("americanfootball") or key.startswith("american_football"):
        return "american_football"
    return "other"


def _sport_group_from_match(match: Dict) -> str:
    key = str(match.get("sport_key") or "")
    group = _sport_group_from_key(key)
    if group != "other":
        return group
    title = str(match.get("sport_title") or "").lower()
    if any(x in title for x in ("nba", "basket", "euroleague")):
        return "basketball"
    if any(x in title for x in ("atp", "wta", "tennis")):
        return "tennis"
    if any(x in title for x in ("nhl", "hockey")):
        return "hockey"
    if any(x in title for x in ("mlb", "baseball")):
        return "baseball"
    if any(x in title for x in ("ufc", "mma")):
        return "mma"
    if any(x in title for x in ("nfl", "american football")):
        return "american_football"
    if any(x in title for x in ("league", "liga", "bundesliga", "uefa", "soccer", "football")):
        return "football"
    return "other"


def _regions_for_sport(sport_key: str) -> str:
    """Choisit un marché bookmaker pertinent sans multiplier inutilement les régions."""
    override = os.environ.get("ODDS_REGIONS", "").strip()
    if override:
        return override
    group = _sport_group_from_key(sport_key)
    if group in {"basketball", "hockey", "baseball", "american_football"}:
        return os.environ.get("ODDS_US_SPORTS_REGION", "us").strip() or "us"
    return os.environ.get("ODDS_DEFAULT_REGION", "eu").strip() or "eu"


def _get_markets_for_sport(sport_key: str) -> str:
    """Retourne les marchés à fetcher en maîtrisant le coût du quota.

    Les marchés enrichis sont réservés aux compétitions principales. Toutes les
    autres compétitions restent disponibles en h2h au lieu de doubler/tripler le
    coût de chaque appel sans nécessité.
    """
    if sport_key in DEEP_MARKET_SPORTS:
        if sport_key.startswith("soccer"):
            return SOCCER_MARKETS
        if sport_key.startswith("basketball"):
            return BASKET_MARKETS
        if sport_key.startswith("icehockey"):
            return HOCKEY_MARKETS
    if sport_key.startswith("tennis"):
        return TENNIS_MARKETS
    return DEFAULT_MARKETS


# ─── Mock data (quand pas de clé API) ────────────────────────────────────────

MOCK_FIXTURES = {
    "soccer": [
        ("Paris Saint-Germain", "Olympique Marseille", "Ligue 1"),
        ("Real Madrid", "FC Barcelona", "La Liga"),
        ("Manchester City", "Liverpool FC", "Premier League"),
        ("Bayern Munich", "Borussia Dortmund", "Bundesliga"),
        ("Inter Milan", "Juventus", "Serie A"),
        ("Arsenal", "Chelsea", "Premier League"),
        ("Atletico Madrid", "Sevilla FC", "La Liga"),
        ("AC Milan", "Napoli", "Serie A"),
        ("AS Monaco", "Olympique Lyonnais", "Ligue 1"),
        ("FC Porto", "Benfica", "Primeira Liga"),
    ],
    "basketball_nba": [
        ("Los Angeles Lakers", "Boston Celtics", "NBA"),
        ("Golden State Warriors", "Miami Heat", "NBA"),
        ("Denver Nuggets", "Phoenix Suns", "NBA"),
        ("Milwaukee Bucks", "Philadelphia 76ers", "NBA"),
        ("Dallas Mavericks", "Oklahoma City Thunder", "NBA"),
    ],
    "tennis": [
        ("Carlos Alcaraz", "Jannik Sinner", "ATP Masters"),
        ("Novak Djokovic", "Daniil Medvedev", "ATP Masters"),
        ("Iga Swiatek", "Aryna Sabalenka", "WTA 1000"),
        ("Coco Gauff", "Elena Rybakina", "WTA 1000"),
    ],
    "icehockey_nhl": [
        ("Toronto Maple Leafs", "Boston Bruins", "NHL"),
        ("Edmonton Oilers", "Colorado Avalanche", "NHL"),
        ("Vegas Golden Knights", "Tampa Bay Lightning", "NHL"),
    ],
    "baseball_mlb": [
        ("New York Yankees", "Boston Red Sox", "MLB"),
        ("Los Angeles Dodgers", "San Francisco Giants", "MLB"),
        ("Houston Astros", "Texas Rangers", "MLB"),
    ],
}


def _deterministic_random(seed_str: str) -> random.Random:
    seed = int(hashlib.md5(seed_str.encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


def _generate_mock_event(sport_key: str, home: str, away: str, league: str, idx: int) -> Dict:
    today = datetime.now(timezone.utc).date()
    rng = _deterministic_random(f"{today}-{sport_key}-{home}-{away}")

    home_strength = rng.uniform(0.30, 0.65)
    away_strength = rng.uniform(0.30, 0.65)
    draw_prob = rng.uniform(0.18, 0.30) if sport_key.startswith("soccer") else 0.0

    total = home_strength + away_strength + draw_prob
    p_home = home_strength / total
    p_away = away_strength / total
    p_draw = draw_prob / total

    margin = 1.05
    odds_home = round(margin / p_home, 2)
    odds_away = round(margin / p_away, 2)
    odds_draw = round(margin / p_draw, 2) if p_draw > 0 else None

    hour = 14 + (idx * 2) % 9
    minute = (idx * 15) % 60
    commence = datetime.combine(today, datetime.min.time()).replace(
        hour=hour, minute=minute, tzinfo=timezone.utc
    )

    event_id = hashlib.md5(f"{today}-{home}-{away}".encode()).hexdigest()[:16]

    outcomes = [
        {"name": home, "price": odds_home},
        {"name": away, "price": odds_away},
    ]
    if odds_draw:
        outcomes.append({"name": "Draw", "price": odds_draw})

    bookmakers = []
    for bm_name in ["1xBet", "Betway", "Melbet", "PMU", "SportyBet"]:
        bm_rng = _deterministic_random(f"{event_id}-{bm_name}")
        variation = bm_rng.uniform(-0.05, 0.05)
        bm_outcomes = [
            {"name": o["name"], "price": round(max(1.05, o["price"] * (1 + variation)), 2)}
            for o in outcomes
        ]
        bookmakers.append({
            "key": bm_name.lower().replace(" ", ""),
            "title": bm_name,
            "markets": [
                {"key": "h2h", "outcomes": bm_outcomes},
                {"key": "totals", "outcomes": [
                    {"name": "Over", "price": round(1.75 + bm_rng.uniform(-0.1, 0.2), 2), "point": 2.5},
                    {"name": "Under", "price": round(2.05 + bm_rng.uniform(-0.1, 0.2), 2), "point": 2.5},
                ]},
            ],
        })

    return {
        "id": event_id,
        "sport_key": sport_key,
        "sport_title": league,
        "commence_time": commence.isoformat(),
        "home_team": home,
        "away_team": away,
        "bookmakers": bookmakers,
    }


def get_all_mock_matches() -> List[Dict]:
    out = []
    for sk, fixtures in MOCK_FIXTURES.items():
        for i, (h, a, lg) in enumerate(fixtures):
            out.append(_generate_mock_event(sk, h, a, lg, i))
    return out


# ─── Real API : The Odds API (source principale) ─────────────────────────────

async def _fetch_real_sport(sport_key: str, markets: str = "h2h", regions: Optional[str] = None, db=None) -> List[Dict]:
    """Fetch odds pour une compétition avec retry borné et fallback h2h.

    Les réponses 404/422 sur une clé inactive ne doivent pas bloquer les autres
    sports. Les 429/5xx sont rejouées avec backoff afin d'éviter qu'une rafale
    de requêtes fasse disparaître basket/tennis/hockey/baseball après le foot.
    """
    if not ODDS_API_KEY:
        return []

    regions = (regions or _regions_for_sport(sport_key)).strip() or "eu"
    url = f"{ODDS_API_BASE}/sports/{sport_key}/odds"
    params = {
        "apiKey": ODDS_API_KEY,
        "regions": regions,
        "markets": markets,
        "oddsFormat": "decimal",
        "dateFormat": "iso",
        "commenceTimeFrom": (datetime.now(timezone.utc) - timedelta(hours=int(os.environ.get("ODDS_LIVE_LOOKBACK_HOURS", "4")))).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "commenceTimeTo": (datetime.now(timezone.utc) + timedelta(days=int(os.environ.get("ODDS_FETCH_HORIZON_DAYS", "7")))).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    max_retries = max(0, int(os.environ.get("ODDS_API_MAX_RETRIES", "3")))
    base_delay = max(0.25, float(os.environ.get("ODDS_API_RETRY_BASE_SECONDS", "1.25")))

    try:
        async with httpx.AsyncClient(timeout=25.0) as http:
            fallback_used = False
            attempt = 0
            while True:
                try:
                    r = await _budgeted_primary_get(db, http, url, params=params, category="odds")
                    _record_odds_api_response(r, context=sport_key)
                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    if attempt >= max_retries:
                        logger.warning("The Odds API %s -> réseau après %s tentative(s): %s", sport_key, attempt + 1, exc)
                        return []
                    await asyncio.sleep(base_delay * (2 ** attempt))
                    attempt += 1
                    continue

                if r.status_code == 200:
                    data = r.json()
                    if isinstance(data, list) and data:
                        ODDS_API_USAGE_STATE["last_successful_fetch_at"] = datetime.now(timezone.utc).isoformat()
                    return data if isinstance(data, list) else []

                if r.status_code == 401:
                    if ODDS_API_USAGE_STATE.get("quota_exhausted"):
                        logger.error(
                            "The Odds API: quota de crédits épuisé (OUT_OF_USAGE_CREDITS). "
                            "Les anciennes données sont conservées jusqu'au prochain quota disponible."
                        )
                    else:
                        logger.error(
                            "The Odds API: accès refusé (401), code=%s, message=%s",
                            ODDS_API_USAGE_STATE.get("last_error_code"),
                            ODDS_API_USAGE_STATE.get("last_error"),
                        )
                    return []

                if r.status_code == 422 and params.get("markets") != "h2h" and not fallback_used:
                    params = dict(params)
                    params["markets"] = "h2h"
                    fallback_used = True
                    continue

                # Clé de compétition inactive/inexistante : échec local seulement.
                if r.status_code in (400, 404, 422):
                    logger.info("The Odds API %s -> HTTP %s (inactive/non couverte)", sport_key, r.status_code)
                    return []

                if r.status_code == 429 or 500 <= r.status_code < 600:
                    if attempt >= max_retries:
                        logger.warning("The Odds API %s -> HTTP %s après retries", sport_key, r.status_code)
                        return []
                    retry_after = r.headers.get("Retry-After")
                    try:
                        delay = max(base_delay * (2 ** attempt), float(retry_after)) if retry_after else base_delay * (2 ** attempt)
                    except Exception:
                        delay = base_delay * (2 ** attempt)
                    await asyncio.sleep(min(delay, 20.0))
                    attempt += 1
                    continue

                logger.warning("The Odds API %s -> HTTP %s (markets=%s, region=%s)", sport_key, r.status_code, params.get("markets"), regions)
                return []
    except Exception as exc:
        logger.warning("The Odds API %s -> exception: %s", sport_key, exc)
        return []


async def _discover_active_sport_keys() -> List[str]:
    """Découvre automatiquement les compétitions actuellement actives.

    /sports est un endpoint de découverte : il ne consomme pas le crédit
    d'un appel /odds. Cela évite qu'un nouveau championnat (par exemple un
    tour de qualification UEFA) soit absent simplement parce que son slug
    n'a pas été ajouté manuellement dans REAL_SPORT_KEYS.
    """
    if not ODDS_API_KEY:
        return []
    url = f"{ODDS_API_BASE}/sports"
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(url, params={"apiKey": ODDS_API_KEY})
            _record_odds_api_response(r, context="sports-discovery")
            if r.status_code != 200:
                logger.warning("The Odds API /sports -> HTTP %s", r.status_code)
                return []
            data = r.json()
            if not isinstance(data, list):
                return []
            keys = []
            for sport in data:
                if not isinstance(sport, dict):
                    continue
                # /sports retourne par défaut les sports de saison (in-season).
                # Ne pas exiger active=true ici : certaines competitions peuvent
                # etre presentes dans le catalogue alors que le flag active est
                # temporairement incoherent avec la disponibilite des rencontres.
                key = str(sport.get("key") or "").strip()
                if key.startswith(("soccer_", "basketball_", "tennis_", "icehockey_", "baseball_", "mma_", "americanfootball_")):
                    keys.append(key)
            return sorted(set(keys))
    except Exception as exc:
        logger.warning("The Odds API /sports -> exception: %s", exc)
        return []


async def _check_sport_active(sport_key: str) -> bool:
    """Vérifie si un sport est actif (0 crédit consommé)."""
    return sport_key in set(await _discover_active_sport_keys())


# ─── Source secondaire : odds-api.io (ligues mineures) ───────────────────────
#
# NOTE IMPORTANTE : le schema exact de /v3/odds (structure des bookmakers et
# marches) n'a pas encore ete verifie avec un exemple reel de reponse. Ce code
# est ecrit de facon defensive (plusieurs noms de champs essayes, try/except
# partout) pour ne jamais casser le site si le format ne correspond pas
# exactement. Si aucun match n'apparait via cette source, il faudra ajuster
# le mapping des champs ci-dessous avec un exemple reel de /v3/odds.

async def _fetch_odds_api_io_events(league_slug: str, sport: str = "football") -> List[Dict]:
    """Recupere les evenements a venir pour une ligue donnee via odds-api.io."""
    if not ODDS_API_IO_KEY:
        return []
    url = f"{ODDS_API_IO_BASE}/events"
    params = {
        "apiKey": ODDS_API_IO_KEY,
        "sport": sport,
        "league": league_slug,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(url, params=params)
            if r.status_code != 200:
                logger.warning(f"odds-api.io events [{league_slug}] -> HTTP {r.status_code}: {r.text[:200]}")
                return []
            data = r.json()
            return data if isinstance(data, list) else []
    except Exception as e:
        logger.warning(f"odds-api.io events [{league_slug}] -> exception: {e}")
        return []


async def _fetch_odds_api_io_all_events_unfiltered(league_slug: str, sport: str = "football") -> List[Dict]:
    """Recupere les evenements d'une ligue sans imposer de filtre de statut.

    Important : odds-api.io utilise notamment le statut ``settled`` pour les
    evenements termines. Le filtre ``status=pending`` de _fetch_odds_api_io_events
    ne permet donc jamais de recuperer les matchs termines.
    """
    if not ODDS_API_IO_KEY:
        return []
    url = f"{ODDS_API_IO_BASE}/events"
    params = {"apiKey": ODDS_API_IO_KEY, "sport": sport, "league": league_slug}
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(url, params=params)
            if r.status_code != 200:
                logger.warning(
                    f"odds-api.io events (non filtre) [{league_slug}] -> "
                    f"HTTP {r.status_code}: {r.text[:200]}"
                )
                return []
            data = r.json()
            return data if isinstance(data, list) else []
    except Exception as e:
        logger.warning(
            f"odds-api.io events (non filtre) [{league_slug}] -> exception: {e}"
        )
        return []


async def _fetch_odds_api_io_finished_events(
    league_slug: str, sport: str = "football"
) -> List[Dict]:
    """Retourne uniquement les evenements termines d'une ligue.

    Le statut reel confirme par la sonde de l'API est ``settled``. Pour les
    valeurs de statut inconnues, on garde un filet de securite base sur le
    temps (> 4h) et la presence d'un score.
    """
    events = await _fetch_odds_api_io_all_events_unfiltered(league_slug, sport)
    now = datetime.now(timezone.utc)
    finished: List[Dict] = []

    for evt in events:
        status = str(evt.get("status", "")).strip().lower()
        if status == "settled":
            finished.append(evt)
            continue
        if status == "pending":
            continue

        try:
            commence_dt = datetime.fromisoformat(
                str(evt.get("date", "")).replace("Z", "+00:00")
            )
            if commence_dt.tzinfo is None:
                commence_dt = commence_dt.replace(tzinfo=timezone.utc)
            scores = evt.get("scores") or {}
            has_score = (
                scores.get("home") is not None and scores.get("away") is not None
            )
            if (now - commence_dt) > timedelta(hours=4) and has_score:
                finished.append(evt)
        except Exception:
            continue

    return finished


_oaio_odds_blocked_until = 0.0


async def _fetch_odds_api_io_odds(event_id) -> Optional[Dict]:
    """
    Recupere les cotes pour un evenement donne via odds-api.io.
    NOTE : le plan actuel limite a 1 bookmaker autorise (Bet365) — confirme
    en test reel le 23/07/2026 ("Access denied... Allowed: Bet365").
    """
    global _oaio_odds_blocked_until
    if not ODDS_API_IO_KEY or time.monotonic() < _oaio_odds_blocked_until:
        return None
    url = f"{ODDS_API_IO_BASE}/odds"
    params = {"apiKey": ODDS_API_IO_KEY, "eventId": event_id, "bookmakers": "Bet365"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(url, params=params)
            if r.status_code != 200:
                if r.status_code in (401,403,429):
                    delay = 86400 if r.status_code in (401,403) else 3600
                    _oaio_odds_blocked_until = time.monotonic()+delay
                logger.warning("odds-api.io odds: HTTP %s; unsupported/rate-limited calls paused", r.status_code)
                return None
            return r.json()
    except Exception as e:
        logger.warning(f"odds-api.io odds [eventId={event_id}] -> exception: {e}")
        return None


# Mapping des noms de marches odds-api.io (confirmes par exemple reel du
# 23/07/2026) -> cles internes utilisees par prediction_engine.py
_OAIO_MARKET_NAME_MAP = {
    "ML": "h2h",
    "Draw No Bet": "draw_no_bet",
    "Totals": "totals",
    "Goals Over/Under": "totals",
    "Both Teams To Score": "btts",
}


def _convert_odds_api_io_event(event: Dict, odds_data: Optional[Dict], sport: str = "football") -> Optional[Dict]:
    """
    Convertit un evenement odds-api.io (structure reelle confirmee) au format
    interne (id/sport_key/sport_title/commence_time/home_team/away_team/
    bookmakers[{key,title,markets[{key,outcomes[{name,price,point}]}]}]).

    Structure source reelle :
    {
      "id": 72179162, "home": "Qarabag FK", "away": "PFC CSKA Sofia",
      "date": "2026-07-23T16:00:00Z",
      "league": {"name": "...", "slug": "..."},
      "bookmakers": {
        "Bet365": [
          {"name": "ML", "odds": [{"home": "1.420", "draw": "4.333", "away": "6.000"}]},
          {"name": "Totals", "odds": [{"hdp": 2.5, "over": "1.800", "under": "2.000"}]},
          {"name": "Both Teams To Score", "odds": [{"yes": "2.100", "no": "1.666"}]},
          {"name": "Draw No Bet", "odds": [{"home": "1.166", "away": "4.500"}]},
          ...
        ]
      }
    }
    """
    try:
        event_id = event.get("id")
        home = event.get("home")
        away = event.get("away")
        commence = event.get("date")
        league_name = (event.get("league") or {}).get("name", "Football")

        if not (event_id and home and away and commence):
            return None
        if not odds_data:
            return None

        bookmakers_raw = odds_data.get("bookmakers", {})
        if not isinstance(bookmakers_raw, dict):
            return None

        bookmakers = []
        for bm_name, bm_markets in bookmakers_raw.items():
            if not isinstance(bm_markets, list):
                continue
            markets = []
            for mk in bm_markets:
                raw_name = mk.get("name", "")
                internal_key = _OAIO_MARKET_NAME_MAP.get(raw_name)
                if not internal_key:
                    continue
                odds_list = mk.get("odds", [])
                if not odds_list:
                    continue
                row = odds_list[0]  # ligne principale (hdp/point par defaut)
                outcomes = []

                if internal_key == "h2h":
                    if row.get("home"):
                        outcomes.append({"name": home, "price": float(row["home"])})
                    if row.get("away"):
                        outcomes.append({"name": away, "price": float(row["away"])})
                    if row.get("draw"):
                        outcomes.append({"name": "Draw", "price": float(row["draw"])})

                elif internal_key == "draw_no_bet":
                    if row.get("home"):
                        outcomes.append({"name": home, "price": float(row["home"])})
                    if row.get("away"):
                        outcomes.append({"name": away, "price": float(row["away"])})

                elif internal_key == "totals":
                    point = row.get("hdp")
                    if row.get("over"):
                        entry = {"name": "Over", "price": float(row["over"])}
                        if point is not None:
                            entry["point"] = float(point)
                        outcomes.append(entry)
                    if row.get("under"):
                        entry = {"name": "Under", "price": float(row["under"])}
                        if point is not None:
                            entry["point"] = float(point)
                        outcomes.append(entry)

                elif internal_key == "btts":
                    if row.get("yes"):
                        outcomes.append({"name": "Yes", "price": float(row["yes"])})
                    if row.get("no"):
                        outcomes.append({"name": "No", "price": float(row["no"])})

                if outcomes:
                    # Eviter les doublons de marche (ex: Totals + Goals Over/Under
                    # mappent tous deux vers "totals" — on garde le premier trouve)
                    if not any(m["key"] == internal_key for m in markets):
                        markets.append({"key": internal_key, "outcomes": outcomes})

            if markets:
                bookmakers.append({
                    "key": str(bm_name).lower().replace(" ", ""),
                    "title": str(bm_name),
                    "markets": markets,
                })

        if not bookmakers:
            return None

        return {
            "id": f"oaio-{event_id}",
            "sport_key": {"ice-hockey": "icehockey_minor_leagues", "basketball": "basketball_minor_leagues"}.get(sport, "soccer_minor_leagues"),
            "sport_title": league_name,
            "commence_time": commence,
            "home_team": home,
            "away_team": away,
            "bookmakers": bookmakers,
        }
    except Exception:
        return None


async def _fetch_odds_api_io_matches() -> List[Dict]:
    """Récupère les matchs à venir disposant réellement de cotes via odds-api.io.

    Important : la version précédente répartissait arbitrairement un budget par
    championnat. Un championnat avec beaucoup de matchs pouvait donc perdre des
    affiches pourtant disponibles dans l'API. Ici, tous les événements à venir
    sont d'abord collectés, puis les appels de cotes sont attribués en priorité
    aux matchs d'aujourd'hui, puis aux prochains matchs, sans quota minimum
    artificiel par ligue.

    La limite reste nécessaire car le fournisseur impose un quota d'appels /odds.
    Elle ne supprime donc jamais un match de la source principale The Odds API;
    elle concerne uniquement cette source secondaire.
    """
    if not ODDS_API_IO_KEY:
        return []

    # Marge sous un quota courant de 100 appels/heure. Peut être augmenté par
    # variable d'environnement si le compte dispose d'un quota supérieur.
    MAX_TOTAL_ODDS_CALLS = int(os.environ.get("ODDS_API_IO_MAX_CALLS", "92"))
    today = datetime.now(timezone.utc).date()
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=7)

    def _event_dt(evt):
        try:
            dt = datetime.fromisoformat(str(evt.get("date", "")).replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None

    def _event_sort_key(evt):
        dt = _event_dt(evt)
        if dt is None:
            return (3, datetime.max.replace(tzinfo=timezone.utc))
        if dt.date() == today:
            return (0, dt)
        if dt >= now:
            return (1, dt)
        return (2, dt)

    # 1) Collecte complète des événements à venir de toutes les ligues.
    candidates = []
    seen_ids = set()
    league_errors = {}
    for league_slug in ODDS_API_IO_LEAGUES:
        try:
            events = await _fetch_odds_api_io_all_events_unfiltered(league_slug, sport="football")
            for evt in events:
                event_id = evt.get("id")
                dt = _event_dt(evt)
                if not event_id or dt is None:
                    continue
                if dt < now or dt > horizon:
                    continue
                marker = ("football", str(event_id))
                if marker in seen_ids:
                    continue
                seen_ids.add(marker)
                candidates.append((league_slug, evt, "football"))
        except Exception as exc:
            league_errors[league_slug] = str(exc)

    # Hockey et basketball suivent exactement la même logique.
    for league_slug, sport in [
        *((lg, "ice-hockey") for lg in ODDS_API_IO_HOCKEY_LEAGUES),
        *((lg, "basketball") for lg in ODDS_API_IO_BASKETBALL_LEAGUES),
    ]:
        try:
            events = await _fetch_odds_api_io_all_events_unfiltered(league_slug, sport=sport)
            for evt in events:
                event_id = evt.get("id")
                dt = _event_dt(evt)
                if not event_id or dt is None or dt < now or dt > horizon:
                    continue
                marker = (sport, str(event_id))
                if marker in seen_ids:
                    continue
                seen_ids.add(marker)
                candidates.append((league_slug, evt, sport))
        except Exception as exc:
            league_errors[league_slug] = str(exc)

    # Aujourd'hui d'abord, puis les prochains jours. Cela évite qu'un gros
    # championnat futur consomme tout le quota avant les matchs du jour.
    candidates.sort(key=lambda item: _event_sort_key(item[1]))

    out: List[Dict] = []
    calls_used = 0
    converted_ids = set()

    for league_slug, evt, sport in candidates:
        if calls_used >= MAX_TOTAL_ODDS_CALLS:
            break
        event_id = evt.get("id")
        try:
            odds_data = await _fetch_odds_api_io_odds(event_id)
            calls_used += 1
            converted = _convert_odds_api_io_event(evt, odds_data, sport=sport)
            if converted:
                converted_ids.add(str(event_id))
                out.append(converted)
        except Exception as exc:
            calls_used += 1
            logger.warning("odds-api.io odds event %s -> %s", event_id, exc)

    logger.warning(
        "odds-api.io : %s événement(s) candidats, %s appel(s) /odds, "
        "%s match(s) avec cotes convertis, %s erreur(s) de ligue",
        len(candidates), calls_used, len(out), len(league_errors),
    )
    return out


# ─── Enrichissement : BSD Sports Addon (predictions ML) ──────────────────────

async def _fetch_bsd_predictions() -> List[Dict]:
    """
    Recupere les predictions ML (CatBoost) de BSD pour les matchs a venir.
    Retourne [] silencieusement en cas d'erreur ou de cle absente — cette
    source est un enrichissement optionnel, jamais un point de blocage.
    """
    if not BSD_API_KEY:
        return []
    url = f"{BSD_API_BASE}/predictions/"
    headers = {"Authorization": f"Token {BSD_API_KEY}"}
    params = {"upcoming": "true"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(url, headers=headers, params=params)
            if r.status_code != 200:
                return []
            data = r.json()
            results = data.get("results", data) if isinstance(data, dict) else data
            return results if isinstance(results, list) else []
    except Exception:
        return []


def _first_present(obj: Dict, keys: List[str], default=None):
    for key in keys:
        if isinstance(obj, dict) and obj.get(key) is not None:
            return obj.get(key)
    return default

TEAM_ALIASES={"psg":"parissaintgermain","parissg":"parissaintgermain","parissaintgermainfc":"parissaintgermain","manutd":"manchesterunited","manchesterunitedfc":"manchesterunited","mancity":"mancity","inter":"intermilan","internazionale":"intermilan","barca":"barcelona","fcbarcelona":"barcelona"}

def _normalize_team_name(name: str) -> str:
    value=unicodedata.normalize("NFKD",str(name or "")).encode("ascii","ignore").decode().lower()
    value=re.sub(r"[^a-z0-9]+","",value)
    return TEAM_ALIASES.get(value,value)


def _attach_bsd_enrichment(matches: List[Dict], bsd_predictions: List[Dict]) -> List[Dict]:
    """
    Associe les predictions BSD aux matchs existants par correspondance de
    noms d'equipes (normalises), et ajoute un champ "bsd_enrichment" sans
    toucher au reste de la structure. Le moteur maison (prediction_engine.py)
    reste la seule source du pick officiel — BSD vient juste enrichir le
    contexte affiche.
    """
    if not bsd_predictions:
        return matches

    bsd_by_teams = {}
    for pred in bsd_predictions:
        try:
            home = _first_present(pred, ["home_team", "homeTeam"], {})
            away = _first_present(pred, ["away_team", "awayTeam"], {})
            home_name = home.get("name") if isinstance(home, dict) else home
            away_name = away.get("name") if isinstance(away, dict) else away
            if not (home_name and away_name):
                continue
            key = (_normalize_team_name(home_name), _normalize_team_name(away_name))
            bsd_by_teams[key] = pred
        except Exception:
            continue

    for m in matches:
        key = (_normalize_team_name(m.get("home_team", "")), _normalize_team_name(m.get("away_team", "")))
        if key in bsd_by_teams:
            m["bsd_enrichment"] = bsd_by_teams[key]

    return matches


def _event_identity(event: Dict):
    return (_normalize_team_name(event.get("home_team","")), _normalize_team_name(event.get("away_team","")))

def _event_time(event: Dict):
    try:
        return datetime.fromisoformat(str(event.get("commence_time","")).replace("Z","+00:00")).astimezone(timezone.utc)
    except Exception: return None

def _same_event(a: Dict,b: Dict)->bool:
    if a.get("id") and b.get("id") and str(a["id"])==str(b["id"]): return True
    if _event_identity(a)!=_event_identity(b): return False
    ta,tb=_event_time(a),_event_time(b)
    return True if ta is None or tb is None else abs((ta-tb).total_seconds())<=21600

def _merge_market_list(target_markets: List[Dict], incoming_markets: List[Dict]):
    existing={m.get("key"):m for m in target_markets}
    for market in incoming_markets:
        key=market.get("key")
        if not key: continue
        if key not in existing:
            target_markets.append(market); existing[key]=market; continue
        target=existing[key].setdefault("outcomes",[])
        seen={(str(o.get("name")),str(o.get("point"))) for o in target}
        for outcome in market.get("outcomes",[]):
            marker=(str(outcome.get("name")),str(outcome.get("point")))
            if marker not in seen: target.append(outcome); seen.add(marker)

def _merge_events(events_a: List[Dict], events_b: List[Dict]) -> List[Dict]:
    merged=[dict(e) for e in events_a]
    for e in merged: e["bookmakers"]=[dict(b) for b in e.get("bookmakers",[])]
    for incoming in events_b:
        existing=next((e for e in merged if _same_event(e,incoming)),None)
        if existing is None: merged.append(incoming); continue
        books={_normalize_bookmaker_key(b.get("key") or b.get("title")):b for b in existing.get("bookmakers",[])}
        for bm in incoming.get("bookmakers",[]):
            key=_normalize_bookmaker_key(bm.get("key") or bm.get("title")); bm["key"]=key; bm["quality_weight"]=_bookmaker_quality(bm.get("title") or key)
            if key not in books: existing.setdefault("bookmakers",[]).append(bm); books[key]=bm
            else: _merge_market_list(books[key].setdefault("markets",[]),bm.get("markets",[]))
    return _annotate_bookmakers(merged)


async def fetch_all_matches(db) -> List[Dict]:
    """Lecture Mongo uniquement; aucun appel API depuis une requete utilisateur."""
    cache=await db.odds_cache.find_one({"_id":"all_matches"})
    if not cache: return []
    data=cache.get("data",[])
    return data if isinstance(data,list) else []


async def _force_fetch_and_cache(db) -> List[Dict]:
    """Recharge les cotes réelles en protégeant le multi-sports et le cache.

    Principes :
    - seules les compétitions réellement actives découvertes sont interrogées
      quand la découverte fonctionne ;
    - concurrence bornée pour ne pas saturer le fournisseur ;
    - ordre intercalé par familles de sports pour que le football ne monopolise
      jamais la rafale ;
    - si un sport échoue temporairement, ses événements encore valides du cache
      précédent sont conservés au lieu d'être effacés.
    """
    _reset_refresh_transient_state()
    previous_cache = await db.odds_cache.find_one({"_id": "all_matches"})
    previous_matches = previous_cache.get("data", []) if previous_cache else []
    if not isinstance(previous_matches, list):
        previous_matches = []

    if not ODDS_API_KEY:
        if previous_matches:
            return previous_matches
        matches = get_all_mock_matches()
        await _save_to_cache(db, matches)
        return matches

    discovered = await _discover_active_sport_keys()
    if discovered:
        # La découverte est la source de vérité : évite des dizaines d'appels
        # vers d'anciens slugs hors saison ou retirés.
        discovered_set = set(discovered)
        configured_active = [k for k in REAL_SPORT_KEYS if k in discovered_set]
        sport_keys = list(dict.fromkeys(configured_active + discovered))
    else:
        # En cas d'indisponibilité temporaire de /sports, on garde la liste connue.
        sport_keys = list(dict.fromkeys(REAL_SPORT_KEYS))

    # Intercaler les familles de sports : football, basket, tennis, hockey, etc.
    # Ainsi une éventuelle limitation fournisseur n'affecte pas systématiquement
    # les sports placés à la fin de la liste.
    groups: Dict[str, List[str]] = {}
    for sk in sport_keys:
        groups.setdefault(_sport_group_from_key(sk), []).append(sk)
    preferred_order = ["football", "basketball", "tennis", "hockey", "baseball", "mma", "american_football", "other"]
    ordered_keys: List[str] = []
    while any(groups.get(g) for g in preferred_order):
        for g in preferred_order:
            if groups.get(g):
                ordered_keys.append(groups[g].pop(0))

    # Rotate collection priority; paced credits must not starve leagues at the
    # end of the catalogue. Previous cached matches are preserved below.
    if ordered_keys:
        offset = (int(time.time() // 14400) * 17) % len(ordered_keys)
        ordered_keys = ordered_keys[offset:] + ordered_keys[:offset]

    logger.warning(
        "The Odds API : %s compétition(s) actives à interroger (%s découvertes)",
        len(ordered_keys), len(discovered),
    )

    concurrency = max(1, min(int(os.environ.get("ODDS_FETCH_CONCURRENCY", "2")), 4))
    semaphore = asyncio.Semaphore(concurrency)
    fetched_by_key: Dict[str, List[Dict]] = {}

    async def _fetch_one(sk: str):
        async with semaphore:
            if ODDS_API_USAGE_STATE.get("quota_exhausted"):
                fetched_by_key[sk] = []
                return
            result = await _fetch_real_sport(
                sk, markets=_get_markets_for_sport(sk), regions=_regions_for_sport(sk), db=db
            )
            fetched_by_key[sk] = result if isinstance(result, list) else []
            # Espacement volontaire pour éviter les rafales 429.
            await asyncio.sleep(max(0.0, float(os.environ.get("ODDS_FETCH_SPACING_SECONDS", "0.75"))))

    await asyncio.gather(*[_fetch_one(sk) for sk in ordered_keys], return_exceptions=True)

    matches: List[Dict] = []
    for sk in ordered_keys:
        matches.extend(fetched_by_key.get(sk, []))
    primary_fresh_count = len(matches)
    secondary_fresh_count = 0

    # Source secondaire odds-api.io pour certaines ligues football/basket/hockey.
    try:
        secondary_matches = await _fetch_odds_api_io_matches()
        logger.warning("odds-api.io : %s match(s) recupere(s) au total", len(secondary_matches))
        if secondary_matches:
            secondary_fresh_count = len(secondary_matches)
            matches = _merge_events(matches, secondary_matches)
    except Exception as exc:
        logger.warning("odds-api.io : echec global -> %s", exc)

    # Préserver le dernier cache valide d'une famille si ce refresh n'a ramené
    # aucun événement pour cette famille. Les événements expirés seront ensuite
    # éliminés par la fenêtre temporelle normale.
    new_groups = {_sport_group_from_match(m) for m in matches}
    preserve_groups = {"football", "basketball", "tennis", "hockey", "baseball", "mma", "american_football"}
    missing_groups = preserve_groups - new_groups
    if missing_groups and previous_matches:
        preserved = [m for m in previous_matches if _sport_group_from_match(m) in missing_groups]
        if preserved:
            logger.warning("Cache de secours conservé pour %s: %s événement(s)", sorted(missing_groups), len(preserved))
            matches = _merge_events(matches, preserved)

    # En production, ne jamais remplacer une panne fournisseur par de faux matchs.
    if not matches:
        if previous_matches:
            logger.error("Refresh sans données : conservation intégrale du cache précédent")
            matches = previous_matches
        elif os.environ.get("ALLOW_MOCK_ODDS", "false").lower() in {"1", "true", "yes"}:
            matches = get_all_mock_matches()
        else:
            logger.error("Refresh sans données et sans cache précédent")
            return []

    now = datetime.now(timezone.utc)
    filtered: List[Dict] = []
    for m in matches:
        if os.environ.get("ODDS_EXCLUDE_FRIENDLIES", "false").lower() in {"1", "true", "yes"} and _is_friendly(m):
            continue
        try:
            ct = datetime.fromisoformat(str(m.get("commence_time", "")).replace("Z", "+00:00"))
            if ct.tzinfo is None:
                ct = ct.replace(tzinfo=timezone.utc)
            if (now - ct) > timedelta(hours=24):
                continue
            if (ct - now) > timedelta(days=int(os.environ.get("ODDS_FETCH_HORIZON_DAYS", "7"))):
                continue
        except Exception:
            pass
        if len(m.get("bookmakers", []) or []) < 1:
            continue
        filtered.append(m)

    try:
        bsd_predictions = await _fetch_bsd_predictions()
        if bsd_predictions:
            filtered = _attach_bsd_enrichment(filtered, bsd_predictions)
    except Exception:
        pass

    def _sort_key(m):
        try:
            ct = datetime.fromisoformat(str(m.get("commence_time", "")).replace("Z", "+00:00"))
            if ct.tzinfo is None:
                ct = ct.replace(tzinfo=timezone.utc)
            elapsed = (now - ct).total_seconds()
            if 0 <= elapsed <= 14400:
                return (0, ct)
            if elapsed < 0:
                return (1, ct)
            return (2, ct)
        except Exception:
            return (1, datetime.max.replace(tzinfo=timezone.utc))

    filtered.sort(key=_sort_key)

    per_comp: Dict[str, int] = {}
    diversified: List[Dict] = []
    max_per_comp = int(os.environ.get("ODDS_MAX_PER_COMPETITION", "1000"))
    for m in filtered:
        key = m.get("sport_title") or "Other"
        if per_comp.get(key, 0) >= max_per_comp:
            continue
        diversified.append(m)
        per_comp[key] = per_comp.get(key, 0) + 1

    try:
        diversified = await asyncio.wait_for(_enrich_extra_football_markets(db, diversified), timeout=240)
    except Exception as exc:
        logger.warning("Supplemental markets deferred: %s", type(exc).__name__)
    final = _annotate_bookmakers(diversified)
    await _save_to_cache(
        db,
        final,
        refresh_meta={
            "primary_fresh_count": primary_fresh_count,
            "secondary_fresh_count": secondary_fresh_count,
            "fresh_network_count": primary_fresh_count + secondary_fresh_count,
        },
    )

    counts: Dict[str, int] = {}
    for m in final:
        g = _sport_group_from_match(m)
        counts[g] = counts.get(g, 0) + 1
    logger.warning("Refresh final multi-sports: %s", counts)
    return final


async def _save_to_cache(db, matches: List[Dict], refresh_meta: Optional[Dict] = None):
    """Sauvegarde le cache avec ventilation et diagnostic fournisseur."""
    by_sport: Dict[str, int] = {}
    for match in matches or []:
        group = _sport_group_from_match(match)
        by_sport[group] = by_sport.get(group, 0) + 1

    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "data": matches,
        "updated_at": now_iso,
        "count": len(matches),
        "by_sport": by_sport,
        "provider_status": _provider_status_snapshot(),
        "refresh_meta": refresh_meta or {},
    }
    if refresh_meta and int(refresh_meta.get("fresh_network_count", 0) or 0) > 0:
        payload["last_successful_network_refresh_at"] = now_iso

    await db.odds_cache.update_one(
        {"_id": "all_matches"},
        {"$set": payload},
        upsert=True,
    )


async def refresh_matches_worker(db) -> Dict:
    """Worker de refresh avec état du quota et ventilation par sport."""
    matches = await _force_fetch_and_cache(db)
    cache_status = await get_odds_cache_status(db)
    provider = cache_status.get("provider_status") or _provider_status_snapshot()
    return {
        "ok": not bool(provider.get("quota_exhausted")),
        "count": len(matches),
        "by_sport": cache_status.get("by_sport", {}),
        "refreshed_at": datetime.now(timezone.utc).isoformat(),
        "last_successful_network_refresh_at": cache_status.get("last_successful_network_refresh_at"),
        "provider_status": provider,
        "message": (
            "Quota The Odds API épuisé : le cache existant a été conservé."
            if provider.get("quota_exhausted")
            else "Refresh terminé."
        ),
    }


class LiveScoresProviderError(RuntimeError):
    """Code de diagnostic public, sans clé API ni contenu fournisseur."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


async def fetch_live_scores(db) -> List[Dict]:
    """Collecte dédiée au Live : cache distinct, durée bornée et erreurs explicites.

    La réconciliation du Track Record conserve son propre cache all_scores.
    Les scores ne sont jamais remplacés par une fausse réponse vide après panne.
    """
    if not ODDS_API_KEY:
        raise LiveScoresProviderError("provider_not_configured")

    odds_cache = await db.odds_cache.find_one({"_id": "all_matches"})
    keys = list(dict.fromkeys(
        row.get("sport_key") for row in (odds_cache or {}).get("data", [])
        if isinstance(row, dict) and isinstance(row.get("sport_key"), str)
        and row["sport_key"].startswith(("soccer_", "basketball_", "tennis_", "icehockey_", "baseball_", "mma_", "americanfootball_"))
    ))
    # Sans cache de cotes, la découverte est elle-même limitée dans le temps.
    if not keys:
        try:
            keys = await asyncio.wait_for(_discover_active_sport_keys(), timeout=5)
        except asyncio.TimeoutError:
            keys = []
    keys = keys or list(dict.fromkeys(REAL_SPORT_KEYS))

    now = datetime.now(timezone.utc)
    if keys:
        rotation = int(now.timestamp() // 300) % len(keys)
        keys = keys[rotation:] + keys[:rotation]
    old = await db.scores_cache.find_one({"_id": "live_scores"})
    succeeded: Dict[str, List[Dict]] = {}
    failures: Dict[str, str] = {}
    semaphore = asyncio.Semaphore(5)
    # Une connexion partagée évite un nouveau handshake pour chaque championnat.
    async with httpx.AsyncClient(timeout=8.0) as client:
        async def collect(key):
            async with semaphore:
                try:
                    response = await _budgeted_primary_get(
                        db, client, f"{ODDS_API_BASE}/sports/{key}/scores", category="live",
                        params={"apiKey": ODDS_API_KEY, "daysFrom": 1, "dateFormat": "iso"},
                    )
                    if response.status_code != 200:
                        code = "provider_unavailable"
                        if response.status_code in (401, 403):
                            try:
                                provider_code = response.json().get("error_code", "")
                            except (ValueError, AttributeError):
                                provider_code = ""
                            code = "provider_quota_exhausted" if provider_code in ("OUT_OF_USAGE_CREDITS", "USAGE_LIMIT_REACHED") else "provider_access_denied"
                        elif response.status_code == 429:
                            code = "provider_rate_limited"
                        elif response.status_code in (400, 404, 422):
                            code = "sport_not_supported"
                        failures[key] = code
                        return
                    rows = response.json()
                    if not isinstance(rows, list):
                        failures[key] = "invalid_provider_response"
                        return
                    succeeded[key] = [
                        {**row, "sport_key": row.get("sport_key") or key, "_score_fetched_at": now.isoformat()}
                        for row in rows if isinstance(row, dict)
                    ]
                except PrimaryBudgetError as exc:
                    failures[key] = exc.code
                except (httpx.TimeoutException, asyncio.TimeoutError):
                    failures[key] = "provider_timeout"
                except Exception as exc:
                    # Ne jamais journaliser une URL contenant apiKey.
                    logger.warning("Live scores %s: %s", key, type(exc).__name__)
                    failures[key] = "provider_unavailable"

        tasks = [asyncio.create_task(collect(key)) for key in keys]
        try:
            _done, pending = await asyncio.wait(tasks, timeout=30)
            for task in pending:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    for key in keys:
        if key not in succeeded and key not in failures:
            failures[key] = "provider_timeout"
    if not succeeded:
        codes = set(failures.values())
        code = next((c for c in ("credit_budget_paced", "credit_budget_reached", "credit_budget_unavailable", "provider_quota_exhausted", "provider_access_denied", "provider_rate_limited", "provider_timeout", "sport_not_supported") if c in codes), "provider_unavailable")
        raise LiveScoresProviderError(code)

    rows = [row for items in succeeded.values() for row in items]
    # Conserver au maximum cinq minutes les compétitions en échec, sans modifier
    # leur timestamp réel ni les présenter comme fraîchement collectées.
    for row in (old or {}).get("data", []):
        if not isinstance(row, dict) or row.get("sport_key") not in failures:
            continue
        try:
            stamp = datetime.fromisoformat(str(row.get("_score_fetched_at") or old.get("updated_at")).replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            if 0 <= (now - stamp).total_seconds() <= 300:
                rows.append(row)
        except (ValueError, TypeError):
            continue
    deduplicated = {}
    for index, row in enumerate(rows):
        identity = str(row.get("id") or f"{row.get('sport_key')}:{row.get('home_team')}:{row.get('away_team')}:{row.get('commence_time')}:{index}")
        deduplicated[identity] = row
    rows = list(deduplicated.values())
    # Pour l'expiration du snapshot, utiliser le plus ancien score conservé.
    oldest = min((row.get("_score_fetched_at", now.isoformat()) for row in rows), default=now.isoformat())
    await db.scores_cache.update_one(
        {"_id": "live_scores"},
        {"$set": {"data": rows, "updated_at": oldest, "collected_at": now.isoformat(),
                  "partial": bool(failures), "failed_sports": len(failures),
                  "sport_keys": list(succeeded)}},
        upsert=True,
    )
    # Publier le cache AVANT l'archivage : une archive lente ne bloque pas le Live.
    try:
        await asyncio.wait_for(_archive_scores(db, rows), timeout=10)
    except asyncio.TimeoutError:
        logger.warning("Live score archive: timeout; snapshot already published")
    return rows


async def fetch_scores_for_sport(sport_key: str, days_from: int = 3, db=None) -> List[Dict]:
    """Scores only; credentials and HTTP bodies are never written to logs."""
    if not ODDS_API_KEY or not sport_key:return []
    _result_http_status[sport_key] = {"status":"network_error"}
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response=await _budgeted_primary_get(db,client,f"{ODDS_API_BASE}/sports/{sport_key}/scores",category="results",params={"apiKey":ODDS_API_KEY,"daysFrom":max(1,min(int(days_from or 3),3)),"dateFormat":"iso"})
        code=response.status_code
        _result_http_status[sport_key]={"status":"available" if code==200 else "provider_error","http_status":code}
        for header, field in (("x-requests-remaining","requests_remaining"),("x-requests-used","requests_used")):
            value = response.headers.get(header)
            if value is not None and str(value).isdigit():
                _result_http_status[sport_key][field] = int(value)
        if code!=200:
            logger.warning("Scores %s: HTTP %s",sport_key,code)
            return []
        data=response.json()
        if not isinstance(data,list):
            _result_http_status[sport_key]={"status":"invalid_response"};return []
        return [row for row in data if isinstance(row,dict)]
    except PrimaryBudgetError as exc:
        _result_http_status[sport_key] = {
            "status": "budget_paced" if exc.code == "credit_budget_paced" else "local_budget_reached",
            "budget_reason": exc.code,
        }
        return []
    except Exception as exc:
        logger.warning("Scores %s: %s",sport_key,type(exc).__name__)
        return []


async def fetch_odds_api_io_scores_map(db=None, priority_matches=None) -> Dict[str, Dict]:
    """Verified final scores, four rotating leagues per run, bounded parallelism."""
    if not ODDS_API_IO_KEY:return {}
    async with _secondary_result_lock:
        now=datetime.now(timezone.utc);state={}
        if db is not None:state=await db.scores_cache.find_one({"_id":"secondary_results"}) or {}
        else:state=dict(_secondary_result_memory)
        data=dict(state.get("data") or {});checked=state.get("checked") or {}
        leagues=[(slug,"football") for slug in ODDS_API_IO_LEAGUES]+[(slug,"ice-hockey") for slug in ODDS_API_IO_HOCKEY_LEAGUES]+[(slug,"basketball") for slug in ODDS_API_IO_BASKETBALL_LEAGUES]
        # Prioritisation changes polling order only; score identity checks stay strict.
        def priority(slug):
            ignored = {"international", "clubs", "league", "group", "the", "a", "b"}
            tokens = set(re.findall(r"[a-z0-9]+", slug.lower())) - ignored
            return max((len(tokens.intersection(set(re.findall(r"[a-z0-9]+", str(row.get("sport_title") or "").lower())) - ignored))
                for row in priority_matches or []), default=0)
        jobs=[]
        for slug,sport in leagues:
            key=sport+":"+slug;stamp=_result_dt(checked.get(key))
            minutes = 2 if priority(slug) else 30
            if not stamp or now-stamp>=timedelta(minutes=minutes):jobs.append((checked.get(key) or "",key,slug,sport))
        # At most two targeted leagues and at least two rotation slots.
        targeted = sorted([job for job in jobs if priority(job[2])], key=lambda job:(-priority(job[2]),job[0]))[:2]
        chosen = targeted + [job for job in sorted(jobs) if job not in targeted][:4-len(targeted)]
        semaphore=asyncio.Semaphore(2)
        async def one(job):
            _,key,slug,sport=job;checked[key]=now.isoformat()
            async with semaphore:
                if db is not None and not await _reserve_result_request(db,now,"secondary"):return
                try:events=await asyncio.wait_for(_fetch_odds_api_io_all_events_unfiltered(slug,sport),timeout=16)
                except Exception:events=[]
            for evt in events:
                # An old timestamp with a partial score is NOT proof of completion.
                if str(evt.get("status") or "").lower() not in ("settled","finished","completed","ended"):continue
                starts=_result_dt(evt.get("date"));scores=evt.get("scores") or {}
                if not starts or starts>=now or evt.get("id") is None:continue
                hs,aws=scores.get("home"),scores.get("away")
                if not _result_valid_number(hs) or not _result_valid_number(aws):continue
                data[str(evt['id'])]={"status":evt['status'],"home_score":int(hs),"away_score":int(aws),"home_team":evt.get('home'),"away_team":evt.get('away'),"commence_time":evt['date'],"sport":sport,"sport_title":(evt.get('league') or {}).get('name') if isinstance(evt.get('league'),dict) else str(evt.get('league') or '')}
        await asyncio.gather(*(one(job) for job in chosen))
        # Keep verified historical results for recovery, bounded to 180 days.
        data={k:v for k,v in data.items() if _result_dt(v.get('commence_time')) and _result_dt(v['commence_time'])>now-timedelta(days=180)}
        state={"data":data,"checked":checked,"updated_at":now.isoformat()}
        if db is not None:await db.scores_cache.update_one({"_id":"secondary_results"},{"$set":state},upsert=True)
        else:_secondary_result_memory.update(state)
        return data


async def _archive_scores(db, scores: List[Dict]) -> int:
    """Bulk archive: a non-final response can never replace a final score."""
    now=datetime.now(timezone.utc).isoformat();unique={}
    for row in scores or []:
        if not isinstance(row,dict) or row.get("completed") is not True:continue
        event_id=str(row.get("id") or "").strip()
        if event_id:unique[event_id]=row
    operations=[]
    for event_id,row in unique.items():
        fields={k:row.get(k) for k in ("sport_key","sport_title","commence_time","home_team","away_team")}
        fields.update(completed=True,scores=row.get("scores") or [],last_seen_at=now)
        operations.append(UpdateOne({"event_id":event_id},{"$set":fields,"$setOnInsert":{"first_archived_at":now}},upsert=True))
    if operations:await db.scores_archive.bulk_write(operations,ordered=False)
    return len(operations)


async def _read_scores_archive(
    db,
    sport_keys: Optional[List[str]] = None,
    archive_days: int = 30,
) -> List[Dict]:
    """Relit les scores archivés récents, au format de l'endpoint /scores."""
    archive_days = max(3, min(int(archive_days or 30), 180))
    cutoff = datetime.now(timezone.utc) - timedelta(days=archive_days)
    query: Dict = {"completed": True}
    if sport_keys:
        query["sport_key"] = {"$in": list(dict.fromkeys([str(k) for k in sport_keys if k]))}

    query["commence_time"]={"$gte":cutoff.isoformat()}
    docs = await db.scores_archive.find(query).sort("commence_time",-1).limit(20000).to_list(length=20000)
    out: List[Dict] = []
    for d in docs:
        try:
            commence = d.get("commence_time")
            if commence:
                dt = datetime.fromisoformat(str(commence).replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt < cutoff:
                    continue
            out.append({
                "id": d.get("event_id"),
                "sport_key": d.get("sport_key"),
                "sport_title": d.get("sport_title"),
                "commence_time": d.get("commence_time"),
                "completed": True,
                "home_team": d.get("home_team"),
                "away_team": d.get("away_team"),
                "scores": d.get("scores") or [],
                "_from_archive": True,
            })
        except Exception:
            continue
    return out


async def fetch_all_scores(db, sport_keys: Optional[List[str]]=None, force_refresh: bool=False, days_from: int=3, include_archive: bool=False, archive_days: int=30, archive_only: bool=False) -> List[Dict]:
    """Cached final scores; per-sport age, independent budget and rotating batches.

    archive_only forbids every provider request, including sports discovery.
    Completed archive entries always take precedence over non-final live rows.
    """
    days_from=max(1,min(int(days_from or 3),3))
    requested=list(dict.fromkeys(str(k).strip() for k in (sport_keys or []) if str(k).strip()))
    async with _result_fetch_lock:
        now=datetime.now(timezone.utc)
        cached=await db.scores_cache.find_one({"_id":"all_scores"}) or {}
        old=cached.get('data') if isinstance(cached.get('data'),list) else []
        await _archive_scores(db,old)
        states=dict(cached.get('refresh_by_sport') or {})
        if archive_only or sport_keys==[]:keys=[]
        elif sport_keys is not None:keys=requested
        else:
            # No discovery HTTP call for recovery; existing cached catalogue only.
            odds=await db.odds_cache.find_one({"_id":"all_matches"}) or {}
            keys=list(dict.fromkeys(r.get('sport_key') for r in odds.get('data',[]) if r.get('sport_key')))
            keys=keys or list(dict.fromkeys(REAL_SPORT_KEYS))
        jobs=[]
        for key in keys:
            entry=states.get(key) or {};retry=_result_dt(entry.get('retry_at'));at=_result_dt(entry.get('updated_at'))
            if retry and retry>now:continue
            # Even a forced user action respects a 60-second coalescing floor.
            fresh=at and (now-at).total_seconds()<(60 if force_refresh else 1800) and entry.get('days_from',0)>=days_from
            if not fresh:jobs.append((entry.get('attempted_at') or '',key))
        fresh_rows=[];semaphore=asyncio.Semaphore(3)
        async def collect(key):
            async with semaphore:
                if not ODDS_API_KEY:return
                # Atomic persistent budgets shared by all reconciliation calls.
                if not await _reserve_result_request(db,now):
                    plan=_result_budget_status.get('primary') or {}
                    states[key]={**(states.get(key) or {}),'status':'budget_paced' if plan.get('reason')=='budget_paced' else 'local_budget_reached',
                        'budget_reason':plan.get('reason'),'attempted_at':now.isoformat(),
                        'retry_at':(now+timedelta(minutes=15)).isoformat()};return
                rows=await fetch_scores_for_sport(key,days_from,db=db)
                info=_result_http_status.get(key,{"status":"network_error"})
                if info.get('requests_remaining') is not None:
                    await db.scores_cache.update_one({'_id':'result_provider_quota:primary'},{'$set':{
                        'remaining':info['requests_remaining'],'used':info.get('requests_used'),
                        'updated_at':now.isoformat()}},upsert=True)
                code=info.get('http_status');success=code==200
                previous=states.get(key) or {}
                states[key]={**previous,**info,'attempted_at':now.isoformat(),'retry_at':(now+timedelta(seconds=60 if success else 86400 if code in (401,403) else 21600 if code in (404,422) else 3600 if code==429 else 900)).isoformat()}
                if success:
                    states[key].update(updated_at=now.isoformat(),days_from=days_from)
                    fresh_rows.extend({**r,'sport_key':r.get('sport_key') or key} for r in rows)
        limit=max(1,min(int(os.environ.get('RESULTS_MAX_SPORTS_PER_RUN','6')),12))
        await asyncio.gather(*(collect(key) for _,key in sorted(jobs)[:limit]))
        merged={str(r.get('id')):r for r in old if r.get('id')}
        for row in fresh_rows:
            event_id=str(row.get('id') or '')
            if not event_id:continue
            if (merged.get(event_id) or {}).get('completed') is True and row.get('completed') is not True:continue
            merged[event_id]=row
        current=list(merged.values())
        await _archive_scores(db,fresh_rows)
        # Prune only the short score cache; the durable archive is never deleted.
        cache_rows=[r for r in current if not _result_dt(r.get('commence_time')) or _result_dt(r['commence_time'])>now-timedelta(days=7)]
        await db.scores_cache.update_one({'_id':'all_scores'},{'$set':{'data':cache_rows,'updated_at':now.isoformat(),'sport_keys':list(dict.fromkeys(r.get('sport_key') for r in cache_rows if r.get('sport_key'))),'days_from':days_from,'refresh_by_sport':states}},upsert=True)
    filtered=[r for r in current if not requested or r.get('sport_key') in requested]
    if include_archive:
        archived=await _read_scores_archive(db,sport_keys=requested or None,archive_days=archive_days)
        final={str(r['id']):r for r in filtered if r.get('id')}
        for row in archived:
            identity=str(row.get('id') or '')
            if identity and ((final.get(identity) or {}).get('completed') is not True):final[identity]=row
        return list(final.values())
    return filtered


async def get_odds_cache_status(db) -> Dict:
    cache = await db.odds_cache.find_one({"_id": "all_matches"})
    if not cache:
        return {
            "cached": False, "count": 0, "updated_at": None, "stale": True,
            "hard_stale": True, "by_sport": {},
            "provider_status": _provider_status_snapshot(),
        }

    data = cache.get("data", [])
    updated = cache.get("updated_at")
    try:
        dt = datetime.fromisoformat(str(updated).replace("Z", "+00:00"))
        dt = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        age = max(0, (datetime.now(timezone.utc) - dt).total_seconds())
    except Exception:
        age = float("inf")

    ttl = _cache_ttl_for_matches(data if isinstance(data, list) else [])
    by_sport = cache.get("by_sport")
    if not isinstance(by_sport, dict):
        by_sport = {}
        for match in data if isinstance(data, list) else []:
            group = _sport_group_from_match(match)
            by_sport[group] = by_sport.get(group, 0) + 1

    event_dates = []
    now = datetime.now(timezone.utc)
    future_count = 0
    for match in data if isinstance(data, list) else []:
        try:
            event_dt = datetime.fromisoformat(str(match.get("commence_time", "")).replace("Z", "+00:00"))
            if event_dt.tzinfo is None:
                event_dt = event_dt.replace(tzinfo=timezone.utc)
            event_dates.append(event_dt)
            if event_dt >= now:
                future_count += 1
        except Exception:
            continue

    provider_status = cache.get("provider_status")
    if not isinstance(provider_status, dict):
        provider_status = _provider_status_snapshot()

    return {
        "cached": True,
        "count": len(data) if isinstance(data, list) else 0,
        "updated_at": updated,
        "last_successful_network_refresh_at": cache.get("last_successful_network_refresh_at"),
        "age_seconds": int(age) if math.isfinite(age) else None,
        "ttl_minutes": ttl,
        "stale": age > ttl * 60,
        "hard_stale": age > STALE_CACHE_MAX_HOURS * 3600,
        "by_sport": by_sport,
        "future_event_count": future_count,
        "oldest_event_at": min(event_dates).isoformat() if event_dates else None,
        "newest_event_at": max(event_dates).isoformat() if event_dates else None,
        "provider_status": provider_status,
        "refresh_meta": cache.get("refresh_meta") or {},
    }


async def get_match_by_id(db, match_id: str) -> Optional[Dict]:
    matches = await fetch_all_matches(db)
    for m in matches:
        if m.get("id") == match_id:
            return m
    return None

async def probe_odds_api_io_event(numeric_id: str) -> Dict:
    """Sonde un evenement odds-api.io par son identifiant numerique.

    L'appel est volontairement effectue sans filtre de statut afin d'observer
    la reponse brute et le vrai champ ``status`` renvoye par l'API.
    """
    if not ODDS_API_IO_KEY:
        return {"error": "ODDS_API_IO_KEY absente"}

    all_leagues = (
        [(lg, "football") for lg in ODDS_API_IO_LEAGUES]
        + [(lg, "ice-hockey") for lg in ODDS_API_IO_HOCKEY_LEAGUES]
        + [(lg, "basketball") for lg in ODDS_API_IO_BASKETBALL_LEAGUES]
    )
    results: Dict[str, object] = {}

    for league_slug, sport in all_leagues:
        url = f"{ODDS_API_IO_BASE}/events"
        params = {"apiKey": ODDS_API_IO_KEY, "sport": sport, "league": league_slug}
        try:
            async with httpx.AsyncClient(timeout=15.0) as http:
                r = await http.get(url, params=params)
                if r.status_code != 200:
                    results[league_slug] = f"HTTP {r.status_code}"
                    continue
                data = r.json()
                if not isinstance(data, list):
                    results[league_slug] = "reponse non-liste"
                    continue
                for evt in data:
                    if str(evt.get("id")) == str(numeric_id):
                        return {
                            "found_in_league": league_slug,
                            "sport": sport,
                            "raw_event": evt,
                            "total_events_returned_for_this_league_no_status_filter": len(data),
                        }
                results[league_slug] = len(data)
        except Exception as e:
            results[league_slug] = f"erreur: {e}"

    return {
        "found": False,
        "detail": "Match non trouve dans aucune ligue suivie, meme sans filtre de statut.",
        "events_count_per_league_no_status_filter": results,
    }


async def probe_odds_api_io_league_sample(
    league_slug: str, sport: str = "football"
) -> Dict:
    """Retourne un echantillon brut d'une ligue sans filtre de statut."""
    if not ODDS_API_IO_KEY:
        return {"error": "ODDS_API_IO_KEY absente"}

    url = f"{ODDS_API_IO_BASE}/events"
    params = {"apiKey": ODDS_API_IO_KEY, "sport": sport, "league": league_slug}
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(url, params=params)
            if r.status_code != 200:
                return {"error": f"HTTP {r.status_code}", "body": r.text[:500]}
            data = r.json()
            if not isinstance(data, list):
                return {"error": "reponse non-liste", "raw": data}
            statuses_seen: Dict[str, int] = {}
            for evt in data:
                status = evt.get("status", "(absent)")
                statuses_seen[status] = statuses_seen.get(status, 0) + 1
            return {
                "total_events": len(data),
                "statuses_seen": statuses_seen,
                "sample_events": data[:5],
            }
    except Exception as e:
        return {"error": str(e)}


async def diagnose_sport_key(db, sport_key: str) -> Dict:
    """Diagnostic complet d'un sport_key de The Odds API.

    Compare le fetch brut, les filtres de qualite et le cache MongoDB afin de
    localiser precisement la cause d'un championnat absent du site.
    """
    markets = _get_markets_for_sport(sport_key)
    raw = await _fetch_real_sport(sport_key, markets=markets, regions="eu", db=db)
    now = datetime.now(timezone.utc)
    after_filters: List[Dict] = []
    filtered_out_reasons: Dict[str, int] = {}

    for m in raw:
        if _is_friendly(m):
            filtered_out_reasons["match_amical"] = filtered_out_reasons.get("match_amical", 0) + 1
            continue
        try:
            ct = datetime.fromisoformat(str(m["commence_time"]).replace("Z", "+00:00"))
            if ct.tzinfo is None:
                ct = ct.replace(tzinfo=timezone.utc)
            if (now - ct) > timedelta(hours=24):
                filtered_out_reasons["deja_termine_+24h"] = filtered_out_reasons.get("deja_termine_+24h", 0) + 1
                continue
            if (ct - now) > timedelta(days=7):
                filtered_out_reasons["trop_lointain_+7j"] = filtered_out_reasons.get("trop_lointain_+7j", 0) + 1
                continue
        except Exception:
            filtered_out_reasons["date_illisible"] = filtered_out_reasons.get("date_illisible", 0) + 1
            continue
        if len(m.get("bookmakers", [])) < 1:
            filtered_out_reasons["aucun_bookmaker"] = filtered_out_reasons.get("aucun_bookmaker", 0) + 1
            continue
        after_filters.append(m)

    cached = await db.odds_cache.find_one({"_id": "all_matches"})
    cached_data = cached.get("data", []) if cached else []
    in_final_cache = [m for m in cached_data if m.get("sport_key") == sport_key]

    if len(raw) == 0:
        diagnostic = "Le match n'existe pas cote The Odds API pour ce sport_key en ce moment."
    elif len(after_filters) == 0:
        diagnostic = "Aucun match ne passe les filtres qualite (voir 'elimines_par_filtre')."
    elif len(in_final_cache) == 0:
        diagnostic = (
            "Les matchs passent les filtres mais n'apparaissent pas dans le cache final : "
            "le cache n'a probablement pas ete regenere depuis le dernier fetch, ou une "
            "erreur survient pendant _force_fetch_and_cache."
        )
    else:
        diagnostic = "Tout semble en ordre : le match devrait etre visible sur /api/matches."

    return {
        "sport_key": sport_key,
        "1_fetch_brut_the_odds_api": {
            "count": len(raw),
            "sample": [
                {
                    "id": m.get("id"),
                    "home": m.get("home_team"),
                    "away": m.get("away_team"),
                    "commence_time": m.get("commence_time"),
                    "num_bookmakers": len(m.get("bookmakers", [])),
                }
                for m in raw[:5]
            ],
        },
        "2_apres_filtres_qualite": {
            "count": len(after_filters),
            "elimines_par_filtre": filtered_out_reasons,
        },
        "3_dans_cache_final_actuel": {
            "count": len(in_final_cache),
            "cache_updated_at": cached.get("updated_at") if cached else None,
            "cache_total_matches_tous_sports": len(cached_data),
        },
        "diagnostic": diagnostic,
    }

# Result-recovery controls are separate from the odds catalogue and live endpoint.
_result_fetch_lock=asyncio.Lock()
_secondary_result_lock=asyncio.Lock()
_result_http_status={}
_result_budget_status={}
_secondary_result_memory={}

def _result_dt(value):
    try:
        stamp=datetime.fromisoformat(str(value).replace('Z','+00:00'))
        return stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)
    except (ValueError,TypeError):return None

def _result_valid_number(value):
    if isinstance(value,bool):return False
    try:return math.isfinite(float(value)) and float(value)>=0 and int(float(value))==float(value)
    except (ValueError,TypeError,OverflowError):return False

def _result_budget_plan(now, daily_limit, monthly_limit, day_calls, month_calls):
    """Even distribution within the operator's existing caps; no quota increase."""
    import calendar
    now = now.astimezone(timezone.utc)
    days_left = calendar.monthrange(now.year, now.month)[1]-now.day+1
    # Include today's already spent calls when computing today's total envelope.
    allowance = min(daily_limit, max(0, (monthly_limit-month_calls+day_calls)//days_left))
    elapsed = now.hour*3600+now.minute*60+now.second
    unlocked = min(allowance, math.ceil(allowance*min(86400,elapsed+3600)/86400))
    allowed = daily_limit>0 and monthly_limit>0 and day_calls<unlocked and month_calls<monthly_limit
    reason = "available" if allowed else "disabled" if min(daily_limit,monthly_limit)<=0 else "monthly_exhausted" if month_calls>=monthly_limit else "daily_exhausted" if day_calls>=daily_limit else "budget_paced"
    return {"allowed":allowed,"reason":reason,"daily_limit":daily_limit,"monthly_limit":monthly_limit,
            "day_calls":day_calls,"month_calls":month_calls,"day_allowance":allowance,
            "unlocked_today":unlocked,"days_left":days_left}


async def _reserve_result_request(db, now, provider="primary"):
    from pymongo.errors import DuplicateKeyError
    prefix="RESULTS_" if provider=="primary" else "RESULTS_SECONDARY_"
    def limit(name,default):
        try:return max(0,int(os.environ.get(prefix+name,default)))
        except (TypeError,ValueError):return int(default)
    daily,monthly=limit('DAILY_REQUEST_LIMIT','12'),limit('MONTHLY_REQUEST_LIMIT','150')
    day=now.astimezone(timezone.utc).strftime('%Y-%m-%d')
    month=now.astimezone(timezone.utc).strftime('%Y-%m')
    identity='result_budget_v2:'+provider+':'+month
    state=await db.scores_cache.find_one({'_id':identity})
    if not state:
        # Preserve spent reservations: deploying this code never resets a quota.
        old_day=await db.scores_cache.find_one({'_id':'result_budget:'+provider+':day:'+day}) or {}
        old_month=await db.scores_cache.find_one({'_id':'result_budget:'+provider+':month:'+month}) or {}
        await db.scores_cache.update_one({'_id':identity},{'$setOnInsert':{
            'calls':int(old_month.get('calls') or 0),'days':{day:int(old_day.get('calls') or 0)}}},upsert=True)
        state=await db.scores_cache.find_one({'_id':identity}) or {}
    day_calls=int((state.get('days') or {}).get(day) or 0)
    month_calls=int(state.get('calls') or 0)
    plan=_result_budget_plan(now,daily,monthly,day_calls,month_calls)
    quota=await db.scores_cache.find_one({'_id':'result_provider_quota:'+provider}) or {}
    stamp=_result_dt(quota.get('updated_at'))
    if stamp and 0<=(now-stamp).total_seconds()<21600 and quota.get('remaining') is not None and quota['remaining']<2:
        plan.update(allowed=False,reason='provider_quota_exhausted')
    if plan['allowed']:
        # One atomic document increments day and month together. A refused
        # reservation consumes neither counter, unlike the former two-step loop.
        path='days.'+day
        try:
            row=await db.scores_cache.find_one_and_update({'_id':identity,'calls':{'$lt':monthly},
                '$or':[{path:{'$lt':plan['unlocked_today']}},{path:{'$exists':False}}]},
                {'$inc':{'calls':1,path:1}},return_document=True)
        except DuplicateKeyError:row=None
        if row:
            plan.update(day_calls=int((row.get('days') or {}).get(day) or 0),month_calls=int(row.get('calls') or 0))
        else:plan.update(allowed=False,reason='concurrent_budget_reservation')
    _result_budget_status[provider]=plan
    await db.scores_cache.update_one({'_id':'result_budget_status:'+provider},{'$set':{**plan,'updated_at':now.isoformat()}},upsert=True)
    return plan['allowed']


# Shared credit guard for The Odds API only (odds-api.io is a separate plan).
# Reservations are pessimistic: network errors and retries remain charged to
# the local allowance. The provider headers can only raise this upper bound.
class PrimaryBudgetError(RuntimeError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _primary_request_cost(url, params):
    if url.rstrip('/').endswith('/markets'):
        return 1
    if url.rstrip('/').endswith('/scores'):
        return 2 if params.get('daysFrom') is not None else 1
    if url.rstrip('/').endswith('/odds'):
        markets = {x.strip() for x in str(params.get('markets') or 'h2h').split(',') if x.strip()}
        if params.get('bookmakers'):
            import math
            regions = max(1, math.ceil(len(set(str(params['bookmakers']).split(','))) / 10))
        else:
            regions = max(1, len(set(str(params.get('regions') or 'eu').split(','))))
        return max(1, len(markets)) * regions
    raise PrimaryBudgetError('credit_budget_unavailable')


def _primary_budget_decision(doc, category, cost, now):
    import calendar
    import math
    cap = max(0, min(90000, int(os.environ.get('ODDS_MONTHLY_CREDIT_LIMIT', '90000'))))
    cap = min(cap, int(doc.get('provider_ceiling', 0)))
    category_cap = max(0, min(cap, int(os.environ.get('ODDS_' + category.upper() + '_MONTHLY_CREDITS', '30000'))))
    used = int(doc.get('total', 0))
    spent = int(doc.get('categories', {}).get(category, 0))
    day_key = now.strftime('%Y-%m-%d')
    today = int(doc.get('days', {}).get(day_key, {}).get(category, 0))
    days_left = calendar.monthrange(now.year, now.month)[1] - now.day + 1
    allowance = max(0, (category_cap - spent + today) // days_left)
    seconds = now.hour * 3600 + now.minute * 60 + now.second
    unlocked = min(allowance, math.ceil(allowance * min(86400, seconds + 3600) / 86400))
    if not doc.get('initialized'):
        reason = 'credit_budget_unavailable'
    elif used + cost > cap or spent + cost > category_cap:
        reason = 'credit_budget_reached'
    elif today + cost > unlocked:
        reason = 'credit_budget_paced'
    else:
        reason = 'available'
    return {'allowed': reason == 'available', 'reason': reason,
            'limit': cap, 'used_upper_bound': used,
            'category': category, 'category_limit': category_cap,
            'category_used_upper_bound': spent,
            'day_allowance': allowance, 'unlocked_today': unlocked,
            'day_used_upper_bound': today, 'cost_reserved': cost,
            'updated_at': now.isoformat()}


async def _primary_budget_change(db, key, mutate):
    # Compare-and-swap serializes reservations across processes and deployments.
    for _ in range(30):
        doc = await db.scores_cache.find_one({'_id': key})
        if doc is None:
            await db.scores_cache.update_one({'_id': key}, {'$setOnInsert': {
                'revision': 0, 'total': 0, 'pending': 0, 'initialized': False,
                'categories': {}, 'days': {}}}, upsert=True)
            continue
        import copy
        changes = mutate(copy.deepcopy(doc))
        changes.pop('_id', None)
        changes['revision'] = doc['revision'] + 1
        result = await db.scores_cache.update_one(
            {'_id': key, 'revision': doc['revision']}, {'$set': changes})
        if result.modified_count:
            return changes
    raise PrimaryBudgetError('credit_budget_unavailable')


_primary_quota_probe_at = 0.0
_primary_quota_probe_period = None
_primary_quota_probe_lock = asyncio.Lock()


async def _budgeted_primary_get(db, client, url, *, params, category):
    global _primary_quota_probe_at, _primary_quota_probe_period
    if db is None or category not in ('odds', 'results', 'live'):
        raise PrimaryBudgetError('credit_budget_unavailable')
    now = datetime.now(timezone.utc)
    key = 'primary_credit_budget_v1:' + now.strftime('%Y-%m')
    try:
        # Free /sports call obtains account-wide usage before paid calls. It is
        # shared per process, refreshed every five minutes and at month rollover.
        async with _primary_quota_probe_lock:
            if _primary_quota_probe_period != key or time.monotonic() >= _primary_quota_probe_at:
                response = await client.get(f'{ODDS_API_BASE}/sports', params={'apiKey': ODDS_API_KEY})
                response.raise_for_status()
                used = _header_int(response.headers, 'x-requests-used')
                remaining = _header_int(response.headers, 'x-requests-remaining')
                if used is None or remaining is None:
                    raise PrimaryBudgetError('credit_budget_unavailable')
                reserve = max(10000, int(os.environ.get('ODDS_CREDIT_SAFETY_RESERVE', '10000')))
                def initialize(doc):
                    doc['total'] = max(doc['total'], used + doc['pending'])
                    doc['provider_ceiling'] = max(0, used + remaining - reserve)
                    doc['provider_used'] = used
                    doc['provider_remaining'] = remaining
                    doc['initialized'] = True
                    return doc
                await _primary_budget_change(db, key, initialize)
                _primary_quota_probe_period = key
                _primary_quota_probe_at = time.monotonic() + 300

        cost = _primary_request_cost(url, params)
        def reserve_credit(doc):
            decision = _primary_budget_decision(doc, category, cost, now)
            if not decision['allowed']:
                raise PrimaryBudgetError(decision['reason'])
            day = now.strftime('%Y-%m-%d')
            doc['total'] += cost
            doc['pending'] += cost
            doc['categories'][category] = doc['categories'].get(category, 0) + cost
            doc['days'].setdefault(day, {})
            doc['days'][day][category] = doc['days'][day].get(category, 0) + cost
            doc['last_reservation'] = decision
            return doc
        await _primary_budget_change(db, key, reserve_credit)
    except PrimaryBudgetError:
        raise
    except Exception as exc:
        logger.warning('Primary credit guard unavailable: %s', type(exc).__name__)
        raise PrimaryBudgetError('credit_budget_unavailable') from None

    response = None
    try:
        response = await client.get(url, params=params)
        _record_odds_api_response(response, context=category)
        return response
    finally:
        def settle(doc):
            doc['pending'] = max(0, doc['pending'] - cost)
            if response is not None:
                used = _header_int(response.headers, 'x-requests-used')
                if used is not None:
                    doc['total'] = max(doc['total'], used + doc['pending'])
                    doc['provider_used'] = max(used, doc.get('provider_used', 0))
                last_cost = _header_int(response.headers, 'x-requests-last')
                if last_cost is not None and last_cost > cost:
                    doc['total'] += last_cost - cost
                    doc['categories'][category] += last_cost - cost
                    doc['days'][now.strftime('%Y-%m-%d')][category] += last_cost - cost
                doc['provider_remaining'] = _header_int(response.headers, 'x-requests-remaining')
            doc['updated_at'] = datetime.now(timezone.utc).isoformat()
            return doc
        try:
            await asyncio.shield(_primary_budget_change(db, key, settle))
        except Exception as exc:
            # Failed settlements retain pessimistic reservations, never unlock.
            logger.warning('Primary credit settlement deferred: %s', type(exc).__name__)


# Supplemental markets are collected in bounded batches and never replace the
# all-match catalogue. Every paid call uses the same persistent credit guard.
_EXTRA_MARKET_COLLECTION_VERSION = 'team-extra-20261105-lines-v3'
_EXTRA_TEAM_MARKETS = {'totals','spreads','alternate_totals','alternate_spreads','team_totals','alternate_team_totals'}
_EXTRA_FOOTBALL_MARKETS = {'totals', 'double_chance', 'btts', 'draw_no_bet', 'spreads', 'alternate_totals', 'alternate_spreads', 'team_totals', 'alternate_team_totals'}
_EXTRA_MARKET_CANONICAL = {'alternate_totals':'totals', 'alternate_spreads':'spreads', 'alternate_team_totals':'team_totals'}


def _dc_outcome_code(name,home,away):
    """Canonicalize only explicit equivalent labels; never infer an unknown side."""
    import re
    clean=lambda value:re.sub(r'\s+',' ',str(value or '').strip()).casefold()
    value=clean(name)
    codes={'1x':'1X','x1':'1X','x2':'X2','2x':'X2','12':'12','21':'12',
        '1/x':'1X','x/1':'1X','x/2':'X2','2/x':'X2','1/2':'12','2/1':'12'}
    if value in codes:return codes[value]
    for code,left,right in [('1X',home,'Draw'),('X2','Draw',away),('12',home,away),
        ('1X','Home','Draw'),('X2','Draw','Away'),('12','Home','Away')]:
        if not left or not right:continue
        for separator in (' or ',' / ','/',' ou '):
            if value in (clean(str(left)+separator+str(right)),clean(str(right)+separator+str(left))):return code
    return None


def _merge_market_quotes(base, extra):
    import copy
    merged = copy.deepcopy(base)
    books = {str(b.get('key')): b for b in merged.get('bookmakers') or [] if b.get('key')}
    for incoming in extra.get('bookmakers') or []:
        if not isinstance(incoming, dict) or not incoming.get('key'):
            continue
        book = books.setdefault(str(incoming['key']), {k:v for k,v in incoming.items() if k!='markets'})
        current = {}
        for owner in (book, incoming):
            for market in owner.get('markets') or []:
                key = _EXTRA_MARKET_CANONICAL.get(market.get('key'), market.get('key'))
                if not key:
                    continue
                out = current.setdefault(key, {'key':key, 'outcomes':{}, 'last_update':None})
                for outcome in market.get('outcomes') or []:
                    if not isinstance(outcome, dict):
                        continue
                    row = copy.deepcopy(outcome)
                    if key=='double_chance':
                        code=_dc_outcome_code(row.get('name'),base.get('home_team'),base.get('away_team'))
                        if code:row['name']=code
                    identity = (row.get('name'), row.get('point'), row.get('description'))
                    row['_quote_updated_at'] = row.get('_quote_updated_at') or market.get('last_update') or owner.get('last_update')
                    old = out['outcomes'].get(identity)
                    prior = _result_dt((old or {}).get('_quote_updated_at'))
                    stamp = _result_dt(row.get('_quote_updated_at'))
                    if old is None or (stamp and (not prior or stamp >= prior)):
                        out['outcomes'][identity] = row
                    if stamp and (not _result_dt(out['last_update']) or stamp > _result_dt(out['last_update'])):
                        out['last_update'] = stamp.isoformat()
        book['markets'] = [{**m, 'outcomes':list(m['outcomes'].values())} for m in current.values()]
    merged['bookmakers'] = list(books.values())
    return merged


async def _enrich_extra_football_markets(db, matches):
    now = datetime.now(timezone.utc)
    enabled = os.environ.get('WNPULSE_EXTRA_MARKETS_ENABLED', 'true').lower() not in ('false', '0', 'no')
    if not enabled or not ODDS_API_KEY:
        return matches
    horizon = min(48, max(1, int(os.environ.get('WNPULSE_EXTRA_MARKETS_HORIZON_HOURS', '24'))))
    candidates = []
    result = []
    # Reattach a previously acquired supplement without resetting timestamps.
    for match in matches:
        event_id = str(match.get('id') or '')
        kickoff = _result_dt(match.get('commence_time'))
        if not str(match.get('sport_key') or '').startswith(('soccer_','basketball_','icehockey_','baseball_','americanfootball_')) or not re.fullmatch(r'[a-f0-9]{32}', event_id) or not kickoff or not now < kickoff <= now+timedelta(hours=horizon):
            result.append(match)
            continue
        cached = await db.scores_cache.find_one({'_id':'extra_odds:'+event_id}) or {}
        at = _result_dt(cached.get('fetched_at'))
        valid = bool(at and 0 <= (now-at).total_seconds() <= 21600)
        merged = _merge_market_quotes(match, cached['data']) if valid and isinstance(cached.get('data'), dict) else match
        merged = dict(merged)
        merged['multi_market_quote_status'] = {'status': 'cached' if valid else 'not_collected',
            'updated_at':at.isoformat() if valid else None}
        result.append(merged)
        retry = _result_dt(cached.get('retry_at'))
        upgrade = cached.get('collector_version') != _EXTRA_MARKET_COLLECTION_VERSION
        if (upgrade or not at or (now-at).total_seconds() >= 10800) and (upgrade or not retry or retry <= now):
            candidates.append((len(result)-1, merged))
    limit = max(0, min(30, int(os.environ.get('WNPULSE_EXTRA_MARKETS_MAX_EVENTS', '12'))))
    if not candidates or not limit:
        return result
    cursor = await db.scores_cache.find_one({'_id':'extra_odds_cursor'}) or {}
    offset = int(cursor.get('offset') or 0) % len(candidates)
    # Alternate sports in the bounded supplement instead of starving smaller feeds.
    groups={}
    for item in candidates:
        groups.setdefault(str(item[1].get('sport_key') or '').split('_')[0],[]).append(item)
    ordered=[]
    while any(groups.values()):
        for group in sorted(groups):
            if groups[group]:ordered.append(groups[group].pop(0))
    jobs = (ordered[offset:]+ordered[:offset])[:limit]
    await db.scores_cache.update_one({'_id':'extra_odds_cursor'}, {'$set':{'offset':offset+len(jobs)}}, upsert=True)
    async with httpx.AsyncClient(timeout=10.) as client:
        for index, match in jobs:
            event_id, sport = match['id'], match['sport_key']
            base = f'{ODDS_API_BASE}/sports/{sport}/events/{event_id}'
            try:
                listing = await _budgeted_primary_get(db, client, base+'/markets',
                    params={'apiKey':ODDS_API_KEY, 'regions':_regions_for_sport(sport)}, category='odds')
                listing.raise_for_status()
                payload = listing.json()
                available = {m.get('key') for b in payload.get('bookmakers', []) for m in b.get('markets', [])}
                allowed=_EXTRA_FOOTBALL_MARKETS if sport.startswith('soccer_') else _EXTRA_TEAM_MARKETS
                requested = sorted(available & allowed)
                if not requested:
                    result[index]['multi_market_quote_status'] = {'status':'not_available_at_provider', 'updated_at':now.isoformat()}
                    await db.scores_cache.update_one({'_id':'extra_odds:'+event_id}, {'$set':{'retry_at':(now+timedelta(hours=4)).isoformat(),'collector_version':_EXTRA_MARKET_COLLECTION_VERSION}}, upsert=True)
                    continue
                response = await _budgeted_primary_get(db, client, base+'/odds', params={
                    'apiKey':ODDS_API_KEY, 'regions':_regions_for_sport(sport),
                    'markets':','.join(requested), 'oddsFormat':'decimal', 'dateFormat':'iso'}, category='odds')
                response.raise_for_status()
                data = response.json()
                # Check identity before merging any prices from an event response.
                if not isinstance(data, dict) or data.get('id') != event_id or data.get('home_team') != match.get('home_team') or data.get('away_team') != match.get('away_team'):
                    raise ValueError('event_identity_mismatch')
                result[index] = _merge_market_quotes(result[index], data)
                result[index]['multi_market_quote_status'] = {'status':'refreshed', 'updated_at':now.isoformat(), 'requested_markets':requested}
                await db.scores_cache.update_one({'_id':'extra_odds:'+event_id}, {'$set':{
                    'fetched_at':now.isoformat(), 'retry_at':(now+timedelta(hours=3)).isoformat(),
                    'collector_version':_EXTRA_MARKET_COLLECTION_VERSION, 'data':data}}, upsert=True)
            except PrimaryBudgetError as exc:
                result[index]['multi_market_quote_status'] = {'status':exc.code}
                break
            except Exception as exc:
                # Existing prices survive 401/403/422/429, timeouts and malformed data.
                result[index]['multi_market_quote_status'] = {'status':'provider_unavailable'}
                await db.scores_cache.update_one({'_id':'extra_odds:'+event_id}, {'$set':{
                    'retry_at':(now+timedelta(hours=1)).isoformat(), 'collector_version':_EXTRA_MARKET_COLLECTION_VERSION, 'last_error_type':type(exc).__name__}}, upsert=True)
    return result




# UFC results are not supplied by The Odds API /scores. Keep outcomes separate
# from numeric scores: a winner flag is never a fictional 1-0 or a round total.
_combat_results_lock = asyncio.Lock()


def _combat_name(value):
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower()
    key = re.sub(r"[^a-z0-9]", "", text)
    # Verified romanisations of ESPN athlete 4701954 (UFC welterweight).
    # Both opponent and card time must still match; no general fuzzy matching.
    aliases = {"seokhyunko": "seokhyeonko", "seokhyonko": "seokhyeonko",
               "koseokhyeon": "seokhyeonko"}
    return aliases.get(key, key)


def is_combat_prediction(pred):
    return str(pred.get("sport_key") or "").startswith("mma_")


def _parse_ufc_results(payload, now):
    rows = []
    for event in payload.get("events", []) if isinstance(payload, dict) else []:
        for bout in event.get("competitions", []):
            status = (bout.get("status") or {}).get("type") or {}
            start = _result_dt(bout.get("date") or event.get("date"))
            competitors = bout.get("competitors") or []
            if status.get("completed") is not True or status.get("state") != "post" or not start or start > now or len(competitors) != 2:
                continue
            names = [str((c.get("athlete") or {}).get("displayName") or (c.get("athlete") or {}).get("fullName") or "") for c in competitors]
            winners = [index for index,c in enumerate(competitors) if c.get("winner") is True]
            if len(winners) != 1 or not all(names) or len({_combat_name(n) for n in names}) != 2:
                continue  # No contest/draw/cancellation require an explicit supported outcome.
            if not bout.get("id") or not event.get("id"):
                continue
            rows.append({"event_id": str(event["id"]), "bout_id": str(bout["id"]),
                "commence_time": start.isoformat(), "fighters": names, "winner": names[winners[0]],
                "completed": True, "source": "espn_ufc", "confirmed_at": now.isoformat(),
                "source_url": "https://www.espn.com/mma/fightcenter/_/id/" + str(event["id"])})
    return rows


def evaluate_combat_result(pred, rows):
    if not is_combat_prediction(pred) or str(pred.get("market") or "").lower() not in ("h2h", "moneyline", "ml"):
        return None
    start = _result_dt(pred.get("commence_time") or pred.get("start_time"))
    fighters = {_combat_name(pred.get("home_team")), _combat_name(pred.get("away_team"))}
    pick = _combat_name(pred.get("pick_raw") or pred.get("pick"))
    if not start or len(fighters) != 2 or "" in fighters or pick not in fighters:
        return None
    matches = []
    for row in rows:
        date = _result_dt(row.get("commence_time"))
        if row.get("completed") is not True or not date or abs((date-start).total_seconds()) > 18*3600:
            continue
        if {_combat_name(n) for n in row.get("fighters") or []} != fighters:
            continue
        winner = _combat_name(row.get("winner"))
        if winner in fighters:
            matches.append(("won" if pick == winner else "lost", row))
    if not matches or len({result for result,row in matches}) != 1:
        return None
    result, row = matches[0]
    return {"result": result, "combat_outcome": dict(row), "reconciliation_source": "espn_ufc_confirmed_winner"}


async def fetch_combat_results(db, predictions):
    """Free public UFC fallback, cached per UTC date, six requests maximum/run.

    Not a guaranteed or comprehensive MMA feed; exact pair + card-time matching
    only. All historical final outcomes stay cached; unavailable data stays pending.
    """
    now = datetime.now(timezone.utc)
    dates = set()
    for pred in predictions:
        start = _result_dt(pred.get("commence_time") or pred.get("start_time"))
        if not is_combat_prediction(pred) or not start or not now-timedelta(days=180) <= start <= now:
            continue
        for delta in (-1,0,1):
            day = start + timedelta(days=delta)
            if day.date() <= now.date(): dates.add(day.strftime("%Y%m%d"))
    if not dates: return []
    async with _combat_results_lock:
        keys = ["combat_ufc:"+day for day in dates]
        saved = await db.scores_cache.find({"_id": {"$in": keys}}).to_list(length=len(keys))
        cache = {row["_id"]:row for row in saved}
        jobs = []
        for day in dates:
            old = cache.get("combat_ufc:"+day) or {}
            checked = _result_dt(old.get("checked_at"))
            ttl = 300 if day >= (now-timedelta(days=2)).strftime("%Y%m%d") else 86400
            if not checked or (now-checked).total_seconds() >= ttl:
                jobs.append((old.get("checked_at") or "", day))
        # Most recent unqueried cards first; then rotate older dates via cache.
        jobs.sort(key=lambda job: (job[0], -int(job[1])))
        semaphore = asyncio.Semaphore(2)
        async def one(day):
            identity = "combat_ufc:"+day
            async with semaphore:
                try:
                    async with httpx.AsyncClient(timeout=8.) as client:
                        response = await client.get("https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard", params={"dates":day,"limit":1000})
                        response.raise_for_status()
                        payload = response.json()
                    if not isinstance(payload,dict) or not isinstance(payload.get("events"),list): return
                    rows = _parse_ufc_results(payload, now)
                    merged = {r["bout_id"]:r for r in (cache.get(identity) or {}).get("data") or []}
                    merged.update({r["bout_id"]:r for r in rows})
                    value = {"checked_at":now.isoformat(),"data":list(merged.values()),"source":"espn_ufc"}
                    await db.scores_cache.update_one({"_id":identity},{"$set":value},upsert=True)
                    cache[identity] = value
                except Exception as exc:
                    logger.warning("UFC final results unavailable for %s (%s)", day, type(exc).__name__)
        await asyncio.gather(*(one(day) for _,day in jobs[:6]))
        unique = {row["bout_id"]:row for cached in cache.values() for row in cached.get("data") or []}
        return list(unique.values())


async def refresh_montante_quote_window(db):
    """Two rotating sports, two core markets, one region, every 20 minutes.

    Uses the existing global/category credit reservations. Merge only: no event
    or existing market is deleted and old outcome timestamps remain old.
    """
    now = datetime.now(timezone.utc)
    cache = await db.odds_cache.find_one({"_id":"all_matches"}) or {}
    matches = cache.get("data") or []
    keys = set()
    for row in matches:
        start = _result_dt(row.get("commence_time"))
        key = str(row.get("sport_key") or "")
        if re.fullmatch(r"[a-z0-9_]+",key) and "minor_leagues" not in key and start and now+timedelta(minutes=5) <= start <= now+timedelta(hours=72):
            keys.add(key)
    rotation = await db.scores_cache.find_one({"_id":"montante_quote_rotation"}) or {}
    checked = dict(rotation.get("checked") or {})
    jobs = [key for key in keys if not _result_dt(checked.get(key)) or (now-_result_dt(checked[key])).total_seconds() >= 1200]
    jobs.sort(key=lambda key:(checked.get(key) or "",key))
    incoming = {}; errors = 0
    async with httpx.AsyncClient(timeout=10.) as client:
        for key in jobs[:2]:
            checked[key] = now.isoformat()
            try:
                response = await _budgeted_primary_get(db,client,f"{ODDS_API_BASE}/sports/{key}/odds",category="odds",
                    params={"apiKey":ODDS_API_KEY,"regions":"eu","markets":"h2h,totals","oddsFormat":"decimal","dateFormat":"iso"})
                response.raise_for_status();rows=response.json()
                if not isinstance(rows,list):raise ValueError("invalid_odds_list")
                incoming.update({str(row["id"]):row for row in rows if isinstance(row,dict) and row.get("id")})
            except PrimaryBudgetError:
                break  # Global 90,000-credit ceiling and pacing remain authoritative.
            except Exception as exc:
                errors += 1
                logger.warning("Montante quote window unavailable (%s)",type(exc).__name__)
    merged = []; updated = 0
    for row in matches:
        fresh = incoming.get(str(row.get("id")))
        if fresh and fresh.get("home_team")==row.get("home_team") and fresh.get("away_team")==row.get("away_team"):
            item = _merge_market_quotes(row,fresh)
            if _result_dt(fresh.get("commence_time")):item["commence_time"]=fresh["commence_time"]
            merged.append(item);updated += 1
        else:merged.append(row)
    written = None
    if updated:
        written = await db.odds_cache.update_one({"_id":"all_matches","updated_at":cache.get("updated_at"),
            "montante_quotes_updated_at":cache.get("montante_quotes_updated_at")},
            {"$set":{"data":merged,"montante_quotes_updated_at":now.isoformat()}})
    report = {"checked":checked,"checked_at":now.isoformat(),"sports_requested":jobs[:2],
        "updated_events":updated if written and written.modified_count else 0,"events_preserved":len(matches),"errors":errors}
    await db.scores_cache.update_one({"_id":"montante_quote_rotation"},{"$set":report},upsert=True)
    return report
