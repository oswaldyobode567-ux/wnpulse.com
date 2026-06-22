"""Iteration 3 tests — tier gating + welcome email + World Cup + diversification."""
import os
import time
import collections
import sys
from pathlib import Path
import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@winpulse.app", "password": "BetMojo2026!"}
DEMO_FREE = {"email": "demo@pronostix.ai", "password": "demo1234"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def free_token():
    """Always register a fresh free user — demo@pronostix.ai may have been upgraded by previous tests."""
    import uuid as _uuid
    email = f"TEST_free_{_uuid.uuid4().hex[:8]}@winpulse.app"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "FreePass2026!", "full_name": "Free Tester"
    }, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["subscription_tier"] == "free"
    return r.json()["access_token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- /api/matches gating ----------

class TestMatchesGating:
    def test_anonymous_matches_locked(self):
        r = requests.get(f"{API}/matches", timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0, "No matches returned at all"
        # Find featured (unlocked) match
        unlocked = [m for m in data if not (m.get("prediction") or {}).get("locked")]
        locked = [m for m in data if (m.get("prediction") or {}).get("locked")]
        assert len(unlocked) == 1, f"Expected exactly 1 unlocked, got {len(unlocked)}"
        assert len(locked) == len(data) - 1
        # Verify masked content for locked
        for m in locked:
            p = m["prediction"]
            assert p.get("locked") is True
            assert p.get("pick") is None
            assert p.get("confidence") is None
            assert p.get("pick_odds") is None
            assert m.get("bookmakers") == []
        # Verify unlocked still has full pick
        p0 = unlocked[0]["prediction"]
        assert p0.get("pick") is not None
        assert isinstance(p0.get("confidence"), (int, float))
        assert p0.get("confidence") > 0

    def test_free_user_matches_locked(self, free_token):
        r = requests.get(f"{API}/matches", headers=_hdr(free_token), timeout=60)
        assert r.status_code == 200
        data = r.json()
        unlocked = [m for m in data if not (m.get("prediction") or {}).get("locked")]
        assert len(unlocked) == 1, f"Free user expected 1 unlocked, got {len(unlocked)}"

    def test_admin_matches_all_unlocked(self, admin_token):
        r = requests.get(f"{API}/matches", headers=_hdr(admin_token), timeout=60)
        assert r.status_code == 200
        data = r.json()
        for m in data:
            p = m.get("prediction") or {}
            assert not p.get("locked"), f"Admin should never see locked: {p}"
            assert p.get("pick") is not None


# ---------- /api/predictions/top gating ----------

class TestTopGating:
    def test_anonymous_top_only_first_unlocked(self):
        r = requests.get(f"{API}/predictions/top", timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        # first must be unlocked
        assert not data[0].get("locked")
        assert data[0].get("pick") is not None
        # rest must be locked
        for p in data[1:]:
            assert p.get("locked") is True
            assert p.get("pick") is None
            assert p.get("confidence") is None

    def test_pro_top_all_unlocked(self, admin_token):
        r = requests.get(f"{API}/predictions/top", headers=_hdr(admin_token), timeout=60)
        assert r.status_code == 200
        data = r.json()
        for p in data:
            assert not p.get("locked")
            assert p.get("pick") is not None


# ---------- /api/predictions/combos gating ----------

class TestCombosGating:
    def test_anonymous_combos_all_locked(self):
        r = requests.get(f"{API}/predictions/combos", timeout=60)
        assert r.status_code == 200
        data = r.json()
        for tier_key in ("safe", "balanced", "jackpot"):
            assert tier_key in data, f"Missing combo tier {tier_key}"
            combo = data[tier_key]
            assert combo.get("locked") is True
            for leg in combo.get("legs", []):
                assert leg.get("pick") is None
                assert leg.get("locked") is True

    def test_admin_combos_unlocked(self, admin_token):
        r = requests.get(f"{API}/predictions/combos", headers=_hdr(admin_token), timeout=60)
        assert r.status_code == 200
        data = r.json()
        for tier_key in ("safe", "balanced", "jackpot"):
            combo = data[tier_key]
            assert not combo.get("locked")
            for leg in combo.get("legs", []):
                assert leg.get("pick") is not None


# ---------- /api/matches/{id} gating ----------

class TestMatchDetailGating:
    def test_anonymous_match_detail_locked(self):
        list_r = requests.get(f"{API}/matches", timeout=60)
        data = list_r.json()
        # pick any locked match
        locked = [m for m in data if (m.get("prediction") or {}).get("locked")]
        assert locked
        target_id = locked[0]["id"]
        r = requests.get(f"{API}/matches/{target_id}", timeout=30)
        assert r.status_code == 200
        p = r.json()["prediction"]
        assert p.get("locked") is True
        assert p.get("pick") is None

    def test_admin_match_detail_unlocked(self, admin_token):
        list_r = requests.get(f"{API}/matches", timeout=60)
        data = list_r.json()
        target_id = data[0]["id"]
        r = requests.get(f"{API}/matches/{target_id}", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        p = r.json()["prediction"]
        assert not p.get("locked")
        assert p.get("pick") is not None


# ---------- Register + welcome email ----------

class TestRegisterWelcomeEmail:
    def test_register_fast_and_returns_token(self):
        import uuid as _uuid
        email = f"TEST_{_uuid.uuid4().hex[:10]}@winpulse.app"
        t0 = time.time()
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "TestPass2026!", "full_name": "Welcome Test"
        }, timeout=10)
        dt = time.time() - t0
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body
        assert body["user"]["email"] == email.lower()
        # Must be fast (welcome email is fire-and-forget)
        assert dt < 3.0, f"Register took {dt:.2f}s — welcome email must be non-blocking"


# ---------- Sports + diversification ----------

class TestSportsAndDiversity:
    def test_world_cup_in_supported_keys(self):
        from odds_service import REAL_SPORT_KEYS
        assert "soccer_fifa_world_cup" in REAL_SPORT_KEYS

    def test_competition_cap_at_12(self):
        r = requests.get(f"{API}/matches", timeout=60)
        assert r.status_code == 200
        data = r.json()
        counts = collections.Counter(m.get("sport_title") for m in data)
        overflow = {k: v for k, v in counts.items() if v > 12}
        assert not overflow, f"Competition cap violated: {overflow}"

    def test_world_cup_match_present(self):
        """Soft check — World Cup matches may not always be in season window."""
        r = requests.get(f"{API}/matches", timeout=60)
        data = r.json()
        wc = [m for m in data if "fifa_world_cup" in (m.get("sport_key") or "")]
        if not wc:
            pytest.skip("No World Cup matches in current 14-day horizon — acceptable")
        # If present, sport_title should reflect FIFA World Cup
        assert any("World Cup" in (m.get("sport_title") or "") or "FIFA" in (m.get("sport_title") or "") for m in wc)
