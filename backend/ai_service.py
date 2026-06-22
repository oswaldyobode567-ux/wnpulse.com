"""Claude Sonnet 4.5 service via Emergent LLM key.

Usage is intentionally minimal to preserve credit:
- Only called for match-detail page (on demand)
- Cached per (match_id, date)
"""
import os
import json
from datetime import datetime, timezone
from typing import Dict, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")


def _build_prompt(match: Dict, prediction: Dict) -> str:
    odds_summary = []
    for bm in match.get("bookmakers", [])[:3]:
        for m in bm.get("markets", []):
            if m.get("key") == "h2h":
                odds_summary.append({
                    "book": bm["title"],
                    "outcomes": [(o["name"], o["price"]) for o in m["outcomes"]],
                })

    return f"""Tu es un analyste sportif expert. Analyse ce match en français, de façon claire et factuelle.

Match: {match.get('home_team')} vs {match.get('away_team')}
Compétition: {match.get('sport_title')}
Date: {match.get('commence_time')}

Cotes des bookmakers: {json.dumps(odds_summary, ensure_ascii=False)}

Probabilités consensus (vig retiré): {json.dumps(prediction.get('implied_probs', {}), ensure_ascii=False)}
Pronostic algorithmique: {prediction.get('pick')} @ {prediction.get('pick_odds')}
Score de confiance: {prediction.get('confidence')}% ({prediction.get('label')})
Value edge: {prediction.get('edge')}%

Réponds en JSON STRICT avec exactement ces clés :
{{
  "verdict": "1 phrase de recommandation finale",
  "key_factors": ["3 à 4 facteurs clés courts (forme, H2H, contexte)"],
  "risk_alert": "1 phrase d'avertissement sur le risque principal",
  "alternative_bet": "1 marché alternatif intéressant (Over/Under, Both Teams To Score, etc.)"
}}

Sois concis, professionnel, et factuel. Pas de baratin."""


async def generate_analysis(match: Dict, prediction: Dict) -> Dict:
    if not EMERGENT_LLM_KEY:
        return _fallback_analysis(prediction)

    try:
        session_id = f"match-{match.get('id')}-{datetime.now(timezone.utc).date()}"
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message="Tu es un analyste sportif expert qui répond UNIQUEMENT en JSON valide.",
        ).with_model("anthropic", "claude-sonnet-4-5-20250929").with_max_tokens(600)

        msg = UserMessage(text=_build_prompt(match, prediction))
        response = await chat.send_message(msg)

        # Extract JSON
        text = response.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        data = json.loads(text)
        return {
            "verdict": data.get("verdict", ""),
            "key_factors": data.get("key_factors", []),
            "risk_alert": data.get("risk_alert", ""),
            "alternative_bet": data.get("alternative_bet", ""),
            "source": "ai",
        }
    except Exception as e:
        return {**_fallback_analysis(prediction), "error": str(e)}


def _fallback_analysis(prediction: Dict) -> Dict:
    pick = prediction.get("pick") or "Indéterminé"
    conf = prediction.get("confidence", 0)
    edge = prediction.get("edge", 0)
    label = prediction.get("label", "value")

    label_text = {
        "safe": "Pari relativement sûr selon le marché",
        "value": "Pari à valeur intéressante",
        "risky": "Pari à risque élevé",
    }.get(label, "Pari à analyser")

    return {
        "verdict": f"Le consensus marché ({prediction.get('num_books', 0)} bookmakers) place {pick} en favori avec {conf}% de confiance. {label_text}.",
        "key_factors": [
            f"Probabilité implicite consensus: {prediction.get('implied_probs', {}).get(pick, 0)}%",
            f"Cote optimale disponible: {prediction.get('pick_odds')}",
            f"Edge value vs marché: {edge:+.2f}%",
            f"Nombre de bookmakers analysés: {prediction.get('num_books', 0)}",
        ],
        "risk_alert": (
            "Edge négatif : le marché est efficient, pas de value claire."
            if edge < 0 else
            "Confiance modérée — gérer la mise selon Kelly fractionné."
            if conf < 65 else
            "Risque résiduel toujours présent — ne jamais miser plus que la perte acceptable."
        ),
        "alternative_bet": "Considérer un Double Chance ou un handicap asiatique pour réduire le risque.",
        "source": "engine",
    }
