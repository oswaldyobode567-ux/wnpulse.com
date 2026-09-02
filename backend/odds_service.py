"""The Odds API client with MongoDB caching.
CORRECTIONS v7.1 :
- Cache TTL = 6 heures (au lieu de 60 min) → préserve les crédits
- Fetch 1x/jour à 06h00 WAT via worker (voir server.py)
- JAMAIS d'appel API sur requête utilisateur → toujours depuis le cache
- Filtre matchs amicaux automatique
- Inclut matchs live et terminés (24h) — ne disparaissent plus
- Fetch scores GRATUIT (0 crédit) pour les scores live

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
import random
import hashlib
import asyncio
import math
import unicodedata
import re
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional

import httpx
import logging
logger = logging.getLogger("winpulse.odds_service")

ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "").strip()
ODDS_API_BASE = "https://api.the-odds-api.com/v4"

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


def _get_markets_for_sport(sport_key: str) -> str:
    """Retourne les marchés à fetcher selon le sport."""
    if sport_key.startswith("soccer"):
        if sport_key in DEEP_MARKET_SPORTS:
            return SOCCER_MARKETS
        return "h2h,totals"
    elif sport_key.startswith("basketball"):
        return BASKET_MARKETS
    elif sport_key.startswith("tennis"):
        return TENNIS_MARKETS
    elif sport_key.startswith("icehockey"):
        return HOCKEY_MARKETS
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

async def _fetch_real_sport(sport_key: str, markets: str = "h2h", regions: str = "eu") -> List[Dict]:
    """Fetch odds pour un sport donné. Retourne [] si erreur."""
    url = f"{ODDS_API_BASE}/sports/{sport_key}/odds"
    params = {
        "apiKey": ODDS_API_KEY,
        "regions": regions,
        "markets": markets,
        "oddsFormat": "decimal",
        "dateFormat": "iso",
        # IMPORTANT : ne pas commencer a NOW. L'endpoint /odds renvoie aussi
        # les matchs LIVE, mais un filtre commenceTimeFrom=NOW les exclut
        # puisque leur heure de coup d'envoi est deja passee.
        "commenceTimeFrom": (datetime.now(timezone.utc) - timedelta(hours=int(os.environ.get("ODDS_LIVE_LOOKBACK_HOURS", "4")))).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "commenceTimeTo": (datetime.now(timezone.utc) + timedelta(days=int(os.environ.get("ODDS_FETCH_HORIZON_DAYS", "7")))).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as http:
            r = await http.get(url, params=params)
            if r.status_code == 401:
                logger.error("The Odds API: clé invalide (401)")
                return []
            # Une combinaison de marchés peut être refusée selon le sport, le plan
            # ou la couverture du bookmaker. On retente alors en h2h seul :
            # l'absence d'un marché enrichi ne doit jamais supprimer le match.
            if r.status_code == 422 and markets != "h2h":
                fallback_params = dict(params)
                fallback_params["markets"] = "h2h"
                r = await http.get(url, params=fallback_params)
            if r.status_code != 200:
                logger.warning(
                    "The Odds API %s -> HTTP %s (markets=%s)",
                    sport_key, r.status_code, markets,
                )
                return []
            data = r.json()
            return data if isinstance(data, list) else []
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
                if key.startswith(("soccer_", "basketball_", "tennis_", "icehockey_", "baseball_", "mma_")):
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


async def _fetch_odds_api_io_odds(event_id) -> Optional[Dict]:
    """
    Recupere les cotes pour un evenement donne via odds-api.io.
    NOTE : le plan actuel limite a 1 bookmaker autorise (Bet365) — confirme
    en test reel le 23/07/2026 ("Access denied... Allowed: Bet365").
    """
    if not ODDS_API_IO_KEY:
        return None
    url = f"{ODDS_API_IO_BASE}/odds"
    params = {"apiKey": ODDS_API_IO_KEY, "eventId": event_id, "bookmakers": "Bet365"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(url, params=params)
            if r.status_code != 200:
                logger.warning(f"odds-api.io odds [eventId={event_id}] -> HTTP {r.status_code}: {r.text[:200]}")
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
    """
    Fetch réel depuis l'API. Appelé uniquement par :
    1. Le worker planifié à 06h00 WAT
    2. Le bouton "Force refresh" en admin
    3. Premier démarrage si cache vide
    """
    if not ODDS_API_KEY:
        matches = get_all_mock_matches()
        await _save_to_cache(db, matches)
        return matches

    matches: List[Dict] = []

    # Découverte dynamique : les compétitions actives de l'API sont ajoutées
    # automatiquement aux clés historiques. Ainsi un nouveau slug UEFA ou une
    # nouvelle compétition n'a pas besoin d'être codé manuellement.
    discovered = await _discover_active_sport_keys()
    sport_keys = list(dict.fromkeys(REAL_SPORT_KEYS + discovered))
    logger.warning(
        "The Odds API : %s compétitions configurées + %s découvertes = %s fetchs",
        len(REAL_SPORT_KEYS), len(discovered), len(sport_keys),
    )

    async def _fetch_one(sk):
        try: return await _fetch_real_sport(sk, markets=_get_markets_for_sport(sk), regions="eu")
        except Exception as exc:
            logger.warning("The Odds API %s -> %s", sk, exc); return []

    results=await asyncio.gather(*[_fetch_one(sk) for sk in sport_keys], return_exceptions=True)
    for result in results:
        if isinstance(result,list): matches.extend(result)

    # ─── Source secondaire : odds-api.io pour ligues mineures ────────────────
    try:
        secondary_matches = await _fetch_odds_api_io_matches()
        logger.warning(f"odds-api.io : {len(secondary_matches)} match(s) recupere(s) au total")
        if secondary_matches:
            matches = _merge_events(matches, secondary_matches)
    except Exception as e:
        logger.warning(f"odds-api.io : echec global -> {e}")

    # Fallback si aucun match réel
    if not matches:
        matches = get_all_mock_matches()

    # ─── Filtres qualité ────────────────────────────────────────────────────

    now = datetime.now(timezone.utc)
    filtered = []

    for m in matches:
        # 1. Filtre matchs amicaux
        # Les matchs amicaux ne sont exclus que si le déploiement le demande.
        # Par défaut, tout événement disposant de cotes reste visible.
        if os.environ.get("ODDS_EXCLUDE_FRIENDLIES", "false").lower() in {"1", "true", "yes"} and _is_friendly(m):
            continue

        # 2. Fenêtre temporelle : 48h passées → 7 jours futurs
        # (inclut matchs live et récemment terminés)
        try:
            ct = datetime.fromisoformat(m["commence_time"].replace("Z", "+00:00"))
            # Exclure les matchs terminés depuis plus de 24h
            if (now - ct) > timedelta(hours=24):
                continue
            # Exclure les matchs trop lointains (plus de 7 jours)
            if (ct - now) > timedelta(days=7):
                continue
        except Exception:
            pass

        # 3. Un seul bookmaker suffit pour CONSERVER le match.
        # Le moteur de prédiction distingue ensuite les picks simples des
        # recommandations fortes selon le nombre de bookmakers. L'ancien filtre
        # à 2 ici supprimait des matchs réels avant même leur analyse.
        if len(m.get("bookmakers", [])) < 1:
            continue

        filtered.append(m)

    # ─── Enrichissement BSD (predictions ML) ─────────────────────────────────
    try:
        bsd_predictions = await _fetch_bsd_predictions()
        if bsd_predictions:
            filtered = _attach_bsd_enrichment(filtered, bsd_predictions)
    except Exception:
        pass

    # ─── Tri : LIVE → À venir → Terminés ────────────────────────────────────
    def _sort_key(m):
        try:
            ct = datetime.fromisoformat(m["commence_time"].replace("Z", "+00:00"))
            elapsed = (now - ct).total_seconds()
            if 0 <= elapsed <= 14400:  # LIVE (0-4h)
                return (0, ct)
            elif elapsed < 0:  # À venir
                return (1, ct)
            else:  # Terminé
                return (2, ct)
        except Exception:
            return (1, datetime.max.replace(tzinfo=timezone.utc))

    filtered.sort(key=_sort_key)

    # ─── Diversification sans masquer les grosses compétitions ───────────────
    # 15 matchs par compétition était trop restrictif : un championnat avec
    # beaucoup d'affiches pouvait faire disparaître précisément le match demandé.
    # On garde une limite de sécurité beaucoup plus large.
    per_comp: Dict[str, int] = {}
    diversified = []
    MAX_PER_COMPETITION = int(os.environ.get("ODDS_MAX_PER_COMPETITION", "1000"))
    for m in filtered:
        key = m.get("sport_title") or "Other"
        if per_comp.get(key, 0) >= MAX_PER_COMPETITION:
            continue
        diversified.append(m)
        per_comp[key] = per_comp.get(key, 0) + 1

    final = _annotate_bookmakers(diversified)

    await _save_to_cache(db, final)
    return final


async def _save_to_cache(db, matches: List[Dict]):
    """Sauvegarde les matchs en cache MongoDB."""
    await db.odds_cache.update_one(
        {"_id": "all_matches"},
        {"$set": {
            "data": matches,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "count": len(matches),
        }},
        upsert=True,
    )


async def refresh_matches_worker(db) -> Dict:
    """
    Worker planifié : appelé par server.py à 06h00 WAT et 13h00 WAT.
    C'est le SEUL endroit où l'API est appelée automatiquement.
    """
    matches = await _force_fetch_and_cache(db)
    return {
        "ok": True,
        "count": len(matches),
        "refreshed_at": datetime.now(timezone.utc).isoformat(),
    }


async def fetch_scores_for_sport(sport_key: str, days_from: int = 3) -> List[Dict]:
    """Fetch scores live/terminés. Endpoint GRATUIT (0 crédit)."""
    if not ODDS_API_KEY:
        return []
    url = f"{ODDS_API_BASE}/sports/{sport_key}/scores"
    params = {
        "apiKey": ODDS_API_KEY,
        "daysFrom": days_from,
        "dateFormat": "iso",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(url, params=params)
            if r.status_code != 200:
                return []
            return r.json()
    except Exception:
        return []


async def fetch_odds_api_io_scores_map() -> Dict[str, Dict]:
    """Recupere les scores termines odds-api.io pour la reconciliation.

    On ne depend plus d'une valeur hypothetique de ``status`` :
    - ``settled`` est traite comme termine ;
    - ``pending`` est ignore ;
    - un statut inconnu est accepte comme termine seulement si le match date
      de plus de 4 heures et qu'un score complet est present.
    """
    if not ODDS_API_IO_KEY:
        return {}

    scores_map: Dict[str, Dict] = {}
    all_leagues = (
        [(lg, "football") for lg in ODDS_API_IO_LEAGUES]
        + [(lg, "ice-hockey") for lg in ODDS_API_IO_HOCKEY_LEAGUES]
        + [(lg, "basketball") for lg in ODDS_API_IO_BASKETBALL_LEAGUES]
    )
    now = datetime.now(timezone.utc)

    for league_slug, sport in all_leagues:
        try:
            events = await _fetch_odds_api_io_finished_events(
                league_slug, sport=sport
            )
            for evt in events:
                commence = evt.get("date")
                if not commence:
                    continue
                try:
                    commence_dt = datetime.fromisoformat(
                        str(commence).replace("Z", "+00:00")
                    )
                    if commence_dt.tzinfo is None:
                        commence_dt = commence_dt.replace(tzinfo=timezone.utc)
                except Exception:
                    continue

                # Ne jamais reconciler un match pas encore suffisamment ancien.
                if (now - commence_dt) < timedelta(hours=4):
                    continue

                scores = evt.get("scores") or {}
                home_score = scores.get("home")
                away_score = scores.get("away")
                if home_score is None or away_score is None:
                    continue

                event_id = evt.get("id")
                if event_id is None:
                    continue

                scores_map[str(event_id)] = {
                    "status": evt.get("status", "termine_estime_par_horaire"),
                    "home_score": home_score,
                    "away_score": away_score,
                }
        except Exception as exc:
            logger.warning(
                "odds-api.io scores %s/%s -> %s", sport, league_slug, exc
            )
            continue

    return scores_map


async def fetch_all_scores(db) -> List[Dict]:
    """Scores avec cache 60 secondes. Endpoint GRATUIT."""
    cached = await db.scores_cache.find_one({"_id": "all_scores"})
    if cached:
        updated = cached.get("updated_at")
        if updated:
            try:
                updated_dt = datetime.fromisoformat(updated) if isinstance(updated, str) else updated
                if updated_dt.tzinfo is None:
                    updated_dt = updated_dt.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) - updated_dt < timedelta(seconds=60):
                    return cached.get("data", [])
            except Exception:
                pass

    scores: List[Dict] = []
    # Découverte dynamique des competitions de saison. On conserve aussi les
    # clés historiques pour ne jamais perdre une competition connue du site.
    # Cela corrige notamment Championship/Belgian First Div qui etaient absents
    # du flux /api/scores car la liste ci-dessous etait figée sur les competitions
    # de juillet.
    discovered = await _discover_active_sport_keys()
    active_sports = list(dict.fromkeys(REAL_SPORT_KEYS + discovered))
    logger.info("Scores: %s sports/competitions interrogés", len(active_sports))

    async def _scores_one(sk):
        try: return await fetch_scores_for_sport(sk)
        except Exception as exc:
            logger.warning("scores %s -> %s", sk, exc); return []

    results=await asyncio.gather(*[_scores_one(sk) for sk in active_sports], return_exceptions=True)
    for result in results:
        if isinstance(result,list): scores.extend(result)

    await db.scores_cache.update_one(
        {"_id": "all_scores"},
        {"$set": {"data": scores, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return scores


async def get_odds_cache_status(db) -> Dict:
    cache=await db.odds_cache.find_one({"_id":"all_matches"})
    if not cache: return {"cached":False,"count":0,"updated_at":None,"stale":True}
    data=cache.get("data",[]); updated=cache.get("updated_at")
    try:
        dt=datetime.fromisoformat(str(updated).replace("Z","+00:00")); dt=dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        age=max(0,(datetime.now(timezone.utc)-dt).total_seconds())
    except Exception: age=float("inf")
    ttl=_cache_ttl_for_matches(data if isinstance(data,list) else [])
    return {"cached":True,"count":len(data) if isinstance(data,list) else 0,"updated_at":updated,"age_seconds":int(age) if math.isfinite(age) else None,"ttl_minutes":ttl,"stale":age>ttl*60,"hard_stale":age>STALE_CACHE_MAX_HOURS*3600}


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
    raw = await _fetch_real_sport(sport_key, markets=markets, regions="eu")
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
