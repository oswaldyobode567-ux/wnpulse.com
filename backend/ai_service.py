"""Service d'analyse IA — appel direct API Anthropic (sans dependance Emergent).

Usage minimal pour preserver le credit :
- Appele uniquement sur la page de detail d'un match
- Repli automatique (fallback) si ANTHROPIC_API_KEY absente ou erreur
"""
import os
import json
from datetime import datetime, timezone
from typing import Dict

import httpx

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"


def _build_prompt(match: Dict, prediction: Dict) -> str:
    odds_summary = []
    for bm in match.get("bookmakers", [])[:3]:
        for m in bm.get("markets", []):
            if m.get("key") == "h2h":
                odds_summary.append({
                    "book": bm["title"],
                    "outcomes": [(o["name"], o["price"]) for o in m["outcomes"]],
                })

    return f"""Tu es un analyste sportif expert. Analyse ce match en francais, de facon claire et factuelle.

Match: {match.get('home_team')} vs {match.get('away_team')}
Competition: {match.get('sport_title')}
Date: {match.get('commence_time')}

Cotes des bookmakers: {json.dumps(odds_summary, ensure_ascii=False)}

Probabilites consensus (vig retire): {json.dumps(prediction.get('implied_probs', {}), ensure_ascii=False)}
Pronostic algorithmique: {prediction.get('pick')} @ {prediction.get('pick_odds')}
Score de confiance: {prediction.get('confidence')}% ({prediction.get('label')})
Value edge: {prediction.get('edge')}%

Reponds en JSON STRICT avec exactement ces cles :
{{
  "verdict": "1 phrase de recommandation finale",
  "key_factors": ["3 a 4 facteurs cles courts (forme, H2H, contexte)"],
  "risk_alert": "1 phrase d'avertissement sur le risque principal",
  "alternative_bet": "1 marche alternatif interessant (Over/Under, Both Teams To Score, etc.)"
}}

Sois concis, professionnel, et factuel. Pas de baratin. Reponds uniquement le JSON, sans texte autour."""


async def generate_analysis(match: Dict, prediction: Dict) -> Dict:
    if not ANTHROPIC_API_KEY:
        return _fallback_analysis(prediction)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                ANTHROPIC_URL,
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-5-20250929",
                    "max_tokens": 600,
                    "messages": [
                        {"role": "user", "content": _build_prompt(match, prediction)}
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()

        text = "".join(
            block.get("text", "") for block in data.get("content", [])
            if block.get("type") == "text"
        ).strip()

        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        parsed = json.loads(text)
        return {
            "verdict": parsed.get("verdict", ""),
            "key_factors": parsed.get("key_factors", []),
            "risk_alert": parsed.get("risk_alert", ""),
            "alternative_bet": parsed.get("alternative_bet", ""),
            "source": "ai",
        }
    except Exception as e:
        return {**_fallback_analysis(prediction), "error": str(e)}


def _fallback_analysis(prediction: Dict) -> Dict:
    pick = prediction.get("pick") or "Indetermine"
    conf = prediction.get("confidence", 0)
    edge = prediction.get("edge", 0)
    label = prediction.get("label", "value")

    label_text = {
        "safe": "Pari relativement sur selon le marche",
        "value": "Pari a valeur interessante",
        "risky": "Pari a risque eleve",
    }.get(label, "Pari a analyser")

    return {
        "verdict": f"Le consensus marche ({prediction.get('num_books', 0)} bookmakers) place {pick} en favori avec {conf}% de confiance. {label_text}.",
        "key_factors": [
            f"Probabilite implicite consensus: {prediction.get('implied_probs', {}).get(pick, 0)}%",
            f"Cote optimale disponible: {prediction.get('pick_odds')}",
            f"Edge value vs marche: {edge:+.2f}%",
            f"Nombre de bookmakers analyses: {prediction.get('num_books', 0)}",
        ],
        "risk_alert": (
            "Edge negatif : le marche est efficient, pas de value claire."
            if edge < 0 else
            "Confiance moderee - gerer la mise selon Kelly fractionne."
            if conf < 65 else
            "Risque residuel toujours present - ne jamais miser plus que la perte acceptable."
        ),
        "alternative_bet": "Considerer un Double Chance ou un handicap asiatique pour reduire le risque.",
        "source": "engine",
    }
