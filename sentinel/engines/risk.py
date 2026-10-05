"""Operational risk engines (proposal §7.3-7.5, Phase 5).

Each domain returns one row per facility: severity (NORMAL/WATCH/HIGH/CRITICAL),
credible (False when the domain's source is stale or missing), a signal size used
for tie-breaking, and an evidence list. A non-credible domain keeps its last-known
severity as context but cannot drive operational risk.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import periods as P
from ..config import settings
from ..spine import MonthView
from .dqr import PRODUCT_LABEL

SEV = {"NORMAL": 0, "WATCH": 1, "HIGH": 2, "CRITICAL": 3}
SEV_NAME = {v: k for k, v in SEV.items()}


def _domain(facility_ids, domain, severity, credible, signal, evidence, unobserved=None) -> pd.DataFrame:
    return pd.DataFrame({"facility_id": facility_ids, "domain": domain, "severity": severity,
                         "credible": credible, "signal": signal, "evidence": evidence,
                         "unobserved": unobserved if unobserved is not None else False})


# ---- Service pressure -------------------------------------------------------------
def service_pressure(mv: MonthView, z: pd.DataFrame) -> pd.DataFrame:
    cfg = settings()["service_pressure"]
    zz = z[z["indicator"].isin(cfg["indicators"])]
    sp = mv.spine[["facility_id", "report_received"]]
    top = zz.sort_values("z", ascending=False, na_position="last").drop_duplicates("facility_id")
    r = sp.merge(top, on="facility_id", how="left")
    zv = r["z"].fillna(-np.inf)
    sev = np.where(zv >= cfg["high_z"], "HIGH", np.where(zv >= cfg["watch_z"], "WATCH", "NORMAL"))
    ev = []
    for _, row in r.iterrows():
        if not row["report_received"]:
            ev.append([{"text": "No current monthly report: service demand not observed"}])
        elif pd.isna(row["z"]):
            ev.append([{"text": f"Insufficient history for a baseline ({int(row['n_hist'] or 0)} months)"}])
        else:
            base = "seasonal baseline" if row["seasonal"] else "rolling median (no prior-year data for this month)"
            ev.append([{"text": f"{row['indicator'].replace('_', ' ').capitalize()} {row['value']:,.0f} vs expected "
                                f"{row['expected']:,.0f} ({base}); robust z {row['z']:+.1f}",
                        "indicator": row["indicator"], "value": row["value"], "expected": row["expected"],
                        "z": round(float(row["z"]), 2)}])
    return _domain(r["facility_id"].values, "service_pressure", sev, r["report_received"].values,
                   np.where(np.isfinite(zv), zv, 0.0), ev, unobserved=~r["report_received"].values)


# ---- Malaria commodity ------------------------------------------------------------
def commodity(mv: MonthView, z: pd.DataFrame) -> pd.DataFrame:
    cfg = settings()["commodity"]
    cm = mv.commodity.copy()
    mal_z = z[z["indicator"] == "confirmed_malaria"].set_index("facility_id")["z"]
    cm["rising_demand"] = cm["facility_id"].map(mal_z).fillna(-np.inf) >= cfg["rising_demand_z"]

    amc = cm["amc"]
    stock = cm["physical_stock"]
    cm["mos"] = np.where(amc > 0, stock / amc.where(amc > 0), np.where(stock > 0, np.inf, np.nan))
    prev_mos = np.where(cm["prev_amc"] > 0, cm["prev_physical_stock"] / cm["prev_amc"].where(cm["prev_amc"] > 0), np.nan)
    cm["declining_mos"] = pd.notna(prev_mos) & (cm["mos"] < prev_mos)
    cm["prior_stockout"] = cm["prior_stockout_days"] > 0
    cm["corroborated"] = cm["rising_demand"] & cm["declining_mos"] & cm["prior_stockout"]

    so_now = stock <= 0
    days_out = cm["days_out_of_stock"].fillna(0)
    mos = cm["mos"]
    below_min = mos < cfg["min_months"]
    below_eop = mos < cfg["eop_months"]
    sev = np.select(
        [~cm["has_record"],
         so_now | ((days_out > 0) & below_min),
         below_eop | cm["corroborated"],
         below_min | (days_out > 0) | ((mos < cfg["watch_upper_months"]) & cm["rising_demand"])],
        [-1, SEV["CRITICAL"], SEV["HIGH"], SEV["WATCH"]], default=SEV["NORMAL"])
    cm["sev"] = sev
    cm["signal"] = np.where(cm["has_record"],
                            np.clip(cfg["min_months"] - mos.replace(np.inf, 99).fillna(cfg["min_months"]), 0, None) + days_out / 30, 0)

    def ev_row(r):
        if not r["has_record"]:
            return {"text": f"No {PRODUCT_LABEL[r['commodity_code']]} report on record", "commodity": r["commodity_code"]}
        mos_txt = "no recorded consumption" if pd.isna(r["mos"]) else ("ample (no consumption)" if np.isinf(r["mos"]) else f"{r['mos']:.1f} months of stock")
        parts = [f"{PRODUCT_LABEL[r['commodity_code']]}: {r['physical_stock']:,.0f} in stock, AMC {r['amc']:,.0f} -> {mos_txt}"]
        if r["days_out_of_stock"] > 0:
            parts.append(f"{int(r['days_out_of_stock'])} stockout days in the period")
        if r["corroborated"]:
            parts.append("rising malaria demand + declining stock + prior stockout")
        elif r["rising_demand"]:
            parts.append("malaria demand rising")
        pe = r["nhlmis_period_end"]
        return {"text": "; ".join(parts), "commodity": r["commodity_code"],
                "mos": None if pd.isna(r["mos"]) or np.isinf(r["mos"]) else round(float(r["mos"]), 2),
                "stockout_days": int(r["days_out_of_stock"]), "source_date": str(pe),
                "age_days": int(r["nhlmis_age_days"]), "stale": bool(r["stale_flag"])}

    cm["ev"] = cm.apply(ev_row, axis=1)
    rows = []
    for fid, g in cm.groupby("facility_id", sort=False):
        observed = g[g["has_record"]]
        worst = int(observed["sev"].max()) if len(observed) else -1
        stale = bool(g["stale_flag"].any())
        ev = [e for _, e in sorted(zip(-g["sev"].values, g["ev"].tolist()), key=lambda t: t[0])]
        rows.append((fid, SEV_NAME.get(worst, "NORMAL"), not stale, float(g["signal"].max()), ev, len(observed) == 0,
                     bool(g["corroborated"].any())))
    d = pd.DataFrame(rows, columns=["facility_id", "severity", "credible", "signal", "evidence", "unobserved", "corroborated"])
    d["domain"] = "malaria_commodity"
    return d


# ---- Vaccine and cold chain -------------------------------------------------------
def vaccine(mv: MonthView) -> pd.DataFrame:
    cfg = settings()["vaccine"]
    sp = mv.spine
    so = sp["vaccine_stockout_flag"] == 1
    fridge_down = sp["refrigerator_functional"] == 0
    ratio = sp["sessions_conducted"] / sp["sessions_planned"].where(sp["sessions_planned"] > 0)
    low_sessions = ratio < cfg["sessions_watch_ratio"]

    # Dropout on a 3-month rolling sum vs the preceding 12 months: monthly counts are too small to compare directly.
    allv = pd.concat([mv.history, sp[sp["report_received"]]])
    p3 = [P.dhis2_period(mv.month - k) for k in range(0, 3)]
    p12 = [P.dhis2_period(mv.month - k) for k in range(3, 15)]

    def dropout(periods, min_count, min_p1):
        t = allv[allv["period"].isin(periods)].groupby("facility_id")[["penta1", "penta3"]].sum(min_count=min_count)
        return (t["penta1"] - t["penta3"]) / t["penta1"].where(t["penta1"] >= min_p1) * 100

    base = sp["facility_id"].map(dropout(p12, 6, 30))
    cur_dropout = sp["facility_id"].map(dropout(p3, 2, 20)).where(sp["report_received"])
    rise = cur_dropout - base
    dropout_rise = rise >= cfg["dropout_rise_points"]

    sev = np.select([so & fridge_down, so | fridge_down, low_sessions | dropout_rise],
                    ["CRITICAL", "HIGH", "WATCH"], default="NORMAL")
    ev = []
    for i, r in sp.iterrows():
        if not r["report_received"]:
            ev.append([{"text": "No current monthly report: vaccine readiness not observed"}])
            continue
        e = []
        if so[i]:
            e.append({"text": "Vaccine stockout reported this month"})
        if fridge_down[i]:
            e.append({"text": "Vaccine refrigerator reported non-functional"})
        if low_sessions[i]:
            e.append({"text": f"{r['sessions_conducted']:.0f} of {r['sessions_planned']:.0f} planned RI sessions conducted"})
        if dropout_rise[i]:
            e.append({"text": f"Penta1-Penta3 dropout {cur_dropout[i]:.0f}% over 3 months vs {base[i]:.0f}% baseline"})
        if pd.isna(r["vaccine_stockout_flag"]) and pd.isna(r["refrigerator_functional"]):
            e.append({"text": "Vaccine stockout and refrigerator fields not reported"})
        ev.append(e or [{"text": "No vaccine stockout; refrigerator functional; sessions on plan"}])
    signal = so.astype(int) * 2 + fridge_down.astype(int) * 2 + low_sessions.astype(int) + dropout_rise.astype(int)
    return _domain(sp["facility_id"].values, "vaccine_cold_chain", sev, sp["report_received"].values,
                   signal.values.astype(float), ev, unobserved=~sp["report_received"].values)


def run(mv: MonthView, z: pd.DataFrame) -> pd.DataFrame:
    d = pd.concat([commodity(mv, z), vaccine(mv), service_pressure(mv, z)], ignore_index=True)
    d["corroborated"] = d["corroborated"].astype("boolean").fillna(False).astype(bool)
    d["analysis_month"] = str(mv.month)
    return d
