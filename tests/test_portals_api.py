"""Demo sign-in lookup and the national state-response view (separate portals). Needs the loaded database."""
from __future__ import annotations

import pytest

pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

from sentinel import config  # noqa: E402


@pytest.fixture(scope="module")
def client():
    from sqlalchemy import text

    from sentinel.api.main import app
    from sentinel.db import engine
    try:
        with engine().connect() as c:
            if not c.execute(text("SELECT to_regclass('case_file')")).scalar():
                pytest.skip("action layer not loaded")
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"database not reachable: {e}")
    return TestClient(app)


def test_signin_returns_the_right_person_for_each_level(client):
    n = client.get("/meta/signin", params={"role": "national"}).json()["person"]
    assert n["level"] == "national" and n["role_code"] == "nat_director_phc"
    for code in config.state_codes():
        s = client.get("/meta/signin", params={"role": "state", "state": code}).json()["person"]
        assert s["level"] == "state" and s["state_code"] == code and s["role_code"] == "st_dir_phc"
    lga = client.get("/state/bauchi/summary").json()["lgas"][0]["lga_id"]
    p = client.get("/meta/signin", params={"role": "lga", "state": "bauchi", "lga": lga}).json()["person"]
    assert p["level"] == "lga" and p["lga_id"] == lga and p["role_code"] == "lga_phc_coord"
    assert p["phone_display"].startswith("SIM-") and p["email"].endswith(".invalid")


def test_signin_rejects_bad_requests(client):
    assert client.get("/meta/signin", params={"role": "admin"}).status_code == 422
    assert client.get("/meta/signin", params={"role": "state"}).status_code == 422
    assert client.get("/meta/signin", params={"role": "lga", "state": "bauchi"}).status_code == 422
    assert client.get("/meta/signin", params={"role": "lga", "state": "bauchi", "lga": "99999"}).status_code == 404
    assert client.get("/meta/signin", params={"role": "state", "state": "nope"}).status_code == 404


def test_lga_cannot_sign_in_to_another_states_lga(client):
    other = client.get("/state/kano/summary").json()["lgas"][0]["lga_id"]
    assert client.get("/meta/signin", params={"role": "lga", "state": "bauchi", "lga": other}).status_code == 404


def test_national_responses_shape_and_suggestions(client):
    d = client.get("/national/responses").json()
    assert {"clock", "responses", "suggested"} <= set(d)
    assert all(r["level"] == "state" and r["rule_id"] == "R10_state_response" for r in d["responses"])
    open_states = {r["state_code"] for r in d["responses"] if r["status"] not in ("resolved", "closed_no_action", "closed_duplicate")}
    assert not open_states & {s["state_code"] for s in d["suggested"]}      # no suggestion where a request is open
    assert all(s["status"] in ("evidence_gap", "act_and_verify") for s in d["suggested"])


def test_responses_filtered_by_lga_only_returns_that_lga(client):
    lga = client.get("/state/bauchi/summary").json()["lgas"][0]["lga_id"]
    r = client.get("/responses", params={"state": "bauchi", "lga_id": lga, "limit": 200})
    assert r.status_code == 200
    cases = {x["case_id"] for x in r.json()["responses"] if x["case_id"]}
    if cases:
        rows = client.get("/state/bauchi/cases", params={"lga_id": lga, "open_only": "false", "limit": 1000}).json()["cases"]
        assert cases <= {c["case_id"] for c in rows}
