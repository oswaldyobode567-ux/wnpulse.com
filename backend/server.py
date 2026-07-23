"""
WinPulse API — server.py (v7.4)
Connecte auth.py, odds_service.py, prediction_engine.py, ai_service.py
"""
import os
import uuid
from datetime import datetime, timezone
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
from odds_service import fetch_all_matches, refresh_matches_worker, fetch_all_scores
from prediction_engine import (
    analyze_all, top_predictions, build_multi_combos,
    build_super_combos, build_today_combos_by_sport,
)
from ai_service import generate_analysis

# ─── DB setup ─────────────────────────────────────────────────────────────
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

# ─── App setup ────────────────────────────────────────────────────────────
app = FastAPI(title="WinPulse API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/")
async def racine():
    return {"application": "WinPulse", "statut": "OK", "version": "7.4"}


@app.get("/api/sante")
async def sante():
    return {"statut": "en bonne sante"}


# ─── Auth models ──────────────────────────────────────────────────────────

class RegisterPayload(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


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
    user_doc = {
        "id": user_id,
        "email": payload.email.lower(),
        "name": payload.name or payload.email.split("@")[0],
        "full_name": payload.name or payload.email.split("@")[0],
        "password_hash": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "subscription": "elite" if is_admin else "free",
        "is_admin": is_admin,
    }
    await db.users.insert_one(user_doc)
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
    return {
        "id": user["id"], "email": user["email"],
        "name": user.get("name", ""), "full_name": user.get("full_name", user.get("name", "")),
        "subscription": user.get("subscription", "free"),
        "subscription_tier": user.get("subscription", "free"),
        "is_admin": user.get("is_admin", False),
    }


# ─── Matches & predictions ──────────────────────────────────────────────────

def _merge_match_prediction(match: dict, prediction: dict) -> dict:
    """Fusionne un match brut avec sa prediction, format attendu par le frontend."""
    merged = dict(match)
    merged["prediction"] = prediction
    return merged


@app.get("/api/matches")
async def get_matches():
    """Retourne un tableau direct de matchs, chacun avec sa prediction integree."""
    matches = await fetch_all_matches(db)
    predictions = analyze_all(matches)
    pred_by_id = {p.get("match_id"): p for p in predictions}
    merged = [
        _merge_match_prediction(m, pred_by_id.get(m.get("id"), {}))
        for m in matches
    ]
    return merged


@app.get("/api/predictions")
async def get_predictions():
    matches = await fetch_all_matches(db)
    predictions = analyze_all(matches)
    return predictions


@app.get("/api/predictions/top")
async def get_top_predictions(limit: int = 10, payload: Optional[dict] = Depends(get_optional_user_payload)):
    matches = await fetch_all_matches(db)
    preds = top_predictions(matches, limit=limit)

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
    else:
        for p in preds:
            p["locked"] = False

    return preds


@app.get("/api/matches/{match_id}/analysis")
async def get_match_analysis(match_id: str):
    """
    Recherche le match par son id parmi TOUS les matchs en cache (pas seulement
    ceux retenus par analyze_all), pour eviter les faux "introuvable" quand le
    match n'a pas de pick valide ou que le cache a legerement change entre deux
    appels. Recherche aussi sur match_id en secours.
    """
    matches = await fetch_all_matches(db)

    match = next((m for m in matches if str(m.get("id")) == str(match_id)), None)

    if not match:
        # Repli : certains ids peuvent etre stockes sous une autre cle
        match = next(
            (m for m in matches if str(m.get("match_id", "")) == str(match_id)),
            None,
        )

    if not match:
        raise HTTPException(
            status_code=404,
            detail=f"Match introuvable (id={match_id}, {len(matches)} matchs en cache)",
        )

    predictions = analyze_all([match])
    prediction = predictions[0] if predictions else {}
    ai_analysis = await generate_analysis(match, prediction)
    return {"match": match, "prediction": prediction, "ai_analysis": ai_analysis}


@app.get("/api/data/status")
async def get_data_status():
    """Statut du cache de donnees, utilise pour l'indicateur de connexion."""
    cached = await db.odds_cache.find_one({"_id": "all_matches"})
    if not cached:
        return {"odds_updated_at": None, "count": 0}
    return {
        "odds_updated_at": cached.get("updated_at"),
        "count": cached.get("count", 0),
    }


@app.post("/api/data/refresh")
async def post_data_refresh(payload: dict = Depends(get_current_user_payload)):
    """Force le rafraichissement du cache (authentifie)."""
    result = await refresh_matches_worker(db)
    return result


@app.get("/api/data/source-audit")
async def get_data_source_audit():
    """Alias attendu par le frontend — infos sur la source/fraicheur des donnees."""
    cached = await db.odds_cache.find_one({"_id": "all_matches"})
    return {
        "updated_at": cached.get("updated_at") if cached else None,
        "count": cached.get("count", 0) if cached else 0,
        "sources": ["The Odds API"],
    }


# ─── Abonnement ───────────────────────────────────────────────────────────

SUBSCRIPTION_PLANS = [
    {
        "id": "starter",
        "name": "Starter",
        "price": 4900,
        "price_fcfa": 4900,
        "period": "mois",
        "features": ["1 pick/jour", "Accès Dashboard"],
    },
    {
        "id": "pro",
        "name": "Pro",
        "price": 9900,
        "price_fcfa": 9900,
        "period": "mois",
        "features": ["Tous les picks", "Combos", "Analyse complète", "Super Combos"],
        "highlighted": True,
    },
    {
        "id": "elite",
        "name": "Elite",
        "price": 19900,
        "price_fcfa": 19900,
        "period": "mois",
        "features": ["Tout Pro", "VIP WhatsApp direct", "Garantie", "Priorité support"],
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
    return {
        "subscription": user.get("subscription", "free"),
        "is_admin": user.get("is_admin", False),
    }


# ─── Paiement manuel MoMo + validation admin ─────────────────────────────

MOMO_NUMBER = "0161321256"
MOMO_RECIPIENT_NAME = "KOUKPAKI VIANNEY"
PAYMENT_WHATSAPP_NUMBER = "+33767971752"


class UpgradeRequestPayload(BaseModel):
    plan_id: str


def _generate_reference() -> str:
    return f"PE-{uuid.uuid4().hex[:8].upper()}"


@app.post("/api/subscription/request-upgrade")
async def request_subscription_upgrade(
    payload_in: UpgradeRequestPayload,
    payload: dict = Depends(get_current_user_payload),
):
    """
    Cree une demande de mise a niveau en attente et retourne les instructions
    de paiement MoMo, avec un message WhatsApp pre-rempli a envoyer pour
    confirmation manuelle par l'admin.
    """
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
        f"https://wa.me/{PAYMENT_WHATSAPP_NUMBER.replace('+', '')}"
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
                f"Envoie {plan['price_fcfa']:,} FCFA".replace(",", " ")
                + f" au {MOMO_NUMBER} ({MOMO_RECIPIENT_NAME}).",
                "Garde le SMS de confirmation MTN.",
                "Envoie la confirmation sur WhatsApp avec le bouton ci-dessous.",
                "Ton acces est active des reception et verification du paiement.",
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
    """Alias de /api/subscription/request-upgrade, nom possible cote frontend."""
    return await request_subscription_upgrade(payload_in, payload)


async def _require_admin(payload: dict) -> dict:
    user = await db.users.find_one({"id": payload["sub"]})
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Acces reserve aux administrateurs")
    return user


@app.get("/api/admin/stats")
async def admin_get_stats(payload: dict = Depends(get_current_user_payload)):
    """Statistiques globales pour le tableau de bord admin."""
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
    """Liste de tous les utilisateurs, pour le panneau admin."""
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
        })
    return result


# Statuts en francais attendus par le frontend, mappes vers les valeurs internes
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
    """
    Liste des demandes de paiement/abonnement, avec filtre de statut en
    francais (nom de parametre et valeurs attendues par le frontend).
    """
    await _require_admin(payload)
    internal_status = _PAYMENT_STATUS_MAP_FR_TO_EN.get(
        status_filter.lower().strip(), status_filter
    )
    query = {} if internal_status == "all" else {"status": internal_status}
    requests = await db.subscription_requests.find(query).sort("created_at", -1).to_list(length=200)
    for r in requests:
        r.pop("_id", None)
    return requests


@app.get("/api/admin/whatsapp-blast")
async def admin_whatsapp_blast(payload: dict = Depends(get_current_user_payload)):
    """
    Donnees pour l'envoi groupe WhatsApp aux utilisateurs (liste de contacts
    a contacter). L'envoi effectif necessite une integration WhatsApp
    Business API non encore configuree — cette route fournit pour l'instant
    la liste des utilisateurs payants a contacter manuellement, plutot
    qu'un 404 qui casse la page admin.
    """
    await _require_admin(payload)
    paid_users = await db.users.find({"subscription": {"$ne": "free"}}).to_list(length=500)
    contacts = [
        {"email": u.get("email"), "name": u.get("name", ""), "subscription": u.get("subscription")}
        for u in paid_users
    ]
    return {
        "ready": False,
        "detail": "Integration WhatsApp Business API pas encore configuree. Liste des contacts payants ci-dessous.",
        "contacts": contacts,
        "total": len(contacts),
    }


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

    await db.users.update_one(
        {"id": req["user_id"]},
        {"$set": {"subscription": req["plan_id"]}},
    )
    await db.subscription_requests.update_one(
        {"reference": reference},
        {"$set": {
            "status": "approved",
            "approved_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "detail": f"Abonnement {req['plan_id']} active pour {req['user_email']}"}


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


# ─── Combos ─────────────────────────────────────────────────────────────────

@app.get("/api/combos")
async def get_combos():
    matches = await fetch_all_matches(db)
    return build_multi_combos(matches)


@app.get("/api/combos/super")
async def get_super_combos():
    matches = await fetch_all_matches(db)
    return build_super_combos(matches)


@app.get("/api/combos/today")
async def get_today_combos():
    try:
        matches = await fetch_all_matches(db)
        return build_today_combos_by_sport(matches)
    except Exception as e:
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_matches_today": 0,
            "families": {},
            "error": str(e),
        }


# ─── Alias de routes attendues par le frontend (memes donnees, autres noms) ──

@app.get("/api/predictions/today-combos")
async def get_predictions_today_combos_alias():
    """Alias de /api/combos/today, nom attendu par le frontend."""
    return await get_today_combos()


@app.get("/api/predictions/combos")
async def get_predictions_combos_alias():
    """Alias de /api/combos, nom attendu par le frontend."""
    return await get_combos()


@app.get("/api/builder/matches")
async def get_builder_matches():
    """
    Matchs + predictions pour l'ecran Combo Builder. Meme donnee que
    /api/matches mais nom de route attendu par le frontend.
    """
    matches = await fetch_all_matches(db)
    predictions = analyze_all(matches)
    pred_by_id = {p.get("match_id"): p for p in predictions}
    merged = [
        _merge_match_prediction(m, pred_by_id.get(m.get("id"), {}))
        for m in matches
    ]
    return merged


@app.get("/api/builder/my-combos")
async def get_builder_my_combos(payload: dict = Depends(get_current_user_payload)):
    """
    Combos personnalises sauvegardes par l'utilisateur. Pas encore de
    persistance dediee cote base — retourne une liste vide propre plutot
    qu'un 404, en attendant l'implementation complete.
    """
    saved = await db.user_combos.find({"user_id": payload["sub"]}).to_list(length=100)
    for s in saved:
        s.pop("_id", None)
    return saved


# NOTE : la route /api/predictions/history reelle (avec historique persiste)
# est definie plus bas, apres l'implementation du suivi des predictions.


# ─── Route directe /api/matches/{id} (sans /analysis) ────────────────────────

@app.get("/api/matches/{match_id}")
async def get_single_match(match_id: str):
    """
    Le frontend appelle /api/matches/{id} directement (pas /analysis) pour
    la fiche detail d'un pick. Meme logique de recherche que /analysis.
    """
    matches = await fetch_all_matches(db)

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

    predictions = analyze_all([match])
    prediction = predictions[0] if predictions else {}
    return _merge_match_prediction(match, prediction)


# ─── Value bets ───────────────────────────────────────────────────────────

@app.get("/api/value-bets")
async def get_value_bets():
    """
    Picks a forte valeur (confiance elevee + cote correcte). Seuils alignes
    sur MIN_CONFIDENCE du moteur (60) pour ne pas etre plus stricte que
    /api/predictions/top et se retrouver vide alors que des picks existent.
    """
    matches = await fetch_all_matches(db)
    preds = top_predictions(matches, limit=30)
    value_bets = [
        p for p in preds
        if p.get("pick") and p.get("confidence", 0) >= 60
        and p.get("pick_odds", 0) >= 1.2
    ]
    return value_bets


# ─── Plans (alias) ────────────────────────────────────────────────────────

@app.get("/api/plans")
async def get_plans_alias():
    """Alias de /api/subscription/plans, nom attendu par le frontend."""
    return SUBSCRIPTION_PLANS


# ─── Parrainage ───────────────────────────────────────────────────────────

@app.get("/api/referral/me")
async def get_referral_me(payload: dict = Depends(get_current_user_payload)):
    """
    Statut de parrainage de l'utilisateur. Pas encore de systeme de
    parrainage complet en base — retourne une structure vide coherente
    plutot qu'un 404 qui casse le routing frontend.
    """
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    code = user.get("referral_code") or user["id"][:8].upper()
    return {
        "referral_code": code,
        "referral_link": f"https://www.wnpulse.com/inscription?ref={code}",
        "total_referred": 0,
        "rewards_earned_fcfa": 0,
        "referred_users": [],
    }


@app.get("/api/predictions/history")
async def get_predictions_history(limit: int = 100, payload: Optional[dict] = Depends(get_optional_user_payload)):
    """
    Historique reel des picks publies avec leur resultat (gagne/perdu/en attente).
    Alimente par _save_predictions_to_history() a chaque refresh et reconcilie
    avec les scores reels par _reconcile_predictions_with_scores().
    """
    history = await db.predictions_history.find({}).sort("created_at", -1).to_list(length=limit)
    for h in history:
        h.pop("_id", None)
    return history


@app.get("/api/admin/accuracy-stats")
async def admin_get_accuracy_stats(payload: dict = Depends(get_current_user_payload)):
    """
    Statistiques REELLES de reussite, calculees uniquement sur les picks
    dont le resultat a ete confirme (won/lost) — jamais sur des picks
    encore en attente. Casse par tranche de confiance pour verifier si le
    moteur est bien calibre (ex: les picks a 75% de confiance gagnent-ils
    vraiment ~75% du temps ?).
    """
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


@app.get("/api/admin/reconcile-results-simple")
async def admin_reconcile_results_simple(key: str = ""):
    """
    Force la reconciliation manuelle des picks avec les scores reels.
    Usage : https://TON-BACKEND/api/admin/reconcile-results-simple?key=TA_CLE
    Normalement execute automatiquement par le worker planifie.
    """
    secret = os.environ.get("REFRESH_SECRET", "")
    if not secret or key != secret:
        raise HTTPException(status_code=403, detail="Cle invalide")
    result = await _reconcile_predictions_with_scores()
    return result


# ─── Scores ───────────────────────────────────────────────────────────────

@app.get("/api/scores")
async def get_scores():
    scores = await fetch_all_scores(db)
    return scores


# ─── Admin ────────────────────────────────────────────────────────────────

@app.post("/api/admin/refresh")
async def admin_refresh(payload: dict = Depends(get_current_user_payload)):
    """Force le rafraichissement du cache (consomme des credits API)."""
    result = await refresh_matches_worker(db)
    return result


@app.get("/api/admin/activate-admin-simple")
async def admin_activate_admin_simple(email: str = "", key: str = ""):
    """
    Active is_admin=true et subscription=elite pour un compte donne, en direct.
    Contourne la logique d'auto-promotion a la connexion (utile si un compte
    existait deja avant la configuration de ADMIN_EMAILS).
    Usage : https://TON-BACKEND/api/admin/activate-admin-simple?email=X&key=TA_CLE_SECRETE
    """
    secret = os.environ.get("REFRESH_SECRET", "")
    if not secret or key != secret:
        raise HTTPException(status_code=403, detail="Cle invalide")

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


@app.get("/api/admin/whoami-simple")
async def admin_whoami_simple(email: str = "", key: str = ""):
    """
    Diagnostic simple par lien navigateur, sans besoin de console/token.
    Usage : https://TON-BACKEND/api/admin/whoami-simple?email=X&key=TA_CLE_SECRETE
    Montre l'etat exact d'un compte en base (is_admin, subscription, etc.)
    """
    secret = os.environ.get("REFRESH_SECRET", "")
    if not secret or key != secret:
        raise HTTPException(status_code=403, detail="Cle invalide")

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


@app.get("/api/admin/refresh-simple")
async def admin_refresh_simple(key: str = ""):
    """
    Rafraichissement simple via lien navigateur, protege par une cle secrete.
    Usage : https://TON-BACKEND/api/admin/refresh-simple?key=TA_CLE_SECRETE
    """
    secret = os.environ.get("REFRESH_SECRET", "")
    if not secret or key != secret:
        raise HTTPException(status_code=403, detail="Cle invalide")
    result = await _full_refresh_and_track()
    return result


# ─── Suivi reel des predictions (backtest continu) ──────────────────────────

def _pick_signature(match_id: str, pick: str) -> str:
    """Identifiant unique pour eviter de dupliquer le meme pick en historique."""
    import hashlib
    return hashlib.md5(f"{match_id}::{pick}".encode()).hexdigest()


async def _save_predictions_to_history(matches: List[Dict]):
    """
    Sauvegarde chaque pick publie (confiance suffisante) dans l'historique,
    UNE SEULE FOIS par match+pick — pour ensuite mesurer la vraie performance
    dans le temps, sans jamais modifier un pick deja enregistre (integrite
    de la mesure : on n'ajuste jamais un pick apres coup).
    """
    try:
        predictions = analyze_all(matches)
        for p in predictions:
            if not p.get("pick") or not p.get("match_id"):
                continue
            sig = _pick_signature(p["match_id"], p["pick"])
            existing = await db.predictions_history.find_one({"signature": sig})
            if existing:
                continue  # deja enregistre, on ne touche pas (integrite de la mesure)

            await db.predictions_history.insert_one({
                "signature": sig,
                "match_id": p["match_id"],
                "home_team": p.get("home_team"),
                "away_team": p.get("away_team"),
                "sport_title": p.get("sport_title"),
                "commence_time": p.get("commence_time"),
                "pick": p["pick"],
                "market": p.get("market"),
                "pick_odds": p.get("pick_odds"),
                "confidence": p.get("confidence"),
                "is_combo": p.get("is_combo", False),
                "result": "pending",  # pending -> won / lost apres reconciliation
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    except Exception:
        pass


async def _reconcile_predictions_with_scores() -> Dict:
    """
    Compare les picks "pending" avec les scores reels des matchs termines,
    et met a jour leur resultat (won/lost). Ne touche jamais un pick deja
    reconcilie — integrite de la mesure.
    """
    pending = await db.predictions_history.find({"result": "pending"}).to_list(length=1000)
    if not pending:
        return {"ok": True, "checked": 0, "updated": 0}

    scores = await fetch_all_scores(db)
    scores_by_match = {s.get("id"): s for s in scores if s.get("id")}

    updated = 0
    for pred in pending:
        score_entry = scores_by_match.get(pred["match_id"])
        if not score_entry or not score_entry.get("completed"):
            continue

        try:
            score_data = score_entry.get("scores") or []
            home_score = away_score = None
            for s in score_data:
                if s.get("name") == pred.get("home_team"):
                    home_score = int(s.get("score", 0))
                elif s.get("name") == pred.get("away_team"):
                    away_score = int(s.get("score", 0))

            if home_score is None or away_score is None:
                continue

            result = _evaluate_pick_result(pred, home_score, away_score)
            if result:
                await db.predictions_history.update_one(
                    {"signature": pred["signature"]},
                    {"$set": {
                        "result": result,
                        "final_score": f"{home_score}-{away_score}",
                        "reconciled_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
                updated += 1
        except Exception:
            continue

    return {"ok": True, "checked": len(pending), "updated": updated}


def _evaluate_pick_result(pred: Dict, home_score: int, away_score: int) -> Optional[str]:
    """
    Determine si un pick simple (marche h2h/totals/btts) a gagne ou perdu,
    a partir du score final. Retourne None si le marche n'est pas encore
    supporte par cette evaluation automatique (ex: combo, corners, cartons)
    — ces cas restent "pending" et necessitent une verification manuelle
    plutot qu'un resultat devine a tort.
    """
    pick = (pred.get("pick") or "").lower()
    market = pred.get("market", "")
    home = (pred.get("home_team") or "")
    away = (pred.get("away_team") or "")
    total_goals = home_score + away_score

    if market == "h2h":
        if pick == home.lower():
            return "won" if home_score > away_score else "lost"
        if pick == away.lower():
            return "won" if away_score > home_score else "lost"
        if "nul" in pick or pick == "draw":
            return "won" if home_score == away_score else "lost"

    if market == "totals" or "plus de" in pick or "moins de" in pick:
        point = pred.get("pick_point")
        if point is not None:
            if "plus de" in pick:
                return "won" if total_goals > point else "lost"
            if "moins de" in pick:
                return "won" if total_goals < point else "lost"

    if market == "btts":
        both_scored = home_score > 0 and away_score > 0
        if "oui" in pick:
            return "won" if both_scored else "lost"
        if "non" in pick:
            return "won" if not both_scored else "lost"

    # Marches non couverts automatiquement (combo, corners, cartons, mi-temps...)
    # restent "pending" — pas de fausse estimation.
    return None


# ─── Worker planifie (06h00 et 13h00 WAT = UTC+1) ───────────────────────────

scheduler = AsyncIOScheduler(timezone="UTC")


async def _full_refresh_and_track():
    """Refresh les donnees, sauvegarde les nouveaux picks, reconcilie les anciens."""
    matches = await refresh_matches_worker(db)
    all_matches = await fetch_all_matches(db)
    await _save_predictions_to_history(all_matches)
    await _reconcile_predictions_with_scores()
    return matches


@app.on_event("startup")
async def startup_event():
    # 06h00 WAT = 05h00 UTC / 13h00 WAT = 12h00 UTC
    scheduler.add_job(lambda: _full_refresh_and_track(), "cron", hour=5, minute=0)
    scheduler.add_job(lambda: _full_refresh_and_track(), "cron", hour=12, minute=0)
    # Reconciliation supplementaire toutes les 2h pour capter les matchs
    # termines entre deux refresh complets, sans consommer de credit odds
    scheduler.add_job(lambda: _reconcile_predictions_with_scores(), "cron", minute=0, hour="*/2")
    scheduler.start()

    # Premier fetch si cache vide (ne consomme des credits que si absent)
    existing = await db.odds_cache.find_one({"_id": "all_matches"})
    if not existing:
        await _full_refresh_and_track()


@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()
