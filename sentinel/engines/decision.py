"""Risk x Confidence decision layer (proposal §4.2, §7.6-7.8, Appendix B; Phase 6).

    risk HIGH/CRITICAL              -> RESOURCE_ACTION, tag ACT NOW or VERIFY THEN ACT (Low confidence)
    risk NORMAL/WATCH, Low conf.    -> DATA_VERIFICATION, tag DO NOT ASSUME SAFE
    otherwise                       -> MONITOR
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from ..config import settings
from ..spine import MonthView
from .dqr import PRODUCT_LABEL
from .risk import SEV, SEV_NAME

SEVERITY_ORDER = {"severe": 2, "major": 1, "minor": 0}
DOMAIN_LABEL = {"malaria_commodity": "Malaria commodities", "vaccine_cold_chain": "Vaccine & cold chain",
                "service_pressure": "Service pressure"}


def classify_confidence(spine: pd.DataFrame, flags: pd.DataFrame) -> pd.DataFrame:
    """High / Moderate / Low with plain-language reasons (proposal §7.7)."""
    f = flags.assign(o=flags["severity"].map(SEVERITY_ORDER)).sort_values("o", ascending=False)
    agg = f.groupby("facility_id").agg(
        worst=("o", "max"), n_severe=("o", lambda x: int((x == 2).sum())),
        reasons=("explanation", list), reason_severity=("severity", list))
    c = spine[["facility_id"]].merge(agg, left_on="facility_id", right_index=True, how="left")
    c["data_confidence"] = np.select([c["worst"] == 2, c["worst"] >= 0], ["LOW", "MODERATE"], default="HIGH")
    c["n_severe"] = c["n_severe"].fillna(0).astype(int)
    c["confidence_reasons"] = [r if isinstance(r, list) else [] for r in c["reasons"]]
    c["confidence_reason_severity"] = [r if isinstance(r, list) else [] for r in c["reason_severity"]]
    return c[["facility_id", "data_confidence", "n_severe", "confidence_reasons", "confidence_reason_severity"]]


def operational_risk(domains: pd.DataFrame) -> pd.DataFrame:
    """Worst credible domain (§7.6). Pressure alone is capped at WATCH when
    service_pressure.requires_corroboration is set: it is a proxy, not a shortage."""
    cap = settings()["service_pressure"]["requires_corroboration"]
    d = domains.copy()
    d["sev_n"] = d["severity"].map(SEV)
    d["usable"] = d["credible"] & ~d["unobserved"]
    other_watch = (d[d["usable"] & (d["domain"] != "service_pressure") & (d["sev_n"] >= SEV["WATCH"])]
                   .groupby("facility_id").size())
    is_p = (d["domain"] == "service_pressure") & (d["sev_n"] >= SEV["HIGH"])
    capped = is_p & cap & (d["facility_id"].map(other_watch).fillna(0) == 0)
    d["eff_n"] = np.where(capped, SEV["WATCH"], d["sev_n"])
    d["capped"] = capped

    u = d[d["usable"]].sort_values(["eff_n", "signal"], ascending=False)
    top = u.drop_duplicates("facility_id").set_index("facility_id")
    corr = u[u["eff_n"] >= SEV["WATCH"]].groupby("facility_id").size()
    stale = d[~d["credible"] & ~d["unobserved"]].groupby("facility_id")["sev_n"].max()

    fac = pd.Index(d["facility_id"].unique(), name="facility_id")
    r = pd.DataFrame(index=fac)
    r["risk_n"] = top["eff_n"].reindex(fac).fillna(0).astype(int)
    r["operational_risk"] = r["risk_n"].map(SEV_NAME)
    r["risk_observed"] = fac.isin(top.index)
    r["top_domain"] = top["domain"].reindex(fac)
    r["signal"] = top["signal"].reindex(fac).fillna(0.0)
    r["corroborating_domains"] = corr.reindex(fac).fillna(0).astype(int)
    r["stale_last_known_n"] = stale.reindex(fac).fillna(-1).astype(int)
    r["pressure_capped"] = d[d["domain"] == "service_pressure"].set_index("facility_id")["capped"].reindex(fac).fillna(False)

    wide = d.pivot(index="facility_id", columns="domain", values="severity")
    for dom in DOMAIN_LABEL:
        r[f"sev_{dom}"] = wide[dom].reindex(fac) if dom in wide else None
        cred = d[d["domain"] == dom].set_index("facility_id")
        r[f"credible_{dom}"] = cred["credible"].reindex(fac) & ~cred["unobserved"].reindex(fac)
    return r.reset_index()


def _next_action(row, dom_ev: dict) -> str:
    q, tag, top = row["queue"], row["tag"], row["top_domain"]
    if q == "RESOURCE_ACTION":
        verify = tag == "VERIFY THEN ACT"
        if top == "malaria_commodity":
            items = [e["commodity"] for e in dom_ev.get("malaria_commodity", []) if e.get("commodity")
                     and ((e.get("mos") is not None and e["mos"] < 2) or e.get("stockout_days", 0) > 0)]
            names = ", ".join(PRODUCT_LABEL[c] for c in dict.fromkeys(items)) or "malaria commodities"
            return (f"Call facility within 48h to confirm {names} balance; prepare resupply in parallel" if verify
                    else f"Prioritise resupply of {names} in the next LGA distribution")
        if top == "vaccine_cold_chain":
            texts = " ".join(e["text"] for e in dom_ev.get("vaccine_cold_chain", []))
            if "refrigerator" in texts:
                return ("Confirm refrigerator status with facility; arrange cold chain inspection" if verify
                        else "Inspect cold chain and arrange refrigerator repair; move vaccines to nearest functional cold store")
            return ("Confirm vaccine stock with facility, then resupply from LGA cold store" if verify
                    else "Resupply vaccines from LGA cold store before next session")
        return ("Confirm service volumes with facility; review commodity balance against demand" if verify
                else "Review commodity balance against the demand surge; consider early resupply")
    if q == "DATA_VERIFICATION":
        if row["silent_flag"]:
            return "Contact facility and LGA M&E officer to recover missing monthly reports"
        if not row["report_received"]:
            return "Follow up the missing monthly report with the LGA M&E officer"
        if row["n_stale_commodities"] > 0:
            return "Request the current NHLMIS stock report from the facility"
        return "Data quality review with LGA M&E: correct the failed checks before relying on these figures"
    return "Monitor at the next reporting cycle"


def decide(mv: MonthView, flags: pd.DataFrame, domains: pd.DataFrame, dim: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    sp = mv.spine
    conf = classify_confidence(sp, flags)
    risk = operational_risk(domains)
    stale_n = mv.commodity.groupby("facility_id")["stale_flag"].sum().rename("n_stale_commodities")
    max_age = mv.commodity.groupby("facility_id")["nhlmis_age_days"].max().rename("nhlmis_age_days")

    m = (sp[["facility_id", "lga_id", "lga", "analysis_month", "as_of", "report_received", "submission_date",
             "late_days", "on_time_flag", "field_completeness", "consecutive_missing", "silent_flag",
             "reliable_history", "prior_reports", "days_since_deadline_missed"]]
         .merge(conf, on="facility_id").merge(risk, on="facility_id")
         .merge(stale_n, left_on="facility_id", right_index=True, how="left")
         .merge(max_age, left_on="facility_id", right_index=True, how="left"))
    m["n_stale_commodities"] = m["n_stale_commodities"].fillna(0).astype(int)
    m["nhlmis_stale"] = m["n_stale_commodities"] > 0
    m["missing_sources"] = (~m["report_received"]).astype(int) + m["n_stale_commodities"]

    high = m["risk_n"] >= SEV["HIGH"]
    low = m["data_confidence"] == "LOW"
    m["queue"] = np.select([high, low], ["RESOURCE_ACTION", "DATA_VERIFICATION"], default="MONITOR")
    m["tag"] = np.select([high & low, high, low], ["VERIFY THEN ACT", "ACT NOW", "DO NOT ASSUME SAFE"], default="MONITOR")
    m["quadrant"] = np.select([high & ~low, high & low, ~high & low], ["act_now", "verify_then_act", "verify"], default="monitor")

    # ---- Ranking (§7.8) ----------------------------------------------------------
    overdue = np.maximum(m["days_since_deadline_missed"].fillna(0),
                         np.where(m["nhlmis_stale"], m["nhlmis_age_days"].fillna(999) - 61, 0))
    m["overdue_days"] = overdue.astype(int)
    m["reliable_silence"] = m["silent_flag"] & m["reliable_history"]
    keys = {
        "RESOURCE_ACTION": (["risk_n", "corroborating_domains", "signal"], [False, False, False]),
        "DATA_VERIFICATION": (["reliable_silence", "overdue_days", "stale_last_known_n", "missing_sources", "n_severe"],
                              [False, False, False, False, False]),
        "MONITOR": (["risk_n", "conf_n", "signal"], [False, True, False]),
    }
    m["conf_n"] = m["data_confidence"].map({"LOW": 0, "MODERATE": 1, "HIGH": 2})
    parts = []
    for q, (cols, asc) in keys.items():
        part = m[m["queue"] == q].sort_values(cols + ["facility_id"], ascending=asc + [True]).copy()
        part["rank_state"] = np.arange(1, len(part) + 1)
        part["rank_lga"] = part.groupby("lga").cumcount() + 1
        parts.append(part)
    m = pd.concat(parts, ignore_index=True)

    # ---- Explanation and next action ----------------------------------------------
    dev = {(r.facility_id, r.domain): r for r in domains.itertuples()}
    fl = flags.sort_values("severity", key=lambda s: s.map(SEVERITY_ORDER), ascending=False) \
        .groupby("facility_id")[["rule_id", "severity", "explanation", "source_date"]] \
        .apply(lambda g: g.to_dict("records")).to_dict()
    expl, actions, summaries = [], [], []
    for _, r in m.iterrows():
        fid = r["facility_id"]
        dom_ev = {d: dev[(fid, d)].evidence for d in DOMAIN_LABEL if (fid, d) in dev}
        domains_out = []
        for d in DOMAIN_LABEL:
            x = dev.get((fid, d))
            if x is None:
                continue
            domains_out.append({"domain": d, "label": DOMAIN_LABEL[d], "severity": x.severity,
                                "credible": bool(x.credible and not x.unobserved), "evidence": x.evidence})
        checks = [{k: (str(v) if k == "source_date" and v is not None and not pd.isna(v) else v)
                   for k, v in c.items()} for c in fl.get(fid, [])]
        for c in checks:
            if isinstance(c.get("source_date"), float):
                c["source_date"] = None
        expl.append(json.dumps({"domains": domains_out, "confidence_reasons": r["confidence_reasons"],
                                "failed_checks": checks}, default=str))
        actions.append(_next_action(r, dom_ev))
        top = r["top_domain"]
        if r["queue"] == "DATA_VERIFICATION" or not isinstance(top, str):
            summaries.append(r["confidence_reasons"][0] if r["confidence_reasons"] else "Evidence too weak to call safe")
        else:
            ev = dom_ev.get(top, [])
            summaries.append(ev[0]["text"] if ev else DOMAIN_LABEL[top])
    m["next_action"] = actions
    m["explanation"] = expl
    m["evidence_summary"] = summaries

    facility_month = m.drop(columns=["explanation", "confidence_reason_severity"])
    queue = m[["facility_id", "lga_id", "lga", "analysis_month", "queue", "tag", "quadrant", "rank_state", "rank_lga",
               "operational_risk", "data_confidence", "top_domain", "evidence_summary", "next_action",
               "consecutive_missing", "nhlmis_age_days", "explanation"]]
    return facility_month, queue


def lga_rollup(fm: pd.DataFrame) -> pd.DataFrame:
    g = fm.groupby(["analysis_month", "lga_id", "lga"])
    r = g.agg(
        facilities=("facility_id", "count"),
        action=("queue", lambda q: int((q == "RESOURCE_ACTION").sum())),
        act_now=("quadrant", lambda q: int((q == "act_now").sum())),
        verify_then_act=("quadrant", lambda q: int((q == "verify_then_act").sum())),
        verification=("queue", lambda q: int((q == "DATA_VERIFICATION").sum())),
        monitor=("queue", lambda q: int((q == "MONITOR").sum())),
        critical=("operational_risk", lambda x: int((x == "CRITICAL").sum())),
        silent=("silent_flag", "sum"),
        reliable_silent=("reliable_silence", "sum"),
        stale_commodity=("nhlmis_stale", "sum"),
        reporting_completeness=("report_received", "mean"),
        on_time_rate=("on_time_flag", "mean"),
        low_confidence=("data_confidence", lambda x: int((x == "LOW").sum())),
    ).reset_index()
    r["reporting_completeness"] = r["reporting_completeness"].round(3)
    r["on_time_rate"] = r["on_time_rate"].round(3)
    r["needs_attention"] = r["action"] + r["verification"]
    r = r.sort_values(["analysis_month", "action", "verification"], ascending=[True, False, False])
    r["lga_rank"] = r.groupby("analysis_month").cumcount() + 1
    return r
