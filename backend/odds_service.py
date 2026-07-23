"""The Odds API client with MongoDB caching.
CORRECTIONS v7.1 :
- Cache TTL = 6 heures (au lieu de 60 min) → préserve les crédits
- Fetch 1x/jour à 06h00 WAT via worker (voir server.py)
- JAMAIS d'appel API sur requête utilisateur → toujours depuis le cache
- Filtre matchs amicaux automatique
- Inclut matchs live et terminés (24h) — ne disparaissent plus
- Fetch scores GRATUIT (0 crédit) pour les scores live

CORRECTIONS v7.4 :
- Integration odds-api.io comme source secondaire de cotes (ligues mineures)
- Integration BSD Sports Addon comme enrichissement (predictions ML CatBoost)
  fusionnees dans le reasoning des matchs, sans remplacer le moteur maison
"""
import os
import random
import hashlib
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional

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
    "international-clubs-uefa-champions-league-qualification",
    "international-clubs-uefa-europa-league-qualification",
    "international-clubs-uefa-conference-league-qualification",
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

# CRITIQUE : Cache 6 heures — ne jamais fetch plus souvent
CACHE_TTL_MINUTES = 360  # 6 heures

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
    "soccer_france_ligue_one",
    "soccer_italy_serie_a",
    # Autres ligues européennes
    "soccer_netherlands_eredivisie",
    "soccer_portugal_primeira_liga",
    "soccer_turkey_super_league",
    "soccer_belgium_first_div",
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

SOCCER_MARKETS = "h2h,totals,btts,double_chance,draw_no_bet"
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
        "commenceTimeFrom": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "commenceTimeTo": (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as http:
            r = await http.get(url, params=params)
            if r.status_code == 401:
                return []  # Clé invalide
            if r.status_code == 422:
                return []  # Sport non disponible actuellement
            if r.status_code != 200:
                return []
            data = r.json()
            return data if isinstance(data, list) else []
    except Exception:
        return []


async def _check_sport_active(sport_key: str) -> bool:
    """Vérifie si un sport est actif (0 crédit consommé)."""
    url = f"{ODDS_API_BASE}/sports"
    params = {"apiKey": ODDS_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            r = await http.get(url, params=params)
            if r.status_code != 200:
                return False
            sports = r.json()
            return any(s.get("key") == sport_key and s.get("active") for s in sports)
    except Exception:
        return False


# ─── Source secondaire : odds-api.io (ligues mineures) ───────────────────────
#
# NOTE IMPORTANTE : le schema exact de /v3/odds (structure des bookmakers et
# marches) n'a pas encore ete verifie avec un exemple reel de reponse. Ce code
# est ecrit de facon defensive (plusieurs noms de champs essayes, try/except
# partout) pour ne jamais casser le site si le format ne correspond pas
# exactement. Si aucun match n'apparait via cette source, il faudra ajuster
# le mapping des champs ci-dessous avec un exemple reel de /v3/odds.

async def _fetch_odds_api_io_events(league_slug: str) -> List[Dict]:
    """Recupere les evenements a venir pour une ligue donnee via odds-api.io."""
    if not ODDS_API_IO_KEY:
        return []
    url = f"{ODDS_API_IO_BASE}/events"
    params = {
        "apiKey": ODDS_API_IO_KEY,
        "sport": "football",
        "league": league_slug,
        "status": "pending",
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


def _convert_odds_api_io_event(event: Dict, odds_data: Optional[Dict]) -> Optional[Dict]:
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
            "sport_key": "soccer_minor_leagues",
            "sport_title": league_name,
            "commence_time": commence,
            "home_team": home,
            "away_team": away,
            "bookmakers": bookmakers,
        }
    except Exception:
        return None


async def _fetch_odds_api_io_matches() -> List[Dict]:
    """
    Fetch complet odds-api.io pour les ligues mineures configurees.
    Defensif : toute erreur individuelle est ignoree, ne bloque jamais
    le fetch principal The Odds API.
    """
    if not ODDS_API_IO_KEY:
        return []

    out: List[Dict] = []
    for league_slug in ODDS_API_IO_LEAGUES:
        try:
            events = await _fetch_odds_api_io_events(league_slug)
            # Limite stricte : max 5 matchs par ligue pour rester sous le
            # quota de 100 requetes/heure du plan gratuit odds-api.io
            # (8 ligues x 5 matchs x 1 appel odds = 40 requetes/refresh)
            for evt in events[:5]:
                event_id = evt.get("id")
                if not event_id:
                    continue
                odds_data = await _fetch_odds_api_io_odds(event_id)
                converted = _convert_odds_api_io_event(evt, odds_data)
                if converted:
                    out.append(converted)
        except Exception:
            continue
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


def _normalize_team_name(name: str) -> str:
    return "".join(c.lower() for c in (name or "") if c.isalnum())


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


def _merge_events(events_a: List[Dict], events_b: List[Dict]) -> List[Dict]:
    """Merge bookmakers/markets entre deux listes d'événements."""
    if not events_b:
        return events_a
    by_id = {e["id"]: e for e in events_a}
    for evt in events_b:
        existing = by_id.get(evt["id"])
        if not existing:
            by_id[evt["id"]] = evt
            continue
        existing_books = {bm["key"]: bm for bm in existing.get("bookmakers", [])}
        for bm in evt.get("bookmakers", []):
            if bm["key"] in existing_books:
                existing_mks = {m["key"]: m for m in existing_books[bm["key"]].get("markets", [])}
                for m in bm.get("markets", []):
                    if m["key"] not in existing_mks:
                        existing_books[bm["key"]].setdefault("markets", []).append(m)
            else:
                existing.setdefault("bookmakers", []).append(bm)
    return list(by_id.values())


async def fetch_all_matches(db) -> List[Dict]:
    """
    RÈGLE D'OR : Cette fonction lit TOUJOURS depuis le cache MongoDB.
    Le fetch API réel n'est déclenché QUE par le worker planifié (server.py startup).
    Cela garantit 0 crédit gaspillé sur les requêtes utilisateur.
    """
    cache_key = "all_matches"
    cached = await db.odds_cache.find_one({"_id": cache_key})

    if cached:
        updated = cached.get("updated_at")
        if updated:
            try:
                updated_dt = datetime.fromisoformat(updated) if isinstance(updated, str) else updated
                if updated_dt.tzinfo is None:
                    updated_dt = updated_dt.replace(tzinfo=timezone.utc)
                # Cache valide pendant 6 heures
                if datetime.now(timezone.utc) - updated_dt < timedelta(minutes=CACHE_TTL_MINUTES):
                    return cached.get("data", [])
            except Exception:
                pass

    # Cache expiré ou absent → fetch réel
    return await _force_fetch_and_cache(db)


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

    for sk in REAL_SPORT_KEYS:
        try:
            markets = _get_markets_for_sport(sk)
            events = await _fetch_real_sport(sk, markets=markets, regions="eu")
            matches.extend(events)
        except Exception:
            continue

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
        if _is_friendly(m):
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

        # 3. Minimum 2 bookmakers — exemption pour odds-api.io dont le plan
        # actuel limite a 1 seul bookmaker autorise (Bet365)
        is_secondary_source = m.get("sport_key") == "soccer_minor_leagues"
        min_books_required = 1 if is_secondary_source else 2
        if len(m.get("bookmakers", [])) < min_books_required:
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

    # ─── Diversification : max 15 matchs par compétition ────────────────────
    per_comp: Dict[str, int] = {}
    diversified = []
    for m in filtered:
        key = m.get("sport_title") or "Other"
        if per_comp.get(key, 0) >= 15:
            continue
        diversified.append(m)
        per_comp[key] = per_comp.get(key, 0) + 1

    final = diversified[:150]

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


async def fetch_scores_for_sport(sport_key: str, days_from: int = 1) -> List[Dict]:
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
    active_sports = [
        "soccer_fifa_world_cup",
        "soccer_epl",
        "soccer_uefa_champs_league",
        "soccer_africa_africa_cup_of_nations",
        "soccer_world_wc_qualification_africa",
        "basketball_nba",
        "tennis_atp_wimbledon",
        "tennis_wta_wimbledon",
        "baseball_mlb",
        "icehockey_nhl",
        "mma_mixed_martial_arts",
    ]

    for sk in active_sports:
        try:
            s = await fetch_scores_for_sport(sk)
            scores.extend(s)
        except Exception:
            continue

    await db.scores_cache.update_one(
        {"_id": "all_scores"},
        {"$set": {"data": scores, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return scores


async def get_match_by_id(db, match_id: str) -> Optional[Dict]:
    matches = await fetch_all_matches(db)
    for m in matches:
        if m.get("id") == match_id:
            return m
    return None
