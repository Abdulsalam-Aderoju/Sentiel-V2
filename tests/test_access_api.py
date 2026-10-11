"""Access API (Workstream A) against the loaded database. Skipped when the access marts are not loaded."""
from __future__ import annotations

import json

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
            if not c.execute(text("SELECT to_regclass('mart_access_national')")).scalar():
                pytest.skip("access marts not loaded")
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"database not reachable: {e}")
    return TestClient(app)


def test_state_access_shape_and_fractions(client):
    for code in config.state_codes():
        d = client.get(f"/state/{code}/access").json()
        assert {"summary", "lgas", "hotspot_wards", "candidates", "isolated_facilities", "note"} <= set(d)
        assert d["data_class"] == "real-derived"
        s = d["summary"]
        assert 0 <= s["pct_beyond_main"] <= 1, code          # API returns fractions
        assert all(0 <= l["pct_beyond_main"] <= 1 for l in d["lgas"])
        assert all(c["walk_min"] > d["settings"]["main_threshold_minutes"] for c in d["candidates"])
        iso = [f["catchment_pop_beyond_main"] or 0 for f in d["isolated_facilities"]]
        assert iso == sorted(iso, reverse=True)               # impact order


def test_national_equals_sum_of_states(client):
    d = client.get("/national/access").json()
    sts = d["states"]
    assert len(sts) == len(config.state_codes())
    assert abs(d["national"]["pop_total"] - sum(s["pop_total"] for s in sts)) < 1
    assert abs(d["national"]["pop_beyond_main"] - sum(s["pop_beyond_main"] for s in sts)) < 1
    assert abs(d["national"]["pct_beyond_main"] - d["national"]["pop_beyond_main"] / d["national"]["pop_total"]) < 1e-6


def test_national_map_metric(client):
    r = client.get("/national/states", params={"metric": "pct_pop_beyond_threshold"})
    assert r.status_code == 200 and len(r.content) < 60_000
    rows = r.json()["states"]
    assert all(0 <= s["value"] <= 1 for s in rows)
    assert [s["metric_rank"] for s in sorted(rows, key=lambda s: -s["value"])] == list(range(1, len(rows) + 1))
    k = client.get("/national/summary").json()["kpis"]
    assert 0 < k["pct_pop_beyond_threshold"] < 1


def test_wards_layer_and_image(client):
    g = client.get("/state/bauchi/access/wards.geojson")
    assert g.status_code == 200 and g.headers["content-type"].startswith("application/geo+json")
    fc = json.loads(g.content)
    assert fc["features"] and "pct_beyond_main" in fc["features"][0]["properties"]
    img = client.get("/state/bauchi/access/travel-time.png")
    assert img.status_code == 200 and img.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_facility_access(client):
    d = client.get("/state/bauchi/access").json()
    fid = d["isolated_facilities"][0]["facility_id"]
    f = client.get(f"/state/bauchi/facility/{fid}/access").json()["facility"]
    assert f["isolated"] and f["catchment_pop"] > 0
    assert client.get("/state/bauchi/facility/NOPE/access").status_code == 404


def test_impact_sort(client):
    rows = client.get("/state/bauchi/cases", params={"sort": "impact", "limit": 50}).json()["cases"]
    p1 = [r for r in rows if r["priority"] == "P1"]
    iso = [bool(r.get("access_isolated")) for r in p1]
    assert iso == sorted(iso, reverse=True)                  # isolated first within a priority
