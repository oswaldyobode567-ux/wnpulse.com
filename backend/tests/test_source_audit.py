"""Tests for /api/data/source-audit endpoint + login regression (iter8)."""
import os
import re
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://prognosis-bet-1.preview.emergentagent.com"
ADMIN_EMAIL = "oswaldyobode567@gmail.com"
ADMIN_PW = "kirikou36"

HEX16 = re.compile(r"^[0-9a-f]{16}$")


# ----- /api/data/source-audit -----

@pytest.fixture(scope="module")
def audit():
    r = requests.get(f"{BASE_URL}/api/data/source-audit", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_audit_public_no_auth_required():
    r = requests.get(f"{BASE_URL}/api/data/source-audit", timeout=30)
    assert r.status_code == 200


def test_audit_shape(audit):
    for key in ["data_source", "total_matches", "real_matches", "mock_matches",
                "sports", "odds_api_configured", "generated_at"]:
        assert key in audit, f"missing key {key}"
    assert isinstance(audit["sports"], list)


def test_audit_data_source_live(audit):
    assert audit["odds_api_configured"] is True
    assert audit["data_source"] == "live", audit
    assert audit["mock_matches"] == 0
    assert audit["real_matches"] == audit["total_matches"]
    assert audit["total_matches"] > 0


def test_audit_sports_samples(audit):
    assert len(audit["sports"]) >= 1
    for sport in audit["sports"]:
        assert "sport_key" in sport
        assert "sport_title" in sport
        assert "count" in sport and sport["count"] > 0
        assert "is_mock" in sport
        assert "sample_matches" in sport
        assert len(sport["sample_matches"]) <= 3
        for sm in sport["sample_matches"]:
            for k in ["home_team", "away_team", "commence_time", "num_bookmakers"]:
                assert k in sm


def test_audit_ids_are_real_not_16hex():
    # fetch matches directly to check ids
    r = requests.get(f"{BASE_URL}/api/matches", timeout=30)
    assert r.status_code == 200
    matches = r.json()
    if not matches:
        pytest.skip("no matches available")
    mocks = [m for m in matches if HEX16.match(m.get("id", ""))]
    assert len(mocks) == 0, f"found {len(mocks)} mock-shaped ids"


# ----- Login regression: 5 successive admin logins -----

def test_admin_login_5x():
    codes = []
    for _ in range(5):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
        codes.append(r.status_code)
    assert codes == [200] * 5, codes
