"""
WNPulse AI Analysis Service v8.3

Architecture:
1. Gemini API (if GEMINI_API_KEY is configured)
2. Anthropic API (optional fallback)
3. Local WNPulse analysis (always available)

IMPORTANT:
This module explains an existing prediction. It NEVER calculates or modifies
the official WNPulse prediction, confidence, odds or score.

CORRECTIF v8.3.1 :
- Ajout d'un cache en memoire par match (id + pick + cote), avec TTL — avant,
  chaque ouverture de fiche match declenchait un appel Gemini/Anthropic
  payant, meme si plusieurs utilisateurs consultaient le meme match dans la
  meme minute. La cle de cache inclut le pick et la cote : si le pronostic
  change lors d'un refresh, l'ancienne explication devient automatiquement
  invalide sans logique supplementaire a maintenir.
"""

import asyncio
import json
import os
import time
from typing import Any, Dict

import httpx

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get(
    "GEMINI_MODEL",
    "gemini-2.5-flash",
).strip()
GEMINI_URL = os.environ.get(
    "GEMINI_URL",
    "https://generativelanguage.googleapis.com/v1beta/models",
).rstrip("/")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = os.environ.get(
    "ANTHROPIC_MODEL",
    "claude-sonnet-4-5-20250929",
).strip()
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

REQUEST_TIMEOUT = float(os.environ.get("AI_ANALYSIS_TIMEOUT_SECONDS", "25"))
MAX_TOKENS = int(os.environ.get("AI_ANALYSIS_MAX_TOKENS", "600"))

# ─── Cache en memoire par match (evite les appels API redondants) ───────────
ANALYSIS_CACHE_TTL_SECONDS = int(os.environ.get("AI_ANALYSIS_CACHE_TTL_SECONDS", "3600"))
_analysis_cache: Dict[str, Dict[str, Any]] = {}
_analysis_cache_lock = asyncio.Lock()


def _analysis_cache_key(match: Dict, prediction: Dict) -> str:
    """
    Cle de cache basee sur l'identite du match ET le pick/cote actuels — si
    le pronostic change (nouveau refresh, nouvelle cote), la cle change
    automatiquement et l'ancienne explication en cache n'est plus reutilisee,
    sans avoir besoin d'invalider quoi que ce soit manuellement.
    """
    match_id = match.get("id") or match.get("match_id") or "unknown"
    pick = prediction.get("pick") or ""
    odds = prediction.get("pick_odds") or ""
    return f"{match_id}::{pick}::{odds}"


async def _get_cached_analysis(key: str) -> Any:
    now = time.monotonic()
    async with _analysis_cache_lock:
        entry = _analysis_cache.get(key)
        if entry and (now - entry["timestamp"]) < ANALYSIS_CACHE_TTL_SECONDS:
            return entry["result"]
    return None


async def _store_cached_analysis(key: str, result: Dict) -> None:
    async with _analysis_cache_lock:
        _analysis_cache[key] = {"timestamp": time.monotonic(), "result": result}
        # Purge légère si le cache grossit trop (site avec beaucoup de matchs
        # distincts consultes sur la duree) — evite une fuite memoire lente.
        if len(_analysis_cache) > 2000:
            oldest_keys = sorted(
                _analysis_cache.keys(),
                key=lambda k: _analysis_cache[k]["timestamp"],
            )[:500]
            for k in oldest_keys:
                _analysis_cache.pop(k, None)


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _build_prompt(match: Dict, prediction: Dict) -> str:
    odds_summary = []

    for bookmaker in match.get("bookmakers", [])[:5]:
        title = bookmaker.get("title") or bookmaker.get("key") or "Bookmaker"

        for market in bookmaker.get("markets", []):
            if market.get("key") != "h2h":
                continue

            outcomes = []
            for outcome in market.get("outcomes", []):
                name = outcome.get("name")
                price = outcome.get("price")
                if name is not None and price is not None:
                    outcomes.append({"name": name, "price": price})

            if outcomes:
                odds_summary.append({
                    "bookmaker": title,
                    "outcomes": outcomes,
                })

    return f"""
Tu es l'analyste explicatif de WNPulse.

Tu ne dois PAS recalculer ou modifier le pronostic.
Le pronostic, la cote, la confiance et le WNPulse Score fournis ci-dessous
sont définitifs et proviennent du moteur WNPulse.

Utilise UNIQUEMENT les données fournies.
N'invente aucune forme récente, blessure, H2H, classement, statistique ou
information externe.

Match : {match.get("home_team", "N/A")} vs {match.get("away_team", "N/A")}
Compétition : {match.get("sport_title", "N/A")}
Date : {match.get("commence_time", "N/A")}

Cotes :
{json.dumps(odds_summary, ensure_ascii=False)}

Probabilités consensus :
{json.dumps(prediction.get("implied_probs", {}) or {}, ensure_ascii=False)}

Pick officiel WNPulse : {prediction.get("pick", "N/A")}
Cote : {prediction.get("pick_odds", "N/A")}
Confiance : {prediction.get("confidence", 0)}%
WNPulse Score : {prediction.get("wp_score", prediction.get("effective_score", "N/A"))}
Edge : {prediction.get("edge", 0)}%
Nombre de bookmakers : {prediction.get("num_books", 0)}

Retourne UNIQUEMENT un objet JSON avec exactement :
{{
  "verdict": "une phrase courte",
  "key_factors": ["3 facteurs maximum, uniquement issus des données"],
  "risk_alert": "une phrase courte",
  "alternative_bet": "une alternative seulement si elle est justifiée par les données, sinon aucune"
}}

Ne promets jamais un gain.
""".strip()


def _extract_json(text: str) -> Dict:
    text = (text or "").strip()

    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 3:
            text = parts[1].strip()
            if text.lower().startswith("json"):
                text = text[4:].strip()

    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("JSON introuvable dans la réponse IA.")

    parsed = json.loads(text[start:end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("La réponse IA n'est pas un objet JSON.")
    return parsed


def _normalize(parsed: Dict, source: str) -> Dict:
    factors = parsed.get("key_factors", [])
    if isinstance(factors, str):
        factors = [factors]
    if not isinstance(factors, list):
        factors = []

    return {
        "verdict": str(parsed.get("verdict", "")).strip(),
        "key_factors": [
            str(x).strip() for x in factors if str(x).strip()
        ][:3],
        "risk_alert": str(parsed.get("risk_alert", "")).strip(),
        "alternative_bet": str(parsed.get("alternative_bet", "")).strip(),
        "source": source,
    }


async def _generate_gemini(prompt: str) -> Dict:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY absente")

    url = f"{GEMINI_URL}/{GEMINI_MODEL}:generateContent"
    params = {"key": GEMINI_API_KEY}

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": MAX_TOKENS,
            "responseMimeType": "application/json",
        },
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await client.post(url, params=params, json=payload)
        response.raise_for_status()
        data = response.json()

    candidates = data.get("candidates", [])
    if not candidates:
        raise ValueError("Gemini n'a retourné aucun candidat.")

    parts = (
        candidates[0]
        .get("content", {})
        .get("parts", [])
    )
    text = "".join(
        part.get("text", "")
        for part in parts
        if isinstance(part, dict)
    ).strip()

    return _normalize(_extract_json(text), "gemini")


async def _generate_anthropic(prompt: str) -> Dict:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY absente")

    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": MAX_TOKENS,
        "messages": [{"role": "user", "content": prompt}],
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await client.post(
            ANTHROPIC_URL,
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

    text = "".join(
        block.get("text", "")
        for block in data.get("content", [])
        if isinstance(block, dict) and block.get("type") == "text"
    ).strip()

    return _normalize(_extract_json(text), "anthropic")


async def generate_analysis(match: Dict, prediction: Dict) -> Dict:
    """
    Gemini -> Anthropic -> local fallback, avec cache en memoire par match
    (voir ANALYSIS_CACHE_TTL_SECONDS). Aucun niveau ne modifie prediction.
    """
    cache_key = _analysis_cache_key(match, prediction)
    cached = await _get_cached_analysis(cache_key)
    if cached is not None:
        return cached

    prompt = _build_prompt(match, prediction)
    result = None

    if GEMINI_API_KEY:
        try:
            result = await _generate_gemini(prompt)
        except Exception:
            result = None

    if result is None and ANTHROPIC_API_KEY:
        try:
            result = await _generate_anthropic(prompt)
        except Exception:
            result = None

    if result is None:
        result = _fallback_analysis(prediction)

    await _store_cached_analysis(cache_key, result)
    return result


def _fallback_analysis(prediction: Dict) -> Dict:
    pick = prediction.get("pick") or "Indéterminé"
    conf = _safe_float(prediction.get("confidence"))
    edge = _safe_float(prediction.get("edge"))
    books = prediction.get("num_books", 0)
    odds = prediction.get("pick_odds", "N/A")
    implied = prediction.get("implied_probs", {}) or {}

    probability = _safe_float(implied.get(pick))

    if conf >= 75:
        label = "signal relativement fort"
    elif conf >= 65:
        label = "signal modéré"
    else:
        label = "signal prudent"

    return {
        "verdict": (
            f"{pick} est le choix officiel WNPulse avec {conf:.0f}% de "
            f"confiance ; le moteur considère ce signal comme {label}."
        ),
        "key_factors": [
            f"Probabilité consensus : {probability:.1f}%",
            f"Cote de référence : {odds}",
            f"Edge : {edge:+.2f}% avec {books} bookmaker(s)",
        ],
        "risk_alert": (
            "Le score WNPulse est un indicateur statistique et ne garantit "
            "pas l'issue du match."
        ),
        "alternative_bet": (
            "Aucune alternative fiable avec les données disponibles."
        ),
        "source": "engine",
    }
