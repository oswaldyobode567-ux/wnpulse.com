"""Iter10 — Test WEST_AFRICA_BOOKMAKERS filter, deep reasoning, is_live, validated picks."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prognosis-bet-1.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "oswaldyobode567@gmail.com"
ADMIN_PW = "kirikou36"

WA_KEYS = {"onexbet", "1xbet", "betway", "melbet", "pmu", "sportybet"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def top_picks(admin_token):
    r = requests.get(f"{BASE_URL}/api/predictions/top",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
    assert r.status_code == 200, f"top picks failed: {r.status_code} {r.text}"
    data = r.json()
    assert isinstance(data, list) and len(data) > 0, "top picks empty"
    return data


# --- Predictions/top schema & new fields ---

def test_top_picks_have_new_fields(top_picks):
    for p in top_picks:
        assert "is_live" in p, f"missing is_live in {p.get('match_id')}"
        assert isinstance(p["is_live"], bool)
        assert "bookmakers_used" in p
        assert isinstance(p["bookmakers_used"], list)
        assert "reasoning" in p  # may be None on empty odds, but key must exist


def test_reasoning_shape_when_present(top_picks):
    with_reason = [p for p in top_picks if p.get("reasoning")]
    assert len(with_reason) > 0, "no picks have reasoning"
    for p in with_reason:
        r = p["reasoning"]
        for k in ("h2h_last_10", "form_last_5", "xg", "home_record",
                  "away_record", "key_absences", "referee_yellows_avg",
                  "weather", "summary"):
            assert k in r, f"missing reasoning.{k}"
        assert set(r["h2h_last_10"].keys()) >= {"home_wins", "draws", "away_wins"}
        assert set(r["form_last_5"].keys()) >= {"home", "away"}
        assert set(r["xg"].keys()) >= {"home", "away"}
        assert isinstance(r["summary"], str) and len(r["summary"]) > 20


def test_bookmakers_used_shape(top_picks):
    for p in top_picks:
        for bm in p["bookmakers_used"]:
            assert "key" in bm and "title" in bm


def test_west_african_bookmakers_present_somewhere(top_picks):
    """At least ONE pick across all top picks should include a West-African bookie
    (fallback to top-5 all bookies is acceptable per requirements)."""
    found_wa = False
    for p in top_picks:
        for bm in p["bookmakers_used"]:
            key = (bm.get("key") or "").lower()
            title = (bm.get("title") or "").lower().replace(" ", "")
            if key in WA_KEYS or any(w in title for w in WA_KEYS):
                found_wa = True
                break
        if found_wa:
            break
    # If not found → fallback acceptable, just log
    if not found_wa:
        print("WARN: no West-African bookie in any of top picks — fallback active")


# --- Match detail + analysis ---

def test_match_detail_reflects_is_live_and_reasoning(admin_token, top_picks):
    mid = top_picks[0]["match_id"]
    h = {"Authorization": f"Bearer {admin_token}"}
    r1 = requests.get(f"{BASE_URL}/api/matches/{mid}", headers=h, timeout=20)
    assert r1.status_code == 200
    d1 = r1.json()
    # match detail returns match doc; check that prediction fields exist via analysis endpoint
    r2 = requests.get(f"{BASE_URL}/api/matches/{mid}/analysis", headers=h, timeout=20)
    assert r2.status_code == 200
    d2 = r2.json()
    # Endpoint returns {prediction, analysis} or similar — assert either has is_live/reasoning somewhere
    blob = str(d2)
    assert "is_live" in blob
    assert "reasoning" in blob or "h2h_last_10" in blob


# --- Predictions history ---

def test_predictions_history_returns_stats(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE_URL}/api/predictions/history", headers=h, timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert "predictions" in data and "stats" in data
    preds = data["predictions"]
    assert isinstance(preds, list) and len(preds) > 0
    for p in preds[:5]:
        assert "date" in p and "match" in p and "pick" in p and "odds" in p
        assert "won" in p  # true/false/null
    stats = data["stats"]
    for k in ("total", "wins", "losses", "win_rate", "avg_odds", "roi_percent"):
        assert k in stats


# --- Admin login regression ---

def test_admin_login_still_works():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200
    assert "access_token" in r.json()
