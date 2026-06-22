"""The Odds API client with MongoDB caching + intelligent mock fallback.

When ODDS_API_KEY is empty, we return realistic mock data so the app
remains fully demoable without burning the user's API quota.
"""
import os
import random
import hashlib
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional

import httpx

ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "").strip()
ODDS_API_BASE = "https://api.the-odds-api.com/v4"
CACHE_TTL_MINUTES = 60

# Sports we expose to the user, mapped to The Odds API sport keys
SUPPORTED_SPORTS = [
    {"key": "soccer", "label": "Football", "icon": "Trophy", "group": "soccer"},
    {"key": "basketball_nba", "label": "Basketball NBA", "icon": "Dribbble", "group": "basketball"},
    {"key": "basketball_euroleague", "label": "Basketball Euroleague", "icon": "Dribbble", "group": "basketball"},
    {"key": "tennis", "label": "Tennis", "icon": "CircleDot", "group": "tennis"},
    {"key": "americanfootball_nfl", "label": "NFL", "icon": "Shield", "group": "football"},
    {"key": "icehockey_nhl", "label": "Hockey NHL", "icon": "Snowflake", "group": "hockey"},
    {"key": "mma_mixed_martial_arts", "label": "MMA / UFC", "icon": "Swords", "group": "mma"},
]

# When using real Odds API, soccer/tennis are split into sub-leagues – this list
# of safe sport keys avoids hitting too many endpoints in one go
REAL_SPORT_KEYS = [
    # Football — Coupe du Monde + leagues actives
    "soccer_fifa_world_cup",
    "soccer_epl",
    "soccer_italy_serie_a",
    "soccer_conmebol_copa_libertadores",
    "soccer_conmebol_copa_sudamericana",
    "soccer_brazil_serie_b",
    "soccer_norway_eliteserien",
    "soccer_sweden_allsvenskan",
    "soccer_sweden_superettan",
    "soccer_finland_veikkausliiga",
    "soccer_league_of_ireland",
    "soccer_china_superleague",
    "soccer_germany_dfb_pokal",
    # Basketball
    "basketball_wnba",
    "basketball_nba",
    # US sports
    "americanfootball_nfl",
    "americanfootball_cfl",
    "americanfootball_ncaaf",
    "baseball_mlb",
    "icehockey_nhl",
    # Tennis
    "tennis_atp_wimbledon",
    "tennis_wta_bad_homburg_open",
    # Combat
    "mma_mixed_martial_arts",
    "boxing_boxing",
    # Other
    "aussierules_afl",
    "rugbyleague_nrl",
]


# ---------- MOCK DATA GENERATOR (no API credit needed) ----------

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
    "basketball_euroleague": [
        ("Real Madrid Basket", "FC Barcelona Basket", "Euroleague"),
        ("Olympiacos", "Panathinaikos", "Euroleague"),
        ("Anadolu Efes", "Fenerbahce", "Euroleague"),
    ],
    "tennis": [
        ("Carlos Alcaraz", "Jannik Sinner", "ATP Masters"),
        ("Novak Djokovic", "Daniil Medvedev", "ATP Masters"),
        ("Iga Swiatek", "Aryna Sabalenka", "WTA 1000"),
        ("Coco Gauff", "Elena Rybakina", "WTA 1000"),
    ],
    "americanfootball_nfl": [
        ("Kansas City Chiefs", "Buffalo Bills", "NFL"),
        ("San Francisco 49ers", "Philadelphia Eagles", "NFL"),
        ("Dallas Cowboys", "Green Bay Packers", "NFL"),
    ],
    "icehockey_nhl": [
        ("Toronto Maple Leafs", "Boston Bruins", "NHL"),
        ("Edmonton Oilers", "Colorado Avalanche", "NHL"),
        ("Vegas Golden Knights", "Tampa Bay Lightning", "NHL"),
    ],
    "mma_mixed_martial_arts": [
        ("Islam Makhachev", "Charles Oliveira", "UFC 312"),
        ("Alex Pereira", "Jiri Prochazka", "UFC 312"),
        ("Sean O'Malley", "Merab Dvalishvili", "UFC 312"),
    ],
}


def _deterministic_random(seed_str: str) -> random.Random:
    """Deterministic RNG based on date+match so odds are stable within a day."""
    seed = int(hashlib.md5(seed_str.encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


def _generate_mock_event(sport_key: str, home: str, away: str, league: str, idx: int) -> Dict:
    today = datetime.now(timezone.utc).date()
    rng = _deterministic_random(f"{today}-{sport_key}-{home}-{away}")

    # Base strength differential
    home_strength = rng.uniform(0.30, 0.65)
    away_strength = rng.uniform(0.30, 0.65)
    draw_prob = rng.uniform(0.18, 0.30) if sport_key.startswith("soccer") else 0.0

    total = home_strength + away_strength + draw_prob
    p_home, p_away, p_draw = home_strength / total, away_strength / total, draw_prob / total

    # Bookmaker margin ~5%
    margin = 1.05
    odds_home = round(margin / p_home, 2)
    odds_away = round(margin / p_away, 2)
    odds_draw = round(margin / p_draw, 2) if p_draw > 0 else None

    # Match time: spread today between 14:00 and 22:30 UTC
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
    for bm_name in ["Pinnacle", "Bet365", "1xBet"]:
        bm_rng = _deterministic_random(f"{event_id}-{bm_name}")
        variation = bm_rng.uniform(-0.08, 0.08)
        bm_outcomes = [
            {"name": o["name"], "price": round(max(1.05, o["price"] * (1 + variation)), 2)}
            for o in outcomes
        ]
        bookmakers.append({
            "key": bm_name.lower(),
            "title": bm_name,
            "markets": [{"key": "h2h", "outcomes": bm_outcomes}],
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


def _generate_mock_matches(sport_key: str) -> List[Dict]:
    fixtures = MOCK_FIXTURES.get(sport_key, [])
    return [
        _generate_mock_event(sport_key, h, a, lg, i)
        for i, (h, a, lg) in enumerate(fixtures)
    ]


def get_all_mock_matches() -> List[Dict]:
    out = []
    for sk in MOCK_FIXTURES.keys():
        out.extend(_generate_mock_matches(sk))
    return out


# ---------- REAL API (with cache) ----------

async def _fetch_real_sport(sport_key: str) -> List[Dict]:
    url = f"{ODDS_API_BASE}/sports/{sport_key}/odds"
    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "eu",
        "markets": "h2h",
        "oddsFormat": "decimal",
        "dateFormat": "iso",
    }
    async with httpx.AsyncClient(timeout=15.0) as http:
        r = await http.get(url, params=params)
        if r.status_code != 200:
            return []
        return r.json()


async def fetch_all_matches(db) -> List[Dict]:
    """Return today's matches across all supported sports, using mongo cache."""
    cache_key = "all_matches"
    cached = await db.odds_cache.find_one({"_id": cache_key})
    if cached:
        updated = cached.get("updated_at")
        if updated:
            updated_dt = datetime.fromisoformat(updated) if isinstance(updated, str) else updated
            if updated_dt.tzinfo is None:
                updated_dt = updated_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - updated_dt < timedelta(minutes=CACHE_TTL_MINUTES):
                return cached["data"]

    if ODDS_API_KEY:
        matches: List[Dict] = []
        for sk in REAL_SPORT_KEYS:
            try:
                matches.extend(await _fetch_real_sport(sk))
            except Exception:
                pass
        if not matches:
            matches = get_all_mock_matches()
    else:
        matches = get_all_mock_matches()

    # Keep only upcoming matches (next 14 days) so the dashboard always has content
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=14)
    filtered = []
    for m in matches:
        try:
            ct = datetime.fromisoformat(m["commence_time"].replace("Z", "+00:00"))
            if now <= ct <= horizon:
                filtered.append(m)
        except Exception:
            filtered.append(m)
    # Sort by date ascending
    filtered.sort(key=lambda x: x.get("commence_time", ""))
    # Diversify: cap per competition so big tournaments don't crowd out others
    per_comp_cap = 12
    comp_counts: Dict[str, int] = {}
    diversified: List[Dict] = []
    for m in filtered:
        key = m.get("sport_title") or "Other"
        if comp_counts.get(key, 0) >= per_comp_cap:
            continue
        diversified.append(m)
        comp_counts[key] = comp_counts.get(key, 0) + 1
    filtered = diversified[:120]

    await db.odds_cache.update_one(
        {"_id": cache_key},
        {"$set": {"data": filtered, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return filtered


async def get_match_by_id(db, match_id: str) -> Optional[Dict]:
    matches = await fetch_all_matches(db)
    for m in matches:
        if m.get("id") == match_id:
            return m
    return None
