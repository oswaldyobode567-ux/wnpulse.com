"""
WinPulse Stats Service — football-data.org integration (v1.0)

Objectif : fournir de la VRAIE forme recente et un VRAI historique H2H pour
les 12 grandes competitions couvertes par le plan gratuit football-data.org,
en complement (jamais en remplacement) des sources de cotes existantes
(The Odds API, odds-api.io, BSD Sports Addon) qui restent inchangees.

IMPORTANT — perimetre volontairement limite :
- Plan gratuit football-data.org = 12 competitions majeures uniquement
  (PL, PD, BL1, SA, FL1, CL, EL, ELC, EC, WC, DED, PPL, CLI, BSA — voir
  COMPETITION_MAP). Les qualifications africaines, ligues asiatiques,
  ligues mineures etc. ne sont PAS couvertes : le moteur retombe alors sur
  l'estimation existante (_deep_reasoning simule), sans aucune erreur.
- Pas de xG sur le plan gratuit — uniquement forme (V/N/D) et H2H reels.
- Rate limit strict : 10 requetes/minute. Ce module met TOUT en cache
  MongoDB et ne fait jamais d'appel direct pendant une requete utilisateur
  (meme pattern que odds_service.py : refresh planifie -> cache -> lecture).
"""
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

import httpx
import logging
logger = logging.getLogger("winpulse.stats_service")

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


async def _fd_get(path: str, params: Optional[Dict] = None) -> Optional[Dict]:
    """Appel generique a football-data.org. Retourne None en cas d'erreur —
    ne leve jamais d'exception, pour ne jamais casser le refresh principal."""
    if not FOOTBALL_DATA_TOKEN:
        return None
    url = f"{FOOTBALL_DATA_BASE}{path}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(
                url,
                headers={"X-Auth-Token": FOOTBALL_DATA_TOKEN},
                params=params or {},
            )
            if r.status_code == 429:
                logger.warning(f"football-data.org rate-limited sur {path}")
                return None
            if r.status_code != 200:
                logger.warning(f"football-data.org {path} -> HTTP {r.status_code}")
                return None
            return r.json()
    except Exception as e:
        logger.warning(f"football-data.org {path} -> exception: {e}")
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
                    return cached.get("data", {})
            except Exception:
                pass

    data = await _fd_get(f"/competitions/{competition_code}/teams")
    if not data or "teams" not in data:
        return cached.get("data", {}) if cached else {}

    mapping = {
        _normalize_name(t.get("name", "")): t.get("id")
        for t in data.get("teams", [])
        if t.get("id")
    }
    # Ajoute aussi le nom court/tla comme cle alternative, pour maximiser les
    # correspondances avec les noms d'equipes tels que fournis par The Odds API
    for t in data.get("teams", []):
        if t.get("shortName"):
            mapping[_normalize_name(t["shortName"])] = t.get("id")

    await db.stats_cache.update_one(
        {"_id": cache_key},
        {"$set": {"data": mapping, "updated_at": datetime.now(timezone.utc).isoformat()}},
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
    for known_name, team_id in mapping.items():
        if norm and (norm in known_name or known_name in norm):
            return team_id
    return None


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

    for code, comp_matches in by_competition.items():
        team_map = await _get_competition_teams(db, code)
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
                    if updated_at and (datetime.now(timezone.utc)
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
                continue  # rien de reel trouve, on laisse le fallback simule

            await db.real_stats_cache.update_one(
                {"_id": cache_key},
                {"$set": {
                    "form_home": form_home,
                    "form_away": form_away,
                    "h2h": h2h,
                    "competition": code,
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
        }
    return result


def lookup_real_stats(real_stats_map: Dict[str, Dict], home: str, away: str) -> Optional[Dict]:
    """Helper synchrone pour prediction_engine.py — cherche dans le map deja
    charge, aucun appel reseau ici."""
    key = f"{_normalize_name(home)}|{_normalize_name(away)}"
    return real_stats_map.get(key)
