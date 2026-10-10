"""Workstream A: access and travel burden. Synthetic-grid unit tests plus checks on real
outputs when they have been built (`python -m sentinel access`)."""
from __future__ import annotations

import json
import math

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("skimage")

from sentinel.access.compute import (aggregate_population, beyond, boundary_alternatives, cost_distance,
                                     filter_facilities, weighted_stats)
from sentinel.config import StatePaths, state_codes


# ---- cost-distance and nearest-facility assignment ------------------------------------
def test_cost_distance_uniform_grid_known_answer():
    # 1 km cells, 0.012 min/m (5 km/h walking) -> 12 minutes per orthogonal step.
    f = np.full((5, 9), 0.012)
    cost, label = cost_distance(f, np.array([[2, 0], [2, 8]]), 1000.0)
    assert cost[2, 0] == 0 and cost[2, 8] == 0
    assert cost[2, 3] == pytest.approx(36.0)                       # 3 orthogonal steps
    assert cost[0, 2] == pytest.approx(2 * 12 * math.sqrt(2))      # 2 diagonal steps
    # Nearest-seed labels: columns 0-3 -> seed 0, columns 5-8 -> seed 1.
    assert (label[:, :4] == 0).all() and (label[:, 5:] == 1).all()
    # Middle column is equidistant; it must go to one of the two.
    assert set(np.unique(label[:, 4])) <= {0, 1}


def test_cost_distance_respects_friction_and_barriers():
    f = np.full((3, 7), 0.012)
    f[:, 3] = np.inf                                              # impassable wall
    f[0, 3] = 0.06                                                # slow crossing (1 km/h) in row 0
    cost, label = cost_distance(f, np.array([[1, 0]]), 1000.0)
    wall = np.zeros_like(f, dtype=bool)
    wall[1:, 3] = True
    assert np.isfinite(cost[~wall]).all() and np.isinf(cost[wall]).all()
    assert (label[~wall] == 0).all() and (label[wall] == -1).all()
    # Crossing must use the slow cell: at least half a slow step on each side of it.
    assert cost[1, 4] > cost[1, 2] + 0.06 * 1000


def test_cost_distance_unreachable_and_no_seeds():
    f = np.full((3, 5), 0.012)
    f[:, 2] = np.inf
    cost, label = cost_distance(f, np.array([[1, 0]]), 1000.0)
    assert np.isinf(cost[:, 3:]).all() and (label[:, 3:] == -1).all()
    cost, label = cost_distance(f, np.empty((0, 2)), 1000.0)
    assert np.isinf(cost).all() and (label == -1).all()


def test_boundary_alternatives_exact_on_line():
    f = np.full((1, 11), 0.012)
    seeds = np.array([[0, 0], [0, 4], [0, 10]])
    cost, label = cost_distance(f, seeds, 1000.0)
    alt = boundary_alternatives(cost, label, f, 1000.0).set_index("seed")
    assert alt.loc[0, "alt_seed"] == 1 and alt.loc[0, "alt_cost"] == pytest.approx(48.0)
    assert alt.loc[1, "alt_seed"] == 0 and alt.loc[1, "alt_cost"] == pytest.approx(48.0)
    assert alt.loc[2, "alt_seed"] == 1 and alt.loc[2, "alt_cost"] == pytest.approx(72.0)


# ---- population aggregation ------------------------------------------------------------
def test_population_aggregation_conserves_total():
    rng = np.random.default_rng(7)
    n = 50_000
    rows, cols = rng.integers(0, 40, n), rng.integers(0, 30, n)
    pop = rng.gamma(0.5, 4.0, n)
    grid = aggregate_population(rows, cols, pop, (40, 30))
    assert grid.shape == (40, 30)
    assert grid.sum() == pytest.approx(pop.sum(), rel=1e-12)
    assert grid[rows[0], cols[0]] >= pop[0]


# ---- thresholds and weighting ----------------------------------------------------------
def test_threshold_boundary_counts_as_within():
    t = np.array([59.999, 60.0, 60.001, np.inf])
    assert beyond(t, 60).tolist() == [False, False, True, True]


def test_weighted_stats():
    d = pd.DataFrame({"k": [1, 1, 1, 2], "t": [10.0, 20.0, 90.0, 5.0], "w": [1.0, 1.0, 2.0, 3.0]})
    s = weighted_stats(d, "k", "t", "w")
    assert s.loc[1, "mean"] == pytest.approx((10 + 20 + 180) / 4)
    assert s.loc[1, "median"] == 20.0      # cumulative weight 2 of 4 reaches half at 20
    assert s.loc[2, "median"] == 5.0


def test_facility_filter_default_keeps_unknown():
    fac = pd.DataFrame({"functional_status": ["Functional", "Unknown", "Not-Functional", None]})
    assert filter_facilities(fac, "exclude_non_functional").tolist() == [True, True, False, True]
    assert filter_facilities(fac, "functional_only").tolist() == [True, False, False, False]
    assert filter_facilities(fac, "all").all()


# ---- real outputs (skipped when not built) --------------------------------------------
BUILT = [c for c in state_codes() if (StatePaths(c).root / "access" / "mart_access_state.parquet").exists()]


@pytest.mark.skipif(not BUILT, reason="access marts not built")
@pytest.mark.parametrize("code", BUILT)
def test_real_outputs_consistent(code):
    d = StatePaths(code).root / "access"
    s = pd.read_parquet(d / "mart_access_state.parquet")
    assert len(s) == 1
    pop = s["pop_total"].iat[0]
    ward = pd.read_parquet(d / "mart_access_ward.parquet")
    lga = pd.read_parquet(d / "mart_access_lga.parquet")
    assert lga["pop_total"].sum() == pytest.approx(pop, rel=1e-6)
    if len(ward):
        assert ward["pop_total"].sum() == pytest.approx(pop, rel=0.01)
        assert ward["pop_total"].sum() + s["pop_outside_wards"].iat[0] == pytest.approx(pop, rel=1e-6)
    fac = pd.read_parquet(d / "mart_access_facility.parquet")
    dim = pd.read_parquet(StatePaths(code).staging / "dim_facility.parquet")
    assert set(fac["facility_id"]) == set(dim["facility_id"]) and fac["facility_id"].is_unique
    assert not fac.loc[fac["coord_status"].eq("location_unverified"), "access_computed"].any()
    comp = fac[fac["access_computed"]]
    assert comp["catchment_pop"].notna().all()
    # Catchments of this state's facilities never exceed the state population.
    assert comp["catchment_pop"].sum() <= pop * (1 + 1e-6)
    for col in [c for c in s.columns if c.startswith("pct_beyond_")]:
        assert 0 <= s[col].iat[0] <= 100
    gj = json.loads((d / "wards.geojson").read_text(encoding="utf-8")) if (d / "wards.geojson").exists() else None
    if gj:
        assert len(gj["features"]) == len(ward)
        assert (d / "wards.geojson").stat().st_size < 1.6e6
    assert (pd.read_parquet(d / "access_candidates.parquet")["data_class"] == "real-derived").all()
