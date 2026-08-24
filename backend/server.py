"""
WinPulse API — server.py (v8.0)
Connecte auth.py, odds_service.py, prediction_engine.py, ai_service.py
"""
import os
import asyncio
import time
import httpx
import uuid
import statistics
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user_payload, get_optional_user_payload,
)
from odds_service import (
    fetch_all_matches, refresh_matches_worker, fetch_all_scores,
    fetch_odds_api_io_scores_map, diagnose_sport_key,
    probe_odds_api_io_event, probe_odds_api_io_league_sample,
    ODDS_API_IO_LEAGUES,
)
from stats_service import refresh_real_stats_cache, get_real_stats_map
from prediction_engine import (
    analyze_all, analyze_match, top_predictions, build_multi_combos, find_value_bets,
    build_super_combos, build_today_combos_by_sport, build_ultra_safe_combo,
    _is_today as _is_today_match, MODEL_VERSION, SAFE_THRESHOLD, VALUE_THRESHOLD,
)
from ai_service import generate_analysis

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


# ─── DB setup ──────────────────────────────────────────────────────────[...] 
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "winpulse")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Emails auto-promus admin + abonnement Elite a chaque connexion
ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "").split(",")
    if e.strip()
}

# ─── App setup ─────────────────────────────────────────────────────────��[...] 
app = FastAPI(title="WinPulse API")

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
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=True,
)


@app.get("/api/")
async def racine():
    return {"application": "WinPulse", "statut": "OK", "version": MODEL_VERSION}


@app.get("/api/sante")
async def sante():
    return {"statut": "en bonne sante"}


# ─── Auth models ─────────────────────────────────────────────────────────[...] 

class RegisterPayload(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    referral_code: Optional[str] = None


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


@app.post("/api/auth/register")
async def register(payload: RegisterPayload):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email deja utilise")

    is_admin = payload.email.lower() in ADMIN_EMAILS
    user_id = str(uuid.uuid4())

    referred_by = None
    if payload.referral_code:
        referrer = await db.users.find_one({"referral_code": payload.referral_code.strip().upper()})
        if referrer:
            referred_by = referrer["id"]

    user_doc = {
        "id": user_id,
        "email": payload.email.lower(),
        "name": payload.name or payload.email.split("@")[0],
        "full_name": payload.name or payload.email.split("@")[0],
        "password_hash": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "subscription": "elite" if is_admin else "free",
        "is_admin": is_admin,
        "referral_code": user_id[:8].upper(),
        "referred_by": referred_by,
        "referral_reward_claimed": False,
    }
    await db.users.insert_one(user_doc)
    await send_welcome_email(user_doc["email"], user_doc["name"])
    token = create_access_token(user_id, payload.email.lower())
    return {
        "access_token": token,
        "user": {
            "id": user_id, "email": user_doc["email"], "name": user_doc["name"],
            "full_name": user_doc["full_name"], "subscription": user_doc["subscription"],
            "subscription_tier": user_doc["subscription"],
            "is_admin": user_doc["is_admin"],
        },
    }


@app.post("/api/auth/login")
async def login(payload: LoginPayload):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    if user["email"] in ADMIN_EMAILS and not user.get("is_admin"):
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"is_admin": True, "subscription": "elite"}},
        )
        user["is_admin"] = True
        user["subscription"] = "elite"

    user = await _check_and_downgrade_if_expired(user)

    token = create_access_token(user["id"], user["email"])
    return {
        "access_token": token,
        "user": {
            "id": user["id"], "email": user["email"], "name": user.get("name", ""),
            "full_name": user.get("full_name", user.get("name", "")),
            "subscription": user.get("subscription", "free"),
            "subscription_tier": user.get("subscription", "free"),
            "is_admin": user.get("is_admin", False),
        },
    }


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
    }


# ─── Prediction cache + calibration empirique ───────────────────────────────

async def _invalidate_prediction_cache():
    async with _prediction_cache_lock:
        _prediction_cache["timestamp"] = 0.0
        _prediction_cache["matches"] = []
        _prediction_cache["predictions"] = []
        _prediction_cache["real_stats_map"] = {}
        _prediction_cache["calibration"] = {}


async def _compute_calibration_map() -> Dict[int, Dict]:
    resolved = await db.predictions_history.find(
        {"result": {"$in": ["won", "lost"]}, "model_version": MODEL_VERSION},
        {"confidence": 1, "result": 1}
    ).to_list(length=10000)
    buckets: Dict[int, Dict[str, int]] = {}
    for row in resolved:
        try:
            c = float(row.get("confidence", 0))
        except (TypeError, ValueError):
            continue
        bucket = max(0, min(95, int(c // 5) * 5))
        item = buckets.setdefault(bucket, {"wins": 0, "total": 0})
        item["total"] += 1
        if row.get("result") == "won":
            item["wins"] += 1

    out = {}
    for bucket, item in buckets.items():
        total = item["total"]
        if total < 30:
            continue
        prior = (bucket + 2.5) / 100.0
        calibrated = (item["wins"] + prior * 20.0) / (total + 20.0)
        out[bucket] = {
            "probability": round(calibrated * 100.0, 1),
            "wins": item["wins"],
            "total": total,
        }
    return out


async def _get_prediction_snapshot(force: bool = False) -> Dict:
    now = time.monotonic()
    async with _prediction_cache_lock:
        if (not force and _prediction_cache["matches"] and
                now - _prediction_cache["timestamp"] < PREDICTION_CACHE_TTL):
            return _prediction_cache

        matches = await fetch_all_matches(db)
        real_stats_map = await get_real_stats_map(db, matches)
        predictions = analyze_all(matches, real_stats_map=real_stats_map)
        calibration = await _compute_calibration_map()
        _prediction_cache.update({
            "timestamp": now,
            "matches": matches,
            "predictions": predictions,
            "real_stats_map": real_stats_map,
            "calibration": calibration,
        })
        return _prediction_cache


async def _get_calibration_map() -> Dict[int, Dict]:
    snapshot = await _get_prediction_snapshot()
    return snapshot["calibration"]


def _apply_calibration(predictions: List[Dict], calibration: Dict[int, Dict]) -> List[Dict]:
    for p in predictions:
        try:
            c = float(p.get("confidence", 0))
        except (TypeError, ValueError):
            c = 0.0
        bucket = max(0, min(95, int(c // 5) * 5))
        cal = calibration.get(bucket)
        if cal:
            p["calibrated_probability"] = cal["probability"]
            p["calibration_sample"] = cal["total"]
            p["calibration_status"] = "empirique"
            p["effective_score"] = round(
                float(p.get("wp_score", c)) * 0.70 + cal["probability"] * 0.30, 1
            )
        else:
            p["calibrated_probability"] = None
            p["calibration_sample"] = 0
            p["calibration_status"] = "insuffisant"
            p["effective_score"] = round(float(p.get("wp_score", c)), 1)
    return predictions


# ─── Matches & predictions ──────────────────────────────────────────────────

def _merge_match_prediction(match: dict, prediction: dict) -> dict:
    merged = dict(match)
    merged["prediction"] = prediction
    return merged


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
    is_paid = False
    if payload:
        user = await db.users.find_one({"id": payload.get("sub")})
        if user and (user.get("is_admin") or user.get("subscription", "free") != "free"):
            is_paid = True
    merged = []
    for i, m in enumerate(matches):
        pred = dict(pred_by_id.get(m.get("id"), {}))
        if not is_paid and i > 0:
            pred["locked"] = True
            pred["pick"] = None
            pred["pick_odds"] = None
            pred["markets"] = []
            pred["recommendations"] = []
            pred["combo_suggestion"] = None
        else:
            pred["locked"] = False
        merged.append(_merge_match_prediction(m, pred))
    return merged


@app.get("/api/predictions")
async def get_predictions():
    snapshot = await _get_prediction_snapshot()
    predictions = _apply_calibration(
        [dict(p) for p in snapshot["predictions"]],
        snapshot["calibration"],
    )
    return predictions


@app.get("/api/predictions/model-status")
async def get_prediction_model_status():
    snapshot = await _get_prediction_snapshot()
    calibration = snapshot["calibration"]
    resolved = await db.predictions_history.count_documents({"result": {"$in": ["won", "lost"]}})
    pending = await db.predictions_history.count_documents({"result": "pending"})
    return {
        "model_version": MODEL_VERSION,
        "cache_ttl_seconds": PREDICTION_CACHE_TTL,
        "resolved_picks": resolved,
        "pending_picks": pending,
        "calibration_buckets": calibration,
        "calibration_ready": bool(calibration),
        "note": "La probabilité calibrée n'est affichée qu'après accumulation d'au moins 30 résultats dans une tranche de confiance.",
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

    is_paid = False
    if payload:
        user = await db.users.find_one({"id": payload.get("sub")})
        if user and (user.get("is_admin") or user.get("subscription", "free") != "free"):
            is_paid = True

    if not is_paid:
        for i, p in enumerate(preds):
            if i == 0:
                p["locked"] = False
            else:
                p["locked"] = True
                p["pick"] = None
                p["pick_odds"] = None
                p["markets"] = []
                p["recommendations"] = []
                p["combo_suggestion"] = None
    else:
        for p in preds:
            p["locked"] = False

    return preds


@app.get("/api/matches/{match_id}/analysis")
async def get_match_analysis(match_id: str):
    snapshot = await _get_prediction_snapshot()
    matches = snapshot["matches"]

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
    ai_analysis = await generate_analysis(match, prediction)
    return {"match": match, "prediction": prediction, "ai_analysis": ai_analysis}


@app.get("/api/data/status")
async def get_data_status():
    cached = await db.odds_cache.find_one({"_id": "all_matches"})
    if not cached:
        return {"odds_updated_at": None, "count": 0}
    return {
        "odds_updated_at": cached.get("updated_at"),
        "count": cached.get("count", 0),
    }


@app.post("/api/data/refresh")
async def post_data_refresh(payload: dict = Depends(get_current_user_payload)):
    result = await refresh_matches_worker(db)
    await _invalidate_prediction_cache()
    return result


@app.get("/api/data/source-audit")
async def get_data_source_audit():
    cached = await db.odds_cache.find_one({"_id": "all_matches"})
    return {
        "updated_at": cached.get("updated_at") if cached else None,
        "count": cached.get("count", 0) if cached else 0,
        "sources": ["The Odds API"],
    }


# ─── Abonnement ─────────────────────────────────────────────────────────�[...] 

SUBSCRIPTION_PLANS = [
    {
        "id": "pro",
        "name": "WinPulse Pro",
        "price": 6500,
        "price_fcfa": 6500,
        "price_xof": 6500,
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


@app.get("/api/subscription/plans")
async def get_subscription_plans():
    return SUBSCRIPTION_PLANS


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
    }


# ─── Paiement manuel MoMo + validation admin ─────────────────────────────

MOMO_NUMBER = "+229 01 66 28 06 03"
MOMO_RECIPIENT_NAME = "KOUKPAKI VIANEY"
PAYMENT_WHATSAPP_NUMBER = "+33 7 67 97 17 52"


class CheckoutPayload(BaseModel):
    tier: str
    phone: str
    payer_name: str


@app.post("/api/subscription/checkout")
async def subscription_checkout(
    payload_in: CheckoutPayload,
    payload: dict = Depends(get_current_user_payload),
):
    plan = next((p for p in SUBSCRIPTION_PLANS if p["id"] == payload_in.tier.lower()), None)
    if not plan:
        raise HTTPException(status_code=400, detail="Plan inconnu")

    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    reference = _generate_reference()
    await db.subscription_requests.insert_one({
        "reference": reference,
        "user_id": user["id"],
        "user_email": user["email"],
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "amount_fcfa": plan["price_fcfa"],
        "payer_phone": payload_in.phone.strip(),
        "payer_name": payload_in.payer_name.strip(),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"reference": reference, "plan": plan}


class UpgradeRequestPayload(BaseModel):
    plan_id: str


def _generate_reference() -> str:
    return f"PE-{uuid.uuid4().hex[:8].upper()}"


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

    reference = _generate_reference()
    request_doc = {
        "reference": reference,
        "user_id": user["id"],
        "user_email": user["email"],
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "amount_fcfa": plan["price_fcfa"],
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.subscription_requests.insert_one(request_doc)

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
        "reference": reference,
        "plan": plan,
        "payment_instructions": {
            "momo_number": MOMO_NUMBER,
            "momo_recipient_name": MOMO_RECIPIENT_NAME,
            "amount_fcfa": plan["price_fcfa"],
            "steps": [
                f"Compose *165# sur ton telephone MTN (ou l'app MoMo).",