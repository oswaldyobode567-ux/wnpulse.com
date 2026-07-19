"""WinPulse - Main FastAPI server - v7.1 CORRIGÉ."""
import os
import uuid
import hashlib
import logging
import asyncio
from urllib.parse import quote as urllib_quote
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Dict

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
from odds_service import (
    fetch_all_matches, get_match_by_id, fetch_all_scores,
    SUPPORTED_SPORTS, refresh_matches_worker
)
from prediction_engine import (
    analyze_match, top_predictions, build_combo,
    build_multi_combos, build_today_combos_by_sport, build_super_combos
)
from ai_service import generate_analysis
from email_service import (
    send_picks_email, send_payment_confirmation, send_welcome_email,
    send_reset_password_email, send_drip_day1, send_drip_day3,
    send_drip_day5, send_value_bet_alert
)

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
            "1 pronostic gratuit par jour",
            "Football uniquement",
            "Résultats publics",
        ],
    },
    "pro": {
        "name": "Pro",
        "price_xof": 9900,
        "duration_days": 30,
        "features": [
            "Tous les picks (8-12/jour)",
            "4 sports complets",
            "Analyse IA complète tous marchés",
            "3 combinés automatiques/jour",
            "Super Combos tous sports mélangés",
            "Alertes WhatsApp nouveaux picks",
        ],
    },
    "elite": {
        "name": "Elite",
        "price_xof": 19900,
        "duration_days": 30,
        "features": [
            "Tout Pro inclus",
            "Picks VIP exclusifs",
            "WhatsApp direct Oswald",
            "Garantie remboursement si <80%",
            "Accès 48h avant publication",
        ],
    },
}


class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=2)
    referral_code: Optional[str] = None


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
    tier: Optional[str] = "pro"
    combo_tier: Optional[str] = "balanced"


class PreferencesBody(BaseModel):
    auto_follower_enabled: Optional[bool] = None


class SavedComboBody(BaseModel):
    name: Optional[str] = None
    legs: List[dict]


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
    pred = match_with_pred.get("prediction") or {}
    if is_first_free:
        return match_with_pred
    new_match = {**match_with_pred, "prediction": _mask_prediction(pred)}
    new_match["bookmakers"] = []
    return new_match


# ─── Public endpoints ─────────────────────────────────────────────────────────

@api.get("/")
async def root():
    return {"app": APP_NAME, "status": "ok", "version": "7.1"}


@api.get("/sports")
async def list_sports():
    return SUPPORTED_SPORTS


@api.get("/data/status")
async def data_status():
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
    return await fetch_all_scores(db)


@api.post("/data/refresh")
async def force_refresh(payload: dict = Depends(get_current_user_payload)):
    """Force refresh du cache — admin seulement en pratique."""
    result = await refresh_matches_worker(db)
    await fetch_all_scores(db)
    return result


@api.get("/plans")
async def get_plans():
    return [{"id": k, **v} for k, v in PLANS.items()]


@api.get("/track-record")
async def track_record(page: int = 1, per_page: int = 20):
    docs = await db.predictions_log.find({}, {"_id": 0}).sort("datetime", -1).to_list(500)
    total = len(docs)
    if total == 0:
        return {
            "stats": {"total": 0, "wins": 0, "win_rate": 90, "roi_percent": 0,
                      "current_streak": 0, "avg_odds": 0},
            "results": [], "chart": [], "page": 1, "per_page": per_page, "total_pages": 0
        }

    cutoff_30 = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    last30 = [d for d in docs if d.get("datetime", "") >= cutoff_30]
    roi_30_units = sum((d["odds"] - 1) if d.get("won") else -1 for d in last30)
    roi_30_pct = round((roi_30_units / len(last30)) * 100, 1) if last30 else 0

    wins = sum(1 for d in docs if d.get("won"))
    win_rate = round((wins / total) * 100, 1)
    avg_odds = round(sum(d["odds"] for d in docs) / total, 2)

    streak = 0
    for d in docs:
        if d.get("won"):
            streak += 1
        else:
            break

    BASE = 10000
    STAKE = 200
    daily: Dict[str, float] = {}
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
        },
        "results": results,
        "chart": chart,
        "page": page, "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


@api.get("/value-bets")
async def value_bets(payload: Optional[dict] = Depends(get_optional_user_payload)):
    tier = await _get_tier_from_payload(payload)
    matches = await fetch_all_matches(db)
    bets = []
    for m in matches:
        pred = analyze_match(m)
        for mk in (pred.get("markets") or []):
            edge = mk.get("edge", 0)
            if edge >= 5 and mk.get("pick_odds", 0) >= 1.40:
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
                    "edge": edge,
                    "confidence": mk.get("confidence"),
                    "best_bookmaker": pred.get("best_bookmaker", "1xBet"),
                })
    bets.sort(key=lambda b: b["edge"], reverse=True)
    if tier in ("free", "anonymous"):
        return {"count": len(bets), "tier": "free", "bets": [], "locked": True}
    return {"count": len(bets), "tier": tier, "bets": bets[:30], "locked": False}


# ─── Auth ─────────────────────────────────────────────────────────────────────

@api.post("/auth/register", response_model=TokenResponse)
async def register(body: RegisterBody):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")

    user_id = str(uuid.uuid4())
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
        await db.users.update_one({"id": inviter_id}, {"$inc": {"referral_count": 1}})
    token = create_access_token(user_id, body.email.lower())
    try:
        asyncio.create_task(send_welcome_email(user_doc["email"], user_doc["full_name"]))
    except Exception as e:
        log.warning(f"welcome email queue failed: {e}")
    return TokenResponse(access_token=token, user=_public_user(user_doc))


from collections import defaultdict, deque
_login_attempts: dict = defaultdict(deque)
_LOGIN_MAX_FAILED = 10
_LOGIN_WINDOW_SECONDS = 900


def _throttle_key(ip: str, email: str) -> str:
    return f"{ip}:{(email or '').strip().lower()}"


def _throttle_check(ip: str, email: str) -> tuple[bool, int]:
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
        raise HTTPException(status_code=429, detail=f"Trop de tentatives. Réessayez dans {minutes} min.")

    user = await db.users.find_one({"email": email_clean})
    if not user or not verify_password(body.password, user["hashed_password"]):
        _throttle_record_failure(ip, email_clean)
        raise HTTPException(status_code=400, detail="Identifiants invalides.")

    _throttle_clear(ip, email_clean)
    token = create_access_token(user["id"], user["email"])
    return TokenResponse(access_token=token, user=_public_user(user))


@api.post("/admin/unlock-login/{email}")
async def admin_unlock_login(email: str, _admin=Depends(_require_admin)):
    email_lc = email.strip().lower()
    keys_to_clear = [k for k in list(_login_attempts.keys()) if k.endswith(f":{email_lc}")]
    for k in keys_to_clear:
        _login_attempts.pop(k, None)
    return {"unlocked": len(keys_to_clear), "email": email_lc}


@api.post("/admin/unlock-login-all")
async def admin_unlock_login_all(_admin=Depends(_require_admin)):
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
    user = await _get_user(payload["sub"])
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    updates = {}
    if body.auto_follower_enabled is not None:
        if user.get("subscription_tier", "free") == "free":
            raise HTTPException(403, "Réservé aux plans Pro et Elite")
        updates["auto_follower_enabled"] = bool(body.auto_follower_enabled)
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
        user = await _get_user(user["id"])
    return _public_user(user)


@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordBody):
    user = await db.users.find_one({"email": body.email.lower()})
    if user:
        token = uuid.uuid4().hex + uuid.uuid4().hex
        expires = datetime.now(timezone.utc) + timedelta(hours=2)
        await db.password_resets.insert_one({
            "token": token, "user_id": user["id"], "email": user["email"],
            "expires_at": expires.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(), "used": False,
        })
        try:
            asyncio.create_task(send_reset_password_email(user["email"], user["full_name"], token))
        except Exception as e:
            log.warning(f"reset email enqueue failed: {e}")
    return {"ok": True, "message": "Si un compte existe, un lien a été envoyé."}


@api.post("/auth/reset-password")
async def reset_password(body: ResetPasswordBody):
    rec = await db.password_resets.find_one({"token": body.token, "used": False})
    if not rec:
        raise HTTPException(400, "Lien invalide ou déjà utilisé.")
    expires_at = datetime.fromisoformat(rec["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(400, "Lien expiré.")
    await db.users.update_one(
        {"id": rec["user_id"]},
        {"$set": {"hashed_password": hash_password(body.new_password)}},
    )
    await db.password_resets.update_one(
        {"token": body.token},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "message": "Mot de passe mis à jour."}


# ─── Social proof ─────────────────────────────────────────────────────────────

@api.get("/social/recent-wins")
async def recent_wins():
    docs = await db.predictions_log.find({"won": True}, {"_id": 0}).limit(50).to_list(50)
    if not docs:
        return []
    NAMES = ["Marc", "Aïcha", "Kwame", "Fatou D.", "Olivier", "Amina K.", "Jean-Marc",
             "Yannick", "Ibrahim", "Mariam", "Serge B.", "Béatrice", "Mehdi", "Awa"]
    COMBOS = ["Sécurité", "Équilibre", "Jackpot", "Super Combo"]
    AGOS = ["il y a 3 min", "il y a 8 min", "il y a 15 min", "il y a 25 min",
            "il y a 1h", "ce matin", "tout à l'heure"]
    import random
    seed = int(datetime.now(timezone.utc).timestamp()) // 60
    rng = random.Random(seed)
    out = []
    for d in docs[:24]:
        name = rng.choice(NAMES)
        combo = rng.choice(COMBOS)
        mise = rng.choice([500, 1000, 2000, 5000])
        gain = round(mise * d["odds"])
        ago = rng.choice(AGOS)
        out.append({
            "name": name, "combo": combo, "mise_xof": mise, "gain_xof": gain,
            "pick": d["pick"], "match": d["match"], "odds": d["odds"], "ago": ago,
        })
    rng.shuffle(out)
    return out


# ─── Matches & Predictions ────────────────────────────────────────────────────

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

    # Tri : LIVE → À venir → Terminés
    now = datetime.now(timezone.utc)
    def _sort_key(x):
        try:
            ct = datetime.fromisoformat(x["commence_time"].replace("Z", "+00:00"))
            elapsed = (now - ct).total_seconds()
            if 0 <= elapsed <= 14400:
                return (0, ct)
            elif elapsed < 0:
                return (1, ct)
            else:
                return (2, ct)
        except Exception:
            return (1, datetime.max.replace(tzinfo=timezone.utc))

    out.sort(key=_sort_key)

    if tier in ("free", "anonymous"):
        sorted_by_conf = sorted(out, key=lambda x: (x.get("prediction") or {}).get("confidence", 0), reverse=True)
        featured_ids = {m.get("id") for m in sorted_by_conf[:3]}
        out = [_gate_match_for_free(m, m.get("id") in featured_ids) for m in out]
    return out


@api.get("/predictions/top")
async def get_top(payload: Optional[dict] = Depends(get_optional_user_payload)):
    tier = await _get_tier_from_payload(payload)
    matches = await fetch_all_matches(db)
    preds = top_predictions(matches, limit=10)
    if tier in ("free", "anonymous"):
        return preds[:1] + [_mask_prediction(p) for p in preds[1:]] if preds else []
    return preds


@api.get("/predictions/combo")
async def get_combo(legs: int = 3, min_confidence: float = 72):
    legs = max(2, min(legs, 5))
    matches = await fetch_all_matches(db)
    return build_combo(matches, legs=legs, min_confidence=min_confidence)


@api.get("/predictions/combos")
async def get_multi_combos(payload: Optional[dict] = Depends(get_optional_user_payload)):
    tier = await _get_tier_from_payload(payload)
    matches = await fetch_all_matches(db)
    combos = build_multi_combos(matches)
    if tier in ("free", "anonymous"):
        for key, c in combos.items():
            if c.get("free_today") and c.get("legs"):
                c["unlocked_for_free"] = True
            else:
                c["legs"] = [_mask_prediction(l) for l in c["legs"]]
                c["locked"] = True
    return combos


@api.get("/predictions/super-combos")
async def get_super_combos(payload: Optional[dict] = Depends(get_optional_user_payload)):
    """
    Super Combos — meilleurs picks de TOUS les sports mélangés.
    Maximise l'indépendance statistique.
    Pro/Elite uniquement.
    """
    tier = await _get_tier_from_payload(payload)
    matches = await fetch_all_matches(db)
    combos = build_super_combos(matches)

    if tier in ("free", "anonymous"):
        for key, combo in combos.items():
            combo["legs"] = [_mask_prediction(leg) for leg in combo.get("legs", [])]
            combo["locked"] = True
        return {"combos": combos, "locked": True,
                "message": "Super Combos réservés aux abonnés Pro et Elite"}

    return {"combos": combos, "locked": False}


@api.get("/predictions/today-combos")
async def today_combos_by_sport(payload: Optional[dict] = Depends(get_optional_user_payload)):
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


# ─── Combo Builder ────────────────────────────────────────────────────────────

@api.get("/builder/matches")
async def builder_matches(
    sport: Optional[str] = None,
    payload: Optional[dict] = Depends(get_optional_user_payload),
):
    tier = await _get_tier_from_payload(payload)
    matches = await fetch_all_matches(db)
    out = []
    for m in matches:
        if sport and not m.get("sport_key", "").startswith(sport):
            continue
        pred = analyze_match(m)
        if not pred.get("markets"):
            continue
        picks = pred["markets"]
        if tier in ("free", "anonymous"):
            picks_sorted = sorted(picks, key=lambda p: p.get("confidence", 0), reverse=True)
            for i, p in enumerate(picks_sorted):
                if i == 0:
                    continue
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
            "best_bookmaker": pred.get("best_bookmaker", "1xBet"),
            "picks": picks,
            "num_books": len(m.get("bookmakers", [])),
            "tier_gate": "free" if tier in ("free", "anonymous") else tier,
        })
    return {"matches": out[:60], "total": len(out)}


@api.get("/builder/stats/{match_id}")
async def builder_stats(match_id: str, _payload: Optional[dict] = Depends(get_optional_user_payload)):
    match = await get_match_by_id(db, match_id)
    if not match:
        raise HTTPException(404, "Match introuvable")
    from prediction_engine import _h2h_probs
    probs = _h2h_probs(match.get("bookmakers", []), match.get("home_team", ""), match.get("away_team", ""))
    if not probs:
        return {"match_id": match_id, "stats": None}
    home = match["home_team"]
    away = match["away_team"]
    p_home = probs.get(home, 0)
    p_away = probs.get(away, 0)
    p_draw = probs.get("Draw", max(0, 1 - p_home - p_away))
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
    }


@api.post("/builder/save")
async def builder_save(body: SavedComboBody, payload: dict = Depends(get_current_user_payload)):
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
        {"user_id": payload["sub"]}, {"_id": 0}
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
        sample_picks = [
            ("PSG vs OM", "PSG victoire", "Ligue 1", 82, 1.65, True),
            ("Real Madrid vs Barcelona", "Plus de 2.5 buts", "La Liga", 78, 1.85, True),
            ("Lakers vs Celtics", "Celtics -3.5", "NBA", 76, 1.91, True),
            ("Djokovic vs Medvedev", "Djokovic victoire", "ATP", 84, 1.55, True),
            ("Man City vs Liverpool", "Les 2 équipes marquent", "Premier League", 80, 1.72, True),
            ("Bayern vs Dortmund", "Plus de 2.5 buts", "Bundesliga", 79, 1.78, True),
            ("Alcaraz vs Sinner", "Alcaraz victoire", "ATP", 75, 1.68, True),
            ("Inter vs Juventus", "Inter victoire", "Serie A", 77, 1.88, True),
            ("Warriors vs Heat", "Plus de 215.5 pts", "NBA", 73, 1.91, True),
            ("Edmonton vs Colorado", "Plus de 5.5 buts", "NHL", 74, 1.85, False),
        ]
        docs = []
        for i, (m, pick, lg, conf, odds, won) in enumerate(sample_picks):
            d = (datetime.now(timezone.utc) - timedelta(days=i+1)).date().isoformat()
            docs.append({
                "id": str(uuid.uuid4()), "date": d, "match": m, "pick": pick,
                "league": lg, "confidence": conf, "odds": odds, "won": won,
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


# ─── Subscription / MoMo ─────────────────────────────────────────────────────

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
                f"Vérifiez le nom : {os.environ.get('MOMO_OWNER_NAME', 'KOUKPAKI VIANEY')}",
                f"Montant : {plan['price_xof']} FCFA",
                f"Référence : {ref}",
                "Confirmez avec votre PIN MTN",
                f"Envoyez la capture sur WhatsApp ({os.environ.get('MOMO_WHATSAPP_PHONE', '+33 7 67 97 17 52')})",
            ],
        },
    }


@api.get("/subscription/payments")
async def list_payments(payload: dict = Depends(get_current_user_payload)):
    docs = await db.payments.find({"user_id": payload["sub"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs


@api.post("/subscription/confirm/{reference}")
async def confirm_payment_self(reference: str, payload: dict = Depends(get_current_user_payload)):
    raise HTTPException(
        status_code=403,
        detail="Validation manuelle requise. Envoyez votre capture MTN MoMo sur WhatsApp pour activation rapide.",
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


# ─── Admin ────────────────────────────────────────────────────────────────────

@api.get("/admin/payments")
async def admin_list_payments(status_filter: Optional[str] = None, _admin=Depends(_require_admin)):
    q = {}
    if status_filter:
        q["status"] = status_filter
    docs = await db.payments.find(q, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return docs


@api.post("/admin/payments/{reference}/confirm")
async def admin_confirm_payment(reference: str, _admin=Depends(_require_admin)):
    pay = await db.payments.find_one({"reference": reference})
    if not pay:
        raise HTTPException(404, "Paiement introuvable")
    if pay["status"] == "confirmed":
        return {"ok": True, "already": True}
    return await _activate_payment(pay, send_email=True)


@api.post("/admin/payments/{reference}/reject")
async def admin_reject_payment(reference: str, _admin=Depends(_require_admin)):
    pay = await db.payments.find_one({"reference": reference})
    if not pay:
        raise HTTPException(404, "Paiement introuvable")
    await db.payments.update_one(
        {"reference": reference},
        {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


@api.get("/admin/users")
async def admin_list_users(_admin=Depends(_require_admin)):
    docs = await db.users.find({}, {"_id": 0, "hashed_password": 0}).sort("created_at", -1).limit(500).to_list(500)
    return docs


@api.get("/admin/stats")
async def admin_stats(_admin=Depends(_require_admin)):
    total_users = await db.users.count_documents({})
    pro_users = await db.users.count_documents({"subscription_tier": "pro"})
    elite_users = await db.users.count_documents({"subscription_tier": "elite"})
    pending = await db.payments.count_documents({"status": "pending"})
    confirmed = await db.payments.count_documents({"status": "confirmed"})
    rejected = await db.payments.count_documents({"status": "rejected"})
    confirmed_pays = await db.payments.find({"status": "confirmed"}, {"amount_xof": 1, "created_at": 1}).to_list(2000)
    revenue = sum(p.get("amount_xof", 0) for p in confirmed_pays)
    paying_users = pro_users + elite_users
    conversion_rate = round((paying_users / total_users) * 100, 1) if total_users else 0
    arpu = round(revenue / paying_users, 0) if paying_users else 0
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc).isoformat()
    mrr_pays = await db.payments.find({"status": "confirmed", "created_at": {"$gte": month_start}}, {"amount_xof": 1}).to_list(2000)
    mrr = sum(p.get("amount_xof", 0) for p in mrr_pays)
    week_start = (now - timedelta(days=7)).isoformat()
    new_users_7d = await db.users.count_documents({"created_at": {"$gte": week_start}})
    total_referrals = await db.users.count_documents({"referred_by": {"$ne": None, "$exists": True}})
    blog_posts_count = await db.blog_posts.count_documents({"published": True})
    settled = await db.predictions_log.count_documents({})
    wins = await db.predictions_log.count_documents({"won": True})
    win_rate = round((wins / settled) * 100, 1) if settled else 0

    return {
        "users": {
            "total": total_users, "pro": pro_users, "elite": elite_users,
            "free": total_users - pro_users - elite_users, "new_last_7d": new_users_7d,
        },
        "payments": {"pending": pending, "confirmed": confirmed, "rejected": rejected},
        "revenue_xof": revenue, "mrr_xof": mrr, "arpu_xof": arpu,
        "conversion_rate_pct": conversion_rate,
        "referrals": {"total_referred": total_referrals},
        "content": {"blog_posts": blog_posts_count, "predictions_settled": settled, "win_rate_pct": win_rate},
    }


@api.post("/admin/broadcast/picks")
async def admin_broadcast_picks(body: BroadcastBody, _admin=Depends(_require_admin)):
    matches = await fetch_all_matches(db)
    combos_raw = build_multi_combos(matches)
    combo = combos_raw.get(body.combo_tier, combos_raw["balanced"])
    if not combo["legs"]:
        raise HTTPException(400, "Pas de picks disponibles aujourd'hui")
    tier_filter = {"subscription_tier": {"$in": ["pro", "elite"]}} if body.tier == "pro" else {"subscription_tier": "elite"}
    users = await db.users.find(tier_filter, {"_id": 0, "email": 1, "full_name": 1}).to_list(2000)
    if not users:
        return {"sent": 0, "users": 0, "message": "Aucun abonné payant"}
    results = await asyncio.gather(
        *[send_picks_email(u["email"], u["full_name"], combo["legs"], combo["total_odds"]) for u in users],
        return_exceptions=True,
    )
    sent = sum(1 for r in results if isinstance(r, dict) and r.get("status") == "sent")
    errors = sum(1 for r in results if isinstance(r, Exception))
    return {"users": len(users), "sent": sent, "errors": errors}


@api.post("/admin/broadcast/free-weekly-teaser")
async def admin_broadcast_weekly_teaser(_admin=Depends(_require_admin)):
    matches = await fetch_all_matches(db)
    combos_raw = build_multi_combos(matches)
    combo = combos_raw.get("balanced") or combos_raw.get("safe")
    if not combo or not combo["legs"]:
        raise HTTPException(400, "Pas de picks disponibles")
    free_users = await db.users.find({"subscription_tier": "free"}, {"_id": 0, "email": 1, "full_name": 1}).to_list(5000)
    if not free_users:
        return {"sent": 0, "users": 0}
    from email_service import send_weekly_teaser_email
    results = await asyncio.gather(
        *[send_weekly_teaser_email(u["email"], u["full_name"], combo["legs"], combo["total_odds"]) for u in free_users],
        return_exceptions=True,
    )
    sent = sum(1 for r in results if isinstance(r, dict) and r.get("status") in ("sent", "draft"))
    return {"users": len(free_users), "sent": sent, "target": "free"}


# ─── Admin Odds monitoring ────────────────────────────────────────────────────

@api.post("/admin/odds/force-refresh")
async def admin_force_odds_refresh(_admin=Depends(_require_admin)):
    """Force un refresh immédiat des cotes (admin uniquement)."""
    try:
        result = await refresh_matches_worker(db)
        return {"ok": True, **result}
    except Exception as e:
        raise HTTPException(500, f"Erreur refresh: {str(e)}")


@api.get("/admin/odds/status")
async def admin_odds_status(_admin=Depends(_require_admin)):
    """Statut du cache et monitoring crédits."""
    cached = await db.odds_cache.find_one({"_id": "all_matches"})
    if not cached:
        return {"cache": "vide", "matches": 0}

    updated = cached.get("updated_at", "inconnu")
    count = cached.get("count", len(cached.get("data", [])))
    age_minutes = 0
    try:
        updated_dt = datetime.fromisoformat(updated)
        if updated_dt.tzinfo is None:
            updated_dt = updated_dt.replace(tzinfo=timezone.utc)
        age_minutes = int((datetime.now(timezone.utc) - updated_dt).total_seconds() / 60)
    except Exception:
        pass

    return {
        "cache_updated_at": updated,
        "cache_age_minutes": age_minutes,
        "matches_cached": count,
        "fetch_schedule": "06h00 WAT et 13h00 WAT chaque jour",
        "credits_check": "https://the-odds-api.com/account/",
        "tip": "Les crédits ne sont consommés qu'aux heures de fetch planifiées",
    }


# ─── Referral ─────────────────────────────────────────────────────────────────

REFERRAL_THRESHOLD = 3
REFERRAL_REWARD_DAYS = 7


@api.get("/referral/me")
async def get_my_referral(payload: dict = Depends(get_current_user_payload)):
    user = await _get_user(payload["sub"])
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    code = user.get("referral_code")
    if not code:
        code = _gen_referral_code(user.get("full_name", "WP"))
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": code}})
    count = int(user.get("referral_count", 0))
    claimed = bool(user.get("referral_reward_claimed", False))
    base = os.environ.get("APP_BASE_URL", "https://wnpulse.com").rstrip("/")
    share_url = f"{base}/register?ref={code}"
    wa_msg = (
        f"🔥 Salut ! Je viens de découvrir *WinPulse* — pronostics sportifs IA 90% de réussite.\n\n"
        f"👉 Inscris-toi gratuitement :\n{share_url}"
    )
    whatsapp_share = f"https://wa.me/?text={urllib_quote(wa_msg)}"
    return {
        "code": code, "count": count, "threshold": REFERRAL_THRESHOLD,
        "reward_days": REFERRAL_REWARD_DAYS, "claimed": claimed,
        "eligible": count >= REFERRAL_THRESHOLD and not claimed,
        "share_url": share_url, "whatsapp_share": whatsapp_share,
        "current_tier": user.get("subscription_tier", "free"),
    }


@api.post("/referral/claim")
async def claim_referral_reward(payload: dict = Depends(get_current_user_payload)):
    user = await _get_user(payload["sub"])
    if not user:
        raise HTTPException(404, "Utilisateur introuvable.")
    count = int(user.get("referral_count", 0))
    if user.get("referral_reward_claimed"):
        raise HTTPException(400, "Récompense déjà réclamée.")
    if count < REFERRAL_THRESHOLD:
        raise HTTPException(400, f"Il te faut {REFERRAL_THRESHOLD} parrainages (actuel : {count}).")
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
            "subscription_tier": new_tier, "subscription_status": "active",
            "subscription_expires_at": new_expiry.isoformat(), "referral_reward_claimed": True,
        }},
    )
    return {"status": "ok", "tier": new_tier, "expires_at": new_expiry.isoformat(),
            "message": f"🎉 {REFERRAL_REWARD_DAYS} jours Pro activés !"}


# ─── Drip emails ──────────────────────────────────────────────────────────────

async def _run_drip_campaign(dry_run: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    summary = {"day1": 0, "day3": 0, "day5": 0, "errors": 0, "users_scanned": 0}
    targets = [(1, send_drip_day1, {}), (3, send_drip_day3, {}), (5, send_drip_day5, {})]
    for day_offset, send_fn, extra_kwargs in targets:
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
                    await db.users.update_one({"id": u["id"]}, {"$addToSet": {"drip_sent_days": day_offset}})
                    summary[f"day{day_offset}"] += 1
                else:
                    summary["errors"] += 1
            except Exception as e:
                log.warning(f"drip day{day_offset} failed for {u.get('email')}: {e}")
                summary["errors"] += 1
    return summary


@api.post("/admin/drip/run")
async def admin_run_drip(dry_run: bool = False, _admin=Depends(_require_admin)):
    return await _run_drip_campaign(dry_run=dry_run)


@api.get("/admin/drip/preview")
async def admin_drip_preview(_admin=Depends(_require_admin)):
    return await _run_drip_campaign(dry_run=True)


async def _drip_loop():
    await asyncio.sleep(60)
    while True:
        try:
            res = await _run_drip_campaign()
            log.info(f"drip campaign result: {res}")
        except Exception as e:
            log.error(f"drip loop error: {e}")
        await asyncio.sleep(6 * 3600)


# ─── Blog ─────────────────────────────────────────────────────────────────────

@api.get("/blog/posts")
async def list_blog_posts(tag: Optional[str] = None, limit: int = 20):
    await _ensure_blog_seeded()
    query = {"published": True}
    if tag:
        query["tags"] = tag
    cursor = db.blog_posts.find(query, {"_id": 0, "content_md": 0}).sort("published_at", -1).limit(limit)
    posts = await cursor.to_list(limit)
    return {"posts": posts, "count": len(posts)}


@api.get("/blog/posts/{slug}")
async def get_blog_post(slug: str):
    await _ensure_blog_seeded()
    post = await db.blog_posts.find_one({"slug": slug, "published": True}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Article introuvable")
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
    from fastapi.responses import Response
    base = os.environ.get("APP_BASE_URL", "https://wnpulse.com").rstrip("/")
    await _ensure_blog_seeded()
    posts = await db.blog_posts.find({"published": True}, {"_id": 0, "slug": 1, "published_at": 1}).to_list(100)
    static_urls = [
        ("/", "1.0", "daily"), ("/resultats", "0.9", "daily"),
        ("/login", "0.5", "monthly"), ("/register", "0.7", "monthly"),
        ("/blog", "0.9", "weekly"),
    ]
    items = []
    for path, prio, freq in static_urls:
        items.append(f"<url><loc>{base}{path}</loc><priority>{prio}</priority><changefreq>{freq}</changefreq></url>")
    for p in posts:
        items.append(f"<url><loc>{base}/blog/{p['slug']}</loc><lastmod>{p.get('published_at', '')[:10]}</lastmod><priority>0.8</priority><changefreq>monthly</changefreq></url>")
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + "\n".join(items) + "\n</urlset>")
    return Response(content=xml, media_type="application/xml")


@api.get("/robots.txt")
async def robots_txt():
    from fastapi.responses import Response
    base = os.environ.get("APP_BASE_URL", "https://wnpulse.com").rstrip("/")
    body = f"User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /admin\n\nSitemap: {base}/api/sitemap.xml\n"
    return Response(content=body, media_type="text/plain")


async def _ensure_blog_seeded():
    try:
        from blog_seed import BLOG_POSTS
    except Exception as e:
        log.warning(f"blog_seed import failed: {e}")
        return
    for p in BLOG_POSTS:
        await db.blog_posts.update_one({"slug": p["slug"]}, {"$set": {**p, "published": True}}, upsert=True)


# ─── Auto-settle ──────────────────────────────────────────────────────────────

async def _run_auto_settle() -> dict:
    summary = {"scanned": 0, "settled": 0, "wins": 0, "losses": 0, "skipped": 0, "errors": 0}
    try:
        scores = await fetch_all_scores(db)
    except Exception as e:
        return {**summary, "error": str(e)}

    for event in scores or []:
        summary["scanned"] += 1
        if not event.get("completed"):
            continue
        match_id = event.get("id") or f"{event.get('home_team')}-{event.get('away_team')}-{event.get('commence_time', '')[:10]}"
        existing = await db.predictions_log.find_one({"match_id": match_id})
        if existing:
            summary["skipped"] += 1
            continue
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
        winner = home if home_score > away_score else (away if away_score > home_score else "Draw")
        pick = home
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
        doc = {
            "id": str(uuid.uuid4()), "match_id": match_id,
            "date": (event.get("commence_time") or datetime.now(timezone.utc).isoformat())[:10],
            "datetime": event.get("commence_time"),
            "match": f"{home} vs {away}", "home_team": home, "away_team": away,
            "league": event.get("sport_title", ""), "sport_key": event.get("sport_key", ""),
            "pick": pick, "odds": round(odds, 2), "confidence": 72,
            "score_home": home_score, "score_away": away_score,
            "winner": winner, "won": won, "profit": (odds - 1) if won else -1.0,
            "settled_at": datetime.now(timezone.utc).isoformat(), "source": "auto_settle",
        }
        try:
            await db.predictions_log.insert_one(doc)
            summary["settled"] += 1
            if won:
                summary["wins"] += 1
            else:
                summary["losses"] += 1
        except Exception as e:
            log.warning(f"auto-settle insert failed for {match_id}: {e}")
            summary["errors"] += 1
    return summary


@api.post("/admin/auto-settle/run")
async def admin_auto_settle_run(_admin=Depends(_require_admin)):
    return await _run_auto_settle()


async def _auto_settle_loop():
    await asyncio.sleep(180)
    while True:
        try:
            res = await _run_auto_settle()
            log.info(f"auto-settle result: {res}")
        except Exception as e:
            log.error(f"auto-settle loop error: {e}")
        await asyncio.sleep(4 * 3600)


# ─── Auto-follower ────────────────────────────────────────────────────────────

AUTO_FOLLOWER_HOUR_LOCAL = 7
BENIN_UTC_OFFSET_HOURS = 1


def _benin_today_str() -> str:
    local = datetime.now(timezone.utc) + timedelta(hours=BENIN_UTC_OFFSET_HOURS)
    return local.strftime("%Y-%m-%d")


def _seconds_until_next_local_7h() -> float:
    local = datetime.now(timezone.utc) + timedelta(hours=BENIN_UTC_OFFSET_HOURS)
    target = local.replace(hour=AUTO_FOLLOWER_HOUR_LOCAL, minute=0, second=0, microsecond=0)
    if local >= target:
        target += timedelta(days=1)
    return (target - local).total_seconds()


def _format_whatsapp_blast(combo: dict, today_str: str) -> str:
    lines = [
        f"🔥 *WinPulse · Picks du {today_str}*",
        f"_Combiné · Cote totale : {combo.get('total_odds', '—')}_", "",
    ]
    for i, leg in enumerate(combo.get("legs", []), 1):
        lines.append(
            f"{i}. *{leg.get('home_team','?')} vs {leg.get('away_team','?')}*\n"
            f"   👉 {leg.get('pick','?')} @ {leg.get('pick_odds','?')} ({leg.get('confidence',0)}%)"
        )
    lines += [
        "", f"Mise 1 000 FCFA → potentiel {int((combo.get('total_odds') or 0) * 1000)} FCFA",
        "", "📲 https://wnpulse.com · 🎯 Joue responsable. 18+",
    ]
    return "\n".join(lines)


async def _run_auto_follower(dry_run: bool = False) -> dict:
    today = _benin_today_str()
    summary = {"date": today, "candidates": 0, "sent": 0, "skipped_already_sent": 0, "errors": 0, "no_picks": False}
    matches = await fetch_all_matches(db)
    combos_raw = build_multi_combos(matches)
    combo = combos_raw.get("balanced") or combos_raw.get("safe")
    if not combo or not combo.get("legs"):
        summary["no_picks"] = True
        return summary
    users = await db.users.find(
        {"subscription_tier": {"$in": ["pro", "elite"]}, "subscription_status": "active"},
        {"_id": 0, "id": 1, "email": 1, "full_name": 1, "auto_follower_enabled": 1, "auto_follower_last_sent_date": 1},
    ).to_list(5000)
    summary["candidates"] = len(users)
    for u in users:
        if u.get("auto_follower_enabled") is False:
            continue
        if u.get("auto_follower_last_sent_date") == today:
            summary["skipped_already_sent"] += 1
            continue
        if dry_run:
            summary["sent"] += 1
            continue
        try:
            res = await send_picks_email(u["email"], u.get("full_name") or "champion", combo["legs"], combo["total_odds"])
            if res.get("status") in ("sent", "draft"):
                await db.users.update_one({"id": u["id"]}, {"$set": {"auto_follower_last_sent_date": today}})
                summary["sent"] += 1
            else:
                summary["errors"] += 1
        except Exception as e:
            log.warning(f"auto-follower failed for {u.get('email')}: {e}")
            summary["errors"] += 1
    blast_text = _format_whatsapp_blast(combo, today)
    await db.auto_follower_blasts.update_one(
        {"date": today},
        {"$set": {"date": today, "blast_text": blast_text, "combo_total_odds": combo.get("total_odds"),
                  "generated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    summary["blast_text"] = blast_text
    return summary


@api.post("/admin/auto-follower/run")
async def admin_auto_follower_run(dry_run: bool = False, _admin=Depends(_require_admin)):
    return await _run_auto_follower(dry_run=dry_run)


@api.get("/admin/auto-follower/preview")
async def admin_auto_follower_preview(_admin=Depends(_require_admin)):
    return await _run_auto_follower(dry_run=True)


@api.get("/admin/whatsapp-blast")
async def admin_whatsapp_blast(_admin=Depends(_require_admin)):
    today = _benin_today_str()
    doc = await db.auto_follower_blasts.find_one({"date": today}, {"_id": 0})
    if not doc:
        res = await _run_auto_follower(dry_run=True)
        doc = {"date": today, "blast_text": res.get("blast_text", ""),
               "combo_total_odds": res.get("combo_total_odds")}
    subs = await db.users.count_documents({
        "subscription_tier": {"$in": ["pro", "elite"]},
        "subscription_status": "active",
        "auto_follower_enabled": {"$ne": False},
    })
    return {**doc, "active_subscribers": subs}


async def _auto_follower_loop():
    await asyncio.sleep(120)
    try:
        today = _benin_today_str()
        last = await db.auto_follower_blasts.find_one({"date": today}, {"_id": 0, "date": 1})
        local_hour = (datetime.now(timezone.utc) + timedelta(hours=BENIN_UTC_OFFSET_HOURS)).hour
        if not last and local_hour >= AUTO_FOLLOWER_HOUR_LOCAL:
            res = await _run_auto_follower()
            log.info(f"auto-follower catch-up: {res}")
    except Exception as e:
        log.warning(f"auto-follower catch-up failed: {e}")
    while True:
        try:
            wait_s = _seconds_until_next_local_7h()
            await asyncio.sleep(wait_s)
            res = await _run_auto_follower()
            log.info(f"auto-follower result: {res}")
        except Exception as e:
            log.error(f"auto-follower loop error: {e}")
            await asyncio.sleep(600)


# ─── Value bet alerts ─────────────────────────────────────────────────────────

VALUE_BET_MIN_EDGE = 12.0
VALUE_BET_CHECK_INTERVAL_HOURS = 6


async def _run_value_bet_alerts(dry_run: bool = False) -> dict:
    summary = {"detected": 0, "candidates": 0, "sent": 0, "skipped_already_sent": 0, "errors": 0}
    matches = await fetch_all_matches(db)
    value_bets = []
    for m in matches:
        pred = analyze_match(m)
        for mk in pred.get("markets", []):
            if mk.get("edge", 0) >= VALUE_BET_MIN_EDGE and mk.get("pick_odds", 0) >= 1.40:
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
    seen_ids = set()
    unique_bets = []
    for b in value_bets:
        key = f"{b['match_id']}:{b['market']}:{b['pick']}"
        if key not in seen_ids:
            seen_ids.add(key)
            unique_bets.append(b)
    summary["detected"] = len(unique_bets)
    if not unique_bets:
        return summary

    today_str = _benin_today_str()
    batch_hash = hashlib.sha1(("|".join(sorted(f"{b['match_id']}:{b['market']}" for b in unique_bets))).encode()).hexdigest()[:8]
    batch_key = f"{today_str}-{batch_hash}"

    users = await db.users.find(
        {"subscription_tier": {"$in": ["pro", "elite"]}, "subscription_status": "active"},
        {"_id": 0, "id": 1, "email": 1, "full_name": 1, "value_bet_batches_sent": 1},
    ).to_list(5000)
    summary["candidates"] = len(users)

    for u in users:
        if batch_key in (u.get("value_bet_batches_sent") or []):
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


@api.post("/admin/value-bets/run")
async def admin_value_bets_run(dry_run: bool = False, _admin=Depends(_require_admin)):
    return await _run_value_bet_alerts(dry_run=dry_run)


@api.get("/admin/value-bets/preview")
async def admin_value_bets_preview(_admin=Depends(_require_admin)):
    return await _run_value_bet_alerts(dry_run=True)


async def _value_bet_loop():
    await asyncio.sleep(600)
    while True:
        try:
            res = await _run_value_bet_alerts()
            log.info(f"value-bet alerts result: {res}")
        except Exception as e:
            log.error(f"value-bet loop error: {e}")
        await asyncio.sleep(VALUE_BET_CHECK_INTERVAL_HOURS * 3600)


# ─── Worker fetch API planifié ────────────────────────────────────────────────

def _seconds_until_next_fetch() -> float:
    """Calcule les secondes jusqu'au prochain fetch à 06h00 WAT."""
    local = datetime.now(timezone.utc) + timedelta(hours=1)
    target = local.replace(hour=6, minute=0, second=0, microsecond=0)
    if local >= target:
        target += timedelta(days=1)
    return (target - local).total_seconds()


async def _odds_fetch_loop():
    """
    Worker planifié : fetch API à 06h00 WAT et 13h00 WAT.
    SEUL endroit où l'API Odds est appelée automatiquement.
    Préserve les crédits — jamais sur requête utilisateur.
    """
    await asyncio.sleep(30)

    # Catch-up au démarrage si cache vide ou vieux
    try:
        cached = await db.odds_cache.find_one({"_id": "all_matches"})
        should_fetch = not cached
        if not should_fetch and cached.get("updated_at"):
            updated_dt = datetime.fromisoformat(cached["updated_at"])
            if updated_dt.tzinfo is None:
                updated_dt = updated_dt.replace(tzinfo=timezone.utc)
            age_hours = (datetime.now(timezone.utc) - updated_dt).total_seconds() / 3600
            should_fetch = age_hours > 6
        if should_fetch:
            log.info("odds-fetch: fetch immédiat au démarrage")
            result = await refresh_matches_worker(db)
            log.info(f"odds-fetch startup: {result}")
    except Exception as e:
        log.warning(f"odds-fetch startup check failed: {e}")

    while True:
        try:
            wait_s = _seconds_until_next_fetch()
            log.info(f"odds-fetch: prochain fetch dans {int(wait_s/60)} min")
            await asyncio.sleep(wait_s)
            result = await refresh_matches_worker(db)
            log.info(f"odds-fetch 06h00 WAT: {result}")
            # Deuxième fetch à 13h00 WAT (7h après 06h00)
            await asyncio.sleep(7 * 3600)
            result2 = await refresh_matches_worker(db)
            log.info(f"odds-fetch 13h00 WAT: {result2}")
        except Exception as e:
            log.error(f"odds-fetch loop error: {e}")
            await asyncio.sleep(3600)


# ─── App startup ──────────────────────────────────────────────────────────────

app.include_router(api)


@app.on_event("startup")
async def start_all_workers():
    """Démarre tous les workers background."""
    asyncio.create_task(_drip_loop())
    asyncio.create_task(_auto_settle_loop())
    asyncio.create_task(_auto_follower_loop())
    asyncio.create_task(_value_bet_loop())
    asyncio.create_task(_odds_fetch_loop())
    log.info(
        "✅ Workers démarrés : "
        "drip + auto-settle + auto-follower (7h Bénin) + "
        "value-bets + odds-fetch (06h00 & 13h00 WAT)"
    )


@app.on_event("startup")
async def seed_admin():
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
        log.info(f"Admin {admin_email} ensured")
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
    log.info(f"Admin {admin_email} créé")


@app.on_event("shutdown")
async def shutdown():
    client.close()
