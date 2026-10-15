"""Free sports press review, based on GDELT titles/URLs only.

No API key, paid AI, publisher scraping, full article text or social images.
Runs outside page requests; Mongo lease and next_poll_at survive restarts.
Source 'seendate' means detected by GDELT, not a verified publication date.
"""
import asyncio
import hashlib
import html
import ipaddress
import json
import logging
import os
import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

import httpx
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from blog_service import slugify


GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
COLLECTOR_ID = "gdelt_sports"
SOURCE_NAMES = {
    "lequipe.fr": "L’Équipe", "eurosport.fr": "Eurosport", "footmercato.net": "Foot Mercato",
    "maxifoot.fr": "Maxifoot", "rmcsport.bfmtv.com": "RMC Sport", "sports.fr": "Sports.fr",
    "afrik-foot.com": "Afrik-Foot", "sofoot.com": "SO FOOT", "france24.com": "France 24",
    "rfi.fr": "RFI", "francetvinfo.fr": "Franceinfo", "olympics.com": "Olympics",
}
FOOTBALL_SOURCES = {"footmercato.net", "maxifoot.fr", "afrik-foot.com", "sofoot.com"}
SPORT_WORDS = [
    ("Basketball", r"\b(basket(?:ball)?|nba|wnba|euroleague|euroligue)\b"),
    ("Tennis", r"\b(tennis|atp|wta|wimbledon|roland.garros|djokovic|alcaraz|sinner|swiatek)\b"),
    ("Rugby", r"\b(rugby|top.14|six.nations|all.blacks)\b"),
    ("Hockey", r"\b(hockey|nhl)\b"),
    ("Sports mécaniques", r"\b(formule.1|formula.1|f1|motogp|grand.prix|verstappen|leclerc)\b"),
    ("Athlétisme", r"\b(athletisme|marathon|sprint|athletics)\b"),
    ("Football", r"\b(football|foot|soccer|mercato|ligue.[12]|champions.league|premier.league|liga|bundesliga|serie.a|psg|mbappe|messi|ronaldo|haaland|ballon.d.or)\b"),
    ("Autres sports", r"\b(handball|cyclisme|tour.de.france|volley|natation|boxe|judo|taekwondo|jeux.olympiques|olympiques)\b"),
]


def bounded_env(name, default, minimum, maximum):
    try:
        return max(minimum, min(int(os.environ.get(name, str(default))), maximum))
    except (ValueError, TypeError):
        return default


def config():
    return {
        "enabled": os.environ.get("BLOG_AUTO_NEWS_ENABLED", "true").strip().lower() not in {"0", "false", "no"},
        "interval_minutes": bounded_env("BLOG_AUTO_NEWS_INTERVAL_MINUTES", 60, 30, 360),
        "daily_limit": bounded_env("BLOG_AUTO_NEWS_DAILY_LIMIT", 5, 1, 12),
        "max_age_hours": 48,
        "provider": "GDELT",
        "requires_key": False,
    }


def utc_now():
    return datetime.now(timezone.utc)


def parse_date(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        if re.fullmatch(r"\d{8}T\d{6}Z", value):
            return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        if "T" not in value:
            return None
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result.astimezone(timezone.utc) if result.tzinfo else result.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def normalized_text(value):
    return "".join(character for character in unicodedata.normalize("NFKD", str(value))
                   if not unicodedata.combining(character)).lower()


def canonical_source_url(value):
    if not isinstance(value, str) or len(value) > 1800 or re.search(r"[\s\\\x00-\x1f]", value):
        return None
    try:
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.port not in {None, 443}:
            return None
        host = parsed.hostname.lower().rstrip(".")
        try:
            ipaddress.ip_address(host)
            return None  # Links are restricted to named media; never IP literals.
        except ValueError:
            pass
        base = next((domain for domain in SOURCE_NAMES if host == domain or host.endswith("." + domain)), None)
        if not base or not parsed.path or parsed.path == "/":
            return None
        # Remove only common tracking parameters. Preserve identifiers and signatures.
        query = [(key, val) for key, val in parse_qsl(parsed.query, keep_blank_values=True)
                 if not key.lower().startswith("utm_") and key.lower() not in {"fbclid", "gclid", "mc_cid", "mc_eid"}]
        return urlunsplit(("https", host, parsed.path, urlencode(query), "")), base
    except (ValueError, TypeError):
        return None


def sport_and_category(title, domain):
    text = normalized_text(title)
    if re.search(r"\b(casino|code.promo|pronostic.gagnant|gain.garanti)\b", text):
        return None
    sport = next((name for name, pattern in SPORT_WORDS if re.search(pattern, text)), None)
    if not sport and domain in FOOTBALL_SOURCES:
        sport = "Football"
    if not sport:
        return None
    if re.search(r"\b(mercato|transfert|transfers|recrutement|recrute|signature|pret|rumeur)\b", text):
        category = "Mercato"
    elif re.search(r"[«»]|\b(declare|declaration|conference.de.presse|confie|reagit)\b", text):
        category = "Déclarations"
    else:
        category = "Actualités"
    return sport, category


def candidate(row, now=None):
    now = now or utc_now()
    if not isinstance(row, dict) or str(row.get("language", "")).lower() not in {"french", "fr", "fra"}:
        return None
    raw_title = row.get("title")
    if not isinstance(raw_title, str):
        return None
    title = re.sub(r"\s+", " ", html.unescape(raw_title)).strip()
    if not 15 <= len(title) <= 160 or any(ord(char) < 32 for char in title):
        return None
    result = canonical_source_url(row.get("url"))
    seen = parse_date(row.get("seendate"))
    if not result or not seen or seen > now + timedelta(minutes=5) or seen < now - timedelta(hours=48):
        return None
    url, domain = result
    identified = sport_and_category(title, domain)
    if not identified:
        return None
    # Do not turn an explicitly old title into today's story after re-indexing.
    years = re.findall(r"\b(20\d{2})\b", title)
    if years and all(int(year) < now.year - 1 for year in years):
        return None
    sport, category = identified
    return {"title": title, "url": url, "domain": domain, "source": SOURCE_NAMES[domain],
            "sport": sport, "category": category, "seen_at": seen.isoformat(),
            "url_hash": hashlib.sha256(url.encode()).hexdigest(),
            "title_hash": hashlib.sha256(re.sub(r"\W+", " ", normalized_text(title)).strip().encode()).hexdigest()}


def query():
    # DOC searches an English translation of the original French news text.
    sports = '(football OR soccer OR basketball OR tennis OR rugby OR hockey OR athletics OR "formula 1" OR transfers)'
    domains = "(" + " OR ".join("domain:" + domain for domain in SOURCE_NAMES) + ")"
    return sports + " sourcelang:french " + domains


class ProviderFailure(Exception):
    def __init__(self, code, delay_seconds=900):
        self.code = code
        self.delay_seconds = delay_seconds


def retry_delay(value, now=None):
    now = now or utc_now()
    try:
        delay = int(value)
    except (TypeError, ValueError):
        try:
            date = parsedate_to_datetime(value)
            if not date.tzinfo:
                date = date.replace(tzinfo=timezone.utc)
            delay = int((date - now).total_seconds())
        except (TypeError, ValueError, OverflowError):
            delay = 3600
    return max(900, min(delay, 86400))


async def fetch_candidates():
    params = {"query": query(), "mode": "artlist", "format": "json", "maxrecords": 100,
              "timespan": "48h", "sort": "datedesc"}
    try:
        async with httpx.AsyncClient(timeout=18, follow_redirects=False) as client:
            # Stream with a hard size limit; a provider failure cannot load an unbounded payload.
            async with client.stream("GET", GDELT_URL, params=params, headers={"User-Agent": "WinPulse-PressReview/1.0"}) as response:
                if response.status_code == 429:
                    raise ProviderFailure("rate_limited", retry_delay(response.headers.get("Retry-After")))
                if response.status_code != 200:
                    raise ProviderFailure("provider_unavailable", 1800)
                chunks, total = [], 0
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > 1500000:
                        raise ProviderFailure("invalid_response", 3600)
                    chunks.append(chunk)
        data = json.loads(b"".join(chunks))
        if not isinstance(data, dict) or not isinstance(data.get("articles"), list):
            raise ProviderFailure("invalid_response", 3600)
        now = utc_now()
        rows = [item for row in data["articles"][:100] if (item := candidate(row, now)) is not None]
        return sorted(rows, key=lambda row: row["seen_at"], reverse=True)
    except ProviderFailure:
        raise
    except (httpx.HTTPError, ValueError, TypeError):
        raise ProviderFailure("provider_unavailable", 1800)


def build_post(item, now=None):
    now = now or utc_now()
    local = now.astimezone(ZoneInfo("Africa/Porto-Novo"))
    seen = parse_date(item["seen_at"])
    seen_local = seen.astimezone(ZoneInfo("Africa/Porto-Novo"))
    content = (
        f"## Dans la revue de presse\n\n"
        f"Un titre de {item['source']} concernant le {item['sport'].lower()} est à découvrir. "
        "Retrouve les faits, les précisions et le contexte dans l’article du média d’origine.\n\n"
        f"## Lire l’article d’origine\n\n[Consulter {item['source']}]({item['url']})\n\n"
        f"Titre repéré le {seen_local.strftime('%d/%m/%Y à %H:%M')} (heure de Porto-Novo). "
        "La date de repérage ne constitue pas une confirmation de la date de publication du média."
    )
    return {"_id": "news:" + item["url_hash"], "slug": "actu-" + (slugify(item["title"])[:92].rstrip("-") or "sport") + "-" + item["url_hash"][:12],
            "title": item["title"], "excerpt": f"{item['sport']} · {item['category']} : un titre de {item['source']} à découvrir dans notre revue de presse.",
            "content": content, "category": item["category"], "sport": item["sport"], "cover": "",
            "tags": [item["sport"], item["category"], "Revue de presse"], "status": "published", "author": "WinPulse",
            "created_at": now.isoformat(), "updated_at": now.isoformat(), "published_at": now.isoformat(),
            "read_min": None, "revision": 1, "kind": "news_link", "auto_generated": True,
            "auto_day": local.date().isoformat(), "auto_url_hash": item["url_hash"], "auto_title_hash": item["title_hash"],
            "source_name": item["source"], "source_url": item["url"], "information_date": seen_local.date().isoformat(),
            "source_date_kind": "observed", "source_seen_at": seen.isoformat(), "collector": "GDELT"}


async def bootstrap_news(db):
    await db.blog_posts.create_index("auto_url_hash", unique=True, sparse=True)
    await db.blog_posts.create_index("auto_title_hash", unique=True, sparse=True)
    await db.blog_posts.create_index("auto_day")
    await db.blog_news_state.update_one({"_id": COLLECTOR_ID}, {"$setOnInsert": {"paused": False, "status": "waiting", "last_added": 0}}, upsert=True)


async def news_status(db, scheduler_active=True):
    state = await db.blog_news_state.find_one({"_id": COLLECTOR_ID}) or {}
    settings = config()
    now = utc_now()
    today = now.astimezone(ZoneInfo("Africa/Porto-Novo")).date().isoformat()
    count = await db.blog_posts.count_documents({"auto_day": today})
    until = parse_date(state.get("lease_until"))
    busy = bool(until and until > now and state.get("status") == "running")
    return {**settings, "paused": bool(state.get("paused")), "scheduler_active": bool(scheduler_active),
            "status": "running" if busy else ("interrupted" if state.get("status") == "running" else state.get("status", "waiting")),
            "last_attempt_at": state.get("last_attempt_at"), "last_success_at": state.get("last_success_at"),
            "last_added": state.get("last_added", 0), "today_added": count,
            "next_poll_at": state.get("next_poll_at"), "last_error": state.get("last_error"), "date": today}


async def set_paused(db, paused):
    if not isinstance(paused, bool):
        raise ValueError("Le réglage paused doit être un booléen.")
    update = {"paused": paused}
    if not paused:
        # Resuming cannot cancel a provider Retry-After or an active lease.
        update["resumed_at"] = utc_now().isoformat()
    await db.blog_news_state.update_one({"_id": COLLECTOR_ID}, {"$set": update}, upsert=True)
    return {"ok": True, "paused": paused}


async def synchronize_news(db, fetcher=None):
    settings = config()
    if not settings["enabled"]:
        return {"status": "disabled", "added": 0}
    now = utc_now()
    state = await db.blog_news_state.find_one({"_id": COLLECTOR_ID}) or {}
    if state.get("paused"):
        return {"status": "paused", "added": 0}
    due = parse_date(state.get("next_poll_at"))
    if due and due > now:
        return {"status": "not_due", "added": 0}
    owner = str(uuid.uuid4())
    try:
        lock = await db.blog_news_state.find_one_and_update(
            {"_id": COLLECTOR_ID, "paused": {"$ne": True}, "$and": [
                {"$or": [{"lease_until": {"$lte": now.isoformat()}}, {"lease_until": {"$exists": False}}]},
                {"$or": [{"next_poll_at": {"$lte": now.isoformat()}}, {"next_poll_at": {"$exists": False}}]},
            ]}, {"$set": {"owner": owner, "lease_until": (now + timedelta(seconds=90)).isoformat(),
                          "status": "running", "last_attempt_at": now.isoformat()}},
            upsert=True, return_document=ReturnDocument.AFTER)
    except DuplicateKeyError:
        return {"status": "busy", "added": 0}
    if not lock or lock.get("owner") != owner:
        return {"status": "busy", "added": 0}
    added, state_update = 0, {}
    try:
        today = now.astimezone(ZoneInfo("Africa/Porto-Novo")).date().isoformat()
        count = await db.blog_posts.count_documents({"auto_day": today})
        if count >= settings["daily_limit"]:
            state_update = {"status": "daily_limit", "last_error": None, "last_added": 0,
                            "next_poll_at": (now + timedelta(minutes=settings["interval_minutes"])).isoformat()}
            return {"status": "daily_limit", "added": 0}
        rows = await asyncio.wait_for((fetcher or fetch_candidates)(), timeout=22)
        existing = await db.blog_posts.find({"auto_generated": True}, {"auto_title_hash": 1, "auto_url_hash": 1}).sort("created_at", -1).limit(1000).to_list(length=1000)
        known_titles = {doc.get("auto_title_hash") for doc in existing}
        known_urls = {doc.get("auto_url_hash") for doc in existing}
        # Spread imports across sports and media before adding repeated sources.
        rows.sort(key=lambda row: row["seen_at"], reverse=True)
        distinct, remainder, sources, sports = [], [], set(), set()
        for item in rows:
            if item["domain"] not in sources or item["sport"] not in sports:
                distinct.append(item); sources.add(item["domain"]); sports.add(item["sport"])
            else:
                remainder.append(item)
        for item in distinct + remainder:
            if count + added >= settings["daily_limit"] or added >= 2:
                break
            if item["url_hash"] in known_urls or item["title_hash"] in known_titles:
                continue
            latest = await db.blog_news_state.find_one({"_id": COLLECTOR_ID}) or {}
            if latest.get("owner") != owner or latest.get("paused"):
                break
            lease = parse_date(latest.get("lease_until"))
            if not lease or lease <= utc_now():
                break
            # Recheck after network delay: midnight must not spend yesterday's budget.
            insert_time = utc_now()
            insert_day = insert_time.astimezone(ZoneInfo("Africa/Porto-Novo")).date().isoformat()
            if insert_day != today:
                break
            try:
                await db.blog_posts.insert_one(build_post(item, insert_time))
            except DuplicateKeyError:
                continue  # Includes tombstones and previously edited/unpublished imports.
            added += 1; known_urls.add(item["url_hash"]); known_titles.add(item["title_hash"])
        state_update = {"status": "ok" if added else "no_new_items", "last_error": None, "last_added": added,
                        "last_success_at": utc_now().isoformat(),
                        "next_poll_at": (utc_now() + timedelta(minutes=settings["interval_minutes"])).isoformat()}
        return {"status": state_update["status"], "added": added}
    except (ProviderFailure, asyncio.TimeoutError) as exc:
        code = getattr(exc, "code", "provider_timeout")
        delay = getattr(exc, "delay_seconds", 1800)
        state_update = {"status": "error", "last_error": code, "last_added": added,
                        "next_poll_at": (utc_now() + timedelta(seconds=delay)).isoformat()}
        return {"status": "error", "error": code, "added": added}
    except asyncio.CancelledError:
        state_update = {"status": "interrupted", "last_error": "interrupted", "last_added": added,
                        "next_poll_at": (utc_now() + timedelta(minutes=15)).isoformat()}
        raise
    except Exception as exc:
        logging.getLogger(__name__).warning("Automatic news failed: %s", type(exc).__name__)
        state_update = {"status": "error", "last_error": "storage_or_service_error", "last_added": added,
                        "next_poll_at": (utc_now() + timedelta(minutes=30)).isoformat()}
        return {"status": "error", "error": "storage_or_service_error", "added": added}
    finally:
        if state_update:
            await asyncio.shield(db.blog_news_state.update_one(
                {"_id": COLLECTOR_ID, "owner": owner},
                {"$set": {**state_update, "lease_until": utc_now().isoformat()}}))
