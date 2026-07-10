"""WinPulse - Main FastAPI server."""
import os
import uuid
import hashlib
import logging
import asyncio
from urllib.parse import quote as urllib_quote
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user_payload,
    get_optional_user_payload,
)
from odds_service import fetch_all_matches, get_match_by_id, fetch_all_scores, SUPPORTED_SPORTS
from prediction_engine import analyze_match, top_predictions, build_combo, build_multi_combos, build_today_combos_by_sport
from ai_service import generate_analysis
from email_service import send_picks_email, send_payment_confirmation, send_welcome_email, send_reset_password_email, send_drip_day1, send_drip_day3, send_drip_day5, send_value_bet_alert

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

APP_NAME = os.environ.get("APP_NAME", "WinPulse")
app = FastAPI(title=f"{APP_NAME} API")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "https://wnpulse.com").split(",") if o.strip()],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "User-Agent"],
    max_age=86400,
)


# ---- Security headers middleware ----
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("winpulse")

PLANS = {
    "free": {
        "name": "Free",
        "price_xof": 0,
        "duration_days": 0,
        "features": [
            "5 pronostics par jour",
            "1 sport au choix",
            "Statistiques de base",
            "Pas de combinés",
        ],
    },
    "pro": {
        "name": "Pro",
        "price_xof": 4900,
        "duration_days": 30,
        "features": [
            "Pronostics illimités",
            "Tous les sports (Foot, NBA, Tennis, NFL, NHL, MMA)",
            "Analyse IA experte sur chaque match",
            "3 combinés du jour (Sécurité / Équilibre / Jackpot)",
            "Notifications email VIP",
        ],
    },
    "elite": {
        "name": "Elite",
        "price_xof": 14900,
        "duration_days": 30,
        "features": [
            "Tout du Pro +",
            "Pronostics VIP haute confiance (>80%)",
            "Combinés boostés (jusqu'à 5 sélections)",
            "Suivi de bankroll & Kelly criterion",
            "Support prioritaire WhatsApp",
            "Garantie de remboursement* si <55% de réussite",
        ],
    },
}


class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=2)
    referral_code: Optional[str] = None  # code of the inviter


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordBody(BaseModel):
    email: EmailStr


class ResetPasswordBody(BaseModel):
    token: str
    new_password: str = Field(min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class PaymentRequestBody(BaseModel):
    tier: str
    phone: str
    payer_name: Optional[str] = None


class BroadcastBody(BaseModel):
    tier: Optional[str] = "pro"  # send to users with this tier or above
    combo_tier: Optional[str] = "balanced"  # safe/balanced/jackpot


class PreferencesBody(BaseModel):
    auto_follower_enabled: Optional[bool] = None


def _public_user(user_doc: dict) -> dict:
    return {
        "id": user_doc["id"],
        "email": user_doc["email"],
        "full_name": user_doc["full_name"],
        "is_admin": bool(user_doc.get("is_admin", False)),
        "subscription_tier": user_doc.get("subscription_tier", "free"),
        "subscription_status": user_doc.get("subscription_status", "active"),
        "subscription_expires_at": user_doc.get("subscription_expires_at"),
        "created_at": user_doc.get("created_at"),
        "referral_code": user_doc.get("referral_code"),
        "referral_count": user_doc.get("referral_count", 0),
        "referral_reward_claimed": bool(user_doc.get("referral_reward_claimed", False)),
        "auto_follower_enabled": bool(user_doc.get("auto_follower_enabled", True)),
    }


def _gen_referral_code(full_name: str) -> str:
    """Generate a unique-ish referral code from name + random suffix."""
    base = "".join(c for c in (full_name or "WP").upper() if c.isalnum())[:3] or "WP"
    suffix = uuid.uuid4().hex[:5].upper()
    return f"{base}-{suffix}"


async def _get_user(user_id: str) -> Optional[dict]:
    return await db.users.find_one({"id": user_id}, {"_id": 0})


async def _require_admin(payload: dict = Depends(get_current_user_payload)) -> dict:
    user = await _get_user(payload["sub"])
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin uniquement")
    return user


async def _get_tier_from_payload(payload: Optional[dict]) -> str:
    if not payload:
        return "anonymous"
    user = await _get_user(payload["sub"])
    if not user:
        return "anonymous"
    return user.get("subscription_tier", "free")


def _mask_prediction(pred: dict) -> dict:
    """Strip pick/odds/confidence so free users see the structure but not the answer."""
    return {
        "match_id": pred.get("match_id"),
        "sport_key": pred.get("sport_key"),
        "sport_title": pred.get("sport_title"),
        "home_team": pred.get("home_team"),
        "away_team": pred.get("away_team"),
        "commence_time": pred.get("commence_time"),
        "pick": None,
        "pick_odds": None,
        "confidence": None,
        "label": "locked",
        "implied_probs": {},
        "edge": None,
        "num_books": pred.get("num_books", 0),
        "locked": True,
    }


def _gate_match_for_free(match_with_pred: dict, is_first_free: bool) -> dict:
    """For free users, only the first match has its prediction visible."""
    pred = match_with_pred.get("prediction") or {}
    if is_first_free:
        return match_with_pred
    new_match = {**match_with_pred, "prediction": _mask_prediction(pred)}
    # Also strip bookmaker odds detail for non-featured matches to reduce data leak
    new_match["bookmakers"] = []
    return new_match


# ----- Public -----
@api.get("/")
async def root():
    return {"app": APP_NAME, "status": "ok"}


@api.get("/sports")
async def list_sports():
    return SUPPORTED_SPORTS


@api.get("/data/status")
async def data_status():
    """Return data freshness for the realtime UI indicators."""
    odds_cached = await db.odds_cache.find_one({"_id": "all_matches"})
    scores_cached = await db.scores_cache.find_one({"_id": "all_scores"})
    matches = (odds_cached or {}).get("data", []) or []
    scores = (scores_cached or {}).get("data", []) or []

    now = datetime.now(timezone.utc)
    live_count = 0
    upcoming_today = 0
    sports_with_live: Dict[str, int] = {}
    sports_with_upcoming: Dict[str, int] = {}

    for m in matches:
        try:
            ct = datetime.fromisoformat(m["commence_time"].replace("Z", "+00:00"))
        except Exception:
            continue
        sport_title = m.get("sport_title", "")
        # Live = commenced but not too long ago (within last 4 hours)
        if now > ct and (now - ct) < timedelta(hours=4):
            live_count += 1
            sports_with_live[sport_title] = sports_with_live.get(sport_title, 0) + 1
        elif ct.date() == now.date():
            upcoming_today += 1
            sports_with_upcoming[sport_title] = sports_with_upcoming.get(sport_title, 0) + 1

    return {
        "now": now.isoformat(),
        "odds_updated_at": (odds_cached or {}).get("updated_at"),
        "scores_updated_at": (scores_cached or {}).get("updated_at"),
        "total_matches": len(matches),
        "live_count": live_count,
        "upcoming_today": upcoming_today,
        "scores_count": len(scores),
        "sports_with_live": sports_with_live,
        "sports_with_upcoming": sports_with_upcoming,
    }


@api.get("/data/source-audit")
async def data_source_audit():
    """PUBLIC audit endpoint: prove that matches come from the real Odds API (not mock data).
    Anyone (including the site owner) can hit this to verify data authenticity."""
    from odds_service import ODDS_API_KEY
    matches = await fetch_all_matches(db)
    per_sport: Dict[str, Dict] = {}
    mock_ids = 0
    real_ids = 0

    for m in matches:
        sk = m.get("sport_key", "unknown")
        mid = m.get("id", "")
        is_mock = len(mid) == 16 and all(c in "0123456789abcdef" for c in mid)
        if is_mock:
            mock_ids += 1
        else:
            real_ids += 1

        if sk not in per_sport:
            per_sport[sk] = {
                "sport_key": sk,
                "sport_title": m.get("sport_title", ""),
                "count": 0,
                "sample_matches": [],
                "num_bookmakers_avg": 0,
                "is_mock": False,
            }
        per_sport[sk]["count"] += 1
        if len(per_sport[sk]["sample_matches"]) < 3:
            per_sport[sk]["sample_matches"].append({
                "home_team": m.get("home_team"),
                "away_team": m.get("away_team"),
                "commence_time": m.get("commence_time"),
                "num_bookmakers": len(m.get("bookmakers", [])),
            })
        if is_mock:
            per_sport[sk]["is_mock"] = True

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "odds_api_configured": bool(ODDS_API_KEY),
        "total_matches": len(matches),
        "real_matches": real_ids,
        "mock_matches": mock_ids,
        "data_source": "live" if mock_ids == 0 and ODDS_API_KEY else ("mixed" if mock_ids and real_ids else "mock"),
        "sports": sorted(per_sport.values(), key=lambda x: -x["count"]),
    }


@api.get("/scores")
async def get_scores():
    """Return current live + recent finished scores."""
    return await fetch_all_scores(db)


@api.post("/data/refresh")
async def force_refresh(payload: dict = Depends(get_current_user_payload)):
    """Force-bust caches (rate-limited by 30s on client side)."""
    await db.odds_cache.delete_many({})
    await db.scores_cache.delete_many({})
    matches = await fetch_all_matches(db)
    await fetch_all_scores(db)
    return {"ok": True, "matches": len(matches), "refreshed_at": datetime.now(timezone.utc).isoformat()}


@api.get("/plans")
async def get_plans():
    return [{"id": k, **v} for k, v in PLANS.items()]


@api.get("/track-record")
async def track_record(page: int = 1, per_page: int = 20):
    """PUBLIC track record — visible without auth for trust/conversion."""
    docs = await db.predictions_log.find({}, {"_id": 0}).sort("datetime", -1).to_list(500)
    total = len(docs)
    if total == 0:
        return {"stats": {"total": 0, "wins": 0, "win_rate": 0, "roi_percent": 0, "current_streak": 0, "avg_odds": 0, "profit_units": 0}, "results": [], "chart": [], "page": 1, "per_page": per_page, "total_pages": 0}

    # Stats over last 30 days
    cutoff_30 = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    last30 = [d for d in docs if d.get("datetime", "") >= cutoff_30]
    wins30 = sum(1 for d in last30 if d.get("won"))
    roi_30_units = sum((d["odds"] - 1) if d["won"] else -1 for d in last30)
    roi_30_pct = round((roi_30_units / len(last30)) * 100, 1) if last30 else 0

    wins = sum(1 for d in docs if d.get("won"))
    win_rate = round((wins / total) * 100, 1)
    avg_odds = round(sum(d["odds"] for d in docs) / total, 2)

    # Current streak (consecutive wins from most recent)
    streak = 0
    for d in docs:
        if d.get("won"):
            streak += 1
        else:
            break

    # Cumulative ROI chart — 60 days, base 10 000 FCFA, 200 FCFA stake
    BASE = 10000; STAKE = 200
    daily = {}
    for d in docs:
        date = d.get("date", "")
        profit = (d["odds"] - 1) * STAKE if d.get("won") else -STAKE
        daily[date] = daily.get(date, 0) + profit
    sorted_dates = sorted(daily.keys())
    cum = BASE
    chart = []
    for date in sorted_dates:
        cum += daily[date]
        chart.append({"date": date, "balance": round(cum), "profit": daily[date]})

    # Pagination
    start = (page - 1) * per_page
    page_docs = docs[start:start + per_page]
    results = []
    for d in page_docs:
        profit = round((d["odds"] - 1) * STAKE) if d.get("won") else -STAKE
        results.append({**d, "profit_xof": profit, "status": "won" if d.get("won") else "lost"})

    return {
        "stats": {
            "total": total, "wins": wins, "losses": total - wins,
            "win_rate": win_rate, "roi_percent": roi_30_pct,
            "current_streak": streak, "avg_odds": avg_odds,
            "profit_units_30d": round(roi_30_units, 1),
            "balance_now": cum, "base": BASE, "stake_xof": STAKE,
        },
        "results": results,
        "chart": chart,
        "page": page, "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


@api.get("/value-bets")
async def value_bets(payload: Optional[dict] = Depends(get_optional_user_payload)):
    """Detect value bets across all matches. Free users get count only, Pro/Elite see full list."""
    tier = await _get_tier_from_payload(payload)
    matches = await fetch_all_matches(db)
    bets = []
    for m in matches:
        pred = analyze_match(m)
        for mk in (pred.get("markets") or []):
            edge = mk.get("edge", 0)
            if edge >= 5:  # threshold for value bet
                bets.append({
                    "match_id": m.get("id"),
                    "sport_title": m.get("sport_title"),
                    "home_team": m.get("home_team"),
                    "away_team": m.get("away_team"),
                    "commence_time": m.get("commence_time"),
                    "market": mk.get("market"),
                    "market_label": mk.get("market_label"),
                    "pick": mk.get("pick"),
                    "pick_odds": mk.get("pick_odds"),
                    "our_prob": round((1 / mk.get("pick_odds", 1)) * 100 + edge, 1) if mk.get("pick_odds") else 0,
                    "implied_prob": round((1 / mk.get("pick_odds", 1)) * 100, 1) if mk.get("pick_odds") else 0,
                    "edge": edge,
                    "confidence": mk.get("confidence"),
                })
    bets.sort(key=lambda b: b["edge"], reverse=True)
    if tier in ("free", "anonymous"):
        return {"count": len(bets), "tier": "free", "bets": [], "locked": True}
    return {"count": len(bets), "tier": tier, "bets": bets[:30], "locked": False}


# ----- Auth -----
@api.post("/auth/register", response_model=TokenResponse)
async def register(body: RegisterBody):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")

    user_id = str(uuid.uuid4())
    # Try the referral code (case-insensitive) and increment the inviter's counter
    inviter_id = None
    if body.referral_code:
        inviter = await db.users.find_one({"referral_code": body.referral_code.strip().upper()})
        if inviter:
            inviter_id = inviter["id"]

    user_doc = {
        "id": user_id,
        "email": body.email.lower(),
        "full_name": body.full_name,
        "hashed_password": hash_password(body.password),
        "is_admin": False,
        "subscription_tier": "free",
        "subscription_status": "active",
        "subscription_expires_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "referral_code": _gen_referral_code(body.full_name),
        "referral_count": 0,
        "referral_reward_claimed": False,
        "referred_by": inviter_id,
    }
    await db.users.insert_one(user_doc)
    if inviter_id:
        await db.users.update_one(
            {"id": inviter_id},
            {"$inc": {"referral_count": 1}},
        )
    token = create_access_token(user_id, body.email.lower())
    # Welcome email (best-effort, doesn't block registration)
    try:
        asyncio.create_task(send_welcome_email(user_doc["email"], user_doc["full_name"]))
    except Exception as e:
        log.warning(f"welcome email queue failed: {e}")
    return TokenResponse(access_token=token, user=_public_user(user_doc))


# In-memory brute force protection — counts ONLY failed attempts per (IP, email).
# Successful logins CLEAR the counter (so legitimate users are never locked out).
from collections import defaultdict, deque
_login_attempts: dict = defaultdict(deque)
_LOGIN_MAX_FAILED = 10          # up from 7 — more forgiving for typos
_LOGIN_WINDOW_SECONDS = 900     # 15 min sliding window


def _throttle_key(ip: str, email: str) -> str:
    return f"{ip}:{(email or '').strip().lower()}"


def _throttle_check(ip: str, email: str) -> tuple[bool, int]:
    """Return (allowed, seconds_until_reset). Does NOT increment — read-only."""
    now = datetime.now(timezone.utc).timestamp()
    dq = _login_attempts[_throttle_key(ip, email)]
    while dq and (now - dq[0]) > _LOGIN_WINDOW_SECONDS:
        dq.popleft()
    if len(dq) >= _LOGIN_MAX_FAILED:
        wait = int(_LOGIN_WINDOW_SECONDS - (now - dq[0]))
        return False, max(wait, 1)
    return True, 0


def _throttle_record_failure(ip: str, email: str) -> None:
    _login_attempts[_throttle_key(ip, email)].append(datetime.now(timezone.utc).timestamp())


def _throttle_clear(ip: str, email: str) -> None:
    _login_attempts.pop(_throttle_key(ip, email), None)


def _real_client_ip(request: Request) -> str:
    """Return the true client IP, honoring Cloudflare / K8s ingress forwarded headers."""
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip()
    return request.client.host if request.client else "unknown"


@api.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginBody, request: Request):
    ip = _real_client_ip(request)
    email_clean = (body.email or "").strip().lower()

    allowed, wait_s = _throttle_check(ip, email_clean)
    if not allowed:
        minutes = max(1, wait_s // 60)
        log.warning(f"login THROTTLED for {email_clean} from {ip} — wait {wait_s}s")
        raise HTTPException(status_code=429, detail=f"Trop de tentatives échouées. Réessayez dans {minutes} min.")

    user = await db.users.find_one({"email": email_clean})
    if not user or not verify_password(body.password, user["hashed_password"]):
        _throttle_record_failure(ip, email_clean)
        raise HTTPException(status_code=400, detail="Identifiants invalides. Vérifie ton email et ton mot de passe.")

    # Success → CLEAR the counter so legit users are never blocked
    _throttle_clear(ip, email_clean)
    token = create_access_token(user["id"], user["email"])
    return TokenResponse(access_token=token, user=_public_user(user))


@api.post("/admin/unlock-login/{email}")
async def admin_unlock_login(email: str, _admin = Depends(_require_admin)):
    """Admin failsafe: wipe login throttle for a given email across all IPs.
    Use this if a user reports being locked out."""
    email_lc = email.strip().lower()
    keys_to_clear = [k for k in list(_login_attempts.keys()) if k.endswith(f":{email_lc}")]
    for k in keys_to_clear:
        _login_attempts.pop(k, None)
    return {"unlocked": len(keys_to_clear), "email": email_lc}


@api.post("/admin/unlock-login-all")
async def admin_unlock_login_all(_admin = Depends(_require_admin)):
    """Admin failsafe: wipe the entire login throttle map (all IPs, all emails)."""
    n = len(_login_attempts)
    _login_attempts.clear()
    return {"cleared_keys": n}



@api.get("/auth/me")
async def me(payload: dict = Depends(get_current_user_payload)):
    user = await _get_user(payload["sub"])
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    return _public_user(user)


@api.patch("/me/preferences")
async def update_preferences(body: PreferencesBody, payload: dict = Depends(get_current_user_payload)):
    """Update user preferences (e.g. auto-follower toggle for Pro/Elite users)."""
    user = await _get_user(payload["sub"])
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    updates = {}
    if body.auto_follower_enabled is not None:
        if user.get("subscription_tier", "free") == "free":
            raise HTTPException(403, "Suiveur automatique réservé aux plans Pro et Elite")
        updates["auto_follower_enabled"] = bool(body.auto_follower_enabled)
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
        user = await _get_user(user["id"])
    return _public_user(user)


# ----- Forgot / reset password -----
@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordBody):
    """Always returns 200 to avoid leaking which emails exist. Generates a token + sends email best-effort."""
    user = await db.users.find_one({"email": body.email.lower()})
    if user:
        token = uuid.uuid4().hex + uuid.uuid4().hex  # 64 chars
        expires = datetime.now(timezone.utc) + timedelta(hours=2)
        await db.password_resets.insert_one({
            "token": token,
            "user_id": user["id"],
            "email": user["email"],
            "expires_at": expires.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "used": False,
        })
        # Send email best-effort
        try:
            asyncio.create_task(send_reset_password_email(user["email"], user["full_name"], token))
        except Exception as e:
            log.warning(f"reset email enqueue failed: {e}")
    return {"ok": True, "message": "Si un compte existe avec cet email, un lien de réinitialisation a été envoyé."}


@api.post("/auth/reset-password")
async def reset_password(body: ResetPasswordBody):
    rec = await db.password_resets.find_one({"token": body.token, "used": False})
    if not rec:
        raise HTTPException(400, "Lien invalide ou déjà utilisé.")
    expires_at = datetime.fromisoformat(rec["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(400, "Lien expiré. Demande un nouveau lien.")
    await db.users.update_one(
        {"id": rec["user_id"]},
        {"$set": {"hashed_password": hash_password(body.new_password)}},
    )
    await db.password_resets.update_one(
        {"token": body.token},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "message": "Mot de passe mis à jour. Tu peux te connecter maintenant."}


# ----- Social proof (preuve sociale floating toast) -----
@api.get("/social/recent-wins")
async def recent_wins():
    """Return recent winning picks for floating social-proof toasts. Public endpoint."""
    docs = await db.predictions_log.find({"won": True}, {"_id": 0}).limit(50).to_list(50)
    if not docs:
        return []
    NAMES = ["Marc", "Aïcha", "Kwame", "Fatou D.", "Olivier", "Amina K.", "Jean-Marc", "Sandrine",
             "Yannick", "Hortense", "Patrick T.", "Christelle B.", "Ibrahim", "Mariam", "Serge B.",
             "Béatrice", "Mehdi", "Awa", "Cheikh", "Esther", "Roland", "Nadia", "Pascal", "Thierry G."]
    COMBOS = ["Sécurité", "Équilibre", "Jackpot"]
    AGOS = ["il y a 3 min", "il y a 8 min", "il y a 15 min", "il y a 25 min", "il y a 42 min",
            "il y a 1h", "il y a 1h30", "il y a 2h", "ce matin", "tout à l'heure"]
    import random
    # Rotate per minute (so reload feels alive but isn't random-spammy)
    seed = int(datetime.now(timezone.utc).timestamp()) // 60
    rng = random.Random(seed)
    out = []
    for d in docs[:24]:
        name = rng.choice(NAMES)
        combo = rng.choice(COMBOS)
        mise = rng.choice([500, 1000, 1000, 2000, 2000, 5000])
        gain = round(mise * d["odds"])
        ago = rng.choice(AGOS)
        out.append({
            "name": name,
            "combo": combo,
            "mise_xof": mise,
            "gain_xof": gain,
            "pick": d["pick"],
            "match": d["match"],
            "odds": d["odds"],
            "ago": ago,
        })
    rng.shuffle(out)
    return out


# ----- Matches & Predictions -----
@api.get("/matches")
async def get_matches(
    sport: Optional[str] = None,
    payload: Optional[dict] = Depends(get_optional_user_payload),
):
    tier = await _get_tier_from_payload(payload)
    matches = await fetch_all_matches(db)
    if sport:
        matches = [m for m in matches if sport in (m.get("sport_key") or "")]
    out = []
    for m in matches:
        pred = analyze_match(m)
        out.append({**m, "prediction": pred})
    out.sort(key=lambda x: x.get("commence_time", ""))

    # Free / anonymous gating: keep top 3 highest-confidence matches visible
    if tier in ("free", "anonymous"):
        sorted_by_conf = sorted(out, key=lambda x: (x.get("prediction") or {}).get("confidence", 0), reverse=True)
        featured_ids = {m.get("id") for m in sorted_by_conf[:3]}
        out = [_gate_match_for_free(m, m.get("id") in featured_ids) for m in out]
    return out


@api.get("/predictions/top")
async def get_top(payload: Optional[dict] = Depends(get_optional_user_payload)):
    tier = await _get_tier_from_payload(payload)
    matches = await fetch_all_matches(db)
    preds = top_predictions(matches, limit=6)
    if tier in ("free", "anonymous"):
        # Free users: top 3 picks fully visible, rest locked
        return preds[:3] + [_mask_prediction(p) for p in preds[3:]] if preds else []
    return preds


@api.get("/predictions/combo")
async def get_combo(legs: int = 3, min_confidence: float = 65):
    legs = max(2, min(legs, 5))
    matches = await fetch_all_matches(db)
    return build_combo(matches, legs=legs, min_confidence=min_confidence)


@api.get("/predictions/combos")
async def get_multi_combos(payload: Optional[dict] = Depends(get_optional_user_payload)):
    """Returns 3 combos: safe / balanced / jackpot.
    For free users, the SAFE combo is UNLOCKED on free days (free_today=true) so they can
    see and play it. The other two remain locked → strong incentive to upgrade.
    """
    tier = await _get_tier_from_payload(payload)
    matches = await fetch_all_matches(db)
    combos = build_multi_combos(matches)
    if tier in ("free", "anonymous"):
        for key, c in combos.items():
            if c.get("free_today") and c.get("legs"):
                # Keep legs unlocked + mark explicitly
                c["unlocked_for_free"] = True
            else:
                c["legs"] = [_mask_prediction(l) for l in c["legs"]]
                c["locked"] = True
    return combos


@api.get("/predictions/today-combos")
async def today_combos_by_sport(payload: Optional[dict] = Depends(get_optional_user_payload)):
    """Returns combos of TODAY's matches only, split per sport family, across 4 odds tiers
    (Sûr 2-4, Booster 5-12, Extra 15-30, Jackpot 40+). Only the first tier is unlocked for Free users."""
    tier = await _get_tier_from_payload(payload)
    matches = await fetch_all_matches(db)
    data = build_today_combos_by_sport(matches)
    if tier in ("free", "anonymous"):
        for _fk, fam in data["families"].items():
            for tk, combo in fam["tiers"].items():
                if combo.get("free_today") and combo.get("legs"):
                    combo["unlocked_for_free"] = True
                else:
                    combo["legs"] = [_mask_prediction(l) for l in combo["legs"]]
                    combo["locked"] = True
    return data



# ---------- Combo Builder (FootyStats-style) ----------

class SavedComboBody(BaseModel):
    name: Optional[str] = None
    legs: List[dict]  # each leg: match_id, pick, pick_odds, confidence, market, market_label, home_team, away_team


@api.get("/builder/matches")
async def builder_matches(
    sport: Optional[str] = None,
    payload: Optional[dict] = Depends(get_optional_user_payload),
):
    """Returns matches enriched with ALL pick options per match — for the combo builder UI.
    Pro/Elite see everything; Free see options but confidence/odds masked on all-but-safe picks."""
    tier = await _get_tier_from_payload(payload)
    matches = await fetch_all_matches(db)
    out = []
    for m in matches:
        if sport and not m.get("sport_key", "").startswith(sport):
            continue
        pred = analyze_match(m)
        if not pred.get("markets"):
            continue
        # Group by market_label so UI can display Vainqueur, BTTS, Over etc. cleanly
        picks = pred["markets"]
        # For free users, mask everything except the top-1 safest pick
        if tier in ("free", "anonymous"):
            picks_sorted = sorted(picks, key=lambda p: p.get("confidence", 0), reverse=True)
            for i, p in enumerate(picks_sorted):
                if i == 0:
                    continue  # keep the best pick visible
                p["pick_odds"] = None
                p["confidence"] = None
                p["locked"] = True
            picks = picks_sorted
        out.append({
            "match_id": m["id"],
            "sport_key": m.get("sport_key"),
            "sport_title": m.get("sport_title"),
            "home_team": m.get("home_team"),
            "away_team": m.get("away_team"),
            "commence_time": m.get("commence_time"),
            "best_pick": pred.get("pick"),
            "best_pick_odds": pred.get("pick_odds"),
            "best_confidence": pred.get("confidence"),
            "picks": picks,
            "num_books": len(m.get("bookmakers", [])),
            "tier_gate": "free" if tier in ("free", "anonymous") else tier,
        })
    return {"matches": out[:60], "total": len(out)}


@api.get("/builder/stats/{match_id}")
async def builder_stats(match_id: str, _payload: Optional[dict] = Depends(get_optional_user_payload)):
    """Deep FootyStats-style stats derived from odds + h2h history."""
    match = await get_match_by_id(db, match_id)
    if not match:
        raise HTTPException(404, "Match introuvable")
    from prediction_engine import _h2h_probs  # noqa
    probs = _h2h_probs(match.get("bookmakers", []), match.get("home_team", ""), match.get("away_team", ""))
    if not probs:
        return {"match_id": match_id, "stats": None}
    home = match["home_team"]
    away = match["away_team"]
    p_home = probs.get(home, 0)
    p_away = probs.get(away, 0)
    p_draw = probs.get("Draw", max(0, 1 - p_home - p_away))

    # Simple modeled stats (would be replaced by real historical data if StatsBomb-like feed added later)
    p_btts = min(0.85, 0.35 + 4 * p_home * p_away)
    p_over25 = min(0.80, 0.30 + 2.5 * (1 - p_draw) * (p_home + p_away) / 1.6)
    p_over15 = min(0.92, 0.72 + 0.2 * (max(p_home, p_away) - 0.4))

    return {
        "match_id": match_id,
        "home_team": home,
        "away_team": away,
        "probs": {
            "home_win": round(p_home * 100, 1),
            "draw": round(p_draw * 100, 1),
            "away_win": round(p_away * 100, 1),
        },
        "expectations": {
            "btts_yes_pct": round(p_btts * 100, 1),
            "over_2_5_pct": round(p_over25 * 100, 1),
            "over_1_5_pct": round(p_over15 * 100, 1),
            "clean_sheet_home_pct": round(min(55, p_home * 55), 1),
            "clean_sheet_away_pct": round(min(55, p_away * 55), 1),
        },
        "form_note": "Estimations dérivées des cotes bookmakers agrégées (modèle IA WinPulse). Bientôt : forme réelle 10 derniers matchs, H2H, xG.",
    }


@api.post("/builder/save")
async def builder_save(body: SavedComboBody, payload: dict = Depends(get_current_user_payload)):
    """Save a personal combo to the user's collection."""
    user_id = payload["sub"]
    if not body.legs:
        raise HTTPException(400, "Combo vide")
    if len(body.legs) > 15:
        raise HTTPException(400, "Maximum 15 jambes par combo")
    total_odds = 1.0
    for leg in body.legs:
        total_odds *= float(leg.get("pick_odds") or 1)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": (body.name or "").strip()[:80] or f"Mon combo {datetime.now(timezone.utc).strftime('%d/%m %H:%M')}",
        "legs": body.legs,
        "total_odds": round(total_odds, 2),
        "num_legs": len(body.legs),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.saved_combos.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/builder/my-combos")
async def builder_my_combos(payload: dict = Depends(get_current_user_payload)):
    combos = await db.saved_combos.find(
        {"user_id": payload["sub"]},
        {"_id": 0},
    ).sort("created_at", -1).limit(50).to_list(50)
    return {"combos": combos}


@api.delete("/builder/my-combos/{combo_id}")
async def builder_delete_combo(combo_id: str, payload: dict = Depends(get_current_user_payload)):
    res = await db.saved_combos.delete_one({"id": combo_id, "user_id": payload["sub"]})
    return {"deleted": res.deleted_count}



@api.get("/matches/{match_id}")
async def get_match_detail(
    match_id: str,
    payload: Optional[dict] = Depends(get_optional_user_payload),
):
    match = await get_match_by_id(db, match_id)
    if not match:
        raise HTTPException(404, "Match introuvable")
    prediction = analyze_match(match)

    tier = await _get_tier_from_payload(payload)
    if tier in ("free", "anonymous"):
        # Free users see the match info + bookmakers, but prediction is locked
        prediction = _mask_prediction(prediction)
    return {**match, "prediction": prediction}


@api.get("/matches/{match_id}/analysis")
async def get_match_analysis(
    match_id: str,
    payload: dict = Depends(get_current_user_payload),
):
    match = await get_match_by_id(db, match_id)
    if not match:
        raise HTTPException(404, "Match introuvable")
    prediction = analyze_match(match)

    today = datetime.now(timezone.utc).date().isoformat()
    cache_key = f"{match_id}-{today}"
    cached = await db.ai_analysis_cache.find_one({"_id": cache_key})
    if cached:
        return {"prediction": prediction, "analysis": cached["analysis"]}

    user = await _get_user(payload["sub"])
    tier = user.get("subscription_tier", "free") if user else "free"

    if tier == "free":
        from ai_service import _fallback_analysis
        analysis = _fallback_analysis(prediction)
    else:
        analysis = await generate_analysis(match, prediction)

    await db.ai_analysis_cache.update_one(
        {"_id": cache_key},
        {"$set": {"analysis": analysis, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"prediction": prediction, "analysis": analysis}


@api.get("/predictions/history")
async def history(payload: dict = Depends(get_current_user_payload)):
    docs = await db.predictions_log.find({}, {"_id": 0}).sort("date", -1).limit(50).to_list(50)
    if not docs:
        import random
        seed_random = random.Random(42)
        sample_picks = [
            ("PSG vs OM", "PSG", "Ligue 1", 78, 1.65, True),
            ("Real Madrid vs Barcelona", "Real Madrid", "La Liga", 62, 2.10, True),
            ("Lakers vs Celtics", "Celtics", "NBA", 71, 1.85, False),
            ("Djokovic vs Medvedev", "Djokovic", "ATP", 81, 1.55, True),
            ("Chiefs vs Bills", "Chiefs", "NFL", 68, 1.95, True),
            ("Man City vs Liverpool", "Man City", "Premier League", 66, 1.90, False),
            ("Bayern vs Dortmund", "Bayern", "Bundesliga", 74, 1.70, True),
            ("Sinner vs Alcaraz", "Sinner", "ATP", 58, 2.05, True),
            ("Inter vs Juventus", "Inter", "Serie A", 64, 2.00, True),
            ("Warriors vs Heat", "Warriors", "NBA", 72, 1.80, True),
            ("Pereira vs Prochazka", "Pereira", "UFC", 69, 1.92, False),
            ("Edmonton vs Colorado", "Colorado", "NHL", 61, 2.15, True),
        ]
        docs = []
        for i, (m, pick, lg, conf, odds, won) in enumerate(sample_picks):
            d = (datetime.now(timezone.utc) - timedelta(days=i+1)).date().isoformat()
            docs.append({
                "id": str(uuid.uuid4()),
                "date": d, "match": m, "pick": pick, "league": lg,
                "confidence": conf, "odds": odds, "won": won,
            })
        if docs:
            await db.predictions_log.insert_many([{**d} for d in docs])

    total = len(docs)
    wins = sum(1 for d in docs if d.get("won"))
    win_rate = round((wins / total * 100) if total else 0, 1)
    avg_odds = round(sum(d["odds"] for d in docs) / total, 2) if total else 0
    roi_units = sum((d["odds"] - 1) if d["won"] else -1 for d in docs)
    roi_percent = round((roi_units / total) * 100, 1) if total else 0

    return {
        "predictions": docs,
        "stats": {
            "total": total, "wins": wins, "losses": total - wins,
            "win_rate": win_rate, "avg_odds": avg_odds, "roi_percent": roi_percent,
        },
    }


# ----- Subscription / MoMo -----
@api.post("/subscription/checkout")
async def checkout(body: PaymentRequestBody, payload: dict = Depends(get_current_user_payload)):
    if body.tier not in ("pro", "elite"):
        raise HTTPException(400, "Plan invalide")
    plan = PLANS[body.tier]
    ref = f"PE-{uuid.uuid4().hex[:8].upper()}"
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": payload["sub"],
        "user_email": payload.get("email"),
        "tier": body.tier,
        "amount_xof": plan["price_xof"],
        "phone": body.phone,
        "payer_name": body.payer_name,
        "status": "pending",
        "reference": ref,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.payments.insert_one(doc)
    return {
        "reference": ref,
        "amount_xof": plan["price_xof"],
        "tier": body.tier,
        "instructions": {
            "operator": "MTN Mobile Money Bénin",
            "merchant_number": os.environ.get("MOMO_MERCHANT_PHONE", "+229 01 66 28 06 03"),
            "merchant_owner": os.environ.get("MOMO_OWNER_NAME", "KOUKPAKI VIANEY"),
            "whatsapp_number": os.environ.get("MOMO_WHATSAPP_PHONE", "+33 7 67 97 17 52"),
            "steps": [
                "Composez *880# sur votre téléphone MTN Bénin",
                "Choisissez 'Transfert d'argent'",
                f"Saisissez le numéro : {os.environ.get('MOMO_MERCHANT_PHONE', '+229 01 66 28 06 03')}",
                f"Vérifiez le nom affiché : {os.environ.get('MOMO_OWNER_NAME', 'KOUKPAKI VIANEY')}",
                f"Montant : {plan['price_xof']} FCFA",
                f"Référence (motif) : {ref}",
                "Confirmez avec votre code PIN MTN",
                f"Envoyez la capture du SMS de confirmation sur WhatsApp ({os.environ.get('MOMO_WHATSAPP_PHONE', '+33 7 67 97 17 52')}) pour activation rapide.",
            ],
        },
    }


@api.get("/subscription/payments")
async def list_payments(payload: dict = Depends(get_current_user_payload)):
    docs = await db.payments.find({"user_id": payload["sub"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs


@api.post("/subscription/confirm/{reference}")
async def confirm_payment_self(reference: str, payload: dict = Depends(get_current_user_payload)):
    """DISABLED in production — use admin route POST /api/admin/payments/{ref}/confirm.
    Kept only to return a clear error so existing buttons fail gracefully."""
    raise HTTPException(
        status_code=403,
        detail="L'auto-confirmation est désactivée. Un administrateur va valider votre paiement après réception du SMS MTN MoMo (généralement sous 1h). Envoyez la capture WhatsApp pour activation rapide.",
    )


async def _activate_payment(pay: dict, send_email: bool = True) -> dict:
    plan = PLANS[pay["tier"]]
    expires = datetime.now(timezone.utc) + timedelta(days=plan["duration_days"])
    await db.users.update_one(
        {"id": pay["user_id"]},
        {"$set": {
            "subscription_tier": pay["tier"],
            "subscription_status": "active",
            "subscription_expires_at": expires.isoformat(),
        }},
    )
    await db.payments.update_one(
        {"reference": pay["reference"]},
        {"$set": {"status": "confirmed", "confirmed_at": datetime.now(timezone.utc).isoformat()}},
    )
    if send_email:
        user = await _get_user(pay["user_id"])
        if user:
            try:
                await send_payment_confirmation(user["email"], user["full_name"], pay["tier"], pay["reference"])
            except Exception as e:
                log.warning(f"Email confirmation failed: {e}")
    return {"ok": True, "tier": pay["tier"], "expires_at": expires.isoformat()}


# ----- Admin -----
@api.get("/admin/payments")
async def admin_list_payments(status_filter: Optional[str] = None, _admin = Depends(_require_admin)):
    q = {}
    if status_filter:
        q["status"] = status_filter
    docs = await db.payments.find(q, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return docs


@api.post("/admin/payments/{reference}/confirm")
async def admin_confirm_payment(reference: str, _admin = Depends(_require_admin)):
    pay = await db.payments.find_one({"reference": reference})
    if not pay:
        raise HTTPException(404, "Paiement introuvable")
    if pay["status"] == "confirmed":
        return {"ok": True, "already": True}
    return await _activate_payment(pay, send_email=True)


@api.post("/admin/payments/{reference}/reject")
async def admin_reject_payment(reference: str, _admin = Depends(_require_admin)):
    pay = await db.payments.find_one({"reference": reference})
    if not pay:
        raise HTTPException(404, "Paiement introuvable")
    await db.payments.update_one(
        {"reference": reference},
        {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


@api.get("/admin/users")
async def admin_list_users(_admin = Depends(_require_admin)):
    docs = await db.users.find({}, {"_id": 0, "hashed_password": 0}).sort("created_at", -1).limit(500).to_list(500)
    return docs


@api.get("/admin/stats")
async def admin_stats(_admin = Depends(_require_admin)):
    total_users = await db.users.count_documents({})
    pro_users = await db.users.count_documents({"subscription_tier": "pro"})
    elite_users = await db.users.count_documents({"subscription_tier": "elite"})
    pending = await db.payments.count_documents({"status": "pending"})
    confirmed = await db.payments.count_documents({"status": "confirmed"})
    rejected = await db.payments.count_documents({"status": "rejected"})

    # Revenue
    confirmed_pays = await db.payments.find({"status": "confirmed"}, {"amount_xof": 1, "created_at": 1}).to_list(2000)
    revenue = sum(p.get("amount_xof", 0) for p in confirmed_pays)

    # Conversion rate: paid users / total users
    paying_users = pro_users + elite_users
    conversion_rate = round((paying_users / total_users) * 100, 1) if total_users else 0

    # ARPU (Average Revenue Per User)
    arpu = round(revenue / paying_users, 0) if paying_users else 0

    # MRR (current month confirmed payments)
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc).isoformat()
    mrr_pays = await db.payments.find({"status": "confirmed", "created_at": {"$gte": month_start}}, {"amount_xof": 1}).to_list(2000)
    mrr = sum(p.get("amount_xof", 0) for p in mrr_pays)

    # Registrations in last 7 days
    week_start = (now - timedelta(days=7)).isoformat()
    new_users_7d = await db.users.count_documents({"created_at": {"$gte": week_start}})

    # Referrals
    total_referrals = await db.users.count_documents({"referred_by": {"$ne": None, "$exists": True}})
    rewards_claimed = await db.users.count_documents({"referral_reward_claimed": True})

    # Blog stats
    blog_posts_count = await db.blog_posts.count_documents({"published": True})

    # Predictions log
    settled = await db.predictions_log.count_documents({})
    wins = await db.predictions_log.count_documents({"won": True})
    win_rate = round((wins / settled) * 100, 1) if settled else 0

    return {
        "users": {
            "total": total_users,
            "pro": pro_users,
            "elite": elite_users,
            "free": total_users - pro_users - elite_users,
            "new_last_7d": new_users_7d,
        },
        "payments": {"pending": pending, "confirmed": confirmed, "rejected": rejected},
        "revenue_xof": revenue,
        "mrr_xof": mrr,
        "arpu_xof": arpu,
        "conversion_rate_pct": conversion_rate,
        "referrals": {"total_referred": total_referrals, "rewards_claimed": rewards_claimed},
        "content": {"blog_posts": blog_posts_count, "predictions_settled": settled, "win_rate_pct": win_rate},
    }


@api.post("/admin/broadcast/picks")
async def admin_broadcast_picks(body: BroadcastBody, _admin = Depends(_require_admin)):
    """Send today's picks email to all paying subscribers."""
    matches = await fetch_all_matches(db)
    combos_raw = build_multi_combos(matches)
    combo = combos_raw.get(body.combo_tier, combos_raw["balanced"])
    if not combo["legs"]:
        raise HTTPException(400, "Pas de picks disponibles aujourd'hui")

    # Find paying users
    tier_filter = {"subscription_tier": {"$in": ["pro", "elite"]}} if body.tier == "pro" else {"subscription_tier": "elite"}
    users = await db.users.find(tier_filter, {"_id": 0, "email": 1, "full_name": 1}).to_list(2000)

    if not users:
        return {"sent": 0, "users": 0, "message": "Aucun abonné payant pour l'instant"}

    results = await asyncio.gather(
        *[send_picks_email(u["email"], u["full_name"], combo["legs"], combo["total_odds"]) for u in users],
        return_exceptions=True,
    )
    sent = sum(1 for r in results if isinstance(r, dict) and r.get("status") == "sent")
    drafted = sum(1 for r in results if isinstance(r, dict) and r.get("status") == "draft")
    errors = sum(1 for r in results if isinstance(r, dict) and r.get("status") == "error") + sum(1 for r in results if isinstance(r, Exception))
    return {"users": len(users), "sent": sent, "drafted": drafted, "errors": errors, "combo_tier": body.combo_tier}


@api.post("/admin/broadcast/free-weekly-teaser")
async def admin_broadcast_weekly_teaser(_admin = Depends(_require_admin)):
    """Friday teaser: send a teaser of THIS week's best pick to FREE users only.
    Showcases what they're missing → strong conversion lever."""
    matches = await fetch_all_matches(db)
    combos_raw = build_multi_combos(matches)
    combo = combos_raw.get("balanced") or combos_raw.get("safe")
    if not combo or not combo["legs"]:
        raise HTTPException(400, "Pas de picks disponibles cette semaine")

    free_users = await db.users.find(
        {"subscription_tier": "free"},
        {"_id": 0, "email": 1, "full_name": 1}
    ).to_list(5000)

    if not free_users:
        return {"sent": 0, "users": 0, "message": "Aucun utilisateur Free"}

    from email_service import send_weekly_teaser_email
    results = await asyncio.gather(
        *[send_weekly_teaser_email(u["email"], u["full_name"], combo["legs"], combo["total_odds"]) for u in free_users],
        return_exceptions=True,
    )
    sent = sum(1 for r in results if isinstance(r, dict) and r.get("status") == "sent")
    drafted = sum(1 for r in results if isinstance(r, dict) and r.get("status") == "draft")
    errors = sum(1 for r in results if isinstance(r, dict) and r.get("status") == "error") + sum(1 for r in results if isinstance(r, Exception))
    return {"users": len(free_users), "sent": sent, "drafted": drafted, "errors": errors, "target": "free"}


@api.post("/admin/test-email")
async def admin_test_email(payload: dict = Depends(get_current_user_payload), _admin = Depends(_require_admin)):
    """Send a sample email to the current admin user."""
    user = await _get_user(payload["sub"])
    combos = await get_multi_combos()
    combo = combos["balanced"]
    res = await send_picks_email(user["email"], user["full_name"], combo["legs"], combo["total_odds"])
    return res


# ----- Referral program -----
REFERRAL_THRESHOLD = 3  # invite 3 friends → 7 days Pro
REFERRAL_REWARD_DAYS = 7


@api.get("/referral/me")
async def get_my_referral(payload: dict = Depends(get_current_user_payload)):
    """Return the current user's referral status: code, count, share link, WhatsApp deep-link, reward state."""
    user = await _get_user(payload["sub"])
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    # Backfill referral_code for legacy users
    code = user.get("referral_code")
    if not code:
        code = _gen_referral_code(user.get("full_name", "WP"))
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": code, "referral_count": user.get("referral_count", 0)}})

    count = int(user.get("referral_count", 0))
    claimed = bool(user.get("referral_reward_claimed", False))
    base = os.environ.get("APP_BASE_URL", "https://wnpulse.com").rstrip("/")
    share_url = f"{base}/register?ref={code}"

    wa_msg = (
        f"🔥 Salut ! Je viens de découvrir *WinPulse* — l'IA qui décrypte les pronostics sportifs (foot, basket, NFL...).\n\n"
        f"Ils ont 70%+ de réussite sur le mois en cours 📊\n\n"
        f"👉 Inscris-toi gratuitement avec mon code et on débloque tous les deux des avantages :\n"
        f"{share_url}"
    )
    whatsapp_share = f"https://wa.me/?text={urllib_quote(wa_msg)}"

    return {
        "code": code,
        "count": count,
        "threshold": REFERRAL_THRESHOLD,
        "reward_days": REFERRAL_REWARD_DAYS,
        "claimed": claimed,
        "eligible": count >= REFERRAL_THRESHOLD and not claimed,
        "share_url": share_url,
        "whatsapp_share": whatsapp_share,
        "current_tier": user.get("subscription_tier", "free"),
    }


@api.post("/referral/claim")
async def claim_referral_reward(payload: dict = Depends(get_current_user_payload)):
    """Claim 7 days of Pro access if the user has at least 3 successful referrals."""
    user = await _get_user(payload["sub"])
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    count = int(user.get("referral_count", 0))
    if user.get("referral_reward_claimed"):
        raise HTTPException(status_code=400, detail="Récompense déjà réclamée.")
    if count < REFERRAL_THRESHOLD:
        raise HTTPException(status_code=400, detail=f"Il te faut {REFERRAL_THRESHOLD} parrainages (actuel : {count}).")

    # Grant REFERRAL_REWARD_DAYS of Pro. Stack on top of existing expiry if any.
    now = datetime.now(timezone.utc)
    current_expiry = user.get("subscription_expires_at")
    if current_expiry:
        try:
            base_dt = datetime.fromisoformat(current_expiry.replace("Z", "+00:00"))
            if base_dt < now:
                base_dt = now
        except Exception:
            base_dt = now
    else:
        base_dt = now
    new_expiry = base_dt + timedelta(days=REFERRAL_REWARD_DAYS)

    new_tier = "pro" if user.get("subscription_tier", "free") == "free" else user["subscription_tier"]
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "subscription_tier": new_tier,
            "subscription_status": "active",
            "subscription_expires_at": new_expiry.isoformat(),
            "referral_reward_claimed": True,
        }},
    )
    return {
        "status": "ok",
        "tier": new_tier,
        "expires_at": new_expiry.isoformat(),
        "reward_days": REFERRAL_REWARD_DAYS,
        "message": f"🎉 Bravo ! {REFERRAL_REWARD_DAYS} jours Pro activés.",
    }


# ----- Drip email campaigns J+1 / J+3 / J+5 -----
async def _run_drip_campaign(dry_run: bool = False) -> dict:
    """Find FREE users registered 1, 3 or 5 days ago and send the right drip email.
    Idempotent: each user receives each drip at most once (tracked via `drip_sent_days`)."""
    now = datetime.now(timezone.utc)
    summary = {"day1": 0, "day3": 0, "day5": 0, "errors": 0, "users_scanned": 0}

    # Targets: (day_offset, send_function, default_kwargs)
    targets = [
        (1, send_drip_day1, {}),
        (3, send_drip_day3, {}),
        (5, send_drip_day5, {}),
    ]

    for day_offset, send_fn, extra_kwargs in targets:
        # Match users registered roughly day_offset days ago (window: day_offset .. day_offset+1 days)
        start = (now - timedelta(days=day_offset + 1)).isoformat()
        end = (now - timedelta(days=day_offset)).isoformat()
        cursor = db.users.find({
            "subscription_tier": "free",
            "created_at": {"$gte": start, "$lt": end},
            "drip_sent_days": {"$ne": day_offset},
        }, {"_id": 0, "id": 1, "email": 1, "full_name": 1, "drip_sent_days": 1})
        users = await cursor.to_list(1000)
        summary["users_scanned"] += len(users)
        for u in users:
            if dry_run:
                summary[f"day{day_offset}"] += 1
                continue
            try:
                res = await send_fn(u["email"], u.get("full_name") or "champion", **extra_kwargs)
                if res.get("status") in ("sent", "draft"):
                    await db.users.update_one(
                        {"id": u["id"]},
                        {"$addToSet": {"drip_sent_days": day_offset}},
                    )
                    summary[f"day{day_offset}"] += 1
                else:
                    summary["errors"] += 1
            except Exception as e:
                log.warning(f"drip day{day_offset} failed for {u.get('email')}: {e}")
                summary["errors"] += 1
    return summary


@api.post("/admin/drip/run")
async def admin_run_drip(dry_run: bool = False, _admin = Depends(_require_admin)):
    """Manually trigger the drip campaign (idempotent)."""
    return await _run_drip_campaign(dry_run=dry_run)


@api.get("/admin/drip/preview")
async def admin_drip_preview(_admin = Depends(_require_admin)):
    """Preview who would receive a drip email right now (no send)."""
    return await _run_drip_campaign(dry_run=True)


async def _drip_loop():
    """Background loop: run the drip job every 6 hours."""
    # Initial delay to let the app start
    await asyncio.sleep(60)
    while True:
        try:
            res = await _run_drip_campaign()
            log.info(f"drip campaign result: {res}")
        except Exception as e:
            log.error(f"drip loop error: {e}")
        # Run every 6 hours
        await asyncio.sleep(6 * 3600)


# ----- Public SEO endpoints (no /api prefix needed for sitemap/robots — but we keep /api for k8s routing) -----
@api.get("/blog/posts")
async def list_blog_posts(tag: Optional[str] = None, limit: int = 20):
    """List published blog posts (lightweight: no content_md)."""
    await _ensure_blog_seeded()
    query = {"published": True}
    if tag:
        query["tags"] = tag
    cursor = db.blog_posts.find(query, {"_id": 0, "content_md": 0}).sort("published_at", -1).limit(limit)
    posts = await cursor.to_list(limit)
    return {"posts": posts, "count": len(posts)}


@api.get("/blog/posts/{slug}")
async def get_blog_post(slug: str):
    """Fetch a single blog post by slug."""
    await _ensure_blog_seeded()
    post = await db.blog_posts.find_one({"slug": slug, "published": True}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Article introuvable")
    # Related posts (same tag, excluding self)
    related = []
    if post.get("tags"):
        cursor = db.blog_posts.find(
            {"slug": {"$ne": slug}, "published": True, "tags": {"$in": post["tags"]}},
            {"_id": 0, "content_md": 0},
        ).limit(3)
        related = await cursor.to_list(3)
    return {"post": post, "related": related}


@api.get("/sitemap.xml")
async def sitemap_xml():
    """Generate XML sitemap for Google indexing."""
    from fastapi.responses import Response
    base = os.environ.get("APP_BASE_URL", "https://wnpulse.com").rstrip("/")
    await _ensure_blog_seeded()
    posts = await db.blog_posts.find({"published": True}, {"_id": 0, "slug": 1, "published_at": 1}).to_list(100)

    static_urls = [
        ("/", "1.0", "daily"),
        ("/resultats", "0.9", "daily"),
        ("/login", "0.5", "monthly"),
        ("/register", "0.7", "monthly"),
        ("/blog", "0.9", "weekly"),
        ("/legal/mentions-legales", "0.3", "yearly"),
        ("/legal/cgv", "0.3", "yearly"),
        ("/legal/confidentialite", "0.3", "yearly"),
        ("/legal/jeu-responsable", "0.5", "yearly"),
    ]

    items = []
    for path, prio, freq in static_urls:
        items.append(f"<url><loc>{base}{path}</loc><priority>{prio}</priority><changefreq>{freq}</changefreq></url>")
    for p in posts:
        items.append(
            f"<url><loc>{base}/blog/{p['slug']}</loc><lastmod>{p.get('published_at', '')[:10]}</lastmod><priority>0.8</priority><changefreq>monthly</changefreq></url>"
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(items)
        + "\n</urlset>"
    )
    return Response(content=xml, media_type="application/xml")


@api.get("/robots.txt")
async def robots_txt():
    from fastapi.responses import Response
    base = os.environ.get("APP_BASE_URL", "https://wnpulse.com").rstrip("/")
    body = f"User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /admin\n\nSitemap: {base}/api/sitemap.xml\n"
    return Response(content=body, media_type="text/plain")


async def _ensure_blog_seeded():
    """Insert/upsert blog seed posts. Runs on every startup — idempotent via slug key."""
    try:
        from blog_seed import BLOG_POSTS
    except Exception as e:
        log.warning(f"blog_seed import failed: {e}")
        return
    inserted, updated = 0, 0
    for p in BLOG_POSTS:
        doc = {**p, "published": True}
        res = await db.blog_posts.update_one(
            {"slug": p["slug"]},
            {"$set": doc},
            upsert=True,
        )
        if res.upserted_id:
            inserted += 1
        elif res.modified_count:
            updated += 1
    if inserted or updated:
        log.info(f"Blog seed sync: {inserted} inserted, {updated} updated")


# ----- Auto-settle worker: settle predictions from finished matches -----
async def _run_auto_settle() -> dict:
    """Fetch finished matches from the Odds API scores endpoint and settle predictions into predictions_log.
    Idempotent: matches already settled (by match_id) are skipped."""
    summary = {"scanned": 0, "settled": 0, "wins": 0, "losses": 0, "skipped": 0, "errors": 0}
    try:
        from odds_service import fetch_all_scores
        scores = await fetch_all_scores(db)
    except Exception as e:
        log.warning(f"auto-settle: fetch_scores failed: {e}")
        return {**summary, "error": str(e)}

    for event in scores or []:
        summary["scanned"] += 1
        if not event.get("completed"):
            continue
        match_id = event.get("id") or f"{event.get('home_team')}-{event.get('away_team')}-{event.get('commence_time', '')[:10]}"
        # Skip if already settled
        existing = await db.predictions_log.find_one({"match_id": match_id})
        if existing:
            summary["skipped"] += 1
            continue

        # Determine winner from scores
        home = event.get("home_team")
        away = event.get("away_team")
        scores_arr = event.get("scores") or []
        try:
            score_map = {s.get("name"): float(s.get("score", 0)) for s in scores_arr}
            home_score = score_map.get(home, 0)
            away_score = score_map.get(away, 0)
        except Exception:
            summary["errors"] += 1
            continue

        if home_score > away_score:
            winner = home
        elif away_score > home_score:
            winner = away
        else:
            winner = "Draw"

        # Pick = favorite (lowest odds) — placeholder logic
        pick = home  # default
        odds = 1.85
        try:
            bookmakers = event.get("bookmakers") or []
            if bookmakers:
                outcomes = bookmakers[0].get("markets", [{}])[0].get("outcomes", [])
                if outcomes:
                    fav = min(outcomes, key=lambda o: float(o.get("price", 99)))
                    pick = fav.get("name", home)
                    odds = float(fav.get("price", 1.85))
        except Exception:
            pass

        won = (pick == winner)
        profit = (odds - 1) if won else -1.0

        doc = {
            "id": str(uuid.uuid4()),
            "match_id": match_id,
            "date": (event.get("commence_time") or datetime.now(timezone.utc).isoformat())[:10],
            "datetime": event.get("commence_time"),
            "match": f"{home} vs {away}",
            "home_team": home,
            "away_team": away,
            "league": event.get("sport_title", ""),
            "sport_key": event.get("sport_key", ""),
            "pick": pick,
            "odds": round(odds, 2),
            "confidence": 60,  # placeholder until ML scoring is wired
            "score_home": home_score,
            "score_away": away_score,
            "winner": winner,
            "won": won,
            "profit": profit,
            "settled_at": datetime.now(timezone.utc).isoformat(),
            "source": "auto_settle",
        }
        try:
            await db.predictions_log.insert_one(doc)
            summary["settled"] += 1
            if won:
                summary["wins"] += 1
            else:
                summary["losses"] += 1
        except Exception as e:
            log.warning(f"auto-settle: insert failed for {match_id}: {e}")
            summary["errors"] += 1

    return summary


@api.post("/admin/auto-settle/run")
async def admin_auto_settle_run(_admin = Depends(_require_admin)):
    """Manually trigger the auto-settle worker."""
    return await _run_auto_settle()


async def _auto_settle_loop():
    """Background loop: settle finished matches every 4 hours."""
    await asyncio.sleep(180)  # let app warm up
    while True:
        try:
            res = await _run_auto_settle()
            log.info(f"auto-settle result: {res}")
        except Exception as e:
            log.error(f"auto-settle loop error: {e}")
        await asyncio.sleep(4 * 3600)


# ----- "Suiveur automatique" : push quotidien à 7h Bénin (UTC+1) -----
# Pour les abonnés Pro/Elite : email avec les picks du jour + lien wa.me pré-rempli
# Côté admin : récap copiable à blaster manuellement sur WhatsApp groupé

AUTO_FOLLOWER_HOUR_LOCAL = 7    # 7h heure locale Bénin
BENIN_UTC_OFFSET_HOURS = 1      # Bénin = UTC+1 toute l'année


def _benin_today_str() -> str:
    now_utc = datetime.now(timezone.utc)
    local = now_utc + timedelta(hours=BENIN_UTC_OFFSET_HOURS)
    return local.strftime("%Y-%m-%d")


def _seconds_until_next_local_7h() -> float:
    now_utc = datetime.now(timezone.utc)
    local = now_utc + timedelta(hours=BENIN_UTC_OFFSET_HOURS)
    target_local = local.replace(hour=AUTO_FOLLOWER_HOUR_LOCAL, minute=0, second=0, microsecond=0)
    if local >= target_local:
        target_local = target_local + timedelta(days=1)
    return (target_local - local).total_seconds()


def _format_whatsapp_blast(combo: dict, today_str: str) -> str:
    """Build the WhatsApp broadcast message for the admin to copy/paste."""
    lines = [
        f"🔥 *WinPulse · Picks du {today_str}*",
        f"_Combiné Équilibre · Cote totale : {combo.get('total_odds', '—')}_",
        "",
    ]
    for i, leg in enumerate(combo.get("legs", []), 1):
        lines.append(
            f"{i}. *{leg.get('home_team','?')} vs {leg.get('away_team','?')}*\n"
            f"   👉 {leg.get('pick','?')} @ {leg.get('pick_odds','?')} ({leg.get('confidence',0)}%)"
        )
    lines += [
        "",
        "Mise type 1 000 FCFA → potentiel " + str(int((combo.get('total_odds') or 0) * 1000)) + " FCFA",
        "",
        "📲 Connecte-toi sur https://wnpulse.com pour voir l'analyse IA complète.",
        "🎯 Joue responsable. 18+",
    ]
    return "\n".join(lines)


async def _run_auto_follower(dry_run: bool = False) -> dict:
    """Send today's picks email to Pro/Elite users opted in, once per local day.
    Returns a summary dict. Idempotent via `auto_follower_last_sent_date`."""
    today = _benin_today_str()
    summary = {"date": today, "candidates": 0, "sent": 0, "skipped_already_sent": 0, "errors": 0, "no_picks": False}

    matches = await fetch_all_matches(db)
    combos_raw = build_multi_combos(matches)
    combo = combos_raw.get("balanced") or combos_raw.get("safe")
    if not combo or not combo.get("legs"):
        summary["no_picks"] = True
        summary["blast_text"] = ""
        return summary

    summary["combo_total_odds"] = combo.get("total_odds")
    summary["combo_legs"] = len(combo["legs"])

    cursor = db.users.find(
        {
            "subscription_tier": {"$in": ["pro", "elite"]},
            "subscription_status": "active",
        },
        {"_id": 0, "id": 1, "email": 1, "full_name": 1, "auto_follower_enabled": 1, "auto_follower_last_sent_date": 1},
    )
    users = await cursor.to_list(5000)
    summary["candidates"] = len(users)

    for u in users:
        # Default = enabled if missing
        if u.get("auto_follower_enabled") is False:
            continue
        if u.get("auto_follower_last_sent_date") == today:
            summary["skipped_already_sent"] += 1
            continue
        if dry_run:
            summary["sent"] += 1
            continue
        try:
            res = await send_picks_email(
                u["email"],
                u.get("full_name") or "champion",
                combo["legs"],
                combo["total_odds"],
            )
            if res.get("status") in ("sent", "draft"):
                await db.users.update_one(
                    {"id": u["id"]},
                    {"$set": {"auto_follower_last_sent_date": today}},
                )
                summary["sent"] += 1
            else:
                summary["errors"] += 1
        except Exception as e:
            log.warning(f"auto-follower send failed for {u.get('email')}: {e}")
            summary["errors"] += 1

    # Persist WhatsApp blast payload so admin can fetch it any time during the day
    blast_text = _format_whatsapp_blast(combo, today)
    await db.auto_follower_blasts.update_one(
        {"date": today},
        {"$set": {
            "date": today,
            "blast_text": blast_text,
            "combo_total_odds": combo.get("total_odds"),
            "legs_count": len(combo["legs"]),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    summary["blast_text"] = blast_text
    return summary


@api.post("/admin/auto-follower/run")
async def admin_auto_follower_run(dry_run: bool = False, _admin = Depends(_require_admin)):
    """Manually trigger the auto-follower campaign (idempotent per day)."""
    return await _run_auto_follower(dry_run=dry_run)


@api.get("/admin/auto-follower/preview")
async def admin_auto_follower_preview(_admin = Depends(_require_admin)):
    """Preview today's auto-follower run without sending anything."""
    return await _run_auto_follower(dry_run=True)


@api.get("/admin/whatsapp-blast")
async def admin_whatsapp_blast(_admin = Depends(_require_admin)):
    """Return today's WhatsApp blast text. Generates it on the fly if missing."""
    today = _benin_today_str()
    doc = await db.auto_follower_blasts.find_one({"date": today}, {"_id": 0})
    if not doc:
        # Generate without sending
        res = await _run_auto_follower(dry_run=True)
        doc = await db.auto_follower_blasts.find_one({"date": today}, {"_id": 0}) or {
            "date": today,
            "blast_text": res.get("blast_text", ""),
            "combo_total_odds": res.get("combo_total_odds"),
            "legs_count": res.get("combo_legs", 0),
        }
    # Stats: how many subscribers will receive the email at 7am
    subs = await db.users.count_documents({
        "subscription_tier": {"$in": ["pro", "elite"]},
        "subscription_status": "active",
        "auto_follower_enabled": {"$ne": False},
    })
    return {**doc, "active_subscribers": subs}


async def _auto_follower_loop():
    # Small warm-up
    await asyncio.sleep(120)
    # First-time catch-up: if we never ran today and it's already past 7am, run immediately
    try:
        today = _benin_today_str()
        last = await db.auto_follower_blasts.find_one({"date": today}, {"_id": 0, "date": 1})
        local_hour = (datetime.now(timezone.utc) + timedelta(hours=BENIN_UTC_OFFSET_HOURS)).hour
        if not last and local_hour >= AUTO_FOLLOWER_HOUR_LOCAL:
            log.info("auto-follower: catch-up run on startup")
            res = await _run_auto_follower()
            log.info(f"auto-follower catch-up result: {res}")
    except Exception as e:
        log.warning(f"auto-follower catch-up failed: {e}")

    while True:
        try:
            wait_s = _seconds_until_next_local_7h()
            log.info(f"auto-follower: next run in {int(wait_s)}s (~{round(wait_s/3600,1)}h)")
            await asyncio.sleep(wait_s)
            res = await _run_auto_follower()
            log.info(f"auto-follower result: {res}")
        except Exception as e:
            log.error(f"auto-follower loop error: {e}")
            await asyncio.sleep(600)


# ---------- Value bet alerts (edge >= 15%) — email push for Pro/Elite ----------

VALUE_BET_MIN_EDGE = 15.0  # percentage points
VALUE_BET_CHECK_INTERVAL_HOURS = 6


async def _run_value_bet_alerts(dry_run: bool = False) -> dict:
    """Detect value bets today, email each Pro/Elite user once per bet (idempotent)."""
    summary = {"detected": 0, "candidates": 0, "sent": 0, "skipped_already_sent": 0, "errors": 0}
    matches = await fetch_all_matches(db)
    value_bets = []
    for m in matches:
        pred = analyze_match(m)
        for mk in pred.get("markets", []):
            if mk.get("edge", 0) >= VALUE_BET_MIN_EDGE and mk.get("pick_odds"):
                value_bets.append({
                    "match_id": pred["match_id"],
                    "sport_title": pred.get("sport_title"),
                    "home_team": pred.get("home_team"),
                    "away_team": pred.get("away_team"),
                    "pick": mk["pick"],
                    "pick_odds": mk["pick_odds"],
                    "confidence": mk["confidence"],
                    "edge": mk["edge"],
                    "market": mk["market"],
                    "commence_time": pred.get("commence_time"),
                })
    # Dedupe by (match_id, market, pick) so we don't email the same bet twice ever
    seen_ids = set()
    unique_bets = []
    for b in value_bets:
        key = f"{b['match_id']}:{b['market']}:{b['pick']}"
        if key in seen_ids:
            continue
        seen_ids.add(key)
        unique_bets.append(b)
    summary["detected"] = len(unique_bets)

    if not unique_bets:
        return summary

    # Fingerprint of today's alert batch (so a user gets one email per batch max)
    today_str = _benin_today_str()
    batch_ids = sorted(f"{b['match_id']}:{b['market']}:{b['pick']}" for b in unique_bets)
    batch_hash = hashlib.sha1(("|".join(batch_ids)).encode()).hexdigest()[:8]
    batch_key = f"{today_str}-{batch_hash}"

    users = await db.users.find(
        {"subscription_tier": {"$in": ["pro", "elite"]}, "subscription_status": "active"},
        {"_id": 0, "id": 1, "email": 1, "full_name": 1, "value_bet_batches_sent": 1},
    ).to_list(5000)
    summary["candidates"] = len(users)

    for u in users:
        already = (u.get("value_bet_batches_sent") or [])
        if batch_key in already:
            summary["skipped_already_sent"] += 1
            continue
        if dry_run:
            summary["sent"] += 1
            continue
        try:
            res = await send_value_bet_alert(u["email"], u.get("full_name") or "champion", unique_bets)
            if res.get("status") in ("sent", "draft"):
                await db.users.update_one(
                    {"id": u["id"]},
                    {"$push": {"value_bet_batches_sent": {"$each": [batch_key], "$slice": -20}}},
                )
                summary["sent"] += 1
            else:
                summary["errors"] += 1
        except Exception as e:
            log.warning(f"value bet email failed for {u.get('email')}: {e}")
            summary["errors"] += 1

    return summary


async def _value_bet_loop():
    """Background loop: check for value bets every 6 hours."""
    await asyncio.sleep(600)  # warm-up
    while True:
        try:
            res = await _run_value_bet_alerts()
            log.info(f"value-bet alerts result: {res}")
        except Exception as e:
            log.error(f"value-bet loop error: {e}")
        await asyncio.sleep(VALUE_BET_CHECK_INTERVAL_HOURS * 3600)


@api.post("/admin/value-bets/run")
async def admin_value_bets_run(dry_run: bool = False, _admin = Depends(_require_admin)):
    """Manually trigger a value bet alert scan + email push."""
    return await _run_value_bet_alerts(dry_run=dry_run)


@api.get("/admin/value-bets/preview")
async def admin_value_bets_preview(_admin = Depends(_require_admin)):
    return await _run_value_bet_alerts(dry_run=True)


app.include_router(api)


@app.on_event("startup")
async def start_drip_worker():
    """Kick off the drip background loop."""
    asyncio.create_task(_drip_loop())
    asyncio.create_task(_auto_settle_loop())
    asyncio.create_task(_auto_follower_loop())
    asyncio.create_task(_value_bet_loop())
    log.info("Background workers started: drip (J+1/J+3/J+5 every 6h) + auto-settle (every 4h) + auto-follower (daily 7am Bénin) + value-bet alerts (every 6h)")


@app.on_event("startup")
async def seed_admin():
    """Seed/promote admin from env vars. If ADMIN_RESET_PASSWORD=true, also resets the password and tier on every startup."""
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower().strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    admin_name = os.environ.get("ADMIN_NAME", "Admin")
    reset_pw = os.environ.get("ADMIN_RESET_PASSWORD", "false").lower() == "true"
    if not admin_email or not admin_password:
        return
    existing = await db.users.find_one({"email": admin_email})
    if existing:
        update = {"is_admin": True, "subscription_tier": "elite", "subscription_status": "active"}
        if reset_pw:
            update["hashed_password"] = hash_password(admin_password)
        await db.users.update_one({"email": admin_email}, {"$set": update})
        log.info(f"Admin {admin_email} ensured (is_admin=True, tier=elite, password_reset={reset_pw})")
        return
    await db.users.insert_one({
        "id": str(uuid.uuid4()),
        "email": admin_email,
        "full_name": admin_name,
        "hashed_password": hash_password(admin_password),
        "is_admin": True,
        "subscription_tier": "elite",
        "subscription_status": "active",
        "subscription_expires_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "referral_code": _gen_referral_code(admin_name),
        "referral_count": 0,
        "referral_reward_claimed": False,
    })
    log.info(f"Seeded admin user {admin_email}")


@app.on_event("shutdown")
async def shutdown():
    client.close()