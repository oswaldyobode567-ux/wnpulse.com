"""
WinPulse Stats Service — cached football-data.org observations.

The existing competition mapping and account permissions determine coverage.
The scheduled worker supplies recent results. Public presentation reads cache
only, with up to ten observed matches per team, explicitly bounded H2H samples
and provider crests when available. No xG or injury data is manufactured.
"""
import os
import asyncio
import time
import math
import unicodedata
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

import httpx
import logging
import hashlib
import json
import re
import html
from pymongo.errors import DuplicateKeyError
from pymongo import UpdateOne
logger = logging.getLogger("winpulse.stats_service")
logger.setLevel(logging.INFO)

FOOTBALL_DATA_TOKEN = os.environ.get("FOOTBALL_DATA_TOKEN", "").strip()
FOOTBALL_DATA_BASE = "https://api.football-data.org/v4"

# Cache plus long que les cotes (la forme/H2H change lentement) — 6h comme
# le cache principal des matchs, pour rester coherent et economiser le quota.
STATS_CACHE_TTL_MINUTES = 360

# Mapping sport_key (The Odds API) -> code competition football-data.org.
# Seules les 12 ligues du plan gratuit sont mappees ; tout sport_key absent
# de cette table est simplement ignore (fallback silencieux).
COMPETITION_MAP = {
    "soccer_epl": "PL",
    "soccer_spain_la_liga": "PD",
    "soccer_germany_bundesliga": "BL1",
    "soccer_italy_serie_a": "SA",
    "soccer_france_ligue_one": "FL1",
    "soccer_uefa_champs_league": "CL",
    "soccer_fifa_world_cup": "WC",
    "soccer_netherlands_eredivisie": "DED",
    "soccer_portugal_primeira_liga": "PPL",
    "soccer_brazil_campeonato": "BSA",
    # NOTE : "EL" (Europa League) et "CLI" (Copa Libertadores) retires —
    # verification faite (aout 2026) : ils NE font PAS partie des 12
    # competitions du plan gratuit football-data.org, contrairement a ce
    # qui etait suppose ici avant. Les garder aurait fait echouer
    # silencieusement chaque appel pour ces competitions (0 vraie donnee
    # recuperee, fallback sur l'estimation, sans jamais planter — mais
    # sans jamais donner de vraie donnee non plus).
    #
    # LIMITE ASSUMEE ET CONFIRMEE : le plan gratuit ne couvre QUE ces 10
    # championnats — aucune ligue scandinave (Norvege, Suede, Danemark),
    # aucune qualification UEFA, aucune ligue mineure. Tant que les grands
    # championnats n'ont pas repris pleinement, la tres grande majorite des
    # matchs actifs sur le site (odds-api.io : ligues scandinaves,
    # qualifications UEFA) n'auront jamais de vraies statistiques via cette
    # source — c'est une limite du plan gratuit, pas un bug. Passer sur une
    # API payante (ex: API-Football) est la seule vraie solution pour
    # couvrir ces competitions.
}


def is_covered(sport_key: str) -> bool:
    """True si ce sport_key est couvert par le plan gratuit football-data.org."""
    return bool(FOOTBALL_DATA_TOKEN) and sport_key in COMPETITION_MAP


def _normalize_name(name: str) -> str:
    return "".join(c.lower() for c in (name or "") if c.isalnum())


# Requests share one process-local gate, including manual refreshes.
# The refresh worker runs in the background: waiting here never delays /api/matches.
_FD_MIN_INTERVAL_SECONDS = 7.0
_fd_lock = asyncio.Lock()
_fd_next_request = 0.0
_fd_backoff_until = 0.0


async def _fd_get(path: str, params: Optional[Dict] = None) -> Optional[Dict]:
    """Fetch only from the configured provider; log status without secrets."""
    global _fd_next_request, _fd_backoff_until
    if not FOOTBALL_DATA_TOKEN:
        return None
    async with _fd_lock:
        now = time.monotonic()
        if now < _fd_backoff_until:
            return None
        delay = max(0.0, _fd_next_request - now)
        if delay:
            await asyncio.sleep(delay)
        _fd_next_request = time.monotonic() + _FD_MIN_INTERVAL_SECONDS
        try:
            async with httpx.AsyncClient(timeout=15.0) as http:
                r = await http.get(f"{FOOTBALL_DATA_BASE}{path}", headers={"X-Auth-Token": FOOTBALL_DATA_TOKEN}, params=params or {})
                if r.status_code == 429:
                    _fd_backoff_until = time.monotonic() + 65
                    logger.warning("football-data.org limite de requetes HTTP 429; nouvelle tentative au prochain cycle")
                    return None
                if r.status_code != 200:
                    logger.warning("football-data.org %s -> HTTP %s", path, r.status_code)
                    return None
                return r.json()
        except Exception as exc:
            logger.warning("football-data.org %s -> erreur %s", path, type(exc).__name__)
            return None


# ─── Mapping equipes (nom -> id football-data.org), par competition ─────────

async def _get_competition_teams(db, competition_code: str) -> Dict[str, int]:
    """
    Retourne {nom_normalise: team_id} pour une competition, avec cache
    MongoDB long (les equipes d'une competition changent rarement en cours
    de saison). Une seule requete par competition, jamais par match.
    """
    cache_key = f"fd_teams_{competition_code}"
    cached = await db.stats_cache.find_one({"_id": cache_key})
    if cached:
        updated = cached.get("updated_at")
        if updated:
            try:
                updated_dt = datetime.fromisoformat(updated)
                if datetime.now(timezone.utc) - updated_dt < timedelta(hours=24):
                    if cached.get("profiles") is not None:
                        return cached.get("data", {})
            except Exception:
                pass

    data = await _fd_get(f"/competitions/{competition_code}/teams")
    if not data or "teams" not in data:
        return cached.get("data", {}) if cached else {}

    mapping = {}; ambiguous = set()
    for team in data.get("teams", []):
        if not team.get("id"):
            continue
        for field in ("name", "shortName", "tla"):
            alias = _normalize_name(team.get(field, ""))
            if not alias:
                continue
            if alias in mapping and mapping[alias] != team["id"]:
                ambiguous.add(alias)
            mapping[alias] = team["id"]
    for alias in ambiguous:
        mapping.pop(alias, None)

    await db.stats_cache.update_one(
        {"_id": cache_key},
        {"$set": {"data": mapping, "profiles": {str(t["id"]): {"id": t["id"], "name": t.get("name"), "crest": _safe_crest(t.get("crest"))} for t in data.get("teams", []) if t.get("id")}, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return mapping


def _find_team_id(mapping: Dict[str, int], team_name: str) -> Optional[int]:
    """Correspondance exacte d'abord, puis correspondance partielle en secours
    (les noms d'equipes different legerement entre The Odds API et
    football-data.org, ex: 'Manchester City' vs 'Manchester City FC')."""
    norm = _normalize_name(team_name)
    if norm in mapping:
        return mapping[norm]
    def folded(value):
        return "".join(c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c))
    norm = folded(norm)
    exact = {team_id for known_name, team_id in mapping.items() if folded(known_name) == norm}
    if exact:
        return next(iter(exact)) if len(exact)==1 else None
    candidates = {team_id for known_name, team_id in mapping.items()
                  if norm and len(norm) >= 5 and len(folded(known_name)) >= 5
                  and (norm in folded(known_name) or folded(known_name) in norm)}
    return next(iter(candidates)) if len(candidates) == 1 else None



# ─── Forme reelle + H2H reel pour une equipe ─────────────────────────────────

async def _get_team_recent_matches(team_id: int, limit: int = 10) -> List[Dict]:
    """Derniers matchs TERMINES d'une equipe, toutes competitions confondues."""
    data = await _fd_get(
        f"/teams/{team_id}/matches",
        params={"status": "FINISHED", "limit": limit},
    )
    if not data or "matches" not in data:
        return []
    return data.get("matches", [])


def _form_string(matches: List[Dict], team_id: int, n: int = 5) -> str:
    """Construit une chaine 'WWDLW' (plus recent en dernier) a partir de
    vrais resultats — remplace directement le _form() simule par hash."""
    recent = sorted(matches, key=lambda m: m.get("utcDate", ""))[-n:]
    out = []
    for m in recent:
        score = m.get("score", {}).get("fullTime", {})
        home_id = (m.get("homeTeam") or {}).get("id")
        gh, ga = score.get("home"), score.get("away")
        if gh is None or ga is None:
            continue
        is_home = home_id == team_id
        goals_for = gh if is_home else ga
        goals_against = ga if is_home else gh
        if goals_for > goals_against:
            out.append("W")
        elif goals_for < goals_against:
            out.append("L")
        else:
            out.append("D")
    return "".join(out) if out else ""


def _compute_h2h(home_matches: List[Dict], home_id: int, away_id: int,
                  n: int = 10) -> Optional[Dict]:
    """Calcule le H2H reel a partir des matchs recents de l'equipe a domicile,
    en filtrant ceux joues contre l'equipe adverse."""
    h2h_matches = [
        m for m in home_matches
        if {(m.get("homeTeam") or {}).get("id"), (m.get("awayTeam") or {}).get("id")}
        == {home_id, away_id}
    ][:n]
    if not h2h_matches:
        return None

    home_wins = draws = away_wins = 0
    for m in h2h_matches:
        score = m.get("score", {}).get("fullTime", {})
        gh, ga = score.get("home"), score.get("away")
        if gh is None or ga is None:
            continue
        match_home_id = (m.get("homeTeam") or {}).get("id")
        home_team_goals = gh if match_home_id == home_id else ga
        away_team_goals = ga if match_home_id == home_id else gh
        if home_team_goals > away_team_goals:
            home_wins += 1
        elif home_team_goals < away_team_goals:
            away_wins += 1
        else:
            draws += 1

    return {"home_wins": home_wins, "draws": draws, "away_wins": away_wins,
            "matches_found": len(h2h_matches)}


# ─── Point d'entree : refresh planifie (cache tout, pas d'appel live) ───────


def _observed_history(matches, team_id):
    rows = []
    for match in matches:
        if match.get("status") != "FINISHED":
            continue
        home = (match.get("homeTeam") or {}).get("id")
        away = (match.get("awayTeam") or {}).get("id")
        score = (match.get("score") or {}).get("fullTime") or {}
        if team_id not in (home,away) or score.get("home") is None or score.get("away") is None:
            continue
        rows.append({"id":match.get("id"),"date":match.get("utcDate"),
                     "goals_for":score["home"] if home==team_id else score["away"],
                     "goals_against":score["away"] if home==team_id else score["home"],
                     "venue":"home" if home==team_id else "away"})
    return rows

async def refresh_real_stats_cache(db, matches: List[Dict]) -> Dict:
    """
    Pour chaque match a venir dans une des 12 competitions couvertes,
    recupere et met en cache la forme reelle (5 derniers matchs) et le H2H
    reel des deux equipes. Appele par le worker planifie de server.py, JAMAIS
    sur une requete utilisateur — memes garanties que odds_service.py.

    Cle de cache : "home_norm|away_norm" -> {form_home, form_away, h2h}
    """
    if not FOOTBALL_DATA_TOKEN:
        return {"ok": True, "skipped": "FOOTBALL_DATA_TOKEN non configure", "updated": 0}

    covered = [m for m in matches if is_covered(m.get("sport_key", ""))]
    if not covered:
        return {"ok": True, "updated": 0, "covered_matches": 0}

    # Regroupe par competition pour ne charger le mapping equipes qu'une fois
    by_competition: Dict[str, List[Dict]] = {}
    for m in covered:
        code = COMPETITION_MAP[m["sport_key"]]
        by_competition.setdefault(code, []).append(m)

    updated = 0
    team_matches_fetched: Dict[int, List[Dict]] = {}

    # Fetch the competition catalogues first. They supply club crests and are
    # reused for many matches. Recent match history follows without blocking the
    # main odds refresh, subject to the worker's time budget.
    team_maps = {}
    for code in by_competition:
        team_maps[code] = await _get_competition_teams(db, code)
    logger.info("football-data.org catalogues equipes: %s/%s competitions disponibles",
                sum(bool(m) for m in team_maps.values()), len(by_competition))
    for code, comp_matches in by_competition.items():
        team_map = team_maps.get(code) or {}
        if not team_map:
            continue

        for m in comp_matches:
            home_name = m.get("home_team", "")
            away_name = m.get("away_team", "")
            home_id = _find_team_id(team_map, home_name)
            away_id = _find_team_id(team_map, away_name)
            if not home_id or not away_id:
                continue

            cache_key = f"{_normalize_name(home_name)}|{_normalize_name(away_name)}"
            existing = await db.real_stats_cache.find_one({"_id": cache_key})
            if existing:
                updated_at = existing.get("updated_at")
                try:
                    if existing.get("display_version") == 1 and updated_at and (datetime.now(timezone.utc)
                       - datetime.fromisoformat(updated_at)) < timedelta(minutes=STATS_CACHE_TTL_MINUTES):
                        continue  # deja frais, on economise le quota
                except Exception:
                    pass

            if home_id not in team_matches_fetched:
                team_matches_fetched[home_id] = await _get_team_recent_matches(home_id)
            if away_id not in team_matches_fetched:
                team_matches_fetched[away_id] = await _get_team_recent_matches(away_id)

            home_matches = team_matches_fetched.get(home_id, [])
            away_matches = team_matches_fetched.get(away_id, [])

            form_home = _form_string(home_matches, home_id)
            form_away = _form_string(away_matches, away_id)
            h2h = _compute_h2h(home_matches, home_id, away_id)

            if not form_home and not form_away and not h2h:
                continue  # no observed data to publish

            await db.real_stats_cache.update_one(
                {"_id": cache_key},
                {"$set": {
                    "form_home": form_home,
                    "form_away": form_away,
                    "h2h": h2h,
                    "competition": code,
                    "history_home": _observed_history(home_matches, home_id),
                    "display_home": _display_history(home_matches, home_id),
                    "display_away": _display_history(away_matches, away_id),
                    "display_version": 1,
                    "history_away": _observed_history(away_matches, away_id),
                    "source": "football-data.org",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
            updated += 1

    return {"ok": True, "updated": updated, "covered_matches": len(covered)}


async def get_real_stats_map(db, matches: List[Dict]) -> Dict[str, Dict]:
    """
    Lecture SEULE depuis le cache (jamais d'appel API ici) — a utiliser dans
    le chemin de requete utilisateur, exactement comme fetch_all_matches lit
    odds_cache. Retourne {"home_norm|away_norm": {form_home, form_away, h2h}}
    uniquement pour les matchs ou une vraie donnee a ete mise en cache.
    """
    result: Dict[str, Dict] = {}
    covered = [m for m in matches if is_covered(m.get("sport_key", ""))]
    if not covered:
        return result

    keys = [
        f"{_normalize_name(m.get('home_team',''))}|{_normalize_name(m.get('away_team',''))}"
        for m in covered
    ]
    cursor = db.real_stats_cache.find({"_id": {"$in": keys}})
    async for doc in cursor:
        result[doc["_id"]] = {
            "form_home": doc.get("form_home", ""),
            "form_away": doc.get("form_away", ""),
            "h2h": doc.get("h2h"),
            "real_data_used": bool(doc.get("form_home") or doc.get("form_away") or doc.get("h2h")),
            "history_home": doc.get("history_home", []),
            "history_away": doc.get("history_away", []),
            "source": doc.get("source", "football-data.org"),
            "updated_at": doc.get("updated_at"),
        }
    return result


def lookup_real_stats(real_stats_map: Dict[str, Dict], home: str, away: str) -> Optional[Dict]:
    """Helper synchrone pour prediction_engine.py — cherche dans le map deja
    charge, aucun appel reseau ici."""
    key = f"{_normalize_name(home)}|{_normalize_name(away)}"
    return real_stats_map.get(key)



# Read-only presentation helpers. These do not change official predictions.
def _safe_crest(value):
    if not isinstance(value, str):
        return None
    parsed = urlparse(value)
    return value if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password else None


def _display_date(value):
    try:
        stamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return stamp.replace(tzinfo=timezone.utc) if stamp.tzinfo is None else stamp
    except (ValueError, TypeError):
        return None


def _display_history(matches, team_id):
    rows = []
    for match in matches:
        if match.get("status") != "FINISHED":
            continue
        home, away = match.get("homeTeam") or {}, match.get("awayTeam") or {}
        score = match.get("score") or {}
        # FullTime includes extra time on some feeds. Do not mix 120-minute
        # scores into statistics normally interpreted as 90-minute totals.
        regular = score.get("regularTime") if score.get("duration") in ("EXTRA_TIME", "PENALTY_SHOOTOUT") else score.get("fullTime")
        if not isinstance(regular, dict) or team_id not in (home.get("id"), away.get("id")):
            continue
        gh, ga = regular.get("home"), regular.get("away")
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0 or v > 30 or int(v) != v for v in (gh,ga)):
            continue
        rows.append({"id":str(match.get("id") or ""),"date":match.get("utcDate"),
                     "home_id":home.get("id"),"away_id":away.get("id"),
                     "home_team":home.get("name"),"away_team":away.get("name"),
                     "score_home":int(gh),"score_away":int(ga),
                     "venue":"home" if home.get("id")==team_id else "away",
                     "team_id":team_id,"competition":(match.get("competition") or {}).get("name")})
    return rows


def _verified_display_rows(rows, cutoff):
    unique = {}; conflicts = set()
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        stamp = _display_date(row.get("date"))
        if not stamp or stamp >= cutoff or row.get("venue") not in ("home", "away"):
            continue
        gh, ga = row.get("score_home"), row.get("score_away")
        if any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or v < 0 or v > 30 or int(v)!=v for v in (gh,ga)):
            continue
        if not row.get("home_team") or not row.get("away_team"):
            continue
        key = (stamp.isoformat(), row.get("home_id") or row["home_team"], row.get("away_id") or row["away_team"])
        if key in unique and (unique[key]["score_home"],unique[key]["score_away"]) != (gh,ga):
            conflicts.add(key)
        unique[key] = dict(row)
    return sorted((r for k,r in unique.items() if k not in conflicts),key=lambda r:_display_date(r["date"]),reverse=True)[:10]


def _display_summary(rows):
    n = len(rows)
    if not n:
        return {"played":0,"wins":0,"draws":0,"losses":0,"goals_for":None,"goals_against":None,
                "over25":None,"btts":None,"clean_sheets":None,"scored":None,"form":[]}
    gf = [r["score_home"] if r["venue"]=="home" else r["score_away"] for r in rows]
    ga = [r["score_away"] if r["venue"]=="home" else r["score_home"] for r in rows]
    form = ["W" if f>a else "L" if f<a else "D" for f,a in zip(gf,ga)]
    return {"played":n,"wins":form.count("W"),"draws":form.count("D"),"losses":form.count("L"),
            "goals_for":round(sum(gf)/n,2),"goals_against":round(sum(ga)/n,2),
            "over25":round(100*sum(f+a>2.5 for f,a in zip(gf,ga))/n,1),
            "btts":round(100*sum(f>0 and a>0 for f,a in zip(gf,ga))/n,1),
            "clean_sheets":round(100*sum(a==0 for a in ga)/n,1),
            "scored":round(100*sum(f>0 for f in gf)/n,1),"form":form[:5]}


async def enrich_match_badges(db, matches):
    """One cache query per batch, no network calls per card or per visitor."""
    codes = list({COMPETITION_MAP[m.get("sport_key")] for m in matches if m.get("sport_key") in COMPETITION_MAP})
    docs = await db.stats_cache.find({"_id":{"$in":["fd_teams_"+code for code in codes]}}).to_list(length=len(codes)) if codes else []
    mappings = {d["_id"][9:]:d for d in docs}
    result = []
    for match in matches:
        row = dict(match); data = mappings.get(COMPETITION_MAP.get(row.get("sport_key")), {})
        for side in ("home", "away"):
            team_id = _find_team_id(data.get("data",{}), row.get(side+"_team", ""))
            crest = _safe_crest((data.get("profiles",{}).get(str(team_id)) or {}).get("crest"))
            if crest and not row.get(side+"_logo"):
                row[side+"_logo"] = crest
        result.append(row)
    return await _apisports_enrich_badges(db, result)


async def get_match_insights(db, match):
    now = datetime.now(timezone.utc)
    kickoff = _display_date(match.get("commence_time"))
    cutoff = min(now,kickoff) if kickoff else now
    empty = {"version":1,"status":"unavailable","source":"football-data.org","sample_limit":10,
             "cutoff":cutoff.isoformat(),"home":{},"away":{},"h2h":[],"h2h_scope":"recent_sample_only"}
    if not str(match.get("sport_key", "")).startswith("soccer"):
        return {**empty,"reason":"sport_not_covered"}
    key = f"{_normalize_name(match.get('home_team',''))}|{_normalize_name(match.get('away_team',''))}"
    doc = await db.real_stats_cache.find_one({"_id":key})
    if not doc or doc.get("display_version") != 1:
        alternative = await _apisports_football_insights(db, match, cutoff)
        return alternative or {**empty,"reason":"cache_not_ready"}
    home = _verified_display_rows(doc.get("display_home"),cutoff)
    away = _verified_display_rows(doc.get("display_away"),cutoff)
    def team(rows, venue):
        return {"recent":rows,"overall":_display_summary(rows),
                "venue":_display_summary([r for r in rows if r["venue"]==venue])}
    # Both samples are needed to identify the two provider team IDs reliably.
    home_id = home[0].get("team_id") if home else None
    away_id = away[0].get("team_id") if away else None
    encounters = _verified_display_rows([r for r in home+away if home_id and away_id and
        {r.get("home_id"),r.get("away_id")}=={home_id,away_id}],cutoff)
    stamp = _display_date(doc.get("updated_at"))
    return {**empty,"status":"ready" if home or away else "unavailable","reason":None if home or away else "no_verified_results",
            "home":team(home,"home"),"away":team(away,"away"),"h2h":encounters,
            "updated_at":doc.get("updated_at"),"stale":not stamp or (now-stamp).total_seconds()>86400}


# API-Sports is an optional, read-only enrichment; no prediction is changed.
# The scheduler owns a distributed lease, and requests are never made by page views.
API_SPORTS_KEY = os.environ.get("API_SPORTS_KEY", "").strip()
_APISPORTS_BASE = {"football": "https://v3.football.api-sports.io", "basketball": "https://v1.basketball.api-sports.io", "hockey": "https://v1.hockey.api-sports.io", "baseball": "https://v1.baseball.api-sports.io", "american_football": "https://v1.american-football.api-sports.io"}
_APISPORTS_DAILY_LIMIT = 80  # per API; leaves space for other account activity
_APISPORTS_RUN_LIMIT = 12   # across all APIs, per scheduler run


def _as_sport(match):
    key = str(match.get("sport_key") or "").lower()
    if key.startswith("soccer_"): return "football"
    if key.startswith("basketball_"): return "basketball"
    if key.startswith("icehockey_"): return "hockey"
    if key.startswith("baseball_"): return "baseball"
    if key.startswith("americanfootball_"): return "american_football"
    return None


def _as_normalize(name):
    return "".join(c for c in unicodedata.normalize("NFKD", str(name or "")).casefold() if c.isalnum() and not unicodedata.combining(c))


def _as_key(sport, name):
    return "as_team:" + sport + ":" + _as_normalize(name)


async def _as_request(db, sport, path, params):
    data = await enrichment_request(db, "apisports:" + sport, path, params)
    value = data.get("response") if isinstance(data, dict) else None
    return value if isinstance(value, list) else None


async def refresh_apisports_cache(db, matches):
    if not API_SPORTS_KEY: return {"skipped": "key_missing"}
    now = datetime.now(timezone.utc)
    used = 0
    unavailable_sports = set()
    for match in matches:
        sport = _as_sport(match)
        if not sport or sport in unavailable_sports: continue
        kickoff = _display_date(match.get("commence_time"))
        if not kickoff or kickoff < now or kickoff > now + timedelta(days=7): continue
        for side in ("home", "away"):
            name = str(match.get(side + "_team") or "").strip()
            if len(name) < 3: continue
            cache_id = _as_key(sport, name)
            doc = await db.stats_cache.find_one({"_id": cache_id}) or {}
            updated = _display_date(doc.get("updated_at"))
            identity_fresh = bool(updated and now - updated < timedelta(days=30 if doc.get("matched") else 3))
            recent_updated = _display_date(doc.get("recent_updated_at"))
            refresh_history = sport == "football" and doc.get("matched") and (not recent_updated or now - recent_updated > timedelta(hours=24))
            if identity_fresh and not refresh_history: continue
            if used >= _APISPORTS_RUN_LIMIT: return {"requests": used}
            if identity_fresh and doc.get("team_id"):
                rows = [{"team": {"id": doc["team_id"], "name": doc.get("name") or name, "logo": doc.get("logo")}}]
            else:
                rows = await _as_request(db, sport, "/teams", {"search": name})
                used += 1
            if rows is None:
                unavailable_sports.add(sport)
                break  # another sport can still be enriched
            candidates = []
            for item in rows:
                team = item.get("team") if isinstance(item.get("team"),dict) else item
                if entity_name(team.get("name"),sport) == entity_name(name,sport) and team.get("id"):
                    candidates.append(team)
            unique = {str(t["id"]): t for t in candidates}
            if len(unique) != 1:
                if doc.get("matched"): continue  # retain a previously verified identity
                await db.stats_cache.update_one({"_id": cache_id}, {"$set": {"updated_at": now.isoformat(), "matched": False}}, upsert=True)
                continue
            team = next(iter(unique.values()))
            fields = {"updated_at": now.isoformat(), "matched": True, "team_id": team["id"], "name": team.get("name")}
            if _safe_crest(team.get("logo")):fields["logo"]=_safe_crest(team["logo"])
            await db.stats_cache.update_one({"_id": cache_id}, {"$set": fields}, upsert=True)
            # Detailed comparable statistics below are football-only: the UI's
            # goal metrics must never be applied to basketball points.
            if sport == "football" and used < _APISPORTS_RUN_LIMIT:
                games = await _as_request(db, sport, "/fixtures", {"team": team["id"], "last": 10, "status": "FT"})
                used += 1
                if games is not None:
                    recent = []
                    for game in games:
                        fixture, teams, goals = game.get("fixture") or {}, game.get("teams") or {}, game.get("goals") or {}
                        home, away = teams.get("home") or {}, teams.get("away") or {}
                        if (fixture.get("status") or {}).get("short") != "FT" or team["id"] not in (home.get("id"), away.get("id")): continue
                        recent.append({"id": str(fixture.get("id") or ""), "date": fixture.get("date"), "home_id": home.get("id"), "away_id": away.get("id"), "home_team": home.get("name"), "away_team": away.get("name"), "score_home": goals.get("home"), "score_away": goals.get("away"), "venue": "home" if home.get("id") == team["id"] else "away", "team_id": team["id"], "competition": (game.get("league") or {}).get("name")})
                    await db.stats_cache.update_one({"_id": cache_id}, {"$set": {"recent": recent, "recent_updated_at": now.isoformat()}})
    return {"requests": used}


async def _apisports_enrich_badges(db, matches):
    keys = list({_as_key(_as_sport(m), m.get(side + "_team")) for m in matches for side in ("home", "away") if _as_sport(m) and m.get(side + "_team")})
    if not keys: return matches
    docs = await db.stats_cache.find({"_id": {"$in": keys}}).to_list(length=len(keys))
    lookup = {doc["_id"]: doc for doc in docs}
    result = []
    for match in matches:
        row = dict(match); sport = _as_sport(row)
        for side in ("home", "away"):
            doc = lookup.get(_as_key(sport, row.get(side + "_team")), {}) if sport else {}
            logo = _safe_crest(doc.get("logo")) if doc.get("matched") else None
            if logo and not row.get(side + "_logo"): row[side + "_logo"] = logo
        result.append(row)
    return result


async def _apisports_football_insights(db, match, cutoff):
    ids = [_as_key("football", match.get(side + "_team")) for side in ("home", "away")]
    docs = await db.stats_cache.find({"_id": {"$in": ids}}).to_list(length=2)
    by_id = {d["_id"]: d for d in docs}
    home_doc, away_doc = (by_id.get(key, {}) for key in ids)
    home = _verified_display_rows(home_doc.get("recent"), cutoff)
    away = _verified_display_rows(away_doc.get("recent"), cutoff)
    if not home and not away: return None
    def team(rows, venue):
        return {"recent": rows, "overall": _display_summary(rows), "venue": _display_summary([r for r in rows if r["venue"] == venue])}
    home_id, away_id = home_doc.get("team_id"), away_doc.get("team_id")
    h2h = _verified_display_rows([r for r in home + away if home_id and away_id and {r.get("home_id"),r.get("away_id")} == {home_id,away_id}], cutoff)
    stamps = [_display_date(d.get("recent_updated_at")) for d in (home_doc,away_doc) if d.get("recent")]
    stamps = [v for v in stamps if v]
    stamp = min(stamps) if stamps else None
    return {"version": 1, "status": "ready", "source": "API-Sports", "sample_limit": 10, "cutoff": cutoff.isoformat(), "home": team(home,"home"), "away": team(away,"away"), "h2h": h2h, "h2h_scope": "recent_sample_only", "updated_at": stamp.isoformat() if stamp else None, "stale": not stamp or (datetime.now(timezone.utc)-stamp).total_seconds() > 86400}


# ─── Independent enrichment v2 (no odds/cache deletion; no official picks) ───
_ENRICHMENT_SOURCES = {
    "openfootball": ("https://raw.githubusercontent.com", 30, .5),
    "wikidata": ("https://www.wikidata.org", 240, 1.),
    "commons": ("https://commons.wikimedia.org", 120, 1.),
    "tennis": ("https://tennis-api-atp-wta-itf.p.rapidapi.com", 40, 1.),
    **{"apisports:"+key: (url, 80, 6.1) for key,url in _APISPORTS_BASE.items()},
}
_enrichment_locks = {}
_enrichment_next = {}
_OPENFOOTBALL = {"soccer_epl":"en.1", "soccer_efl_champ":"en.2", "soccer_spain_la_liga":"es.1", "soccer_spain_segunda_division":"es.2", "soccer_germany_bundesliga":"de.1", "soccer_germany_bundesliga2":"de.2", "soccer_france_ligue_one":"fr.1", "soccer_france_ligue_two":"fr.2", "soccer_italy_serie_a":"it.1", "soccer_italy_serie_b":"it.2"}
# Small, reviewed aliases only. Never fuzzy-match names across sports or countries.
_TEAM_ALIASES = {"brightonandhovealbion":"brightonhovealbion", "fcbarcelona":"barcelona", "bayernmunchen":"bayernmunich", "fcbayernmunchen":"bayernmunich", "athleticclub":"athleticbilbao", "realbetisbalompie":"realbetis", "clubatleticodemadrid":"atleticomadrid", "manchestercityfc":"manchestercity", "mancity":"manchestercity", "manchesterunitedfc":"manchesterunited", "manunited":"manchesterunited", "manutd":"manchesterunited", "tottenhamhotspurfc":"tottenhamhotspur", "tottenham":"tottenhamhotspur", "wolverhamptonwanderersfc":"wolverhamptonwanderers", "wolves":"wolverhamptonwanderers", "brightonhovealbionfc":"brightonhovealbion", "brighton":"brightonhovealbion", "parissaintgermainfc":"parissaintgermain", "parissg":"parissaintgermain", "psg":"parissaintgermain", "internazionalemilano":"intermilan", "internazionalemilan":"intermilan", "fcinternazionalemilano":"intermilan"}


def enrichment_sport(match):
    key = str(match.get("sport_key") or "").lower()
    return "football" if key.startswith("soccer_") else "tennis" if key.startswith("tennis_") else "basketball" if key.startswith("basketball_") else None


def entity_name(name, sport):
    value = _as_normalize(name)
    if sport == "football":
        if value in _TEAM_ALIASES: return _TEAM_ALIASES[value]
        # FC suffix only, not reserve/women/age identifiers.
        if value.endswith("fc") and len(value)>5: value=value[:-2]
    return value


def entity_key(sport,name):
    return sport + ":" + entity_name(name,sport)


def _enrichment_plain(value):
    return html.unescape(re.sub(r"<[^>]*>", "", str(value or ""))).strip()[:300]


async def enrichment_request(db, provider, path, params=None):
    config = _ENRICHMENT_SOURCES.get(provider)
    if not config or not path.startswith("/") or ".." in path: return None
    headers={"User-Agent":"WinPulseData/1.0 (https://wnpulse.com; contact@wnpulse.com)"}
    if provider.startswith("apisports:"):
        if not API_SPORTS_KEY: return None
        headers["x-apisports-key"]=API_SPORTS_KEY
    if provider=="tennis":
        key=os.environ.get("TENNIS_RAPIDAPI_KEY", "").strip()
        if not key: return None
        headers.update({"X-RapidAPI-Key":key,"X-RapidAPI-Host":"tennis-api-atp-wta-itf.p.rapidapi.com"})
    now=datetime.now(timezone.utc)
    status_id="source:"+provider
    state=await db.enrichment_state.find_one({"_id":status_id}) or {}
    blocked=_display_date(state.get("backoff_until"))
    if blocked and blocked>now: return None
    # An access-denied endpoint never disables unrelated endpoints such as teams.
    capability=await db.enrichment_state.find_one({"_id":status_id+":endpoint:"+hashlib.sha256(path.encode()).hexdigest()}) or {}
    retry=_display_date(capability.get("retry_at"))
    if retry and retry>now:return None
    lock=_enrichment_locks.setdefault(provider,asyncio.Lock())
    async with lock:
        wait=max(0,_enrichment_next.get(provider,0)-time.monotonic())
        if wait:await asyncio.sleep(wait)
        _enrichment_next[provider]=time.monotonic()+config[2]
        # Share the same counter as the legacy API-Sports worker.
        day=now.strftime("%Y-%m-%d")
        quota_id=(provider+":"+day) if provider.startswith("apisports:") else "enrichment:"+provider+":"+day
        try:
            quota=await db.stats_cache.find_one_and_update({"_id":quota_id,"$or":[{"calls":{"$lt":config[1]}},{"calls":{"$exists":False}}]},
                {"$inc":{"calls":1},"$setOnInsert":{"day":day,"provider":provider}},upsert=True,return_document=True)
        except DuplicateKeyError:return None
        if not quota:return None
        try:
            async with httpx.AsyncClient(timeout=12,follow_redirects=False) as client:
                response=await client.get(config[0]+path,params=params or {},headers=headers)
            code=response.status_code
            update={"checked_at":now.isoformat(),"http_status":code,"status":"available" if code==200 else "unavailable"}
            if code in (401,429,503):
                delay=86400 if code==401 else 3600
                update["backoff_until"]=(now+timedelta(seconds=delay)).isoformat()
            await db.enrichment_state.update_one({"_id":status_id},{"$set":update},upsert=True)
            if code in (403,404):
                await db.enrichment_state.update_one({"_id":status_id+":endpoint:"+hashlib.sha256(path.encode()).hexdigest()},
                    {"$set":{"status":"access_denied" if code==403 else "not_found","retry_at":(now+timedelta(hours=12)).isoformat()}},upsert=True)
            if code!=200:return None
            data=response.json()
            if not isinstance(data,dict):return None
            if data.get("errors"):
                await db.enrichment_state.update_one({"_id":status_id},{"$set":{"status":"restricted","checked_at":now.isoformat()}},upsert=True)
                return None
            return data
        except (httpx.HTTPError,ValueError):
            await db.enrichment_state.update_one({"_id":status_id},{"$set":{"status":"network_error","checked_at":now.isoformat(),"backoff_until":(now+timedelta(minutes=15)).isoformat()}},upsert=True)
            return None


async def audit_enrichment_sources(db):
    report={"checked_at":datetime.now(timezone.utc).isoformat(),"apisports_key_configured":bool(API_SPORTS_KEY),
            "tennis_key_configured":bool(os.environ.get("TENNIS_RAPIDAPI_KEY", "").strip()),"automatic_promotion":False}
    if API_SPORTS_KEY:
        for sport in _APISPORTS_BASE:
            data=await enrichment_request(db,"apisports:"+sport,"/status")
            response=(data or {}).get("response") or {}
            if isinstance(response,dict):
                subscription=response.get("subscription") or {};requests=response.get("requests") or {}
                report[sport]={"plan":subscription.get("plan"),"active":subscription.get("active"),"requests_today":requests.get("current"),"daily_limit":requests.get("limit_day")}
    await db.enrichment_state.update_one({"_id":"capabilities"},{"$set":report},upsert=True)
    return report


def observed_result(sport,league,home,away,hs,aws,date,source,event_id=None,surface=None,precision="instant"):
    start=_display_date(date)
    if not start or not home or not away or entity_name(home,sport)==entity_name(away,sport):return None
    if isinstance(hs,bool) or isinstance(aws,bool):return None
    try:
        hs,aws=float(hs),float(aws)
        if not math.isfinite(hs) or not math.isfinite(aws) or hs<0 or aws<0 or int(hs)!=hs or int(aws)!=aws:return None
        hs,aws=int(hs),int(aws)
    except (ValueError,TypeError,OverflowError):return None
    if sport=="football" and max(hs,aws)>20:return None
    if sport=="tennis" and (hs==aws or max(hs,aws)>3 or min(hs,aws)>2):return None
    now=datetime.now(timezone.utc)
    if start>=now:return None
    # Same event identity across sources and date-only archives; conflicts are
    # flagged, never counted twice. A day is conservative, not a guessed kickoff.
    h,a=entity_name(home,sport),entity_name(away,sport)
    if sport=="tennis" and h>a:home,away,hs,aws,h,a=away,home,aws,hs,a,h
    identity_league=("tennis_wta" if "wta" in str(league) else "tennis_atp" if "atp" in str(league) else league) if sport=="tennis" else league
    identity=hashlib.sha256(json.dumps([sport,identity_league,start.date().isoformat(),h,a]).encode()).hexdigest()
    return {"_id":identity,"sport":sport,"sport_key":league,"home_team":home,"away_team":away,"home_key":h,"away_key":a,
            "team_keys":[h,a],"score_home":hs,"score_away":aws,"date":start.isoformat(),"date_precision":precision,
            "source":source,"source_event_id":str(event_id or ""),"surface":surface if surface in ("hard","clay","grass","indoor_hard") else None}


async def store_observed_results(db,rows):
    now=datetime.now(timezone.utc).isoformat();values={}
    for row in rows:
        if not row:continue
        previous=values.get(row["_id"])
        if previous and (previous["score_home"],previous["score_away"])!=(row["score_home"],row["score_away"]):
            values[row["_id"]]={**previous,"conflicting":True}
        else:values.setdefault(row["_id"],row)
    if not values:return 0
    old_rows=await db.observed_results.find({"_id":{"$in":list(values)}}).to_list(length=len(values))
    existing={row["_id"]:row for row in old_rows};operations=[];n=0
    for identity,row in values.items():
        old=existing.get(identity)
        if old and (old.get("score_home"),old.get("score_away"))!=(row["score_home"],row["score_away"]) and old.get("source")!=row.get("source"):
            operations.append(UpdateOne({"_id":identity},{"$set":{"conflicting":True,"conflict_seen_at":now}}));continue
        update={k:v for k,v in row.items() if k!="_id"};update["last_checked_at"]=now
        if not old or (old.get("score_home"),old.get("score_away"))!=(row["score_home"],row["score_away"]):update["score_observed_at"]=now
        operations.append(UpdateOne({"_id":identity},{"$set":update,"$setOnInsert":{"first_observed_at":now}},upsert=True));n+=1
    if operations:await db.observed_results.bulk_write(operations,ordered=False)
    return n


def parse_openfootball(data,league):
    rows=[]
    for game in data.get("matches",[]):
        ft=(game.get("score") or {}).get("ft")
        day=str(game.get("date") or "")[:10]
        if not isinstance(ft,list) or len(ft)!=2 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}",day):continue
        rows.append(observed_result("football",league,game.get("team1"),game.get("team2"),ft[0],ft[1],day+"T23:59:59+00:00","OpenFootball",precision="day"))
    return [r for r in rows if r]


async def refresh_openfootball(db,matches):
    now=datetime.now(timezone.utc);year=now.year if now.month>=7 else now.year-1
    active=[k for k in _OPENFOOTBALL if any(m.get("sport_key")==k for m in matches)]
    requests=stored=0
    # Rotate seasons and competitions fairly; no first-league quota starvation.
    jobs=[]
    for league in active:
        for y in (year-2,year-1,year):
            key=f"openfootball:{league}:{y}"
            state=await db.enrichment_state.find_one({"_id":key}) or {}
            stamp=_display_date(state.get("updated_at"))
            if not stamp or now-stamp>timedelta(hours=24 if y==year else 24*30):jobs.append((state.get("checked_at") or "",key,league,y))
    for _,key,league,y in sorted(jobs)[:6]:
        data=await enrichment_request(db,"openfootball",f"/openfootball/football.json/master/{y}-{str(y+1)[-2:]}/{_OPENFOOTBALL[league]}.json")
        requests+=1
        await db.enrichment_state.update_one({"_id":key},{"$set":{"checked_at":now.isoformat()}},upsert=True)
        if data is None:continue
        rows=parse_openfootball(data,league);stored+=await store_observed_results(db,rows)
        await db.enrichment_state.update_one({"_id":key},{"$set":{"updated_at":now.isoformat(),"rows":len(rows)}},upsert=True)
    return {"requests":requests,"stored":stored}


def _wd_values(entity,prop):
    values=[]
    for claim in (entity.get("claims") or {}).get(prop,[]):
        if claim.get("rank")=="deprecated":continue
        value=((claim.get("mainsnak") or {}).get("datavalue") or {}).get("value")
        values.append(value.get("id") if isinstance(value,dict) else value)
    return values


def commons_media(info,entity_id):
    meta=info.get("extmetadata") or {}
    value=lambda key:_enrichment_plain((meta.get(key) or {}).get("value"))
    license_name=value("LicenseShortName");license_url=value("LicenseUrl");artist=value("Artist")
    # Only clear, unrestricted copyright licences. Not Google's thumbnails,
    # not Wikipedia fair-use files, not an unverified 'CC' flag.
    allowed=license_name in {"CC0","CC0 1.0","Public domain","CC BY 2.0","CC BY 3.0","CC BY 4.0","CC BY-SA 2.0","CC BY-SA 2.5","CC BY-SA 3.0","CC BY-SA 4.0"}
    url=info.get("thumburl") or info.get("url");page=info.get("descriptionurl")
    if not allowed or not artist or not isinstance(url,str) or urlparse(url).hostname!="upload.wikimedia.org" or not url.startswith("https://"):return None
    if not isinstance(page,str) or urlparse(page).hostname!="commons.wikimedia.org" or not page.startswith("https://"):return None
    if license_name.startswith("CC") and (not license_url.startswith("https://creativecommons.org/") and not license_url.startswith("http://creativecommons.org/")):return None
    if value("LicenseRestriction") or value("Restrictions"):return None
    return {"url":url,"provider":"Wikimedia Commons","source_url":page,"author":artist,"license":license_name,"license_url":(license_url or page).replace("http://","https://",1),"entity_id":entity_id,"kind":"portrait","verified_license":True}


async def find_tennis_portrait(db,name):
    # Initials alone are not enough to identify a person.
    if len(name.split())<2 or any(len(x.strip('.'))==1 for x in name.split()):return None
    data=await enrichment_request(db,"wikidata","/w/api.php",{"action":"wbsearchentities","search":name,"language":"en","uselang":"en","type":"item","limit":5,"format":"json"})
    if data is None:return {"lookup_status":"unavailable"}
    ids=[r.get("id") for r in data.get("search",[]) if _as_normalize(r.get("label"))==_as_normalize(name) or _as_normalize((r.get("match") or {}).get("text"))==_as_normalize(name)]
    if not ids:return None
    data=await enrichment_request(db,"wikidata","/w/api.php",{"action":"wbgetentities","ids":"|".join(ids),"props":"claims|labels|aliases","languages":"en|fr","format":"json"})
    if data is None:return {"lookup_status":"unavailable"}
    candidates=[]
    for entity in data.get("entities",{}).values():
        if "Q5" not in _wd_values(entity,"P31"):continue
        if "Q847" not in _wd_values(entity,"P641") and "Q10833314" not in _wd_values(entity,"P106"):continue
        files=[v for v in _wd_values(entity,"P18") if isinstance(v,str) and v.lower().endswith((".jpg",".jpeg",".png"))]
        if files:candidates.append((entity.get("id"),files[0]))
    if len(candidates)!=1:return None
    entity_id,file=candidates[0]
    data=await enrichment_request(db,"commons","/w/api.php",{"action":"query","titles":"File:"+file,"prop":"imageinfo","iiprop":"url|extmetadata","iiurlwidth":240,"format":"json"})
    if data is None:return {"lookup_status":"unavailable"}
    for page in (data.get("query") or {}).get("pages",{}).values():
        for info in page.get("imageinfo",[]):
            result=commons_media(info,entity_id)
            if result:return result
    return None


async def refresh_media_cache(db,matches):
    now=datetime.now(timezone.utc);pending={}
    for match in matches:
        if enrichment_sport(match)!="tennis":continue
        starts=_display_date(match.get("commence_time"))
        if not starts or not now<starts<now+timedelta(days=7):continue
        for side in ("home","away"):
            name=str(match.get(side+"_team") or "").strip()
            if name:pending[entity_key("tennis",name)]=name
    jobs=[]
    for key,name in pending.items():
        old=await db.entity_media.find_one({"_id":key}) or {}
        retry=_display_date(old.get("next_check_at"))
        if not retry or retry<=now:jobs.append((old.get("checked_at") or "",key,name,old))
    updated=0
    for _,key,name,old in sorted(jobs)[:4]:
        media=await find_tennis_portrait(db,name)
        unavailable=bool((media or {}).get("lookup_status"));valid=bool((media or {}).get("url"))
        values={"sport":"tennis","name":name,"checked_at":now.isoformat(),"next_check_at":(now+(timedelta(minutes=30) if unavailable else timedelta(days=30 if valid else 3))).isoformat(),"status":"ready" if valid else "unavailable" if unavailable else "unresolved"}
        if valid:values["media"]=media;updated+=1
        # Failure never deletes a previously verified image.
        await db.entity_media.update_one({"_id":key},{"$set":values},upsert=True)
    return {"checked":min(4,len(jobs)),"updated":updated}


async def enrich_cached_media(db,matches):
    # One optional left join; exactly one output per input in the same order.
    if not matches:return matches
    keys={entity_key(enrichment_sport(m),m.get(side+"_team")) for m in matches for side in ("home","away") if enrichment_sport(m) and m.get(side+"_team")}
    docs=await db.entity_media.find({"_id":{"$in":list(keys)}}).to_list(length=len(keys)) if keys else []
    by_key={d["_id"]:d for d in docs};result=[]
    for match in matches:
        row=dict(match);sport=enrichment_sport(row)
        for side in ("home","away"):
            doc=by_key.get(entity_key(sport,row.get(side+"_team"))) if sport and row.get(side+"_team") else None
            media=(doc or {}).get("media") or {}
            if media.get("verified_license") and media.get("url"):
                row[side+"_media"]=media
                if not row.get(side+"_logo"):row[side+"_logo"]=media["url"]
        result.append(row)
    return result


def _summary_observed(rows,sport):
    values=[]
    for row in rows:
        own=row["score_home"] if row["venue"]=="home" else row["score_away"]
        opp=row["score_away"] if row["venue"]=="home" else row["score_home"]
        values.append((own,opp))
    n=len(values);forms=["W" if a>b else "L" if a<b else "D" for a,b in values]
    result={"played":n,"wins":forms.count("W"),"draws":forms.count("D"),"losses":forms.count("L"),"form":forms[:5]}
    if sport=="football":result.update(_display_summary(rows))
    else:
        prefix="sets" if sport=="tennis" else "points"
        result[prefix+"_for"]=round(sum(a for a,b in values)/n,2) if n else None
        result[prefix+"_against"]=round(sum(b for a,b in values)/n,2) if n else None
    return result


async def observed_insights(db,match):
    sport=enrichment_sport(match);cutoff=min(datetime.now(timezone.utc),_display_date(match.get("commence_time")) or datetime.now(timezone.utc))
    if not sport:return None
    h,a=entity_name(match.get("home_team"),sport),entity_name(match.get("away_team"),sport)
    # Exact league where available; tennis Elo may span tournaments but details
    # identify sample scope explicitly. No cross-sport fuzzy joins.
    query={"sport":sport,"team_keys":{"$in":[h,a]},"date":{"$lt":cutoff.isoformat()},"conflicting":{"$ne":True}}
    if sport!="tennis":query["sport_key"]=match.get("sport_key")
    rows=await db.observed_results.find(query).sort("date",-1).limit(500).to_list(length=500)
    def history(key):
        found=[]
        for row in rows:
            if key not in row.get("team_keys",[]) or not _display_date(row.get("date")) or _display_date(row["date"])>=cutoff:continue
            found.append({**row,"id":row["_id"],"venue":"home" if row["home_key"]==key else "away","competition":row.get("competition") or row.get("sport_key")})
        return found[:10]
    home,away=history(h),history(a)
    if not home and not away:return None
    def team(games,venue):return {"recent":games,"overall":_summary_observed(games,sport),"venue":_summary_observed([r for r in games if r["venue"]==venue],sport) if sport!="tennis" else _summary_observed(games,sport)}
    stamps=[_display_date(r.get("last_checked_at")) for r in rows if r.get("last_checked_at")];stamps=[x for x in stamps if x]
    return {"version":1,"status":"ready","metric_family":sport,"venue_supported":sport!="tennis","source":" + ".join(sorted({r.get("source","Observed results") for r in home+away})),"updated_at":max(stamps).isoformat() if stamps else None,"cutoff":cutoff.isoformat(),"sample_limit":10,"sample_scope":"recent_observed_only","h2h_scope":"recent_sample_only","stale":not stamps or (datetime.now(timezone.utc)-max(stamps)).total_seconds()>86400,
            "home":team(home,"home"),"away":team(away,"away"),"h2h":[{**r,"id":r["_id"]} for r in rows if set(r.get("team_keys",[]))=={h,a}][:10]}


_original_match_insights=get_match_insights
async def get_match_insights(db,match):
    # Prefer existing verified football coverage; fill other sports/missing
    # coverage with the independent observed-results store.
    original=await _original_match_insights(db,match)
    complete=all((((original.get(side) or {}).get("overall") or {}).get("played") or 0)>0 for side in ("home","away"))
    if original.get("status")=="ready" and complete:return {**original,"metric_family":"football"}
    try:alternative=await observed_insights(db,match)
    except Exception:alternative=None  # optional collection never hides existing detail
    if original.get("status")=="ready" and alternative:
        result={**original,"metric_family":"football"}
        for side in ("home","away"):
            if not (((result.get(side) or {}).get("overall") or {}).get("played") or 0):result[side]=alternative[side]
        result["source"]=original.get("source","")+" + "+alternative.get("source","")
        result["stale"]=bool(original.get("stale") or alternative.get("stale"))
        return result
    return alternative or original


_original_enrich_badges=enrich_match_badges
async def enrich_match_badges(db,matches):
    original=await _original_enrich_badges(db,matches)
    try:return await enrich_cached_media(db,original)
    except Exception:return original  # optional portraits never remove a catalogue item


def parse_tennis_results(data,tour):
    rows=[]
    for game in data.get("data",[]):
        if game.get("result_type")!="completed":continue
        p1,p2=game.get("player1") or {},game.get("player2") or {}
        if not p1.get("name") or not p2.get("name") or "/" in p1["name"] or "/" in p2["name"]:continue
        sets=re.findall(r"(\d+)[-:](\d+)(?:\([^)]*\))?",str(game.get("result") or ""))
        if not 2<=len(sets)<=5:continue
        won=sum(int(a)>int(b) for a,b in sets);lost=sum(int(a)<int(b) for a,b in sets)
        if won<=lost:continue
        tournament=game.get("tournament") or {};court=tournament.get("court") or {}
        surface={"hard":"hard","clay":"clay","grass":"grass","indoor hard":"indoor_hard","carpet":None}.get(str(court.get("name") or "").lower())
        event=game.get("liveMatchId") or f"{p1.get('id')}:{p2.get('id')}:{tournament.get('id')}:{game.get('roundId')}"
        row=observed_result("tennis","tennis_"+tour,p1["name"],p2["name"],won,lost,game.get("date"),"Tennis API",event,surface)
        if row:row["competition"]=tournament.get("name");rows.append(row)
    return rows


async def refresh_tennis_history(db):
    if not os.environ.get("TENNIS_RAPIDAPI_KEY", "").strip():return {"status":"key_missing","stored":0}
    now=datetime.now(timezone.utc);jobs=[]
    # A rolling two-week bootstrap, four paginated batches per run. Historical
    # IDs are not stable; store the date+players identity, not numeric matchId.
    for delta in range(1,15):
        day=(now-timedelta(days=delta)).date().isoformat()
        for tour in ("atp","wta"):
            key=f"tennis-results:{tour}:{day}";state=await db.enrichment_state.find_one({"_id":key}) or {}
            if state.get("complete"):continue
            jobs.append((state.get("checked_at") or "",key,tour,day,state.get("next_page",1)))
    total=0
    for _,key,tour,day,page in sorted(jobs)[:4]:
        data=await enrichment_request(db,"tennis",f"/tennis/v2/{tour}/results/{day}",{"pageSize":500,"pageNo":page,"filter":"PlayerGroup:singles"})
        if data is None:continue
        total+=await store_observed_results(db,parse_tennis_results(data,tour))
        more=bool(data.get("hasNextPage") and data.get("data"))
        await db.enrichment_state.update_one({"_id":key},{"$set":{"checked_at":now.isoformat(),"complete":not more,"next_page":page+1 if more else 1}},upsert=True)
    return {"status":"available","stored":total}


async def harvest_score_archive(db):
    """Incremental cache-only import; no replay of thousands of rows per page."""
    state=await db.enrichment_state.find_one({"_id":"score_archive_import"}) or {}
    query={"completed":True}
    if state.get("at"):
        query["$or"]=[{"last_seen_at":{"$gt":state["at"]}},{"last_seen_at":state["at"],"event_id":{"$gt":state.get("event_id","")}}]
    items=await db.scores_archive.find(query).sort([("last_seen_at",1),("event_id",1)]).limit(500).to_list(length=500)
    rows=[]
    for item in items:
        sport=enrichment_sport(item)
        if not sport:continue
        score={x.get("name"):x.get("score") for x in item.get("scores",[]) if isinstance(x,dict)}
        row=observed_result(sport,item.get("sport_key"),item.get("home_team"),item.get("away_team"),score.get(item.get("home_team")),score.get(item.get("away_team")),item.get("commence_time"),"Existing score archive",item.get("event_id"),item.get("surface"))
        if row:rows.append(row)
    stored=await store_observed_results(db,rows)
    if items and items[-1].get("last_seen_at"):
        await db.enrichment_state.update_one({"_id":"score_archive_import"},{"$set":{"at":items[-1]["last_seen_at"],"event_id":items[-1].get("event_id","")}},upsert=True)
    return {"stored":stored,"batch_limit":500}


async def refresh_basketball_results(db,matches):
    if not API_SPORTS_KEY:return {"status":"key_missing"}
    now=datetime.now(timezone.utc);stored=0
    pairs={}
    for match in matches:
        if enrichment_sport(match)!="basketball":continue
        pair=frozenset([entity_name(match.get("home_team"),"basketball"),entity_name(match.get("away_team"),"basketball")])
        pairs.setdefault(pair,set()).add(match.get("sport_key"))
    if not pairs:return {"stored":0}
    # Once per finished day; do not poll every viewer or every team.
    for ago in (1,2):
        day=(now-timedelta(days=ago)).date().isoformat();key="basketball-games:"+day
        previous=await db.enrichment_state.find_one({"_id":key}) or {}
        stamp=_display_date(previous.get("checked_at"))
        if stamp and now-stamp<timedelta(hours=12):continue
        data=await enrichment_request(db,"apisports:basketball","/games",{"date":day})
        if data is None:continue
        result=[]
        for game in data.get("response",[]):
            if (game.get("status") or {}).get("short") not in ("FT","AOT"):continue
            teams=game.get("teams") or {};h=teams.get("home") or {};a=teams.get("away") or {};scores=game.get("scores") or {}
            leagues=pairs.get(frozenset([entity_name(h.get("name"),"basketball"),entity_name(a.get("name"),"basketball")]),set())
            if len(leagues)!=1:continue
            row=observed_result("basketball",next(iter(leagues)),h.get("name"),a.get("name"),(scores.get("home") or {}).get("total"),(scores.get("away") or {}).get("total"),game.get("date"),"API-Sports",game.get("id"))
            if row:result.append(row)
        stored+=await store_observed_results(db,result)
        await db.enrichment_state.update_one({"_id":key},{"$set":{"checked_at":now.isoformat(),"stored":len(result)}},upsert=True)
    return {"stored":stored}


async def enrichment_cycle(db,matches):
    # Each source is isolated; a denial never cancels another source or clears data.
    report={"started_at":datetime.now(timezone.utc).isoformat()}
    for name,callback in (("archive",lambda:harvest_score_archive(db)),("openfootball",lambda:refresh_openfootball(db,matches)),("basketball",lambda:refresh_basketball_results(db,matches)),("tennis",lambda:refresh_tennis_history(db)),("portraits",lambda:refresh_media_cache(db,matches))):
        try:report[name]=await asyncio.wait_for(callback(),timeout=120)
        except Exception as exc:report[name]={"status":"unavailable","error_type":type(exc).__name__}
    report["finished_at"]=datetime.now(timezone.utc).isoformat()
    await db.enrichment_state.update_one({"_id":"last_cycle"},{"$set":report},upsert=True)
    return report
