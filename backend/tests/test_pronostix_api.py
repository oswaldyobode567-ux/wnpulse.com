"""End-to-end backend API tests for Pronostix AI."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prognosis-bet-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Demo user credentials seeded by main agent
DEMO_EMAIL = "demo@pronostix.ai"
DEMO_PASSWORD = "demo1234"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_token(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Demo login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


# ---------- Public endpoints ----------
class TestPublic:
    def test_root(self, session):
        r = session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_sports(self, session):
        r = session.get(f"{API}/sports", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 6

    def test_plans(self, session):
        r = session.get(f"{API}/plans", timeout=15)
        assert r.status_code == 200
        plans = r.json()
        ids = [p["id"] for p in plans]
        assert "free" in ids and "pro" in ids and "elite" in ids


# ---------- Auth ----------
class TestAuth:
    def test_login_demo(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["email"] == DEMO_EMAIL

    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 400

    def test_register_new_then_me(self, session):
        email = f"TEST_{uuid.uuid4().hex[:8]}@pronostix.ai"
        r = session.post(f"{API}/auth/register", json={
            "email": email, "password": "abcdef", "full_name": "Test User"
        }, timeout=20)
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        # backend lowercases email for storage
        assert r.json()["user"]["email"] == email.lower()
        assert r.json()["user"]["subscription_tier"] == "free"

        me = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert me.status_code == 200
        assert me.json()["email"] == email.lower()

    def test_register_duplicate(self, session):
        r = session.post(f"{API}/auth/register", json={
            "email": DEMO_EMAIL, "password": "abcdef", "full_name": "Demo"
        }, timeout=15)
        assert r.status_code == 400


# ---------- Matches & predictions ----------
class TestMatches:
    def test_matches_list(self, session):
        r = session.get(f"{API}/matches", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        first = data[0]
        for key in ("id", "home_team", "away_team", "commence_time", "prediction"):
            assert key in first, f"Missing key {key}"
        pred = first["prediction"]
        for key in ("pick", "confidence", "label"):
            assert key in pred

    def test_matches_filter_by_sport(self, session):
        r = session.get(f"{API}/matches", params={"sport": "soccer"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert all("soccer" in (m.get("sport_key") or "") for m in data)

    def test_match_detail(self, session):
        r = session.get(f"{API}/matches", timeout=30)
        match_id = r.json()[0]["id"]
        r2 = session.get(f"{API}/matches/{match_id}", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["id"] == match_id

    def test_match_detail_404(self, session):
        r = session.get(f"{API}/matches/does-not-exist", timeout=15)
        assert r.status_code == 404

    def test_top_predictions(self, session):
        r = session.get(f"{API}/predictions/top", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) <= 6
        # /predictions/top returns flat prediction objects (not nested under "prediction")
        confs = [d["confidence"] for d in data]
        assert confs == sorted(confs, reverse=True)

    def test_combo(self, session):
        r = session.get(f"{API}/predictions/combo", params={"legs": 3}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "legs" in data
        assert len(data["legs"]) == 3
        assert "total_odds" in data and data["total_odds"] > 1
        assert "avg_confidence" in data

    def test_combo_clamped(self, session):
        r = session.get(f"{API}/predictions/combo", params={"legs": 99}, timeout=30)
        assert r.status_code == 200
        assert len(r.json()["legs"]) <= 5


# ---------- AI analysis ----------
class TestAIAnalysis:
    def test_analysis_requires_auth(self, session):
        r = session.get(f"{API}/matches", timeout=30)
        mid = r.json()[0]["id"]
        r2 = session.get(f"{API}/matches/{mid}/analysis", timeout=15)
        assert r2.status_code in (401, 403)

    def test_analysis_free_user(self, session, auth_headers):
        r = session.get(f"{API}/matches", timeout=30)
        mid = r.json()[0]["id"]
        r2 = session.get(f"{API}/matches/{mid}/analysis", headers=auth_headers, timeout=60)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert "prediction" in body and "analysis" in body
        for k in ("verdict", "key_factors", "risk_alert", "alternative_bet"):
            assert k in body["analysis"], f"Missing {k} in analysis"


# ---------- History ----------
class TestHistory:
    def test_history_seed_and_stats(self, session, auth_headers):
        r = session.get(f"{API}/predictions/history", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "predictions" in data and "stats" in data
        assert len(data["predictions"]) > 0
        for k in ("total", "wins", "losses", "win_rate", "avg_odds", "roi_percent"):
            assert k in data["stats"]


# ---------- Subscription ----------
class TestSubscription:
    def test_checkout_and_confirm_upgrades_tier(self, session):
        # Use a NEW user so we don't promote the demo permanently
        email = f"TEST_{uuid.uuid4().hex[:8]}@pronostix.ai"
        reg = session.post(f"{API}/auth/register", json={
            "email": email, "password": "abcdef", "full_name": "Sub Test"
        }, timeout=20)
        assert reg.status_code == 200
        token = reg.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}

        co = session.post(f"{API}/subscription/checkout",
                          json={"tier": "pro", "phone": "+22990000001", "payer_name": "Sub Test"},
                          headers=h, timeout=20)
        assert co.status_code == 200, co.text
        body = co.json()
        assert body["tier"] == "pro"
        assert body["amount_xof"] == 4900
        ref = body["reference"]
        assert ref.startswith("PRX-")
        assert "instructions" in body and "merchant_number" in body["instructions"]

        # Confirm
        cf = session.post(f"{API}/subscription/confirm/{ref}", headers=h, timeout=20)
        assert cf.status_code == 200
        assert cf.json()["tier"] == "pro"

        # /me reflects upgraded tier
        me = session.get(f"{API}/auth/me", headers=h, timeout=15)
        assert me.status_code == 200
        assert me.json()["subscription_tier"] == "pro"

    def test_checkout_invalid_tier(self, session, auth_headers):
        r = session.post(f"{API}/subscription/checkout",
                         json={"tier": "ultra", "phone": "+229", "payer_name": "x"},
                         headers=auth_headers, timeout=15)
        assert r.status_code == 400

    def test_confirm_unknown_reference(self, session, auth_headers):
        r = session.post(f"{API}/subscription/confirm/DOESNOTEXIST", headers=auth_headers, timeout=15)
        assert r.status_code == 404
