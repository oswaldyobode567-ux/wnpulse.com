"""
Login throttle fix tests — iteration 5
Verifies:
 1. Successful logins do NOT count against throttle
 2. Failures accumulate; success clears
 3. 11th failure gets 429
 4. Throttle isolated per email
 5. Admin unlock / unlock-all
 6. Existing DB users don't crash bcrypt (400 not 500)
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback: read from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")

API = f"{BASE_URL}/api"

ADMIN_EMAIL = "oswaldyobode567@gmail.com"
ADMIN_PASS = "kirikou36"


@pytest.fixture(scope="module")
def admin_token():
    # First ensure the throttle map is clean for admin — hit unlock via a fresh login
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    if r.status_code == 429:
        pytest.skip(f"Admin already throttled: {r.text}")
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    # clean slate
    requests.post(f"{API}/admin/unlock-login-all", headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    return tok


def test_1_admin_15_successive_logins(admin_token):
    """15 successful admin logins in a row — none must return 429."""
    codes = []
    for i in range(15):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
        codes.append(r.status_code)
    assert all(c == 200 for c in codes), f"got codes: {codes}"


def test_2_fails_then_success_clears(admin_token):
    # Clear first
    requests.post(f"{API}/admin/unlock-login-all", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    # 5 wrong passwords
    for i in range(5):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WRONG_PW_xx"}, timeout=15)
        assert r.status_code == 400, f"attempt {i}: {r.status_code} {r.text}"
    # Then correct → must succeed (not 429)
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"good login after 5 fails should pass, got {r.status_code} {r.text}"
    # And now 15 more good logins should still pass (counter cleared)
    for i in range(15):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
        assert r.status_code == 200, f"login {i}: {r.status_code}"


def test_3_throttle_kicks_in_after_10_failures(admin_token):
    requests.post(f"{API}/admin/unlock-login-all", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    fake_email = "throttle_target@example.com"
    statuses = []
    for i in range(11):
        r = requests.post(f"{API}/auth/login", json={"email": fake_email, "password": "bad"}, timeout=15)
        statuses.append(r.status_code)
    # First 10 = 400, 11th = 429
    assert statuses[:10].count(400) == 10, f"first 10 should be 400: {statuses}"
    assert statuses[10] == 429, f"11th should be 429, got {statuses[10]} — full: {statuses}"
    # Cleanup
    requests.post(f"{API}/admin/unlock-login-all", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)


def test_4_throttle_isolated_per_email(admin_token):
    requests.post(f"{API}/admin/unlock-login-all", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    # 10 fails on email A
    for i in range(10):
        requests.post(f"{API}/auth/login", json={"email": "victim_a@example.com", "password": "bad"}, timeout=15)
    # 11th on A -> 429
    r = requests.post(f"{API}/auth/login", json={"email": "victim_a@example.com", "password": "bad"}, timeout=15)
    assert r.status_code == 429
    # But admin (different email) from same IP still works
    r2 = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r2.status_code == 200, f"admin login on other email should work, got {r2.status_code}"
    requests.post(f"{API}/admin/unlock-login-all", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)


def test_5_admin_unlock_single_email(admin_token):
    # Cause throttle on target email
    target = "unlock_me@example.com"
    for i in range(11):
        requests.post(f"{API}/auth/login", json={"email": target, "password": "bad"}, timeout=15)
    r = requests.post(f"{API}/auth/login", json={"email": target, "password": "bad"}, timeout=15)
    assert r.status_code == 429
    # Unlock
    ur = requests.post(f"{API}/admin/unlock-login/{target}",
                       headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    assert ur.status_code == 200
    assert ur.json().get("unlocked", 0) >= 1
    # Now the same target must respond with 400 not 429
    r2 = requests.post(f"{API}/auth/login", json={"email": target, "password": "bad"}, timeout=15)
    assert r2.status_code == 400, f"after unlock should be 400 not throttled: {r2.status_code}"


def test_6_admin_unlock_all(admin_token):
    for i in range(11):
        requests.post(f"{API}/auth/login", json={"email": "a1@e.com", "password": "x"}, timeout=15)
    for i in range(11):
        requests.post(f"{API}/auth/login", json={"email": "a2@e.com", "password": "x"}, timeout=15)
    r = requests.post(f"{API}/admin/unlock-login-all",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    assert r.status_code == 200
    assert r.json().get("cleared_keys", 0) >= 2


def test_7_existing_users_bcrypt_no_crash(admin_token):
    """Take 5 real emails from DB and probe them with a placeholder pw — must be 400 not 500."""
    ru = requests.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert ru.status_code == 200, ru.text
    users = ru.json()
    assert isinstance(users, list) and len(users) > 0
    sample = [u["email"] for u in users[:5]]
    # clear throttle first
    requests.post(f"{API}/admin/unlock-login-all",
                  headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    for em in sample:
        r = requests.post(f"{API}/auth/login", json={"email": em, "password": "placeholder_xxx"}, timeout=15)
        assert r.status_code == 400, f"bcrypt on {em} crashed: {r.status_code} {r.text}"
    # cleanup
    requests.post(f"{API}/admin/unlock-login-all",
                  headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
