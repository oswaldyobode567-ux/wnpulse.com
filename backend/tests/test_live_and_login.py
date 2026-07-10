"""Iter9 tests — login stability + throttle + /api/scores (Live section)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prognosis-bet-1.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "oswaldyobode567@gmail.com"
ADMIN_PASSWORD = "kirikou36"


@pytest.fixture
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def admin_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


# --- 1. Login fix ---
def test_login_admin_returns_200(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body and isinstance(body["access_token"], str) and len(body["access_token"]) > 20
    assert body["user"]["email"] == ADMIN_EMAIL
    assert body["user"].get("is_admin") is True


# --- 2. 5 consecutive admin logins ---
def test_five_consecutive_admin_logins(session):
    codes = []
    for _ in range(5):
        r = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        codes.append(r.status_code)
    assert codes == [200] * 5, f"got {codes}"


# --- 3. Throttle: 10x wrong => 400, 11th => 429 (admin flush first + flush after) ---
def test_wrong_password_throttle(session, admin_token):
    email = f"throttle_test_{os.urandom(3).hex()}@example.com"
    # Register the account so we hit the password-check path, not user-not-found path (same code=400, fine)
    codes = []
    for i in range(10):
        r = session.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "wrongpass"})
        codes.append(r.status_code)
    r11 = session.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "wrongpass"})
    # unlock via admin so we don't pollute
    try:
        session.post(f"{BASE_URL}/api/admin/unlock-login/{email}",
                     headers={"Authorization": f"Bearer {admin_token}"})
    except Exception:
        pass
    assert all(c == 400 for c in codes), f"expected 10x400, got {codes}"
    assert r11.status_code == 429, f"expected 429 on 11th, got {r11.status_code} {r11.text}"


# --- 4. /api/scores structure ---
def test_scores_endpoint_shape():
    r = requests.get(f"{BASE_URL}/api/scores", timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0, "expected at least one match"
    required_fields = {"id", "sport_key", "sport_title", "home_team", "away_team", "completed", "commence_time"}
    sample = data[0]
    missing = required_fields - set(sample.keys())
    assert not missing, f"missing fields in match: {missing}. keys={list(sample.keys())}"
    # scores field may be null/list
    assert "scores" in sample
    # last_update may be present
    # At least one completed match with scores should exist per problem statement
    completed_with_scores = [m for m in data if m.get("completed") and m.get("scores")]
    assert len(completed_with_scores) >= 1, "expected >=1 completed match with scores"
    # Validate structure of scores entries
    s0 = completed_with_scores[0]["scores"][0]
    assert "name" in s0 and "score" in s0


# --- 5-10. Regression: existing endpoints still respond ---
def test_regression_endpoints(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    for path in ["/api/predictions/today-combos", "/api/value-bets", "/api/scores"]:
        r = requests.get(f"{BASE_URL}{path}", headers=h, timeout=30)
        assert r.status_code in (200, 204), f"{path} returned {r.status_code}: {r.text[:200]}"
