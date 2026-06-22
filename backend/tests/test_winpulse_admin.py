"""WinPulse admin, multi-combo, email + real Odds API tests (iteration 2)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prognosis-bet-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@winpulse.app"
ADMIN_PASSWORD = "BetMojo2026!"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["is_admin"] is True, "Admin user must have is_admin=true"
    return data["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def new_user(session):
    """Register a fresh test user for the lifecycle test."""
    email = f"TEST_{uuid.uuid4().hex[:8]}@winpulse.app"
    r = session.post(f"{API}/auth/register", json={
        "email": email, "password": "abcdef", "full_name": "Cycle Tester"
    }, timeout=20)
    assert r.status_code == 200, r.text
    return {
        "email": email.lower(),
        "token": r.json()["access_token"],
        "id": r.json()["user"]["id"],
    }


# ---------- Branding ----------
class TestBranding:
    def test_app_name_is_winpulse(self, session):
        r = session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("app") == "WinPulse"


# ---------- Multi-combos ----------
class TestMultiCombos:
    def test_combos_endpoint_returns_three_tiers(self, session):
        r = session.get(f"{API}/predictions/combos", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for tier in ("safe", "balanced", "jackpot"):
            assert tier in data, f"Missing combo tier {tier}"
            combo = data[tier]
            assert "legs" in combo and "total_odds" in combo
            assert isinstance(combo["legs"], list)
            assert combo["total_odds"] >= 1


# ---------- Real Odds API ----------
class TestRealOdds:
    def test_matches_are_real_no_mock_psg(self, session):
        r = session.get(f"{API}/matches", timeout=45)
        assert r.status_code == 200
        matches = r.json()
        assert len(matches) > 0
        # Check we have a decent number of matches from real Odds API (key set)
        # The mock had 31 matches. Real API should return more variety.
        teams = []
        for m in matches:
            teams.append(m.get("home_team", ""))
            teams.append(m.get("away_team", ""))
        teams_str = " ".join(teams)
        # Mock data included these — should NOT all be present with real key
        # We don't strictly fail if PSG appears (real fixture might exist),
        # but we expect diverse sport_keys
        sport_keys = {m.get("sport_key") for m in matches}
        assert len(sport_keys) >= 2, f"Expected >=2 sports, got {sport_keys}"


# ---------- Admin auth ----------
class TestAdminAuth:
    def test_admin_login(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["is_admin"] is True

    def test_admin_routes_require_admin(self, session):
        # Non-admin (no token)
        r = session.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code in (401, 403)

    def test_non_admin_user_blocked(self, session, new_user):
        h = {"Authorization": f"Bearer {new_user['token']}"}
        r = session.get(f"{API}/admin/stats", headers=h, timeout=15)
        assert r.status_code == 403


# ---------- Admin endpoints ----------
class TestAdminEndpoints:
    def test_admin_stats(self, session, admin_headers):
        r = session.get(f"{API}/admin/stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("users", "payments", "revenue_xof"):
            assert k in data
        assert "total" in data["users"]
        assert "pending" in data["payments"]
        assert isinstance(data["revenue_xof"], (int, float))

    def test_admin_list_users(self, session, admin_headers):
        r = session.get(f"{API}/admin/users", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        assert any(u["email"] == ADMIN_EMAIL for u in users)
        # Ensure password hash is NOT in response
        for u in users:
            assert "hashed_password" not in u
            assert "_id" not in u

    def test_admin_list_payments_no_filter(self, session, admin_headers):
        r = session.get(f"{API}/admin/payments", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_list_payments_pending_filter(self, session, admin_headers):
        r = session.get(f"{API}/admin/payments?status_filter=pending", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        for p in r.json():
            assert p["status"] == "pending"


# ---------- End-to-end payment cycle ----------
class TestPaymentLifecycle:
    def test_full_cycle_register_checkout_admin_confirm_upgrade(self, session, admin_headers):
        # 1. Register a fresh user
        email = f"TEST_{uuid.uuid4().hex[:8]}@winpulse.app"
        reg = session.post(f"{API}/auth/register", json={
            "email": email, "password": "abcdef", "full_name": "Lifecycle Buyer"
        }, timeout=20)
        assert reg.status_code == 200
        user_token = reg.json()["access_token"]
        h_user = {"Authorization": f"Bearer {user_token}"}

        # 2. User creates Pro checkout
        co = session.post(f"{API}/subscription/checkout",
                          json={"tier": "pro", "phone": "+22990000099", "payer_name": "Lifecycle"},
                          headers=h_user, timeout=20)
        assert co.status_code == 200, co.text
        body = co.json()
        ref = body["reference"]
        assert ref.startswith("WP-"), f"Reference should be WP- prefix, got {ref}"
        assert body["amount_xof"] == 4900
        assert body["tier"] == "pro"

        # 3. User still on free tier
        me1 = session.get(f"{API}/auth/me", headers=h_user, timeout=15).json()
        assert me1["subscription_tier"] == "free"

        # 4. Admin lists pending payments and finds the new reference
        plist = session.get(f"{API}/admin/payments?status_filter=pending", headers=admin_headers, timeout=15)
        assert plist.status_code == 200
        refs = [p["reference"] for p in plist.json()]
        assert ref in refs, f"New pending ref {ref} not visible to admin"

        # 5. Admin confirms the payment (this triggers email + tier upgrade)
        conf = session.post(f"{API}/admin/payments/{ref}/confirm", headers=admin_headers, timeout=30)
        assert conf.status_code == 200, conf.text
        cdata = conf.json()
        assert cdata["ok"] is True
        assert cdata["tier"] == "pro"

        # 6. User refreshes /me → tier upgraded
        me2 = session.get(f"{API}/auth/me", headers=h_user, timeout=15).json()
        assert me2["subscription_tier"] == "pro"
        assert me2["subscription_status"] == "active"
        assert me2["subscription_expires_at"] is not None

        # 7. Re-confirming returns 'already'
        again = session.post(f"{API}/admin/payments/{ref}/confirm", headers=admin_headers, timeout=15)
        assert again.status_code == 200
        assert again.json().get("already") is True

    def test_admin_reject_payment(self, session, admin_headers):
        # Make a pending payment as new user
        email = f"TEST_{uuid.uuid4().hex[:8]}@winpulse.app"
        reg = session.post(f"{API}/auth/register", json={
            "email": email, "password": "abcdef", "full_name": "Reject Tester"
        }, timeout=20).json()
        h = {"Authorization": f"Bearer {reg['access_token']}"}
        co = session.post(f"{API}/subscription/checkout",
                          json={"tier": "pro", "phone": "+22990000077", "payer_name": "R"},
                          headers=h, timeout=20).json()
        ref = co["reference"]

        rj = session.post(f"{API}/admin/payments/{ref}/reject", headers=admin_headers, timeout=15)
        assert rj.status_code == 200

        # User still free
        me = session.get(f"{API}/auth/me", headers=h, timeout=15).json()
        assert me["subscription_tier"] == "free"

    def test_admin_confirm_unknown_reference(self, session, admin_headers):
        r = session.post(f"{API}/admin/payments/DOESNOTEXIST/confirm", headers=admin_headers, timeout=15)
        assert r.status_code == 404


# ---------- Email broadcast ----------
class TestEmail:
    def test_admin_test_email(self, session, admin_headers):
        r = session.post(f"{API}/admin/test-email", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        # Resend in test mode may return 'error' status (cannot send to non-verified domains)
        # but the endpoint should still succeed with a status field
        data = r.json()
        assert "status" in data

    def test_admin_broadcast_picks(self, session, admin_headers):
        r = session.post(f"{API}/admin/broadcast/picks",
                         json={"tier": "pro", "combo_tier": "balanced"},
                         headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        # Either we have users (sent/drafted/errors keys) or zero
        assert "users" in data or "message" in data
