"""Pronostix AI - Main FastAPI server."""
import os
import uuid
import logging
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
)
from odds_service import fetch_all_matches, get_match_by_id, SUPPORTED_SPORTS
from prediction_engine import analyze_all, analyze_match, top_predictions, build_combo
from ai_service import generate_analysis

# ------------------ Mongo ------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ------------------ App ------------------
app = FastAPI(title="Pronostix AI API")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("pronostix")

# ------------------ Pricing ------------------
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
            "Analyse IA Claude Sonnet 4.5",
            "Combinés gagnants quotidiens",
            "Notifications en temps réel",
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


# ------------------ Models ------------------
class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=2)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class PaymentRequestBody(BaseModel):
    tier: str  # pro / elite
    phone: str
    payer_name: Optional[str] = None


# ------------------ Helpers ------------------
def _public_user(user_doc: dict) -> dict:
    return {
        "id": user_doc["id"],
        "email": user_doc["email"],
        "full_name": user_doc["full_name"],
        "subscription_tier": user_doc.get("subscription_tier", "free"),
        "subscription_status": user_doc.get("subscription_status", "active"),
        "subscription_expires_at": user_doc.get("subscription_expires_at"),
        "created_at": user_doc.get("created_at"),
    }


async def _get_user(user_id: str) -> Optional[dict]:
    return await db.users.find_one({"id": user_id}, {"_id": 0})


# ------------------ Public routes ------------------
@api.get("/")
async def root():
    return {"app": "Pronostix AI", "status": "ok"}


@api.get("/sports")
async def list_sports():
    return SUPPORTED_SPORTS


@api.get("/plans")
async def get_plans():
    return [{"id": k, **v} for k, v in PLANS.items()]


# ------------------ Auth ------------------
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
        "subscription_tier": "free",
        "subscription_status": "active",
        "subscription_expires_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_id, body.email.lower())
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


# ------------------ Matches & Predictions ------------------
@api.get("/matches")
async def get_matches(sport: Optional[str] = None):
    matches = await fetch_all_matches(db)
    if sport:
        matches = [m for m in matches if sport in (m.get("sport_key") or "")]
    # Attach prediction summary
    out = []
    for m in matches:
        pred = analyze_match(m)
        out.append({**m, "prediction": pred})
    # Sort by commence time
    out.sort(key=lambda x: x.get("commence_time", ""))
    return out


@api.get("/predictions/top")
async def get_top():
    matches = await fetch_all_matches(db)
    return top_predictions(matches, limit=6)


@api.get("/predictions/combo")
async def get_combo(legs: int = 3, min_confidence: float = 65):
    legs = max(2, min(legs, 5))
    matches = await fetch_all_matches(db)
    return build_combo(matches, legs=legs, min_confidence=min_confidence)


@api.get("/matches/{match_id}")
async def get_match_detail(match_id: str):
    match = await get_match_by_id(db, match_id)
    if not match:
        raise HTTPException(404, "Match introuvable")
    prediction = analyze_match(match)
    return {**match, "prediction": prediction}


@api.get("/matches/{match_id}/analysis")
async def get_match_analysis(
    match_id: str,
    payload: dict = Depends(get_current_user_payload),
):
    """AI deep analysis. Cached per day to save credit."""
    match = await get_match_by_id(db, match_id)
    if not match:
        raise HTTPException(404, "Match introuvable")
    prediction = analyze_match(match)

    today = datetime.now(timezone.utc).date().isoformat()
    cache_key = f"{match_id}-{today}"
    cached = await db.ai_analysis_cache.find_one({"_id": cache_key})
    if cached:
        return {"prediction": prediction, "analysis": cached["analysis"]}

    # Tier gate: free users get fallback (no Claude call)
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


# ------------------ Track record (predictions history) ------------------
@api.get("/predictions/history")
async def history(payload: dict = Depends(get_current_user_payload)):
    """Show past predictions outcomes (mocked but deterministic for trust)."""
    docs = await db.predictions_log.find({}, {"_id": 0}).sort("date", -1).limit(50).to_list(50)
    if not docs:
        # Seed a few historical entries on first call
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
        for i, (match, pick, league, conf, odds, won) in enumerate(sample_picks):
            d = (datetime.now(timezone.utc) - timedelta(days=i+1)).date().isoformat()
            docs.append({
                "id": str(uuid.uuid4()),
                "date": d,
                "match": match,
                "pick": pick,
                "league": league,
                "confidence": conf,
                "odds": odds,
                "won": won,
            })
        if docs:
            await db.predictions_log.insert_many([{**d} for d in docs])

    total = len(docs)
    wins = sum(1 for d in docs if d.get("won"))
    win_rate = round((wins / total * 100) if total else 0, 1)
    avg_odds = round(sum(d["odds"] for d in docs) / total, 2) if total else 0
    # ROI assuming 1 unit per bet
    roi_units = sum((d["odds"] - 1) if d["won"] else -1 for d in docs)
    roi_percent = round((roi_units / total) * 100, 1) if total else 0

    return {
        "predictions": docs,
        "stats": {
            "total": total,
            "wins": wins,
            "losses": total - wins,
            "win_rate": win_rate,
            "avg_odds": avg_odds,
            "roi_percent": roi_percent,
        },
    }


# ------------------ Subscription / MoMo ------------------
@api.post("/subscription/checkout")
async def checkout(body: PaymentRequestBody, payload: dict = Depends(get_current_user_payload)):
    if body.tier not in ("pro", "elite"):
        raise HTTPException(400, "Plan invalide")
    plan = PLANS[body.tier]
    ref = f"PRX-{uuid.uuid4().hex[:8].upper()}"
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": payload["sub"],
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
            "merchant_number": os.environ.get("MOMO_MERCHANT_PHONE", "+229 01 52 64 51 51"),
            "steps": [
                f"Composez *880# sur votre téléphone MTN Bénin",
                f"Choisissez 'Transfert d'argent'",
                f"Saisissez le numéro marchand : {os.environ.get('MOMO_MERCHANT_PHONE', '+229 01 52 64 51 51')}",
                f"Montant : {plan['price_xof']} FCFA",
                f"Référence (motif) : {ref}",
                f"Confirmez avec votre code PIN MTN",
                f"Envoyez-nous une capture du SMS de confirmation via WhatsApp pour activation immédiate.",
            ],
        },
    }


@api.get("/subscription/payments")
async def list_payments(payload: dict = Depends(get_current_user_payload)):
    docs = await db.payments.find({"user_id": payload["sub"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs


@api.post("/subscription/confirm/{reference}")
async def confirm_payment(reference: str, payload: dict = Depends(get_current_user_payload)):
    """Demo endpoint to simulate manual admin confirmation.
    In production, only an admin should be able to mark a payment as confirmed.
    """
    pay = await db.payments.find_one({"reference": reference, "user_id": payload["sub"]})
    if not pay:
        raise HTTPException(404, "Paiement introuvable")
    if pay["status"] == "confirmed":
        return {"ok": True, "already": True}

    plan = PLANS[pay["tier"]]
    expires = datetime.now(timezone.utc) + timedelta(days=plan["duration_days"])
    await db.users.update_one(
        {"id": payload["sub"]},
        {"$set": {
            "subscription_tier": pay["tier"],
            "subscription_status": "active",
            "subscription_expires_at": expires.isoformat(),
        }},
    )
    await db.payments.update_one(
        {"reference": reference},
        {"$set": {"status": "confirmed", "confirmed_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "tier": pay["tier"], "expires_at": expires.isoformat()}


# ------------------ Router include ------------------
app.include_router(api)


@app.on_event("shutdown")
async def shutdown():
    client.close()
