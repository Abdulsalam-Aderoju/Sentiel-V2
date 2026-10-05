"""WHO-aligned Data Quality Review engine (proposal §7.2, Phase 4).

Every rule returns rows for fact_quality_flags with a severity and a readable
explanation. Severity drives data confidence:
    severe -> Low confidence, major/minor -> at most Moderate.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import periods as P
from ..config import mapping, settings
from ..spine import MonthView
from .baseline import robust_z

DQR_INDICATORS = ["opd", "confirmed_malaria", "anc1", "deliveries", "penta1"]
NUMERIC_DHIS2 = ["opd", "confirmed_malaria", "anc1", "deliveries", "penta1", "penta3",
                 "sessions_planned", "sessions_conducted", "vaccine_stock_balance"]
NHLMIS_NONNEG = ["opening_balance", "quantity_received", "quantity_consumed", "physical_stock",
                 "days_out_of_stock", "adjusted_consumption", "amc"]

RULES = {
    "COMP_MISSING_REPORT": ("completeness", "Expected monthly report not received by the analysis date"),
    "COMP_MISSING_FIELDS": ("completeness", "Key data elements missing from a received report"),
    "TIME_LATE": ("timeliness", "Report submitted after the configured deadline"),
    "SIL_SILENT": ("silence", "Consecutive expected monthly reports missing"),
    "OUT_OUTLIER": ("outliers", "Value deviates strongly from the facility's own seasonal history"),
    "OUT_IMPLAUSIBLE": ("outliers", "Value implausibly far above the facility's history"),
    "CONS_REPEATED": ("consistency_over_time", "Identical non-zero value reported several months running"),
    "CONS_LEVEL_SHIFT": ("consistency_over_time", "Abrupt level shift in OPD attendance"),
    "COH_NEGATIVE": ("coherence", "Negative value in a count or stock field"),
    "COH_STOCK_IDENTITY": ("coherence", "Closing stock inconsistent with the stock-flow identity"),
    "COH_PENTA3_GT_PENTA1": ("coherence", "Penta3 exceeds Penta1 over the last 12 months"),
    "COH_OPD_ZERO": ("coherence", "OPD reported as zero while other services were reported"),
    "COH_SESSIONS": ("coherence", "More RI sessions conducted than planned"),
    "FRESH_NHLMIS_STALE": ("freshness", "Commodity report overdue: the latest report is past its cycle"),
}

FLAG_COLUMNS = ["facility_id", "rule_id", "family", "severity", "source", "field", "value", "explanation", "source_date"]
FIELD_LABEL = {d["field"]: d["name"] for d in mapping()["dhis2"]["data_elements"]}
PRODUCT_LABEL = {"ACT_AL_ADULT": "ACT adult", "ACT_AL_CHILD": "ACT child", "RDT_MAL": "malaria RDT"}


def _flags(df: pd.DataFrame, rule: str, severity, explanation, field=None, value=None,
           source="dhis2", source_date=None) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()
    n = len(df)
    col = lambda x: x if isinstance(x, (pd.Series, np.ndarray, list)) else [x] * n
    return pd.DataFrame({
        "facility_id": df["facility_id"].values, "rule_id": rule, "family": RULES[rule][0],
        "severity": col(severity), "source": source, "field": col(field), "value": col(value),
        "explanation": col(explanation), "source_date": col(source_date),
    })


def _fmt(x) -> str:
    return f"{x:,.0f}" if pd.notna(x) else "n/a"


def run(mv: MonthView, z: pd.DataFrame | None = None) -> pd.DataFrame:
    cfg = settings()["dqr"]
    sp, month = mv.spine, mv.month
    mon = month.strftime("%b %Y")
    out = []
    rec = sp[sp["report_received"]]

    out.append(_flags(sp[~sp["report_received"]], "COMP_MISSING_REPORT", "severe",
                      f"{mon} monthly report not received by {mv.as_of:%d %b %Y}"))

    keys = [d["field"] for d in mapping()["dhis2"]["data_elements"] if d.get("key")]
    inc = rec[rec["field_completeness"] < 1]
    if len(inc):
        miss = inc[keys].isna()
        pct = (miss.mean(axis=1) * 100).round(0)
        names = miss.apply(lambda r: ", ".join(FIELD_LABEL[k] for k in keys if r[k]), axis=1)
        out.append(_flags(inc, "COMP_MISSING_FIELDS", np.where(pct > cfg["missing_fields_major_pct"], "major", "minor"),
                          [f"{p:.0f}% of key fields missing: {n}" for p, n in zip(pct, names)], value=pct.values))

    late = rec[rec["late_days"] > 0]
    out.append(_flags(late, "TIME_LATE", "minor",
                      [f"{mon} report submitted {int(d)} days after the deadline" for d in late["late_days"]],
                      value=late["late_days"].values, source_date=late["submission_date"].dt.date.values))

    sil = sp[sp["silent_flag"]]
    out.append(_flags(sil, "SIL_SILENT", "severe", [
        f"{k} consecutive monthly reports missing" + (f"; facility had a reliable history ({p} of previous 12 received)" if r else "")
        for k, p, r in zip(sil["consecutive_missing"], sil["prior_reports"], sil["reliable_history"])],
        value=sil["consecutive_missing"].values))

    # Outliers and implausible values against the facility's own seasonal history.
    zz = z if z is not None else robust_z(sp, mv.history, month, DQR_INDICATORS)
    zz = zz[zz["indicator"].isin(DQR_INDICATORS) & zz["z"].notna()]
    ol = zz[zz["z"].abs() >= cfg["outlier_robust_z"]]
    out.append(_flags(ol, "OUT_OUTLIER", "minor", [
        f"{FIELD_LABEL[i]} {_fmt(v)} vs expected {_fmt(e)} (robust z {zv:+.1f})"
        for i, v, e, zv in zip(ol["indicator"], ol["value"], ol["expected"], ol["z"])],
        field=ol["indicator"].values, value=ol["z"].round(2).values))
    imp = zz[(zz["expected"] >= cfg["extreme_min_median"]) & (zz["value"] >= cfg["extreme_value_ratio"] * zz["expected"])]
    out.append(_flags(imp, "OUT_IMPLAUSIBLE", "severe", [
        f"{FIELD_LABEL[i]} {_fmt(v)} is {v / e:.1f}x the expected {_fmt(e)}; likely a data-entry error"
        for i, v, e in zip(imp["indicator"], imp["value"], imp["expected"])],
        field=imp["indicator"].values, value=imp["value"].values))

    # Consistency over time.
    run_n = cfg["repeated_value_run"]
    hist = mv.history
    prev_periods = [P.dhis2_period(month - k) for k in range(1, run_n)]
    ph = hist[hist["period"].isin(prev_periods)]
    for f in ["opd", "confirmed_malaria", "anc1"]:
        piv = ph.pivot_table(index="facility_id", columns="period", values=f, aggfunc="last").reindex(columns=prev_periods)
        cur = rec.set_index("facility_id")[f]
        same = piv.notna().all(axis=1) & piv.eq(cur.reindex(piv.index), axis=0).all(axis=1) & (cur.reindex(piv.index) >= 10)
        hit = rec[rec["facility_id"].isin(same[same].index)]
        out.append(_flags(hit, "CONS_REPEATED", "major",
                          [f"{FIELD_LABEL[f]} reported as exactly {_fmt(v)} for {run_n} months running" for v in hit[f]],
                          field=f, value=hit[f].values))

    recent = [P.dhis2_period(month - k) for k in range(0, 3)]
    prior = [P.dhis2_period(month - k) for k in range(3, 9)]
    allv = pd.concat([hist, rec])
    r3 = allv[allv["period"].isin(recent)].groupby("facility_id")["opd"].agg(["median", "count"])
    p6 = allv[allv["period"].isin(prior)].groupby("facility_id")["opd"].agg(["median", "count"])
    j = r3.join(p6, lsuffix="_r", rsuffix="_p", how="inner")
    j = j[(j["count_r"] >= 3) & (j["count_p"] >= 4) & (j["median_p"] >= 10)]
    ratio = j["median_r"] / j["median_p"]
    shift = ratio[(ratio > cfg["level_shift_ratio"]) | (ratio < 1 / cfg["level_shift_ratio"])]
    hit = rec[rec["facility_id"].isin(shift.index)]
    out.append(_flags(hit, "CONS_LEVEL_SHIFT", "minor",
                      [f"OPD level shifted {shift[f_]:.1f}x vs the previous six months" for f_ in hit["facility_id"]],
                      field="opd", value=hit["facility_id"].map(shift).round(2).values))

    # Coherence.
    neg = rec[NUMERIC_DHIS2].lt(0)
    hit = rec[neg.any(axis=1)]
    out.append(_flags(hit, "COH_NEGATIVE", "severe", [
        "Negative value reported: " + ", ".join(f"{FIELD_LABEL[c]} = {_fmt(r[c])}" for c in NUMERIC_DHIS2 if r[c] < 0)
        for _, r in hit.iterrows()]))

    p12 = [P.dhis2_period(month - k) for k in range(0, 12)]
    t12 = allv[allv["period"].isin(p12)].groupby("facility_id")[["penta1", "penta3"]].sum(min_count=6)
    bad = t12[t12["penta3"] > settings()["dqr"]["penta3_over_penta1_ratio"] * t12["penta1"]]
    hit = rec[rec["facility_id"].isin(bad.index)]
    out.append(_flags(hit, "COH_PENTA3_GT_PENTA1", "minor", [
        f"Penta3 ({_fmt(bad.at[f_, 'penta3'])}) exceeds Penta1 ({_fmt(bad.at[f_, 'penta1'])}) over 12 months"
        for f_ in hit["facility_id"]]))

    other = rec[["confirmed_malaria", "anc1", "deliveries", "penta1"]].clip(lower=0).sum(axis=1)
    hit = rec[(rec["opd"] == 0) & (other > 0)]
    out.append(_flags(hit, "COH_OPD_ZERO", "major", "OPD reported as zero while other services were reported", field="opd"))

    hit = rec[rec["sessions_conducted"] > rec["sessions_planned"]]
    out.append(_flags(hit, "COH_SESSIONS", "minor", [
        f"{_fmt(c)} RI sessions conducted vs {_fmt(p)} planned" for c, p in zip(hit["sessions_conducted"], hit["sessions_planned"])]))

    # NHLMIS coherence and freshness (on the record currently in use).
    cm = mv.commodity
    live = cm[cm["has_record"]]
    nneg = live[live[NHLMIS_NONNEG].lt(0).any(axis=1)]
    out.append(_flags(nneg, "COH_NEGATIVE", "severe", [
        f"Negative stock value in {PRODUCT_LABEL[c]} report ({_fmt(ps)} physical stock)" for c, ps in zip(nneg["commodity_code"], nneg["physical_stock"])],
        field=nneg["commodity_code"].values, source="nhlmis", source_date=nneg["nhlmis_period_end"].values))
    calc = live["opening_balance"] + live["quantity_received"] - live["quantity_consumed"] + live["losses_adjustments"]
    brk = live[(calc - live["physical_stock"]).abs() > cfg["stock_identity_tolerance"]]
    calc_b = calc[brk.index]
    out.append(_flags(brk, "COH_STOCK_IDENTITY", "severe", [
        f"{PRODUCT_LABEL[c]}: reported closing stock {_fmt(ps)} but opening + received - consumed + adjustments = {_fmt(k)}"
        for c, ps, k in zip(brk["commodity_code"], brk["physical_stock"], calc_b)],
        field=brk["commodity_code"].values, value=(brk["physical_stock"] - calc_b).values,
        source="nhlmis", source_date=brk["nhlmis_period_end"].values))

    stale = cm[cm["stale_flag"]]
    if len(stale):
        def describe(g):
            parts = []
            for _, r in g.iterrows():
                if r["has_record"]:
                    parts.append(f"{PRODUCT_LABEL[r['commodity_code']]} report {int(r['nhlmis_age_days'])} days old")
                else:
                    parts.append(f"no {PRODUCT_LABEL[r['commodity_code']]} report on record")
            return "Commodity evidence stale: " + "; ".join(parts)
        agg = stale.groupby("facility_id").apply(describe, include_groups=False).rename("explanation").reset_index()
        age = stale.groupby("facility_id")["nhlmis_age_days"].max()
        last = stale.groupby("facility_id")["nhlmis_period_end"].max()
        out.append(_flags(agg, "FRESH_NHLMIS_STALE", "severe", agg["explanation"].values, source="nhlmis",
                          value=agg["facility_id"].map(age).values, source_date=agg["facility_id"].map(last).values))

    parts = [o for o in out if len(o)]
    flags = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=FLAG_COLUMNS)
    flags["analysis_month"] = str(month)
    flags["value"] = pd.to_numeric(flags["value"], errors="coerce")
    flags["source_date"] = pd.to_datetime(flags["source_date"], errors="coerce").dt.date
    return flags
