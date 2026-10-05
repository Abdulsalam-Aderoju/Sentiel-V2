"""DHIS2 / NHLMIS adapter: mapping-driven, validated on load, rejections logged."""
from __future__ import annotations

import pandas as pd
import pytest

from sentinel.config import mapping
from sentinel.ingest import dhis2, nhlmis

from .conftest import make_dim

DE = {d["field"]: d["uid"] for d in mapping()["dhis2"]["data_elements"]}
COC = mapping()["dhis2"]["default_category_option_combo"]


def write_values(tmp_path, rows):
    df = pd.DataFrame(rows, columns=["dataelement", "period", "orgunit", "categoryoptioncombo", "value", "lastupdated"])
    df.to_csv(tmp_path / "dhis2_datavalues.csv", index=False)


def test_values_validation_and_rejections(tmp_path):
    dim = make_dim(["F1"])
    ou = dim.dhis2_orgunit_uid[0]
    write_values(tmp_path, [
        (DE["opd"], "202609", ou, COC, "410", "2026-10-10"),
        (DE["opd"], "202609", ou, COC, "420", "2026-10-12"),            # supersedes the row above
        (DE["anc1"], "2026-09", ou, COC, "5", "2026-10-10"),            # bad period
        (DE["anc1"], "202609", "UNKNOWNOU01", COC, "5", "2026-10-10"),  # unknown org unit
        ("zzzzzzzzzzz", "202609", ou, COC, "5", "2026-10-10"),          # unmapped element
        (DE["deliveries"], "202609", ou, COC, "ten", "2026-10-10"),     # invalid value
        (DE["refrigerator_functional"], "202609", ou, COC, "true", "2026-10-10"),
    ])
    rej: list = []
    _, monthly = dhis2.load(tmp_path, dim, rej)
    reasons = pd.concat(rej)["reason"].value_counts().to_dict()
    assert reasons == {"invalid_period": 1, "unknown_orgunit": 1, "unmapped_dataelement": 1,
                       "invalid_value": 1, "duplicate_superseded": 1}
    row = monthly.iloc[0]
    assert row.opd == 420 and row.refrigerator_functional == 1
    assert row.submission_date == pd.Timestamp("2026-10-10")   # first value entered (no registration file)


def test_renamed_element_only_needs_mapping_edit(tmp_path, monkeypatch):
    dim = make_dim(["F1"])
    write_values(tmp_path, [("NEWUID00001", "202609", dim.dhis2_orgunit_uid[0], COC, "77", "2026-10-10")])
    mp = mapping()
    patched = {**mp, "dhis2": {**mp["dhis2"], "data_elements": [
        {**d, "uid": "NEWUID00001"} if d["field"] == "opd" else d for d in mp["dhis2"]["data_elements"]]}}
    monkeypatch.setattr(dhis2, "mapping", lambda: patched)
    _, monthly = dhis2.load(tmp_path, dim, [])
    assert monthly.iloc[0].opd == 77


def test_malformed_columns_raise(tmp_path):
    pd.DataFrame({"de": [1], "pe": [2]}).to_csv(tmp_path / "dhis2_datavalues.csv", index=False)
    with pytest.raises(dhis2.ExportFormatError):
        dhis2.load(tmp_path, make_dim(["F1"]), [])


def test_nhlmis_alignment_and_duplicates(tmp_path):
    dim = make_dim(["F1"])
    code = dim.lmis_facility_code[0]
    cols = list(mapping()["nhlmis"]["columns"])
    base = dict(facility_code=code, product_code="ACT_AL_ADULT", beginning_balance=10, quantity_received=5,
                quantity_dispensed=5, losses_adjustments=0, physical_count=10, days_out_of_stock=0,
                adjusted_consumption=5, amc=2.5, quantity_required=0)
    rows = [
        {**base, "reporting_period_start": "2026-07-01", "reporting_period_end": "2026-08-31", "date_submitted": "2026-09-10"},
        {**base, "reporting_period_start": "2026-07-01", "reporting_period_end": "2026-08-31", "date_submitted": "2026-09-12", "physical_count": 11},
        {**base, "reporting_period_start": "2026-08-01", "reporting_period_end": "2026-09-30", "date_submitted": "2026-10-10"},
        {**base, "facility_code": "BA-LMIS-XXXXXX", "reporting_period_start": "2026-05-01", "reporting_period_end": "2026-06-30", "date_submitted": "2026-07-10"},
    ]
    pd.DataFrame(rows)[cols].to_csv(tmp_path / "nhlmis_facility_reports.csv", index=False)
    rej: list = []
    lm = nhlmis.load(tmp_path, dim, rej)
    assert pd.concat(rej)["reason"].value_counts().to_dict() == {
        "period_not_bimonthly": 1, "unknown_facility_code": 1, "duplicate_superseded": 1}
    assert len(lm) == 1 and lm.iloc[0].physical_stock == 11
