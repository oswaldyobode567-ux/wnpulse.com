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
_APISPORTS_BASE = {"football": "https://v3.football.api-sports.io", "basketball": "https://v1.basketball.api-sports.io"}
_APISPORTS_DAILY_LIMIT = 80  # per API; leaves space for other account activity
_APISPORTS_RUN_LIMIT = 12   # across both APIs, per scheduler run


def _as_sport(match):
    key = str(match.get("sport_key") or "").lower()
    if key.startswith("soccer_"): return "football"
    if key.startswith("basketball_"): return "basketball"
    return None


def _as_normalize(name):
    return "".join(c for c in unicodedata.normalize("NFKD", str(name or "")).casefold() if c.isalnum() and not unicodedata.combining(c))


def _as_key(sport, name):
    return "as_team:" + sport + ":" + _as_normalize(name)


async def _as_request(db, sport, path, params):
    if not API_SPORTS_KEY or sport not in _APISPORTS_BASE: return None
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # The scheduled worker runs under a cross-process lease. Separate documents
    # ensure that the football and basketball free quotas remain independent.
    quota_id = "apisports:" + sport + ":" + day
    quota = await db.stats_cache.find_one({"_id": quota_id}) or {}
    if quota.get("calls", 0) >= _APISPORTS_DAILY_LIMIT: return None
    await db.stats_cache.update_one({"_id": quota_id}, {"$inc": {"calls": 1}}, upsert=True)
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=False) as client:
            response = await client.get(_APISPORTS_BASE[sport] + path, params=params, headers={"x-apisports-key": API_SPORTS_KEY})
        if response.status_code != 200:
            logger.warning("API-Sports %s: HTTP %s", sport, response.status_code)
            return None
        data = response.json()
        if not isinstance(data, dict) or data.get("errors") or not isinstance(data.get("response"), list):
            logger.warning("API-Sports %s: reponse indisponible ou quota atteint", sport)
            return None
        return data["response"]
    except (httpx.HTTPError, ValueError):
        logger.warning("API-Sports %s: requete indisponible", sport)
        return None


async def refresh_apisports_cache(db, matches):
    if not API_SPORTS_KEY: return {"skipped": "key_missing"}
    now = datetime.now(timezone.utc)
    used = 0
    for match in matches:
        sport = _as_sport(match)
        if not sport: continue
        kickoff = _display_date(match.get("commence_time"))
        if not kickoff or kickoff < now or kickoff > now + timedelta(days=7): continue
        for side in ("home", "away"):
            name = str(match.get(side + "_team") or "").strip()
            if len(name) < 3: continue
            cache_id = _as_key(sport, name)
            doc = await db.stats_cache.find_one({"_id": cache_id}) or {}
            updated = _display_date(doc.get("updated_at"))
            if updated and now - updated < timedelta(hours=24): continue
            if used >= _APISPORTS_RUN_LIMIT: return {"requests": used}
            rows = await _as_request(db, sport, "/teams", {"search": name})
            used += 1
            if rows is None: return {"requests": used, "stopped": "provider_unavailable"}  # retry on a later cycle
            candidates = []
            for item in rows:
                team = item.get("team", {}) if sport == "football" else item
                if _as_normalize(team.get("name")) == _as_normalize(name) and team.get("id"):
                    candidates.append(team)
            unique = {str(t["id"]): t for t in candidates}
            if len(unique) != 1:
                await db.stats_cache.update_one({"_id": cache_id}, {"$set": {"updated_at": now.isoformat(), "matched": False}}, upsert=True)
                continue
            team = next(iter(unique.values()))
            fields = {"updated_at": now.isoformat(), "matched": True, "team_id": team["id"], "name": team.get("name"), "logo": _safe_crest(team.get("logo"))}
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
