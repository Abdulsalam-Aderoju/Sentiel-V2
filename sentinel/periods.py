"""Reporting-calendar helpers.

Monthly periods use the DHIS2 monthly format "YYYYMM". NHLMIS periods are
bimonthly (Jan-Feb, Mar-Apr, ...) and are identified by their start month.
"""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from .config import settings


def month_range(first: str, last: str) -> list[pd.Period]:
    return list(pd.period_range(first, last, freq="M"))


def analysis_months() -> list[pd.Period]:
    cal = settings()["calendar"]
    return month_range(cal["first_period"], cal["last_period"])


def dhis2_period(month: pd.Period) -> str:
    return month.strftime("%Y%m")


def parse_dhis2_period(p: str) -> pd.Period:
    if len(p) != 6 or not p.isdigit():
        raise ValueError(f"not a DHIS2 monthly period: {p!r}")
    return pd.Period(f"{p[:4]}-{p[4:]}", freq="M")


def month_end(month: pd.Period) -> date:
    return month.end_time.date()


def as_of_date(month: pd.Period) -> date:
    """The date on which analysis for `month` runs."""
    return month_end(month) + timedelta(days=settings()["calendar"]["analysis_lag_days"])


def dhis2_deadline(month: pd.Period) -> date:
    return month_end(month) + timedelta(days=settings()["reporting"]["dhis2_deadline_days"])


def bimonthly_start(month: pd.Period) -> pd.Period:
    """Start month of the bimonthly period containing `month` (Jan, Mar, May, ...)."""
    return pd.Period(year=month.year, month=month.month - (month.month - 1) % 2, freq="M")


def bimonthly_end(start: pd.Period) -> pd.Period:
    return start + 1


def nhlmis_deadline(start: pd.Period) -> date:
    return month_end(bimonthly_end(start)) + timedelta(days=settings()["reporting"]["nhlmis_deadline_days"])


def bimonthly_periods(first: str, last: str) -> list[pd.Period]:
    """Start months of every bimonthly period overlapping [first, last]."""
    starts = sorted({bimonthly_start(m) for m in month_range(first, last)})
    return starts


def latest_due_bimonthly(as_of: date) -> pd.Period:
    """Start month of the most recent bimonthly period whose report was due on or before as_of."""
    m = pd.Period(as_of, freq="M")
    start = bimonthly_start(m)
    while nhlmis_deadline(start) > as_of:
        start -= 2
    return start
