"""Hidden burden API (Workstream B): what the reporting gaps hide. MODELLED from each PHC's own reported history
and validated against the simulator's truth; every figure carries an interval or a validated lift."""
from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, HTTPException, Path, Query, Response

from ..config import settings
from .common import one, q, resolve_month, state_info

router = APIRouter(tags=["burden"])
CODE = Path(..., description="State code, e.g. bauchi")
MONTH = Query(None, pattern=r"^\d{4}-\d{2}$", description="Analysis month YYYY-MM; defaults to the latest")
NOTE = ("Modelled: expected cases at PHCs whose monthly report is missing, from each PHC's own seasonal history scaled "
        "by this month's actual-to-expected ratio among PHCs that did report. Implied stock for PHCs whose NHLMIS "
        "report is stale: last stock plus typical receipts minus consumption since. Intervals are "
        "{interval:.0%}. Validated against the simulator's truth; the reporting data are simulated.")


@lru_cache
def available() -> bool:
    return bool(one("SELECT to_regclass('mart_hidden_burden_national') IS NOT NULL AS ok")["ok"])


def _need() -> None:
    if not available():
        raise HTTPException(404, "hidden-burden marts not loaded: run `python -m sentinel burden`")


def _note() -> str:
    return NOTE.format(interval=settings()["burden"]["interval"])


@lru_cache(maxsize=64)
def _state(code: str, m: str) -> dict:
    trend = q("""SELECT analysis_month, n_report_missing, n_estimated, hidden_malaria_cases, hidden_malaria_lo, hidden_malaria_hi,
                        hidden_opd, n_stale_stock, n_stock_elevated, n_stock_watch, reported_malaria_cases
                 FROM mart_hidden_burden_state WHERE state_code = :c ORDER BY analysis_month""", c=code)
    cur = next((t for t in trend if t["analysis_month"] == m), None)
    if cur is None:
        raise HTTPException(404, f"no hidden-burden figures for {code} in {m}")
    lgas = q("""SELECT lga_id, lga, n_report_missing, hidden_malaria_cases, hidden_malaria_lo, hidden_malaria_hi, n_stale_stock,
                       n_stock_elevated, n_stock_watch
                FROM mart_hidden_burden_lga WHERE state_code = :c AND analysis_month = :m
                ORDER BY hidden_malaria_cases DESC NULLS LAST""", c=code, m=m)
    live = bool(one("SELECT to_regclass('mart_facility_live') IS NOT NULL AS ok")["ok"])
    lj = "LEFT JOIN mart_facility_live l ON l.facility_id = h.facility_id" if live else ""
    lc = ", l.live_tag" if live else ""
    missing = q(f"""SELECT h.facility_id, f.name, h.lga, h.est_confirmed_malaria, h.lo_confirmed_malaria, h.hi_confirmed_malaria,
                           h.est_opd, fm.consecutive_missing, fm.reliable_history{lc}
                    FROM mart_hidden_burden_facility h JOIN dim_facility f ON f.facility_id = h.facility_id
                    JOIN mart_facility_month fm ON fm.facility_id = h.facility_id AND fm.analysis_month = h.analysis_month
                    {lj}
                    WHERE h.state_code = :c AND h.analysis_month = :m AND h.report_missing AND h.est_confirmed_malaria IS NOT NULL
                    ORDER BY h.est_confirmed_malaria DESC LIMIT 30""", c=code, m=m)
    stock = q(f"""SELECT h.facility_id, f.name, h.lga, h.act_last_stock, h.act_amc, h.act_last_period_end, h.act_months_since,
                         h.act_implied, h.act_implied_lo, h.act_implied_hi, h.act_p_out, h.act_label, h.rdt_label{lc}
                  FROM mart_hidden_burden_facility h JOIN dim_facility f ON f.facility_id = h.facility_id
                  {lj}
                  WHERE h.state_code = :c AND h.analysis_month = :m AND h.act_label IN ('elevated_risk', 'watch')
                  ORDER BY h.act_p_out DESC LIMIT 30""", c=code, m=m)
    val = one("SELECT result FROM burden_validation WHERE state_code = :c", c=code)
    return {"state": state_info(code), "month": m, "note": _note(), "data_class": "modelled",
            "interval": settings()["burden"]["interval"], "summary": cur, "trend": trend, "lgas": lgas,
            "missing_facilities": missing, "stock_risk_facilities": stock, "validation": (val or {}).get("result")}


@router.get("/state/{code}/gaps")
def state_gaps(response: Response, code: str = CODE, month: str | None = MONTH):
    """Behind the gaps: hidden cases at PHCs with a missing report (with intervals), stock risk where NHLMIS is stale,
    LGA breakdown, the PHCs behind the numbers, and how well the method scored against truth."""
    _need()
    state_info(code)
    response.headers["Cache-Control"] = "public, max-age=300"
    return _state(code, resolve_month(month))


@router.get("/state/{code}/facility/{facility_id}/gaps")
def facility_gaps(code: str = CODE, facility_id: str = Path(...), month: str | None = MONTH):
    _need()
    m = resolve_month(month)
    r = one("""SELECT * FROM mart_hidden_burden_facility WHERE facility_id = :f AND state_code = :c AND analysis_month = :m""",
            f=facility_id, c=code, m=m)
    return {"facility_id": facility_id, "month": m, "estimate": r, "note": _note(), "interval": settings()["burden"]["interval"]}


@lru_cache(maxsize=64)
def _national(m: str) -> dict:
    trend = q("""SELECT analysis_month, n_report_missing, n_estimated, hidden_malaria_cases, hidden_malaria_lo, hidden_malaria_hi,
                        n_stale_stock, n_stock_elevated, reported_malaria_cases
                 FROM mart_hidden_burden_national ORDER BY analysis_month""")
    cur = next((t for t in trend if t["analysis_month"] == m), None)
    zones = q("""SELECT zone, n_report_missing, hidden_malaria_cases, hidden_malaria_lo, hidden_malaria_hi, n_stock_elevated
                 FROM mart_hidden_burden_zone WHERE analysis_month = :m""", m=m)
    order = {z: i for i, z in enumerate(settings()["zones"])}
    zones.sort(key=lambda z: order.get(z["zone"], 99))
    sts = q("""SELECT state_code, state, zone, n_report_missing, hidden_malaria_cases, hidden_malaria_lo, hidden_malaria_hi,
                      n_stock_elevated FROM mart_hidden_burden_state WHERE analysis_month = :m
               ORDER BY hidden_malaria_cases DESC""", m=m)
    vals = {r["state_code"]: r["result"] for r in q("SELECT state_code, result FROM burden_validation")}
    summary = {code: {"facility_wape": v["facility"]["confirmed_malaria"]["wape"],
                      "facility_coverage": v["facility"]["confirmed_malaria"]["coverage"],
                      "state_total_mape": v["state_total"]["confirmed_malaria"]["mape"],
                      "state_total_coverage": v["state_total"]["confirmed_malaria"]["coverage"],
                      "stock_lift": v["stock"]["ACT"]["lift_elevated"]} for code, v in vals.items()}
    return {"month": m, "note": _note(), "data_class": "modelled", "interval": settings()["burden"]["interval"],
            "national": cur, "trend": trend, "zones": zones, "states": sts, "validation": summary}


@router.get("/national/gaps")
def national_gaps(response: Response, month: str | None = MONTH):
    """Hidden cases across the 12 demo states: trend, zones, states and per-state validation."""
    _need()
    response.headers["Cache-Control"] = "public, max-age=300"
    return _national(resolve_month(month))


def national_kpis(m: str) -> dict:
    if not available():
        return {}
    r = one("SELECT hidden_malaria_cases, hidden_malaria_lo, hidden_malaria_hi FROM mart_hidden_burden_national WHERE analysis_month = :m", m=m)
    return r or {}


def state_rows(m: str) -> dict[str, dict]:
    if not available():
        return {}
    return {r["state_code"]: r for r in q("""SELECT state_code, hidden_malaria_cases, hidden_malaria_lo, hidden_malaria_hi
                                             FROM mart_hidden_burden_state WHERE analysis_month = :m""", m=m)}
