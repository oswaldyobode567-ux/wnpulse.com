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
def _as_daily_budget(sport):
    try:return max(1,min(7500,int(os.environ.get("API_SPORTS_"+sport.upper()+"_DAILY_LIMIT","80"))))
    except (ValueError,TypeError):return 80


_ENRICHMENT_SOURCES = {
    "sportsdb_ids": ("https://www.thesportsdb.com", 600, 2.5),
    "openfootball": ("https://raw.githubusercontent.com", 30, .5),
    "wikidata": ("https://www.wikidata.org", 240, 1.),
    "commons": ("https://commons.wikimedia.org", 120, 1.),
    "tennis": ("https://tennis-api-atp-wta-itf.p.rapidapi.com", 40, 1.),
    **{"apisports:"+key: (url, _as_daily_budget(key), 6.1) for key,url in _APISPORTS_BASE.items()},
}
_enrichment_locks = {}
_enrichment_next = {}
_OPENFOOTBALL = {"soccer_epl":"en.1", "soccer_efl_champ":"en.2", "soccer_spain_la_liga":"es.1", "soccer_spain_segunda_division":"es.2", "soccer_germany_bundesliga":"de.1", "soccer_germany_bundesliga2":"de.2", "soccer_france_ligue_one":"fr.1", "soccer_france_ligue_two":"fr.2", "soccer_italy_serie_a":"it.1", "soccer_italy_serie_b":"it.2"}
# Small, reviewed aliases only. Never fuzzy-match names across sports or countries.
_TEAM_ALIASES = {"brightonandhovealbion":"brightonhovealbion", "fcbarcelona":"barcelona", "bayernmunchen":"bayernmunich", "fcbayernmunchen":"bayernmunich", "athleticclub":"athleticbilbao", "realbetisbalompie":"realbetis", "clubatleticodemadrid":"atleticomadrid", "manchestercityfc":"manchestercity", "mancity":"manchestercity", "manchesterunitedfc":"manchesterunited", "manunited":"manchesterunited", "manutd":"manchesterunited", "tottenhamhotspurfc":"tottenhamhotspur", "tottenham":"tottenhamhotspur", "wolverhamptonwanderersfc":"wolverhamptonwanderers", "wolves":"wolverhamptonwanderers", "brightonhovealbionfc":"brightonhovealbion", "brighton":"brightonhovealbion", "parissaintgermainfc":"parissaintgermain", "parissg":"parissaintgermain", "psg":"parissaintgermain", "internazionalemilano":"intermilan", "internazionalemilan":"intermilan", "fcinternazionalemilano":"intermilan"}


def enrichment_sport(match):
    key = str(match.get("sport_key") or "").lower()
    return "tennis" if key.startswith("tennis_") else _as_sport(match)


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
        daily_limit=config[1]
        if provider.startswith("apisports:"):
            capabilities=await db.enrichment_state.find_one({"_id":"capabilities"}) or {}
            verified=(capabilities.get(provider.split(":",1)[1]) or {}).get("daily_limit")
            daily_limit=min(daily_limit,max(0,int(verified)-20)) if isinstance(verified,int) else min(daily_limit,80)
        if daily_limit<=0:return None
        try:
            quota=await db.stats_cache.find_one_and_update({"_id":quota_id,"$or":[{"calls":{"$lt":daily_limit}},{"calls":{"$exists":False}}]},
                {"$inc":{"calls":1},"$setOnInsert":{"day":day,"provider":provider}},upsert=True,return_document=True)
        except DuplicateKeyError:
            await db.enrichment_state.update_one({"_id":status_id},{"$set":{"status":"local_budget_reached","checked_at":now.isoformat(),"local_daily_limit":daily_limit}},upsert=True)
            return None
        if not quota:
            await db.enrichment_state.update_one({"_id":status_id},{"$set":{"status":"local_budget_reached","checked_at":now.isoformat(),"local_daily_limit":daily_limit}},upsert=True)
            return None
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
                error_text=json.dumps(data.get("errors"),ensure_ascii=False).lower()
                restricted="plan_or_season_restricted" if any(t in error_text for t in ("free plan","subscription","season","upgrade")) else "provider_error"
                await db.enrichment_state.update_one({"_id":status_id},{"$set":{"status":"restricted","restriction":restricted,"checked_at":now.isoformat()}},upsert=True)
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
    if not allowed or not artist or not isinstance(url,str) or urlparse(url).hostname not in {"upload.wikimedia.org","thumb.wikimedia.org"} or not url.startswith("https://"):return None
    if not isinstance(page,str) or urlparse(page).hostname!="commons.wikimedia.org" or not page.startswith("https://"):return None
    if license_name.startswith("CC") and (not license_url.startswith("https://creativecommons.org/") and not license_url.startswith("http://creativecommons.org/")):return None
    if value("LicenseRestriction") or value("Restrictions"):return None
    return {"url":url,"provider":"Wikimedia Commons","source_url":page,"author":artist,"license":license_name,"license_url":(license_url or page).replace("http://","https://",1),"entity_id":entity_id,"kind":"portrait","verified_license":True,"alternatives":[u for u in (info.get("url"),) if isinstance(u,str) and u != url and _media_url(u)]}


def _tennis_full_name_match(name,value):
    def tokens(v):
        return re.findall(r"[^\W\d_]+",unicodedata.normalize('NFKD',str(v or '')).encode('ascii','ignore').decode().casefold())
    a,b=tokens(name),tokens(value)
    if len(a)<2 or len(b)<2 or any(len(t)==1 for t in a+b):return False
    return a==b or len(a)==2 and len(b)==2 and a==list(reversed(b))


async def find_tennis_portrait(db,name):
    # Reject surname-only and initials rather than invent a player's identity.
    if len(name.split())<2 or any(len(x.strip('.'))==1 for x in name.split()):return None
    data=await enrichment_request(db,'wikidata','/w/api.php',{'action':'wbsearchentities','search':name,'language':'en','uselang':'en','type':'item','limit':5,'format':'json'})
    if data is None:return {'lookup_status':'unavailable'}
    ids=[r.get('id') for r in data.get('search',[]) if re.fullmatch(r'Q[1-9][0-9]*',str(r.get('id') or ''))]
    if not ids:return None
    data=await enrichment_request(db,'wikidata','/w/api.php',{'action':'wbgetentities','ids':'|'.join(ids),'props':'claims|labels|aliases','languages':'en|fr','format':'json'})
    if data is None:return {'lookup_status':'unavailable'}
    candidates=[]
    for entity in data.get('entities',{}).values():
        if 'Q5' not in _wd_values(entity,'P31'):continue
        if 'Q847' not in _wd_values(entity,'P641') and 'Q10833314' not in _wd_values(entity,'P106'):continue
        names=[v.get('value') for v in (entity.get('labels') or {}).values() if isinstance(v,dict)]
        names += [v.get('value') for rows in (entity.get('aliases') or {}).values() for v in rows if isinstance(v,dict)]
        if not any(_tennis_full_name_match(name,value) for value in names):continue
        files=[v for v in _wd_values(entity,'P18') if isinstance(v,str) and v.lower().endswith(('.jpg','.jpeg','.png'))]
        if files:candidates.append((entity.get('id'),files[:2]))
    if len(candidates)!=1:return {'lookup_status':'ambiguous'} if candidates else None
    entity_id,files=candidates[0]
    data=await enrichment_request(db,'commons','/w/api.php',{'action':'query','titles':'|'.join('File:'+file for file in files),'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':240,'format':'json'})
    if data is None:return {'lookup_status':'unavailable'}
    for page in (data.get('query') or {}).get('pages',{}).values():
        for info in page.get('imageinfo',[]):
            result=commons_media(info,entity_id)
            if result:return result
    return None


async def _legacy_refresh_media_cache(db,matches):
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
    """Cache-only left join. No image/API requests from visitor page loads."""
    if not matches:return matches
    keys={_visual_key(enrichment_sport(m),m.get(side+"_team")) for m in matches for side in ("home","away") if enrichment_sport(m) and m.get(side+"_team")}
    docs=await db.entity_media.find({"_id":{"$in":list(keys)}}).to_list(length=len(keys)) if keys else []
    by_key={d["_id"]:d for d in docs}
    urls=set()
    for m in matches:
        for side in ("home","away"):
            if _media_url(m.get(side+"_logo")):urls.add(m[side+"_logo"])
            media=(by_key.get(_visual_key(enrichment_sport(m),m.get(side+"_team"))) or {}).get("media") or {} if enrichment_sport(m) else {}
            urls.update(u for u in [media.get("url")]+list(media.get("alternatives") or []) if _media_url(u))
    health=await db.media_health.find({"_id":{"$in":[_media_health_key(u) for u in urls]}}).to_list(length=len(urls)) if urls else []
    broken={r["_id"] for r in health if r.get("status")=="broken"}
    result=[]
    for match in matches:
        row=dict(match);sport=enrichment_sport(row)
        for side in ("home","away"):
            media=((by_key.get(_visual_key(sport,row.get(side+"_team"))) or {}).get("media") or {}) if sport else {}
            accepted=(sport=="tennis" and _approved_portrait(media)) or (sport!="tennis" and media.get("kind")=="badge" and media.get("provider")=="API-Sports" and media.get("verified_identity") is True)
            existing=row.get(side+"_logo")
            candidates=[]
            if accepted:
                candidates=[u for u in [media.get("url")]+list(media.get("alternatives") or []) if _media_url(u) and _media_health_key(u) not in broken]
            if sport!="tennis" and _media_url(existing) and _media_health_key(existing) not in broken:
                candidates=list(dict.fromkeys([existing]+candidates))
            if candidates:
                row[side+"_logo"]=candidates[0]
                row[side+"_image_candidates"]=list(dict.fromkeys(candidates))[:3]
                if accepted and candidates[0] in [media.get("url")]+list(media.get("alternatives") or []):
                    row[side+"_media"]={**media,"url":candidates[0]}
            elif _media_url(existing) and _media_health_key(existing) in broken:
                row[side+"_logo"]=None
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
    for name,callback in (("archive",lambda:harvest_score_archive(db)),("openfootball",lambda:refresh_openfootball(db,matches)),("basketball",lambda:refresh_basketball_results(db,matches)),("tennis",lambda:refresh_tennis_history(db))):
        try:report[name]=await asyncio.wait_for(callback(),timeout=120)
        except Exception as exc:report[name]={"status":"unavailable","error_type":type(exc).__name__}
    report["finished_at"]=datetime.now(timezone.utc).isoformat()
    await db.enrichment_state.update_one({"_id":"last_cycle"},{"$set":report},upsert=True)
    return report


# Detailed 90-minute football observations, separate from scores and odds.
_DETAIL_LEAGUES = {'soccer_epl':39, 'soccer_france_ligue_one':61,
    'soccer_germany_bundesliga':78, 'soccer_spain_la_liga':140, 'soccer_italy_serie_a':135}
_DETAIL_METRICS = {'Corner Kicks':'corners', 'Yellow Cards':'yellow_cards',
    'Red Cards':'red_cards', 'Total Shots':'shots', 'Shots on Goal':'shots_on_target',
    'Ball Possession':'possession', 'Fouls':'fouls'}


def _detail_number(value, percent=False):
    if value is None or isinstance(value,bool):return None
    try:
        text=str(value).strip()
        number=float(text.rstrip('%') if percent else text)
        if not math.isfinite(number) or number<0:return None
        if percent:return number if number<=100 else None
        return int(number) if number.is_integer() and number<=200 else None
    except (ValueError,TypeError):return None


def _detail_team(name):
    # Runtime import avoids the stats_service/prediction_engine import cycle.
    import prediction_engine
    return prediction_engine._hybrid_team(name)


def _detail_fixture_record(game):
    fixture, teams, league = game.get('fixture') or {}, game.get('teams') or {}, game.get('league') or {}
    home, away = teams.get('home') or {}, teams.get('away') or {}
    date=_display_date(fixture.get('date'))
    if not date or not fixture.get('id') or not home.get('id') or not away.get('id') or not home.get('name') or not away.get('name'):return None
    try:
        fixture_id=int(fixture['id'])
        if fixture_id<=0 or home['id']==away['id']:return None
    except (TypeError,ValueError):return None
    return {'fixture_id':fixture_id, 'league_id':league.get('id'), 'season':league.get('season'),
        'date':date.isoformat(), 'home_id':home['id'], 'away_id':away['id'],
        'home_team':home['name'], 'away_team':away['name'], 'status':(fixture.get('status') or {}).get('short'),
        'referee':fixture.get('referee'), 'home_key':_detail_team(home['name']), 'away_key':_detail_team(away['name'])}


def _parse_fixture_statistics(game, payload, observed_at):
    row=_detail_fixture_record(game)
    if not row or row['status']!='FT' or not isinstance(payload,list):return None
    # FT only: never combine extra-time totals with regular-time prices.
    values={}
    for item in payload:
        if not isinstance(item,dict):continue
        team_id=(item.get('team') or {}).get('id')
        if team_id not in (row['home_id'],row['away_id']):continue
        metrics={}
        for item_stat in item.get('statistics') or []:
            key=_DETAIL_METRICS.get(item_stat.get('type'))
            if key:metrics[key]=_detail_number(item_stat.get('value'),key=='possession')
        if team_id in values:return None
        values[team_id]=metrics
    if len(values)!=2 or not any(values[row['home_id']].get(k) is not None and values[row['away_id']].get(k) is not None for k in _DETAIL_METRICS.values()):return None
    row.update(home=values[row['home_id']],away=values[row['away_id']],
        observed_at=observed_at.isoformat(),source='API-Football',period='regular_time',
        complete_metrics=[k for k in _DETAIL_METRICS.values() if values[row['home_id']].get(k) is not None and values[row['away_id']].get(k) is not None])
    return row


async def refresh_detailed_football(db, matches):
    if not API_SPORTS_KEY:return {'status':'key_missing'}
    if os.environ.get('WNPULSE_DETAILED_STATS_ENABLED','true').lower() in ('0','false','no'):return {'status':'disabled'}
    now=datetime.now(timezone.utc);used=0;imported=0;issues=[]
    limit=max(1,min(24,int(os.environ.get('WNPULSE_DETAILED_STATS_PER_RUN','8'))))
    targets=[m for m in matches if m.get('sport_key') in _DETAIL_LEAGUES and _display_date(m.get('commence_time'))
        and now<_display_date(m['commence_time'])<now+timedelta(days=3)]
    targets.sort(key=lambda m:m['commence_time'])
    rotor=await db.enrichment_state.find_one({'_id':'detailed_football_cursor'}) or {}
    if targets:
        offset=int(rotor.get('offset') or 0)%len(targets)
        targets=targets[offset:]+targets[:offset]
        current=str(rotor.get('current_match_id') or '')
        targets.sort(key=lambda m:str(m.get('id'))!=current)
        await db.enrichment_state.update_one({'_id':'detailed_football_cursor'},{'$set':{'offset':offset+1,'current_match_id':None}},upsert=True)
    async def request(path,params):
        nonlocal used
        if used>=limit:return None
        used+=1
        result=await _as_request(db,'football',path,params)
        return result
    async def cached_request(key,path,params,hours):
        doc=await db.stats_cache.find_one({'_id':key}) or {}
        at=_display_date(doc.get('checked_at'));retry=_display_date(doc.get('retry_at'))
        if at and now-at<timedelta(hours=hours):return doc.get('data')
        if retry and now<retry:return doc.get('data')
        rows=await request(path,params)
        if rows is not None:
            await db.stats_cache.update_one({'_id':key},{'$set':{'data':rows,'checked_at':now.isoformat()}},upsert=True)
        elif used<limit:
            await db.stats_cache.update_one({'_id':key},{'$set':{'retry_at':(now+timedelta(hours=6)).isoformat()}},upsert=True)
        return rows if rows is not None else doc.get('data')
    for match in targets:
        if used>=limit:break
        league=_DETAIL_LEAGUES[match['sport_key']];kickoff=_display_date(match['commence_time'])
        season=kickoff.year if kickoff.month>=7 else kickoff.year-1
        coverage=await cached_request(f'detail_coverage:{league}:{season}','/leagues',{'id':league,'season':season},24)
        if coverage is None:issues.append({'league':league,'reason':'coverage_or_plan_unavailable'});continue
        seasons=[s for l in coverage for s in l.get('seasons',[]) if s.get('year')==season]
        covered=any((s.get('coverage') or {}).get('fixtures',{}).get('statistics_fixtures') is True for s in seasons)
        if not covered:issues.append({'league':league,'reason':'statistics_not_covered'});continue
        day=kickoff.date().isoformat()
        fixtures=await cached_request(f'detail_fixtures:{league}:{day}','/fixtures',{'league':league,'season':season,'date':day},6)
        if fixtures is None:issues.append({'league':league,'reason':'fixtures_or_plan_unavailable'});continue
        candidates=[]
        for game in fixtures:
            row=_detail_fixture_record(game)
            if row and row['league_id']==league and row['season']==season and row['home_key']==_detail_team(match['home_team']) and row['away_key']==_detail_team(match['away_team']) and abs((_display_date(row['date'])-kickoff).total_seconds())<=5400:
                candidates.append((game,row))
        if len(candidates)!=1:continue
        game,mapping=candidates[0]
        if str(mapping['status']) in ('CANC','ABD','PST','WO'):continue
        await db.football_detail_mappings.update_one({'_id':str(match['id'])},{'$set':{**mapping,
            'odds_match_id':str(match['id']), 'sport_key':match['sport_key'], 'mapped_at':now.isoformat()}},upsert=True)
        pending={}
        for team_id in (mapping['home_id'],mapping['away_id']):
            games=await cached_request(f'detail_history:{league}:{season}:{team_id}','/fixtures',
                {'league':league,'season':season,'team':team_id,'status':'FT','from':f'{season}-07-01','to':now.date().isoformat()},24)
            if games is None:issues.append({'league':league,'reason':'history_or_plan_unavailable'});continue
            valid=[]
            for old in games:
                entry=_detail_fixture_record(old)
                if entry and entry['status']=='FT' and entry['league_id']==league and team_id in (entry['home_id'],entry['away_id']) and _display_date(entry['date'])<now:
                    valid.append((old,entry))
            valid.sort(key=lambda pair:pair[1]['date'],reverse=True)
            for old,entry in valid[:20]:pending[entry['fixture_id']]=old
        # Rotate already attempted items, so a missing metric cannot starve peers.
        jobs=[]
        for fixture_id,old in pending.items():
            prior=await db.football_fixture_statistics.find_one({'_id':str(fixture_id)})
            if prior and (set(prior.get('complete_metrics') or [])>=set(_DETAIL_METRICS.values()) or
                (_display_date(prior.get('observed_at')) and now-_display_date(prior['observed_at'])<timedelta(hours=24))):continue
            state=await db.stats_cache.find_one({'_id':f'detail_missing:{fixture_id}'}) or {}
            retry=_display_date(state.get('retry_at'))
            if not retry or retry<=now:jobs.append(old)
        jobs.sort(key=lambda game:game['fixture']['date'],reverse=True)
        for old in jobs:
            if used>=limit:break
            fid=old['fixture']['id'];payload=await request('/fixtures/statistics',{'fixture':fid})
            row=_parse_fixture_statistics(old,payload,datetime.now(timezone.utc)) if payload is not None else None
            if row:
                previous=await db.football_fixture_statistics.find_one({'_id':str(fid)}) or {}
                for side in ('home','away'):
                    row[side]={**(previous.get(side) or {}),**{k:v for k,v in row[side].items() if v is not None}}
                row['complete_metrics']=[k for k in _DETAIL_METRICS.values() if row['home'].get(k) is not None and row['away'].get(k) is not None]
                await db.football_fixture_statistics.update_one({'_id':str(fid)},{'$set':row},upsert=True);imported+=1
            else:
                await db.stats_cache.update_one({'_id':f'detail_missing:{fid}'},{'$set':{'retry_at':(now+timedelta(hours=12)).isoformat()}},upsert=True)
        if used>=limit:
            await db.enrichment_state.update_one({'_id':'detailed_football_cursor'},{'$set':{'current_match_id':str(match['id'])}},upsert=True)
    report={'status':'finished','checked_at':datetime.now(timezone.utc).isoformat(),
        'requests_attempted':used,'fixtures_imported':imported,'issues':issues,'target_matches':len(targets)}
    await db.enrichment_state.update_one({'_id':'detailed_football'},{'$set':report},upsert=True)
    return report


def _count_distribution(values):
    # Count-only pilot: no goal data and no prices enter this fit.
    if len(values)<20:return None
    mean=sum(values)/len(values)
    if mean<=0:return None
    variance=sum((v-mean)**2 for v in values)/(len(values)-1)
    if variance>mean+.1:
        r=max(.25,min(1000.,mean*mean/(variance-mean)));p=r/(r+mean)
        pmf=[math.exp(math.lgamma(k+r)-math.lgamma(r)-math.lgamma(k+1)+r*math.log(p)+k*math.log1p(-p)) for k in range(201)]
        family='negative_binomial_moments'
    else:
        pmf=[math.exp(-mean+k*math.log(mean)-math.lgamma(k+1)) for k in range(201)];family='poisson_counts'
    if abs(sum(pmf)-1.)>1e-4:return None
    return {'mean':mean,'variance':variance,'pmf':pmf,'method':family,'sample':len(values)}


def _count_pilot(rows, home_id, away_id, metric, cutoff):
    per_team={home_id:set(),away_id:set()};unique={}
    for row in rows:
        date=_display_date(row.get('date'));observed=_display_date(row.get('observed_at'))
        if not date or not observed or not date<observed<=cutoff or cutoff-date>timedelta(days=365) or row.get('status')!='FT':continue
        h=_detail_number((row.get('home') or {}).get(metric));a=_detail_number((row.get('away') or {}).get(metric))
        if h is None or a is None:continue
        for team_id in per_team:
            if team_id in (row.get('home_id'),row.get('away_id')):per_team[team_id].add(row.get('fixture_id'))
        unique[row.get('fixture_id')]=h+a
    if any(len(sample)<10 for sample in per_team.values()) or len(unique)<20:
        return {'status':'insufficient_history','sample':len(unique),'required_distinct_fixtures':20,'minimum_per_team':10}
    distribution=_count_distribution(list(unique.values()))
    if not distribution:return {'status':'unavailable'}
    lines=(8.5,9.5,10.5,11.5) if metric=='corners' else (2.5,3.5,4.5,5.5)
    return {'status':'observational_pilot','sample':len(unique),'mean':round(distribution['mean'],2),
        'method':distribution['method'],'scope':'pooled_recent_match_totals','metric':metric,
        'probability_validated':False,'selection_available':False,'uses_bookmaker_probabilities':False,
        'lines':[{'line':line,'over_probability':round(100*sum(distribution['pmf'][int(line)+1:]),2),
            'under_probability':round(100*sum(distribution['pmf'][:int(line)+1]),2)} for line in lines]}


async def detailed_football_insights(db,match):
    if match.get('sport_key') not in _DETAIL_LEAGUES:return None
    mapping=await db.football_detail_mappings.find_one({'_id':str(match.get('id') or match.get('match_id'))})
    if not mapping:return {'status':'collecting','home':{},'away':{},'count_models':{}}
    now=datetime.now(timezone.utc);kickoff=_display_date(match.get('commence_time'));cutoff=min(now,kickoff) if kickoff else now
    rows=await db.football_fixture_statistics.find({'league_id':mapping['league_id'],
        'date':{'$lt':cutoff.isoformat(),'$gte':(cutoff-timedelta(days=365)).isoformat()},
        '$or':[{'home_id':{'$in':[mapping['home_id'],mapping['away_id']]}},{'away_id':{'$in':[mapping['home_id'],mapping['away_id']]}}]}).sort('date',-1).to_list(length=100)
    def summary(team_id):
        samples=[r for r in rows if team_id in (r['home_id'],r['away_id'])][:20];out={}
        for metric in _DETAIL_METRICS.values():
            values=[(r.get('home') if r['home_id']==team_id else r.get('away') or {}).get(metric) for r in samples]
            values=[v for v in values if v is not None]
            against=[(r.get('away') if r['home_id']==team_id else r.get('home') or {}).get(metric) for r in samples]
            against=[v for v in against if v is not None]
            out[metric]={'mean':round(sum(values)/len(values),2) if values else None,'n':len(values),
                'against_mean':round(sum(against)/len(against),2) if against else None,'against_n':len(against)}
        return out
    models={m:_count_pilot(rows,mapping['home_id'],mapping['away_id'],m,now) for m in ('corners','yellow_cards')} if kickoff and kickoff>now else {}
    return {'status':'ready' if rows else 'collecting','source':'API-Football',
        'home':summary(mapping['home_id']),'away':summary(mapping['away_id']),
        'sample_scope':'up_to_20_recent_matches_same_competition','count_models':models,
        'updated_at':max((r['observed_at'] for r in rows),default=None),'period':'regular_time',
        'cards_definition':'yellow_cards_only; not bookmaker booking points',
        'referee':mapping.get('referee')}


_before_detailed_match_insights=get_match_insights
async def get_match_insights(db,match):
    result=await _before_detailed_match_insights(db,match)
    try:
        detail=await detailed_football_insights(db,match)
        if detail:result={**result,'detailed_statistics':detail}
    except Exception as exc:
        logger.warning('Detailed statistics cache unavailable: %s',type(exc).__name__)
    return result



# ─── Persistent visual identities v3: independent from forecasts/history ───
_MEDIA_HOSTS = {'media.api-sports.io','crests.football-data.org','upload.wikimedia.org','thumb.wikimedia.org'}
_MEDIA_LICENSES = {'CC0','CC0 1.0','Public domain','CC BY 2.0','CC BY 3.0','CC BY 4.0',
    'CC BY-SA 2.0','CC BY-SA 2.5','CC BY-SA 3.0','CC BY-SA 4.0'}
# Only equivalences for the same club. Never drop youth/women/reserve qualifiers.
_MEDIA_QUERIES = {'football':{'parissg':'Paris Saint Germain','psg':'Paris Saint Germain',
    'intermilan':'Inter','internazionalemilano':'Inter','bayernmunich':'Bayern Munich',
    'fcbayernmunchen':'Bayern Munich','manutd':'Manchester United','manunited':'Manchester United',
    'mancity':'Manchester City','wolves':'Wolverhampton Wanderers','atleticomadrid':'Atletico Madrid'},
    'basketball':{'laclippers':'Los Angeles Clippers','lalakers':'Los Angeles Lakers',
        'nyknicks':'New York Knicks','gswarriors':'Golden State Warriors','saspurs':'San Antonio Spurs'}}
_MEDIA_ID_ALIASES={'basketball':{'laclippers':'losangelesclippers','lalakers':'losangeleslakers',
    'nyknicks':'newyorkknicks','gswarriors':'goldenstatewarriors','saspurs':'sanantoniospurs'},
    'football':{'inter':'intermilan'}}


def _media_identity(name,sport):
    canonical=entity_name(name,sport)
    return _MEDIA_ID_ALIASES.get(sport,{}).get(canonical,canonical)


def _visual_key(sport,name):
    return sport+':'+_media_identity(name,sport)


def _media_url(value):
    if not isinstance(value,str) or len(value)>2000:return None
    try:
        parsed=urlparse(value)
        if parsed.scheme!='https' or parsed.hostname not in _MEDIA_HOSTS or parsed.username or parsed.password or parsed.port not in (None,443):return None
        return value
    except (ValueError,TypeError):return None


def _media_health_key(url):
    return hashlib.sha256(url.encode()).hexdigest()


def _media_limit(name,default,maximum):
    try:return max(1,min(maximum,int(os.environ.get(name,str(default)))))
    except (ValueError,TypeError):return default


def _approved_portrait(media):
    return bool(media.get('verified_license') is True and media.get('kind')=='portrait'
        and media.get('provider')=='Wikimedia Commons' and media.get('author')
        and media.get('license') in _MEDIA_LICENSES and _media_url(media.get('url'))
        and re.fullmatch(r'https://commons\.wikimedia\.org/wiki/[^\s]+',str(media.get('source_url') or ''))
        and re.fullmatch(r'https://(?:creativecommons\.org|commons\.wikimedia\.org)/[^\s]+',str(media.get('license_url') or '')))


def _media_jobs(matches,now):
    jobs={}
    for match in matches:
        sport=enrichment_sport(match)
        kickoff=_display_date(match.get('commence_time'))
        if not sport or not kickoff or not now-timedelta(days=1)<kickoff<now+timedelta(days=7):continue
        for side in ('home','away'):
            name=str(match.get(side+'_team') or '').strip()
            if len(name)<3:continue
            key=_visual_key(sport,name)
            entry=jobs.setdefault(key,{'key':key,'sport':sport,'name':name,'kickoff':kickoff.isoformat(),'existing':[],'priority':2})
            priority=0 if 'uefa_europa' in str(match.get('sport_key')) and kickoff.date()==now.date() else 1 if kickoff.date()==now.date() else 2
            entry['priority']=min(entry['priority'],priority)
            url=_media_url(match.get(side+'_logo'))
            if url and url not in entry['existing']:entry['existing'].append(url)
    return jobs


# A country directory contains many teams in one official API call.
# Only exact, unambiguous identities are used; youth/women/reserve teams stay distinct.
_MEDIA_COUNTRY_GROUPS={
 'soccer_epl':('football',('England',)), 'soccer_efl_champ':('football',('England',)),
 'soccer_spain_la_liga':('football',('Spain',)), 'soccer_spain_segunda_division':('football',('Spain',)),
 'soccer_germany_bundesliga':('football',('Germany',)), 'soccer_germany_bundesliga2':('football',('Germany',)),
 'soccer_france_ligue_one':('football',('France',)), 'soccer_france_ligue_two':('football',('France',)),
 'soccer_italy_serie_a':('football',('Italy',)), 'soccer_italy_serie_b':('football',('Italy',)),
 'soccer_portugal_primeira_liga':('football',('Portugal',)), 'soccer_netherlands_eredivisie':('football',('Netherlands',)),
 'basketball_nba':('basketball',('USA','Canada')), 'basketball_ncaab':('basketball',('USA',)),
 'basketball_wnba':('basketball',('USA',)), 'icehockey_nhl':('hockey',('USA','Canada')),
 'baseball_mlb':('baseball',('USA','Canada'))
}


def _media_country_groups(matches,jobs):
    groups={}
    for match in matches:
        config=_MEDIA_COUNTRY_GROUPS.get(match.get('sport_key'))
        if not config:continue
        sport,countries=config
        for side in ('home','away'):
            name=match.get(side+'_team')
            if not name:continue
            key=_visual_key(sport,name)
            if key not in jobs:continue
            for country in countries:groups.setdefault((sport,country),set()).add(key)
    return groups


def _media_directory_index(rows,sport):
    candidates={}
    for item in rows:
        if not isinstance(item,dict):continue
        team=item.get('team') if isinstance(item.get('team'),dict) else item
        if not team.get('id') or not team.get('name') or not _media_url(team.get('logo')):continue
        key=_visual_key(sport,team['name'])
        candidates.setdefault(key,{})[str(team['id'])]={k:team[k] for k in ('id','name','logo')}
    return {key:next(iter(teams.values())) for key,teams in candidates.items() if len(teams)==1}


async def _media_prefetch_directories(db,matches,jobs,cached,budget,deadline):
    if not API_SPORTS_KEY:return
    groups=_media_country_groups(matches,jobs)
    ids={f'media_directory:{sport}:{country}':(sport,country,keys) for (sport,country),keys in groups.items()}
    docs=await db.stats_cache.find({'_id':{'$in':list(ids)}}).to_list(length=len(ids)) if ids else []
    old={doc['_id']:doc for doc in docs};now=datetime.now(timezone.utc);pending=[]
    def merge(rows,sport,allowed_keys):
        for key,team in _media_directory_index(rows,sport).items():
            if key not in allowed_keys or key in budget.setdefault('ambiguous',set()):continue
            previous=budget['prefetched'].get(key)
            if previous and str(previous['id'])!=str(team['id']):
                budget['prefetched'].pop(key,None);budget['ambiguous'].add(key)
            else:budget['prefetched'][key]=team
    for identity,(sport,country,keys) in ids.items():
        doc=old.get(identity,{})
        if isinstance(doc.get('teams'),list):merge(doc['teams'],sport,keys)
        missing=[k for k in keys if not jobs[k]['existing'] and not _media_url((cached.get(k,{}).get('media') or {}).get('url'))]
        retry=_display_date(doc.get('retry_at'))
        updated=_display_date(doc.get('updated_at'))
        if missing and not (retry and retry>now) and not (updated and now-updated<timedelta(days=7)):
            pending.append((doc.get('checked_at') or '',identity,sport,country))
    # At most two directory calls per cycle, sharing the existing API quota.
    directory_calls=0
    for _,identity,sport,country in sorted(pending,key=lambda row:(row[0],row[2],row[3] != "USA",row[3])):
        if all(key in budget['prefetched'] or jobs[key]['existing'] for key in ids[identity][2]):continue
        if directory_calls>=2:break
        if budget['used']>=max(1,budget['limit']-2) or time.monotonic()>deadline-20:break
        budget['used']+=1;directory_calls+=1
        try:rows=await asyncio.wait_for(_as_request(db,sport,'/teams',{'country':country}),timeout=15)
        except Exception:rows=None
        fields={'checked_at':now.isoformat(),'sport':sport,'country':country}
        if rows is not None and 0<len(rows)<=8000:
            index=_media_directory_index(rows,sport);teams=list(index.values());merge(teams,sport,ids[identity][2])
            fields.update(teams=teams,updated_at=now.isoformat(),retry_at=(now+timedelta(days=7)).isoformat())
        else:fields['retry_at']=(now+timedelta(hours=6)).isoformat()
        await db.stats_cache.update_one({'_id':identity},{'$set':fields},upsert=True)


# Identity data only: never reuse unlicensed SportsDB artwork.
_SPORTSDB_ID_LOOKUP={'brightonandhovealbion':'133619','brightonhovealbion':'133619',
    'fccopenhagen':'133898','fcmidtjylland':'133891','hearts':'133643','hapoelbeersheva':'134799','sinttruiden':'135461','sksturmgraz':'137743',
    'unionsaintgilloise':'138141'}
_SPORTSDB_ID_QUERIES={
 'oficrete':'OFI','mjallbyaif':'Mjällby','redstarbelgrade':'Crvena Zvezda','hearts':'Heart of Midlothian','ferencvarostc':'Ferencvaros','salzburg':'Red Bull Salzburg','tsghoffenheim':'Hoffenheim',
 'pfclevskisofia':'Levski Sofia','necnijmegen':'NEC Nijmegen','omonoiafc':'Omonia Nicosia',
 'besiktasjk':'Besiktas','sksturmgraz':'Sturm Graz','nkcelje':'Celje','agfaarhus':'AGF Aarhus',
 'scbraga':'Braga','fcmidtjylland':'Midtjylland','atalantabc':'Atalanta','fckairat':'Kairat Almaty',
 'fcthun':'Thun','kupskuopio':'KuPS','lincolnredimpsfc':'Lincoln Red Imps','interclubdescaldes':"Inter Club Escaldes",
 'scfreiburg':'Freiburg','asmonaco':'Monaco','fcnordsjaelland':'Nordsjaelland',
 'brightonandhovealbion':'Brighton Hove Albion','brightonhovealbion':'Brighton Hove Albion',
 'fccopenhagen':'Copenhagen','fciberia1999':'Iberia 1999','fclugano':'Lugano',
 'fkkaunozalgiris':'Kauno Zalgiris','fctwenteenschede':'Twente','pafosfc':'Pafos',
 'fkjablonec':'Jablonec','kfegnatia':'Egnatia','panathinaikosfc':'Panathinaikos',
 'pfccskasofia':'CSKA Sofia','sinttruiden':'Sint-Truiden','skbrann':'Brann',
 'fkboracbanjaluka':'Borac Banja Luka',
 'fcararatarmenia':'Ararat Armenia','hapoelbeersheva':'Hapoel Beer Sheva'}


def _sportsdb_identity(name):
    normalized=_as_normalize(name).translate(str.maketrans({'æ':'ae','ø':'o','ł':'l','đ':'d'}))
    return _as_normalize(_SPORTSDB_ID_QUERIES.get(normalized,normalized)).translate(str.maketrans({'æ':'ae','ø':'o','ł':'l','đ':'d'}))


def _sportsdb_football_identity(name,rows):
    matches={}
    expected=_sportsdb_identity(name)
    for row in rows or []:
        if not isinstance(row,dict) or row.get('strSport')!='Soccer':continue
        names=[row.get('strTeam')]+re.split(r'[,;|]',str(row.get('strAlternate') or ''))
        if not any(_sportsdb_identity(value)==expected for value in names if value):continue
        # Preserve category qualifiers; a substring search is not an identity check.
        gender=str(row.get('strGender') or '').casefold()
        if gender=='female' and not re.search(r'\b(women|ladies|wfc|feminin)\b',str(name).casefold()):continue
        identity=str(row.get('idAPIfootball') or '')
        if not re.fullmatch(r'[1-9][0-9]{0,6}',identity):continue
        matches[identity]={'provider':'API-Sports','provider_id':int(identity),'kind':'badge',
            'url':f'https://media.api-sports.io/football/teams/{identity}.png',
            'verified_identity':True,'identity_provider':'TheSportsDB',
            'identity_provider_id':str(row.get('idTeam') or ''),
            'identity_verification':'exact_name_foreign_id','rights':'identification_only_provider_terms'}
    return next(iter(matches.values())) if len(matches)==1 else None


async def _refresh_sportsdb_football_ids(db,jobs,cached,deadline):
    if os.environ.get('WNPULSE_FREE_ID_LOOKUP_ENABLED','true').lower() in ('false','0','no'):return
    now=datetime.now(timezone.utc);used=0
    order=sorted(jobs.values(),key=lambda job:(job.get('priority',2),cached.get(job['key'],{}).get('sportsdb_checked_at') or '',job['kickoff']))
    for job in order:
        if job['sport']!='football' or job['existing']:continue
        old=cached.get(job['key'],{})
        if (old.get('media') or {}).get('verified_identity') and not old.get('image_broken'):continue
        retry=_display_date(old.get('sportsdb_retry_at'))
        if retry and retry>now:continue
        if used>=8 or time.monotonic()>deadline-50:break
        used+=1
        query=_SPORTSDB_ID_QUERIES.get(_as_normalize(job['name']),job['name'])
        try:
            lookup_id=_SPORTSDB_ID_LOOKUP.get(_as_normalize(job['name']))
            path='/api/v1/json/123/lookupteam.php' if lookup_id else '/api/v1/json/123/searchteams.php'
            data=await asyncio.wait_for(enrichment_request(db,'sportsdb_ids',path,{'id':lookup_id} if lookup_id else {'t':query}),timeout=12)
        except Exception:data=None
        fields={'sportsdb_checked_at':now.isoformat(),'sportsdb_retry_at':(now+timedelta(hours=6 if data is None else 24)).isoformat()}
        media=_sportsdb_football_identity(job['name'],(data or {}).get('teams'))
        if media:
            fields.update(media=media,sport='football',name=job['name'],status='ready',image_broken=False,
                resolver_version=6,checked_at=now.isoformat(),next_check_at=(now+timedelta(days=30)).isoformat())
        await db.entity_media.update_one({'_id':job['key']},{'$set':fields},upsert=True)
        cached.setdefault(job['key'],{}).update(fields)
        if data is None:break  # provider backoff is shared; do not hammer it for every team


# Curated ID seeds are generated from exact-name foreign IDs, not guessed URLs.
_VERIFIED_FOOTBALL_IDS = {
  "acmilan": {
    "id": 489,
    "source_id": "133667"
  },
  "agfaarhus": {
    "id": 406,
    "source_id": "133899"
  },
  "ajax": {
    "id": 194,
    "source_id": "133772"
  },
  "anderlecht": {
    "id": 554,
    "source_id": "133776"
  },
  "araratarmenia": {
    "id": 3683,
    "source_id": "137892"
  },
  "asmonaco": {
    "id": 91,
    "source_id": "133823"
  },
  "atalanta": {
    "id": 499,
    "source_id": "134782"
  },
  "atalantabc": {
    "id": 499,
    "source_id": "134782"
  },
  "azalkmaar": {
    "id": 201,
    "source_id": "133767"
  },
  "bayerleverkusen": {
    "id": 168,
    "source_id": "133666"
  },
  "benfica": {
    "id": 211,
    "source_id": "134108"
  },
  "besiktas": {
    "id": 549,
    "source_id": "133794"
  },
  "besiktasjk": {
    "id": 549,
    "source_id": "133794"
  },
  "boracbanjaluka": {
    "id": 3364,
    "source_id": "137938"
  },
  "bournemouth": {
    "id": 35,
    "source_id": "134301"
  },
  "braga": {
    "id": 217,
    "source_id": "134098"
  },
  "brann": {
    "id": 319,
    "source_id": "134571"
  },
  "brightonandhovealbion": {
    "id": 51,
    "source_id": "133619"
  },
  "brightonhovealbion": {
    "id": 51,
    "source_id": "133619"
  },
  "celje": {
    "id": 4360,
    "source_id": "134318"
  },
  "celtavigo": {
    "id": 538,
    "source_id": "133937"
  },
  "celtic": {
    "id": 247,
    "source_id": "133647"
  },
  "copenhagen": {
    "id": 400,
    "source_id": "133898"
  },
  "crvenazvezda": {
    "id": 598,
    "source_id": "133987"
  },
  "crystalpalace": {
    "id": 52,
    "source_id": "133632"
  },
  "cskasofia": {
    "id": 853,
    "source_id": "134088"
  },
  "dinamozagreb": {
    "id": 620,
    "source_id": "133961"
  },
  "egnatia": {
    "id": 3327,
    "source_id": "140667"
  },
  "fcararatarmenia": {
    "id": 3683,
    "source_id": "137892"
  },
  "fccopenhagen": {
    "id": 400,
    "source_id": "133898"
  },
  "fciberia1999": {
    "id": 3502,
    "source_id": "138046"
  },
  "fckairat": {
    "id": 664,
    "source_id": "134602"
  },
  "fclugano": {
    "id": 606,
    "source_id": "136037"
  },
  "fcmidtjylland": {
    "id": 397,
    "source_id": "133891"
  },
  "fcnordsjaelland": {
    "id": 398,
    "source_id": "133890"
  },
  "fcnordsjælland": {
    "id": 398,
    "source_id": "133890"
  },
  "fcthun": {
    "id": 1012,
    "source_id": "134394"
  },
  "fctwenteenschede": {
    "id": 415,
    "source_id": "133774"
  },
  "ferencvaros": {
    "id": 651,
    "source_id": "134620"
  },
  "ferencvarostc": {
    "id": 651,
    "source_id": "134620"
  },
  "fkboracbanjaluka": {
    "id": 3364,
    "source_id": "137938"
  },
  "fkjablonec": {
    "id": 1122,
    "source_id": "134395"
  },
  "fkkaunozalgiris": {
    "id": 3872,
    "source_id": "137992"
  },
  "freiburg": {
    "id": 160,
    "source_id": "133653"
  },
  "gent": {
    "id": 631,
    "source_id": "133781"
  },
  "getafe": {
    "id": 546,
    "source_id": "133731"
  },
  "hajduksplit": {
    "id": 608,
    "source_id": "134019"
  },
  "hapoelbeersheva": {
    "id": 563,
    "source_id": "134799"
  },
  "heartofmidlothian": {
    "id": 254,
    "source_id": "133643"
  },
  "hearts": {
    "id": 254,
    "source_id": "133643"
  },
  "hoffenheim": {
    "id": 167,
    "source_id": "133657"
  },
  "iberia1999": {
    "id": 3502,
    "source_id": "138046"
  },
  "interclubdescaldes": {
    "id": 3342,
    "source_id": "137792"
  },
  "interclubescaldes": {
    "id": 3342,
    "source_id": "137792"
  },
  "jablonec": {
    "id": 1122,
    "source_id": "134395"
  },
  "jagielloniabialystok": {
    "id": 336,
    "source_id": "135297"
  },
  "jagielloniabiałystok": {
    "id": 336,
    "source_id": "135297"
  },
  "juventus": {
    "id": 496,
    "source_id": "133676"
  },
  "kairatalmaty": {
    "id": 664,
    "source_id": "134602"
  },
  "kaunozalgiris": {
    "id": 3872,
    "source_id": "137992"
  },
  "kfegnatia": {
    "id": 3327,
    "source_id": "140667"
  },
  "kups": {
    "id": 1165,
    "source_id": "134018"
  },
  "kupskuopio": {
    "id": 1165,
    "source_id": "134018"
  },
  "lechpoznan": {
    "id": 347,
    "source_id": "134010"
  },
  "levskisofia": {
    "id": 646,
    "source_id": "134085"
  },
  "lillestrom": {
    "id": 321,
    "source_id": "134569"
  },
  "lillestrøm": {
    "id": 321,
    "source_id": "134569"
  },
  "lincolnredimps": {
    "id": 667,
    "source_id": "140040"
  },
  "lincolnredimpsfc": {
    "id": 667,
    "source_id": "140040"
  },
  "lugano": {
    "id": 606,
    "source_id": "136037"
  },
  "lyon": {
    "id": 80,
    "source_id": "133713"
  },
  "marseille": {
    "id": 81,
    "source_id": "133707"
  },
  "midtjylland": {
    "id": 397,
    "source_id": "133891"
  },
  "mjallby": {
    "id": 2240,
    "source_id": "134164"
  },
  "mjallbyaif": {
    "id": 2240,
    "source_id": "134164"
  },
  "monaco": {
    "id": 91,
    "source_id": "133823"
  },
  "necnijmegen": {
    "id": 413,
    "source_id": "133760"
  },
  "nkcelje": {
    "id": 4360,
    "source_id": "134318"
  },
  "nordsjaelland": {
    "id": 398,
    "source_id": "133890"
  },
  "ofi": {
    "id": 1124,
    "source_id": "133743"
  },
  "oficrete": {
    "id": 1124,
    "source_id": "133743"
  },
  "omonianicosia": {
    "id": 3402,
    "source_id": "133986"
  },
  "omonoiafc": {
    "id": 3402,
    "source_id": "133986"
  },
  "pafos": {
    "id": 3403,
    "source_id": "137928"
  },
  "pafosfc": {
    "id": 3403,
    "source_id": "137928"
  },
  "panathinaikos": {
    "id": 617,
    "source_id": "133746"
  },
  "panathinaikosfc": {
    "id": 617,
    "source_id": "133746"
  },
  "pfccskasofia": {
    "id": 853,
    "source_id": "134088"
  },
  "pfclevskisofia": {
    "id": 646,
    "source_id": "134085"
  },
  "realsociedad": {
    "id": 548,
    "source_id": "133724"
  },
  "redbullsalzburg": {
    "id": 571,
    "source_id": "133970"
  },
  "redstarbelgrade": {
    "id": 598,
    "source_id": "133987"
  },
  "rigafc": {
    "id": 10124,
    "source_id": "137984"
  },
  "salzburg": {
    "id": 571,
    "source_id": "133970"
  },
  "scbraga": {
    "id": 217,
    "source_id": "134098"
  },
  "scfreiburg": {
    "id": 160,
    "source_id": "133653"
  },
  "sinttruiden": {
    "id": 735,
    "source_id": "135461"
  },
  "skbrann": {
    "id": 319,
    "source_id": "134571"
  },
  "sksturmgraz": {
    "id": 637,
    "source_id": "137743"
  },
  "spartaprague": {
    "id": 628,
    "source_id": "134007"
  },
  "sturmgraz": {
    "id": 637,
    "source_id": "137743"
  },
  "sunderland": {
    "id": 746,
    "source_id": "133603"
  },
  "thun": {
    "id": 1012,
    "source_id": "134394"
  },
  "torreense": {
    "id": 4799,
    "source_id": "143720"
  },
  "trabzonspor": {
    "id": 998,
    "source_id": "133796"
  },
  "tsghoffenheim": {
    "id": 167,
    "source_id": "133657"
  },
  "twente": {
    "id": 415,
    "source_id": "133774"
  },
  "unionsaintgilloise": {
    "id": 1393,
    "source_id": "138141"
  },
  "universitateacraiova": {
    "id": 632,
    "source_id": "138188"
  },
  "viktoriaplzen": {
    "id": 567,
    "source_id": "134015"
  }
}


def _verified_seed_media(name):
    row=_VERIFIED_FOOTBALL_IDS.get(_as_normalize(name))
    if not row:return None
    return {'provider':'API-Sports','provider_id':row['id'],'kind':'badge',
        'url':f"https://media.api-sports.io/football/teams/{row['id']}.png",'verified_identity':True,
        'identity_provider':'TheSportsDB','identity_provider_id':row['source_id'],
        'identity_verification':'exact_name_foreign_id','rights':'identification_only_provider_terms'}


def _global_fd_crests(documents):
    candidates={}
    for doc in documents:
        if not str(doc.get('_id','')).startswith('fd_teams_'):continue
        profiles=doc.get('profiles') or {}
        aliases={}
        for alias,identity in (doc.get('data') or {}).items():
            if len(alias)>=5:aliases.setdefault(str(identity),[]).append(alias)
        for identity,team in profiles.items():
            if not isinstance(team,dict) or not _media_url(team.get('crest')):continue
            for name in [team.get('name')]+aliases.get(str(identity),[]):
                if not name:continue
                key=_media_identity(name,'football')
                candidates.setdefault(key,{})[str(identity)]=team['crest']
    return {key:next(iter(rows.values())) for key,rows in candidates.items() if len(rows)==1}


async def _media_identity_lookup(db,job,old,budget):
    sport,name=job['sport'],job['name']
    prefetched=budget.get('prefetched',{}).get(job['key'])
    if prefetched:return prefetched
    if not API_SPORTS_KEY:return {'lookup_status':'key_missing'}
    existing=await db.stats_cache.find_one({'_id':_as_key(sport,name)}) or {}
    team_id=(old.get('identity') or {}).get('provider_id') or (existing.get('team_id') if existing.get('matched') else None)
    cached_health=await db.media_health.find_one({'_id':_media_health_key(existing['logo'])}) if _media_url(existing.get('logo')) else {}
    if team_id and not old.get('image_broken') and (cached_health or {}).get('status')!='broken' and _media_url(existing.get('logo')) and _media_identity(existing.get('name') or name,sport)==_media_identity(name,sport):
        return {'id':team_id,'name':existing.get('name') or name,'logo':existing['logo']}
    queries=[]
    # A stored, verified provider ID is stable across name variations and rebrands.
    if team_id:queries.append({'id':team_id})
    query=_MEDIA_QUERIES.get(sport,{}).get(_as_normalize(name),name)
    queries.append({'search':query})
    if query!=name:queries.append({'search':name})
    for params in queries:
        if budget['used']>=budget['limit']:return {'lookup_status':'deferred'}
        budget['used']+=1
        rows=await _as_request(db,sport,'/teams',params)
        if rows is None:return {'lookup_status':'unavailable'}
        candidates={}
        for row in rows:
            if not isinstance(row,dict):continue
            team=row.get('team') if isinstance(row.get('team'),dict) else row
            if not team.get('id'):continue
            if team_id and str(team.get('id'))==str(team_id) and params.get('id'):
                candidates[str(team['id'])]=team
            elif _media_identity(team.get('name'),sport)==_media_identity(name,sport):
                candidates[str(team['id'])]=team
        if len(candidates)==1:return next(iter(candidates.values()))
        if len(candidates)>1:return {'lookup_status':'ambiguous'}
    return {'lookup_status':'unresolved'}


async def refresh_visual_assets(db,matches):
    """Bounded scheduled work; API-Sports calls share its existing persistent quotas."""
    now=datetime.now(timezone.utc);jobs=_media_jobs(matches,now)
    deadline=time.monotonic()+105  # leave time for health checks and a saved progress report
    docs=await db.entity_media.find({'_id':{'$in':list(jobs)}}).to_list(length=len(jobs)) if jobs else []
    cached={row['_id']:row for row in docs}
    try:await _refresh_sportsdb_football_ids(db,jobs,cached,deadline)
    except Exception as exc:logger.warning('Free identity source deferred (%s)',type(exc).__name__)
    budget={'used':0,'limit':_media_limit('WNPULSE_MEDIA_TEAM_REQUESTS_PER_RUN',8,16),'prefetched':{}}
    try:await _media_prefetch_directories(db,matches,jobs,cached,budget,deadline)
    except Exception as exc:logger.warning('Team directory lookup deferred (%s)',type(exc).__name__)
    portraits=_media_limit('WNPULSE_MEDIA_PORTRAITS_PER_RUN',6,16)
    portrait_jobs=0;updated=0;checked=0;statuses={}
    # Oldest checked first, with round-robin across sports to avoid football starvation.
    pending={}
    for key,job in jobs.items():
        old=cached.get(key,{})
        retry=_display_date(old.get('next_check_at'))
        if key not in budget['prefetched'] and retry and retry>now and (old.get('resolver_version')==6 or _approved_portrait(old.get('media') or {})):continue
        pending.setdefault(job['sport'],[]).append((old.get('checked_at') or '',job['kickoff'],key))
    for rows in pending.values():rows.sort()
    order=[]
    while any(pending.values()):
        for sport in sorted(pending):
            if pending[sport]:order.append(pending[sport].pop(0)[2])
    blocked_sports=set()
    for key in order:
        job=jobs[key];sport=job['sport'];old=cached.get(key,{})
        if checked>=64 or time.monotonic()>=deadline:break
        if sport in blocked_sports and key not in budget['prefetched']:continue
        # Preserve known cached badges; spend search requests on missing entities first.
        if sport!='tennis' and job['existing']:
            healthy=[]
            for url in job['existing']:
                h=await db.media_health.find_one({'_id':_media_health_key(url)}) or {}
                if h.get('status')!='broken':healthy.append(url)
            if healthy and not old.get('image_broken'):
                await db.entity_media.update_one({'_id':key},{'$set':{'sport':sport,'name':job['name'],
                    'status':'ready_existing','checked_at':now.isoformat(),
                    'next_check_at':(now+timedelta(days=7)).isoformat(),'resolver_version':6}},upsert=True)
                checked+=1;statuses['ready_existing']=statuses.get('ready_existing',0)+1
                continue
        if sport=='tennis':
            if portrait_jobs>=portraits:continue
            portrait_jobs+=1
            try:
                media=await asyncio.wait_for(find_tennis_portrait(db,job['name']),timeout=max(1,min(42,deadline-time.monotonic())))
            except Exception as exc:
                logger.warning('Portrait lookup deferred (%s)',type(exc).__name__)
                media={'lookup_status':'unavailable'}
            status=(media or {}).get('lookup_status') or ('ready' if _approved_portrait(media or {}) else 'unresolved')
            valid=status=='ready'
            identity={'provider':'Wikidata','provider_id':media.get('entity_id'),'name':job['name']} if valid else old.get('identity')
        else:
            if budget['used']>=budget['limit'] and key not in budget['prefetched']:continue
            try:
                team=await asyncio.wait_for(_media_identity_lookup(db,job,old,budget),timeout=max(1,min(28,deadline-time.monotonic())))
            except Exception as exc:
                logger.warning('Team image lookup deferred (%s)',type(exc).__name__)
                team={'lookup_status':'unavailable'}
            status=team.get('lookup_status') or ('ready' if _media_url(team.get('logo')) else 'image_missing')
            valid=status=='ready'
            identity={'provider':'API-Sports','provider_id':team.get('id'),'name':team.get('name')} if team.get('id') else old.get('identity')
            media={'url':team.get('logo'),'provider':'API-Sports','provider_id':team.get('id'),
                'kind':'badge','verified_identity':True,'rights':'identification_only_provider_terms'} if valid else None
        if status=='deferred':continue
        if valid:
            known_health=await db.media_health.find_one({'_id':_media_health_key(media['url'])}) or {}
            if known_health.get('status')=='broken':
                valid=False;status='image_missing'
        checked+=1;statuses[status]=statuses.get(status,0)+1
        transient=status in ('unavailable','key_missing')
        if transient:blocked_sports.add(sport)
        delay=timedelta(minutes=30) if transient else timedelta(days=30) if valid else timedelta(hours=24)
        fields={'sport':sport,'name':job['name'],'checked_at':now.isoformat(),'next_check_at':(now+delay).isoformat(),'status':status,'resolver_version':6}
        if identity:fields['identity']=identity
        if valid:
            previous=(old.get('media') or {}).get('url')
            # Same-provider badges may retain one verified old crest as a fallback.
            if sport!='tennis' and _media_url(previous) and previous!=media['url']:
                media['alternatives']=[previous]
            fields['media']=media;fields['image_broken']=False;updated+=1
            if sport!='tennis':
                await db.stats_cache.update_one({'_id':_as_key(sport,job['name'])},{'$set':{
                    'matched':True,'team_id':identity['provider_id'],'name':identity['name'],
                    'logo':media['url'],'updated_at':now.isoformat()}},upsert=True)
        # An unavailable source never removes verified old media or official picks.
        await db.entity_media.update_one({'_id':key},{'$set':fields},upsert=True)
    health=await refresh_media_health(db,matches,jobs)
    result={'checked_at':datetime.now(timezone.utc).isoformat(),'catalogue_entities':len(jobs),
        'checked':checked,'updated':updated,'statuses':statuses,'team_requests_attempted':budget['used'],
        'portrait_lookups':portrait_jobs,'health':health,'resolver_version':6}
    await db.enrichment_state.update_one({'_id':'visual_assets'},{'$set':result},upsert=True)
    return result


async def _check_media_url(url):
    """Strict host allowlist, no arbitrary redirects, no user-supplied URL fetch."""
    current=_media_url(url)
    if not current:return 'blocked'
    try:
        async with httpx.AsyncClient(timeout=6,follow_redirects=False) as client:
            for _ in range(2):
                response=await client.head(current,headers={'User-Agent':'WinPulseMedia/1.0 (https://wnpulse.com; contact@wnpulse.com)'})
                if response.status_code in (301,302,303,307,308):
                    from urllib.parse import urljoin
                    current=_media_url(urljoin(current,response.headers.get('location','')))
                    if not current:return 'unknown'
                    continue
                if response.status_code in (404,410):return 'broken'
                if response.status_code==200:
                    mime=response.headers.get('content-type','').split(';')[0].strip().lower()
                    return 'ready' if mime.startswith('image/') else 'unknown'
                return 'unknown'
    except httpx.HTTPError:return 'unknown'
    return 'unknown'


async def refresh_media_health(db,matches,jobs=None):
    now=datetime.now(timezone.utc);jobs=jobs or _media_jobs(matches,now)
    docs=await db.entity_media.find({'_id':{'$in':list(jobs)}}).to_list(length=len(jobs)) if jobs else []
    urls={u for job in jobs.values() for u in job['existing']}
    for doc in docs:
        media=doc.get('media') or {}
        urls.update(u for u in [media.get('url')]+list(media.get('alternatives') or []) if _media_url(u))
    health=await db.media_health.find({'_id':{'$in':[_media_health_key(u) for u in urls]}}).to_list(length=len(urls)) if urls else []
    known={d['_id']:d for d in health}
    due=[(known.get(_media_health_key(u),{}).get('checked_at') or '',u) for u in urls
         if not _display_date(known.get(_media_health_key(u),{}).get('next_check_at')) or _display_date(known.get(_media_health_key(u),{}).get('next_check_at'))<=now]
    checked=0;broken=0
    for _,url in sorted(due)[:_media_limit('WNPULSE_MEDIA_HEALTH_PER_RUN',6,12)]:
        state=await _check_media_url(url);checked+=1;broken+=int(state=='broken')
        previous=known.get(_media_health_key(url),{})
        # A transient failure must not rehabilitate a confirmed 404 nor hide a good asset.
        effective=previous.get('status','unknown') if state=='unknown' else state
        delay=timedelta(days=7) if state=='ready' else timedelta(hours=6) if state=='broken' else timedelta(hours=1)
        await db.media_health.update_one({'_id':_media_health_key(url)},{'$set':{
            'url':url,'status':effective,'last_check_result':state,'checked_at':now.isoformat(),
            'next_check_at':(now+delay).isoformat()}},upsert=True)
        if state=='broken':
            for key,job in jobs.items():
                if url in job['existing']:
                    await db.entity_media.update_one({'_id':key},{'$set':{'next_check_at':now.isoformat(),'image_broken':True}},upsert=True)
            for doc in docs:
                if (doc.get('media') or {}).get('url')==url:
                    await db.entity_media.update_one({'_id':doc['_id']},{'$set':{'next_check_at':now.isoformat(),'image_broken':True}})
    return {'checked':checked,'confirmed_broken':broken}


async def refresh_media_cache(db,matches):
    # Compatibility export for old optional-module checks; one dedicated scheduler does the work.
    return await refresh_visual_assets(db,matches)


async def media_catalogue_status(db,matches):
    jobs=_media_jobs(matches,datetime.now(timezone.utc));keys=list(jobs)
    docs=await db.entity_media.find({'_id':{'$in':keys}}).to_list(length=len(keys)) if keys else []
    ready={d['_id']:d for d in docs};sports={};missing=[]
    health=await db.media_health.find({'status':'broken'}).limit(5000).to_list(length=5000)
    broken={r['_id'] for r in health}
    for key,job in jobs.items():
        media=(ready.get(key) or {}).get('media') or {}
        acceptable=bool(_approved_portrait(media)) if job['sport']=='tennis' else bool(media.get('verified_identity') and media.get('kind')=='badge' and _media_url(media.get('url')))
        candidates=[u for u in [media.get('url')]+list(media.get('alternatives') or [])+job['existing'] if _media_url(u) and _media_health_key(u) not in broken]
        available=bool(candidates and (acceptable or job['sport']!='tennis' and job['existing']))
        group=sports.setdefault(job['sport'],{'total':0,'available':0,'missing':0})
        group['total']+=1;group['available' if available else 'missing']+=1
        if not available and len(missing)<100:
            missing.append({'key':key,'name':job['name'],'sport':job['sport'],'status':ready.get(key,{}).get('status','pending')})
    return {'resolver_version':6,'sports':sports,'missing_sample':missing,
        'last_run':{k:v for k,v in (await db.enrichment_state.find_one({'_id':'visual_assets'}) or {}).items() if k!='_id'},
        'broken_images':len(health),'no_complete_coverage_guarantee':True}



# Presentation cache v4. Parallel projected Mongo reads, independent failure paths.
_BADGE_PRESENTATION={'stats':{},'media':{},'broken':set(),'attempted_at':0.,'signature':None}


def invalidate_badge_presentation_cache():
    _BADGE_PRESENTATION['attempted_at']=0.


async def _badge_projected_read(collection,query,projection,limit):
    try:
        return await asyncio.wait_for(collection.find(query,projection).to_list(length=limit),timeout=1.8)
    except Exception as exc:
        logger.warning('Image presentation source deferred (%s)',type(exc).__name__)
        return None


async def enrich_match_badges(db,matches):
    """Keep each fixture and available crest even when another cache source times out."""
    if not matches:return matches
    codes=set(COMPETITION_MAP.values()) if any(_as_sport(m)=='football' for m in matches) else set()
    stat_ids={'fd_teams_'+code for code in codes}
    stat_ids.update(_as_key(_as_sport(m),m.get(side+'_team')) for m in matches for side in ('home','away') if _as_sport(m) and m.get(side+'_team'))
    media_ids={_visual_key(enrichment_sport(m),m.get(side+'_team')) for m in matches for side in ('home','away') if enrichment_sport(m) and m.get(side+'_team')}
    signature=hashlib.sha256('|'.join(sorted(stat_ids|media_ids)).encode()).hexdigest()
    now=time.monotonic()
    cache=_BADGE_PRESENTATION
    # Brief retry interval coalesces repeated visitors while retaining known-good values.
    if signature!=cache['signature'] or now-cache['attempted_at']>30 or not cache['attempted_at']:
        cache.update(attempted_at=now,signature=signature)
        stats,media,health=await asyncio.gather(
            _badge_projected_read(db.stats_cache,{'_id':{'$in':list(stat_ids)}},
                {'_id':1,'data':1,'profiles':1,'matched':1,'logo':1,'name':1,'team_id':1},len(stat_ids)),
            _badge_projected_read(db.entity_media,{'_id':{'$in':list(media_ids)}},
                {'_id':1,'media':1,'identity':1,'status':1},len(media_ids)),
            _badge_projected_read(db.media_health,{'status':'broken'},{'_id':1},5000))
        for field,ids,docs in (('stats',stat_ids,stats),('media',media_ids,media)):
            if docs is not None:
                for key in ids:cache[field].pop(key,None)
                cache[field].update({doc['_id']:doc for doc in docs})
            # Bound optional in-process state without touching persistent source documents.
            if len(cache[field])>5000:
                cache[field]={k:v for k,v in cache[field].items() if k in ids}
        if health is not None:cache['broken']={doc['_id'] for doc in health}
    global_crests=_global_fd_crests(cache['stats'].values())
    result=[]
    for match in matches:
        row=dict(match);sport=enrichment_sport(row)
        fd=cache['stats'].get('fd_teams_'+COMPETITION_MAP.get(row.get('sport_key'),''),{})
        for side in ('home','away'):
            name=row.get(side+'_team');candidates=[]
            def add(url):
                if _media_url(url) and _media_health_key(url) not in cache['broken'] and url not in candidates:candidates.append(url)
            media=(cache['media'].get(_visual_key(sport,name),{}).get('media') or {}) if sport and name else {}
            approved=(sport=='tennis' and _approved_portrait(media)) or (sport!='tennis' and media.get('kind')=='badge' and media.get('provider')=='API-Sports' and media.get('verified_identity') is True)
            if sport=='tennis' and approved:
                add(media.get('url'))
                for url in media.get('alternatives') or []:add(url)
            else:
                add(row.get(side+'_logo'));add(row.get(side+'_team_logo'))
                for url in row.get(side+'_image_candidates') or []:add(url)
                if approved:
                    add(media.get('url'))
                    for url in media.get('alternatives') or []:add(url)
                provider_sport=_as_sport(row)
                stored=cache['stats'].get(_as_key(provider_sport,name),{}) if provider_sport and name else {}
                if stored.get('matched'):add(stored.get('logo'))
                if sport=='football':
                    add(global_crests.get(_media_identity(name,'football')))
                    seed=_verified_seed_media(name)
                    if seed:
                        add(seed['url'])
                        if not approved:media=seed;approved=True
            if candidates:
                row[side+'_logo']=candidates[0];row[side+'_image_candidates']=candidates[:4]
                if approved and candidates[0] in [media.get('url')]+list(media.get('alternatives') or []):
                    row[side+'_media']={**media,'url':candidates[0]}
            else:
                for field in (side+'_logo',side+'_team_logo'):
                    if _media_url(row.get(field)) and _media_health_key(row[field]) in cache['broken']:row[field]=None
                row[side+'_image_candidates']=[]
            current_media=row.get(side+'_media') or {}
            if current_media.get('url') and current_media.get('url') not in candidates:
                row.pop(side+'_media',None)
        result.append(row)
    return result



