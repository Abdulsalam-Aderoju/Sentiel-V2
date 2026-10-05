"""NHLMIS bimonthly facility report adapter, driven by the nhlmis section of the mapping file."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from ..config import mapping
from .dhis2 import ExportFormatError, _reject

NUMERIC = ["opening_balance", "quantity_received", "quantity_consumed", "losses_adjustments",
           "physical_stock", "days_out_of_stock", "adjusted_consumption", "amc", "quantity_to_order"]


def load(exports_dir: Path, dim: pd.DataFrame, rejections: list) -> pd.DataFrame:
    path = exports_dir / "nhlmis_facility_reports.csv"
    if not path.exists():
        raise FileNotFoundError(path)
    mp = mapping()["nhlmis"]
    raw = pd.read_csv(path, dtype=str, keep_default_na=False)
    missing = [c for c in mp["columns"] if c not in raw.columns]
    if missing:
        raise ExportFormatError(f"{path.name}: missing column(s) {missing}")
    df = raw.rename(columns=mp["columns"])[list(mp["columns"].values())]
    src = "nhlmis"

    code = dict(zip(dim["lmis_facility_code"], dim["facility_id"]))
    df = _reject(df, ~df["facility_code"].isin(code), "unknown_facility_code", src, rejections)
    df = _reject(df, ~df["commodity_code"].isin(mp["products"]), "unknown_product", src, rejections)

    start = pd.to_datetime(df["period_start"], errors="coerce")
    end = pd.to_datetime(df["period_end"], errors="coerce")
    df = df.assign(ps=start, pe=end)
    df = _reject(df, df["ps"].isna() | df["pe"].isna(), "invalid_period", src, rejections)
    # Bimonthly alignment: starts on the 1st of an odd month, ends on the last day of the next month.
    aligned = (df["ps"].dt.day == 1) & (df["ps"].dt.month % 2 == 1) & \
              (df["pe"] == (df["ps"] + pd.offsets.MonthEnd(2)))
    df = _reject(df, ~aligned, "period_not_bimonthly", src, rejections)

    for c in NUMERIC:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = _reject(df, df[NUMERIC].isna().any(axis=1), "invalid_value", src, rejections)
    df = df.assign(submission_date=pd.to_datetime(df["submission_date"], errors="coerce"))
    df = _reject(df, df["submission_date"].isna(), "invalid_date", src, rejections)
    df = df.sort_values("submission_date")
    df = _reject(df, df.duplicated(["facility_code", "commodity_code", "period_start"], keep="last"),
                 "duplicate_superseded", src, rejections)

    out = df.assign(facility_id=df["facility_code"].map(code),
                    period_start=df["ps"].dt.to_period("M"), period_end=df["pe"].dt.date)
    return out[["facility_id", "commodity_code", "period_start", "period_end", *NUMERIC, "submission_date"]] \
        .sort_values(["facility_id", "commodity_code", "period_start"]).reset_index(drop=True)
