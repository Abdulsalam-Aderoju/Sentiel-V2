"""National action figures equal the sum of the states, and the live map metric follows the case table."""
from __future__ import annotations

import pytest

pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

from sentinel import config  # noqa: E402

COUNTS = ["open_cases", "p1_open", "overdue", "escalated", "escalated_to_state", "escalated_to_national", "total_cases",
          "resolved", "resolved_in_sla", "acknowledged", "replies_to_review"]


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


def test_national_equals_sum_of_states(client):
    d = client.get("/national/actions/summary").json()
    assert len(d["states"]) == len(config.state_codes())
    for k in COUNTS:
        assert d["kpis"][k] == sum(s[k] for s in d["states"]), k


def test_overdue_metric_matches_summary(client):
    s = {r["state_code"]: r for r in client.get("/national/actions/summary").json()["states"]}
    r = client.get("/national/states", params={"metric": "pct_cases_overdue"})
    assert r.status_code == 200 and r.headers.get("cache-control") == "no-store"
    for row in r.json()["states"]:
        assert row["value"] == pytest.approx(s[row["state_code"]]["pct_cases_overdue"], abs=1e-3)   # summary rounds to 4 dp
        assert row["overdue_cases"] == s[row["state_code"]]["overdue"]


def test_request_response_needs_national_persona(client):
    from sqlalchemy import text

    from sentinel.db import engine
    with engine().connect() as c:
        state_officer = c.execute(text("SELECT person_id FROM dim_person WHERE level = 'state' LIMIT 1")).scalar()
    r = client.post("/national/states/kano/request-response", json={"actor_person_id": state_officer})
    assert r.status_code == 403
