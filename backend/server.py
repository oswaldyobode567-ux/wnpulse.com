"""WinPulse - Main FastAPI server."""
import os
import uuid
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
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
from prediction_engine import analyze_match, top_predictions, build_combo, build_multi_combos
from ai_service import generate_analysis
from email_service import send_picks_email, send_payment_confirmation, send_welcome_email, send_reset_password_email

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

APP_NAME = os.environ.get("APP_NAME", "WinPulse")
app = FastAPI(title=f"{APP_NAME} API")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    }


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
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_id, body.email.lower())
    # Welcome email (best-effort, doesn't block registration)
    try:
        asyncio.create_task(send_welcome_email(user_doc["email"], user_doc["full_name"]))
    except Exception as e:
        log.warning(f"welcome email queue failed: {e}")
    return TokenResponse(access_token=token, user=_public_user(user_doc))


@api.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginBody):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Identifiants invalides.")
    token = create_access_token(user["id"], user["email"])
    return TokenResponse(access_token=token, user=_public_user(user))


@api.get("/auth/me")
async def me(payload: dict = Depends(get_current_user_payload)):
    user = await _get_user(payload["sub"])
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
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
            "merchant_number": os.environ.get("MOMO_MERCHANT_PHONE", "+229 01 67 30 54 39"),
            "whatsapp_number": os.environ.get("MOMO_WHATSAPP_PHONE", "+229 01 67 30 54 39"),
            "steps": [
                "Composez *880# sur votre téléphone MTN Bénin",
                "Choisissez 'Transfert d'argent'",
                f"Saisissez le numéro marchand : {os.environ.get('MOMO_MERCHANT_PHONE', '+229 01 67 30 54 39')}",
                f"Montant : {plan['price_xof']} FCFA",
                f"Référence (motif) : {ref}",
                "Confirmez avec votre code PIN MTN",
                "Envoyez-nous une capture du SMS de confirmation via WhatsApp pour activation rapide.",
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
    # Revenue
    confirmed_pays = await db.payments.find({"status": "confirmed"}, {"amount_xof": 1}).to_list(1000)
    revenue = sum(p.get("amount_xof", 0) for p in confirmed_pays)
    return {
        "users": {"total": total_users, "pro": pro_users, "elite": elite_users, "free": total_users - pro_users - elite_users},
        "payments": {"pending": pending, "confirmed": confirmed},
        "revenue_xof": revenue,
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


app.include_router(api)


@app.on_event("startup")
async def seed_admin():
    """Seed the admin user from env vars if it doesn't exist."""
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower().strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    admin_name = os.environ.get("ADMIN_NAME", "Admin")
    if not admin_email or not admin_password:
        return
    existing = await db.users.find_one({"email": admin_email})
    if existing:
        # Ensure admin flag is set
        if not existing.get("is_admin"):
            await db.users.update_one({"email": admin_email}, {"$set": {"is_admin": True}})
            log.info(f"Promoted {admin_email} to admin")
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
    })
    log.info(f"Seeded admin user {admin_email}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
