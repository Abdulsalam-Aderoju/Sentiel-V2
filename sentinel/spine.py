"""Monthly decision spine (proposal §7.1).

For an analysis month M the spine sees only what had been submitted by the
analysis date as_of(M). A late report for M-1 that arrived before as_of(M) is
visible; a report for M that arrives after as_of(M) is not. The latest NHLMIS
report is joined per commodity and is never carried forward past its cycle:
once the next report is due and absent, it is marked stale.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

from . import periods as P
from .config import settings


@dataclass
class MonthView:
    month: pd.Period
    as_of: date
    spine: pd.DataFrame        # one row per facility: current report, reporting status
    history: pd.DataFrame      # all visible monthly rows for periods before M
    commodity: pd.DataFrame    # one row per facility x commodity: latest + previous NHLMIS record


def _visible(monthly: pd.DataFrame, month: pd.Period, as_of: date) -> pd.DataFrame:
    cutoff = pd.Timestamp(as_of) + pd.Timedelta(days=1)
    return monthly[(monthly["period"] <= P.dhis2_period(month)) & monthly["submission_date"].notna()
                   & (monthly["submission_date"] < cutoff)]


def build_month(month: pd.Period, dim: pd.DataFrame, monthly: pd.DataFrame, nhlmis: pd.DataFrame) -> MonthView:
    s = settings()
    rep = s["reporting"]
    as_of = P.as_of_date(month)
    period = P.dhis2_period(month)
    first = pd.Period(s["calendar"]["first_period"], freq="M")
    vis = _visible(monthly, month, as_of)
    fac = dim[["facility_id", "lga_id", "lga"]].copy()

    cur = vis[vis["period"] == period]
    sp = fac.merge(cur, on="facility_id", how="left")
    sp["period"] = period
    sp["analysis_month"] = str(month)
    sp["as_of"] = as_of
    sp["report_received"] = sp["submission_date"].notna()
    deadline = pd.Timestamp(P.dhis2_deadline(month)) + pd.Timedelta(days=1)
    sp["late_days"] = np.where(sp["report_received"],
                               np.maximum((sp["submission_date"] - deadline).dt.days + 1, 0), np.nan)
    sp["on_time_flag"] = sp["report_received"] & (sp["late_days"] == 0)
    sp["field_completeness"] = sp["field_completeness"].fillna(0.0)

    # Reporting run: consecutive expected monthly reports missing up to and including M.
    vis_m = vis.assign(pm=vis["period"].map(P.parse_dhis2_period))
    last_rep = vis_m.groupby("facility_id")["pm"].max()
    sp["last_report_period"] = sp["facility_id"].map(last_rep)
    months_since = sp["last_report_period"].map(lambda p: (month - p).n if isinstance(p, pd.Period) else None)
    sp["consecutive_missing"] = months_since.fillna((month - first).n + 1).astype(int)
    sp["silent_flag"] = sp["consecutive_missing"] >= rep["silence_consecutive_missing"]

    # Reliable history: reports received in the window before the current missing run began.
    win = rep["reliable_history_window"]
    # First month of the missing run (M+1 when the current report is in).
    run_start = [month - int(k) + 1 for k in sp["consecutive_missing"]]
    rcount = vis_m.groupby("facility_id")["pm"].apply(lambda s_: set(s_))
    prior = []
    for fid, rs in zip(sp["facility_id"], run_start):
        got = rcount.get(fid, set())
        window = [rs - k for k in range(1, win + 1) if rs - k >= first]
        prior.append((sum(1 for w in window if w in got), len(window)))
    sp["prior_reports"] = [p[0] for p in prior]
    sp["prior_expected"] = [p[1] for p in prior]
    sp["reliable_history"] = (sp["prior_expected"] >= win) & (sp["prior_reports"] >= rep["reliable_history_min_reports"])
    sp["days_since_deadline_missed"] = np.where(
        sp["consecutive_missing"] > 0,
        [(pd.Timestamp(as_of) - pd.Timestamp(P.dhis2_deadline(month - (k - 1)))).days if k > 0 else 0
         for k in sp["consecutive_missing"]], 0)

    hist = vis[vis["period"] < period]

    # ---- NHLMIS: latest visible closed report per commodity -----------------------
    cutoff = pd.Timestamp(as_of) + pd.Timedelta(days=1)
    lv = nhlmis[(nhlmis["submission_date"] < cutoff) & (nhlmis["period_start"] + 1 <= month)]
    lv = lv.sort_values("period_start")
    g = lv.groupby(["facility_id", "commodity_code"])
    latest = g.tail(1).set_index(["facility_id", "commodity_code"])
    prev = g.nth(-2).set_index(["facility_id", "commodity_code"]) if len(lv) else latest.iloc[0:0]
    prior_so = (lv.assign(rank=g.cumcount(ascending=False))
                .query("rank >= 1 and rank <= 3").groupby(["facility_id", "commodity_code"])["days_out_of_stock"].sum())

    grid = pd.MultiIndex.from_product([dim["facility_id"], s["commodity"]["products"]],
                                      names=["facility_id", "commodity_code"])
    cm = latest.reindex(grid)
    cm["has_record"] = cm["submission_date"].notna()
    due = P.latest_due_bimonthly(as_of)
    cm["nhlmis_period_end"] = cm["period_end"]
    cm["nhlmis_age_days"] = [(as_of - pe).days if isinstance(pe, date) else np.nan for pe in cm["period_end"]]
    cm["next_expected_period"] = [str(ps + 2) if isinstance(ps, pd.Period) else str(due) for ps in cm["period_start"]]
    cm["stale_flag"] = [not isinstance(ps, pd.Period) or ps < due for ps in cm["period_start"]]
    cm["prev_physical_stock"] = prev["physical_stock"].reindex(grid)
    cm["prev_amc"] = prev["amc"].reindex(grid)
    cm["prior_stockout_days"] = prior_so.reindex(grid).fillna(0)
    cm = cm.reset_index()
    cm["analysis_month"] = str(month)

    return MonthView(month=month, as_of=as_of, spine=sp, history=hist, commodity=cm)
