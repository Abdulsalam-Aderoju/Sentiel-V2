"""Unit tests: spine, every DQR rule (with boundaries), risk engines and the decision layer."""
from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from sentinel import periods as P
from sentinel.engines import decision, dqr, risk
from sentinel.engines.baseline import robust_z

from .conftest import MONTH, monthly_rows, nhlmis_rows


def run_all(mv):
    z = robust_z(mv.spine, mv.history, mv.month, dqr.DQR_INDICATORS)
    flags = dqr.run(mv, z)
    doms = risk.run(mv, z)
    fm, q = decision.decide(mv, flags, doms, None)
    return flags, doms, fm.set_index("facility_id")


def rules_for(flags, fid):
    return dict(zip(flags[flags.facility_id == fid].rule_id, flags[flags.facility_id == fid].severity))


# ---- Calendar ---------------------------------------------------------------------
def test_calendar():
    assert P.as_of_date(MONTH) == date(2026, 10, 30)
    assert P.dhis2_deadline(MONTH) == date(2026, 10, 15)
    assert P.bimonthly_start(pd.Period("2026-08", "M")) == pd.Period("2026-07", "M")
    # Jul-Aug report due 15 Sep: on 30 Oct it is the latest due period.
    assert P.latest_due_bimonthly(date(2026, 10, 30)) == pd.Period("2026-07", "M")
    assert P.latest_due_bimonthly(date(2026, 9, 14)) == pd.Period("2026-05", "M")


# ---- Spine: point-in-time correctness ---------------------------------------------
def test_report_after_as_of_is_invisible(view):
    m = monthly_rows("A")
    m.loc[m.period == "202609", "submission_date"] = pd.Timestamp("2026-11-05")
    mv, _ = view([m], [nhlmis_rows("A")])
    row = mv.spine.set_index("facility_id").loc["A"]
    assert not row.report_received
    assert row.consecutive_missing == 1


def test_late_report_visible_with_late_days(view):
    mv, _ = view([monthly_rows("A", late={0})], [nhlmis_rows("A")])
    row = mv.spine.set_index("facility_id").loc["A"]
    assert row.report_received and row.late_days == 10 and not row.on_time_flag


def test_reliable_history_and_silence(view):
    mv, _ = view([monthly_rows("A", missing={0, 1}), monthly_rows("B", missing={0, 1, 4, 5, 6})],
                 [nhlmis_rows("A"), nhlmis_rows("B")])
    sp = mv.spine.set_index("facility_id")
    assert sp.loc["A", "silent_flag"] and sp.loc["A", "reliable_history"]
    assert sp.loc["B", "silent_flag"] and not sp.loc["B", "reliable_history"]


def test_nhlmis_fresh_vs_stale(view):
    mv, _ = view([monthly_rows("A"), monthly_rows("B")],
                 [nhlmis_rows("A"), nhlmis_rows("B", skip_latest=True)])
    cm = mv.commodity.groupby("facility_id")["stale_flag"].any()
    assert not cm["A"] and cm["B"]
    age = mv.commodity.set_index("facility_id")["nhlmis_age_days"]
    assert (age.loc["A"] == 60).all()        # Jul-Aug report, 31 Aug -> 30 Oct


# ---- DQR rules --------------------------------------------------------------------
def test_missing_report_and_silence(view):
    mv, _ = view([monthly_rows("A", missing={0}), monthly_rows("B", missing={0, 1})], [nhlmis_rows("A"), nhlmis_rows("B")])
    f, _, fm = run_all(mv)
    assert rules_for(f, "A")["COMP_MISSING_REPORT"] == "severe" and "SIL_SILENT" not in rules_for(f, "A")
    assert rules_for(f, "B")["SIL_SILENT"] == "severe"
    assert fm.loc["A", "data_confidence"] == "LOW"


@pytest.mark.parametrize("n_missing,severity", [(2, "minor"), (3, "major")])  # 2/11 = 18% (minor), 3/11 = 27% (major)
def test_missing_fields_boundary(view, n_missing, severity):
    fields = ["anc1", "deliveries", "penta3"][:n_missing]
    mv, _ = view([monthly_rows("A", overrides={0: {f: None for f in fields}})], [nhlmis_rows("A")])
    f, _, fm = run_all(mv)
    assert rules_for(f, "A")["COMP_MISSING_FIELDS"] == severity
    assert fm.loc["A", "data_confidence"] == "MODERATE"


def test_late_is_minor(view):
    mv, _ = view([monthly_rows("A", late={0})], [nhlmis_rows("A")])
    f, _, fm = run_all(mv)
    assert rules_for(f, "A")["TIME_LATE"] == "minor" and fm.loc["A", "data_confidence"] == "MODERATE"


def test_outlier_and_implausible(view):
    # Baseline ~400, MAD floored at 10% of median (40): z = 0.6745 x (x - 400) / 40.
    mv, _ = view([monthly_rows("A", overrides={0: {"opd": 650}}), monthly_rows("B", overrides={0: {"opd": 4000}}),
                  monthly_rows("C", overrides={0: {"opd": 600}})],
                 [nhlmis_rows("A"), nhlmis_rows("B"), nhlmis_rows("C")])
    f, _, _ = run_all(mv)
    assert "OUT_OUTLIER" in rules_for(f, "A") and "OUT_IMPLAUSIBLE" not in rules_for(f, "A")   # z ~ 4.2
    assert rules_for(f, "B")["OUT_IMPLAUSIBLE"] == "severe"
    assert "OUT_OUTLIER" not in rules_for(f, "C")                                              # z ~ 3.4 < 3.5


def test_repeated_values_needs_full_run(view):
    rep3 = {k: {"opd": 512} for k in range(3)}
    rep2 = {k: {"opd": 512} for k in range(2)}
    mv, _ = view([monthly_rows("A", overrides=rep3), monthly_rows("B", overrides=rep2)], [nhlmis_rows("A"), nhlmis_rows("B")])
    f, _, _ = run_all(mv)
    assert rules_for(f, "A")["CONS_REPEATED"] == "major"
    assert "CONS_REPEATED" not in rules_for(f, "B")


def test_level_shift(view):
    mv, _ = view([monthly_rows("A", overrides={k: {"opd": 1200 + k} for k in range(3)})], [nhlmis_rows("A")])
    f, _, _ = run_all(mv)
    assert "CONS_LEVEL_SHIFT" in rules_for(f, "A")


def test_coherence_rules(view):
    mv, _ = view([monthly_rows("NEG", overrides={0: {"anc1": -5}}),
                  monthly_rows("OPD0", overrides={0: {"opd": 0}}),
                  monthly_rows("SES", overrides={0: {"sessions_conducted": 6}}),
                  monthly_rows("P3", overrides={k: {"penta3": 25} for k in range(12)}),
                  monthly_rows("ID")],
                 [nhlmis_rows(x) for x in ("NEG", "OPD0", "SES", "P3")] + [nhlmis_rows("ID", identity_ok=False)])
    f, _, fm = run_all(mv)
    assert rules_for(f, "NEG")["COH_NEGATIVE"] == "severe"
    assert rules_for(f, "OPD0")["COH_OPD_ZERO"] == "major"
    assert rules_for(f, "SES")["COH_SESSIONS"] == "minor"
    assert rules_for(f, "P3")["COH_PENTA3_GT_PENTA1"] == "minor"
    assert rules_for(f, "ID")["COH_STOCK_IDENTITY"] == "severe"
    assert fm.loc["ID", "data_confidence"] == "LOW"


def test_stale_nhlmis_rule(view):
    mv, _ = view([monthly_rows("A")], [nhlmis_rows("A", skip_latest=True)])
    f, _, fm = run_all(mv)
    assert rules_for(f, "A")["FRESH_NHLMIS_STALE"] == "severe"
    assert fm.loc["A", "data_confidence"] == "LOW"


def test_clean_facility_is_high_confidence(view):
    mv, _ = view([monthly_rows("A")], [nhlmis_rows("A")])
    f, _, fm = run_all(mv)
    assert rules_for(f, "A") == {}
    assert fm.loc["A", "data_confidence"] == "HIGH" and fm.loc["A", "queue"] == "MONITOR"


# ---- Risk engines -----------------------------------------------------------------
def commodity_sev(view, **kw):
    mv, _ = view([monthly_rows("A")], [nhlmis_rows("A", **kw)])
    _, d, _ = run_all(mv)
    return d[(d.facility_id == "A") & (d.domain == "malaria_commodity")].iloc[0]


@pytest.mark.parametrize("physical,days_out,expected", [
    (0, 12, "CRITICAL"),      # current stockout
    (90, 0, "HIGH"),          # 0.9 MoS < emergency order point (1)
    (100, 0, "WATCH"),        # 1.0 MoS: at EOP, below the 2-month minimum
    (150, 0, "WATCH"),
    (150, 5, "CRITICAL"),     # stockout days and below minimum
    (200, 0, "NORMAL"),       # exactly at minimum
    (350, 4, "WATCH"),        # recovered stockout
])
def test_commodity_severity(view, physical, days_out, expected):
    assert commodity_sev(view, physical=physical, days_out=days_out).severity == expected


def test_commodity_zero_consumption_is_not_a_risk(view):
    r = commodity_sev(view, physical=200, amc=0)
    assert r.severity == "NORMAL"


def test_stale_commodity_cannot_be_credible_or_safe(view):
    mv, _ = view([monthly_rows("A")], [nhlmis_rows("A", skip_latest=True)])
    _, d, fm = run_all(mv)
    c = d[(d.facility_id == "A") & (d.domain == "malaria_commodity")].iloc[0]
    assert not c.credible
    assert fm.loc["A", "queue"] == "DATA_VERIFICATION" and fm.loc["A", "tag"] == "DO NOT ASSUME SAFE"


@pytest.mark.parametrize("over,expected", [
    ({"vaccine_stockout_flag": 1, "refrigerator_functional": 0}, "CRITICAL"),
    ({"vaccine_stockout_flag": 1}, "HIGH"),
    ({"refrigerator_functional": 0}, "HIGH"),
    ({"sessions_conducted": 2}, "WATCH"),      # 50% < 75%
    ({"sessions_conducted": 3}, "NORMAL"),     # 75% is not below 75%
])
def test_vaccine_severity(view, over, expected):
    mv, _ = view([monthly_rows("A", overrides={0: over})], [nhlmis_rows("A")])
    _, d, _ = run_all(mv)
    assert d[(d.facility_id == "A") & (d.domain == "vaccine_cold_chain")].iloc[0].severity == expected


def test_pressure_alone_is_capped(view):
    surge = {0: {"confirmed_malaria": 220, "opd": 520}}
    mv, _ = view([monthly_rows("A", overrides=surge), monthly_rows("B", overrides=surge)],
                 [nhlmis_rows("A"), nhlmis_rows("B", physical=150)])
    _, d, fm = run_all(mv)
    p = d[(d.facility_id == "A") & (d.domain == "service_pressure")].iloc[0]
    assert p.severity == "HIGH"
    assert fm.loc["A", "operational_risk"] == "WATCH" and fm.loc["A", "pressure_capped"]
    # Corroborated by a commodity Watch: pressure HIGH stands.
    assert fm.loc["B", "operational_risk"] == "HIGH" and fm.loc["B", "queue"] == "RESOURCE_ACTION"


# ---- Decision layer: the four quadrants -------------------------------------------
def test_quadrants(view):
    mv, _ = view([monthly_rows("ACT"), monthly_rows("VTA", missing={0}), monthly_rows("VER", missing={0}), monthly_rows("MON")],
                 [nhlmis_rows("ACT", physical=0, days_out=10), nhlmis_rows("VTA", physical=0, days_out=10),
                  nhlmis_rows("VER"), nhlmis_rows("MON")])
    _, _, fm = run_all(mv)
    assert (fm.loc["ACT", "queue"], fm.loc["ACT", "tag"]) == ("RESOURCE_ACTION", "ACT NOW")
    assert (fm.loc["VTA", "queue"], fm.loc["VTA", "tag"]) == ("RESOURCE_ACTION", "VERIFY THEN ACT")
    assert (fm.loc["VER", "queue"], fm.loc["VER", "tag"]) == ("DATA_VERIFICATION", "DO NOT ASSUME SAFE")
    assert (fm.loc["MON", "queue"], fm.loc["MON", "tag"]) == ("MONITOR", "MONITOR")
    assert "resupply" in fm.loc["ACT", "next_action"].lower()
    assert "confirm" in fm.loc["VTA", "next_action"].lower()


def test_reliable_silence_ranks_first_in_verification(view):
    mv, _ = view([monthly_rows("REL", missing={0, 1}), monthly_rows("UNREL", missing={0, 1, 4, 5, 6, 8}),
                  monthly_rows("ONE", missing={0})],
                 [nhlmis_rows(x) for x in ("REL", "UNREL", "ONE")])
    _, _, fm = run_all(mv)
    v = fm[fm.queue == "DATA_VERIFICATION"].sort_values("rank_state")
    assert v.index[0] == "REL"
