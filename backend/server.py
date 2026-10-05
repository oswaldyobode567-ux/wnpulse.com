"""
WinPulse API — server.py (v8.6 stability)
Connecte auth.py, odds_service.py, prediction_engine.py, ai_service.py
"""
import os
import asyncio
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
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Optional, List, Dict
from urllib.parse import parse_qs

from fastapi import FastAPI, Depends, HTTPException, status, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse, JSONResponse
from pydantic import BaseModel, EmailStr, Field, StrictBool
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
    fetch_odds_api_io_scores_map, diagnose_sport_key,
    probe_odds_api_io_event, probe_odds_api_io_league_sample,
    get_odds_cache_status, ODDS_API_IO_LEAGUES,
)
from stats_service import refresh_real_stats_cache, get_real_stats_map
from prediction_engine import (
    analyze_all, analyze_match, top_predictions, build_multi_combos, find_value_bets,
    build_super_combos, build_today_combos_by_sport, build_ultra_safe_combo,
    _is_today as _is_today_match, MODEL_VERSION, SAFE_THRESHOLD, VALUE_THRESHOLD,
)
from ai_service import generate_analysis
from montante_service import MontanteService

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
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=True,
)


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
    whatsapp_number: Optional[str] = Field(default=None, max_length=40)
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
    if not re.fullmatch(r"\+[1-9]\d{7,14}", number):
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
    if payload.whatsapp_marketing_opt_in and not whatsapp_number:
        raise HTTPException(status_code=400, detail="L’autorisation WhatsApp nécessite un numéro")
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
        "whatsapp_consent_version": "winpulse-whatsapp-2026-10-05" if payload.whatsapp_marketing_opt_in else None,
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
async def get_match_analysis(match_id: str, payload: Optional[dict] = Depends(get_optional_user_payload)):
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

    ai_analysis = await generate_analysis(match, prediction)
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
MONTANTE_MIN_CONFIDENCE = 0.70
MONTANTE_MIN_ODDS = 1.20
MONTANTE_MAX_ODDS = 1.50
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
    # L'edge sert au classement des candidats mais ne doit pas être un critère
    # bloquant : l'interface Montante annonce uniquement confiance + cote.
    min_edge=float("-inf"),
    initial_bankroll=10000.0,
)


def _montante_public(doc: Optional[Dict]) -> Dict:
    if not doc:
        return {"status": "NONE", "message": "Aucune montante active."}
    out = dict(doc)
    out.pop("_id", None)
    return out


async def _montante_get() -> Optional[Dict]:
    doc = await db.montantes.find_one({"_id": MONTANTE_DOC_ID})
    return doc


async def _montante_save(state: Dict) -> Dict:
    state = dict(state)
    state["_id"] = MONTANTE_DOC_ID
    await db.montantes.replace_one({"_id": MONTANTE_DOC_ID}, state, upsert=True)
    return _montante_public(state)


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
    completed_days = len(history)
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
        if len(same_market) == 1:
            return same_market[0]

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
            if pick_dt and doc_dt and abs((doc_dt - pick_dt).total_seconds()) > 12 * 3600:
                continue
            candidates.append(doc)
            if target_pick and _montante_norm_text(doc.get("pick")) == target_pick:
                return doc
        same_market = [
            doc for doc in candidates
            if target_market and _montante_norm_text(doc.get("market")) == target_market
        ]
        if len(same_market) == 1:
            return same_market[0]

    return None


async def _montante_reconcile(state: Dict) -> Dict:
    """Met à jour automatiquement la journée depuis les résultats du Track Record."""
    if state.get("status") != "ACTIVE":
        return state
    picks = state.get("current_picks") or []
    if not picks:
        return state

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
        await _montante_save(state)
        return state

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
        if int(state.get("current_day", 1)) >= int(state.get("days", 10)):
            state["status"] = "COMPLETED"
            state["completed_at"] = datetime.now(timezone.utc).isoformat()
            state["waiting_reason"] = None
            state["current_picks"] = []
        else:
            state["current_day"] = int(state.get("current_day", 1)) + 1
            state["current_picks"] = []
            state["waiting_reason"] = "Jour gagné. Recherche des picks du prochain jour."
        await _montante_save(state)
    return state


async def _montante_prepare_next_day(state: Dict) -> Dict:
    if state.get("status") != "ACTIVE" or state.get("current_picks"):
        return state

    matches = await fetch_all_matches(db)
    real_stats_map = await get_real_stats_map(db, matches)
    predictions = analyze_all(matches, real_stats_map=real_stats_map)

    now = datetime.now(timezone.utc)
    search_until = now + timedelta(hours=72)
    candidates = []

    diagnostic = {
        "generated_at": now.isoformat(),
        "window_hours": 72,
        "matches_received": len(matches) if isinstance(matches, list) else 0,
        "predictions_generated": len(predictions) if isinstance(predictions, list) else 0,
        "within_72h": 0,
        "with_pick": 0,
        "with_valid_odds": 0,
        "odds_in_range": 0,
        "with_valid_confidence": 0,
        "confidence_at_least_70": 0,
        "eligible_before_selector": 0,
        "selected": 0,
        "criteria": {
            "min_confidence": MONTANTE_MIN_CONFIDENCE,
            "min_odds": MONTANTE_MIN_ODDS,
            "max_odds": MONTANTE_MAX_ODDS,
            "max_picks": MONTANTE_MAX_PICKS,
        },
    }

    # Le diagnostic de fraicheur permet de distinguer un vrai manque de valeur
    # d'un cache de cotes trop ancien. Une erreur de lecture du statut du cache
    # ne doit toutefois jamais bloquer la Montante.
    try:
        cache_status = await get_odds_cache_status(db)
        diagnostic["odds_cache_updated_at"] = cache_status.get("updated_at")
        diagnostic["odds_cache_hard_stale"] = bool(cache_status.get("hard_stale"))
        diagnostic["odds_cache_stale"] = bool(cache_status.get("stale"))
    except Exception:
        diagnostic["odds_cache_updated_at"] = None
        diagnostic["odds_cache_hard_stale"] = None
        diagnostic["odds_cache_stale"] = None

    for p in predictions:
        if not isinstance(p, dict):
            continue

        ct = p.get("commence_time")
        try:
            dt = datetime.fromisoformat(str(ct).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue

        # Recherche les matchs encore jouables dans les 72 prochaines heures.
        if dt < now - timedelta(minutes=15) or dt > search_until:
            continue
        diagnostic["within_72h"] += 1

        if not p.get("pick"):
            continue
        diagnostic["with_pick"] += 1

        # Les prédictions WinPulse utilisent principalement pick_odds et confidence.
        # On reproduit ici les mêmes conversions que MontanteService afin que le
        # diagnostic explique fidèlement pourquoi un candidat est accepté/rejeté.
        try:
            odds = float(p.get("pick_odds"))
            if not math.isfinite(odds):
                raise ValueError
            diagnostic["with_valid_odds"] += 1
        except (TypeError, ValueError):
            odds = None

        if odds is not None and MONTANTE_MIN_ODDS <= odds <= MONTANTE_MAX_ODDS:
            diagnostic["odds_in_range"] += 1

        try:
            confidence = float(p.get("confidence"))
            if not math.isfinite(confidence):
                raise ValueError
            if confidence > 1:
                confidence /= 100.0
            diagnostic["with_valid_confidence"] += 1
        except (TypeError, ValueError):
            confidence = None

        if confidence is not None and confidence >= MONTANTE_MIN_CONFIDENCE:
            diagnostic["confidence_at_least_70"] += 1

        if (
            odds is not None
            and confidence is not None
            and MONTANTE_MIN_ODDS <= odds <= MONTANTE_MAX_ODDS
            and confidence >= MONTANTE_MIN_CONFIDENCE
        ):
            diagnostic["eligible_before_selector"] += 1

        candidates.append(p)

    selected = montante_selector.select_daily_picks(
        candidates,
        limit=MONTANTE_MAX_PICKS,
    )

    # Lier immédiatement chaque pick Montante au Track Record. Ainsi le résultat
    # futur ne dépend plus d'une nouvelle génération du même libellé de pick.
    for item in selected:
        match_id = item.get("match_id")
        pick_text = item.get("pick")
        if not match_id or not pick_text:
            continue
        signature = _pick_signature(str(match_id), str(pick_text))
        item["history_signature"] = signature
        await db.predictions_history.update_one(
            {"signature": signature},
            {"$setOnInsert": {
                "signature": signature,
                "match_id": match_id,
                "home_team": item.get("home_team"),
                "away_team": item.get("away_team"),
                "sport_title": item.get("sport_title"),
                "sport_key": item.get("sport_key"),
                "commence_time": item.get("start_time"),
                "pick": pick_text,
                "market": item.get("market"),
                "pick_odds": item.get("odds"),
                "confidence": round(float(item.get("confidence") or 0) * 100.0, 1),
                "edge": item.get("edge"),
                "model_version": MODEL_VERSION,
                "is_combo": False,
                "official_track_eligible": False,
                "result": "pending",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source": "montante",
            }},
            upsert=True,
        )

    diagnostic["selected"] = len(selected)
    state["diagnostic"] = diagnostic

    if not selected:
        if diagnostic.get("odds_cache_hard_stale") is True:
            state["waiting_reason"] = (
                "Montante en attente : les donnees de cotes sont trop anciennes. "
                "Lance un refresh des donnees puis actualise la Montante."
            )
        else:
            state["waiting_reason"] = (
                "Aucun pick qualifie pour la Montante. "
                f"Diagnostic 72h : {diagnostic['matches_received']} matchs recus, "
                f"{diagnostic['predictions_generated']} predictions, "
                f"{diagnostic['within_72h']} dans la fenetre, "
                f"{diagnostic['with_pick']} avec pick, "
                f"{diagnostic['odds_in_range']} avec cote 1.20-1.50, "
                f"{diagnostic['confidence_at_least_70']} avec confiance >= 70%, "
                f"{diagnostic['eligible_before_selector']} respectent les deux criteres."
            )
        state["updated_at"] = datetime.now(timezone.utc).isoformat()
        await _montante_save(state)
        return state

    state["current_picks"] = selected
    state["last_settlement_check"] = {
        "day": int(state.get("current_day", 1) or 1),
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "statuses": ["PENDING" for _ in selected],
        "details": [
            {
                "slot": index + 1,
                "match_id": pick.get("match_id"),
                "history_signature": pick.get("history_signature"),
                "status": "PENDING",
            }
            for index, pick in enumerate(selected)
        ],
    }
    state["waiting_reason"] = None
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _montante_save(state)
    return state


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
            state, _ = await _montante_sync_current_results(force_provider=False)
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
    if initial_bankroll <= 0:
        raise HTTPException(status_code=400, detail="initial_bankroll doit être positif")
    state = montante_selector.create(days=days, initial_bankroll=initial_bankroll)
    state["current_picks"] = []
    state["waiting_reason"] = "Sélection des meilleurs picks du jour..."
    state = await _montante_save(state)
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


@app.get("/api/combos/today")
async def get_today_combos(payload: Optional[dict] = Depends(get_optional_user_payload)):
    try:
        matches = await fetch_all_matches(db)
        result = build_today_combos_by_sport(matches)
        is_paid = False
        if payload:
            user = await db.users.find_one({"id": payload.get("sub")})
            if user and (user.get("is_admin") or user.get("subscription", "free") != "free"):
                is_paid = True
        if not is_paid:
            for family in result.get("families", {}).values():
                for tkey, tier in family.get("tiers", {}).items():
                    if tkey == "sure":
                        legs = tier.get("legs", [])
                        for i, leg in enumerate(legs):
                            if i == 0:
                                leg["locked"] = False
                            else:
                                leg["locked"] = True
                                leg["pick"] = None
                                leg["pick_odds"] = None
                                leg["market_label"] = None
                        tier["locked"] = len(legs) > 1
                    else:
                        tier["locked"] = True
                        tier["legs"] = []
        return result
    except Exception as e:
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_matches_today": 0,
            "families": {},
            "error": str(e),
        }


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
                return round(100 / odds, 1) if odds else 0
        return 0

    expectations = {
        "btts_yes_pct": _pct_for("syn_btts", "oui") or _pct_for("btts", "oui"),
        "over_2_5_pct": _pct_for("syn_over_25", "plus de"),
        "over_1_5_pct": _pct_for("syn_over_15", "plus de"),
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

@app.get("/api/scores")
async def get_scores():
    scores = await fetch_all_scores(db)
    return scores


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
            sig = _pick_signature(p["match_id"], p["pick"])
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

    # 1X2 / Moneyline
    if market in ("h2h", "moneyline", "ml", "syn_home_win", "syn_away_win"):
        if home and (pick == home or home in pick):
            return "won" if home_score > away_score else "lost"
        if away and (pick == away or away in pick):
            return "won" if away_score > home_score else "lost"
        if any(token in pick for token in ("nul", "draw", "tie")):
            return "won" if home_score == away_score else "lost"

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
    if scheduler.running:
        scheduler.shutdown(wait=False)
