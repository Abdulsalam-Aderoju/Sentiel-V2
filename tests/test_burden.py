"""Hidden burden (Workstream B): model maths on small hand-built frames, then the built marts and API."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from sentinel import config
from sentinel.burden import compute as c

MONTHS = [f"2026-{m:02d}" for m in range(1, 10)]


def _sb(n_fac=40, value_ratio=1.0, missing=("F0",), month="2026-09"):
    rows = []
    for m in MONTHS:
        for i in range(n_fac):
            fid = f"F{i}"
            exp = 100.0 + i
            val = None if (m == month and fid in missing) else exp * value_ratio * (1 + 0.1 * ((i % 5) - 2) / 2)
            for ind in ("confirmed_malaria", "opd"):
                rows.append({"facility_id": fid, "indicator": ind, "value": val, "expected": exp, "n_hist": 12, "analysis_month": m})
    return pd.DataFrame(rows)


def _fm(missing=("F0",), month="2026-09", n_fac=40):
    return pd.DataFrame([{"facility_id": f"F{i}", "analysis_month": m, "report_received": not (m == month and f"F{i}" in missing),
                          "nhlmis_stale": False} for m in MONTHS for i in range(n_fac)])


def test_hidden_only_for_missing_reports_and_interval_brackets_estimate():
    hc = c.hidden_cases(_fm(), _sb(), MONTHS)
    assert set(zip(hc["facility_id"], hc["analysis_month"])) == {("F0", "2026-09")}
    r = hc.iloc[0]
    assert r["lo_confirmed_malaria"] <= r["est_confirmed_malaria"] <= r["hi_confirmed_malaria"]


def test_nowcast_carries_a_common_shock():
    base = c.hidden_cases(_fm(), _sb(value_ratio=1.0), MONTHS).iloc[0]["est_confirmed_malaria"]
    surge = c.hidden_cases(_fm(), _sb(value_ratio=1.5), MONTHS).iloc[0]["est_confirmed_malaria"]
    assert surge == pytest.approx(1.5 * base, rel=0.02)


def test_no_estimate_with_short_history():
    sb = _sb()
    sb.loc[sb["facility_id"] == "F0", "n_hist"] = 2
    hc = c.hidden_cases(_fm(), sb, MONTHS)
    assert hc["est_confirmed_malaria"].isna().all()


def test_rollup_sums_and_interval():
    fac = pd.DataFrame({"state_code": "x", "analysis_month": "2026-09", "report_missing": [True, True, False],
                        "est_confirmed_malaria": [100.0, 50.0, np.nan], "var_confirmed_malaria": [25.0, 16.0, np.nan],
                        "est_opd": [10.0, 5.0, np.nan], "var_opd": [1.0, 1.0, np.nan], "nhlmis_stale": [False, False, True],
                        "implied_stock_label": [None, None, "elevated_risk"]})
    r = c.rollup(fac, ["state_code", "analysis_month"]).iloc[0]
    assert r["hidden_malaria_cases"] == 150 and r["n_report_missing"] == 2 and r["n_stock_elevated"] == 1
    half = c._z() * np.sqrt(41)
    assert r["hidden_malaria_lo"] == round(150 - half) and r["hidden_malaria_hi"] == round(150 + half)


def _cm(stock, amc, period_end, received=100.0, consumed=100.0):
    """Commodity history: 12 records per facility with a known net flow, then the current (stale) record."""
    rows = []
    for i in range(40):
        for k in range(6):
            pe = pd.Timestamp("2025-02-28") + pd.DateOffset(months=2 * k)
            rows.append({"facility_id": f"H{i}", "commodity_code": "ACT_AL_ADULT", "period_start": (pe - pd.DateOffset(months=1)).strftime("%Y-%m"),
                         "period_end": pe.date(), "has_record": True, "prev_amc": 50.0, "adjusted_consumption": consumed + (i % 3),
                         "quantity_received": received, "physical_stock": 100.0, "amc": 50.0, "analysis_month": "2025-12"})
    rows.append({"facility_id": "S", "commodity_code": "ACT_AL_ADULT", "period_start": "2026-05", "period_end": period_end,
                 "has_record": True, "prev_amc": amc, "adjusted_consumption": 0.0, "quantity_received": 0.0, "physical_stock": stock,
                 "amc": amc, "analysis_month": "2026-09"})
    return pd.DataFrame(rows)


def test_implied_stock_labels_follow_stock_and_time():
    fm = pd.DataFrame([{"facility_id": "S", "analysis_month": "2026-09", "report_received": True, "nhlmis_stale": True}])
    months = ["2026-09"]
    # Consumption exceeds receipts by 40 per period: empty shelf -> elevated; large stock -> no signal.
    empty = c.implied_stock(fm, _cm(0.0, 50.0, pd.Timestamp("2026-06-30").date(), received=60.0), months).iloc[0]
    full = c.implied_stock(fm, _cm(2000.0, 50.0, pd.Timestamp("2026-06-30").date(), received=60.0), months).iloc[0]
    assert empty["act_label"] == "elevated_risk" and full["act_label"] == "no_signal"
    assert empty["act_p_out"] > full["act_p_out"]
    assert full["act_implied_lo"] <= full["act_implied"] <= full["act_implied_hi"]


def test_truth_is_never_read_by_the_estimator():
    import inspect
    for fn in (c.hidden_cases, c.error_quantiles, c.implied_stock, c.net_flow_params, c.rollup):
        src = inspect.getsource(fn)
        assert ".eval" not in src and "truth_" not in src, fn.__name__
    run_src = inspect.getsource(c.run)
    assert run_src.index("validate(") > run_src.index("to_parquet(out / \"mart_hidden_burden_state.parquet\"")


# ---- built marts and API ------------------------------------------------------------------------------------
@pytest.fixture(scope="module")
def client():
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient
    from sqlalchemy import text

    from sentinel.api.main import app
    from sentinel.db import engine
    try:
        with engine().connect() as conn:
            if not conn.execute(text("SELECT to_regclass('mart_hidden_burden_national')")).scalar():
                pytest.skip("burden marts not loaded")
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"database not reachable: {e}")
    return TestClient(app)


def test_national_hidden_equals_sum_of_states(client):
    d = client.get("/national/gaps").json()
    assert len(d["states"]) == len(config.state_codes())
    assert abs(d["national"]["hidden_malaria_cases"] - sum(s["hidden_malaria_cases"] for s in d["states"])) < 1
    assert d["national"]["hidden_malaria_lo"] <= d["national"]["hidden_malaria_cases"] <= d["national"]["hidden_malaria_hi"]
    k = client.get("/national/summary").json()["kpis"]
    assert k["hidden_malaria_cases"] == d["national"]["hidden_malaria_cases"]


def test_state_gaps_shape_and_validation(client):
    for code in config.state_codes():
        d = client.get(f"/state/{code}/gaps").json()
        s = d["summary"]
        assert s["hidden_malaria_lo"] <= s["hidden_malaria_cases"] <= s["hidden_malaria_hi"]
        assert s["n_estimated"] <= s["n_report_missing"]
        v = d["validation"]["facility"]["confirmed_malaria"]
        assert 0.70 <= v["coverage"] <= 0.90, code          # an 80% interval that behaves like one
        assert v["wape"] < 0.30, code
        assert all(f["act_label"] in ("elevated_risk", "watch") for f in d["stock_risk_facilities"])


def test_validation_file_matches(client):
    vals = json.loads((config.NATIONAL_DIR / "burden_validation.json").read_text(encoding="utf-8"))
    assert set(vals) == set(config.state_codes())
    for v in vals.values():
        assert v["stock"]["ACT"]["lift_elevated"] is None or v["stock"]["ACT"]["lift_elevated"] > 1
