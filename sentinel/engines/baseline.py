"""Seasonal and robust baselines (proposal §7.3).

Each indicator is deseasonalised with a state-wide calendar-month index estimated
from visible history only. When a calendar month has no prior-year data the index
is 1 and the baseline is a plain rolling median (flagged seasonal=False).

    robust_z = 0.6745 x (current - median) / MAD     on deseasonalised values
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import periods as P
from ..config import settings

MIN_FACILITIES_FOR_INDEX = 30


def seasonal_index(history: pd.DataFrame, indicator: str) -> dict[int, float]:
    h = history[["facility_id", "period", indicator]].dropna()
    h = h[h[indicator] >= 0]
    if h.empty:
        return {}
    med = h.groupby("facility_id")[indicator].transform("median")
    h = h.assign(ratio=h[indicator] / med.replace(0, np.nan), cal=h["period"].str[4:].astype(int)).dropna()
    by = h.groupby("cal")["ratio"].agg(["median", "count"])
    by = by[by["count"] >= MIN_FACILITIES_FOR_INDEX]["median"]
    if by.empty:
        return {}
    if len(by) == 12:
        by = by / by.mean()
    return by.to_dict()


def robust_z(spine: pd.DataFrame, history: pd.DataFrame, month: pd.Period, indicators: list[str] | None = None) -> pd.DataFrame:
    sp = settings()["service_pressure"]
    indicators = indicators or sp["indicators"]
    win_start = P.dhis2_period(month - sp["history_window_months"])
    hw = history[history["period"] >= win_start]
    cal_now = month.month
    out = []
    for ind in indicators:
        idx = seasonal_index(history, ind)
        seasonal = cal_now in idx
        h = hw[["facility_id", "period", ind]].dropna()
        h = h[h[ind] >= 0]
        s_hist = h["period"].str[4:].astype(int).map(lambda c: idx.get(c, 1.0) if seasonal else 1.0)
        h = h.assign(d=h[ind] / s_hist)
        g = h.groupby("facility_id")["d"]
        stats = pd.DataFrame({"median": g.median(), "n_hist": g.count()})
        stats["mad"] = h.assign(med=h["facility_id"].map(stats["median"])) \
            .assign(dev=lambda x: (x["d"] - x["med"]).abs()).groupby("facility_id")["dev"].median()
        s_now = idx.get(cal_now, 1.0) if seasonal else 1.0
        cur = spine[["facility_id", ind]].rename(columns={ind: "value"})
        r = cur.merge(stats, left_on="facility_id", right_index=True, how="left")
        r["indicator"] = ind
        r["seasonal"] = seasonal
        r["season_factor"] = s_now
        r["n_hist"] = r["n_hist"].fillna(0).astype(int)
        mad_eff = np.maximum.reduce([r["mad"].fillna(0), sp["mad_floor_fraction"] * r["median"].fillna(0), np.ones(len(r))])
        r["expected"] = (r["median"] * s_now).round(1)
        r["z"] = 0.6745 * (r["value"] / s_now - r["median"]) / mad_eff
        r.loc[(r["n_hist"] < sp["min_history_months"]) | r["value"].isna(), "z"] = np.nan
        out.append(r[["facility_id", "indicator", "value", "expected", "median", "mad", "n_hist", "seasonal", "season_factor", "z"]])
    return pd.concat(out, ignore_index=True)
