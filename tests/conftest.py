"""Small hand-built fixtures: a few facilities with exact, known histories."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from sentinel import periods as P
from sentinel.config import mapping
from sentinel.spine import build_month

FIELDS = [d["field"] for d in mapping()["dhis2"]["data_elements"]]
MONTH = pd.Period("2026-09", "M")

NORMAL_ROW = dict(opd=400, confirmed_malaria=100, anc1=20, deliveries=10, penta1=20, penta3=18,
                  sessions_planned=4, sessions_conducted=4, vaccine_stockout_flag=0,
                  vaccine_stock_balance=60, refrigerator_functional=1)


def make_dim(ids):
    return pd.DataFrame({"facility_id": ids, "lga_id": "5001", "lga": "Alkaleri", "name": ids,
                         "dhis2_orgunit_uid": [f"OU{i:09d}" for i in range(len(ids))],
                         "lmis_facility_code": [f"BA-LMIS-{i:06d}" for i in range(len(ids))]})


def monthly_rows(fid, months=24, overrides=None, missing=(), late=(), end=MONTH):
    """One facility's monthly history ending at `end`. overrides: {period_offset: {field: value}}
    where offset 0 = end month, 1 = previous month..."""
    rows = []
    for k in range(months - 1, -1, -1):
        m = end - k
        if k in missing:
            continue
        row = dict(NORMAL_ROW)
        # Small deterministic jitter so normal histories never look copy-forwarded.
        row["opd"] += 8 * ((k * 7) % 5) - 16
        row["confirmed_malaria"] += 3 * ((k * 3) % 5) - 6
        row["anc1"] += k % 3 - 1
        row.update((overrides or {}).get(k, {}))
        sub = pd.Timestamp(P.dhis2_deadline(m)) + pd.Timedelta(days=(10 if k in late else -3))
        rows.append({"facility_id": fid, "period": P.dhis2_period(m), **row,
                     "submission_date": sub, "registration_date": sub, "first_value_ts": sub})
    df = pd.DataFrame(rows)
    keys = [d["field"] for d in mapping()["dhis2"]["data_elements"] if d.get("key")]
    df["fields_present"] = df[keys].notna().sum(axis=1)
    df["field_completeness"] = df["fields_present"] / len(keys)
    return df


def nhlmis_rows(fid, physical=400, amc=100, days_out=0, periods=6, end_start=pd.Period("2026-07", "M"),
                identity_ok=True, commodities=("ACT_AL_ADULT", "ACT_AL_CHILD", "RDT_MAL"), skip_latest=False):
    rows = []
    for c in commodities:
        for k in range(periods - 1, -1, -1):
            if skip_latest and k == 0:
                continue
            start = end_start - 2 * k
            consumed = 2 * amc
            phys = physical if k == 0 else 300
            received = max(phys + consumed - 200, 0)
            rows.append({"facility_id": fid, "commodity_code": c, "period_start": start,
                         "period_end": P.bimonthly_end(start).end_time.date(),
                         "opening_balance": 200, "quantity_received": received, "quantity_consumed": consumed,
                         "losses_adjustments": 0, "physical_stock": phys + (0 if identity_ok or k else 50),
                         "days_out_of_stock": days_out if k == 0 else 0, "adjusted_consumption": consumed,
                         "amc": amc, "quantity_to_order": 0,
                         "submission_date": pd.Timestamp(P.nhlmis_deadline(start)) - pd.Timedelta(days=3)})
    return pd.DataFrame(rows)


@pytest.fixture
def view():
    """Build a MonthView from per-facility monthly + nhlmis frames."""
    def _build(monthly_frames, nhlmis_frames, month=MONTH):
        monthly = pd.concat(monthly_frames, ignore_index=True)
        for f in FIELDS:
            if f not in monthly:
                monthly[f] = np.nan
        lm = pd.concat(nhlmis_frames, ignore_index=True)
        dim = make_dim(sorted(set(monthly["facility_id"]) | set(lm["facility_id"])))
        return build_month(month, dim, monthly, lm), dim
    return _build
