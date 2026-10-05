"""DHIS2 export adapter.

Reads a DHIS2 data value set CSV export and a complete data set registration
export, driven entirely by config/dhis2_mapping.yaml. Renaming or re-keying a
data element in the source only requires editing the mapping file.

Output:
  stg_dhis2_values    raw rows as read, before mapping
  fact_dhis2_monthly  facility x period wide table with submission_date
  rejections          rows that failed validation, with a reason
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from ..config import mapping

REQUIRED_VALUE_COLUMNS = ["dataelement", "period", "orgunit", "categoryoptioncombo", "value"]
REQUIRED_REGISTRATION_COLUMNS = ["dataset", "period", "orgunit", "date"]
TRUE_VALUES = {"true", "1", "yes"}
FALSE_VALUES = {"false", "0", "no"}


class ExportFormatError(ValueError):
    pass


def _require(df: pd.DataFrame, cols: list[str], source: str) -> None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ExportFormatError(f"{source}: missing required column(s) {missing}; found {list(df.columns)}")


def _reject(df: pd.DataFrame, mask: pd.Series, reason: str, source: str, out: list) -> pd.DataFrame:
    if mask.any():
        r = df[mask].copy()
        out.append(pd.DataFrame({"source": source, "reason": reason,
                                 "row": r.astype(str).agg("|".join, axis=1).values}))
    return df[~mask]


def key_fields() -> list[str]:
    return [d["field"] for d in mapping()["dhis2"]["data_elements"] if d.get("key")]


def load_values(path: Path, dim: pd.DataFrame, rejections: list) -> tuple[pd.DataFrame, pd.DataFrame]:
    raw = pd.read_csv(path, dtype=str, keep_default_na=False)
    raw.columns = [c.strip().lower() for c in raw.columns]
    _require(raw, REQUIRED_VALUE_COLUMNS, path.name)
    stg = raw.copy()

    mp = mapping()["dhis2"]
    de = {d["uid"]: d for d in mp["data_elements"]}
    ou = dict(zip(dim["dhis2_orgunit_uid"], dim["facility_id"]))
    src = "dhis2_datavalues"

    df = raw
    df = _reject(df, ~df["period"].str.fullmatch(r"\d{4}(0[1-9]|1[0-2])"), "invalid_period", src, rejections)
    df = _reject(df, ~df["orgunit"].isin(ou), "unknown_orgunit", src, rejections)
    df = _reject(df, ~df["dataelement"].isin(de), "unmapped_dataelement", src, rejections)
    expected_coc = df["dataelement"].map(lambda u: de[u].get("category_option_combo", mp["default_category_option_combo"]))
    df = _reject(df, df["categoryoptioncombo"] != expected_coc, "unexpected_category_option_combo", src, rejections)

    df = df.assign(field=df["dataelement"].map(lambda u: de[u]["field"]),
                   vtype=df["dataelement"].map(lambda u: de[u]["value_type"]))
    v = df["value"].str.strip().str.lower()
    num = pd.to_numeric(v.where(df["vtype"] == "number"), errors="coerce")
    boo = np.where(v.isin(TRUE_VALUES), 1.0, np.where(v.isin(FALSE_VALUES), 0.0, np.nan))
    df = df.assign(num=np.where(df["vtype"] == "number", num, boo))
    df = _reject(df, df["num"].isna(), "invalid_value", src, rejections)

    ts_col = "lastupdated" if "lastupdated" in df else ("created" if "created" in df else None)
    df = df.assign(ts=pd.to_datetime(df[ts_col], errors="coerce") if ts_col else pd.NaT)
    df = df.sort_values("ts")
    dup = df.duplicated(["dataelement", "period", "orgunit", "categoryoptioncombo"], keep="last")
    df = _reject(df, dup, "duplicate_superseded", src, rejections)

    long = pd.DataFrame({"facility_id": df["orgunit"].map(ou), "period": df["period"],
                         "field": df["field"], "value": df["num"].astype(float), "value_ts": df["ts"]})
    return stg, long


def load_registrations(path: Path, dim: pd.DataFrame, rejections: list) -> pd.DataFrame:
    raw = pd.read_csv(path, dtype=str, keep_default_na=False)
    raw.columns = [c.strip().lower() for c in raw.columns]
    _require(raw, REQUIRED_REGISTRATION_COLUMNS, path.name)
    ds = mapping()["dhis2"]["dataset"]["uid"]
    ou = dict(zip(dim["dhis2_orgunit_uid"], dim["facility_id"]))
    src = "dhis2_registrations"
    df = raw[raw["dataset"] == ds]
    if "completed" in df:
        df = df[df["completed"].str.lower() != "false"]
    df = _reject(df, ~df["orgunit"].isin(ou), "unknown_orgunit", src, rejections)
    df = _reject(df, ~df["period"].str.fullmatch(r"\d{4}(0[1-9]|1[0-2])"), "invalid_period", src, rejections)
    df = df.assign(reg_date=pd.to_datetime(df["date"], errors="coerce"))
    df = _reject(df, df["reg_date"].isna(), "invalid_date", src, rejections)
    out = pd.DataFrame({"facility_id": df["orgunit"].map(ou), "period": df["period"], "registration_date": df["reg_date"]})
    return out.sort_values("registration_date").drop_duplicates(["facility_id", "period"], keep="first")


def build_monthly(long: pd.DataFrame, reg: pd.DataFrame) -> pd.DataFrame:
    """facility x period wide table. A report counts as submitted on its registration
    date, or, if never marked complete, on the date its first value was entered."""
    fields = [d["field"] for d in mapping()["dhis2"]["data_elements"]]
    wide = long.pivot_table(index=["facility_id", "period"], columns="field", values="value", aggfunc="last")
    wide = wide.reindex(columns=fields)
    first_ts = long.groupby(["facility_id", "period"])["value_ts"].min().rename("first_value_ts")
    wide = wide.join(first_ts, how="outer").reset_index()
    wide = wide.merge(reg, on=["facility_id", "period"], how="outer")
    wide["submission_date"] = wide["registration_date"].fillna(wide["first_value_ts"])
    keys = key_fields()
    wide["fields_present"] = wide[keys].notna().sum(axis=1)
    wide["field_completeness"] = (wide["fields_present"] / len(keys)).round(3)
    return wide.sort_values(["facility_id", "period"]).reset_index(drop=True)


def load(exports_dir: Path, dim: pd.DataFrame, rejections: list) -> tuple[pd.DataFrame, pd.DataFrame]:
    values = next((exports_dir / n for n in ("dhis2_datavalues.csv.gz", "dhis2_datavalues.csv")
                   if (exports_dir / n).exists()), None)
    if values is None:
        raise FileNotFoundError(f"no DHIS2 data value export in {exports_dir}")
    stg, long = load_values(values, dim, rejections)
    reg_path = exports_dir / "dhis2_complete_registrations.csv"
    reg = load_registrations(reg_path, dim, rejections) if reg_path.exists() else \
        pd.DataFrame(columns=["facility_id", "period", "registration_date"])
    return stg, build_monthly(long, reg)
