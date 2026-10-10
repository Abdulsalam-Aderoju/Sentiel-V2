"""Access and travel burden (Workstream A): real-data derived, nothing simulated.

For each state, on a ~1 km equal-area grid (Lambert azimuthal equal-area centred on the
state, so every cell has the same area and distances are near-true):

1. WorldPop 100 m population counts are binned into working cells by pixel centre (total
   population is conserved exactly) and clipped to the state (union of its GRID3 LGA polygons).
   Ward and LGA membership is decided at 100 m, so ward and LGA totals are as exact as the
   boundaries allow.
2. Travel time to the nearest included facility: cost-distance (skimage MCP_Geometric) over the
   MAP 2020 friction surfaces (minutes per metre), seeded at facility cells; walking and, when
   available, motorised. Straight-line distance to the nearest facility is always computed.
   The grid extends `buffer_km` beyond the state, so routes may leave the state and, with
   `cross_border_facilities`, reach facilities of other covered states.
3. Population-weighted ward, LGA and state measures; per-facility catchment (cells assigned to
   their nearest facility by travel time) and nearest alternative PHC; candidate areas for
   outreach or new service points.

A travel time of exactly the threshold counts as *within* it; only t > threshold is "beyond".
Facilities with coord_status 'location_unverified' keep a row but do not seed travel time.
"""
from __future__ import annotations

import json
import math
import time

import numpy as np
import pandas as pd

from ..config import NATIONAL_DIR, StatePaths, settings, state_codes
from ..config import state as state_cfg
from .fetch import friction_path, population_path, wards_path

MODES = ("walking", "motorised")
SHORT = {"walking": "walk", "motorised": "motor"}
NOTE = "candidate area for outreach or a new service point"
# Mean distance from a uniformly random point in a square to its centre, as a share of the
# side: (sqrt(2) + ln(1 + sqrt(2))) / 6 = 0.3826.
INTRA_CELL_FACTOR = (math.sqrt(2) + math.log(1 + math.sqrt(2))) / 6


def cfg() -> dict:
    return settings()["access"]


# ---------------------------------------------------------------------------------------
# Core numerics (pure functions, unit-tested on synthetic grids)
# ---------------------------------------------------------------------------------------
def aggregate_population(rows: np.ndarray, cols: np.ndarray, pop: np.ndarray, shape: tuple) -> np.ndarray:
    """Sum fine-pixel population into working cells by (row, col). Conserves the total exactly."""
    ny, nx = shape
    idx = np.asarray(rows, dtype=np.int64) * nx + np.asarray(cols, dtype=np.int64)
    return np.bincount(idx, weights=np.asarray(pop, dtype=np.float64), minlength=ny * nx).reshape(shape)


def filter_facilities(fac: pd.DataFrame, mode: str) -> pd.Series:
    """Boolean mask of facilities counted as service points (access.facility_filter)."""
    status = fac["functional_status"].fillna("Unknown").astype(str).str.lower()
    if mode == "exclude_non_functional":
        return ~status.str.replace(r"[^a-z]", "", regex=True).eq("notfunctional")
    if mode == "functional_only":
        return status.eq("functional")
    if mode == "all":
        return pd.Series(True, index=fac.index)
    raise ValueError(f"unknown access.facility_filter {mode!r}")


def cost_distance(friction: np.ndarray, seed_rc: np.ndarray, res_m: float) -> tuple[np.ndarray, np.ndarray]:
    """Accumulated cost (friction units x metres, i.e. minutes for min/m friction) from the
    nearest seed, and for every cell the index of that seed (-1 if unreachable).

    Friction must be finite and positive where passable; inf/NaN cells are impassable.
    When several seeds share a cell the first one owns it (callers split catchments)."""
    from skimage.graph import MCP_Geometric

    f = np.where(np.isfinite(friction) & (friction > 0), friction, np.inf).astype(np.float64)
    seed_rc = np.asarray(seed_rc, dtype=np.int64).reshape(-1, 2)
    ny, nx = f.shape
    if len(seed_rc) == 0:
        return np.full(f.shape, np.inf), np.full(f.shape, -1, dtype=np.int64)
    # Seeds on impassable cells (e.g. a facility on a water pixel) still need to propagate.
    f[seed_rc[:, 0], seed_rc[:, 1]] = np.where(np.isfinite(f[seed_rc[:, 0], seed_rc[:, 1]]),
                                               f[seed_rc[:, 0], seed_rc[:, 1]], np.nanmedian(friction))
    mcp = MCP_Geometric(f, sampling=(res_m, res_m), fully_connected=True)
    cost, tb = mcp.find_costs([tuple(x) for x in seed_rc])
    offsets = np.asarray(mcp.offsets)
    flat = np.arange(ny * nx, dtype=np.int64)
    tbf = tb.ravel()
    pred = flat.copy()
    ok = tbf >= 0
    r, c = np.divmod(flat[ok], nx)
    o = offsets[tbf[ok]]
    pred[ok] = (r - o[:, 0]) * nx + (c - o[:, 1])   # predecessor = cell - offset (skimage convention)
    for _ in range(64):                               # pointer doubling to the root (start) cell
        nxt = pred[pred]
        if np.array_equal(nxt, pred):
            break
        pred = nxt
    owner = np.full(ny * nx, -1, dtype=np.int64)
    seed_flat = seed_rc[:, 0] * nx + seed_rc[:, 1]
    owner[seed_flat[::-1]] = np.arange(len(seed_rc))[::-1]   # first seed in a cell wins
    label = owner[pred]
    label[~np.isfinite(cost.ravel())] = -1
    return cost, label.reshape(f.shape)


def boundary_alternatives(cost: np.ndarray, label: np.ndarray, friction: np.ndarray, res_m: float) -> pd.DataFrame:
    """Nearest other seed for every seed that owns a region: min over adjacent cell pairs
    (c1 in region a, c2 in region b) of cost(c1) + step(c1, c2) + cost(c2). A shortest path
    from a to any other seed must leave a's region somewhere, so this is exact on the grid.
    Returns columns seed, alt_seed, alt_cost."""
    f = np.where(np.isfinite(friction) & (friction > 0), friction, np.inf)
    ny, nx = label.shape
    parts = []
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        length = res_m * math.hypot(dy, dx)
        ys_a, ys_b = slice(0, ny - dy), slice(dy, ny)
        if dx == 1:
            xs_a, xs_b = slice(0, nx - 1), slice(1, nx)
        elif dx == -1:
            xs_a, xs_b = slice(1, nx), slice(0, nx - 1)
        else:
            xs_a = xs_b = slice(0, nx)
        la, lb = label[ys_a, xs_a].ravel(), label[ys_b, xs_b].ravel()
        m = (la != lb) & (la >= 0) & (lb >= 0)
        if not m.any():
            continue
        val = (cost[ys_a, xs_a].ravel()[m] + cost[ys_b, xs_b].ravel()[m]
               + (f[ys_a, xs_a].ravel()[m] + f[ys_b, xs_b].ravel()[m]) / 2 * length)
        parts.append(pd.DataFrame({"seed": la[m], "alt_seed": lb[m], "alt_cost": val}))
        parts.append(pd.DataFrame({"seed": lb[m], "alt_seed": la[m], "alt_cost": val}))
    if not parts:
        return pd.DataFrame(columns=["seed", "alt_seed", "alt_cost"])
    d = pd.concat(parts, ignore_index=True)
    d = d[np.isfinite(d["alt_cost"])]
    return d.loc[d.groupby("seed")["alt_cost"].idxmin()].reset_index(drop=True)


def beyond(values: np.ndarray, threshold: float) -> np.ndarray:
    """True where a value is strictly beyond the threshold (exactly at it counts as within)."""
    return np.asarray(values, dtype=float) > threshold


def weighted_stats(df: pd.DataFrame, key: str, val: str, w: str) -> pd.DataFrame:
    """Population-weighted mean and median of `val` per `key` (finite values only)."""
    d = df.loc[np.isfinite(df[val]) & (df[w] > 0), [key, val, w]].sort_values([key, val])
    if d.empty:
        return pd.DataFrame(columns=["mean", "median"])
    g = d.groupby(key, sort=False)
    mean = (d[val] * d[w]).groupby(d[key]).sum() / g[w].sum()
    cum = g[w].cumsum()
    half = g[w].transform("sum") / 2
    median = d.loc[cum >= half].groupby(key)[val].first()
    return pd.DataFrame({"mean": mean, "median": median})


# ---------------------------------------------------------------------------------------
# Per-state build
# ---------------------------------------------------------------------------------------
def _thresholds(c: dict) -> dict:
    return {"walking": c["thresholds_minutes"], "motorised": c["thresholds_minutes_motorised"],
            "distance": c["thresholds_km"]}


def _metric_cols(units: pd.DataFrame, key: str, modes: list[str], c: dict, primary: str, main_thr: float) -> pd.DataFrame:
    """Population-weighted access measures per `key` from units (key, pop, t_<mode>, d_km)."""
    thr = _thresholds(c)
    g = units.groupby(key)
    out = pd.DataFrame({"pop_total": g["pop"].sum()})
    for mode in modes + ["distance"]:
        col = "d_km" if mode == "distance" else f"t_{mode}"
        s = "dist" if mode == "distance" else SHORT[mode]
        unit = "km" if mode == "distance" else "min"
        ws = weighted_stats(units, key, col, "pop")
        out[f"{s}_mean_{unit}"] = ws["mean"]
        out[f"{s}_median_{unit}"] = ws["median"]
        fin = np.isfinite(units[col])
        out[f"sum_pop_x_{s}_{unit}"] = (units[col].where(fin, 0) * units["pop"]).groupby(units[key]).sum()
        out[f"pop_{s}_finite"] = units["pop"].where(fin, 0).groupby(units[key]).sum()
        for t in thr[mode]:
            tag = f"{t:g}{unit}_{s}" if mode != "distance" else f"{t:g}km"
            out[f"pop_beyond_{tag}"] = units["pop"].where(beyond(units[col], t), 0).groupby(units[key]).sum()
            out[f"pct_beyond_{tag}"] = 100 * out[f"pop_beyond_{tag}"] / out["pop_total"]
    pcol = "d_km" if primary == "distance" else f"t_{primary}"
    out["pop_beyond_main"] = units["pop"].where(beyond(units[pcol], main_thr), 0).groupby(units[key]).sum()
    out["pct_beyond_main"] = 100 * out["pop_beyond_main"] / out["pop_total"]
    return out


def _load_facilities(c: dict) -> pd.DataFrame:
    frames = []
    for code in state_codes():
        p = StatePaths(code).staging / "dim_facility.parquet"
        if p.exists():
            frames.append(pd.read_parquet(p))
    fac = pd.concat(frames, ignore_index=True)
    fac["included"] = filter_facilities(fac, c["facility_filter"]).values
    fac["seedable"] = fac["included"] & fac["coord_status"].ne("location_unverified") \
        & fac["latitude"].notna() & fac["longitude"].notna()
    return fac


def run(code: str) -> str:
    import rasterio
    from pyproj import CRS, Transformer
    from rasterio import features
    from rasterio.enums import Resampling
    from rasterio.transform import Affine
    from rasterio.warp import reproject
    from rasterio.windows import Window, from_bounds
    from scipy.spatial import cKDTree
    from shapely.geometry import Point, shape
    from shapely.ops import transform as shp_transform
    from shapely.ops import unary_union
    from shapely.strtree import STRtree

    t0 = time.time()
    c = cfg()
    st = state_cfg(code)
    paths = StatePaths(code)
    out_dir = paths.root / "access"
    out_dir.mkdir(parents=True, exist_ok=True)
    paths.logs.mkdir(parents=True, exist_ok=True)
    log: dict = {"state_code": code, "data_class": c["data_class"]}

    # ---- geography ------------------------------------------------------------------
    lga_fc = json.loads((paths.staging / "dim_lga.geojson").read_text(encoding="utf-8"))
    lga_ids = [str(f["properties"]["lga_id"]) for f in lga_fc["features"]]
    lga_names = {str(f["properties"]["lga_id"]): f["properties"]["lga"] for f in lga_fc["features"]}
    lga_geoms = [shape(f["geometry"]).buffer(0) for f in lga_fc["features"]]
    state_geom = unary_union(lga_geoms)
    cen = state_geom.centroid
    crs = CRS.from_proj4(f"+proj=laea +lat_0={cen.y:.4f} +lon_0={cen.x:.4f} +datum=WGS84 +units=m +no_defs")
    fwd = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    inv = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    state_p = shp_transform(fwd.transform, state_geom)
    res = float(c["working_resolution_m"])
    buf = float(c["buffer_km"]) * 1000
    x0, y0, x1, y1 = state_p.bounds
    x0, y0 = math.floor((x0 - buf) / res) * res, math.floor((y0 - buf) / res) * res
    x1, y1 = math.ceil((x1 + buf) / res) * res, math.ceil((y1 + buf) / res) * res
    nx, ny = int(round((x1 - x0) / res)), int(round((y1 - y0) / res))
    gt = Affine(res, 0, x0, 0, -res, y1)
    log["grid"] = {"crs": crs.to_wkt(), "res_m": res, "shape": [ny, nx], "buffer_km": c["buffer_km"]}

    wards = None
    if wards_path(code).exists():
        wfc = json.loads(wards_path(code).read_text(encoding="utf-8"))
        # GRID3 ships some wards with status 'Invalid' and no geometry; they cannot hold population.
        log["wards_without_geometry"] = [f["properties"].get("wardcode") for f in wfc["features"] if not f.get("geometry")]
        wards = pd.DataFrame([{**{k.lower(): v for k, v in f["properties"].items()},
                               "geometry": shape(f["geometry"]).buffer(0)} for f in wfc["features"] if f.get("geometry")])
        wards["lga_id"] = wards["lgacode"].astype(str)
        wards = wards.drop_duplicates("wardcode").reset_index(drop=True)
        log["wards"] = len(wards)
        log["wards_lga_not_in_dim_lga"] = int((~wards["lga_id"].isin(lga_ids)).sum())
    else:
        log["wards"] = 0
        log["ward_fallback"] = "no ward boundaries; LGA aggregation only"

    # ---- population (100 m -> working grid) -----------------------------------------
    with rasterio.open(population_path()) as src:
        b = state_geom.bounds
        w = from_bounds(*b, transform=src.transform)
        w = Window(math.floor(w.col_off) - 1, math.floor(w.row_off) - 1,
                   math.ceil(w.width) + 3, math.ceil(w.height) + 3).intersection(Window(0, 0, src.width, src.height))
        arr = src.read(1, window=w).astype(np.float64)
        wt = src.window_transform(w)
        if src.nodata is not None:
            arr[arr == src.nodata] = 0
    arr[~np.isfinite(arr) | (arr < 0)] = 0
    shp = arr.shape
    lga_r = features.rasterize([(g, i + 1) for i, g in enumerate(lga_geoms)], out_shape=shp, transform=wt,
                               fill=0, dtype="int32")
    ward_r = (features.rasterize([(g, i + 1) for i, g in enumerate(wards["geometry"])], out_shape=shp,
                                 transform=wt, fill=0, dtype="int32") if wards is not None else np.zeros(shp, "int32"))
    sel = (arr > 0) & (lga_r > 0)
    rr, cc = np.nonzero(sel)
    lon = wt.c + (cc + 0.5) * wt.a
    lat = wt.f + (rr + 0.5) * wt.e
    px, py = fwd.transform(lon, lat)
    col = np.floor((px - x0) / res).astype(np.int64)
    row = np.floor((y1 - py) / res).astype(np.int64)
    units = pd.DataFrame({"cell": row * nx + col, "lga_idx": lga_r[rr, cc] - 1,
                          "ward_idx": ward_r[rr, cc] - 1, "pop": arr[rr, cc]})
    pop_state = float(units["pop"].sum())
    log["population_in_window"] = float(arr.sum())
    log["population_state"] = pop_state
    log["population_outside_wards"] = float(units.loc[units["ward_idx"] < 0, "pop"].sum())
    units = units.groupby(["cell", "lga_idx", "ward_idx"], as_index=False)["pop"].sum()
    cell_pop = aggregate_population(*np.divmod(units["cell"].to_numpy(), nx), units["pop"].to_numpy(), (ny, nx))
    assert abs(cell_pop.sum() - pop_state) < 1e-6 * max(pop_state, 1)
    del arr, lga_r, ward_r, sel, rr, cc, lon, lat, px, py

    # ---- facilities and seeds -------------------------------------------------------
    allfac = _load_facilities(c)
    if not c.get("cross_border_facilities", True):
        allfac = allfac[allfac["state_code"] == code]
    fac = allfac[allfac["state_code"] == code].copy().reset_index(drop=True)
    seeds = allfac[allfac["seedable"]].copy()
    sx, sy = fwd.transform(seeds["longitude"].to_numpy(), seeds["latitude"].to_numpy())
    seeds["x"], seeds["y"] = sx, sy
    seeds["col"] = np.floor((seeds["x"] - x0) / res).astype(int)
    seeds["row"] = np.floor((y1 - seeds["y"]) / res).astype(int)
    seeds = seeds[(seeds["col"].between(0, nx - 1)) & (seeds["row"].between(0, ny - 1))].reset_index(drop=True)
    seeds["cell"] = seeds["row"] * nx + seeds["col"]
    log.update({
        "facility_filter": c["facility_filter"],
        "facilities_total": len(fac),
        "facilities_included": int(fac["included"].sum()),
        "facilities_excluded_by_filter": int((~fac["included"]).sum()),
        "facilities_location_unverified_not_seeded": int((fac["included"] & fac["coord_status"].eq("location_unverified")).sum()),
        "seeds_in_state": int((seeds["state_code"] == code).sum()),
        "seeds_cross_border": int((seeds["state_code"] != code).sum()),
    })

    # ---- travel time and distance ---------------------------------------------------
    modes = [m for m in MODES if friction_path(m).exists()]
    primary = c["primary_mode"] if c["primary_mode"] in modes else "distance"
    if primary != c["primary_mode"]:
        log["primary_mode_fallback"] = f"{c['primary_mode']} friction unavailable; using straight-line distance"
    main_thr = float(c["main_threshold_km"] if primary == "distance" else c["main_threshold_minutes"])
    seed_rc = seeds[["row", "col"]].to_numpy()
    cost, label, fric, raw = {}, {}, {}, {}
    for m in modes:
        with rasterio.open(friction_path(m)) as src:
            dst = np.full((ny, nx), np.nan, dtype=np.float32)
            reproject(source=rasterio.band(src, 1), destination=dst, src_transform=src.transform, src_crs=src.crs,
                      src_nodata=src.nodata, dst_transform=gt, dst_crs=crs.to_wkt(), dst_nodata=np.nan,
                      resampling=getattr(Resampling, c.get("friction_resampling", "average")))
        fric[m] = dst
        cost[m], label[m] = cost_distance(dst, seed_rc, res)
        raw[m] = cost[m].copy()          # centre-to-centre, used for facility-to-facility alternatives
        if len(seed_rc):
            # Cells holding a facility get the mean within-cell trip, not 0 (D45).
            fr = dst[seed_rc[:, 0], seed_rc[:, 1]]
            fr = np.where(np.isfinite(fr) & (fr > 0), fr, np.nanmedian(dst))
            cost[m][seed_rc[:, 0], seed_rc[:, 1]] = INTRA_CELL_FACTOR * res * fr
    gy, gx = np.mgrid[0:ny, 0:nx]
    cx, cy = x0 + (gx.ravel() + 0.5) * res, y1 - (gy.ravel() + 0.5) * res
    tree = cKDTree(seeds[["x", "y"]].to_numpy())
    dist_m, dist_lab = tree.query(np.column_stack([cx, cy]))
    dist_km = (dist_m / 1000).reshape(ny, nx)
    label["distance"] = dist_lab.reshape(ny, nx)
    del gy, gx

    for m in modes:
        units[f"t_{m}"] = cost[m].ravel()[units["cell"]]
    units["d_km"] = dist_km.ravel()[units["cell"]]
    units["label"] = label[primary].ravel()[units["cell"]]
    log["population_unreachable_primary"] = float(units.loc[units["label"] < 0, "pop"].sum())

    # ---- per facility ---------------------------------------------------------------
    seeds["seed"] = np.arange(len(seeds))
    owner_of_cell = seeds.groupby("cell")["seed"].transform("min")
    seeds["owner"] = owner_of_cell
    seeds["n_colocated"] = seeds.groupby("cell")["seed"].transform("size")
    lab_pop = units[units["label"] >= 0].groupby("label")["pop"].sum()
    pcol = "d_km" if primary == "distance" else f"t_{primary}"
    lab_beyond = units[(units["label"] >= 0) & beyond(units[pcol], main_thr)].groupby("label")["pop"].sum()
    seeds["catchment_pop"] = seeds["owner"].map(lab_pop).fillna(0) / seeds["n_colocated"]
    seeds["catchment_pop_beyond_main"] = seeds["owner"].map(lab_beyond).fillna(0) / seeds["n_colocated"]
    if primary == "distance":
        alt = pd.DataFrame({"seed": seeds["seed"]})
        d2, i2 = tree.query(seeds[["x", "y"]].to_numpy(), k=min(2, len(seeds)))
        alt["alt_seed"] = i2[:, 1] if len(seeds) > 1 else -1
        alt["alt_cost"] = np.nan
    else:
        alt = boundary_alternatives(raw[primary], label[primary], fric[primary], res)
    alt_map = alt.set_index("seed")
    alt_seed = seeds["owner"].map(alt_map["alt_seed"]) if len(alt) else pd.Series(np.nan, index=seeds.index)
    alt_cost = seeds["owner"].map(alt_map["alt_cost"]) if len(alt) else pd.Series(np.nan, index=seeds.index)
    # Co-located facilities (same cell) are each other's alternative at 0 minutes.
    first_other = seeds.groupby("cell")["seed"].transform(lambda s: s.iloc[1] if len(s) > 1 else -1)
    coloc = seeds["n_colocated"] > 1
    alt_seed = alt_seed.where(~coloc, np.where(seeds["seed"] == seeds["owner"], first_other, seeds["owner"]))
    alt_cost = alt_cost.where(~coloc, 0.0) if primary != "distance" else alt_cost
    seeds["alt_seed"] = alt_seed.fillna(-1).astype(int)
    seeds["alt_cost"] = alt_cost
    have = seeds["alt_seed"] >= 0
    a_idx = seeds.loc[have, "alt_seed"].to_numpy()
    seeds["alt_facility_id"] = None
    seeds["alt_facility_name"] = None
    seeds["alt_state_code"] = None
    seeds["alt_km"] = np.nan
    seeds.loc[have, "alt_facility_id"] = seeds["facility_id"].to_numpy()[a_idx]
    seeds.loc[have, "alt_facility_name"] = seeds["name"].to_numpy()[a_idx]
    seeds.loc[have, "alt_state_code"] = seeds["state_code"].to_numpy()[a_idx]
    seeds.loc[have, "alt_km"] = np.hypot(seeds.loc[have, "x"].to_numpy() - seeds["x"].to_numpy()[a_idx],
                                         seeds.loc[have, "y"].to_numpy() - seeds["y"].to_numpy()[a_idx]) / 1000
    d2, _ = tree.query(seeds[["x", "y"]].to_numpy(), k=min(2, len(seeds)))
    seeds["nearest_other_km"] = d2[:, 1] / 1000 if len(seeds) > 1 else np.nan
    for m in modes:
        seeds[f"catchment_mean_{SHORT[m]}_min"] = seeds["owner"].map(
            weighted_stats(units[units["label"] >= 0], "label", f"t_{m}", "pop")["mean"])
    alt_val = seeds["alt_km"] if primary == "distance" else seeds["alt_cost"]
    seeds["isolated"] = ~(alt_val <= main_thr)   # no alternative found also counts as isolated

    own = seeds[seeds["state_code"] == code].set_index("facility_id")
    mf = fac[["facility_id", "name", "state_code", "lga_id", "lga", "ward", "latitude", "longitude",
              "facility_type", "ownership_type", "functional_status", "coord_status", "included"]].copy()
    mf["access_computed"] = mf["facility_id"].isin(own.index)
    keep = ["catchment_pop", "catchment_pop_beyond_main"] + [f"catchment_mean_{SHORT[m]}_min" for m in modes] + \
           ["alt_facility_id", "alt_facility_name", "alt_state_code", "alt_cost", "alt_km", "nearest_other_km",
            "isolated", "n_colocated"]
    mf = mf.join(own[keep], on="facility_id")
    if primary == "distance":
        mf = mf.drop(columns="alt_cost")            # distance mode: the alternative is described by alt_km
    else:
        mf = mf.rename(columns={"alt_cost": f"alt_{SHORT[primary]}_min"})
    mf["isolated"] = mf["isolated"].astype("boolean")
    mf["n_colocated"] = mf["n_colocated"].astype("Int64")
    mf["primary_mode"] = primary
    mf["main_threshold"] = main_thr
    mf["data_class"] = c["data_class"]
    unver = fac["included"] & fac["coord_status"].eq("location_unverified")
    log["facilities_unverified_ids"] = fac.loc[unver, "facility_id"].tolist()
    log["population_nearest_out_of_state_facility"] = float(
        units.loc[units["label"].isin(seeds.index[seeds["state_code"] != code]), "pop"].sum())

    # ---- facilities per area (counted by point-in-polygon of seeded own facilities) --
    own_pts = [Point(xy) for xy in zip(own["longitude"], own["latitude"])]
    def _count_in(geoms):
        t = STRtree(own_pts)
        cnt = np.zeros(len(geoms), dtype=int)
        for i, g in enumerate(geoms):
            cnt[i] = len(t.query(g, predicate="contains"))
        return cnt

    # ---- LGA mart -------------------------------------------------------------------
    lga_m = _metric_cols(units, "lga_idx", modes, c, primary, main_thr)
    lga_m.index = [lga_ids[i] for i in lga_m.index]
    lga_m = lga_m.reindex(lga_ids)
    lga_m.insert(0, "lga", [lga_names[i] for i in lga_ids])
    lga_m.insert(0, "lga_id", lga_ids)
    lga_m.insert(0, "state_code", code)
    lga_m["n_facilities"] = own.groupby("lga_id").size().reindex(lga_ids).fillna(0).astype(int).values
    lga_m["n_wards"] = (wards.groupby("lga_id").size().reindex(lga_ids).fillna(0).astype(int).values
                        if wards is not None else 0)
    lga_m["rank_pop_beyond_main"] = lga_m["pop_beyond_main"].rank(ascending=False, method="min").astype("Int64")
    lga_m["primary_mode"], lga_m["main_threshold"], lga_m["data_class"] = primary, main_thr, c["data_class"]
    lga_m = lga_m.reset_index(drop=True)

    # ---- ward mart ------------------------------------------------------------------
    if wards is not None:
        wu = units[units["ward_idx"] >= 0]
        ward_m = _metric_cols(wu, "ward_idx", modes, c, primary, main_thr).reindex(range(len(wards)))
        ward_m["pop_total"] = ward_m["pop_total"].fillna(0)
        ward_m.insert(0, "urban", wards["urban"].values)
        ward_m.insert(0, "ward", wards["wardname"].values)
        ward_m.insert(0, "ward_code", wards["wardcode"].values)
        ward_m.insert(0, "lga", wards["lga_id"].map(lga_names).fillna(wards["lganame"]).values)
        ward_m.insert(0, "lga_id", wards["lga_id"].values)
        ward_m.insert(0, "state_code", code)
        ward_m["n_facilities"] = _count_in(list(wards["geometry"]))
        ward_m["hotspot_rank"] = ward_m["pop_beyond_main"].rank(ascending=False, method="min").astype("Int64")
        ward_m["primary_mode"], ward_m["main_threshold"], ward_m["data_class"] = primary, main_thr, c["data_class"]
        ward_m = ward_m.reset_index(drop=True)
    else:
        ward_m = pd.DataFrame(columns=["state_code", "lga_id", "lga", "ward_code", "ward"])

    # ---- state roll-up --------------------------------------------------------------
    sm = _metric_cols(units.assign(k=0), "k", modes, c, primary, main_thr).reset_index(drop=True)
    sm.insert(0, "zone", st["zone"])
    sm.insert(0, "state", st["name"])
    sm.insert(0, "state_code", code)
    sm["pop_outside_wards"] = log["population_outside_wards"]
    sm["pop_nearest_out_of_state_facility"] = log["population_nearest_out_of_state_facility"]
    sm["pop_unreachable"] = log["population_unreachable_primary"]
    sm["n_facilities_total"] = len(fac)
    sm["n_facilities_included"] = int(fac["included"].sum())
    sm["n_facilities_computed"] = int(mf["access_computed"].sum())
    sm["n_facilities_location_unverified"] = int(unver.sum())
    sm["n_isolated"] = int(mf["isolated"].fillna(False).sum())
    sm["n_lgas"], sm["n_wards"] = len(lga_ids), log["wards"]
    sm["primary_mode"], sm["main_threshold"] = primary, main_thr
    sm["main_threshold_unit"] = "km" if primary == "distance" else "min"
    sm["facility_filter"] = c["facility_filter"]
    sm["population_source"] = c["sources"]["population"]["product"]
    sm["population_year"] = c["sources"]["population"]["year"]
    sm["friction_source"] = "MAP 2020 friction surfaces (Weiss et al. 2020)" if modes else None
    sm["resolution_m"] = res
    sm["data_class"] = c["data_class"]

    # ---- candidate areas ------------------------------------------------------------
    score_val = (dist_km if primary == "distance" else cost[primary]).ravel()
    score = np.where(np.isfinite(score_val), score_val, 0) * cell_pop.ravel()
    order = np.argsort(-score)
    picked: list[int] = []
    sep = float(c["candidate_min_separation_km"]) * 1000
    for i in order[: 20000]:
        if score[i] <= 0 or len(picked) >= int(c["candidates_per_state"]):
            break
        if all(math.hypot(cx[i] - cx[j], cy[i] - cy[j]) >= sep for j in picked):
            picked.append(int(i))
    main_unit = units.sort_values("pop", ascending=False).drop_duplicates("cell").set_index("cell")
    clon, clat = inv.transform(cx[picked], cy[picked])
    cand = pd.DataFrame({"state_code": code, "rank": np.arange(1, len(picked) + 1),
                         "longitude": np.round(clon, 5), "latitude": np.round(clat, 5),
                         "cell_population": cell_pop.ravel()[picked],
                         "score_pop_x_burden": score[picked]})
    for m in modes:
        cand[f"{SHORT[m]}_min"] = cost[m].ravel()[picked]
    cand["dist_km_nearest"] = dist_km.ravel()[picked]
    nl = label[primary].ravel()[picked]
    cand["nearest_facility_id"] = [seeds["facility_id"].iat[k] if k >= 0 else None for k in nl]
    cand["nearest_facility_name"] = [seeds["name"].iat[k] if k >= 0 else None for k in nl]
    mu = main_unit.reindex(picked)
    cand["lga_id"] = [lga_ids[int(i)] if pd.notna(i) else None for i in mu["lga_idx"]]
    cand["lga"] = cand["lga_id"].map(lga_names)
    if wards is not None:
        cand["ward_code"] = [wards["wardcode"].iat[int(i)] if pd.notna(i) and i >= 0 else None for i in mu["ward_idx"]]
        cand["ward"] = [wards["wardname"].iat[int(i)] if pd.notna(i) and i >= 0 else None for i in mu["ward_idx"]]
    cand["cell_size_km"] = res / 1000
    cand["note"] = NOTE
    cand["primary_mode"], cand["data_class"] = primary, c["data_class"]

    # ---- write ----------------------------------------------------------------------
    mf.to_parquet(out_dir / "mart_access_facility.parquet", index=False)
    ward_m.to_parquet(out_dir / "mart_access_ward.parquet", index=False)
    lga_m.to_parquet(out_dir / "mart_access_lga.parquet", index=False)
    sm.to_parquet(out_dir / "mart_access_state.parquet", index=False)
    cand.to_parquet(out_dir / "access_candidates.parquet", index=False)
    if wards is not None:
        _write_wards_geojson(out_dir / "wards.geojson", wards, ward_m, primary, float(c["ward_geojson_simplify_deg"]))
    if primary != "distance":
        _write_overlay(out_dir, cost[primary], state_p, gt, crs, (ny, nx), c["thresholds_minutes"], primary)
    log["runtime_s"] = round(time.time() - t0, 1)
    (paths.logs / "access.json").write_text(json.dumps(log, indent=1, default=float), encoding="utf-8")
    s = sm.iloc[0]
    return (f"{code}: access done in {log['runtime_s']:.0f}s; pop {s.pop_total / 1e6:.2f} M, "
            f"{s.pct_beyond_main:.1f}% beyond {main_thr:g} {s.main_threshold_unit} ({primary}), "
            f"{int(s.n_isolated)} isolated facilities")


def _write_wards_geojson(path, wards, ward_m, primary, tol):
    from shapely.geometry import mapping
    s = SHORT.get(primary, "dist")
    unit = "km" if primary == "distance" else "min"
    cols = {"pop_total": 0, "pop_beyond_main": 0, "pct_beyond_main": 1, f"{s}_mean_{unit}": 1,
            f"{s}_median_{unit}": 1, "n_facilities": None, "hotspot_rank": None}

    def rnd(coords):
        if isinstance(coords[0], (float, int)):
            return [round(coords[0], 4), round(coords[1], 4)]
        return [rnd(x) for x in coords]

    feats = []
    for g, (_, r) in zip(wards["geometry"], ward_m.iterrows()):
        geom = mapping(g.simplify(tol, preserve_topology=True))
        props = {"ward_code": r["ward_code"], "ward": r["ward"], "lga_id": r["lga_id"], "lga": r["lga"],
                 "state_code": r["state_code"]}
        for k, nd in cols.items():
            v = r.get(k)
            props[k] = None if v is None or pd.isna(v) else (int(v) if nd is None else round(float(v), nd))
        feats.append({"type": "Feature", "geometry": {"type": geom["type"], "coordinates": rnd(geom["coordinates"])},
                      "properties": props})
    meta = {"primary_mode": primary, "main_threshold_field": "pct_beyond_main", "data_class": "real-derived"}
    path.write_text(json.dumps({"type": "FeatureCollection", "metadata": meta, "features": feats},
                               separators=(",", ":")), encoding="utf-8")


def _write_overlay(out_dir, cost, state_p, gt, crs, shape_, thresholds, mode):
    """Travel-time classes as a transparent PNG in Web Mercator, bounds in a sidecar JSON."""
    import rasterio
    from PIL import Image
    from rasterio import features
    from rasterio.enums import Resampling
    from rasterio.warp import calculate_default_transform, reproject, transform_bounds

    mask = features.rasterize([(state_p, 1)], out_shape=shape_, transform=gt, fill=0, dtype="uint8")
    edges = [0] + list(thresholds)
    cls = np.digitize(np.where(np.isfinite(cost), cost, 1e9), edges[1:], right=True) + 1  # 1..len+1
    cls = np.where(mask == 1, cls, 0).astype("uint8")
    ny, nx = shape_
    left, top = gt.c, gt.f
    right, bottom = left + nx * gt.a, top + ny * gt.e
    dt, w, h = calculate_default_transform(crs.to_wkt(), "EPSG:3857", nx, ny, left, bottom, right, top)
    dst = np.zeros((h, w), dtype="uint8")
    reproject(cls, dst, src_transform=gt, src_crs=crs.to_wkt(), dst_transform=dt, dst_crs="EPSG:3857",
              resampling=Resampling.nearest, src_nodata=0, dst_nodata=0)
    # Sequential single hue (light = short, dark = long), matching the national map rule (D17).
    colors = ["#c6dbef", "#6baed6", "#2171b5", "#08306b", "#041a3d"][: len(edges)]
    rgba = np.zeros((h, w, 4), dtype="uint8")
    for k, hexc in enumerate(colors, start=1):
        m = dst == k
        rgba[m] = [int(hexc[i:i + 2], 16) for i in (1, 3, 5)] + [200]
    Image.fromarray(rgba, "RGBA").save(out_dir / "travel_time.png", optimize=True)
    w3857 = (dt.c, dt.f + h * dt.e, dt.c + w * dt.a, dt.f)
    lon0, lat0, lon1, lat1 = transform_bounds("EPSG:3857", "EPSG:4326", *w3857)
    labels = [f"<= {edges[1]} min"] + [f"{a}-{b} min" for a, b in zip(edges[1:-1], edges[2:])] + [f"> {edges[-1]} min"]
    (out_dir / "travel_time.json").write_text(json.dumps({
        "image": "travel_time.png", "crs": "EPSG:3857", "mode": mode,
        "bounds": [[round(lat0, 6), round(lon0, 6)], [round(lat1, 6), round(lon1, 6)]],
        "bounds_note": "[[south, west], [north, east]] in degrees; image is Web Mercator (Leaflet imageOverlay)",
        "classes": [{"label": lab, "color": col} for lab, col in zip(labels, colors)],
        "data_class": "real-derived"}, indent=1), encoding="utf-8")


# ---------------------------------------------------------------------------------------
# National roll-up (counts summed, rates recomputed)
# ---------------------------------------------------------------------------------------
def _rollup(df: pd.DataFrame, by: list[str]) -> pd.DataFrame:
    count_cols = [c_ for c_ in df.columns if c_.startswith(("pop_", "sum_pop_x_", "n_"))]
    g = df.groupby(by, sort=False)[count_cols].sum() if by else df[count_cols].sum().to_frame().T
    for c_ in [c_ for c_ in count_cols if c_.startswith("pop_beyond_")]:
        g["pct_" + c_[4:]] = 100 * g[c_] / g["pop_total"]
    for c_ in [c_ for c_ in count_cols if c_.startswith("sum_pop_x_")]:
        s, unit = c_[len("sum_pop_x_"):].rsplit("_", 1)
        g[f"{s}_mean_{unit}"] = g[c_] / g[f"pop_{s}_finite"]
    g["n_states"] = df.groupby(by, sort=False).size() if by else len(df)
    return g.reset_index() if by else g


def build_national() -> pd.DataFrame:
    from ..config import states as all_states
    frames = []
    for st in all_states():
        p = StatePaths(st["code"]).root / "access" / "mart_access_state.parquet"
        if p.exists():
            frames.append(pd.read_parquet(p))
    if not frames:
        raise FileNotFoundError("no per-state access marts; run `python -m sentinel access` first")
    df = pd.concat(frames, ignore_index=True)
    NATIONAL_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(NATIONAL_DIR / "mart_access_state.parquet", index=False)
    zone = _rollup(df, ["zone"])
    nat = _rollup(df, [])
    for d in (zone, nat):
        d["primary_mode"], d["main_threshold"] = df["primary_mode"].iat[0], df["main_threshold"].iat[0]
        d["data_class"] = "real-derived"
        d["coverage_note"] = "covered demo states only (sum of states), not all of Nigeria"
    zone.to_parquet(NATIONAL_DIR / "mart_access_zone.parquet", index=False)
    nat.to_parquet(NATIONAL_DIR / "mart_access_national.parquet", index=False)
    print(f"Access national: {len(df)} states, {nat['pop_total'].iat[0] / 1e6:.1f} M people, "
          f"{nat['pct_beyond_main'].iat[0]:.1f}% beyond main threshold")
    return df
