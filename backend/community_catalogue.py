"""Read-only Telegram editorial shortlist. Uses the website's existing snapshot."""
import hmac
import math
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException, Response

router = APIRouter()

def _number(value):
    if isinstance(value,bool):
        return None
    try:
        parsed=float(value)
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None

def win_probability(p):
    explicit=_number(p.get("estimated_win_probability"))
    if explicit is not None and 0<=explicit<=100:
        return explicit
    raw=_number(p.get("model_probability",p.get("confidence")))
    if raw is None or not 0<=raw<=100:
        return None
    if p.get("probability_basis") in (None,"","unconditional"):
        return raw
    push=_number(p.get("push_probability"))
    return raw*(1-push/100) if push is not None and 0<=push<=100 else None

def shortlist(candidates, now):
    ranked=[]
    for item in candidates:
        p=item["prediction"]; m=item["match"]
        if p.get("analysis_status")=="unavailable" or p.get("selection_available") is False:
            continue
        try:
            starts=datetime.fromisoformat(m["commence_time"].replace("Z","+00:00"))
            if not starts.tzinfo or starts<=now+timedelta(minutes=3):
                continue
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
        score=win_probability(p)
        if score is None or score<55:
            continue
        pred={k:p[k] for k in ("pick","pick_odds","market","market_key","market_label","best_bookmaker") if k in p}
        pred.update(locked=False,community_profile="strong" if score>=70 else "shared",
                    community_probability=round(score,1))
        ranked.append((score,starts,str(item["match_id"]),{**m,"id":str(item["match_id"]),"result":"pending","prediction":pred}))
    ranked.sort(key=lambda x:(-x[0],x[1],x[2]))
    strong=[row for score,_,_,row in ranked if score>=70]
    shared=[row for score,_,_,row in ranked if score<70]
    n_shared=min(len(shared),2 if len(strong)>=8 else 3)
    n_strong=min(len(strong),10-n_shared)
    return strong[:n_strong]+shared[:min(n_shared,10-n_strong)]

@router.get("/api/internal/community/shortlist", include_in_schema=False)
async def community_shortlist(response:Response, x_wnpulse_community_key:str=Header(default="")):
    expected=os.getenv("COMMUNITY_CATALOGUE_TOKEN","").strip()
    if len(expected)<32 or not hmac.compare_digest(expected.encode(),x_wnpulse_community_key.encode()):
        raise HTTPException(status_code=403,detail="Access denied")
    from server import _discovery_candidates, _get_prediction_snapshot
    now=datetime.now(timezone.utc)
    items=shortlist(_discovery_candidates(await _get_prediction_snapshot(),now),now)
    response.headers["Cache-Control"]="no-store"
    return {"scope":"community_admin","items":items}
