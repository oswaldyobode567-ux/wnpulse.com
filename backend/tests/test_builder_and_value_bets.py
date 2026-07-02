"""Backend tests for Combo Builder + Admin value-bet endpoints + login regression (iter7)."""
import os
import time
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "oswaldyobode567@gmail.com"
ADMIN_PW = "kirikou36"


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- Combo Builder ----------

class TestBuilderMatches:
    def test_builder_matches_returns_matches_and_total(self, admin_headers):
        r = requests.get(f"{BASE}/api/builder/matches", headers=admin_headers, timeout=45)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "matches" in data and "total" in data
        assert isinstance(data["matches"], list)
        assert data["total"] >= 0
        # Save first match for reuse
        pytest.builder_matches_cache = data["matches"]

    def test_soccer_filter_only_soccer(self, admin_headers):
        r = requests.get(f"{BASE}/api/builder/matches?sport=soccer", headers=admin_headers, timeout=45)
        assert r.status_code == 200
        data = r.json()
        for m in data["matches"]:
            assert (m.get("sport_key") or "").startswith("soccer"), f"non-soccer leaked: {m.get('sport_key')}"

    def test_soccer_match_has_multiple_picks_with_synthetics(self, admin_headers):
        r = requests.get(f"{BASE}/api/builder/matches?sport=soccer", headers=admin_headers, timeout=45)
        assert r.status_code == 200
        matches = r.json()["matches"]
        if not matches:
            pytest.skip("No soccer matches available upstream")
        # find a match with picks
        picks_counts = [len(m.get("picks") or []) for m in matches]
        max_picks = max(picks_counts) if picks_counts else 0
        assert max_picks >= 5, f"Expected 5+ picks per soccer match, max seen = {max_picks}"
        # At least one match should have synthetic markets flagged
        any_synth = False
        for m in matches:
            for p in m.get("picks") or []:
                if p.get("synthetic") is True:
                    any_synth = True
                    break
            if any_synth:
                break
        assert any_synth, "No pick flagged synthetic=True on any soccer match"


class TestBuilderStats:
    def test_stats_for_soccer_match(self, admin_headers):
        r = requests.get(f"{BASE}/api/builder/matches?sport=soccer", headers=admin_headers, timeout=45)
        matches = r.json()["matches"]
        if not matches:
            pytest.skip("no soccer matches")
        mid = matches[0]["match_id"]
        s = requests.get(f"{BASE}/api/builder/stats/{mid}", headers=admin_headers, timeout=30)
        assert s.status_code == 200, s.text
        data = s.json()
        if data.get("stats") is None and "probs" not in data:
            pytest.skip("h2h probs unavailable for this match")
        assert "probs" in data
        for k in ("home_win", "draw", "away_win"):
            assert k in data["probs"]
        exp = data["expectations"]
        for k in ("btts_yes_pct", "over_2_5_pct", "over_1_5_pct", "clean_sheet_home_pct", "clean_sheet_away_pct"):
            assert k in exp
        assert "form_note" in data


class TestBuilderSaveAndList:
    combo_id = None

    def test_save_combo(self, admin_headers):
        r = requests.get(f"{BASE}/api/builder/matches", headers=admin_headers, timeout=45)
        matches = r.json()["matches"]
        if not matches:
            pytest.skip("no matches to build combo")
        m = matches[0]
        leg_pick = next((p for p in (m.get("picks") or []) if p.get("pick_odds")), None)
        if not leg_pick:
            pytest.skip("no unlocked pick available (admin should be Elite)")
        body = {
            "name": "TEST_combo_iter7",
            "legs": [{
                "match_id": m["match_id"],
                "pick": leg_pick["pick"],
                "pick_odds": leg_pick["pick_odds"],
                "home_team": m["home_team"],
                "away_team": m["away_team"],
                "market": leg_pick.get("market", "h2h"),
                "market_label": leg_pick.get("market_label", ""),
                "confidence": leg_pick.get("confidence", 60),
            }],
        }
        s = requests.post(f"{BASE}/api/builder/save", headers=admin_headers, json=body, timeout=20)
        assert s.status_code == 200, s.text
        doc = s.json()
        assert doc["num_legs"] == 1
        assert doc["total_odds"] >= 1.0
        assert doc["id"]
        TestBuilderSaveAndList.combo_id = doc["id"]

    def test_list_my_combos_contains_saved(self, admin_headers):
        if not TestBuilderSaveAndList.combo_id:
            pytest.skip("save failed earlier")
        r = requests.get(f"{BASE}/api/builder/my-combos", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json().get("combos", [])]
        assert TestBuilderSaveAndList.combo_id in ids

    def test_delete_my_combo(self, admin_headers):
        if not TestBuilderSaveAndList.combo_id:
            pytest.skip("save failed earlier")
        d = requests.delete(
            f"{BASE}/api/builder/my-combos/{TestBuilderSaveAndList.combo_id}",
            headers=admin_headers, timeout=20,
        )
        assert d.status_code == 200
        assert d.json().get("deleted", 0) >= 1

    def test_save_rejects_empty(self, admin_headers):
        r = requests.post(f"{BASE}/api/builder/save", headers=admin_headers, json={"legs": []}, timeout=15)
        assert r.status_code == 400


# ---------- Admin value-bets ----------

class TestValueBets:
    def test_preview_no_send(self, admin_headers):
        r = requests.get(f"{BASE}/api/admin/value-bets/preview", headers=admin_headers, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("detected", "candidates", "sent", "skipped_already_sent", "errors"):
            assert k in data
        # dry_run should NOT increment errors (no email send)
        # sent counter represents dry_run "would_send"
        pytest.vb_first = data

    def test_run_is_idempotent(self, admin_headers):
        # first real run
        r1 = requests.post(f"{BASE}/api/admin/value-bets/run?dry_run=false", headers=admin_headers, timeout=120)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        # second run — should skip via value_bet_batches_sent
        r2 = requests.post(f"{BASE}/api/admin/value-bets/run?dry_run=false", headers=admin_headers, timeout=120)
        assert r2.status_code == 200
        d2 = r2.json()
        if d1["detected"] == 0:
            pytest.skip("no value bets detected upstream — cannot verify idempotency")
        # Either second call sent 0 new OR skipped >= first-sent count
        assert d2["sent"] == 0 or d2["skipped_already_sent"] >= d1["sent"]

    def test_requires_admin(self):
        r = requests.get(f"{BASE}/api/admin/value-bets/preview", timeout=15)
        assert r.status_code in (401, 403)


# ---------- Regression: login stability ----------

class TestLoginRegression:
    def test_15_successive_admin_logins(self):
        codes = []
        for _ in range(15):
            r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
            codes.append(r.status_code)
            time.sleep(0.1)
        assert all(c == 200 for c in codes), f"expected all 200, got {codes}"


# ---------- prediction_engine synthetic markets ----------

class TestSyntheticEngine:
    def test_analyze_match_h2h_only_yields_5plus_markets(self):
        # import backend module directly
        import sys, os as _os
        sys.path.insert(0, "/app/backend")
        from prediction_engine import analyze_match
        fake_match = {
            "id": "TEST_synth",
            "sport_key": "soccer_epl",
            "home_team": "Alpha",
            "away_team": "Beta",
            "bookmakers": [{
                "key": "book1",
                "markets": [{
                    "key": "h2h",
                    "outcomes": [
                        {"name": "Alpha", "price": 1.9},
                        {"name": "Beta", "price": 3.8},
                        {"name": "Draw", "price": 3.4},
                    ],
                }],
            }],
        }
        pred = analyze_match(fake_match)
        assert "markets" in pred
        n = len(pred["markets"])
        assert n >= 5, f"expected 5+ markets for soccer h2h-only, got {n}: {[m.get('market_label') for m in pred['markets']]}"
        # at least one synthetic
        assert any(m.get("synthetic") for m in pred["markets"]), "no synthetic market flagged"
