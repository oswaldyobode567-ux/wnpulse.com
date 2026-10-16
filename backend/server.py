"""
WinPulse API — server.py (v8.6 stability)
Connecte auth.py, odds_service.py, prediction_engine.py, ai_service.py
"""
import os
import asyncio
import copy
import logging
import time
import httpx
import uuid
import hmac
import hashlib
import html
import json
import statistics
import math
import secrets
import re
import unicodedata
import ipaddress
import csv
import io
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Optional, List, Dict
from urllib.parse import parse_qs

from fastapi import FastAPI, Depends, HTTPException, status, Header, Request, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, EmailStr, Field, StrictBool, StrictInt
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user_payload, get_optional_user_payload,
)
from odds_service import (
    fetch_all_matches, refresh_matches_worker, fetch_all_scores,
    fetch_live_scores,
    fetch_odds_api_io_scores_map, diagnose_sport_key,
    probe_odds_api_io_event, probe_odds_api_io_league_sample,
    get_odds_cache_status, ODDS_API_IO_LEAGUES,
)
from stats_service import refresh_real_stats_cache, get_real_stats_map
from prediction_engine import (
    BOOKMAKER_PROFILE,
    analyze_all, analyze_match, top_predictions, build_multi_combos, find_value_bets,
    build_super_combos, build_today_combos_by_sport, build_ultra_safe_combo,
    _is_today as _is_today_match, MODEL_VERSION, SAFE_THRESHOLD, VALUE_THRESHOLD,
)
from ai_service import generate_analysis
from blog_seed import (
    bootstrap_blog, list_posts as blog_list_posts, get_post as blog_get_post,
    save_post as blog_save_post, delete_post as blog_delete_post, BlogConflictError,
)
from blog_seed import (
    bootstrap_news, synchronize_news, news_status, set_paused as pause_blog_news,
    config as blog_news_config,
)
from montante_service import MontanteService
# ─── Diffusions vidéo intégrées : aucun module live supplémentaire requis ───
from email.utils import parsedate_to_datetime

BASE_URL = "https://www.googleapis.com/youtube/v3"

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")

CHANNEL_ID = re.compile(r"^UC[A-Za-z0-9_-]{22}$")

MAX_CACHE_AGE_SECONDS = 600

STATE_ID = "youtube"

def now_utc():
    return datetime.now(timezone.utc)

def date_value(value):
    if not isinstance(value, str) or "T" not in value:
        return None
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result.astimezone(timezone.utc) if result.tzinfo else result.replace(tzinfo=timezone.utc)
    except ValueError:
        return None

def configuration():
    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    raw = os.environ.get("YOUTUBE_CHANNEL_HANDLES", "@fifa,@fiba")
    handles = list(dict.fromkeys("@" + value.strip().lstrip("@").lower() for value in raw.split(",")
                                if re.fullmatch(r"@?[A-Za-z0-9._-]{3,30}", value.strip())))[:3]
    enabled = os.environ.get("LIVE_VIDEO_ENABLED", "true").lower().strip() not in {"0", "false", "no"}
    return {"key": key, "handles": handles, "enabled": enabled,
            "configured": bool(key and handles and enabled),
            "signature": hashlib.sha256(",".join(handles).encode()).hexdigest(),
            "discovery_minutes": 60, "metadata_minutes": 5, "search_daily_limit": 80}

def public_configuration(settings):
    return {name: settings[name] for name in ("enabled", "configured", "handles", "discovery_minutes", "metadata_minutes", "search_daily_limit")}

def sport_for(handle, title):
    if handle == "@fiba" or re.search(r"basket|\bfiba\b|\bnba\b", title, re.I):
        return "basketball"
    if handle == "@fifa" or re.search(r"football|soccer|\bfifa\b", title, re.I):
        return "soccer"
    if re.search(r"tennis|\batp\b|\bwta\b", title, re.I):
        return "tennis"
    if "rugby" in title.lower():
        return "rugby"
    return "other"

def normalize_video(row, channels, now=None):
    now = now or now_utc()
    if not isinstance(row, dict) or not VIDEO_ID.fullmatch(str(row.get("id", ""))):
        return None
    snippet = row.get("snippet") or {}
    status = row.get("status") or {}
    details = row.get("liveStreamingDetails") or {}
    content = row.get("contentDetails") or {}
    if not all(isinstance(value, dict) for value in (snippet, status, details, content)):
        return None
    channel = channels.get(snippet.get("channelId"))
    if not channel or status.get("privacyStatus") != "public" or status.get("embeddable") is not True:
        return None
    if str(snippet.get("categoryId")) != "17":
        return None
    raw_title = snippet.get("title")
    if not isinstance(raw_title, str) or not raw_title.strip():
        return None
    title = re.sub(r"\s+", " ", html.unescape(raw_title)).strip()[:240]
    excluded = r"highlights?|résumé|replay|archive|press conference|conférence de presse|interview|training|entraînement|watch.?along|chat party|simulation|efootball|\bea ?fc\b|live.?scores?|ceremony|cerémonie|\bdraw\b"
    if re.search(excluded, title, re.I) or not re.search(r"\b(vs?\.?|versus|live|match|game)\b|en direct", title, re.I):
        return None
    years = re.findall(r"\b20\d{2}\b", title)
    if years and all(int(year) < now.year for year in years):
        return None
    if details.get("actualEndTime"):
        return None
    started = date_value(details.get("actualStartTime"))
    scheduled = date_value(details.get("scheduledStartTime"))
    if snippet.get("liveBroadcastContent") == "live" and started and now - timedelta(hours=24) <= started <= now + timedelta(minutes=2):
        state = "live"
    elif snippet.get("liveBroadcastContent") == "upcoming" and scheduled and now - timedelta(minutes=15) <= scheduled <= now + timedelta(hours=48):
        state = "upcoming"
    else:
        return None
    regions = content.get("regionRestriction") or {}
    if not isinstance(regions, dict):
        return None
    restriction = {}
    for field in ("allowed", "blocked"):
        if field not in regions:
            continue
        if not isinstance(regions[field], list) or any(not isinstance(code, str) or not re.fullmatch(r"[A-Z]{2}", code) for code in regions[field]):
            return None
        restriction[field] = regions[field]
    if "allowed" in restriction and not restriction["allowed"]:
        return None
    return {"video_id": row["id"], "title": title, "channel_id": snippet["channelId"],
            "channel_title": channel["title"], "channel_handle": channel["handle"],
            "sport": sport_for(channel["handle"], title), "status": state,
            "scheduled_start": scheduled.isoformat() if scheduled else None,
            "actual_start": started.isoformat() if started else None,
            "watch_url": "https://www.youtube.com/watch?v=" + row["id"],
            "verified_at": now.isoformat(), "region_restriction": restriction}

def region_available(item, region):
    restrictions = item.get("region_restriction") or {}
    if not isinstance(restrictions, dict):
        return False
    if not region:
        return True
    return ("allowed" not in restrictions or region in restrictions["allowed"]) and region not in restrictions.get("blocked", [])

def eligible_cached(item, now):
    if not isinstance(item, dict) or not VIDEO_ID.fullmatch(str(item.get("video_id", ""))):
        return False
    verified = date_value(item.get("verified_at"))
    if not verified or not 0 <= (now - verified).total_seconds() <= MAX_CACHE_AGE_SECONDS:
        return False
    start = date_value(item.get("actual_start") if item.get("status") == "live" else item.get("scheduled_start"))
    return bool(start and (now - timedelta(hours=24) <= start <= now + timedelta(minutes=2) if item.get("status") == "live"
                         else item.get("status") == "upcoming" and now - timedelta(minutes=15) <= start <= now + timedelta(hours=48)))

async def public_streams(db, region=""):
    settings = configuration()
    state = await db.live_stream_state.find_one({"_id": STATE_ID}) or {}
    cache = await db.live_stream_cache.find_one({"_id": STATE_ID}) or {}
    now = now_utc()
    rows = []
    if settings["configured"] and cache.get("signature") == settings["signature"]:
        candidates = cache.get("items")
        rows = [item for item in (candidates if isinstance(candidates, list) else []) if eligible_cached(item, now) and region_available(item, region)]
    rows.sort(key=lambda item: (item["status"] != "live", item.get("scheduled_start") or item.get("actual_start") or "", item["video_id"]))
    fields = ("video_id", "title", "channel_id", "channel_title", "channel_handle", "sport", "status", "scheduled_start", "actual_start", "watch_url", "verified_at")
    items = [{**{key: item.get(key) for key in fields}, "geographically_restricted": bool(item.get("region_restriction"))} for item in rows]
    error = state.get("error_code") if settings["configured"] else "video_not_configured"
    return {"items": items, "status": "not_configured" if not settings["configured"] else "ready" if items or cache.get("updated_at") else "warming",
            "error_code": error, "updated_at": cache.get("updated_at"),
            "next_refresh_at": state.get("next_sync_at"), "region": region,
            "refreshing": state.get("status") == "running" and bool(date_value(state.get("lease_until")) and date_value(state["lease_until"]) > now),
            "provider": "YouTube", "configured": settings["configured"]}

class StreamProviderError(Exception):
    def __init__(self, code, retry_seconds=900):
        self.code, self.retry_seconds = code, retry_seconds

async def youtube_request(client, method, params, key):
    try:
        async with client.stream("GET", BASE_URL + "/" + method, params=params,
                                 headers={"X-Goog-Api-Key": key}) as response:
            chunks, size = [], 0
            async for part in response.aiter_bytes():
                size += len(part)
                if size > 1000000:
                    raise StreamProviderError("video_invalid_response")
                chunks.append(part)
            try:
                data = json.loads(b"".join(chunks))
            except (ValueError, TypeError):
                raise StreamProviderError("video_invalid_response")
            if response.status_code != 200:
                errors = ((data.get("error") or {}).get("errors") or []) if isinstance(data, dict) else []
                reasons = {error.get("reason") for error in errors if isinstance(error, dict)}
                if reasons.intersection({"quotaExceeded", "dailyLimitExceeded"}):
                    pacific = now_utc().astimezone(ZoneInfo("America/Los_Angeles"))
                    reset = (pacific + timedelta(days=1)).replace(hour=0, minute=5, second=0, microsecond=0)
                    raise StreamProviderError("video_quota_exhausted", int((reset - pacific).total_seconds()))
                if response.status_code == 429 or "rateLimitExceeded" in reasons:
                    raw_retry = response.headers.get("Retry-After", "900")
                    try:
                        retry = int(raw_retry)
                    except (TypeError, ValueError):
                        try:
                            retry = int((parsedate_to_datetime(raw_retry) - now_utc()).total_seconds())
                        except (TypeError, ValueError, OverflowError):
                            retry = 900
                    retry = max(900, min(retry, 86400))
                    raise StreamProviderError("video_rate_limited", retry)
                if response.status_code in {400, 401, 403}:
                    raise StreamProviderError("video_access_denied", 1800)
                raise StreamProviderError("video_provider_unavailable")
            if not isinstance(data, dict) or not isinstance(data.get("items"), list):
                raise StreamProviderError("video_invalid_response")
            return data["items"]
    except StreamProviderError:
        raise
    except httpx.HTTPError:
        raise StreamProviderError("video_provider_unavailable")

async def resolve_channels(db, client, settings):
    cached = await db.live_stream_cache.find_one({"_id": "channels"}) or {}
    stamp = date_value(cached.get("updated_at"))
    if cached.get("signature") == settings["signature"] and stamp and 0 <= (now_utc() - stamp).total_seconds() < 86400:
        return cached.get("channels", {})
    channels = {}
    for handle in settings["handles"]:
        rows = await youtube_request(client, "channels", {"part": "snippet", "forHandle": handle,
                                                          "fields": "items(id,snippet(title))"}, settings["key"])
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("snippet") or {}, dict):
                continue
            identifier = row.get("id")
            if CHANNEL_ID.fullmatch(str(identifier or "")):
                channels[identifier] = {"handle": handle, "title": str((row.get("snippet") or {}).get("title") or handle)[:100]}
    if not channels:
        raise StreamProviderError("video_channels_unavailable", 3600)
    await db.live_stream_cache.update_one({"_id": "channels"}, {"$set": {"channels": channels, "signature": settings["signature"], "updated_at": now_utc().isoformat()}}, upsert=True)
    return channels

async def reserve_search(db, maximum):
    now = now_utc()
    day = now.astimezone(ZoneInfo("America/Los_Angeles")).date().isoformat()
    try:
        result = await db.live_stream_budget.find_one_and_update(
            {"_id": day, "$or": [{"calls": {"$lt": maximum}}, {"calls": {"$exists": False}}]},
            {"$inc": {"calls": 1}, "$set": {"expires_at": now + timedelta(days=3)}},
            upsert=True, return_document=ReturnDocument.AFTER)
        return bool(result and result.get("calls", maximum + 1) <= maximum)
    except DuplicateKeyError:
        return False

async def bootstrap_streams(db):
    await db.live_stream_budget.create_index("expires_at", expireAfterSeconds=0)
    await db.live_stream_state.update_one({"_id": STATE_ID}, {"$setOnInsert": {"status": "waiting"}}, upsert=True)

async def synchronize_streams(db):
    settings = configuration()
    if not settings["configured"]:
        return {"status": "not_configured"}
    now, owner = now_utc(), str(uuid.uuid4())
    try:
        state = await db.live_stream_state.find_one_and_update(
            {"_id": STATE_ID, "$and": [
                {"$or": [{"lease_until": {"$lte": now.isoformat()}}, {"lease_until": {"$exists": False}}]},
                {"$or": [{"next_sync_at": {"$lte": now.isoformat()}}, {"next_sync_at": {"$exists": False}}]},
            ]}, {"$set": {"owner": owner, "lease_until": (now + timedelta(seconds=90)).isoformat(), "status": "running", "last_attempt_at": now.isoformat()}},
            upsert=True, return_document=ReturnDocument.AFTER)
    except DuplicateKeyError:
        return {"status": "not_due_or_running"}
    if not state or state.get("owner") != owner:
        return {"status": "not_due_or_running"}
    update = {}
    try:
        cache = await db.live_stream_cache.find_one({"_id": STATE_ID}) or {}
        discovery_due = not date_value(state.get("next_discovery_at")) or date_value(state["next_discovery_at"]) <= now
        if cache.get("signature") != settings["signature"]:
            discovery_due = True
        candidates = cache.get("items")
        ids = list(dict.fromkeys(item.get("video_id") for item in (candidates if isinstance(candidates, list) else [])
                                 if isinstance(item, dict) and VIDEO_ID.fullmatch(str(item.get("video_id", "")))))[:30]
        budget_limited = False
        async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
            channels = await resolve_channels(db, client, settings)
            if discovery_due:
                channel_ids = list(channels)
                rotation = int(state.get("rotation", 0)) % len(channel_ids)
                requests = [(identifier, "live") for identifier in channel_ids] + [(channel_ids[rotation], "upcoming")]
                for identifier, event in requests:
                    if not await reserve_search(db, settings["search_daily_limit"]):
                        budget_limited = True
                        break
                    rows = await youtube_request(client, "search", {
                        "part": "snippet", "channelId": identifier, "type": "video", "eventType": event,
                        "videoEmbeddable": "true", "maxResults": 10, "fields": "items(id/videoId)",
                    }, settings["key"])
                    ids.extend(row.get("id", {}).get("videoId") for row in rows
                               if isinstance(row, dict) and isinstance(row.get("id"), dict)
                               and VIDEO_ID.fullmatch(str(row["id"].get("videoId", ""))))
                update.update(next_discovery_at=(now + timedelta(minutes=settings["discovery_minutes"])).isoformat(), rotation=rotation + 1)
            ids = list(dict.fromkeys(ids))[:50]
            items = []
            if ids:
                rows = await youtube_request(client, "videos", {
                    "part": "snippet,status,liveStreamingDetails,contentDetails", "id": ",".join(ids),
                    "fields": "items(id,snippet(channelId,channelTitle,title,categoryId,liveBroadcastContent),status(privacyStatus,embeddable),liveStreamingDetails(actualStartTime,actualEndTime,scheduledStartTime),contentDetails(regionRestriction))",
                }, settings["key"])
                items = [item for row in rows if (item := normalize_video(row, channels)) is not None]
        # A lease that expired or changed cannot publish an older provider response.
        latest = await db.live_stream_state.find_one({"_id": STATE_ID}) or {}
        if latest.get("owner") != owner or not date_value(latest.get("lease_until")) or date_value(latest["lease_until"]) <= now_utc():
            return {"status": "superseded"}
        stamp = now_utc().isoformat()
        # Compare the observed cache version as well: a delayed response must
        # never overwrite a newer snapshot published by another process.
        try:
            await db.live_stream_cache.update_one({"_id": STATE_ID,
                "updated_at": cache["updated_at"] if "updated_at" in cache else {"$exists": False}}, {"$set": {
                "items": items, "signature": settings["signature"], "updated_at": stamp,
            }}, upsert=True)
        except DuplicateKeyError:
            update.update(status="superseded", next_sync_at=(now_utc() + timedelta(minutes=5)).isoformat())
            return {"status": "superseded"}
        update.update(status="ready", last_success_at=stamp, error_code="video_search_budget" if budget_limited else None,
                      next_sync_at=(now_utc() + timedelta(minutes=settings["metadata_minutes"])).isoformat())
        return {"status": "ready", "count": len(items)}
    except StreamProviderError as exc:
        update.update(status="error", error_code=exc.code, next_sync_at=(now_utc() + timedelta(seconds=exc.retry_seconds)).isoformat())
        return {"status": "error", "error_code": exc.code}
    except asyncio.CancelledError:
        update.update(status="interrupted", error_code="video_sync_interrupted", next_sync_at=(now_utc() + timedelta(minutes=5)).isoformat())
        raise
    except Exception as exc:
        logging.getLogger(__name__).warning("Live video synchronization failed: %s", type(exc).__name__)
        update.update(status="error", error_code="video_service_unavailable", next_sync_at=(now_utc() + timedelta(minutes=5)).isoformat())
        return {"status": "error", "error_code": "video_service_unavailable"}
    finally:
        if update:
            await asyncio.shield(db.live_stream_state.update_one({"_id": STATE_ID, "owner": owner}, {"$set": {**update, "lease_until": now_utc().isoformat()}}))

async def stream_diagnostics(db, scheduler_active=False):
    settings = configuration()
    state = await db.live_stream_state.find_one({"_id": STATE_ID}) or {}
    day = now_utc().astimezone(ZoneInfo("America/Los_Angeles")).date().isoformat()
    budget = await db.live_stream_budget.find_one({"_id": day}) or {}
    return {**public_configuration(settings), "scheduler_active": scheduler_active,
            "status": state.get("status", "waiting"), "error_code": state.get("error_code"),
            "last_success_at": state.get("last_success_at"), "next_sync_at": state.get("next_sync_at"),
            "search_calls_today": budget.get("calls", 0)}

live_video_configuration = configuration
# ─── Fin du service de diffusions vidéo intégré ───

# ─── Systeme d'expiration d'abonnement ───────────────────────────────────────

def _compute_expiry(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


async def _check_and_downgrade_if_expired(user: dict) -> dict:
    """
    Verification paresseuse (a chaque lecture d'un compte) : si la date
    d'expiration est passee et que l'abonnement n'est pas deja "free",
    retrograde immediatement en base et retourne le compte a jour.
    Complementaire au balayage quotidien du scheduler (celui-ci couvre les
    comptes qui ne se reconnectent pas avant plusieurs jours).
    """
    expires_at = user.get("subscription_expires_at")
    if not expires_at or user.get("subscription", "free") == "free":
        return user

    try:
        exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
    except Exception:
        return user

    if datetime.now(timezone.utc) >= exp_dt:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"subscription": "free", "subscription_expires_at": None}},
        )
        user["subscription"] = "free"
        user["subscription_expires_at"] = None

    return user


async def _sweep_expired_subscriptions() -> Dict:
    """Balayage quotidien : retrograde tous les abonnements expires en base."""
    now_iso = datetime.now(timezone.utc).isoformat()
    result = await db.users.update_many(
        {
            "subscription": {"$ne": "free"},
            "subscription_expires_at": {"$ne": None, "$lt": now_iso},
        },
        {"$set": {"subscription": "free", "subscription_expires_at": None}},
    )
    return {"ok": True, "downgraded": result.modified_count}


# ─── Envoi d'email (Resend) ──────────────────────────────────────────────

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
EMAIL_FROM = os.environ.get("EMAIL_FROM", "WinPulse <contact@wnpulse.com>")
PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "https://www.wnpulse.com").strip().rstrip("/")
PASSWORD_RESET_TTL_MINUTES = max(10, min(int(os.environ.get("PASSWORD_RESET_TTL_MINUTES", "30")), 120))
PASSWORD_RESET_MAX_REQUESTS = max(1, min(int(os.environ.get("PASSWORD_RESET_MAX_REQUESTS", "3")), 10))


async def _send_email(to: str, subject: str, html: str) -> bool:
    """
    Envoie un email via l'API Resend. Ne leve jamais d'exception — un echec
    d'envoi ne doit jamais faire echouer l'inscription ou l'activation d'un
    abonnement, qui restent la priorite. Retourne True/False pour log.
    """
    if not RESEND_API_KEY:
        return False
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                json={"from": EMAIL_FROM, "to": [to], "subject": subject, "html": html},
            )
            return r.status_code in (200, 201)
    except Exception:
        return False


def _email_layout(title: str, body_html: str) -> str:
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <div style="background: linear-gradient(135deg, #ea580c, #f43f5e); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="color: white; font-size: 22px; font-weight: 800;">⚡ WinPulse</span>
      </div>
      <h2 style="color: #0f172a;">{title}</h2>
      {body_html}
      <p style="margin-top: 32px; font-size: 12px; color: #94a3b8; text-align: center;">
        WinPulse SARL · Cotonou, Bénin · wnpulse.com
      </p>
    </div>
    """


async def send_welcome_email(to: str, name: str):
    html = _email_layout(
        f"Bienvenue {name} ! 🎯",
        """
        <p>Ton compte WinPulse est créé. Tu as accès à 1 pronostic gratuit chaque jour.</p>
        <p>Passe Pro ou Elite pour débloquer l'analyse complète, les combinés et le détecteur de value bets.</p>
        <p><a href="https://www.wnpulse.com/app" style="color: #ea580c; font-weight: bold;">Voir mes pronostics →</a></p>
        """,
    )
    await _send_email(to, "Bienvenue sur WinPulse 🎯", html)


async def send_subscription_activated_email(to: str, plan_name: str, expires_at: Optional[str]):
    expiry_line = ""
    if expires_at:
        try:
            exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            expiry_line = f"<p>Valable jusqu'au <strong>{exp_dt.strftime('%d/%m/%Y')}</strong>.</p>"
        except Exception:
            pass
    html = _email_layout(
        f"Ton plan {plan_name} est actif ! 🚀",
        f"""
        <p>Ton paiement a été vérifié et ton abonnement <strong>{plan_name}</strong> est maintenant actif.</p>
        {expiry_line}
        <p><a href="https://www.wnpulse.com/app" style="color: #ea580c; font-weight: bold;">Voir tous mes pronostics →</a></p>
        """,
    )
    await _send_email(to, f"Ton plan {plan_name} est actif 🚀", html)


async def send_password_reset_email(to: str, name: str, reset_url: str) -> bool:
    first_name = html.escape((name or "").strip().split(" ")[0] or "")
    safe_url = html.escape(reset_url, quote=True)
    greeting = f"Bonjour {first_name}," if first_name else "Bonjour,"
    body = f"""
        <p>{greeting}</p>
        <p>Une demande de réinitialisation du mot de passe de ton compte WinPulse a été reçue.</p>
        <p style="margin: 24px 0; text-align: center;">
          <a href="{safe_url}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;font-weight:800;padding:13px 20px;border-radius:10px;">
            Choisir un nouveau mot de passe
          </a>
        </p>
        <p>Ce lien est valable pendant <strong>{PASSWORD_RESET_TTL_MINUTES} minutes</strong> et ne peut être utilisé qu'une seule fois.</p>
        <p>Si tu n'es pas à l'origine de cette demande, ignore simplement cet email. Ton mot de passe actuel reste inchangé.</p>
    """
    return await _send_email(to, "Réinitialisation de ton mot de passe WinPulse", _email_layout("Mot de passe oublié", body))


# ─── DB setup ─────────────────────────────────────────────────────────────
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "winpulse")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


async def _get_user_from_payload(payload: Optional[dict]) -> Optional[dict]:
    """Charge l'utilisateur et applique immédiatement une éventuelle expiration."""
    if not payload or not payload.get("sub"):
        return None
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        return None
    return await _check_and_downgrade_if_expired(user)


async def _has_paid_access(payload: Optional[dict]) -> bool:
    user = await _get_user_from_payload(payload)
    return bool(user and (user.get("is_admin") or user.get("subscription", "free") != "free"))


async def _require_paid_access(payload: dict) -> dict:
    user = await _get_user_from_payload(payload)
    if not user:
        raise HTTPException(status_code=401, detail="Authentification requise")
    if not user.get("is_admin") and user.get("subscription", "free") == "free":
        raise HTTPException(status_code=403, detail="Fonction réservée aux abonnés Pro")
    return user


_PREMIUM_PREDICTION_FIELDS = (
    "pick", "pick_odds", "markets", "recommendations", "combo_suggestion",
    "confidence", "calibrated_probability", "effective_score", "wp_score",
    "model_probability", "estimated_win_probability", "selection_score",
    "stability_score", "dominance_score", "edge",
    "pick_raw", "pick_point", "pick_team", "selection_id",
    "selection_explanation", "expected_return_pct", "push_probability", "quality_notes",
)


def _lock_prediction_for_free(prediction: Dict) -> Dict:
    """Masque côté serveur les informations permettant de reconstituer un pick premium."""
    locked = dict(prediction or {})
    for field in _PREMIUM_PREDICTION_FIELDS:
        if field in ("markets", "recommendations"):
            locked[field] = []
        else:
            locked[field] = None
    locked["locked"] = True
    return locked


# Bootstrap administrateur : désactivé par défaut. Les droits admin doivent
# normalement être persistés en base. Pour une initialisation ponctuelle,
# activer ALLOW_ADMIN_EMAIL_BOOTSTRAP=true puis le désactiver aussitôt.
ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "").split(",")
    if e.strip()
}
ALLOW_ADMIN_EMAIL_BOOTSTRAP = os.environ.get("ALLOW_ADMIN_EMAIL_BOOTSTRAP", "false").strip().lower() in ("1", "true", "yes")

# ─── Sécurité applicative ─────────────────────────────────────────────────

ENABLE_API_DOCS = os.environ.get("ENABLE_API_DOCS", "false").strip().lower() in ("1", "true", "yes")
MAX_REQUEST_BYTES = max(64 * 1024, min(int(os.environ.get("MAX_REQUEST_BYTES", str(2 * 1024 * 1024))), 10 * 1024 * 1024))
TRUSTED_HOSTS = [
    h.strip()
    for h in os.environ.get(
        "TRUSTED_HOSTS",
        "wnpulse.com,www.wnpulse.com,*.up.railway.app,*.railway.app,*.railway.internal,localhost,127.0.0.1",
    ).split(",")
    if h.strip()
]

_COMMON_PASSWORDS = {
    "password", "password123", "1234567890", "123456789", "12345678",
    "azerty123", "qwerty123", "winpulse123", "motdepasse", "motdepasse123",
}

def _password_security_error(password: str, email_addr: str = "") -> Optional[str]:
    if len(password) < 10:
        return "Le mot de passe doit contenir au moins 10 caractères"
    lowered = password.casefold()
    if lowered.strip() in _COMMON_PASSWORDS:
        return "Choisis un mot de passe moins courant"
    if len(set(password)) < 4:
        return "Choisis un mot de passe moins répétitif"
    local_part = (email_addr.split("@", 1)[0] if "@" in email_addr else email_addr).casefold().strip()
    if len(local_part) >= 4 and local_part in lowered:
        return "Le mot de passe ne doit pas contenir ton adresse email"
    return None


def _client_rate_key(request: Request) -> str:
    """Identifiant réseau non réversible utilisé uniquement pour l'anti-abus.

    On combine l'adresse vue par le serveur avec les en-têtes proxy valides :
    une requête directe ne peut donc pas contourner la limite en forgeant XFF.
    """
    peer = request.client.host if request.client else "unknown"
    candidates = []
    for header in ("cf-connecting-ip", "x-real-ip"):
        value = (request.headers.get(header) or "").strip()
        if value:
            candidates.append(value)
    xff = (request.headers.get("x-forwarded-for") or "").split(",", 1)[0].strip()
    if xff:
        candidates.append(xff)
    valid = []
    for value in candidates:
        try:
            valid.append(str(ipaddress.ip_address(value)))
        except ValueError:
            continue
    raw = "|".join([peer] + valid[:2])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _identifier_hash(value: str) -> str:
    return hashlib.sha256(value.strip().casefold().encode("utf-8")).hexdigest()


async def _consume_security_limit(
    scope: str, identifier: str, *, limit: int, window_seconds: int, detail: str = "Trop de tentatives. Réessaie plus tard."
) -> None:
    """Rate limiting MongoDB partagé entre replicas. Échec DB => fail-open pour disponibilité."""
    now = datetime.now(timezone.utc)
    bucket = int(now.timestamp()) // max(1, window_seconds)
    identifier_hash = _identifier_hash(identifier)
    doc_id = f"{scope}:{identifier_hash}:{bucket}"
    try:
        doc = await db.security_rate_limits.find_one_and_update(
            {"_id": doc_id},
            {
                "$inc": {"count": 1},
                "$setOnInsert": {
                    "scope": scope,
                    "identifier_hash": identifier_hash,
                    "created_at": now,
                    "expires_at": now + timedelta(seconds=window_seconds * 2),
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        if doc and int(doc.get("count", 0)) > limit:
            raise HTTPException(status_code=429, detail=detail, headers={"Retry-After": str(window_seconds)})
    except HTTPException:
        raise
    except Exception:
        return


async def _clear_security_limit(scope: str, identifier: str) -> None:
    try:
        await db.security_rate_limits.delete_many({
            "scope": scope,
            "identifier_hash": _identifier_hash(identifier),
        })
    except Exception:
        pass


# ─── Sessions personnelles / anti-partage de compte ─────────────────────────
# Règle WinPulse :
# - Free / Pro : UNE seule session active par compte.
# - Admin : plusieurs sessions simultanées autorisées.
# Le token brut n'est jamais stocké : seulement son SHA-256.

AUTH_SESSION_RETENTION_DAYS = max(
    7,
    min(int(os.environ.get("AUTH_SESSION_RETENTION_DAYS", "90")), 365),
)

_AUTH_SESSION_BYPASS_PATHS = {
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
}


def _auth_token_hash(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


async def _register_auth_session(
    user: dict,
    token: str,
    request: Optional[Request] = None,
    *,
    source: str = "login",
) -> None:
    """Enregistre une session sans stocker le JWT en clair.

    Pour Free/Pro, active_session_hash dans users est la source de vérité :
    toute nouvelle connexion remplace instantanément la précédente.
    Les comptes admin sont volontairement exemptés de cette limitation.
    """
    if not user or not token:
        return

    now = datetime.now(timezone.utc)
    token_hash = _auth_token_hash(token)
    user_id = str(user.get("id") or "")
    if not user_id:
        return

    is_admin = bool(user.get("is_admin"))
    user_agent = ""
    network_hash = None

    if request is not None:
        user_agent = (request.headers.get("user-agent") or "").strip()[:300]
        try:
            network_hash = _client_rate_key(request)
        except Exception:
            network_hash = None

    if not is_admin:
        # Un seul hash actif en base : même en cas de connexions simultanées,
        # la dernière écriture gagne et les anciens tokens deviennent invalides.
        await db.users.update_one(
            {"id": user_id},
            {
                "$set": {
                    "active_session_hash": token_hash,
                    "active_session_started_at": now,
                }
            },
        )

        # Conserve un historique minimal des anciennes sessions pour diagnostic,
        # sans conserver de token en clair.
        await db.auth_sessions.update_many(
            {
                "user_id": user_id,
                "_id": {"$ne": token_hash},
                "revoked": {"$ne": True},
            },
            {
                "$set": {
                    "revoked": True,
                    "revoked_at": now,
                    "revoked_reason": "replaced_by_new_login",
                }
            },
        )

    session_doc = {
        "_id": token_hash,
        "user_id": user_id,
        "is_admin": is_admin,
        "created_at": now,
        "last_seen_at": now,
        "expires_at": now + timedelta(days=AUTH_SESSION_RETENTION_DAYS),
        "revoked": False,
        "source": source,
        "user_agent": user_agent,
    }
    if network_hash:
        session_doc["network_hash"] = network_hash

    await db.auth_sessions.update_one(
        {"_id": token_hash},
        {"$set": session_doc},
        upsert=True,
    )


async def _revoke_all_auth_sessions(user_id: str, reason: str) -> None:
    """Révoque toutes les sessions d'un compte, notamment après changement MDP."""
    if not user_id:
        return
    now = datetime.now(timezone.utc)
    await db.auth_sessions.update_many(
        {"user_id": user_id, "revoked": {"$ne": True}},
        {
            "$set": {
                "revoked": True,
                "revoked_at": now,
                "revoked_reason": reason,
            }
        },
    )
    await db.users.update_one(
        {"id": user_id},
        {
            "$unset": {
                "active_session_hash": "",
                "active_session_started_at": "",
            }
        },
    )


async def _validate_registered_session(token: str) -> tuple[bool, str]:
    """Valide le token contre le registre de sessions.

    Retourne (True, "") si autorisé, sinon (False, code).
    Pour Admin, aucune comparaison avec active_session_hash : plusieurs
    navigateurs/appareils peuvent rester connectés en parallèle.
    """
    if not token:
        return True, ""

    token_hash = _auth_token_hash(token)
    session = await db.auth_sessions.find_one({"_id": token_hash})
    if not session or session.get("revoked") is True:
        return False, "SESSION_REVOKED"

    user = await db.users.find_one(
        {"id": session.get("user_id")},
        {"id": 1, "is_admin": 1, "active_session_hash": 1},
    )
    if not user:
        return False, "SESSION_REVOKED"

    if bool(user.get("is_admin")):
        # Exemption explicite administrateur : chaque session enregistrée reste valide.
        return True, ""

    active_hash = str(user.get("active_session_hash") or "")
    if not active_hash or not hmac.compare_digest(active_hash, token_hash):
        # Marque l'ancienne session comme révoquée pour l'historique.
        try:
            await db.auth_sessions.update_one(
                {"_id": token_hash},
                {
                    "$set": {
                        "revoked": True,
                        "revoked_at": datetime.now(timezone.utc),
                        "revoked_reason": "replaced_by_new_login",
                    }
                },
            )
        except Exception:
            pass
        return False, "SESSION_REVOKED"

    # Mise à jour légère de last_seen au maximum toutes les 5 minutes.
    last_seen = session.get("last_seen_at")
    if not isinstance(last_seen, datetime) or (
        datetime.now(timezone.utc) - (
            last_seen if last_seen.tzinfo else last_seen.replace(tzinfo=timezone.utc)
        )
    ) >= timedelta(minutes=5):
        try:
            await db.auth_sessions.update_one(
                {"_id": token_hash},
                {"$set": {"last_seen_at": datetime.now(timezone.utc)}},
            )
        except Exception:
            pass

    return True, ""


async def send_password_changed_email(to: str, name: str) -> bool:
    first_name = html.escape((name or "").strip().split(" ")[0] or "")
    greeting = f"Bonjour {first_name}," if first_name else "Bonjour,"
    body = f"""
        <p>{greeting}</p>
        <p>Le mot de passe de ton compte WinPulse vient d'être modifié.</p>
        <p>Si tu n'es pas à l'origine de ce changement, contacte immédiatement le support WinPulse et évite de réutiliser ton ancien mot de passe.</p>
    """
    return await _send_email(to, "Ton mot de passe WinPulse a été modifié", _email_layout("Mot de passe modifié", body))


# ─── App setup ────────────────────────────────────────────────────────────
app = FastAPI(
    title="WinPulse API",
    docs_url="/docs" if ENABLE_API_DOCS else None,
    redoc_url="/redoc" if ENABLE_API_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_API_DOCS else None,
)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=TRUSTED_HOSTS)

_manual_refresh_lock = asyncio.Lock()

PREDICTION_CACHE_TTL = int(os.environ.get("PREDICTION_CACHE_TTL", "300"))
_prediction_cache = {
    "timestamp": 0.0,
    "matches": [],
    "predictions": [],
    "real_stats_map": {},
    "calibration": {},
}
_prediction_cache_lock = asyncio.Lock()

CORS_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.environ.get(
        "CORS_ORIGINS",
        "https://wnpulse.com,https://www.wnpulse.com,http://localhost:3000,http://localhost:5173"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept-Language", "X-WNPulse-Language", "If-None-Match"],
    expose_headers=["Content-Language", "X-WNPulse-Language", "ETag"],
    allow_credentials=True,
)


# ─── Langues WNPulse : bloc autonome, sans dépendance/module supplémentaire ──
# Le catalogue est servi à React ; les anciens textes JSX restent inchangés.
_WN_LANGUAGES = {
    "fr": {"name": "Français", "locale": "fr-FR", "direction": "ltr"},
    "en": {"name": "English", "locale": "en-GB", "direction": "ltr"},
    "es": {"name": "Español", "locale": "es-ES", "direction": "ltr"},
    "pt": {"name": "Português", "locale": "pt-PT", "direction": "ltr"},
    "de": {"name": "Deutsch", "locale": "de-DE", "direction": "ltr"},
    "ar": {"name": "العربية", "locale": "ar", "direction": "rtl"},
}
_WN_CATALOGUE_VERSION = "d1fe911b7c2b0a2f"
_WN_MESSAGES = {
  "fr": {
    "Choisir la langue": "Choisir la langue",
    "Langue de l’interface": "Langue de l’interface",
    "Dashboard": "Tableau de bord",
    "Live": "En direct",
    "Aujourd'hui": "Aujourd'hui",
    "À la une": "À la une",
    "Combinés": "Combinés",
    "Combo Builder": "Combo Builder",
    "Value bets": "Value bets",
    "Montante": "Montante",
    "Track record": "Track record",
    "Profil": "Profil",
    "Parrainage": "Parrainage",
    "Abonnement": "Abonnement",
    "Admin": "Admin",
    "New": "Nouveau",
    "10J": "10 j",
    "Free": "Gratuit",
    "Ton pouls de gagnant": "Ton pouls de gagnant",
    "Connecté": "Connecté",
    "Déconnexion": "Déconnexion",
    "Plus d'options": "Plus d'options",
    "Fermer": "Fermer",
    "Plus": "Plus",
    "Tableau": "Tableau",
    "Direct": "Direct",
    "Jour": "Jour",
    "Créer": "Créer",
    "Blog": "Blog",
    "Mentions légales": "Mentions légales",
    "CGV": "CGV",
    "Confidentialité": "Confidentialité",
    "Jeu responsable · 18+": "Jeu responsable · 18+",
    "© 2026 WinPulse · Dublin, Irlande": "© 2026 WinPulse · Dublin, Irlande",
    "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.": "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.",
    "Ta session a expiré. Reconnecte-toi pour continuer.": "Ta session a expiré. Reconnecte-toi pour continuer.",
    "EN COURS": "EN COURS",
    "ÉCHOUÉE": "ÉCHOUÉE",
    "TERMINÉE": "TERMINÉE",
    "AUCUNE": "AUCUNE",
    "Aucune montante active.": "Aucune montante active.",
    "Impossible de charger la montante.": "Impossible de charger la montante.",
    "Impossible d'actualiser la montante.": "Impossible d'actualiser la montante.",
    "Le capital initial doit être un nombre positif.": "Le capital initial doit être un nombre positif.",
    "La montante doit durer 10 ou 15 jours.": "La montante doit durer 10 ou 15 jours.",
    "Impossible de démarrer la montante.": "Impossible de démarrer la montante.",
    "Montante WinPulse": "Montante WinPulse",
    "10 → 15 jours": "10 → 15 jours",
    "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.": "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.",
    "Actualiser": "Actualiser",
    "Montante indisponible": "Montante indisponible",
    "Contrôle administrateur": "Contrôle administrateur",
    "Montante 10 jours": "Montante 10 jours",
    "Montante 15 jours": "Montante 15 jours",
    "Capital initial": "Capital initial",
    "Démarrer": "Démarrer",
    "Recommencer": "Recommencer",
    "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.": "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.",
    "Chargement de la montante…": "Chargement de la montante…",
    "Aucune montante active": "Aucune montante active",
    "L'administrateur doit lancer une montante de 10 ou 15 jours.": "L'administrateur doit lancer une montante de 10 ou 15 jours.",
    "progression": "progression",
    "mise de départ": "mise de départ",
    "Capital théorique": "Capital théorique",
    "si les journées passent": "si les journées passent",
    "Progression": "Progression",
    "de la série": "de la série",
    "Progression de la série": "Progression de la série",
    "Jour {{day}} sur {{total}}": "Jour {{day}} sur {{total}}",
    "Pronostics du jour": "Pronostics du jour",
    "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.": "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.",
    "Pick {{number}}": "Pick {{number}}",
    "Confiance": "Confiance",
    "Début :": "Début :",
    "En attente d'un pick qualifié": "En attente d'un pick qualifié",
    "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.": "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.",
    "Historique": "Historique",
    "Aucune journée terminée.": "Aucune journée terminée.",
    "GAGNÉ": "GAGNÉ",
    "REMBOURSÉ": "REMBOURSÉ",
    "PERDU": "PERDU",
    "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.": "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.",
    "Chargement…": "Chargement…",
    "Analyses sportives": "Analyses sportives",
    "Historique des résultats": "Historique des résultats",
    "Articles": "Articles",
    "Ouvrir l'app": "Ouvrir l'app",
    "Connexion": "Connexion",
    "S'inscrire": "S'inscrire",
    "Démarrer gratuit": "Démarrer gratuit",
    "Pronostics · Analyses · Résultats publics": "Pronostics · Analyses · Résultats publics",
    "Vise la victoire avec nos pronostics.": "Vise la victoire avec nos pronostics.",
    "Garde une longueur d’avance.": "Garde une longueur d’avance.",
    "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.": "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.",
    "Découvrir les pronostics": "Découvrir les pronostics",
    "Découvrir l’offre Pro": "Découvrir l’offre Pro",
    "Consulter l’historique complet": "Consulter l’historique complet",
    "Inscription sans carte": "Inscription sans carte",
    "Résultats publics": "Résultats publics",
    "Compte gratuit": "Compte gratuit",
    "Pronostics disponibles": "Pronostics disponibles",
    "Chargement des analyses…": "Chargement des analyses…",
    "Les analyses ne sont pas disponibles pour le moment.": "Les analyses ne sont pas disponibles pour le moment.",
    "Réessayer": "Réessayer",
    "Les analyses du jour arrivent prochainement.": "Les analyses du jour arrivent prochainement.",
    "Consulte l’historique de résultats en attendant les prochaines sélections.": "Consulte l’historique de résultats en attendant les prochaines sélections.",
    "Analyse réservée Pro": "Analyse réservée Pro",
    "Indice : {{value}} %": "Indice : {{value}} %",
    "Les indices d’analyse ne garantissent aucun résultat.": "Les indices d’analyse ne garantissent aucun résultat.",
    "Ouvrir l’application": "Ouvrir l’application",
    "Créer mon compte gratuit": "Créer mon compte gratuit",
    "Historique des pronostics": "Historique des pronostics",
    "Les résultats d’hier": "Les résultats d’hier",
    "Matchs du {{date}}.": "Matchs du {{date}}.",
    "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.": "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.",
    "Voir tous les résultats": "Voir tous les résultats",
    "Chargement des résultats d’hier…": "Chargement des résultats d’hier…",
    "Le bilan d’hier n’est pas disponible pour le moment.": "Le bilan d’hier n’est pas disponible pour le moment.",
    "Tu peux consulter l’historique complet des résultats.": "Tu peux consulter l’historique complet des résultats.",
    "Gagnants": "Gagnants",
    "Perdants": "Perdants",
    "En attente": "En attente",
    "Annulés / remboursés": "Annulés / remboursés",
    "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.": "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.",
    "Aucun pronostic publié pour les matchs de cette journée.": "Aucun pronostic publié pour les matchs de cette journée.",
    "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.": "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.",
    "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.": "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.",
    "Gagné": "Gagné",
    "Cote publiée": "Cote publiée",
    "Score final": "Score final",
    "Pronostic publié avant le match · résultat confirmé.": "Pronostic publié avant le match · résultat confirmé.",
    "Les résultats passés ne garantissent pas les prochains résultats.": "Les résultats passés ne garantissent pas les prochains résultats.",
    "COMMENT UTILISER WINPULSE": "COMMENT UTILISER WINPULSE",
    "Une analyse pro, claire et immédiate": "Une analyse pro, claire et immédiate",
    "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.": "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.",
    "Explications de match": "Explications de match",
    "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.": "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.",
    "Scoring rigoureux": "Scoring rigoureux",
    "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.": "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.",
    "Combinés par profil": "Combinés par profil",
    "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.": "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.",
    "Track record transparent": "Track record transparent",
    "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.": "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.",
    "Value bets détectés": "Value bets détectés",
    "Compare les estimations et les cotes proposées. Les estimations restent incertaines.": "Compare les estimations et les cotes proposées. Les estimations restent incertaines.",
    "Découverte gratuite": "Découverte gratuite",
    "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.": "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.",
    "Retrouve ton code et les conditions du programme dans ton compte.": "Retrouve ton code et les conditions du programme dans ton compte.",
    "Voir mon code": "Voir mon code",
    "ABONNEMENT": "ABONNEMENT",
    "Choisis ton accès": "Choisis ton accès",
    "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.": "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.",
    "Pour découvrir": "Pour découvrir",
    "Sélections gratuites disponibles": "Sélections gratuites disponibles",
    "Tous les matchs (cotes visibles)": "Tous les matchs (cotes visibles)",
    "Track record public": "Track record public",
    "pour 30 jours": "pour 30 jours",
    "Accès complet": "Accès complet",
    "Tous les pronostics débloqués": "Tous les pronostics débloqués",
    "Tous les combinés du jour": "Tous les combinés du jour",
    "Explications des pronostics": "Explications des pronostics",
    "Value bets et Combo Builder": "Value bets et Combo Builder",
    "Montante premium": "Montante premium",
    "Support WhatsApp prioritaire": "Support WhatsApp prioritaire",
    "Passer à Pro": "Passer à Pro",
    "© 2026 WinPulse · Joue responsable · 18+": "© 2026 WinPulse · Joue responsable · 18+",
    "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.": "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.",
    "Renseigne ton nom.": "Renseigne ton nom.",
    "Ton numéro WhatsApp est obligatoire pour créer ton compte.": "Ton numéro WhatsApp est obligatoire pour créer ton compte.",
    "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.": "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.",
    "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.": "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.",
    "L’inscription n’a pas abouti. Réessaie dans un instant.": "L’inscription n’a pas abouti. Réessaie dans un instant.",
    "Analyse les matchs. Vérifie les résultats. Décide toi-même.": "Analyse les matchs. Vérifie les résultats. Décide toi-même.",
    "Commence gratuitement, sans carte bancaire.": "Commence gratuitement, sans carte bancaire.",
    "Historique public des résultats": "Historique public des résultats",
    "Aucun paiement pour créer le compte": "Aucun paiement pour créer le compte",
    "Invitation détectée": "Invitation détectée",
    "WinPulse · 18+ · Joue responsable": "WinPulse · 18+ · Joue responsable",
    "100 % gratuit": "100 % gratuit",
    "Ton accès gratuit est presque prêt": "Ton accès gratuit est presque prêt",
    "Crée ton compte pour découvrir WinPulse.": "Crée ton compte pour découvrir WinPulse.",
    "Gratuit": "Gratuit",
    "0 FCFA": "0 FCFA",
    "Sans CB": "Sans CB",
    "Aucun paiement": "Aucun paiement",
    "Libre": "Libre",
    "Sans engagement": "Sans engagement",
    "Nom": "Nom",
    "Ton nom complet": "Ton nom complet",
    "Email": "Email",
    "vous@email.com": "vous@email.com",
    "Numéro WhatsApp": "Numéro WhatsApp",
    "(obligatoire)": "(obligatoire)",
    "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.": "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.",
    "Mot de passe": "Mot de passe",
    "10 caractères minimum": "10 caractères minimum",
    "J’ai un code parrainage": "J’ai un code parrainage",
    "Code parrainage": "Code parrainage",
    "(optionnel)": "(optionnel)",
    "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.": "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.",
    "Création du compte…": "Création du compte…",
    "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.": "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.",
    "Politique de confidentialité": "Politique de confidentialité",
    "Déjà inscrit ?": "Déjà inscrit ?",
    "Se connecter": "Se connecter",
    "18+ · Joue responsable": "18+ · Joue responsable",
    "Bienvenue !": "Bienvenue !",
    "Erreur {{status}}": "Erreur {{status}}",
    "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.": "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.",
    "Erreur inconnue": "Erreur inconnue",
    "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.": "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.",
    "© 2026 WinPulse · 18+ · Joue responsable": "© 2026 WinPulse · 18+ · Joue responsable",
    "Accède à tes pronostics du jour": "Accède à tes pronostics du jour",
    "Mot de passe oublié ?": "Mot de passe oublié ?",
    "Connexion en cours…": "Connexion en cours…",
    "Pas encore de compte ?": "Pas encore de compte ?",
    "Créer un compte gratuit": "Créer un compte gratuit",
    "Cache de connexion effacé. Réessaye maintenant.": "Cache de connexion effacé. Réessaye maintenant.",
    "Le navigateur bloque l’accès au stockage local.": "Le navigateur bloque l’accès au stockage local.",
    "Problème de connexion ? Effacer le cache de connexion": "Problème de connexion ? Effacer le cache de connexion",
    "Email ou mot de passe incorrect": "Email ou mot de passe incorrect",
    "Email deja utilise": "Email deja utilise",
    "Le numéro WhatsApp est obligatoire pour créer un compte": "Le numéro WhatsApp est obligatoire pour créer un compte",
    "Le mot de passe doit contenir au moins 10 caractères": "Le mot de passe doit contenir au moins 10 caractères",
    "Choisis un mot de passe moins courant": "Choisis un mot de passe moins courant",
    "Choisis un mot de passe moins répétitif": "Choisis un mot de passe moins répétitif",
    "Le mot de passe ne doit pas contenir ton adresse email": "Le mot de passe ne doit pas contenir ton adresse email",
    "Trop de tentatives. Réessaie plus tard.": "Trop de tentatives. Réessaie plus tard.",
    "Actualisation en cours…": "Actualisation en cours…",
    "Football": "Football",
    "Basketball": "Basketball",
    "Tennis": "Tennis",
    "en attente": "en attente",
    "Sport": "Sport",
    "En direct{{v0}}": "En direct{{v0}}",
    "Terminé": "Terminé",
    "{{v0}} en direct": "{{v0}} en direct",
    "Hockey": "Hockey",
    "Tous les marchés": "Tous les marchés",
    "Vainqueur": "Vainqueur",
    "Mon ticket WNPulse": "Mon ticket WNPulse",
    "Les deux équipes marquent": "Les deux équipes marquent",
    "Effacer la recherche": "Effacer la recherche",
    "WNPULSE · COMBO BUILDER": "WNPULSE · COMBO BUILDER",
    "Aujourd’hui": "Aujourd’hui",
    "Cote {{v0}}": "Cote {{v0}}",
    "Réinitialiser les filtres": "Réinitialiser les filtres",
    "WhatsApp": "WhatsApp",
    "Confiance {{v0}}": "Confiance {{v0}}",
    "Clipboard unavailable": "Clipboard unavailable",
    "Cote": "Cote",
    "Confiance du moteur": "Confiance du moteur",
    "WNPULSE · LES COMBINÉS": "WNPULSE · LES COMBINÉS",
    "Tous": "Tous",
    "🏆 Victoire": "🏆 Victoire",
    "Double chance": "Double chance",
    "🔄 Double chance": "🔄 Double chance",
    "Handicap": "Handicap",
    "⚖️ Handicap": "⚖️ Handicap",
    "🟢 SÛR": "🟢 SÛR",
    "🟡 MODÉRÉ": "🟡 MODÉRÉ",
    "🔴 RISQUÉ": "🔴 RISQUÉ",
    "LIVE": "LIVE",
    "Passe Pro pour débloquer": "Passe Pro pour débloquer",
    "Pronostic": "Pronostic",
    "Partager sur WhatsApp": "Partager sur WhatsApp",
    "Gagnés": "Gagnés",
    "Perdus": "Perdus",
    "Perdu": "Perdu",
    "Marché": "Marché",
    "Découvrir Pro": "Découvrir Pro",
    "{{v0}} gagnés": "{{v0}} gagnés",
    "{{v0}} perdus": "{{v0}} perdus",
    "📈 Over 2.5": "📈 Over 2.5",
    "🎯 BTTS": "🎯 BTTS",
    "⚽ Over/Under": "⚽ Over/Under",
    "over 2": "over 2",
    "les deux": "les deux",
    "WhatsApp ouvert": "WhatsApp ouvert",
    "Partager sur WhatsApp (Admin)": "Partager sur WhatsApp (Admin)",
    "Sélection éditoriale automatique": "Sélection éditoriale automatique",
    "À la une — Top picks du jour": "À la une — Top picks du jour",
    "Les pronostics avec la plus haute confiance, tous sports confondus.{{v0}}": "Les pronostics avec la plus haute confiance, tous sports confondus.{{v0}}",
    "{{v0}} picks analysés": "{{v0}} picks analysés",
    "1 pick visible · {{v0}} verrouillés": "1 pick visible · {{v0}} verrouillés",
    "Passe Pro pour voir tous les picks et les 3 combinés du jour.": "Passe Pro pour voir tous les picks et les 3 combinés du jour.",
    "Débloquer": "Débloquer",
    "Aucun pick pour ce marché.": "Aucun pick pour ce marché.",
    "Voir tous les picks": "Voir tous les picks",
    "Pronostic verrouillé": "Pronostic verrouillé",
    "Marché : {{v0}}": "Marché : {{v0}}",
    "Confiance IA : {{v0}}%": "Confiance du moteur : {{v0}}%",
    "Un seul prix. Tout WinPulse. Sans compromis.": "Un seul prix. Tout WinPulse. Sans compromis.",
    "Accès illimité à tous les pronostics, tous les jours, sur 7 sports": "Accès illimité à tous les pronostics, tous les jours, sur 7 sports",
    "Tous les combinés (Sûr, Booster, Extra, Jackpot) débloqués": "Tous les combinés (Sûr, Booster, Extra, Jackpot) débloqués",
    "Chaque match analysé sur tous ses marchés": "Chaque match analysé sur tous ses marchés",
    "Combo Builder et détecteur de value bets": "Combo Builder et détecteur de value bets",
    "Analyse IA experte sur chaque match": "Explications détaillées des pronostics",
    "Montante WinPulse avec picks débloqués": "Montante WinPulse avec picks débloqués",
    "Track Record public et vérifiable": "Track Record public et vérifiable",
    "Support prioritaire par WhatsApp": "Support prioritaire par WhatsApp",
    "Offre en ligne momentanément indisponible. Le plan WinPulse reste affiché.": "Offre en ligne momentanément indisponible. Le plan WinPulse reste affiché.",
    "Indique le nom utilisé pour le paiement.": "Indique le nom utilisé pour le paiement.",
    "Indique le numéro MTN Mobile Money utilisé.": "Indique le numéro MTN Mobile Money utilisé.",
    "Le plan d'abonnement n'est pas disponible.": "Le plan d'abonnement n'est pas disponible.",
    "La référence de suivi n'a pas été générée.": "La référence de suivi n'a pas été générée.",
    "Lien de paiement FedaPay invalide.": "Lien de paiement FedaPay invalide.",
    "Le lien de paiement doit utiliser HTTPS.": "Le lien de paiement doit utiliser HTTPS.",
    "Impossible de générer la référence de paiement.": "Impossible de générer la référence de paiement.",
    "Référence copiée": "Référence copiée",
    "Bonjour WinPulse !": "Bonjour WinPulse !",
    "Merci de vérifier mon paiement et d'activer mon accès.": "Merci de vérifier mon paiement et d'activer mon accès.",
    "Paiement sécurisé via FedaPay · choisis ton moyen de paiement sur la page FedaPay · annulable à tout moment": "Paiement sécurisé via FedaPay · choisis ton moyen de paiement sur la page FedaPay · annulable à tout moment",
    "Paiement sécurisé · MTN Mobile Money disponible en solution de secours · annulable à tout moment": "Paiement sécurisé · MTN Mobile Money disponible en solution de secours · annulable à tout moment",
    "Plan actuel": "Plan actuel",
    "Paiement WinPulse": "Paiement WinPulse",
    "Informations de paiement": "Informations de paiement",
    "Détails du paiement": "Détails du paiement",
    "Nom et prénom": "Nom et prénom",
    "Téléphone (facultatif)": "Téléphone (facultatif)",
    "Numéro MTN Mobile Money": "Numéro MTN Mobile Money",
    "Ex. +229 01 97 00 00 00": "Ex. +229 01 97 00 00 00",
    "Ex. 01 97 00 00 00": "Ex. 01 97 00 00 00",
    "Copier la référence": "Copier la référence",
    "Ouverture du paiement…": "Ouverture du paiement…",
    "Préparation du paiement…": "Préparation du paiement…",
    "Un seul accès. Tout WinPulse.": "Un seul accès. Tout WinPulse.",
    "Plan actif :{{v0}}{{v1}}": "Plan actif :{{v0}}{{v1}}",
    "Débloquer WinPulse Pro": "Débloquer WinPulse Pro",
    "Sans engagement · résiliable à tout moment · support WhatsApp inclus": "Sans engagement · résiliable à tout moment · support WhatsApp inclus",
    "Aucun plan disponible pour le moment.": "Aucun plan disponible pour le moment.",
    "{{v0}} FCFA / mois": "{{v0}} FCFA / mois",
    "Débloquer Pro": "Débloquer Pro",
    "WinPulse Pro · {{v0}} FCFA / mois": "WinPulse Pro · {{v0}} FCFA / mois",
    "Montant de l'abonnement": "Montant de l'abonnement",
    "30 jours · WinPulse Pro": "30 jours · WinPulse Pro",
    "{{v0}} Après validation, tu seras redirigé vers la page de paiement.": "{{v0}} Après validation, tu seras redirigé vers la page de paiement.",
    "Paiement sécurisé par FedaPay.": "Paiement sécurisé par FedaPay.",
    "Email du compte": "Email du compte",
    "Nom utilisé pour le paiement": "Nom utilisé pour le paiement",
    "Référence de suivi": "Référence de suivi",
    "Procédure MTN Mobile Money": "Procédure MTN Mobile Money",
    "1. Compose {{v0}} ou ouvre l'application MTN MoMo.": "1. Compose {{v0}} ou ouvre l'application MTN MoMo.",
    "2. Envoie {{v0}} au {{v1}}.": "2. Envoie {{v0}} au {{v1}}.",
    "3. Vérifie le destinataire : {{v0}}.": "3. Vérifie le destinataire : {{v0}}.",
    "4. Garde le SMS de confirmation puis contacte WinPulse sur WhatsApp.": "4. Garde le SMS de confirmation puis contacte WinPulse sur WhatsApp.",
    "Envoyer la confirmation sur WhatsApp": "Envoyer la confirmation sur WhatsApp",
    "Référence : {{v0}}": "Référence : {{v0}}",
    "Je viens d'effectuer le paiement pour activer mon plan {{v0}}.": "Je viens d'effectuer le paiement pour activer mon plan {{v0}}.",
    "Montant : {{v0}} FCFA": "Montant : {{v0}} FCFA",
    "Numéro MTN MoMo utilisé : {{v0}}": "Numéro MTN MoMo utilisé : {{v0}}",
    "Nom : {{v0}}": "Nom : {{v0}}",
    "Email : {{v0}}": "Email : {{v0}}",
    "Débloquer {{v0}}": "Débloquer {{v0}}",
    "Payer {{v0}} FCFA": "Payer {{v0}} FCFA",
    "Continuer — {{v0}} FCFA": "Continuer — {{v0}} FCFA",
    "Impossible de charger le parrainage": "Impossible de charger le parrainage",
    "Lien copié — partage-le maintenant !": "Lien copié — partage-le maintenant !",
    "Récompense activée !": "Récompense activée !",
    "Réclamation impossible": "Réclamation impossible",
    "Copie ton lien ou ton code unique.": "Copie ton lien ou ton code unique.",
    "Partage-le sur WhatsApp, en 1 clic.": "Partage-le sur WhatsApp, en 1 clic.",
    "Découvre WinPulse — IA pronostics sportifs": "Découvre WinPulse — pronostics sportifs",
    "70%+ de réussite": "Résultats vérifiables",
    "Track record public, vérifiable à tout moment.": "Track record public, vérifiable à tout moment.",
    "Communauté active": "Communauté active",
    "Picks décortiqués, analyses IA, combinés du jour.": "Picks expliqués, analyses et combinés du jour.",
    "1 mois, paiement MTN. Pas de carte, pas de piège.": "1 mois, paiement MTN. Pas de carte, pas de piège.",
    "Programme parrainage": "Programme parrainage",
    "Invite 3 amis,{{v0}}reçois {{v1}}": "Invite 3 amis,{{v0}}reçois {{v1}}",
    "7 jours Pro offerts": "7 jours Pro offerts",
    "Partage ton lien WhatsApp en 1 clic. Dès que {{v0}} créent leur compte, ton accès Pro s'active automatiquement — vraiment gratuit.": "Partage ton lien WhatsApp en 1 clic. Dès que {{v0}} créent leur compte, ton accès Pro s'active automatiquement — vraiment gratuit.",
    "3 amis": "3 amis",
    "Ton code": "Ton code",
    "Ta progression": "Ta progression",
    "{{v0}} / {{v1}} amis inscrits": "{{v0}} / {{v1}} amis inscrits",
    "🎉 Bravo ! Tu peux réclamer ta récompense.": "🎉 Bravo ! Tu peux réclamer ta récompense.",
    "Récompense déjà réclamée. Merci d'avoir parrainé tes amis !": "Récompense déjà réclamée. Merci d'avoir parrainé tes amis !",
    "Encore {{v0}} ami{{v1}} à inviter pour débloquer ta semaine Pro.": "Encore {{v0}} ami{{v1}} à inviter pour débloquer ta semaine Pro.",
    "Comment ça marche": "Comment ça marche",
    "Partager maintenant": "Partager maintenant",
    "Envoyer par email": "Envoyer par email",
    "Pourquoi ils vont kiffer": "Pourquoi ils vont kiffer",
    "Code {{v0}} copié": "Code {{v0}} copié",
    "Dès que 3 amis créent leur compte avec ton code, {{v0}} jours Pro s'activent.": "Dès que 3 amis créent leur compte avec ton code, {{v0}} jours Pro s'activent.",
    "Cette rencontre n’est plus disponible dans les matchs actuels.": "Cette rencontre n’est plus disponible dans les matchs actuels.",
    "La rencontre ne peut pas être chargée pour le moment. Réessaie depuis le dashboard.": "La rencontre ne peut pas être chargée pour le moment. Réessaie depuis le dashboard.",
    "Le serveur réserve cette analyse à Pro. L’explication du pronostic reste disponible ci-dessus.": "Le serveur réserve cette analyse à Pro. L’explication du pronostic reste disponible ci-dessus.",
    "L’explication complémentaire est indisponible pour le moment. Les informations du pronostic restent affichées.": "L’explication complémentaire est indisponible pour le moment. Les informations du pronostic restent affichées.",
    "Match introuvable.": "Match introuvable.",
    "Bookmakers": "Bookmakers",
    "Écart estimé": "Écart estimé",
    " points": " points",
    "Estimation du moteur": "Estimation du moteur",
    "Cote optimale": "Cote optimale",
    "H2H (10 derniers)": "H2H (10 derniers)",
    "Forme récente": "Forme récente",
    "xG moyens": "xG moyens",
    "Absences clés": "Absences clés",
    "Cartons arbitre": "Cartons arbitre",
    "Conditions": "Conditions",
    "Forme et historique H2H réels (football-data.org) quand disponibles. Autres champs : analyse basée sur le consensus des cotes bookmakers.": "Forme et historique H2H réels (football-data.org) quand disponibles. Autres champs : analyse basée sur le consensus des cotes bookmakers.",
    "Analyse basée uniquement sur le consensus des cotes bookmakers agrégées — aucune statistique externe fabriquée.": "Analyse basée uniquement sur le consensus des cotes bookmakers agrégées — aucune statistique externe fabriquée.",
    "Enrichir l’explication": "Enrichir l’explication",
    "Source non précisée par le service": "Source non précisée par le service",
    "Moteur statistique": "Moteur statistique",
    "Retour au dashboard": "Retour au dashboard",
    "Retour": "Retour",
    "VS": "VS",
    "Passe Pro pour voir le pick complet": "Passe Pro pour voir le pick complet",
    "Inclut la cote optimale, le score de confiance, l'edge value et l'analyse IA experte.": "Inclut la cote optimale, le score de confiance, l’écart estimé et l’analyse détaillée.",
    "Pronostic principal": "Pronostic principal",
    "Bookmakers utilisés :": "Bookmakers utilisés :",
    "Partager": "Partager",
    "Comprendre ce pronostic": "Comprendre ce pronostic",
    "Le moteur compare les marchés et les cotes disponibles pour classer les sélections. L’estimation affichée est un indicateur calculé ; elle ne garantit pas le résultat du match.": "Le moteur compare les marchés et les cotes disponibles pour classer les sélections. L’estimation affichée est un indicateur calculé ; elle ne garantit pas le résultat du match.",
    "Nombre de bookmakers annoncé pour cette analyse : {{v0}}. Cote de la sélection : {{v1}}.": "Nombre de bookmakers annoncé pour cette analyse : {{v0}}. Cote de la sélection : {{v1}}.",
    "Des statistiques externes sont disponibles pour compléter cette analyse. Leur détail figure plus bas.": "Des statistiques externes sont disponibles pour compléter cette analyse. Leur détail figure plus bas.",
    "Les informations disponibles ne permettent pas ici d’ajouter une analyse vérifiée de la forme des équipes ou des absences.": "Les informations disponibles ne permettent pas ici d’ajouter une analyse vérifiée de la forme des équipes ou des absences.",
    "Tous les marchés analysés": "Tous les marchés analysés",
    "· {{v0}} books": "· {{v0}} books",
    "· edge +{{v0}}%": "· edge +{{v0}}%",
    "Analyse détaillée": "Analyse détaillée",
    "Données du moteur": "Données du moteur",
    "Aucune statistique externe vérifiée disponible pour ce match — le moteur s'appuie uniquement sur le consensus des cotes bookmakers, sans donnée inventée.": "Aucune statistique externe vérifiée disponible pour ce match — le moteur s'appuie uniquement sur le consensus des cotes bookmakers, sans donnée inventée.",
    "Explication complémentaire": "Explication complémentaire",
    "Demande une présentation complémentaire des éléments disponibles. Selon la configuration du service, le texte peut être rédigé avec l’aide d’une IA ou par le moteur statistique.{{v0}}": "Demande une présentation complémentaire des éléments disponibles. Selon la configuration du service, le texte peut être rédigé avec l’aide d’une IA ou par le moteur statistique.{{v0}}",
    "Certaines analyses complémentaires sont réservées à Pro. {{v0}}.": "Certaines analyses complémentaires sont réservées à Pro. {{v0}}.",
    "Verdict": "Verdict",
    "Facteurs clés": "Facteurs clés",
    "Alternative :": "Alternative :",
    "Source : {{v0}}": "Source : {{v0}}",
    "Cotes par bookmaker": "Cotes par bookmaker",
    "Bookmaker": "Bookmaker",
    "Données réelles (football-data.org) — forme récente et historique des confrontations directes, disponibles pour les grandes compétitions européennes suivies.": "Données réelles (football-data.org) — forme récente et historique des confrontations directes, disponibles pour les grandes compétitions européennes suivies.",
    "{{v0}} derniers matchs (réel)": "{{v0}} derniers matchs (réel)",
    "{{v0}} {{v1}} V": "{{v0}} {{v1}} V",
    "{{v0}} {{v1}} N": "{{v0}} {{v1}} N",
    "{{v0}} {{v1}} D": "{{v0}} {{v1}} D",
    "Forme récente non disponible": "Forme récente non disponible",
    "📅 Confrontations directes (historique réel)": "📅 Confrontations directes (historique réel)",
    "Nuls": "Nuls",
    "Bilan agrégé des confrontations directes récentes. Détail match par match non disponible sur la source actuelle.": "Bilan agrégé des confrontations directes récentes. Détail match par match non disponible sur la source actuelle.",
    "La sélection « {{v0}} » porte sur le total de buts ou de points pour les équipes et la période indiquées par le marché. Elle ne dépend pas uniquement du vainqueur de la rencontre.": "La sélection « {{v0}} » porte sur le total de buts ou de points pour les équipes et la période indiquées par le marché. Elle ne dépend pas uniquement du vainqueur de la rencontre.",
    "La sélection prévoit la victoire de {{v0}}, selon la période et les règles du marché.": "La sélection prévoit la victoire de {{v0}}, selon la période et les règles du marché.",
    "La sélection « {{v0}} » décrit l’événement attendu dans le marché indiqué. Vérifie la période et les règles de règlement du bookmaker.": "La sélection « {{v0}} » décrit l’événement attendu dans le marché indiqué. Vérifie la période et les règles de règlement du bookmaker.",
    "Rédaction assistée par IA ({{v0}})": "Rédaction assistée par IA ({{v0}})",
    "supérieur": "supérieur",
    "inférieur": "inférieur",
    "l’équipe indiquée": "l’équipe indiquée",
    "La sélection indique l’événement attendu. Vérifie le marché, la période du match et les règles de règlement avant de l’utiliser.": "La sélection indique l’événement attendu. Vérifie le marché, la période du match et les règles de règlement avant de l’utiliser.",
    "Invalid value bets response": "Invalid value bets response",
    "Écart non communiqué": "Écart non communiqué",
    "Cela signale une opportunité possible si l’estimation est fiable.": "Cela signale une opportunité possible si l’estimation est fiable.",
    "Ces chiffres ne montrent pas d’avantage positif à cette cote.": "Ces chiffres ne montrent pas d’avantage positif à cette cote.",
    "Ta session a expiré. Reconnecte-toi pour consulter les sélections.": "Ta session a expiré. Reconnecte-toi pour consulter les sélections.",
    "Les sélections ne peuvent pas être chargées pour le moment. Réessaie dans quelques instants.": "Les sélections ne peuvent pas être chargées pour le moment. Réessaie dans quelques instants.",
    "Chargement des sélections": "Chargement des sélections",
    "ne sont": "ne sont",
    "Aucune sélection à venir disponible pour le moment.": "Aucune sélection à venir disponible pour le moment.",
    "Aucune sélection disponible pour cette date.": "Aucune sélection disponible pour cette date.",
    "Reviens plus tard ou actualise les données.": "Reviens plus tard ou actualise les données.",
    "Essaie toutes les dates à venir.": "Essaie toutes les dates à venir.",
    "Date et heure à confirmer": "Date et heure à confirmer",
    "Estimation WinPulse": "Estimation WinPulse",
    "Probabilité implicite de la cote": "Probabilité implicite de la cote",
    "WinPulse affiche une estimation de {{v0}}. La cote de {{v1}} correspond à {{v2}} en probabilité implicite : l’écart est de {{v3}}. {{v4}}": "WinPulse affiche une estimation de {{v0}}. La cote de {{v1}} correspond à {{v2}} en probabilité implicite : l’écart est de {{v3}}. {{v4}}",
    "Il manque une cote ou une probabilité valide pour expliquer l’écart de cette sélection.": "Il manque une cote ou une probabilité valide pour expliquer l’écart de cette sélection.",
    "L’écart de probabilité n’est pas un pourcentage de gain. Les cotes évoluent et l’estimation peut être erronée. Pour un marché avec remboursement, la probabilité implicite ne décrit pas à elle seule toutes les issues de règlement.": "L’écart de probabilité n’est pas un pourcentage de gain. Les cotes évoluent et l’estimation peut être erronée. Pour un marché avec remboursement, la probabilité implicite ne décrit pas à elle seule toutes les issues de règlement.",
    "Détecteur de value bets": "Détecteur de value bets",
    "Des opportunités à examiner": "Des opportunités à examiner",
    "Retrouve la rencontre, son horaire, le marché conseillé et les chiffres qui expliquent chaque sélection.": "Retrouve la rencontre, son horaire, le marché conseillé et les chiffres qui expliquent chaque sélection.",
    "Une {{v0}} est une sélection dont la probabilité estimée dépasse le seuil implicite de la cote. L’écart, appelé {{v1}}, est exprimé ici en {{v2}}. Il dépend de la fiabilité de l’estimation.": "Une {{v0}} est une sélection dont la probabilité estimée dépasse le seuil implicite de la cote. L’écart, appelé {{v1}}, est exprimé ici en {{v2}}. Il dépend de la fiabilité de l’estimation.",
    "value bet": "value bet",
    "points de probabilité": "points de probabilité",
    "Voir un exemple de calcul": "Voir un exemple de calcul",
    "Exemple hypothétique, pour un pari sans remboursement : à cote 2,00, le seuil implicite est 50 %. Si la probabilité réelle était 60 %, l’écart serait de 10 points et le rendement moyen théorique serait de 20 % (0,60 × 2 − 1). Cela ne garantit aucun gain et suppose une estimation correcte.": "Exemple hypothétique, pour un pari sans remboursement : à cote 2,00, le seuil implicite est 50 %. Si la probabilité réelle était 60 %, l’écart serait de 10 points et le rendement moyen théorique serait de 20 % (0,60 × 2 − 1). Cela ne garantit aucun gain et suppose une estimation correcte.",
    "Les value bets sont réservés à Pro": "Les value bets sont réservés à Pro",
    "Accède aux rencontres, dates, marchés et explications des sélections avec ton abonnement Pro.": "Accède aux rencontres, dates, marchés et explications des sélections avec ton abonnement Pro.",
    "Créer mon compte": "Créer mon compte",
    "Se reconnecter": "Se reconnecter",
    "{{v0}} sélection{{v1}} affichée{{v2}}": "{{v0}} sélection{{v1}} affichée{{v2}}",
    "Horaires dans ton fuseau : {{v0}}.": "Horaires dans ton fuseau : {{v0}}.",
    "Toutes les dates à venir": "Toutes les dates à venir",
    "Tri{{v0}}": "Tri{{v0}}",
    "Écart estimé décroissant": "Écart estimé décroissant",
    "Date et heure": "Date et heure",
    "{{v0}} sélection{{v1}} dont le match a déjà commencé {{v2}} plus proposée{{v3}} ici.": "{{v0}} sélection{{v1}} dont le match a déjà commencé {{v2}} plus proposée{{v3}} ici.",
    "Voir toutes les dates": "Voir toutes les dates",
    "Les estimations ne garantissent aucun résultat. Vérifie les cotes et les règles du marché avant utilisation. 18+.": "Les estimations ne garantissent aucun résultat. Vérifie les cotes et les règles du marché avant utilisation. 18+.",
    "La sélection porte sur un total {{v0}} à {{v1}} pour les buts ou points et la période indiqués dans le marché. Le vainqueur peut être différent de l’équipe favorite.": "La sélection porte sur un total {{v0}} à {{v1}} pour les buts ou points et la période indiqués dans le marché. Le vainqueur peut être différent de l’équipe favorite.",
    "Le pronostic porte sur la victoire de {{v0}}, selon la période et les règles du marché.": "Le pronostic porte sur la victoire de {{v0}}, selon la période et les règles du marché.",
    "{{v0}}{{v1}} points": "{{v0}}{{v1}} points",
    "Foot US": "Foot US",
    "Autres": "Autres",
    "Buts / points": "Buts / points",
    "Autres marchés": "Autres marchés",
    "Horaire non communiqué": "Horaire non communiqué",
    "International": "International",
    "Espagne": "Espagne",
    "Allemagne": "Allemagne",
    "Italie": "Italie",
    "Angleterre": "Angleterre",
    "Pologne": "Pologne",
    "Finlande": "Finlande",
    "Japon": "Japon",
    "Chine": "Chine",
    "Portugal": "Portugal",
    "Brésil": "Brésil",
    "Argentine": "Argentine",
    "Deux issues sont couvertes : celles indiquées dans la sélection, sur la période du marché.": "Deux issues sont couvertes : celles indiquées dans la sélection, sur la période du marché.",
    "Le marché porte sur le fait que les deux équipes marquent, ou non, pendant la période indiquée.": "Le marché porte sur le fait que les deux équipes marquent, ou non, pendant la période indiquée.",
    "Le résultat est évalué après application du handicap affiché. La ligne et la période du marché déterminent son règlement.": "Le résultat est évalué après application du handicap affiché. La ligne et la période du marché déterminent son règlement.",
    "Le pari porte sur le total indiqué. Vérifie les règles de la ligne et de la période choisies.": "Le pari porte sur le total indiqué. Vérifie les règles de la ligne et de la période choisies.",
    "La sélection prévoit un match nul sur la période couverte.": "La sélection prévoit un match nul sur la période couverte.",
    "Lis cette sélection avec son marché et sa période. La fiche du match présente les informations disponibles.": "Lis cette sélection avec son marché et sa période. La fiche du match présente les informations disponibles.",
    "Marché réservé": "Marché réservé",
    "Marché non communiqué": "Marché non communiqué",
    "Compétition non communiquée": "Compétition non communiquée",
    "Rencontre commencée ou horaire à vérifier": "Rencontre commencée ou horaire à vérifier",
    "Sélection à vérifier : elle n’est plus proposée avec une cote disponible": "Sélection à vérifier : elle n’est plus proposée avec une cote disponible",
    "heure locale du navigateur": "heure locale du navigateur",
    " · Marché estimé, cote à confirmer": " · Marché estimé, cote à confirmer",
    "Confiance moyenne non disponible": "Confiance moyenne non disponible",
    "Sélections et cotes à vérifier avant les rencontres.": "Sélections et cotes à vérifier avant les rencontres.",
    "Ticket enregistré": "Ticket enregistré",
    "Domicile": "Domicile",
    "Nul": "Nul",
    "Extérieur": "Extérieur",
    "Plus de 2,5 buts": "Plus de 2,5 buts",
    "Plus de 1,5 but": "Plus de 1,5 but",
    "Domicile : aucun but encaissé": "Domicile : aucun but encaissé",
    "Extérieur : aucun but encaissé": "Extérieur : aucun but encaissé",
    "Ta session a expiré. Reconnecte-toi.": "Ta session a expiré. Reconnecte-toi.",
    "Cette fonction est réservée aux abonnés. Vérifie ton accès.": "Cette fonction est réservée aux abonnés. Vérifie ton accès.",
    "Les actualisations sont temporairement limitées. Réessaie dans quelques instants.": "Les actualisations sont temporairement limitées. Réessaie dans quelques instants.",
    "Le serveur met trop de temps à répondre. Réessaie.": "Le serveur met trop de temps à répondre. Réessaie.",
    "Impossible de charger les tickets enregistrés.": "Impossible de charger les tickets enregistrés.",
    "Ton accès n’a pas pu être actualisé. L’enregistrement sera disponible après vérification.": "Ton accès n’a pas pu être actualisé. L’enregistrement sera disponible après vérification.",
    "Impossible d’actualiser les rencontres. La dernière liste chargée reste disponible.": "Impossible d’actualiser les rencontres. La dernière liste chargée reste disponible.",
    "Cette sélection n’est pas disponible avec une cote et un horaire utilisables. Actualise le catalogue.": "Cette sélection n’est pas disponible avec une cote et un horaire utilisables. Actualise le catalogue.",
    "Actualise le catalogue pour vérifier ton accès aux repères.": "Actualise le catalogue pour vérifier ton accès aux repères.",
    "Les repères de marché ne sont pas disponibles. Réessaie.": "Les repères de marché ne sont pas disponibles. Réessaie.",
    "Actualise le catalogue pour vérifier ton accès à l’enregistrement.": "Actualise le catalogue pour vérifier ton accès à l’enregistrement.",
    "Actualise les rencontres et vérifie les sélections signalées avant d’enregistrer.": "Actualise les rencontres et vérifie les sélections signalées avant d’enregistrer.",
    "Ce ticket est déjà enregistré.": "Ce ticket est déjà enregistré.",
    "Ticket enregistré dans tes combinés.": "Ticket enregistré dans tes combinés.",
    "L’enregistrement n’a pas été confirmé. Vérifie la liste des tickets avant de réessayer.": "L’enregistrement n’a pas été confirmé. Vérifie la liste des tickets avant de réessayer.",
    "Ticket copié.": "Ticket copié.",
    "Sélectionne le texte ci-dessous pour le copier.": "Sélectionne le texte ci-dessous pour le copier.",
    "Ce ticket est long. Copie le texte ci-dessous pour le partager sans couper les sélections.": "Ce ticket est long. Copie le texte ci-dessous pour le partager sans couper les sélections.",
    "Ticket supprimé.": "Ticket supprimé.",
    "La suppression n’a pas été confirmée. Actualise la liste.": "La suppression n’a pas été confirmée. Actualise la liste.",
    "Rechercher et filtrer les rencontres": "Rechercher et filtrer les rencontres",
    "Équipe, championnat ou pays…": "Équipe, championnat ou pays…",
    "Choisir un sport": "Choisir un sport",
    "Chargement du programme…": "Chargement du programme…",
    "Aucune rencontre pour ces filtres": "Aucune rencontre pour ces filtres",
    "Aucune rencontre disponible actuellement": "Aucune rencontre disponible actuellement",
    "Essaie une autre équipe ou élargis les filtres.": "Essaie une autre équipe ou élargis les filtres.",
    "Actualise plus tard pour retrouver les prochains marchés proposés.": "Actualise plus tard pour retrouver les prochains marchés proposés.",
    "Ton ticket et tes sauvegardes": "Ton ticket et tes sauvegardes",
    "Une sélection par rencontre": "Une sélection par rencontre",
    "Replier le ticket": "Replier le ticket",
    "Ouvrir mon ticket": "Ouvrir mon ticket",
    "Non disponible": "Non disponible",
    "Mon combiné du week-end": "Mon combiné du week-end",
    "Enregistrer le ticket": "Enregistrer le ticket",
    "Actualiser les tickets enregistrés": "Actualiser les tickets enregistrés",
    "Équipe à confirmer": "Équipe à confirmer",
    "Sélection non communiquée": "Sélection non communiquée",
    "Prudent": "Prudent",
    "Modéré": "Modéré",
    "Risqué": "Risqué",
    "Replier": "Replier",
    "Voir les marchés": "Voir les marchés",
    "non fournie": "non fournie",
    "Retirer": "Retirer",
    "Ajouter": "Ajouter",
    "Des marchés de cette rencontre sont réservés aux abonnés.": "Des marchés de cette rencontre sont réservés aux abonnés.",
    "Aucune option avec une cote et un horaire disponibles.": "Aucune option avec une cote et un horaire disponibles.",
    "Sélection réservée": "Sélection réservée",
    "Réservée": "Réservée",
    "Ton combiné.{{v0}}{{v1}}": "Ton combiné.{{v0}}{{v1}}",
    "Tes choix.": "Tes choix.",
    "Explore les rencontres, compare les marchés et réunis tes sélections dans un ticket qui se lit en un coup d’œil.": "Explore les rencontres, compare les marchés et réunis tes sélections dans un ticket qui se lit en un coup d’œil.",
    "Horaires : {{v0}}{{v1}}": "Horaires : {{v0}}{{v1}}",
    "rencontres au catalogue": "rencontres au catalogue",
    "options sélectionnables": "options sélectionnables",
    "Reconnecte-toi pour continuer": "Reconnecte-toi pour continuer",
    "Ta session a expiré. Les sélections de la session précédente ont été retirées.": "Ta session a expiré. Les sélections de la session précédente ont été retirées.",
    "Quelle rencontre cherches-tu ?": "Quelle rencontre cherches-tu ?",
    "Date{{v0}}": "Date{{v0}}",
    "Toutes les dates": "Toutes les dates",
    "Demain": "Demain",
    "Classer par{{v0}}": "Classer par{{v0}}",
    "Horaire": "Horaire",
    "01 · Compose ton ticket": "01 · Compose ton ticket",
    "Les rencontres à explorer": "Les rencontres à explorer",
    "{{v0}} sélection{{v1}}{{v2}}": "{{v0}} sélection{{v1}}{{v2}}",
    "Voir le ticket": "Voir le ticket",
    "Le catalogue n’a pas été vérifié depuis plus de cinq minutes. Actualise avant d’ajouter ou de partager une sélection.": "Le catalogue n’a pas été vérifié depuis plus de cinq minutes. Actualise avant d’ajouter ou de partager une sélection.",
    "Certaines données incomplètes n’ont pas pu être affichées.": "Certaines données incomplètes n’ont pas pu être affichées.",
    "Chargement des rencontres": "Chargement des rencontres",
    "Les options disponibles apparaîtront ici.": "Les options disponibles apparaîtront ici.",
    "{{v0}} sur {{v1}} rencontres affichées": "{{v0}} sur {{v1}} rencontres affichées",
    "Afficher les rencontres suivantes": "Afficher les rencontres suivantes",
    "02 · Ton ticket": "02 · Ton ticket",
    "Mon combiné": "Mon combiné",
    "Ton ticket commence ici": "Ton ticket commence ici",
    "Ajoute une option sur une rencontre. Tu peux remplacer ton choix sans ajouter deux paris sur le même match.": "Ajoute une option sur une rencontre. Tu peux remplacer ton choix sans ajouter deux paris sur le même match.",
    "Cote cumulée": "Cote cumulée",
    "Produit des cotes des sélections du ticket.": "Produit des cotes des sélections du ticket.",
    "Confiance moyenne du moteur": "Confiance moyenne du moteur",
    "Sports représentés": "Sports représentés",
    "La confiance moyenne ne représente pas la probabilité que le combiné passe.": "La confiance moyenne ne représente pas la probabilité que le combiné passe.",
    "contre": "contre",
    "{{v0}} · Cote {{v1}}": "{{v0}} · Cote {{v1}}",
    "Marché estimé · cote à confirmer": "Marché estimé · cote à confirmer",
    "Cote actualisée : {{v0}} → {{v1}}": "Cote actualisée : {{v0}} → {{v1}}",
    "Vider le ticket": "Vider le ticket",
    "Nom du ticket {{v0}}{{v1}}": "Nom du ticket {{v0}}{{v1}}",
    "(facultatif)": "(facultatif)",
    "Actualise le catalogue et retire ou remplace les sélections signalées pour enregistrer ou partager le ticket.": "Actualise le catalogue et retire ou remplace les sélections signalées pour enregistrer ou partager le ticket.",
    "Enregistrer avec Pro": "Enregistrer avec Pro",
    "Vérifier mon accès": "Vérifier mon accès",
    "Copier": "Copier",
    "Les options avec un cadenas demandent un abonnement. L’enregistrement des tickets est réservé aux abonnés.": "Les options avec un cadenas demandent un abonnement. L’enregistrement des tickets est réservé aux abonnés.",
    "Voir les formules": "Voir les formules",
    "Texte du ticket": "Texte du ticket",
    "Mes tickets enregistrés": "Mes tickets enregistrés",
    "Historique de tes tickets": "Historique de tes tickets",
    "Ton accès est en cours de vérification.": "Ton accès est en cours de vérification.",
    "Retrouve tes tickets enregistrés avec un abonnement.": "Retrouve tes tickets enregistrés avec un abonnement.",
    "Chargement des sauvegardes…": "Chargement des sauvegardes…",
    "Aucun ticket enregistré pour le moment.": "Aucun ticket enregistré pour le moment.",
    "Cote {{v0}} · {{v1}} sélection{{v2}}": "Cote {{v0}} · {{v1}} sélection{{v2}}",
    "{{v0}} contre {{v1}}": "{{v0}} contre {{v1}}",
    "Le détail de ce ticket n’est pas disponible.": "Le détail de ce ticket n’est pas disponible.",
    "Ticket archivé : les horaires et cotes ne sont pas actualisés ici.": "Ticket archivé : les horaires et cotes ne sont pas actualisés ici.",
    "{{v0}} option{{v1}} sélectionnable{{v2}} · {{v3}} proposée{{v4}}": "{{v0}} option{{v1}} sélectionnable{{v2}} · {{v3}} proposée{{v4}}",
    "Choix proposé · {{v0}}": "Choix proposé · {{v0}}",
    "Une autre option de cette rencontre est dans ton ticket.": "Une autre option de cette rencontre est dans ton ticket.",
    "Un seul choix par rencontre : ajouter une autre option remplace la précédente.": "Un seul choix par rencontre : ajouter une autre option remplace la précédente.",
    "Comprendre ce marché": "Comprendre ce marché",
    "Afficher plus de marchés ({{v0}})": "Afficher plus de marchés ({{v0}})",
    "Débloquer les marchés réservés": "Débloquer les marchés réservés",
    "Repères de marché": "Repères de marché",
    "Les repères supplémentaires demandent un accès abonné vérifié. {{v0}}": "Les repères supplémentaires demandent un accès abonné vérifié. {{v0}}",
    "Chargement des repères…": "Chargement des repères…",
    "Estimations de marché disponibles pour cette rencontre. Les données insuffisantes ne sont pas affichées.": "Estimations de marché disponibles pour cette rencontre. Les données insuffisantes ne sont pas affichées.",
    "Les repères ne sont pas renseignés pour cette rencontre.": "Les repères ne sont pas renseignés pour cette rencontre.",
    "Ouvrir la fiche de la rencontre": "Ouvrir la fiche de la rencontre",
    "Le total doit rester inférieur à {{v0}} sur la période couverte.": "Le total doit rester inférieur à {{v0}} sur la période couverte.",
    "Le total doit dépasser {{v0}} sur la période couverte.": "Le total doit dépasser {{v0}} sur la période couverte.",
    "Le moteur retient {{v0}} comme vainqueur sur la période couverte.": "Le moteur retient {{v0}} comme vainqueur sur la période couverte.",
    "Horaires : {{v0}}": "Horaires : {{v0}}",
    "{{v0}}. {{v1}} vs {{v2}}\n{{v3}}{{v4}}\n{{v5}}\n{{v6}} : {{v7}}\nCote : {{v8}}{{v9}}": "{{v0}}. {{v1}} vs {{v2}}\n{{v3}}{{v4}}\n{{v5}}\n{{v6}} : {{v7}}\nCote : {{v8}}{{v9}}",
    "Cote cumulée : {{v0}}": "Cote cumulée : {{v0}}",
    "Confiance moyenne du moteur : {{v0}} % (indicateur, pas un taux de réussite)": "Confiance moyenne du moteur : {{v0}} % (indicateur, pas un taux de réussite)",
    " · Chargé à {{v0}}": " · Chargé à {{v0}}",
    "{{v0}} rencontre{{v1}} correspond{{v2}} à tes filtres": "{{v0}} rencontre{{v1}} correspond{{v2}} à tes filtres",
    "{{v0}} sélection{{v1}} · Cote {{v2}}": "{{v0}} sélection{{v1}} · Cote {{v2}}",
    "Retirer {{v0}} contre {{v1}}": "Retirer {{v0}} contre {{v1}}",
    "Supprimer le ticket {{v0}}": "Supprimer le ticket {{v0}}",
    "Filtrer les marchés de {{v0}}": "Filtrer les marchés de {{v0}}",
    "Sécurité": "Sécurité",
    "Le profil prudent, à examiner sélection par sélection.": "Le profil prudent, à examiner sélection par sélection.",
    "Équilibre": "Équilibre",
    "Un profil intermédiaire pour comparer les cotes et la confiance.": "Un profil intermédiaire pour comparer les cotes et la confiance.",
    "Le profil offensif : une cote élevée implique davantage d’incertitude.": "Le profil offensif : une cote élevée implique davantage d’incertitude.",
    "Cote totale non communiquée": "Cote totale non communiquée",
    "Les données reçues sont incomplètes. Réessaie pour obtenir une sélection valide.": "Les données reçues sont incomplètes. Réessaie pour obtenir une sélection valide.",
    "Impossible d’actualiser les combinés pour le moment. Réessaie dans quelques instants.": "Impossible d’actualiser les combinés pour le moment. Réessaie dans quelques instants.",
    "Le choix porte sur une victoire. En cas de nul sur la période couverte, le règlement de ce marché prévoit le remboursement.": "Le choix porte sur une victoire. En cas de nul sur la période couverte, le règlement de ce marché prévoit le remboursement.",
    "Rencontre terminée · actualise le combiné": "Rencontre terminée · actualise le combiné",
    "Rencontre commencée · actualise le combiné": "Rencontre commencée · actualise le combiné",
    "Équipe non communiquée": "Équipe non communiquée",
    "Pronostic sélectionné": "Pronostic sélectionné",
    "Non communiquée": "Non communiquée",
    "Aucun score de confiance n’a été communiqué pour cette sélection.": "Aucun score de confiance n’a été communiqué pour cette sélection.",
    "heure locale": "heure locale",
    "Combiné copié.": "Combiné copié.",
    "La copie automatique est indisponible. Sélectionne le texte ci-dessous.": "La copie automatique est indisponible. Sélectionne le texte ci-dessous.",
    "Dernier chargement": "Dernier chargement",
    "Actualisé": "Actualisé",
    "Choisis un profil pour explorer ses sélections": "Choisis un profil pour explorer ses sélections",
    "Actualiser les combinés": "Actualiser les combinés",
    "Profil à découvrir": "Profil à découvrir",
    "Cote non fournie": "Cote non fournie",
    "Accès Pro": "Accès Pro",
    "Sélections": "Sélections",
    "Cote totale": "Cote totale",
    "Confiance moyenne": "Confiance moyenne",
    "Probabilité combinée estimée": "Probabilité combinée estimée",
    "Chargement des combinés": "Chargement des combinés",
    "Une rencontre a déjà commencé ou s’est terminée. Actualise pour vérifier les sélections disponibles.": "Une rencontre a déjà commencé ou s’est terminée. Actualise pour vérifier les sélections disponibles.",
    "Cette sélection n’a pas été actualisée depuis plus de cinq minutes. Actualise avant de la copier.": "Cette sélection n’a pas été actualisée depuis plus de cinq minutes. Actualise avant de la copier.",
    "Le programme du combiné": "Le programme du combiné",
    "Les sélections, une par une": "Les sélections, une par une",
    "Présentation des rencontres": "Présentation des rencontres",
    "Récapitulatif du combiné": "Récapitulatif du combiné",
    "Disponible avec les sélections complètes.": "Disponible avec les sélections complètes.",
    "Actualise le combiné avant de copier ses sélections.": "Actualise le combiné avant de copier ses sélections.",
    "La copie est disponible avec au moins deux sélections complètes, dont les horaires sont à venir.": "La copie est disponible avec au moins deux sélections complètes, dont les horaires sont à venir.",
    "Fermer le texte à copier": "Fermer le texte à copier",
    "À confirmer": "À confirmer",
    "Ce que signifie ce pronostic": "Ce que signifie ce pronostic",
    "Consulter la rencontre": "Consulter la rencontre",
    "Le pronostic est réservé aux abonnés": "Le pronostic est réservé aux abonnés",
    "Débloque la sélection, son marché et sa cote.": "Débloque la sélection, son marché et sa cote.",
    "Voir les abonnements": "Voir les abonnements",
    "Lis le match.{{v0}}{{v1}}": "Lis le match.{{v0}}{{v1}}",
    "Choisis ton combiné.": "Choisis ton combiné.",
    "Trois profils. Chaque rencontre expliquée. Toutes les sélections réunies dans un ticket clair.": "Trois profils. Chaque rencontre expliquée. Toutes les sélections réunies dans un ticket clair.",
    "{{v0}} à {{v1}}": "{{v0}} à {{v1}}",
    "Profil sélectionné": "Profil sélectionné",
    "01 · Choisis ton profil": "01 · Choisis ton profil",
    "Quel combiné veux-tu explorer ?": "Quel combiné veux-tu explorer ?",
    "Comparer les trois profils": "Comparer les trois profils",
    "Explorer ce profil": "Explorer ce profil",
    "Les indicateurs proviennent du moteur. La confiance moyenne et la probabilité combinée décrivent deux choses différentes.": "Les indicateurs proviennent du moteur. La confiance moyenne et la probabilité combinée décrivent deux choses différentes.",
    "La dernière sélection chargée reste affichée.": "La dernière sélection chargée reste affichée.",
    "Préparation des sélections": "Préparation des sélections",
    "Vérification de ton accès et chargement des rencontres…": "Vérification de ton accès et chargement des rencontres…",
    "Ta session doit être renouvelée": "Ta session doit être renouvelée",
    "Reconnecte-toi pour retrouver l’accès correspondant à ton compte.": "Reconnecte-toi pour retrouver l’accès correspondant à ton compte.",
    "Les sélections complètes": "Les sélections complètes",
    "Explore les trois profils avec Pro.": "Explore les trois profils avec Pro.",
    "Ton accès actuel ne permet pas de consulter ces combinés. Retrouve les rencontres, les marchés et les cotes en découvrant les abonnements disponibles.": "Ton accès actuel ne permet pas de consulter ces combinés. Retrouve les rencontres, les marchés et les cotes en découvrant les abonnements disponibles.",
    "Découvrir les abonnements": "Découvrir les abonnements",
    "Les combinés n’ont pas pu être chargés": "Les combinés n’ont pas pu être chargés",
    "Utilise le bouton Réessayer ci-dessus pour relancer la vérification.": "Utilise le bouton Réessayer ci-dessus pour relancer la vérification.",
    "Un combiné gratuit à découvrir": "Un combiné gratuit à découvrir",
    "Le profil {{v0}} est accessible avec ton compte.": "Le profil {{v0}} est accessible avec ton compte.",
    "Voir le combiné": "Voir le combiné",
    "Aucune sélection pour ce profil": "Aucune sélection pour ce profil",
    "Le moteur n’a pas fourni de combiné {{v0}} pour le moment. Consulte un autre profil ou actualise plus tard.": "Le moteur n’a pas fourni de combiné {{v0}} pour le moment. Consulte un autre profil ou actualise plus tard.",
    "02 · Parcours les rencontres": "02 · Parcours les rencontres",
    "{{v0}} sélection{{v1}} · Profil {{v2}}": "{{v0}} sélection{{v1}} · Profil {{v2}}",
    "Première rencontre : {{v0}}": "Première rencontre : {{v0}}",
    "Fiches": "Fiches",
    "Horaires": "Horaires",
    "Cote totale du moteur{{v0}}": "Cote totale du moteur{{v0}}",
    "03 · Ton ticket": "03 · Ton ticket",
    "Combiné {{v0}}": "Combiné {{v0}}",
    "{{v0}} sélection{{v1}} réunies": "{{v0}} sélection{{v1}} réunies",
    "Cote totale du moteur": "Cote totale du moteur",
    "Copier le ticket": "Copier le ticket",
    "Débloquer le combiné": "Débloquer le combiné",
    "Appuie dans le texte pour le sélectionner.": "Appuie dans le texte pour le sélectionner.",
    "Bien lire le combiné": "Bien lire le combiné",
    "La confiance moyenne décrit les sélections individuellement. Elle ne correspond pas à la probabilité que tout le combiné passe.": "La confiance moyenne décrit les sélections individuellement. Elle ne correspond pas à la probabilité que tout le combiné passe.",
    "La probabilité combinée est une estimation du moteur, liée à ses hypothèses sur les matchs. Elle ne constitue pas un taux de réussite mesuré.": "La probabilité combinée est une estimation du moteur, liée à ses hypothèses sur les matchs. Elle ne constitue pas un taux de réussite mesuré.",
    "Un combiné dépend de chacune de ses sélections. Le profil « Sécurité » reste soumis à cette incertitude.": "Un combiné dépend de chacune de ses sélections. Le profil « Sécurité » reste soumis à cette incertitude.",
    "Vérification des sélections et de ton accès…": "Vérification des sélections et de ton accès…",
    "WNPulse · Combiné {{v0}}": "WNPulse · Combiné {{v0}}",
    "{{v0}}. {{v1}} vs {{v2}}": "{{v0}}. {{v1}} vs {{v2}}",
    "Cote : {{v0}}": "Cote : {{v0}}",
    "Cote totale du moteur : {{v0}}": "Cote totale du moteur : {{v0}}",
    "{{v0}} sélection{{v1}} dans ce ticket": "{{v0}} sélection{{v1}} dans ce ticket",
    "{{v0}} sélection{{v1}}": "{{v0}} sélection{{v1}}",
    "{{v0}} / mois": "{{v0}} / mois",
    "{{v0}} remboursés": "{{v0}} remboursés",
    "🎯 *Pick WinPulse*\n{{v0}} · {{v1}}\n\n*{{v2}}* vs *{{v3}}*\n👉 {{v4}} @ *{{v5}}*\nConfiance IA : {{v6}}%\nMarché : {{v7}}\n\nhttps://wnpulse.com": "🎯 *Pick WinPulse*\n{{v0}} · {{v1}}\n\n*{{v2}}* vs *{{v3}}*\n👉 {{v4}} @ *{{v5}}*\nConfiance du moteur : {{v6}}%\nMarché : {{v7}}\n\nhttps://wnpulse.com",
    "Le texte libre fourni par le serveur reste affiché dans sa langue d’origine.": "Le texte libre fourni par le serveur reste affiché dans sa langue d’origine.",
    "/mois": "/mois",
    "Le service de scores n’est pas configuré. Contactez l’équipe WinPulse.": "Le service de scores n’est pas configuré. Contactez l’équipe WinPulse.",
    "Le fournisseur refuse l’accès aux scores. L’équipe WinPulse doit vérifier sa configuration.": "Le fournisseur refuse l’accès aux scores. L’équipe WinPulse doit vérifier sa configuration.",
    "Le quota du fournisseur de scores est épuisé. L’équipe WinPulse doit rétablir le service.": "Le quota du fournisseur de scores est épuisé. L’équipe WinPulse doit rétablir le service.",
    "Le fournisseur limite les demandes. Une nouvelle tentative sera effectuée automatiquement.": "Le fournisseur limite les demandes. Une nouvelle tentative sera effectuée automatiquement.",
    "Le fournisseur de scores met trop de temps à répondre. Nouvelle tentative automatique à venir.": "Le fournisseur de scores met trop de temps à répondre. Nouvelle tentative automatique à venir.",
    "Le service de scores est temporairement indisponible. Nouvelle tentative automatique à venir.": "Le service de scores est temporairement indisponible. Nouvelle tentative automatique à venir.",
    "Les scores de ces compétitions ne sont pas disponibles auprès du fournisseur.": "Les scores de ces compétitions ne sont pas disponibles auprès du fournisseur.",
    "Votre session a expiré ou l’accès est refusé. Reconnectez-vous pour réessayer.": "Votre session a expiré ou l’accès est refusé. Reconnectez-vous pour réessayer.",
    "Le service de scores n’est pas disponible sur cette version du serveur.": "Le service de scores n’est pas disponible sur cette version du serveur.",
    "Le serveur met trop de temps à répondre. Nouvelle tentative automatique à venir.": "Le serveur met trop de temps à répondre. Nouvelle tentative automatique à venir.",
    "Les scores ne peuvent pas être actualisés pour le moment. Nouvelle tentative automatique à venir.": "Les scores ne peuvent pas être actualisés pour le moment. Nouvelle tentative automatique à venir.",
    "La préparation des scores prend plus de temps que prévu. Une nouvelle tentative sera effectuée automatiquement.": "La préparation des scores prend plus de temps que prévu. Une nouvelle tentative sera effectuée automatiquement.",
    "Réponse des scores invalide": "Réponse des scores invalide",
    "Certaines compétitions ne sont pas disponibles. Les scores reçus restent affichés.": "Certaines compétitions ne sont pas disponibles. Les scores reçus restent affichés.",
    "Les derniers scores sont trop anciens. Actualisez pour les recharger.": "Les derniers scores sont trop anciens. Actualisez pour les recharger.",
    "Derniers scores connus": "Derniers scores connus",
    "Aucun match en direct actuellement.": "Aucun match en direct actuellement.",
    "Aucun match terminé récemment.": "Aucun match terminé récemment.",
    "Aucun match à venir dans les prochaines heures.": "Aucun match à venir dans les prochaines heures.",
    "Équipe domicile": "Équipe domicile",
    "Équipe extérieure": "Équipe extérieure",
    "Compétition": "Compétition",
    "Dernier score": "Dernier score",
    "À venir": "À venir",
    "flex items-center justify-between": "flex items-center justify-between",
    "Rugby": "Rugby",
    "Autres sports": "Autres sports",
    "Tous les pays": "Tous les pays",
    "Bénin": "Bénin",
    "Côte d’Ivoire": "Côte d’Ivoire",
    "Sénégal": "Sénégal",
    "Cameroun": "Cameroun",
    "Mali": "Mali",
    "France": "France",
    "Belgique": "Belgique",
    "Luxembourg": "Luxembourg",
    "Suisse": "Suisse",
    "Canada": "Canada",
    "Maroc": "Maroc",
    "Nigeria": "Nigeria",
    "Afrique du Sud": "Afrique du Sud",
    "Réponse vidéo invalide": "Réponse vidéo invalide",
    "Horaire à confirmer": "Horaire à confirmer",
    "Le programme vidéo ne peut pas être actualisé pour le moment. Les scores restent accessibles.": "Le programme vidéo ne peut pas être actualisé pour le moment. Les scores restent accessibles.",
    "L’actualisation des diffusions est temporairement limitée. Une nouvelle tentative est prévue.": "L’actualisation des diffusions est temporairement limitée. Une nouvelle tentative est prévue.",
    "Le programme vidéo est temporairement indisponible. Les scores restent accessibles.": "Le programme vidéo est temporairement indisponible. Les scores restent accessibles.",
    "La recherche de nouveaux directs reprendra automatiquement. Les diffusions déjà connues continuent d’être vérifiées.": "La recherche de nouveaux directs reprendra automatiquement. Les diffusions déjà connues continuent d’être vérifiées.",
    "Les diffusions ne peuvent pas être actualisées pour le moment. Les scores restent accessibles.": "Les diffusions ne peuvent pas être actualisées pour le moment. Les scores restent accessibles.",
    "Lecteur indisponible": "Lecteur indisponible",
    "Le lecteur met trop de temps à répondre": "Le lecteur met trop de temps à répondre",
    "Chargement du lecteur impossible": "Chargement du lecteur impossible",
    "Le lecteur ne répond pas. Tu peux consulter la diffusion sur YouTube.": "Le lecteur ne répond pas. Tu peux consulter la diffusion sur YouTube.",
    "Cette vidéo n’est pas disponible dans ce lecteur, selon les conditions du diffuseur ou ton pays.": "Cette vidéo n’est pas disponible dans ce lecteur, selon les conditions du diffuseur ou ton pays.",
    "Le lecteur n’a pas pu démarrer. Tu peux essayer directement sur YouTube.": "Le lecteur n’a pas pu démarrer. Tu peux essayer directement sur YouTube.",
    "Cette diffusion est terminée.": "Cette diffusion est terminée.",
    "Appuie sur le bouton Lecture du lecteur pour démarrer la vidéo.": "Appuie sur le bouton Lecture du lecteur pour démarrer la vidéo.",
    "Le lecteur ne peut pas être chargé. Tu peux consulter la diffusion sur YouTube.": "Le lecteur ne peut pas être chargé. Tu peux consulter la diffusion sur YouTube.",
    "Dernier score connu": "Dernier score connu",
    "Rencontre terminée": "Rencontre terminée",
    "Score suivi": "Score suivi",
    "Rencontre à venir": "Rencontre à venir",
    "La rubrique vidéo est en préparation. Les scores restent accessibles.": "La rubrique vidéo est en préparation. Les scores restent accessibles.",
    "La collecte suit son calendrier. Le programme s’actualisera automatiquement.": "La collecte suit son calendrier. Le programme s’actualisera automatiquement.",
    "Ajoute YOUTUBE_API_KEY dans les variables du backend et active YouTube Data API v3 dans le projet Google.": "Ajoute YOUTUBE_API_KEY dans les variables du backend et active YouTube Data API v3 dans le projet Google.",
    "Impossible de demander l’actualisation des diffusions.": "Impossible de demander l’actualisation des diffusions.",
    "La recherche automatique nécessite YOUTUBE_API_KEY dans le backend. Les chaînes FIFA et FIBA sont sélectionnées par défaut.": "La recherche automatique nécessite YOUTUBE_API_KEY dans le backend. Les chaînes FIFA et FIBA sont sélectionnées par défaut.",
    "Fermer le lecteur": "Fermer le lecteur",
    "Le score sélectionné s’affichera ici.": "Le score sélectionné s’affichera ici.",
    "Les scores disponibles apparaîtront dans cette liste dès leur chargement.": "Les scores disponibles apparaîtront dans cette liste dès leur chargement.",
    "Équipe, rencontre ou diffuseur…": "Équipe, rencontre ou diffuseur…",
    "Filtrer les diffusions par sport": "Filtrer les diffusions par sport",
    "Tous les sports": "Tous les sports",
    "Diffusion en cours selon le diffuseur": "Diffusion en cours selon le diffuseur",
    "Regarder le direct": "Regarder le direct",
    "Ouvrir le programme": "Ouvrir le programme",
    "Les diffusions vidéo sont en préparation": "Les diffusions vidéo sont en préparation",
    "Aucune diffusion ne correspond à ces filtres": "Aucune diffusion ne correspond à ces filtres",
    "Aucune diffusion intégrable disponible actuellement": "Aucune diffusion intégrable disponible actuellement",
    "Le programme est en cours de préparation. Il s’actualisera automatiquement.": "Le programme est en cours de préparation. Il s’actualisera automatiquement.",
    "Retrouve les scores ci-dessous et reviens consulter les prochaines diffusions proposées.": "Retrouve les scores ci-dessous et reviens consulter les prochaines diffusions proposées.",
    "Live & Scores": "Live & Scores",
    "Suivi en temps réel des matchs en cours et des résultats récents. Actualisation automatique toutes les 45 secondes.": "Suivi en temps réel des matchs en cours et des résultats récents. Actualisation automatique toutes les 45 secondes.",
    "Scores du {{v0}}": "Scores du {{v0}}",
    "Le fournisseur prépare les scores. La page se mettra à jour automatiquement.": "Le fournisseur prépare les scores. La page se mettra à jour automatiquement.",
    "Les scores sont temporairement indisponibles.": "Les scores sont temporairement indisponibles.",
    "Terminés{{v0}}": "Terminés{{v0}}",
    "À venir{{v0}}": "À venir{{v0}}",
    "Actualisé à {{v0}}": "Actualisé à {{v0}}",
    "Ouverture du lecteur…": "Ouverture du lecteur…",
    "Lecture via YouTube · {{v0}}": "Lecture via YouTube · {{v0}}",
    "Consulter sur YouTube": "Consulter sur YouTube",
    "Les scores se mettent à jour indépendamment de la vidéo.": "Les scores se mettent à jour indépendamment de la vidéo.",
    "À regarder sur WinPulse": "À regarder sur WinPulse",
    "Le match, sur ton écran.": "Le match, sur ton écran.",
    "Retrouve les directs intégrables des diffuseurs sélectionnés et suis les scores sur la même page.": "Retrouve les directs intégrables des diffuseurs sélectionnés et suis les scores sur la même page.",
    "Actualiser les diffusions": "Actualiser les diffusions",
    "Configuration vidéo · Administrateur": "Configuration vidéo · Administrateur",
    "La tâche vidéo n’est pas active. Vérifie les logs d’initialisation du backend.": "La tâche vidéo n’est pas active. Vérifie les logs d’initialisation du backend.",
    "État fournisseur : {{v0}}": "État fournisseur : {{v0}}",
    "Vérifier la collecte": "Vérifier la collecte",
    "Un score à suivre": "Un score à suivre",
    "Choisis la rencontre dont tu veux suivre le score pendant la vidéo.": "Choisis la rencontre dont tu veux suivre le score pendant la vidéo.",
    "Rencontre à suivre": "Rencontre à suivre",
    "Choisir une rencontre": "Choisir une rencontre",
    "Chaîne du diffuseur": "Chaîne du diffuseur",
    "Rechercher une diffusion{{v0}}": "Rechercher une diffusion{{v0}}",
    "Pays de visionnage{{v0}}": "Pays de visionnage{{v0}}",
    "Chargement du programme vidéo…": "Chargement du programme vidéo…",
    "Voir sur YouTube": "Voir sur YouTube",
    "Afficher toutes les diffusions": "Afficher toutes les diffusions",
    "Les vidéos sont lues via YouTube. Leur disponibilité dépend du pays et des conditions du diffuseur. Les directs disponibles ne couvrent pas nécessairement toutes les rencontres du tableau des scores.": "Les vidéos sont lues via YouTube. Leur disponibilité dépend du pays et des conditions du diffuseur. Les directs disponibles ne couvrent pas nécessairement toutes les rencontres du tableau des scores.",
    "{{v0}} recherches aujourd’hui · Sources : {{v1}} · Dernière vérification : {{v2}}.": "{{v0}} recherches aujourd’hui · Sources : {{v1}} · Dernière vérification : {{v2}}.",
    "Résultat en attente": "Résultat en attente",
    "La sélection décrit l’événement attendu dans le marché indiqué. Consulte les règles de règlement du bookmaker.": "La sélection décrit l’événement attendu dans le marché indiqué. Consulte les règles de règlement du bookmaker.",
    "Réponse Montante invalide": "Réponse Montante invalide",
    "Ta session a expiré. Reconnecte-toi pour retrouver la montante.": "Ta session a expiré. Reconnecte-toi pour retrouver la montante.",
    "Cette action est réservée à l’administrateur ou à ton niveau d’accès.": "Cette action est réservée à l’administrateur ou à ton niveau d’accès.",
    "Le chargement a pris trop de temps. Réessaie dans un instant.": "Le chargement a pris trop de temps. Réessaie dans un instant.",
    "Le service Montante est temporairement indisponible. Réessaie dans un instant.": "Le service Montante est temporairement indisponible. Réessaie dans un instant.",
    "Contrôle terminé. Les résultats finaux disponibles ont été pris en compte.": "Contrôle terminé. Les résultats finaux disponibles ont été pris en compte.",
    "La série est lancée. La sélection attendra deux matchs admissibles.": "La série est lancée. La sélection attendra deux matchs admissibles.",
    "Série terminée": "Série terminée",
    "Série arrêtée": "Série arrêtée",
    "Sélections publiées": "Sélections publiées",
    "Recherche de deux matchs": "Recherche de deux matchs",
    "Nouvelle série à venir": "Nouvelle série à venir",
    "Étape": "Étape",
    "Étapes gagnées": "Étapes gagnées",
    "Matchs publiés": "Matchs publiés",
    " Les dernières données chargées restent affichées.": " Les dernières données chargées restent affichées.",
    "Toutes les cotes comparées": "Toutes les cotes comparées",
    "Le classement n’ajoute aucun bonus aux petites cotes.": "Le classement n’ajoute aucun bonus aux petites cotes.",
    "Sources vérifiées": "Sources vérifiées",
    "Les nouvelles sélections exigent des cotes récentes et plusieurs sources complètes.": "Les nouvelles sélections exigent des cotes récentes et plusieurs sources complètes.",
    "Le droit d’attendre": "Le droit d’attendre",
    "Si deux matchs ne passent pas les contrôles, aucune étape n’est publiée.": "Si deux matchs ne passent pas les contrôles, aucune étape n’est publiée.",
    "Contrôle…": "Contrôle…",
    "Synchroniser les résultats": "Synchroniser les résultats",
    "La prochaine série apparaîtra ici dès son lancement par l’administrateur.": "La prochaine série apparaîtra ici dès son lancement par l’administrateur.",
    "Nouvelle montante à venir": "Nouvelle montante à venir",
    "Deux matchs suffisamment documentés ne sont pas encore disponibles.": "Deux matchs suffisamment documentés ne sont pas encore disponibles.",
    "Le sélecteur attend deux matchs": "Le sélecteur attend deux matchs",
    "Estimation du marché vérifié": "Estimation du marché vérifié",
    "MONTANTE WNPULSE": "MONTANTE WNPULSE",
    "2 matchs distincts par étape": "2 matchs distincts par étape",
    "Deux rencontres.{{v0}}{{v1}}": "Deux rencontres.{{v0}}{{v1}}",
    "Des choix expliqués.": "Des choix expliqués.",
    "Les sélections sont comparées selon les estimations et la qualité des données. Une petite cote ne suffit pas à faire un bon choix.": "Les sélections sont comparées selon les estimations et la qualité des données. Une petite cote ne suffit pas à faire un bon choix.",
    "Pilotage administrateur": "Pilotage administrateur",
    "Parcours {{v0}}": "Parcours {{v0}}",
    "10 étapes": "10 étapes",
    "15 étapes": "15 étapes",
    "Lancer une nouvelle série": "Lancer une nouvelle série",
    "La série actuelle sera archivée sur le serveur et remplacée.": "La série actuelle sera archivée sur le serveur et remplacée.",
    "{{v0}}Remplacer la série actuelle": "{{v0}}Remplacer la série actuelle",
    "Nouvelle série": "Nouvelle série",
    "Diagnostic de sélection": "Diagnostic de sélection",
    "{{v0}} matchs reçus · {{v1}} événements admissibles": "{{v0}} matchs reçus · {{v1}} événements admissibles",
    "Parcours de la série": "Parcours de la série",
    "{{v0}} étape{{v1}} gagnée{{v2}} sur {{v3}}": "{{v0}} étape{{v1}} gagnée{{v2}} sur {{v3}}",
    "Une étape annulée n’est pas une victoire. Les jours sans sélection ne font pas avancer le parcours.": "Une étape annulée n’est pas une victoire. Les jours sans sélection ne font pas avancer le parcours.",
    "Sélections · Étape {{v0}}": "Sélections · Étape {{v0}}",
    "Cote combinée : {{v0}}": "Cote combinée : {{v0}}",
    "Sélection publiée avant cette mise à jour : elle reste suivie jusqu’à son règlement. Les nouvelles étapes exigent deux matchs.": "Sélection publiée avant cette mise à jour : elle reste suivie jusqu’à son règlement. Les nouvelles étapes exigent deux matchs.",
    "Les mêmes sélections que les abonnés": "Les mêmes sélections que les abonnés",
    "Débloque les rencontres, les marchés et les raisons de chaque choix.": "Débloque les rencontres, les marchés et les raisons de chaque choix.",
    "Lire l’estimation de la paire": "Lire l’estimation de la paire",
    "Approximation théorique : {{v0}}, sous hypothèse d’indépendance.": "Approximation théorique : {{v0}}, sous hypothèse d’indépendance.",
    "Ce chiffre multiplie deux estimations du moteur. Il ne constitue pas un taux de réussite constaté. Des événements distincts peuvent encore être corrélés.": "Ce chiffre multiplie deux estimations du moteur. Il ne constitue pas un taux de réussite constaté. Des événements distincts peuvent encore être corrélés.",
    "Historique de la série": "Historique de la série",
    "Les victoires, pertes et annulations restent visibles.": "Les victoires, pertes et annulations restent visibles.",
    "Aucune étape réglée pour le moment.": "Aucune étape réglée pour le moment.",
    "Étape {{v0}}": "Étape {{v0}}",
    "{{v0}}{{v1}}{{v2}} · cote {{v3}}": "{{v0}}{{v1}}{{v2}} · cote {{v3}}",
    "{{v0}} sélections · détails réservés aux abonnés.": "{{v0}} sélections · détails réservés aux abonnés.",
    "Ce que la sélection permet de comprendre": "Ce que la sélection permet de comprendre",
    "Les petites cotes ne reçoivent aucun bonus. Le sélecteur compare la probabilité estimée, l’accord entre les sources et leur nombre. Ce score de classement n’est pas une probabilité.": "Les petites cotes ne reçoivent aucun bonus. Le sélecteur compare la probabilité estimée, l’accord entre les sources et leur nombre. Ce score de classement n’est pas une probabilité.",
    "Les deux matchs doivent être distincts, avec des équipes différentes, des marchés complets et des cotes récentes. Cette vérification ne supprime pas l’incertitude sportive.": "Les deux matchs doivent être distincts, avec des équipes différentes, des marchés complets et des cotes récentes. Cette vérification ne supprime pas l’incertitude sportive.",
    "Les probabilités viennent du moteur existant, souvent du consensus des cotes. L’efficacité de ce nouveau filtrage devra être mesurée sur des résultats futurs, pas uniquement sur les gagnants déjà connus.": "Les probabilités viennent du moteur existant, souvent du consensus des cotes. L’efficacité de ce nouveau filtrage devra être mesurée sur des résultats futurs, pas uniquement sur les gagnants déjà connus.",
    "Une seule sélection perdante arrête la série. Aucun pari ni aucune montante ne garantit un résultat.": "Une seule sélection perdante arrête la série. Aucun pari ni aucune montante ne garantit un résultat.",
    "RENCONTRE {{v0}}": "RENCONTRE {{v0}}",
    "Sélection réservée aux abonnés": "Sélection réservée aux abonnés",
    "Sources complètes": "Sources complètes",
    "Estimation issue du consensus des cotes, distincte d’une mesure de réussite réelle.": "Estimation issue du consensus des cotes, distincte d’une mesure de réussite réelle.",
    "Rencontre commencée : la sélection reste figée en attendant son résultat.": "Rencontre commencée : la sélection reste figée en attendant son résultat.",
    "Pourquoi cette sélection ?": "Pourquoi cette sélection ?",
    "Les critères détaillés n’ont pas été enregistrés pour cette ancienne sélection.": "Les critères détaillés n’ont pas été enregistrés pour cette ancienne sélection.",
    "Cotes vérifiées : {{v0}}. Elles peuvent évoluer.": "Cotes vérifiées : {{v0}}. Elles peuvent évoluer.",
    "Voir l’analyse du match": "Voir l’analyse du match",
    "« {{v0}} » porte sur le total de buts ou de points. Le seuil et la période du marché déterminent le résultat.": "« {{v0}} » porte sur le total de buts ou de points. Le seuil et la période du marché déterminent le résultat.",
    "Non renseignée": "Non renseignée",
    "Administrateur": "Administrateur",
    "Statistiques absentes": "Statistiques absentes",
    "Statistiques invalides": "Statistiques invalides",
    "Mon profil": "Mon profil",
    "Abonnement invalide": "Abonnement invalide",
    "Impossible de vérifier votre abonnement. Les informations affichées viennent de votre dernière connexion.": "Impossible de vérifier votre abonnement. Les informations affichées viennent de votre dernière connexion.",
    "Impossible de charger les résultats WinPulse. Réessayez dans un instant.": "Impossible de charger les résultats WinPulse. Réessayez dans un instant.",
    "Votre profil a été actualisé.": "Votre profil a été actualisé.",
    "Impossible d’actualiser votre profil.": "Impossible d’actualiser votre profil.",
    "Votre consentement aux messages WhatsApp a été retiré.": "Votre consentement aux messages WhatsApp a été retiré.",
    "Impossible de modifier votre choix WhatsApp.": "Impossible de modifier votre choix WhatsApp.",
    "Email non renseigné": "Email non renseigné",
    "Date d’expiration non renseignée.": "Date d’expiration non renseignée.",
    "Passer Pro": "Passer Pro",
    "Voir l’offre Pro": "Voir l’offre Pro",
    "Gérer mon abonnement": "Gérer mon abonnement",
    "Pronostics gratuits selon les disponibilités": "Pronostics gratuits selon les disponibilités",
    "Track Record public complet": "Track Record public complet",
    "Compte personnel WinPulse": "Compte personnel WinPulse",
    "Tous les pronostics et combinés": "Tous les pronostics et combinés",
    "Analyses IA complètes": "Analyses détaillées",
    "Combo Builder et value bets": "Combo Builder et value bets",
    "Résultats confirmés": "Résultats confirmés",
    "Remboursés": "Remboursés",
    "Non renseigné": "Non renseigné",
    "Membre depuis": "Membre depuis",
    "Vous avez autorisé WinPulse à vous contacter sur votre numéro WhatsApp. Vous pouvez retirer ce consentement à tout moment.": "Vous avez autorisé WinPulse à vous contacter sur votre numéro WhatsApp. Vous pouvez retirer ce consentement à tout moment.",
    "Vous n’avez pas de consentement actif pour les messages WhatsApp de WinPulse.": "Vous n’avez pas de consentement actif pour les messages WhatsApp de WinPulse.",
    "Autorisé": "Autorisé",
    "Non autorisé": "Non autorisé",
    "Mon espace WinPulse": "Mon espace WinPulse",
    "Résultats": "Résultats",
    "Résultats WinPulse": "Résultats WinPulse",
    "Mon compte": "Mon compte",
    "Votre accès actuel": "Votre accès actuel",
    "Vérification de votre abonnement…": "Vérification de votre abonnement…",
    "Les fonctionnalités Pro sont accessibles avec vos droits administrateur.": "Les fonctionnalités Pro sont accessibles avec vos droits administrateur.",
    "{{v0}} jour{{v1}} restant{{v2}}": "{{v0}} jour{{v1}} restant{{v2}}",
    "Votre ancien accès payant est arrivé à expiration.": "Votre ancien accès payant est arrivé à expiration.",
    "Votre ancien accès Elite reste reconnu. L’offre actuellement proposée est WinPulse Pro.": "Votre ancien accès Elite reste reconnu. L’offre actuellement proposée est WinPulse Pro.",
    "Découvrez les pronostics gratuits disponibles et les résultats publics.": "Découvrez les pronostics gratuits disponibles et les résultats publics.",
    "Consultez l’offre complète et les modalités de paiement sur la page Abonnement.": "Consultez l’offre complète et les modalités de paiement sur la page Abonnement.",
    "Les résultats publics de WinPulse": "Les résultats publics de WinPulse",
    "Ces chiffres concernent les pronostics de la plateforme, pas les paris de votre compte. Ils sont visibles en Gratuit comme en Pro pour vous permettre de consulter notre historique.": "Ces chiffres concernent les pronostics de la plateforme, pas les paris de votre compte. Ils sont visibles en Gratuit comme en Pro pour vous permettre de consulter notre historique.",
    "Bilan des résultats confirmés": "Bilan des résultats confirmés",
    "Cumul du Track Record, tous sports et tous niveaux.": "Cumul du Track Record, tous sports et tous niveaux.",
    "Aucun résultat confirmé pour le moment": "Aucun résultat confirmé pour le moment",
    "Le bilan se mettra à jour lorsque les pronostics seront résolus.": "Le bilan se mettra à jour lorsque les pronostics seront résolus.",
    "Taux de réussite WinPulse": "Taux de réussite WinPulse",
    "Gagnés ÷ (gagnés + perdus). Les remboursements et les pronostics en attente ne sont pas inclus.": "Gagnés ÷ (gagnés + perdus). Les remboursements et les pronostics en attente ne sont pas inclus.",
    "Et mes statistiques personnelles ?": "Et mes statistiques personnelles ?",
    "Elles nécessitent un historique des paris que vous avez réellement suivis. Aucun suivi personnel n’est relié à cette page actuellement : elle n’affiche donc pas de taux de réussite, de ROI ou de gains attribués à votre compte.": "Elles nécessitent un historique des paris que vous avez réellement suivis. Aucun suivi personnel n’est relié à cette page actuellement : elle n’affiche donc pas de taux de réussite, de ROI ou de gains attribués à votre compte.",
    "Consulter le Track Record complet": "Consulter le Track Record complet",
    "Mes informations": "Mes informations",
    "Ces informations correspondent aux données enregistrées sur votre compte.": "Ces informations correspondent aux données enregistrées sur votre compte.",
    "Messages WhatsApp": "Messages WhatsApp",
    "{{v0}}Retirer mon consentement": "{{v0}}Retirer mon consentement",
    "Voir les pronostics": "Voir les pronostics",
    "Voir les résultats publics": "Voir les résultats publics",
    "Actuel": "Actuel",
    "{{v0}} gagnés, {{v1}} perdus, {{v2}} remboursés": "{{v0}} gagnés, {{v1}} perdus, {{v2}} remboursés",
    "Non communiqué": "Non communiqué",
    "Sélections et cotes à vérifier avant le début des rencontres.": "Sélections et cotes à vérifier avant le début des rencontres.",
    "Le serveur met trop de temps à répondre. Tu peux réessayer.": "Le serveur met trop de temps à répondre. Tu peux réessayer.",
    "Deux issues sont couvertes : celles indiquées par la sélection. Vérifie la période à laquelle le marché s’applique.": "Deux issues sont couvertes : celles indiquées par la sélection. Vérifie la période à laquelle le marché s’applique.",
    "Le pari concerne le fait que les deux équipes marquent, ou non, pendant la période couverte par le marché.": "Le pari concerne le fait que les deux équipes marquent, ou non, pendant la période couverte par le marché.",
    "Le résultat est évalué après application du handicap indiqué. La ligne et la période du marché déterminent le règlement.": "Le résultat est évalué après application du handicap indiqué. La ligne et la période du marché déterminent le règlement.",
    "Le pari porte sur le total indiqué. Les règles de règlement dépendent de la ligne et de la période choisies.": "Le pari porte sur le total indiqué. Les règles de règlement dépendent de la ligne et de la période choisies.",
    "La sélection prévoit un match nul sur la période couverte par le marché.": "La sélection prévoit un match nul sur la période couverte par le marché.",
    "Le pronostic se lit avec son marché : consulte la fiche du match pour vérifier la période et les informations disponibles.": "Le pronostic se lit avec son marché : consulte la fiche du match pour vérifier la période et les informations disponibles.",
    "Indisponible": "Indisponible",
    "Pronostic réservé": "Pronostic réservé",
    "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.": "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.",
    "Le total doit dépasser {{v0}} sur la période couverte par ce marché.": "Le total doit dépasser {{v0}} sur la période couverte par ce marché.",
    "Le moteur retient {{v0}} comme vainqueur sur la période couverte par le marché.": "Le moteur retient {{v0}} comme vainqueur sur la période couverte par le marché.",
    "Cette sélection couvre deux issues du match : celles indiquées dans le pronostic. Elle ne désigne pas nécessairement un vainqueur unique.": "Cette sélection couvre deux issues du match : celles indiquées dans le pronostic. Elle ne désigne pas nécessairement un vainqueur unique.",
    "L’équipe indiquée doit gagner. Si la rencontre se termine sur un nul, la mise est remboursée selon les règles du marché.": "L’équipe indiquée doit gagner. Si la rencontre se termine sur un nul, la mise est remboursée selon les règles du marché.",
    "Le pronostic porte sur le fait que les deux équipes marquent ou non pendant la période indiquée par le marché.": "Le pronostic porte sur le fait que les deux équipes marquent ou non pendant la période indiquée par le marché.",
    "Le résultat est évalué après application du handicap indiqué dans la sélection. La période et les règles de règlement du bookmaker sont à vérifier.": "Le résultat est évalué après application du handicap indiqué dans la sélection. La période et les règles de règlement du bookmaker sont à vérifier.",
    "La sélection prévoit un match nul pendant la période indiquée par le marché.": "La sélection prévoit un match nul pendant la période indiquée par le marché.",
    "La double chance couvre deux issues de la rencontre. Les deux issues couvertes sont celles indiquées dans la sélection.": "La double chance couvre deux issues de la rencontre. Les deux issues couvertes sont celles indiquées dans la sélection.",
    "La sélection vise la victoire de l’équipe indiquée. Si la rencontre se termine sur un match nul, la mise est remboursée selon les règles du marché.": "La sélection vise la victoire de l’équipe indiquée. Si la rencontre se termine sur un match nul, la mise est remboursée selon les règles du marché.",
    "Ce marché porte sur le fait que les deux équipes marquent ou non pendant la période indiquée. Il ne désigne pas le vainqueur du match.": "Ce marché porte sur le fait que les deux équipes marquent ou non pendant la période indiquée. Il ne désigne pas le vainqueur du match.",
    "Le résultat est évalué après application du handicap indiqué dans la sélection. Vérifie aussi la période concernée et les règles de règlement du bookmaker.": "Le résultat est évalué après application du handicap indiqué dans la sélection. Vérifie aussi la période concernée et les règles de règlement du bookmaker.",
    "Ce marché porte sur le total de buts ou de points, pour les équipes et la période indiquées dans la sélection.": "Ce marché porte sur le total de buts ou de points, pour les équipes et la période indiquées dans la sélection.",
    "Le pronostic porte sur un match nul pendant la période indiquée par le marché.": "Le pronostic porte sur un match nul pendant la période indiquée par le marché.",
    "Annulé": "Annulé",
    "La sélection prévoit un match nul dans la période couverte.": "La sélection prévoit un match nul dans la période couverte.",
    "Le résultat se juge après application du handicap indiqué pour l’équipe sélectionnée.": "Le résultat se juge après application du handicap indiqué pour l’équipe sélectionnée.",
    "La sélection prévoit la victoire de {{v0}}, selon les règles de ce marché.": "La sélection prévoit la victoire de {{v0}}, selon les règles de ce marché.",
    "Jackpot": "Jackpot",
    "ring-2 ring-rose-500/40": "ring-2 ring-rose-500/40",
    "PRO": "PRO",
    "vs": "vs",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "KOUKPAKI VIANEY": "KOUKPAKI VIANEY",
    "WinPulse Pro": "WinPulse Pro",
    "pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-8": "pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-8",
    "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8": "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8",
    "calc(4rem + env(safe-area-inset-bottom))": "calc(4rem + env(safe-area-inset-bottom))",
    "FCFA{{v0}}": "FCFA{{v0}}",
    "{{v0}} FCFA": "{{v0}} FCFA",
    "Gemini": "Gemini",
    "Claude": "Claude",
    "edge": "edge",
    "{{v0}} vs {{v1}}": "{{v0}} vs {{v1}}",
    "chez {{bookmaker}}": "chez {{bookmaker}}",
    "Vainqueur (1X2)": "Vainqueur (1X2)",
    "Total buts/points": "Total buts/points",
    "Total de buts": "Total de buts",
    "Cartons": "Cartons",
    "Corners": "Corners",
    "Mi-temps": "Mi-temps",
    "Match nul": "Match nul",
    "Plus de {{line}} buts": "Plus de {{line}} buts",
    "Moins de {{line}} buts": "Moins de {{line}} buts",
    "Plus de {{line}} points": "Plus de {{line}} points",
    "Moins de {{line}} points": "Moins de {{line}} points",
    "Plus de {{line}} corners": "Plus de {{line}} corners",
    "Moins de {{line}} corners": "Moins de {{line}} corners",
    "Plus de {{line}} cartons": "Plus de {{line}} cartons",
    "Moins de {{line}} cartons": "Moins de {{line}} cartons",
    "TERMINÉ": "TERMINÉ",
    "EN DIRECT": "EN DIRECT",
    "Pick verrouillé": "Pick verrouillé",
    "Passe Pro pour voir l’analyse": "Passe Pro pour voir l’analyse",
    "Avantage estimé : {{edge}}": "Avantage estimé : {{edge}}",
    "Analyse en cours…": "Analyse en cours…",
    "Autres marchés analysés": "Autres marchés analysés",
    "Partager WhatsApp (Admin)": "Partager WhatsApp (Admin)",
    "Pronostic à risque réduit": "Pronostic à risque réduit",
    "Pronostic à risque modéré": "Pronostic à risque modéré",
    "Pronostic risqué": "Pronostic risqué",
    "Victoire de {{team}}": "Victoire de {{team}}",
    "Plus de {{line}}": "Plus de {{line}}",
    "Moins de {{line}}": "Moins de {{line}}",
    "Oui": "Oui",
    "Non": "Non",
    "Les deux équipes marquent : Oui": "Les deux équipes marquent : Oui",
    "Les deux équipes marquent : Non": "Les deux équipes marquent : Non"
  },
  "en": {
    "Choisir la langue": "Choose language",
    "Langue de l’interface": "Interface language",
    "Dashboard": "Dashboard",
    "Live": "Live",
    "Aujourd'hui": "Today",
    "À la une": "Highlights",
    "Combinés": "Accumulators",
    "Combo Builder": "Combo Builder",
    "Value bets": "Value bets",
    "Montante": "Progression",
    "Track record": "Track record",
    "Profil": "Profile",
    "Parrainage": "Referrals",
    "Abonnement": "Subscription",
    "Admin": "Admin",
    "New": "New",
    "10J": "10d",
    "Free": "Free",
    "Ton pouls de gagnant": "Stay ahead of the game",
    "Connecté": "Signed in",
    "Déconnexion": "Sign out",
    "Plus d'options": "More options",
    "Fermer": "Close",
    "Plus": "More",
    "Tableau": "Home",
    "Direct": "Live",
    "Jour": "Day",
    "Créer": "Build",
    "Blog": "Blog",
    "Mentions légales": "Legal notice",
    "CGV": "Terms of sale",
    "Confidentialité": "Privacy",
    "Jeu responsable · 18+": "Responsible gambling · 18+",
    "© 2026 WinPulse · Dublin, Irlande": "© 2026 WinPulse · Dublin, Ireland",
    "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.": "This account was signed in on another device or browser. This session has ended.",
    "Ta session a expiré. Reconnecte-toi pour continuer.": "Your session has expired. Sign in again to continue.",
    "EN COURS": "IN PROGRESS",
    "ÉCHOUÉE": "FAILED",
    "TERMINÉE": "COMPLETED",
    "AUCUNE": "NONE",
    "Aucune montante active.": "No active progression.",
    "Impossible de charger la montante.": "Unable to load the progression.",
    "Impossible d'actualiser la montante.": "Unable to refresh the progression.",
    "Le capital initial doit être un nombre positif.": "The starting amount must be a positive number.",
    "La montante doit durer 10 ou 15 jours.": "The progression must last 10 or 15 days.",
    "Impossible de démarrer la montante.": "Unable to start the progression.",
    "Montante WinPulse": "WinPulse progression",
    "10 → 15 jours": "10 → 15 days",
    "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.": "The engine selects existing predictions that meet its criteria. A winning day advances the series; a losing day ends it. If no selection qualifies, the module waits.",
    "Actualiser": "Refresh",
    "Montante indisponible": "Progression unavailable",
    "Contrôle administrateur": "Admin controls",
    "Montante 10 jours": "10-day progression",
    "Montante 15 jours": "15-day progression",
    "Capital initial": "Starting amount",
    "Démarrer": "Start",
    "Recommencer": "Restart",
    "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.": "Only administrators can start or restart the series, to prevent users from resetting it.",
    "Chargement de la montante…": "Loading progression…",
    "Aucune montante active": "No active progression",
    "L'administrateur doit lancer une montante de 10 ou 15 jours.": "An administrator must start a 10- or 15-day progression.",
    "progression": "progress",
    "mise de départ": "starting stake",
    "Capital théorique": "Theoretical amount",
    "si les journées passent": "if each day succeeds",
    "Progression": "Progress",
    "de la série": "of the series",
    "Progression de la série": "Series progress",
    "Jour {{day}} sur {{total}}": "Day {{day}} of {{total}}",
    "Pronostics du jour": "Today's predictions",
    "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.": "Selections depend on the criteria and available data. No fixed odds range is guaranteed.",
    "Pick {{number}}": "Pick {{number}}",
    "Confiance": "Confidence",
    "Début :": "Starts:",
    "En attente d'un pick qualifié": "Waiting for a qualifying pick",
    "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.": "The module never forces a prediction that does not meet its criteria.",
    "Historique": "History",
    "Aucune journée terminée.": "No completed days yet.",
    "GAGNÉ": "WON",
    "REMBOURSÉ": "VOID",
    "PERDU": "LOST",
    "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.": "No sports bet is guaranteed. The progression limits the number of selections but does not eliminate risk. 18+ · Responsible gambling.",
    "Chargement…": "Loading…",
    "Analyses sportives": "Sports analysis",
    "Historique des résultats": "Results history",
    "Articles": "Articles",
    "Ouvrir l'app": "Open the app",
    "Connexion": "Sign in",
    "S'inscrire": "Sign up",
    "Démarrer gratuit": "Start for free",
    "Pronostics · Analyses · Résultats publics": "Predictions · Analysis · Public results",
    "Vise la victoire avec nos pronostics.": "Aim for victory with our predictions.",
    "Garde une longueur d’avance.": "Stay one step ahead.",
    "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.": "Discover today's predictions and match analysis. Start for free, then upgrade to Pro to explore subscriber picks and accumulators.",
    "Découvrir les pronostics": "Explore predictions",
    "Découvrir l’offre Pro": "Explore Pro",
    "Consulter l’historique complet": "View the full history",
    "Inscription sans carte": "No card needed to sign up",
    "Résultats publics": "Public results",
    "Compte gratuit": "Free account",
    "Pronostics disponibles": "Available predictions",
    "Chargement des analyses…": "Loading analysis…",
    "Les analyses ne sont pas disponibles pour le moment.": "Analysis is currently unavailable.",
    "Réessayer": "Try again",
    "Les analyses du jour arrivent prochainement.": "Today's analysis is coming soon.",
    "Consulte l’historique de résultats en attendant les prochaines sélections.": "Browse the results history while waiting for the next picks.",
    "Analyse réservée Pro": "Pro-only analysis",
    "Indice : {{value}} %": "Indicator: {{value}}%",
    "Les indices d’analyse ne garantissent aucun résultat.": "Analysis indicators do not guarantee any outcome.",
    "Ouvrir l’application": "Open the app",
    "Créer mon compte gratuit": "Create my free account",
    "Historique des pronostics": "Prediction history",
    "Les résultats d’hier": "Yesterday's results",
    "Matchs du {{date}}.": "Matches on {{date}}.",
    "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.": "A selection of yesterday's winning picks from our track record, ordered by highest odds.",
    "Voir tous les résultats": "View all results",
    "Chargement des résultats d’hier…": "Loading yesterday's results…",
    "Le bilan d’hier n’est pas disponible pour le moment.": "Yesterday's summary is currently unavailable.",
    "Tu peux consulter l’historique complet des résultats.": "You can browse the full results history.",
    "Gagnants": "Won",
    "Perdants": "Lost",
    "En attente": "Pending",
    "Annulés / remboursés": "Void / refunded",
    "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.": "Total predictions: {{count}}. The cards below show only a selection of winners.",
    "Aucun pronostic publié pour les matchs de cette journée.": "No predictions were published for this day's matches.",
    "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.": "No winning prediction has been confirmed for this day. The summary remains visible above.",
    "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.": "Details of the winning predictions are not available here yet. Browse the full history.",
    "Gagné": "Won",
    "Cote publiée": "Published odds",
    "Score final": "Final score",
    "Pronostic publié avant le match · résultat confirmé.": "Prediction published before the match · confirmed result.",
    "Les résultats passés ne garantissent pas les prochains résultats.": "Past results do not guarantee future outcomes.",
    "COMMENT UTILISER WINPULSE": "HOW TO USE WINPULSE",
    "Une analyse pro, claire et immédiate": "Clear, accessible sports analysis",
    "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.": "Read the analysis, check the results and stay in control of your decisions.",
    "Explications de match": "Match explanations",
    "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.": "Understand picks using available data, with a local explanation or AI assistance when configured.",
    "Scoring rigoureux": "Analysis indicators",
    "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.": "Use available indicators to compare picks. An indicator is not a guarantee of success.",
    "Combinés par profil": "Accumulators by profile",
    "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.": "Compare available selections and risk levels. No accumulator is risk-free.",
    "Track record transparent": "Transparent track record",
    "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.": "Public history, ROI, win rate and average odds. Both winning and losing picks are included.",
    "Value bets détectés": "Value bet detection",
    "Compare les estimations et les cotes proposées. Les estimations restent incertaines.": "Compare estimates with the odds on offer. Estimates remain uncertain.",
    "Découverte gratuite": "Free access to explore",
    "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.": "Create an account without paying. Then check the Pro offer in your account.",
    "Retrouve ton code et les conditions du programme dans ton compte.": "Find your code and the programme terms in your account.",
    "Voir mon code": "View my code",
    "ABONNEMENT": "SUBSCRIPTION",
    "Choisis ton accès": "Choose your access",
    "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.": "Explore WinPulse for free. Upgrade to Pro for subscriber predictions, accumulators and tools.",
    "Pour découvrir": "To explore",
    "Sélections gratuites disponibles": "Available free picks",
    "Tous les matchs (cotes visibles)": "All matches with visible odds",
    "Track record public": "Public track record",
    "pour 30 jours": "for 30 days",
    "Accès complet": "Full access",
    "Tous les pronostics débloqués": "All predictions unlocked",
    "Tous les combinés du jour": "All daily accumulators",
    "Explications des pronostics": "Prediction explanations",
    "Value bets et Combo Builder": "Value bets and Combo Builder",
    "Montante premium": "Premium progression",
    "Support WhatsApp prioritaire": "Priority WhatsApp support",
    "Passer à Pro": "Upgrade to Pro",
    "© 2026 WinPulse · Joue responsable · 18+": "© 2026 WinPulse · Play responsibly · 18+",
    "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.": "Predictions are statistical analyses, not guarantees. Only stake what you can afford to lose. WinPulse does not accept bets or place them for users.",
    "Renseigne ton nom.": "Enter your name.",
    "Ton numéro WhatsApp est obligatoire pour créer ton compte.": "Your WhatsApp number is required to create an account.",
    "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.": "Enter your number with + and the country code, for example +2250700000000.",
    "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.": "The registration form needs an update. Refresh the page and try again.",
    "L’inscription n’a pas abouti. Réessaie dans un instant.": "Registration was unsuccessful. Try again shortly.",
    "Analyse les matchs. Vérifie les résultats. Décide toi-même.": "Analyse matches. Check results. Make your own decisions.",
    "Commence gratuitement, sans carte bancaire.": "Start for free, without a bank card.",
    "Historique public des résultats": "Public results history",
    "Aucun paiement pour créer le compte": "No payment to create an account",
    "Invitation détectée": "Invitation detected",
    "WinPulse · 18+ · Joue responsable": "WinPulse · 18+ · Play responsibly",
    "100 % gratuit": "100% free",
    "Ton accès gratuit est presque prêt": "Your free access is almost ready",
    "Crée ton compte pour découvrir WinPulse.": "Create your account to explore WinPulse.",
    "Gratuit": "Free",
    "0 FCFA": "0 FCFA",
    "Sans CB": "No card",
    "Aucun paiement": "No payment",
    "Libre": "Your choice",
    "Sans engagement": "No commitment",
    "Nom": "Name",
    "Ton nom complet": "Your full name",
    "Email": "Email",
    "vous@email.com": "you@email.com",
    "Numéro WhatsApp": "WhatsApp number",
    "(obligatoire)": "(required)",
    "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.": "Include + and your country code: +33 France, +353 Ireland, +225 Côte d’Ivoire, +229 Benin, +223 Mali.",
    "Mot de passe": "Password",
    "10 caractères minimum": "At least 10 characters",
    "J’ai un code parrainage": "I have a referral code",
    "Code parrainage": "Referral code",
    "(optionnel)": "(optional)",
    "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.": "I agree to receive WinPulse offers and invitations to its private groups or communities on WhatsApp, through manual or automated messages. This permission is optional and is not required to create my account. I can withdraw it from my profile.",
    "Création du compte…": "Creating account…",
    "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.": "No payment is required at registration. WinPulse provides statistical analysis and does not guarantee winnings.",
    "Politique de confidentialité": "Privacy policy",
    "Déjà inscrit ?": "Already registered?",
    "Se connecter": "Sign in",
    "18+ · Joue responsable": "18+ · Play responsibly",
    "Bienvenue !": "Welcome!",
    "Erreur {{status}}": "Error {{status}}",
    "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.": "No response from the server. Check your internet connection and try again.",
    "Erreur inconnue": "Unknown error",
    "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.": "Find your predictions, analysis and available results in your account. No outcome is guaranteed.",
    "© 2026 WinPulse · 18+ · Joue responsable": "© 2026 WinPulse · 18+ · Play responsibly",
    "Accède à tes pronostics du jour": "Access today's predictions",
    "Mot de passe oublié ?": "Forgot your password?",
    "Connexion en cours…": "Signing in…",
    "Pas encore de compte ?": "Don't have an account yet?",
    "Créer un compte gratuit": "Create a free account",
    "Cache de connexion effacé. Réessaye maintenant.": "Sign-in cache cleared. Try again now.",
    "Le navigateur bloque l’accès au stockage local.": "The browser is blocking local storage access.",
    "Problème de connexion ? Effacer le cache de connexion": "Trouble signing in? Clear the sign-in cache",
    "Email ou mot de passe incorrect": "Incorrect email or password",
    "Email deja utilise": "Email already in use",
    "Le numéro WhatsApp est obligatoire pour créer un compte": "A WhatsApp number is required to create an account",
    "Le mot de passe doit contenir au moins 10 caractères": "The password must contain at least 10 characters",
    "Choisis un mot de passe moins courant": "Choose a less common password",
    "Choisis un mot de passe moins répétitif": "Choose a less repetitive password",
    "Le mot de passe ne doit pas contenir ton adresse email": "The password must not contain your email address",
    "Trop de tentatives. Réessaie plus tard.": "Too many attempts. Try again later.",
    "Actualisation en cours…": "Refreshing…",
    "Football": "Football",
    "Basketball": "Basketball",
    "Tennis": "Tennis",
    "en attente": "Pending",
    "Sport": "Sport",
    "En direct{{v0}}": "LIVE{{v0}}",
    "Terminé": "FINISHED",
    "{{v0}} en direct": "{{v0}} LIVE",
    "Hockey": "Hockey",
    "Tous les marchés": "All markets",
    "Vainqueur": "Winner",
    "Mon ticket WNPulse": "Mon ticket WNPulse",
    "Les deux équipes marquent": "Both teams to score",
    "Effacer la recherche": "Clear search",
    "WNPULSE · COMBO BUILDER": "WNPULSE · COMBO BUILDER",
    "Aujourd’hui": "Today",
    "Cote {{v0}}": "Odds {{v0}}",
    "Réinitialiser les filtres": "Reset filters",
    "WhatsApp": "WhatsApp",
    "Confiance {{v0}}": "Confidence {{v0}}",
    "Clipboard unavailable": "Clipboard unavailable",
    "Cote": "Odds",
    "Confiance du moteur": "Engine confidence",
    "WNPULSE · LES COMBINÉS": "WNPULSE · LES COMBINÉS",
    "Tous": "All",
    "🏆 Victoire": "🏆 Winner",
    "Double chance": "Double chance",
    "🔄 Double chance": "🔄 Double chance",
    "Handicap": "Handicap",
    "⚖️ Handicap": "⚖️ Handicap",
    "🟢 SÛR": "🟢 LOWER RISK",
    "🟡 MODÉRÉ": "🟡 MODERATE",
    "🔴 RISQUÉ": "🔴 HIGHER RISK",
    "LIVE": "LIVE",
    "Passe Pro pour débloquer": "Upgrade to Pro to unlock",
    "Pronostic": "Prediction",
    "Partager sur WhatsApp": "Share on WhatsApp",
    "Gagnés": "Won",
    "Perdus": "Lost",
    "Perdu": "LOST",
    "Marché": "Market",
    "Découvrir Pro": "Explore Pro",
    "{{v0}} gagnés": "{{v0}} Won",
    "{{v0}} perdus": "{{v0}} Lost",
    "📈 Over 2.5": "📈 Over 2.5",
    "🎯 BTTS": "🎯 Both teams score",
    "⚽ Over/Under": "⚽ Over/Under",
    "over 2": "over 2",
    "les deux": "both",
    "WhatsApp ouvert": "WhatsApp opened",
    "Partager sur WhatsApp (Admin)": "Share on WhatsApp (Admin)",
    "Sélection éditoriale automatique": "Automated editorial selection",
    "À la une — Top picks du jour": "Highlights — Today's top picks",
    "Les pronostics avec la plus haute confiance, tous sports confondus.{{v0}}": "Highest-confidence predictions across all sports.{{v0}}",
    "{{v0}} picks analysés": "{{v0}} picks analysed",
    "1 pick visible · {{v0}} verrouillés": "1 visible pick · {{v0}} locked",
    "Passe Pro pour voir tous les picks et les 3 combinés du jour.": "Upgrade to Pro for all available picks and daily combos.",
    "Débloquer": "Unlock",
    "Aucun pick pour ce marché.": "No picks for this market.",
    "Voir tous les picks": "View all picks",
    "Pronostic verrouillé": "Locked prediction",
    "Marché : {{v0}}": "Market: {{v0}}",
    "Confiance IA : {{v0}}%": "Engine confidence: {{v0}}%",
    "Un seul prix. Tout WinPulse. Sans compromis.": "One price. All of WinPulse.",
    "Accès illimité à tous les pronostics, tous les jours, sur 7 sports": "Unlimited access to available predictions across 7 sports",
    "Tous les combinés (Sûr, Booster, Extra, Jackpot) débloqués": "Unlock all available combo profiles",
    "Chaque match analysé sur tous ses marchés": "All available markets analysed for each match",
    "Combo Builder et détecteur de value bets": "Combo Builder and value-bet detector",
    "Analyse IA experte sur chaque match": "Detailed prediction explanations",
    "Montante WinPulse avec picks débloqués": "WinPulse Montante with unlocked picks",
    "Track Record public et vérifiable": "Public, verifiable track record",
    "Support prioritaire par WhatsApp": "Priority WhatsApp support",
    "Offre en ligne momentanément indisponible. Le plan WinPulse reste affiché.": "Online offer temporarily unavailable. The WinPulse plan remains visible.",
    "Indique le nom utilisé pour le paiement.": "Enter the name used for payment.",
    "Indique le numéro MTN Mobile Money utilisé.": "Enter the MTN Mobile Money number used.",
    "Le plan d'abonnement n'est pas disponible.": "The subscription plan is unavailable.",
    "La référence de suivi n'a pas été générée.": "The tracking reference was not generated.",
    "Lien de paiement FedaPay invalide.": "Invalid FedaPay payment link.",
    "Le lien de paiement doit utiliser HTTPS.": "The payment link must use HTTPS.",
    "Impossible de générer la référence de paiement.": "Unable to generate a payment reference.",
    "Référence copiée": "Reference copied",
    "Bonjour WinPulse !": "Hello WinPulse!",
    "Merci de vérifier mon paiement et d'activer mon accès.": "Please verify my payment and activate my access.",
    "Paiement sécurisé via FedaPay · choisis ton moyen de paiement sur la page FedaPay · annulable à tout moment": "Secure payment via FedaPay · choose your method on FedaPay · cancel at any time",
    "Paiement sécurisé · MTN Mobile Money disponible en solution de secours · annulable à tout moment": "Secure payment · MTN Mobile Money available as a backup · cancel at any time",
    "Plan actuel": "Current plan",
    "Paiement WinPulse": "WinPulse payment",
    "Informations de paiement": "Payment information",
    "Détails du paiement": "Payment details",
    "Nom et prénom": "Full name",
    "Téléphone (facultatif)": "Phone (optional)",
    "Numéro MTN Mobile Money": "MTN Mobile Money number",
    "Ex. +229 01 97 00 00 00": "E.g. +229 01 97 00 00 00",
    "Ex. 01 97 00 00 00": "E.g. 01 97 00 00 00",
    "Copier la référence": "Copy reference",
    "Ouverture du paiement…": "Opening payment…",
    "Préparation du paiement…": "Preparing payment…",
    "Un seul accès. Tout WinPulse.": "One access. All of WinPulse.",
    "Plan actif :{{v0}}{{v1}}": "Active plan:{{v0}}{{v1}}",
    "Débloquer WinPulse Pro": "Unlock WinPulse Pro",
    "Sans engagement · résiliable à tout moment · support WhatsApp inclus": "No commitment · cancel at any time · WhatsApp support included",
    "Aucun plan disponible pour le moment.": "No plan available right now.",
    "{{v0}} FCFA / mois": "{{v0}} FCFA / month",
    "Débloquer Pro": "Unlock Pro",
    "WinPulse Pro · {{v0}} FCFA / mois": "WinPulse Pro · {{v0}} FCFA / month",
    "Montant de l'abonnement": "Subscription amount",
    "30 jours · WinPulse Pro": "30 days · WinPulse Pro",
    "{{v0}} Après validation, tu seras redirigé vers la page de paiement.": "{{v0}} After confirmation, you will go to the payment page.",
    "Paiement sécurisé par FedaPay.": "Secure payment by FedaPay.",
    "Email du compte": "Account email",
    "Nom utilisé pour le paiement": "Name used for payment",
    "Référence de suivi": "Tracking reference",
    "Procédure MTN Mobile Money": "MTN Mobile Money instructions",
    "1. Compose {{v0}} ou ouvre l'application MTN MoMo.": "1. Dial {{v0}} or open the MTN MoMo app.",
    "2. Envoie {{v0}} au {{v1}}.": "2. Send {{v0}} to {{v1}}.",
    "3. Vérifie le destinataire : {{v0}}.": "3. Verify the recipient: {{v0}}.",
    "4. Garde le SMS de confirmation puis contacte WinPulse sur WhatsApp.": "4. Keep the confirmation SMS, then contact WinPulse on WhatsApp.",
    "Envoyer la confirmation sur WhatsApp": "Send confirmation on WhatsApp",
    "Référence : {{v0}}": "Reference: {{v0}}",
    "Je viens d'effectuer le paiement pour activer mon plan {{v0}}.": "I have paid to activate my {{v0}} plan.",
    "Montant : {{v0}} FCFA": "Amount: {{v0}} FCFA",
    "Numéro MTN MoMo utilisé : {{v0}}": "MTN MoMo number used: {{v0}}",
    "Nom : {{v0}}": "Name: {{v0}}",
    "Email : {{v0}}": "Email: {{v0}}",
    "Débloquer {{v0}}": "Unlock {{v0}}",
    "Payer {{v0}} FCFA": "Pay {{v0}} FCFA",
    "Continuer — {{v0}} FCFA": "Continue — {{v0}} FCFA",
    "Impossible de charger le parrainage": "Unable to load referrals",
    "Lien copié — partage-le maintenant !": "Link copied — share it now!",
    "Récompense activée !": "Reward activated!",
    "Réclamation impossible": "Unable to claim reward",
    "Copie ton lien ou ton code unique.": "Copy your unique link or code.",
    "Partage-le sur WhatsApp, en 1 clic.": "Share it on WhatsApp in one click.",
    "Découvre WinPulse — IA pronostics sportifs": "Discover WinPulse — sports predictions",
    "70%+ de réussite": "Verifiable results",
    "Track record public, vérifiable à tout moment.": "Public track record, available to verify anytime.",
    "Communauté active": "Active community",
    "Picks décortiqués, analyses IA, combinés du jour.": "Explained picks, analyses and daily combos.",
    "1 mois, paiement MTN. Pas de carte, pas de piège.": "One month, MTN payment. No card required.",
    "Programme parrainage": "Referral programme",
    "Invite 3 amis,{{v0}}reçois {{v1}}": "Invite 3 friends,{{v0}}receive {{v1}}",
    "7 jours Pro offerts": "7 free Pro days",
    "Partage ton lien WhatsApp en 1 clic. Dès que {{v0}} créent leur compte, ton accès Pro s'active automatiquement — vraiment gratuit.": "Share your WhatsApp link. When {{v0}} register, your free Pro access activates automatically.",
    "3 amis": "3 friends",
    "Ton code": "Your code",
    "Ta progression": "Your progress",
    "{{v0}} / {{v1}} amis inscrits": "{{v0}} / {{v1}} friends registered",
    "🎉 Bravo ! Tu peux réclamer ta récompense.": "🎉 Well done! Claim your reward.",
    "Récompense déjà réclamée. Merci d'avoir parrainé tes amis !": "Reward already claimed. Thanks for inviting your friends!",
    "Encore {{v0}} ami{{v1}} à inviter pour débloquer ta semaine Pro.": "Friends still needed to unlock your Pro week: {{v0}}.",
    "Comment ça marche": "How it works",
    "Partager maintenant": "Share now",
    "Envoyer par email": "Send by email",
    "Pourquoi ils vont kiffer": "Why they'll like it",
    "Code {{v0}} copié": "Code {{v0}} copied",
    "Dès que 3 amis créent leur compte avec ton code, {{v0}} jours Pro s'activent.": "When 3 friends register with your code, {{v0}} Pro days activate.",
    "Cette rencontre n’est plus disponible dans les matchs actuels.": "This match is no longer available in the current listings.",
    "La rencontre ne peut pas être chargée pour le moment. Réessaie depuis le dashboard.": "Unable to load this match. Try again from the dashboard.",
    "Le serveur réserve cette analyse à Pro. L’explication du pronostic reste disponible ci-dessus.": "This analysis is Pro-only. The prediction explanation remains available above.",
    "L’explication complémentaire est indisponible pour le moment. Les informations du pronostic restent affichées.": "Extra explanation is unavailable. Prediction details remain visible.",
    "Match introuvable.": "Match not found.",
    "Bookmakers": "Bookmakers",
    "Écart estimé": "Estimated gap",
    " points": " points",
    "Estimation du moteur": "Engine estimate",
    "Cote optimale": "Best odds",
    "H2H (10 derniers)": "H2H (last 10)",
    "Forme récente": "Recent form",
    "xG moyens": "Average xG",
    "Absences clés": "Key absences",
    "Cartons arbitre": "Referee cards",
    "Conditions": "Conditions",
    "Forme et historique H2H réels (football-data.org) quand disponibles. Autres champs : analyse basée sur le consensus des cotes bookmakers.": "Real form and H2H from football-data.org when available. Other fields use bookmaker odds consensus.",
    "Analyse basée uniquement sur le consensus des cotes bookmakers agrégées — aucune statistique externe fabriquée.": "Based only on aggregated bookmaker odds consensus; no invented external statistics.",
    "Enrichir l’explication": "Expand explanation",
    "Source non précisée par le service": "Source not specified by the service",
    "Moteur statistique": "Statistical engine",
    "Retour au dashboard": "Back to dashboard",
    "Retour": "Back",
    "VS": "VS",
    "Passe Pro pour voir le pick complet": "Upgrade to Pro to view the full pick",
    "Inclut la cote optimale, le score de confiance, l'edge value et l'analyse IA experte.": "Includes best odds, confidence, estimated edge and detailed analysis.",
    "Pronostic principal": "Main prediction",
    "Bookmakers utilisés :": "Bookmakers used:",
    "Partager": "Share",
    "Comprendre ce pronostic": "Understand this prediction",
    "Le moteur compare les marchés et les cotes disponibles pour classer les sélections. L’estimation affichée est un indicateur calculé ; elle ne garantit pas le résultat du match.": "The engine compares markets and odds to rank picks. Its estimate is a calculated indicator, not a guaranteed match result.",
    "Nombre de bookmakers annoncé pour cette analyse : {{v0}}. Cote de la sélection : {{v1}}.": "Bookmakers reported: {{v0}}. Pick odds: {{v1}}.",
    "Des statistiques externes sont disponibles pour compléter cette analyse. Leur détail figure plus bas.": "External statistics are available below to supplement this analysis.",
    "Les informations disponibles ne permettent pas ici d’ajouter une analyse vérifiée de la forme des équipes ou des absences.": "Available data does not support verified analysis of team form or absences here.",
    "Tous les marchés analysés": "All analysed markets",
    "· {{v0}} books": "· {{v0}} bookmakers",
    "· edge +{{v0}}%": "· edge +{{v0}}%",
    "Analyse détaillée": "Detailed analysis",
    "Données du moteur": "Engine data",
    "Aucune statistique externe vérifiée disponible pour ce match — le moteur s'appuie uniquement sur le consensus des cotes bookmakers, sans donnée inventée.": "No verified external statistics for this match. The engine uses only bookmaker odds consensus, without invented data.",
    "Explication complémentaire": "Additional explanation",
    "Demande une présentation complémentaire des éléments disponibles. Selon la configuration du service, le texte peut être rédigé avec l’aide d’une IA ou par le moteur statistique.{{v0}}": "Request an explanation of available data. Depending on configuration, the text is written with AI assistance or by the statistical engine.{{v0}}",
    "Certaines analyses complémentaires sont réservées à Pro. {{v0}}.": "Some additional analyses require Pro. {{v0}}.",
    "Verdict": "Verdict",
    "Facteurs clés": "Key factors",
    "Alternative :": "Alternative:",
    "Source : {{v0}}": "Source: {{v0}}",
    "Cotes par bookmaker": "Odds by bookmaker",
    "Bookmaker": "Bookmaker",
    "Données réelles (football-data.org) — forme récente et historique des confrontations directes, disponibles pour les grandes compétitions européennes suivies.": "Real football-data.org data: form and recent H2H for covered major European competitions.",
    "{{v0}} derniers matchs (réel)": "Last {{v0}} matches (real data)",
    "{{v0}} {{v1}} V": "{{v0}} {{v1}} W",
    "{{v0}} {{v1}} N": "{{v0}} {{v1}} D",
    "{{v0}} {{v1}} D": "{{v0}} {{v1}} L",
    "Forme récente non disponible": "Recent form unavailable",
    "📅 Confrontations directes (historique réel)": "📅 Head-to-head (real history)",
    "Nuls": "Draws",
    "Bilan agrégé des confrontations directes récentes. Détail match par match non disponible sur la source actuelle.": "Aggregate recent H2H summary. Match-by-match details are unavailable from this source.",
    "La sélection « {{v0}} » porte sur le total de buts ou de points pour les équipes et la période indiquées par le marché. Elle ne dépend pas uniquement du vainqueur de la rencontre.": "“{{v0}}” concerns total goals or points for the teams and market period, not just the match winner.",
    "La sélection prévoit la victoire de {{v0}}, selon la période et les règles du marché.": "The pick predicts a win for {{v0}} under the market period and rules.",
    "La sélection « {{v0}} » décrit l’événement attendu dans le marché indiqué. Vérifie la période et les règles de règlement du bookmaker.": "“{{v0}}” describes the expected market outcome. Check the period and bookmaker settlement rules.",
    "Rédaction assistée par IA ({{v0}})": "AI-assisted writing ({{v0}})",
    "supérieur": "over",
    "inférieur": "under",
    "l’équipe indiquée": "the named team",
    "La sélection indique l’événement attendu. Vérifie le marché, la période du match et les règles de règlement avant de l’utiliser.": "Check the stated outcome, market, period and settlement rules before using the pick.",
    "Invalid value bets response": "Invalid value-bet response",
    "Écart non communiqué": "Gap not provided",
    "Cela signale une opportunité possible si l’estimation est fiable.": "A possible opportunity, if the estimate is reliable.",
    "Ces chiffres ne montrent pas d’avantage positif à cette cote.": "These figures show no positive edge at these odds.",
    "Ta session a expiré. Reconnecte-toi pour consulter les sélections.": "Your session expired. Sign in to view picks.",
    "Les sélections ne peuvent pas être chargées pour le moment. Réessaie dans quelques instants.": "Picks could not be loaded. Try again shortly.",
    "Chargement des sélections": "Loading picks",
    "ne sont": "are not",
    "Aucune sélection à venir disponible pour le moment.": "No upcoming picks available right now.",
    "Aucune sélection disponible pour cette date.": "No picks available for this date.",
    "Reviens plus tard ou actualise les données.": "Return later or refresh the data.",
    "Essaie toutes les dates à venir.": "Try all upcoming dates.",
    "Date et heure à confirmer": "Date and time to confirm",
    "Estimation WinPulse": "WinPulse estimate",
    "Probabilité implicite de la cote": "Implied probability from odds",
    "WinPulse affiche une estimation de {{v0}}. La cote de {{v1}} correspond à {{v2}} en probabilité implicite : l’écart est de {{v3}}. {{v4}}": "WinPulse estimates {{v0}}. Odds of {{v1}} imply {{v2}}; the gap is {{v3}}. {{v4}}",
    "Il manque une cote ou une probabilité valide pour expliquer l’écart de cette sélection.": "Valid odds or probability are missing to explain this gap.",
    "L’écart de probabilité n’est pas un pourcentage de gain. Les cotes évoluent et l’estimation peut être erronée. Pour un marché avec remboursement, la probabilité implicite ne décrit pas à elle seule toutes les issues de règlement.": "Probability gap is not a profit percentage. Odds change and estimates may be wrong. Refund markets have additional settlement outcomes not described by implied probability alone.",
    "Détecteur de value bets": "Value-bet detector",
    "Des opportunités à examiner": "Opportunities to examine",
    "Retrouve la rencontre, son horaire, le marché conseillé et les chiffres qui expliquent chaque sélection.": "See each match, time, suggested market and the figures behind the pick.",
    "Une {{v0}} est une sélection dont la probabilité estimée dépasse le seuil implicite de la cote. L’écart, appelé {{v1}}, est exprimé ici en {{v2}}. Il dépend de la fiabilité de l’estimation.": "A {{v0}} has an estimated probability above the odds' implied threshold. The gap, or {{v1}}, is shown in {{v2}} and depends on estimate reliability.",
    "value bet": "value bet",
    "points de probabilité": "probability points",
    "Voir un exemple de calcul": "View a calculation example",
    "Exemple hypothétique, pour un pari sans remboursement : à cote 2,00, le seuil implicite est 50 %. Si la probabilité réelle était 60 %, l’écart serait de 10 points et le rendement moyen théorique serait de 20 % (0,60 × 2 − 1). Cela ne garantit aucun gain et suppose une estimation correcte.": "Hypothetical no-refund bet: odds 2.00 imply 50%. If the true probability were 60%, the gap would be 10 points and theoretical average return 20% (0.60 × 2 − 1). No guaranteed gain; the estimate must be correct.",
    "Les value bets sont réservés à Pro": "Value bets are Pro-only",
    "Accède aux rencontres, dates, marchés et explications des sélections avec ton abonnement Pro.": "Pro includes matches, dates, markets and pick explanations.",
    "Créer mon compte": "Create my account",
    "Se reconnecter": "Sign in again",
    "{{v0}} sélection{{v1}} affichée{{v2}}": "Picks shown: {{v0}}",
    "Horaires dans ton fuseau : {{v0}}.": "Times in your timezone: {{v0}}.",
    "Toutes les dates à venir": "All upcoming dates",
    "Tri{{v0}}": "Sort{{v0}}",
    "Écart estimé décroissant": "Highest estimated gap",
    "Date et heure": "Date and time",
    "{{v0}} sélection{{v1}} dont le match a déjà commencé {{v2}} plus proposée{{v3}} ici.": "Picks removed because their match has started: {{v0}}.",
    "Voir toutes les dates": "View all dates",
    "Les estimations ne garantissent aucun résultat. Vérifie les cotes et les règles du marché avant utilisation. 18+.": "Estimates guarantee no outcome. Check odds and market rules before use. 18+.",
    "La sélection porte sur un total {{v0}} à {{v1}} pour les buts ou points et la période indiqués dans le marché. Le vainqueur peut être différent de l’équipe favorite.": "The pick concerns a total {{v0}} {{v1}} for the stated goals/points and period. The winner may differ from the favourite.",
    "Le pronostic porte sur la victoire de {{v0}}, selon la période et les règles du marché.": "The pick predicts a win for {{v0}} under the market period and rules.",
    "{{v0}}{{v1}} points": "{{v0}}{{v1}} points",
    "Foot US": "American football",
    "Autres": "Other",
    "Buts / points": "Goals / points",
    "Autres marchés": "Other markets",
    "Horaire non communiqué": "Time not provided",
    "International": "International",
    "Espagne": "Spain",
    "Allemagne": "Germany",
    "Italie": "Italy",
    "Angleterre": "England",
    "Pologne": "Poland",
    "Finlande": "Finland",
    "Japon": "Japan",
    "Chine": "China",
    "Portugal": "Portugal",
    "Brésil": "Brazil",
    "Argentine": "Argentina",
    "Deux issues sont couvertes : celles indiquées dans la sélection, sur la période du marché.": "This selection covers the two stated outcomes during the market period.",
    "Le marché porte sur le fait que les deux équipes marquent, ou non, pendant la période indiquée.": "This market concerns whether both teams score during the stated period.",
    "Le résultat est évalué après application du handicap affiché. La ligne et la période du marché déterminent son règlement.": "Settlement uses the stated handicap, line and market period. Check the bookmaker's rules.",
    "Le pari porte sur le total indiqué. Vérifie les règles de la ligne et de la période choisies.": "This bet concerns the stated total. Check the line, period and settlement rules.",
    "La sélection prévoit un match nul sur la période couverte.": "The selection predicts a draw during the covered period.",
    "Lis cette sélection avec son marché et sa période. La fiche du match présente les informations disponibles.": "Read the pick with its market and period. The match page shows available information.",
    "Marché réservé": "Reserved market",
    "Marché non communiqué": "Market not provided",
    "Compétition non communiquée": "Competition not provided",
    "Rencontre commencée ou horaire à vérifier": "Match started or time needs checking",
    "Sélection à vérifier : elle n’est plus proposée avec une cote disponible": "Check this selection: it no longer has an available price",
    "heure locale du navigateur": "browser local time",
    " · Marché estimé, cote à confirmer": " · Estimated market, confirm odds",
    "Confiance moyenne non disponible": "Average confidence unavailable",
    "Sélections et cotes à vérifier avant les rencontres.": "Check selections and odds before the matches.",
    "Ticket enregistré": "Saved ticket",
    "Domicile": "Home",
    "Nul": "Draw",
    "Extérieur": "Away",
    "Plus de 2,5 buts": "Over 2.5 goals",
    "Plus de 1,5 but": "Over 1.5 goals",
    "Domicile : aucun but encaissé": "Home clean sheet",
    "Extérieur : aucun but encaissé": "Away clean sheet",
    "Ta session a expiré. Reconnecte-toi.": "Your session expired. Sign in again.",
    "Cette fonction est réservée aux abonnés. Vérifie ton accès.": "Subscribers only. Check your access.",
    "Les actualisations sont temporairement limitées. Réessaie dans quelques instants.": "Updates are temporarily limited. Try again shortly.",
    "Le serveur met trop de temps à répondre. Réessaie.": "The server timed out. Try again.",
    "Impossible de charger les tickets enregistrés.": "Unable to load saved tickets.",
    "Ton accès n’a pas pu être actualisé. L’enregistrement sera disponible après vérification.": "Access could not be refreshed. Saving will be available after verification.",
    "Impossible d’actualiser les rencontres. La dernière liste chargée reste disponible.": "Unable to refresh matches. The last loaded list remains visible.",
    "Cette sélection n’est pas disponible avec une cote et un horaire utilisables. Actualise le catalogue.": "This pick lacks usable odds or time. Refresh the catalogue.",
    "Actualise le catalogue pour vérifier ton accès aux repères.": "Refresh the catalogue to verify access to market indicators.",
    "Les repères de marché ne sont pas disponibles. Réessaie.": "Market indicators are unavailable. Try again.",
    "Actualise le catalogue pour vérifier ton accès à l’enregistrement.": "Refresh the catalogue to verify your saving access.",
    "Actualise les rencontres et vérifie les sélections signalées avant d’enregistrer.": "Refresh matches and check flagged picks before saving.",
    "Ce ticket est déjà enregistré.": "This ticket is already saved.",
    "Ticket enregistré dans tes combinés.": "Ticket saved to your combos.",
    "L’enregistrement n’a pas été confirmé. Vérifie la liste des tickets avant de réessayer.": "Saving was not confirmed. Check your tickets before retrying.",
    "Ticket copié.": "Ticket copied.",
    "Sélectionne le texte ci-dessous pour le copier.": "Select the text below to copy it.",
    "Ce ticket est long. Copie le texte ci-dessous pour le partager sans couper les sélections.": "This ticket is long. Copy the text below to share every pick.",
    "Ticket supprimé.": "Ticket deleted.",
    "La suppression n’a pas été confirmée. Actualise la liste.": "Deletion was not confirmed. Refresh the list.",
    "Rechercher et filtrer les rencontres": "Search and filter matches",
    "Équipe, championnat ou pays…": "Team, league or country…",
    "Choisir un sport": "Choose a sport",
    "Chargement du programme…": "Loading schedule…",
    "Aucune rencontre pour ces filtres": "No matches for these filters",
    "Aucune rencontre disponible actuellement": "No matches available right now",
    "Essaie une autre équipe ou élargis les filtres.": "Try another team or broaden the filters.",
    "Actualise plus tard pour retrouver les prochains marchés proposés.": "Refresh later to see upcoming markets.",
    "Ton ticket et tes sauvegardes": "Your ticket and saved picks",
    "Une sélection par rencontre": "One pick per match",
    "Replier le ticket": "Collapse ticket",
    "Ouvrir mon ticket": "Open my ticket",
    "Non disponible": "Unavailable",
    "Mon combiné du week-end": "My weekend combo",
    "Enregistrer le ticket": "Save ticket",
    "Actualiser les tickets enregistrés": "Refresh saved tickets",
    "Équipe à confirmer": "Team to be confirmed",
    "Sélection non communiquée": "Pick not provided",
    "Prudent": "Cautious",
    "Modéré": "Moderate",
    "Risqué": "Higher risk",
    "Replier": "Collapse",
    "Voir les marchés": "View markets",
    "non fournie": "unavailable",
    "Retirer": "Remove",
    "Ajouter": "Add",
    "Des marchés de cette rencontre sont réservés aux abonnés.": "Some markets for this match are subscriber-only.",
    "Aucune option avec une cote et un horaire disponibles.": "No options with usable odds and time.",
    "Sélection réservée": "Reserved pick",
    "Réservée": "Reserved",
    "Ton combiné.{{v0}}{{v1}}": "Your combo.{{v0}}{{v1}}",
    "Tes choix.": "Your choices.",
    "Explore les rencontres, compare les marchés et réunis tes sélections dans un ticket qui se lit en un coup d’œil.": "Explore matches, compare markets and build an easy-to-read ticket.",
    "Horaires : {{v0}}{{v1}}": "Times: {{v0}}{{v1}}",
    "rencontres au catalogue": "matches in the catalogue",
    "options sélectionnables": "selectable options",
    "Reconnecte-toi pour continuer": "Sign in again to continue",
    "Ta session a expiré. Les sélections de la session précédente ont été retirées.": "Your session expired. Picks from the previous session were removed.",
    "Quelle rencontre cherches-tu ?": "Which match are you looking for?",
    "Date{{v0}}": "Date{{v0}}",
    "Toutes les dates": "All dates",
    "Demain": "Tomorrow",
    "Classer par{{v0}}": "Sort by{{v0}}",
    "Horaire": "Time",
    "01 · Compose ton ticket": "01 · Build your ticket",
    "Les rencontres à explorer": "Matches to explore",
    "{{v0}} sélection{{v1}}{{v2}}": "Picks: {{v0}}{{v2}}",
    "Voir le ticket": "View ticket",
    "Le catalogue n’a pas été vérifié depuis plus de cinq minutes. Actualise avant d’ajouter ou de partager une sélection.": "The catalogue is over five minutes old. Refresh before adding or sharing a pick.",
    "Certaines données incomplètes n’ont pas pu être affichées.": "Some incomplete data could not be displayed.",
    "Chargement des rencontres": "Loading matches",
    "Les options disponibles apparaîtront ici.": "Available options will appear here.",
    "{{v0}} sur {{v1}} rencontres affichées": "{{v0}} of {{v1}} matches shown",
    "Afficher les rencontres suivantes": "Show more matches",
    "02 · Ton ticket": "02 · Your ticket",
    "Mon combiné": "My combo",
    "Ton ticket commence ici": "Your ticket starts here",
    "Ajoute une option sur une rencontre. Tu peux remplacer ton choix sans ajouter deux paris sur le même match.": "Add a pick to a match. You can replace it, with one pick per match.",
    "Cote cumulée": "Combined odds",
    "Produit des cotes des sélections du ticket.": "Product of the selected odds.",
    "Confiance moyenne du moteur": "Average engine confidence",
    "Sports représentés": "Sports represented",
    "La confiance moyenne ne représente pas la probabilité que le combiné passe.": "Average confidence is not the chance that the whole combo wins.",
    "contre": "versus",
    "{{v0}} · Cote {{v1}}": "{{v0}} · Odds {{v1}}",
    "Marché estimé · cote à confirmer": "Estimated market · confirm odds",
    "Cote actualisée : {{v0}} → {{v1}}": "Updated odds: {{v0}} → {{v1}}",
    "Vider le ticket": "Clear ticket",
    "Nom du ticket {{v0}}{{v1}}": "Ticket name {{v0}}{{v1}}",
    "(facultatif)": "(optional)",
    "Actualise le catalogue et retire ou remplace les sélections signalées pour enregistrer ou partager le ticket.": "Refresh and replace or remove flagged picks before saving or sharing.",
    "Enregistrer avec Pro": "Save with Pro",
    "Vérifier mon accès": "Check my access",
    "Copier": "Copy",
    "Les options avec un cadenas demandent un abonnement. L’enregistrement des tickets est réservé aux abonnés.": "Locked markets require a subscription. Saving tickets is subscriber-only.",
    "Voir les formules": "View plans",
    "Texte du ticket": "Ticket text",
    "Mes tickets enregistrés": "My saved tickets",
    "Historique de tes tickets": "Your ticket history",
    "Ton accès est en cours de vérification.": "Your access is being verified.",
    "Retrouve tes tickets enregistrés avec un abonnement.": "Access your saved tickets with a subscription.",
    "Chargement des sauvegardes…": "Loading saved tickets…",
    "Aucun ticket enregistré pour le moment.": "No saved tickets yet.",
    "Cote {{v0}} · {{v1}} sélection{{v2}}": "Odds {{v0}} · Picks: {{v1}}",
    "{{v0}} contre {{v1}}": "{{v0}} versus {{v1}}",
    "Le détail de ce ticket n’est pas disponible.": "Ticket details are unavailable.",
    "Ticket archivé : les horaires et cotes ne sont pas actualisés ici.": "Archived ticket: times and odds are not refreshed here.",
    "{{v0}} option{{v1}} sélectionnable{{v2}} · {{v3}} proposée{{v4}}": "Available options: {{v0}} · Offered: {{v3}}",
    "Choix proposé · {{v0}}": "Suggested pick · {{v0}}",
    "Une autre option de cette rencontre est dans ton ticket.": "Another option for this match is already in your ticket.",
    "Un seul choix par rencontre : ajouter une autre option remplace la précédente.": "One pick per match: adding a different option replaces the previous one.",
    "Comprendre ce marché": "Understand this market",
    "Afficher plus de marchés ({{v0}})": "Show more markets ({{v0}})",
    "Débloquer les marchés réservés": "Unlock reserved markets",
    "Repères de marché": "Market indicators",
    "Les repères supplémentaires demandent un accès abonné vérifié. {{v0}}": "Extra indicators require verified subscriber access. {{v0}}",
    "Chargement des repères…": "Loading indicators…",
    "Estimations de marché disponibles pour cette rencontre. Les données insuffisantes ne sont pas affichées.": "Market estimates for this match. Insufficient data is not shown.",
    "Les repères ne sont pas renseignés pour cette rencontre.": "No indicators provided for this match.",
    "Ouvrir la fiche de la rencontre": "Open match details",
    "Le total doit rester inférieur à {{v0}} sur la période couverte.": "The total must stay below {{v0}} during the covered period.",
    "Le total doit dépasser {{v0}} sur la période couverte.": "The total must exceed {{v0}} during the covered period.",
    "Le moteur retient {{v0}} comme vainqueur sur la période couverte.": "The engine selects {{v0}} to win during the covered period.",
    "Horaires : {{v0}}": "Times: {{v0}}",
    "{{v0}}. {{v1}} vs {{v2}}\n{{v3}}{{v4}}\n{{v5}}\n{{v6}} : {{v7}}\nCote : {{v8}}{{v9}}": "{{v0}}. {{v1}} vs {{v2}}\n{{v3}}{{v4}}\n{{v5}}\n{{v6}} : {{v7}}\nOdds: {{v8}}{{v9}}",
    "Cote cumulée : {{v0}}": "Combined odds: {{v0}}",
    "Confiance moyenne du moteur : {{v0}} % (indicateur, pas un taux de réussite)": "Average engine confidence: {{v0}}% (indicator, not a measured win rate)",
    " · Chargé à {{v0}}": " · Loaded at {{v0}}",
    "{{v0}} rencontre{{v1}} correspond{{v2}} à tes filtres": "Matches matching your filters: {{v0}}",
    "{{v0}} sélection{{v1}} · Cote {{v2}}": "Picks: {{v0}} · Odds {{v2}}",
    "Retirer {{v0}} contre {{v1}}": "Remove {{v0}} versus {{v1}}",
    "Supprimer le ticket {{v0}}": "Delete ticket {{v0}}",
    "Filtrer les marchés de {{v0}}": "Filter markets for {{v0}}",
    "Sécurité": "Cautious",
    "Le profil prudent, à examiner sélection par sélection.": "A cautious profile to assess pick by pick.",
    "Équilibre": "Balanced",
    "Un profil intermédiaire pour comparer les cotes et la confiance.": "A balanced profile to compare odds and confidence.",
    "Le profil offensif : une cote élevée implique davantage d’incertitude.": "An aggressive profile: higher odds mean greater uncertainty.",
    "Cote totale non communiquée": "Combined odds not provided",
    "Les données reçues sont incomplètes. Réessaie pour obtenir une sélection valide.": "Incomplete response. Try again for a valid selection.",
    "Impossible d’actualiser les combinés pour le moment. Réessaie dans quelques instants.": "Unable to refresh combos. Try again shortly.",
    "Le choix porte sur une victoire. En cas de nul sur la période couverte, le règlement de ce marché prévoit le remboursement.": "The named team must win. A draw in the covered period is refunded under this market's rules.",
    "Rencontre terminée · actualise le combiné": "Match finished · refresh combo",
    "Rencontre commencée · actualise le combiné": "Match started · refresh combo",
    "Équipe non communiquée": "Team not provided",
    "Pronostic sélectionné": "Selected prediction",
    "Non communiquée": "Not provided",
    "Aucun score de confiance n’a été communiqué pour cette sélection.": "No confidence score was provided for this pick.",
    "heure locale": "local time",
    "Combiné copié.": "Combo copied.",
    "La copie automatique est indisponible. Sélectionne le texte ci-dessous.": "Automatic copying is unavailable. Select the text below.",
    "Dernier chargement": "Last loaded",
    "Actualisé": "Updated",
    "Choisis un profil pour explorer ses sélections": "Choose a profile to explore its picks",
    "Actualiser les combinés": "Refresh combos",
    "Profil à découvrir": "Profile to explore",
    "Cote non fournie": "Odds not provided",
    "Accès Pro": "Pro access",
    "Sélections": "Picks",
    "Cote totale": "Combined odds",
    "Confiance moyenne": "Average confidence",
    "Probabilité combinée estimée": "Estimated combined probability",
    "Chargement des combinés": "Loading combos",
    "Une rencontre a déjà commencé ou s’est terminée. Actualise pour vérifier les sélections disponibles.": "A match has started or finished. Refresh to check available picks.",
    "Cette sélection n’a pas été actualisée depuis plus de cinq minutes. Actualise avant de la copier.": "This selection is over five minutes old. Refresh before copying.",
    "Le programme du combiné": "Combo schedule",
    "Les sélections, une par une": "Picks, one by one",
    "Présentation des rencontres": "Match display",
    "Récapitulatif du combiné": "Combo summary",
    "Disponible avec les sélections complètes.": "Available with complete picks.",
    "Actualise le combiné avant de copier ses sélections.": "Refresh the combo before copying picks.",
    "La copie est disponible avec au moins deux sélections complètes, dont les horaires sont à venir.": "Copying requires at least two complete picks for upcoming matches.",
    "Fermer le texte à copier": "Close copy text",
    "À confirmer": "To confirm",
    "Ce que signifie ce pronostic": "What this prediction means",
    "Consulter la rencontre": "View match",
    "Le pronostic est réservé aux abonnés": "This pick is subscriber-only",
    "Débloque la sélection, son marché et sa cote.": "Unlock the pick, market and odds.",
    "Voir les abonnements": "View subscriptions",
    "Lis le match.{{v0}}{{v1}}": "Read the match.{{v0}}{{v1}}",
    "Choisis ton combiné.": "Choose your combo.",
    "Trois profils. Chaque rencontre expliquée. Toutes les sélections réunies dans un ticket clair.": "Three profiles, explained matches and all picks in one clear ticket.",
    "{{v0}} à {{v1}}": "{{v0}} at {{v1}}",
    "Profil sélectionné": "Selected profile",
    "01 · Choisis ton profil": "01 · Choose your profile",
    "Quel combiné veux-tu explorer ?": "Which combo would you like to explore?",
    "Comparer les trois profils": "Compare all three profiles",
    "Explorer ce profil": "Explore this profile",
    "Les indicateurs proviennent du moteur. La confiance moyenne et la probabilité combinée décrivent deux choses différentes.": "These are engine indicators. Average confidence and combined probability measure different things.",
    "La dernière sélection chargée reste affichée.": "The last loaded selection remains visible.",
    "Préparation des sélections": "Preparing picks",
    "Vérification de ton accès et chargement des rencontres…": "Checking access and loading matches…",
    "Ta session doit être renouvelée": "Please renew your session",
    "Reconnecte-toi pour retrouver l’accès correspondant à ton compte.": "Sign in again to restore your account access.",
    "Les sélections complètes": "Complete picks",
    "Explore les trois profils avec Pro.": "Explore all three profiles with Pro.",
    "Ton accès actuel ne permet pas de consulter ces combinés. Retrouve les rencontres, les marchés et les cotes en découvrant les abonnements disponibles.": "Your access does not include these combos. View subscriptions for full matches, markets and odds.",
    "Découvrir les abonnements": "Explore subscriptions",
    "Les combinés n’ont pas pu être chargés": "Combos could not be loaded",
    "Utilise le bouton Réessayer ci-dessus pour relancer la vérification.": "Use Retry above to check again.",
    "Un combiné gratuit à découvrir": "Explore a free combo",
    "Le profil {{v0}} est accessible avec ton compte.": "Profile {{v0}} is available with your account.",
    "Voir le combiné": "View combo",
    "Aucune sélection pour ce profil": "No picks for this profile",
    "Le moteur n’a pas fourni de combiné {{v0}} pour le moment. Consulte un autre profil ou actualise plus tard.": "No {{v0}} combo is available yet. Try another profile or refresh later.",
    "02 · Parcours les rencontres": "02 · Browse the matches",
    "{{v0}} sélection{{v1}} · Profil {{v2}}": "Picks: {{v0}} · Profile {{v2}}",
    "Première rencontre : {{v0}}": "First match: {{v0}}",
    "Fiches": "Cards",
    "Horaires": "Schedule",
    "Cote totale du moteur{{v0}}": "Engine combined odds{{v0}}",
    "03 · Ton ticket": "03 · Your ticket",
    "Combiné {{v0}}": "Combo {{v0}}",
    "{{v0}} sélection{{v1}} réunies": "Picks included: {{v0}}",
    "Cote totale du moteur": "Engine combined odds",
    "Copier le ticket": "Copy ticket",
    "Débloquer le combiné": "Unlock combo",
    "Appuie dans le texte pour le sélectionner.": "Tap the text to select it.",
    "Bien lire le combiné": "Understanding the combo",
    "La confiance moyenne décrit les sélections individuellement. Elle ne correspond pas à la probabilité que tout le combiné passe.": "Average confidence describes individual picks, not the chance of the whole combo winning.",
    "La probabilité combinée est une estimation du moteur, liée à ses hypothèses sur les matchs. Elle ne constitue pas un taux de réussite mesuré.": "Combined probability is a model estimate based on match assumptions, not a measured win rate.",
    "Un combiné dépend de chacune de ses sélections. Le profil « Sécurité » reste soumis à cette incertitude.": "Every leg matters. The cautious profile still involves uncertainty.",
    "Vérification des sélections et de ton accès…": "Checking picks and access…",
    "WNPulse · Combiné {{v0}}": "WNPulse · Combo {{v0}}",
    "{{v0}}. {{v1}} vs {{v2}}": "{{v0}}. {{v1}} vs {{v2}}",
    "Cote : {{v0}}": "Odds: {{v0}}",
    "Cote totale du moteur : {{v0}}": "Engine combined odds: {{v0}}",
    "{{v0}} sélection{{v1}} dans ce ticket": "Picks in this ticket: {{v0}}",
    "{{v0}} sélection{{v1}}": "Picks: {{v0}}",
    "{{v0}} / mois": "{{v0}} / month",
    "{{v0}} remboursés": "{{v0}} refunded",
    "🎯 *Pick WinPulse*\n{{v0}} · {{v1}}\n\n*{{v2}}* vs *{{v3}}*\n👉 {{v4}} @ *{{v5}}*\nConfiance IA : {{v6}}%\nMarché : {{v7}}\n\nhttps://wnpulse.com": "🎯 *Pick WinPulse*\n{{v0}} · {{v1}}\n\n*{{v2}}* vs *{{v3}}*\n👉 {{v4}} @ *{{v5}}*\nEngine confidence: {{v6}}%\nMarket: {{v7}}\n\nhttps://wnpulse.com",
    "Le texte libre fourni par le serveur reste affiché dans sa langue d’origine.": "Free-form server text is shown in its original language.",
    "/mois": "/month",
    "Le service de scores n’est pas configuré. Contactez l’équipe WinPulse.": "Scores are not configured. Contact WinPulse.",
    "Le fournisseur refuse l’accès aux scores. L’équipe WinPulse doit vérifier sa configuration.": "The score provider denied access. WinPulse must check its configuration.",
    "Le quota du fournisseur de scores est épuisé. L’équipe WinPulse doit rétablir le service.": "The score provider's quota is exhausted. WinPulse must restore access.",
    "Le fournisseur limite les demandes. Une nouvelle tentative sera effectuée automatiquement.": "The provider is limiting requests. We will retry automatically.",
    "Le fournisseur de scores met trop de temps à répondre. Nouvelle tentative automatique à venir.": "The score provider timed out. We will retry automatically.",
    "Le service de scores est temporairement indisponible. Nouvelle tentative automatique à venir.": "Scores are temporarily unavailable. We will retry automatically.",
    "Les scores de ces compétitions ne sont pas disponibles auprès du fournisseur.": "The provider does not cover these competitions.",
    "Votre session a expiré ou l’accès est refusé. Reconnectez-vous pour réessayer.": "Your session expired or access was denied. Sign in again.",
    "Le service de scores n’est pas disponible sur cette version du serveur.": "This server version does not provide scores.",
    "Le serveur met trop de temps à répondre. Nouvelle tentative automatique à venir.": "The server timed out. We will retry automatically.",
    "Les scores ne peuvent pas être actualisés pour le moment. Nouvelle tentative automatique à venir.": "Scores cannot refresh right now. We will retry automatically.",
    "La préparation des scores prend plus de temps que prévu. Une nouvelle tentative sera effectuée automatiquement.": "Preparing scores is taking longer than expected. We will retry automatically.",
    "Réponse des scores invalide": "Invalid score response",
    "Certaines compétitions ne sont pas disponibles. Les scores reçus restent affichés.": "Some competitions are unavailable. Received scores remain visible.",
    "Les derniers scores sont trop anciens. Actualisez pour les recharger.": "These scores are too old. Refresh to reload them.",
    "Derniers scores connus": "Last known scores",
    "Aucun match en direct actuellement.": "No live matches right now.",
    "Aucun match terminé récemment.": "No recently finished matches.",
    "Aucun match à venir dans les prochaines heures.": "No upcoming matches in the next few hours.",
    "Équipe domicile": "Home team",
    "Équipe extérieure": "Away team",
    "Compétition": "Competition",
    "Dernier score": "Latest score",
    "À venir": "Upcoming",
    "flex items-center justify-between": "flex items-center justify-between",
    "Rugby": "Rugby",
    "Autres sports": "Other sports",
    "Tous les pays": "All countries",
    "Bénin": "Benin",
    "Côte d’Ivoire": "Côte d’Ivoire",
    "Sénégal": "Senegal",
    "Cameroun": "Cameroon",
    "Mali": "Mali",
    "France": "France",
    "Belgique": "Belgium",
    "Luxembourg": "Luxembourg",
    "Suisse": "Switzerland",
    "Canada": "Canada",
    "Maroc": "Morocco",
    "Nigeria": "Nigeria",
    "Afrique du Sud": "South Africa",
    "Réponse vidéo invalide": "Invalid video response",
    "Horaire à confirmer": "Time to be confirmed",
    "Le programme vidéo ne peut pas être actualisé pour le moment. Les scores restent accessibles.": "Video listings cannot refresh. Scores remain available.",
    "L’actualisation des diffusions est temporairement limitée. Une nouvelle tentative est prévue.": "Stream updates are temporarily limited. A retry is scheduled.",
    "Le programme vidéo est temporairement indisponible. Les scores restent accessibles.": "Video listings are temporarily unavailable. Scores remain available.",
    "La recherche de nouveaux directs reprendra automatiquement. Les diffusions déjà connues continuent d’être vérifiées.": "Discovery will resume automatically. Known streams are still being checked.",
    "Les diffusions ne peuvent pas être actualisées pour le moment. Les scores restent accessibles.": "Streams cannot refresh right now. Scores remain available.",
    "Lecteur indisponible": "Player unavailable",
    "Le lecteur met trop de temps à répondre": "The player is taking too long to respond",
    "Chargement du lecteur impossible": "Unable to load the player",
    "Le lecteur ne répond pas. Tu peux consulter la diffusion sur YouTube.": "The player is not responding. Try the stream on YouTube.",
    "Cette vidéo n’est pas disponible dans ce lecteur, selon les conditions du diffuseur ou ton pays.": "This video cannot play here due to broadcaster rules or your country.",
    "Le lecteur n’a pas pu démarrer. Tu peux essayer directement sur YouTube.": "Playback failed. Try directly on YouTube.",
    "Cette diffusion est terminée.": "This stream has ended.",
    "Appuie sur le bouton Lecture du lecteur pour démarrer la vidéo.": "Press Play in the player to start the video.",
    "Le lecteur ne peut pas être chargé. Tu peux consulter la diffusion sur YouTube.": "The player could not load. Open the stream on YouTube.",
    "Dernier score connu": "Last known score",
    "Rencontre terminée": "Match finished",
    "Score suivi": "Followed score",
    "Rencontre à venir": "Upcoming match",
    "La rubrique vidéo est en préparation. Les scores restent accessibles.": "The video section is being prepared. Scores remain available.",
    "La collecte suit son calendrier. Le programme s’actualisera automatiquement.": "Collection follows its schedule. Listings will refresh automatically.",
    "Ajoute YOUTUBE_API_KEY dans les variables du backend et active YouTube Data API v3 dans le projet Google.": "Set YOUTUBE_API_KEY in the backend and enable YouTube Data API v3 in Google.",
    "Impossible de demander l’actualisation des diffusions.": "Unable to request a stream update.",
    "La recherche automatique nécessite YOUTUBE_API_KEY dans le backend. Les chaînes FIFA et FIBA sont sélectionnées par défaut.": "Automatic discovery requires YOUTUBE_API_KEY in the backend. FIFA and FIBA channels are selected by default.",
    "Fermer le lecteur": "Close player",
    "Le score sélectionné s’affichera ici.": "The selected score will appear here.",
    "Les scores disponibles apparaîtront dans cette liste dès leur chargement.": "Available scores will appear in this list once loaded.",
    "Équipe, rencontre ou diffuseur…": "Team, match or broadcaster…",
    "Filtrer les diffusions par sport": "Filter streams by sport",
    "Tous les sports": "All sports",
    "Diffusion en cours selon le diffuseur": "Live according to the broadcaster",
    "Regarder le direct": "Watch live",
    "Ouvrir le programme": "Open schedule",
    "Les diffusions vidéo sont en préparation": "Video streams are being prepared",
    "Aucune diffusion ne correspond à ces filtres": "No streams match these filters",
    "Aucune diffusion intégrable disponible actuellement": "No embeddable streams available right now",
    "Le programme est en cours de préparation. Il s’actualisera automatiquement.": "The schedule is being prepared and will refresh automatically.",
    "Retrouve les scores ci-dessous et reviens consulter les prochaines diffusions proposées.": "Check the scores below and return for upcoming streams.",
    "Live & Scores": "Live & Scores",
    "Suivi en temps réel des matchs en cours et des résultats récents. Actualisation automatique toutes les 45 secondes.": "Follow live matches and recent results. Automatic refresh every 45 seconds.",
    "Scores du {{v0}}": "Scores as of {{v0}}",
    "Le fournisseur prépare les scores. La page se mettra à jour automatiquement.": "The provider is preparing scores. This page will update automatically.",
    "Les scores sont temporairement indisponibles.": "Scores are temporarily unavailable.",
    "Terminés{{v0}}": "Finished{{v0}}",
    "À venir{{v0}}": "Upcoming{{v0}}",
    "Actualisé à {{v0}}": "Updated at {{v0}}",
    "Ouverture du lecteur…": "Opening player…",
    "Lecture via YouTube · {{v0}}": "Playback via YouTube · {{v0}}",
    "Consulter sur YouTube": "Open on YouTube",
    "Les scores se mettent à jour indépendamment de la vidéo.": "Scores refresh independently of the video.",
    "À regarder sur WinPulse": "Watch on WinPulse",
    "Le match, sur ton écran.": "The match, on your screen.",
    "Retrouve les directs intégrables des diffuseurs sélectionnés et suis les scores sur la même page.": "Watch embeddable streams from selected broadcasters and follow scores here.",
    "Actualiser les diffusions": "Refresh streams",
    "Configuration vidéo · Administrateur": "Video settings · Administrator",
    "La tâche vidéo n’est pas active. Vérifie les logs d’initialisation du backend.": "The video task is inactive. Check backend startup logs.",
    "État fournisseur : {{v0}}": "Provider status: {{v0}}",
    "Vérifier la collecte": "Check collection",
    "Un score à suivre": "A score to follow",
    "Choisis la rencontre dont tu veux suivre le score pendant la vidéo.": "Choose the match score to follow during the video.",
    "Rencontre à suivre": "Match to follow",
    "Choisir une rencontre": "Choose a match",
    "Chaîne du diffuseur": "Broadcaster channel",
    "Rechercher une diffusion{{v0}}": "Search streams{{v0}}",
    "Pays de visionnage{{v0}}": "Viewing country{{v0}}",
    "Chargement du programme vidéo…": "Loading video listings…",
    "Voir sur YouTube": "Watch on YouTube",
    "Afficher toutes les diffusions": "Show all streams",
    "Les vidéos sont lues via YouTube. Leur disponibilité dépend du pays et des conditions du diffuseur. Les directs disponibles ne couvrent pas nécessairement toutes les rencontres du tableau des scores.": "Videos play via YouTube. Availability depends on your country and broadcaster rules. Streams may not cover every match in the scores table.",
    "{{v0}} recherches aujourd’hui · Sources : {{v1}} · Dernière vérification : {{v2}}.": "{{v0}} searches today · Sources: {{v1}} · Last checked: {{v2}}.",
    "Résultat en attente": "Result pending",
    "La sélection décrit l’événement attendu dans le marché indiqué. Consulte les règles de règlement du bookmaker.": "The pick describes the expected market outcome. Check the bookmaker's settlement rules.",
    "Réponse Montante invalide": "Invalid Montante response",
    "Ta session a expiré. Reconnecte-toi pour retrouver la montante.": "Your session expired. Sign in again to view Montante.",
    "Cette action est réservée à l’administrateur ou à ton niveau d’accès.": "This action requires administrator rights or the appropriate access tier.",
    "Le chargement a pris trop de temps. Réessaie dans un instant.": "Loading timed out. Try again shortly.",
    "Le service Montante est temporairement indisponible. Réessaie dans un instant.": "Montante is temporarily unavailable. Try again shortly.",
    "Contrôle terminé. Les résultats finaux disponibles ont été pris en compte.": "Check complete. Available final results have been applied.",
    "La série est lancée. La sélection attendra deux matchs admissibles.": "Series started. Selection will wait for two eligible matches.",
    "Série terminée": "Series completed",
    "Série arrêtée": "Series stopped",
    "Sélections publiées": "Picks published",
    "Recherche de deux matchs": "Finding two matches",
    "Nouvelle série à venir": "New series coming",
    "Étape": "Stage",
    "Étapes gagnées": "Stages won",
    "Matchs publiés": "Published matches",
    " Les dernières données chargées restent affichées.": " The last loaded data remains visible.",
    "Toutes les cotes comparées": "All odds compared",
    "Le classement n’ajoute aucun bonus aux petites cotes.": "Ranking does not give low odds a bonus.",
    "Sources vérifiées": "Verified sources",
    "Les nouvelles sélections exigent des cotes récentes et plusieurs sources complètes.": "New picks require recent odds and several complete sources.",
    "Le droit d’attendre": "Waiting is allowed",
    "Si deux matchs ne passent pas les contrôles, aucune étape n’est publiée.": "No stage is published unless two matches pass the checks.",
    "Contrôle…": "Checking…",
    "Synchroniser les résultats": "Synchronise results",
    "La prochaine série apparaîtra ici dès son lancement par l’administrateur.": "The next series appears here when the administrator starts it.",
    "Nouvelle montante à venir": "New Montante series coming",
    "Deux matchs suffisamment documentés ne sont pas encore disponibles.": "Two sufficiently documented matches are not yet available.",
    "Le sélecteur attend deux matchs": "Waiting for two matches",
    "Estimation du marché vérifié": "Verified market estimate",
    "MONTANTE WNPULSE": "WNPULSE SERIES",
    "2 matchs distincts par étape": "2 distinct matches per stage",
    "Deux rencontres.{{v0}}{{v1}}": "Two matches.{{v0}}{{v1}}",
    "Des choix expliqués.": "Explained choices.",
    "Les sélections sont comparées selon les estimations et la qualité des données. Une petite cote ne suffit pas à faire un bon choix.": "Picks are compared by estimates and data quality. Low odds alone do not make a good pick.",
    "Pilotage administrateur": "Administrator controls",
    "Parcours {{v0}}": "Path {{v0}}",
    "10 étapes": "10 stages",
    "15 étapes": "15 stages",
    "Lancer une nouvelle série": "Start a new series",
    "La série actuelle sera archivée sur le serveur et remplacée.": "The current series will be archived on the server and replaced.",
    "{{v0}}Remplacer la série actuelle": "{{v0}}Replace current series",
    "Nouvelle série": "New series",
    "Diagnostic de sélection": "Selection diagnostics",
    "{{v0}} matchs reçus · {{v1}} événements admissibles": "{{v0}} matches received · {{v1}} eligible events",
    "Parcours de la série": "Series progress",
    "{{v0}} étape{{v1}} gagnée{{v2}} sur {{v3}}": "Stages won: {{v0}} of {{v3}}",
    "Une étape annulée n’est pas une victoire. Les jours sans sélection ne font pas avancer le parcours.": "A void stage is not a win. Days without picks do not advance the series.",
    "Sélections · Étape {{v0}}": "Picks · Stage {{v0}}",
    "Cote combinée : {{v0}}": "Combined odds: {{v0}}",
    "Sélection publiée avant cette mise à jour : elle reste suivie jusqu’à son règlement. Les nouvelles étapes exigent deux matchs.": "This older pick remains tracked until settlement. New stages require two matches.",
    "Les mêmes sélections que les abonnés": "The same picks as subscribers",
    "Débloque les rencontres, les marchés et les raisons de chaque choix.": "Unlock matches, markets and reasons for each pick.",
    "Lire l’estimation de la paire": "Read the pair estimate",
    "Approximation théorique : {{v0}}, sous hypothèse d’indépendance.": "Theoretical approximation: {{v0}}, assuming independence.",
    "Ce chiffre multiplie deux estimations du moteur. Il ne constitue pas un taux de réussite constaté. Des événements distincts peuvent encore être corrélés.": "This multiplies two engine estimates, not a measured win rate. Distinct events can still be correlated.",
    "Historique de la série": "Series history",
    "Les victoires, pertes et annulations restent visibles.": "Wins, losses and voids remain visible.",
    "Aucune étape réglée pour le moment.": "No settled stages yet.",
    "Étape {{v0}}": "Stage {{v0}}",
    "{{v0}}{{v1}}{{v2}} · cote {{v3}}": "{{v0}}{{v1}}{{v2}} · odds {{v3}}",
    "{{v0}} sélections · détails réservés aux abonnés.": "{{v0}} picks · subscriber-only details.",
    "Ce que la sélection permet de comprendre": "Understanding the selection",
    "Les petites cotes ne reçoivent aucun bonus. Le sélecteur compare la probabilité estimée, l’accord entre les sources et leur nombre. Ce score de classement n’est pas une probabilité.": "Low odds get no bonus. Ranking compares estimated probability, source agreement and source count. The rank score is not a probability.",
    "Les deux matchs doivent être distincts, avec des équipes différentes, des marchés complets et des cotes récentes. Cette vérification ne supprime pas l’incertitude sportive.": "Both matches need different teams, complete markets and recent odds. These checks do not remove sporting uncertainty.",
    "Les probabilités viennent du moteur existant, souvent du consensus des cotes. L’efficacité de ce nouveau filtrage devra être mesurée sur des résultats futurs, pas uniquement sur les gagnants déjà connus.": "Probabilities come from the existing engine, often odds consensus. This new filter must be measured on future results, not only past winners.",
    "Une seule sélection perdante arrête la série. Aucun pari ni aucune montante ne garantit un résultat.": "One losing pick stops the series. No bet or series guarantees a result.",
    "RENCONTRE {{v0}}": "MATCH {{v0}}",
    "Sélection réservée aux abonnés": "Subscriber-only pick",
    "Sources complètes": "Complete sources",
    "Estimation issue du consensus des cotes, distincte d’une mesure de réussite réelle.": "Estimate from odds consensus, not a measured real-world success rate.",
    "Rencontre commencée : la sélection reste figée en attendant son résultat.": "Match started: the pick stays fixed until its result.",
    "Pourquoi cette sélection ?": "Why this pick?",
    "Les critères détaillés n’ont pas été enregistrés pour cette ancienne sélection.": "Detailed criteria were not saved for this older pick.",
    "Cotes vérifiées : {{v0}}. Elles peuvent évoluer.": "Odds checked: {{v0}}. They may change.",
    "Voir l’analyse du match": "View match analysis",
    "« {{v0}} » porte sur le total de buts ou de points. Le seuil et la période du marché déterminent le résultat.": "“{{v0}}” concerns total goals or points. The market line and period determine settlement.",
    "Non renseignée": "Not provided",
    "Administrateur": "Administrator",
    "Statistiques absentes": "Missing statistics",
    "Statistiques invalides": "Invalid statistics",
    "Mon profil": "My profile",
    "Abonnement invalide": "Invalid subscription",
    "Impossible de vérifier votre abonnement. Les informations affichées viennent de votre dernière connexion.": "Unable to verify your subscription. Showing information from your last sign-in.",
    "Impossible de charger les résultats WinPulse. Réessayez dans un instant.": "Unable to load WinPulse results. Try again shortly.",
    "Votre profil a été actualisé.": "Your profile was refreshed.",
    "Impossible d’actualiser votre profil.": "Unable to refresh your profile.",
    "Votre consentement aux messages WhatsApp a été retiré.": "Your consent to WhatsApp messages was withdrawn.",
    "Impossible de modifier votre choix WhatsApp.": "Unable to change your WhatsApp preference.",
    "Email non renseigné": "Email not provided",
    "Date d’expiration non renseignée.": "Expiry date not provided.",
    "Passer Pro": "Upgrade to Pro",
    "Voir l’offre Pro": "View Pro offer",
    "Gérer mon abonnement": "Manage my subscription",
    "Pronostics gratuits selon les disponibilités": "Free predictions when available",
    "Track Record public complet": "Complete public track record",
    "Compte personnel WinPulse": "Personal WinPulse account",
    "Tous les pronostics et combinés": "All predictions and combos",
    "Analyses IA complètes": "Detailed analyses",
    "Combo Builder et value bets": "Combo Builder and value bets",
    "Résultats confirmés": "Confirmed results",
    "Remboursés": "Refunded",
    "Non renseigné": "Not provided",
    "Membre depuis": "Member since",
    "Vous avez autorisé WinPulse à vous contacter sur votre numéro WhatsApp. Vous pouvez retirer ce consentement à tout moment.": "You allowed WinPulse to contact you on WhatsApp. You may withdraw consent at any time.",
    "Vous n’avez pas de consentement actif pour les messages WhatsApp de WinPulse.": "You have not opted in to WinPulse WhatsApp messages.",
    "Autorisé": "Allowed",
    "Non autorisé": "Not allowed",
    "Mon espace WinPulse": "My WinPulse space",
    "Résultats": "Results",
    "Résultats WinPulse": "WinPulse results",
    "Mon compte": "My account",
    "Votre accès actuel": "Your current access",
    "Vérification de votre abonnement…": "Verifying subscription…",
    "Les fonctionnalités Pro sont accessibles avec vos droits administrateur.": "Pro features are available through your administrator permissions.",
    "{{v0}} jour{{v1}} restant{{v2}}": "Days remaining: {{v0}}",
    "Votre ancien accès payant est arrivé à expiration.": "Your previous paid access has expired.",
    "Votre ancien accès Elite reste reconnu. L’offre actuellement proposée est WinPulse Pro.": "Your existing Elite access is recognised. The current offer is WinPulse Pro.",
    "Découvrez les pronostics gratuits disponibles et les résultats publics.": "Explore available free picks and public results.",
    "Consultez l’offre complète et les modalités de paiement sur la page Abonnement.": "See the Subscription page for the full offer and payment details.",
    "Les résultats publics de WinPulse": "WinPulse public results",
    "Ces chiffres concernent les pronostics de la plateforme, pas les paris de votre compte. Ils sont visibles en Gratuit comme en Pro pour vous permettre de consulter notre historique.": "These figures describe platform predictions, not your personal bets. Free and Pro users can both check this public history.",
    "Bilan des résultats confirmés": "Confirmed results summary",
    "Cumul du Track Record, tous sports et tous niveaux.": "All-time track record, all sports and risk levels.",
    "Aucun résultat confirmé pour le moment": "No confirmed results yet",
    "Le bilan se mettra à jour lorsque les pronostics seront résolus.": "The summary will update as predictions settle.",
    "Taux de réussite WinPulse": "WinPulse win rate",
    "Gagnés ÷ (gagnés + perdus). Les remboursements et les pronostics en attente ne sont pas inclus.": "Won ÷ (won + lost). Refunds and pending picks are excluded.",
    "Et mes statistiques personnelles ?": "What about my personal statistics?",
    "Elles nécessitent un historique des paris que vous avez réellement suivis. Aucun suivi personnel n’est relié à cette page actuellement : elle n’affiche donc pas de taux de réussite, de ROI ou de gains attribués à votre compte.": "Personal statistics need a record of bets you followed. No personal tracker is connected here, so no personal win rate, ROI or winnings are shown.",
    "Consulter le Track Record complet": "View complete track record",
    "Mes informations": "My information",
    "Ces informations correspondent aux données enregistrées sur votre compte.": "These details match the information saved on your account.",
    "Messages WhatsApp": "WhatsApp messages",
    "{{v0}}Retirer mon consentement": "{{v0}}Withdraw my consent",
    "Voir les pronostics": "View predictions",
    "Voir les résultats publics": "View public results",
    "Actuel": "Current",
    "{{v0}} gagnés, {{v1}} perdus, {{v2}} remboursés": "{{v0}} won, {{v1}} lost, {{v2}} refunded",
    "Non communiqué": "Not provided",
    "Sélections et cotes à vérifier avant le début des rencontres.": "Check selections and odds before the matches.",
    "Le serveur met trop de temps à répondre. Tu peux réessayer.": "The server timed out. Try again.",
    "Deux issues sont couvertes : celles indiquées par la sélection. Vérifie la période à laquelle le marché s’applique.": "This selection covers the two stated outcomes during the market period.",
    "Le pari concerne le fait que les deux équipes marquent, ou non, pendant la période couverte par le marché.": "This market concerns whether both teams score during the stated period.",
    "Le résultat est évalué après application du handicap indiqué. La ligne et la période du marché déterminent le règlement.": "Settlement uses the stated handicap, line and market period. Check the bookmaker's rules.",
    "Le pari porte sur le total indiqué. Les règles de règlement dépendent de la ligne et de la période choisies.": "This bet concerns the stated total. Check the line, period and settlement rules.",
    "La sélection prévoit un match nul sur la période couverte par le marché.": "The selection predicts a draw during the covered period.",
    "Le pronostic se lit avec son marché : consulte la fiche du match pour vérifier la période et les informations disponibles.": "Read the pick with its market and period. The match page shows available information.",
    "Indisponible": "Unavailable",
    "Pronostic réservé": "Reserved pick",
    "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.": "The total must stay below {{v0}} during the covered period.",
    "Le total doit dépasser {{v0}} sur la période couverte par ce marché.": "The total must exceed {{v0}} during the covered period.",
    "Le moteur retient {{v0}} comme vainqueur sur la période couverte par le marché.": "The engine selects {{v0}} to win during the covered period.",
    "Cette sélection couvre deux issues du match : celles indiquées dans le pronostic. Elle ne désigne pas nécessairement un vainqueur unique.": "This selection covers the two stated outcomes during the market period.",
    "L’équipe indiquée doit gagner. Si la rencontre se termine sur un nul, la mise est remboursée selon les règles du marché.": "The named team must win. A draw in the covered period is refunded under this market's rules.",
    "Le pronostic porte sur le fait que les deux équipes marquent ou non pendant la période indiquée par le marché.": "This market concerns whether both teams score during the stated period.",
    "Le résultat est évalué après application du handicap indiqué dans la sélection. La période et les règles de règlement du bookmaker sont à vérifier.": "Settlement uses the stated handicap, line and market period. Check the bookmaker's rules.",
    "La sélection prévoit un match nul pendant la période indiquée par le marché.": "The selection predicts a draw during the covered period.",
    "La double chance couvre deux issues de la rencontre. Les deux issues couvertes sont celles indiquées dans la sélection.": "This selection covers the two stated outcomes during the market period.",
    "La sélection vise la victoire de l’équipe indiquée. Si la rencontre se termine sur un match nul, la mise est remboursée selon les règles du marché.": "The named team must win. A draw in the covered period is refunded under this market's rules.",
    "Ce marché porte sur le fait que les deux équipes marquent ou non pendant la période indiquée. Il ne désigne pas le vainqueur du match.": "This market concerns whether both teams score during the stated period.",
    "Le résultat est évalué après application du handicap indiqué dans la sélection. Vérifie aussi la période concernée et les règles de règlement du bookmaker.": "Settlement uses the stated handicap, line and market period. Check the bookmaker's rules.",
    "Ce marché porte sur le total de buts ou de points, pour les équipes et la période indiquées dans la sélection.": "This bet concerns the stated total. Check the line, period and settlement rules.",
    "Le pronostic porte sur un match nul pendant la période indiquée par le marché.": "The selection predicts a draw during the covered period.",
    "Annulé": "Refunded",
    "La sélection prévoit un match nul dans la période couverte.": "The selection predicts a draw during the covered period.",
    "Le résultat se juge après application du handicap indiqué pour l’équipe sélectionnée.": "Settlement uses the stated handicap, line and market period. Check the bookmaker's rules.",
    "La sélection prévoit la victoire de {{v0}}, selon les règles de ce marché.": "The engine selects {{v0}} to win during the covered period.",
    "Jackpot": "Jackpot",
    "ring-2 ring-rose-500/40": "ring-2 ring-rose-500/40",
    "PRO": "PRO",
    "vs": "vs",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "KOUKPAKI VIANEY": "KOUKPAKI VIANEY",
    "WinPulse Pro": "WinPulse Pro",
    "pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-8": "pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-8",
    "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8": "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8",
    "calc(4rem + env(safe-area-inset-bottom))": "calc(4rem + env(safe-area-inset-bottom))",
    "FCFA{{v0}}": "FCFA{{v0}}",
    "{{v0}} FCFA": "{{v0}} FCFA",
    "Gemini": "Gemini",
    "Claude": "Claude",
    "edge": "edge",
    "{{v0}} vs {{v1}}": "{{v0}} vs {{v1}}",
    "chez {{bookmaker}}": "at {{bookmaker}}",
    "Vainqueur (1X2)": "Match winner (1X2)",
    "Total buts/points": "Total goals/points",
    "Total de buts": "Total goals",
    "Cartons": "Cards",
    "Corners": "Corners",
    "Mi-temps": "Half-time",
    "Match nul": "Draw",
    "Plus de {{line}} buts": "Over {{line}} goals",
    "Moins de {{line}} buts": "Under {{line}} goals",
    "Plus de {{line}} points": "Over {{line}} points",
    "Moins de {{line}} points": "Under {{line}} points",
    "Plus de {{line}} corners": "Over {{line}} corners",
    "Moins de {{line}} corners": "Under {{line}} corners",
    "Plus de {{line}} cartons": "Over {{line}} cards",
    "Moins de {{line}} cartons": "Under {{line}} cards",
    "TERMINÉ": "FINISHED",
    "EN DIRECT": "LIVE",
    "Pick verrouillé": "Locked pick",
    "Passe Pro pour voir l’analyse": "Upgrade to Pro to view the analysis",
    "Avantage estimé : {{edge}}": "Estimated edge: {{edge}}",
    "Analyse en cours…": "Analysis in progress…",
    "Autres marchés analysés": "Other analysed markets",
    "Partager WhatsApp (Admin)": "Share on WhatsApp (Admin)",
    "Pronostic à risque réduit": "Lower-risk prediction",
    "Pronostic à risque modéré": "Moderate-risk prediction",
    "Pronostic risqué": "Higher-risk prediction",
    "Victoire de {{team}}": "{{team}} to win",
    "Plus de {{line}}": "Over {{line}}",
    "Moins de {{line}}": "Under {{line}}",
    "Oui": "Yes",
    "Non": "No",
    "Les deux équipes marquent : Oui": "Both teams to score: Yes",
    "Les deux équipes marquent : Non": "Both teams to score: No"
  },
  "es": {
    "Choisir la langue": "Elegir idioma",
    "Langue de l’interface": "Idioma de la interfaz",
    "Dashboard": "Panel principal",
    "Live": "En directo",
    "Aujourd'hui": "Hoy",
    "À la une": "Destacados",
    "Combinés": "Combinadas",
    "Combo Builder": "Creador de combinadas",
    "Value bets": "Apuestas de valor",
    "Montante": "Racha",
    "Track record": "Historial de resultados",
    "Profil": "Perfil",
    "Parrainage": "Invitaciones",
    "Abonnement": "Suscripción",
    "Admin": "Administración",
    "New": "Nuevo",
    "10J": "10d",
    "Free": "Gratis",
    "Ton pouls de gagnant": "Adelántate al juego",
    "Connecté": "Sesión iniciada",
    "Déconnexion": "Cerrar sesión",
    "Plus d'options": "Más opciones",
    "Fermer": "Cerrar",
    "Plus": "Más",
    "Tableau": "Inicio",
    "Direct": "Directo",
    "Jour": "Día",
    "Créer": "Crear",
    "Blog": "Blog",
    "Mentions légales": "Aviso legal",
    "CGV": "Condiciones de venta",
    "Confidentialité": "Privacidad",
    "Jeu responsable · 18+": "Juego responsable · 18+",
    "© 2026 WinPulse · Dublin, Irlande": "© 2026 WinPulse · Dublín, Irlanda",
    "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.": "Se ha iniciado sesión con esta cuenta en otro dispositivo o navegador. Esta sesión se ha cerrado.",
    "Ta session a expiré. Reconnecte-toi pour continuer.": "Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.",
    "EN COURS": "EN CURSO",
    "ÉCHOUÉE": "FINALIZADA SIN ÉXITO",
    "TERMINÉE": "COMPLETADA",
    "AUCUNE": "NINGUNA",
    "Aucune montante active.": "No hay ninguna racha activa.",
    "Impossible de charger la montante.": "No se ha podido cargar la racha.",
    "Impossible d'actualiser la montante.": "No se ha podido actualizar la racha.",
    "Le capital initial doit être un nombre positif.": "El importe inicial debe ser un número positivo.",
    "La montante doit durer 10 ou 15 jours.": "La racha debe durar 10 o 15 días.",
    "Impossible de démarrer la montante.": "No se ha podido iniciar la racha.",
    "Montante WinPulse": "Racha WinPulse",
    "10 → 15 jours": "10 → 15 días",
    "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.": "El motor selecciona pronósticos existentes que cumplen sus criterios. Una jornada ganada hace avanzar la racha; una perdida la termina. Si ninguna selección cumple los criterios, el módulo espera.",
    "Actualiser": "Actualizar",
    "Montante indisponible": "Racha no disponible",
    "Contrôle administrateur": "Controles de administración",
    "Montante 10 jours": "Racha de 10 días",
    "Montante 15 jours": "Racha de 15 días",
    "Capital initial": "Importe inicial",
    "Démarrer": "Iniciar",
    "Recommencer": "Reiniciar",
    "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.": "Solo la administración puede iniciar o reiniciar la racha, para evitar que los usuarios la restablezcan.",
    "Chargement de la montante…": "Cargando la racha…",
    "Aucune montante active": "No hay ninguna racha activa",
    "L'administrateur doit lancer une montante de 10 ou 15 jours.": "La administración debe iniciar una racha de 10 o 15 días.",
    "progression": "progreso",
    "mise de départ": "importe de partida",
    "Capital théorique": "Importe teórico",
    "si les journées passent": "si se superan las jornadas",
    "Progression": "Progreso",
    "de la série": "de la racha",
    "Progression de la série": "Progreso de la racha",
    "Jour {{day}} sur {{total}}": "Día {{day}} de {{total}}",
    "Pronostics du jour": "Pronósticos de hoy",
    "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.": "Las selecciones dependen de los criterios y de los datos disponibles. No se garantiza un intervalo fijo de cuotas.",
    "Pick {{number}}": "Selección {{number}}",
    "Confiance": "Confianza",
    "Début :": "Inicio:",
    "En attente d'un pick qualifié": "Esperando una selección válida",
    "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.": "El módulo nunca fuerza un pronóstico que no cumple sus criterios.",
    "Historique": "Historial",
    "Aucune journée terminée.": "Todavía no hay jornadas completadas.",
    "GAGNÉ": "GANADO",
    "REMBOURSÉ": "ANULADO",
    "PERDU": "PERDIDO",
    "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.": "Ninguna apuesta deportiva está garantizada. La racha limita el número de selecciones, pero no elimina el riesgo. 18+ · Juego responsable.",
    "Chargement…": "Cargando…",
    "Analyses sportives": "Análisis deportivo",
    "Historique des résultats": "Historial de resultados",
    "Articles": "Artículos",
    "Ouvrir l'app": "Abrir la aplicación",
    "Connexion": "Iniciar sesión",
    "S'inscrire": "Registrarse",
    "Démarrer gratuit": "Empezar gratis",
    "Pronostics · Analyses · Résultats publics": "Pronósticos · Análisis · Resultados públicos",
    "Vise la victoire avec nos pronostics.": "Apunta a la victoria con nuestros pronósticos.",
    "Garde une longueur d’avance.": "Mantente un paso por delante.",
    "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.": "Descubre los pronósticos de hoy y nuestros análisis. Empieza gratis y pasa a Pro para acceder a selecciones y combinadas para suscriptores.",
    "Découvrir les pronostics": "Ver pronósticos",
    "Découvrir l’offre Pro": "Descubrir Pro",
    "Consulter l’historique complet": "Ver el historial completo",
    "Inscription sans carte": "Registro sin tarjeta",
    "Résultats publics": "Resultados públicos",
    "Compte gratuit": "Cuenta gratuita",
    "Pronostics disponibles": "Pronósticos disponibles",
    "Chargement des analyses…": "Cargando análisis…",
    "Les analyses ne sont pas disponibles pour le moment.": "Los análisis no están disponibles en este momento.",
    "Réessayer": "Reintentar",
    "Les analyses du jour arrivent prochainement.": "Los análisis de hoy estarán disponibles pronto.",
    "Consulte l’historique de résultats en attendant les prochaines sélections.": "Consulta el historial de resultados mientras esperas las próximas selecciones.",
    "Analyse réservée Pro": "Análisis exclusivo Pro",
    "Indice : {{value}} %": "Indicador: {{value}} %",
    "Les indices d’analyse ne garantissent aucun résultat.": "Los indicadores de análisis no garantizan ningún resultado.",
    "Ouvrir l’application": "Abrir la aplicación",
    "Créer mon compte gratuit": "Crear mi cuenta gratuita",
    "Historique des pronostics": "Historial de pronósticos",
    "Les résultats d’hier": "Resultados de ayer",
    "Matchs du {{date}}.": "Partidos del {{date}}.",
    "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.": "Una selección de pronósticos ganadores de ayer de nuestro historial, ordenados de mayor a menor cuota.",
    "Voir tous les résultats": "Ver todos los resultados",
    "Chargement des résultats d’hier…": "Cargando los resultados de ayer…",
    "Le bilan d’hier n’est pas disponible pour le moment.": "El resumen de ayer no está disponible en este momento.",
    "Tu peux consulter l’historique complet des résultats.": "Puedes consultar el historial completo de resultados.",
    "Gagnants": "Ganadores",
    "Perdants": "Perdedores",
    "En attente": "Pendientes",
    "Annulés / remboursés": "Anulados / reembolsados",
    "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.": "Total de pronósticos: {{count}}. Las tarjetas solo muestran una selección de los ganadores.",
    "Aucun pronostic publié pour les matchs de cette journée.": "No se publicaron pronósticos para los partidos de ese día.",
    "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.": "No hay pronósticos ganadores confirmados para ese día. El resumen sigue visible arriba.",
    "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.": "Los detalles de los pronósticos ganadores aún no están disponibles aquí. Consulta el historial completo.",
    "Gagné": "Ganado",
    "Cote publiée": "Cuota publicada",
    "Score final": "Resultado final",
    "Pronostic publié avant le match · résultat confirmé.": "Pronóstico publicado antes del partido · resultado confirmado.",
    "Les résultats passés ne garantissent pas les prochains résultats.": "Los resultados pasados no garantizan los futuros.",
    "COMMENT UTILISER WINPULSE": "CÓMO USAR WINPULSE",
    "Une analyse pro, claire et immédiate": "Análisis deportivo claro y accesible",
    "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.": "Consulta los análisis, comprueba los resultados y mantén el control de tus decisiones.",
    "Explications de match": "Explicaciones del partido",
    "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.": "Comprende las selecciones con los datos disponibles, mediante explicaciones locales o ayuda de IA cuando esté configurada.",
    "Scoring rigoureux": "Indicadores de análisis",
    "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.": "Consulta los indicadores disponibles para comparar selecciones. Un indicador no garantiza el éxito.",
    "Combinés par profil": "Combinadas por perfil",
    "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.": "Compara las selecciones y los niveles de riesgo disponibles. Ninguna combinada está libre de riesgo.",
    "Track record transparent": "Historial transparente",
    "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.": "Historial público, ROI, porcentaje de aciertos y cuotas medias. Se incluyen pronósticos ganadores y perdedores.",
    "Value bets détectés": "Detección de apuestas de valor",
    "Compare les estimations et les cotes proposées. Les estimations restent incertaines.": "Compara las estimaciones con las cuotas ofrecidas. Las estimaciones siguen siendo inciertas.",
    "Découverte gratuite": "Descubrimiento gratuito",
    "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.": "Crea tu cuenta sin pagar. Después consulta la oferta Pro desde tu espacio.",
    "Retrouve ton code et les conditions du programme dans ton compte.": "Consulta tu código y las condiciones del programa en tu cuenta.",
    "Voir mon code": "Ver mi código",
    "ABONNEMENT": "SUSCRIPCIÓN",
    "Choisis ton accès": "Elige tu acceso",
    "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.": "Descubre WinPulse gratis. Pasa a Pro para acceder a pronósticos, combinadas y herramientas para suscriptores.",
    "Pour découvrir": "Para descubrir",
    "Sélections gratuites disponibles": "Selecciones gratuitas disponibles",
    "Tous les matchs (cotes visibles)": "Todos los partidos con cuotas visibles",
    "Track record public": "Historial público",
    "pour 30 jours": "por 30 días",
    "Accès complet": "Acceso completo",
    "Tous les pronostics débloqués": "Todos los pronósticos desbloqueados",
    "Tous les combinés du jour": "Todas las combinadas del día",
    "Explications des pronostics": "Explicaciones de los pronósticos",
    "Value bets et Combo Builder": "Apuestas de valor y creador de combinadas",
    "Montante premium": "Racha premium",
    "Support WhatsApp prioritaire": "Soporte prioritario por WhatsApp",
    "Passer à Pro": "Pasar a Pro",
    "© 2026 WinPulse · Joue responsable · 18+": "© 2026 WinPulse · Juega con responsabilidad · 18+",
    "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.": "Los pronósticos son análisis estadísticos, no garantías. Apuesta solo lo que puedas permitirte perder. WinPulse no acepta apuestas ni apuesta por sus usuarios.",
    "Renseigne ton nom.": "Introduce tu nombre.",
    "Ton numéro WhatsApp est obligatoire pour créer ton compte.": "Tu número de WhatsApp es obligatorio para crear la cuenta.",
    "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.": "Introduce el número con + y el prefijo del país, por ejemplo +2250700000000.",
    "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.": "El formulario necesita actualizarse. Recarga la página e inténtalo de nuevo.",
    "L’inscription n’a pas abouti. Réessaie dans un instant.": "No se ha completado el registro. Inténtalo de nuevo en un momento.",
    "Analyse les matchs. Vérifie les résultats. Décide toi-même.": "Analiza partidos. Comprueba resultados. Decide por ti mismo.",
    "Commence gratuitement, sans carte bancaire.": "Empieza gratis, sin tarjeta bancaria.",
    "Historique public des résultats": "Historial público de resultados",
    "Aucun paiement pour créer le compte": "Sin pago para crear la cuenta",
    "Invitation détectée": "Invitación detectada",
    "WinPulse · 18+ · Joue responsable": "WinPulse · 18+ · Juega con responsabilidad",
    "100 % gratuit": "100 % gratis",
    "Ton accès gratuit est presque prêt": "Tu acceso gratuito está casi listo",
    "Crée ton compte pour découvrir WinPulse.": "Crea tu cuenta para descubrir WinPulse.",
    "Gratuit": "Gratis",
    "0 FCFA": "0 FCFA",
    "Sans CB": "Sin tarjeta",
    "Aucun paiement": "Sin pago",
    "Libre": "Tú eliges",
    "Sans engagement": "Sin compromiso",
    "Nom": "Nombre",
    "Ton nom complet": "Tu nombre completo",
    "Email": "Correo electrónico",
    "vous@email.com": "tu@email.com",
    "Numéro WhatsApp": "Número de WhatsApp",
    "(obligatoire)": "(obligatorio)",
    "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.": "Añade + y el prefijo del país: +33 Francia, +353 Irlanda, +225 Costa de Marfil, +229 Benín, +223 Mali.",
    "Mot de passe": "Contraseña",
    "10 caractères minimum": "Mínimo 10 caracteres",
    "J’ai un code parrainage": "Tengo un código de invitación",
    "Code parrainage": "Código de invitación",
    "(optionnel)": "(opcional)",
    "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.": "Acepto recibir por WhatsApp ofertas de WinPulse e invitaciones a sus grupos o comunidades privadas, mediante mensajes manuales o automáticos. Esta autorización es opcional y no es necesaria para crear mi cuenta. Puedo retirarla desde mi perfil.",
    "Création du compte…": "Creando cuenta…",
    "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.": "No se solicita ningún pago al registrarse. WinPulse ofrece análisis estadísticos y no garantiza ganancias.",
    "Politique de confidentialité": "Política de privacidad",
    "Déjà inscrit ?": "¿Ya tienes cuenta?",
    "Se connecter": "Iniciar sesión",
    "18+ · Joue responsable": "18+ · Juega con responsabilidad",
    "Bienvenue !": "¡Bienvenido!",
    "Erreur {{status}}": "Error {{status}}",
    "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.": "El servidor no responde. Comprueba tu conexión a internet y vuelve a intentarlo.",
    "Erreur inconnue": "Error desconocido",
    "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.": "Consulta tus pronósticos, análisis y resultados disponibles desde tu espacio. Ningún resultado está garantizado.",
    "© 2026 WinPulse · 18+ · Joue responsable": "© 2026 WinPulse · 18+ · Juega con responsabilidad",
    "Accède à tes pronostics du jour": "Accede a tus pronósticos de hoy",
    "Mot de passe oublié ?": "¿Olvidaste tu contraseña?",
    "Connexion en cours…": "Iniciando sesión…",
    "Pas encore de compte ?": "¿Aún no tienes cuenta?",
    "Créer un compte gratuit": "Crear una cuenta gratuita",
    "Cache de connexion effacé. Réessaye maintenant.": "Caché de conexión borrada. Vuelve a intentarlo.",
    "Le navigateur bloque l’accès au stockage local.": "El navegador bloquea el acceso al almacenamiento local.",
    "Problème de connexion ? Effacer le cache de connexion": "¿Problemas para entrar? Borrar la caché de conexión",
    "Email ou mot de passe incorrect": "Correo electrónico o contraseña incorrectos",
    "Email deja utilise": "El correo electrónico ya está en uso",
    "Le numéro WhatsApp est obligatoire pour créer un compte": "Se necesita un número de WhatsApp para crear la cuenta",
    "Le mot de passe doit contenir au moins 10 caractères": "La contraseña debe tener al menos 10 caracteres",
    "Choisis un mot de passe moins courant": "Elige una contraseña menos común",
    "Choisis un mot de passe moins répétitif": "Elige una contraseña menos repetitiva",
    "Le mot de passe ne doit pas contenir ton adresse email": "La contraseña no debe contener tu correo electrónico",
    "Trop de tentatives. Réessaie plus tard.": "Demasiados intentos. Vuelve a intentarlo más tarde.",
    "Actualisation en cours…": "Actualizando…",
    "Football": "Fútbol",
    "Basketball": "Baloncesto",
    "Tennis": "Tenis",
    "en attente": "Pendientes",
    "Sport": "Deporte",
    "En direct{{v0}}": "EN DIRECTO{{v0}}",
    "Terminé": "FINALIZADO",
    "{{v0}} en direct": "{{v0}} EN DIRECTO",
    "Hockey": "Hockey",
    "Tous les marchés": "Todos los mercados",
    "Vainqueur": "Ganador",
    "Mon ticket WNPulse": "Mon ticket WNPulse",
    "Les deux équipes marquent": "Ambos equipos marcan",
    "Effacer la recherche": "Borrar búsqueda",
    "WNPULSE · COMBO BUILDER": "WNPULSE · COMBO BUILDER",
    "Aujourd’hui": "Hoy",
    "Cote {{v0}}": "Cuota {{v0}}",
    "Réinitialiser les filtres": "Restablecer filtros",
    "WhatsApp": "WhatsApp",
    "Confiance {{v0}}": "Confianza {{v0}}",
    "Clipboard unavailable": "Clipboard unavailable",
    "Cote": "Cuota",
    "Confiance du moteur": "Confianza del motor",
    "WNPULSE · LES COMBINÉS": "WNPULSE · LES COMBINÉS",
    "Tous": "Todos",
    "🏆 Victoire": "🏆 Ganador",
    "Double chance": "Doble oportunidad",
    "🔄 Double chance": "🔄 Doble oportunidad",
    "Handicap": "Hándicap",
    "⚖️ Handicap": "⚖️ Hándicap",
    "🟢 SÛR": "🟢 MENOR RIESGO",
    "🟡 MODÉRÉ": "🟡 MODERADO",
    "🔴 RISQUÉ": "🔴 ARRIESGADO",
    "LIVE": "EN DIRECTO",
    "Passe Pro pour débloquer": "Pásate a Pro para desbloquear",
    "Pronostic": "Pronóstico",
    "Partager sur WhatsApp": "Compartir en WhatsApp",
    "Gagnés": "Ganados",
    "Perdus": "Perdidos",
    "Perdu": "PERDIDO",
    "Marché": "Mercado",
    "Découvrir Pro": "Descubrir Pro",
    "{{v0}} gagnés": "{{v0}} Ganados",
    "{{v0}} perdus": "{{v0}} Perdidos",
    "📈 Over 2.5": "📈 Más de 2,5",
    "🎯 BTTS": "🎯 Ambos marcan",
    "⚽ Over/Under": "⚽ Más/Menos",
    "over 2": "over 2",
    "les deux": "ambos",
    "WhatsApp ouvert": "WhatsApp abierto",
    "Partager sur WhatsApp (Admin)": "Compartir en WhatsApp (Admin)",
    "Sélection éditoriale automatique": "Selección editorial automática",
    "À la une — Top picks du jour": "Destacados — Selecciones del día",
    "Les pronostics avec la plus haute confiance, tous sports confondus.{{v0}}": "Pronósticos de mayor confianza de todos los deportes.{{v0}}",
    "{{v0}} picks analysés": "{{v0}} selecciones analizadas",
    "1 pick visible · {{v0}} verrouillés": "1 selección visible · {{v0}} bloqueadas",
    "Passe Pro pour voir tous les picks et les 3 combinés du jour.": "Pásate a Pro para ver los pronósticos y combinadas disponibles.",
    "Débloquer": "Desbloquear",
    "Aucun pick pour ce marché.": "Sin selecciones para este mercado.",
    "Voir tous les picks": "Ver todas las selecciones",
    "Pronostic verrouillé": "Pronóstico bloqueado",
    "Marché : {{v0}}": "Mercado: {{v0}}",
    "Confiance IA : {{v0}}%": "Confianza del motor: {{v0}} %",
    "Un seul prix. Tout WinPulse. Sans compromis.": "Un precio. Todo WinPulse.",
    "Accès illimité à tous les pronostics, tous les jours, sur 7 sports": "Acceso ilimitado a los pronósticos disponibles en 7 deportes",
    "Tous les combinés (Sûr, Booster, Extra, Jackpot) débloqués": "Desbloquea todos los perfiles de combinadas disponibles",
    "Chaque match analysé sur tous ses marchés": "Análisis de todos los mercados disponibles por partido",
    "Combo Builder et détecteur de value bets": "Creador de combinadas y detector de value bets",
    "Analyse IA experte sur chaque match": "Explicaciones detalladas de pronósticos",
    "Montante WinPulse avec picks débloqués": "Montante WinPulse con selecciones desbloqueadas",
    "Track Record public et vérifiable": "Historial público y verificable",
    "Support prioritaire par WhatsApp": "Soporte prioritario por WhatsApp",
    "Offre en ligne momentanément indisponible. Le plan WinPulse reste affiché.": "Oferta en línea temporalmente indisponible. El plan WinPulse sigue visible.",
    "Indique le nom utilisé pour le paiement.": "Indica el nombre utilizado para pagar.",
    "Indique le numéro MTN Mobile Money utilisé.": "Indica el número MTN Mobile Money utilizado.",
    "Le plan d'abonnement n'est pas disponible.": "El plan de suscripción no está disponible.",
    "La référence de suivi n'a pas été générée.": "No se ha generado la referencia de seguimiento.",
    "Lien de paiement FedaPay invalide.": "Enlace de pago FedaPay no válido.",
    "Le lien de paiement doit utiliser HTTPS.": "El enlace de pago debe usar HTTPS.",
    "Impossible de générer la référence de paiement.": "No se pudo generar la referencia de pago.",
    "Référence copiée": "Referencia copiada",
    "Bonjour WinPulse !": "¡Hola WinPulse!",
    "Merci de vérifier mon paiement et d'activer mon accès.": "Por favor, verifica mi pago y activa mi acceso.",
    "Paiement sécurisé via FedaPay · choisis ton moyen de paiement sur la page FedaPay · annulable à tout moment": "Pago seguro con FedaPay · elige el método en FedaPay · cancelable en cualquier momento",
    "Paiement sécurisé · MTN Mobile Money disponible en solution de secours · annulable à tout moment": "Pago seguro · MTN Mobile Money como alternativa · cancelable en cualquier momento",
    "Plan actuel": "Plan actual",
    "Paiement WinPulse": "Pago WinPulse",
    "Informations de paiement": "Información de pago",
    "Détails du paiement": "Detalles del pago",
    "Nom et prénom": "Nombre y apellidos",
    "Téléphone (facultatif)": "Teléfono (opcional)",
    "Numéro MTN Mobile Money": "Número MTN Mobile Money",
    "Ex. +229 01 97 00 00 00": "Ej. +229 01 97 00 00 00",
    "Ex. 01 97 00 00 00": "Ej. 01 97 00 00 00",
    "Copier la référence": "Copiar referencia",
    "Ouverture du paiement…": "Abriendo el pago…",
    "Préparation du paiement…": "Preparando el pago…",
    "Un seul accès. Tout WinPulse.": "Un acceso. Todo WinPulse.",
    "Plan actif :{{v0}}{{v1}}": "Plan activo:{{v0}}{{v1}}",
    "Débloquer WinPulse Pro": "Desbloquear WinPulse Pro",
    "Sans engagement · résiliable à tout moment · support WhatsApp inclus": "Sin permanencia · cancelable cuando quieras · soporte WhatsApp incluido",
    "Aucun plan disponible pour le moment.": "No hay planes disponibles ahora.",
    "{{v0}} FCFA / mois": "{{v0}} FCFA / mes",
    "Débloquer Pro": "Desbloquear Pro",
    "WinPulse Pro · {{v0}} FCFA / mois": "WinPulse Pro · {{v0}} FCFA / mes",
    "Montant de l'abonnement": "Importe de la suscripción",
    "30 jours · WinPulse Pro": "30 días · WinPulse Pro",
    "{{v0}} Après validation, tu seras redirigé vers la page de paiement.": "{{v0}} Tras confirmar, irás a la página de pago.",
    "Paiement sécurisé par FedaPay.": "Pago seguro mediante FedaPay.",
    "Email du compte": "Email de la cuenta",
    "Nom utilisé pour le paiement": "Nombre utilizado para pagar",
    "Référence de suivi": "Referencia de seguimiento",
    "Procédure MTN Mobile Money": "Instrucciones MTN Mobile Money",
    "1. Compose {{v0}} ou ouvre l'application MTN MoMo.": "1. Marca {{v0}} o abre la app MTN MoMo.",
    "2. Envoie {{v0}} au {{v1}}.": "2. Envía {{v0}} al {{v1}}.",
    "3. Vérifie le destinataire : {{v0}}.": "3. Comprueba el destinatario: {{v0}}.",
    "4. Garde le SMS de confirmation puis contacte WinPulse sur WhatsApp.": "4. Guarda el SMS y contacta con WinPulse por WhatsApp.",
    "Envoyer la confirmation sur WhatsApp": "Enviar confirmación por WhatsApp",
    "Référence : {{v0}}": "Referencia: {{v0}}",
    "Je viens d'effectuer le paiement pour activer mon plan {{v0}}.": "He realizado el pago para activar mi plan {{v0}}.",
    "Montant : {{v0}} FCFA": "Importe: {{v0}} FCFA",
    "Numéro MTN MoMo utilisé : {{v0}}": "Número MTN MoMo utilizado: {{v0}}",
    "Nom : {{v0}}": "Nombre: {{v0}}",
    "Email : {{v0}}": "Email: {{v0}}",
    "Débloquer {{v0}}": "Desbloquear {{v0}}",
    "Payer {{v0}} FCFA": "Pagar {{v0}} FCFA",
    "Continuer — {{v0}} FCFA": "Continuar — {{v0}} FCFA",
    "Impossible de charger le parrainage": "No se pudo cargar el programa de referidos",
    "Lien copié — partage-le maintenant !": "Enlace copiado. ¡Compártelo!",
    "Récompense activée !": "¡Recompensa activada!",
    "Réclamation impossible": "No se puede reclamar la recompensa",
    "Copie ton lien ou ton code unique.": "Copia tu enlace o código único.",
    "Partage-le sur WhatsApp, en 1 clic.": "Compártelo por WhatsApp con un clic.",
    "Découvre WinPulse — IA pronostics sportifs": "Descubre WinPulse — pronósticos deportivos",
    "70%+ de réussite": "Resultados verificables",
    "Track record public, vérifiable à tout moment.": "Historial público, verificable en cualquier momento.",
    "Communauté active": "Comunidad activa",
    "Picks décortiqués, analyses IA, combinés du jour.": "Selecciones explicadas, análisis y combinadas del día.",
    "1 mois, paiement MTN. Pas de carte, pas de piège.": "Un mes, pago MTN. Sin tarjeta obligatoria.",
    "Programme parrainage": "Programa de referidos",
    "Invite 3 amis,{{v0}}reçois {{v1}}": "Invita a 3 amigos,{{v0}}recibe {{v1}}",
    "7 jours Pro offerts": "7 días Pro gratis",
    "Partage ton lien WhatsApp en 1 clic. Dès que {{v0}} créent leur compte, ton accès Pro s'active automatiquement — vraiment gratuit.": "Comparte tu enlace. Cuando {{v0}} se registren, tu acceso Pro gratuito se activará automáticamente.",
    "3 amis": "3 amigos",
    "Ton code": "Tu código",
    "Ta progression": "Tu progreso",
    "{{v0}} / {{v1}} amis inscrits": "{{v0}} / {{v1}} amigos registrados",
    "🎉 Bravo ! Tu peux réclamer ta récompense.": "🎉 ¡Enhorabuena! Reclama tu recompensa.",
    "Récompense déjà réclamée. Merci d'avoir parrainé tes amis !": "Recompensa ya reclamada. ¡Gracias por invitar a tus amigos!",
    "Encore {{v0}} ami{{v1}} à inviter pour débloquer ta semaine Pro.": "Amigos que faltan para desbloquear tu semana Pro: {{v0}}.",
    "Comment ça marche": "Cómo funciona",
    "Partager maintenant": "Compartir ahora",
    "Envoyer par email": "Enviar por email",
    "Pourquoi ils vont kiffer": "Por qué les gustará",
    "Code {{v0}} copié": "Código {{v0}} copiado",
    "Dès que 3 amis créent leur compte avec ton code, {{v0}} jours Pro s'activent.": "Cuando 3 amigos se registren con tu código, se activarán {{v0}} días Pro.",
    "Cette rencontre n’est plus disponible dans les matchs actuels.": "El encuentro ya no está disponible en la lista actual.",
    "La rencontre ne peut pas être chargée pour le moment. Réessaie depuis le dashboard.": "No se puede cargar el encuentro. Reinténtalo desde el panel.",
    "Le serveur réserve cette analyse à Pro. L’explication du pronostic reste disponible ci-dessus.": "Este análisis es Pro. La explicación del pronóstico sigue disponible arriba.",
    "L’explication complémentaire est indisponible pour le moment. Les informations du pronostic restent affichées.": "La explicación adicional no está disponible. Los datos del pronóstico siguen visibles.",
    "Match introuvable.": "Encuentro no encontrado.",
    "Bookmakers": "Operadores",
    "Écart estimé": "Diferencia estimada",
    " points": " puntos",
    "Estimation du moteur": "Estimación del motor",
    "Cote optimale": "Mejor cuota",
    "H2H (10 derniers)": "H2H (últimos 10)",
    "Forme récente": "Forma reciente",
    "xG moyens": "xG medios",
    "Absences clés": "Bajas importantes",
    "Cartons arbitre": "Tarjetas del árbitro",
    "Conditions": "Condiciones",
    "Forme et historique H2H réels (football-data.org) quand disponibles. Autres champs : analyse basée sur le consensus des cotes bookmakers.": "Forma y H2H reales de football-data.org cuando existen. Los demás datos usan el consenso de cuotas.",
    "Analyse basée uniquement sur le consensus des cotes bookmakers agrégées — aucune statistique externe fabriquée.": "Basado solo en el consenso agregado de cuotas, sin estadísticas externas inventadas.",
    "Enrichir l’explication": "Ampliar explicación",
    "Source non précisée par le service": "Fuente no especificada",
    "Moteur statistique": "Motor estadístico",
    "Retour au dashboard": "Volver al panel",
    "Retour": "Volver",
    "VS": "VS",
    "Passe Pro pour voir le pick complet": "Pásate a Pro para ver la selección completa",
    "Inclut la cote optimale, le score de confiance, l'edge value et l'analyse IA experte.": "Incluye mejor cuota, confianza, ventaja estimada y análisis detallado.",
    "Pronostic principal": "Pronóstico principal",
    "Bookmakers utilisés :": "Operadores utilizados:",
    "Partager": "Compartir",
    "Comprendre ce pronostic": "Comprender este pronóstico",
    "Le moteur compare les marchés et les cotes disponibles pour classer les sélections. L’estimation affichée est un indicateur calculé ; elle ne garantit pas le résultat du match.": "El motor compara mercados y cuotas para clasificar selecciones. Su estimación es un indicador, no un resultado garantizado.",
    "Nombre de bookmakers annoncé pour cette analyse : {{v0}}. Cote de la sélection : {{v1}}.": "Operadores anunciados: {{v0}}. Cuota: {{v1}}.",
    "Des statistiques externes sont disponibles pour compléter cette analyse. Leur détail figure plus bas.": "Hay estadísticas externas más abajo para completar el análisis.",
    "Les informations disponibles ne permettent pas ici d’ajouter une analyse vérifiée de la forme des équipes ou des absences.": "Los datos no permiten analizar de forma verificada el estado de forma o las bajas.",
    "Tous les marchés analysés": "Todos los mercados analizados",
    "· {{v0}} books": "· {{v0}} operadores",
    "· edge +{{v0}}%": "· ventaja +{{v0}} %",
    "Analyse détaillée": "Análisis detallado",
    "Données du moteur": "Datos del motor",
    "Aucune statistique externe vérifiée disponible pour ce match — le moteur s'appuie uniquement sur le consensus des cotes bookmakers, sans donnée inventée.": "No hay estadísticas externas verificadas. El motor usa solo el consenso de cuotas, sin datos inventados.",
    "Explication complémentaire": "Explicación adicional",
    "Demande une présentation complémentaire des éléments disponibles. Selon la configuration du service, le texte peut être rédigé avec l’aide d’une IA ou par le moteur statistique.{{v0}}": "Solicita una explicación de los datos. Según la configuración, la redacta una IA o el motor estadístico.{{v0}}",
    "Certaines analyses complémentaires sont réservées à Pro. {{v0}}.": "Algunos análisis adicionales requieren Pro. {{v0}}.",
    "Verdict": "Conclusión",
    "Facteurs clés": "Factores clave",
    "Alternative :": "Alternativa:",
    "Source : {{v0}}": "Fuente: {{v0}}",
    "Cotes par bookmaker": "Cuotas por operador",
    "Bookmaker": "Operador",
    "Données réelles (football-data.org) — forme récente et historique des confrontations directes, disponibles pour les grandes compétitions européennes suivies.": "Datos reales de football-data.org: forma y H2H en las principales competiciones europeas cubiertas.",
    "{{v0}} derniers matchs (réel)": "Últimos {{v0}} partidos (datos reales)",
    "{{v0}} {{v1}} V": "{{v0}} {{v1}} V",
    "{{v0}} {{v1}} N": "{{v0}} {{v1}} E",
    "{{v0}} {{v1}} D": "{{v0}} {{v1}} D",
    "Forme récente non disponible": "Forma reciente no disponible",
    "📅 Confrontations directes (historique réel)": "📅 Enfrentamientos directos (historial real)",
    "Nuls": "Empates",
    "Bilan agrégé des confrontations directes récentes. Détail match par match non disponible sur la source actuelle.": "Resumen agregado de H2H recientes. La fuente no ofrece el detalle por partido.",
    "La sélection « {{v0}} » porte sur le total de buts ou de points pour les équipes et la période indiquées par le marché. Elle ne dépend pas uniquement du vainqueur de la rencontre.": "«{{v0}}» se refiere al total de goles o puntos del periodo, no solo al ganador.",
    "La sélection prévoit la victoire de {{v0}}, selon la période et les règles du marché.": "Prevé la victoria de {{v0}} según el periodo y las reglas del mercado.",
    "La sélection « {{v0}} » décrit l’événement attendu dans le marché indiqué. Vérifie la période et les règles de règlement du bookmaker.": "«{{v0}}» describe el resultado esperado. Revisa el periodo y las reglas del operador.",
    "Rédaction assistée par IA ({{v0}})": "Redacción asistida por IA ({{v0}})",
    "supérieur": "por encima de",
    "inférieur": "por debajo de",
    "l’équipe indiquée": "el equipo indicado",
    "La sélection indique l’événement attendu. Vérifie le marché, la période du match et les règles de règlement avant de l’utiliser.": "Revisa el resultado, mercado, periodo y reglas de liquidación antes de utilizar la selección.",
    "Invalid value bets response": "Respuesta de value bets no válida",
    "Écart non communiqué": "Diferencia no comunicada",
    "Cela signale une opportunité possible si l’estimation est fiable.": "Oportunidad posible si la estimación es fiable.",
    "Ces chiffres ne montrent pas d’avantage positif à cette cote.": "Estas cifras no muestran ventaja positiva a esta cuota.",
    "Ta session a expiré. Reconnecte-toi pour consulter les sélections.": "Tu sesión caducó. Inicia sesión para ver las selecciones.",
    "Les sélections ne peuvent pas être chargées pour le moment. Réessaie dans quelques instants.": "No se pueden cargar las selecciones. Reinténtalo en breve.",
    "Chargement des sélections": "Cargando selecciones",
    "ne sont": "no están",
    "Aucune sélection à venir disponible pour le moment.": "No hay selecciones futuras disponibles ahora.",
    "Aucune sélection disponible pour cette date.": "No hay selecciones para esta fecha.",
    "Reviens plus tard ou actualise les données.": "Vuelve más tarde o actualiza los datos.",
    "Essaie toutes les dates à venir.": "Prueba todas las fechas futuras.",
    "Date et heure à confirmer": "Fecha y hora por confirmar",
    "Estimation WinPulse": "Estimación WinPulse",
    "Probabilité implicite de la cote": "Probabilidad implícita de la cuota",
    "WinPulse affiche une estimation de {{v0}}. La cote de {{v1}} correspond à {{v2}} en probabilité implicite : l’écart est de {{v3}}. {{v4}}": "WinPulse estima {{v0}}. La cuota {{v1}} implica {{v2}}; la diferencia es {{v3}}. {{v4}}",
    "Il manque une cote ou une probabilité valide pour expliquer l’écart de cette sélection.": "Falta una cuota o probabilidad válida para explicar la diferencia.",
    "L’écart de probabilité n’est pas un pourcentage de gain. Les cotes évoluent et l’estimation peut être erronée. Pour un marché avec remboursement, la probabilité implicite ne décrit pas à elle seule toutes les issues de règlement.": "La diferencia no es un porcentaje de ganancia. Las cuotas cambian y la estimación puede fallar. En mercados con reembolso, la probabilidad implícita no describe todas las liquidaciones.",
    "Détecteur de value bets": "Detector de value bets",
    "Des opportunités à examiner": "Oportunidades para analizar",
    "Retrouve la rencontre, son horaire, le marché conseillé et les chiffres qui expliquent chaque sélection.": "Consulta el partido, horario, mercado sugerido y cifras de cada selección.",
    "Une {{v0}} est une sélection dont la probabilité estimée dépasse le seuil implicite de la cote. L’écart, appelé {{v1}}, est exprimé ici en {{v2}}. Il dépend de la fiabilité de l’estimation.": "Un {{v0}} supera en probabilidad estimada el umbral implícito de la cuota. La diferencia o {{v1}} se expresa en {{v2}} y depende de la fiabilidad del cálculo.",
    "value bet": "value bet",
    "points de probabilité": "puntos de probabilidad",
    "Voir un exemple de calcul": "Ver ejemplo de cálculo",
    "Exemple hypothétique, pour un pari sans remboursement : à cote 2,00, le seuil implicite est 50 %. Si la probabilité réelle était 60 %, l’écart serait de 10 points et le rendement moyen théorique serait de 20 % (0,60 × 2 − 1). Cela ne garantit aucun gain et suppose une estimation correcte.": "Ejemplo sin reembolso: cuota 2,00 implica 50 %. Con probabilidad real del 60 %, la diferencia sería 10 puntos y el rendimiento medio teórico 20 % (0,60 × 2 − 1). Sin ganancias garantizadas; exige estimación correcta.",
    "Les value bets sont réservés à Pro": "Los value bets son para Pro",
    "Accède aux rencontres, dates, marchés et explications des sélections avec ton abonnement Pro.": "Pro incluye partidos, fechas, mercados y explicaciones.",
    "Créer mon compte": "Crear mi cuenta",
    "Se reconnecter": "Iniciar sesión de nuevo",
    "{{v0}} sélection{{v1}} affichée{{v2}}": "Selecciones mostradas: {{v0}}",
    "Horaires dans ton fuseau : {{v0}}.": "Horarios en tu zona: {{v0}}.",
    "Toutes les dates à venir": "Todas las fechas futuras",
    "Tri{{v0}}": "Ordenar{{v0}}",
    "Écart estimé décroissant": "Mayor diferencia estimada",
    "Date et heure": "Fecha y hora",
    "{{v0}} sélection{{v1}} dont le match a déjà commencé {{v2}} plus proposée{{v3}} ici.": "Selecciones retiradas porque su partido ya comenzó: {{v0}}.",
    "Voir toutes les dates": "Ver todas las fechas",
    "Les estimations ne garantissent aucun résultat. Vérifie les cotes et les règles du marché avant utilisation. 18+.": "Las estimaciones no garantizan resultados. Comprueba cuotas y reglas. 18+.",
    "La sélection porte sur un total {{v0}} à {{v1}} pour les buts ou points et la période indiqués dans le marché. Le vainqueur peut être différent de l’équipe favorite.": "La selección trata de un total {{v0}} {{v1}} para los goles/puntos y periodo indicados. El ganador puede no ser el favorito.",
    "Le pronostic porte sur la victoire de {{v0}}, selon la période et les règles du marché.": "Prevé la victoria de {{v0}} según el periodo y reglas del mercado.",
    "{{v0}}{{v1}} points": "{{v0}}{{v1}} puntos",
    "Foot US": "Fútbol americano",
    "Autres": "Otros",
    "Buts / points": "Goles / puntos",
    "Autres marchés": "Otros mercados",
    "Horaire non communiqué": "Horario no comunicado",
    "International": "Internacional",
    "Espagne": "España",
    "Allemagne": "Alemania",
    "Italie": "Italia",
    "Angleterre": "Inglaterra",
    "Pologne": "Polonia",
    "Finlande": "Finlandia",
    "Japon": "Japón",
    "Chine": "China",
    "Portugal": "Portugal",
    "Brésil": "Brasil",
    "Argentine": "Argentina",
    "Deux issues sont couvertes : celles indiquées dans la sélection, sur la période du marché.": "Cubre los dos resultados indicados durante el periodo del mercado.",
    "Le marché porte sur le fait que les deux équipes marquent, ou non, pendant la période indiquée.": "Indica si ambos equipos marcan durante el periodo señalado.",
    "Le résultat est évalué après application du handicap affiché. La ligne et la période du marché déterminent son règlement.": "Se aplica el hándicap, la línea y el periodo indicados. Revisa las reglas del operador.",
    "Le pari porte sur le total indiqué. Vérifie les règles de la ligne et de la période choisies.": "Se refiere al total indicado. Revisa la línea, el periodo y las reglas de liquidación.",
    "La sélection prévoit un match nul sur la période couverte.": "El pronóstico prevé un empate durante el periodo cubierto.",
    "Lis cette sélection avec son marché et sa période. La fiche du match présente les informations disponibles.": "Lee la selección junto con el mercado y periodo. La ficha muestra la información disponible.",
    "Marché réservé": "Mercado reservado",
    "Marché non communiqué": "Mercado no comunicado",
    "Compétition non communiquée": "Competición no comunicada",
    "Rencontre commencée ou horaire à vérifier": "Partido iniciado u horario por verificar",
    "Sélection à vérifier : elle n’est plus proposée avec une cote disponible": "Revisa la selección: ya no tiene una cuota disponible",
    "heure locale du navigateur": "la hora local del navegador",
    " · Marché estimé, cote à confirmer": " · Mercado estimado, confirma la cuota",
    "Confiance moyenne non disponible": "Confianza media no disponible",
    "Sélections et cotes à vérifier avant les rencontres.": "Comprueba las selecciones y cuotas antes de los partidos.",
    "Ticket enregistré": "Boleto guardado",
    "Domicile": "Local",
    "Nul": "Empate",
    "Extérieur": "Visitante",
    "Plus de 2,5 buts": "Más de 2,5 goles",
    "Plus de 1,5 but": "Más de 1,5 goles",
    "Domicile : aucun but encaissé": "Local sin encajar",
    "Extérieur : aucun but encaissé": "Visitante sin encajar",
    "Ta session a expiré. Reconnecte-toi.": "Tu sesión caducó. Inicia sesión de nuevo.",
    "Cette fonction est réservée aux abonnés. Vérifie ton accès.": "Solo para suscriptores. Comprueba tu acceso.",
    "Les actualisations sont temporairement limitées. Réessaie dans quelques instants.": "Actualizaciones limitadas temporalmente. Reinténtalo en breve.",
    "Le serveur met trop de temps à répondre. Réessaie.": "El servidor tarda demasiado. Reinténtalo.",
    "Impossible de charger les tickets enregistrés.": "No se pueden cargar los boletos guardados.",
    "Ton accès n’a pas pu être actualisé. L’enregistrement sera disponible après vérification.": "No se pudo actualizar tu acceso. Podrás guardar tras verificarlo.",
    "Impossible d’actualiser les rencontres. La dernière liste chargée reste disponible.": "No se pueden actualizar los partidos. Se conserva la última lista.",
    "Cette sélection n’est pas disponible avec une cote et un horaire utilisables. Actualise le catalogue.": "Falta una cuota u horario válido. Actualiza el catálogo.",
    "Actualise le catalogue pour vérifier ton accès aux repères.": "Actualiza el catálogo para verificar el acceso a indicadores.",
    "Les repères de marché ne sont pas disponibles. Réessaie.": "Indicadores no disponibles. Reinténtalo.",
    "Actualise le catalogue pour vérifier ton accès à l’enregistrement.": "Actualiza el catálogo para verificar el permiso de guardado.",
    "Actualise les rencontres et vérifie les sélections signalées avant d’enregistrer.": "Actualiza los partidos y revisa las selecciones señaladas antes de guardar.",
    "Ce ticket est déjà enregistré.": "Este boleto ya está guardado.",
    "Ticket enregistré dans tes combinés.": "Boleto guardado en tus combinadas.",
    "L’enregistrement n’a pas été confirmé. Vérifie la liste des tickets avant de réessayer.": "Guardado no confirmado. Revisa tus boletos antes de reintentar.",
    "Ticket copié.": "Boleto copiado.",
    "Sélectionne le texte ci-dessous pour le copier.": "Selecciona el texto de abajo para copiarlo.",
    "Ce ticket est long. Copie le texte ci-dessous pour le partager sans couper les sélections.": "El boleto es largo. Copia el texto para compartirlo completo.",
    "Ticket supprimé.": "Boleto eliminado.",
    "La suppression n’a pas été confirmée. Actualise la liste.": "Eliminación no confirmada. Actualiza la lista.",
    "Rechercher et filtrer les rencontres": "Buscar y filtrar encuentros",
    "Équipe, championnat ou pays…": "Equipo, liga o país…",
    "Choisir un sport": "Elige un deporte",
    "Chargement du programme…": "Cargando programación…",
    "Aucune rencontre pour ces filtres": "No hay encuentros con estos filtros",
    "Aucune rencontre disponible actuellement": "No hay encuentros disponibles ahora",
    "Essaie une autre équipe ou élargis les filtres.": "Prueba otro equipo o amplía los filtros.",
    "Actualise plus tard pour retrouver les prochains marchés proposés.": "Actualiza más tarde para ver próximos mercados.",
    "Ton ticket et tes sauvegardes": "Tu boleto y tus guardados",
    "Une sélection par rencontre": "Una selección por partido",
    "Replier le ticket": "Contraer boleto",
    "Ouvrir mon ticket": "Abrir mi boleto",
    "Non disponible": "No disponible",
    "Mon combiné du week-end": "Mi combinada del fin de semana",
    "Enregistrer le ticket": "Guardar boleto",
    "Actualiser les tickets enregistrés": "Actualizar boletos guardados",
    "Équipe à confirmer": "Equipo por confirmar",
    "Sélection non communiquée": "Selección no comunicada",
    "Prudent": "Prudente",
    "Modéré": "Moderado",
    "Risqué": "Arriesgado",
    "Replier": "Contraer",
    "Voir les marchés": "Ver mercados",
    "non fournie": "no disponible",
    "Retirer": "Quitar",
    "Ajouter": "Añadir",
    "Des marchés de cette rencontre sont réservés aux abonnés.": "Algunos mercados de este partido son para suscriptores.",
    "Aucune option avec une cote et un horaire disponibles.": "No hay opciones con cuota y horario válidos.",
    "Sélection réservée": "Selección reservada",
    "Réservée": "Reservada",
    "Ton combiné.{{v0}}{{v1}}": "Tu combinada.{{v0}}{{v1}}",
    "Tes choix.": "Tus decisiones.",
    "Explore les rencontres, compare les marchés et réunis tes sélections dans un ticket qui se lit en un coup d’œil.": "Explora partidos, compara mercados y crea un boleto claro.",
    "Horaires : {{v0}}{{v1}}": "Horarios: {{v0}}{{v1}}",
    "rencontres au catalogue": "partidos en el catálogo",
    "options sélectionnables": "opciones seleccionables",
    "Reconnecte-toi pour continuer": "Vuelve a iniciar sesión",
    "Ta session a expiré. Les sélections de la session précédente ont été retirées.": "Tu sesión caducó. Se retiraron las selecciones de la sesión anterior.",
    "Quelle rencontre cherches-tu ?": "¿Qué encuentro buscas?",
    "Date{{v0}}": "Fecha{{v0}}",
    "Toutes les dates": "Todas las fechas",
    "Demain": "Mañana",
    "Classer par{{v0}}": "Ordenar por{{v0}}",
    "Horaire": "Horario",
    "01 · Compose ton ticket": "01 · Crea tu boleto",
    "Les rencontres à explorer": "Encuentros para explorar",
    "{{v0}} sélection{{v1}}{{v2}}": "Selecciones: {{v0}}{{v2}}",
    "Voir le ticket": "Ver boleto",
    "Le catalogue n’a pas été vérifié depuis plus de cinq minutes. Actualise avant d’ajouter ou de partager une sélection.": "El catálogo tiene más de cinco minutos. Actualiza antes de añadir o compartir.",
    "Certaines données incomplètes n’ont pas pu être affichées.": "No se pudieron mostrar algunos datos incompletos.",
    "Chargement des rencontres": "Cargando encuentros",
    "Les options disponibles apparaîtront ici.": "Las opciones disponibles aparecerán aquí.",
    "{{v0}} sur {{v1}} rencontres affichées": "{{v0}} de {{v1}} encuentros mostrados",
    "Afficher les rencontres suivantes": "Mostrar más encuentros",
    "02 · Ton ticket": "02 · Tu boleto",
    "Mon combiné": "Mi combinada",
    "Ton ticket commence ici": "Tu boleto empieza aquí",
    "Ajoute une option sur une rencontre. Tu peux remplacer ton choix sans ajouter deux paris sur le même match.": "Añade una opción por partido. Puedes sustituirla sin duplicar el encuentro.",
    "Cote cumulée": "Cuota combinada",
    "Produit des cotes des sélections du ticket.": "Producto de las cuotas seleccionadas.",
    "Confiance moyenne du moteur": "Confianza media del motor",
    "Sports représentés": "Deportes representados",
    "La confiance moyenne ne représente pas la probabilité que le combiné passe.": "La confianza media no es la probabilidad de acertar toda la combinada.",
    "contre": "contra",
    "{{v0}} · Cote {{v1}}": "{{v0}} · Cuota {{v1}}",
    "Marché estimé · cote à confirmer": "Mercado estimado · confirma la cuota",
    "Cote actualisée : {{v0}} → {{v1}}": "Cuota actualizada: {{v0}} → {{v1}}",
    "Vider le ticket": "Vaciar boleto",
    "Nom du ticket {{v0}}{{v1}}": "Nombre del boleto {{v0}}{{v1}}",
    "(facultatif)": "(opcional)",
    "Actualise le catalogue et retire ou remplace les sélections signalées pour enregistrer ou partager le ticket.": "Actualiza y sustituye o retira las selecciones señaladas antes de guardar o compartir.",
    "Enregistrer avec Pro": "Guardar con Pro",
    "Vérifier mon accès": "Verificar mi acceso",
    "Copier": "Copiar",
    "Les options avec un cadenas demandent un abonnement. L’enregistrement des tickets est réservé aux abonnés.": "Los mercados bloqueados y el guardado de boletos requieren una suscripción.",
    "Voir les formules": "Ver planes",
    "Texte du ticket": "Texto del boleto",
    "Mes tickets enregistrés": "Mis boletos guardados",
    "Historique de tes tickets": "Historial de tus boletos",
    "Ton accès est en cours de vérification.": "Se está verificando tu acceso.",
    "Retrouve tes tickets enregistrés avec un abonnement.": "Accede a tus boletos guardados con una suscripción.",
    "Chargement des sauvegardes…": "Cargando boletos guardados…",
    "Aucun ticket enregistré pour le moment.": "Todavía no hay boletos guardados.",
    "Cote {{v0}} · {{v1}} sélection{{v2}}": "Cuota {{v0}} · Selecciones: {{v1}}",
    "{{v0}} contre {{v1}}": "{{v0}} contra {{v1}}",
    "Le détail de ce ticket n’est pas disponible.": "Los detalles del boleto no están disponibles.",
    "Ticket archivé : les horaires et cotes ne sont pas actualisés ici.": "Boleto archivado: aquí no se actualizan horarios ni cuotas.",
    "{{v0}} option{{v1}} sélectionnable{{v2}} · {{v3}} proposée{{v4}}": "Opciones disponibles: {{v0}} · Ofrecidas: {{v3}}",
    "Choix proposé · {{v0}}": "Selección propuesta · {{v0}}",
    "Une autre option de cette rencontre est dans ton ticket.": "Ya hay otra opción de este partido en tu boleto.",
    "Un seul choix par rencontre : ajouter une autre option remplace la précédente.": "Una selección por partido: una opción nueva sustituye a la anterior.",
    "Comprendre ce marché": "Comprender este mercado",
    "Afficher plus de marchés ({{v0}})": "Mostrar más mercados ({{v0}})",
    "Débloquer les marchés réservés": "Desbloquear mercados reservados",
    "Repères de marché": "Indicadores de mercado",
    "Les repères supplémentaires demandent un accès abonné vérifié. {{v0}}": "Los indicadores extra requieren acceso de suscriptor verificado. {{v0}}",
    "Chargement des repères…": "Cargando indicadores…",
    "Estimations de marché disponibles pour cette rencontre. Les données insuffisantes ne sont pas affichées.": "Estimaciones de este encuentro. No se muestran datos insuficientes.",
    "Les repères ne sont pas renseignés pour cette rencontre.": "No hay indicadores para este encuentro.",
    "Ouvrir la fiche de la rencontre": "Abrir ficha del encuentro",
    "Le total doit rester inférieur à {{v0}} sur la période couverte.": "El total debe ser inferior a {{v0}} durante el periodo cubierto.",
    "Le total doit dépasser {{v0}} sur la période couverte.": "El total debe superar {{v0}} durante el periodo cubierto.",
    "Le moteur retient {{v0}} comme vainqueur sur la période couverte.": "El motor elige la victoria de {{v0}} durante el periodo cubierto.",
    "Horaires : {{v0}}": "Horarios: {{v0}}",
    "{{v0}}. {{v1}} vs {{v2}}\n{{v3}}{{v4}}\n{{v5}}\n{{v6}} : {{v7}}\nCote : {{v8}}{{v9}}": "{{v0}}. {{v1}} vs {{v2}}\n{{v3}}{{v4}}\n{{v5}}\n{{v6}} : {{v7}}\nCuota: {{v8}}{{v9}}",
    "Cote cumulée : {{v0}}": "Cuota combinada: {{v0}}",
    "Confiance moyenne du moteur : {{v0}} % (indicateur, pas un taux de réussite)": "Confianza media del motor: {{v0}} % (indicador, no tasa de acierto medida)",
    " · Chargé à {{v0}}": " · Cargado a las {{v0}}",
    "{{v0}} rencontre{{v1}} correspond{{v2}} à tes filtres": "Encuentros que coinciden con tus filtros: {{v0}}",
    "{{v0}} sélection{{v1}} · Cote {{v2}}": "Selecciones: {{v0}} · Cuota {{v2}}",
    "Retirer {{v0}} contre {{v1}}": "Quitar {{v0}} contra {{v1}}",
    "Supprimer le ticket {{v0}}": "Eliminar boleto {{v0}}",
    "Filtrer les marchés de {{v0}}": "Filtrar mercados de {{v0}}",
    "Sécurité": "Prudente",
    "Le profil prudent, à examiner sélection par sélection.": "Perfil prudente que debes revisar selección por selección.",
    "Équilibre": "Equilibrado",
    "Un profil intermédiaire pour comparer les cotes et la confiance.": "Perfil intermedio para comparar cuotas y confianza.",
    "Le profil offensif : une cote élevée implique davantage d’incertitude.": "Perfil ofensivo: una cuota alta implica mayor incertidumbre.",
    "Cote totale non communiquée": "Cuota total no comunicada",
    "Les données reçues sont incomplètes. Réessaie pour obtenir une sélection valide.": "Datos incompletos. Reinténtalo para obtener una selección válida.",
    "Impossible d’actualiser les combinés pour le moment. Réessaie dans quelques instants.": "No se pueden actualizar las combinadas. Reinténtalo en breve.",
    "Le choix porte sur une victoire. En cas de nul sur la période couverte, le règlement de ce marché prévoit le remboursement.": "Debe ganar el equipo indicado. Si empata en el periodo cubierto, se reembolsa según las reglas del mercado.",
    "Rencontre terminée · actualise le combiné": "Partido finalizado · actualiza la combinada",
    "Rencontre commencée · actualise le combiné": "Partido iniciado · actualiza la combinada",
    "Équipe non communiquée": "Equipo no comunicado",
    "Pronostic sélectionné": "Pronóstico seleccionado",
    "Non communiquée": "No comunicada",
    "Aucun score de confiance n’a été communiqué pour cette sélection.": "No se ha comunicado una confianza para esta selección.",
    "heure locale": "hora local",
    "Combiné copié.": "Combinada copiada.",
    "La copie automatique est indisponible. Sélectionne le texte ci-dessous.": "Copia automática no disponible. Selecciona el texto de abajo.",
    "Dernier chargement": "Última carga",
    "Actualisé": "Actualizado",
    "Choisis un profil pour explorer ses sélections": "Elige un perfil para explorar sus selecciones",
    "Actualiser les combinés": "Actualizar combinadas",
    "Profil à découvrir": "Perfil para descubrir",
    "Cote non fournie": "Cuota no comunicada",
    "Accès Pro": "Acceso Pro",
    "Sélections": "Selecciones",
    "Cote totale": "Cuota total",
    "Confiance moyenne": "Confianza media",
    "Probabilité combinée estimée": "Probabilidad combinada estimada",
    "Chargement des combinés": "Cargando combinadas",
    "Une rencontre a déjà commencé ou s’est terminée. Actualise pour vérifier les sélections disponibles.": "Un partido ya comenzó o terminó. Actualiza las selecciones disponibles.",
    "Cette sélection n’a pas été actualisée depuis plus de cinq minutes. Actualise avant de la copier.": "La selección tiene más de cinco minutos. Actualiza antes de copiar.",
    "Le programme du combiné": "Programa de la combinada",
    "Les sélections, une par une": "Selecciones, una a una",
    "Présentation des rencontres": "Presentación de encuentros",
    "Récapitulatif du combiné": "Resumen de la combinada",
    "Disponible avec les sélections complètes.": "Disponible con las selecciones completas.",
    "Actualise le combiné avant de copier ses sélections.": "Actualiza la combinada antes de copiarla.",
    "La copie est disponible avec au moins deux sélections complètes, dont les horaires sont à venir.": "La copia requiere al menos dos selecciones completas de partidos futuros.",
    "Fermer le texte à copier": "Cerrar texto para copiar",
    "À confirmer": "Por confirmar",
    "Ce que signifie ce pronostic": "Qué significa este pronóstico",
    "Consulter la rencontre": "Consultar encuentro",
    "Le pronostic est réservé aux abonnés": "Pronóstico reservado a suscriptores",
    "Débloque la sélection, son marché et sa cote.": "Desbloquea la selección, el mercado y la cuota.",
    "Voir les abonnements": "Ver suscripciones",
    "Lis le match.{{v0}}{{v1}}": "Entiende el partido.{{v0}}{{v1}}",
    "Choisis ton combiné.": "Elige tu combinada.",
    "Trois profils. Chaque rencontre expliquée. Toutes les sélections réunies dans un ticket clair.": "Tres perfiles, encuentros explicados y todas las selecciones en un boleto claro.",
    "{{v0}} à {{v1}}": "{{v0}} a las {{v1}}",
    "Profil sélectionné": "Perfil seleccionado",
    "01 · Choisis ton profil": "01 · Elige tu perfil",
    "Quel combiné veux-tu explorer ?": "¿Qué combinada quieres explorar?",
    "Comparer les trois profils": "Comparar los tres perfiles",
    "Explorer ce profil": "Explorar este perfil",
    "Les indicateurs proviennent du moteur. La confiance moyenne et la probabilité combinée décrivent deux choses différentes.": "Son indicadores del motor. La confianza media y la probabilidad combinada miden cosas diferentes.",
    "La dernière sélection chargée reste affichée.": "Se conserva la última selección cargada.",
    "Préparation des sélections": "Preparando selecciones",
    "Vérification de ton accès et chargement des rencontres…": "Verificando acceso y cargando partidos…",
    "Ta session doit être renouvelée": "Debes renovar tu sesión",
    "Reconnecte-toi pour retrouver l’accès correspondant à ton compte.": "Inicia sesión de nuevo para recuperar tu acceso.",
    "Les sélections complètes": "Selecciones completas",
    "Explore les trois profils avec Pro.": "Explora los tres perfiles con Pro.",
    "Ton accès actuel ne permet pas de consulter ces combinés. Retrouve les rencontres, les marchés et les cotes en découvrant les abonnements disponibles.": "Tu acceso no incluye estas combinadas. Consulta las suscripciones para ver encuentros, mercados y cuotas.",
    "Découvrir les abonnements": "Descubrir suscripciones",
    "Les combinés n’ont pas pu être chargés": "No se pudieron cargar las combinadas",
    "Utilise le bouton Réessayer ci-dessus pour relancer la vérification.": "Pulsa Reintentar arriba para repetir la comprobación.",
    "Un combiné gratuit à découvrir": "Descubre una combinada gratuita",
    "Le profil {{v0}} est accessible avec ton compte.": "El perfil {{v0}} está disponible con tu cuenta.",
    "Voir le combiné": "Ver combinada",
    "Aucune sélection pour ce profil": "No hay selecciones para este perfil",
    "Le moteur n’a pas fourni de combiné {{v0}} pour le moment. Consulte un autre profil ou actualise plus tard.": "No hay combinada {{v0}} por ahora. Prueba otro perfil o actualiza más tarde.",
    "02 · Parcours les rencontres": "02 · Recorre los encuentros",
    "{{v0}} sélection{{v1}} · Profil {{v2}}": "Selecciones: {{v0}} · Perfil {{v2}}",
    "Première rencontre : {{v0}}": "Primer encuentro: {{v0}}",
    "Fiches": "Fichas",
    "Horaires": "Horarios",
    "Cote totale du moteur{{v0}}": "Cuota total del motor{{v0}}",
    "03 · Ton ticket": "03 · Tu boleto",
    "Combiné {{v0}}": "Combinada {{v0}}",
    "{{v0}} sélection{{v1}} réunies": "Selecciones reunidas: {{v0}}",
    "Cote totale du moteur": "Cuota total del motor",
    "Copier le ticket": "Copiar boleto",
    "Débloquer le combiné": "Desbloquear combinada",
    "Appuie dans le texte pour le sélectionner.": "Pulsa el texto para seleccionarlo.",
    "Bien lire le combiné": "Entender la combinada",
    "La confiance moyenne décrit les sélections individuellement. Elle ne correspond pas à la probabilité que tout le combiné passe.": "La confianza media describe selecciones individuales, no la probabilidad de acertar toda la combinada.",
    "La probabilité combinée est une estimation du moteur, liée à ses hypothèses sur les matchs. Elle ne constitue pas un taux de réussite mesuré.": "La probabilidad combinada es una estimación del modelo y sus hipótesis, no una tasa de acierto medida.",
    "Un combiné dépend de chacune de ses sélections. Le profil « Sécurité » reste soumis à cette incertitude.": "Cada selección cuenta. El perfil prudente también implica incertidumbre.",
    "Vérification des sélections et de ton accès…": "Verificando selecciones y acceso…",
    "WNPulse · Combiné {{v0}}": "WNPulse · Combinada {{v0}}",
    "{{v0}}. {{v1}} vs {{v2}}": "{{v0}}. {{v1}} vs {{v2}}",
    "Cote : {{v0}}": "Cuota: {{v0}}",
    "Cote totale du moteur : {{v0}}": "Cuota total del motor: {{v0}}",
    "{{v0}} sélection{{v1}} dans ce ticket": "Selecciones en este boleto: {{v0}}",
    "{{v0}} sélection{{v1}}": "Selecciones: {{v0}}",
    "{{v0}} / mois": "{{v0}} / mes",
    "{{v0}} remboursés": "{{v0}} reembolsados",
    "🎯 *Pick WinPulse*\n{{v0}} · {{v1}}\n\n*{{v2}}* vs *{{v3}}*\n👉 {{v4}} @ *{{v5}}*\nConfiance IA : {{v6}}%\nMarché : {{v7}}\n\nhttps://wnpulse.com": "🎯 *Pick WinPulse*\n{{v0}} · {{v1}}\n\n*{{v2}}* vs *{{v3}}*\n👉 {{v4}} @ *{{v5}}*\nConfianza del motor: {{v6}} %\nMercado: {{v7}}\n\nhttps://wnpulse.com",
    "Le texte libre fourni par le serveur reste affiché dans sa langue d’origine.": "El texto libre del servidor se muestra en su idioma original.",
    "/mois": "/mes",
    "Le service de scores n’est pas configuré. Contactez l’équipe WinPulse.": "Los marcadores no están configurados. Contacta con WinPulse.",
    "Le fournisseur refuse l’accès aux scores. L’équipe WinPulse doit vérifier sa configuration.": "El proveedor deniega el acceso. WinPulse debe revisar la configuración.",
    "Le quota du fournisseur de scores est épuisé. L’équipe WinPulse doit rétablir le service.": "Se agotó la cuota del proveedor. WinPulse debe restablecer el acceso.",
    "Le fournisseur limite les demandes. Une nouvelle tentative sera effectuée automatiquement.": "El proveedor limita las solicitudes. Se reintentará automáticamente.",
    "Le fournisseur de scores met trop de temps à répondre. Nouvelle tentative automatique à venir.": "El proveedor tarda demasiado. Se reintentará automáticamente.",
    "Le service de scores est temporairement indisponible. Nouvelle tentative automatique à venir.": "Marcadores temporalmente no disponibles. Se reintentará automáticamente.",
    "Les scores de ces compétitions ne sont pas disponibles auprès du fournisseur.": "El proveedor no cubre estas competiciones.",
    "Votre session a expiré ou l’accès est refusé. Reconnectez-vous pour réessayer.": "La sesión caducó o se denegó el acceso. Inicia sesión de nuevo.",
    "Le service de scores n’est pas disponible sur cette version du serveur.": "Esta versión del servidor no ofrece marcadores.",
    "Le serveur met trop de temps à répondre. Nouvelle tentative automatique à venir.": "El servidor tarda demasiado. Se reintentará automáticamente.",
    "Les scores ne peuvent pas être actualisés pour le moment. Nouvelle tentative automatique à venir.": "No se pueden actualizar los marcadores. Se reintentará automáticamente.",
    "La préparation des scores prend plus de temps que prévu. Une nouvelle tentative sera effectuée automatiquement.": "La preparación tarda más de lo previsto. Se reintentará automáticamente.",
    "Réponse des scores invalide": "Respuesta de marcadores no válida",
    "Certaines compétitions ne sont pas disponibles. Les scores reçus restent affichés.": "Algunas competiciones no están disponibles. Los marcadores recibidos siguen visibles.",
    "Les derniers scores sont trop anciens. Actualisez pour les recharger.": "Los marcadores son antiguos. Actualiza para recargarlos.",
    "Derniers scores connus": "Últimos marcadores conocidos",
    "Aucun match en direct actuellement.": "No hay partidos en directo ahora.",
    "Aucun match terminé récemment.": "No hay partidos finalizados recientemente.",
    "Aucun match à venir dans les prochaines heures.": "No hay partidos previstos en las próximas horas.",
    "Équipe domicile": "Equipo local",
    "Équipe extérieure": "Equipo visitante",
    "Compétition": "Competición",
    "Dernier score": "Último marcador",
    "À venir": "Próximos",
    "flex items-center justify-between": "flex items-center justify-between",
    "Rugby": "Rugby",
    "Autres sports": "Otros deportes",
    "Tous les pays": "Todos los países",
    "Bénin": "Benín",
    "Côte d’Ivoire": "Costa de Marfil",
    "Sénégal": "Senegal",
    "Cameroun": "Camerún",
    "Mali": "Mali",
    "France": "Francia",
    "Belgique": "Bélgica",
    "Luxembourg": "Luxemburgo",
    "Suisse": "Suiza",
    "Canada": "Canadá",
    "Maroc": "Marruecos",
    "Nigeria": "Nigeria",
    "Afrique du Sud": "Sudáfrica",
    "Réponse vidéo invalide": "Respuesta de vídeo no válida",
    "Horaire à confirmer": "Horario por confirmar",
    "Le programme vidéo ne peut pas être actualisé pour le moment. Les scores restent accessibles.": "No se puede actualizar la programación. Los marcadores siguen disponibles.",
    "L’actualisation des diffusions est temporairement limitée. Une nouvelle tentative est prévue.": "Las actualizaciones de emisiones están limitadas. Se ha programado otro intento.",
    "Le programme vidéo est temporairement indisponible. Les scores restent accessibles.": "La programación está temporalmente indisponible. Los marcadores siguen disponibles.",
    "La recherche de nouveaux directs reprendra automatiquement. Les diffusions déjà connues continuent d’être vérifiées.": "La búsqueda se reanudará automáticamente. Se siguen comprobando las emisiones conocidas.",
    "Les diffusions ne peuvent pas être actualisées pour le moment. Les scores restent accessibles.": "No se pueden actualizar las emisiones. Los marcadores siguen disponibles.",
    "Lecteur indisponible": "Reproductor no disponible",
    "Le lecteur met trop de temps à répondre": "El reproductor tarda demasiado",
    "Chargement du lecteur impossible": "No se puede cargar el reproductor",
    "Le lecteur ne répond pas. Tu peux consulter la diffusion sur YouTube.": "El reproductor no responde. Prueba la emisión en YouTube.",
    "Cette vidéo n’est pas disponible dans ce lecteur, selon les conditions du diffuseur ou ton pays.": "El vídeo no se puede reproducir aquí por las condiciones del emisor o tu país.",
    "Le lecteur n’a pas pu démarrer. Tu peux essayer directement sur YouTube.": "No se pudo iniciar. Prueba directamente en YouTube.",
    "Cette diffusion est terminée.": "Esta emisión ha terminado.",
    "Appuie sur le bouton Lecture du lecteur pour démarrer la vidéo.": "Pulsa Reproducir para iniciar el vídeo.",
    "Le lecteur ne peut pas être chargé. Tu peux consulter la diffusion sur YouTube.": "No se pudo cargar el reproductor. Abre la emisión en YouTube.",
    "Dernier score connu": "Último marcador conocido",
    "Rencontre terminée": "Encuentro finalizado",
    "Score suivi": "Marcador seguido",
    "Rencontre à venir": "Próximo encuentro",
    "La rubrique vidéo est en préparation. Les scores restent accessibles.": "Se está preparando la sección de vídeo. Los marcadores siguen disponibles.",
    "La collecte suit son calendrier. Le programme s’actualisera automatiquement.": "La recopilación sigue su calendario. La programación se actualizará automáticamente.",
    "Ajoute YOUTUBE_API_KEY dans les variables du backend et active YouTube Data API v3 dans le projet Google.": "Configura YOUTUBE_API_KEY en el backend y activa YouTube Data API v3 en Google.",
    "Impossible de demander l’actualisation des diffusions.": "No se pudo solicitar la actualización de emisiones.",
    "La recherche automatique nécessite YOUTUBE_API_KEY dans le backend. Les chaînes FIFA et FIBA sont sélectionnées par défaut.": "La búsqueda automática requiere YOUTUBE_API_KEY en el backend. FIFA y FIBA están seleccionados por defecto.",
    "Fermer le lecteur": "Cerrar reproductor",
    "Le score sélectionné s’affichera ici.": "El marcador seleccionado aparecerá aquí.",
    "Les scores disponibles apparaîtront dans cette liste dès leur chargement.": "Los marcadores aparecerán en esta lista cuando se carguen.",
    "Équipe, rencontre ou diffuseur…": "Equipo, partido o emisor…",
    "Filtrer les diffusions par sport": "Filtrar emisiones por deporte",
    "Tous les sports": "Todos los deportes",
    "Diffusion en cours selon le diffuseur": "En directo según el emisor",
    "Regarder le direct": "Ver en directo",
    "Ouvrir le programme": "Abrir programación",
    "Les diffusions vidéo sont en préparation": "Se están preparando las emisiones",
    "Aucune diffusion ne correspond à ces filtres": "Ninguna emisión coincide con los filtros",
    "Aucune diffusion intégrable disponible actuellement": "No hay emisiones integrables disponibles ahora",
    "Le programme est en cours de préparation. Il s’actualisera automatiquement.": "La programación se está preparando y se actualizará automáticamente.",
    "Retrouve les scores ci-dessous et reviens consulter les prochaines diffusions proposées.": "Consulta los marcadores y vuelve para ver las próximas emisiones.",
    "Live & Scores": "Directos y marcadores",
    "Suivi en temps réel des matchs en cours et des résultats récents. Actualisation automatique toutes les 45 secondes.": "Sigue partidos en directo y resultados recientes. Actualización automática cada 45 segundos.",
    "Scores du {{v0}}": "Marcadores del {{v0}}",
    "Le fournisseur prépare les scores. La page se mettra à jour automatiquement.": "El proveedor está preparando los marcadores. La página se actualizará automáticamente.",
    "Les scores sont temporairement indisponibles.": "Marcadores temporalmente no disponibles.",
    "Terminés{{v0}}": "Finalizados{{v0}}",
    "À venir{{v0}}": "Próximos{{v0}}",
    "Actualisé à {{v0}}": "Actualizado a las {{v0}}",
    "Ouverture du lecteur…": "Abriendo reproductor…",
    "Lecture via YouTube · {{v0}}": "Reproducción mediante YouTube · {{v0}}",
    "Consulter sur YouTube": "Abrir en YouTube",
    "Les scores se mettent à jour indépendamment de la vidéo.": "Los marcadores se actualizan independientemente del vídeo.",
    "À regarder sur WinPulse": "Para ver en WinPulse",
    "Le match, sur ton écran.": "El partido, en tu pantalla.",
    "Retrouve les directs intégrables des diffuseurs sélectionnés et suis les scores sur la même page.": "Mira emisiones integrables de emisores seleccionados y sigue los marcadores aquí.",
    "Actualiser les diffusions": "Actualizar emisiones",
    "Configuration vidéo · Administrateur": "Configuración de vídeo · Administrador",
    "La tâche vidéo n’est pas active. Vérifie les logs d’initialisation du backend.": "La tarea de vídeo está inactiva. Revisa los registros de inicio del backend.",
    "État fournisseur : {{v0}}": "Estado del proveedor: {{v0}}",
    "Vérifier la collecte": "Comprobar recopilación",
    "Un score à suivre": "Un marcador para seguir",
    "Choisis la rencontre dont tu veux suivre le score pendant la vidéo.": "Elige el marcador que quieres seguir durante el vídeo.",
    "Rencontre à suivre": "Encuentro para seguir",
    "Choisir une rencontre": "Elige un encuentro",
    "Chaîne du diffuseur": "Canal del emisor",
    "Rechercher une diffusion{{v0}}": "Buscar emisiones{{v0}}",
    "Pays de visionnage{{v0}}": "País de visualización{{v0}}",
    "Chargement du programme vidéo…": "Cargando programación…",
    "Voir sur YouTube": "Ver en YouTube",
    "Afficher toutes les diffusions": "Mostrar todas las emisiones",
    "Les vidéos sont lues via YouTube. Leur disponibilité dépend du pays et des conditions du diffuseur. Les directs disponibles ne couvrent pas nécessairement toutes les rencontres du tableau des scores.": "Los vídeos se reproducen mediante YouTube. La disponibilidad depende del país y del emisor. Puede que no cubran todos los partidos del marcador.",
    "{{v0}} recherches aujourd’hui · Sources : {{v1}} · Dernière vérification : {{v2}}.": "{{v0}} búsquedas hoy · Fuentes: {{v1}} · Última comprobación: {{v2}}.",
    "Résultat en attente": "Resultado pendiente",
    "La sélection décrit l’événement attendu dans le marché indiqué. Consulte les règles de règlement du bookmaker.": "La selección describe el resultado esperado. Consulta las reglas del operador.",
    "Réponse Montante invalide": "Respuesta de Montante no válida",
    "Ta session a expiré. Reconnecte-toi pour retrouver la montante.": "Tu sesión caducó. Inicia sesión para ver Montante.",
    "Cette action est réservée à l’administrateur ou à ton niveau d’accès.": "Esta acción requiere permisos de administrador o el nivel de acceso correspondiente.",
    "Le chargement a pris trop de temps. Réessaie dans un instant.": "La carga tardó demasiado. Reinténtalo en breve.",
    "Le service Montante est temporairement indisponible. Réessaie dans un instant.": "Montante no está disponible temporalmente. Reinténtalo en breve.",
    "Contrôle terminé. Les résultats finaux disponibles ont été pris en compte.": "Comprobación terminada. Se han aplicado los resultados finales disponibles.",
    "La série est lancée. La sélection attendra deux matchs admissibles.": "Serie iniciada. Se esperarán dos partidos elegibles.",
    "Série terminée": "Serie completada",
    "Série arrêtée": "Serie detenida",
    "Sélections publiées": "Selecciones publicadas",
    "Recherche de deux matchs": "Buscando dos partidos",
    "Nouvelle série à venir": "Próxima serie",
    "Étape": "Etapa",
    "Étapes gagnées": "Etapas ganadas",
    "Matchs publiés": "Partidos publicados",
    " Les dernières données chargées restent affichées.": " Los últimos datos cargados siguen visibles.",
    "Toutes les cotes comparées": "Todas las cuotas comparadas",
    "Le classement n’ajoute aucun bonus aux petites cotes.": "La clasificación no favorece las cuotas bajas.",
    "Sources vérifiées": "Fuentes verificadas",
    "Les nouvelles sélections exigent des cotes récentes et plusieurs sources complètes.": "Las nuevas selecciones requieren cuotas recientes y varias fuentes completas.",
    "Le droit d’attendre": "Se puede esperar",
    "Si deux matchs ne passent pas les contrôles, aucune étape n’est publiée.": "No se publica una etapa si no pasan los controles dos partidos.",
    "Contrôle…": "Comprobando…",
    "Synchroniser les résultats": "Sincronizar resultados",
    "La prochaine série apparaîtra ici dès son lancement par l’administrateur.": "La próxima serie aparecerá cuando la inicie el administrador.",
    "Nouvelle montante à venir": "Próxima serie Montante",
    "Deux matchs suffisamment documentés ne sont pas encore disponibles.": "Todavía no hay dos partidos suficientemente documentados.",
    "Le sélecteur attend deux matchs": "Esperando dos partidos",
    "Estimation du marché vérifié": "Estimación del mercado verificado",
    "MONTANTE WNPULSE": "MONTANTE WNPULSE",
    "2 matchs distincts par étape": "2 partidos distintos por etapa",
    "Deux rencontres.{{v0}}{{v1}}": "Dos partidos.{{v0}}{{v1}}",
    "Des choix expliqués.": "Decisiones explicadas.",
    "Les sélections sont comparées selon les estimations et la qualité des données. Une petite cote ne suffit pas à faire un bon choix.": "Se comparan estimaciones y calidad de datos. Una cuota baja no basta para una buena selección.",
    "Pilotage administrateur": "Controles de administrador",
    "Parcours {{v0}}": "Recorrido {{v0}}",
    "10 étapes": "10 etapas",
    "15 étapes": "15 etapas",
    "Lancer une nouvelle série": "Iniciar nueva serie",
    "La série actuelle sera archivée sur le serveur et remplacée.": "La serie actual se archivará en el servidor y será sustituida.",
    "{{v0}}Remplacer la série actuelle": "{{v0}}Sustituir serie actual",
    "Nouvelle série": "Nueva serie",
    "Diagnostic de sélection": "Diagnóstico de selección",
    "{{v0}} matchs reçus · {{v1}} événements admissibles": "{{v0}} partidos recibidos · {{v1}} eventos elegibles",
    "Parcours de la série": "Progreso de la serie",
    "{{v0}} étape{{v1}} gagnée{{v2}} sur {{v3}}": "Etapas ganadas: {{v0}} de {{v3}}",
    "Une étape annulée n’est pas une victoire. Les jours sans sélection ne font pas avancer le parcours.": "Una etapa anulada no es una victoria. Los días sin selección no avanzan la serie.",
    "Sélections · Étape {{v0}}": "Selecciones · Etapa {{v0}}",
    "Cote combinée : {{v0}}": "Cuota combinada: {{v0}}",
    "Sélection publiée avant cette mise à jour : elle reste suivie jusqu’à son règlement. Les nouvelles étapes exigent deux matchs.": "La selección anterior seguirá controlándose hasta su liquidación. Las nuevas etapas requieren dos partidos.",
    "Les mêmes sélections que les abonnés": "Las mismas selecciones que los suscriptores",
    "Débloque les rencontres, les marchés et les raisons de chaque choix.": "Desbloquea partidos, mercados y razones de cada selección.",
    "Lire l’estimation de la paire": "Entender la estimación del par",
    "Approximation théorique : {{v0}}, sous hypothèse d’indépendance.": "Aproximación teórica: {{v0}}, suponiendo independencia.",
    "Ce chiffre multiplie deux estimations du moteur. Il ne constitue pas un taux de réussite constaté. Des événements distincts peuvent encore être corrélés.": "Multiplica dos estimaciones del motor, no una tasa de acierto medida. Eventos distintos pueden estar correlacionados.",
    "Historique de la série": "Historial de la serie",
    "Les victoires, pertes et annulations restent visibles.": "Victorias, pérdidas y anulaciones siguen visibles.",
    "Aucune étape réglée pour le moment.": "Todavía no hay etapas resueltas.",
    "Étape {{v0}}": "Etapa {{v0}}",
    "{{v0}}{{v1}}{{v2}} · cote {{v3}}": "{{v0}}{{v1}}{{v2}} · cuota {{v3}}",
    "{{v0}} sélections · détails réservés aux abonnés.": "{{v0}} selecciones · detalles para suscriptores.",
    "Ce que la sélection permet de comprendre": "Comprender la selección",
    "Les petites cotes ne reçoivent aucun bonus. Le sélecteur compare la probabilité estimée, l’accord entre les sources et leur nombre. Ce score de classement n’est pas une probabilité.": "No se favorecen cuotas bajas. Se comparan probabilidad estimada, acuerdo y número de fuentes. La puntuación no es una probabilidad.",
    "Les deux matchs doivent être distincts, avec des équipes différentes, des marchés complets et des cotes récentes. Cette vérification ne supprime pas l’incertitude sportive.": "Los partidos requieren equipos distintos, mercados completos y cuotas recientes. Los controles no eliminan la incertidumbre deportiva.",
    "Les probabilités viennent du moteur existant, souvent du consensus des cotes. L’efficacité de ce nouveau filtrage devra être mesurée sur des résultats futurs, pas uniquement sur les gagnants déjà connus.": "Las probabilidades provienen del motor existente, a menudo del consenso de cuotas. El filtro debe evaluarse con resultados futuros, no solo ganadores pasados.",
    "Une seule sélection perdante arrête la série. Aucun pari ni aucune montante ne garantit un résultat.": "Una selección perdida detiene la serie. Ninguna apuesta ni serie garantiza resultados.",
    "RENCONTRE {{v0}}": "ENCUENTRO {{v0}}",
    "Sélection réservée aux abonnés": "Selección para suscriptores",
    "Sources complètes": "Fuentes completas",
    "Estimation issue du consensus des cotes, distincte d’une mesure de réussite réelle.": "Estimación del consenso de cuotas, no una tasa de acierto real medida.",
    "Rencontre commencée : la sélection reste figée en attendant son résultat.": "Partido iniciado: la selección queda fija hasta el resultado.",
    "Pourquoi cette sélection ?": "¿Por qué esta selección?",
    "Les critères détaillés n’ont pas été enregistrés pour cette ancienne sélection.": "No se guardaron criterios detallados para esta selección antigua.",
    "Cotes vérifiées : {{v0}}. Elles peuvent évoluer.": "Cuotas verificadas: {{v0}}. Pueden cambiar.",
    "Voir l’analyse du match": "Ver análisis del partido",
    "« {{v0}} » porte sur le total de buts ou de points. Le seuil et la période du marché déterminent le résultat.": "«{{v0}}» trata del total de goles o puntos. La línea y el periodo determinan la liquidación.",
    "Non renseignée": "No indicada",
    "Administrateur": "Administrador",
    "Statistiques absentes": "Estadísticas ausentes",
    "Statistiques invalides": "Estadísticas no válidas",
    "Mon profil": "Mi perfil",
    "Abonnement invalide": "Suscripción no válida",
    "Impossible de vérifier votre abonnement. Les informations affichées viennent de votre dernière connexion.": "No se pudo verificar la suscripción. Se muestran los datos de tu último acceso.",
    "Impossible de charger les résultats WinPulse. Réessayez dans un instant.": "No se pueden cargar los resultados WinPulse. Reinténtalo en breve.",
    "Votre profil a été actualisé.": "Tu perfil se ha actualizado.",
    "Impossible d’actualiser votre profil.": "No se puede actualizar tu perfil.",
    "Votre consentement aux messages WhatsApp a été retiré.": "Se ha retirado tu consentimiento para mensajes WhatsApp.",
    "Impossible de modifier votre choix WhatsApp.": "No se pudo modificar tu preferencia WhatsApp.",
    "Email non renseigné": "Email no indicado",
    "Date d’expiration non renseignée.": "Fecha de vencimiento no indicada.",
    "Passer Pro": "Pasar a Pro",
    "Voir l’offre Pro": "Ver oferta Pro",
    "Gérer mon abonnement": "Gestionar mi suscripción",
    "Pronostics gratuits selon les disponibilités": "Pronósticos gratuitos según disponibilidad",
    "Track Record public complet": "Historial público completo",
    "Compte personnel WinPulse": "Cuenta personal WinPulse",
    "Tous les pronostics et combinés": "Todos los pronósticos y combinadas",
    "Analyses IA complètes": "Análisis detallados",
    "Combo Builder et value bets": "Creador de combinadas y value bets",
    "Résultats confirmés": "Resultados confirmados",
    "Remboursés": "Reembolsados",
    "Non renseigné": "No indicado",
    "Membre depuis": "Miembro desde",
    "Vous avez autorisé WinPulse à vous contacter sur votre numéro WhatsApp. Vous pouvez retirer ce consentement à tout moment.": "Autorizaste a WinPulse a contactarte por WhatsApp. Puedes retirar el consentimiento cuando quieras.",
    "Vous n’avez pas de consentement actif pour les messages WhatsApp de WinPulse.": "No tienes un consentimiento activo para mensajes WhatsApp de WinPulse.",
    "Autorisé": "Autorizado",
    "Non autorisé": "No autorizado",
    "Mon espace WinPulse": "Mi espacio WinPulse",
    "Résultats": "Resultados",
    "Résultats WinPulse": "Resultados WinPulse",
    "Mon compte": "Mi cuenta",
    "Votre accès actuel": "Tu acceso actual",
    "Vérification de votre abonnement…": "Verificando suscripción…",
    "Les fonctionnalités Pro sont accessibles avec vos droits administrateur.": "Las funciones Pro están disponibles con tus permisos de administrador.",
    "{{v0}} jour{{v1}} restant{{v2}}": "Días restantes: {{v0}}",
    "Votre ancien accès payant est arrivé à expiration.": "Tu acceso de pago anterior ha vencido.",
    "Votre ancien accès Elite reste reconnu. L’offre actuellement proposée est WinPulse Pro.": "Tu acceso Elite anterior se reconoce. La oferta actual es WinPulse Pro.",
    "Découvrez les pronostics gratuits disponibles et les résultats publics.": "Descubre los pronósticos gratuitos disponibles y los resultados públicos.",
    "Consultez l’offre complète et les modalités de paiement sur la page Abonnement.": "Consulta Suscripción para ver la oferta y las formas de pago.",
    "Les résultats publics de WinPulse": "Resultados públicos WinPulse",
    "Ces chiffres concernent les pronostics de la plateforme, pas les paris de votre compte. Ils sont visibles en Gratuit comme en Pro pour vous permettre de consulter notre historique.": "Estas cifras son de la plataforma, no de tus apuestas personales. Usuarios gratuitos y Pro pueden consultar el historial.",
    "Bilan des résultats confirmés": "Balance de resultados confirmados",
    "Cumul du Track Record, tous sports et tous niveaux.": "Historial acumulado de todos los deportes y niveles.",
    "Aucun résultat confirmé pour le moment": "Todavía no hay resultados confirmados",
    "Le bilan se mettra à jour lorsque les pronostics seront résolus.": "El balance se actualizará cuando se resuelvan los pronósticos.",
    "Taux de réussite WinPulse": "Tasa de acierto WinPulse",
    "Gagnés ÷ (gagnés + perdus). Les remboursements et les pronostics en attente ne sont pas inclus.": "Ganados ÷ (ganados + perdidos). Se excluyen reembolsados y pendientes.",
    "Et mes statistiques personnelles ?": "¿Y mis estadísticas personales?",
    "Elles nécessitent un historique des paris que vous avez réellement suivis. Aucun suivi personnel n’est relié à cette page actuellement : elle n’affiche donc pas de taux de réussite, de ROI ou de gains attribués à votre compte.": "Las estadísticas personales requieren registrar tus apuestas. Aquí no hay seguimiento personal: no se atribuyen aciertos, ROI ni ganancias a tu cuenta.",
    "Consulter le Track Record complet": "Ver historial completo",
    "Mes informations": "Mis datos",
    "Ces informations correspondent aux données enregistrées sur votre compte.": "Estos datos corresponden a los registrados en tu cuenta.",
    "Messages WhatsApp": "Mensajes WhatsApp",
    "{{v0}}Retirer mon consentement": "{{v0}}Retirar mi consentimiento",
    "Voir les pronostics": "Ver pronósticos",
    "Voir les résultats publics": "Ver resultados públicos",
    "Actuel": "Actual",
    "{{v0}} gagnés, {{v1}} perdus, {{v2}} remboursés": "{{v0}} ganados, {{v1}} perdidos, {{v2}} reembolsados",
    "Non communiqué": "No indicado",
    "Sélections et cotes à vérifier avant le début des rencontres.": "Comprueba las selecciones y cuotas antes de los partidos.",
    "Le serveur met trop de temps à répondre. Tu peux réessayer.": "El servidor tarda demasiado. Reinténtalo.",
    "Deux issues sont couvertes : celles indiquées par la sélection. Vérifie la période à laquelle le marché s’applique.": "Cubre los dos resultados indicados durante el periodo del mercado.",
    "Le pari concerne le fait que les deux équipes marquent, ou non, pendant la période couverte par le marché.": "Indica si ambos equipos marcan durante el periodo señalado.",
    "Le résultat est évalué après application du handicap indiqué. La ligne et la période du marché déterminent le règlement.": "Se aplica el hándicap, la línea y el periodo indicados. Revisa las reglas del operador.",
    "Le pari porte sur le total indiqué. Les règles de règlement dépendent de la ligne et de la période choisies.": "Se refiere al total indicado. Revisa la línea, el periodo y las reglas de liquidación.",
    "La sélection prévoit un match nul sur la période couverte par le marché.": "El pronóstico prevé un empate durante el periodo cubierto.",
    "Le pronostic se lit avec son marché : consulte la fiche du match pour vérifier la période et les informations disponibles.": "Lee la selección junto con el mercado y periodo. La ficha muestra la información disponible.",
    "Indisponible": "No disponible",
    "Pronostic réservé": "Selección reservada",
    "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.": "El total debe ser inferior a {{v0}} durante el periodo cubierto.",
    "Le total doit dépasser {{v0}} sur la période couverte par ce marché.": "El total debe superar {{v0}} durante el periodo cubierto.",
    "Le moteur retient {{v0}} comme vainqueur sur la période couverte par le marché.": "El motor elige la victoria de {{v0}} durante el periodo cubierto.",
    "Cette sélection couvre deux issues du match : celles indiquées dans le pronostic. Elle ne désigne pas nécessairement un vainqueur unique.": "Cubre los dos resultados indicados durante el periodo del mercado.",
    "L’équipe indiquée doit gagner. Si la rencontre se termine sur un nul, la mise est remboursée selon les règles du marché.": "Debe ganar el equipo indicado. Si empata en el periodo cubierto, se reembolsa según las reglas del mercado.",
    "Le pronostic porte sur le fait que les deux équipes marquent ou non pendant la période indiquée par le marché.": "Indica si ambos equipos marcan durante el periodo señalado.",
    "Le résultat est évalué après application du handicap indiqué dans la sélection. La période et les règles de règlement du bookmaker sont à vérifier.": "Se aplica el hándicap, la línea y el periodo indicados. Revisa las reglas del operador.",
    "La sélection prévoit un match nul pendant la période indiquée par le marché.": "El pronóstico prevé un empate durante el periodo cubierto.",
    "La double chance couvre deux issues de la rencontre. Les deux issues couvertes sont celles indiquées dans la sélection.": "Cubre los dos resultados indicados durante el periodo del mercado.",
    "La sélection vise la victoire de l’équipe indiquée. Si la rencontre se termine sur un match nul, la mise est remboursée selon les règles du marché.": "Debe ganar el equipo indicado. Si empata en el periodo cubierto, se reembolsa según las reglas del mercado.",
    "Ce marché porte sur le fait que les deux équipes marquent ou non pendant la période indiquée. Il ne désigne pas le vainqueur du match.": "Indica si ambos equipos marcan durante el periodo señalado.",
    "Le résultat est évalué après application du handicap indiqué dans la sélection. Vérifie aussi la période concernée et les règles de règlement du bookmaker.": "Se aplica el hándicap, la línea y el periodo indicados. Revisa las reglas del operador.",
    "Ce marché porte sur le total de buts ou de points, pour les équipes et la période indiquées dans la sélection.": "Se refiere al total indicado. Revisa la línea, el periodo y las reglas de liquidación.",
    "Le pronostic porte sur un match nul pendant la période indiquée par le marché.": "El pronóstico prevé un empate durante el periodo cubierto.",
    "Annulé": "Reembolsados",
    "La sélection prévoit un match nul dans la période couverte.": "El pronóstico prevé un empate durante el periodo cubierto.",
    "Le résultat se juge après application du handicap indiqué pour l’équipe sélectionnée.": "Se aplica el hándicap, la línea y el periodo indicados. Revisa las reglas del operador.",
    "La sélection prévoit la victoire de {{v0}}, selon les règles de ce marché.": "El motor elige la victoria de {{v0}} durante el periodo cubierto.",
    "Jackpot": "Jackpot",
    "ring-2 ring-rose-500/40": "ring-2 ring-rose-500/40",
    "PRO": "PRO",
    "vs": "vs",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "KOUKPAKI VIANEY": "KOUKPAKI VIANEY",
    "WinPulse Pro": "WinPulse Pro",
    "pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-8": "pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-8",
    "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8": "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8",
    "calc(4rem + env(safe-area-inset-bottom))": "calc(4rem + env(safe-area-inset-bottom))",
    "FCFA{{v0}}": "FCFA{{v0}}",
    "{{v0}} FCFA": "{{v0}} FCFA",
    "Gemini": "Gemini",
    "Claude": "Claude",
    "edge": "edge",
    "{{v0}} vs {{v1}}": "{{v0}} vs {{v1}}",
    "chez {{bookmaker}}": "en {{bookmaker}}",
    "Vainqueur (1X2)": "Ganador (1X2)",
    "Total buts/points": "Total de goles/puntos",
    "Total de buts": "Total de goles",
    "Cartons": "Tarjetas",
    "Corners": "Córneres",
    "Mi-temps": "Descanso",
    "Match nul": "Empate",
    "Plus de {{line}} buts": "Más de {{line}} goles",
    "Moins de {{line}} buts": "Menos de {{line}} goles",
    "Plus de {{line}} points": "Más de {{line}} puntos",
    "Moins de {{line}} points": "Menos de {{line}} puntos",
    "Plus de {{line}} corners": "Más de {{line}} córneres",
    "Moins de {{line}} corners": "Menos de {{line}} córneres",
    "Plus de {{line}} cartons": "Más de {{line}} tarjetas",
    "Moins de {{line}} cartons": "Menos de {{line}} tarjetas",
    "TERMINÉ": "FINALIZADO",
    "EN DIRECT": "EN DIRECTO",
    "Pick verrouillé": "Selección bloqueada",
    "Passe Pro pour voir l’analyse": "Pásate a Pro para ver el análisis",
    "Avantage estimé : {{edge}}": "Ventaja estimada: {{edge}}",
    "Analyse en cours…": "Análisis en curso…",
    "Autres marchés analysés": "Otros mercados analizados",
    "Partager WhatsApp (Admin)": "Compartir en WhatsApp (Admin)",
    "Pronostic à risque réduit": "Pronóstico de menor riesgo",
    "Pronostic à risque modéré": "Pronóstico de riesgo moderado",
    "Pronostic risqué": "Pronóstico arriesgado",
    "Victoire de {{team}}": "Victoria de {{team}}",
    "Plus de {{line}}": "Más de {{line}}",
    "Moins de {{line}}": "Menos de {{line}}",
    "Oui": "Sí",
    "Non": "No",
    "Les deux équipes marquent : Oui": "Ambos equipos marcan: Sí",
    "Les deux équipes marquent : Non": "Ambos equipos marcan: No"
  },
  "pt": {
    "Choisir la langue": "Escolher idioma",
    "Langue de l’interface": "Idioma da interface",
    "Dashboard": "Painel",
    "Live": "Ao vivo",
    "Aujourd'hui": "Hoje",
    "À la une": "Destaques",
    "Combinés": "Acumuladas",
    "Combo Builder": "Criador de acumuladas",
    "Value bets": "Apostas de valor",
    "Montante": "Progressão",
    "Track record": "Histórico de resultados",
    "Profil": "Perfil",
    "Parrainage": "Indicações",
    "Abonnement": "Assinatura",
    "Admin": "Administração",
    "New": "Novo",
    "10J": "10d",
    "Free": "Grátis",
    "Ton pouls de gagnant": "Fica à frente do jogo",
    "Connecté": "Sessão iniciada",
    "Déconnexion": "Terminar sessão",
    "Plus d'options": "Mais opções",
    "Fermer": "Fechar",
    "Plus": "Mais",
    "Tableau": "Início",
    "Direct": "Ao vivo",
    "Jour": "Dia",
    "Créer": "Criar",
    "Blog": "Blog",
    "Mentions légales": "Aviso legal",
    "CGV": "Condições de venda",
    "Confidentialité": "Privacidade",
    "Jeu responsable · 18+": "Jogo responsável · 18+",
    "© 2026 WinPulse · Dublin, Irlande": "© 2026 WinPulse · Dublin, Irlanda",
    "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.": "Foi iniciada uma sessão nesta conta noutro dispositivo ou navegador. Esta sessão foi encerrada.",
    "Ta session a expiré. Reconnecte-toi pour continuer.": "A tua sessão expirou. Inicia sessão novamente para continuar.",
    "EN COURS": "EM CURSO",
    "ÉCHOUÉE": "SEM SUCESSO",
    "TERMINÉE": "CONCLUÍDA",
    "AUCUNE": "NENHUMA",
    "Aucune montante active.": "Não existe uma progressão ativa.",
    "Impossible de charger la montante.": "Não foi possível carregar a progressão.",
    "Impossible d'actualiser la montante.": "Não foi possível atualizar a progressão.",
    "Le capital initial doit être un nombre positif.": "O valor inicial tem de ser um número positivo.",
    "La montante doit durer 10 ou 15 jours.": "A progressão tem de durar 10 ou 15 dias.",
    "Impossible de démarrer la montante.": "Não foi possível iniciar a progressão.",
    "Montante WinPulse": "Progressão WinPulse",
    "10 → 15 jours": "10 → 15 dias",
    "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.": "O motor seleciona prognósticos existentes que cumprem os seus critérios. Um dia ganho faz avançar a série; um dia perdido termina-a. Se nenhuma seleção cumprir os critérios, o módulo aguarda.",
    "Actualiser": "Atualizar",
    "Montante indisponible": "Progressão indisponível",
    "Contrôle administrateur": "Controlos de administração",
    "Montante 10 jours": "Progressão de 10 dias",
    "Montante 15 jours": "Progressão de 15 dias",
    "Capital initial": "Valor inicial",
    "Démarrer": "Iniciar",
    "Recommencer": "Recomeçar",
    "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.": "Só a administração pode iniciar ou reiniciar a série, para evitar que os utilizadores a reinicializem.",
    "Chargement de la montante…": "A carregar a progressão…",
    "Aucune montante active": "Não existe uma progressão ativa",
    "L'administrateur doit lancer une montante de 10 ou 15 jours.": "A administração tem de iniciar uma progressão de 10 ou 15 dias.",
    "progression": "progresso",
    "mise de départ": "valor de partida",
    "Capital théorique": "Valor teórico",
    "si les journées passent": "se os dias forem bem-sucedidos",
    "Progression": "Progresso",
    "de la série": "da série",
    "Progression de la série": "Progresso da série",
    "Jour {{day}} sur {{total}}": "Dia {{day}} de {{total}}",
    "Pronostics du jour": "Prognósticos de hoje",
    "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.": "As seleções dependem dos critérios e dos dados disponíveis. Não é garantido um intervalo fixo de odds.",
    "Pick {{number}}": "Seleção {{number}}",
    "Confiance": "Confiança",
    "Début :": "Início:",
    "En attente d'un pick qualifié": "A aguardar uma seleção válida",
    "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.": "O módulo nunca força um prognóstico que não cumpre os seus critérios.",
    "Historique": "Histórico",
    "Aucune journée terminée.": "Ainda não existem dias concluídos.",
    "GAGNÉ": "GANHO",
    "REMBOURSÉ": "ANULADO",
    "PERDU": "PERDIDO",
    "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.": "Nenhuma aposta desportiva é garantida. A progressão limita o número de seleções, mas não elimina o risco. 18+ · Jogo responsável.",
    "Chargement…": "A carregar…",
    "Analyses sportives": "Análise desportiva",
    "Historique des résultats": "Histórico de resultados",
    "Articles": "Artigos",
    "Ouvrir l'app": "Abrir a aplicação",
    "Connexion": "Iniciar sessão",
    "S'inscrire": "Registar",
    "Démarrer gratuit": "Começar grátis",
    "Pronostics · Analyses · Résultats publics": "Prognósticos · Análises · Resultados públicos",
    "Vise la victoire avec nos pronostics.": "Aponta à vitória com os nossos prognósticos.",
    "Garde une longueur d’avance.": "Mantém-te um passo à frente.",
    "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.": "Descobre os prognósticos do dia e as nossas análises. Começa grátis e adere ao Pro para explorar as seleções e acumuladas dos assinantes.",
    "Découvrir les pronostics": "Explorar prognósticos",
    "Découvrir l’offre Pro": "Conhecer o Pro",
    "Consulter l’historique complet": "Ver o histórico completo",
    "Inscription sans carte": "Registo sem cartão",
    "Résultats publics": "Resultados públicos",
    "Compte gratuit": "Conta gratuita",
    "Pronostics disponibles": "Prognósticos disponíveis",
    "Chargement des analyses…": "A carregar análises…",
    "Les analyses ne sont pas disponibles pour le moment.": "As análises não estão disponíveis neste momento.",
    "Réessayer": "Tentar novamente",
    "Les analyses du jour arrivent prochainement.": "As análises do dia estarão disponíveis em breve.",
    "Consulte l’historique de résultats en attendant les prochaines sélections.": "Consulta o histórico de resultados enquanto aguardas as próximas seleções.",
    "Analyse réservée Pro": "Análise exclusiva Pro",
    "Indice : {{value}} %": "Indicador: {{value}}%",
    "Les indices d’analyse ne garantissent aucun résultat.": "Os indicadores de análise não garantem resultados.",
    "Ouvrir l’application": "Abrir a aplicação",
    "Créer mon compte gratuit": "Criar a minha conta gratuita",
    "Historique des pronostics": "Histórico de prognósticos",
    "Les résultats d’hier": "Resultados de ontem",
    "Matchs du {{date}}.": "Jogos de {{date}}.",
    "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.": "Uma seleção dos prognósticos ganhos de ontem do nosso histórico, por ordem decrescente de odds.",
    "Voir tous les résultats": "Ver todos os resultados",
    "Chargement des résultats d’hier…": "A carregar os resultados de ontem…",
    "Le bilan d’hier n’est pas disponible pour le moment.": "O resumo de ontem não está disponível neste momento.",
    "Tu peux consulter l’historique complet des résultats.": "Podes consultar o histórico completo de resultados.",
    "Gagnants": "Ganhos",
    "Perdants": "Perdidos",
    "En attente": "Pendentes",
    "Annulés / remboursés": "Anulados / reembolsados",
    "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.": "Total de prognósticos: {{count}}. Os cartões abaixo mostram apenas uma seleção dos ganhos.",
    "Aucun pronostic publié pour les matchs de cette journée.": "Não foram publicados prognósticos para os jogos desse dia.",
    "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.": "Não existem prognósticos ganhos confirmados nesse dia. O resumo continua visível acima.",
    "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.": "Os detalhes dos prognósticos ganhos ainda não estão disponíveis aqui. Consulta o histórico completo.",
    "Gagné": "Ganho",
    "Cote publiée": "Odd publicada",
    "Score final": "Resultado final",
    "Pronostic publié avant le match · résultat confirmé.": "Prognóstico publicado antes do jogo · resultado confirmado.",
    "Les résultats passés ne garantissent pas les prochains résultats.": "Os resultados anteriores não garantem resultados futuros.",
    "COMMENT UTILISER WINPULSE": "COMO UTILIZAR O WINPULSE",
    "Une analyse pro, claire et immédiate": "Análise desportiva clara e acessível",
    "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.": "Consulta as análises, verifica os resultados e mantém o controlo das tuas decisões.",
    "Explications de match": "Explicações do jogo",
    "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.": "Compreende as seleções com os dados disponíveis, através de explicações locais ou apoio de IA quando configurado.",
    "Scoring rigoureux": "Indicadores de análise",
    "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.": "Consulta os indicadores disponíveis para comparar seleções. Um indicador não garante sucesso.",
    "Combinés par profil": "Acumuladas por perfil",
    "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.": "Compara as seleções e os níveis de risco disponíveis. Nenhuma acumulada está isenta de risco.",
    "Track record transparent": "Histórico transparente",
    "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.": "Histórico público, ROI, taxa de acerto e odds médias. Incluímos prognósticos ganhos e perdidos.",
    "Value bets détectés": "Deteção de apostas de valor",
    "Compare les estimations et les cotes proposées. Les estimations restent incertaines.": "Compara as estimativas com as odds propostas. As estimativas continuam incertas.",
    "Découverte gratuite": "Descoberta gratuita",
    "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.": "Cria a tua conta sem pagar. Depois consulta a oferta Pro na tua área.",
    "Retrouve ton code et les conditions du programme dans ton compte.": "Encontra o teu código e as condições do programa na tua conta.",
    "Voir mon code": "Ver o meu código",
    "ABONNEMENT": "ASSINATURA",
    "Choisis ton accès": "Escolhe o teu acesso",
    "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.": "Descobre o WinPulse grátis. Adere ao Pro para aceder a prognósticos, acumuladas e ferramentas dos assinantes.",
    "Pour découvrir": "Para descobrir",
    "Sélections gratuites disponibles": "Seleções gratuitas disponíveis",
    "Tous les matchs (cotes visibles)": "Todos os jogos com odds visíveis",
    "Track record public": "Histórico público",
    "pour 30 jours": "por 30 dias",
    "Accès complet": "Acesso completo",
    "Tous les pronostics débloqués": "Todos os prognósticos desbloqueados",
    "Tous les combinés du jour": "Todas as acumuladas do dia",
    "Explications des pronostics": "Explicações dos prognósticos",
    "Value bets et Combo Builder": "Apostas de valor e criador de acumuladas",
    "Montante premium": "Progressão premium",
    "Support WhatsApp prioritaire": "Apoio prioritário por WhatsApp",
    "Passer à Pro": "Aderir ao Pro",
    "© 2026 WinPulse · Joue responsable · 18+": "© 2026 WinPulse · Joga com responsabilidade · 18+",
    "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.": "Os prognósticos são análises estatísticas, não garantias. Aposta apenas o que podes perder. O WinPulse não aceita apostas nem aposta pelos utilizadores.",
    "Renseigne ton nom.": "Indica o teu nome.",
    "Ton numéro WhatsApp est obligatoire pour créer ton compte.": "O teu número WhatsApp é obrigatório para criar a conta.",
    "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.": "Indica o número com + e o indicativo do país, por exemplo +2250700000000.",
    "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.": "O formulário precisa de ser atualizado. Atualiza a página e tenta novamente.",
    "L’inscription n’a pas abouti. Réessaie dans un instant.": "O registo não foi concluído. Tenta novamente dentro de instantes.",
    "Analyse les matchs. Vérifie les résultats. Décide toi-même.": "Analisa os jogos. Verifica os resultados. Decide por ti.",
    "Commence gratuitement, sans carte bancaire.": "Começa grátis, sem cartão bancário.",
    "Historique public des résultats": "Histórico público de resultados",
    "Aucun paiement pour créer le compte": "Sem pagamento para criar a conta",
    "Invitation détectée": "Convite detetado",
    "WinPulse · 18+ · Joue responsable": "WinPulse · 18+ · Joga com responsabilidade",
    "100 % gratuit": "100% grátis",
    "Ton accès gratuit est presque prêt": "O teu acesso gratuito está quase pronto",
    "Crée ton compte pour découvrir WinPulse.": "Cria a tua conta para descobrir o WinPulse.",
    "Gratuit": "Grátis",
    "0 FCFA": "0 FCFA",
    "Sans CB": "Sem cartão",
    "Aucun paiement": "Sem pagamento",
    "Libre": "Tu escolhes",
    "Sans engagement": "Sem compromisso",
    "Nom": "Nome",
    "Ton nom complet": "O teu nome completo",
    "Email": "Email",
    "vous@email.com": "tu@email.com",
    "Numéro WhatsApp": "Número WhatsApp",
    "(obligatoire)": "(obrigatório)",
    "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.": "Inclui + e o indicativo do país: +33 França, +353 Irlanda, +225 Costa do Marfim, +229 Benim, +223 Mali.",
    "Mot de passe": "Palavra-passe",
    "10 caractères minimum": "Mínimo de 10 caracteres",
    "J’ai un code parrainage": "Tenho um código de indicação",
    "Code parrainage": "Código de indicação",
    "(optionnel)": "(opcional)",
    "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.": "Aceito receber no WhatsApp ofertas WinPulse e convites para os seus grupos ou comunidades privadas, através de mensagens manuais ou automáticas. Esta autorização é facultativa e não é necessária para criar a conta. Posso retirá-la no meu perfil.",
    "Création du compte…": "A criar a conta…",
    "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.": "Não é pedido qualquer pagamento no registo. O WinPulse fornece análises estatísticas e não garante ganhos.",
    "Politique de confidentialité": "Política de privacidade",
    "Déjà inscrit ?": "Já tens conta?",
    "Se connecter": "Iniciar sessão",
    "18+ · Joue responsable": "18+ · Joga com responsabilidade",
    "Bienvenue !": "Bem-vindo!",
    "Erreur {{status}}": "Erro {{status}}",
    "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.": "O servidor não respondeu. Verifica a ligação à internet e tenta novamente.",
    "Erreur inconnue": "Erro desconhecido",
    "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.": "Consulta os teus prognósticos, análises e resultados disponíveis na tua área. Nenhum resultado é garantido.",
    "© 2026 WinPulse · 18+ · Joue responsable": "© 2026 WinPulse · 18+ · Joga com responsabilidade",
    "Accède à tes pronostics du jour": "Acede aos teus prognósticos do dia",
    "Mot de passe oublié ?": "Esqueceste-te da palavra-passe?",
    "Connexion en cours…": "A iniciar sessão…",
    "Pas encore de compte ?": "Ainda não tens conta?",
    "Créer un compte gratuit": "Criar uma conta gratuita",
    "Cache de connexion effacé. Réessaye maintenant.": "Cache de início de sessão limpa. Tenta novamente.",
    "Le navigateur bloque l’accès au stockage local.": "O navegador bloqueia o acesso ao armazenamento local.",
    "Problème de connexion ? Effacer le cache de connexion": "Problemas ao entrar? Limpar a cache de sessão",
    "Email ou mot de passe incorrect": "Email ou palavra-passe incorretos",
    "Email deja utilise": "Este email já está a ser utilizado",
    "Le numéro WhatsApp est obligatoire pour créer un compte": "É necessário um número WhatsApp para criar a conta",
    "Le mot de passe doit contenir au moins 10 caractères": "A palavra-passe tem de conter pelo menos 10 caracteres",
    "Choisis un mot de passe moins courant": "Escolhe uma palavra-passe menos comum",
    "Choisis un mot de passe moins répétitif": "Escolhe uma palavra-passe menos repetitiva",
    "Le mot de passe ne doit pas contenir ton adresse email": "A palavra-passe não deve conter o teu email",
    "Trop de tentatives. Réessaie plus tard.": "Demasiadas tentativas. Tenta novamente mais tarde.",
    "Actualisation en cours…": "A atualizar…",
    "Football": "Futebol",
    "Basketball": "Basquetebol",
    "Tennis": "Ténis",
    "en attente": "Pendentes",
    "Sport": "Desporto",
    "En direct{{v0}}": "EM DIRETO{{v0}}",
    "Terminé": "TERMINADO",
    "{{v0}} en direct": "{{v0}} EM DIRETO",
    "Hockey": "Hóquei",
    "Tous les marchés": "Todos os mercados",
    "Vainqueur": "Vencedor",
    "Mon ticket WNPulse": "Mon ticket WNPulse",
    "Les deux équipes marquent": "Ambas marcam",
    "Effacer la recherche": "Limpar pesquisa",
    "WNPULSE · COMBO BUILDER": "WNPULSE · COMBO BUILDER",
    "Aujourd’hui": "Hoje",
    "Cote {{v0}}": "Odd {{v0}}",
    "Réinitialiser les filtres": "Repor filtros",
    "WhatsApp": "WhatsApp",
    "Confiance {{v0}}": "Confiança {{v0}}",
    "Clipboard unavailable": "Clipboard unavailable",
    "Cote": "Odd",
    "Confiance du moteur": "Confiança do motor",
    "WNPULSE · LES COMBINÉS": "WNPULSE · LES COMBINÉS",
    "Tous": "Todos",
    "🏆 Victoire": "🏆 Vencedor",
    "Double chance": "Dupla hipótese",
    "🔄 Double chance": "🔄 Dupla hipótese",
    "Handicap": "Handicap",
    "⚖️ Handicap": "⚖️ Handicap",
    "🟢 SÛR": "🟢 MENOR RISCO",
    "🟡 MODÉRÉ": "🟡 MODERADO",
    "🔴 RISQUÉ": "🔴 ARRISCADO",
    "LIVE": "EM DIRETO",
    "Passe Pro pour débloquer": "Adere ao Pro para desbloquear",
    "Pronostic": "Prognóstico",
    "Partager sur WhatsApp": "Partilhar no WhatsApp",
    "Gagnés": "Ganhos",
    "Perdus": "Perdidos",
    "Perdu": "PERDIDO",
    "Marché": "Mercado",
    "Découvrir Pro": "Conhecer Pro",
    "{{v0}} gagnés": "{{v0}} Ganhos",
    "{{v0}} perdus": "{{v0}} Perdidos",
    "📈 Over 2.5": "📈 Mais de 2,5",
    "🎯 BTTS": "🎯 Ambas marcam",
    "⚽ Over/Under": "⚽ Mais/Menos",
    "over 2": "over 2",
    "les deux": "ambas",
    "WhatsApp ouvert": "WhatsApp aberto",
    "Partager sur WhatsApp (Admin)": "Partilhar no WhatsApp (Admin)",
    "Sélection éditoriale automatique": "Seleção editorial automática",
    "À la une — Top picks du jour": "Destaques — Seleções do dia",
    "Les pronostics avec la plus haute confiance, tous sports confondus.{{v0}}": "Prognósticos de maior confiança de todos os desportos.{{v0}}",
    "{{v0}} picks analysés": "{{v0}} seleções analisadas",
    "1 pick visible · {{v0}} verrouillés": "1 seleção visível · {{v0}} bloqueadas",
    "Passe Pro pour voir tous les picks et les 3 combinés du jour.": "Adere ao Pro para ver os prognósticos e combinadas disponíveis.",
    "Débloquer": "Desbloquear",
    "Aucun pick pour ce marché.": "Sem seleções para este mercado.",
    "Voir tous les picks": "Ver todas as seleções",
    "Pronostic verrouillé": "Prognóstico bloqueado",
    "Marché : {{v0}}": "Mercado: {{v0}}",
    "Confiance IA : {{v0}}%": "Confiança do motor: {{v0}} %",
    "Un seul prix. Tout WinPulse. Sans compromis.": "Um preço. Toda a WinPulse.",
    "Accès illimité à tous les pronostics, tous les jours, sur 7 sports": "Acesso ilimitado aos prognósticos disponíveis em 7 desportos",
    "Tous les combinés (Sûr, Booster, Extra, Jackpot) débloqués": "Desbloqueia todos os perfis de combinadas disponíveis",
    "Chaque match analysé sur tous ses marchés": "Análise de todos os mercados disponíveis por jogo",
    "Combo Builder et détecteur de value bets": "Criador de combinadas e detetor de value bets",
    "Analyse IA experte sur chaque match": "Explicações detalhadas dos prognósticos",
    "Montante WinPulse avec picks débloqués": "Montante WinPulse com seleções desbloqueadas",
    "Track Record public et vérifiable": "Histórico público e verificável",
    "Support prioritaire par WhatsApp": "Apoio prioritário por WhatsApp",
    "Offre en ligne momentanément indisponible. Le plan WinPulse reste affiché.": "Oferta online temporariamente indisponível. O plano WinPulse continua visível.",
    "Indique le nom utilisé pour le paiement.": "Indica o nome usado no pagamento.",
    "Indique le numéro MTN Mobile Money utilisé.": "Indica o número MTN Mobile Money usado.",
    "Le plan d'abonnement n'est pas disponible.": "O plano de assinatura está indisponível.",
    "La référence de suivi n'a pas été générée.": "A referência de acompanhamento não foi gerada.",
    "Lien de paiement FedaPay invalide.": "Ligação de pagamento FedaPay inválida.",
    "Le lien de paiement doit utiliser HTTPS.": "A ligação de pagamento deve usar HTTPS.",
    "Impossible de générer la référence de paiement.": "Não foi possível gerar a referência de pagamento.",
    "Référence copiée": "Referência copiada",
    "Bonjour WinPulse !": "Olá WinPulse!",
    "Merci de vérifier mon paiement et d'activer mon accès.": "Por favor, verifica o meu pagamento e ativa o acesso.",
    "Paiement sécurisé via FedaPay · choisis ton moyen de paiement sur la page FedaPay · annulable à tout moment": "Pagamento seguro via FedaPay · escolhe o método na FedaPay · cancela quando quiseres",
    "Paiement sécurisé · MTN Mobile Money disponible en solution de secours · annulable à tout moment": "Pagamento seguro · MTN Mobile Money como alternativa · cancela quando quiseres",
    "Plan actuel": "Plano atual",
    "Paiement WinPulse": "Pagamento WinPulse",
    "Informations de paiement": "Informação de pagamento",
    "Détails du paiement": "Detalhes do pagamento",
    "Nom et prénom": "Nome completo",
    "Téléphone (facultatif)": "Telefone (opcional)",
    "Numéro MTN Mobile Money": "Número MTN Mobile Money",
    "Ex. +229 01 97 00 00 00": "Ex. +229 01 97 00 00 00",
    "Ex. 01 97 00 00 00": "Ex. 01 97 00 00 00",
    "Copier la référence": "Copiar referência",
    "Ouverture du paiement…": "A abrir o pagamento…",
    "Préparation du paiement…": "A preparar o pagamento…",
    "Un seul accès. Tout WinPulse.": "Um acesso. Toda a WinPulse.",
    "Plan actif :{{v0}}{{v1}}": "Plano ativo:{{v0}}{{v1}}",
    "Débloquer WinPulse Pro": "Desbloquear WinPulse Pro",
    "Sans engagement · résiliable à tout moment · support WhatsApp inclus": "Sem compromisso · cancela quando quiseres · apoio WhatsApp incluído",
    "Aucun plan disponible pour le moment.": "Sem planos disponíveis neste momento.",
    "{{v0}} FCFA / mois": "{{v0}} FCFA / mês",
    "Débloquer Pro": "Desbloquear Pro",
    "WinPulse Pro · {{v0}} FCFA / mois": "WinPulse Pro · {{v0}} FCFA / mês",
    "Montant de l'abonnement": "Valor da assinatura",
    "30 jours · WinPulse Pro": "30 dias · WinPulse Pro",
    "{{v0}} Après validation, tu seras redirigé vers la page de paiement.": "{{v0}} Após confirmação, irás para a página de pagamento.",
    "Paiement sécurisé par FedaPay.": "Pagamento seguro pela FedaPay.",
    "Email du compte": "Email da conta",
    "Nom utilisé pour le paiement": "Nome usado no pagamento",
    "Référence de suivi": "Referência de acompanhamento",
    "Procédure MTN Mobile Money": "Instruções MTN Mobile Money",
    "1. Compose {{v0}} ou ouvre l'application MTN MoMo.": "1. Marca {{v0}} ou abre a app MTN MoMo.",
    "2. Envoie {{v0}} au {{v1}}.": "2. Envia {{v0}} para {{v1}}.",
    "3. Vérifie le destinataire : {{v0}}.": "3. Verifica o destinatário: {{v0}}.",
    "4. Garde le SMS de confirmation puis contacte WinPulse sur WhatsApp.": "4. Guarda o SMS e contacta a WinPulse pelo WhatsApp.",
    "Envoyer la confirmation sur WhatsApp": "Enviar confirmação por WhatsApp",
    "Référence : {{v0}}": "Referência: {{v0}}",
    "Je viens d'effectuer le paiement pour activer mon plan {{v0}}.": "Efetuei o pagamento para ativar o plano {{v0}}.",
    "Montant : {{v0}} FCFA": "Valor: {{v0}} FCFA",
    "Numéro MTN MoMo utilisé : {{v0}}": "Número MTN MoMo usado: {{v0}}",
    "Nom : {{v0}}": "Nome: {{v0}}",
    "Email : {{v0}}": "Email: {{v0}}",
    "Débloquer {{v0}}": "Desbloquear {{v0}}",
    "Payer {{v0}} FCFA": "Pagar {{v0}} FCFA",
    "Continuer — {{v0}} FCFA": "Continuar — {{v0}} FCFA",
    "Impossible de charger le parrainage": "Não foi possível carregar as referências",
    "Lien copié — partage-le maintenant !": "Ligação copiada. Partilha-a!",
    "Récompense activée !": "Recompensa ativada!",
    "Réclamation impossible": "Não foi possível reclamar a recompensa",
    "Copie ton lien ou ton code unique.": "Copia a tua ligação ou código único.",
    "Partage-le sur WhatsApp, en 1 clic.": "Partilha pelo WhatsApp num clique.",
    "Découvre WinPulse — IA pronostics sportifs": "Descobre a WinPulse — prognósticos desportivos",
    "70%+ de réussite": "Resultados verificáveis",
    "Track record public, vérifiable à tout moment.": "Histórico público, verificável a qualquer momento.",
    "Communauté active": "Comunidade ativa",
    "Picks décortiqués, analyses IA, combinés du jour.": "Seleções explicadas, análises e combinadas do dia.",
    "1 mois, paiement MTN. Pas de carte, pas de piège.": "Um mês, pagamento MTN. Sem cartão obrigatório.",
    "Programme parrainage": "Programa de referências",
    "Invite 3 amis,{{v0}}reçois {{v1}}": "Convida 3 amigos,{{v0}}recebe {{v1}}",
    "7 jours Pro offerts": "7 dias Pro grátis",
    "Partage ton lien WhatsApp en 1 clic. Dès que {{v0}} créent leur compte, ton accès Pro s'active automatiquement — vraiment gratuit.": "Partilha a ligação. Quando {{v0}} se registarem, o Pro gratuito ativa-se automaticamente.",
    "3 amis": "3 amigos",
    "Ton code": "O teu código",
    "Ta progression": "O teu progresso",
    "{{v0}} / {{v1}} amis inscrits": "{{v0}} / {{v1}} amigos registados",
    "🎉 Bravo ! Tu peux réclamer ta récompense.": "🎉 Parabéns! Reclama a recompensa.",
    "Récompense déjà réclamée. Merci d'avoir parrainé tes amis !": "Recompensa já reclamada. Obrigado por convidares os amigos!",
    "Encore {{v0}} ami{{v1}} à inviter pour débloquer ta semaine Pro.": "Amigos em falta para desbloquear a semana Pro: {{v0}}.",
    "Comment ça marche": "Como funciona",
    "Partager maintenant": "Partilhar agora",
    "Envoyer par email": "Enviar por email",
    "Pourquoi ils vont kiffer": "Porque vão gostar",
    "Code {{v0}} copié": "Código {{v0}} copiado",
    "Dès que 3 amis créent leur compte avec ton code, {{v0}} jours Pro s'activent.": "Quando 3 amigos se registarem com o código, ativam-se {{v0}} dias Pro.",
    "Cette rencontre n’est plus disponible dans les matchs actuels.": "Este jogo já não está disponível na lista atual.",
    "La rencontre ne peut pas être chargée pour le moment. Réessaie depuis le dashboard.": "Não foi possível carregar o jogo. Tenta novamente no painel.",
    "Le serveur réserve cette analyse à Pro. L’explication du pronostic reste disponible ci-dessus.": "Esta análise é Pro. A explicação do prognóstico continua disponível acima.",
    "L’explication complémentaire est indisponible pour le moment. Les informations du pronostic restent affichées.": "A explicação adicional está indisponível. Os dados do prognóstico continuam visíveis.",
    "Match introuvable.": "Jogo não encontrado.",
    "Bookmakers": "Casas de apostas",
    "Écart estimé": "Diferença estimada",
    " points": " pontos",
    "Estimation du moteur": "Estimativa do motor",
    "Cote optimale": "Melhor odd",
    "H2H (10 derniers)": "H2H (últimos 10)",
    "Forme récente": "Forma recente",
    "xG moyens": "xG médios",
    "Absences clés": "Ausências importantes",
    "Cartons arbitre": "Cartões do árbitro",
    "Conditions": "Condições",
    "Forme et historique H2H réels (football-data.org) quand disponibles. Autres champs : analyse basée sur le consensus des cotes bookmakers.": "Forma e H2H reais de football-data.org quando disponíveis. Os restantes dados usam o consenso das odds.",
    "Analyse basée uniquement sur le consensus des cotes bookmakers agrégées — aucune statistique externe fabriquée.": "Baseado apenas no consenso agregado das odds, sem estatísticas externas inventadas.",
    "Enrichir l’explication": "Enriquecer explicação",
    "Source non précisée par le service": "Fonte não especificada",
    "Moteur statistique": "Motor estatístico",
    "Retour au dashboard": "Voltar ao painel",
    "Retour": "Voltar",
    "VS": "VS",
    "Passe Pro pour voir le pick complet": "Adere ao Pro para ver a seleção completa",
    "Inclut la cote optimale, le score de confiance, l'edge value et l'analyse IA experte.": "Inclui a melhor odd, confiança, vantagem estimada e análise detalhada.",
    "Pronostic principal": "Prognóstico principal",
    "Bookmakers utilisés :": "Casas utilizadas:",
    "Partager": "Partilhar",
    "Comprendre ce pronostic": "Compreender este prognóstico",
    "Le moteur compare les marchés et les cotes disponibles pour classer les sélections. L’estimation affichée est un indicateur calculé ; elle ne garantit pas le résultat du match.": "O motor compara mercados e odds para classificar seleções. A estimativa é um indicador, não um resultado garantido.",
    "Nombre de bookmakers annoncé pour cette analyse : {{v0}}. Cote de la sélection : {{v1}}.": "Casas indicadas: {{v0}}. Odd: {{v1}}.",
    "Des statistiques externes sont disponibles pour compléter cette analyse. Leur détail figure plus bas.": "Há estatísticas externas abaixo para complementar a análise.",
    "Les informations disponibles ne permettent pas ici d’ajouter une analyse vérifiée de la forme des équipes ou des absences.": "Os dados não permitem analisar de forma verificada a forma ou as ausências.",
    "Tous les marchés analysés": "Todos os mercados analisados",
    "· {{v0}} books": "· {{v0}} casas",
    "· edge +{{v0}}%": "· vantagem +{{v0}} %",
    "Analyse détaillée": "Análise detalhada",
    "Données du moteur": "Dados do motor",
    "Aucune statistique externe vérifiée disponible pour ce match — le moteur s'appuie uniquement sur le consensus des cotes bookmakers, sans donnée inventée.": "Sem estatísticas externas verificadas. O motor usa apenas o consenso das odds, sem dados inventados.",
    "Explication complémentaire": "Explicação adicional",
    "Demande une présentation complémentaire des éléments disponibles. Selon la configuration du service, le texte peut être rédigé avec l’aide d’une IA ou par le moteur statistique.{{v0}}": "Pede uma explicação dos dados. Conforme a configuração, o texto usa ajuda de IA ou o motor estatístico.{{v0}}",
    "Certaines analyses complémentaires sont réservées à Pro. {{v0}}.": "Algumas análises adicionais exigem Pro. {{v0}}.",
    "Verdict": "Conclusão",
    "Facteurs clés": "Fatores-chave",
    "Alternative :": "Alternativa:",
    "Source : {{v0}}": "Fonte: {{v0}}",
    "Cotes par bookmaker": "Odds por casa",
    "Bookmaker": "Casa de apostas",
    "Données réelles (football-data.org) — forme récente et historique des confrontations directes, disponibles pour les grandes compétitions européennes suivies.": "Dados reais de football-data.org: forma e H2H das principais competições europeias abrangidas.",
    "{{v0}} derniers matchs (réel)": "Últimos {{v0}} jogos (dados reais)",
    "{{v0}} {{v1}} V": "{{v0}} {{v1}} V",
    "{{v0}} {{v1}} N": "{{v0}} {{v1}} E",
    "{{v0}} {{v1}} D": "{{v0}} {{v1}} D",
    "Forme récente non disponible": "Forma recente indisponível",
    "📅 Confrontations directes (historique réel)": "📅 Confrontos diretos (histórico real)",
    "Nuls": "Empates",
    "Bilan agrégé des confrontations directes récentes. Détail match par match non disponible sur la source actuelle.": "Resumo agregado dos H2H recentes. A fonte não fornece detalhes jogo a jogo.",
    "La sélection « {{v0}} » porte sur le total de buts ou de points pour les équipes et la période indiquées par le marché. Elle ne dépend pas uniquement du vainqueur de la rencontre.": "«{{v0}}» refere-se ao total de golos ou pontos do período, não apenas ao vencedor.",
    "La sélection prévoit la victoire de {{v0}}, selon la période et les règles du marché.": "Prevê a vitória de {{v0}} conforme o período e as regras do mercado.",
    "La sélection « {{v0}} » décrit l’événement attendu dans le marché indiqué. Vérifie la période et les règles de règlement du bookmaker.": "«{{v0}}» descreve o resultado esperado. Verifica o período e as regras da casa.",
    "Rédaction assistée par IA ({{v0}})": "Redação assistida por IA ({{v0}})",
    "supérieur": "acima de",
    "inférieur": "abaixo de",
    "l’équipe indiquée": "a equipa indicada",
    "La sélection indique l’événement attendu. Vérifie le marché, la période du match et les règles de règlement avant de l’utiliser.": "Verifica o resultado, mercado, período e regras de liquidação antes de usar a seleção.",
    "Invalid value bets response": "Resposta de value bets inválida",
    "Écart non communiqué": "Diferença não indicada",
    "Cela signale une opportunité possible si l’estimation est fiable.": "Oportunidade possível se a estimativa for fiável.",
    "Ces chiffres ne montrent pas d’avantage positif à cette cote.": "Estes números não mostram vantagem positiva nesta odd.",
    "Ta session a expiré. Reconnecte-toi pour consulter les sélections.": "A sessão expirou. Inicia sessão para ver as seleções.",
    "Les sélections ne peuvent pas être chargées pour le moment. Réessaie dans quelques instants.": "Não foi possível carregar as seleções. Tenta novamente em breve.",
    "Chargement des sélections": "A carregar seleções",
    "ne sont": "não estão",
    "Aucune sélection à venir disponible pour le moment.": "Sem seleções futuras disponíveis neste momento.",
    "Aucune sélection disponible pour cette date.": "Sem seleções para esta data.",
    "Reviens plus tard ou actualise les données.": "Volta mais tarde ou atualiza os dados.",
    "Essaie toutes les dates à venir.": "Experimenta todas as datas futuras.",
    "Date et heure à confirmer": "Data e hora por confirmar",
    "Estimation WinPulse": "Estimativa WinPulse",
    "Probabilité implicite de la cote": "Probabilidade implícita da odd",
    "WinPulse affiche une estimation de {{v0}}. La cote de {{v1}} correspond à {{v2}} en probabilité implicite : l’écart est de {{v3}}. {{v4}}": "A WinPulse estima {{v0}}. A odd {{v1}} implica {{v2}}; a diferença é {{v3}}. {{v4}}",
    "Il manque une cote ou une probabilité valide pour expliquer l’écart de cette sélection.": "Falta uma odd ou probabilidade válida para explicar a diferença.",
    "L’écart de probabilité n’est pas un pourcentage de gain. Les cotes évoluent et l’estimation peut être erronée. Pour un marché avec remboursement, la probabilité implicite ne décrit pas à elle seule toutes les issues de règlement.": "A diferença não é uma percentagem de lucro. As odds mudam e a estimativa pode falhar. Nos mercados com reembolso, a probabilidade implícita não descreve todas as liquidações.",
    "Détecteur de value bets": "Detetor de value bets",
    "Des opportunités à examiner": "Oportunidades a analisar",
    "Retrouve la rencontre, son horaire, le marché conseillé et les chiffres qui expliquent chaque sélection.": "Consulta o jogo, horário, mercado sugerido e números de cada seleção.",
    "Une {{v0}} est une sélection dont la probabilité estimée dépasse le seuil implicite de la cote. L’écart, appelé {{v1}}, est exprimé ici en {{v2}}. Il dépend de la fiabilité de l’estimation.": "Uma {{v0}} supera na probabilidade estimada o limiar implícito da odd. A diferença ou {{v1}} é expressa em {{v2}} e depende da fiabilidade da estimativa.",
    "value bet": "value bet",
    "points de probabilité": "pontos de probabilidade",
    "Voir un exemple de calcul": "Ver exemplo de cálculo",
    "Exemple hypothétique, pour un pari sans remboursement : à cote 2,00, le seuil implicite est 50 %. Si la probabilité réelle était 60 %, l’écart serait de 10 points et le rendement moyen théorique serait de 20 % (0,60 × 2 − 1). Cela ne garantit aucun gain et suppose une estimation correcte.": "Exemplo sem reembolso: odd 2,00 implica 50 %. Com probabilidade real de 60 %, a diferença seria 10 pontos e o retorno médio teórico 20 % (0,60 × 2 − 1). Sem lucro garantido; exige estimativa correta.",
    "Les value bets sont réservés à Pro": "Value bets exclusivos para Pro",
    "Accède aux rencontres, dates, marchés et explications des sélections avec ton abonnement Pro.": "Pro inclui jogos, datas, mercados e explicações.",
    "Créer mon compte": "Criar a minha conta",
    "Se reconnecter": "Iniciar sessão novamente",
    "{{v0}} sélection{{v1}} affichée{{v2}}": "Seleções apresentadas: {{v0}}",
    "Horaires dans ton fuseau : {{v0}}.": "Horários no teu fuso: {{v0}}.",
    "Toutes les dates à venir": "Todas as datas futuras",
    "Tri{{v0}}": "Ordenar{{v0}}",
    "Écart estimé décroissant": "Maior diferença estimada",
    "Date et heure": "Data e hora",
    "{{v0}} sélection{{v1}} dont le match a déjà commencé {{v2}} plus proposée{{v3}} ici.": "Seleções removidas porque o jogo já começou: {{v0}}.",
    "Voir toutes les dates": "Ver todas as datas",
    "Les estimations ne garantissent aucun résultat. Vérifie les cotes et les règles du marché avant utilisation. 18+.": "As estimativas não garantem resultados. Verifica odds e regras. 18+.",
    "La sélection porte sur un total {{v0}} à {{v1}} pour les buts ou points et la période indiqués dans le marché. Le vainqueur peut être différent de l’équipe favorite.": "A seleção refere-se a um total {{v0}} {{v1}} para os golos/pontos e período indicados. O vencedor pode não ser o favorito.",
    "Le pronostic porte sur la victoire de {{v0}}, selon la période et les règles du marché.": "Prevê a vitória de {{v0}} conforme o período e regras do mercado.",
    "{{v0}}{{v1}} points": "{{v0}}{{v1}} pontos",
    "Foot US": "Futebol americano",
    "Autres": "Outros",
    "Buts / points": "Golos / pontos",
    "Autres marchés": "Outros mercados",
    "Horaire non communiqué": "Horário não indicado",
    "International": "Internacional",
    "Espagne": "Espanha",
    "Allemagne": "Alemanha",
    "Italie": "Itália",
    "Angleterre": "Inglaterra",
    "Pologne": "Polónia",
    "Finlande": "Finlândia",
    "Japon": "Japão",
    "Chine": "China",
    "Portugal": "Portugal",
    "Brésil": "Brasil",
    "Argentine": "Argentina",
    "Deux issues sont couvertes : celles indiquées dans la sélection, sur la période du marché.": "Cobre os dois resultados indicados durante o período do mercado.",
    "Le marché porte sur le fait que les deux équipes marquent, ou non, pendant la période indiquée.": "Indica se ambas as equipas marcam no período indicado.",
    "Le résultat est évalué après application du handicap affiché. La ligne et la période du marché déterminent son règlement.": "Aplica-se o handicap, a linha e o período indicados. Verifica as regras da casa.",
    "Le pari porte sur le total indiqué. Vérifie les règles de la ligne et de la période choisies.": "Refere-se ao total indicado. Verifica a linha, o período e as regras de liquidação.",
    "La sélection prévoit un match nul sur la période couverte.": "O prognóstico prevê um empate no período abrangido.",
    "Lis cette sélection avec son marché et sa période. La fiche du match présente les informations disponibles.": "Lê a seleção com o mercado e período. A ficha mostra a informação disponível.",
    "Marché réservé": "Mercado reservado",
    "Marché non communiqué": "Mercado não indicado",
    "Compétition non communiquée": "Competição não indicada",
    "Rencontre commencée ou horaire à vérifier": "Jogo iniciado ou horário a verificar",
    "Sélection à vérifier : elle n’est plus proposée avec une cote disponible": "Verifica a seleção: já não tem uma odd disponível",
    "heure locale du navigateur": "as horas locais do navegador",
    " · Marché estimé, cote à confirmer": " · Mercado estimado, confirma a odd",
    "Confiance moyenne non disponible": "Confiança média indisponível",
    "Sélections et cotes à vérifier avant les rencontres.": "Verifica as seleções e odds antes dos jogos.",
    "Ticket enregistré": "Boletim guardado",
    "Domicile": "Casa",
    "Nul": "Empate",
    "Extérieur": "Fora",
    "Plus de 2,5 buts": "Mais de 2,5 golos",
    "Plus de 1,5 but": "Mais de 1,5 golos",
    "Domicile : aucun but encaissé": "Casa sem sofrer golos",
    "Extérieur : aucun but encaissé": "Visitante sem sofrer golos",
    "Ta session a expiré. Reconnecte-toi.": "A sessão expirou. Inicia sessão novamente.",
    "Cette fonction est réservée aux abonnés. Vérifie ton accès.": "Exclusivo para assinantes. Verifica o teu acesso.",
    "Les actualisations sont temporairement limitées. Réessaie dans quelques instants.": "Atualizações temporariamente limitadas. Tenta novamente em breve.",
    "Le serveur met trop de temps à répondre. Réessaie.": "O servidor demorou demasiado. Tenta novamente.",
    "Impossible de charger les tickets enregistrés.": "Não foi possível carregar os boletins guardados.",
    "Ton accès n’a pas pu être actualisé. L’enregistrement sera disponible après vérification.": "Não foi possível atualizar o acesso. Poderás guardar após verificação.",
    "Impossible d’actualiser les rencontres. La dernière liste chargée reste disponible.": "Não foi possível atualizar os jogos. Mantém-se a última lista.",
    "Cette sélection n’est pas disponible avec une cote et un horaire utilisables. Actualise le catalogue.": "Falta uma odd ou horário válido. Atualiza o catálogo.",
    "Actualise le catalogue pour vérifier ton accès aux repères.": "Atualiza o catálogo para verificar o acesso aos indicadores.",
    "Les repères de marché ne sont pas disponibles. Réessaie.": "Indicadores indisponíveis. Tenta novamente.",
    "Actualise le catalogue pour vérifier ton accès à l’enregistrement.": "Atualiza o catálogo para verificar o acesso à gravação.",
    "Actualise les rencontres et vérifie les sélections signalées avant d’enregistrer.": "Atualiza os jogos e verifica as seleções assinaladas antes de guardar.",
    "Ce ticket est déjà enregistré.": "Este boletim já está guardado.",
    "Ticket enregistré dans tes combinés.": "Boletim guardado nas tuas combinadas.",
    "L’enregistrement n’a pas été confirmé. Vérifie la liste des tickets avant de réessayer.": "Gravação não confirmada. Verifica os boletins antes de tentar novamente.",
    "Ticket copié.": "Boletim copiado.",
    "Sélectionne le texte ci-dessous pour le copier.": "Seleciona o texto abaixo para o copiar.",
    "Ce ticket est long. Copie le texte ci-dessous pour le partager sans couper les sélections.": "O boletim é longo. Copia o texto para o partilhar completo.",
    "Ticket supprimé.": "Boletim eliminado.",
    "La suppression n’a pas été confirmée. Actualise la liste.": "Eliminação não confirmada. Atualiza a lista.",
    "Rechercher et filtrer les rencontres": "Procurar e filtrar jogos",
    "Équipe, championnat ou pays…": "Equipa, campeonato ou país…",
    "Choisir un sport": "Escolhe um desporto",
    "Chargement du programme…": "A carregar a programação…",
    "Aucune rencontre pour ces filtres": "Sem jogos para estes filtros",
    "Aucune rencontre disponible actuellement": "Sem jogos disponíveis neste momento",
    "Essaie une autre équipe ou élargis les filtres.": "Experimenta outra equipa ou alarga os filtros.",
    "Actualise plus tard pour retrouver les prochains marchés proposés.": "Atualiza mais tarde para ver os próximos mercados.",
    "Ton ticket et tes sauvegardes": "O teu boletim e os guardados",
    "Une sélection par rencontre": "Uma seleção por jogo",
    "Replier le ticket": "Recolher boletim",
    "Ouvrir mon ticket": "Abrir o meu boletim",
    "Non disponible": "Indisponível",
    "Mon combiné du week-end": "A minha combinada do fim de semana",
    "Enregistrer le ticket": "Guardar boletim",
    "Actualiser les tickets enregistrés": "Atualizar boletins guardados",
    "Équipe à confirmer": "Equipa por confirmar",
    "Sélection non communiquée": "Seleção não indicada",
    "Prudent": "Prudente",
    "Modéré": "Moderado",
    "Risqué": "Arriscado",
    "Replier": "Recolher",
    "Voir les marchés": "Ver mercados",
    "non fournie": "indisponível",
    "Retirer": "Remover",
    "Ajouter": "Adicionar",
    "Des marchés de cette rencontre sont réservés aux abonnés.": "Alguns mercados deste jogo são exclusivos para assinantes.",
    "Aucune option avec une cote et un horaire disponibles.": "Sem opções com odd e horário válidos.",
    "Sélection réservée": "Seleção reservada",
    "Réservée": "Reservada",
    "Ton combiné.{{v0}}{{v1}}": "A tua combinada.{{v0}}{{v1}}",
    "Tes choix.": "As tuas escolhas.",
    "Explore les rencontres, compare les marchés et réunis tes sélections dans un ticket qui se lit en un coup d’œil.": "Explora jogos, compara mercados e cria um boletim fácil de ler.",
    "Horaires : {{v0}}{{v1}}": "Horários: {{v0}}{{v1}}",
    "rencontres au catalogue": "jogos no catálogo",
    "options sélectionnables": "opções selecionáveis",
    "Reconnecte-toi pour continuer": "Inicia sessão novamente",
    "Ta session a expiré. Les sélections de la session précédente ont été retirées.": "A sessão expirou. Foram removidas as seleções da sessão anterior.",
    "Quelle rencontre cherches-tu ?": "Que jogo procuras?",
    "Date{{v0}}": "Data{{v0}}",
    "Toutes les dates": "Todas as datas",
    "Demain": "Amanhã",
    "Classer par{{v0}}": "Ordenar por{{v0}}",
    "Horaire": "Horário",
    "01 · Compose ton ticket": "01 · Compõe o teu boletim",
    "Les rencontres à explorer": "Jogos para explorar",
    "{{v0}} sélection{{v1}}{{v2}}": "Seleções: {{v0}}{{v2}}",
    "Voir le ticket": "Ver boletim",
    "Le catalogue n’a pas été vérifié depuis plus de cinq minutes. Actualise avant d’ajouter ou de partager une sélection.": "O catálogo tem mais de cinco minutos. Atualiza antes de adicionar ou partilhar.",
    "Certaines données incomplètes n’ont pas pu être affichées.": "Alguns dados incompletos não puderam ser apresentados.",
    "Chargement des rencontres": "A carregar jogos",
    "Les options disponibles apparaîtront ici.": "As opções disponíveis aparecerão aqui.",
    "{{v0}} sur {{v1}} rencontres affichées": "{{v0}} de {{v1}} jogos apresentados",
    "Afficher les rencontres suivantes": "Mostrar mais jogos",
    "02 · Ton ticket": "02 · O teu boletim",
    "Mon combiné": "A minha combinada",
    "Ton ticket commence ici": "O teu boletim começa aqui",
    "Ajoute une option sur une rencontre. Tu peux remplacer ton choix sans ajouter deux paris sur le même match.": "Adiciona uma opção por jogo. Podes substituí-la sem duplicar o jogo.",
    "Cote cumulée": "Odd combinada",
    "Produit des cotes des sélections du ticket.": "Produto das odds selecionadas.",
    "Confiance moyenne du moteur": "Confiança média do motor",
    "Sports représentés": "Desportos representados",
    "La confiance moyenne ne représente pas la probabilité que le combiné passe.": "A confiança média não é a probabilidade de acertar toda a combinada.",
    "contre": "contra",
    "{{v0}} · Cote {{v1}}": "{{v0}} · Odd {{v1}}",
    "Marché estimé · cote à confirmer": "Mercado estimado · confirma a odd",
    "Cote actualisée : {{v0}} → {{v1}}": "Odd atualizada: {{v0}} → {{v1}}",
    "Vider le ticket": "Limpar boletim",
    "Nom du ticket {{v0}}{{v1}}": "Nome do boletim {{v0}}{{v1}}",
    "(facultatif)": "(opcional)",
    "Actualise le catalogue et retire ou remplace les sélections signalées pour enregistrer ou partager le ticket.": "Atualiza e substitui ou remove as seleções assinaladas antes de guardar ou partilhar.",
    "Enregistrer avec Pro": "Guardar com Pro",
    "Vérifier mon accès": "Verificar o meu acesso",
    "Copier": "Copiar",
    "Les options avec un cadenas demandent un abonnement. L’enregistrement des tickets est réservé aux abonnés.": "Os mercados bloqueados e a gravação de boletins exigem uma assinatura.",
    "Voir les formules": "Ver planos",
    "Texte du ticket": "Texto do boletim",
    "Mes tickets enregistrés": "Os meus boletins guardados",
    "Historique de tes tickets": "Histórico dos teus boletins",
    "Ton accès est en cours de vérification.": "O teu acesso está a ser verificado.",
    "Retrouve tes tickets enregistrés avec un abonnement.": "Acede aos boletins guardados com uma assinatura.",
    "Chargement des sauvegardes…": "A carregar boletins guardados…",
    "Aucun ticket enregistré pour le moment.": "Ainda não há boletins guardados.",
    "Cote {{v0}} · {{v1}} sélection{{v2}}": "Odd {{v0}} · Seleções: {{v1}}",
    "{{v0}} contre {{v1}}": "{{v0}} contra {{v1}}",
    "Le détail de ce ticket n’est pas disponible.": "Os detalhes do boletim estão indisponíveis.",
    "Ticket archivé : les horaires et cotes ne sont pas actualisés ici.": "Boletim arquivado: os horários e odds não são atualizados aqui.",
    "{{v0}} option{{v1}} sélectionnable{{v2}} · {{v3}} proposée{{v4}}": "Opções disponíveis: {{v0}} · Propostas: {{v3}}",
    "Choix proposé · {{v0}}": "Seleção proposta · {{v0}}",
    "Une autre option de cette rencontre est dans ton ticket.": "Já tens outra opção deste jogo no boletim.",
    "Un seul choix par rencontre : ajouter une autre option remplace la précédente.": "Uma seleção por jogo: uma nova opção substitui a anterior.",
    "Comprendre ce marché": "Compreender este mercado",
    "Afficher plus de marchés ({{v0}})": "Mostrar mais mercados ({{v0}})",
    "Débloquer les marchés réservés": "Desbloquear mercados reservados",
    "Repères de marché": "Indicadores de mercado",
    "Les repères supplémentaires demandent un accès abonné vérifié. {{v0}}": "Os indicadores adicionais exigem acesso de assinante verificado. {{v0}}",
    "Chargement des repères…": "A carregar indicadores…",
    "Estimations de marché disponibles pour cette rencontre. Les données insuffisantes ne sont pas affichées.": "Estimativas deste jogo. Os dados insuficientes não são apresentados.",
    "Les repères ne sont pas renseignés pour cette rencontre.": "Sem indicadores para este jogo.",
    "Ouvrir la fiche de la rencontre": "Abrir ficha do jogo",
    "Le total doit rester inférieur à {{v0}} sur la période couverte.": "O total deve ficar abaixo de {{v0}} no período abrangido.",
    "Le total doit dépasser {{v0}} sur la période couverte.": "O total deve ultrapassar {{v0}} no período abrangido.",
    "Le moteur retient {{v0}} comme vainqueur sur la période couverte.": "O motor escolhe a vitória de {{v0}} no período abrangido.",
    "Horaires : {{v0}}": "Horários: {{v0}}",
    "{{v0}}. {{v1}} vs {{v2}}\n{{v3}}{{v4}}\n{{v5}}\n{{v6}} : {{v7}}\nCote : {{v8}}{{v9}}": "{{v0}}. {{v1}} vs {{v2}}\n{{v3}}{{v4}}\n{{v5}}\n{{v6}} : {{v7}}\nOdd: {{v8}}{{v9}}",
    "Cote cumulée : {{v0}}": "Odd combinada: {{v0}}",
    "Confiance moyenne du moteur : {{v0}} % (indicateur, pas un taux de réussite)": "Confiança média do motor: {{v0}} % (indicador, não taxa de acerto medida)",
    " · Chargé à {{v0}}": " · Carregado às {{v0}}",
    "{{v0}} rencontre{{v1}} correspond{{v2}} à tes filtres": "Jogos correspondentes aos filtros: {{v0}}",
    "{{v0}} sélection{{v1}} · Cote {{v2}}": "Seleções: {{v0}} · Odd {{v2}}",
    "Retirer {{v0}} contre {{v1}}": "Remover {{v0}} contra {{v1}}",
    "Supprimer le ticket {{v0}}": "Eliminar boletim {{v0}}",
    "Filtrer les marchés de {{v0}}": "Filtrar mercados de {{v0}}",
    "Sécurité": "Prudente",
    "Le profil prudent, à examiner sélection par sélection.": "Perfil prudente a avaliar seleção a seleção.",
    "Équilibre": "Equilibrado",
    "Un profil intermédiaire pour comparer les cotes et la confiance.": "Perfil intermédio para comparar odds e confiança.",
    "Le profil offensif : une cote élevée implique davantage d’incertitude.": "Perfil ofensivo: uma odd elevada implica maior incerteza.",
    "Cote totale non communiquée": "Odd total não indicada",
    "Les données reçues sont incomplètes. Réessaie pour obtenir une sélection valide.": "Dados incompletos. Tenta novamente para obter uma seleção válida.",
    "Impossible d’actualiser les combinés pour le moment. Réessaie dans quelques instants.": "Não foi possível atualizar as combinadas. Tenta novamente em breve.",
    "Le choix porte sur une victoire. En cas de nul sur la période couverte, le règlement de ce marché prévoit le remboursement.": "A equipa indicada deve ganhar. Um empate no período abrangido é reembolsado segundo as regras do mercado.",
    "Rencontre terminée · actualise le combiné": "Jogo terminado · atualiza a combinada",
    "Rencontre commencée · actualise le combiné": "Jogo iniciado · atualiza a combinada",
    "Équipe non communiquée": "Equipa não indicada",
    "Pronostic sélectionné": "Prognóstico selecionado",
    "Non communiquée": "Não indicada",
    "Aucun score de confiance n’a été communiqué pour cette sélection.": "Não foi indicada confiança para esta seleção.",
    "heure locale": "hora local",
    "Combiné copié.": "Combinada copiada.",
    "La copie automatique est indisponible. Sélectionne le texte ci-dessous.": "Cópia automática indisponível. Seleciona o texto abaixo.",
    "Dernier chargement": "Último carregamento",
    "Actualisé": "Atualizado",
    "Choisis un profil pour explorer ses sélections": "Escolhe um perfil para explorar as seleções",
    "Actualiser les combinés": "Atualizar combinadas",
    "Profil à découvrir": "Perfil a descobrir",
    "Cote non fournie": "Odd não indicada",
    "Accès Pro": "Acesso Pro",
    "Sélections": "Seleções",
    "Cote totale": "Odd total",
    "Confiance moyenne": "Confiança média",
    "Probabilité combinée estimée": "Probabilidade combinada estimada",
    "Chargement des combinés": "A carregar combinadas",
    "Une rencontre a déjà commencé ou s’est terminée. Actualise pour vérifier les sélections disponibles.": "Um jogo já começou ou terminou. Atualiza as seleções disponíveis.",
    "Cette sélection n’a pas été actualisée depuis plus de cinq minutes. Actualise avant de la copier.": "A seleção tem mais de cinco minutos. Atualiza antes de copiar.",
    "Le programme du combiné": "Programa da combinada",
    "Les sélections, une par une": "Seleções, uma a uma",
    "Présentation des rencontres": "Apresentação dos jogos",
    "Récapitulatif du combiné": "Resumo da combinada",
    "Disponible avec les sélections complètes.": "Disponível com as seleções completas.",
    "Actualise le combiné avant de copier ses sélections.": "Atualiza a combinada antes de a copiar.",
    "La copie est disponible avec au moins deux sélections complètes, dont les horaires sont à venir.": "A cópia exige pelo menos duas seleções completas de jogos futuros.",
    "Fermer le texte à copier": "Fechar texto para copiar",
    "À confirmer": "Por confirmar",
    "Ce que signifie ce pronostic": "O que significa este prognóstico",
    "Consulter la rencontre": "Consultar jogo",
    "Le pronostic est réservé aux abonnés": "Prognóstico exclusivo para assinantes",
    "Débloque la sélection, son marché et sa cote.": "Desbloqueia a seleção, o mercado e a odd.",
    "Voir les abonnements": "Ver assinaturas",
    "Lis le match.{{v0}}{{v1}}": "Lê o jogo.{{v0}}{{v1}}",
    "Choisis ton combiné.": "Escolhe a tua combinada.",
    "Trois profils. Chaque rencontre expliquée. Toutes les sélections réunies dans un ticket clair.": "Três perfis, jogos explicados e todas as seleções num boletim claro.",
    "{{v0}} à {{v1}}": "{{v0}} às {{v1}}",
    "Profil sélectionné": "Perfil selecionado",
    "01 · Choisis ton profil": "01 · Escolhe o teu perfil",
    "Quel combiné veux-tu explorer ?": "Que combinada queres explorar?",
    "Comparer les trois profils": "Comparar os três perfis",
    "Explorer ce profil": "Explorar este perfil",
    "Les indicateurs proviennent du moteur. La confiance moyenne et la probabilité combinée décrivent deux choses différentes.": "São indicadores do motor. A confiança média e a probabilidade combinada medem coisas diferentes.",
    "La dernière sélection chargée reste affichée.": "A última seleção carregada mantém-se visível.",
    "Préparation des sélections": "A preparar seleções",
    "Vérification de ton accès et chargement des rencontres…": "A verificar o acesso e carregar jogos…",
    "Ta session doit être renouvelée": "Renova a tua sessão",
    "Reconnecte-toi pour retrouver l’accès correspondant à ton compte.": "Inicia sessão novamente para recuperar o acesso.",
    "Les sélections complètes": "Seleções completas",
    "Explore les trois profils avec Pro.": "Explora os três perfis com Pro.",
    "Ton accès actuel ne permet pas de consulter ces combinés. Retrouve les rencontres, les marchés et les cotes en découvrant les abonnements disponibles.": "O teu acesso não inclui estas combinadas. Consulta as assinaturas para ver jogos, mercados e odds.",
    "Découvrir les abonnements": "Descobrir assinaturas",
    "Les combinés n’ont pas pu être chargés": "Não foi possível carregar as combinadas",
    "Utilise le bouton Réessayer ci-dessus pour relancer la vérification.": "Usa Tentar novamente acima para repetir a verificação.",
    "Un combiné gratuit à découvrir": "Descobre uma combinada gratuita",
    "Le profil {{v0}} est accessible avec ton compte.": "O perfil {{v0}} está disponível na tua conta.",
    "Voir le combiné": "Ver combinada",
    "Aucune sélection pour ce profil": "Sem seleções para este perfil",
    "Le moteur n’a pas fourni de combiné {{v0}} pour le moment. Consulte un autre profil ou actualise plus tard.": "Ainda não há combinada {{v0}}. Escolhe outro perfil ou atualiza mais tarde.",
    "02 · Parcours les rencontres": "02 · Explora os jogos",
    "{{v0}} sélection{{v1}} · Profil {{v2}}": "Seleções: {{v0}} · Perfil {{v2}}",
    "Première rencontre : {{v0}}": "Primeiro jogo: {{v0}}",
    "Fiches": "Fichas",
    "Horaires": "Horários",
    "Cote totale du moteur{{v0}}": "Odd total do motor{{v0}}",
    "03 · Ton ticket": "03 · O teu boletim",
    "Combiné {{v0}}": "Combinada {{v0}}",
    "{{v0}} sélection{{v1}} réunies": "Seleções reunidas: {{v0}}",
    "Cote totale du moteur": "Odd total do motor",
    "Copier le ticket": "Copiar boletim",
    "Débloquer le combiné": "Desbloquear combinada",
    "Appuie dans le texte pour le sélectionner.": "Toca no texto para o selecionar.",
    "Bien lire le combiné": "Compreender a combinada",
    "La confiance moyenne décrit les sélections individuellement. Elle ne correspond pas à la probabilité que tout le combiné passe.": "A confiança média descreve seleções individuais, não a probabilidade de acertar toda a combinada.",
    "La probabilité combinée est une estimation du moteur, liée à ses hypothèses sur les matchs. Elle ne constitue pas un taux de réussite mesuré.": "A probabilidade combinada é uma estimativa baseada nas hipóteses do modelo, não uma taxa de acerto medida.",
    "Un combiné dépend de chacune de ses sélections. Le profil « Sécurité » reste soumis à cette incertitude.": "Todas as seleções contam. O perfil prudente continua sujeito a incerteza.",
    "Vérification des sélections et de ton accès…": "A verificar seleções e acesso…",
    "WNPulse · Combiné {{v0}}": "WNPulse · Combinada {{v0}}",
    "{{v0}}. {{v1}} vs {{v2}}": "{{v0}}. {{v1}} vs {{v2}}",
    "Cote : {{v0}}": "Odd: {{v0}}",
    "Cote totale du moteur : {{v0}}": "Odd total do motor: {{v0}}",
    "{{v0}} sélection{{v1}} dans ce ticket": "Seleções neste boletim: {{v0}}",
    "{{v0}} sélection{{v1}}": "Seleções: {{v0}}",
    "{{v0}} / mois": "{{v0}} / mês",
    "{{v0}} remboursés": "{{v0}} reembolsados",
    "🎯 *Pick WinPulse*\n{{v0}} · {{v1}}\n\n*{{v2}}* vs *{{v3}}*\n👉 {{v4}} @ *{{v5}}*\nConfiance IA : {{v6}}%\nMarché : {{v7}}\n\nhttps://wnpulse.com": "🎯 *Pick WinPulse*\n{{v0}} · {{v1}}\n\n*{{v2}}* vs *{{v3}}*\n👉 {{v4}} @ *{{v5}}*\nConfiança do motor: {{v6}} %\nMercado: {{v7}}\n\nhttps://wnpulse.com",
    "Le texte libre fourni par le serveur reste affiché dans sa langue d’origine.": "O texto livre do servidor é apresentado na língua original.",
    "/mois": "/mês",
    "Le service de scores n’est pas configuré. Contactez l’équipe WinPulse.": "Os resultados não estão configurados. Contacta a WinPulse.",
    "Le fournisseur refuse l’accès aux scores. L’équipe WinPulse doit vérifier sa configuration.": "O fornecedor recusou o acesso. A WinPulse deve verificar a configuração.",
    "Le quota du fournisseur de scores est épuisé. L’équipe WinPulse doit rétablir le service.": "A quota do fornecedor esgotou-se. A WinPulse deve restabelecer o acesso.",
    "Le fournisseur limite les demandes. Une nouvelle tentative sera effectuée automatiquement.": "O fornecedor limita os pedidos. Haverá nova tentativa automática.",
    "Le fournisseur de scores met trop de temps à répondre. Nouvelle tentative automatique à venir.": "O fornecedor demorou demasiado. Haverá nova tentativa automática.",
    "Le service de scores est temporairement indisponible. Nouvelle tentative automatique à venir.": "Resultados temporariamente indisponíveis. Haverá nova tentativa automática.",
    "Les scores de ces compétitions ne sont pas disponibles auprès du fournisseur.": "O fornecedor não cobre estas competições.",
    "Votre session a expiré ou l’accès est refusé. Reconnectez-vous pour réessayer.": "A sessão expirou ou o acesso foi recusado. Inicia sessão novamente.",
    "Le service de scores n’est pas disponible sur cette version du serveur.": "Esta versão do servidor não disponibiliza resultados.",
    "Le serveur met trop de temps à répondre. Nouvelle tentative automatique à venir.": "O servidor demorou demasiado. Haverá nova tentativa automática.",
    "Les scores ne peuvent pas être actualisés pour le moment. Nouvelle tentative automatique à venir.": "Não é possível atualizar os resultados. Haverá nova tentativa automática.",
    "La préparation des scores prend plus de temps que prévu. Une nouvelle tentative sera effectuée automatiquement.": "A preparação demora mais do que o previsto. Haverá nova tentativa automática.",
    "Réponse des scores invalide": "Resposta de resultados inválida",
    "Certaines compétitions ne sont pas disponibles. Les scores reçus restent affichés.": "Algumas competições estão indisponíveis. Os resultados recebidos continuam visíveis.",
    "Les derniers scores sont trop anciens. Actualisez pour les recharger.": "Estes resultados estão desatualizados. Atualiza para os recarregar.",
    "Derniers scores connus": "Últimos resultados conhecidos",
    "Aucun match en direct actuellement.": "Sem jogos em direto neste momento.",
    "Aucun match terminé récemment.": "Sem jogos terminados recentemente.",
    "Aucun match à venir dans les prochaines heures.": "Sem jogos previstos nas próximas horas.",
    "Équipe domicile": "Equipa da casa",
    "Équipe extérieure": "Equipa visitante",
    "Compétition": "Competição",
    "Dernier score": "Último resultado",
    "À venir": "Próximos",
    "flex items-center justify-between": "flex items-center justify-between",
    "Rugby": "Râguebi",
    "Autres sports": "Outros desportos",
    "Tous les pays": "Todos os países",
    "Bénin": "Benim",
    "Côte d’Ivoire": "Costa do Marfim",
    "Sénégal": "Senegal",
    "Cameroun": "Camarões",
    "Mali": "Mali",
    "France": "França",
    "Belgique": "Bélgica",
    "Luxembourg": "Luxemburgo",
    "Suisse": "Suíça",
    "Canada": "Canadá",
    "Maroc": "Marrocos",
    "Nigeria": "Nigéria",
    "Afrique du Sud": "África do Sul",
    "Réponse vidéo invalide": "Resposta de vídeo inválida",
    "Horaire à confirmer": "Horário por confirmar",
    "Le programme vidéo ne peut pas être actualisé pour le moment. Les scores restent accessibles.": "A programação não pode ser atualizada. Os resultados continuam disponíveis.",
    "L’actualisation des diffusions est temporairement limitée. Une nouvelle tentative est prévue.": "As atualizações das transmissões estão limitadas. Está prevista nova tentativa.",
    "Le programme vidéo est temporairement indisponible. Les scores restent accessibles.": "A programação está temporariamente indisponível. Os resultados continuam disponíveis.",
    "La recherche de nouveaux directs reprendra automatiquement. Les diffusions déjà connues continuent d’être vérifiées.": "A pesquisa retomará automaticamente. As transmissões conhecidas continuam a ser verificadas.",
    "Les diffusions ne peuvent pas être actualisées pour le moment. Les scores restent accessibles.": "Não é possível atualizar as transmissões. Os resultados continuam disponíveis.",
    "Lecteur indisponible": "Leitor indisponível",
    "Le lecteur met trop de temps à répondre": "O leitor demora demasiado a responder",
    "Chargement du lecteur impossible": "Não foi possível carregar o leitor",
    "Le lecteur ne répond pas. Tu peux consulter la diffusion sur YouTube.": "O leitor não responde. Experimenta a transmissão no YouTube.",
    "Cette vidéo n’est pas disponible dans ce lecteur, selon les conditions du diffuseur ou ton pays.": "O vídeo não pode ser reproduzido aqui devido às condições do emissor ou ao teu país.",
    "Le lecteur n’a pas pu démarrer. Tu peux essayer directement sur YouTube.": "A reprodução falhou. Experimenta diretamente no YouTube.",
    "Cette diffusion est terminée.": "Esta transmissão terminou.",
    "Appuie sur le bouton Lecture du lecteur pour démarrer la vidéo.": "Carrega em Reproduzir para iniciar o vídeo.",
    "Le lecteur ne peut pas être chargé. Tu peux consulter la diffusion sur YouTube.": "O leitor não carregou. Abre a transmissão no YouTube.",
    "Dernier score connu": "Último resultado conhecido",
    "Rencontre terminée": "Jogo terminado",
    "Score suivi": "Resultado acompanhado",
    "Rencontre à venir": "Próximo jogo",
    "La rubrique vidéo est en préparation. Les scores restent accessibles.": "A secção de vídeo está em preparação. Os resultados continuam disponíveis.",
    "La collecte suit son calendrier. Le programme s’actualisera automatiquement.": "A recolha segue o calendário. A programação atualizar-se-á automaticamente.",
    "Ajoute YOUTUBE_API_KEY dans les variables du backend et active YouTube Data API v3 dans le projet Google.": "Define YOUTUBE_API_KEY no backend e ativa YouTube Data API v3 no Google.",
    "Impossible de demander l’actualisation des diffusions.": "Não foi possível pedir a atualização das transmissões.",
    "La recherche automatique nécessite YOUTUBE_API_KEY dans le backend. Les chaînes FIFA et FIBA sont sélectionnées par défaut.": "A pesquisa automática exige YOUTUBE_API_KEY no backend. FIFA e FIBA estão selecionados por defeito.",
    "Fermer le lecteur": "Fechar leitor",
    "Le score sélectionné s’affichera ici.": "O resultado selecionado aparecerá aqui.",
    "Les scores disponibles apparaîtront dans cette liste dès leur chargement.": "Os resultados aparecerão nesta lista após o carregamento.",
    "Équipe, rencontre ou diffuseur…": "Equipa, jogo ou emissor…",
    "Filtrer les diffusions par sport": "Filtrar transmissões por desporto",
    "Tous les sports": "Todos os desportos",
    "Diffusion en cours selon le diffuseur": "Em direto segundo o emissor",
    "Regarder le direct": "Ver em direto",
    "Ouvrir le programme": "Abrir programação",
    "Les diffusions vidéo sont en préparation": "Transmissões em preparação",
    "Aucune diffusion ne correspond à ces filtres": "Nenhuma transmissão corresponde aos filtros",
    "Aucune diffusion intégrable disponible actuellement": "Sem transmissões incorporáveis disponíveis agora",
    "Le programme est en cours de préparation. Il s’actualisera automatiquement.": "A programação está em preparação e atualizar-se-á automaticamente.",
    "Retrouve les scores ci-dessous et reviens consulter les prochaines diffusions proposées.": "Consulta os resultados e volta para ver as próximas transmissões.",
    "Live & Scores": "Diretos e resultados",
    "Suivi en temps réel des matchs en cours et des résultats récents. Actualisation automatique toutes les 45 secondes.": "Acompanha jogos em direto e resultados recentes. Atualização automática a cada 45 segundos.",
    "Scores du {{v0}}": "Resultados de {{v0}}",
    "Le fournisseur prépare les scores. La page se mettra à jour automatiquement.": "O fornecedor prepara os resultados. A página atualizar-se-á automaticamente.",
    "Les scores sont temporairement indisponibles.": "Resultados temporariamente indisponíveis.",
    "Terminés{{v0}}": "Terminados{{v0}}",
    "À venir{{v0}}": "Próximos{{v0}}",
    "Actualisé à {{v0}}": "Atualizado às {{v0}}",
    "Ouverture du lecteur…": "A abrir o leitor…",
    "Lecture via YouTube · {{v0}}": "Reprodução via YouTube · {{v0}}",
    "Consulter sur YouTube": "Abrir no YouTube",
    "Les scores se mettent à jour indépendamment de la vidéo.": "Os resultados atualizam-se independentemente do vídeo.",
    "À regarder sur WinPulse": "Para ver na WinPulse",
    "Le match, sur ton écran.": "O jogo, no teu ecrã.",
    "Retrouve les directs intégrables des diffuseurs sélectionnés et suis les scores sur la même page.": "Vê transmissões incorporáveis de emissores selecionados e acompanha os resultados aqui.",
    "Actualiser les diffusions": "Atualizar transmissões",
    "Configuration vidéo · Administrateur": "Configuração de vídeo · Administrador",
    "La tâche vidéo n’est pas active. Vérifie les logs d’initialisation du backend.": "A tarefa de vídeo está inativa. Verifica os registos de arranque do backend.",
    "État fournisseur : {{v0}}": "Estado do fornecedor: {{v0}}",
    "Vérifier la collecte": "Verificar recolha",
    "Un score à suivre": "Um resultado para acompanhar",
    "Choisis la rencontre dont tu veux suivre le score pendant la vidéo.": "Escolhe o resultado a acompanhar durante o vídeo.",
    "Rencontre à suivre": "Jogo a acompanhar",
    "Choisir une rencontre": "Escolhe um jogo",
    "Chaîne du diffuseur": "Canal do emissor",
    "Rechercher une diffusion{{v0}}": "Procurar transmissões{{v0}}",
    "Pays de visionnage{{v0}}": "País de visualização{{v0}}",
    "Chargement du programme vidéo…": "A carregar a programação…",
    "Voir sur YouTube": "Ver no YouTube",
    "Afficher toutes les diffusions": "Mostrar todas as transmissões",
    "Les vidéos sont lues via YouTube. Leur disponibilité dépend du pays et des conditions du diffuseur. Les directs disponibles ne couvrent pas nécessairement toutes les rencontres du tableau des scores.": "Os vídeos são reproduzidos via YouTube. A disponibilidade depende do país e do emissor. Podem não abranger todos os jogos da tabela.",
    "{{v0}} recherches aujourd’hui · Sources : {{v1}} · Dernière vérification : {{v2}}.": "{{v0}} pesquisas hoje · Fontes: {{v1}} · Última verificação: {{v2}}.",
    "Résultat en attente": "Resultado pendente",
    "La sélection décrit l’événement attendu dans le marché indiqué. Consulte les règles de règlement du bookmaker.": "A seleção descreve o resultado esperado. Consulta as regras da casa.",
    "Réponse Montante invalide": "Resposta da Montante inválida",
    "Ta session a expiré. Reconnecte-toi pour retrouver la montante.": "A sessão expirou. Inicia sessão para ver a Montante.",
    "Cette action est réservée à l’administrateur ou à ton niveau d’accès.": "Esta ação exige permissões de administrador ou o nível de acesso adequado.",
    "Le chargement a pris trop de temps. Réessaie dans un instant.": "O carregamento demorou demasiado. Tenta novamente em breve.",
    "Le service Montante est temporairement indisponible. Réessaie dans un instant.": "A Montante está temporariamente indisponível. Tenta novamente em breve.",
    "Contrôle terminé. Les résultats finaux disponibles ont été pris en compte.": "Verificação concluída. Foram aplicados os resultados finais disponíveis.",
    "La série est lancée. La sélection attendra deux matchs admissibles.": "Série iniciada. A seleção aguardará dois jogos elegíveis.",
    "Série terminée": "Série concluída",
    "Série arrêtée": "Série interrompida",
    "Sélections publiées": "Seleções publicadas",
    "Recherche de deux matchs": "A procurar dois jogos",
    "Nouvelle série à venir": "Nova série em breve",
    "Étape": "Etapa",
    "Étapes gagnées": "Etapas ganhas",
    "Matchs publiés": "Jogos publicados",
    " Les dernières données chargées restent affichées.": " Os últimos dados carregados continuam visíveis.",
    "Toutes les cotes comparées": "Todas as odds comparadas",
    "Le classement n’ajoute aucun bonus aux petites cotes.": "A classificação não favorece as odds baixas.",
    "Sources vérifiées": "Fontes verificadas",
    "Les nouvelles sélections exigent des cotes récentes et plusieurs sources complètes.": "Novas seleções exigem odds recentes e várias fontes completas.",
    "Le droit d’attendre": "É possível esperar",
    "Si deux matchs ne passent pas les contrôles, aucune étape n’est publiée.": "Não se publica uma etapa sem dois jogos aprovados nos controlos.",
    "Contrôle…": "A verificar…",
    "Synchroniser les résultats": "Sincronizar resultados",
    "La prochaine série apparaîtra ici dès son lancement par l’administrateur.": "A próxima série aparece quando o administrador a iniciar.",
    "Nouvelle montante à venir": "Nova série Montante em breve",
    "Deux matchs suffisamment documentés ne sont pas encore disponibles.": "Ainda não há dois jogos suficientemente documentados.",
    "Le sélecteur attend deux matchs": "A aguardar dois jogos",
    "Estimation du marché vérifié": "Estimativa do mercado verificado",
    "MONTANTE WNPULSE": "MONTANTE WNPULSE",
    "2 matchs distincts par étape": "2 jogos distintos por etapa",
    "Deux rencontres.{{v0}}{{v1}}": "Dois jogos.{{v0}}{{v1}}",
    "Des choix expliqués.": "Escolhas explicadas.",
    "Les sélections sont comparées selon les estimations et la qualité des données. Une petite cote ne suffit pas à faire un bon choix.": "Comparam-se estimativas e qualidade dos dados. Uma odd baixa não basta para uma boa seleção.",
    "Pilotage administrateur": "Controlos de administrador",
    "Parcours {{v0}}": "Percurso {{v0}}",
    "10 étapes": "10 etapas",
    "15 étapes": "15 etapas",
    "Lancer une nouvelle série": "Iniciar nova série",
    "La série actuelle sera archivée sur le serveur et remplacée.": "A série atual será arquivada no servidor e substituída.",
    "{{v0}}Remplacer la série actuelle": "{{v0}}Substituir série atual",
    "Nouvelle série": "Nova série",
    "Diagnostic de sélection": "Diagnóstico da seleção",
    "{{v0}} matchs reçus · {{v1}} événements admissibles": "{{v0}} jogos recebidos · {{v1}} eventos elegíveis",
    "Parcours de la série": "Progresso da série",
    "{{v0}} étape{{v1}} gagnée{{v2}} sur {{v3}}": "Etapas ganhas: {{v0}} de {{v3}}",
    "Une étape annulée n’est pas une victoire. Les jours sans sélection ne font pas avancer le parcours.": "Uma etapa anulada não é vitória. Dias sem seleção não fazem avançar a série.",
    "Sélections · Étape {{v0}}": "Seleções · Etapa {{v0}}",
    "Cote combinée : {{v0}}": "Odd combinada: {{v0}}",
    "Sélection publiée avant cette mise à jour : elle reste suivie jusqu’à son règlement. Les nouvelles étapes exigent deux matchs.": "A seleção anterior continua acompanhada até à liquidação. Novas etapas exigem dois jogos.",
    "Les mêmes sélections que les abonnés": "As mesmas seleções dos assinantes",
    "Débloque les rencontres, les marchés et les raisons de chaque choix.": "Desbloqueia jogos, mercados e motivos de cada seleção.",
    "Lire l’estimation de la paire": "Ler a estimativa do par",
    "Approximation théorique : {{v0}}, sous hypothèse d’indépendance.": "Aproximação teórica: {{v0}}, supondo independência.",
    "Ce chiffre multiplie deux estimations du moteur. Il ne constitue pas un taux de réussite constaté. Des événements distincts peuvent encore être corrélés.": "Multiplica duas estimativas do motor, não uma taxa de acerto medida. Eventos distintos podem estar correlacionados.",
    "Historique de la série": "Histórico da série",
    "Les victoires, pertes et annulations restent visibles.": "Vitórias, perdas e anulações continuam visíveis.",
    "Aucune étape réglée pour le moment.": "Ainda não há etapas resolvidas.",
    "Étape {{v0}}": "Etapa {{v0}}",
    "{{v0}}{{v1}}{{v2}} · cote {{v3}}": "{{v0}}{{v1}}{{v2}} · odd {{v3}}",
    "{{v0}} sélections · détails réservés aux abonnés.": "{{v0}} seleções · detalhes exclusivos para assinantes.",
    "Ce que la sélection permet de comprendre": "Compreender a seleção",
    "Les petites cotes ne reçoivent aucun bonus. Le sélecteur compare la probabilité estimée, l’accord entre les sources et leur nombre. Ce score de classement n’est pas une probabilité.": "Não se favorecem odds baixas. Comparam-se probabilidade estimada, acordo e número de fontes. A pontuação não é probabilidade.",
    "Les deux matchs doivent être distincts, avec des équipes différentes, des marchés complets et des cotes récentes. Cette vérification ne supprime pas l’incertitude sportive.": "Os jogos exigem equipas diferentes, mercados completos e odds recentes. Os controlos não eliminam a incerteza desportiva.",
    "Les probabilités viennent du moteur existant, souvent du consensus des cotes. L’efficacité de ce nouveau filtrage devra être mesurée sur des résultats futurs, pas uniquement sur les gagnants déjà connus.": "As probabilidades vêm do motor existente, muitas vezes do consenso das odds. O filtro deve medir-se em resultados futuros, não só vencedores passados.",
    "Une seule sélection perdante arrête la série. Aucun pari ni aucune montante ne garantit un résultat.": "Uma seleção perdida interrompe a série. Nenhuma aposta ou série garante resultados.",
    "RENCONTRE {{v0}}": "JOGO {{v0}}",
    "Sélection réservée aux abonnés": "Seleção para assinantes",
    "Sources complètes": "Fontes completas",
    "Estimation issue du consensus des cotes, distincte d’une mesure de réussite réelle.": "Estimativa do consenso das odds, não uma taxa de acerto real medida.",
    "Rencontre commencée : la sélection reste figée en attendant son résultat.": "Jogo iniciado: a seleção mantém-se fixa até ao resultado.",
    "Pourquoi cette sélection ?": "Porquê esta seleção?",
    "Les critères détaillés n’ont pas été enregistrés pour cette ancienne sélection.": "Não foram guardados critérios detalhados desta seleção antiga.",
    "Cotes vérifiées : {{v0}}. Elles peuvent évoluer.": "Odds verificadas: {{v0}}. Podem mudar.",
    "Voir l’analyse du match": "Ver análise do jogo",
    "« {{v0}} » porte sur le total de buts ou de points. Le seuil et la période du marché déterminent le résultat.": "«{{v0}}» trata do total de golos ou pontos. A linha e o período determinam a liquidação.",
    "Non renseignée": "Não indicada",
    "Administrateur": "Administrador",
    "Statistiques absentes": "Estatísticas em falta",
    "Statistiques invalides": "Estatísticas inválidas",
    "Mon profil": "O meu perfil",
    "Abonnement invalide": "Assinatura inválida",
    "Impossible de vérifier votre abonnement. Les informations affichées viennent de votre dernière connexion.": "Não foi possível verificar a assinatura. São mostrados os dados do último acesso.",
    "Impossible de charger les résultats WinPulse. Réessayez dans un instant.": "Não foi possível carregar os resultados WinPulse. Tenta novamente em breve.",
    "Votre profil a été actualisé.": "O perfil foi atualizado.",
    "Impossible d’actualiser votre profil.": "Não foi possível atualizar o perfil.",
    "Votre consentement aux messages WhatsApp a été retiré.": "O consentimento para mensagens WhatsApp foi retirado.",
    "Impossible de modifier votre choix WhatsApp.": "Não foi possível alterar a preferência WhatsApp.",
    "Email non renseigné": "Email não indicado",
    "Date d’expiration non renseignée.": "Data de expiração não indicada.",
    "Passer Pro": "Aderir ao Pro",
    "Voir l’offre Pro": "Ver oferta Pro",
    "Gérer mon abonnement": "Gerir a minha assinatura",
    "Pronostics gratuits selon les disponibilités": "Prognósticos gratuitos conforme disponibilidade",
    "Track Record public complet": "Histórico público completo",
    "Compte personnel WinPulse": "Conta pessoal WinPulse",
    "Tous les pronostics et combinés": "Todos os prognósticos e combinadas",
    "Analyses IA complètes": "Análises detalhadas",
    "Combo Builder et value bets": "Criador de combinadas e value bets",
    "Résultats confirmés": "Resultados confirmados",
    "Remboursés": "Reembolsados",
    "Non renseigné": "Não indicado",
    "Membre depuis": "Membro desde",
    "Vous avez autorisé WinPulse à vous contacter sur votre numéro WhatsApp. Vous pouvez retirer ce consentement à tout moment.": "Autorizaste a WinPulse a contactar-te por WhatsApp. Podes retirar o consentimento a qualquer momento.",
    "Vous n’avez pas de consentement actif pour les messages WhatsApp de WinPulse.": "Não tens consentimento ativo para mensagens WhatsApp da WinPulse.",
    "Autorisé": "Autorizado",
    "Non autorisé": "Não autorizado",
    "Mon espace WinPulse": "O meu espaço WinPulse",
    "Résultats": "Resultados",
    "Résultats WinPulse": "Resultados WinPulse",
    "Mon compte": "A minha conta",
    "Votre accès actuel": "O teu acesso atual",
    "Vérification de votre abonnement…": "A verificar a assinatura…",
    "Les fonctionnalités Pro sont accessibles avec vos droits administrateur.": "As funcionalidades Pro estão disponíveis com as permissões de administrador.",
    "{{v0}} jour{{v1}} restant{{v2}}": "Dias restantes: {{v0}}",
    "Votre ancien accès payant est arrivé à expiration.": "O acesso pago anterior expirou.",
    "Votre ancien accès Elite reste reconnu. L’offre actuellement proposée est WinPulse Pro.": "O acesso Elite anterior continua reconhecido. A oferta atual é WinPulse Pro.",
    "Découvrez les pronostics gratuits disponibles et les résultats publics.": "Descobre os prognósticos gratuitos disponíveis e os resultados públicos.",
    "Consultez l’offre complète et les modalités de paiement sur la page Abonnement.": "Consulta Assinatura para ver a oferta e os meios de pagamento.",
    "Les résultats publics de WinPulse": "Resultados públicos WinPulse",
    "Ces chiffres concernent les pronostics de la plateforme, pas les paris de votre compte. Ils sont visibles en Gratuit comme en Pro pour vous permettre de consulter notre historique.": "Estes números são da plataforma, não das tuas apostas pessoais. Utilizadores gratuitos e Pro podem consultar o histórico.",
    "Bilan des résultats confirmés": "Balanço de resultados confirmados",
    "Cumul du Track Record, tous sports et tous niveaux.": "Histórico acumulado de todos os desportos e níveis.",
    "Aucun résultat confirmé pour le moment": "Ainda não há resultados confirmados",
    "Le bilan se mettra à jour lorsque les pronostics seront résolus.": "O balanço atualizar-se-á quando os prognósticos forem resolvidos.",
    "Taux de réussite WinPulse": "Taxa de acerto WinPulse",
    "Gagnés ÷ (gagnés + perdus). Les remboursements et les pronostics en attente ne sont pas inclus.": "Ganhos ÷ (ganhos + perdidos). Exclui reembolsados e pendentes.",
    "Et mes statistiques personnelles ?": "E as minhas estatísticas pessoais?",
    "Elles nécessitent un historique des paris que vous avez réellement suivis. Aucun suivi personnel n’est relié à cette page actuellement : elle n’affiche donc pas de taux de réussite, de ROI ou de gains attribués à votre compte.": "As estatísticas pessoais exigem registar as tuas apostas. Não há acompanhamento pessoal aqui: não se atribuem taxa de acerto, ROI ou ganhos à conta.",
    "Consulter le Track Record complet": "Ver histórico completo",
    "Mes informations": "Os meus dados",
    "Ces informations correspondent aux données enregistrées sur votre compte.": "Estes dados correspondem aos registados na conta.",
    "Messages WhatsApp": "Mensagens WhatsApp",
    "{{v0}}Retirer mon consentement": "{{v0}}Retirar o consentimento",
    "Voir les pronostics": "Ver prognósticos",
    "Voir les résultats publics": "Ver resultados públicos",
    "Actuel": "Atual",
    "{{v0}} gagnés, {{v1}} perdus, {{v2}} remboursés": "{{v0}} ganhos, {{v1}} perdidos, {{v2}} reembolsados",
    "Non communiqué": "Não indicado",
    "Sélections et cotes à vérifier avant le début des rencontres.": "Verifica as seleções e odds antes dos jogos.",
    "Le serveur met trop de temps à répondre. Tu peux réessayer.": "O servidor demorou demasiado. Tenta novamente.",
    "Deux issues sont couvertes : celles indiquées par la sélection. Vérifie la période à laquelle le marché s’applique.": "Cobre os dois resultados indicados durante o período do mercado.",
    "Le pari concerne le fait que les deux équipes marquent, ou non, pendant la période couverte par le marché.": "Indica se ambas as equipas marcam no período indicado.",
    "Le résultat est évalué après application du handicap indiqué. La ligne et la période du marché déterminent le règlement.": "Aplica-se o handicap, a linha e o período indicados. Verifica as regras da casa.",
    "Le pari porte sur le total indiqué. Les règles de règlement dépendent de la ligne et de la période choisies.": "Refere-se ao total indicado. Verifica a linha, o período e as regras de liquidação.",
    "La sélection prévoit un match nul sur la période couverte par le marché.": "O prognóstico prevê um empate no período abrangido.",
    "Le pronostic se lit avec son marché : consulte la fiche du match pour vérifier la période et les informations disponibles.": "Lê a seleção com o mercado e período. A ficha mostra a informação disponível.",
    "Indisponible": "Indisponível",
    "Pronostic réservé": "Seleção reservada",
    "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.": "O total deve ficar abaixo de {{v0}} no período abrangido.",
    "Le total doit dépasser {{v0}} sur la période couverte par ce marché.": "O total deve ultrapassar {{v0}} no período abrangido.",
    "Le moteur retient {{v0}} comme vainqueur sur la période couverte par le marché.": "O motor escolhe a vitória de {{v0}} no período abrangido.",
    "Cette sélection couvre deux issues du match : celles indiquées dans le pronostic. Elle ne désigne pas nécessairement un vainqueur unique.": "Cobre os dois resultados indicados durante o período do mercado.",
    "L’équipe indiquée doit gagner. Si la rencontre se termine sur un nul, la mise est remboursée selon les règles du marché.": "A equipa indicada deve ganhar. Um empate no período abrangido é reembolsado segundo as regras do mercado.",
    "Le pronostic porte sur le fait que les deux équipes marquent ou non pendant la période indiquée par le marché.": "Indica se ambas as equipas marcam no período indicado.",
    "Le résultat est évalué après application du handicap indiqué dans la sélection. La période et les règles de règlement du bookmaker sont à vérifier.": "Aplica-se o handicap, a linha e o período indicados. Verifica as regras da casa.",
    "La sélection prévoit un match nul pendant la période indiquée par le marché.": "O prognóstico prevê um empate no período abrangido.",
    "La double chance couvre deux issues de la rencontre. Les deux issues couvertes sont celles indiquées dans la sélection.": "Cobre os dois resultados indicados durante o período do mercado.",
    "La sélection vise la victoire de l’équipe indiquée. Si la rencontre se termine sur un match nul, la mise est remboursée selon les règles du marché.": "A equipa indicada deve ganhar. Um empate no período abrangido é reembolsado segundo as regras do mercado.",
    "Ce marché porte sur le fait que les deux équipes marquent ou non pendant la période indiquée. Il ne désigne pas le vainqueur du match.": "Indica se ambas as equipas marcam no período indicado.",
    "Le résultat est évalué après application du handicap indiqué dans la sélection. Vérifie aussi la période concernée et les règles de règlement du bookmaker.": "Aplica-se o handicap, a linha e o período indicados. Verifica as regras da casa.",
    "Ce marché porte sur le total de buts ou de points, pour les équipes et la période indiquées dans la sélection.": "Refere-se ao total indicado. Verifica a linha, o período e as regras de liquidação.",
    "Le pronostic porte sur un match nul pendant la période indiquée par le marché.": "O prognóstico prevê um empate no período abrangido.",
    "Annulé": "Reembolsados",
    "La sélection prévoit un match nul dans la période couverte.": "O prognóstico prevê um empate no período abrangido.",
    "Le résultat se juge après application du handicap indiqué pour l’équipe sélectionnée.": "Aplica-se o handicap, a linha e o período indicados. Verifica as regras da casa.",
    "La sélection prévoit la victoire de {{v0}}, selon les règles de ce marché.": "O motor escolhe a vitória de {{v0}} no período abrangido.",
    "Jackpot": "Jackpot",
    "ring-2 ring-rose-500/40": "ring-2 ring-rose-500/40",
    "PRO": "PRO",
    "vs": "vs",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "KOUKPAKI VIANEY": "KOUKPAKI VIANEY",
    "WinPulse Pro": "WinPulse Pro",
    "pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-8": "pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-8",
    "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8": "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8",
    "calc(4rem + env(safe-area-inset-bottom))": "calc(4rem + env(safe-area-inset-bottom))",
    "FCFA{{v0}}": "FCFA{{v0}}",
    "{{v0}} FCFA": "{{v0}} FCFA",
    "Gemini": "Gemini",
    "Claude": "Claude",
    "edge": "edge",
    "{{v0}} vs {{v1}}": "{{v0}} vs {{v1}}",
    "chez {{bookmaker}}": "na {{bookmaker}}",
    "Vainqueur (1X2)": "Vencedor (1X2)",
    "Total buts/points": "Total de golos/pontos",
    "Total de buts": "Total de golos",
    "Cartons": "Cartões",
    "Corners": "Cantos",
    "Mi-temps": "Intervalo",
    "Match nul": "Empate",
    "Plus de {{line}} buts": "Mais de {{line}} golos",
    "Moins de {{line}} buts": "Menos de {{line}} golos",
    "Plus de {{line}} points": "Mais de {{line}} pontos",
    "Moins de {{line}} points": "Menos de {{line}} pontos",
    "Plus de {{line}} corners": "Mais de {{line}} cantos",
    "Moins de {{line}} corners": "Menos de {{line}} cantos",
    "Plus de {{line}} cartons": "Mais de {{line}} cartões",
    "Moins de {{line}} cartons": "Menos de {{line}} cartões",
    "TERMINÉ": "TERMINADO",
    "EN DIRECT": "EM DIRETO",
    "Pick verrouillé": "Seleção bloqueada",
    "Passe Pro pour voir l’analyse": "Adere ao Pro para ver a análise",
    "Avantage estimé : {{edge}}": "Vantagem estimada: {{edge}}",
    "Analyse en cours…": "Análise em curso…",
    "Autres marchés analysés": "Outros mercados analisados",
    "Partager WhatsApp (Admin)": "Partilhar no WhatsApp (Admin)",
    "Pronostic à risque réduit": "Prognóstico de menor risco",
    "Pronostic à risque modéré": "Prognóstico de risco moderado",
    "Pronostic risqué": "Prognóstico arriscado",
    "Victoire de {{team}}": "Vitória de {{team}}",
    "Plus de {{line}}": "Mais de {{line}}",
    "Moins de {{line}}": "Menos de {{line}}",
    "Oui": "Sim",
    "Non": "Não",
    "Les deux équipes marquent : Oui": "Ambas marcam: Sim",
    "Les deux équipes marquent : Non": "Ambas marcam: Não"
  },
  "de": {
    "Choisir la langue": "Sprache auswählen",
    "Langue de l’interface": "Sprache der Oberfläche",
    "Dashboard": "Übersicht",
    "Live": "Live",
    "Aujourd'hui": "Heute",
    "À la une": "Highlights",
    "Combinés": "Kombiwetten",
    "Combo Builder": "Kombi-Builder",
    "Value bets": "Value Bets",
    "Montante": "Serie",
    "Track record": "Ergebnisbilanz",
    "Profil": "Profil",
    "Parrainage": "Empfehlungen",
    "Abonnement": "Abonnement",
    "Admin": "Verwaltung",
    "New": "Neu",
    "10J": "10T",
    "Free": "Kostenlos",
    "Ton pouls de gagnant": "Dem Spiel einen Schritt voraus",
    "Connecté": "Angemeldet",
    "Déconnexion": "Abmelden",
    "Plus d'options": "Weitere Optionen",
    "Fermer": "Schließen",
    "Plus": "Mehr",
    "Tableau": "Start",
    "Direct": "Live",
    "Jour": "Tag",
    "Créer": "Erstellen",
    "Blog": "Blog",
    "Mentions légales": "Impressum",
    "CGV": "Verkaufsbedingungen",
    "Confidentialité": "Datenschutz",
    "Jeu responsable · 18+": "Verantwortungsvolles Spielen · 18+",
    "© 2026 WinPulse · Dublin, Irlande": "© 2026 WinPulse · Dublin, Irland",
    "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.": "Dieses Konto wurde auf einem anderen Gerät oder Browser angemeldet. Diese Sitzung wurde beendet.",
    "Ta session a expiré. Reconnecte-toi pour continuer.": "Deine Sitzung ist abgelaufen. Melde dich erneut an, um fortzufahren.",
    "EN COURS": "LÄUFT",
    "ÉCHOUÉE": "GESCHEITERT",
    "TERMINÉE": "ABGESCHLOSSEN",
    "AUCUNE": "KEINE",
    "Aucune montante active.": "Keine aktive Serie.",
    "Impossible de charger la montante.": "Die Serie konnte nicht geladen werden.",
    "Impossible d'actualiser la montante.": "Die Serie konnte nicht aktualisiert werden.",
    "Le capital initial doit être un nombre positif.": "Der Startbetrag muss eine positive Zahl sein.",
    "La montante doit durer 10 ou 15 jours.": "Die Serie muss 10 oder 15 Tage dauern.",
    "Impossible de démarrer la montante.": "Die Serie konnte nicht gestartet werden.",
    "Montante WinPulse": "WinPulse-Serie",
    "10 → 15 jours": "10 → 15 Tage",
    "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.": "Das System wählt vorhandene Tipps aus, die seine Kriterien erfüllen. Ein erfolgreicher Tag setzt die Serie fort, ein verlorener Tag beendet sie. Passt keine Auswahl, wartet das Modul.",
    "Actualiser": "Aktualisieren",
    "Montante indisponible": "Serie nicht verfügbar",
    "Contrôle administrateur": "Verwaltungsfunktionen",
    "Montante 10 jours": "10-Tage-Serie",
    "Montante 15 jours": "15-Tage-Serie",
    "Capital initial": "Startbetrag",
    "Démarrer": "Starten",
    "Recommencer": "Neu starten",
    "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.": "Nur Administratoren können die Serie starten oder neu starten, damit Nutzer sie nicht zurücksetzen können.",
    "Chargement de la montante…": "Serie wird geladen…",
    "Aucune montante active": "Keine aktive Serie",
    "L'administrateur doit lancer une montante de 10 ou 15 jours.": "Ein Administrator muss eine Serie für 10 oder 15 Tage starten.",
    "progression": "Fortschritt",
    "mise de départ": "Ausgangseinsatz",
    "Capital théorique": "Theoretischer Betrag",
    "si les journées passent": "bei erfolgreichen Tagen",
    "Progression": "Fortschritt",
    "de la série": "der Serie",
    "Progression de la série": "Fortschritt der Serie",
    "Jour {{day}} sur {{total}}": "Tag {{day}} von {{total}}",
    "Pronostics du jour": "Heutige Tipps",
    "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.": "Die Auswahl hängt von den Kriterien und verfügbaren Daten ab. Ein fester Quotenbereich wird nicht garantiert.",
    "Pick {{number}}": "Tipp {{number}}",
    "Confiance": "Konfidenz",
    "Début :": "Beginn:",
    "En attente d'un pick qualifié": "Warten auf einen geeigneten Tipp",
    "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.": "Das Modul erzwingt keinen Tipp, der seine Kriterien nicht erfüllt.",
    "Historique": "Verlauf",
    "Aucune journée terminée.": "Noch keine abgeschlossenen Tage.",
    "GAGNÉ": "GEWONNEN",
    "REMBOURSÉ": "STORNIERT",
    "PERDU": "VERLOREN",
    "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.": "Keine Sportwette ist garantiert. Die Serie begrenzt die Anzahl der Tipps, beseitigt aber nicht das Risiko. 18+ · Verantwortungsvolles Spielen.",
    "Chargement…": "Wird geladen…",
    "Analyses sportives": "Sportanalysen",
    "Historique des résultats": "Ergebnisverlauf",
    "Articles": "Artikel",
    "Ouvrir l'app": "App öffnen",
    "Connexion": "Anmelden",
    "S'inscrire": "Registrieren",
    "Démarrer gratuit": "Kostenlos starten",
    "Pronostics · Analyses · Résultats publics": "Tipps · Analysen · Öffentliche Ergebnisse",
    "Vise la victoire avec nos pronostics.": "Mit unseren Tipps den Sieg im Blick.",
    "Garde une longueur d’avance.": "Bleib einen Schritt voraus.",
    "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.": "Entdecke die heutigen Tipps und Spielanalysen. Starte kostenlos und wechsle zu Pro für die Tipps und Kombiwetten für Abonnenten.",
    "Découvrir les pronostics": "Tipps entdecken",
    "Découvrir l’offre Pro": "Pro entdecken",
    "Consulter l’historique complet": "Vollständigen Verlauf ansehen",
    "Inscription sans carte": "Registrierung ohne Karte",
    "Résultats publics": "Öffentliche Ergebnisse",
    "Compte gratuit": "Kostenloses Konto",
    "Pronostics disponibles": "Verfügbare Tipps",
    "Chargement des analyses…": "Analysen werden geladen…",
    "Les analyses ne sont pas disponibles pour le moment.": "Die Analysen sind derzeit nicht verfügbar.",
    "Réessayer": "Erneut versuchen",
    "Les analyses du jour arrivent prochainement.": "Die heutigen Analysen folgen in Kürze.",
    "Consulte l’historique de résultats en attendant les prochaines sélections.": "Sieh dir bis zu den nächsten Tipps den Ergebnisverlauf an.",
    "Analyse réservée Pro": "Analyse für Pro",
    "Indice : {{value}} %": "Indikator: {{value}} %",
    "Les indices d’analyse ne garantissent aucun résultat.": "Analyseindikatoren garantieren kein Ergebnis.",
    "Ouvrir l’application": "App öffnen",
    "Créer mon compte gratuit": "Kostenloses Konto erstellen",
    "Historique des pronostics": "Tippverlauf",
    "Les résultats d’hier": "Ergebnisse von gestern",
    "Matchs du {{date}}.": "Spiele am {{date}}.",
    "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.": "Eine Auswahl erfolgreicher Tipps von gestern aus unserer Ergebnisbilanz, nach absteigender Quote sortiert.",
    "Voir tous les résultats": "Alle Ergebnisse ansehen",
    "Chargement des résultats d’hier…": "Ergebnisse von gestern werden geladen…",
    "Le bilan d’hier n’est pas disponible pour le moment.": "Die Übersicht von gestern ist derzeit nicht verfügbar.",
    "Tu peux consulter l’historique complet des résultats.": "Du kannst den vollständigen Ergebnisverlauf ansehen.",
    "Gagnants": "Gewonnen",
    "Perdants": "Verloren",
    "En attente": "Ausstehend",
    "Annulés / remboursés": "Storniert / erstattet",
    "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.": "Tipps insgesamt: {{count}}. Die Karten unten zeigen nur eine Auswahl der erfolgreichen Tipps.",
    "Aucun pronostic publié pour les matchs de cette journée.": "Für die Spiele dieses Tages wurden keine Tipps veröffentlicht.",
    "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.": "Für diesen Tag ist kein erfolgreicher Tipp bestätigt. Die Übersicht bleibt oben sichtbar.",
    "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.": "Die Details der erfolgreichen Tipps sind hier noch nicht verfügbar. Sieh dir den vollständigen Verlauf an.",
    "Gagné": "Gewonnen",
    "Cote publiée": "Veröffentlichte Quote",
    "Score final": "Endstand",
    "Pronostic publié avant le match · résultat confirmé.": "Tipp vor Spielbeginn veröffentlicht · Ergebnis bestätigt.",
    "Les résultats passés ne garantissent pas les prochains résultats.": "Vergangene Ergebnisse garantieren keine zukünftigen Ergebnisse.",
    "COMMENT UTILISER WINPULSE": "SO NUTZT DU WINPULSE",
    "Une analyse pro, claire et immédiate": "Klare, leicht zugängliche Sportanalysen",
    "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.": "Lies die Analysen, prüfe die Ergebnisse und entscheide selbst.",
    "Explications de match": "Spielerklärungen",
    "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.": "Verstehe die Tipps anhand verfügbarer Daten, mit einer lokalen Erklärung oder KI-Unterstützung, sofern eingerichtet.",
    "Scoring rigoureux": "Analyseindikatoren",
    "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.": "Vergleiche Tipps anhand verfügbarer Indikatoren. Ein Indikator garantiert keinen Erfolg.",
    "Combinés par profil": "Kombiwetten nach Profil",
    "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.": "Vergleiche verfügbare Tipps und Risikostufen. Keine Kombiwette ist risikofrei.",
    "Track record transparent": "Transparente Ergebnisbilanz",
    "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.": "Öffentlicher Verlauf, ROI, Trefferquote und Durchschnittsquoten. Erfolgreiche und verlorene Tipps werden erfasst.",
    "Value bets détectés": "Erkennung von Value Bets",
    "Compare les estimations et les cotes proposées. Les estimations restent incertaines.": "Vergleiche Schätzungen mit angebotenen Quoten. Schätzungen bleiben unsicher.",
    "Découverte gratuite": "Kostenlos entdecken",
    "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.": "Erstelle dein Konto ohne Zahlung. Informiere dich anschließend in deinem Konto über Pro.",
    "Retrouve ton code et les conditions du programme dans ton compte.": "Deinen Code und die Programmbedingungen findest du in deinem Konto.",
    "Voir mon code": "Meinen Code ansehen",
    "ABONNEMENT": "ABONNEMENT",
    "Choisis ton accès": "Wähle deinen Zugang",
    "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.": "Entdecke WinPulse kostenlos. Mit Pro erhältst du Tipps, Kombiwetten und Tools für Abonnenten.",
    "Pour découvrir": "Zum Entdecken",
    "Sélections gratuites disponibles": "Verfügbare kostenlose Tipps",
    "Tous les matchs (cotes visibles)": "Alle Spiele mit sichtbaren Quoten",
    "Track record public": "Öffentliche Ergebnisbilanz",
    "pour 30 jours": "für 30 Tage",
    "Accès complet": "Vollständiger Zugang",
    "Tous les pronostics débloqués": "Alle Tipps freigeschaltet",
    "Tous les combinés du jour": "Alle täglichen Kombiwetten",
    "Explications des pronostics": "Erklärungen zu den Tipps",
    "Value bets et Combo Builder": "Value Bets und Kombi-Builder",
    "Montante premium": "Premium-Serie",
    "Support WhatsApp prioritaire": "Bevorzugter WhatsApp-Support",
    "Passer à Pro": "Zu Pro wechseln",
    "© 2026 WinPulse · Joue responsable · 18+": "© 2026 WinPulse · Spiele verantwortungsvoll · 18+",
    "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.": "Tipps sind statistische Analysen und keine Garantien. Setze nur, was du verlieren kannst. WinPulse nimmt keine Wetten an und wettet nicht für Nutzer.",
    "Renseigne ton nom.": "Gib deinen Namen ein.",
    "Ton numéro WhatsApp est obligatoire pour créer ton compte.": "Deine WhatsApp-Nummer ist zur Kontoerstellung erforderlich.",
    "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.": "Gib deine Nummer mit + und Ländervorwahl ein, zum Beispiel +2250700000000.",
    "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.": "Das Registrierungsformular muss aktualisiert werden. Lade die Seite neu und versuche es erneut.",
    "L’inscription n’a pas abouti. Réessaie dans un instant.": "Die Registrierung war nicht erfolgreich. Versuche es gleich erneut.",
    "Analyse les matchs. Vérifie les résultats. Décide toi-même.": "Analysiere Spiele. Prüfe Ergebnisse. Entscheide selbst.",
    "Commence gratuitement, sans carte bancaire.": "Starte kostenlos, ohne Bankkarte.",
    "Historique public des résultats": "Öffentlicher Ergebnisverlauf",
    "Aucun paiement pour créer le compte": "Keine Zahlung zur Kontoerstellung",
    "Invitation détectée": "Einladung erkannt",
    "WinPulse · 18+ · Joue responsable": "WinPulse · 18+ · Spiele verantwortungsvoll",
    "100 % gratuit": "100 % kostenlos",
    "Ton accès gratuit est presque prêt": "Dein kostenloser Zugang ist fast bereit",
    "Crée ton compte pour découvrir WinPulse.": "Erstelle dein Konto, um WinPulse zu entdecken.",
    "Gratuit": "Kostenlos",
    "0 FCFA": "0 FCFA",
    "Sans CB": "Ohne Karte",
    "Aucun paiement": "Keine Zahlung",
    "Libre": "Freie Wahl",
    "Sans engagement": "Ohne Bindung",
    "Nom": "Name",
    "Ton nom complet": "Dein vollständiger Name",
    "Email": "E-Mail",
    "vous@email.com": "du@email.com",
    "Numéro WhatsApp": "WhatsApp-Nummer",
    "(obligatoire)": "(erforderlich)",
    "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.": "Verwende + und die Ländervorwahl: +33 Frankreich, +353 Irland, +225 Elfenbeinküste, +229 Benin, +223 Mali.",
    "Mot de passe": "Passwort",
    "10 caractères minimum": "Mindestens 10 Zeichen",
    "J’ai un code parrainage": "Ich habe einen Empfehlungscode",
    "Code parrainage": "Empfehlungscode",
    "(optionnel)": "(optional)",
    "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.": "Ich möchte über WhatsApp WinPulse-Angebote und Einladungen zu privaten Gruppen oder Communitys erhalten, per manueller oder automatisierter Nachricht. Diese Einwilligung ist freiwillig und zur Kontoerstellung nicht erforderlich. Ich kann sie in meinem Profil widerrufen.",
    "Création du compte…": "Konto wird erstellt…",
    "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.": "Bei der Registrierung ist keine Zahlung erforderlich. WinPulse bietet statistische Analysen und garantiert keine Gewinne.",
    "Politique de confidentialité": "Datenschutzerklärung",
    "Déjà inscrit ?": "Bereits registriert?",
    "Se connecter": "Anmelden",
    "18+ · Joue responsable": "18+ · Spiele verantwortungsvoll",
    "Bienvenue !": "Willkommen!",
    "Erreur {{status}}": "Fehler {{status}}",
    "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.": "Keine Antwort vom Server. Prüfe deine Internetverbindung und versuche es erneut.",
    "Erreur inconnue": "Unbekannter Fehler",
    "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.": "In deinem Konto findest du Tipps, Analysen und verfügbare Ergebnisse. Kein Ergebnis ist garantiert.",
    "© 2026 WinPulse · 18+ · Joue responsable": "© 2026 WinPulse · 18+ · Spiele verantwortungsvoll",
    "Accède à tes pronostics du jour": "Zu deinen heutigen Tipps",
    "Mot de passe oublié ?": "Passwort vergessen?",
    "Connexion en cours…": "Anmeldung läuft…",
    "Pas encore de compte ?": "Noch kein Konto?",
    "Créer un compte gratuit": "Kostenloses Konto erstellen",
    "Cache de connexion effacé. Réessaye maintenant.": "Anmeldecache gelöscht. Versuche es jetzt erneut.",
    "Le navigateur bloque l’accès au stockage local.": "Der Browser blockiert den Zugriff auf den lokalen Speicher.",
    "Problème de connexion ? Effacer le cache de connexion": "Anmeldeprobleme? Anmeldecache löschen",
    "Email ou mot de passe incorrect": "E-Mail oder Passwort falsch",
    "Email deja utilise": "E-Mail-Adresse wird bereits verwendet",
    "Le numéro WhatsApp est obligatoire pour créer un compte": "Für die Kontoerstellung ist eine WhatsApp-Nummer erforderlich",
    "Le mot de passe doit contenir au moins 10 caractères": "Das Passwort muss mindestens 10 Zeichen enthalten",
    "Choisis un mot de passe moins courant": "Wähle ein weniger verbreitetes Passwort",
    "Choisis un mot de passe moins répétitif": "Wähle ein Passwort mit weniger Wiederholungen",
    "Le mot de passe ne doit pas contenir ton adresse email": "Das Passwort darf deine E-Mail-Adresse nicht enthalten",
    "Trop de tentatives. Réessaie plus tard.": "Zu viele Versuche. Versuche es später erneut.",
    "Actualisation en cours…": "Wird aktualisiert…",
    "Football": "Fußball",
    "Basketball": "Basketball",
    "Tennis": "Tennis",
    "en attente": "Ausstehend",
    "Sport": "Sport",
    "En direct{{v0}}": "LIVE{{v0}}",
    "Terminé": "BEENDET",
    "{{v0}} en direct": "{{v0}} LIVE",
    "Hockey": "Eishockey",
    "Tous les marchés": "Alle Wettmärkte",
    "Vainqueur": "Sieger",
    "Mon ticket WNPulse": "Mon ticket WNPulse",
    "Les deux équipes marquent": "Beide Teams treffen",
    "Effacer la recherche": "Suche löschen",
    "WNPULSE · COMBO BUILDER": "WNPULSE · COMBO BUILDER",
    "Aujourd’hui": "Heute",
    "Cote {{v0}}": "Quote {{v0}}",
    "Réinitialiser les filtres": "Filter zurücksetzen",
    "WhatsApp": "WhatsApp",
    "Confiance {{v0}}": "Konfidenz {{v0}}",
    "Clipboard unavailable": "Clipboard unavailable",
    "Cote": "Quote",
    "Confiance du moteur": "Modellkonfidenz",
    "WNPULSE · LES COMBINÉS": "WNPULSE · LES COMBINÉS",
    "Tous": "Alle",
    "🏆 Victoire": "🏆 Sieger",
    "Double chance": "Doppelte Chance",
    "🔄 Double chance": "🔄 Doppelte Chance",
    "Handicap": "Handicap",
    "⚖️ Handicap": "⚖️ Handicap",
    "🟢 SÛR": "🟢 GERINGERES RISIKO",
    "🟡 MODÉRÉ": "🟡 MODERAT",
    "🔴 RISQUÉ": "🔴 HÖHERES RISIKO",
    "LIVE": "LIVE",
    "Passe Pro pour débloquer": "Mit Pro freischalten",
    "Pronostic": "Tipp",
    "Partager sur WhatsApp": "Auf WhatsApp teilen",
    "Gagnés": "Gewonnen",
    "Perdus": "Verloren",
    "Perdu": "VERLOREN",
    "Marché": "Wettmarkt",
    "Découvrir Pro": "Pro entdecken",
    "{{v0}} gagnés": "{{v0}} Gewonnen",
    "{{v0}} perdus": "{{v0}} Verloren",
    "📈 Over 2.5": "📈 Über 2,5",
    "🎯 BTTS": "🎯 Beide treffen",
    "⚽ Over/Under": "⚽ Über/Unter",
    "over 2": "over 2",
    "les deux": "beide",
    "WhatsApp ouvert": "WhatsApp geöffnet",
    "Partager sur WhatsApp (Admin)": "Auf WhatsApp teilen (Admin)",
    "Sélection éditoriale automatique": "Automatische redaktionelle Auswahl",
    "À la une — Top picks du jour": "Highlights — Tipps des Tages",
    "Les pronostics avec la plus haute confiance, tous sports confondus.{{v0}}": "Tipps mit höchster Konfidenz über alle Sportarten.{{v0}}",
    "{{v0}} picks analysés": "{{v0}} analysierte Tipps",
    "1 pick visible · {{v0}} verrouillés": "1 sichtbarer Tipp · {{v0}} gesperrt",
    "Passe Pro pour voir tous les picks et les 3 combinés du jour.": "Mit Pro verfügbare Tipps und Tageskombis ansehen.",
    "Débloquer": "Freischalten",
    "Aucun pick pour ce marché.": "Keine Tipps für diesen Markt.",
    "Voir tous les picks": "Alle Tipps ansehen",
    "Pronostic verrouillé": "Gesperrter Tipp",
    "Marché : {{v0}}": "Markt: {{v0}}",
    "Confiance IA : {{v0}}%": "Modellkonfidenz: {{v0}} %",
    "Un seul prix. Tout WinPulse. Sans compromis.": "Ein Preis. Ganz WinPulse.",
    "Accès illimité à tous les pronostics, tous les jours, sur 7 sports": "Unbegrenzter Zugriff auf verfügbare Tipps in 7 Sportarten",
    "Tous les combinés (Sûr, Booster, Extra, Jackpot) débloqués": "Alle verfügbaren Kombiprofile freischalten",
    "Chaque match analysé sur tous ses marchés": "Analyse aller verfügbaren Märkte pro Spiel",
    "Combo Builder et détecteur de value bets": "Kombi-Builder und Value-Bet-Suche",
    "Analyse IA experte sur chaque match": "Ausführliche Erklärungen zu Tipps",
    "Montante WinPulse avec picks débloqués": "WinPulse-Serie mit freigeschalteten Tipps",
    "Track Record public et vérifiable": "Öffentliche, überprüfbare Ergebnisbilanz",
    "Support prioritaire par WhatsApp": "Bevorzugter WhatsApp-Support",
    "Offre en ligne momentanément indisponible. Le plan WinPulse reste affiché.": "Online-Angebot vorübergehend nicht verfügbar. Der WinPulse-Tarif bleibt sichtbar.",
    "Indique le nom utilisé pour le paiement.": "Gib den bei der Zahlung verwendeten Namen an.",
    "Indique le numéro MTN Mobile Money utilisé.": "Gib die verwendete MTN-Mobile-Money-Nummer an.",
    "Le plan d'abonnement n'est pas disponible.": "Der Abotarif ist nicht verfügbar.",
    "La référence de suivi n'a pas été générée.": "Die Referenz wurde nicht erzeugt.",
    "Lien de paiement FedaPay invalide.": "Ungültiger FedaPay-Zahlungslink.",
    "Le lien de paiement doit utiliser HTTPS.": "Der Zahlungslink muss HTTPS verwenden.",
    "Impossible de générer la référence de paiement.": "Zahlungsreferenz konnte nicht erzeugt werden.",
    "Référence copiée": "Referenz kopiert",
    "Bonjour WinPulse !": "Hallo WinPulse!",
    "Merci de vérifier mon paiement et d'activer mon accès.": "Bitte prüft meine Zahlung und aktiviert meinen Zugang.",
    "Paiement sécurisé via FedaPay · choisis ton moyen de paiement sur la page FedaPay · annulable à tout moment": "Sicher zahlen über FedaPay · Zahlungsart dort wählen · jederzeit kündbar",
    "Paiement sécurisé · MTN Mobile Money disponible en solution de secours · annulable à tout moment": "Sichere Zahlung · MTN Mobile Money als Alternative · jederzeit kündbar",
    "Plan actuel": "Aktueller Tarif",
    "Paiement WinPulse": "WinPulse-Zahlung",
    "Informations de paiement": "Zahlungsinformationen",
    "Détails du paiement": "Zahlungsdetails",
    "Nom et prénom": "Vor- und Nachname",
    "Téléphone (facultatif)": "Telefon (optional)",
    "Numéro MTN Mobile Money": "MTN-Mobile-Money-Nummer",
    "Ex. +229 01 97 00 00 00": "Z. B. +229 01 97 00 00 00",
    "Ex. 01 97 00 00 00": "Z. B. 01 97 00 00 00",
    "Copier la référence": "Referenz kopieren",
    "Ouverture du paiement…": "Zahlung wird geöffnet…",
    "Préparation du paiement…": "Zahlung wird vorbereitet…",
    "Un seul accès. Tout WinPulse.": "Ein Zugang. Ganz WinPulse.",
    "Plan actif :{{v0}}{{v1}}": "Aktiver Tarif:{{v0}}{{v1}}",
    "Débloquer WinPulse Pro": "WinPulse Pro freischalten",
    "Sans engagement · résiliable à tout moment · support WhatsApp inclus": "Ohne Bindung · jederzeit kündbar · WhatsApp-Support inklusive",
    "Aucun plan disponible pour le moment.": "Derzeit kein Tarif verfügbar.",
    "{{v0}} FCFA / mois": "{{v0}} FCFA / Monat",
    "Débloquer Pro": "Pro freischalten",
    "WinPulse Pro · {{v0}} FCFA / mois": "WinPulse Pro · {{v0}} FCFA / Monat",
    "Montant de l'abonnement": "Abobetrag",
    "30 jours · WinPulse Pro": "30 Tage · WinPulse Pro",
    "{{v0}} Après validation, tu seras redirigé vers la page de paiement.": "{{v0}} Nach Bestätigung geht es zur Zahlungsseite.",
    "Paiement sécurisé par FedaPay.": "Sichere Zahlung über FedaPay.",
    "Email du compte": "Konto-E-Mail",
    "Nom utilisé pour le paiement": "Bei der Zahlung verwendeter Name",
    "Référence de suivi": "Referenznummer",
    "Procédure MTN Mobile Money": "MTN-Mobile-Money-Anleitung",
    "1. Compose {{v0}} ou ouvre l'application MTN MoMo.": "1. Wähle {{v0}} oder öffne die MTN-MoMo-App.",
    "2. Envoie {{v0}} au {{v1}}.": "2. Sende {{v0}} an {{v1}}.",
    "3. Vérifie le destinataire : {{v0}}.": "3. Prüfe den Empfänger: {{v0}}.",
    "4. Garde le SMS de confirmation puis contacte WinPulse sur WhatsApp.": "4. Bewahre die Bestätigungs-SMS auf und kontaktiere WinPulse per WhatsApp.",
    "Envoyer la confirmation sur WhatsApp": "Bestätigung per WhatsApp senden",
    "Référence : {{v0}}": "Referenz: {{v0}}",
    "Je viens d'effectuer le paiement pour activer mon plan {{v0}}.": "Ich habe bezahlt, um meinen Tarif {{v0}} zu aktivieren.",
    "Montant : {{v0}} FCFA": "Betrag: {{v0}} FCFA",
    "Numéro MTN MoMo utilisé : {{v0}}": "Verwendete MTN-MoMo-Nummer: {{v0}}",
    "Nom : {{v0}}": "Name: {{v0}}",
    "Email : {{v0}}": "E-Mail: {{v0}}",
    "Débloquer {{v0}}": "{{v0}} freischalten",
    "Payer {{v0}} FCFA": "{{v0}} FCFA zahlen",
    "Continuer — {{v0}} FCFA": "Weiter — {{v0}} FCFA",
    "Impossible de charger le parrainage": "Empfehlungsprogramm konnte nicht geladen werden",
    "Lien copié — partage-le maintenant !": "Link kopiert — jetzt teilen!",
    "Récompense activée !": "Belohnung aktiviert!",
    "Réclamation impossible": "Belohnung konnte nicht eingelöst werden",
    "Copie ton lien ou ton code unique.": "Kopiere deinen persönlichen Link oder Code.",
    "Partage-le sur WhatsApp, en 1 clic.": "Mit einem Klick auf WhatsApp teilen.",
    "Découvre WinPulse — IA pronostics sportifs": "Entdecke WinPulse — Sporttipps",
    "70%+ de réussite": "Überprüfbare Ergebnisse",
    "Track record public, vérifiable à tout moment.": "Öffentliche, jederzeit überprüfbare Ergebnisbilanz.",
    "Communauté active": "Aktive Community",
    "Picks décortiqués, analyses IA, combinés du jour.": "Erklärte Tipps, Analysen und Tageskombis.",
    "1 mois, paiement MTN. Pas de carte, pas de piège.": "Ein Monat, MTN-Zahlung. Keine Karte erforderlich.",
    "Programme parrainage": "Empfehlungsprogramm",
    "Invite 3 amis,{{v0}}reçois {{v1}}": "Lade 3 Freunde ein,{{v0}}erhalte {{v1}}",
    "7 jours Pro offerts": "7 kostenlose Pro-Tage",
    "Partage ton lien WhatsApp en 1 clic. Dès que {{v0}} créent leur compte, ton accès Pro s'active automatiquement — vraiment gratuit.": "Teile deinen Link. Sobald sich {{v0}} registrieren, wird dein kostenloser Pro-Zugang aktiviert.",
    "3 amis": "3 Freunde",
    "Ton code": "Dein Code",
    "Ta progression": "Dein Fortschritt",
    "{{v0}} / {{v1}} amis inscrits": "{{v0}} / {{v1}} Freunde registriert",
    "🎉 Bravo ! Tu peux réclamer ta récompense.": "🎉 Glückwunsch! Löse deine Belohnung ein.",
    "Récompense déjà réclamée. Merci d'avoir parrainé tes amis !": "Belohnung bereits eingelöst. Danke für deine Empfehlungen!",
    "Encore {{v0}} ami{{v1}} à inviter pour débloquer ta semaine Pro.": "Noch benötigte Freunde für deine Pro-Woche: {{v0}}.",
    "Comment ça marche": "So funktioniert es",
    "Partager maintenant": "Jetzt teilen",
    "Envoyer par email": "Per E-Mail senden",
    "Pourquoi ils vont kiffer": "Warum es ihnen gefällt",
    "Code {{v0}} copié": "Code {{v0}} kopiert",
    "Dès que 3 amis créent leur compte avec ton code, {{v0}} jours Pro s'activent.": "Sobald sich 3 Freunde mit deinem Code registrieren, werden {{v0}} Pro-Tage aktiviert.",
    "Cette rencontre n’est plus disponible dans les matchs actuels.": "Dieses Spiel ist nicht mehr in der aktuellen Liste.",
    "La rencontre ne peut pas être chargée pour le moment. Réessaie depuis le dashboard.": "Spiel konnte nicht geladen werden. Versuche es im Dashboard erneut.",
    "Le serveur réserve cette analyse à Pro. L’explication du pronostic reste disponible ci-dessus.": "Diese Analyse ist nur für Pro. Die Tipperklärung bleibt oben verfügbar.",
    "L’explication complémentaire est indisponible pour le moment. Les informations du pronostic restent affichées.": "Zusätzliche Erklärung nicht verfügbar. Tippdaten bleiben sichtbar.",
    "Match introuvable.": "Spiel nicht gefunden.",
    "Bookmakers": "Wettanbieter",
    "Écart estimé": "Geschätzte Differenz",
    " points": " Punkte",
    "Estimation du moteur": "Modellschätzung",
    "Cote optimale": "Beste Quote",
    "H2H (10 derniers)": "Direktduelle (letzte 10)",
    "Forme récente": "Aktuelle Form",
    "xG moyens": "Durchschnittliche xG",
    "Absences clés": "Wichtige Ausfälle",
    "Cartons arbitre": "Schiedsrichterkarten",
    "Conditions": "Bedingungen",
    "Forme et historique H2H réels (football-data.org) quand disponibles. Autres champs : analyse basée sur le consensus des cotes bookmakers.": "Reale Form und Direktduelle von football-data.org, sofern verfügbar. Andere Angaben nutzen den Quotenkonsens.",
    "Analyse basée uniquement sur le consensus des cotes bookmakers agrégées — aucune statistique externe fabriquée.": "Nur auf aggregiertem Quotenkonsens basierend; keine erfundenen externen Statistiken.",
    "Enrichir l’explication": "Erklärung erweitern",
    "Source non précisée par le service": "Quelle nicht angegeben",
    "Moteur statistique": "Statistisches Modell",
    "Retour au dashboard": "Zurück zum Dashboard",
    "Retour": "Zurück",
    "VS": "VS",
    "Passe Pro pour voir le pick complet": "Mit Pro den vollständigen Tipp ansehen",
    "Inclut la cote optimale, le score de confiance, l'edge value et l'analyse IA experte.": "Enthält beste Quote, Konfidenz, geschätzten Vorteil und ausführliche Analyse.",
    "Pronostic principal": "Haupttipp",
    "Bookmakers utilisés :": "Verwendete Wettanbieter:",
    "Partager": "Teilen",
    "Comprendre ce pronostic": "Diesen Tipp verstehen",
    "Le moteur compare les marchés et les cotes disponibles pour classer les sélections. L’estimation affichée est un indicateur calculé ; elle ne garantit pas le résultat du match.": "Das Modell vergleicht Märkte und Quoten zur Einstufung. Die Schätzung ist ein Indikator, keine Ergebnisgarantie.",
    "Nombre de bookmakers annoncé pour cette analyse : {{v0}}. Cote de la sélection : {{v1}}.": "Angegebene Wettanbieter: {{v0}}. Tippquote: {{v1}}.",
    "Des statistiques externes sont disponibles pour compléter cette analyse. Leur détail figure plus bas.": "Externe Statistiken zur Ergänzung findest du weiter unten.",
    "Les informations disponibles ne permettent pas ici d’ajouter une analyse vérifiée de la forme des équipes ou des absences.": "Die Daten erlauben hier keine geprüfte Form- oder Ausfallanalyse.",
    "Tous les marchés analysés": "Alle analysierten Märkte",
    "· {{v0}} books": "· {{v0}} Wettanbieter",
    "· edge +{{v0}}%": "· Vorteil +{{v0}} %",
    "Analyse détaillée": "Ausführliche Analyse",
    "Données du moteur": "Modelldaten",
    "Aucune statistique externe vérifiée disponible pour ce match — le moteur s'appuie uniquement sur le consensus des cotes bookmakers, sans donnée inventée.": "Keine geprüften externen Statistiken. Das Modell nutzt nur den Quotenkonsens, ohne erfundene Daten.",
    "Explication complémentaire": "Zusätzliche Erklärung",
    "Demande une présentation complémentaire des éléments disponibles. Selon la configuration du service, le texte peut être rédigé avec l’aide d’une IA ou par le moteur statistique.{{v0}}": "Erklärung vorhandener Daten anfordern. Je nach Konfiguration entsteht der Text mit KI-Hilfe oder durch das statistische Modell.{{v0}}",
    "Certaines analyses complémentaires sont réservées à Pro. {{v0}}.": "Einige zusätzliche Analysen benötigen Pro. {{v0}}.",
    "Verdict": "Fazit",
    "Facteurs clés": "Wichtige Faktoren",
    "Alternative :": "Alternative:",
    "Source : {{v0}}": "Quelle: {{v0}}",
    "Cotes par bookmaker": "Quoten nach Anbieter",
    "Bookmaker": "Wettanbieter",
    "Données réelles (football-data.org) — forme récente et historique des confrontations directes, disponibles pour les grandes compétitions européennes suivies.": "Reale Daten von football-data.org: Form und Direktduelle der abgedeckten großen Europawettbewerbe.",
    "{{v0}} derniers matchs (réel)": "Letzte {{v0}} Spiele (reale Daten)",
    "{{v0}} {{v1}} V": "{{v0}} {{v1}} S",
    "{{v0}} {{v1}} N": "{{v0}} {{v1}} U",
    "{{v0}} {{v1}} D": "{{v0}} {{v1}} N",
    "Forme récente non disponible": "Aktuelle Form nicht verfügbar",
    "📅 Confrontations directes (historique réel)": "📅 Direktduelle (reale Historie)",
    "Nuls": "Unentschieden",
    "Bilan agrégé des confrontations directes récentes. Détail match par match non disponible sur la source actuelle.": "Zusammengefasste Bilanz jüngster Direktduelle. Diese Quelle bietet keine Einzelspieldetails.",
    "La sélection « {{v0}} » porte sur le total de buts ou de points pour les équipes et la période indiquées par le marché. Elle ne dépend pas uniquement du vainqueur de la rencontre.": "„{{v0}}“ betrifft die Gesamtzahl der Tore oder Punkte im Marktzeitraum, nicht nur den Sieger.",
    "La sélection prévoit la victoire de {{v0}}, selon la période et les règles du marché.": "Erwartet einen Sieg von {{v0}} gemäß Marktzeitraum und Regeln.",
    "La sélection « {{v0}} » décrit l’événement attendu dans le marché indiqué. Vérifie la période et les règles de règlement du bookmaker.": "„{{v0}}“ beschreibt den erwarteten Marktausgang. Prüfe Zeitraum und Abrechnungsregeln.",
    "Rédaction assistée par IA ({{v0}})": "KI-unterstützter Text ({{v0}})",
    "supérieur": "über",
    "inférieur": "unter",
    "l’équipe indiquée": "das angegebene Team",
    "La sélection indique l’événement attendu. Vérifie le marché, la période du match et les règles de règlement avant de l’utiliser.": "Prüfe erwarteten Ausgang, Markt, Zeitraum und Abrechnungsregeln vor der Nutzung.",
    "Invalid value bets response": "Ungültige Value-Bet-Antwort",
    "Écart non communiqué": "Differenz nicht angegeben",
    "Cela signale une opportunité possible si l’estimation est fiable.": "Mögliche Chance, sofern die Schätzung zuverlässig ist.",
    "Ces chiffres ne montrent pas d’avantage positif à cette cote.": "Diese Zahlen zeigen keinen positiven Vorteil bei dieser Quote.",
    "Ta session a expiré. Reconnecte-toi pour consulter les sélections.": "Sitzung abgelaufen. Melde dich für die Tipps an.",
    "Les sélections ne peuvent pas être chargées pour le moment. Réessaie dans quelques instants.": "Tipps konnten nicht geladen werden. Versuche es gleich erneut.",
    "Chargement des sélections": "Tipps werden geladen",
    "ne sont": "sind nicht",
    "Aucune sélection à venir disponible pour le moment.": "Derzeit keine Tipps für kommende Spiele verfügbar.",
    "Aucune sélection disponible pour cette date.": "Keine Tipps für diesen Termin.",
    "Reviens plus tard ou actualise les données.": "Komm später wieder oder aktualisiere die Daten.",
    "Essaie toutes les dates à venir.": "Versuche alle kommenden Termine.",
    "Date et heure à confirmer": "Datum und Uhrzeit noch offen",
    "Estimation WinPulse": "WinPulse-Schätzung",
    "Probabilité implicite de la cote": "Implizite Wahrscheinlichkeit der Quote",
    "WinPulse affiche une estimation de {{v0}}. La cote de {{v1}} correspond à {{v2}} en probabilité implicite : l’écart est de {{v3}}. {{v4}}": "WinPulse schätzt {{v0}}. Quote {{v1}} impliziert {{v2}}; Differenz: {{v3}}. {{v4}}",
    "Il manque une cote ou une probabilité valide pour expliquer l’écart de cette sélection.": "Für diese Erklärung fehlen eine gültige Quote oder Wahrscheinlichkeit.",
    "L’écart de probabilité n’est pas un pourcentage de gain. Les cotes évoluent et l’estimation peut être erronée. Pour un marché avec remboursement, la probabilité implicite ne décrit pas à elle seule toutes les issues de règlement.": "Die Differenz ist kein Gewinnprozentsatz. Quoten ändern sich, Schätzungen können falsch sein. Bei Erstattungsmärkten beschreibt die implizite Wahrscheinlichkeit nicht alle Abrechnungsfälle.",
    "Détecteur de value bets": "Value-Bet-Suche",
    "Des opportunités à examiner": "Chancen zum Prüfen",
    "Retrouve la rencontre, son horaire, le marché conseillé et les chiffres qui expliquent chaque sélection.": "Sieh Spiel, Uhrzeit, vorgeschlagenen Markt und Kennzahlen jedes Tipps.",
    "Une {{v0}} est une sélection dont la probabilité estimée dépasse le seuil implicite de la cote. L’écart, appelé {{v1}}, est exprimé ici en {{v2}}. Il dépend de la fiabilité de l’estimation.": "Ein {{v0}} hat eine geschätzte Wahrscheinlichkeit über der Quotenschwelle. Die Differenz, {{v1}}, wird in {{v2}} angegeben und hängt von der Schätzgüte ab.",
    "value bet": "Value Bet",
    "points de probabilité": "Wahrscheinlichkeitspunkten",
    "Voir un exemple de calcul": "Rechenbeispiel ansehen",
    "Exemple hypothétique, pour un pari sans remboursement : à cote 2,00, le seuil implicite est 50 %. Si la probabilité réelle était 60 %, l’écart serait de 10 points et le rendement moyen théorique serait de 20 % (0,60 × 2 − 1). Cela ne garantit aucun gain et suppose une estimation correcte.": "Hypothetische Wette ohne Erstattung: Quote 2,00 impliziert 50 %. Bei tatsächlich 60 % wären es 10 Punkte Differenz und 20 % theoretischer Durchschnittsertrag (0,60 × 2 − 1). Keine Gewinngarantie; korrekte Schätzung vorausgesetzt.",
    "Les value bets sont réservés à Pro": "Value Bets nur für Pro",
    "Accède aux rencontres, dates, marchés et explications des sélections avec ton abonnement Pro.": "Pro umfasst Spiele, Termine, Märkte und Tipperklärungen.",
    "Créer mon compte": "Mein Konto erstellen",
    "Se reconnecter": "Erneut anmelden",
    "{{v0}} sélection{{v1}} affichée{{v2}}": "Angezeigte Tipps: {{v0}}",
    "Horaires dans ton fuseau : {{v0}}.": "Zeiten in deiner Zeitzone: {{v0}}.",
    "Toutes les dates à venir": "Alle kommenden Termine",
    "Tri{{v0}}": "Sortierung{{v0}}",
    "Écart estimé décroissant": "Höchste geschätzte Differenz",
    "Date et heure": "Datum und Uhrzeit",
    "{{v0}} sélection{{v1}} dont le match a déjà commencé {{v2}} plus proposée{{v3}} ici.": "Wegen Spielbeginn entfernte Tipps: {{v0}}.",
    "Voir toutes les dates": "Alle Termine ansehen",
    "Les estimations ne garantissent aucun résultat. Vérifie les cotes et les règles du marché avant utilisation. 18+.": "Schätzungen garantieren kein Ergebnis. Quoten und Marktregeln prüfen. 18+.",
    "La sélection porte sur un total {{v0}} à {{v1}} pour les buts ou points et la période indiqués dans le marché. Le vainqueur peut être différent de l’équipe favorite.": "Der Tipp betrifft eine Gesamtsumme {{v0}} {{v1}} im Marktzeitraum. Der Sieger kann vom Favoriten abweichen.",
    "Le pronostic porte sur la victoire de {{v0}}, selon la période et les règles du marché.": "Erwartet einen Sieg von {{v0}} gemäß Marktzeitraum und Regeln.",
    "{{v0}}{{v1}} points": "{{v0}}{{v1}} Punkte",
    "Foot US": "American Football",
    "Autres": "Sonstige",
    "Buts / points": "Tore / Punkte",
    "Autres marchés": "Weitere Wettmärkte",
    "Horaire non communiqué": "Uhrzeit nicht angegeben",
    "International": "International",
    "Espagne": "Spanien",
    "Allemagne": "Deutschland",
    "Italie": "Italien",
    "Angleterre": "England",
    "Pologne": "Polen",
    "Finlande": "Finnland",
    "Japon": "Japan",
    "Chine": "China",
    "Portugal": "Portugal",
    "Brésil": "Brasilien",
    "Argentine": "Argentinien",
    "Deux issues sont couvertes : celles indiquées dans la sélection, sur la période du marché.": "Deckt die beiden angegebenen Ausgänge im Marktzeitraum ab.",
    "Le marché porte sur le fait que les deux équipes marquent, ou non, pendant la période indiquée.": "Betrifft, ob beide Teams im angegebenen Zeitraum treffen.",
    "Le résultat est évalué après application du handicap affiché. La ligne et la période du marché déterminent son règlement.": "Abrechnung nach Handicap, Linie und Marktzeitraum. Prüfe die Anbieterregeln.",
    "Le pari porte sur le total indiqué. Vérifie les règles de la ligne et de la période choisies.": "Betrifft die angegebene Gesamtsumme. Prüfe Linie, Zeitraum und Abrechnungsregeln.",
    "La sélection prévoit un match nul sur la période couverte.": "Der Tipp erwartet ein Unentschieden im abgedeckten Zeitraum.",
    "Lis cette sélection avec son marché et sa période. La fiche du match présente les informations disponibles.": "Lies den Tipp mit Markt und Zeitraum. Die Spielseite zeigt verfügbare Informationen.",
    "Marché réservé": "Reservierter Wettmarkt",
    "Marché non communiqué": "Wettmarkt nicht angegeben",
    "Compétition non communiquée": "Wettbewerb nicht angegeben",
    "Rencontre commencée ou horaire à vérifier": "Spiel begonnen oder Uhrzeit zu prüfen",
    "Sélection à vérifier : elle n’est plus proposée avec une cote disponible": "Tipp prüfen: Keine verfügbare Quote mehr",
    "heure locale du navigateur": "lokale Browserzeit",
    " · Marché estimé, cote à confirmer": " · Geschätzter Markt, Quote bestätigen",
    "Confiance moyenne non disponible": "Durchschnittliche Konfidenz nicht verfügbar",
    "Sélections et cotes à vérifier avant les rencontres.": "Prüfe Tipps und Quoten vor den Spielen.",
    "Ticket enregistré": "Gespeicherter Wettschein",
    "Domicile": "Heim",
    "Nul": "Unentschieden",
    "Extérieur": "Auswärts",
    "Plus de 2,5 buts": "Über 2,5 Tore",
    "Plus de 1,5 but": "Über 1,5 Tore",
    "Domicile : aucun but encaissé": "Heimteam ohne Gegentor",
    "Extérieur : aucun but encaissé": "Auswärtsteam ohne Gegentor",
    "Ta session a expiré. Reconnecte-toi.": "Deine Sitzung ist abgelaufen. Melde dich erneut an.",
    "Cette fonction est réservée aux abonnés. Vérifie ton accès.": "Nur für Abonnenten. Prüfe deinen Zugang.",
    "Les actualisations sont temporairement limitées. Réessaie dans quelques instants.": "Aktualisierungen sind begrenzt. Versuche es gleich erneut.",
    "Le serveur met trop de temps à répondre. Réessaie.": "Der Server antwortet zu langsam. Versuche es erneut.",
    "Impossible de charger les tickets enregistrés.": "Gespeicherte Wettscheine konnten nicht geladen werden.",
    "Ton accès n’a pas pu être actualisé. L’enregistrement sera disponible après vérification.": "Zugang konnte nicht aktualisiert werden. Speichern nach Prüfung verfügbar.",
    "Impossible d’actualiser les rencontres. La dernière liste chargée reste disponible.": "Spiele konnten nicht aktualisiert werden. Die letzte Liste bleibt sichtbar.",
    "Cette sélection n’est pas disponible avec une cote et un horaire utilisables. Actualise le catalogue.": "Für diesen Tipp fehlen Quote oder Uhrzeit. Aktualisiere den Katalog.",
    "Actualise le catalogue pour vérifier ton accès aux repères.": "Aktualisiere den Katalog, um den Indikatorzugang zu prüfen.",
    "Les repères de marché ne sont pas disponibles. Réessaie.": "Marktindikatoren sind nicht verfügbar. Versuche es erneut.",
    "Actualise le catalogue pour vérifier ton accès à l’enregistrement.": "Aktualisiere den Katalog, um die Speicherberechtigung zu prüfen.",
    "Actualise les rencontres et vérifie les sélections signalées avant d’enregistrer.": "Aktualisiere Spiele und prüfe markierte Tipps vor dem Speichern.",
    "Ce ticket est déjà enregistré.": "Dieser Wettschein ist bereits gespeichert.",
    "Ticket enregistré dans tes combinés.": "Wettschein in deinen Kombis gespeichert.",
    "L’enregistrement n’a pas été confirmé. Vérifie la liste des tickets avant de réessayer.": "Speichern nicht bestätigt. Prüfe deine Wettscheine vor einem neuen Versuch.",
    "Ticket copié.": "Wettschein kopiert.",
    "Sélectionne le texte ci-dessous pour le copier.": "Markiere den Text unten zum Kopieren.",
    "Ce ticket est long. Copie le texte ci-dessous pour le partager sans couper les sélections.": "Dieser Wettschein ist lang. Kopiere den Text, um alle Tipps zu teilen.",
    "Ticket supprimé.": "Wettschein gelöscht.",
    "La suppression n’a pas été confirmée. Actualise la liste.": "Löschen nicht bestätigt. Aktualisiere die Liste.",
    "Rechercher et filtrer les rencontres": "Spiele suchen und filtern",
    "Équipe, championnat ou pays…": "Team, Liga oder Land…",
    "Choisir un sport": "Sportart auswählen",
    "Chargement du programme…": "Programm wird geladen…",
    "Aucune rencontre pour ces filtres": "Keine Spiele für diese Filter",
    "Aucune rencontre disponible actuellement": "Derzeit keine Spiele verfügbar",
    "Essaie une autre équipe ou élargis les filtres.": "Versuche ein anderes Team oder weniger Filter.",
    "Actualise plus tard pour retrouver les prochains marchés proposés.": "Aktualisiere später für kommende Märkte.",
    "Ton ticket et tes sauvegardes": "Dein Wettschein und gespeicherte Tipps",
    "Une sélection par rencontre": "Ein Tipp pro Spiel",
    "Replier le ticket": "Wettschein einklappen",
    "Ouvrir mon ticket": "Meinen Wettschein öffnen",
    "Non disponible": "Nicht verfügbar",
    "Mon combiné du week-end": "Meine Wochenend-Kombi",
    "Enregistrer le ticket": "Wettschein speichern",
    "Actualiser les tickets enregistrés": "Gespeicherte Wettscheine aktualisieren",
    "Équipe à confirmer": "Team noch offen",
    "Sélection non communiquée": "Tipp nicht angegeben",
    "Prudent": "Vorsichtig",
    "Modéré": "Moderat",
    "Risqué": "Höheres Risiko",
    "Replier": "Einklappen",
    "Voir les marchés": "Märkte ansehen",
    "non fournie": "nicht verfügbar",
    "Retirer": "Entfernen",
    "Ajouter": "Hinzufügen",
    "Des marchés de cette rencontre sont réservés aux abonnés.": "Einige Märkte dieses Spiels sind nur für Abonnenten.",
    "Aucune option avec une cote et un horaire disponibles.": "Keine Optionen mit gültiger Quote und Uhrzeit.",
    "Sélection réservée": "Reservierter Tipp",
    "Réservée": "Reserviert",
    "Ton combiné.{{v0}}{{v1}}": "Deine Kombi.{{v0}}{{v1}}",
    "Tes choix.": "Deine Entscheidungen.",
    "Explore les rencontres, compare les marchés et réunis tes sélections dans un ticket qui se lit en un coup d’œil.": "Entdecke Spiele, vergleiche Märkte und erstelle einen übersichtlichen Wettschein.",
    "Horaires : {{v0}}{{v1}}": "Uhrzeiten: {{v0}}{{v1}}",
    "rencontres au catalogue": "Spiele im Katalog",
    "options sélectionnables": "wählbare Optionen",
    "Reconnecte-toi pour continuer": "Erneut anmelden",
    "Ta session a expiré. Les sélections de la session précédente ont été retirées.": "Sitzung abgelaufen. Tipps aus der vorherigen Sitzung wurden entfernt.",
    "Quelle rencontre cherches-tu ?": "Welches Spiel suchst du?",
    "Date{{v0}}": "Datum{{v0}}",
    "Toutes les dates": "Alle Termine",
    "Demain": "Morgen",
    "Classer par{{v0}}": "Sortieren nach{{v0}}",
    "Horaire": "Uhrzeit",
    "01 · Compose ton ticket": "01 · Wettschein zusammenstellen",
    "Les rencontres à explorer": "Spiele entdecken",
    "{{v0}} sélection{{v1}}{{v2}}": "Tipps: {{v0}}{{v2}}",
    "Voir le ticket": "Wettschein ansehen",
    "Le catalogue n’a pas été vérifié depuis plus de cinq minutes. Actualise avant d’ajouter ou de partager une sélection.": "Der Katalog ist älter als fünf Minuten. Vor Hinzufügen oder Teilen aktualisieren.",
    "Certaines données incomplètes n’ont pas pu être affichées.": "Einige unvollständige Daten konnten nicht angezeigt werden.",
    "Chargement des rencontres": "Spiele werden geladen",
    "Les options disponibles apparaîtront ici.": "Verfügbare Optionen erscheinen hier.",
    "{{v0}} sur {{v1}} rencontres affichées": "{{v0}} von {{v1}} Spielen angezeigt",
    "Afficher les rencontres suivantes": "Weitere Spiele anzeigen",
    "02 · Ton ticket": "02 · Dein Wettschein",
    "Mon combiné": "Meine Kombi",
    "Ton ticket commence ici": "Dein Wettschein beginnt hier",
    "Ajoute une option sur une rencontre. Tu peux remplacer ton choix sans ajouter deux paris sur le même match.": "Füge einen Tipp pro Spiel hinzu. Ein neuer Tipp ersetzt den bisherigen.",
    "Cote cumulée": "Gesamtquote",
    "Produit des cotes des sélections du ticket.": "Produkt der gewählten Quoten.",
    "Confiance moyenne du moteur": "Durchschnittliche Modellkonfidenz",
    "Sports représentés": "Vertretene Sportarten",
    "La confiance moyenne ne représente pas la probabilité que le combiné passe.": "Die durchschnittliche Konfidenz ist nicht die Gewinnchance der gesamten Kombi.",
    "contre": "gegen",
    "{{v0}} · Cote {{v1}}": "{{v0}} · Quote {{v1}}",
    "Marché estimé · cote à confirmer": "Geschätzter Markt · Quote bestätigen",
    "Cote actualisée : {{v0}} → {{v1}}": "Aktualisierte Quote: {{v0}} → {{v1}}",
    "Vider le ticket": "Wettschein leeren",
    "Nom du ticket {{v0}}{{v1}}": "Wettscheinname {{v0}}{{v1}}",
    "(facultatif)": "(optional)",
    "Actualise le catalogue et retire ou remplace les sélections signalées pour enregistrer ou partager le ticket.": "Aktualisiere und ersetze oder entferne markierte Tipps vor Speichern oder Teilen.",
    "Enregistrer avec Pro": "Mit Pro speichern",
    "Vérifier mon accès": "Meinen Zugang prüfen",
    "Copier": "Kopieren",
    "Les options avec un cadenas demandent un abonnement. L’enregistrement des tickets est réservé aux abonnés.": "Gesperrte Märkte und das Speichern von Wettscheinen erfordern ein Abo.",
    "Voir les formules": "Tarife ansehen",
    "Texte du ticket": "Wettscheintext",
    "Mes tickets enregistrés": "Meine gespeicherten Wettscheine",
    "Historique de tes tickets": "Dein Wettscheinverlauf",
    "Ton accès est en cours de vérification.": "Dein Zugang wird geprüft.",
    "Retrouve tes tickets enregistrés avec un abonnement.": "Mit einem Abo auf gespeicherte Wettscheine zugreifen.",
    "Chargement des sauvegardes…": "Gespeicherte Wettscheine werden geladen…",
    "Aucun ticket enregistré pour le moment.": "Noch keine gespeicherten Wettscheine.",
    "Cote {{v0}} · {{v1}} sélection{{v2}}": "Quote {{v0}} · Tipps: {{v1}}",
    "{{v0}} contre {{v1}}": "{{v0}} gegen {{v1}}",
    "Le détail de ce ticket n’est pas disponible.": "Wettscheindetails sind nicht verfügbar.",
    "Ticket archivé : les horaires et cotes ne sont pas actualisés ici.": "Archivierter Wettschein: Uhrzeiten und Quoten werden hier nicht aktualisiert.",
    "{{v0}} option{{v1}} sélectionnable{{v2}} · {{v3}} proposée{{v4}}": "Wählbare Optionen: {{v0}} · Angeboten: {{v3}}",
    "Choix proposé · {{v0}}": "Vorgeschlagener Tipp · {{v0}}",
    "Une autre option de cette rencontre est dans ton ticket.": "Eine andere Option für dieses Spiel ist bereits im Wettschein.",
    "Un seul choix par rencontre : ajouter une autre option remplace la précédente.": "Ein Tipp pro Spiel: Eine neue Option ersetzt die vorherige.",
    "Comprendre ce marché": "Diesen Markt verstehen",
    "Afficher plus de marchés ({{v0}})": "Weitere Märkte anzeigen ({{v0}})",
    "Débloquer les marchés réservés": "Reservierte Märkte freischalten",
    "Repères de marché": "Marktindikatoren",
    "Les repères supplémentaires demandent un accès abonné vérifié. {{v0}}": "Weitere Indikatoren erfordern einen geprüften Abozugang. {{v0}}",
    "Chargement des repères…": "Indikatoren werden geladen…",
    "Estimations de marché disponibles pour cette rencontre. Les données insuffisantes ne sont pas affichées.": "Marktschätzungen für dieses Spiel. Unzureichende Daten werden nicht angezeigt.",
    "Les repères ne sont pas renseignés pour cette rencontre.": "Für dieses Spiel fehlen Indikatoren.",
    "Ouvrir la fiche de la rencontre": "Spieldetails öffnen",
    "Le total doit rester inférieur à {{v0}} sur la période couverte.": "Die Gesamtsumme muss im Marktzeitraum unter {{v0}} bleiben.",
    "Le total doit dépasser {{v0}} sur la période couverte.": "Die Gesamtsumme muss im Marktzeitraum über {{v0}} liegen.",
    "Le moteur retient {{v0}} comme vainqueur sur la période couverte.": "Das Modell wählt {{v0}} als Sieger im Marktzeitraum.",
    "Horaires : {{v0}}": "Uhrzeiten: {{v0}}",
    "{{v0}}. {{v1}} vs {{v2}}\n{{v3}}{{v4}}\n{{v5}}\n{{v6}} : {{v7}}\nCote : {{v8}}{{v9}}": "{{v0}}. {{v1}} vs {{v2}}\n{{v3}}{{v4}}\n{{v5}}\n{{v6}} : {{v7}}\nQuote: {{v8}}{{v9}}",
    "Cote cumulée : {{v0}}": "Gesamtquote: {{v0}}",
    "Confiance moyenne du moteur : {{v0}} % (indicateur, pas un taux de réussite)": "Durchschnittliche Modellkonfidenz: {{v0}} % (Indikator, keine gemessene Trefferquote)",
    " · Chargé à {{v0}}": " · Geladen um {{v0}}",
    "{{v0}} rencontre{{v1}} correspond{{v2}} à tes filtres": "Spiele für deine Filter: {{v0}}",
    "{{v0}} sélection{{v1}} · Cote {{v2}}": "Tipps: {{v0}} · Quote {{v2}}",
    "Retirer {{v0}} contre {{v1}}": "{{v0}} gegen {{v1}} entfernen",
    "Supprimer le ticket {{v0}}": "Wettschein {{v0}} löschen",
    "Filtrer les marchés de {{v0}}": "Märkte für {{v0}} filtern",
    "Sécurité": "Vorsichtig",
    "Le profil prudent, à examiner sélection par sélection.": "Vorsichtiges Profil: jeden Tipp einzeln prüfen.",
    "Équilibre": "Ausgewogen",
    "Un profil intermédiaire pour comparer les cotes et la confiance.": "Ausgewogenes Profil zum Vergleich von Quote und Konfidenz.",
    "Le profil offensif : une cote élevée implique davantage d’incertitude.": "Offensives Profil: Höhere Quoten bedeuten mehr Unsicherheit.",
    "Cote totale non communiquée": "Gesamtquote nicht angegeben",
    "Les données reçues sont incomplètes. Réessaie pour obtenir une sélection valide.": "Unvollständige Daten. Erneut versuchen, um gültige Tipps zu erhalten.",
    "Impossible d’actualiser les combinés pour le moment. Réessaie dans quelques instants.": "Kombis können nicht aktualisiert werden. Versuche es gleich erneut.",
    "Le choix porte sur une victoire. En cas de nul sur la période couverte, le règlement de ce marché prévoit le remboursement.": "Das angegebene Team muss gewinnen. Bei Unentschieden im Marktzeitraum erfolgt Erstattung gemäß Marktregeln.",
    "Rencontre terminée · actualise le combiné": "Spiel beendet · Kombi aktualisieren",
    "Rencontre commencée · actualise le combiné": "Spiel begonnen · Kombi aktualisieren",
    "Équipe non communiquée": "Team nicht angegeben",
    "Pronostic sélectionné": "Gewählter Tipp",
    "Non communiquée": "Nicht angegeben",
    "Aucun score de confiance n’a été communiqué pour cette sélection.": "Für diesen Tipp wurde keine Konfidenz angegeben.",
    "heure locale": "Ortszeit",
    "Combiné copié.": "Kombi kopiert.",
    "La copie automatique est indisponible. Sélectionne le texte ci-dessous.": "Automatisches Kopieren ist nicht verfügbar. Markiere den Text unten.",
    "Dernier chargement": "Zuletzt geladen",
    "Actualisé": "Aktualisiert",
    "Choisis un profil pour explorer ses sélections": "Wähle ein Profil, um seine Tipps anzusehen",
    "Actualiser les combinés": "Kombis aktualisieren",
    "Profil à découvrir": "Profil entdecken",
    "Cote non fournie": "Quote nicht angegeben",
    "Accès Pro": "Pro-Zugang",
    "Sélections": "Tipps",
    "Cote totale": "Gesamtquote",
    "Confiance moyenne": "Durchschnittliche Konfidenz",
    "Probabilité combinée estimée": "Geschätzte Gesamtwahrscheinlichkeit",
    "Chargement des combinés": "Kombis werden geladen",
    "Une rencontre a déjà commencé ou s’est terminée. Actualise pour vérifier les sélections disponibles.": "Ein Spiel hat begonnen oder ist beendet. Verfügbare Tipps aktualisieren.",
    "Cette sélection n’a pas été actualisée depuis plus de cinq minutes. Actualise avant de la copier.": "Diese Auswahl ist älter als fünf Minuten. Vor dem Kopieren aktualisieren.",
    "Le programme du combiné": "Kombi-Spielplan",
    "Les sélections, une par une": "Tipps, Schritt für Schritt",
    "Présentation des rencontres": "Spielansicht",
    "Récapitulatif du combiné": "Kombi-Übersicht",
    "Disponible avec les sélections complètes.": "Mit vollständigen Tipps verfügbar.",
    "Actualise le combiné avant de copier ses sélections.": "Aktualisiere die Kombi vor dem Kopieren.",
    "La copie est disponible avec au moins deux sélections complètes, dont les horaires sont à venir.": "Kopieren erfordert mindestens zwei vollständige Tipps für kommende Spiele.",
    "Fermer le texte à copier": "Kopiertext schließen",
    "À confirmer": "Noch offen",
    "Ce que signifie ce pronostic": "Was dieser Tipp bedeutet",
    "Consulter la rencontre": "Spiel ansehen",
    "Le pronostic est réservé aux abonnés": "Dieser Tipp ist nur für Abonnenten",
    "Débloque la sélection, son marché et sa cote.": "Tipp, Markt und Quote freischalten.",
    "Voir les abonnements": "Abonnements ansehen",
    "Lis le match.{{v0}}{{v1}}": "Verstehe das Spiel.{{v0}}{{v1}}",
    "Choisis ton combiné.": "Wähle deine Kombi.",
    "Trois profils. Chaque rencontre expliquée. Toutes les sélections réunies dans un ticket clair.": "Drei Profile, erklärte Spiele und alle Tipps auf einem übersichtlichen Wettschein.",
    "{{v0}} à {{v1}}": "{{v0}} um {{v1}}",
    "Profil sélectionné": "Gewähltes Profil",
    "01 · Choisis ton profil": "01 · Profil wählen",
    "Quel combiné veux-tu explorer ?": "Welche Kombi möchtest du ansehen?",
    "Comparer les trois profils": "Alle drei Profile vergleichen",
    "Explorer ce profil": "Dieses Profil ansehen",
    "Les indicateurs proviennent du moteur. La confiance moyenne et la probabilité combinée décrivent deux choses différentes.": "Dies sind Modellindikatoren. Durchschnittliche Konfidenz und Gesamtwahrscheinlichkeit beschreiben Verschiedenes.",
    "La dernière sélection chargée reste affichée.": "Die zuletzt geladene Auswahl bleibt sichtbar.",
    "Préparation des sélections": "Tipps werden vorbereitet",
    "Vérification de ton accès et chargement des rencontres…": "Zugang wird geprüft, Spiele werden geladen…",
    "Ta session doit être renouvelée": "Bitte Sitzung erneuern",
    "Reconnecte-toi pour retrouver l’accès correspondant à ton compte.": "Melde dich erneut an, um deinen Kontozugang wiederherzustellen.",
    "Les sélections complètes": "Vollständige Tipps",
    "Explore les trois profils avec Pro.": "Alle drei Profile mit Pro entdecken.",
    "Ton accès actuel ne permet pas de consulter ces combinés. Retrouve les rencontres, les marchés et les cotes en découvrant les abonnements disponibles.": "Dein Zugang umfasst diese Kombis nicht. Abos zeigen dir den Zugang zu Spielen, Märkten und Quoten.",
    "Découvrir les abonnements": "Abos entdecken",
    "Les combinés n’ont pas pu être chargés": "Kombis konnten nicht geladen werden",
    "Utilise le bouton Réessayer ci-dessus pour relancer la vérification.": "Klicke oben auf Erneut versuchen.",
    "Un combiné gratuit à découvrir": "Eine kostenlose Kombi entdecken",
    "Le profil {{v0}} est accessible avec ton compte.": "Profil {{v0}} ist mit deinem Konto verfügbar.",
    "Voir le combiné": "Kombi ansehen",
    "Aucune sélection pour ce profil": "Keine Tipps für dieses Profil",
    "Le moteur n’a pas fourni de combiné {{v0}} pour le moment. Consulte un autre profil ou actualise plus tard.": "Noch keine Kombi {{v0}} verfügbar. Wähle ein anderes Profil oder aktualisiere später.",
    "02 · Parcours les rencontres": "02 · Spiele durchsehen",
    "{{v0}} sélection{{v1}} · Profil {{v2}}": "Tipps: {{v0}} · Profil {{v2}}",
    "Première rencontre : {{v0}}": "Erstes Spiel: {{v0}}",
    "Fiches": "Karten",
    "Horaires": "Zeitplan",
    "Cote totale du moteur{{v0}}": "Gesamtquote des Modells{{v0}}",
    "03 · Ton ticket": "03 · Dein Wettschein",
    "Combiné {{v0}}": "Kombi {{v0}}",
    "{{v0}} sélection{{v1}} réunies": "Enthaltene Tipps: {{v0}}",
    "Cote totale du moteur": "Gesamtquote des Modells",
    "Copier le ticket": "Wettschein kopieren",
    "Débloquer le combiné": "Kombi freischalten",
    "Appuie dans le texte pour le sélectionner.": "Tippe auf den Text, um ihn zu markieren.",
    "Bien lire le combiné": "Die Kombi verstehen",
    "La confiance moyenne décrit les sélections individuellement. Elle ne correspond pas à la probabilité que tout le combiné passe.": "Durchschnittliche Konfidenz beschreibt einzelne Tipps, nicht die Gewinnchance der ganzen Kombi.",
    "La probabilité combinée est une estimation du moteur, liée à ses hypothèses sur les matchs. Elle ne constitue pas un taux de réussite mesuré.": "Die Gesamtwahrscheinlichkeit beruht auf Modellannahmen und ist keine gemessene Trefferquote.",
    "Un combiné dépend de chacune de ses sélections. Le profil « Sécurité » reste soumis à cette incertitude.": "Jeder Tipp zählt. Auch das vorsichtige Profil bleibt unsicher.",
    "Vérification des sélections et de ton accès…": "Tipps und Zugang werden geprüft…",
    "WNPulse · Combiné {{v0}}": "WNPulse · Kombi {{v0}}",
    "{{v0}}. {{v1}} vs {{v2}}": "{{v0}}. {{v1}} gegen {{v2}}",
    "Cote : {{v0}}": "Quote: {{v0}}",
    "Cote totale du moteur : {{v0}}": "Gesamtquote des Modells: {{v0}}",
    "{{v0}} sélection{{v1}} dans ce ticket": "Tipps auf diesem Wettschein: {{v0}}",
    "{{v0}} sélection{{v1}}": "Tipps: {{v0}}",
    "{{v0}} / mois": "{{v0}} / Monat",
    "{{v0}} remboursés": "{{v0}} erstattet",
    "🎯 *Pick WinPulse*\n{{v0}} · {{v1}}\n\n*{{v2}}* vs *{{v3}}*\n👉 {{v4}} @ *{{v5}}*\nConfiance IA : {{v6}}%\nMarché : {{v7}}\n\nhttps://wnpulse.com": "🎯 *Pick WinPulse*\n{{v0}} · {{v1}}\n\n*{{v2}}* vs *{{v3}}*\n👉 {{v4}} @ *{{v5}}*\nModellkonfidenz: {{v6}} %\nMarkt: {{v7}}\n\nhttps://wnpulse.com",
    "Le texte libre fourni par le serveur reste affiché dans sa langue d’origine.": "Freier Servertext wird in seiner Originalsprache angezeigt.",
    "/mois": "/Monat",
    "Le service de scores n’est pas configuré. Contactez l’équipe WinPulse.": "Spielstände sind nicht eingerichtet. Kontaktiere WinPulse.",
    "Le fournisseur refuse l’accès aux scores. L’équipe WinPulse doit vérifier sa configuration.": "Der Anbieter verweigert den Zugriff. WinPulse muss die Konfiguration prüfen.",
    "Le quota du fournisseur de scores est épuisé. L’équipe WinPulse doit rétablir le service.": "Das Anbieterkontingent ist aufgebraucht. WinPulse muss den Zugang wiederherstellen.",
    "Le fournisseur limite les demandes. Une nouvelle tentative sera effectuée automatiquement.": "Der Anbieter begrenzt Anfragen. Ein neuer Versuch erfolgt automatisch.",
    "Le fournisseur de scores met trop de temps à répondre. Nouvelle tentative automatique à venir.": "Der Anbieter antwortet zu langsam. Ein neuer Versuch folgt automatisch.",
    "Le service de scores est temporairement indisponible. Nouvelle tentative automatique à venir.": "Spielstände sind vorübergehend nicht verfügbar. Neuer Versuch folgt automatisch.",
    "Les scores de ces compétitions ne sont pas disponibles auprès du fournisseur.": "Der Anbieter deckt diese Wettbewerbe nicht ab.",
    "Votre session a expiré ou l’accès est refusé. Reconnectez-vous pour réessayer.": "Deine Sitzung ist abgelaufen oder der Zugriff wurde verweigert. Melde dich erneut an.",
    "Le service de scores n’est pas disponible sur cette version du serveur.": "Diese Serverversion stellt keine Spielstände bereit.",
    "Le serveur met trop de temps à répondre. Nouvelle tentative automatique à venir.": "Der Server antwortet zu langsam. Neuer Versuch folgt automatisch.",
    "Les scores ne peuvent pas être actualisés pour le moment. Nouvelle tentative automatique à venir.": "Spielstände können gerade nicht aktualisiert werden. Neuer Versuch folgt automatisch.",
    "La préparation des scores prend plus de temps que prévu. Une nouvelle tentative sera effectuée automatiquement.": "Die Vorbereitung dauert länger als erwartet. Neuer Versuch folgt automatisch.",
    "Réponse des scores invalide": "Ungültige Spielstandantwort",
    "Certaines compétitions ne sont pas disponibles. Les scores reçus restent affichés.": "Einige Wettbewerbe fehlen. Bereits empfangene Spielstände bleiben sichtbar.",
    "Les derniers scores sont trop anciens. Actualisez pour les recharger.": "Diese Spielstände sind veraltet. Bitte aktualisieren.",
    "Derniers scores connus": "Letzte bekannte Spielstände",
    "Aucun match en direct actuellement.": "Derzeit keine Live-Spiele.",
    "Aucun match terminé récemment.": "Keine kürzlich beendeten Spiele.",
    "Aucun match à venir dans les prochaines heures.": "Keine Spiele in den nächsten Stunden.",
    "Équipe domicile": "Heimteam",
    "Équipe extérieure": "Auswärtsteam",
    "Compétition": "Wettbewerb",
    "Dernier score": "Letzter Spielstand",
    "À venir": "Demnächst",
    "flex items-center justify-between": "flex items-center justify-between",
    "Rugby": "Rugby",
    "Autres sports": "Andere Sportarten",
    "Tous les pays": "Alle Länder",
    "Bénin": "Benin",
    "Côte d’Ivoire": "Elfenbeinküste",
    "Sénégal": "Senegal",
    "Cameroun": "Kamerun",
    "Mali": "Mali",
    "France": "Frankreich",
    "Belgique": "Belgien",
    "Luxembourg": "Luxemburg",
    "Suisse": "Schweiz",
    "Canada": "Kanada",
    "Maroc": "Marokko",
    "Nigeria": "Nigeria",
    "Afrique du Sud": "Südafrika",
    "Réponse vidéo invalide": "Ungültige Videoantwort",
    "Horaire à confirmer": "Uhrzeit noch offen",
    "Le programme vidéo ne peut pas être actualisé pour le moment. Les scores restent accessibles.": "Das Videoprogramm kann nicht aktualisiert werden. Spielstände bleiben verfügbar.",
    "L’actualisation des diffusions est temporairement limitée. Une nouvelle tentative est prévue.": "Stream-Aktualisierungen sind begrenzt. Ein neuer Versuch ist geplant.",
    "Le programme vidéo est temporairement indisponible. Les scores restent accessibles.": "Das Videoprogramm ist vorübergehend nicht verfügbar. Spielstände bleiben verfügbar.",
    "La recherche de nouveaux directs reprendra automatiquement. Les diffusions déjà connues continuent d’être vérifiées.": "Die Suche läuft automatisch weiter. Bekannte Streams werden weiter geprüft.",
    "Les diffusions ne peuvent pas être actualisées pour le moment. Les scores restent accessibles.": "Streams können gerade nicht aktualisiert werden. Spielstände bleiben verfügbar.",
    "Lecteur indisponible": "Player nicht verfügbar",
    "Le lecteur met trop de temps à répondre": "Der Player antwortet zu langsam",
    "Chargement du lecteur impossible": "Player konnte nicht geladen werden",
    "Le lecteur ne répond pas. Tu peux consulter la diffusion sur YouTube.": "Der Player reagiert nicht. Öffne den Stream auf YouTube.",
    "Cette vidéo n’est pas disponible dans ce lecteur, selon les conditions du diffuseur ou ton pays.": "Dieses Video ist wegen Anbieterregeln oder deines Landes hier nicht abspielbar.",
    "Le lecteur n’a pas pu démarrer. Tu peux essayer directement sur YouTube.": "Wiedergabe fehlgeschlagen. Versuche es direkt auf YouTube.",
    "Cette diffusion est terminée.": "Dieser Stream ist beendet.",
    "Appuie sur le bouton Lecture du lecteur pour démarrer la vidéo.": "Drücke im Player auf Wiedergabe.",
    "Le lecteur ne peut pas être chargé. Tu peux consulter la diffusion sur YouTube.": "Der Player konnte nicht laden. Öffne den Stream auf YouTube.",
    "Dernier score connu": "Letzter bekannter Spielstand",
    "Rencontre terminée": "Spiel beendet",
    "Score suivi": "Verfolgter Spielstand",
    "Rencontre à venir": "Bevorstehendes Spiel",
    "La rubrique vidéo est en préparation. Les scores restent accessibles.": "Der Videobereich wird vorbereitet. Spielstände bleiben verfügbar.",
    "La collecte suit son calendrier. Le programme s’actualisera automatiquement.": "Die Sammlung folgt dem Zeitplan. Das Programm aktualisiert sich automatisch.",
    "Ajoute YOUTUBE_API_KEY dans les variables du backend et active YouTube Data API v3 dans le projet Google.": "Setze YOUTUBE_API_KEY im Backend und aktiviere YouTube Data API v3 bei Google.",
    "Impossible de demander l’actualisation des diffusions.": "Stream-Aktualisierung konnte nicht angefordert werden.",
    "La recherche automatique nécessite YOUTUBE_API_KEY dans le backend. Les chaînes FIFA et FIBA sont sélectionnées par défaut.": "Die automatische Suche benötigt YOUTUBE_API_KEY im Backend. FIFA und FIBA sind standardmäßig gewählt.",
    "Fermer le lecteur": "Player schließen",
    "Le score sélectionné s’affichera ici.": "Der gewählte Spielstand erscheint hier.",
    "Les scores disponibles apparaîtront dans cette liste dès leur chargement.": "Verfügbare Spielstände erscheinen nach dem Laden in dieser Liste.",
    "Équipe, rencontre ou diffuseur…": "Team, Spiel oder Anbieter…",
    "Filtrer les diffusions par sport": "Streams nach Sport filtern",
    "Tous les sports": "Alle Sportarten",
    "Diffusion en cours selon le diffuseur": "Laut Anbieter live",
    "Regarder le direct": "Live ansehen",
    "Ouvrir le programme": "Programm öffnen",
    "Les diffusions vidéo sont en préparation": "Video-Streams werden vorbereitet",
    "Aucune diffusion ne correspond à ces filtres": "Keine Streams für diese Filter",
    "Aucune diffusion intégrable disponible actuellement": "Derzeit keine einbettbaren Streams verfügbar",
    "Le programme est en cours de préparation. Il s’actualisera automatiquement.": "Das Programm wird vorbereitet und automatisch aktualisiert.",
    "Retrouve les scores ci-dessous et reviens consulter les prochaines diffusions proposées.": "Sieh dir die Spielstände unten an und später die nächsten Streams.",
    "Live & Scores": "Live & Spielstände",
    "Suivi en temps réel des matchs en cours et des résultats récents. Actualisation automatique toutes les 45 secondes.": "Live-Spiele und aktuelle Ergebnisse verfolgen. Automatische Aktualisierung alle 45 Sekunden.",
    "Scores du {{v0}}": "Spielstände vom {{v0}}",
    "Le fournisseur prépare les scores. La page se mettra à jour automatiquement.": "Der Anbieter bereitet Spielstände vor. Die Seite aktualisiert sich automatisch.",
    "Les scores sont temporairement indisponibles.": "Spielstände sind vorübergehend nicht verfügbar.",
    "Terminés{{v0}}": "Beendet{{v0}}",
    "À venir{{v0}}": "Demnächst{{v0}}",
    "Actualisé à {{v0}}": "Aktualisiert um {{v0}}",
    "Ouverture du lecteur…": "Player wird geöffnet…",
    "Lecture via YouTube · {{v0}}": "Wiedergabe über YouTube · {{v0}}",
    "Consulter sur YouTube": "Auf YouTube öffnen",
    "Les scores se mettent à jour indépendamment de la vidéo.": "Spielstände aktualisieren sich unabhängig vom Video.",
    "À regarder sur WinPulse": "Auf WinPulse ansehen",
    "Le match, sur ton écran.": "Das Spiel auf deinem Bildschirm.",
    "Retrouve les directs intégrables des diffuseurs sélectionnés et suis les scores sur la même page.": "Sieh dir einbettbare Streams ausgewählter Anbieter und die Spielstände hier an.",
    "Actualiser les diffusions": "Streams aktualisieren",
    "Configuration vidéo · Administrateur": "Video-Einstellungen · Administrator",
    "La tâche vidéo n’est pas active. Vérifie les logs d’initialisation du backend.": "Die Videoaufgabe ist inaktiv. Prüfe die Backend-Startprotokolle.",
    "État fournisseur : {{v0}}": "Anbieterstatus: {{v0}}",
    "Vérifier la collecte": "Sammlung prüfen",
    "Un score à suivre": "Einen Spielstand verfolgen",
    "Choisis la rencontre dont tu veux suivre le score pendant la vidéo.": "Wähle den Spielstand, den du während des Videos verfolgen möchtest.",
    "Rencontre à suivre": "Spiel zum Verfolgen",
    "Choisir une rencontre": "Spiel auswählen",
    "Chaîne du diffuseur": "Anbieterkanal",
    "Rechercher une diffusion{{v0}}": "Streams suchen{{v0}}",
    "Pays de visionnage{{v0}}": "Land der Wiedergabe{{v0}}",
    "Chargement du programme vidéo…": "Videoprogramm wird geladen…",
    "Voir sur YouTube": "Auf YouTube ansehen",
    "Afficher toutes les diffusions": "Alle Streams anzeigen",
    "Les vidéos sont lues via YouTube. Leur disponibilité dépend du pays et des conditions du diffuseur. Les directs disponibles ne couvrent pas nécessairement toutes les rencontres du tableau des scores.": "Videos laufen über YouTube. Verfügbarkeit hängt vom Land und Anbieter ab. Nicht jedes Spiel der Ergebnistabelle wird übertragen.",
    "{{v0}} recherches aujourd’hui · Sources : {{v1}} · Dernière vérification : {{v2}}.": "{{v0}} Suchen heute · Quellen: {{v1}} · Zuletzt geprüft: {{v2}}.",
    "Résultat en attente": "Ergebnis ausstehend",
    "La sélection décrit l’événement attendu dans le marché indiqué. Consulte les règles de règlement du bookmaker.": "Der Tipp beschreibt den erwarteten Marktausgang. Prüfe die Anbieterregeln.",
    "Réponse Montante invalide": "Ungültige Serienantwort",
    "Ta session a expiré. Reconnecte-toi pour retrouver la montante.": "Sitzung abgelaufen. Melde dich erneut für die Serie an.",
    "Cette action est réservée à l’administrateur ou à ton niveau d’accès.": "Diese Aktion erfordert Administratorrechte oder die passende Zugangsstufe.",
    "Le chargement a pris trop de temps. Réessaie dans un instant.": "Laden hat zu lange gedauert. Versuche es gleich erneut.",
    "Le service Montante est temporairement indisponible. Réessaie dans un instant.": "Die Serie ist vorübergehend nicht verfügbar. Versuche es gleich erneut.",
    "Contrôle terminé. Les résultats finaux disponibles ont été pris en compte.": "Prüfung abgeschlossen. Verfügbare Endergebnisse wurden übernommen.",
    "La série est lancée. La sélection attendra deux matchs admissibles.": "Serie gestartet. Es wird auf zwei geeignete Spiele gewartet.",
    "Série terminée": "Serie abgeschlossen",
    "Série arrêtée": "Serie gestoppt",
    "Sélections publiées": "Tipps veröffentlicht",
    "Recherche de deux matchs": "Zwei Spiele werden gesucht",
    "Nouvelle série à venir": "Neue Serie folgt",
    "Étape": "Etappe",
    "Étapes gagnées": "Gewonnene Etappen",
    "Matchs publiés": "Veröffentlichte Spiele",
    " Les dernières données chargées restent affichées.": " Die zuletzt geladenen Daten bleiben sichtbar.",
    "Toutes les cotes comparées": "Alle Quoten verglichen",
    "Le classement n’ajoute aucun bonus aux petites cotes.": "Niedrige Quoten erhalten keinen Rankingbonus.",
    "Sources vérifiées": "Geprüfte Quellen",
    "Les nouvelles sélections exigent des cotes récentes et plusieurs sources complètes.": "Neue Tipps erfordern aktuelle Quoten und mehrere vollständige Quellen.",
    "Le droit d’attendre": "Warten ist erlaubt",
    "Si deux matchs ne passent pas les contrôles, aucune étape n’est publiée.": "Ohne zwei geprüfte Spiele wird keine Etappe veröffentlicht.",
    "Contrôle…": "Wird geprüft…",
    "Synchroniser les résultats": "Ergebnisse synchronisieren",
    "La prochaine série apparaîtra ici dès son lancement par l’administrateur.": "Die nächste Serie erscheint nach dem Start durch den Administrator.",
    "Nouvelle montante à venir": "Neue Serie folgt",
    "Deux matchs suffisamment documentés ne sont pas encore disponibles.": "Noch keine zwei ausreichend dokumentierten Spiele verfügbar.",
    "Le sélecteur attend deux matchs": "Warten auf zwei Spiele",
    "Estimation du marché vérifié": "Schätzung des geprüften Marktes",
    "MONTANTE WNPULSE": "WNPULSE-SERIE",
    "2 matchs distincts par étape": "2 unterschiedliche Spiele pro Etappe",
    "Deux rencontres.{{v0}}{{v1}}": "Zwei Spiele.{{v0}}{{v1}}",
    "Des choix expliqués.": "Erklärte Entscheidungen.",
    "Les sélections sont comparées selon les estimations et la qualité des données. Une petite cote ne suffit pas à faire un bon choix.": "Tipps werden nach Schätzungen und Datenqualität verglichen. Eine niedrige Quote reicht nicht aus.",
    "Pilotage administrateur": "Administratorsteuerung",
    "Parcours {{v0}}": "Verlauf {{v0}}",
    "10 étapes": "10 Etappen",
    "15 étapes": "15 Etappen",
    "Lancer une nouvelle série": "Neue Serie starten",
    "La série actuelle sera archivée sur le serveur et remplacée.": "Die aktuelle Serie wird auf dem Server archiviert und ersetzt.",
    "{{v0}}Remplacer la série actuelle": "{{v0}}Aktuelle Serie ersetzen",
    "Nouvelle série": "Neue Serie",
    "Diagnostic de sélection": "Auswahldiagnose",
    "{{v0}} matchs reçus · {{v1}} événements admissibles": "{{v0}} Spiele empfangen · {{v1}} geeignete Ereignisse",
    "Parcours de la série": "Serienverlauf",
    "{{v0}} étape{{v1}} gagnée{{v2}} sur {{v3}}": "Gewonnene Etappen: {{v0}} von {{v3}}",
    "Une étape annulée n’est pas une victoire. Les jours sans sélection ne font pas avancer le parcours.": "Eine annullierte Etappe ist kein Sieg. Tage ohne Tipps bringen die Serie nicht voran.",
    "Sélections · Étape {{v0}}": "Tipps · Etappe {{v0}}",
    "Cote combinée : {{v0}}": "Gesamtquote: {{v0}}",
    "Sélection publiée avant cette mise à jour : elle reste suivie jusqu’à son règlement. Les nouvelles étapes exigent deux matchs.": "Dieser ältere Tipp wird bis zur Abrechnung verfolgt. Neue Etappen benötigen zwei Spiele.",
    "Les mêmes sélections que les abonnés": "Dieselben Tipps wie für Abonnenten",
    "Débloque les rencontres, les marchés et les raisons de chaque choix.": "Spiele, Märkte und Begründungen freischalten.",
    "Lire l’estimation de la paire": "Paarschätzung verstehen",
    "Approximation théorique : {{v0}}, sous hypothèse d’indépendance.": "Theoretische Näherung: {{v0}}, unter Unabhängigkeitsannahme.",
    "Ce chiffre multiplie deux estimations du moteur. Il ne constitue pas un taux de réussite constaté. Des événements distincts peuvent encore être corrélés.": "Multipliziert zwei Modellschätzungen, keine gemessene Trefferquote. Verschiedene Ereignisse können korreliert sein.",
    "Historique de la série": "Serienhistorie",
    "Les victoires, pertes et annulations restent visibles.": "Siege, Niederlagen und Annullierungen bleiben sichtbar.",
    "Aucune étape réglée pour le moment.": "Noch keine abgerechneten Etappen.",
    "Étape {{v0}}": "Etappe {{v0}}",
    "{{v0}}{{v1}}{{v2}} · cote {{v3}}": "{{v0}}{{v1}}{{v2}} · Quote {{v3}}",
    "{{v0}} sélections · détails réservés aux abonnés.": "{{v0}} Tipps · Details nur für Abonnenten.",
    "Ce que la sélection permet de comprendre": "Die Auswahl verstehen",
    "Les petites cotes ne reçoivent aucun bonus. Le sélecteur compare la probabilité estimée, l’accord entre les sources et leur nombre. Ce score de classement n’est pas une probabilité.": "Niedrige Quoten erhalten keinen Bonus. Verglichen werden Schätzung, Quellenübereinstimmung und -anzahl. Der Rangwert ist keine Wahrscheinlichkeit.",
    "Les deux matchs doivent être distincts, avec des équipes différentes, des marchés complets et des cotes récentes. Cette vérification ne supprime pas l’incertitude sportive.": "Beide Spiele benötigen unterschiedliche Teams, vollständige Märkte und aktuelle Quoten. Sportliche Unsicherheit bleibt bestehen.",
    "Les probabilités viennent du moteur existant, souvent du consensus des cotes. L’efficacité de ce nouveau filtrage devra être mesurée sur des résultats futurs, pas uniquement sur les gagnants déjà connus.": "Wahrscheinlichkeiten stammen aus dem bestehenden Modell, oft dem Quotenkonsens. Der neue Filter muss an künftigen Ergebnissen gemessen werden.",
    "Une seule sélection perdante arrête la série. Aucun pari ni aucune montante ne garantit un résultat.": "Ein verlorener Tipp beendet die Serie. Keine Wette oder Serie garantiert ein Ergebnis.",
    "RENCONTRE {{v0}}": "SPIEL {{v0}}",
    "Sélection réservée aux abonnés": "Tipp nur für Abonnenten",
    "Sources complètes": "Vollständige Quellen",
    "Estimation issue du consensus des cotes, distincte d’une mesure de réussite réelle.": "Schätzung aus dem Quotenkonsens, keine gemessene reale Trefferquote.",
    "Rencontre commencée : la sélection reste figée en attendant son résultat.": "Spiel begonnen: Der Tipp bleibt bis zum Ergebnis unverändert.",
    "Pourquoi cette sélection ?": "Warum dieser Tipp?",
    "Les critères détaillés n’ont pas été enregistrés pour cette ancienne sélection.": "Für diesen älteren Tipp wurden keine Detailkriterien gespeichert.",
    "Cotes vérifiées : {{v0}}. Elles peuvent évoluer.": "Quoten geprüft: {{v0}}. Änderungen möglich.",
    "Voir l’analyse du match": "Spielanalyse ansehen",
    "« {{v0}} » porte sur le total de buts ou de points. Le seuil et la période du marché déterminent le résultat.": "„{{v0}}“ betrifft die Gesamttore oder -punkte. Linie und Zeitraum bestimmen die Abrechnung.",
    "Non renseignée": "Nicht angegeben",
    "Administrateur": "Administrator",
    "Statistiques absentes": "Statistiken fehlen",
    "Statistiques invalides": "Ungültige Statistiken",
    "Mon profil": "Mein Profil",
    "Abonnement invalide": "Ungültiges Abonnement",
    "Impossible de vérifier votre abonnement. Les informations affichées viennent de votre dernière connexion.": "Abo konnte nicht geprüft werden. Angezeigt werden Daten deiner letzten Anmeldung.",
    "Impossible de charger les résultats WinPulse. Réessayez dans un instant.": "WinPulse-Ergebnisse konnten nicht geladen werden. Versuche es gleich erneut.",
    "Votre profil a été actualisé.": "Dein Profil wurde aktualisiert.",
    "Impossible d’actualiser votre profil.": "Dein Profil konnte nicht aktualisiert werden.",
    "Votre consentement aux messages WhatsApp a été retiré.": "Deine Einwilligung für WhatsApp-Nachrichten wurde widerrufen.",
    "Impossible de modifier votre choix WhatsApp.": "WhatsApp-Einstellung konnte nicht geändert werden.",
    "Email non renseigné": "E-Mail nicht angegeben",
    "Date d’expiration non renseignée.": "Ablaufdatum nicht angegeben.",
    "Passer Pro": "Pro abonnieren",
    "Voir l’offre Pro": "Pro-Angebot ansehen",
    "Gérer mon abonnement": "Mein Abo verwalten",
    "Pronostics gratuits selon les disponibilités": "Kostenlose Tipps nach Verfügbarkeit",
    "Track Record public complet": "Vollständige öffentliche Ergebnisbilanz",
    "Compte personnel WinPulse": "Persönliches WinPulse-Konto",
    "Tous les pronostics et combinés": "Alle Tipps und Kombis",
    "Analyses IA complètes": "Ausführliche Analysen",
    "Combo Builder et value bets": "Kombi-Builder und Value Bets",
    "Résultats confirmés": "Bestätigte Ergebnisse",
    "Remboursés": "Erstattet",
    "Non renseigné": "Nicht angegeben",
    "Membre depuis": "Mitglied seit",
    "Vous avez autorisé WinPulse à vous contacter sur votre numéro WhatsApp. Vous pouvez retirer ce consentement à tout moment.": "Du hast WhatsApp-Nachrichten von WinPulse erlaubt. Du kannst jederzeit widerrufen.",
    "Vous n’avez pas de consentement actif pour les messages WhatsApp de WinPulse.": "Keine aktive Einwilligung für WhatsApp-Nachrichten von WinPulse.",
    "Autorisé": "Erlaubt",
    "Non autorisé": "Nicht erlaubt",
    "Mon espace WinPulse": "Mein WinPulse-Bereich",
    "Résultats": "Ergebnisse",
    "Résultats WinPulse": "WinPulse-Ergebnisse",
    "Mon compte": "Mein Konto",
    "Votre accès actuel": "Dein aktueller Zugang",
    "Vérification de votre abonnement…": "Abo wird geprüft…",
    "Les fonctionnalités Pro sont accessibles avec vos droits administrateur.": "Pro-Funktionen sind mit deinen Administratorrechten verfügbar.",
    "{{v0}} jour{{v1}} restant{{v2}}": "Verbleibende Tage: {{v0}}",
    "Votre ancien accès payant est arrivé à expiration.": "Dein vorheriger kostenpflichtiger Zugang ist abgelaufen.",
    "Votre ancien accès Elite reste reconnu. L’offre actuellement proposée est WinPulse Pro.": "Dein bestehender Elite-Zugang bleibt anerkannt. Das aktuelle Angebot ist WinPulse Pro.",
    "Découvrez les pronostics gratuits disponibles et les résultats publics.": "Entdecke verfügbare kostenlose Tipps und öffentliche Ergebnisse.",
    "Consultez l’offre complète et les modalités de paiement sur la page Abonnement.": "Alle Angebote und Zahlungsdetails findest du auf der Aboseite.",
    "Les résultats publics de WinPulse": "Öffentliche WinPulse-Ergebnisse",
    "Ces chiffres concernent les pronostics de la plateforme, pas les paris de votre compte. Ils sont visibles en Gratuit comme en Pro pour vous permettre de consulter notre historique.": "Diese Zahlen betreffen Plattformtipps, nicht deine persönlichen Wetten. Kostenlos- und Pro-Nutzer können die Bilanz prüfen.",
    "Bilan des résultats confirmés": "Bilanz bestätigter Ergebnisse",
    "Cumul du Track Record, tous sports et tous niveaux.": "Gesamtbilanz aller Sportarten und Risikostufen.",
    "Aucun résultat confirmé pour le moment": "Noch keine bestätigten Ergebnisse",
    "Le bilan se mettra à jour lorsque les pronostics seront résolus.": "Die Bilanz aktualisiert sich nach Abrechnung der Tipps.",
    "Taux de réussite WinPulse": "WinPulse-Trefferquote",
    "Gagnés ÷ (gagnés + perdus). Les remboursements et les pronostics en attente ne sont pas inclus.": "Gewonnen ÷ (gewonnen + verloren). Erstattungen und offene Tipps sind ausgeschlossen.",
    "Et mes statistiques personnelles ?": "Und meine persönlichen Statistiken?",
    "Elles nécessitent un historique des paris que vous avez réellement suivis. Aucun suivi personnel n’est relié à cette page actuellement : elle n’affiche donc pas de taux de réussite, de ROI ou de gains attribués à votre compte.": "Persönliche Statistiken brauchen deine tatsächlichen Wetten. Hier gibt es kein persönliches Tracking, daher keine persönliche Trefferquote, ROI oder Gewinne.",
    "Consulter le Track Record complet": "Vollständige Ergebnisbilanz ansehen",
    "Mes informations": "Meine Angaben",
    "Ces informations correspondent aux données enregistrées sur votre compte.": "Diese Angaben entsprechen den in deinem Konto gespeicherten Daten.",
    "Messages WhatsApp": "WhatsApp-Nachrichten",
    "{{v0}}Retirer mon consentement": "{{v0}}Einwilligung widerrufen",
    "Voir les pronostics": "Tipps ansehen",
    "Voir les résultats publics": "Öffentliche Ergebnisse ansehen",
    "Actuel": "Aktuell",
    "{{v0}} gagnés, {{v1}} perdus, {{v2}} remboursés": "{{v0}} gewonnen, {{v1}} verloren, {{v2}} erstattet",
    "Non communiqué": "Nicht angegeben",
    "Sélections et cotes à vérifier avant le début des rencontres.": "Prüfe Tipps und Quoten vor den Spielen.",
    "Le serveur met trop de temps à répondre. Tu peux réessayer.": "Der Server antwortet zu langsam. Versuche es erneut.",
    "Deux issues sont couvertes : celles indiquées par la sélection. Vérifie la période à laquelle le marché s’applique.": "Deckt die beiden angegebenen Ausgänge im Marktzeitraum ab.",
    "Le pari concerne le fait que les deux équipes marquent, ou non, pendant la période couverte par le marché.": "Betrifft, ob beide Teams im angegebenen Zeitraum treffen.",
    "Le résultat est évalué après application du handicap indiqué. La ligne et la période du marché déterminent le règlement.": "Abrechnung nach Handicap, Linie und Marktzeitraum. Prüfe die Anbieterregeln.",
    "Le pari porte sur le total indiqué. Les règles de règlement dépendent de la ligne et de la période choisies.": "Betrifft die angegebene Gesamtsumme. Prüfe Linie, Zeitraum und Abrechnungsregeln.",
    "La sélection prévoit un match nul sur la période couverte par le marché.": "Der Tipp erwartet ein Unentschieden im abgedeckten Zeitraum.",
    "Le pronostic se lit avec son marché : consulte la fiche du match pour vérifier la période et les informations disponibles.": "Lies den Tipp mit Markt und Zeitraum. Die Spielseite zeigt verfügbare Informationen.",
    "Indisponible": "Nicht verfügbar",
    "Pronostic réservé": "Reservierter Tipp",
    "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.": "Die Gesamtsumme muss im Marktzeitraum unter {{v0}} bleiben.",
    "Le total doit dépasser {{v0}} sur la période couverte par ce marché.": "Die Gesamtsumme muss im Marktzeitraum über {{v0}} liegen.",
    "Le moteur retient {{v0}} comme vainqueur sur la période couverte par le marché.": "Das Modell wählt {{v0}} als Sieger im Marktzeitraum.",
    "Cette sélection couvre deux issues du match : celles indiquées dans le pronostic. Elle ne désigne pas nécessairement un vainqueur unique.": "Deckt die beiden angegebenen Ausgänge im Marktzeitraum ab.",
    "L’équipe indiquée doit gagner. Si la rencontre se termine sur un nul, la mise est remboursée selon les règles du marché.": "Das angegebene Team muss gewinnen. Bei Unentschieden im Marktzeitraum erfolgt Erstattung gemäß Marktregeln.",
    "Le pronostic porte sur le fait que les deux équipes marquent ou non pendant la période indiquée par le marché.": "Betrifft, ob beide Teams im angegebenen Zeitraum treffen.",
    "Le résultat est évalué après application du handicap indiqué dans la sélection. La période et les règles de règlement du bookmaker sont à vérifier.": "Abrechnung nach Handicap, Linie und Marktzeitraum. Prüfe die Anbieterregeln.",
    "La sélection prévoit un match nul pendant la période indiquée par le marché.": "Der Tipp erwartet ein Unentschieden im abgedeckten Zeitraum.",
    "La double chance couvre deux issues de la rencontre. Les deux issues couvertes sont celles indiquées dans la sélection.": "Deckt die beiden angegebenen Ausgänge im Marktzeitraum ab.",
    "La sélection vise la victoire de l’équipe indiquée. Si la rencontre se termine sur un match nul, la mise est remboursée selon les règles du marché.": "Das angegebene Team muss gewinnen. Bei Unentschieden im Marktzeitraum erfolgt Erstattung gemäß Marktregeln.",
    "Ce marché porte sur le fait que les deux équipes marquent ou non pendant la période indiquée. Il ne désigne pas le vainqueur du match.": "Betrifft, ob beide Teams im angegebenen Zeitraum treffen.",
    "Le résultat est évalué après application du handicap indiqué dans la sélection. Vérifie aussi la période concernée et les règles de règlement du bookmaker.": "Abrechnung nach Handicap, Linie und Marktzeitraum. Prüfe die Anbieterregeln.",
    "Ce marché porte sur le total de buts ou de points, pour les équipes et la période indiquées dans la sélection.": "Betrifft die angegebene Gesamtsumme. Prüfe Linie, Zeitraum und Abrechnungsregeln.",
    "Le pronostic porte sur un match nul pendant la période indiquée par le marché.": "Der Tipp erwartet ein Unentschieden im abgedeckten Zeitraum.",
    "Annulé": "Erstattet",
    "La sélection prévoit un match nul dans la période couverte.": "Der Tipp erwartet ein Unentschieden im abgedeckten Zeitraum.",
    "Le résultat se juge après application du handicap indiqué pour l’équipe sélectionnée.": "Abrechnung nach Handicap, Linie und Marktzeitraum. Prüfe die Anbieterregeln.",
    "La sélection prévoit la victoire de {{v0}}, selon les règles de ce marché.": "Das Modell wählt {{v0}} als Sieger im Marktzeitraum.",
    "Jackpot": "Jackpot",
    "ring-2 ring-rose-500/40": "ring-2 ring-rose-500/40",
    "PRO": "PRO",
    "vs": "vs",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "KOUKPAKI VIANEY": "KOUKPAKI VIANEY",
    "WinPulse Pro": "WinPulse Pro",
    "pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-8": "pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-8",
    "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8": "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8",
    "calc(4rem + env(safe-area-inset-bottom))": "calc(4rem + env(safe-area-inset-bottom))",
    "FCFA{{v0}}": "FCFA{{v0}}",
    "{{v0}} FCFA": "{{v0}} FCFA",
    "Gemini": "Gemini",
    "Claude": "Claude",
    "edge": "edge",
    "{{v0}} vs {{v1}}": "{{v0}} vs {{v1}}",
    "chez {{bookmaker}}": "bei {{bookmaker}}",
    "Vainqueur (1X2)": "Sieger (1X2)",
    "Total buts/points": "Tore/Punkte gesamt",
    "Total de buts": "Tore gesamt",
    "Cartons": "Karten",
    "Corners": "Eckbälle",
    "Mi-temps": "Halbzeit",
    "Match nul": "Unentschieden",
    "Plus de {{line}} buts": "Über {{line}} Tore",
    "Moins de {{line}} buts": "Unter {{line}} Tore",
    "Plus de {{line}} points": "Über {{line}} Punkte",
    "Moins de {{line}} points": "Unter {{line}} Punkte",
    "Plus de {{line}} corners": "Über {{line}} Eckbälle",
    "Moins de {{line}} corners": "Unter {{line}} Eckbälle",
    "Plus de {{line}} cartons": "Über {{line}} Karten",
    "Moins de {{line}} cartons": "Unter {{line}} Karten",
    "TERMINÉ": "BEENDET",
    "EN DIRECT": "LIVE",
    "Pick verrouillé": "Gesperrter Tipp",
    "Passe Pro pour voir l’analyse": "Mit Pro die Analyse ansehen",
    "Avantage estimé : {{edge}}": "Geschätzter Vorteil: {{edge}}",
    "Analyse en cours…": "Analyse läuft…",
    "Autres marchés analysés": "Weitere analysierte Märkte",
    "Partager WhatsApp (Admin)": "Auf WhatsApp teilen (Admin)",
    "Pronostic à risque réduit": "Tipp mit geringerem Risiko",
    "Pronostic à risque modéré": "Tipp mit moderatem Risiko",
    "Pronostic risqué": "Tipp mit höherem Risiko",
    "Victoire de {{team}}": "Sieg von {{team}}",
    "Plus de {{line}}": "Über {{line}}",
    "Moins de {{line}}": "Unter {{line}}",
    "Oui": "Ja",
    "Non": "Nein",
    "Les deux équipes marquent : Oui": "Beide Teams treffen: Ja",
    "Les deux équipes marquent : Non": "Beide Teams treffen: Nein"
  },
  "ar": {
    "Choisir la langue": "اختيار اللغة",
    "Langue de l’interface": "لغة الواجهة",
    "Dashboard": "لوحة التحكم",
    "Live": "مباشر",
    "Aujourd'hui": "اليوم",
    "À la une": "أبرز التوقعات",
    "Combinés": "التوقعات المجمعة",
    "Combo Builder": "منشئ التوقعات المجمعة",
    "Value bets": "توقعات ذات قيمة",
    "Montante": "سلسلة التوقعات",
    "Track record": "سجل النتائج",
    "Profil": "الملف الشخصي",
    "Parrainage": "دعوة الأصدقاء",
    "Abonnement": "الاشتراك",
    "Admin": "الإدارة",
    "New": "جديد",
    "10J": "١٠ أيام",
    "Free": "مجاني",
    "Ton pouls de gagnant": "ابقَ متقدماً",
    "Connecté": "تم تسجيل الدخول",
    "Déconnexion": "تسجيل الخروج",
    "Plus d'options": "خيارات إضافية",
    "Fermer": "إغلاق",
    "Plus": "المزيد",
    "Tableau": "الرئيسية",
    "Direct": "مباشر",
    "Jour": "اليوم",
    "Créer": "إنشاء",
    "Blog": "المدونة",
    "Mentions légales": "البيانات القانونية",
    "CGV": "شروط البيع",
    "Confidentialité": "الخصوصية",
    "Jeu responsable · 18+": "اللعب بمسؤولية · 18+",
    "© 2026 WinPulse · Dublin, Irlande": "© 2026 WinPulse · دبلن، أيرلندا",
    "Ce compte vient d’être connecté sur un autre appareil ou navigateur. Cette session a été fermée.": "تم تسجيل الدخول إلى هذا الحساب من جهاز أو متصفح آخر. تم إنهاء هذه الجلسة.",
    "Ta session a expiré. Reconnecte-toi pour continuer.": "انتهت صلاحية جلستك. سجّل الدخول مجدداً للمتابعة.",
    "EN COURS": "جارية",
    "ÉCHOUÉE": "غير ناجحة",
    "TERMINÉE": "مكتملة",
    "AUCUNE": "لا توجد",
    "Aucune montante active.": "لا توجد سلسلة توقعات نشطة.",
    "Impossible de charger la montante.": "تعذّر تحميل سلسلة التوقعات.",
    "Impossible d'actualiser la montante.": "تعذّر تحديث سلسلة التوقعات.",
    "Le capital initial doit être un nombre positif.": "يجب أن يكون المبلغ الأولي رقماً موجباً.",
    "La montante doit durer 10 ou 15 jours.": "يجب أن تستمر السلسلة ١٠ أو ١٥ يوماً.",
    "Impossible de démarrer la montante.": "تعذّر بدء سلسلة التوقعات.",
    "Montante WinPulse": "سلسلة توقعات WinPulse",
    "10 → 15 jours": "١٠ إلى ١٥ يوماً",
    "Le moteur retient les pronostics existants qui respectent ses critères. Une journée gagnée fait avancer la série ; une journée perdue y met fin. Si aucune sélection ne convient, le module attend.": "يختار المحرك التوقعات المتاحة التي تستوفي معاييره. يقدّم اليوم الناجح السلسلة، وينهيها اليوم الخاسر. إذا لم تتوفر اختيارات مناسبة، ينتظر النظام.",
    "Actualiser": "تحديث",
    "Montante indisponible": "سلسلة التوقعات غير متاحة",
    "Contrôle administrateur": "أدوات الإدارة",
    "Montante 10 jours": "سلسلة لمدة ١٠ أيام",
    "Montante 15 jours": "سلسلة لمدة ١٥ يوماً",
    "Capital initial": "المبلغ الأولي",
    "Démarrer": "بدء",
    "Recommencer": "إعادة البدء",
    "Le démarrage et le redémarrage sont réservés à l'administrateur afin d'éviter qu'un utilisateur ne réinitialise la série.": "بدء السلسلة وإعادة بدئها متاحان للإدارة فقط، لمنع المستخدمين من إعادة ضبطها.",
    "Chargement de la montante…": "جارٍ تحميل سلسلة التوقعات…",
    "Aucune montante active": "لا توجد سلسلة توقعات نشطة",
    "L'administrateur doit lancer une montante de 10 ou 15 jours.": "يجب على الإدارة بدء سلسلة لمدة ١٠ أو ١٥ يوماً.",
    "progression": "التقدم",
    "mise de départ": "المبلغ الابتدائي",
    "Capital théorique": "المبلغ النظري",
    "si les journées passent": "إذا نجحت أيام السلسلة",
    "Progression": "التقدم",
    "de la série": "في السلسلة",
    "Progression de la série": "تقدم السلسلة",
    "Jour {{day}} sur {{total}}": "اليوم {{day}} من {{total}}",
    "Pronostics du jour": "توقعات اليوم",
    "Les sélections dépendent des critères et des données disponibles. Aucun intervalle de cotes fixe n’est garanti.": "تعتمد الاختيارات على المعايير والبيانات المتاحة. لا يوجد نطاق ثابت مضمون للمعاملات.",
    "Pick {{number}}": "الاختيار {{number}}",
    "Confiance": "مؤشر الثقة",
    "Début :": "البداية:",
    "En attente d'un pick qualifié": "في انتظار اختيار يستوفي المعايير",
    "Le module ne force jamais un pronostic s'il ne respecte pas ses critères.": "لا يفرض النظام توقعاً لا يستوفي معاييره.",
    "Historique": "السجل",
    "Aucune journée terminée.": "لا توجد أيام مكتملة بعد.",
    "GAGNÉ": "ناجح",
    "REMBOURSÉ": "ملغى",
    "PERDU": "خاسر",
    "Aucun pari sportif n'est garanti. La montante réduit le nombre de sélections mais n'élimine pas le risque. 18+ · Jeu responsable.": "لا توجد نتيجة مضمونة لأي رهان رياضي. تحدّ السلسلة من عدد الاختيارات، لكنها لا تلغي المخاطر. 18+ · اللعب بمسؤولية.",
    "Chargement…": "جارٍ التحميل…",
    "Analyses sportives": "تحليلات رياضية",
    "Historique des résultats": "سجل النتائج",
    "Articles": "مقالات",
    "Ouvrir l'app": "فتح التطبيق",
    "Connexion": "تسجيل الدخول",
    "S'inscrire": "إنشاء حساب",
    "Démarrer gratuit": "ابدأ مجاناً",
    "Pronostics · Analyses · Résultats publics": "توقعات · تحليلات · نتائج متاحة للجميع",
    "Vise la victoire avec nos pronostics.": "استهدف الفوز مع توقعاتنا.",
    "Garde une longueur d’avance.": "ابقَ متقدماً بخطوة.",
    "Découvre les pronostics du jour et nos analyses de matchs. Commence gratuitement, puis passe à Pro pour explorer les sélections et combinés réservés aux abonnés.": "اكتشف توقعات اليوم وتحليلات المباريات. ابدأ مجاناً، ثم اشترك في Pro للوصول إلى الاختيارات والتوقعات المجمعة المخصصة للمشتركين.",
    "Découvrir les pronostics": "استكشاف التوقعات",
    "Découvrir l’offre Pro": "اكتشاف عرض Pro",
    "Consulter l’historique complet": "عرض السجل الكامل",
    "Inscription sans carte": "التسجيل دون بطاقة بنكية",
    "Résultats publics": "نتائج متاحة للجميع",
    "Compte gratuit": "حساب مجاني",
    "Pronostics disponibles": "التوقعات المتاحة",
    "Chargement des analyses…": "جارٍ تحميل التحليلات…",
    "Les analyses ne sont pas disponibles pour le moment.": "التحليلات غير متاحة حالياً.",
    "Réessayer": "إعادة المحاولة",
    "Les analyses du jour arrivent prochainement.": "ستتوفر تحليلات اليوم قريباً.",
    "Consulte l’historique de résultats en attendant les prochaines sélections.": "تصفح سجل النتائج أثناء انتظار الاختيارات القادمة.",
    "Analyse réservée Pro": "تحليل مخصص لمشتركي Pro",
    "Indice : {{value}} %": "المؤشر: {{value}} %",
    "Les indices d’analyse ne garantissent aucun résultat.": "مؤشرات التحليل لا تضمن أي نتيجة.",
    "Ouvrir l’application": "فتح التطبيق",
    "Créer mon compte gratuit": "إنشاء حسابي المجاني",
    "Historique des pronostics": "سجل التوقعات",
    "Les résultats d’hier": "نتائج الأمس",
    "Matchs du {{date}}.": "مباريات {{date}}.",
    "Quelques paris gagnants de la veille, classés par cote décroissante, issus de notre Track Record.": "مجموعة من اختيارات الأمس الناجحة من سجل نتائجنا، مرتبة تنازلياً حسب المعامل.",
    "Voir tous les résultats": "عرض جميع النتائج",
    "Chargement des résultats d’hier…": "جارٍ تحميل نتائج الأمس…",
    "Le bilan d’hier n’est pas disponible pour le moment.": "ملخص الأمس غير متاح حالياً.",
    "Tu peux consulter l’historique complet des résultats.": "يمكنك الاطلاع على سجل النتائج الكامل.",
    "Gagnants": "ناجحة",
    "Perdants": "خاسرة",
    "En attente": "قيد الانتظار",
    "Annulés / remboursés": "ملغاة / مستردة",
    "Nombre total de pronostics : {{count}}. Les cartes ci-dessous montrent uniquement une sélection des gagnants.": "إجمالي التوقعات: {{count}}. تعرض البطاقات أدناه مجموعة مختارة من التوقعات الناجحة فقط.",
    "Aucun pronostic publié pour les matchs de cette journée.": "لم تُنشر توقعات لمباريات هذا اليوم.",
    "Aucun pronostic gagnant confirmé pour cette journée. Le bilan reste visible ci-dessus.": "لا توجد توقعات ناجحة مؤكدة لهذا اليوم. يظل الملخص ظاهراً أعلاه.",
    "Les détails des pronostics gagnants ne sont pas encore disponibles ici. Consulte l’historique complet.": "تفاصيل التوقعات الناجحة غير متاحة هنا بعد. راجع السجل الكامل.",
    "Gagné": "ناجح",
    "Cote publiée": "المعامل المنشور",
    "Score final": "النتيجة النهائية",
    "Pronostic publié avant le match · résultat confirmé.": "توقع منشور قبل المباراة · نتيجة مؤكدة.",
    "Les résultats passés ne garantissent pas les prochains résultats.": "النتائج السابقة لا تضمن النتائج القادمة.",
    "COMMENT UTILISER WINPULSE": "كيفية استخدام WINPULSE",
    "Une analyse pro, claire et immédiate": "تحليل رياضي واضح وسهل الوصول",
    "Consulte les analyses, vérifie les résultats et garde la maîtrise de tes décisions.": "اطلع على التحليلات، وتحقق من النتائج، واحتفظ بالتحكم في قراراتك.",
    "Explications de match": "شروحات المباريات",
    "Comprends les sélections à partir des données disponibles, avec une explication locale ou une aide IA lorsqu’elle est configurée.": "افهم الاختيارات بناءً على البيانات المتاحة، مع شرح محلي أو مساعدة بالذكاء الاصطناعي عند تهيئتها.",
    "Scoring rigoureux": "مؤشرات التحليل",
    "Consulte les indicateurs disponibles pour comparer les sélections. Un indice n’est pas une garantie de réussite.": "استخدم المؤشرات المتاحة لمقارنة الاختيارات. المؤشر ليس ضماناً للنجاح.",
    "Combinés par profil": "توقعات مجمعة حسب النمط",
    "Compare les sélections et les niveaux de risque disponibles. Aucun combiné n’est sans risque.": "قارن الاختيارات ومستويات المخاطر المتاحة. لا توجد مجموعة توقعات خالية من المخاطر.",
    "Track record transparent": "سجل نتائج شفاف",
    "Historique public, ROI, win-rate, cotes moyennes. On assume nos picks gagnants ET perdants.": "سجل عام، وعائد، ومعدل نجاح، ومتوسط معاملات. يشمل الاختيارات الناجحة والخاسرة.",
    "Value bets détectés": "رصد توقعات ذات قيمة",
    "Compare les estimations et les cotes proposées. Les estimations restent incertaines.": "قارن التقديرات بالمعاملات المعروضة. تظل التقديرات غير مؤكدة.",
    "Découverte gratuite": "اكتشاف مجاني",
    "Crée ton compte sans paiement. Consulte ensuite les modalités de l’offre Pro depuis ton espace.": "أنشئ حسابك دون دفع. ثم اطلع على شروط عرض Pro من حسابك.",
    "Retrouve ton code et les conditions du programme dans ton compte.": "ستجد رمزك وشروط البرنامج في حسابك.",
    "Voir mon code": "عرض رمزي",
    "ABONNEMENT": "الاشتراك",
    "Choisis ton accès": "اختر طريقة الوصول",
    "Découvre WinPulse gratuitement. Passe à Pro pour retrouver les pronostics, les combinés et les outils réservés aux abonnés.": "اكتشف WinPulse مجاناً. اشترك في Pro للوصول إلى التوقعات والمجموعات والأدوات المخصصة للمشتركين.",
    "Pour découvrir": "للاكتشاف",
    "Sélections gratuites disponibles": "الاختيارات المجانية المتاحة",
    "Tous les matchs (cotes visibles)": "جميع المباريات مع المعاملات الظاهرة",
    "Track record public": "سجل نتائج عام",
    "pour 30 jours": "لمدة ٣٠ يوماً",
    "Accès complet": "وصول كامل",
    "Tous les pronostics débloqués": "إتاحة جميع التوقعات",
    "Tous les combinés du jour": "جميع التوقعات المجمعة لليوم",
    "Explications des pronostics": "شروحات التوقعات",
    "Value bets et Combo Builder": "توقعات ذات قيمة ومنشئ المجموعات",
    "Montante premium": "سلسلة توقعات مميزة",
    "Support WhatsApp prioritaire": "دعم ذو أولوية عبر WhatsApp",
    "Passer à Pro": "الترقية إلى Pro",
    "© 2026 WinPulse · Joue responsable · 18+": "© 2026 WinPulse · العب بمسؤولية · 18+",
    "Les pronostics sont des analyses statistiques, pas des garanties. Mise ce que tu peux perdre. WinPulse n'accepte aucun pari et ne joue pas pour ses utilisateurs.": "التوقعات تحليلات إحصائية وليست ضمانات. لا تراهن إلا بما يمكنك تحمّل خسارته. لا يقبل WinPulse الرهانات ولا يراهن نيابةً عن مستخدميه.",
    "Renseigne ton nom.": "أدخل اسمك.",
    "Ton numéro WhatsApp est obligatoire pour créer ton compte.": "رقم WhatsApp مطلوب لإنشاء حسابك.",
    "Renseigne ton numéro avec + et l’indicatif du pays, par exemple +2250700000000.": "أدخل رقمك مع + ورمز البلد، مثل +2250700000000.",
    "Le formulaire d’inscription doit être mis à jour. Réessaie après actualisation de la page.": "يحتاج نموذج التسجيل إلى تحديث. حدّث الصفحة ثم أعد المحاولة.",
    "L’inscription n’a pas abouti. Réessaie dans un instant.": "لم يكتمل التسجيل. أعد المحاولة بعد قليل.",
    "Analyse les matchs. Vérifie les résultats. Décide toi-même.": "حلّل المباريات. تحقق من النتائج. اتخذ قرارك بنفسك.",
    "Commence gratuitement, sans carte bancaire.": "ابدأ مجاناً، دون بطاقة بنكية.",
    "Historique public des résultats": "سجل نتائج متاح للجميع",
    "Aucun paiement pour créer le compte": "لا يلزم الدفع لإنشاء الحساب",
    "Invitation détectée": "تم العثور على دعوة",
    "WinPulse · 18+ · Joue responsable": "WinPulse · 18+ · العب بمسؤولية",
    "100 % gratuit": "مجاني بالكامل",
    "Ton accès gratuit est presque prêt": "وصولك المجاني أصبح جاهزاً تقريباً",
    "Crée ton compte pour découvrir WinPulse.": "أنشئ حسابك لاكتشاف WinPulse.",
    "Gratuit": "مجاني",
    "0 FCFA": "0 FCFA",
    "Sans CB": "دون بطاقة",
    "Aucun paiement": "دون دفع",
    "Libre": "الاختيار لك",
    "Sans engagement": "دون التزام",
    "Nom": "الاسم",
    "Ton nom complet": "اسمك الكامل",
    "Email": "البريد الإلكتروني",
    "vous@email.com": "you@email.com",
    "Numéro WhatsApp": "رقم WhatsApp",
    "(obligatoire)": "(مطلوب)",
    "Ajoute + et l’indicatif de ton pays : +33 France, +353 Irlande, +225 Côte d’Ivoire, +229 Bénin, +223 Mali.": "أضف + ورمز بلدك: +33 فرنسا، +353 أيرلندا، +225 ساحل العاج، +229 بنين، +223 مالي.",
    "Mot de passe": "كلمة المرور",
    "10 caractères minimum": "١٠ أحرف على الأقل",
    "J’ai un code parrainage": "لديّ رمز دعوة",
    "Code parrainage": "رمز الدعوة",
    "(optionnel)": "(اختياري)",
    "J’accepte de recevoir sur WhatsApp les offres WinPulse et les invitations à ses groupes ou communautés privées, par contact manuel ou automatique. Cette autorisation est facultative et n’est pas nécessaire pour créer mon compte. Je peux la retirer depuis mon profil.": "أوافق على تلقي عروض WinPulse ودعوات إلى مجموعاته أو مجتمعاته الخاصة عبر WhatsApp، برسائل يدوية أو تلقائية. هذا الإذن اختياري وليس شرطاً لإنشاء حسابي. يمكنني سحبه من ملفي الشخصي.",
    "Création du compte…": "جارٍ إنشاء الحساب…",
    "Aucun paiement demandé à l’inscription. WinPulse fournit des analyses statistiques et ne garantit aucun gain.": "لا يُطلب أي دفع عند التسجيل. يقدم WinPulse تحليلات إحصائية ولا يضمن أي أرباح.",
    "Politique de confidentialité": "سياسة الخصوصية",
    "Déjà inscrit ?": "لديك حساب بالفعل؟",
    "Se connecter": "تسجيل الدخول",
    "18+ · Joue responsable": "18+ · العب بمسؤولية",
    "Bienvenue !": "مرحباً بك!",
    "Erreur {{status}}": "خطأ {{status}}",
    "Pas de réponse du serveur. Vérifie ta connexion internet puis réessaye.": "لا توجد استجابة من الخادم. تحقق من اتصال الإنترنت ثم أعد المحاولة.",
    "Erreur inconnue": "خطأ غير معروف",
    "Retrouve tes pronostics, tes analyses et les résultats disponibles dans ton espace. Aucun résultat n’est garanti.": "اطلع على توقعاتك وتحليلاتك والنتائج المتاحة من حسابك. لا توجد نتيجة مضمونة.",
    "© 2026 WinPulse · 18+ · Joue responsable": "© 2026 WinPulse · 18+ · العب بمسؤولية",
    "Accède à tes pronostics du jour": "الوصول إلى توقعات اليوم",
    "Mot de passe oublié ?": "نسيت كلمة المرور؟",
    "Connexion en cours…": "جارٍ تسجيل الدخول…",
    "Pas encore de compte ?": "ليس لديك حساب بعد؟",
    "Créer un compte gratuit": "إنشاء حساب مجاني",
    "Cache de connexion effacé. Réessaye maintenant.": "تم مسح ذاكرة تسجيل الدخول. أعد المحاولة الآن.",
    "Le navigateur bloque l’accès au stockage local.": "المتصفح يمنع الوصول إلى التخزين المحلي.",
    "Problème de connexion ? Effacer le cache de connexion": "مشكلة في الدخول؟ امسح ذاكرة تسجيل الدخول",
    "Email ou mot de passe incorrect": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    "Email deja utilise": "البريد الإلكتروني مستخدم بالفعل",
    "Le numéro WhatsApp est obligatoire pour créer un compte": "رقم WhatsApp مطلوب لإنشاء الحساب",
    "Le mot de passe doit contenir au moins 10 caractères": "يجب أن تتكون كلمة المرور من ١٠ أحرف على الأقل",
    "Choisis un mot de passe moins courant": "اختر كلمة مرور أقل شيوعاً",
    "Choisis un mot de passe moins répétitif": "اختر كلمة مرور أقل تكراراً",
    "Le mot de passe ne doit pas contenir ton adresse email": "يجب ألا تتضمن كلمة المرور عنوان بريدك الإلكتروني",
    "Trop de tentatives. Réessaie plus tard.": "محاولات كثيرة. أعد المحاولة لاحقاً.",
    "Actualisation en cours…": "جارٍ التحديث…",
    "Football": "كرة القدم",
    "Basketball": "كرة السلة",
    "Tennis": "التنس",
    "en attente": "قيد الانتظار",
    "Sport": "الرياضة",
    "En direct{{v0}}": "مباشر{{v0}}",
    "Terminé": "انتهت",
    "{{v0}} en direct": "{{v0}} مباشر",
    "Hockey": "الهوكي",
    "Tous les marchés": "جميع الأسواق",
    "Vainqueur": "الفائز",
    "Mon ticket WNPulse": "Mon ticket WNPulse",
    "Les deux équipes marquent": "كلا الفريقين يسجل",
    "Effacer la recherche": "مسح البحث",
    "WNPULSE · COMBO BUILDER": "WNPULSE · COMBO BUILDER",
    "Aujourd’hui": "اليوم",
    "Cote {{v0}}": "معامل الربح {{v0}}",
    "Réinitialiser les filtres": "إعادة ضبط الفلاتر",
    "WhatsApp": "WhatsApp",
    "Confiance {{v0}}": "مؤشر الثقة {{v0}}",
    "Clipboard unavailable": "Clipboard unavailable",
    "Cote": "معامل الربح",
    "Confiance du moteur": "ثقة المحرّك",
    "WNPULSE · LES COMBINÉS": "WNPULSE · LES COMBINÉS",
    "Tous": "الكل",
    "🏆 Victoire": "🏆 الفائز",
    "Double chance": "فرصة مزدوجة",
    "🔄 Double chance": "🔄 فرصة مزدوجة",
    "Handicap": "هانديكاب",
    "⚖️ Handicap": "⚖️ هانديكاب",
    "🟢 SÛR": "🟢 مخاطر أقل",
    "🟡 MODÉRÉ": "🟡 متوسط",
    "🔴 RISQUÉ": "🔴 مرتفع المخاطر",
    "LIVE": "مباشر",
    "Passe Pro pour débloquer": "اشترك في Pro لفتح المحتوى",
    "Pronostic": "التوقع",
    "Partager sur WhatsApp": "المشاركة عبر واتساب",
    "Gagnés": "ناجحة",
    "Perdus": "خاسرة",
    "Perdu": "خاسر",
    "Marché": "السوق",
    "Découvrir Pro": "اكتشف Pro",
    "{{v0}} gagnés": "{{v0}} ناجحة",
    "{{v0}} perdus": "{{v0}} خاسرة",
    "📈 Over 2.5": "📈 أكثر من ٢٫٥",
    "🎯 BTTS": "🎯 كلاهما يسجل",
    "⚽ Over/Under": "⚽ أكثر/أقل",
    "over 2": "over 2",
    "les deux": "كلاهما",
    "WhatsApp ouvert": "فُتح واتساب",
    "Partager sur WhatsApp (Admin)": "المشاركة عبر واتساب (المشرف)",
    "Sélection éditoriale automatique": "اختيار تحريري تلقائي",
    "À la une — Top picks du jour": "الأبرز — اختيارات اليوم",
    "Les pronostics avec la plus haute confiance, tous sports confondus.{{v0}}": "التوقعات الأعلى ثقة في جميع الرياضات.{{v0}}",
    "{{v0}} picks analysés": "اختيارات مُحلّلة: {{v0}}",
    "1 pick visible · {{v0}} verrouillés": "اختيار واحد ظاهر · {{v0}} مقفل",
    "Passe Pro pour voir tous les picks et les 3 combinés du jour.": "اشترك في Pro لعرض التوقعات والرهانات المركبة المتاحة.",
    "Débloquer": "فتح",
    "Aucun pick pour ce marché.": "لا توجد اختيارات لهذا السوق.",
    "Voir tous les picks": "عرض جميع الاختيارات",
    "Pronostic verrouillé": "توقع مقفل",
    "Marché : {{v0}}": "السوق: {{v0}}",
    "Confiance IA : {{v0}}%": "ثقة المحرّك: {{v0}}٪",
    "Un seul prix. Tout WinPulse. Sans compromis.": "سعر واحد. كل WinPulse.",
    "Accès illimité à tous les pronostics, tous les jours, sur 7 sports": "وصول غير محدود للتوقعات المتاحة في ٧ رياضات",
    "Tous les combinés (Sûr, Booster, Extra, Jackpot) débloqués": "فتح جميع ملفات الرهانات المركبة المتاحة",
    "Chaque match analysé sur tous ses marchés": "تحليل جميع الأسواق المتاحة لكل مباراة",
    "Combo Builder et détecteur de value bets": "منشئ الرهانات المركبة وكاشف فرص القيمة",
    "Analyse IA experte sur chaque match": "شروح مفصلة للتوقعات",
    "Montante WinPulse avec picks débloqués": "سلسلة WinPulse مع اختيارات مفتوحة",
    "Track Record public et vérifiable": "سجل نتائج علني وقابل للتحقق",
    "Support prioritaire par WhatsApp": "دعم ذو أولوية عبر واتساب",
    "Offre en ligne momentanément indisponible. Le plan WinPulse reste affiché.": "العرض الإلكتروني غير متاح مؤقتاً. تبقى باقة WinPulse معروضة.",
    "Indique le nom utilisé pour le paiement.": "أدخل الاسم المستخدم للدفع.",
    "Indique le numéro MTN Mobile Money utilisé.": "أدخل رقم MTN Mobile Money المستخدم.",
    "Le plan d'abonnement n'est pas disponible.": "باقة الاشتراك غير متاحة.",
    "La référence de suivi n'a pas été générée.": "لم يُنشأ الرقم المرجعي للتتبع.",
    "Lien de paiement FedaPay invalide.": "رابط دفع FedaPay غير صالح.",
    "Le lien de paiement doit utiliser HTTPS.": "يجب أن يستخدم رابط الدفع HTTPS.",
    "Impossible de générer la référence de paiement.": "تعذّر إنشاء مرجع الدفع.",
    "Référence copiée": "نُسخ المرجع",
    "Bonjour WinPulse !": "مرحباً WinPulse!",
    "Merci de vérifier mon paiement et d'activer mon accès.": "يرجى التحقق من دفعتي وتفعيل وصولي.",
    "Paiement sécurisé via FedaPay · choisis ton moyen de paiement sur la page FedaPay · annulable à tout moment": "دفع آمن عبر FedaPay · اختر وسيلتك في FedaPay · إلغاء في أي وقت",
    "Paiement sécurisé · MTN Mobile Money disponible en solution de secours · annulable à tout moment": "دفع آمن · MTN Mobile Money كخيار بديل · إلغاء في أي وقت",
    "Plan actuel": "الباقة الحالية",
    "Paiement WinPulse": "دفع WinPulse",
    "Informations de paiement": "معلومات الدفع",
    "Détails du paiement": "تفاصيل الدفع",
    "Nom et prénom": "الاسم الكامل",
    "Téléphone (facultatif)": "الهاتف (اختياري)",
    "Numéro MTN Mobile Money": "رقم MTN Mobile Money",
    "Ex. +229 01 97 00 00 00": "مثال: +229 01 97 00 00 00",
    "Ex. 01 97 00 00 00": "مثال: 01 97 00 00 00",
    "Copier la référence": "نسخ المرجع",
    "Ouverture du paiement…": "جارٍ فتح الدفع…",
    "Préparation du paiement…": "جارٍ تجهيز الدفع…",
    "Un seul accès. Tout WinPulse.": "وصول واحد. كل WinPulse.",
    "Plan actif :{{v0}}{{v1}}": "الباقة المفعّلة:{{v0}}{{v1}}",
    "Débloquer WinPulse Pro": "فتح WinPulse Pro",
    "Sans engagement · résiliable à tout moment · support WhatsApp inclus": "دون التزام · إلغاء في أي وقت · دعم واتساب مشمول",
    "Aucun plan disponible pour le moment.": "لا توجد باقة متاحة حالياً.",
    "{{v0}} FCFA / mois": "{{v0}} FCFA / شهر",
    "Débloquer Pro": "فتح Pro",
    "WinPulse Pro · {{v0}} FCFA / mois": "WinPulse Pro · {{v0}} FCFA / شهر",
    "Montant de l'abonnement": "قيمة الاشتراك",
    "30 jours · WinPulse Pro": "٣٠ يوماً · WinPulse Pro",
    "{{v0}} Après validation, tu seras redirigé vers la page de paiement.": "{{v0}} بعد التأكيد ستنتقل إلى صفحة الدفع.",
    "Paiement sécurisé par FedaPay.": "دفع آمن عبر FedaPay.",
    "Email du compte": "بريد الحساب",
    "Nom utilisé pour le paiement": "الاسم المستخدم للدفع",
    "Référence de suivi": "الرقم المرجعي للتتبع",
    "Procédure MTN Mobile Money": "تعليمات MTN Mobile Money",
    "1. Compose {{v0}} ou ouvre l'application MTN MoMo.": "١. اطلب {{v0}} أو افتح تطبيق MTN MoMo.",
    "2. Envoie {{v0}} au {{v1}}.": "٢. أرسل {{v0}} إلى {{v1}}.",
    "3. Vérifie le destinataire : {{v0}}.": "٣. تحقق من المستلم: {{v0}}.",
    "4. Garde le SMS de confirmation puis contacte WinPulse sur WhatsApp.": "٤. احتفظ برسالة التأكيد ثم تواصل مع WinPulse عبر واتساب.",
    "Envoyer la confirmation sur WhatsApp": "إرسال التأكيد عبر واتساب",
    "Référence : {{v0}}": "المرجع: {{v0}}",
    "Je viens d'effectuer le paiement pour activer mon plan {{v0}}.": "دفعت لتفعيل باقتي {{v0}}.",
    "Montant : {{v0}} FCFA": "المبلغ: {{v0}} FCFA",
    "Numéro MTN MoMo utilisé : {{v0}}": "رقم MTN MoMo المستخدم: {{v0}}",
    "Nom : {{v0}}": "الاسم: {{v0}}",
    "Email : {{v0}}": "البريد: {{v0}}",
    "Débloquer {{v0}}": "فتح {{v0}}",
    "Payer {{v0}} FCFA": "دفع {{v0}} FCFA",
    "Continuer — {{v0}} FCFA": "متابعة — {{v0}} FCFA",
    "Impossible de charger le parrainage": "تعذّر تحميل برنامج الإحالة",
    "Lien copié — partage-le maintenant !": "نُسخ الرابط — شاركه الآن!",
    "Récompense activée !": "فُعّلت المكافأة!",
    "Réclamation impossible": "تعذّر طلب المكافأة",
    "Copie ton lien ou ton code unique.": "انسخ رابطك أو رمزك الفريد.",
    "Partage-le sur WhatsApp, en 1 clic.": "شاركه عبر واتساب بنقرة واحدة.",
    "Découvre WinPulse — IA pronostics sportifs": "اكتشف WinPulse — التوقعات الرياضية",
    "70%+ de réussite": "نتائج قابلة للتحقق",
    "Track record public, vérifiable à tout moment.": "سجل نتائج علني يمكن التحقق منه في أي وقت.",
    "Communauté active": "مجتمع نشط",
    "Picks décortiqués, analyses IA, combinés du jour.": "اختيارات مشروحة وتحليلات ورهانات مركبة يومية.",
    "1 mois, paiement MTN. Pas de carte, pas de piège.": "شهر واحد، دفع MTN. لا حاجة إلى بطاقة.",
    "Programme parrainage": "برنامج الإحالة",
    "Invite 3 amis,{{v0}}reçois {{v1}}": "ادعُ ٣ أصدقاء،{{v0}}واحصل على {{v1}}",
    "7 jours Pro offerts": "٧ أيام Pro مجانية",
    "Partage ton lien WhatsApp en 1 clic. Dès que {{v0}} créent leur compte, ton accès Pro s'active automatiquement — vraiment gratuit.": "شارك رابطك. عند تسجيل {{v0}}، يُفعّل وصول Pro المجاني تلقائياً.",
    "3 amis": "٣ أصدقاء",
    "Ton code": "رمزك",
    "Ta progression": "تقدّمك",
    "{{v0}} / {{v1}} amis inscrits": "الأصدقاء المسجلون: {{v0}} / {{v1}}",
    "🎉 Bravo ! Tu peux réclamer ta récompense.": "🎉 أحسنت! يمكنك طلب مكافأتك.",
    "Récompense déjà réclamée. Merci d'avoir parrainé tes amis !": "طُلبت المكافأة بالفعل. شكراً لدعوة أصدقائك!",
    "Encore {{v0}} ami{{v1}} à inviter pour débloquer ta semaine Pro.": "الأصدقاء المتبقون لفتح أسبوع Pro: {{v0}}.",
    "Comment ça marche": "كيف يعمل",
    "Partager maintenant": "شارك الآن",
    "Envoyer par email": "إرسال عبر البريد",
    "Pourquoi ils vont kiffer": "لماذا سيعجبهم",
    "Code {{v0}} copié": "نُسخ الرمز {{v0}}",
    "Dès que 3 amis créent leur compte avec ton code, {{v0}} jours Pro s'activent.": "عند تسجيل ٣ أصدقاء برمزك، تُفعّل {{v0}} أيام Pro.",
    "Cette rencontre n’est plus disponible dans les matchs actuels.": "لم تعد هذه المباراة متاحة في القائمة الحالية.",
    "La rencontre ne peut pas être chargée pour le moment. Réessaie depuis le dashboard.": "تعذّر تحميل المباراة. حاول مجدداً من لوحة التحكم.",
    "Le serveur réserve cette analyse à Pro. L’explication du pronostic reste disponible ci-dessus.": "هذا التحليل مخصّص لـPro. يبقى شرح التوقع متاحاً أعلاه.",
    "L’explication complémentaire est indisponible pour le moment. Les informations du pronostic restent affichées.": "الشرح الإضافي غير متاح. تبقى تفاصيل التوقع معروضة.",
    "Match introuvable.": "لم يُعثر على المباراة.",
    "Bookmakers": "المراهنون",
    "Écart estimé": "الفارق المقدّر",
    " points": " نقطة",
    "Estimation du moteur": "تقدير المحرّك",
    "Cote optimale": "أفضل معامل",
    "H2H (10 derniers)": "المواجهات المباشرة (آخر ١٠)",
    "Forme récente": "الأداء الأخير",
    "xG moyens": "متوسط الأهداف المتوقعة xG",
    "Absences clés": "الغيابات المهمة",
    "Cartons arbitre": "بطاقات الحكم",
    "Conditions": "الظروف",
    "Forme et historique H2H réels (football-data.org) quand disponibles. Autres champs : analyse basée sur le consensus des cotes bookmakers.": "أداء ومواجهات حقيقية من football-data.org عند توفرها. تعتمد الحقول الأخرى على توافق المعاملات.",
    "Analyse basée uniquement sur le consensus des cotes bookmakers agrégées — aucune statistique externe fabriquée.": "يعتمد فقط على توافق معاملات المراهنين المجمّعة، دون إحصاءات خارجية مختلقة.",
    "Enrichir l’explication": "توسيع الشرح",
    "Source non précisée par le service": "لم تُحدّد الخدمة المصدر",
    "Moteur statistique": "المحرّك الإحصائي",
    "Retour au dashboard": "العودة للوحة التحكم",
    "Retour": "عودة",
    "VS": "ضد",
    "Passe Pro pour voir le pick complet": "اشترك في Pro لعرض الاختيار كاملاً",
    "Inclut la cote optimale, le score de confiance, l'edge value et l'analyse IA experte.": "يشمل أفضل معامل ودرجة الثقة والأفضلية المقدّرة والتحليل المفصل.",
    "Pronostic principal": "التوقع الرئيسي",
    "Bookmakers utilisés :": "المراهنون المستخدمون:",
    "Partager": "مشاركة",
    "Comprendre ce pronostic": "فهم هذا التوقع",
    "Le moteur compare les marchés et les cotes disponibles pour classer les sélections. L’estimation affichée est un indicateur calculé ; elle ne garantit pas le résultat du match.": "يقارن المحرّك الأسواق والمعاملات لترتيب الاختيارات. التقدير مؤشر محسوب وليس ضماناً لنتيجة المباراة.",
    "Nombre de bookmakers annoncé pour cette analyse : {{v0}}. Cote de la sélection : {{v1}}.": "عدد المراهنين المُعلن: {{v0}}. معامل الاختيار: {{v1}}.",
    "Des statistiques externes sont disponibles pour compléter cette analyse. Leur détail figure plus bas.": "تتوفر أدناه إحصاءات خارجية لاستكمال هذا التحليل.",
    "Les informations disponibles ne permettent pas ici d’ajouter une analyse vérifiée de la forme des équipes ou des absences.": "لا تسمح البيانات المتاحة بإضافة تحليل موثّق للأداء أو الغيابات هنا.",
    "Tous les marchés analysés": "جميع الأسواق المُحلّلة",
    "· {{v0}} books": "· {{v0}} مراهنين",
    "· edge +{{v0}}%": "· أفضلية +{{v0}}٪",
    "Analyse détaillée": "تحليل مفصل",
    "Données du moteur": "بيانات المحرّك",
    "Aucune statistique externe vérifiée disponible pour ce match — le moteur s'appuie uniquement sur le consensus des cotes bookmakers, sans donnée inventée.": "لا توجد إحصاءات خارجية موثّقة لهذه المباراة. يعتمد المحرّك فقط على توافق المعاملات دون بيانات مختلقة.",
    "Explication complémentaire": "شرح إضافي",
    "Demande une présentation complémentaire des éléments disponibles. Selon la configuration du service, le texte peut être rédigé avec l’aide d’une IA ou par le moteur statistique.{{v0}}": "اطلب شرحاً للبيانات المتاحة. وفق الإعدادات، يُكتب النص بمساعدة الذكاء الاصطناعي أو بالمحرّك الإحصائي.{{v0}}",
    "Certaines analyses complémentaires sont réservées à Pro. {{v0}}.": "تتطلب بعض التحليلات الإضافية Pro. {{v0}}.",
    "Verdict": "الخلاصة",
    "Facteurs clés": "العوامل الرئيسية",
    "Alternative :": "البديل:",
    "Source : {{v0}}": "المصدر: {{v0}}",
    "Cotes par bookmaker": "المعاملات حسب المراهن",
    "Bookmaker": "المراهن",
    "Données réelles (football-data.org) — forme récente et historique des confrontations directes, disponibles pour les grandes compétitions européennes suivies.": "بيانات حقيقية من football-data.org: الأداء والمواجهات للبطولات الأوروبية الكبرى المشمولة.",
    "{{v0}} derniers matchs (réel)": "آخر {{v0}} مباريات (بيانات حقيقية)",
    "{{v0}} {{v1}} V": "{{v0}} {{v1}} فوز",
    "{{v0}} {{v1}} N": "{{v0}} {{v1}} تعادل",
    "{{v0}} {{v1}} D": "{{v0}} {{v1}} خسارة",
    "Forme récente non disponible": "الأداء الأخير غير متاح",
    "📅 Confrontations directes (historique réel)": "📅 المواجهات المباشرة (سجل حقيقي)",
    "Nuls": "التعادلات",
    "Bilan agrégé des confrontations directes récentes. Détail match par match non disponible sur la source actuelle.": "ملخص مجمّع للمواجهات الأخيرة. لا يوفّر المصدر تفاصيل كل مباراة.",
    "La sélection « {{v0}} » porte sur le total de buts ou de points pour les équipes et la période indiquées par le marché. Elle ne dépend pas uniquement du vainqueur de la rencontre.": "يتعلق «{{v0}}» بإجمالي الأهداف أو النقاط للفرق والفترة المحددة، وليس بالفائز وحده.",
    "La sélection prévoit la victoire de {{v0}}, selon la période et les règles du marché.": "يتوقع فوز {{v0}} وفق فترة السوق وقواعده.",
    "La sélection « {{v0}} » décrit l’événement attendu dans le marché indiqué. Vérifie la période et les règles de règlement du bookmaker.": "يصف «{{v0}}» الحدث المتوقع في السوق. تحقق من الفترة وقواعد التسوية لدى المراهن.",
    "Rédaction assistée par IA ({{v0}})": "صياغة بمساعدة الذكاء الاصطناعي ({{v0}})",
    "supérieur": "أكبر",
    "inférieur": "أقل",
    "l’équipe indiquée": "الفريق المحدد",
    "La sélection indique l’événement attendu. Vérifie le marché, la période du match et les règles de règlement avant de l’utiliser.": "راجع الحدث المتوقع والسوق والفترة وقواعد التسوية قبل استخدام الاختيار.",
    "Invalid value bets response": "استجابة فرص القيمة غير صالحة",
    "Écart non communiqué": "الفارق غير مُعلن",
    "Cela signale une opportunité possible si l’estimation est fiable.": "فرصة محتملة إذا كان التقدير موثوقاً.",
    "Ces chiffres ne montrent pas d’avantage positif à cette cote.": "لا تُظهر هذه الأرقام أفضلية إيجابية بهذا المعامل.",
    "Ta session a expiré. Reconnecte-toi pour consulter les sélections.": "انتهت الجلسة. سجّل الدخول لعرض الاختيارات.",
    "Les sélections ne peuvent pas être chargées pour le moment. Réessaie dans quelques instants.": "تعذّر تحميل الاختيارات. حاول مجدداً بعد قليل.",
    "Chargement des sélections": "جارٍ تحميل الاختيارات",
    "ne sont": "ليست",
    "Aucune sélection à venir disponible pour le moment.": "لا توجد اختيارات قادمة متاحة حالياً.",
    "Aucune sélection disponible pour cette date.": "لا توجد اختيارات لهذا التاريخ.",
    "Reviens plus tard ou actualise les données.": "عُد لاحقاً أو حدّث البيانات.",
    "Essaie toutes les dates à venir.": "جرّب جميع التواريخ القادمة.",
    "Date et heure à confirmer": "التاريخ والموعد قيد التأكيد",
    "Estimation WinPulse": "تقدير WinPulse",
    "Probabilité implicite de la cote": "الاحتمال الضمني للمعامل",
    "WinPulse affiche une estimation de {{v0}}. La cote de {{v1}} correspond à {{v2}} en probabilité implicite : l’écart est de {{v3}}. {{v4}}": "تقدّر WinPulse الاحتمال بـ{{v0}}. يشير المعامل {{v1}} ضمنياً إلى {{v2}}؛ الفارق {{v3}}. {{v4}}",
    "Il manque une cote ou une probabilité valide pour expliquer l’écart de cette sélection.": "لا يتوفر معامل أو احتمال صالح لشرح هذا الفارق.",
    "L’écart de probabilité n’est pas un pourcentage de gain. Les cotes évoluent et l’estimation peut être erronée. Pour un marché avec remboursement, la probabilité implicite ne décrit pas à elle seule toutes les issues de règlement.": "فارق الاحتمال ليس نسبة ربح. قد تتغير المعاملات وتخطئ التقديرات. في أسواق الاسترداد لا يصف الاحتمال الضمني وحده جميع حالات التسوية.",
    "Détecteur de value bets": "كاشف فرص القيمة",
    "Des opportunités à examiner": "فرص للمراجعة",
    "Retrouve la rencontre, son horaire, le marché conseillé et les chiffres qui expliquent chaque sélection.": "راجع المباراة وموعدها والسوق المقترح والأرقام وراء كل اختيار.",
    "Une {{v0}} est une sélection dont la probabilité estimée dépasse le seuil implicite de la cote. L’écart, appelé {{v1}}, est exprimé ici en {{v2}}. Il dépend de la fiabilité de l’estimation.": "يشير {{v0}} إلى احتمال مقدّر يتجاوز العتبة الضمنية للمعامل. يُعرض الفارق، أو {{v1}}، بوحدة {{v2}} ويعتمد على موثوقية التقدير.",
    "value bet": "رهان قيمة",
    "points de probabilité": "نقاط احتمالية",
    "Voir un exemple de calcul": "عرض مثال حسابي",
    "Exemple hypothétique, pour un pari sans remboursement : à cote 2,00, le seuil implicite est 50 %. Si la probabilité réelle était 60 %, l’écart serait de 10 points et le rendement moyen théorique serait de 20 % (0,60 × 2 − 1). Cela ne garantit aucun gain et suppose une estimation correcte.": "مثال افتراضي دون استرداد: المعامل ٢٫٠٠ يعني ضمنياً ٥٠٪. لو كان الاحتمال الفعلي ٦٠٪، لكان الفارق ١٠ نقاط والعائد النظري المتوسط ٢٠٪ (٠٫٦٠ × ٢ − ١). لا يضمن ربحاً ويفترض تقديراً صحيحاً.",
    "Les value bets sont réservés à Pro": "فرص القيمة مخصّصة لـPro",
    "Accède aux rencontres, dates, marchés et explications des sélections avec ton abonnement Pro.": "يشمل Pro المباريات والتواريخ والأسواق وشروح الاختيارات.",
    "Créer mon compte": "إنشاء حسابي",
    "Se reconnecter": "تسجيل الدخول مجدداً",
    "{{v0}} sélection{{v1}} affichée{{v2}}": "الاختيارات المعروضة: {{v0}}",
    "Horaires dans ton fuseau : {{v0}}.": "المواعيد وفق منطقتك الزمنية: {{v0}}.",
    "Toutes les dates à venir": "جميع التواريخ القادمة",
    "Tri{{v0}}": "الترتيب{{v0}}",
    "Écart estimé décroissant": "الفارق المقدّر تنازلياً",
    "Date et heure": "التاريخ والموعد",
    "{{v0}} sélection{{v1}} dont le match a déjà commencé {{v2}} plus proposée{{v3}} ici.": "اختيارات أُزيلت لبدء مبارياتها: {{v0}}.",
    "Voir toutes les dates": "عرض جميع التواريخ",
    "Les estimations ne garantissent aucun résultat. Vérifie les cotes et les règles du marché avant utilisation. 18+.": "التقديرات لا تضمن أي نتيجة. تحقق من المعاملات وقواعد السوق. +١٨.",
    "La sélection porte sur un total {{v0}} à {{v1}} pour les buts ou points et la période indiqués dans le marché. Le vainqueur peut être différent de l’équipe favorite.": "يتعلق الاختيار بإجمالي {{v0}} من {{v1}} للأهداف أو النقاط والفترة المحددة. قد لا يفوز الفريق المرشح.",
    "Le pronostic porte sur la victoire de {{v0}}, selon la période et les règles du marché.": "يتوقع فوز {{v0}} وفق فترة السوق وقواعده.",
    "{{v0}}{{v1}} points": "{{v0}}{{v1}} نقطة",
    "Foot US": "كرة القدم الأمريكية",
    "Autres": "أخرى",
    "Buts / points": "أهداف / نقاط",
    "Autres marchés": "أسواق أخرى",
    "Horaire non communiqué": "الموعد غير مُعلن",
    "International": "دولي",
    "Espagne": "إسبانيا",
    "Allemagne": "ألمانيا",
    "Italie": "إيطاليا",
    "Angleterre": "إنجلترا",
    "Pologne": "بولندا",
    "Finlande": "فنلندا",
    "Japon": "اليابان",
    "Chine": "الصين",
    "Portugal": "البرتغال",
    "Brésil": "البرازيل",
    "Argentine": "الأرجنتين",
    "Deux issues sont couvertes : celles indiquées dans la sélection, sur la période du marché.": "يغطي هذا الاختيار النتيجتين المحددتين خلال فترة السوق.",
    "Le marché porte sur le fait que les deux équipes marquent, ou non, pendant la période indiquée.": "يتعلق بما إذا كان كلا الفريقين سيسجل خلال الفترة المحددة.",
    "Le résultat est évalué après application du handicap affiché. La ligne et la période du marché déterminent son règlement.": "تُحسب النتيجة بعد تطبيق الهانديكاب والخط والفترة المحددة. راجع قواعد المراهن.",
    "Le pari porte sur le total indiqué. Vérifie les règles de la ligne et de la période choisies.": "يتعلق بالإجمالي المحدد. راجع الخط والفترة وقواعد تسوية الرهان.",
    "La sélection prévoit un match nul sur la période couverte.": "يتوقع الاختيار التعادل خلال الفترة المشمولة.",
    "Lis cette sélection avec son marché et sa période. La fiche du match présente les informations disponibles.": "اقرأ الاختيار مع سوقه وفترته. تعرض صفحة المباراة المعلومات المتاحة.",
    "Marché réservé": "سوق مخصّص للمشتركين",
    "Marché non communiqué": "السوق غير مُعلن",
    "Compétition non communiquée": "البطولة غير مُعلنة",
    "Rencontre commencée ou horaire à vérifier": "بدأت المباراة أو يحتاج الموعد للتحقق",
    "Sélection à vérifier : elle n’est plus proposée avec une cote disponible": "تحقق من الاختيار: لم يعد له معامل متاح",
    "heure locale du navigateur": "التوقيت المحلي للمتصفح",
    " · Marché estimé, cote à confirmer": " · سوق تقديري، تحقق من المعامل",
    "Confiance moyenne non disponible": "متوسط الثقة غير متاح",
    "Sélections et cotes à vérifier avant les rencontres.": "تحقق من الاختيارات والمعاملات قبل المباريات.",
    "Ticket enregistré": "قسيمة محفوظة",
    "Domicile": "المضيف",
    "Nul": "تعادل",
    "Extérieur": "الضيف",
    "Plus de 2,5 buts": "أكثر من ٢٫٥ هدف",
    "Plus de 1,5 but": "أكثر من ١٫٥ هدف",
    "Domicile : aucun but encaissé": "المضيف دون أهداف مستقبلة",
    "Extérieur : aucun but encaissé": "الضيف دون أهداف مستقبلة",
    "Ta session a expiré. Reconnecte-toi.": "انتهت الجلسة. سجّل الدخول مجدداً.",
    "Cette fonction est réservée aux abonnés. Vérifie ton accès.": "متاح للمشتركين فقط. تحقق من صلاحية وصولك.",
    "Les actualisations sont temporairement limitées. Réessaie dans quelques instants.": "التحديثات محدودة مؤقتاً. حاول مجدداً بعد قليل.",
    "Le serveur met trop de temps à répondre. Réessaie.": "تأخّر الخادم في الرد. حاول مجدداً.",
    "Impossible de charger les tickets enregistrés.": "تعذّر تحميل القسائم المحفوظة.",
    "Ton accès n’a pas pu être actualisé. L’enregistrement sera disponible après vérification.": "تعذّر تحديث وصولك. سيتاح الحفظ بعد التحقق.",
    "Impossible d’actualiser les rencontres. La dernière liste chargée reste disponible.": "تعذّر تحديث المباريات. تبقى آخر قائمة محمّلة معروضة.",
    "Cette sélection n’est pas disponible avec une cote et un horaire utilisables. Actualise le catalogue.": "لا يتوفر معامل أو موعد صالح لهذا الاختيار. حدّث القائمة.",
    "Actualise le catalogue pour vérifier ton accès aux repères.": "حدّث القائمة للتحقق من وصولك إلى مؤشرات السوق.",
    "Les repères de marché ne sont pas disponibles. Réessaie.": "مؤشرات السوق غير متاحة. حاول مجدداً.",
    "Actualise le catalogue pour vérifier ton accès à l’enregistrement.": "حدّث القائمة للتحقق من صلاحية الحفظ.",
    "Actualise les rencontres et vérifie les sélections signalées avant d’enregistrer.": "حدّث المباريات وراجع الاختيارات المُعلّمة قبل الحفظ.",
    "Ce ticket est déjà enregistré.": "هذه القسيمة محفوظة بالفعل.",
    "Ticket enregistré dans tes combinés.": "حُفظت القسيمة ضمن رهاناتك المركبة.",
    "L’enregistrement n’a pas été confirmé. Vérifie la liste des tickets avant de réessayer.": "لم يُؤكَّد الحفظ. راجع قسائمك قبل إعادة المحاولة.",
    "Ticket copié.": "نُسخت القسيمة.",
    "Sélectionne le texte ci-dessous pour le copier.": "حدد النص أدناه لنسخه.",
    "Ce ticket est long. Copie le texte ci-dessous pour le partager sans couper les sélections.": "القسيمة طويلة. انسخ النص أدناه لمشاركة جميع الاختيارات.",
    "Ticket supprimé.": "حُذفت القسيمة.",
    "La suppression n’a pas été confirmée. Actualise la liste.": "لم يُؤكَّد الحذف. حدّث القائمة.",
    "Rechercher et filtrer les rencontres": "البحث عن المباريات وتصفيتها",
    "Équipe, championnat ou pays…": "فريق أو بطولة أو بلد…",
    "Choisir un sport": "اختر رياضة",
    "Chargement du programme…": "جارٍ تحميل البرنامج…",
    "Aucune rencontre pour ces filtres": "لا توجد مباريات لهذه الفلاتر",
    "Aucune rencontre disponible actuellement": "لا توجد مباريات متاحة حالياً",
    "Essaie une autre équipe ou élargis les filtres.": "جرّب فريقاً آخر أو وسّع نطاق الفلاتر.",
    "Actualise plus tard pour retrouver les prochains marchés proposés.": "عُد لاحقاً لعرض الأسواق القادمة.",
    "Ton ticket et tes sauvegardes": "قسيمتك ومحفوظاتك",
    "Une sélection par rencontre": "اختيار واحد لكل مباراة",
    "Replier le ticket": "طيّ القسيمة",
    "Ouvrir mon ticket": "فتح قسيمتي",
    "Non disponible": "غير متاح",
    "Mon combiné du week-end": "رهاني المركب لعطلة الأسبوع",
    "Enregistrer le ticket": "حفظ القسيمة",
    "Actualiser les tickets enregistrés": "تحديث القسائم المحفوظة",
    "Équipe à confirmer": "الفريق قيد التأكيد",
    "Sélection non communiquée": "الاختيار غير مُعلن",
    "Prudent": "حذر",
    "Modéré": "متوسط",
    "Risqué": "مرتفع المخاطر",
    "Replier": "طيّ",
    "Voir les marchés": "عرض الأسواق",
    "non fournie": "غير متاح",
    "Retirer": "إزالة",
    "Ajouter": "إضافة",
    "Des marchés de cette rencontre sont réservés aux abonnés.": "بعض أسواق هذه المباراة مخصّصة للمشتركين.",
    "Aucune option avec une cote et un horaire disponibles.": "لا توجد خيارات بمعامل وموعد صالحين.",
    "Sélection réservée": "اختيار مخصّص للمشتركين",
    "Réservée": "محجوز",
    "Ton combiné.{{v0}}{{v1}}": "رهانك المركب.{{v0}}{{v1}}",
    "Tes choix.": "اختياراتك.",
    "Explore les rencontres, compare les marchés et réunis tes sélections dans un ticket qui se lit en un coup d’œil.": "استكشف المباريات وقارن الأسواق وأنشئ قسيمة واضحة.",
    "Horaires : {{v0}}{{v1}}": "المواعيد: {{v0}}{{v1}}",
    "rencontres au catalogue": "مباريات في القائمة",
    "options sélectionnables": "خيارات قابلة للاختيار",
    "Reconnecte-toi pour continuer": "سجّل الدخول مجدداً للمتابعة",
    "Ta session a expiré. Les sélections de la session précédente ont été retirées.": "انتهت الجلسة. أُزيلت اختيارات الجلسة السابقة.",
    "Quelle rencontre cherches-tu ?": "عن أي مباراة تبحث؟",
    "Date{{v0}}": "التاريخ{{v0}}",
    "Toutes les dates": "جميع التواريخ",
    "Demain": "غداً",
    "Classer par{{v0}}": "الترتيب حسب{{v0}}",
    "Horaire": "الموعد",
    "01 · Compose ton ticket": "٠١ · أنشئ قسيمتك",
    "Les rencontres à explorer": "مباريات للاستكشاف",
    "{{v0}} sélection{{v1}}{{v2}}": "الاختيارات: {{v0}}{{v2}}",
    "Voir le ticket": "عرض القسيمة",
    "Le catalogue n’a pas été vérifié depuis plus de cinq minutes. Actualise avant d’ajouter ou de partager une sélection.": "مرّ أكثر من خمس دقائق على تحديث القائمة. حدّثها قبل إضافة اختيار أو مشاركته.",
    "Certaines données incomplètes n’ont pas pu être affichées.": "تعذّر عرض بعض البيانات غير المكتملة.",
    "Chargement des rencontres": "جارٍ تحميل المباريات",
    "Les options disponibles apparaîtront ici.": "ستظهر الخيارات المتاحة هنا.",
    "{{v0}} sur {{v1}} rencontres affichées": "المباريات المعروضة: {{v0}} من {{v1}}",
    "Afficher les rencontres suivantes": "عرض المزيد من المباريات",
    "02 · Ton ticket": "٠٢ · قسيمتك",
    "Mon combiné": "رهاني المركب",
    "Ton ticket commence ici": "قسيمتك تبدأ هنا",
    "Ajoute une option sur une rencontre. Tu peux remplacer ton choix sans ajouter deux paris sur le même match.": "أضف اختياراً لكل مباراة. يمكنك استبداله دون تكرار المباراة في القسيمة.",
    "Cote cumulée": "المعامل المركب",
    "Produit des cotes des sélections du ticket.": "حاصل ضرب معاملات الاختيارات.",
    "Confiance moyenne du moteur": "متوسط ثقة المحرّك",
    "Sports représentés": "الرياضات الممثلة",
    "La confiance moyenne ne représente pas la probabilité que le combiné passe.": "متوسط الثقة لا يمثّل احتمال نجاح الرهان المركب كاملاً.",
    "contre": "ضد",
    "{{v0}} · Cote {{v1}}": "{{v0}} · المعامل {{v1}}",
    "Marché estimé · cote à confirmer": "سوق تقديري · تحقق من المعامل",
    "Cote actualisée : {{v0}} → {{v1}}": "المعامل المُحدّث: {{v0}} → {{v1}}",
    "Vider le ticket": "إفراغ القسيمة",
    "Nom du ticket {{v0}}{{v1}}": "اسم القسيمة {{v0}}{{v1}}",
    "(facultatif)": "(اختياري)",
    "Actualise le catalogue et retire ou remplace les sélections signalées pour enregistrer ou partager le ticket.": "حدّث البيانات واستبدل الاختيارات المُعلّمة أو أزلها قبل الحفظ أو المشاركة.",
    "Enregistrer avec Pro": "الحفظ مع Pro",
    "Vérifier mon accès": "التحقق من وصولي",
    "Copier": "نسخ",
    "Les options avec un cadenas demandent un abonnement. L’enregistrement des tickets est réservé aux abonnés.": "تتطلب الأسواق المقفلة وحفظ القسائم اشتراكاً.",
    "Voir les formules": "عرض الباقات",
    "Texte du ticket": "نص القسيمة",
    "Mes tickets enregistrés": "قسائمي المحفوظة",
    "Historique de tes tickets": "سجل قسائمك",
    "Ton accès est en cours de vérification.": "جارٍ التحقق من وصولك.",
    "Retrouve tes tickets enregistrés avec un abonnement.": "يمكنك الوصول إلى قسائمك المحفوظة بالاشتراك.",
    "Chargement des sauvegardes…": "جارٍ تحميل القسائم المحفوظة…",
    "Aucun ticket enregistré pour le moment.": "لا توجد قسائم محفوظة بعد.",
    "Cote {{v0}} · {{v1}} sélection{{v2}}": "المعامل {{v0}} · الاختيارات: {{v1}}",
    "{{v0}} contre {{v1}}": "{{v0}} ضد {{v1}}",
    "Le détail de ce ticket n’est pas disponible.": "تفاصيل القسيمة غير متاحة.",
    "Ticket archivé : les horaires et cotes ne sont pas actualisés ici.": "قسيمة مؤرشفة: لا تُحدّث المواعيد والمعاملات هنا.",
    "{{v0}} option{{v1}} sélectionnable{{v2}} · {{v3}} proposée{{v4}}": "الخيارات المتاحة: {{v0}} · المعروضة: {{v3}}",
    "Choix proposé · {{v0}}": "اختيار مقترح · {{v0}}",
    "Une autre option de cette rencontre est dans ton ticket.": "يوجد اختيار آخر لهذه المباراة في قسيمتك.",
    "Un seul choix par rencontre : ajouter une autre option remplace la précédente.": "اختيار واحد لكل مباراة: إضافة خيار آخر تستبدل السابق.",
    "Comprendre ce marché": "فهم هذا السوق",
    "Afficher plus de marchés ({{v0}})": "عرض أسواق إضافية ({{v0}})",
    "Débloquer les marchés réservés": "فتح الأسواق المحجوزة",
    "Repères de marché": "مؤشرات السوق",
    "Les repères supplémentaires demandent un accès abonné vérifié. {{v0}}": "تتطلب المؤشرات الإضافية وصول مشترك مُتحققاً منه. {{v0}}",
    "Chargement des repères…": "جارٍ تحميل المؤشرات…",
    "Estimations de marché disponibles pour cette rencontre. Les données insuffisantes ne sont pas affichées.": "تقديرات السوق لهذه المباراة. لا تُعرض البيانات غير الكافية.",
    "Les repères ne sont pas renseignés pour cette rencontre.": "لم تُقدّم مؤشرات لهذه المباراة.",
    "Ouvrir la fiche de la rencontre": "فتح تفاصيل المباراة",
    "Le total doit rester inférieur à {{v0}} sur la période couverte.": "يجب أن يبقى الإجمالي أقل من {{v0}} خلال الفترة المشمولة.",
    "Le total doit dépasser {{v0}} sur la période couverte.": "يجب أن يتجاوز الإجمالي {{v0}} خلال الفترة المشمولة.",
    "Le moteur retient {{v0}} comme vainqueur sur la période couverte.": "يختار المحرّك فوز {{v0}} خلال الفترة المشمولة.",
    "Horaires : {{v0}}": "المواعيد: {{v0}}",
    "{{v0}}. {{v1}} vs {{v2}}\n{{v3}}{{v4}}\n{{v5}}\n{{v6}} : {{v7}}\nCote : {{v8}}{{v9}}": "{{v0}}. {{v1}} ضد {{v2}}\n{{v3}}{{v4}}\n{{v5}}\n{{v6}} : {{v7}}\nالمعامل: {{v8}}{{v9}}",
    "Cote cumulée : {{v0}}": "المعامل المركب: {{v0}}",
    "Confiance moyenne du moteur : {{v0}} % (indicateur, pas un taux de réussite)": "متوسط ثقة المحرّك: {{v0}}٪ (مؤشر وليس نسبة نجاح مُقاسة)",
    " · Chargé à {{v0}}": " · تم التحميل في {{v0}}",
    "{{v0}} rencontre{{v1}} correspond{{v2}} à tes filtres": "المباريات المطابقة للفلاتر: {{v0}}",
    "{{v0}} sélection{{v1}} · Cote {{v2}}": "الاختيارات: {{v0}} · المعامل {{v2}}",
    "Retirer {{v0}} contre {{v1}}": "إزالة {{v0}} ضد {{v1}}",
    "Supprimer le ticket {{v0}}": "حذف القسيمة {{v0}}",
    "Filtrer les marchés de {{v0}}": "تصفية أسواق {{v0}}",
    "Sécurité": "حذر",
    "Le profil prudent, à examiner sélection par sélection.": "ملف حذر يُراجع اختياراً باختيار.",
    "Équilibre": "متوازن",
    "Un profil intermédiaire pour comparer les cotes et la confiance.": "ملف متوسط لمقارنة المعاملات والثقة.",
    "Le profil offensif : une cote élevée implique davantage d’incertitude.": "ملف هجومي: المعامل المرتفع يعني قدراً أكبر من عدم اليقين.",
    "Cote totale non communiquée": "المعامل الإجمالي غير مُعلن",
    "Les données reçues sont incomplètes. Réessaie pour obtenir une sélection valide.": "البيانات غير مكتملة. حاول مجدداً للحصول على اختيار صالح.",
    "Impossible d’actualiser les combinés pour le moment. Réessaie dans quelques instants.": "تعذّر تحديث الرهانات المركبة. حاول مجدداً بعد قليل.",
    "Le choix porte sur une victoire. En cas de nul sur la période couverte, le règlement de ce marché prévoit le remboursement.": "يجب أن يفوز الفريق المحدد. يُرد المبلغ عند التعادل خلال الفترة المشمولة وفق قواعد السوق.",
    "Rencontre terminée · actualise le combiné": "انتهت المباراة · حدّث الرهان المركب",
    "Rencontre commencée · actualise le combiné": "بدأت المباراة · حدّث الرهان المركب",
    "Équipe non communiquée": "الفريق غير مُعلن",
    "Pronostic sélectionné": "التوقع المحدد",
    "Non communiquée": "غير مُعلنة",
    "Aucun score de confiance n’a été communiqué pour cette sélection.": "لم تُقدّم درجة ثقة لهذا الاختيار.",
    "heure locale": "التوقيت المحلي",
    "Combiné copié.": "نُسخ الرهان المركب.",
    "La copie automatique est indisponible. Sélectionne le texte ci-dessous.": "النسخ التلقائي غير متاح. حدد النص أدناه.",
    "Dernier chargement": "آخر تحميل",
    "Actualisé": "مُحدّث",
    "Choisis un profil pour explorer ses sélections": "اختر ملفاً لاستكشاف اختياراته",
    "Actualiser les combinés": "تحديث الرهانات المركبة",
    "Profil à découvrir": "ملف للاستكشاف",
    "Cote non fournie": "المعامل غير مُعلن",
    "Accès Pro": "وصول Pro",
    "Sélections": "الاختيارات",
    "Cote totale": "المعامل الإجمالي",
    "Confiance moyenne": "متوسط الثقة",
    "Probabilité combinée estimée": "الاحتمال المركب المقدّر",
    "Chargement des combinés": "جارٍ تحميل الرهانات المركبة",
    "Une rencontre a déjà commencé ou s’est terminée. Actualise pour vérifier les sélections disponibles.": "بدأت مباراة أو انتهت. حدّث للتحقق من الاختيارات المتاحة.",
    "Cette sélection n’a pas été actualisée depuis plus de cinq minutes. Actualise avant de la copier.": "مرّ أكثر من خمس دقائق على هذه الاختيارات. حدّثها قبل النسخ.",
    "Le programme du combiné": "برنامج الرهان المركب",
    "Les sélections, une par une": "الاختيارات، واحداً تلو الآخر",
    "Présentation des rencontres": "عرض المباريات",
    "Récapitulatif du combiné": "ملخص الرهان المركب",
    "Disponible avec les sélections complètes.": "متاح مع الاختيارات الكاملة.",
    "Actualise le combiné avant de copier ses sélections.": "حدّث الرهان المركب قبل نسخ اختياراته.",
    "La copie est disponible avec au moins deux sélections complètes, dont les horaires sont à venir.": "يتطلب النسخ اختيارين كاملين على الأقل لمباريات لم تبدأ.",
    "Fermer le texte à copier": "إغلاق النص المراد نسخه",
    "À confirmer": "قيد التأكيد",
    "Ce que signifie ce pronostic": "ماذا يعني هذا التوقع",
    "Consulter la rencontre": "عرض المباراة",
    "Le pronostic est réservé aux abonnés": "التوقع مخصّص للمشتركين",
    "Débloque la sélection, son marché et sa cote.": "افتح الاختيار وسوقه ومعامله.",
    "Voir les abonnements": "عرض الاشتراكات",
    "Lis le match.{{v0}}{{v1}}": "افهم المباراة.{{v0}}{{v1}}",
    "Choisis ton combiné.": "اختر رهانك المركب.",
    "Trois profils. Chaque rencontre expliquée. Toutes les sélections réunies dans un ticket clair.": "ثلاثة ملفات، ومباريات مشروحة، وجميع الاختيارات في قسيمة واضحة.",
    "{{v0}} à {{v1}}": "{{v0}} في {{v1}}",
    "Profil sélectionné": "الملف المحدد",
    "01 · Choisis ton profil": "٠١ · اختر ملفك",
    "Quel combiné veux-tu explorer ?": "أي رهان مركب تريد استكشافه؟",
    "Comparer les trois profils": "مقارنة الملفات الثلاثة",
    "Explorer ce profil": "استكشاف هذا الملف",
    "Les indicateurs proviennent du moteur. La confiance moyenne et la probabilité combinée décrivent deux choses différentes.": "هذه مؤشرات للمحرّك. يصف متوسط الثقة والاحتمال المركب أمرين مختلفين.",
    "La dernière sélection chargée reste affichée.": "تبقى آخر اختيارات محمّلة معروضة.",
    "Préparation des sélections": "جارٍ تجهيز الاختيارات",
    "Vérification de ton accès et chargement des rencontres…": "جارٍ التحقق من الوصول وتحميل المباريات…",
    "Ta session doit être renouvelée": "يجب تجديد جلستك",
    "Reconnecte-toi pour retrouver l’accès correspondant à ton compte.": "سجّل الدخول مجدداً لاستعادة وصول حسابك.",
    "Les sélections complètes": "الاختيارات الكاملة",
    "Explore les trois profils avec Pro.": "استكشف الملفات الثلاثة مع Pro.",
    "Ton accès actuel ne permet pas de consulter ces combinés. Retrouve les rencontres, les marchés et les cotes en découvrant les abonnements disponibles.": "لا يشمل وصولك هذه الرهانات المركبة. راجع الاشتراكات لعرض المباريات والأسواق والمعاملات.",
    "Découvrir les abonnements": "استكشاف الاشتراكات",
    "Les combinés n’ont pas pu être chargés": "تعذّر تحميل الرهانات المركبة",
    "Utilise le bouton Réessayer ci-dessus pour relancer la vérification.": "اضغط إعادة المحاولة أعلاه للتحقق مجدداً.",
    "Un combiné gratuit à découvrir": "استكشف رهاناً مركباً مجانياً",
    "Le profil {{v0}} est accessible avec ton compte.": "الملف {{v0}} متاح لحسابك.",
    "Voir le combiné": "عرض الرهان المركب",
    "Aucune sélection pour ce profil": "لا توجد اختيارات لهذا الملف",
    "Le moteur n’a pas fourni de combiné {{v0}} pour le moment. Consulte un autre profil ou actualise plus tard.": "لا يتوفر رهان مركب {{v0}} حالياً. اختر ملفاً آخر أو حدّث لاحقاً.",
    "02 · Parcours les rencontres": "٠٢ · تصفّح المباريات",
    "{{v0}} sélection{{v1}} · Profil {{v2}}": "الاختيارات: {{v0}} · الملف {{v2}}",
    "Première rencontre : {{v0}}": "المباراة الأولى: {{v0}}",
    "Fiches": "البطاقات",
    "Horaires": "المواعيد",
    "Cote totale du moteur{{v0}}": "المعامل الإجمالي للمحرّك{{v0}}",
    "03 · Ton ticket": "٠٣ · قسيمتك",
    "Combiné {{v0}}": "الرهان المركب {{v0}}",
    "{{v0}} sélection{{v1}} réunies": "الاختيارات المجمعة: {{v0}}",
    "Cote totale du moteur": "المعامل الإجمالي للمحرّك",
    "Copier le ticket": "نسخ القسيمة",
    "Débloquer le combiné": "فتح الرهان المركب",
    "Appuie dans le texte pour le sélectionner.": "اضغط النص لتحديده.",
    "Bien lire le combiné": "فهم الرهان المركب",
    "La confiance moyenne décrit les sélections individuellement. Elle ne correspond pas à la probabilité que tout le combiné passe.": "يصف متوسط الثقة الاختيارات منفردة، وليس احتمال نجاح الرهان المركب كاملاً.",
    "La probabilité combinée est une estimation du moteur, liée à ses hypothèses sur les matchs. Elle ne constitue pas un taux de réussite mesuré.": "الاحتمال المركب تقدير يعتمد على فرضيات المحرّك، وليس نسبة نجاح مُقاسة.",
    "Un combiné dépend de chacune de ses sélections. Le profil « Sécurité » reste soumis à cette incertitude.": "كل اختيار يؤثر في النتيجة. حتى الملف الحذر يبقى خاضعاً لعدم اليقين.",
    "Vérification des sélections et de ton accès…": "جارٍ التحقق من الاختيارات والوصول…",
    "WNPulse · Combiné {{v0}}": "WNPulse · الرهان المركب {{v0}}",
    "{{v0}}. {{v1}} vs {{v2}}": "{{v0}}. {{v1}} ضد {{v2}}",
    "Cote : {{v0}}": "المعامل: {{v0}}",
    "Cote totale du moteur : {{v0}}": "المعامل الإجمالي للمحرّك: {{v0}}",
    "{{v0}} sélection{{v1}} dans ce ticket": "اختيارات هذه القسيمة: {{v0}}",
    "{{v0}} sélection{{v1}}": "الاختيارات: {{v0}}",
    "{{v0}} / mois": "{{v0}} / شهر",
    "{{v0}} remboursés": "{{v0}} مُعادة",
    "🎯 *Pick WinPulse*\n{{v0}} · {{v1}}\n\n*{{v2}}* vs *{{v3}}*\n👉 {{v4}} @ *{{v5}}*\nConfiance IA : {{v6}}%\nMarché : {{v7}}\n\nhttps://wnpulse.com": "🎯 *Pick WinPulse*\n{{v0}} · {{v1}}\n\n*{{v2}}* ضد *{{v3}}*\n👉 {{v4}} @ *{{v5}}*\nثقة المحرّك: {{v6}}٪\nالسوق: {{v7}}\n\nhttps://wnpulse.com",
    "Le texte libre fourni par le serveur reste affiché dans sa langue d’origine.": "يُعرض النص الحر الوارد من الخادم بلغته الأصلية.",
    "/mois": "/شهر",
    "Le service de scores n’est pas configuré. Contactez l’équipe WinPulse.": "خدمة النتائج غير مُعدّة. تواصل مع WinPulse.",
    "Le fournisseur refuse l’accès aux scores. L’équipe WinPulse doit vérifier sa configuration.": "رفض مزوّد النتائج الوصول. يجب على WinPulse مراجعة الإعدادات.",
    "Le quota du fournisseur de scores est épuisé. L’équipe WinPulse doit rétablir le service.": "نفدت حصة مزوّد النتائج. يجب على WinPulse استعادة الخدمة.",
    "Le fournisseur limite les demandes. Une nouvelle tentative sera effectuée automatiquement.": "يحدّ المزوّد من الطلبات. ستتم إعادة المحاولة تلقائياً.",
    "Le fournisseur de scores met trop de temps à répondre. Nouvelle tentative automatique à venir.": "تأخّر مزوّد النتائج في الرد. ستتم إعادة المحاولة تلقائياً.",
    "Le service de scores est temporairement indisponible. Nouvelle tentative automatique à venir.": "النتائج غير متاحة مؤقتاً. ستتم إعادة المحاولة تلقائياً.",
    "Les scores de ces compétitions ne sont pas disponibles auprès du fournisseur.": "لا يوفّر المزوّد نتائج هذه البطولات.",
    "Votre session a expiré ou l’accès est refusé. Reconnectez-vous pour réessayer.": "انتهت الجلسة أو رُفض الوصول. سجّل الدخول مجدداً.",
    "Le service de scores n’est pas disponible sur cette version du serveur.": "لا توفّر هذه النسخة من الخادم خدمة النتائج.",
    "Le serveur met trop de temps à répondre. Nouvelle tentative automatique à venir.": "تأخّر الخادم في الرد. ستتم إعادة المحاولة تلقائياً.",
    "Les scores ne peuvent pas être actualisés pour le moment. Nouvelle tentative automatique à venir.": "يتعذّر تحديث النتائج الآن. ستتم إعادة المحاولة تلقائياً.",
    "La préparation des scores prend plus de temps que prévu. Une nouvelle tentative sera effectuée automatiquement.": "يستغرق تجهيز النتائج وقتاً أطول من المتوقع. ستتم إعادة المحاولة تلقائياً.",
    "Réponse des scores invalide": "استجابة نتائج غير صالحة",
    "Certaines compétitions ne sont pas disponibles. Les scores reçus restent affichés.": "بعض البطولات غير متاحة. تبقى النتائج المستلمة معروضة.",
    "Les derniers scores sont trop anciens. Actualisez pour les recharger.": "هذه النتائج قديمة. حدّث الصفحة لإعادة تحميلها.",
    "Derniers scores connus": "آخر النتائج المعروفة",
    "Aucun match en direct actuellement.": "لا توجد مباريات مباشرة حالياً.",
    "Aucun match terminé récemment.": "لا توجد مباريات انتهت مؤخراً.",
    "Aucun match à venir dans les prochaines heures.": "لا توجد مباريات مقررة خلال الساعات القادمة.",
    "Équipe domicile": "الفريق المضيف",
    "Équipe extérieure": "الفريق الضيف",
    "Compétition": "البطولة",
    "Dernier score": "آخر نتيجة",
    "À venir": "القادمة",
    "flex items-center justify-between": "flex items-center justify-between",
    "Rugby": "الرغبي",
    "Autres sports": "رياضات أخرى",
    "Tous les pays": "جميع البلدان",
    "Bénin": "بنين",
    "Côte d’Ivoire": "ساحل العاج",
    "Sénégal": "السنغال",
    "Cameroun": "الكاميرون",
    "Mali": "مالي",
    "France": "فرنسا",
    "Belgique": "بلجيكا",
    "Luxembourg": "لوكسمبورغ",
    "Suisse": "سويسرا",
    "Canada": "كندا",
    "Maroc": "المغرب",
    "Nigeria": "نيجيريا",
    "Afrique du Sud": "جنوب أفريقيا",
    "Réponse vidéo invalide": "استجابة فيديو غير صالحة",
    "Horaire à confirmer": "الموعد قيد التأكيد",
    "Le programme vidéo ne peut pas être actualisé pour le moment. Les scores restent accessibles.": "يتعذّر تحديث برنامج البث. تبقى النتائج متاحة.",
    "L’actualisation des diffusions est temporairement limitée. Une nouvelle tentative est prévue.": "تحديثات البث محدودة مؤقتاً. جرى تحديد محاولة جديدة.",
    "Le programme vidéo est temporairement indisponible. Les scores restent accessibles.": "برنامج البث غير متاح مؤقتاً. تبقى النتائج متاحة.",
    "La recherche de nouveaux directs reprendra automatiquement. Les diffusions déjà connues continuent d’être vérifiées.": "سيُستأنف البحث تلقائياً. يستمر التحقق من البث المعروف.",
    "Les diffusions ne peuvent pas être actualisées pour le moment. Les scores restent accessibles.": "يتعذّر تحديث البث الآن. تبقى النتائج متاحة.",
    "Lecteur indisponible": "المشغّل غير متاح",
    "Le lecteur met trop de temps à répondre": "تأخّر المشغّل في الرد",
    "Chargement du lecteur impossible": "تعذّر تحميل المشغّل",
    "Le lecteur ne répond pas. Tu peux consulter la diffusion sur YouTube.": "المشغّل لا يستجيب. جرّب البث على YouTube.",
    "Cette vidéo n’est pas disponible dans ce lecteur, selon les conditions du diffuseur ou ton pays.": "لا يمكن تشغيل هذا الفيديو هنا بسبب شروط الناشر أو بلدك.",
    "Le lecteur n’a pas pu démarrer. Tu peux essayer directement sur YouTube.": "تعذّر بدء التشغيل. جرّب مباشرة على YouTube.",
    "Cette diffusion est terminée.": "انتهى هذا البث.",
    "Appuie sur le bouton Lecture du lecteur pour démarrer la vidéo.": "اضغط زر التشغيل داخل المشغّل لبدء الفيديو.",
    "Le lecteur ne peut pas être chargé. Tu peux consulter la diffusion sur YouTube.": "تعذّر تحميل المشغّل. افتح البث على YouTube.",
    "Dernier score connu": "آخر نتيجة معروفة",
    "Rencontre terminée": "انتهت المباراة",
    "Score suivi": "النتيجة المُتابَعة",
    "Rencontre à venir": "مباراة قادمة",
    "La rubrique vidéo est en préparation. Les scores restent accessibles.": "قسم الفيديو قيد التجهيز. تبقى النتائج متاحة.",
    "La collecte suit son calendrier. Le programme s’actualisera automatiquement.": "تتبع عملية الجمع جدولها. سيُحدّث البرنامج تلقائياً.",
    "Ajoute YOUTUBE_API_KEY dans les variables du backend et active YouTube Data API v3 dans le projet Google.": "أضف YOUTUBE_API_KEY إلى الخادم وفعّل YouTube Data API v3 في Google.",
    "Impossible de demander l’actualisation des diffusions.": "تعذّر طلب تحديث البث.",
    "La recherche automatique nécessite YOUTUBE_API_KEY dans le backend. Les chaînes FIFA et FIBA sont sélectionnées par défaut.": "يتطلب البحث التلقائي YOUTUBE_API_KEY على الخادم. قناتا FIFA وFIBA محددتان افتراضياً.",
    "Fermer le lecteur": "إغلاق المشغّل",
    "Le score sélectionné s’affichera ici.": "ستظهر النتيجة المحددة هنا.",
    "Les scores disponibles apparaîtront dans cette liste dès leur chargement.": "ستظهر النتائج المتاحة في هذه القائمة بعد تحميلها.",
    "Équipe, rencontre ou diffuseur…": "فريق أو مباراة أو ناشر…",
    "Filtrer les diffusions par sport": "تصفية البث حسب الرياضة",
    "Tous les sports": "جميع الرياضات",
    "Diffusion en cours selon le diffuseur": "مباشر بحسب الناشر",
    "Regarder le direct": "مشاهدة البث المباشر",
    "Ouvrir le programme": "فتح البرنامج",
    "Les diffusions vidéo sont en préparation": "البث المرئي قيد التجهيز",
    "Aucune diffusion ne correspond à ces filtres": "لا يوجد بث مطابق لهذه الفلاتر",
    "Aucune diffusion intégrable disponible actuellement": "لا يوجد بث قابل للتضمين حالياً",
    "Le programme est en cours de préparation. Il s’actualisera automatiquement.": "البرنامج قيد التجهيز وسيُحدّث تلقائياً.",
    "Retrouve les scores ci-dessous et reviens consulter les prochaines diffusions proposées.": "تابع النتائج أدناه وعُد للاطّلاع على البث القادم.",
    "Live & Scores": "البث والنتائج",
    "Suivi en temps réel des matchs en cours et des résultats récents. Actualisation automatique toutes les 45 secondes.": "تابع المباريات المباشرة والنتائج الأخيرة. تحديث تلقائي كل ٤٥ ثانية.",
    "Scores du {{v0}}": "النتائج بتاريخ {{v0}}",
    "Le fournisseur prépare les scores. La page se mettra à jour automatiquement.": "يجهّز المزوّد النتائج. ستُحدّث الصفحة تلقائياً.",
    "Les scores sont temporairement indisponibles.": "النتائج غير متاحة مؤقتاً.",
    "Terminés{{v0}}": "المنتهية{{v0}}",
    "À venir{{v0}}": "القادمة{{v0}}",
    "Actualisé à {{v0}}": "آخر تحديث في {{v0}}",
    "Ouverture du lecteur…": "جارٍ فتح المشغّل…",
    "Lecture via YouTube · {{v0}}": "التشغيل عبر YouTube · {{v0}}",
    "Consulter sur YouTube": "فتح على YouTube",
    "Les scores se mettent à jour indépendamment de la vidéo.": "تُحدّث النتائج بصورة مستقلة عن الفيديو.",
    "À regarder sur WinPulse": "شاهد على WinPulse",
    "Le match, sur ton écran.": "المباراة على شاشتك.",
    "Retrouve les directs intégrables des diffuseurs sélectionnés et suis les scores sur la même page.": "شاهد البث القابل للتضمين من ناشرين مختارين وتابع النتائج هنا.",
    "Actualiser les diffusions": "تحديث البث",
    "Configuration vidéo · Administrateur": "إعدادات الفيديو · المشرف",
    "La tâche vidéo n’est pas active. Vérifie les logs d’initialisation du backend.": "مهمة الفيديو غير نشطة. راجع سجلات بدء الخادم.",
    "État fournisseur : {{v0}}": "حالة المزوّد: {{v0}}",
    "Vérifier la collecte": "التحقق من الجمع",
    "Un score à suivre": "نتيجة للمتابعة",
    "Choisis la rencontre dont tu veux suivre le score pendant la vidéo.": "اختر المباراة التي تريد متابعة نتيجتها أثناء الفيديو.",
    "Rencontre à suivre": "المباراة المُتابَعة",
    "Choisir une rencontre": "اختر مباراة",
    "Chaîne du diffuseur": "قناة الناشر",
    "Rechercher une diffusion{{v0}}": "البحث عن بث{{v0}}",
    "Pays de visionnage{{v0}}": "بلد المشاهدة{{v0}}",
    "Chargement du programme vidéo…": "جارٍ تحميل برنامج البث…",
    "Voir sur YouTube": "المشاهدة على YouTube",
    "Afficher toutes les diffusions": "عرض جميع البثوث",
    "Les vidéos sont lues via YouTube. Leur disponibilité dépend du pays et des conditions du diffuseur. Les directs disponibles ne couvrent pas nécessairement toutes les rencontres du tableau des scores.": "تُشغّل الفيديوهات عبر YouTube. يعتمد توفّرها على البلد وشروط الناشر، وقد لا تغطي جميع مباريات جدول النتائج.",
    "{{v0}} recherches aujourd’hui · Sources : {{v1}} · Dernière vérification : {{v2}}.": "عمليات البحث اليوم: {{v0}} · المصادر: {{v1}} · آخر تحقق: {{v2}}.",
    "Résultat en attente": "النتيجة قيد الانتظار",
    "La sélection décrit l’événement attendu dans le marché indiqué. Consulte les règles de règlement du bookmaker.": "يصف الاختيار الحدث المتوقع في السوق. راجع قواعد التسوية لدى المراهن.",
    "Réponse Montante invalide": "استجابة السلسلة غير صالحة",
    "Ta session a expiré. Reconnecte-toi pour retrouver la montante.": "انتهت الجلسة. سجّل الدخول مجدداً لعرض السلسلة.",
    "Cette action est réservée à l’administrateur ou à ton niveau d’accès.": "يتطلب هذا الإجراء صلاحيات إدارية أو مستوى الوصول المناسب.",
    "Le chargement a pris trop de temps. Réessaie dans un instant.": "استغرق التحميل وقتاً طويلاً. حاول مجدداً بعد قليل.",
    "Le service Montante est temporairement indisponible. Réessaie dans un instant.": "السلسلة غير متاحة مؤقتاً. حاول مجدداً بعد قليل.",
    "Contrôle terminé. Les résultats finaux disponibles ont été pris en compte.": "اكتمل التحقق. أُخذت النتائج النهائية المتاحة في الحسبان.",
    "La série est lancée. La sélection attendra deux matchs admissibles.": "بدأت السلسلة. سيُنتظر توفر مباراتين مؤهلتين.",
    "Série terminée": "اكتملت السلسلة",
    "Série arrêtée": "توقفت السلسلة",
    "Sélections publiées": "نُشرت الاختيارات",
    "Recherche de deux matchs": "جارٍ البحث عن مباراتين",
    "Nouvelle série à venir": "سلسلة جديدة قادمة",
    "Étape": "المرحلة",
    "Étapes gagnées": "المراحل الناجحة",
    "Matchs publiés": "المباريات المنشورة",
    " Les dernières données chargées restent affichées.": " تبقى آخر بيانات محمّلة معروضة.",
    "Toutes les cotes comparées": "مقارنة جميع المعاملات",
    "Le classement n’ajoute aucun bonus aux petites cotes.": "لا يمنح الترتيب ميزة للمعاملات الصغيرة.",
    "Sources vérifiées": "مصادر مُتحقق منها",
    "Les nouvelles sélections exigent des cotes récentes et plusieurs sources complètes.": "تتطلب الاختيارات الجديدة معاملات حديثة ومصادر مكتملة متعددة.",
    "Le droit d’attendre": "الانتظار خيار متاح",
    "Si deux matchs ne passent pas les contrôles, aucune étape n’est publiée.": "لا تُنشر مرحلة دون اجتياز مباراتين للتحقق.",
    "Contrôle…": "جارٍ التحقق…",
    "Synchroniser les résultats": "مزامنة النتائج",
    "La prochaine série apparaîtra ici dès son lancement par l’administrateur.": "ستظهر السلسلة القادمة هنا عند بدء المشرف لها.",
    "Nouvelle montante à venir": "سلسلة جديدة قادمة",
    "Deux matchs suffisamment documentés ne sont pas encore disponibles.": "لا تتوفر مباراتان ببيانات كافية بعد.",
    "Le sélecteur attend deux matchs": "في انتظار مباراتين",
    "Estimation du marché vérifié": "تقدير السوق المُتحقق منه",
    "MONTANTE WNPULSE": "سلسلة WNPULSE",
    "2 matchs distincts par étape": "مباراتان مختلفتان لكل مرحلة",
    "Deux rencontres.{{v0}}{{v1}}": "مباراتان.{{v0}}{{v1}}",
    "Des choix expliqués.": "اختيارات مشروحة.",
    "Les sélections sont comparées selon les estimations et la qualité des données. Une petite cote ne suffit pas à faire un bon choix.": "تُقارن الاختيارات بحسب التقديرات وجودة البيانات. لا يكفي المعامل الصغير ليكون الاختيار جيداً.",
    "Pilotage administrateur": "تحكم المشرف",
    "Parcours {{v0}}": "المسار {{v0}}",
    "10 étapes": "١٠ مراحل",
    "15 étapes": "١٥ مرحلة",
    "Lancer une nouvelle série": "بدء سلسلة جديدة",
    "La série actuelle sera archivée sur le serveur et remplacée.": "ستُؤرشف السلسلة الحالية على الخادم وتُستبدل.",
    "{{v0}}Remplacer la série actuelle": "{{v0}}استبدال السلسلة الحالية",
    "Nouvelle série": "سلسلة جديدة",
    "Diagnostic de sélection": "تشخيص الاختيار",
    "{{v0}} matchs reçus · {{v1}} événements admissibles": "المباريات المستلمة: {{v0}} · الأحداث المؤهلة: {{v1}}",
    "Parcours de la série": "مسار السلسلة",
    "{{v0}} étape{{v1}} gagnée{{v2}} sur {{v3}}": "المراحل الناجحة: {{v0}} من {{v3}}",
    "Une étape annulée n’est pas une victoire. Les jours sans sélection ne font pas avancer le parcours.": "المرحلة الملغاة ليست نجاحاً. الأيام دون اختيارات لا تقدّم المسار.",
    "Sélections · Étape {{v0}}": "الاختيارات · المرحلة {{v0}}",
    "Cote combinée : {{v0}}": "المعامل المركب: {{v0}}",
    "Sélection publiée avant cette mise à jour : elle reste suivie jusqu’à son règlement. Les nouvelles étapes exigent deux matchs.": "يبقى الاختيار القديم متابَعاً حتى التسوية. تتطلب المراحل الجديدة مباراتين.",
    "Les mêmes sélections que les abonnés": "الاختيارات نفسها المتاحة للمشتركين",
    "Débloque les rencontres, les marchés et les raisons de chaque choix.": "افتح المباريات والأسواق وأسباب كل اختيار.",
    "Lire l’estimation de la paire": "فهم تقدير الزوج",
    "Approximation théorique : {{v0}}, sous hypothèse d’indépendance.": "تقريب نظري: {{v0}}، بافتراض الاستقلال.",
    "Ce chiffre multiplie deux estimations du moteur. Il ne constitue pas un taux de réussite constaté. Des événements distincts peuvent encore être corrélés.": "هذا حاصل ضرب تقديرين للمحرّك، لا نسبة نجاح مُقاسة. قد تبقى الأحداث المختلفة مترابطة.",
    "Historique de la série": "سجل السلسلة",
    "Les victoires, pertes et annulations restent visibles.": "تبقى النجاحات والخسائر والإلغاءات ظاهرة.",
    "Aucune étape réglée pour le moment.": "لم تُسوَّ أي مرحلة بعد.",
    "Étape {{v0}}": "المرحلة {{v0}}",
    "{{v0}}{{v1}}{{v2}} · cote {{v3}}": "{{v0}}{{v1}}{{v2}} · المعامل {{v3}}",
    "{{v0}} sélections · détails réservés aux abonnés.": "اختيارات: {{v0}} · التفاصيل للمشتركين فقط.",
    "Ce que la sélection permet de comprendre": "ما الذي يوضّحه الاختيار",
    "Les petites cotes ne reçoivent aucun bonus. Le sélecteur compare la probabilité estimée, l’accord entre les sources et leur nombre. Ce score de classement n’est pas une probabilité.": "لا تُفضّل المعاملات الصغيرة. يُقارن الاحتمال المقدّر وتوافق المصادر وعددها. درجة الترتيب ليست احتمالاً.",
    "Les deux matchs doivent être distincts, avec des équipes différentes, des marchés complets et des cotes récentes. Cette vérification ne supprime pas l’incertitude sportive.": "تتطلب المباراتان فرقاً مختلفة وأسواقاً مكتملة ومعاملات حديثة. لا تلغي هذه الضوابط عدم اليقين الرياضي.",
    "Les probabilités viennent du moteur existant, souvent du consensus des cotes. L’efficacité de ce nouveau filtrage devra être mesurée sur des résultats futurs, pas uniquement sur les gagnants déjà connus.": "تأتي الاحتمالات من المحرّك الحالي، غالباً من توافق المعاملات. يجب قياس فعالية الفلتر بنتائج مستقبلية، لا بالفائزين السابقين وحدهم.",
    "Une seule sélection perdante arrête la série. Aucun pari ni aucune montante ne garantit un résultat.": "اختيار خاسر واحد يوقف السلسلة. لا يضمن أي رهان أو سلسلة نتيجة.",
    "RENCONTRE {{v0}}": "المباراة {{v0}}",
    "Sélection réservée aux abonnés": "اختيار مخصّص للمشتركين",
    "Sources complètes": "المصادر المكتملة",
    "Estimation issue du consensus des cotes, distincte d’une mesure de réussite réelle.": "تقدير من توافق المعاملات، لا قياس لنسبة النجاح الفعلية.",
    "Rencontre commencée : la sélection reste figée en attendant son résultat.": "بدأت المباراة: يبقى الاختيار ثابتاً حتى ظهور نتيجته.",
    "Pourquoi cette sélection ?": "لماذا هذا الاختيار؟",
    "Les critères détaillés n’ont pas été enregistrés pour cette ancienne sélection.": "لم تُحفظ المعايير التفصيلية لهذا الاختيار القديم.",
    "Cotes vérifiées : {{v0}}. Elles peuvent évoluer.": "المعاملات المُتحقق منها: {{v0}}. قد تتغير.",
    "Voir l’analyse du match": "عرض تحليل المباراة",
    "« {{v0}} » porte sur le total de buts ou de points. Le seuil et la période du marché déterminent le résultat.": "يتعلق «{{v0}}» بإجمالي الأهداف أو النقاط. يحدد الخط والفترة نتيجة التسوية.",
    "Non renseignée": "غير مُعلنة",
    "Administrateur": "المشرف",
    "Statistiques absentes": "الإحصاءات غير متوفرة",
    "Statistiques invalides": "إحصاءات غير صالحة",
    "Mon profil": "ملفي الشخصي",
    "Abonnement invalide": "اشتراك غير صالح",
    "Impossible de vérifier votre abonnement. Les informations affichées viennent de votre dernière connexion.": "تعذّر التحقق من الاشتراك. تُعرض بيانات آخر تسجيل دخول.",
    "Impossible de charger les résultats WinPulse. Réessayez dans un instant.": "تعذّر تحميل نتائج WinPulse. حاول مجدداً بعد قليل.",
    "Votre profil a été actualisé.": "حُدّث ملفك الشخصي.",
    "Impossible d’actualiser votre profil.": "تعذّر تحديث ملفك الشخصي.",
    "Votre consentement aux messages WhatsApp a été retiré.": "سُحبت موافقتك على رسائل واتساب.",
    "Impossible de modifier votre choix WhatsApp.": "تعذّر تعديل تفضيل واتساب.",
    "Email non renseigné": "البريد غير مُعلن",
    "Date d’expiration non renseignée.": "تاريخ الانتهاء غير مُعلن.",
    "Passer Pro": "الاشتراك في Pro",
    "Voir l’offre Pro": "عرض باقة Pro",
    "Gérer mon abonnement": "إدارة اشتراكي",
    "Pronostics gratuits selon les disponibilités": "توقعات مجانية بحسب التوفر",
    "Track Record public complet": "سجل نتائج علني كامل",
    "Compte personnel WinPulse": "حساب WinPulse شخصي",
    "Tous les pronostics et combinés": "جميع التوقعات والرهانات المركبة",
    "Analyses IA complètes": "تحليلات مفصلة",
    "Combo Builder et value bets": "منشئ الرهانات المركبة وفرص القيمة",
    "Résultats confirmés": "النتائج المؤكدة",
    "Remboursés": "مبالغ مُعادة",
    "Non renseigné": "غير مُعلن",
    "Membre depuis": "عضو منذ",
    "Vous avez autorisé WinPulse à vous contacter sur votre numéro WhatsApp. Vous pouvez retirer ce consentement à tout moment.": "سمحت لـWinPulse بالتواصل معك عبر واتساب. يمكنك سحب الموافقة في أي وقت.",
    "Vous n’avez pas de consentement actif pour les messages WhatsApp de WinPulse.": "لا توجد موافقة نشطة منك على رسائل واتساب من WinPulse.",
    "Autorisé": "مسموح",
    "Non autorisé": "غير مسموح",
    "Mon espace WinPulse": "مساحتي في WinPulse",
    "Résultats": "النتائج",
    "Résultats WinPulse": "نتائج WinPulse",
    "Mon compte": "حسابي",
    "Votre accès actuel": "وصولك الحالي",
    "Vérification de votre abonnement…": "جارٍ التحقق من الاشتراك…",
    "Les fonctionnalités Pro sont accessibles avec vos droits administrateur.": "ميزات Pro متاحة بصلاحياتك الإدارية.",
    "{{v0}} jour{{v1}} restant{{v2}}": "الأيام المتبقية: {{v0}}",
    "Votre ancien accès payant est arrivé à expiration.": "انتهت صلاحية وصولك المدفوع السابق.",
    "Votre ancien accès Elite reste reconnu. L’offre actuellement proposée est WinPulse Pro.": "لا يزال وصول Elite السابق معترفاً به. العرض الحالي هو WinPulse Pro.",
    "Découvrez les pronostics gratuits disponibles et les résultats publics.": "استكشف التوقعات المجانية المتاحة والنتائج العامة.",
    "Consultez l’offre complète et les modalités de paiement sur la page Abonnement.": "راجع صفحة الاشتراك للاطلاع على العرض وطرق الدفع.",
    "Les résultats publics de WinPulse": "نتائج WinPulse العامة",
    "Ces chiffres concernent les pronostics de la plateforme, pas les paris de votre compte. Ils sont visibles en Gratuit comme en Pro pour vous permettre de consulter notre historique.": "تخص هذه الأرقام توقعات المنصة، لا رهاناتك الشخصية. يمكن للمستخدم المجاني ومشترك Pro مراجعة السجل العام.",
    "Bilan des résultats confirmés": "ملخص النتائج المؤكدة",
    "Cumul du Track Record, tous sports et tous niveaux.": "السجل التراكمي لجميع الرياضات ومستويات المخاطر.",
    "Aucun résultat confirmé pour le moment": "لا توجد نتائج مؤكدة بعد",
    "Le bilan se mettra à jour lorsque les pronostics seront résolus.": "سيُحدّث الملخص عند تسوية التوقعات.",
    "Taux de réussite WinPulse": "نسبة نجاح WinPulse",
    "Gagnés ÷ (gagnés + perdus). Les remboursements et les pronostics en attente ne sont pas inclus.": "الناجحة ÷ (الناجحة + الخاسرة). تُستثنى المبالغ المعادة والاختيارات المنتظرة.",
    "Et mes statistiques personnelles ?": "وماذا عن إحصاءاتي الشخصية؟",
    "Elles nécessitent un historique des paris que vous avez réellement suivis. Aucun suivi personnel n’est relié à cette page actuellement : elle n’affiche donc pas de taux de réussite, de ROI ou de gains attribués à votre compte.": "تتطلب الإحصاءات الشخصية سجلاً لرهاناتك الفعلية. لا يوجد تتبع شخصي هنا، لذا لا تُنسب نسبة نجاح أو عائد أو أرباح إلى حسابك.",
    "Consulter le Track Record complet": "عرض سجل النتائج الكامل",
    "Mes informations": "معلوماتي",
    "Ces informations correspondent aux données enregistrées sur votre compte.": "تطابق هذه المعلومات البيانات المحفوظة في حسابك.",
    "Messages WhatsApp": "رسائل واتساب",
    "{{v0}}Retirer mon consentement": "{{v0}}سحب موافقتي",
    "Voir les pronostics": "عرض التوقعات",
    "Voir les résultats publics": "عرض النتائج العامة",
    "Actuel": "الحالي",
    "{{v0}} gagnés, {{v1}} perdus, {{v2}} remboursés": "{{v0}} ناجحة، {{v1}} خاسرة، {{v2}} مُعادة",
    "Non communiqué": "غير مُعلن",
    "Sélections et cotes à vérifier avant le début des rencontres.": "تحقق من الاختيارات والمعاملات قبل المباريات.",
    "Le serveur met trop de temps à répondre. Tu peux réessayer.": "تأخّر الخادم في الرد. حاول مجدداً.",
    "Deux issues sont couvertes : celles indiquées par la sélection. Vérifie la période à laquelle le marché s’applique.": "يغطي هذا الاختيار النتيجتين المحددتين خلال فترة السوق.",
    "Le pari concerne le fait que les deux équipes marquent, ou non, pendant la période couverte par le marché.": "يتعلق بما إذا كان كلا الفريقين سيسجل خلال الفترة المحددة.",
    "Le résultat est évalué après application du handicap indiqué. La ligne et la période du marché déterminent le règlement.": "تُحسب النتيجة بعد تطبيق الهانديكاب والخط والفترة المحددة. راجع قواعد المراهن.",
    "Le pari porte sur le total indiqué. Les règles de règlement dépendent de la ligne et de la période choisies.": "يتعلق بالإجمالي المحدد. راجع الخط والفترة وقواعد تسوية الرهان.",
    "La sélection prévoit un match nul sur la période couverte par le marché.": "يتوقع الاختيار التعادل خلال الفترة المشمولة.",
    "Le pronostic se lit avec son marché : consulte la fiche du match pour vérifier la période et les informations disponibles.": "اقرأ الاختيار مع سوقه وفترته. تعرض صفحة المباراة المعلومات المتاحة.",
    "Indisponible": "غير متاح",
    "Pronostic réservé": "اختيار مخصّص للمشتركين",
    "Le total doit rester inférieur à {{v0}} sur la période couverte par ce marché.": "يجب أن يبقى الإجمالي أقل من {{v0}} خلال الفترة المشمولة.",
    "Le total doit dépasser {{v0}} sur la période couverte par ce marché.": "يجب أن يتجاوز الإجمالي {{v0}} خلال الفترة المشمولة.",
    "Le moteur retient {{v0}} comme vainqueur sur la période couverte par le marché.": "يختار المحرّك فوز {{v0}} خلال الفترة المشمولة.",
    "Cette sélection couvre deux issues du match : celles indiquées dans le pronostic. Elle ne désigne pas nécessairement un vainqueur unique.": "يغطي هذا الاختيار النتيجتين المحددتين خلال فترة السوق.",
    "L’équipe indiquée doit gagner. Si la rencontre se termine sur un nul, la mise est remboursée selon les règles du marché.": "يجب أن يفوز الفريق المحدد. يُرد المبلغ عند التعادل خلال الفترة المشمولة وفق قواعد السوق.",
    "Le pronostic porte sur le fait que les deux équipes marquent ou non pendant la période indiquée par le marché.": "يتعلق بما إذا كان كلا الفريقين سيسجل خلال الفترة المحددة.",
    "Le résultat est évalué après application du handicap indiqué dans la sélection. La période et les règles de règlement du bookmaker sont à vérifier.": "تُحسب النتيجة بعد تطبيق الهانديكاب والخط والفترة المحددة. راجع قواعد المراهن.",
    "La sélection prévoit un match nul pendant la période indiquée par le marché.": "يتوقع الاختيار التعادل خلال الفترة المشمولة.",
    "La double chance couvre deux issues de la rencontre. Les deux issues couvertes sont celles indiquées dans la sélection.": "يغطي هذا الاختيار النتيجتين المحددتين خلال فترة السوق.",
    "La sélection vise la victoire de l’équipe indiquée. Si la rencontre se termine sur un match nul, la mise est remboursée selon les règles du marché.": "يجب أن يفوز الفريق المحدد. يُرد المبلغ عند التعادل خلال الفترة المشمولة وفق قواعد السوق.",
    "Ce marché porte sur le fait que les deux équipes marquent ou non pendant la période indiquée. Il ne désigne pas le vainqueur du match.": "يتعلق بما إذا كان كلا الفريقين سيسجل خلال الفترة المحددة.",
    "Le résultat est évalué après application du handicap indiqué dans la sélection. Vérifie aussi la période concernée et les règles de règlement du bookmaker.": "تُحسب النتيجة بعد تطبيق الهانديكاب والخط والفترة المحددة. راجع قواعد المراهن.",
    "Ce marché porte sur le total de buts ou de points, pour les équipes et la période indiquées dans la sélection.": "يتعلق بالإجمالي المحدد. راجع الخط والفترة وقواعد تسوية الرهان.",
    "Le pronostic porte sur un match nul pendant la période indiquée par le marché.": "يتوقع الاختيار التعادل خلال الفترة المشمولة.",
    "Annulé": "مبالغ مُعادة",
    "La sélection prévoit un match nul dans la période couverte.": "يتوقع الاختيار التعادل خلال الفترة المشمولة.",
    "Le résultat se juge après application du handicap indiqué pour l’équipe sélectionnée.": "تُحسب النتيجة بعد تطبيق الهانديكاب والخط والفترة المحددة. راجع قواعد المراهن.",
    "La sélection prévoit la victoire de {{v0}}, selon les règles de ce marché.": "يختار المحرّك فوز {{v0}} خلال الفترة المشمولة.",
    "Jackpot": "Jackpot",
    "ring-2 ring-rose-500/40": "ring-2 ring-rose-500/40",
    "PRO": "PRO",
    "vs": "vs",
    "🎯 *Pick WinPulse*": "🎯 *Pick WinPulse*",
    "*{{v0}}* vs *{{v1}}*": "*{{v0}}* vs *{{v1}}*",
    "KOUKPAKI VIANEY": "KOUKPAKI VIANEY",
    "WinPulse Pro": "WinPulse Pro",
    "pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-8": "pb-[calc(11rem+env(safe-area-inset-bottom))] lg:pb-8",
    "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8": "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8",
    "calc(4rem + env(safe-area-inset-bottom))": "calc(4rem + env(safe-area-inset-bottom))",
    "FCFA{{v0}}": "FCFA{{v0}}",
    "{{v0}} FCFA": "{{v0}} FCFA",
    "Gemini": "Gemini",
    "Claude": "Claude",
    "edge": "edge",
    "{{v0}} vs {{v1}}": "{{v0}} vs {{v1}}",
    "chez {{bookmaker}}": "لدى {{bookmaker}}",
    "Vainqueur (1X2)": "الفائز (1X2)",
    "Total buts/points": "إجمالي الأهداف/النقاط",
    "Total de buts": "إجمالي الأهداف",
    "Cartons": "البطاقات",
    "Corners": "الركنيات",
    "Mi-temps": "الشوط الأول",
    "Match nul": "تعادل",
    "Plus de {{line}} buts": "أكثر من {{line}} هدف",
    "Moins de {{line}} buts": "أقل من {{line}} هدف",
    "Plus de {{line}} points": "أكثر من {{line}} نقطة",
    "Moins de {{line}} points": "أقل من {{line}} نقطة",
    "Plus de {{line}} corners": "أكثر من {{line}} ركنية",
    "Moins de {{line}} corners": "أقل من {{line}} ركنية",
    "Plus de {{line}} cartons": "أكثر من {{line}} بطاقة",
    "Moins de {{line}} cartons": "أقل من {{line}} بطاقة",
    "TERMINÉ": "انتهت",
    "EN DIRECT": "مباشر",
    "Pick verrouillé": "اختيار مقفل",
    "Passe Pro pour voir l’analyse": "اشترك في Pro لعرض التحليل",
    "Avantage estimé : {{edge}}": "الأفضلية المقدّرة: {{edge}}",
    "Analyse en cours…": "جارٍ التحليل…",
    "Autres marchés analysés": "أسواق أخرى تم تحليلها",
    "Partager WhatsApp (Admin)": "المشاركة عبر واتساب (المشرف)",
    "Pronostic à risque réduit": "توقع بمخاطر أقل",
    "Pronostic à risque modéré": "توقع بمخاطر متوسطة",
    "Pronostic risqué": "توقع بمخاطر مرتفعة",
    "Victoire de {{team}}": "فوز {{team}}",
    "Plus de {{line}}": "أكثر من {{line}}",
    "Moins de {{line}}": "أقل من {{line}}",
    "Oui": "نعم",
    "Non": "لا",
    "Les deux équipes marquent : Oui": "كلا الفريقين يسجل: نعم",
    "Les deux équipes marquent : Non": "كلا الفريقين يسجل: لا"
  }
}


def _wn_normalize_language(value):
    if not isinstance(value, str):
        return None
    code = value.strip().lower().replace("_", "-").split("-")[0]
    return code if code in _WN_LANGUAGES else None


def _wn_request_language(request):
    # Le choix explicite de l'utilisateur prime sur la langue du navigateur.
    for value in (request.query_params.get("lang"),
                  request.query_params.get("language"),
                  request.headers.get("x-wnpulse-language")):
        code = _wn_normalize_language(value)
        if code:
            return code
    accepted = []
    for index, entry in enumerate(request.headers.get("accept-language", "")[:2048].split(",")):
        parts = entry.strip().split(";")
        quality = 1.0
        for parameter in parts[1:]:
            name, separator, value = parameter.strip().partition("=")
            if name.lower() == "q" and separator:
                try:
                    quality = float(value)
                except (ValueError, TypeError):
                    quality = 0.0
        code = _wn_normalize_language(parts[0])
        if code and math.isfinite(quality) and 0 < quality <= 1:
            accepted.append((-quality, index, code))
    return min(accepted)[2] if accepted else "fr"


def _wn_message(language, source, **values):
    code = _wn_normalize_language(language) or "fr"
    text = _WN_MESSAGES[code].get(source, _WN_MESSAGES["fr"].get(source, source))
    # Remplacement unique : une valeur d'équipe contenant {{...}} reste littérale.
    return re.sub(r"\{\{(\w+)\}\}",
                  lambda match: str(values.get(match.group(1), match.group(0))), text)


def _wn_analysis_number(value, language, digits=1):
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (ValueError, TypeError, OverflowError):
        return None
    if not math.isfinite(number):
        return None
    text = f"{number:.{digits}f}".rstrip("0").rstrip(".") if digits else f"{number:.0f}"
    return text.replace(".", ",") if language in {"fr", "es", "pt", "de"} else text


def _wn_display_pick(value, language):
    if not isinstance(value, str):
        return "—"
    # Traduire seulement un marché reconnu, jamais un nom d'équipe/de joueur.
    match = re.fullmatch(r"(Plus|Moins) de (\d+(?:[.,]\d+)?) (buts|points)", value.strip(), re.I)
    if not match:
        return value
    over = match.group(1).lower() == "plus"
    number = match.group(2).replace(",", ".")
    word = {"fr": ("Plus de", "Moins de"), "en": ("Over", "Under"),
            "es": ("Más de", "Menos de"), "pt": ("Mais de", "Menos de"),
            "de": ("Über", "Unter"), "ar": ("أكثر من", "أقل من")}[language][0 if over else 1]
    unit = {"buts": {"fr": "buts", "en": "goals", "es": "goles", "pt": "golos", "de": "Tore", "ar": "أهداف"},
            "points": {"fr": "points", "en": "points", "es": "puntos", "pt": "pontos", "de": "Punkte", "ar": "نقاط"}}[match.group(3).lower()][language]
    return f"{word} {number} {unit}"


_WN_ANALYSIS_TEXT = {
    "fr": ["Le moteur WNPulse retient {pick} pour cette rencontre.",
           "Marché analysé : {market}", "Cote de référence : {odds}",
           "Indicateur de confiance du moteur : {confidence} %",
           "Ces données décrivent le signal du moteur, sans garantir le résultat. La confiance affichée n'est pas une probabilité de réussite vérifiée.",
           "Aucune alternative justifiée par les seules données disponibles.",
           "Aucun pronostic exploitable n'est disponible pour cette rencontre."],
    "en": ["The WNPulse engine selects {pick} for this match.",
           "Market analysed: {market}", "Reference odds: {odds}",
           "Engine confidence indicator: {confidence}%",
           "These figures describe the engine signal and do not guarantee the result. The displayed confidence is not a verified win probability.",
           "No alternative is justified by the available data alone.",
           "No usable prediction is available for this match."],
    "es": ["El motor de WNPulse selecciona {pick} para este encuentro.",
           "Mercado analizado: {market}", "Cuota de referencia: {odds}",
           "Indicador de confianza del motor: {confidence} %",
           "Estos datos describen la señal del motor y no garantizan el resultado. La confianza mostrada no es una probabilidad de acierto verificada.",
           "Los datos disponibles no justifican una alternativa.",
           "No hay un pronóstico utilizable para este encuentro."],
    "pt": ["O motor WNPulse seleciona {pick} para este encontro.",
           "Mercado analisado: {market}", "Odd de referência: {odds}",
           "Indicador de confiança do motor: {confidence} %",
           "Estes dados descrevem o sinal do motor e não garantem o resultado. A confiança apresentada não é uma probabilidade de acerto verificada.",
           "Os dados disponíveis não justificam uma alternativa.",
           "Não existe um prognóstico utilizável para este encontro."],
    "de": ["Die WNPulse-Engine wählt {pick} für diese Begegnung.",
           "Analysierter Markt: {market}", "Referenzquote: {odds}",
           "Vertrauensindikator der Engine: {confidence} %",
           "Diese Daten beschreiben das Signal der Engine und garantieren kein Ergebnis. Der angezeigte Vertrauenswert ist keine überprüfte Gewinnwahrscheinlichkeit.",
           "Die verfügbaren Daten rechtfertigen keine Alternative.",
           "Für diese Begegnung ist keine nutzbare Prognose verfügbar."],
    "ar": ["يختار محرك WNPulse الرهان {pick} لهذه المباراة.",
           "السوق الذي تم تحليله: {market}", "معامل الرهان المرجعي: {odds}",
           "مؤشر ثقة المحرك: {confidence}٪",
           "تصف هذه البيانات إشارة المحرك ولا تضمن النتيجة. الثقة المعروضة ليست احتمال فوز تم التحقق منه.",
           "لا تبرر البيانات المتاحة وحدها اقتراح بديل.",
           "لا يتوفر توقع صالح لهذه المباراة."],
}


def _wn_localized_analysis(prediction, language):
    # Explication locale des données présentes ; aucun appel IA supplémentaire.
    texts = _WN_ANALYSIS_TEXT[language]
    pick = prediction.get("pick")
    if not pick or prediction.get("locked"):
        return {"verdict": texts[6], "key_factors": [], "risk_alert": texts[4],
                "alternative_bet": texts[5], "source": "engine",
                "language": language, "explanation_mode": "localized_engine"}
    factors = []
    market = prediction.get("market_label")
    if isinstance(market, str) and market.strip():
        factors.append(texts[1].format(market=_wn_message(language, market)))
    odds = _wn_analysis_number(prediction.get("pick_odds"), language, 2)
    if odds is not None:
        factors.append(texts[2].format(odds=odds))
    confidence = prediction.get("confidence")
    confidence_text = _wn_analysis_number(confidence, language)
    if confidence_text is not None and 0 <= float(confidence) <= 100:
        factors.append(texts[3].format(confidence=confidence_text))
    return {"verdict": texts[0].format(pick=_wn_display_pick(pick, language)),
            "key_factors": factors[:3], "risk_alert": texts[4],
            "alternative_bet": texts[5], "source": "engine",
            "language": language, "explanation_mode": "localized_engine"}


async def _wn_generate_analysis(match, prediction, language):
    if language != "fr":
        return _wn_localized_analysis(prediction, language)
    # Signature et cache de ai_service.py inchangés. Copier avant tout ajout.
    result = await generate_analysis(match, prediction)
    return {**result, "language": "fr"}


def _wn_language_headers(language, public=False):
    return {"Content-Language": language, "X-WNPulse-Language": language,
            "Vary": "Accept-Language, X-WNPulse-Language, Origin",
            "Cache-Control": "public, max-age=3600" if public else "private, no-store"}


def _wn_catalogue_response(request, language):
    etag = f'"wnpulse-i18n-{_WN_CATALOGUE_VERSION}-{language}"'
    headers = {**_wn_language_headers(language, public=True), "ETag": etag}
    # Tolérer les validateurs faibles et listes ETag des navigateurs/proxies.
    validators = [value.strip().removeprefix("W/") for value in
                  request.headers.get("if-none-match", "")[:4096].split(",")]
    if etag in validators or "*" in validators:
        return Response(status_code=304, headers=headers)
    return JSONResponse(content={
        "language": language, **_WN_LANGUAGES[language],
        "default_language": "fr", "catalogue_version": _WN_CATALOGUE_VERSION,
        "supported_languages": [{"code": code, **metadata}
                                for code, metadata in _WN_LANGUAGES.items()],
        "messages": _WN_MESSAGES[language],
    }, headers=headers)


@app.get("/api/i18n")
async def get_language_catalogue(request: Request):
    return _wn_catalogue_response(request, _wn_request_language(request))


@app.get("/api/i18n/{language}")
async def get_named_language_catalogue(language: str, request: Request):
    code = _wn_normalize_language(language)
    if not code:
        raise HTTPException(status_code=400, detail={"code": "UNSUPPORTED_LANGUAGE",
                            "supported_languages": list(_WN_LANGUAGES)})
    return _wn_catalogue_response(request, code)



@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Anti-partage de compte : tout JWT présenté doit correspondre à une
    # session enregistrée. Les routes permettant de se reconnecter restent
    # accessibles même si l'ancien token a été révoqué.
    if request.url.path not in _AUTH_SESSION_BYPASS_PATHS:
        authorization = (request.headers.get("authorization") or "").strip()
        if authorization.lower().startswith("bearer "):
            bearer_token = authorization[7:].strip()
            if bearer_token:
                try:
                    session_ok, session_code = await _validate_registered_session(bearer_token)
                except Exception:
                    # Fail-open uniquement en cas de panne Mongo transitoire :
                    # l'auth JWT habituelle continue de protéger la requête.
                    session_ok, session_code = True, ""

                if not session_ok:
                    return JSONResponse(
                        status_code=401,
                        content={
                            "detail": session_code or "SESSION_REVOKED",
                            "message": (
                                "Ce compte a été connecté sur un autre appareil ou navigateur. "
                                "Reconnecte-toi pour continuer."
                            ),
                        },
                        headers={"Cache-Control": "no-store, max-age=0"},
                    )

    # Limite les gros corps de requête JSON/form avant parsing.
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                return PlainTextResponse("Payload too large", status_code=413)
        except ValueError:
            return PlainTextResponse("Invalid Content-Length", status_code=400)

    response = await call_next(request)

    # Headers défensifs applicables à l'API et aux petites pages de maintenance.
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), usb=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; "
        "form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        "script-src 'self' 'unsafe-inline'"
    )
    response.headers["X-Robots-Tag"] = "noindex, nofollow"

    forwarded_proto = (request.headers.get("x-forwarded-proto") or "").split(",", 1)[0].strip().lower()
    if request.url.scheme == "https" or forwarded_proto == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    if request.url.path.startswith(("/api/auth", "/api/admin", "/api/manual", "/api/subscription", "/api/payments")):
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"

    return response


@app.get("/api/")
async def racine():
    return {"application": "WinPulse", "statut": "OK", "version": MODEL_VERSION}


@app.get("/api/sante")
async def sante():
    return {"statut": "en bonne sante"}


# ─── Auth models ──────────────────────────────────────────────────────────

class RegisterPayload(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    name: Optional[str] = Field(default=None, max_length=120)
    full_name: Optional[str] = Field(default=None, max_length=120)
    referral_code: Optional[str] = Field(default=None, max_length=64)
    whatsapp_number: str = Field(min_length=1, max_length=40)
    whatsapp_marketing_opt_in: StrictBool = False


class LoginPayload(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordPayload(BaseModel):
    email: EmailStr


class ResetPasswordPayload(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    new_password: str = Field(min_length=10, max_length=128)


def _normalize_whatsapp_number(value: Optional[str]) -> Optional[str]:
    number = re.sub(r"[\s().-]", "", str(value or "").strip())
    if not number:
        return None
    if not re.fullmatch(r"\+[1-9][0-9]{7,14}", number):
        raise HTTPException(status_code=400, detail="Renseigne un numéro WhatsApp avec + et l’indicatif du pays")
    return number


def _whatsapp_contact_fields(user: Dict) -> Dict:
    return {
        "whatsapp_number": user.get("whatsapp_number"),
        "whatsapp_marketing_opt_in": bool(user.get("whatsapp_number") and user.get("whatsapp_marketing_opt_in") is True),
        "whatsapp_opt_in_at": user.get("whatsapp_opt_in_at"),
        "whatsapp_opt_out_at": user.get("whatsapp_opt_out_at"),
        "whatsapp_consent_version": user.get("whatsapp_consent_version"),
        "whatsapp_last_contacted_at": user.get("whatsapp_last_contacted_at"),
        "whatsapp_followup_status": user.get("whatsapp_followup_status", "do_not_contact"),
    }


@app.post("/api/auth/register")
async def register(payload: RegisterPayload, request: Request):
    await _consume_security_limit("register_ip", _client_rate_key(request), limit=8, window_seconds=3600)
    email_addr = payload.email.lower().strip()
    whatsapp_number = _normalize_whatsapp_number(payload.whatsapp_number)
    if not whatsapp_number:
        raise HTTPException(status_code=400, detail="Le numéro WhatsApp est obligatoire pour créer un compte")
    display_name = (payload.name or payload.full_name or "").strip() or email_addr.split("@")[0]
    registered_at = datetime.now(timezone.utc).isoformat()
    password_error = _password_security_error(payload.password, email_addr)
    if password_error:
        raise HTTPException(status_code=400, detail=password_error)
    existing = await db.users.find_one({"email": email_addr})
    if existing:
        raise HTTPException(status_code=400, detail="Email deja utilise")

    # Ne jamais accorder un rôle admin sur la seule possession d'une adresse email.
    # Sans vérification d'email forte, cela permettrait une prise de contrôle au premier inscrit.
    is_admin = False
    user_id = str(uuid.uuid4())

    referred_by = None
    if payload.referral_code:
        referrer = await db.users.find_one({"referral_code": payload.referral_code.strip().upper()})
        if referrer:
            referred_by = referrer["id"]

    user_doc = {
        "id": user_id,
        "email": email_addr,
        "name": display_name,
        "full_name": display_name,
        "password_hash": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "subscription": "elite" if is_admin else "free",
        "is_admin": is_admin,
        "referral_code": user_id[:8].upper(),
        "referred_by": referred_by,
        "referral_reward_claimed": False,
        "whatsapp_number": whatsapp_number,
        "whatsapp_marketing_opt_in": payload.whatsapp_marketing_opt_in,
        "whatsapp_opt_in_at": registered_at if payload.whatsapp_marketing_opt_in else None,
        "whatsapp_opt_out_at": None,
        "whatsapp_consent_version": "winpulse-whatsapp-2026-10-06" if payload.whatsapp_marketing_opt_in else None,
        "whatsapp_last_contacted_at": None,
        "whatsapp_followup_status": "new" if payload.whatsapp_marketing_opt_in else "do_not_contact",
    }
    await db.users.insert_one(user_doc)
    await send_welcome_email(user_doc["email"], user_doc["name"])
    token = create_access_token(user_id, email_addr)
    await _register_auth_session(user_doc, token, request, source="register")
    return {
        "access_token": token,
        "user": {
            "id": user_id, "email": user_doc["email"], "name": user_doc["name"],
            "full_name": user_doc["full_name"], "subscription": user_doc["subscription"],
            "subscription_tier": user_doc["subscription"],
            "is_admin": user_doc["is_admin"],
            **_whatsapp_contact_fields(user_doc),
        },
    }


@app.post("/api/auth/login")
async def login(payload: LoginPayload, request: Request):
    email_addr = payload.email.lower().strip()
    network_key = _client_rate_key(request)
    await _consume_security_limit("login_ip", network_key, limit=30, window_seconds=900)
    await _consume_security_limit("login_email", email_addr, limit=10, window_seconds=900)

    user = await db.users.find_one({"email": email_addr})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        # Message volontairement générique pour éviter l'énumération de comptes.
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    await _clear_security_limit("login_email", email_addr)

    if ALLOW_ADMIN_EMAIL_BOOTSTRAP and user["email"] in ADMIN_EMAILS and not user.get("is_admin"):
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"is_admin": True, "subscription": "elite"}},
        )
        user["is_admin"] = True
        user["subscription"] = "elite"

    user = await _check_and_downgrade_if_expired(user)

    token = create_access_token(user["id"], user["email"])
    await _register_auth_session(user, token, request, source="login")
    return {
        "access_token": token,
        "user": {
            "id": user["id"], "email": user["email"], "name": user.get("name", ""),
            "full_name": user.get("full_name", user.get("name", "")),
            "subscription": user.get("subscription", "free"),
            "subscription_tier": user.get("subscription", "free"),
            "is_admin": user.get("is_admin", False),
            **_whatsapp_contact_fields(user),
        },
    }


@app.post("/api/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordPayload, request: Request):
    """
    Demande un lien de réinitialisation sans révéler si l'adresse existe.
    Le token brut n'est jamais stocké : seul son SHA-256 est conservé.
    """
    email_addr = payload.email.lower().strip()
    await _consume_security_limit("forgot_ip", _client_rate_key(request), limit=12, window_seconds=900)
    await _consume_security_limit("forgot_email", email_addr, limit=4, window_seconds=900)
    neutral_response = {
        "ok": True,
        "message": "Si un compte correspond à cette adresse, un email de réinitialisation vient d'être envoyé.",
    }

    user = await db.users.find_one({"email": email_addr})
    if not user:
        return neutral_response

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=15)
    recent_count = await db.password_reset_tokens.count_documents({
        "user_id": user["id"],
        "created_at": {"$gte": window_start},
    })
    if recent_count >= PASSWORD_RESET_MAX_REQUESTS:
        # Réponse volontairement identique afin de ne pas permettre l'énumération des comptes.
        return neutral_response

    # Un nouveau lien invalide tous les précédents encore actifs.
    await db.password_reset_tokens.update_many(
        {"user_id": user["id"], "used": False},
        {"$set": {"used": True, "invalidated_at": now}},
    )

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = now + timedelta(minutes=PASSWORD_RESET_TTL_MINUTES)

    await db.password_reset_tokens.insert_one({
        "token_hash": token_hash,
        "user_id": user["id"],
        "email": email_addr,
        "created_at": now,
        "expires_at": expires_at,
        "used": False,
    })

    reset_url = f"{PUBLIC_APP_URL}/reset-password/{raw_token}"
    sent = await send_password_reset_email(
        email_addr,
        user.get("full_name") or user.get("name") or "",
        reset_url,
    )
    if not sent:
        # Ne jamais exposer l'existence du compte au client.
        print(f"[WinPulse] Echec envoi email reset password pour user_id={user.get('id')}")

    return neutral_response


@app.post("/api/auth/reset-password")
async def reset_password(payload: ResetPasswordPayload, request: Request):
    """Valide un token à usage unique puis remplace le mot de passe du compte."""
    raw_token = payload.token.strip()
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    await _consume_security_limit("reset_ip", _client_rate_key(request), limit=15, window_seconds=900)
    await _consume_security_limit("reset_token", token_hash, limit=8, window_seconds=900)
    now = datetime.now(timezone.utc)

    token_doc = await db.password_reset_tokens.find_one({
        "token_hash": token_hash,
        "used": False,
        "expires_at": {"$gt": now},
    })
    if not token_doc:
        raise HTTPException(status_code=400, detail="Lien de réinitialisation invalide ou expiré")

    user = await db.users.find_one({"id": token_doc.get("user_id")})
    if not user:
        raise HTTPException(status_code=400, detail="Lien de réinitialisation invalide ou expiré")

    password_error = _password_security_error(payload.new_password, user.get("email", ""))
    if password_error:
        raise HTTPException(status_code=400, detail=password_error)

    # Empêche de remettre exactement le mot de passe actuel sans consommer le lien.
    if verify_password(payload.new_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Choisis un nouveau mot de passe différent de l'ancien")

    # Consommation atomique : deux clics simultanés ne peuvent pas réutiliser le même lien.
    consumed = await db.password_reset_tokens.find_one_and_update(
        {
            "_id": token_doc["_id"],
            "used": False,
            "expires_at": {"$gt": now},
        },
        {"$set": {"used": True, "used_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if not consumed:
        raise HTTPException(status_code=400, detail="Lien de réinitialisation invalide ou déjà utilisé")

    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "password_hash": hash_password(payload.new_password),
                "password_changed_at": now.isoformat(),
            }
        },
    )

    # Invalide tout autre lien de reset éventuellement encore présent.
    await db.password_reset_tokens.update_many(
        {"user_id": user["id"], "used": False},
        {"$set": {"used": True, "invalidated_at": now}},
    )
    await _clear_security_limit("reset_token", token_hash)
    await _clear_security_limit("login_email", user.get("email", ""))

    # Un changement de mot de passe est un événement de sécurité fort :
    # toutes les sessions existantes doivent être reconnectées.
    await _revoke_all_auth_sessions(user["id"], "password_changed")

    # Notification de sécurité ; un échec d'email ne bloque pas le changement déjà effectué.
    try:
        await send_password_changed_email(
            user.get("email", ""), user.get("full_name") or user.get("name") or ""
        )
    except Exception:
        pass

    return {
        "ok": True,
        "message": "Mot de passe modifié avec succès. Tu peux maintenant te connecter.",
    }


@app.post("/api/auth/logout")
async def logout_current_session(
    request: Request,
    payload: dict = Depends(get_current_user_payload),
):
    """Révoque uniquement la session courante.

    Free/Pro : retire aussi active_session_hash si ce token est la session active.
    Admin : les autres navigateurs/appareils admin restent connectés.
    """
    authorization = (request.headers.get("authorization") or "").strip()
    token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    if not token:
        return {"ok": True}

    token_hash = _auth_token_hash(token)
    user_id = str(payload.get("sub") or "")
    now = datetime.now(timezone.utc)

    await db.auth_sessions.update_one(
        {"_id": token_hash},
        {
            "$set": {
                "revoked": True,
                "revoked_at": now,
                "revoked_reason": "user_logout",
            }
        },
    )

    user = await db.users.find_one(
        {"id": user_id},
        {"id": 1, "is_admin": 1, "active_session_hash": 1},
    )
    if user and not bool(user.get("is_admin")):
        active_hash = str(user.get("active_session_hash") or "")
        if active_hash and hmac.compare_digest(active_hash, token_hash):
            await db.users.update_one(
                {"id": user_id, "active_session_hash": token_hash},
                {
                    "$unset": {
                        "active_session_hash": "",
                        "active_session_started_at": "",
                    }
                },
            )

    return {"ok": True}


@app.get("/api/auth/me")
async def me(payload: dict = Depends(get_current_user_payload)):
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    user = await _check_and_downgrade_if_expired(user)
    return {
        "id": user["id"], "email": user["email"],
        "name": user.get("name", ""), "full_name": user.get("full_name", user.get("name", "")),
        "subscription": user.get("subscription", "free"),
        "subscription_tier": user.get("subscription", "free"),
        "subscription_expires_at": user.get("subscription_expires_at"),
        "is_admin": user.get("is_admin", False),
        **_whatsapp_contact_fields(user),
    }


@app.post("/api/auth/whatsapp-opt-out")
async def whatsapp_opt_out(payload: dict = Depends(get_current_user_payload)):
    updated = await db.users.update_one(
        {"id": payload["sub"]},
        {"$set": {
            "whatsapp_marketing_opt_in": False,
            "whatsapp_opt_out_at": datetime.now(timezone.utc).isoformat(),
            "whatsapp_followup_status": "do_not_contact",
        }},
    )
    if not updated.matched_count:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return {"ok": True, "whatsapp_marketing_opt_in": False}


# ─── Prediction cache + calibration empirique ───────────────────────────────

async def _invalidate_prediction_cache():
    async with _prediction_cache_lock:
        _prediction_cache["timestamp"] = 0.0
        _prediction_cache["matches"] = []
        _prediction_cache["predictions"] = []
        _prediction_cache["real_stats_map"] = {}
        _prediction_cache["calibration"] = {}
        _prediction_cache["source_cache_updated_at"] = None


def _calibration_key(row: Dict, bucket: int) -> str:
    family = str(row.get("sport_key") or "unknown").split("_")[0]
    return f"{family}|{row.get('market') or 'unknown'}|{bucket}"


async def _compute_calibration_map() -> Dict[str, Dict]:
    resolved = await db.predictions_history.find(
        {"result": {"$in": ["won", "lost", "void"]}, "model_version": MODEL_VERSION},
        {"confidence": 1, "result": 1, "sport_key": 1, "market": 1}
    ).to_list(length=10000)
    buckets: Dict[str, Dict] = {}
    for row in resolved:
        try:
            c = float(row.get("confidence", 0))
        except (TypeError, ValueError):
            continue
        bucket = max(0, min(95, int(c // 5) * 5))
        item = buckets.setdefault(_calibration_key(row, bucket), {"wins": 0, "total": 0, "bucket": bucket})
        item["total"] += 1
        if row.get("result") == "won":
            item["wins"] += 1

    out = {}
    for cohort, item in buckets.items():
        bucket = item["bucket"]
        total = item["total"]
        if total < 30:
            continue
        prior = (bucket + 2.5) / 100.0
        calibrated = (item["wins"] + prior * 20.0) / (total + 20.0)
        out[cohort] = {
            "probability": round(calibrated * 100.0, 1),
            "wins": item["wins"],
            "total": total,
        }
    return out


async def _get_prediction_snapshot(force: bool = False) -> Dict:
    now = time.monotonic()
    async with _prediction_cache_lock:
        source_cache_updated_at = None
        try:
            cache_meta = await db.odds_cache.find_one({"_id": "all_matches"}, {"updated_at": 1})
            source_cache_updated_at = cache_meta.get("updated_at") if cache_meta else None
        except Exception:
            pass
        same_source_snapshot = (
            source_cache_updated_at == _prediction_cache.get("source_cache_updated_at")
        )
        if (not force and _prediction_cache["matches"] and same_source_snapshot and
                now - _prediction_cache["timestamp"] < PREDICTION_CACHE_TTL):
            return _prediction_cache

        matches = await fetch_all_matches(db)
        real_stats_map = await get_real_stats_map(db, matches)
        predictions = analyze_all(matches, real_stats_map=real_stats_map)
        calibration = await _compute_calibration_map()
        # Le cache des prédictions doit suivre immédiatement le cache Mongo des
        # matchs. Sans ce contrôle, un refresh du flux pouvait laisser l'API
        # servir pendant 300 s l'ancienne liste de matchs.
        source_cache_updated_at = None
        try:
            cache_meta = await db.odds_cache.find_one({"_id": "all_matches"}, {"updated_at": 1})
            source_cache_updated_at = cache_meta.get("updated_at") if cache_meta else None
        except Exception:
            pass
        _prediction_cache.update({
            "timestamp": now,
            "matches": matches,
            "predictions": predictions,
            "real_stats_map": real_stats_map,
            "calibration": calibration,
            "source_cache_updated_at": source_cache_updated_at,
        })
        return _prediction_cache


async def _get_calibration_map() -> Dict[int, Dict]:
    snapshot = await _get_prediction_snapshot()
    return snapshot["calibration"]


def _apply_calibration(predictions: List[Dict], calibration: Dict[str, Dict]) -> List[Dict]:
    for p in predictions:
        try:
            c = float(p.get("confidence", 0))
        except (TypeError, ValueError):
            c = 0.0
        bucket = max(0, min(95, int(c // 5) * 5))
        cal = calibration.get(_calibration_key(p, bucket))
        if cal:
            p["calibrated_probability"] = cal["probability"]
            p["calibration_sample"] = cal["total"]
            p["calibration_status"] = "empirique"
            p["effective_score"] = round(
                float(p.get("selection_score", p.get("wp_score", c))) * 0.70 + cal["probability"] * 0.30, 1
            )
        else:
            p["calibrated_probability"] = None
            p["calibration_sample"] = 0
            p["calibration_status"] = "insuffisant"
            p["effective_score"] = round(float(p.get("selection_score", p.get("wp_score", c))), 1)
    return predictions


# ─── Matches & predictions ──────────────────────────────────────────────────

def _merge_match_prediction(match: dict, prediction: dict) -> dict:
    merged = dict(match)
    merged["prediction"] = prediction
    return merged


def _normalize_sport(match_or_row: Dict) -> str:
    """Normalise les clés/titres de sport provenant des différents fournisseurs."""
    raw_key = str(match_or_row.get("sport_key") or "").lower().strip()
    raw_title = str(match_or_row.get("sport_title") or "").lower().strip()
    text = f"{raw_key} {raw_title}"

    if any(x in text for x in ("americanfootball", "american_football", "nfl", "ncaaf")):
        return "american_football"
    if any(x in text for x in ("soccer", "football", "premier league", "la liga", "bundesliga", "ligue 1", "serie a", "uefa", "champions league")):
        return "football"
    if any(x in text for x in ("basketball", "nba", "ncaab", "euroleague")):
        return "basketball"
    if any(x in text for x in ("tennis", "atp", "wta")):
        return "tennis"
    if any(x in text for x in ("icehockey", "ice_hockey", "ice hockey", "hockey", "nhl")):
        return "hockey"
    if any(x in text for x in ("baseball", "mlb")):
        return "baseball"
    if any(x in text for x in ("mma", "ufc", "mixed martial")):
        return "mma"

    if raw_key:
        return raw_key.replace("-", "_").split("_")[0]
    return "unknown"


def _match_is_finished(match: dict) -> bool:
    ct = match.get("commence_time", "")
    if not ct:
        return False
    try:
        dt = datetime.fromisoformat(str(ct).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt) > timedelta(hours=4)
    except Exception:
        return False


@app.get("/api/matches")
async def get_matches(payload: Optional[dict] = Depends(get_optional_user_payload)):
    snapshot = await _get_prediction_snapshot()
    matches = [m for m in snapshot["matches"] if not _match_is_finished(m)]
    predictions = _apply_calibration(
        [dict(p) for p in snapshot["predictions"]],
        snapshot["calibration"],
    )
    pred_by_id = {p.get("match_id"): p for p in predictions}
    is_paid = await _has_paid_access(payload)
    merged = []
    for i, m in enumerate(matches):
        pred = dict(pred_by_id.get(m.get("id"), {}))
        # Métadonnée publique pour compter les vrais picks, même après masquage
        # Pro. Un match sans sélection ne doit pas augmenter le compteur.
        pred["has_prediction"] = bool(str(pred.get("pick") or "").strip()) and not (
            pred.get("is_finished") or m.get("is_finished") or m.get("completed")
        )
        if not is_paid and i > 0:
            pred = _lock_prediction_for_free(pred)
        else:
            pred["locked"] = False
        merged.append(_merge_match_prediction(m, pred))
    return merged


@app.get("/api/predictions")
async def get_predictions(payload: Optional[dict] = Depends(get_optional_user_payload)):
    snapshot = await _get_prediction_snapshot()
    predictions = _apply_calibration(
        [dict(p) for p in snapshot["predictions"]],
        snapshot["calibration"],
    )
    if await _has_paid_access(payload):
        for pred in predictions:
            pred["locked"] = False
        return predictions

    # Offre gratuite : un seul pronostic complet, le reste est réellement masqué côté API.
    return [pred if i == 0 else _lock_prediction_for_free(pred) for i, pred in enumerate(predictions)]


@app.get("/api/predictions/model-status")
async def get_prediction_model_status():
    snapshot = await _get_prediction_snapshot()
    calibration = snapshot["calibration"]
    resolved = await db.predictions_history.count_documents({"result": {"$in": ["won", "lost"]}, "model_version": MODEL_VERSION})
    pending = await db.predictions_history.count_documents({"result": "pending", "model_version": MODEL_VERSION})
    return {
        "model_version": MODEL_VERSION,
        "bookmaker_profile": BOOKMAKER_PROFILE,
        "probability_method": "bookmaker_consensus_by_exact_market_line",
        "trained_sports_model": False,
        "calibration_scope": "sport_family_and_market",
        "cache_ttl_seconds": PREDICTION_CACHE_TTL,
        "resolved_picks": resolved,
        "pending_picks": pending,
        "calibration_buckets": calibration,
        "calibration_ready": bool(calibration),
        "note": "Calibration descriptive après au moins 30 résultats de même sport, marché et tranche ; le moteur n'est pas un modèle sportif entraîné.",
    }


@app.get("/api/predictions/top")
async def get_top_predictions(limit: int = 10, payload: Optional[dict] = Depends(get_optional_user_payload)):
    snapshot = await _get_prediction_snapshot()
    preds = _apply_calibration(
        [dict(p) for p in snapshot["predictions"] if p.get("pick") and not p.get("is_finished")],
        snapshot["calibration"],
    )
    preds.sort(key=lambda p: p.get("effective_score", p.get("wp_score", 0)), reverse=True)
    preds = preds[:max(1, min(limit, 50))]

    is_paid = await _has_paid_access(payload)

    if not is_paid:
        for i, p in enumerate(preds):
            if i == 0:
                p["locked"] = False
            else:
                preds[i] = _lock_prediction_for_free(p)
    else:
        for p in preds:
            p["locked"] = False

    return preds


@app.get("/api/matches/{match_id}/analysis")
async def get_match_analysis(match_id: str, request: Request, response: Response, payload: Optional[dict] = Depends(get_optional_user_payload)):
    snapshot = await _get_prediction_snapshot()
    matches = [m for m in snapshot["matches"] if not _match_is_finished(m)]

    match = next((m for m in matches if str(m.get("id")) == str(match_id)), None)

    if not match:
        match = next(
            (m for m in matches if str(m.get("match_id", "")) == str(match_id)),
            None,
        )

    if not match:
        raise HTTPException(
            status_code=404,
            detail=f"Match introuvable (id={match_id}, {len(matches)} matchs en cache)",
        )

    prediction = next(
        (dict(p) for p in snapshot["predictions"] if str(p.get("match_id")) == str(match_id)),
        {}
    )

    is_paid = await _has_paid_access(payload)
    free_match_id = str(matches[0].get("id") or matches[0].get("match_id")) if matches else None
    requested_id = str(match.get("id") or match.get("match_id"))
    if not is_paid and requested_id != free_match_id:
        raise HTTPException(status_code=403, detail="Analyse complète réservée aux abonnés Pro")

    # Sans choix explicite, les anciennes pages conservent leur analyse française.
    # La langue du navigateur seule ne change pas le contenu d'une ancienne page.
    explicit_language = (request.query_params.get("lang") or request.query_params.get("language")
                         or request.headers.get("x-wnpulse-language"))
    language = _wn_request_language(request) if explicit_language else "fr"
    ai_analysis = await _wn_generate_analysis(match, prediction, language)
    for name, value in _wn_language_headers(language).items():
        response.headers[name] = value
    return {"match": match, "prediction": prediction, "ai_analysis": ai_analysis}


@app.get("/api/data/status")
async def get_data_status():
    cached = await db.odds_cache.find_one({"_id": "all_matches"})
    if not cached:
        return {"odds_updated_at": None, "count": 0, "by_sport": {}}

    by_sport: Dict[str, int] = {}
    try:
        matches = await fetch_all_matches(db)
        for match in matches:
            key = _normalize_sport(match)
            if key != "unknown":
                by_sport[key] = by_sport.get(key, 0) + 1
    except Exception:
        by_sport = {}

    return {
        "odds_updated_at": cached.get("updated_at"),
        "count": cached.get("count", 0),
        "by_sport": by_sport,
    }


@app.post("/api/data/refresh")
async def post_data_refresh(payload: dict = Depends(get_current_user_payload)):
    """Refresh fournisseur réservé à l'administration avec verrou anti-double-clic."""
    await _require_admin(payload)
    if _manual_refresh_lock.locked():
        raise HTTPException(status_code=409, detail="Un refresh est déjà en cours")
    async with _manual_refresh_lock:
        result = await _full_refresh_and_track()
        cache_status = await get_odds_cache_status(db)
        return {"refresh": result, "cache": cache_status}


@app.get("/api/manual-refresh", response_class=HTMLResponse)
async def manual_refresh_page():
    """Page de maintenance sans JavaScript pour forcer le refresh des APIs.

    Le secret est envoyé en POST dans le corps du formulaire, jamais dans l'URL.
    Cette version fonctionne même si un proxy ou le navigateur bloque les scripts inline.
    """
    return HTMLResponse(
        """<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WinPulse — Refresh manuel</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:40px 20px}.box{max-width:680px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:28px;box-shadow:0 12px 40px #0f172a12}h1{margin:0 0 8px;font-size:26px}p{color:#475569}input,button{width:100%;box-sizing:border-box;border-radius:10px;padding:12px 14px;font-size:15px}input{border:1px solid #cbd5e1;margin:12px 0}button{border:0;background:#f97316;color:#fff;font-weight:800;cursor:pointer}.hint{font-size:13px}</style></head>
<body><div class="box"><h1>Refresh manuel WinPulse</h1><p>Recharge les événements disponibles auprès des APIs, recalcule les statistiques et met à jour le cache.</p><form method="post" action="/api/manual-refresh/form-run"><label for="key"><strong>REFRESH_SECRET</strong></label><input id="key" name="key" type="password" autocomplete="off" required placeholder="Secret configuré dans l'environnement serveur"><button type="submit">Lancer le refresh maintenant</button></form><p class="hint">Le secret est envoyé uniquement dans le corps POST du formulaire et n'apparaît pas dans l'URL.</p></div></body></html>"""
    )


@app.post("/api/manual-refresh/form-run", response_class=HTMLResponse)
async def manual_refresh_form_run(request: Request):
    """Exécute le refresh depuis le formulaire HTML, sans JavaScript."""
    await _consume_security_limit("manual_refresh_ip", _client_rate_key(request), limit=12, window_seconds=900)
    body = (await request.body()).decode("utf-8", errors="replace")
    params = parse_qs(body, keep_blank_values=True)
    key = (params.get("key") or [""])[0].strip()
    secret = os.environ.get("REFRESH_SECRET", "").strip()

    if not secret or not key or not secrets.compare_digest(key, secret):
        return HTMLResponse(
            "<h2>REFRESH_SECRET invalide ou non configuré.</h2>"
            "<p><a href='/api/manual-refresh'>Retour</a></p>",
            status_code=403,
        )

    if _manual_refresh_lock.locked():
        return HTMLResponse(
            "<h2>Un refresh est déjà en cours.</h2>"
            "<p><a href='/api/manual-refresh'>Retour</a></p>",
            status_code=409,
        )

    async with _manual_refresh_lock:
        result = await _full_refresh_and_track()
        cache_status = await get_odds_cache_status(db)
        payload = {"ok": True, "refresh": result, "cache": cache_status}

    rendered = html.escape(json.dumps(payload, ensure_ascii=False, indent=2))
    return HTMLResponse(
        "<!doctype html><html lang='fr'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>WinPulse — Résultat refresh</title>"
        "<style>body{font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:40px 20px}.box{max-width:900px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:28px}.ok{color:#15803d}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0f172a;color:#e2e8f0;border-radius:12px;padding:16px}a{color:#ea580c;font-weight:700}</style></head>"
        "<body><div class='box'><h1 class='ok'>Refresh terminé</h1>"
        f"<pre>{rendered}</pre><p><a href='/api/manual-refresh'>Relancer un refresh</a></p>"
        "</div></body></html>"
    )


@app.post("/api/manual-refresh/run")
async def manual_refresh_run(request: Request, key: str = Header(default="", alias="X-Refresh-Key")):
    await _consume_security_limit("manual_refresh_ip", _client_rate_key(request), limit=12, window_seconds=900)
    secret = os.environ.get("REFRESH_SECRET", "").strip()
    if not secret or not key or not secrets.compare_digest(key, secret):
        raise HTTPException(status_code=403, detail="REFRESH_SECRET invalide ou non configuré")
    if _manual_refresh_lock.locked():
        raise HTTPException(status_code=409, detail="Un refresh est déjà en cours")
    async with _manual_refresh_lock:
        result = await _full_refresh_and_track()
        cache_status = await get_odds_cache_status(db)
        return {"ok": True, "refresh": result, "cache": cache_status}


@app.get("/api/manual-track-sync", response_class=HTMLResponse)
async def manual_track_sync_page():
    """Page de maintenance dédiée à la réconciliation du Track Record."""
    return HTMLResponse(
        """<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WinPulse — Synchronisation Track Record</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:40px 20px}.box{max-width:760px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:28px;box-shadow:0 12px 40px #0f172a12}h1{margin:0 0 8px;font-size:26px}p{color:#475569}input,button{width:100%;box-sizing:border-box;border-radius:10px;padding:12px 14px;font-size:15px}input{border:1px solid #cbd5e1;margin:12px 0}button{border:0;background:#f97316;color:#fff;font-weight:800;cursor:pointer}button:disabled{opacity:.55;cursor:wait}pre{white-space:pre-wrap;background:#0f172a;color:#e2e8f0;border-radius:12px;padding:16px;min-height:120px;margin-top:18px}.hint{font-size:13px}</style></head>
<body><div class="box"><h1>Synchroniser le Track Record</h1><p>Récupère les scores des pronostics encore en attente, archive les résultats et transforme automatiquement les picks terminés en GAGNÉ / PERDU / REMBOURSÉ.</p><label for="key"><strong>REFRESH_SECRET</strong></label><input id="key" type="password" autocomplete="off" placeholder="Secret configuré dans l'environnement serveur"><button id="run">Synchroniser les résultats maintenant</button><p class="hint">Cette action ne recrée pas de pronostic : elle met uniquement à jour ceux qui existent déjà dans predictions_history.</p><pre id="out">Prêt.</pre></div>
<script>const btn=document.getElementById('run'),out=document.getElementById('out'),key=document.getElementById('key');btn.onclick=async()=>{if(!key.value){out.textContent='REFRESH_SECRET requis.';return;}btn.disabled=true;out.textContent='Synchronisation en cours…';try{const r=await fetch('/api/manual-track-sync/run',{method:'POST',headers:{'X-Refresh-Key':key.value}});const data=await r.json();out.textContent=JSON.stringify(data,null,2);if(!r.ok)throw new Error(data.detail||('HTTP '+r.status));}catch(e){out.textContent='Erreur : '+e.message+'\n\n'+out.textContent;}finally{btn.disabled=false;}};</script></body></html>"""
    )


@app.post("/api/manual-track-sync/run")
async def manual_track_sync_run(request: Request, key: str = Header(default="", alias="X-Refresh-Key")):
    await _consume_security_limit("manual_track_ip", _client_rate_key(request), limit=12, window_seconds=900)
    secret = os.environ.get("REFRESH_SECRET", "").strip()
    if not secret or not key or not secrets.compare_digest(key, secret):
        raise HTTPException(status_code=403, detail="REFRESH_SECRET invalide ou non configuré")

    before = await db.predictions_history.count_documents({"result": "pending"})
    result = await _reconcile_predictions_with_scores(force_score_refresh=True)
    after = await db.predictions_history.count_documents({"result": "pending"})
    resolved_total = await db.predictions_history.count_documents({"result": {"$in": ["won", "lost", "void"]}})
    return {
        "ok": True,
        "pending_before": before,
        "pending_after": after,
        "resolved_total": resolved_total,
        "reconciliation": result,
    }


@app.get("/api/data/source-audit")
async def get_data_source_audit():
    cached = await db.odds_cache.find_one({"_id": "all_matches"})
    return {
        "updated_at": cached.get("updated_at") if cached else None,
        "count": cached.get("count", 0) if cached else 0,
        "sources": ["The Odds API"],
    }


# ─── Abonnement ───────────────────────────────────────────────────────────

WINPULSE_MONTHLY_PRICE_XOF = 10500

SUBSCRIPTION_PLANS = [
    {
        "id": "pro",
        "name": "WinPulse Pro",
        "price": WINPULSE_MONTHLY_PRICE_XOF,
        "price_fcfa": WINPULSE_MONTHLY_PRICE_XOF,
        "price_xof": WINPULSE_MONTHLY_PRICE_XOF,
        "duration_days": 30,
        "period": "mois",
        "features": [
            "Accès illimité à tous les pronostics, tous les jours, sur 7 sports",
            "Tous les combinés (Sûr, Booster, Extra, Jackpot) débloqués",
            "Chaque match analysé sur tous ses marchés — pas juste le favori évident",
            "Combo Builder : construis tes propres combinés à partir de nos analyses",
            "Détecteur de value bets : les cotes où le marché sous-estime nos calculs",
            "Analyse IA experte sur chaque match, avec verdict et facteurs clés",
            "Track Record public et vérifiable — aucun résultat caché",
            "Support prioritaire par WhatsApp",
        ],
        "highlighted": True,
        "tagline": "Un seul prix. Tout WinPulse. Sans compromis.",
    },
]


def _canonical_subscription_plans() -> list:
    """Retourne toujours le tarif public officiel, même si une ancienne donnée est réintroduite ailleurs."""
    return [
        {
            **plan,
            "price": WINPULSE_MONTHLY_PRICE_XOF,
            "price_fcfa": WINPULSE_MONTHLY_PRICE_XOF,
            "price_xof": WINPULSE_MONTHLY_PRICE_XOF,
        }
        for plan in SUBSCRIPTION_PLANS
    ]


@app.get("/api/subscription/plans")
async def get_subscription_plans():
    return _canonical_subscription_plans()


@app.get("/api/subscription/status")
async def get_subscription_status(payload: dict = Depends(get_current_user_payload)):
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    user = await _check_and_downgrade_if_expired(user)
    return {
        "subscription": user.get("subscription", "free"),
        "subscription_expires_at": user.get("subscription_expires_at"),
        "is_admin": user.get("is_admin", False),
        "pro_price_xof": WINPULSE_MONTHLY_PRICE_XOF,
    }


# ─── Paiements abonnement : FedaPay + secours manuel ───────────────────────

# Le flux FedaPay est volontairement OFF par defaut pour permettre un deploiement
# sans interruption. Une fois les secrets configures sur l'hebergeur, activer :
# FEDAPAY_ENABLED=true et FEDAPAY_ENV=live.
FEDAPAY_ENABLED = os.environ.get("FEDAPAY_ENABLED", "false").strip().lower() in ("1", "true", "yes")
FEDAPAY_ENV = os.environ.get("FEDAPAY_ENV", "sandbox").strip().lower()
FEDAPAY_SECRET_KEY = os.environ.get("FEDAPAY_SECRET_KEY", "").strip()
FEDAPAY_WEBHOOK_SECRET = os.environ.get("FEDAPAY_WEBHOOK_SECRET", "").strip()
FEDAPAY_CALLBACK_URL = os.environ.get(
    "FEDAPAY_CALLBACK_URL",
    "https://www.wnpulse.com/app/abonnement",
).strip()
FEDAPAY_WEBHOOK_TOLERANCE_SECONDS = 300

MOMO_NUMBER = "+229 01 66 28 06 03"
MOMO_RECIPIENT_NAME = "KOUKPAKI VIANEY"
PAYMENT_WHATSAPP_NUMBER = "+33 7 67 97 17 52"


def _fedapay_base_url() -> str:
    if FEDAPAY_ENV == "live":
        return "https://api.fedapay.com/v1"
    return "https://sandbox-api.fedapay.com/v1"


def _fedapay_configured() -> bool:
    return bool(FEDAPAY_ENABLED and FEDAPAY_SECRET_KEY)


def _fedapay_callback_url(reference: str) -> str:
    separator = "&" if "?" in FEDAPAY_CALLBACK_URL else "?"
    return f"{FEDAPAY_CALLBACK_URL}{separator}payment=return&reference={reference}"


def _fedapay_safe_error(payload) -> str:
    if isinstance(payload, dict):
        for key in ("message", "error", "detail"):
            value = payload.get(key)
            if value:
                return str(value)[:300]
        errors = payload.get("errors")
        if errors:
            return str(errors)[:300]
    return "Erreur fournisseur de paiement"


async def _fedapay_request(method: str, path: str, json_body: Optional[Dict] = None) -> Dict:
    if not FEDAPAY_SECRET_KEY:
        raise HTTPException(
            status_code=503,
            detail="FedaPay n'est pas encore configure sur le serveur (FEDAPAY_SECRET_KEY manquante).",
        )

    url = f"{_fedapay_base_url()}{path}"
    headers = {
        "Authorization": f"Bearer {FEDAPAY_SECRET_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=25.0) as http:
            response = await http.request(method, url, headers=headers, json=json_body)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"FedaPay inaccessible: {type(exc).__name__}")

    try:
        data = response.json()
    except Exception:
        data = {}

    if response.status_code < 200 or response.status_code >= 300:
        raise HTTPException(
            status_code=502,
            detail=f"FedaPay HTTP {response.status_code}: {_fedapay_safe_error(data)}",
        )
    return data if isinstance(data, dict) else {"data": data}


def _fedapay_transaction_from_response(data: Dict) -> Dict:
    """Normalise les reponses Transaction FedaPay, anciennes et actuelles.

    Selon la version de l'API / du compte, FedaPay peut renvoyer soit l'objet
    transaction directement, soit une enveloppe historique du type
    {"v1/transaction": {...}}. On accepte aussi les enveloppes usuelles
    transaction/data/entity afin de rester compatible sans affaiblir les
    controles de paiement.
    """
    if not isinstance(data, dict):
        return {}

    if data.get("id") is not None:
        return data

    # Formats connus, dont l'enveloppe historique encore renvoyee par certains
    # comptes/endpoints FedaPay.
    for key in ("v1/transaction", "transaction", "entity"):
        value = data.get(key)
        if isinstance(value, dict) and value.get("id") is not None:
            return value

    # Quelques clients/proxies enveloppent encore la reponse sous data/result.
    for outer_key in ("data", "result", "response"):
        outer = data.get(outer_key)
        if not isinstance(outer, dict):
            continue
        if outer.get("id") is not None:
            return outer
        for key in ("v1/transaction", "transaction", "entity"):
            value = outer.get(key)
            if isinstance(value, dict) and value.get("id") is not None:
                return value

    # Dernier secours strict : une cle de ressource se terminant par /transaction.
    for key, value in data.items():
        if (
            isinstance(key, str)
            and key.lower().endswith("/transaction")
            and isinstance(value, dict)
            and value.get("id") is not None
        ):
            return value

    return {}


async def _fedapay_retrieve_transaction(transaction_id) -> Dict:
    data = await _fedapay_request("GET", f"/transactions/{transaction_id}")
    return _fedapay_transaction_from_response(data)


async def _fedapay_retrieve_by_merchant_reference(reference: str) -> Dict:
    data = await _fedapay_request("GET", f"/transactions/merchant/{reference}")
    return _fedapay_transaction_from_response(data)


def _fedapay_custom_metadata(transaction: Dict) -> Dict:
    metadata = transaction.get("custom_metadata") or {}
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except Exception:
            metadata = {}
    return metadata if isinstance(metadata, dict) else {}


def _fedapay_reference_from_transaction(transaction: Dict) -> Optional[str]:
    reference = transaction.get("merchant_reference")
    if reference:
        return str(reference)
    metadata = _fedapay_custom_metadata(transaction)
    reference = metadata.get("winpulse_reference") or metadata.get("reference")
    return str(reference) if reference else None


def _fedapay_signature_valid(raw_body: bytes, signature_header: str) -> bool:
    """Verification compatible avec le SDK officiel FedaPay.

    X-FEDAPAY-SIGNATURE est de la forme t=<timestamp>,s=<hmac>.
    La valeur signee est '<timestamp>.<corps brut>' en HMAC-SHA256.
    """
    if not FEDAPAY_WEBHOOK_SECRET or not signature_header:
        return False

    timestamp = None
    signatures: List[str] = []
    for raw_item in signature_header.split(","):
        item = raw_item.strip()
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        key, value = key.strip(), value.strip()
        if key == "t":
            try:
                timestamp = int(value)
            except (TypeError, ValueError):
                return False
        elif key == "s" and value:
            signatures.append(value)

    if timestamp is None or not signatures:
        return False
    if abs(int(time.time()) - timestamp) > FEDAPAY_WEBHOOK_TOLERANCE_SECONDS:
        return False

    try:
        payload_text = raw_body.decode("utf-8")
    except UnicodeDecodeError:
        return False

    signed_payload = f"{timestamp}.{payload_text}".encode("utf-8")
    expected = hmac.new(
        FEDAPAY_WEBHOOK_SECRET.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    return any(secrets.compare_digest(expected, candidate) for candidate in signatures)


def _subscription_expiry_for_payment(user: Dict, days: int) -> str:
    """Renouvellement : prolonge depuis l'expiration courante si elle est future."""
    now = datetime.now(timezone.utc)
    base = now
    current_expiry = user.get("subscription_expires_at")
    if current_expiry:
        try:
            current_dt = datetime.fromisoformat(str(current_expiry).replace("Z", "+00:00"))
            if current_dt.tzinfo is None:
                current_dt = current_dt.replace(tzinfo=timezone.utc)
            if current_dt > base:
                base = current_dt
        except Exception:
            pass
    return (base + timedelta(days=max(1, int(days)))).isoformat()


async def _activate_verified_fedapay_payment(transaction: Dict) -> Dict:
    """Active un abonnement uniquement apres relecture de la transaction FedaPay.

    Idempotence : activation_expires_at est reserve une seule fois dans la demande
    locale puis reutilise sur toutes les tentatives suivantes. Un webhook rejoue ne
    peut donc pas ajouter 30 jours une seconde fois.
    """
    tx_id = transaction.get("id")
    tx_status = str(transaction.get("status") or "").lower().strip()
    reference = _fedapay_reference_from_transaction(transaction)

    if tx_status != "approved":
        return {"ok": False, "status": tx_status or "unknown", "activated": False}
    if not reference:
        raise HTTPException(status_code=409, detail="Transaction FedaPay sans merchant_reference WinPulse")

    req = await db.subscription_requests.find_one({"reference": reference})
    if not req:
        raise HTTPException(status_code=404, detail="Demande d'abonnement WinPulse introuvable")
    if req.get("payment_provider") != "fedapay":
        raise HTTPException(status_code=409, detail="La demande ne correspond pas a un paiement FedaPay")

    if req.get("fedapay_transaction_id") is not None and str(req.get("fedapay_transaction_id")) != str(tx_id):
        raise HTTPException(status_code=409, detail="ID de transaction FedaPay incoherent")

    plan = next((p for p in SUBSCRIPTION_PLANS if p["id"] == req.get("plan_id")), None)
    if not plan:
        raise HTTPException(status_code=409, detail="Plan d'abonnement introuvable")

    try:
        paid_amount = int(transaction.get("amount"))
        expected_amount = int(req.get("amount_fcfa") or plan["price_fcfa"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=409, detail="Montant FedaPay invalide")

    if paid_amount != expected_amount or expected_amount != int(plan["price_fcfa"]):
        raise HTTPException(status_code=409, detail="Montant FedaPay different du montant WinPulse attendu")

    metadata = _fedapay_custom_metadata(transaction)
    metadata_reference = metadata.get("winpulse_reference")
    metadata_user = metadata.get("winpulse_user_id")
    metadata_plan = metadata.get("winpulse_plan_id")
    metadata_currency = metadata.get("currency")
    if metadata_reference and str(metadata_reference) != reference:
        raise HTTPException(status_code=409, detail="Reference FedaPay incoherente")
    if metadata_user and str(metadata_user) != str(req.get("user_id")):
        raise HTTPException(status_code=409, detail="Utilisateur FedaPay incoherent")
    if metadata_plan and str(metadata_plan) != str(req.get("plan_id")):
        raise HTTPException(status_code=409, detail="Plan FedaPay incoherent")
    if metadata_currency and str(metadata_currency).upper() != "XOF":
        raise HTTPException(status_code=409, detail="Devise FedaPay incoherente")

    # Deja regle : on ne reprolonge jamais l'abonnement.
    if req.get("status") == "approved" and req.get("activation_applied") is True:
        return {
            "ok": True,
            "status": "approved",
            "activated": True,
            "already_processed": True,
            "reference": reference,
            "subscription_expires_at": req.get("activation_expires_at"),
        }

    user = await db.users.find_one({"id": req.get("user_id")})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur WinPulse introuvable")

    activation_expires_at = req.get("activation_expires_at")
    if not activation_expires_at:
        candidate_expiry = _subscription_expiry_for_payment(user, int(plan.get("duration_days", 30)))
        claimed = await db.subscription_requests.find_one_and_update(
            {
                "reference": reference,
                "$or": [
                    {"activation_expires_at": {"$exists": False}},
                    {"activation_expires_at": None},
                ],
            },
            {"$set": {
                "activation_expires_at": candidate_expiry,
                "status": "processing",
                "payment_status": "approved",
                "fedapay_verified_at": datetime.now(timezone.utc).isoformat(),
            }},
            return_document=ReturnDocument.AFTER,
        )
        if claimed:
            req = claimed
            activation_expires_at = candidate_expiry
        else:
            req = await db.subscription_requests.find_one({"reference": reference})
            activation_expires_at = req.get("activation_expires_at") if req else None

    if not activation_expires_at:
        raise HTTPException(status_code=500, detail="Impossible de reserver la date d'expiration de l'abonnement")

    await db.users.update_one(
        {"id": req["user_id"]},
        {"$set": {
            "subscription": req["plan_id"],
            "subscription_expires_at": activation_expires_at,
        }},
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    was_applied = bool(req.get("activation_applied"))
    await db.subscription_requests.update_one(
        {"reference": reference},
        {"$set": {
            "status": "approved",
            "payment_status": "approved",
            "activation_applied": True,
            "approved_at": req.get("approved_at") or now_iso,
            "paid_at": transaction.get("approved_at") or now_iso,
            "fedapay_verified_at": now_iso,
            "fedapay_transaction_id": tx_id,
            "fedapay_reference": transaction.get("reference"),
            "fedapay_receipt_url": transaction.get("receipt_url"),
            "fedapay_payment_method_id": transaction.get("payment_method_id"),
        }},
    )

    if not was_applied:
        await send_subscription_activated_email(
            req["user_email"],
            plan["name"],
            activation_expires_at,
        )

    return {
        "ok": True,
        "status": "approved",
        "activated": True,
        "already_processed": was_applied,
        "reference": reference,
        "subscription_expires_at": activation_expires_at,
    }


async def _create_fedapay_subscription_payment(
    user: Dict,
    plan: Dict,
    payer_name: str = "",
    payer_phone: str = "",
) -> Dict:
    if not _fedapay_configured():
        raise HTTPException(
            status_code=503,
            detail="Paiement FedaPay non active sur le serveur. Configure FEDAPAY_SECRET_KEY puis FEDAPAY_ENABLED=true.",
        )

    reference = _generate_reference()
    created_at = datetime.now(timezone.utc).isoformat()
    request_doc = {
        "reference": reference,
        "user_id": user["id"],
        "user_email": user["email"],
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "amount_fcfa": int(plan["price_fcfa"]),
        "currency": "XOF",
        "payer_phone": (payer_phone or "").strip(),
        "payer_name": (payer_name or "").strip(),
        "payment_provider": "fedapay",
        "payment_status": "creating",
        "status": "pending",
        "created_at": created_at,
    }
    await db.subscription_requests.insert_one(dict(request_doc))

    customer: Dict = {"email": user["email"]}
    clean_name = (payer_name or user.get("name") or "").strip()
    if clean_name:
        parts = clean_name.split()
        customer["firstname"] = parts[0]
        customer["lastname"] = " ".join(parts[1:]) if len(parts) > 1 else parts[0]

    tx_payload = {
        "description": f"Abonnement {plan['name']} WinPulse - {reference}",
        "amount": int(plan["price_fcfa"]),
        "currency": {"iso": "XOF"},
        "callback_url": _fedapay_callback_url(reference),
        "customer": customer,
        "merchant_reference": reference,
        "custom_metadata": {
            "winpulse_reference": reference,
            "winpulse_user_id": str(user["id"]),
            "winpulse_plan_id": plan["id"],
            "currency": "XOF",
        },
    }

    try:
        created = await _fedapay_request("POST", "/transactions", tx_payload)
        transaction = _fedapay_transaction_from_response(created)
        transaction_id = transaction.get("id")
        if transaction_id is None:
            raise HTTPException(status_code=502, detail="FedaPay n'a pas retourne d'ID de transaction")

        await db.subscription_requests.update_one(
            {"reference": reference},
            {"$set": {
                "payment_status": str(transaction.get("status") or "pending"),
                "fedapay_transaction_id": transaction_id,
                "fedapay_reference": transaction.get("reference"),
                "fedapay_environment": FEDAPAY_ENV,
            }},
        )

        token_data = await _fedapay_request("POST", f"/transactions/{transaction_id}/token")
        payment_url = token_data.get("url")
        payment_token = token_data.get("token")
        if not payment_url:
            raise HTTPException(status_code=502, detail="FedaPay n'a pas retourne de lien de paiement")

        await db.subscription_requests.update_one(
            {"reference": reference},
            {"$set": {
                "payment_status": "pending",
                "payment_url": payment_url,
                "fedapay_token_created_at": datetime.now(timezone.utc).isoformat(),
            }},
        )

        return {
            "reference": reference,
            "plan": plan,
            "payment_provider": "fedapay",
            "payment_status": "pending",
            "payment_url": payment_url,
            # Token retourne pour diagnostic frontend si necessaire, jamais la cle API.
            "payment_token": payment_token,
            "environment": FEDAPAY_ENV,
        }
    except HTTPException as exc:
        await db.subscription_requests.update_one(
            {"reference": reference},
            {"$set": {
                "payment_status": "provider_error",
                "provider_error": str(exc.detail)[:500],
                "provider_error_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        raise


async def _create_manual_subscription_request(
    user: Dict,
    plan: Dict,
    payer_name: str = "",
    payer_phone: str = "",
) -> Dict:
    reference = _generate_reference()
    await db.subscription_requests.insert_one({
        "reference": reference,
        "user_id": user["id"],
        "user_email": user["email"],
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "amount_fcfa": plan["price_fcfa"],
        "payer_phone": (payer_phone or "").strip(),
        "payer_name": (payer_name or "").strip(),
        "payment_provider": "manual_momo",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"reference": reference, "plan": plan, "payment_provider": "manual_momo"}


class CheckoutPayload(BaseModel):
    tier: str
    phone: str = ""
    payer_name: str = ""


def _generate_reference() -> str:
    return f"PE-{uuid.uuid4().hex[:8].upper()}"


@app.get("/api/payments/config")
async def get_payment_config():
    return {
        "provider": "fedapay" if FEDAPAY_ENABLED else "manual_momo",
        "fedapay_enabled": FEDAPAY_ENABLED,
        "fedapay_environment": FEDAPAY_ENV if FEDAPAY_ENABLED else None,
        "currency": "XOF",
    }


@app.post("/api/subscription/checkout")
async def subscription_checkout(
    payload_in: CheckoutPayload,
    payload: dict = Depends(get_current_user_payload),
):
    plan = next((p for p in _canonical_subscription_plans() if p["id"] == payload_in.tier.lower()), None)
    if not plan:
        raise HTTPException(status_code=400, detail="Plan inconnu")

    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    if FEDAPAY_ENABLED:
        return await _create_fedapay_subscription_payment(
            user,
            plan,
            payer_name=payload_in.payer_name,
            payer_phone=payload_in.phone,
        )

    return await _create_manual_subscription_request(
        user,
        plan,
        payer_name=payload_in.payer_name,
        payer_phone=payload_in.phone,
    )


class UpgradeRequestPayload(BaseModel):
    plan_id: str


@app.post("/api/subscription/request-upgrade")
async def request_subscription_upgrade(
    payload_in: UpgradeRequestPayload,
    payload: dict = Depends(get_current_user_payload),
):
    plan = next((p for p in SUBSCRIPTION_PLANS if p["id"] == payload_in.plan_id), None)
    if not plan:
        raise HTTPException(status_code=400, detail="Plan inconnu")

    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    if FEDAPAY_ENABLED:
        return await _create_fedapay_subscription_payment(user, plan)

    manual = await _create_manual_subscription_request(user, plan)
    reference = manual["reference"]
    whatsapp_message = (
        f"Bonjour WinPulse !\n"
        f"Je viens d'effectuer le paiement pour activer mon plan *{plan['name']}*.\n\n"
        f"• Référence : *{reference}*\n"
        f"• Montant : *{plan['price_fcfa']:,} FCFA*".replace(",", " ") + "\n"
        f"• Numéro MTN MoMo utilisé : *[TON NUMERO]*\n"
        f"• Destinataire payé : *{MOMO_RECIPIENT_NAME}*\n"
        f"• Nom : *[TON NOM]*\n"
        f"• Email du compte : *{user['email']}*\n\n"
        f"Voici la capture du SMS de confirmation MTN. Merci d'activer mon accès 🚀"
    )
    whatsapp_link = (
        f"https://wa.me/{PAYMENT_WHATSAPP_NUMBER.replace('+', '').replace(' ', '')}"
        f"?text={whatsapp_message}"
    )
    return {
        **manual,
        "payment_instructions": {
            "momo_number": MOMO_NUMBER,
            "momo_recipient_name": MOMO_RECIPIENT_NAME,
            "amount_fcfa": plan["price_fcfa"],
            "steps": [
                "Effectue le paiement MTN MoMo.",
                "Garde le SMS de confirmation.",
                "Envoie la confirmation sur WhatsApp.",
                "Ton acces est active apres verification.",
            ],
        },
        "whatsapp_number": PAYMENT_WHATSAPP_NUMBER,
        "whatsapp_message": whatsapp_message,
        "whatsapp_link": whatsapp_link,
    }


@app.post("/api/subscription/upgrade")
async def request_subscription_upgrade_alias(
    payload_in: UpgradeRequestPayload,
    payload: dict = Depends(get_current_user_payload),
):
    return await request_subscription_upgrade(payload_in, payload)


@app.get("/api/subscription/payment-status/{reference}")
async def get_subscription_payment_status(
    reference: str,
    payload: dict = Depends(get_current_user_payload),
):
    req = await db.subscription_requests.find_one({
        "reference": reference,
        "user_id": payload["sub"],
    })
    if not req:
        raise HTTPException(status_code=404, detail="Paiement introuvable")

    if req.get("payment_provider") == "fedapay" and req.get("fedapay_transaction_id"):
        try:
            transaction = await _fedapay_retrieve_transaction(req["fedapay_transaction_id"])
            provider_status = str(transaction.get("status") or req.get("payment_status") or "pending").lower()
            if provider_status == "approved":
                await _activate_verified_fedapay_payment(transaction)
                req = await db.subscription_requests.find_one({"reference": reference})
            else:
                await db.subscription_requests.update_one(
                    {"reference": reference},
                    {"$set": {
                        "payment_status": provider_status,
                        "payment_status_checked_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
                req["payment_status"] = provider_status
        except HTTPException as exc:
            # Le statut local reste consultable meme si FedaPay a une indisponibilite temporaire.
            if exc.status_code not in (502, 503):
                raise

    user = await db.users.find_one({"id": payload["sub"]})
    return {
        "reference": reference,
        "status": req.get("status", "pending"),
        "payment_status": req.get("payment_status", req.get("status", "pending")),
        "payment_provider": req.get("payment_provider"),
        "subscription": user.get("subscription", "free") if user else "free",
        "subscription_expires_at": user.get("subscription_expires_at") if user else None,
        "activated": bool(req.get("activation_applied")) or req.get("status") == "approved",
    }


@app.post("/api/payments/fedapay/webhook")
async def fedapay_webhook(request: Request):
    if not FEDAPAY_ENABLED:
        raise HTTPException(status_code=503, detail="FedaPay desactive")
    if not FEDAPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="FEDAPAY_WEBHOOK_SECRET manquant")

    raw_body = await request.body()
    signature_header = request.headers.get("X-FEDAPAY-SIGNATURE", "")
    if not _fedapay_signature_valid(raw_body, signature_header):
        raise HTTPException(status_code=400, detail="Signature webhook FedaPay invalide")

    try:
        body = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Payload webhook FedaPay invalide")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Payload webhook FedaPay invalide")

    event = body.get("event") if isinstance(body.get("event"), dict) else body
    event_name = str(
        event.get("name") or event.get("type") or body.get("name") or body.get("type") or ""
    ).lower().strip()
    entity = event.get("entity") if isinstance(event, dict) else None
    if entity is None:
        entity = body.get("entity")
    if isinstance(entity, str):
        try:
            entity = json.loads(entity)
        except Exception:
            entity = {}
    if not isinstance(entity, dict):
        entity = {}

    event_id = (
        event.get("id") if isinstance(event, dict) else None
    ) or body.get("id") or hashlib.sha256(raw_body).hexdigest()[:32]
    event_key = f"fedapay:{event_id}"
    existing_event = await db.payment_webhook_events.find_one({"_id": event_key})
    if existing_event and existing_event.get("processed") is True:
        return {"received": True, "duplicate": True}

    await db.payment_webhook_events.update_one(
        {"_id": event_key},
        {"$set": {
            "provider": "fedapay",
            "event_name": event_name,
            "received_at": datetime.now(timezone.utc).isoformat(),
            "processed": False,
        }},
        upsert=True,
    )

    try:
        transaction_id = entity.get("id") or (
            event.get("object_id") if isinstance(event, dict) else None
        ) or body.get("object_id")
        merchant_reference = entity.get("merchant_reference")
        if not merchant_reference:
            entity_metadata = entity.get("custom_metadata")
            if isinstance(entity_metadata, dict):
                merchant_reference = entity_metadata.get("winpulse_reference")

        transaction = None
        if transaction_id is not None:
            transaction = await _fedapay_retrieve_transaction(transaction_id)
        elif merchant_reference:
            transaction = await _fedapay_retrieve_by_merchant_reference(str(merchant_reference))

        if event_name == "transaction.approved":
            if not transaction:
                raise HTTPException(status_code=409, detail="Transaction FedaPay introuvable")
            settlement = await _activate_verified_fedapay_payment(transaction)
        else:
            settlement = {"ok": True, "activated": False, "event": event_name}
            if transaction:
                reference = _fedapay_reference_from_transaction(transaction)
                provider_status = str(transaction.get("status") or "pending").lower()
                if reference:
                    await db.subscription_requests.update_one(
                        {"reference": reference, "payment_provider": "fedapay"},
                        {"$set": {
                            "payment_status": provider_status,
                            "fedapay_last_event": event_name,
                            "fedapay_last_event_at": datetime.now(timezone.utc).isoformat(),
                        }},
                    )

        await db.payment_webhook_events.update_one(
            {"_id": event_key},
            {"$set": {
                "processed": True,
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "result": settlement,
            }},
        )
        return {"received": True, "event": event_name, "result": settlement}
    except Exception as exc:
        await db.payment_webhook_events.update_one(
            {"_id": event_key},
            {"$set": {
                "processed": False,
                "last_error": str(getattr(exc, "detail", exc))[:500],
                "last_error_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        raise


async def _require_admin(payload: dict) -> dict:
    user = await _get_user_from_payload(payload)
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    return user


class BlogPostInput(BaseModel):
    title: str = Field(..., min_length=8, max_length=160)
    excerpt: str = Field(..., min_length=20, max_length=360)
    content: str = Field(..., min_length=80, max_length=40000)
    slug: str = Field(default="", max_length=120)
    cover: str = Field(default="", max_length=1000)
    category: str = "Guides"
    sport: str = ""
    source_url: str = Field(default="", max_length=1000)
    source_name: str = Field(default="", max_length=120)
    information_date: str = Field(default="", max_length=10)
    tags: List[str] = Field(default_factory=list)
    status: str = "draft"
    revision: Optional[StrictInt] = None


async def _blog_response(operation):
    try:
        return await asyncio.wait_for(operation, timeout=10)
    except BlogConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Ce lien d’article existe déjà. Choisis un autre lien.")
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logging.getLogger(__name__).warning("Blog operation failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Le blog est temporairement indisponible. Réessaie dans un instant.")


@app.get("/api/blog/posts")
async def get_blog_posts(limit: int = Query(default=50, ge=1, le=200), category: str = "", sport: str = ""):
    filters = {"limit": limit}
    if category:
        filters["category"] = category
    if sport:
        filters["sport"] = sport
    return await _blog_response(blog_list_posts(db, **filters))


@app.get("/api/blog/posts/{slug}")
async def get_blog_post(slug: str):
    return await _blog_response(blog_get_post(db, slug))


@app.get("/api/blog/admin/posts")
async def admin_blog_posts(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)
    return await _blog_response(blog_list_posts(db, limit=200, admin=True))


@app.post("/api/blog/admin/posts", status_code=201)
async def admin_blog_create(data: BlogPostInput, payload: dict = Depends(get_current_user_payload)):
    admin = await _require_admin(payload)
    return await _blog_response(blog_save_post(db, data.dict(), admin["id"]))


@app.put("/api/blog/admin/posts/{post_id}")
async def admin_blog_update(post_id: str, data: BlogPostInput, payload: dict = Depends(get_current_user_payload)):
    admin = await _require_admin(payload)
    return await _blog_response(blog_save_post(db, data.dict(), admin["id"], post_id=post_id))


@app.delete("/api/blog/admin/posts/{post_id}")
async def admin_blog_delete(post_id: str, revision: int = Query(..., ge=1), payload: dict = Depends(get_current_user_payload)):
    admin = await _require_admin(payload)
    return await _blog_response(blog_delete_post(db, post_id, revision, admin["id"]))


class BlogNewsSettingsInput(BaseModel):
    paused: StrictBool


@app.get("/api/blog/admin/news/status")
async def admin_blog_news_status(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)
    return await _blog_response(news_status(db, scheduler_active=_blog_news_scheduler.running))


@app.post("/api/blog/admin/news/settings")
async def admin_blog_news_settings(data: BlogNewsSettingsInput, payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)
    return await _blog_response(pause_blog_news(db, data.paused))


@app.post("/api/blog/admin/news/sync", status_code=202)
async def admin_blog_news_sync(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)
    accepted = await _start_blog_news_sync()
    return {"accepted": accepted, "message": "La collecte suit son calendrier et respecte les délais de la source."}


@app.get("/api/admin/stats")
async def admin_get_stats(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)

    total_users = await db.users.count_documents({})
    free_users = await db.users.count_documents({"subscription": "free"})
    paid_users = total_users - free_users
    pending_payments = await db.subscription_requests.count_documents({"status": "pending"})
    approved_payments = await db.subscription_requests.count_documents({"status": "approved"})

    cached = await db.odds_cache.find_one({"_id": "all_matches"})
    matches_count = cached.get("count", 0) if cached else 0

    return {
        "total_users": total_users,
        "free_users": free_users,
        "paid_users": paid_users,
        "pending_payments": pending_payments,
        "approved_payments": approved_payments,
        "matches_in_cache": matches_count,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/admin/users")
async def admin_get_users(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)
    users = await db.users.find({}).sort("created_at", -1).to_list(length=500)
    result = []
    for u in users:
        result.append({
            "id": u.get("id"),
            "email": u.get("email"),
            "name": u.get("name", ""),
            "subscription": u.get("subscription", "free"),
            "is_admin": u.get("is_admin", False),
            "created_at": u.get("created_at"),
            **_whatsapp_contact_fields(u),
        })
    return result


def _admin_whatsapp_query(search: str = "", contact_filter: str = "all") -> Dict:
    valid_number = {"$regex": r"^\+[1-9][0-9]{7,14}$"}
    query = {}
    if contact_filter == "authorized":
        query = {"whatsapp_number": valid_number, "whatsapp_marketing_opt_in": True}
    elif contact_filter == "not_authorized":
        query = {"whatsapp_number": valid_number, "whatsapp_marketing_opt_in": {"$ne": True}}
    elif contact_filter == "missing":
        query = {"whatsapp_number": {"$not": valid_number}}
    elif contact_filter != "all":
        raise HTTPException(status_code=400, detail="Filtre de contacts inconnu")
    search = search.strip()
    if search:
        literal = {"$regex": re.escape(search), "$options": "i"}
        query["$or"] = [{key: literal} for key in ("name", "full_name", "email", "whatsapp_number")]
    return query


_ADMIN_WHATSAPP_PROJECTION = {
    "_id": 0, "id": 1, "name": 1, "full_name": 1, "email": 1,
    "subscription": 1, "created_at": 1, "whatsapp_number": 1,
    "whatsapp_marketing_opt_in": 1, "whatsapp_opt_in_at": 1,
    "whatsapp_opt_out_at": 1, "whatsapp_consent_version": 1,
    "whatsapp_last_contacted_at": 1, "whatsapp_followup_status": 1,
}


@app.get("/api/admin/whatsapp-contacts")
async def admin_whatsapp_contacts(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    search: str = Query(default="", max_length=120),
    contact_filter: str = "all",
    payload: dict = Depends(get_current_user_payload),
):
    await _require_admin(payload)
    query = _admin_whatsapp_query(search, contact_filter)
    total = await db.users.count_documents(query)
    users = await db.users.find(query, _ADMIN_WHATSAPP_PROJECTION).sort(
        [("created_at", -1), ("id", 1)]
    ).skip((page - 1) * per_page).limit(per_page).to_list(length=per_page)
    return {
        "items": [{
            "id": u.get("id"), "name": u.get("full_name") or u.get("name") or "",
            "email": u.get("email"), "subscription": u.get("subscription", "free"),
            "created_at": u.get("created_at"), **_whatsapp_contact_fields(u),
        } for u in users],
        "total": total, "page": page, "per_page": per_page,
        "total_pages": max(1, (total + per_page - 1) // per_page),
    }


def _whatsapp_csv_cell(value) -> str:
    text = str(value or "")
    # Conserver les numéros avec + comme du texte, et neutraliser les formules.
    if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n")):
        return "'" + text
    return text


@app.get("/api/admin/whatsapp-contacts/export")
async def admin_export_whatsapp_contacts(
    search: str = Query(default="", max_length=120),
    payload: dict = Depends(get_current_user_payload),
):
    await _require_admin(payload)
    query = _admin_whatsapp_query(search, "authorized")

    async def rows():
        yield "\ufeff".encode("utf-8")
        buffer = io.StringIO(newline="")
        writer = csv.writer(buffer, delimiter=";")
        writer.writerow(["Nom", "Email", "WhatsApp", "Abonnement", "Autorisation le", "Version de l’autorisation"])
        yield buffer.getvalue().encode("utf-8")
        buffer.seek(0)
        buffer.truncate(0)
        cursor = db.users.find(query, _ADMIN_WHATSAPP_PROJECTION).sort([("created_at", -1), ("id", 1)])
        async for user in cursor:
            writer.writerow([_whatsapp_csv_cell(value) for value in (
                user.get("full_name") or user.get("name"), user.get("email"),
                user.get("whatsapp_number"), user.get("subscription", "free"),
                user.get("whatsapp_opt_in_at"), user.get("whatsapp_consent_version"),
            )])
            yield buffer.getvalue().encode("utf-8")
            buffer.seek(0)
            buffer.truncate(0)

    filename = f"winpulse-contacts-whatsapp-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(rows(), media_type="text/csv; charset=utf-8", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
    })


_PAYMENT_STATUS_MAP_FR_TO_EN = {
    "en attente": "pending",
    "approuve": "approved",
    "approuvee": "approved",
    "rejete": "rejected",
    "rejetee": "rejected",
    "tout": "all",
    "tous": "all",
}


@app.get("/api/admin/payments")
async def admin_get_payments(
    status_filter: str = "en attente",
    payload: dict = Depends(get_current_user_payload),
):
    await _require_admin(payload)
    internal_status = _PAYMENT_STATUS_MAP_FR_TO_EN.get(
        status_filter.lower().strip(), status_filter
    )
    query = {} if internal_status == "all" else {"status": internal_status}
    requests = await db.subscription_requests.find(query).sort("created_at", -1).to_list(length=200)
    for r in requests:
        r.pop("_id", None)
    return requests


# ─── Helpers pour l'envoi de picks (email + WhatsApp) ────────────────────

async def _get_combo_by_tier(tier_key: str) -> Optional[Dict]:
    matches = await fetch_all_matches(db)
    combos = build_multi_combos(matches)
    return combos.get(tier_key)


def _combo_display_name(tier_key: str) -> str:
    return {"safe": "Sécurité", "balanced": "Équilibre", "jackpot": "Jackpot"}.get(tier_key, tier_key.capitalize())


def _build_combo_email_html(combo: Dict, tier_key: str) -> str:
    legs = combo.get("legs", [])
    rows = "".join(
        f"""
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">
            <div style="font-weight:700;color:#0f172a;">{leg.get('home_team','')} vs {leg.get('away_team','')}</div>
            <div style="color:#ea580c;font-weight:600;">{leg.get('pick','')}</div>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-family:monospace;font-weight:700;">
            {leg.get('pick_odds','')}
          </td>
        </tr>
        """
        for leg in legs
    )
    body = f"""
    <p>Voici le combiné <strong>{_combo_display_name(tier_key)}</strong> du jour, sélectionné par le moteur WinPulse :</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">{rows}</table>
    <p style="font-size:18px;font-weight:800;color:#0f172a;">
      Cote totale : <span style="color:#ea580c;">{combo.get('total_odds', '—')}</span>
    </p>
    <p><a href="https://www.wnpulse.com/app" style="color:#ea580c;font-weight:bold;">Voir l'analyse complète →</a></p>
    <p style="font-size:11px;color:#94a3b8;margin-top:24px;">
      Aucun pari sportif n'est garanti. Joue de façon responsable.
    </p>
    """
    return _email_layout(f"Ton combiné {_combo_display_name(tier_key)} du jour", body)


def _build_teaser_email_html(combo: Dict) -> str:
    legs = combo.get("legs", [])
    if not legs:
        return _email_layout("Pari de la semaine", "<p>Aucun pick disponible pour le moment.</p>")
    first = legs[0]
    blurred_count = max(0, len(legs) - 1)
    body = f"""
    <p>Voici un aperçu de notre sélection de la semaine :</p>
    <div style="padding:12px;border:1px solid #e5e7eb;border-radius:10px;margin:12px 0;">
      <div style="font-weight:700;color:#0f172a;">{first.get('home_team','')} vs {first.get('away_team','')}</div>
      <div style="color:#ea580c;font-weight:700;font-size:18px;">{first.get('pick','')} @ {first.get('pick_odds','')}</div>
    </div>
    {f'<p style="color:#94a3b8;">+ {blurred_count} autre(s) pick(s) réservé(s) aux abonnés Pro 🔒</p>' if blurred_count else ''}
    <p><a href="https://www.wnpulse.com/app/abonnement" style="color:#ea580c;font-weight:bold;">Débloquer tous les picks →</a></p>
    """
    return _email_layout("🎁 Pari de la semaine — 1 pick offert", body)


def _build_whatsapp_blast_text(combo: Dict, now_local: datetime) -> str:
    legs = combo.get("legs", [])
    lines = [
        f"🔥 *WinPulse — Combiné du {now_local.strftime('%d/%m/%Y')}*",
        "",
    ]
    for leg in legs:
        lines.append(f"⚽ {leg.get('home_team','')} vs {leg.get('away_team','')}")
        lines.append(f"👉 {leg.get('pick','')} @ *{leg.get('pick_odds','')}*")
        lines.append("")
    lines.append(f"💰 Cote totale : *{combo.get('total_odds', '—')}*")
    lines.append("")
    lines.append("📲 Analyse complète : https://wnpulse.com/app")
    lines.append("18+ · Jeu responsable")
    return "\n".join(lines)


@app.get("/api/admin/whatsapp-blast")
async def admin_whatsapp_blast(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)
    now_local = datetime.now(timezone.utc) + timedelta(hours=1)
    active_subscribers = await db.users.count_documents({"subscription": {"$ne": "free"}})
    combo = await _get_combo_by_tier("balanced")

    if not combo or not combo.get("legs"):
        return {
            "date": now_local.strftime("%d/%m/%Y"),
            "active_subscribers": active_subscribers,
            "combo_total_odds": None,
            "legs_count": 0,
            "blast_text": None,
        }

    return {
        "date": now_local.strftime("%d/%m/%Y"),
        "active_subscribers": active_subscribers,
        "combo_total_odds": combo.get("total_odds"),
        "legs_count": len(combo.get("legs", [])),
        "blast_text": _build_whatsapp_blast_text(combo, now_local),
    }


class BroadcastPicksPayload(BaseModel):
    tier: str = "pro"
    combo_tier: str = "balanced"


@app.post("/api/admin/broadcast/picks")
async def admin_broadcast_picks(
    payload_in: BroadcastPicksPayload,
    payload: dict = Depends(get_current_user_payload),
):
    await _require_admin(payload)
    combo = await _get_combo_by_tier(payload_in.combo_tier)
    if not combo or not combo.get("legs"):
        raise HTTPException(status_code=400, detail="Aucun combiné disponible pour ce niveau aujourd'hui")

    paid_users = await db.users.find({"subscription": {"$ne": "free"}}).to_list(length=2000)
    html = _build_combo_email_html(combo, payload_in.combo_tier)
    subject = f"🎯 Ton combiné {_combo_display_name(payload_in.combo_tier)} du jour"

    sent = drafted = errors = 0
    for u in paid_users:
        try:
            ok = await _send_email(u["email"], subject, html)
            if ok:
                sent += 1
            elif not RESEND_API_KEY:
                drafted += 1
            else:
                errors += 1
        except Exception:
            errors += 1

    return {"sent": sent, "drafted": drafted, "errors": errors, "total_recipients": len(paid_users)}


@app.post("/api/admin/broadcast/free-weekly-teaser")
async def admin_broadcast_free_teaser(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)
    combo = await _get_combo_by_tier("safe")
    if not combo or not combo.get("legs"):
        raise HTTPException(status_code=400, detail="Aucun pick disponible pour le teaser aujourd'hui")

    free_users = await db.users.find({"subscription": "free"}).to_list(length=5000)
    html = _build_teaser_email_html(combo)

    sent = errors = 0
    for u in free_users:
        try:
            ok = await _send_email(u["email"], "🎁 Pari de la semaine — 1 pick offert", html)
            sent += 1 if ok else 0
            errors += 0 if ok else 1
        except Exception:
            errors += 1

    return {"users": len(free_users), "sent": sent, "errors": errors}


@app.post("/api/admin/test-email")
async def admin_test_email(payload: dict = Depends(get_current_user_payload)):
    user = await _require_admin(payload)
    combo = await _get_combo_by_tier("balanced")
    html = (
        _build_combo_email_html(combo, "balanced")
        if combo and combo.get("legs")
        else _email_layout("Test WinPulse", "<p>Aucun combiné disponible actuellement, mais l'envoi d'email fonctionne.</p>")
    )

    if not RESEND_API_KEY:
        return {"status": "draft", "email_id": None, "error": None}

    ok = await _send_email(user["email"], "🧪 Test WinPulse", html)
    return {
        "status": "sent" if ok else "error",
        "email_id": None,
        "error": None if ok else "Échec de l'envoi (verifie RESEND_API_KEY)",
    }


@app.post("/api/admin/auto-follower/run")
async def admin_auto_follower_run(
    dry_run: bool = False,
    payload: dict = Depends(get_current_user_payload),
):
    await _require_admin(payload)
    combo = await _get_combo_by_tier("balanced")
    if not combo or not combo.get("legs"):
        return {"no_picks": True, "sent": 0, "skipped_already_sent": 0, "errors": 0}

    paid_users = await db.users.find({"subscription": {"$ne": "free"}}).to_list(length=2000)
    today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    html = _build_combo_email_html(combo, "balanced")

    sent = skipped = errors = 0
    for u in paid_users:
        already = await db.auto_follower_log.find_one({"user_id": u["id"], "date": today_key})
        if already:
            skipped += 1
            continue
        if dry_run:
            sent += 1
            continue
        try:
            ok = await _send_email(u["email"], "🌅 Ton combiné du matin — WinPulse", html)
            if ok:
                sent += 1
                await db.auto_follower_log.insert_one({
                    "user_id": u["id"],
                    "date": today_key,
                    "sent_at": datetime.now(timezone.utc).isoformat(),
                })
            else:
                errors += 1
        except Exception:
            errors += 1

    return {"sent": sent, "skipped_already_sent": skipped, "errors": errors, "no_picks": False}


@app.get("/api/admin/subscription-requests")
async def admin_list_subscription_requests(
    status_filter: str = "pending",
    payload: dict = Depends(get_current_user_payload),
):
    await _require_admin(payload)
    query = {} if status_filter == "all" else {"status": status_filter}
    requests = await db.subscription_requests.find(query).sort("created_at", -1).to_list(length=200)
    for r in requests:
        r.pop("_id", None)
    return requests


@app.post("/api/admin/subscription-requests/{reference}/approve")
async def admin_approve_subscription_request(
    reference: str,
    payload: dict = Depends(get_current_user_payload),
):
    await _require_admin(payload)
    req = await db.subscription_requests.find_one({"reference": reference})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req["status"] == "approved":
        return {"ok": True, "detail": "Deja approuvee"}
    if req.get("payment_provider") == "fedapay" and not req.get("fedapay_verified_at"):
        raise HTTPException(
            status_code=409,
            detail="Paiement FedaPay non verifie : l'activation manuelle est bloquee pour cette demande.",
        )

    plan = next((p for p in SUBSCRIPTION_PLANS if p["id"] == req["plan_id"]), None)
    duration_days = plan["duration_days"] if plan else 30
    expires_at = _compute_expiry(duration_days)

    await db.users.update_one(
        {"id": req["user_id"]},
        {"$set": {
            "subscription": req["plan_id"],
            "subscription_expires_at": expires_at,
        }},
    )
    await db.subscription_requests.update_one(
        {"reference": reference},
        {"$set": {
            "status": "approved",
            "approved_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    await send_subscription_activated_email(
        req["user_email"], plan["name"] if plan else req["plan_id"], expires_at
    )
    return {"ok": True, "detail": f"Abonnement {req['plan_id']} active pour {req['user_email']} ({duration_days} jours)"}


@app.post("/api/admin/subscription-requests/{reference}/reject")
async def admin_reject_subscription_request(
    reference: str,
    payload: dict = Depends(get_current_user_payload),
):
    await _require_admin(payload)
    req = await db.subscription_requests.find_one({"reference": reference})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    await db.subscription_requests.update_one(
        {"reference": reference},
        {"$set": {
            "status": "rejected",
            "rejected_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "detail": "Demande rejetee"}



# ─── Montante 10/15 jours ────────────────────────────────────────────────────
# Etat persiste dans MongoDB : un deploiement/restart du serveur ne remet donc
# jamais la montante a zero. Les picks viennent exclusivement des pronostics
# reels deja produits par prediction_engine.py.
MONTANTE_DOC_ID = "active"
MONTANTE_DEFAULT_DAYS = 10
MONTANTE_MAX_PICKS = 2
MONTANTE_MIN_CONFIDENCE = 0.70  # Minimum verified estimate; not UI confidence.
MONTANTE_MIN_ODDS = 1.15
MONTANTE_MAX_ODDS = 3.50
MONTANTE_MIN_BOOKS = 3
MONTANTE_MIN_STABILITY = 65.0
MONTANTE_MAX_ODDS_AGE_MINUTES = 30
_montante_selection_lock = asyncio.Lock()
# Résultats Montante : contrôle ciblé, indépendant du Track Record général.
# 5 minutes = progression quasi immédiate une fois le score final publié,
# sans relancer toutes les cotes de la plateforme.
MONTANTE_RESULT_SYNC_MINUTES = max(2, min(int(os.environ.get("MONTANTE_RESULT_SYNC_MINUTES", "5")), 30))
_montante_result_sync_lock = asyncio.Lock()

montante_selector = MontanteService(
    days=MONTANTE_DEFAULT_DAYS,
    max_picks_per_day=MONTANTE_MAX_PICKS,
    min_confidence=MONTANTE_MIN_CONFIDENCE,
    min_odds=MONTANTE_MIN_ODDS,
    max_odds=MONTANTE_MAX_ODDS,
    min_edge=-3.0,  # Percentage points; do not claim positive expected returns.
    min_books=MONTANTE_MIN_BOOKS,
    min_stability=MONTANTE_MIN_STABILITY,
    max_odds_age_minutes=MONTANTE_MAX_ODDS_AGE_MINUTES,
    initial_bankroll=10000.0,
)


def _montante_public(doc: Optional[Dict]) -> Dict:
    if not doc:
        return {"status": "NONE", "message": "Aucune montante active."}
    out = copy.deepcopy(doc)
    out.pop("_id", None)
    return out


async def _montante_get() -> Optional[Dict]:
    doc = await db.montantes.find_one({"_id": MONTANTE_DOC_ID})
    return doc


async def _montante_save(state: Dict, reset: bool = False) -> Dict:
    state = dict(state)
    state["_id"] = MONTANTE_DOC_ID
    if reset:
        await db.montantes.replace_one({"_id": MONTANTE_DOC_ID}, state, upsert=True)
        return _montante_public(state)
    values = {k: v for k, v in state.items() if k != "_id"}
    saved = await db.montantes.find_one_and_update(
        {"_id": MONTANTE_DOC_ID, "id": state.get("id"), "current_day": state.get("current_day"), "status": state.get("status"),
         "current_picks": state.get("current_picks") or []},
        {"$set": values}, return_document=ReturnDocument.AFTER,
    )
    return _montante_public(saved) if saved else _montante_public(await _montante_get() or state)


async def _montante_commit_settlement(state: Dict, expected_day: int) -> Dict:
    saved = await db.montantes.find_one_and_update(
        {"_id": MONTANTE_DOC_ID, "id": state.get("id"), "current_day": expected_day, "status": "ACTIVE",
         "current_picks": (state.get("history") or [{}])[-1].get("picks") or []},
        {"$set": {k: v for k, v in state.items() if k != "_id"}}, return_document=ReturnDocument.AFTER,
    )
    return _montante_public(saved) if saved else _montante_public(await _montante_get() or state)


async def _montante_view_for_payload(state: Optional[Dict], payload: dict) -> Dict:
    """Construit UNE vue de la même Montante pour Admin, Pro et Free.

    La sélection source est globale (MONTANTE_DOC_ID=active) : Admin et Pro
    reçoivent exactement les mêmes picks. Free reçoit exactement le même nombre
    d'emplacements, mais aucun détail permettant de reconstituer les picks.
    Les contrôles Admin sont pilotés par le rôle relu en base, jamais uniquement
    par un état React potentiellement périmé.
    """
    user = await _get_user_from_payload(payload)
    is_admin = bool(user and user.get("is_admin"))
    subscription = str((user or {}).get("subscription") or "free").lower()
    has_paid_access = bool(is_admin or subscription != "free")

    public = _montante_public(state) if state else {
        "status": "NONE",
        "message": "Aucune montante active.",
    }

    history = list(public.get("history") or [])
    completed_days = len({item.get("day") for item in history if item.get("status") == "WIN"})
    total_days = max(1, int(public.get("days") or MONTANTE_DEFAULT_DAYS))

    public["viewer"] = {
        "is_admin": is_admin,
        "subscription": subscription,
        "has_premium_access": has_paid_access,
    }
    public["admin_controls"] = is_admin
    public["can_start"] = is_admin
    public["same_selection_for_all"] = True
    public["reinvestment_mode"] = "FULL"
    public["result_sync_interval_minutes"] = MONTANTE_RESULT_SYNC_MINUTES
    public["completed_days"] = completed_days
    public["progress"] = 100.0 if public.get("status") == "COMPLETED" else round(
        min(completed_days, total_days) / total_days * 100.0, 1
    )
    public["current_stake"] = round(
        float(public.get("theoretical_bankroll") or 0), 2
    ) if public.get("status") == "ACTIVE" else 0.0

    current_picks = list(public.get("current_picks") or [])
    current_pick_count = len(current_picks)
    public["picks_locked"] = not has_paid_access
    public["current_pick_count"] = current_pick_count
    public["has_current_picks"] = current_pick_count > 0
    public["selection_version"] = public.get("selection_version") or "legacy"
    public["minimum_matches_per_step"] = 2
    public["selection_policy"] = {"model_estimates_only": True, "requires_two_distinct_matches": True, "low_odds_bonus": False, "minimum_sources": MONTANTE_MIN_BOOKS, "historically_validated": False}
    public["current_picks_preview"] = [
        {"slot": index + 1, "locked": not has_paid_access}
        for index in range(current_pick_count)
    ]

    # Les diagnostics internes et contrôles opérationnels restent Admin-only.
    if not is_admin:
        public.pop("diagnostic", None)
        public.pop("last_result_sync", None)

    if not has_paid_access:
        # Free : même nombre de picks, zéro fuite du contenu premium.
        public["current_picks"] = []
        public.pop("selection_summary", None)

        safe_history = []
        for history_item in history:
            safe_item = dict(history_item)
            history_picks = list(safe_item.get("picks") or [])
            safe_item["pick_count"] = len(history_picks)
            safe_item["picks_preview"] = [
                {"slot": index + 1, "locked": True}
                for index in range(len(history_picks))
            ]
            safe_item["picks"] = []
            safe_history.append(safe_item)
        public["history"] = safe_history

        # Le statut de règlement peut être montré sans révéler le pari.
        settlement = public.get("last_settlement_check")
        if isinstance(settlement, dict):
            statuses = list(settlement.get("statuses") or [])
            public["last_settlement_check"] = {
                "checked_at": settlement.get("checked_at"),
                "statuses": statuses,
                "details": [
                    {"slot": i + 1, "status": status}
                    for i, status in enumerate(statuses)
                ],
            }

    return public


def _montante_norm_text(value: str) -> str:
    """Normalisation stable pour relier un pick Montante au Track Record."""
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"[^a-z0-9.+-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


async def _montante_find_resolved_prediction(pick: Dict) -> Optional[Dict]:
    """Retrouve le résultat d'un pick Montante sans dépendre d'un libellé strict.

    Priorité : signature persistée -> match_id -> fallback équipes+horaire.
    Cela couvre aussi les picks créés avant l'ajout de ``history_signature``.
    """
    resolved_filter = {"$in": ["won", "lost", "void"]}
    pick_text = str(pick.get("pick") or "").strip()
    match_id_raw = pick.get("match_id")
    match_id = str(match_id_raw or "").strip()
    signature = str(pick.get("history_signature") or "").strip()

    # 1) Lien déterministe pour les nouvelles sélections Montante.
    if signature:
        doc = await db.predictions_history.find_one({
            "signature": signature,
            "result": resolved_filter,
        })
        if doc:
            return doc

    # 2) Même événement : tolère match_id stocké en chaîne ou dans son type natif
    # et compare le libellé du pick de manière normalisée.
    if match_id:
        id_values = [match_id]
        if match_id_raw is not None and match_id_raw != match_id:
            id_values.append(match_id_raw)
        docs = await db.predictions_history.find({
            "match_id": {"$in": id_values},
            "result": resolved_filter,
        }).sort("created_at", -1).to_list(length=50)

        target_pick = _montante_norm_text(pick_text)
        target_market = _montante_norm_text(pick.get("market"))
        for doc in docs:
            if target_pick and _montante_norm_text(doc.get("pick")) == target_pick:
                return doc

        # Si le moteur a légèrement renommé le pick, un marché unique sur le même
        # match est un fallback suffisamment sûr.
        same_market = [
            doc for doc in docs
            if target_market and _montante_norm_text(doc.get("market")) == target_market
        ]
        # A market can have opposite selections: never resolve by market alone.


    # 3) Migration/anciens états : rapprochement équipes + horaire (±12 h).
    home = str(pick.get("home_team") or "").strip()
    away = str(pick.get("away_team") or "").strip()
    if home and away:
        docs = await db.predictions_history.find({
            "result": resolved_filter,
            "home_team": home,
            "away_team": away,
        }).sort("created_at", -1).to_list(length=100)
        pick_dt = _parse_iso(pick.get("start_time"))
        target_pick = _montante_norm_text(pick_text)
        target_market = _montante_norm_text(pick.get("market"))
        candidates = []
        for doc in docs:
            doc_dt = _parse_iso(doc.get("commence_time"))
            if not pick_dt or not doc_dt or abs((doc_dt - pick_dt).total_seconds()) > 15 * 60:
                continue
            candidates.append(doc)
            if target_pick and _montante_norm_text(doc.get("pick")) == target_pick:
                return doc
        same_market = [
            doc for doc in candidates
            if target_market and _montante_norm_text(doc.get("market")) == target_market
        ]
        # A market can have opposite selections: never resolve by market alone.


    return None


async def _montante_reconcile(state: Dict) -> Dict:
    """Met à jour automatiquement la journée depuis les résultats du Track Record."""
    if state.get("status") != "ACTIVE":
        return state
    picks = state.get("current_picks") or []
    if not picks:
        return state
    expected_day = int(state.get("current_day", 1))

    statuses = []
    settlement_details = []
    for pick in picks:
        if not pick.get("pick"):
            statuses.append("PENDING")
            settlement_details.append({"match_id": pick.get("match_id"), "status": "PENDING", "reason": "pick_missing"})
            continue

        doc = await _montante_find_resolved_prediction(pick)
        if not doc:
            statuses.append("PENDING")
            settlement_details.append({"match_id": pick.get("match_id"), "status": "PENDING", "reason": "result_not_linked"})
            continue

        result = str(doc.get("result") or "").lower()
        status_value = "WIN" if result == "won" else "LOSS" if result == "lost" else "VOID"
        statuses.append(status_value)
        settlement_details.append({
            "match_id": pick.get("match_id"),
            "status": status_value,
            "history_signature": doc.get("signature"),
            "final_score": doc.get("final_score"),
            "reconciled_at": doc.get("reconciled_at"),
        })

    state["last_settlement_check"] = {
        "day": int(state.get("current_day", 1) or 1),
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "statuses": statuses,
        "details": settlement_details,
    }

    if "LOSS" in statuses:
        # Montante = réinvestissement intégral. La mise du jour correspond donc
        # à tout le capital théorique disponible avant le règlement.
        stake_before = round(
            float(state.get("theoretical_bankroll", state.get("initial_bankroll", 10000)) or 0),
            2,
        )
        potential_combined_odds = 1.0
        for pick in picks:
            potential_combined_odds *= float(pick.get("odds") or 1)

        state["status"] = "FAILED"
        state["failed_at"] = datetime.now(timezone.utc).isoformat()
        state["waiting_reason"] = "La montante a perdu sur le jour en cours."
        # Une montante jouée à 100 % perd son capital théorique si la journée perd.
        state["theoretical_bankroll"] = 0.0
        state.setdefault("history", []).append({
            "day": state.get("current_day", 1),
            "status": "LOSS",
            "settled_at": datetime.now(timezone.utc).isoformat(),
            "stake_before": stake_before,
            "combined_odds": round(potential_combined_odds, 3),
            "profit": round(-stake_before, 2),
            "bankroll_after": 0.0,
            "picks": picks,
        })
        return await _montante_commit_settlement(state, expected_day)

    if statuses and all(x in ("WIN", "VOID") for x in statuses):
        # Un pari void/push est remboursé : multiplicateur 1.00 dans la montante.
        # Le principe de la montante est un réinvestissement intégral :
        # capital du jour suivant = mise du jour + gain = mise * cote combinée.
        stake_before = round(
            float(state.get("theoretical_bankroll", state.get("initial_bankroll", 10000)) or 0),
            2,
        )
        combined_odds = 1.0
        for pick, pick_status in zip(picks, statuses):
            if pick_status == "WIN":
                combined_odds *= float(pick.get("odds") or 1)

        bankroll_after = round(stake_before * combined_odds, 2)
        profit = round(bankroll_after - stake_before, 2)
        state["theoretical_bankroll"] = bankroll_after
        state.setdefault("history", []).append({
            "day": state.get("current_day", 1),
            "status": "WIN" if any(x == "WIN" for x in statuses) else "VOID",
            "settled_at": datetime.now(timezone.utc).isoformat(),
            "stake_before": stake_before,
            "combined_odds": round(combined_odds, 3),
            "profit": profit,
            "bankroll_after": bankroll_after,
            "picks": picks,
        })
        if not any(x == "WIN" for x in statuses):
            state["current_picks"] = []
            state["waiting_reason"] = "Étape annulée : recherche de deux nouveaux matchs pour cette même étape."
        elif int(state.get("current_day", 1)) >= int(state.get("days", 10)):
            state["status"] = "COMPLETED"
            state["completed_at"] = datetime.now(timezone.utc).isoformat()
            state["waiting_reason"] = None
            state["current_picks"] = []
        else:
            state["current_day"] = int(state.get("current_day", 1)) + 1
            state["current_picks"] = []
            state["waiting_reason"] = "Jour gagné. Recherche des picks du prochain jour."
        return await _montante_commit_settlement(state, expected_day)
    return state


def _montante_selection_fields() -> List[str]:
    return ["current_picks", "waiting_reason", "diagnostic", "selection_summary", "selection_version", "updated_at", "last_settlement_check"]


async def _montante_publish_selection(state: Dict) -> Dict:
    # CAS across replicas: the first published pair remains the official pair.
    saved = await db.montantes.find_one_and_update(
        {"_id": MONTANTE_DOC_ID, "id": state.get("id"), "status": "ACTIVE", "current_day": state.get("current_day"),
         "$or": [{"current_picks": {"$exists": False}}, {"current_picks": {"$size": 0}}]},
        {"$set": {key: state[key] for key in _montante_selection_fields() if key in state}},
        return_document=ReturnDocument.AFTER,
    )
    return _montante_public(saved) if saved else _montante_public(await _montante_get() or state)


async def _montante_prepare_next_day(state: Dict) -> Dict:
    if state.get("status") != "ACTIVE" or state.get("current_picks"):
        return state
    async with _montante_selection_lock:
        latest = await _montante_get()
        if latest:
            if latest.get("id") != state.get("id") or latest.get("status") != "ACTIVE" or latest.get("current_picks"):
                return _montante_public(latest)
            state = _montante_public(latest)
            checked = _parse_iso((state.get("diagnostic") or {}).get("generated_at"))
            if checked and (state.get("diagnostic") or {}).get("day") == state.get("current_day") and (datetime.now(timezone.utc) - checked).total_seconds() < 45:
                return state
        try:
            return await asyncio.wait_for(_montante_choose_pair(state), timeout=18)
        except asyncio.TimeoutError:
            state["waiting_reason"] = "Le flux est temporairement indisponible. La sélection reste en attente de deux matchs vérifiés."
            state["updated_at"] = datetime.now(timezone.utc).isoformat()
            return await _montante_publish_selection(state)


async def _montante_choose_pair(state: Dict) -> Dict:
    matches = await fetch_all_matches(db)
    now = datetime.now(timezone.utc)
    diagnostic = {"generated_at": now.isoformat(), "day": state.get("current_day"), "window_hours": 72, "matches_received": len(matches),
                  "criteria": {"min_probability": MONTANTE_MIN_CONFIDENCE, "min_odds": MONTANTE_MIN_ODDS,
                               "max_odds": MONTANTE_MAX_ODDS, "minimum_sources": MONTANTE_MIN_BOOKS,
                               "minimum_stability": MONTANTE_MIN_STABILITY, "required_matches": 2}}
    try:
        status = await get_odds_cache_status(db)
    except Exception:
        status = {}
    diagnostic["odds_cache_updated_at"] = status.get("updated_at")
    diagnostic["odds_cache_hard_stale"] = status.get("hard_stale")
    if status.get("hard_stale") is True:
        state["diagnostic"] = diagnostic
        state["waiting_reason"] = "Les cotes sont trop anciennes : attente d’un flux actualisé pour vérifier deux matchs."
        state["updated_at"] = now.isoformat()
        return await _montante_publish_selection(state)
    stats = await get_real_stats_map(db, matches)
    predictions = analyze_all(matches, real_stats_map=stats)
    raw_by_id = {str(m.get("id") or m.get("match_id")): m for m in matches if isinstance(m, dict)}
    previously_used = {str(p.get("match_id")) for h in state.get("history", []) for p in h.get("picks", []) if p.get("match_id")}
    candidates = []
    for prediction in predictions:
        if not isinstance(prediction, dict):
            continue
        match_id = str(prediction.get("match_id") or "")
        raw = raw_by_id.get(match_id)
        start = _parse_iso(prediction.get("commence_time"))
        if not raw or match_id in previously_used or not start or not now + timedelta(minutes=5) <= start <= now + timedelta(hours=72):
            continue
        if raw.get("completed") or raw.get("is_finished"):
            continue
        # Keep official predictions unchanged; attach observed odds only for checks.
        candidate = dict(prediction)
        candidate["_bookmakers"] = raw.get("bookmakers", [])
        candidate["_odds_snapshot_at"] = status.get("updated_at")
        candidates.append(candidate)
    selected = montante_selector.select_daily_picks(candidates, limit=2)
    diagnostic.update(montante_selector.last_diagnostic)
    diagnostic["predictions_generated"] = len(predictions)
    state["diagnostic"] = diagnostic
    state["selection_version"] = montante_selector.VERSION
    state["updated_at"] = now.isoformat()
    if len(selected) != 2:
        state["current_picks"] = []
        state["selection_summary"] = None
        state["waiting_reason"] = "Deux matchs distincts ne respectent pas encore les contrôles. La montante reste en attente sans ajouter une sélection faible."
        return await _montante_publish_selection(state)
    for item in selected:
        signature = _pick_signature(str(item["match_id"]), item["pick"])
        item["history_signature"] = signature
        await db.predictions_history.update_one(
            {"signature": signature},
            {"$setOnInsert": {"signature": signature, "match_id": item["match_id"],
                "home_team": item["home_team"], "away_team": item["away_team"],
                "sport_title": item.get("sport_title"), "sport_key": item.get("sport_key"),
                "commence_time": item["start_time"], "pick": item["pick"], "market": item["market"],
                "pick_raw": item.get("pick_raw"), "pick_point": item.get("pick_point"),
                "pick_odds": item["odds"], "confidence": (item["confidence"] * 100 if item["confidence"] is not None else None),
                "model_probability": item["model_probability"] * 100, "edge": item["edge"],
                "model_version": MODEL_VERSION, "selector_version": montante_selector.VERSION,
                "is_combo": False, "official_track_eligible": False, "result": "pending",
                "created_at": now.isoformat(), "source": "montante"}}, upsert=True,
        )
    state["current_picks"] = selected
    state["waiting_reason"] = None
    state["selection_summary"] = {
        "combined_odds": round(math.prod(p["odds"] for p in selected), 3),
        "independence_estimate": round(math.prod(p["model_probability"] for p in selected) * 100, 1),
        "assumption": "Indépendance supposée ; estimation du moteur, pas une fréquence de réussite vérifiée.",
        "minimum_sources": min(p["num_books"] for p in selected), "published_at": now.isoformat(),
    }
    state["last_settlement_check"] = {"day": int(state.get("current_day", 1)), "checked_at": now.isoformat(),
        "statuses": ["PENDING", "PENDING"], "details": [{"slot": i+1, "match_id": p["match_id"],
        "history_signature": p["history_signature"], "status": "PENDING"} for i,p in enumerate(selected)]}
    return await _montante_publish_selection(state)




def _montante_expected_result_delay_minutes(pick: Dict) -> int:
    """Délai minimal avant d'interroger le fournisseur pour un score final."""
    sport = _normalize_sport({
        "sport_key": pick.get("sport_key"),
        "sport_title": pick.get("sport_title") or pick.get("league"),
    })
    return {
        "football": 115,
        "american_football": 210,
        "basketball": 155,
        "hockey": 165,
        "baseball": 210,
        "tennis": 90,
        "mma": 90,
    }.get(sport, 120)


def _montante_provider_check_due(state: Dict) -> bool:
    now = datetime.now(timezone.utc)
    picks = list(state.get("current_picks") or [])
    if not picks:
        return False
    for pick in picks:
        start = _parse_iso(pick.get("start_time"))
        if not start:
            continue
        delay = timedelta(minutes=_montante_expected_result_delay_minutes(pick))
        if now >= start + delay:
            return True
    return False


async def _montante_linked_prediction_doc(pick: Dict) -> Optional[Dict]:
    signature = str(pick.get("history_signature") or "").strip()
    if not signature and pick.get("match_id") and pick.get("pick"):
        signature = _pick_signature(str(pick.get("match_id")), str(pick.get("pick")))
    if signature:
        doc = await db.predictions_history.find_one({"signature": signature})
        if doc:
            return doc

    # Compatibilité avec les montantes créées avant history_signature.
    match_id = pick.get("match_id")
    if match_id is not None:
        docs = await db.predictions_history.find({
            "match_id": {"$in": [match_id, str(match_id)]},
        }).sort("created_at", -1).to_list(length=50)
        target_pick = _montante_norm_text(pick.get("pick"))
        for doc in docs:
            if target_pick and _montante_norm_text(doc.get("pick")) == target_pick:
                return doc
    return None


async def _montante_sync_current_results(*, force_provider: bool = False) -> tuple[Dict, Dict]:
    """Synchronise uniquement les 1–2 picks de la Montante courante.

    Contrairement au Track Record général, cette routine ne balaie pas des milliers
    de pronostics. Elle interroge uniquement les sports des picks courants, puis
    appelle immédiatement _montante_reconcile afin de passer au jour suivant.
    """
    async with _montante_result_sync_lock:
        state = await _montante_get()
        if not state:
            return {"status": "NONE"}, {"checked": 0, "updated": 0, "progressed": False}

        before_day = int(state.get("current_day", 1) or 1)
        before_status = str(state.get("status") or "NONE")

        # Toujours consommer d'abord les résultats déjà disponibles en base.
        state = await _montante_reconcile(state)
        if state.get("status") == "ACTIVE" and not state.get("current_picks"):
            state = await _montante_prepare_next_day(state)

        if state.get("status") != "ACTIVE" or not state.get("current_picks"):
            diagnostic = {
                "checked_at": datetime.now(timezone.utc).isoformat(),
                "checked": 0,
                "updated": 0,
                "progressed": int(state.get("current_day", 1) or 1) > before_day or str(state.get("status")) != before_status,
                "provider_called": False,
            }
            return state, diagnostic

        now = datetime.now(timezone.utc)
        last_sync = _parse_iso(state.get("last_result_sync_at"))
        cooldown = timedelta(minutes=MONTANTE_RESULT_SYNC_MINUTES)
        provider_due = force_provider or _montante_provider_check_due(state)
        cooldown_ok = force_provider or not last_sync or now >= last_sync + cooldown

        if not provider_due or not cooldown_ok:
            diagnostic = {
                "checked_at": now.isoformat(),
                "checked": len(state.get("current_picks") or []),
                "updated": 0,
                "progressed": False,
                "provider_called": False,
                "reason": "waiting_expected_end" if not provider_due else "cooldown",
            }
            return state, diagnostic

        linked_docs = []
        for pick in state.get("current_picks") or []:
            doc = await _montante_linked_prediction_doc(pick)
            if doc:
                linked_docs.append(doc)

        pending_docs = [
            doc for doc in linked_docs
            if str(doc.get("result") or "pending").lower() == "pending"
        ]

        diagnostic = {
            "checked_at": now.isoformat(),
            "checked": len(linked_docs),
            "pending_before": len(pending_docs),
            "updated": 0,
            "provider_called": bool(pending_docs),
            "progressed": False,
            "errors": 0,
        }

        if pending_docs:
            classic_docs = [
                doc for doc in pending_docs
                if not str(doc.get("match_id") or "").startswith("oaio-")
            ]
            oaio_docs = [
                doc for doc in pending_docs
                if str(doc.get("match_id") or "").startswith("oaio-")
            ]

            required_sport_keys = sorted({
                str(doc.get("sport_key") or "").strip()
                for doc in classic_docs
                if str(doc.get("sport_key") or "").strip()
            })

            scores = []
            if classic_docs:
                try:
                    scores = await fetch_all_scores(
                        db,
                        sport_keys=required_sport_keys or None,
                        force_refresh=True,
                        days_from=3,
                        include_archive=True,
                        archive_days=60,
                    )
                except Exception:
                    diagnostic["errors"] += 1
                    scores = []
            scores_by_match = {str(s.get("id")): s for s in scores if s.get("id")}

            oaio_scores_map = {}
            if oaio_docs:
                try:
                    oaio_scores_map = await fetch_odds_api_io_scores_map()
                except Exception:
                    diagnostic["errors"] += 1
                    oaio_scores_map = {}

            for pred in pending_docs:
                try:
                    match_id = str(pred.get("match_id") or "")
                    home_score = away_score = None
                    source = None

                    if match_id.startswith("oaio-"):
                        numeric_id = match_id[len("oaio-"):]
                        entry = oaio_scores_map.get(numeric_id)
                        if not entry:
                            entry = _find_oaio_score_fallback(pred, oaio_scores_map)
                        if entry:
                            home_score = int(entry["home_score"])
                            away_score = int(entry["away_score"])
                            if entry.get("_teams_reversed"):
                                home_score, away_score = away_score, home_score
                            source = "montante_odds_api_io"
                    else:
                        score_entry = scores_by_match.get(match_id) or _find_score_fallback(pred, scores)
                        if score_entry and score_entry.get("completed"):
                            home_score, away_score = _score_pair(score_entry)
                            if home_score is None or away_score is None:
                                for row in score_entry.get("scores") or []:
                                    name = _norm_team_for_reconcile(row.get("name"))
                                    try:
                                        value = int(row.get("score"))
                                    except Exception:
                                        continue
                                    if name == _norm_team_for_reconcile(pred.get("home_team")):
                                        home_score = value
                                    elif name == _norm_team_for_reconcile(pred.get("away_team")):
                                        away_score = value
                            if score_entry.get("_teams_reversed") and home_score is not None and away_score is not None:
                                home_score, away_score = away_score, home_score
                            source = "montante_scores_api"

                    if home_score is None or away_score is None:
                        continue

                    result_value = _evaluate_pick_result(pred, int(home_score), int(away_score))
                    if not result_value:
                        continue

                    await db.predictions_history.update_one(
                        {"signature": pred["signature"]},
                        {"$set": {
                            "result": result_value,
                            "final_score": f"{home_score}-{away_score}",
                            "reconciled_at": datetime.now(timezone.utc).isoformat(),
                            "reconciliation_source": source,
                        }},
                    )
                    diagnostic["updated"] += 1
                except Exception:
                    diagnostic["errors"] += 1

        # Un résultat nouvellement enregistré doit produire l'effet Montante
        # dans la même transaction logique, sans attendre le scheduler général.
        state = await _montante_get() or state
        state = await _montante_reconcile(state)
        if state.get("status") == "ACTIVE" and not state.get("current_picks"):
            state = await _montante_prepare_next_day(state)

        after_day = int(state.get("current_day", 1) or 1)
        after_status = str(state.get("status") or "NONE")
        diagnostic["progressed"] = after_day > before_day or after_status != before_status
        diagnostic["day_before"] = before_day
        diagnostic["day_after"] = after_day
        diagnostic["status_before"] = before_status
        diagnostic["status_after"] = after_status

        state["last_result_sync_at"] = datetime.now(timezone.utc).isoformat()
        state["last_result_sync"] = diagnostic
        await _montante_save(state)
        return state, diagnostic


@app.get("/api/montante")
async def get_montante(payload: dict = Depends(get_current_user_payload)):
    state = await _montante_get()
    if not state:
        return await _montante_view_for_payload(None, payload)

    # 1) applique immédiatement un résultat déjà réconcilié en base ;
    # 2) si le match devrait être terminé et le cooldown écoulé, déclenche un
    #    contrôle ciblé. Ainsi l'ouverture de la page peut elle-même rattraper
    #    une Montante, sans dépendre uniquement du scheduler.
    state = await _montante_reconcile(state)
    if state.get("status") == "ACTIVE" and state.get("current_picks") and _montante_provider_check_due(state):
        try:
            state, _ = await asyncio.wait_for(_montante_sync_current_results(force_provider=False), timeout=6)
        except Exception:
            # L'affichage reste disponible même si le fournisseur de scores est indisponible.
            state = await _montante_get() or state

    if state.get("status") == "ACTIVE" and not state.get("current_picks"):
        state = await _montante_prepare_next_day(state)

    return await _montante_view_for_payload(state, payload)


@app.post("/api/montante/start")
async def start_montante(
    days: int = 10,
    initial_bankroll: float = 10000,
    payload: dict = Depends(get_current_user_payload),
):
    await _require_admin(payload)
    if days not in (10, 15):
        raise HTTPException(status_code=400, detail="days doit être 10 ou 15")
    if not math.isfinite(initial_bankroll) or initial_bankroll <= 0:
        raise HTTPException(status_code=400, detail="initial_bankroll doit être positif")
    state = montante_selector.create(days=days, initial_bankroll=initial_bankroll)
    previous = await _montante_get()
    if previous and previous.get("id"):
        archive = copy.deepcopy(previous)
        archive["_id"] = str(previous["id"])
        archive["archived_at"] = datetime.now(timezone.utc).isoformat()
        await db.montante_archives.replace_one({"_id": archive["_id"]}, archive, upsert=True)
    state["current_picks"] = []
    state["waiting_reason"] = "Sélection des meilleurs picks du jour..."
    state = await _montante_save(state, reset=True)
    state = await _montante_prepare_next_day(state)
    return await _montante_view_for_payload(state, payload)


@app.post("/api/montante/restart")
async def restart_montante(
    days: int = 10,
    initial_bankroll: float = 10000,
    payload: dict = Depends(get_current_user_payload),
):
    return await start_montante(days, initial_bankroll, payload)


@app.post("/api/montante/refresh")
async def refresh_montante(payload: dict = Depends(get_current_user_payload)):
    # Compatibilité avec l'ancien bouton Admin : même moteur ciblé que sync-results.
    await _require_admin(payload)
    state, _ = await _montante_sync_current_results(force_provider=True)
    if not state or state.get("status") == "NONE":
        raise HTTPException(status_code=404, detail="Aucune montante active")
    return await _montante_view_for_payload(state, payload)


@app.post("/api/montante/sync-results")
async def sync_montante_results(payload: dict = Depends(get_current_user_payload)):
    """Force immédiatement la lecture des scores des picks Montante courants.

    Admin-only : ce bouton peut consommer une requête fournisseur et ne doit pas
    être exposé aux comptes Free/Pro.
    """
    await _require_admin(payload)
    state, diagnostic = await _montante_sync_current_results(force_provider=True)
    view = await _montante_view_for_payload(state, payload)
    view["sync_diagnostic"] = diagnostic
    return view


async def _montante_sync_after_track_results() -> Dict:
    """Fait progresser la Montante immédiatement après la synchro des scores."""
    state = await _montante_get()
    if not state:
        return {"status": "NONE", "progressed": False}

    before_day = int(state.get("current_day", 1) or 1)
    before_status = state.get("status")
    state = await _montante_reconcile(state)

    # Dès qu'une journée est gagnée, préparer automatiquement la sélection du
    # jour suivant. Si aucun pick ne qualifie encore, l'état reste ACTIVE/en attente.
    if state.get("status") == "ACTIVE" and not state.get("current_picks"):
        state = await _montante_prepare_next_day(state)

    after_day = int(state.get("current_day", 1) or 1)
    after_status = state.get("status")
    return {
        "status": after_status,
        "current_day": after_day,
        "progressed": after_day > before_day or after_status != before_status,
        "waiting_reason": state.get("waiting_reason"),
    }


# ─── Combos ─────────────────────────────────────────────────────────────────

@app.get("/api/combos")
async def get_combos(payload: dict = Depends(get_current_user_payload)):
    await _require_paid_access(payload)
    matches = await fetch_all_matches(db)
    return build_multi_combos(matches)


@app.get("/api/combos/super")
async def get_super_combos(payload: dict = Depends(get_current_user_payload)):
    await _require_paid_access(payload)
    matches = await fetch_all_matches(db)
    return build_super_combos(matches)


@app.get("/api/combos/ultra-safe")
async def get_ultra_safe_combo(payload: dict = Depends(get_current_user_payload)):
    await _require_paid_access(payload)
    matches = await fetch_all_matches(db)
    today_matches = [m for m in matches if _is_today_match(m.get("commence_time", ""))]
    return build_ultra_safe_combo(today_matches)


def _prepare_today_combo_tier(tier: dict, tier_key: str, is_paid: bool) -> dict:
    """Copy before masking: never alter engine data or expose hidden picks."""
    prepared = copy.deepcopy(tier)
    legs = prepared.get("legs") or []
    prepared["leg_count"] = len(legs)
    prepared["locked"] = not is_paid and (tier_key != "sure" or len(legs) > 1)
    public_fields = (
        "match_id", "id", "home_team", "away_team", "sport_key", "sport_title",
        "commence_time", "country", "country_name", "league", "league_name",
    )
    visible = []
    for index, leg in enumerate(legs):
        if is_paid or (tier_key == "sure" and index == 0):
            leg["locked"] = False
            visible.append(leg)
        else:
            visible.append({**{field: leg[field] for field in public_fields if field in leg},
                            "locked": True, "pick": None, "pick_odds": None,
                            "confidence": None, "market_label": None})
    prepared["legs"] = visible
    if prepared["locked"]:
        # In a two-leg preview, the total odds would reveal the hidden leg's odds.
        for field in ("total_odds", "avg_confidence", "combined_probability", "correlation_penalty"):
            prepared[field] = None
        prepared["tagline"] = "Sélections complètes réservées aux abonnés"
        prepared["description"] = "Consulte les rencontres ; débloque leurs sélections avec Pro."
    return prepared


async def _load_today_combo_data(payload: Optional[dict]) -> dict:
    is_paid = await _has_paid_access(payload)  # Includes subscription expiry.
    matches = await fetch_all_matches(db)
    now = datetime.now(timezone.utc)
    upcoming = []
    for match in matches:
        if not isinstance(match, dict) or match.get("is_finished") or match.get("completed"):
            continue
        try:
            start = datetime.fromisoformat(str(match.get("commence_time") or "").replace("Z", "+00:00"))
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            if start > now:
                upcoming.append(match)
        except (ValueError, TypeError):
            continue
    # Keep the engine's selections and scores; only exclude unavailable events.
    result = copy.deepcopy(build_today_combos_by_sport(upcoming))
    for family in result.get("families", {}).values():
        family["tiers"] = {
            key: _prepare_today_combo_tier(tier, key, is_paid)
            for key, tier in family.get("tiers", {}).items()
        }
    if isinstance(result.get("ultra_safe"), dict):
        result["ultra_safe"] = _prepare_today_combo_tier(result["ultra_safe"], "ultra_safe", is_paid)
    result["access"] = {"is_paid": is_paid}
    result["upcoming_matches_today"] = result.get("total_matches_today", 0)
    result["schedule_timezone"] = "UTC"  # The existing engine's today boundary.
    result["loaded_at"] = now.isoformat()
    return result


@app.get("/api/combos/today")
async def get_today_combos(payload: Optional[dict] = Depends(get_optional_user_payload)):
    try:
        return await asyncio.wait_for(_load_today_combo_data(payload), timeout=16)
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Le chargement des combinés a pris trop de temps. Réessaie.")
    except Exception as exc:
        logging.getLogger(__name__).warning("Today combos unavailable: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Les combinés sont temporairement indisponibles. Réessaie.")


# ─── Alias de routes attendues par le frontend ──

@app.get("/api/predictions/today-combos")
async def get_predictions_today_combos_alias(payload: Optional[dict] = Depends(get_optional_user_payload)):
    return await get_today_combos(payload)


@app.get("/api/predictions/combos")
async def get_predictions_combos_alias(payload: dict = Depends(get_current_user_payload)):
    return await get_combos(payload)


@app.get("/api/builder/matches")
async def get_builder_matches(sport: Optional[str] = None, payload: Optional[dict] = Depends(get_optional_user_payload)):
    matches = await fetch_all_matches(db)
    matches = [m for m in matches if not _match_is_finished(m)]
    if sport and sport != "all":
        wanted_sport = str(sport).lower().strip()
        aliases = {
            "soccer": "football",
            "ice_hockey": "hockey",
            "icehockey": "hockey",
            "americanfootball": "american_football",
        }
        wanted_sport = aliases.get(wanted_sport, wanted_sport)
        matches = [m for m in matches if _normalize_sport(m) == wanted_sport]
    real_stats_map = await get_real_stats_map(db, matches)
    is_paid = await _has_paid_access(payload)
    FREE_UNLOCKED_MATCHES = 2
    result = []
    unlocked_matches_count = 0
    for m in matches:
        analyzed = analyze_match(m, real_stats_map=real_stats_map)
        raw_picks = analyzed.get("markets", [])
        if not raw_picks:
            continue
        this_match_gets_free_pick = (not is_paid) and (unlocked_matches_count < FREE_UNLOCKED_MATCHES)
        if this_match_gets_free_pick:
            unlocked_matches_count += 1
        picks = []
        for i, mk in enumerate(raw_picks):
            if is_paid:
                locked = False
            elif this_match_gets_free_pick and i == 0:
                locked = False
            else:
                locked = True
            picks.append({
                "market": None if locked else mk.get("market"),
                "market_label": "Marché verrouillé" if locked else mk.get("market_label"),
                "pick": None if locked else mk.get("pick"),
                "pick_odds": None if locked else mk.get("pick_odds"),
                "confidence": None if locked else mk.get("confidence"),
                "label": None if locked else mk.get("label"),
                "edge": None if locked else mk.get("edge", 0),
                "synthetic": mk.get("synthetic", False),
                "locked": locked,
            })
        result.append({
            "match_id": analyzed.get("match_id"),
            "sport_key": analyzed.get("sport_key"),
            "sport_title": analyzed.get("sport_title"),
            "home_team": analyzed.get("home_team"),
            "away_team": analyzed.get("away_team"),
            "commence_time": analyzed.get("commence_time"),
            "picks": picks,
        })
    return {"matches": result}


@app.get("/api/builder/stats/{match_id}")
async def get_builder_match_stats(match_id: str, payload: dict = Depends(get_current_user_payload)):
    await _require_paid_access(payload)
    matches = await fetch_all_matches(db)
    match = next((m for m in matches if str(m.get("id")) == str(match_id)), None)
    if not match:
        raise HTTPException(status_code=404, detail="Match introuvable")

    real_stats_map = await get_real_stats_map(db, [match])
    analyzed = analyze_match(match, real_stats_map=real_stats_map)
    implied = analyzed.get("implied_probs", {})
    home = analyzed.get("home_team", "")
    away = analyzed.get("away_team", "")

    probs = {
        "home_win": implied.get(home, 0),
        "draw": implied.get("Draw", 0),
        "away_win": implied.get(away, 0),
    }

    def _pct_for(market_key: str, pick_contains: str) -> float:
        for mk in analyzed.get("markets", []):
            if mk.get("market") == market_key and pick_contains.lower() in (mk.get("pick") or "").lower():
                odds = mk.get("pick_odds")
                return float(mk.get("confidence") or 0) if odds else 0
        return 0

    expectations = {
        "btts_yes_pct": _pct_for("syn_btts", "oui") or _pct_for("btts", "oui"),
        "over_2_5_pct": _pct_for("totals", "Plus de 2.5") or _pct_for("syn_over_25", "plus de"),
        "over_1_5_pct": _pct_for("totals", "Plus de 1.5") or _pct_for("syn_over_15", "plus de"),
        "clean_sheet_home_pct": _pct_for("syn_clean_sheet_home", home),
        "clean_sheet_away_pct": _pct_for("syn_clean_sheet_away", away),
    }

    return {"probs": probs, "expectations": expectations}


class SaveComboPayload(BaseModel):
    name: Optional[str] = ""
    legs: List[Dict]


@app.post("/api/builder/save")
async def save_builder_combo(
    payload_in: SaveComboPayload,
    payload: dict = Depends(get_current_user_payload),
):
    await _require_paid_access(payload)
    if not payload_in.legs:
        raise HTTPException(status_code=400, detail="Aucun pick selectionne")

    total_odds = 1.0
    for leg in payload_in.legs:
        total_odds *= leg.get("pick_odds") or 1

    combo_id = str(uuid.uuid4())
    combo_doc = {
        "id": combo_id,
        "user_id": payload["sub"],
        "name": payload_in.name or f"Combo {len(payload_in.legs)} picks",
        "legs": payload_in.legs,
        "total_odds": round(total_odds, 2),
        "num_legs": len(payload_in.legs),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.user_combos.insert_one(combo_doc)

    return {"ok": True, "id": combo_id, "total_odds": combo_doc["total_odds"]}


@app.get("/api/builder/my-combos")
async def get_builder_my_combos(payload: dict = Depends(get_current_user_payload)):
    await _require_paid_access(payload)
    saved = await db.user_combos.find({"user_id": payload["sub"]}).sort("created_at", -1).to_list(length=100)
    for s in saved:
        s.pop("_id", None)
    return {"combos": saved}


@app.delete("/api/builder/my-combos/{combo_id}")
async def delete_builder_combo(combo_id: str, payload: dict = Depends(get_current_user_payload)):
    await _require_paid_access(payload)
    result = await db.user_combos.delete_one({"id": combo_id, "user_id": payload["sub"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Combo introuvable")
    return {"ok": True}


# ─── Route directe /api/matches/{id} (sans /analysis) ────────────────────────

@app.get("/api/matches/{match_id}")
async def get_single_match(match_id: str, payload: Optional[dict] = Depends(get_optional_user_payload)):
    snapshot = await _get_prediction_snapshot()
    matches = [m for m in snapshot["matches"] if not _match_is_finished(m)]

    match = next((m for m in matches if str(m.get("id")) == str(match_id)), None)
    if not match:
        match = next(
            (m for m in matches if str(m.get("match_id", "")) == str(match_id)),
            None,
        )

    if not match:
        raise HTTPException(
            status_code=404,
            detail=f"Match introuvable (id={match_id}, {len(matches)} matchs en cache)",
        )

    prediction = next(
        (dict(p) for p in snapshot["predictions"] if str(p.get("match_id")) == str(match_id)),
        {}
    )
    prediction = _apply_calibration([prediction], snapshot["calibration"])[0] if prediction else {}
    if not await _has_paid_access(payload):
        free_match_id = str(matches[0].get("id") or matches[0].get("match_id")) if matches else None
        requested_id = str(match.get("id") or match.get("match_id"))
        if requested_id != free_match_id:
            prediction = _lock_prediction_for_free(prediction)
        else:
            prediction["locked"] = False
    else:
        prediction["locked"] = False
    return _merge_match_prediction(match, prediction)


# ─── Value bets ───────────────────────────────────────────────────────────

@app.get("/api/value-bets")
async def get_value_bets(payload: dict = Depends(get_current_user_payload)):
    await _require_paid_access(payload)
    snapshot = await _get_prediction_snapshot()
    matches = snapshot["matches"]
    bets = find_value_bets(matches, min_edge=1.5, limit=30)
    return {"count": len(bets), "bets": bets}


# ─── Plans (alias) ────────────────────────────────────────────────────────

@app.get("/api/plans")
async def get_plans_alias():
    return _canonical_subscription_plans()


# ─── Parrainage ───────────────────────────────────────────────────────────

REFERRAL_THRESHOLD = 3
REFERRAL_REWARD_DAYS = 7


@app.get("/api/referral/me")
async def get_referral_me(payload: dict = Depends(get_current_user_payload)):
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    code = user.get("referral_code") or user["id"][:8].upper()
    if not user.get("referral_code"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": code}})

    count = await db.users.count_documents({"referred_by": user["id"]})
    claimed = user.get("referral_reward_claimed", False)
    eligible = count >= REFERRAL_THRESHOLD and not claimed

    share_url = f"https://www.wnpulse.com/register?ref={code}"
    whatsapp_message = (
        f"Salut ! Je viens de découvrir WinPulse, une IA qui décrypte les "
        f"pronostics sportifs. Inscris-toi gratuitement avec mon code : {share_url}"
    )

    return {
        "code": code,
        "share_url": share_url,
        "whatsapp_share": f"https://wa.me/?text={whatsapp_message}",
        "count": count,
        "threshold": REFERRAL_THRESHOLD,
        "reward_days": REFERRAL_REWARD_DAYS,
        "eligible": eligible,
        "claimed": claimed,
    }


@app.post("/api/referral/claim")
async def claim_referral_reward(payload: dict = Depends(get_current_user_payload)):
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    if user.get("referral_reward_claimed"):
        raise HTTPException(status_code=400, detail="Récompense déjà réclamée")

    count = await db.users.count_documents({"referred_by": user["id"]})
    if count < REFERRAL_THRESHOLD:
        raise HTTPException(
            status_code=400,
            detail=f"Il te faut encore {REFERRAL_THRESHOLD - count} filleul(s) pour réclamer",
        )

    update_fields = {"referral_reward_claimed": True}
    if user.get("subscription", "free") == "free":
        update_fields["subscription"] = "pro"
        update_fields["subscription_expires_at"] = _compute_expiry(REFERRAL_REWARD_DAYS)

    await db.users.update_one({"id": user["id"]}, {"$set": update_fields})

    return {"ok": True, "message": f"{REFERRAL_REWARD_DAYS} jours Pro activés ! 🎉"}


TRACK_RECORD_BASE_BANKROLL = 100000
TRACK_RECORD_STAKE_XOF = 1000


def _parse_iso(dt_str: Optional[str]) -> Optional[datetime]:
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _track_datetime(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return _parse_iso(str(value)) if value else None


def _track_highlight_period(date_value: Optional[str], time_zone: str, now: datetime):
    try:
        if not time_zone or len(time_zone) > 100:
            raise ValueError("invalid timezone")
        zone = ZoneInfo(time_zone)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(status_code=400, detail="Fuseau horaire invalide")
    today = now.astimezone(zone).date()
    if date_value:
        try:
            selected = datetime.strptime(date_value, "%Y-%m-%d").date()
            if selected.isoformat() != date_value:
                raise ValueError("invalid date format")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="La date doit être au format AAAA-MM-JJ")
    else:
        selected = today - timedelta(days=1)
    if selected >= today:
        raise HTTPException(status_code=400, detail="Choisis une journée antérieure à aujourd’hui")
    try:
        local_start = datetime(selected.year, selected.month, selected.day, tzinfo=zone)
        start = local_start.astimezone(timezone.utc)
        end = (local_start + timedelta(days=1)).astimezone(timezone.utc)
    except (ValueError, OverflowError):
        raise HTTPException(status_code=400, detail="Date hors de l’intervalle pris en charge")
    return selected, zone, start, end


def _build_track_record_highlights(rows: List[Dict], selected, zone, limit: int, now: datetime) -> Dict:
    summary = {"total": 0, "won": 0, "lost": 0, "pending": 0, "void": 0}
    candidates = {}
    for row in rows:
        event_at = _track_datetime(row.get("commence_time"))
        result = row.get("result")
        if not event_at or event_at.astimezone(zone).date() != selected or result not in summary or result == "total":
            continue
        # Même collection et mêmes statuts que le Track Record, avec les pending
        # en plus pour donner un bilan complet de la journée, sans pagination.
        summary["total"] += 1
        summary[result] += 1
        if result != "won" or row.get("is_combo"):
            continue
        published_at = _track_datetime(row.get("created_at"))
        settled_at = _track_datetime(row.get("reconciled_at"))
        if not published_at or not settled_at or published_at >= event_at or not event_at <= settled_at <= now:
            continue
        if any(not isinstance(row.get(key), str) or not row[key].strip() for key in ("signature", "home_team", "away_team", "pick", "final_score")):
            continue
        try:
            odds = float(row.get("pick_odds"))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(odds) or odds <= 1:
            continue
        item = {
            "id": row["signature"],
            "home_team": row["home_team"],
            "away_team": row["away_team"],
            "pick": row["pick"],
            "pick_odds": odds,
            "final_score": row["final_score"],
            "status": "won",
            "result_verified": True,
            "published_at": published_at.astimezone(timezone.utc).isoformat(),
            "start_time": event_at.astimezone(timezone.utc).isoformat(),
            "settled_at": settled_at.astimezone(timezone.utc).isoformat(),
        }
        existing = candidates.get(item["id"])
        # S'il existe un ancien doublon, conserver la première publication.
        if existing is None or item["published_at"] < existing["published_at"]:
            candidates[item["id"]] = item
    winners = sorted(candidates.values(), key=lambda row: (-row["pick_odds"], -_track_datetime(row["start_time"]).timestamp(), row["id"]))[:limit]
    return {
        "date": selected.isoformat(),
        "time_zone": zone.key,
        "complete": True,
        "source": "track_record",
        "selection": "highest_winning_odds",
        "summary": summary,
        "winners": winners,
        "eligible_winners": len(candidates),
    }


@app.get("/api/track-record/highlights")
async def get_track_record_highlights(date: Optional[str] = None, time_zone: str = "UTC", limit: int = 3):
    """Gagnants de la veille issus du vrai Track Record, triés par cote décroissante.

    Cet endpoint public lit uniquement l'archive MongoDB. Il ne lance aucun
    appel au fournisseur de cotes ni aucune nouvelle réconciliation des scores.
    """
    now = datetime.now(timezone.utc)
    selected, zone, start, end = _track_highlight_period(date, time_zone, now)
    event_date = {"$convert": {"input": "$commence_time", "to": "date", "onError": None, "onNull": None}}
    query = {
        "result": {"$in": ["won", "lost", "void", "pending"]},
        "$expr": {"$and": [{"$gte": [event_date, start]}, {"$lt": [event_date, end]}]},
    }
    projection = {"_id": 0, "signature": 1, "home_team": 1, "away_team": 1, "pick": 1,
                  "pick_odds": 1, "final_score": 1, "result": 1, "is_combo": 1,
                  "created_at": 1, "commence_time": 1, "reconciled_at": 1}
    rows = []
    async for row in db.predictions_history.find(query, projection):
        rows.append(row)
    return _build_track_record_highlights(rows, selected, zone, max(1, min(limit, 3)), now)


@app.get("/api/track-record")
async def get_track_record_public(
    page: int = 1,
    per_page: int = 20,
    sport: str = "all",
    label: str = "all",
):
    """Track Record public, filtrable par sport puis par niveau de confiance.

    Les statistiques reposent uniquement sur les picks effectivement résolus.
    Les VOID/REMBOURSÉS restent visibles dans l'historique mais sont exclus du
    taux de réussite et du calcul du ROI, puisqu'ils ne sont ni gagnés ni perdus.
    """
    page = max(1, page)
    per_page = max(1, min(per_page, 100))

    sport = (sport or "all").lower().strip()
    sport_aliases = {
        "soccer": "football",
        "ice_hockey": "hockey",
        "icehockey": "hockey",
        "americanfootball": "american_football",
    }
    sport = sport_aliases.get(sport, sport)

    label = (label or "all").lower().strip()
    label_aliases = {
        "sur": "safe", "sûr": "safe", "safe": "safe",
        "modere": "value", "modéré": "value", "moderate": "value", "value": "value",
        "risque": "risky", "risqué": "risky", "risky": "risky",
    }
    label = label_aliases.get(label, label)
    if label not in {"all", "safe", "value", "risky"}:
        label = "all"

    resolved_statuses = ["won", "lost", "void"]

    # Historique continu : le Track Record ne doit jamais se "réinitialiser" lors
    # d'un changement de version du modèle. Tous les pronostics réellement résolus
    # restent visibles et alimentent les statistiques. Le marqueur
    # ``official_track_eligible`` reste disponible pour les diagnostics, mais il ne
    # supprime plus les résultats historiques du Track Record public.
    resolved_all = await db.predictions_history.find(
        {"result": {"$in": resolved_statuses}}
    ).to_list(length=20000)
    official_graded_count = sum(
        1 for r in resolved_all
        if r.get("official_track_eligible") and r.get("result") in ("won", "lost")
    )
    transition_mode = official_graded_count < 20
    transition_source = "continuous_history"

    for row in resolved_all:
        row["_normalized_sport"] = _normalize_sport(row)

    available_sports = sorted({
        r.get("_normalized_sport") for r in resolved_all
        if r.get("_normalized_sport") and r.get("_normalized_sport") != "unknown"
    })

    # 1) Sport sélectionné. Les cartes de niveau se recalculent dans ce sport.
    sport_scope = resolved_all if sport == "all" else [
        r for r in resolved_all if r.get("_normalized_sport") == sport
    ]

    # 2) Niveau sélectionné. L'historique et les KPI principaux suivent ce filtre.
    view_rows = sport_scope if label == "all" else [
        r for r in sport_scope if str(r.get("label") or "").lower() == label
    ]

    def _result_stats(rows: List[Dict]) -> Dict:
        wins_ = sum(1 for r in rows if r.get("result") == "won")
        losses_ = sum(1 for r in rows if r.get("result") == "lost")
        voids_ = sum(1 for r in rows if r.get("result") == "void")
        graded_ = wins_ + losses_
        return {
            "wins": wins_,
            "losses": losses_,
            "voids": voids_,
            "total": graded_,
            "resolved_total": graded_ + voids_,
            "win_rate": round((wins_ / graded_) * 100, 1) if graded_ else None,
        }

    sport_scope_stats = _result_stats(sport_scope)

    # Statistiques par niveau dans le sport courant.
    by_label_stats: Dict[str, Dict] = {}
    for key in ("safe", "value", "risky"):
        rows = [r for r in sport_scope if str(r.get("label") or "").lower() == key]
        by_label_stats[key] = _result_stats(rows)

    # Statistiques par sport sur l'ensemble du corpus, afin que les tuiles restent
    # comparables même lorsqu'un sport précis est sélectionné.
    by_sport_stats: Dict[str, Dict] = {}
    for key in available_sports:
        by_sport_stats[key] = _result_stats([
            r for r in resolved_all if r.get("_normalized_sport") == key
        ])

    # KPI principaux du filtre Sport + Niveau.
    view_rows.sort(
        key=lambda r: _parse_iso(
            r.get("commence_time") or r.get("reconciled_at") or r.get("created_at")
        ) or datetime.min.replace(tzinfo=timezone.utc)
    )
    graded_rows = [r for r in view_rows if r.get("result") in ("won", "lost")]
    main_stats = _result_stats(view_rows)

    odds_list: List[float] = []
    for r in graded_rows:
        try:
            value = float(r.get("pick_odds"))
            if value > 0:
                odds_list.append(value)
        except (TypeError, ValueError):
            continue
    avg_odds = round(statistics.mean(odds_list), 2) if odds_list else 0

    balance = TRACK_RECORD_BASE_BANKROLL
    daily_balance: Dict[str, float] = {}
    for r in view_rows:
        stake = TRACK_RECORD_STAKE_XOF
        try:
            odds = float(r.get("pick_odds") or 1)
        except (TypeError, ValueError):
            odds = 1.0

        if r.get("result") == "won":
            profit = stake * (odds - 1)
        elif r.get("result") == "lost":
            profit = -stake
        else:
            profit = 0
        balance += profit

        dt = _parse_iso(r.get("commence_time") or r.get("reconciled_at") or r.get("created_at"))
        day_key = dt.strftime("%Y-%m-%d") if dt else "inconnu"
        daily_balance[day_key] = balance

    chart = [{"date": d, "balance": round(v)} for d, v in sorted(daily_balance.items())][-60:]

    # Une annulation/remboursement est neutre : elle ne casse pas une série.
    streak = 0
    for r in reversed(view_rows):
        if r.get("result") == "void":
            continue
        if r.get("result") == "won":
            streak += 1
        else:
            break

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    recent_graded = [
        r for r in graded_rows
        if (_parse_iso(r.get("commence_time") or r.get("reconciled_at") or r.get("created_at"))
            or datetime.min.replace(tzinfo=timezone.utc)) >= cutoff
    ]
    profit_units_30d = 0.0
    for r in recent_graded:
        if r.get("result") == "won":
            try:
                profit_units_30d += float(r.get("pick_odds") or 1) - 1
            except (TypeError, ValueError):
                pass
        elif r.get("result") == "lost":
            profit_units_30d -= 1
    roi_percent = round((profit_units_30d / len(recent_graded)) * 100, 1) if recent_graded else 0

    stats = {
        **main_stats,
        "roi_percent": roi_percent,
        "profit_units_30d": round(profit_units_30d, 2),
        "current_streak": streak,
        "avg_odds": avg_odds,
        "base": TRACK_RECORD_BASE_BANKROLL,
        "balance_now": round(balance),
        "stake_xof": TRACK_RECORD_STAKE_XOF,
        "by_label": by_label_stats,
        "by_sport": by_sport_stats,
        "sport_scope": sport_scope_stats,
        "all_history": _result_stats(resolved_all),
    }

    # État de conciliation : permet au frontend de signaler immédiatement un
    # Track Record figé sans déclencher de requête fournisseur sur une page publique.
    pending_docs = await db.predictions_history.find({"result": "pending"}).to_list(length=10000)
    now = datetime.now(timezone.utc)
    overdue_pending = 0
    outside_provider_window = 0
    pending_by_sport: Dict[str, int] = {}
    for p in pending_docs:
        key = _normalize_sport(p)
        pending_by_sport[key] = pending_by_sport.get(key, 0) + 1
        dt = _parse_iso(p.get("commence_time"))
        if dt and now - dt > timedelta(hours=6):
            overdue_pending += 1
        if dt and now - dt > timedelta(days=3):
            outside_provider_window += 1

    reconciled_dates = [
        _parse_iso(r.get("reconciled_at")) for r in resolved_all if r.get("reconciled_at")
    ]
    reconciled_dates = [d for d in reconciled_dates if d]
    latest_event_dates = [
        _parse_iso(r.get("commence_time")) for r in resolved_all if r.get("commence_time")
    ]
    latest_event_dates = [d for d in latest_event_dates if d]

    track_sync_meta = await db.system_meta.find_one({"_id": "track_sync"}) or {}
    sync = {
        "pending_total": len(pending_docs),
        "overdue_pending": overdue_pending,
        "outside_provider_window": outside_provider_window,
        "pending_by_sport": pending_by_sport,
        "last_reconciled_at": max(reconciled_dates).isoformat() if reconciled_dates else None,
        "latest_resolved_event_at": max(latest_event_dates).isoformat() if latest_event_dates else None,
        "last_sync_attempt_at": track_sync_meta.get("last_run_at"),
        "last_sync_updated": int(track_sync_meta.get("updated", 0) or 0),
        "last_sync_no_score": int(track_sync_meta.get("no_score", 0) or 0),
        "last_sync_unsupported_market": int(track_sync_meta.get("unsupported_market", 0) or 0),
        "last_sync_errors": int(track_sync_meta.get("errors", 0) or 0),
    }

    total_rows = len(view_rows)
    total_pages = max(1, (total_rows + per_page - 1) // per_page)
    page = min(page, total_pages)
    results_desc = list(reversed(view_rows))
    start = (page - 1) * per_page
    page_items = results_desc[start:start + per_page]

    results: List[Dict] = []
    for r in page_items:
        try:
            odds = float(r.get("pick_odds") or 1)
        except (TypeError, ValueError):
            odds = 1.0
        if r.get("result") == "won":
            profit_xof = round(TRACK_RECORD_STAKE_XOF * (odds - 1))
        elif r.get("result") == "lost":
            profit_xof = -TRACK_RECORD_STAKE_XOF
        else:
            profit_xof = 0

        results.append({
            "id": r.get("signature"),
            # Date réelle du match, pas date de réconciliation.
            "date": r.get("commence_time") or r.get("created_at"),
            "reconciled_at": r.get("reconciled_at"),
            "sport": r.get("_normalized_sport", "unknown"),
            "league": r.get("sport_title", ""),
            "match": f"{r.get('home_team', '')} vs {r.get('away_team', '')}",
            "pick": r.get("pick", ""),
            "odds": odds,
            "status": r.get("result"),
            "label": r.get("label"),
            "confidence": r.get("confidence"),
            "final_score": r.get("final_score"),
            "profit_xof": profit_xof,
        })

    return {
        "stats": stats,
        "sync": sync,
        "chart": chart,
        "results": results,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
        "total_results": total_rows,
        "selected_sport": sport,
        "selected_label": label,
        "available_sports": available_sports,
        "available_labels": ["safe", "value", "risky"],
        "transition_mode": transition_mode,
        "transition_source": transition_source,
        "note": (
            "Le Track Record conserve l'historique continu de tous les pronostics réellement "
            "résolus, même après un changement de version du moteur. Les gains, pertes et "
            "remboursements passés ne sont jamais masqués."
        ) if transition_mode else None,
    }


@app.get("/api/predictions/history")
async def get_predictions_history(limit: int = 100, payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)
    limit = max(1, min(limit, 500))
    history = await db.predictions_history.find({}).sort("created_at", -1).to_list(length=limit)
    for h in history:
        h.pop("_id", None)
    return history


@app.get("/api/admin/accuracy-stats")
async def admin_get_accuracy_stats(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)

    resolved = await db.predictions_history.find(
        {"result": {"$in": ["won", "lost"]}}
    ).to_list(length=5000)

    if not resolved:
        return {
            "total_resolved": 0,
            "detail": "Aucun pick avec resultat confirme pour le moment. "
                      "Les statistiques deviendront fiables au fur et a mesure "
                      "que les matchs se terminent et sont reconcilies.",
            "brackets": [],
        }

    def _bracket(conf):
        if conf >= 80:
            return "80-100%"
        if conf >= 70:
            return "70-79%"
        if conf >= 60:
            return "60-69%"
        return "< 60%"

    brackets: Dict[str, Dict] = {}
    for p in resolved:
        b = _bracket(p.get("confidence", 0))
        brackets.setdefault(b, {"total": 0, "won": 0})
        brackets[b]["total"] += 1
        if p.get("result") == "won":
            brackets[b]["won"] += 1

    bracket_stats = []
    for b, d in sorted(brackets.items()):
        win_rate = round((d["won"] / d["total"]) * 100, 1) if d["total"] else 0
        bracket_stats.append({
            "bracket": b, "total": d["total"], "won": d["won"],
            "win_rate_percent": win_rate,
        })

    total_won = sum(1 for p in resolved if p.get("result") == "won")
    global_win_rate = round((total_won / len(resolved)) * 100, 1)

    return {
        "total_resolved": len(resolved),
        "total_won": total_won,
        "global_win_rate_percent": global_win_rate,
        "brackets": bracket_stats,
    }


@app.get("/api/admin/clv-stats")
async def admin_get_clv_stats(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)

    with_clv = await db.predictions_history.find(
        {"clv_percent": {"$exists": True}, "market": "h2h"}
    ).to_list(length=5000)

    if not with_clv:
        return {
            "total_tracked": 0,
            "detail": "Aucun pick avec CLV calcule pour le moment. Le CLV "
                      "n'est calcule qu'une fois le match demarre — reviens "
                      "plus tard une fois des matchs h2h en cours.",
            "avg_clv_percent": None,
            "positive_clv_rate": None,
        }

    clv_values = [p["clv_percent"] for p in with_clv if p.get("clv_percent") is not None]
    positive_count = sum(1 for v in clv_values if v > 0)

    by_version: Dict[str, List[float]] = {}
    for p in with_clv:
        v = p.get("model_version", "inconnu")
        if p.get("clv_percent") is not None:
            by_version.setdefault(v, []).append(p["clv_percent"])

    version_breakdown = {
        v: {
            "count": len(vals),
            "avg_clv_percent": round(statistics.mean(vals), 2),
            "positive_clv_rate_percent": round(
                (sum(1 for x in vals if x > 0) / len(vals)) * 100, 1
            ),
        }
        for v, vals in by_version.items()
    }

    return {
        "total_tracked": len(clv_values),
        "avg_clv_percent": round(statistics.mean(clv_values), 2) if clv_values else None,
        "positive_clv_rate_percent": round((positive_count / len(clv_values)) * 100, 1) if clv_values else None,
        "by_model_version": version_breakdown,
        "note": (
            "CLV positif = notre cote au moment du pick etait meilleure que "
            "la cote de cloture, signe de vraie valeur detectee avant que "
            "le marche ne s'ajuste. Limite au marche h2h (1X2) pour l'instant."
        ),
    }


# ─── Outils de diagnostic temporaires ───────────────────────────────────────
# Désactivés par défaut en production. Pour une maintenance ponctuelle, définir
# ENABLE_SIMPLE_ADMIN_ROUTES=true et envoyer REFRESH_SECRET dans l'en-tête
# X-Admin-Debug-Key. Ces routes restent hors du frontend public.
ENABLE_SIMPLE_ADMIN_ROUTES = os.environ.get("ENABLE_SIMPLE_ADMIN_ROUTES", "false").strip().lower() in ("1", "true", "yes")


def _require_simple_admin_secret(key: str) -> None:
    if not ENABLE_SIMPLE_ADMIN_ROUTES:
        raise HTTPException(status_code=404, detail="Route de diagnostic désactivée")
    expected = os.environ.get("REFRESH_SECRET", "").strip()
    if not expected or not key or not secrets.compare_digest(key, expected):
        raise HTTPException(status_code=403, detail="Clé invalide")


@app.get("/api/admin/diagnose-pending-simple")
async def admin_diagnose_pending_simple(key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)

    pending = await db.predictions_history.find({"result": "pending"}).to_list(length=2000)
    now = datetime.now(timezone.utc)

    should_be_finished = []
    for p in pending:
        try:
            ct = datetime.fromisoformat(p["commence_time"].replace("Z", "+00:00"))
            if (now - ct).total_seconds() > 3 * 3600:
                should_be_finished.append(p)
        except Exception:
            continue

    oaio_stuck = [p for p in should_be_finished if p["match_id"].startswith("oaio-")]
    classic_stuck = [p for p in should_be_finished if not p["match_id"].startswith("oaio-")]

    def _sample(lst, n=5):
        sorted_lst = sorted(lst, key=lambda p: p["commence_time"], reverse=True)
        return [
            {
                "match_id": p["match_id"],
                "home_team": p["home_team"],
                "away_team": p["away_team"],
                "sport_title": p.get("sport_title"),
                "commence_time": p["commence_time"],
            }
            for p in sorted_lst[:n]
        ]

    return {
        "total_pending": len(pending),
        "should_be_finished_total": len(should_be_finished),
        "oaio_stuck_count": len(oaio_stuck),
        "classic_stuck_count": len(classic_stuck),
        "oaio_stuck_samples": _sample(oaio_stuck),
        "classic_stuck_samples": _sample(classic_stuck),
    }


@app.post("/api/admin/reconcile-results-simple")
async def admin_reconcile_results_simple(key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)
    result = await _reconcile_predictions_with_scores(force_score_refresh=True)
    return result


@app.post("/api/admin/sweep-expired-simple")
async def admin_sweep_expired_simple(key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)
    result = await _sweep_expired_subscriptions()
    return result


# ─── Scores ───────────────────────────────────────────────────────────────

LIVE_SCORES_FRESH_SECONDS = 60
LIVE_SCORES_MAX_AGE_SECONDS = 5 * 60
LIVE_SCORES_REFRESH_TIMEOUT_SECONDS = 60
_live_scores_refresh_task = None
_live_scores_retry_at = 0.0
_live_scores_refresh_error = False
_live_scores_error_code = None


async def _refresh_live_scores_in_background():
    """La collecte fournisseur et l'archivage ne bloquent plus la page Live."""
    global _live_scores_retry_at, _live_scores_refresh_error, _live_scores_error_code
    ran = False

    async def collect():
        nonlocal ran
        ran = True
        return await fetch_live_scores(db)

    try:
        await asyncio.wait_for(
            _run_with_scheduler_lease(
                "live_scores_refresh", collect,
                lease_seconds=LIVE_SCORES_REFRESH_TIMEOUT_SECONDS + 30,
            ),
            timeout=LIVE_SCORES_REFRESH_TIMEOUT_SECONDS,
        )
        if ran:
            _live_scores_refresh_error = False
            _live_scores_error_code = None
            _live_scores_retry_at = time.monotonic() + LIVE_SCORES_FRESH_SECONDS
        else:
            _live_scores_retry_at = time.monotonic() + 5
    except Exception as exc:
        # Conserver le dernier cache valide et temporiser les nouvelles tentatives.
        _live_scores_refresh_error = True
        _live_scores_error_code = getattr(exc, "code", "provider_timeout" if isinstance(exc, asyncio.TimeoutError) else "scores_service_unavailable")
        _live_scores_retry_at = time.monotonic() + 60
    finally:
        if ran:
            try:
                await db.scheduler_locks.update_one(
                    {"_id": "live_scores_refresh", "owner": SCHEDULER_INSTANCE_ID},
                    {"$set": {"lease_until": datetime.now(timezone.utc).isoformat()}},
                )
            except Exception:
                pass


def _start_live_scores_refresh():
    global _live_scores_refresh_task
    if _live_scores_refresh_task and not _live_scores_refresh_task.done():
        return
    if time.monotonic() < _live_scores_retry_at:
        return
    _live_scores_refresh_task = asyncio.create_task(_refresh_live_scores_in_background())


@app.get("/api/live/streams")
async def get_live_streams(region: str = Query(default="", max_length=2)):
    region = region.strip().upper()
    if region and not re.fullmatch(r"[A-Z]{2}", region):
        raise HTTPException(status_code=422, detail="Le pays doit être un code de deux lettres.")
    try:
        data = await asyncio.wait_for(public_streams(db, region=region), timeout=4)
        return JSONResponse(content=data, headers={"Cache-Control": "no-store"})
    except Exception as exc:
        logging.getLogger(__name__).warning("Live video cache failed: %s", type(exc).__name__)
        return JSONResponse(content={"items": [], "status": "error", "error_code": "video_cache_unavailable"},
                            status_code=503, headers={"Cache-Control": "no-store"})


@app.get("/api/admin/live-streams/status")
async def admin_live_stream_status(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)
    try:
        return await asyncio.wait_for(stream_diagnostics(db, scheduler_active=_live_video_scheduler.running), timeout=5)
    except Exception:
        raise HTTPException(status_code=503, detail="L’état des diffusions est temporairement indisponible.")


@app.post("/api/admin/live-streams/refresh", status_code=202)
async def admin_live_stream_refresh(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)
    started = await _start_live_video_sync()
    return {"started": started, "configured": live_video_configuration()["configured"]}


@app.get("/api/scores")
async def get_scores(snapshot: bool = False):
    # Lire directement Mongo : fetch_all_scores archive même un cache frais,
    # puis attend les réponses de toutes les compétitions si le cache a expiré.
    try:
        cached = await asyncio.wait_for(db.scores_cache.find_one({"_id": "live_scores"}), timeout=3)
        if cached is None:
            cached = await asyncio.wait_for(db.scores_cache.find_one({"_id": "all_scores"}), timeout=3)
    except Exception:
        data = {"scores": [], "updated_at": None, "stale": True, "refreshing": False,
                "status": "error", "error_code": "scores_cache_unavailable", "retry_after": 60}
        return JSONResponse(content=data if snapshot else [], status_code=503,
                            headers={"Cache-Control": "no-store", "Retry-After": "60"})
    scores = cached.get("data") if cached else None
    updated_at = cached.get("updated_at") if cached else None
    age = float("inf")
    if updated_at:
        try:
            updated = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
            if updated.tzinfo is None:
                updated = updated.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - updated).total_seconds()
            age = elapsed if elapsed >= 0 else float("inf")
        except (TypeError, ValueError):
            pass

    # Un cache de réconciliation ciblé peut être partiel : il sert uniquement
    # d'aperçu temporaire pendant la première collecte dédiée au Live.
    dedicated = bool(cached and cached.get("_id") == "live_scores")
    partial = bool(cached and cached.get("partial")) or not dedicated
    valid = isinstance(scores, list) and age <= LIVE_SCORES_MAX_AGE_SECONDS
    stale = not valid or age >= LIVE_SCORES_FRESH_SECONDS or partial or _live_scores_refresh_error
    if stale:
        _start_live_scores_refresh()
    refreshing = bool(_live_scores_refresh_task and not _live_scores_refresh_task.done())
    status_code = 200 if valid else (503 if _live_scores_refresh_error else 202)
    data = scores if valid else []
    if snapshot:
        data = {
            "scores": data,
            "updated_at": str(updated_at) if valid else None,
            "stale": stale,
            "refreshing": refreshing,
            "status": "ready" if valid else ("error" if _live_scores_refresh_error else "warming"),
            "partial": partial,
            "error_code": _live_scores_error_code if _live_scores_refresh_error else None,
            "retry_after": max(3, int(_live_scores_retry_at - time.monotonic()) + 1) if _live_scores_retry_at > time.monotonic() else 3,
        }
    # /scores reste compatible avec les clients existants : un tableau JSON.
    return JSONResponse(content=data, status_code=status_code, headers={"Cache-Control": "no-store"})


# ─── Admin ────────────────────────────────────────────────────────────────

@app.post("/api/admin/refresh")
async def admin_refresh(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)
    return await _full_refresh_and_track()


@app.post("/api/admin/activate-admin-simple")
async def admin_activate_admin_simple(email: str = "", key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)

    email_norm = email.lower().strip()
    user = await db.users.find_one({"email": email_norm})
    if not user:
        raise HTTPException(status_code=404, detail=f"Aucun compte pour {email_norm}")

    await db.users.update_one(
        {"email": email_norm},
        {"$set": {"is_admin": True, "subscription": "elite"}},
    )
    updated = await db.users.find_one({"email": email_norm})
    return {
        "ok": True,
        "email": updated.get("email"),
        "is_admin": updated.get("is_admin"),
        "subscription": updated.get("subscription"),
    }


@app.post("/api/admin/test-email-simple")
async def admin_test_email_simple(to: str = "", key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)
    if not to:
        raise HTTPException(status_code=400, detail="Parametre 'to' requis")

    sent = await _send_email(
        to,
        "Test WinPulse ✅",
        _email_layout("Email de test", "<p>Si tu vois ceci, l'integration Resend fonctionne correctement.</p>"),
    )
    return {"ok": sent, "resend_configured": bool(RESEND_API_KEY)}


@app.get("/api/admin/whoami-simple")
async def admin_whoami_simple(email: str = "", key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)

    user = await db.users.find_one({"email": email.lower().strip()})
    if not user:
        return {"found": False, "email_recherche": email.lower().strip()}

    return {
        "found": True,
        "id": user.get("id"),
        "email": user.get("email"),
        "is_admin": user.get("is_admin", False),
        "subscription": user.get("subscription", "free"),
        "created_at": user.get("created_at"),
    }


@app.post("/api/admin/refresh-simple")
async def admin_refresh_simple(key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)
    result = await _full_refresh_and_track()
    return result


@app.post("/api/admin/refresh-real-stats-simple")
async def admin_refresh_real_stats_simple(key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)
    matches = await fetch_all_matches(db)
    result = await refresh_real_stats_cache(db, matches)
    return result


@app.get("/api/admin/probe-oaio-odds-simple")
async def admin_probe_oaio_odds_simple(event_id: str = "", key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)
    if not event_id:
        raise HTTPException(status_code=400, detail="Parametre 'event_id' requis")
    from odds_service import _fetch_odds_api_io_odds
    result = await _fetch_odds_api_io_odds(event_id)
    return {
        "event_id": event_id,
        "raw_odds_response": result,
        "a_des_cotes_bet365": bool(result and result.get("bookmakers")),
    }


@app.get("/api/admin/debug-config-simple")
async def admin_debug_config_simple(key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)
    return {
        "odds_api_io_leagues_actuellement_chargees": ODDS_API_IO_LEAGUES,
        "contient_playoff_round_champions_league": "international-clubs-uefa-champions-league-playoff-round" in ODDS_API_IO_LEAGUES,
        "total_ligues": len(ODDS_API_IO_LEAGUES),
    }


@app.get("/api/admin/probe-oaio-event-simple")
async def admin_probe_oaio_event_simple(match_id: str = "", key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)
    if not match_id:
        raise HTTPException(status_code=400, detail="Parametre 'match_id' requis (id numerique, sans 'oaio-')")
    result = await probe_odds_api_io_event(match_id)
    return result


@app.get("/api/admin/probe-oaio-league-simple")
async def admin_probe_oaio_league_simple(league: str = "denmark-superligaen", sport: str = "football", key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)
    result = await probe_odds_api_io_league_sample(league, sport)
    return result


@app.get("/api/admin/diagnose-labels-simple")
async def admin_diagnose_labels_simple(key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)

    all_safe = await db.predictions_history.find({"label": "safe"}).to_list(length=20000)

    by_result: Dict[str, int] = {"won": 0, "lost": 0, "pending": 0, "autre": 0}
    resolved_by_version: Dict[str, int] = {}
    resolved_official_true = 0
    resolved_official_false = 0
    resolved_samples = []
    pending_samples = []

    for d in all_safe:
        r = d.get("result", "autre")
        by_result[r] = by_result.get(r, 0) + 1
        if r in ("won", "lost"):
            v = d.get("model_version", "inconnu")
            resolved_by_version[v] = resolved_by_version.get(v, 0) + 1
            if d.get("official_track_eligible"):
                resolved_official_true += 1
            else:
                resolved_official_false += 1
            if len(resolved_samples) < 8:
                resolved_samples.append({
                    "match": f"{d.get('home_team')} vs {d.get('away_team')}",
                    "pick": d.get("pick"),
                    "result": r,
                    "model_version": d.get("model_version"),
                    "official_track_eligible": d.get("official_track_eligible"),
                    "confidence": d.get("confidence"),
                    "created_at": d.get("created_at"),
                })
        elif r == "pending" and len(pending_samples) < 15:
            pending_samples.append({
                "match": f"{d.get('home_team')} vs {d.get('away_team')}",
                "pick": d.get("pick"),
                "market": d.get("market"),
                "is_combo": d.get("is_combo"),
                "commence_time": d.get("commence_time"),
                "created_at": d.get("created_at"),
                "match_id": d.get("match_id"),
            })

    return {
        "current_model_version": MODEL_VERSION,
        "total_label_safe_all_time": len(all_safe),
        "by_result": by_result,
        "resolved_by_model_version": resolved_by_version,
        "resolved_official_track_eligible_true": resolved_official_true,
        "resolved_official_track_eligible_false": resolved_official_false,
        "resolved_samples": resolved_samples,
        "pending_samples": pending_samples,
        "explication": (
            "Si 'resolved_by_model_version' contient une version differente "
            "de 'current_model_version', ces picks sont exclus du mode "
            "transition du Track Record (qui ne compte que la version "
            "actuelle). Si 'resolved_official_track_eligible_false' est "
            "eleve alors qu'on n'est PAS en mode transition (20+ picks "
            "officiels), ces picks sont exclus car ils ne remplissent pas "
            "les criteres stricts (edge>=2%, 5+ bookmakers, cote 1.20-2.20)."
        ),
    }


@app.post("/api/admin/backfill-labels-simple")
async def admin_backfill_labels_simple(key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)

    docs = await db.predictions_history.find({
        "$or": [{"label": {"$exists": False}}, {"label": None}]
    }).to_list(length=20000)

    updated = 0
    skipped_no_confidence = 0
    for d in docs:
        conf = d.get("confidence")
        if conf is None:
            skipped_no_confidence += 1
            continue
        try:
            conf = float(conf)
        except (TypeError, ValueError):
            skipped_no_confidence += 1
            continue
        label = "safe" if conf >= SAFE_THRESHOLD else ("value" if conf >= VALUE_THRESHOLD else "risky")
        await db.predictions_history.update_one(
            {"signature": d["signature"]},
            {"$set": {"label": label}},
        )
        updated += 1

    return {
        "ok": True,
        "checked": len(docs),
        "updated": updated,
        "skipped_no_confidence": skipped_no_confidence,
    }


@app.get("/api/admin/diagnose-sport-simple")
async def admin_diagnose_sport_simple(sport_key: str = "", key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)
    if not sport_key:
        raise HTTPException(status_code=400, detail="Parametre 'sport_key' requis")
    result = await diagnose_sport_key(db, sport_key)
    return result


@app.post("/api/admin/update-closing-odds-simple")
async def admin_update_closing_odds_simple(key: str = Header(default="", alias="X-Admin-Debug-Key")):
    _require_simple_admin_secret(key)
    matches = await fetch_all_matches(db)
    result = await _update_closing_odds(matches)
    return result


# ─── Suivi reel des predictions (backtest continu) ──────────────────────────

def _pick_signature(match_id: str, pick: str) -> str:
    import hashlib
    return hashlib.md5(f"{match_id}::{pick}".encode()).hexdigest()


async def _save_predictions_to_history(matches: List[Dict]):
    try:
        real_stats_map = await get_real_stats_map(db, matches)
        predictions = analyze_all(matches, real_stats_map=real_stats_map)
        for p in predictions:
            if not p.get("pick") or not p.get("match_id"):
                continue
            starts = _parse_iso(p.get("commence_time"))
            if not starts or starts <= datetime.now(timezone.utc):
                continue
            sig = _pick_signature(p["match_id"], p.get("selection_id") or p["pick"])
            existing = await db.predictions_history.find_one({"signature": sig})
            if existing:
                continue

            await db.predictions_history.insert_one({
                "signature": sig,
                "match_id": p["match_id"],
                "home_team": p.get("home_team"),
                "away_team": p.get("away_team"),
                "sport_title": p.get("sport_title"),
                "sport_key": p.get("sport_key"),
                "commence_time": p.get("commence_time"),
                "pick": p["pick"],
                "market": p.get("market"),
                "selection_id": p.get("selection_id"),
                "pick_raw": p.get("pick_raw"), "pick_point": p.get("pick_point"),
                "pick_team": p.get("pick_team"),
                "best_bookmaker": p.get("best_bookmaker"),
                "best_bookmaker_key": p.get("best_bookmaker_key"),
                "quote_updated_at": p.get("quote_updated_at"),
                "probability_source": p.get("probability_source"),
                "probability_basis": p.get("probability_basis"),
                "expected_return_pct": p.get("expected_return_pct"),
                "pick_odds": p.get("pick_odds"),
                "confidence": p.get("confidence"),
                "label": p.get("label"),
                "model_probability": p.get("model_probability"),
                "estimated_win_probability": p.get("estimated_win_probability"),
                "wp_score": p.get("wp_score"),
                "selection_score": p.get("selection_score"),
                "stability_score": p.get("stability_score"),
                "dominance_score": p.get("dominance_score"),
                "num_books": p.get("num_books"),
                "edge": p.get("edge"),
                "model_version": p.get("model_version", MODEL_VERSION),
                "is_combo": p.get("is_combo", False),
                "official_track_eligible": bool(p.get("official_track_eligible", False)),
                "result": "pending",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    except Exception:
        pass


def _find_current_h2h_odds(match: Dict, pick_text: str, home: str, away: str) -> Optional[float]:
    pick_l = (pick_text or "").lower()
    if "nul" in pick_l or pick_l.strip() == "match nul":
        target_name = "Draw"
    elif home.lower() in pick_l:
        target_name = home
    elif away.lower() in pick_l:
        target_name = away
    else:
        return None

    best_odds = None
    for bm in match.get("bookmakers", []) or []:
        for mk in bm.get("markets", []) or []:
            if mk.get("key") != "h2h":
                continue
            for outcome in mk.get("outcomes", []) or []:
                if outcome.get("name") == target_name:
                    price = outcome.get("price")
                    if price and (best_odds is None or price > best_odds):
                        best_odds = float(price)
    return best_odds


async def _update_closing_odds(matches: List[Dict]) -> Dict:
    now = datetime.now(timezone.utc)
    match_by_id = {m.get("id"): m for m in matches}

    pending = await db.predictions_history.find({
        "result": "pending",
        "closing_odds": {"$exists": False},
        "market": "h2h",
    }).to_list(length=1000)

    updated = 0
    for pred in pending:
        try:
            ct = _parse_iso(pred.get("commence_time"))
            if not ct or ct > now:
                continue

            match = match_by_id.get(pred.get("match_id"))
            if not match:
                continue

            closing_odds = _find_current_h2h_odds(
                match, pred.get("pick", ""),
                pred.get("home_team", ""), pred.get("away_team", "")
            )
            if closing_odds is None:
                continue

            opening_odds = pred.get("pick_odds") or closing_odds
            clv_percent = round(((opening_odds / closing_odds) - 1.0) * 100, 2) if opening_odds and closing_odds else 0.0

            await db.predictions_history.update_one(
                {"signature": pred["signature"]},
                {"$set": {
                    "closing_odds": closing_odds,
                    "clv_percent": clv_percent,
                    "clv_computed_at": now.isoformat(),
                }},
            )
            updated += 1
        except Exception:
            continue

    return {"ok": True, "checked": len(pending), "updated": updated}


def _norm_team_for_reconcile(value: str) -> str:
    """Normalisation souple pour rapprocher un score d'un pronostic."""
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"\b(fc|cf|sc|afc|bc|hc|club|women|w)\b", "", text)
    return re.sub(r"[^a-z0-9]+", "", text)


def _score_pair(score_entry: Dict) -> tuple:
    home_score = away_score = None
    for row in score_entry.get("scores") or []:
        name = row.get("name")
        try:
            value = int(row.get("score"))
        except Exception:
            continue
        if name == score_entry.get("home_team"):
            home_score = value
        elif name == score_entry.get("away_team"):
            away_score = value
    return home_score, away_score


def _find_score_fallback(pred: Dict, scores: List[Dict]) -> Optional[Dict]:
    """Retrouve un score par équipes + horaire si l'identifiant ne correspond plus."""
    ph = _norm_team_for_reconcile(pred.get("home_team"))
    pa = _norm_team_for_reconcile(pred.get("away_team"))
    if not ph or not pa:
        return None
    pred_dt = _parse_iso(pred.get("commence_time"))
    sport_key = str(pred.get("sport_key") or "").strip()

    best = None
    best_delta = None
    for score in scores:
        if not score.get("completed"):
            continue
        score_sport = str(score.get("sport_key") or "").strip()
        if sport_key and score_sport and sport_key != score_sport:
            continue

        sh = _norm_team_for_reconcile(score.get("home_team"))
        sa = _norm_team_for_reconcile(score.get("away_team"))
        direct = sh == ph and sa == pa
        reversed_pair = sh == pa and sa == ph
        if not (direct or reversed_pair):
            continue

        score_dt = _parse_iso(score.get("commence_time"))
        if pred_dt and score_dt:
            delta = abs((score_dt - pred_dt).total_seconds())
            # Les fournisseurs peuvent différer légèrement sur l'heure, mais pas d'un jour.
            if delta > 12 * 3600:
                continue
        else:
            delta = 0

        if best is None or delta < best_delta:
            best = dict(score)
            best["_teams_reversed"] = bool(reversed_pair)
            best_delta = delta
    return best


def _find_oaio_score_fallback(pred: Dict, scores_map: Dict[str, Dict]) -> Optional[Dict]:
    """Secours historique via odds-api.io, par équipes + horaire.

    Ce rapprochement s'applique aussi aux pronostics créés depuis The Odds API :
    un ancien match peut ne plus être disponible dans la fenêtre ``daysFrom=3``
    de la source principale tout en restant visible comme événement ``settled``
    chez la source secondaire.
    """
    ph = _norm_team_for_reconcile(pred.get("home_team"))
    pa = _norm_team_for_reconcile(pred.get("away_team"))
    if not ph or not pa:
        return None
    pred_dt = _parse_iso(pred.get("commence_time"))
    best = None
    best_delta = None
    for candidate in (scores_map or {}).values():
        sh = _norm_team_for_reconcile(candidate.get("home_team"))
        sa = _norm_team_for_reconcile(candidate.get("away_team"))
        direct = sh == ph and sa == pa
        reversed_pair = sh == pa and sa == ph
        if not (direct or reversed_pair):
            continue
        cdt = _parse_iso(candidate.get("commence_time"))
        if pred_dt and cdt:
            delta = abs((cdt - pred_dt).total_seconds())
            if delta > 12 * 3600:
                continue
        else:
            delta = 0
        if best is None or delta < best_delta:
            best = dict(candidate)
            best["_teams_reversed"] = bool(reversed_pair)
            best_delta = delta
    return best


async def _reconcile_predictions_with_scores(force_score_refresh: bool = False) -> Dict:
    """Synchronise tous les pronostics terminés avec leurs scores finaux.

    Le moteur cible les ``sport_key`` réellement présents dans les pronostics en
    attente, relit l'archive durable, puis tente trois niveaux de rapprochement :
    identifiant fournisseur, équipes+horaire dans The Odds API, puis secours
    équipes+horaire via odds-api.io. Le diagnostic de chaque exécution est persisté
    pour être visible directement dans le Track Record.
    """
    pending = await db.predictions_history.find({"result": "pending"}).to_list(length=10000)
    run_at = datetime.now(timezone.utc).isoformat()
    if not pending:
        result = {
            "ok": True, "checked": 0, "updated": 0, "pending_remaining": 0,
            "recovered_by_team_time": 0, "recovered_by_secondary": 0,
            "outside_provider_window": 0, "no_score": 0,
            "not_completed": 0, "unsupported_market": 0, "errors": 0,
        }
        await db.system_meta.update_one(
            {"_id": "track_sync"},
            {"$set": {"last_run_at": run_at, **result}},
            upsert=True,
        )
        try:
            result["montante"] = await _montante_sync_after_track_results()
        except Exception as exc:
            result["montante"] = {"status": "ERROR", "progressed": False, "detail": str(exc)}
        return result

    now = datetime.now(timezone.utc)
    classic_pending = [p for p in pending if not str(p.get("match_id") or "").startswith("oaio-")]
    required_sport_keys = sorted({
        str(p.get("sport_key") or "").strip()
        for p in classic_pending
        if str(p.get("sport_key") or "").strip()
    })

    scores = await fetch_all_scores(
        db,
        sport_keys=required_sport_keys or None,
        force_refresh=force_score_refresh,
        days_from=3,
        include_archive=True,
        archive_days=60,
    )
    scores_by_match = {str(s.get("id")): s for s in scores if s.get("id")}
    oaio_scores_map = await fetch_odds_api_io_scores_map()

    updated = 0
    recovered_by_team_time = 0
    recovered_by_secondary = 0
    no_score = 0
    not_completed = 0
    unsupported_market = 0
    outside_provider_window = 0
    errors = 0

    for pred in pending:
        match_id = str(pred.get("match_id") or "")
        commence_dt = _parse_iso(pred.get("commence_time"))
        age_days = ((now - commence_dt).total_seconds() / 86400.0) if commence_dt else None

        try:
            score_entry = None
            home_score = away_score = None
            reconciliation_source = "unknown"

            if match_id.startswith("oaio-"):
                numeric_id = match_id[len("oaio-"):]
                entry = oaio_scores_map.get(numeric_id)
                if entry:
                    home_score = int(entry["home_score"])
                    away_score = int(entry["away_score"])
                    reconciliation_source = "odds_api_io_id"
                else:
                    found = _find_oaio_score_fallback(pred, oaio_scores_map)
                    if found:
                        home_score = int(found["home_score"])
                        away_score = int(found["away_score"])
                        if found.get("_teams_reversed"):
                            home_score, away_score = away_score, home_score
                        recovered_by_team_time += 1
                        recovered_by_secondary += 1
                        reconciliation_source = "odds_api_io_team_time"
            else:
                score_entry = scores_by_match.get(match_id)
                if score_entry:
                    reconciliation_source = "scores_api_id"
                else:
                    score_entry = _find_score_fallback(pred, scores)
                    if score_entry:
                        recovered_by_team_time += 1
                        reconciliation_source = "scores_api_team_time"

                if score_entry:
                    if not score_entry.get("completed"):
                        not_completed += 1
                        continue
                    home_score, away_score = _score_pair(score_entry)
                    if home_score is None or away_score is None:
                        for row in score_entry.get("scores") or []:
                            name = _norm_team_for_reconcile(row.get("name"))
                            try:
                                value = int(row.get("score"))
                            except Exception:
                                continue
                            if name == _norm_team_for_reconcile(pred.get("home_team")):
                                home_score = value
                            elif name == _norm_team_for_reconcile(pred.get("away_team")):
                                away_score = value
                    if score_entry.get("_teams_reversed") and home_score is not None and away_score is not None:
                        home_score, away_score = away_score, home_score
                else:
                    secondary = _find_oaio_score_fallback(pred, oaio_scores_map)
                    if secondary:
                        home_score = int(secondary["home_score"])
                        away_score = int(secondary["away_score"])
                        if secondary.get("_teams_reversed"):
                            home_score, away_score = away_score, home_score
                        recovered_by_team_time += 1
                        recovered_by_secondary += 1
                        reconciliation_source = "odds_api_io_team_time"

            if home_score is None or away_score is None:
                no_score += 1
                if age_days is not None and age_days > 3:
                    outside_provider_window += 1
                continue

            result_value = _evaluate_pick_result(pred, int(home_score), int(away_score))
            if result_value:
                await db.predictions_history.update_one(
                    {"signature": pred["signature"]},
                    {"$set": {
                        "result": result_value,
                        "final_score": f"{home_score}-{away_score}",
                        "reconciled_at": datetime.now(timezone.utc).isoformat(),
                        "reconciliation_source": reconciliation_source,
                    }},
                )
                updated += 1
            else:
                unsupported_market += 1
        except Exception:
            errors += 1
            continue

    pending_remaining = await db.predictions_history.count_documents({"result": "pending"})
    result = {
        "ok": True,
        "checked": len(pending),
        "updated": updated,
        "pending_remaining": pending_remaining,
        "required_sport_keys": required_sport_keys,
        "scores_available": len(scores),
        "recovered_by_team_time": recovered_by_team_time,
        "recovered_by_secondary": recovered_by_secondary,
        "no_score": no_score,
        "not_completed": not_completed,
        "unsupported_market": unsupported_market,
        "outside_provider_window": outside_provider_window,
        "errors": errors,
    }
    await db.system_meta.update_one(
        {"_id": "track_sync"},
        {"$set": {"last_run_at": run_at, **result}},
        upsert=True,
    )
    try:
        result["montante"] = await _montante_sync_after_track_results()
    except Exception as exc:
        result["montante"] = {"status": "ERROR", "progressed": False, "detail": str(exc)}
    return result


def _evaluate_pick_result(pred: Dict, home_score: int, away_score: int) -> Optional[str]:
    """Évalue les marchés courants sans dépendre d'une seule langue d'affichage."""
    import re

    def norm(value: str) -> str:
        text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower()
        return re.sub(r"\s+", " ", text).strip()

    pick = norm(pred.get("pick"))
    market = norm(pred.get("market"))
    home = norm(pred.get("home_team"))
    away = norm(pred.get("away_team"))
    total_points = home_score + away_score

    # Nouvelles prédictions : utiliser l'identité structurée, pas une recherche
    # de chiffre dans un nom d'équipe (ex. Schalke 04) ou un libellé traduit.
    if pred.get("selection_id"):
        raw = str(pred.get("pick_raw") or "")
        line = pred.get("pick_point")
        if market == "h2h":
            if raw == "Draw":
                return "won" if home_score == away_score else "lost"
            if raw in (pred.get("home_team"), pred.get("away_team")):
                chosen, other = (home_score, away_score) if raw == pred.get("home_team") else (away_score, home_score)
                return "won" if chosen > other else "lost"
            return None
        if market == "double_chance":
            if raw not in ("1X", "X2", "12"):
                return None
            won = home_score >= away_score if raw == "1X" else away_score >= home_score if raw == "X2" else home_score != away_score
            return "won" if won else "lost"
        if market == "draw_no_bet":
            if raw not in (pred.get("home_team"), pred.get("away_team")):
                return None
            if home_score == away_score:
                return "void"
            chosen, other = (home_score, away_score) if raw == pred.get("home_team") else (away_score, home_score)
            return "won" if chosen > other else "lost"
        if market == "btts":
            if raw not in ("Yes", "No"):
                return None
            both = home_score > 0 and away_score > 0
            return "won" if both == (raw == "Yes") else "lost"
        if market in ("totals", "team_totals", "spreads"):
            try:
                line = float(line)
                if not math.isfinite(line) or abs(line * 2 - round(line * 2)) > 1e-8:
                    return None  # Les quarts de ligne demandent un règlement fractionné.
            except (ValueError, TypeError):
                return None
            if market == "spreads":
                if raw not in (pred.get("home_team"), pred.get("away_team")):
                    return None
                chosen, other = (home_score, away_score) if raw == pred.get("home_team") else (away_score, home_score)
                delta = chosen + line - other
            else:
                if raw not in ("Over", "Under"):
                    return None
                points = total_points
                if market == "team_totals":
                    team = pred.get("pick_team")
                    if team not in (pred.get("home_team"), pred.get("away_team")):
                        return None
                    points = home_score if team == pred.get("home_team") else away_score
                delta = (points - line) * (1 if raw == "Over" else -1)
            return "void" if delta == 0 else "won" if delta > 0 else "lost"
        return None

    # 1X2 / Moneyline
    if market in ("h2h", "moneyline", "ml", "syn_home_win", "syn_away_win"):
        if home and (pick == home or home in pick):
            return "won" if home_score > away_score else "lost"
        if away and (pick == away or away in pick):
            return "won" if away_score > home_score else "lost"
        if any(token in pick for token in ("nul", "draw", "tie")):
            return "won" if home_score == away_score else "lost"

    if market not in ("totals", "alternate_totals", "total", "syn_over_25", "syn_over_15", "") and any(token in pick for token in ("plus de", "moins de", "over", "under")):
        return None

    # Totaux : français ou anglais (Plus de / Moins de / Over / Under)
    if market in ("totals", "total", "syn_over_25", "syn_over_15") or any(
        token in pick for token in ("plus de", "moins de", "over", "under")
    ):
        match_num = re.search(r"(\d+(?:[.,]\d+)?)", pick)
        if match_num:
            threshold = float(match_num.group(1).replace(",", "."))
            if "plus de" in pick or "over" in pick:
                if total_points == threshold:
                    return "void"
                return "won" if total_points > threshold else "lost"
            if "moins de" in pick or "under" in pick:
                if total_points == threshold:
                    return "void"
                return "won" if total_points < threshold else "lost"

    # Both Teams To Score
    if market in ("btts", "syn_btts") or "both teams" in pick or "les deux equipes" in pick:
        both_scored = home_score > 0 and away_score > 0
        if any(token in pick for token in ("oui", "yes", "btts yes")):
            return "won" if both_scored else "lost"
        if any(token in pick for token in ("non", "no", "btts no")):
            return "won" if not both_scored else "lost"

    # Double chance
    if market in ("double_chance", "syn_double_chance"):
        if "1x" in pick or "domicile ou nul" in pick or "home or draw" in pick:
            return "won" if home_score >= away_score else "lost"
        if "x2" in pick or "nul ou victoire exterieure" in pick or "draw or away" in pick:
            return "won" if away_score >= home_score else "lost"
        if pick == "12" or "home or away" in pick or "domicile ou exterieur" in pick:
            return "won" if home_score != away_score else "lost"

    # Draw No Bet
    if market in ("draw_no_bet", "syn_draw_no_bet", "dnb"):
        if home_score == away_score:
            return "void"
        if home and home in pick:
            return "won" if home_score > away_score else "lost"
        if away and away in pick:
            return "won" if away_score > home_score else "lost"

    # Handicap / spread simple : ex. "Lakers -4.5" ou "Team +1.5"
    if market in ("spreads", "spread", "handicap", "asian_handicap"):
        line_match = re.search(r"([+-]\s*\d+(?:[.,]\d+)?)", pick)
        if line_match:
            line = float(line_match.group(1).replace(" ", "").replace(",", "."))
            if home and home in pick:
                adjusted = home_score + line
                return "void" if adjusted == away_score else ("won" if adjusted > away_score else "lost")
            if away and away in pick:
                adjusted = away_score + line
                return "void" if adjusted == home_score else ("won" if adjusted > home_score else "lost")

    if market == "syn_clean_sheet_home":
        return "won" if away_score == 0 else "lost"
    if market == "syn_clean_sheet_away":
        return "won" if home_score == 0 else "lost"

    return None



# ─── Centre de contrôle automatique WinPulse ────────────────────────────────
# Audit fonctionnel quotidien non destructif. Il vérifie la disponibilité,
# les données, les règles Free/Pro, les abonnements et les services critiques.

HEALTH_MONITOR_ENABLED = os.environ.get("HEALTH_MONITOR_ENABLED", "true").strip().lower() in ("1", "true", "yes")
HEALTH_MONITOR_UTC_HOUR = max(0, min(int(os.environ.get("HEALTH_MONITOR_UTC_HOUR", "6")), 23))
HEALTH_MONITOR_UTC_MINUTE = max(0, min(int(os.environ.get("HEALTH_MONITOR_UTC_MINUTE", "30")), 59))
HEALTH_MONITOR_RETENTION_DAYS = max(7, min(int(os.environ.get("HEALTH_MONITOR_RETENTION_DAYS", "90")), 365))
HEALTH_FRONTEND_URL = os.environ.get("HEALTH_FRONTEND_URL", PUBLIC_APP_URL).strip().rstrip("/")
_default_health_alert = sorted(ADMIN_EMAILS)[0] if ADMIN_EMAILS else ""
HEALTH_ALERT_EMAIL = os.environ.get("HEALTH_ALERT_EMAIL", _default_health_alert).strip()


def _health_result(check_id: str, category: str, status_value: str, message: str, *, plan: Optional[str] = None, details: Optional[Dict] = None, duration_ms: Optional[int] = None) -> Dict:
    item = {
        "id": check_id,
        "category": category,
        "status": status_value,
        "message": message,
    }
    if plan:
        item["plan"] = plan
    if details:
        item["details"] = details
    if duration_ms is not None:
        item["duration_ms"] = duration_ms
    return item


def _health_overall_status(checks: List[Dict]) -> str:
    statuses = {str(c.get("status") or "").lower() for c in checks}
    if "fail" in statuses:
        return "critical"
    if "warning" in statuses:
        return "warning"
    return "healthy"


def _health_safe_report(doc: Optional[Dict]) -> Optional[Dict]:
    if not doc:
        return None
    result = dict(doc)
    result.pop("_id", None)
    return result


def _health_routes_snapshot() -> set:
    routes = set()
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None) or []
        if not path:
            continue
        for method in methods:
            routes.add((str(method).upper(), str(path)))
    return routes


def _health_auth_header(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _health_http_check(
    client: httpx.AsyncClient,
    method: str,
    path: str,
    *,
    token: Optional[str] = None,
    expected_status: Optional[int] = 200,
) -> tuple:
    headers = _health_auth_header(token) if token else None
    started = time.perf_counter()
    response = await client.request(method, path, headers=headers)
    elapsed = int((time.perf_counter() - started) * 1000)
    ok = expected_status is None or response.status_code == expected_status
    data = None
    try:
        data = response.json()
    except Exception:
        data = None
    return ok, response, data, elapsed


async def _health_send_alert(report: Dict) -> None:
    if not HEALTH_ALERT_EMAIL:
        return
    overall = report.get("overall_status")
    if overall == "healthy":
        return

    problem_checks = [
        c for c in report.get("checks", [])
        if c.get("status") in ("warning", "fail")
    ]
    rows = "".join(
        f"<li><strong>{html.escape(str(c.get('category', '')))} — {html.escape(str(c.get('id', '')))}</strong> : "
        f"{html.escape(str(c.get('message', '')))}</li>"
        for c in problem_checks[:20]
    )
    body = f"""
        <p>Le contrôle automatique quotidien de WinPulse a détecté un état <strong>{html.escape(str(overall).upper())}</strong>.</p>
        <p>{report.get('summary', {}).get('passed', 0)} contrôle(s) OK, {report.get('summary', {}).get('warnings', 0)} avertissement(s), {report.get('summary', {}).get('failed', 0)} échec(s).</p>
        <ul>{rows}</ul>
        <p>Consulte l'endpoint administrateur <code>/api/admin/health-monitor/latest</code> pour le rapport complet.</p>
    """
    await _send_email(
        HEALTH_ALERT_EMAIL,
        f"WinPulse — contrôle quotidien {str(overall).upper()}",
        _email_layout("Contrôle automatique WinPulse", body),
    )


async def _run_daily_health_audit() -> Dict:
    """Exécute un audit fonctionnel non destructif et enregistre son rapport."""
    run_id = uuid.uuid4().hex
    started_at = datetime.now(timezone.utc)
    checks: List[Dict] = []

    # 1. Base de données
    started = time.perf_counter()
    try:
        await db.command("ping")
        checks.append(_health_result(
            "mongodb_ping", "database", "pass", "MongoDB répond normalement.",
            duration_ms=int((time.perf_counter() - started) * 1000),
        ))
    except Exception as exc:
        checks.append(_health_result(
            "mongodb_ping", "database", "fail", "MongoDB ne répond pas.",
            details={"error": type(exc).__name__},
            duration_ms=int((time.perf_counter() - started) * 1000),
        ))

    # 2. Routes indispensables : vérifie qu'un déploiement n'a pas supprimé un parcours clé.
    required_routes = [
        ("POST", "/api/auth/register"),
        ("POST", "/api/auth/login"),
        ("POST", "/api/auth/forgot-password"),
        ("POST", "/api/auth/reset-password"),
        ("POST", "/api/auth/logout"),
        ("GET", "/api/auth/me"),
        ("GET", "/api/plans"),
        ("GET", "/api/subscription/status"),
        ("POST", "/api/subscription/checkout"),
        ("GET", "/api/payments/config"),
        ("GET", "/api/predictions/top"),
        ("GET", "/api/predictions/today-combos"),
        ("GET", "/api/combos"),
        ("GET", "/api/value-bets"),
        ("GET", "/api/montante"),
        ("POST", "/api/montante/sync-results"),
        ("GET", "/api/builder/matches"),
    ]
    routes = _health_routes_snapshot()
    missing_routes = [f"{method} {path}" for method, path in required_routes if (method, path) not in routes]
    if missing_routes:
        checks.append(_health_result(
            "required_routes", "routing", "fail", "Une ou plusieurs routes indispensables manquent.",
            details={"missing": missing_routes},
        ))
    else:
        checks.append(_health_result(
            "required_routes", "routing", "pass", "Toutes les routes indispensables sont enregistrées.",
            details={"count": len(required_routes)},
        ))

    # 3. Prix canonique : le site ne doit jamais ressortir 4 500 / 6 500 FCFA.
    try:
        plans = _canonical_subscription_plans()
        prices = sorted({
            int(v)
            for plan in plans
            for v in (plan.get("price"), plan.get("price_fcfa"), plan.get("price_xof"))
            if v is not None
        })
        if plans and prices == [WINPULSE_MONTHLY_PRICE_XOF] and WINPULSE_MONTHLY_PRICE_XOF == 10500:
            checks.append(_health_result(
                "subscription_price", "subscription", "pass", "Le tarif Pro est uniformisé à 10 500 FCFA.",
                details={"price_fcfa": WINPULSE_MONTHLY_PRICE_XOF},
            ))
        else:
            checks.append(_health_result(
                "subscription_price", "subscription", "fail", "Un tarif d'abonnement incohérent a été détecté.",
                details={"expected": 10500, "detected": prices},
            ))
    except Exception as exc:
        checks.append(_health_result(
            "subscription_price", "subscription", "fail", "Impossible de valider le tarif d'abonnement.",
            details={"error": type(exc).__name__},
        ))

    # 4. Données / quota fournisseur sans consommer de nouveau crédit API.
    try:
        cache_status = await get_odds_cache_status(db)
        count = int(cache_status.get("count") or 0)
        future_count = int(cache_status.get("future_event_count") or 0)
        hard_stale = bool(cache_status.get("hard_stale"))
        provider = cache_status.get("provider_status") or {}
        if count <= 0 or future_count <= 0 or hard_stale:
            checks.append(_health_result(
                "odds_cache", "sports_data", "fail", "Les données sportives sont absentes ou trop anciennes.",
                details={"count": count, "future_event_count": future_count, "hard_stale": hard_stale},
            ))
        else:
            checks.append(_health_result(
                "odds_cache", "sports_data", "pass", "Le cache sportif contient des événements futurs et reste exploitable.",
                details={"count": count, "future_event_count": future_count, "stale": bool(cache_status.get("stale"))},
            ))

        if provider.get("quota_exhausted"):
            checks.append(_health_result(
                "odds_provider_quota", "sports_data", "fail", "Le quota du fournisseur principal est épuisé.",
                details={"remaining": provider.get("remaining"), "last_http_status": provider.get("last_http_status")},
            ))
        elif provider.get("rate_limited"):
            checks.append(_health_result(
                "odds_provider_quota", "sports_data", "warning", "Le fournisseur principal signale une limitation de débit.",
                details={"remaining": provider.get("remaining"), "last_http_status": provider.get("last_http_status")},
            ))
        else:
            remaining = provider.get("remaining")
            status_value = "warning" if isinstance(remaining, int) and remaining < 1000 else "pass"
            message = "Quota fournisseur disponible." if status_value == "pass" else "Le quota fournisseur devient faible."
            checks.append(_health_result(
                "odds_provider_quota", "sports_data", status_value, message,
                details={"remaining": remaining, "last_http_status": provider.get("last_http_status")},
            ))
    except Exception as exc:
        checks.append(_health_result(
            "odds_cache", "sports_data", "fail", "Impossible de lire l'état des données sportives.",
            details={"error": type(exc).__name__},
        ))

    # 5. Moteur de prédiction : on contrôle le snapshot déjà disponible, sans IA payante.
    try:
        snapshot = await _get_prediction_snapshot()
        match_count = len(snapshot.get("matches") or [])
        prediction_count = len(snapshot.get("predictions") or [])
        if match_count > 0 and prediction_count > 0:
            checks.append(_health_result(
                "prediction_engine", "predictions", "pass", "Le moteur produit des prédictions à partir des matchs disponibles.",
                details={"matches": match_count, "predictions": prediction_count},
            ))
        else:
            checks.append(_health_result(
                "prediction_engine", "predictions", "fail", "Le moteur ne produit actuellement aucun contenu exploitable.",
                details={"matches": match_count, "predictions": prediction_count},
            ))
    except Exception as exc:
        checks.append(_health_result(
            "prediction_engine", "predictions", "fail", "Le moteur de prédiction a levé une erreur.",
            details={"error": type(exc).__name__},
        ))

    # 6. Services paiement / email : configuration uniquement, aucun débit ni email de test.
    payment_issues = []
    if FEDAPAY_ENABLED:
        if not FEDAPAY_SECRET_KEY:
            payment_issues.append("FEDAPAY_SECRET_KEY manquant")
        if not FEDAPAY_WEBHOOK_SECRET:
            payment_issues.append("FEDAPAY_WEBHOOK_SECRET manquant")
        if FEDAPAY_ENV not in ("sandbox", "live"):
            payment_issues.append("FEDAPAY_ENV invalide")
        if not FEDAPAY_CALLBACK_URL.startswith("https://"):
            payment_issues.append("FEDAPAY_CALLBACK_URL doit utiliser HTTPS")
    if payment_issues:
        checks.append(_health_result(
            "payment_config", "payments", "fail", "La configuration FedaPay est incomplète ou invalide.",
            details={"issues": payment_issues, "enabled": FEDAPAY_ENABLED, "environment": FEDAPAY_ENV},
        ))
    else:
        checks.append(_health_result(
            "payment_config", "payments", "pass", "La configuration paiement est cohérente.",
            details={"fedapay_enabled": FEDAPAY_ENABLED, "environment": FEDAPAY_ENV},
        ))

    if RESEND_API_KEY:
        checks.append(_health_result("email_config", "email", "pass", "Le service d'email transactionnel est configuré."))
    else:
        checks.append(_health_result(
            "email_config", "email", "warning", "RESEND_API_KEY est absent : les emails de mot de passe oublié ne pourront pas être envoyés."
        ))

    # 7. Paiements bloqués / erreurs récentes.
    try:
        cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        stale_pending = await db.subscription_requests.count_documents({
            "status": "pending",
            "created_at": {"$lt": cutoff_24h},
        })
        provider_errors = await db.subscription_requests.count_documents({
            "payment_status": "provider_error",
            "created_at": {"$gte": cutoff_24h},
        })
        mismatched_pending = await db.subscription_requests.count_documents({
            "status": {"$in": ["pending", "processing"]},
            "amount_fcfa": {"$ne": WINPULSE_MONTHLY_PRICE_XOF},
        })
        if mismatched_pending:
            checks.append(_health_result(
                "pending_payment_amounts", "payments", "fail", "Des paiements actifs portent encore un ancien montant.",
                details={"count": mismatched_pending, "expected_amount_fcfa": WINPULSE_MONTHLY_PRICE_XOF},
            ))
        else:
            checks.append(_health_result(
                "pending_payment_amounts", "payments", "pass", "Aucun paiement actif n'utilise un ancien tarif."
            ))
        if provider_errors:
            checks.append(_health_result(
                "recent_payment_errors", "payments", "warning", "Des erreurs fournisseur de paiement ont été enregistrées sur les dernières 24 h.",
                details={"count": provider_errors},
            ))
        elif stale_pending:
            checks.append(_health_result(
                "recent_payment_errors", "payments", "warning", "Des paiements sont en attente depuis plus de 24 h.",
                details={"stale_pending": stale_pending},
            ))
        else:
            checks.append(_health_result(
                "recent_payment_errors", "payments", "pass", "Aucune anomalie récente majeure dans les paiements."
            ))
    except Exception as exc:
        checks.append(_health_result(
            "recent_payment_errors", "payments", "warning", "Impossible d'analyser l'historique récent des paiements.",
            details={"error": type(exc).__name__},
        ))

    # 8. Parcours synthétiques Free / Pro sur les vraies routes FastAPI.
    # Les comptes n'existent que pendant l'audit et sont supprimés dans finally.
    free_id = f"health-free-{run_id}"
    pro_id = f"health-pro-{run_id}"
    free_email = f"health-free-{run_id}@monitor.invalid"
    pro_email = f"health-pro-{run_id}@monitor.invalid"
    monitor_filter = {"health_monitor_run_id": run_id}
    try:
        # Nettoyage préventif d'anciens comptes synthétiques abandonnés par un crash.
        await db.auth_sessions.delete_many({"source": "health_monitor"})
        await db.users.delete_many({"health_monitor_account": True})
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.users.insert_many([
            {
                "id": free_id,
                "email": free_email,
                "name": "Health Free",
                "full_name": "Health Free",
                "subscription": "free",
                "subscription_expires_at": None,
                "is_admin": False,
                "created_at": now_iso,
                "health_monitor_account": True,
                "health_monitor_run_id": run_id,
            },
            {
                "id": pro_id,
                "email": pro_email,
                "name": "Health Pro",
                "full_name": "Health Pro",
                "subscription": "pro",
                "subscription_expires_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
                "is_admin": False,
                "created_at": now_iso,
                "health_monitor_account": True,
                "health_monitor_run_id": run_id,
            },
        ])
        free_token = create_access_token(free_id, free_email)
        pro_token = create_access_token(pro_id, pro_email)

        # Les parcours synthétiques utilisent la même sécurité de session que
        # les vrais comptes afin que le contrôle quotidien reste représentatif.
        await _register_auth_session(
            {"id": free_id, "is_admin": False},
            free_token,
            None,
            source="health_monitor",
        )
        await _register_auth_session(
            {"id": pro_id, "is_admin": False},
            pro_token,
            None,
            source="health_monitor",
        )

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="https://www.wnpulse.com",
            timeout=httpx.Timeout(45.0),
        ) as client:
            # Identité / statut abonnement
            for plan_name, token, expected_tier in (
                ("free", free_token, "free"),
                ("pro", pro_token, "pro"),
            ):
                ok, resp, data, elapsed = await _health_http_check(client, "GET", "/api/auth/me", token=token)
                tier = (data or {}).get("subscription_tier") if isinstance(data, dict) else None
                good = ok and tier == expected_tier
                checks.append(_health_result(
                    f"{plan_name}_auth_me", "plan_flow", "pass" if good else "fail",
                    f"Le compte synthétique {plan_name.upper()} est correctement reconnu." if good else f"Le compte {plan_name.upper()} n'est pas reconnu avec le bon plan.",
                    plan=plan_name,
                    details={"http_status": resp.status_code, "subscription_tier": tier},
                    duration_ms=elapsed,
                ))

                ok, resp, data, elapsed = await _health_http_check(client, "GET", "/api/subscription/status", token=token)
                subscription = (data or {}).get("subscription") if isinstance(data, dict) else None
                good = ok and subscription == expected_tier
                checks.append(_health_result(
                    f"{plan_name}_subscription_status", "plan_flow", "pass" if good else "fail",
                    f"Le statut d'abonnement {plan_name.upper()} est cohérent." if good else f"Le statut d'abonnement {plan_name.upper()} est incohérent.",
                    plan=plan_name,
                    details={"http_status": resp.status_code, "subscription": subscription},
                    duration_ms=elapsed,
                ))

            # Prix public réellement servi par l'API.
            ok, resp, data, elapsed = await _health_http_check(client, "GET", "/api/plans")
            api_prices = []
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        api_prices.extend([item.get("price"), item.get("price_fcfa"), item.get("price_xof")])
            api_prices = sorted({int(x) for x in api_prices if x is not None})
            good = ok and api_prices == [WINPULSE_MONTHLY_PRICE_XOF]
            checks.append(_health_result(
                "plans_api_price", "subscription", "pass" if good else "fail",
                "L'API publique sert bien le tarif 10 500 FCFA." if good else "L'API publique sert un tarif inattendu.",
                details={"http_status": resp.status_code, "detected": api_prices, "expected": WINPULSE_MONTHLY_PRICE_XOF},
                duration_ms=elapsed,
            ))

            # Free : 1 pronostic maximum complet dans TOP ; le reste doit rester verrouillé.
            ok, resp, data, elapsed = await _health_http_check(client, "GET", "/api/predictions/top?limit=5", token=free_token)
            free_top_good = ok and isinstance(data, list)
            free_top_details = {"http_status": resp.status_code, "count": len(data) if isinstance(data, list) else None}
            if free_top_good and len(data) > 1:
                unlocked = [i for i, item in enumerate(data) if isinstance(item, dict) and not item.get("locked")]
                locked_after_first = all(isinstance(item, dict) and item.get("locked") is True for item in data[1:])
                free_top_good = unlocked == [0] and locked_after_first
                free_top_details["unlocked_indexes"] = unlocked
            checks.append(_health_result(
                "free_prediction_lock", "plan_flow", "pass" if free_top_good else "fail",
                "Le plan Free ne reçoit qu'un aperçu et les autres pronostics restent verrouillés." if free_top_good else "La règle de verrouillage des pronostics Free ne fonctionne pas correctement.",
                plan="free", details=free_top_details, duration_ms=elapsed,
            ))

            # Pro : aucun pronostic TOP ne doit être marqué locked.
            ok, resp, data, elapsed = await _health_http_check(client, "GET", "/api/predictions/top?limit=5", token=pro_token)
            pro_top_good = ok and isinstance(data, list) and all(not item.get("locked") for item in data if isinstance(item, dict))
            checks.append(_health_result(
                "pro_prediction_access", "plan_flow", "pass" if pro_top_good else "fail",
                "Le plan Pro reçoit les pronostics sans verrouillage Free." if pro_top_good else "Des pronostics Pro restent verrouillés par erreur.",
                plan="pro", details={"http_status": resp.status_code, "count": len(data) if isinstance(data, list) else None}, duration_ms=elapsed,
            ))

            # Combos et Value Bets : Free interdit, Pro autorisé.
            for path, check_name in (("/api/combos", "combos"), ("/api/value-bets", "value_bets")):
                ok_free, resp_free, _, elapsed_free = await _health_http_check(client, "GET", path, token=free_token, expected_status=403)
                checks.append(_health_result(
                    f"free_{check_name}_access", "plan_flow", "pass" if ok_free else "fail",
                    f"L'accès Free à {check_name} est correctement bloqué." if ok_free else f"Le compte Free accède à {check_name} alors qu'il devrait être bloqué.",
                    plan="free", details={"http_status": resp_free.status_code}, duration_ms=elapsed_free,
                ))
                ok_pro, resp_pro, _, elapsed_pro = await _health_http_check(client, "GET", path, token=pro_token, expected_status=200)
                checks.append(_health_result(
                    f"pro_{check_name}_access", "plan_flow", "pass" if ok_pro else "fail",
                    f"L'accès Pro à {check_name} fonctionne." if ok_pro else f"Le compte Pro ne peut pas accéder à {check_name}.",
                    plan="pro", details={"http_status": resp_pro.status_code}, duration_ms=elapsed_pro,
                ))

            # Montante : Free voit le nombre de picks/cartes verrouillées sans
            # recevoir leur contenu ; Pro reçoit les picks complets.
            ok_free, resp_free, free_montante, elapsed_free = await _health_http_check(client, "GET", "/api/montante", token=free_token)
            ok_pro, resp_pro, pro_montante, elapsed_pro = await _health_http_check(client, "GET", "/api/montante", token=pro_token)

            free_good = ok_free
            pro_good = ok_pro
            free_count = None
            pro_count = None
            preview_count = None

            if (
                ok_free
                and ok_pro
                and isinstance(free_montante, dict)
                and isinstance(pro_montante, dict)
                and free_montante.get("status") != "NONE"
                and pro_montante.get("status") != "NONE"
            ):
                free_count = int(free_montante.get("current_pick_count") or 0)
                pro_count = len(pro_montante.get("current_picks") or [])
                preview_count = len(free_montante.get("current_picks_preview") or [])

                free_good = (
                    free_montante.get("picks_locked") is True
                    and not (free_montante.get("current_picks") or [])
                    and free_count == pro_count
                    and preview_count == pro_count
                )
                pro_good = (
                    pro_montante.get("picks_locked") is False
                    and len(pro_montante.get("current_picks") or []) == pro_count
                )

            checks.append(_health_result(
                "free_montante_lock", "plan_flow", "pass" if free_good else "fail",
                "La Montante Free affiche le bon nombre de cartes verrouillées sans exposer les picks."
                if free_good
                else "L'aperçu Montante Free ne correspond pas aux picks réellement disponibles.",
                plan="free",
                details={
                    "http_status": resp_free.status_code,
                    "montante_status": (free_montante or {}).get("status") if isinstance(free_montante, dict) else None,
                    "free_preview_count": preview_count,
                    "free_current_pick_count": free_count,
                    "pro_current_pick_count": pro_count,
                },
                duration_ms=elapsed_free,
            ))
            checks.append(_health_result(
                "pro_montante_access", "plan_flow", "pass" if pro_good else "fail",
                "La Montante Pro est accessible avec les picks complets."
                if pro_good
                else "La Montante reste verrouillée ou incohérente pour le plan Pro.",
                plan="pro",
                details={
                    "http_status": resp_pro.status_code,
                    "montante_status": (pro_montante or {}).get("status") if isinstance(pro_montante, dict) else None,
                    "pro_current_pick_count": pro_count,
                },
                duration_ms=elapsed_pro,
            ))

            # Combinés du jour : la route doit fonctionner pour les deux plans.
            for plan_name, token in (("free", free_token), ("pro", pro_token)):
                ok, resp, data, elapsed = await _health_http_check(client, "GET", "/api/predictions/today-combos", token=token)
                good = ok and isinstance(data, dict) and not data.get("error")
                checks.append(_health_result(
                    f"{plan_name}_today_combos", "plan_flow", "pass" if good else "fail",
                    f"Les combinés du jour fonctionnent pour {plan_name.upper()}." if good else f"Les combinés du jour échouent pour {plan_name.upper()}.",
                    plan=plan_name, details={"http_status": resp.status_code, "error": (data or {}).get("error") if isinstance(data, dict) else None}, duration_ms=elapsed,
                ))

            # Builder : les routes sont testées sans sauvegarde ni mutation utilisateur.
            for plan_name, token in (("free", free_token), ("pro", pro_token)):
                ok, resp, data, elapsed = await _health_http_check(client, "GET", "/api/builder/matches", token=token)
                good = ok and isinstance(data, dict) and isinstance(data.get("matches"), list)
                checks.append(_health_result(
                    f"{plan_name}_builder", "plan_flow", "pass" if good else "fail",
                    f"Le Combo Builder se charge pour {plan_name.upper()}." if good else f"Le Combo Builder ne se charge pas pour {plan_name.upper()}.",
                    plan=plan_name, details={"http_status": resp.status_code, "matches": len(data.get("matches") or []) if isinstance(data, dict) else None}, duration_ms=elapsed,
                ))

            # Configuration de paiement visible par le frontend.
            ok, resp, data, elapsed = await _health_http_check(client, "GET", "/api/payments/config")
            checks.append(_health_result(
                "payment_config_api", "payments", "pass" if ok else "fail",
                "L'interface peut lire la configuration de paiement." if ok else "L'interface ne peut pas lire la configuration de paiement.",
                details={"http_status": resp.status_code, "fedapay_enabled": (data or {}).get("fedapay_enabled") if isinstance(data, dict) else None}, duration_ms=elapsed,
            ))

    except Exception as exc:
        checks.append(_health_result(
            "synthetic_plan_flows", "plan_flow", "fail", "Le test synthétique Free/Pro n'a pas pu être mené jusqu'au bout.",
            details={"error": type(exc).__name__, "message": str(exc)[:250]},
        ))
    finally:
        try:
            await db.auth_sessions.delete_many({"source": "health_monitor"})
            await db.users.delete_many(monitor_filter)
            # Supprime aussi les comptes synthétiques abandonnés par une ancienne exécution interrompue.
            await db.users.delete_many({"health_monitor_account": True})
        except Exception:
            pass

    # 9. Frontend public : vérifie DNS/TLS/HTTP, sans analyser le rendu graphique.
    if HEALTH_FRONTEND_URL:
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as public_http:
                response = await public_http.get(HEALTH_FRONTEND_URL)
            elapsed = int((time.perf_counter() - started) * 1000)
            if response.status_code < 400:
                checks.append(_health_result(
                    "frontend_reachability", "frontend", "pass", "Le site public est accessible en HTTPS.",
                    details={"status_code": response.status_code, "url": str(response.url)}, duration_ms=elapsed,
                ))
            elif response.status_code < 500:
                checks.append(_health_result(
                    "frontend_reachability", "frontend", "warning", "Le site public répond mais avec un code HTTP anormal.",
                    details={"status_code": response.status_code, "url": str(response.url)}, duration_ms=elapsed,
                ))
            else:
                checks.append(_health_result(
                    "frontend_reachability", "frontend", "fail", "Le site public retourne une erreur serveur.",
                    details={"status_code": response.status_code, "url": str(response.url)}, duration_ms=elapsed,
                ))
        except Exception as exc:
            checks.append(_health_result(
                "frontend_reachability", "frontend", "fail", "Le site public n'est pas joignable depuis le backend.",
                details={"error": type(exc).__name__},
                duration_ms=int((time.perf_counter() - started) * 1000),
            ))

    # 10. Scheduler : l'audit quotidien doit lui-même être surveillé.
    try:
        scheduler_obj = globals().get("scheduler")
        jobs = [job.id for job in scheduler_obj.get_jobs()] if scheduler_obj and scheduler_obj.running else []
        expected_jobs = {"odds_full_refresh", "results_reconcile", "montante_result_sync", "subscription_sweep"}
        if HEALTH_MONITOR_ENABLED:
            expected_jobs.add("site_health_audit")
        missing_jobs = sorted(expected_jobs.difference(jobs)) if ENABLE_INTERNAL_SCHEDULER else []
        if not ENABLE_INTERNAL_SCHEDULER:
            checks.append(_health_result(
                "internal_scheduler", "scheduler", "warning", "ENABLE_INTERNAL_SCHEDULER est désactivé : les contrôles automatiques ne s'exécuteront pas seuls."
            ))
        elif not HEALTH_MONITOR_ENABLED:
            checks.append(_health_result(
                "internal_scheduler", "scheduler", "warning", "HEALTH_MONITOR_ENABLED est désactivé : le contrôle quotidien ne s'exécutera pas automatiquement.",
                details={"registered": jobs},
            ))
        elif missing_jobs:
            checks.append(_health_result(
                "internal_scheduler", "scheduler", "fail", "Des tâches automatiques attendues ne sont pas planifiées.",
                details={"missing": missing_jobs, "registered": jobs},
            ))
        else:
            checks.append(_health_result(
                "internal_scheduler", "scheduler", "pass", "Les tâches automatiques essentielles sont planifiées.",
                details={"registered": jobs},
            ))
    except Exception as exc:
        checks.append(_health_result(
            "internal_scheduler", "scheduler", "warning", "Impossible de lire l'état du scheduler.",
            details={"error": type(exc).__name__},
        ))

    finished_at = datetime.now(timezone.utc)
    overall = _health_overall_status(checks)
    passed = sum(1 for c in checks if c.get("status") == "pass")
    warnings = sum(1 for c in checks if c.get("status") == "warning")
    failed = sum(1 for c in checks if c.get("status") == "fail")
    report = {
        "run_id": run_id,
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_ms": int((finished_at - started_at).total_seconds() * 1000),
        "overall_status": overall,
        "summary": {
            "total": len(checks),
            "passed": passed,
            "warnings": warnings,
            "failed": failed,
        },
        "checks": checks,
        "expires_at": finished_at + timedelta(days=HEALTH_MONITOR_RETENTION_DAYS),
    }

    try:
        await db.health_monitor_reports.insert_one(dict(report))
    except Exception as exc:
        # Si l'enregistrement du rapport échoue, on conserve quand même le résultat
        # dans les logs et dans la réponse du run manuel.
        report["storage_warning"] = type(exc).__name__

    try:
        await _health_send_alert(report)
    except Exception:
        pass

    print(
        f"[WinPulse Health] status={overall} pass={passed} warning={warnings} fail={failed} run_id={run_id}"
    )
    return report


@app.get("/api/health")
async def public_health():
    """Liveness minimal : ne révèle aucun secret ni détail d'infrastructure."""
    try:
        await db.command("ping")
        database_ok = True
    except Exception:
        database_ok = False
    return {
        "ok": database_ok,
        "service": "winpulse-api",
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/admin/health-monitor/latest")
async def admin_health_monitor_latest(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)
    doc = await db.health_monitor_reports.find_one(sort=[("started_at", -1)])
    if not doc:
        return {"status": "never_run", "message": "Aucun contrôle automatique n'a encore été exécuté."}
    return _health_safe_report(doc)


@app.get("/api/admin/health-monitor/history")
async def admin_health_monitor_history(
    limit: int = 30,
    payload: dict = Depends(get_current_user_payload),
):
    await _require_admin(payload)
    safe_limit = max(1, min(int(limit), 100))
    docs = await db.health_monitor_reports.find({}).sort("started_at", -1).to_list(length=safe_limit)
    return {"reports": [_health_safe_report(doc) for doc in docs]}


@app.post("/api/admin/health-monitor/run")
async def admin_health_monitor_run(payload: dict = Depends(get_current_user_payload)):
    await _require_admin(payload)
    result = await _run_with_scheduler_lease(
        "site_health_audit", _run_daily_health_audit, lease_seconds=1800
    )
    if result is None:
        raise HTTPException(status_code=409, detail="Un contrôle WinPulse est déjà en cours")
    return result

# ─── Workers automatiques : refresh des matchs + reconciliation ───────────────

scheduler = AsyncIOScheduler(timezone="UTC")
_blog_news_scheduler = AsyncIOScheduler(timezone="UTC")
_blog_news_task = None
_live_video_scheduler = AsyncIOScheduler(timezone="UTC")
_live_video_task = None


async def _safe_live_video_sync():
    try:
        return await asyncio.wait_for(synchronize_streams(db), timeout=60)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logging.getLogger(__name__).warning("Live video refresh failed: %s", type(exc).__name__)
        return {"status": "error"}


async def _start_live_video_sync():
    global _live_video_task
    if not live_video_configuration()["configured"]:
        return False
    if _live_video_task and not _live_video_task.done():
        return False
    _live_video_task = asyncio.create_task(_safe_live_video_sync())
    return True


async def _safe_blog_news_sync():
    try:
        return await asyncio.wait_for(synchronize_news(db), timeout=60)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logging.getLogger(__name__).warning("News collection failed: %s", type(exc).__name__)
        return {"status": "error", "added": 0}


async def _start_blog_news_sync():
    global _blog_news_task
    if not blog_news_config()["enabled"]:
        return False
    if _blog_news_task and not _blog_news_task.done():
        return False
    _blog_news_task = asyncio.create_task(_safe_blog_news_sync())
    return True
SCHEDULER_INSTANCE_ID = os.environ.get("INSTANCE_ID", uuid.uuid4().hex)
ENABLE_INTERNAL_SCHEDULER = os.environ.get("ENABLE_INTERNAL_SCHEDULER", "true").strip().lower() in ("1", "true", "yes")


async def _full_refresh_and_track():
    matches = await refresh_matches_worker(db)
    all_matches = await fetch_all_matches(db)
    try:
        await refresh_real_stats_cache(db, all_matches)
    except Exception:
        pass
    await _save_predictions_to_history(all_matches)
    try:
        await _update_closing_odds(all_matches)
    except Exception:
        pass
    await _reconcile_predictions_with_scores(force_score_refresh=True)
    await _invalidate_prediction_cache()
    return matches


async def _run_with_scheduler_lease(job_name: str, job_func, lease_seconds: int = 3300):
    """Empêche plusieurs workers/replicas d'exécuter simultanément le même job."""
    now = datetime.now(timezone.utc)
    lease_until = now + timedelta(seconds=max(60, lease_seconds))
    try:
        lock = await db.scheduler_locks.find_one_and_update(
            {
                "_id": job_name,
                "$or": [
                    {"lease_until": {"$lte": now.isoformat()}},
                    {"lease_until": {"$exists": False}},
                    {"owner": SCHEDULER_INSTANCE_ID},
                ],
            },
            {
                "$set": {
                    "owner": SCHEDULER_INSTANCE_ID,
                    "lease_until": lease_until.isoformat(),
                    "acquired_at": now.isoformat(),
                }
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        return None

    if not lock or lock.get("owner") != SCHEDULER_INSTANCE_ID:
        return None

    try:
        result = await job_func()
        await db.scheduler_locks.update_one(
            {"_id": job_name, "owner": SCHEDULER_INSTANCE_ID},
            {"$set": {"last_completed_at": datetime.now(timezone.utc).isoformat()}},
        )
        return result
    except Exception:
        # Le lease reste actif jusqu'à son expiration pour éviter qu'un second
        # worker relance immédiatement le même job pendant une défaillance.
        raise


async def _scheduled_full_refresh():
    return await _run_with_scheduler_lease("odds_full_refresh", _full_refresh_and_track, lease_seconds=3500)


async def _force_track_reconcile():
    return await _reconcile_predictions_with_scores(force_score_refresh=True)


async def _scheduled_reconcile():
    return await _run_with_scheduler_lease("results_reconcile", _force_track_reconcile, lease_seconds=6600)


async def _scheduled_montante_result_sync():
    async def run_targeted_sync():
        _state, diagnostic = await _montante_sync_current_results(force_provider=False)
        return diagnostic

    return await _run_with_scheduler_lease(
        "montante_result_sync",
        run_targeted_sync,
        lease_seconds=max(90, MONTANTE_RESULT_SYNC_MINUTES * 60 - 10),
    )


async def _scheduled_subscription_sweep():
    return await _run_with_scheduler_lease("subscription_sweep", _sweep_expired_subscriptions, lease_seconds=3300)


async def _scheduled_health_audit():
    return await _run_with_scheduler_lease("site_health_audit", _run_daily_health_audit, lease_seconds=1800)


@app.on_event("startup")
async def startup_event():
    try:
        await asyncio.wait_for(bootstrap_streams(db), timeout=10)
        if live_video_configuration()["configured"]:
            _live_video_scheduler.add_job(
                _start_live_video_sync, "interval", minutes=1, id="live_video_refresh",
                replace_existing=True, coalesce=True, max_instances=1,
            )
            _live_video_scheduler.start()
            await _start_live_video_sync()
    except Exception as exc:
        logging.getLogger(__name__).warning("Live video initialization failed: %s", type(exc).__name__)
    # Guides publics : ajout initial uniquement ; les modifications et retraits
    # de l’administrateur sont conservés lors des redémarrages/déploiements.
    try:
        await asyncio.wait_for(bootstrap_blog(db), timeout=20)
    except Exception as exc:
        logging.getLogger(__name__).warning("Blog initialization failed: %s", type(exc).__name__)

    try:
        await asyncio.wait_for(bootstrap_news(db), timeout=15)
        if blog_news_config()["enabled"]:
            # Dedicated scheduler: news remain automatic even when paid odds
            # refresh jobs are intentionally disabled with ENABLE_INTERNAL_SCHEDULER.
            _blog_news_scheduler.add_job(
                _start_blog_news_sync, "interval", minutes=5, id="blog_auto_news",
                replace_existing=True, coalesce=True, max_instances=1,
            )
            _blog_news_scheduler.start()
            await _start_blog_news_sync()  # Network work happens in the background.
    except Exception as exc:
        logging.getLogger(__name__).warning("News initialization failed: %s", type(exc).__name__)

    # Archive Track Record : un score final doit être enregistré une seule fois
    # et rester retrouvable après expiration de la fenêtre fournisseur.
    try:
        await db.scores_archive.create_index("event_id", unique=True)
        await db.scores_archive.create_index("commence_time")
    except Exception:
        # Un problème d'index ne doit jamais empêcher le démarrage de l'API.
        pass

    # Tokens de mot de passe oublié : hash unique + suppression automatique à expiration.
    try:
        await db.password_reset_tokens.create_index("token_hash", unique=True)
        await db.password_reset_tokens.create_index("user_id")
        await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass

    # Anti-bruteforce partagé + contraintes d'identité.
    try:
        await db.security_rate_limits.create_index("expires_at", expireAfterSeconds=0)
        await db.security_rate_limits.create_index([("scope", 1), ("identifier_hash", 1)])
    except Exception:
        pass
    # Sessions d'authentification : index par compte + purge TTL.
    # Free/Pro utilisent active_session_hash dans users pour garantir une seule
    # session ; Admin peut conserver plusieurs documents actifs simultanément.
    try:
        await db.auth_sessions.create_index("user_id")
        await db.auth_sessions.create_index([("user_id", 1), ("revoked", 1)])
        await db.auth_sessions.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass

    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
    except Exception:
        pass

    # Rapports du contrôle automatique : historique limité et purge TTL.
    try:
        await db.health_monitor_reports.create_index("started_at")
        await db.health_monitor_reports.create_index("expires_at", expireAfterSeconds=0)
        await db.health_monitor_reports.create_index("overall_status")
    except Exception:
        pass

    # Rattrapage immédiat du Track Record au redémarrage. Les endpoints de scores
    # sont distincts des cotes et la synchronisation cible uniquement les sports
    # des pronostics encore pending. Cela évite plusieurs jours de statistiques figées.
    try:
        pending_at_startup = await db.predictions_history.count_documents({"result": "pending"})
        if pending_at_startup:
            await _run_with_scheduler_lease(
                "startup_results_reconcile", _force_track_reconcile, lease_seconds=900
            )
    except Exception:
        pass

    # Rattrapage Montante au démarrage. Ne consulte le fournisseur que si un
    # match actif devrait déjà être terminé.
    try:
        await _montante_sync_current_results(force_provider=False)
    except Exception:
        pass

    if ENABLE_INTERNAL_SCHEDULER:
        # Deux refresh complets par jour par défaut (06:05 et 13:05 WAT = 05:05
        # et 12:05 UTC). L'ancien refresh horaire pouvait épuiser très vite le
        # quota The Odds API puisque chaque marché/région consomme des crédits.
        refresh_utc_hours = os.environ.get("ODDS_AUTO_REFRESH_UTC_HOURS", "5,12").strip() or "5,12"
        refresh_minute = max(0, min(int(os.environ.get("ODDS_AUTO_REFRESH_MINUTE", "5")), 59))
        scheduler.add_job(
            _scheduled_full_refresh,
            "cron",
            hour=refresh_utc_hours,
            minute=refresh_minute,
            id="odds_full_refresh",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
        scheduler.add_job(_scheduled_reconcile, "cron", minute=0, hour="*/2", id="results_reconcile", replace_existing=True, coalesce=True, max_instances=1)
        # Synchronisation dédiée Montante : uniquement 1–2 picks actifs, donc bien
        # plus légère que la réconciliation générale du Track Record.
        scheduler.add_job(
            _scheduled_montante_result_sync,
            "interval",
            minutes=MONTANTE_RESULT_SYNC_MINUTES,
            id="montante_result_sync",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
        scheduler.add_job(_scheduled_subscription_sweep, "cron", minute=30, id="subscription_sweep", replace_existing=True, coalesce=True, max_instances=1)
        if HEALTH_MONITOR_ENABLED:
            scheduler.add_job(
                _scheduled_health_audit,
                "cron",
                hour=HEALTH_MONITOR_UTC_HOUR,
                minute=HEALTH_MONITOR_UTC_MINUTE,
                id="site_health_audit",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
            )
        scheduler.start()

    existing = await db.odds_cache.find_one({"_id": "all_matches"})
    should_refresh = not existing
    if existing:
        try:
            cache_status = await get_odds_cache_status(db)
            # Un simple TTL court ne doit pas déclencher un appel payant à chaque
            # redémarrage/déploiement. On auto-refresh au démarrage uniquement si
            # le cache est réellement ancien.
            should_refresh = bool(cache_status.get("hard_stale"))
        except Exception:
            should_refresh = False
    if should_refresh:
        await _run_with_scheduler_lease("startup_refresh", _full_refresh_and_track, lease_seconds=900)


@app.on_event("shutdown")
async def shutdown_event():
    if _live_video_scheduler.running:
        _live_video_scheduler.shutdown(wait=False)
    if _live_video_task and not _live_video_task.done():
        _live_video_task.cancel()
        try:
            await asyncio.wait_for(_live_video_task, timeout=5)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    if _blog_news_scheduler.running:
        _blog_news_scheduler.shutdown(wait=False)
    if _blog_news_task and not _blog_news_task.done():
        _blog_news_task.cancel()
        try:
            await asyncio.wait_for(_blog_news_task, timeout=5)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    if _live_scores_refresh_task and not _live_scores_refresh_task.done():
        _live_scores_refresh_task.cancel()
        try:
            await asyncio.wait_for(_live_scores_refresh_task, timeout=5)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    if scheduler.running:
        scheduler.shutdown(wait=False)
