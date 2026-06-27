"""Tests for auto-follower (Suiveur 7h) backend endpoints — iteration 4."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prognosis-bet-1.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "oswaldyobode567@gmail.com"
ADMIN_PASS = "kirikou36"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def free_user():
    import time
    email = f"TEST_freeauto_{int(time.time())}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": "Test1234!", "full_name": "TEST Free Auto"},
                      timeout=30)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    token = r.json()["access_token"]
    return {"email": email, "token": token, "headers": {"Authorization": f"Bearer {token}"}}


# ---------- 1. /auth/me must contain auto_follower_enabled ----------
class TestAuthMeField:
    def test_admin_me_has_auto_follower_enabled(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "auto_follower_enabled" in data, f"missing field, keys={list(data.keys())}"
        assert isinstance(data["auto_follower_enabled"], bool)

    def test_free_me_has_auto_follower_enabled_default_true(self, free_user):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=free_user["headers"], timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("auto_follower_enabled") is True


# ---------- 2. PATCH /me/preferences ----------
class TestPreferences:
    def test_free_user_forbidden(self, free_user):
        r = requests.patch(f"{BASE_URL}/api/me/preferences",
                          headers=free_user["headers"],
                          json={"auto_follower_enabled": False},
                          timeout=20)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_admin_can_toggle_off_and_on(self, admin_headers):
        # Off
        r = requests.patch(f"{BASE_URL}/api/me/preferences",
                          headers=admin_headers,
                          json={"auto_follower_enabled": False},
                          timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("auto_follower_enabled") is False
        # Verify via GET
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers, timeout=20).json()
        assert me["auto_follower_enabled"] is False
        # On again
        r2 = requests.patch(f"{BASE_URL}/api/me/preferences",
                           headers=admin_headers,
                           json={"auto_follower_enabled": True},
                           timeout=20)
        assert r2.status_code == 200
        assert r2.json().get("auto_follower_enabled") is True


# ---------- 3. POST /admin/auto-follower/run ----------
class TestAutoFollowerRun:
    def test_non_admin_forbidden(self, free_user):
        r = requests.post(f"{BASE_URL}/api/admin/auto-follower/run?dry_run=true",
                         headers=free_user["headers"], timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

    def test_admin_dry_run_shape(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/auto-follower/run?dry_run=true",
                         headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["date", "candidates", "sent", "skipped_already_sent", "errors"]:
            assert k in data, f"missing key {k} in {data}"
        # blast_text only present when picks are available
        if data.get("no_picks"):
            print("INFO: no_picks=True (Odds API quota possibly) — blast_text may be empty")
        else:
            assert "blast_text" in data
            assert isinstance(data["blast_text"], str)
            assert len(data["blast_text"]) > 0


# ---------- 4. GET /admin/auto-follower/preview + idempotence ----------
class TestPreviewAndIdempotence:
    def test_preview_equivalent_to_dry_run(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/auto-follower/preview",
                        headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["date", "candidates", "sent", "skipped_already_sent", "errors"]:
            assert k in data

    def test_idempotence_second_real_run_skips(self, admin_headers):
        """A real run then a second real run should increment skipped_already_sent."""
        # First REAL run (not dry_run)
        r1 = requests.post(f"{BASE_URL}/api/admin/auto-follower/run?dry_run=false",
                          headers=admin_headers, timeout=90)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        if d1.get("no_picks"):
            pytest.skip("no_picks: cannot validate idempotence today")
        # Second run same day
        r2 = requests.post(f"{BASE_URL}/api/admin/auto-follower/run?dry_run=false",
                          headers=admin_headers, timeout=90)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        # All previously-sent should now be skipped
        assert d2["skipped_already_sent"] >= d1["sent"], \
            f"expected skipped >= prior sent, got d1={d1}, d2={d2}"


# ---------- 5. GET /admin/whatsapp-blast ----------
class TestWhatsAppBlast:
    def test_non_admin_forbidden(self, free_user):
        r = requests.get(f"{BASE_URL}/api/admin/whatsapp-blast",
                        headers=free_user["headers"], timeout=30)
        assert r.status_code == 403

    def test_admin_blast_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/whatsapp-blast",
                        headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "date" in data
        assert "active_subscribers" in data
        assert isinstance(data["active_subscribers"], int)
        assert "blast_text" in data


# ---------- 6. blog_seed.py contains updated WhatsApp numbers ----------
class TestBlogSeedNumbers:
    def test_blog_seed_phone_numbers(self):
        path = "/app/backend/blog_seed.py"
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        # Old number must NOT exist anywhere
        full = "".join(lines)
        assert "01 67 30 54 39" not in full, "old WhatsApp number still present"
        # Required numbers present
        assert "+229 01 66 28 06 03" in lines[215], f"line 216 missing merchant number: {lines[215]!r}"
        assert "+33 7 67 97 17 52" in lines[229], f"line 230 missing support number: {lines[229]!r}"


# ---------- 9. Regression: landing-related public endpoints ----------
class TestRegression:
    def test_predictions_top_public(self):
        r = requests.get(f"{BASE_URL}/api/predictions/top", timeout=30)
        assert r.status_code == 200

    def test_matches_public(self):
        r = requests.get(f"{BASE_URL}/api/matches", timeout=30)
        assert r.status_code == 200
