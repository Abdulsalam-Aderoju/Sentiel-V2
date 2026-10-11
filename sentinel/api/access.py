"""Access and travel burden API (Workstream A). Real-derived: WorldPop 2026 population, MAP friction surfaces
(walking and motorised) and GRID3 facilities and wards. Nothing here is simulated, but the facility catchments
are geographic proximity, not observed utilisation."""
from __future__ import annotations

import base64
from functools import lru_cache

from fastapi import APIRouter, HTTPException, Path, Query, Response

from ..config import settings
from .common import one as _one, q as _q, state_info

router = APIRouter(tags=["access"])
CODE = Path(..., description="State code, e.g. bauchi")
CACHE = "public, max-age=3600"
NOTE = ("Real-derived: WorldPop 2026 constrained population (100 m), MAP 2020 walking and motorised friction "
        "surfaces, GRID3 facilities and wards. Catchments are geographic proximity, not observed use. "
        "Covers the 12 demo states; facilities outside them are not counted as alternatives.")


def frac(rows):
    """The access marts store shares as percentages (0-100); the API returns fractions (0-1) like every other endpoint."""
    if rows is None:
        return None
    if isinstance(rows, list):
        return [frac(r) for r in rows]
    return {k: (v / 100.0 if k.startswith("pct_") and isinstance(v, (int, float)) else v) for k, v in rows.items()}


def q(sql: str, **p) -> list[dict]:
    return frac(_q(sql, **p))


def one(sql: str, **p) -> dict | None:
    return frac(_one(sql, **p))


@lru_cache
def available() -> bool:
    return bool(one("SELECT to_regclass('mart_access_national') IS NOT NULL AS ok")["ok"])


def _need() -> None:
    if not available():
        raise HTTPException(404, "access marts not loaded: run `python -m sentinel fetch-access` then `python -m sentinel access`")


def _cfg() -> dict:
    a = settings()["access"]
    return {"primary_mode": a["primary_mode"], "main_threshold_minutes": a["main_threshold_minutes"],
            "thresholds_minutes": a["thresholds_minutes"], "facility_filter": a["facility_filter"]}


@lru_cache(maxsize=32)
def _state(code: str) -> dict:
    s = one("SELECT * FROM mart_access_state WHERE state_code = :c", c=code)
    if s is None:
        raise HTTPException(404, f"no access figures for {code}")
    lgas = q("""SELECT lga_id, lga, pop_total, pop_beyond_main, pct_beyond_main, pct_beyond_30min_walk,
                       pct_beyond_120min_walk, walk_mean_min, walk_median_min, motor_mean_min, n_facilities, n_wards,
                       rank_pop_beyond_main
                FROM mart_access_lga WHERE state_code = :c ORDER BY rank_pop_beyond_main""", c=code)
    wards = q("""SELECT ward_code, ward, lga_id, lga, pop_total, pop_beyond_main, pct_beyond_main, walk_mean_min,
                        n_facilities, hotspot_rank
                 FROM mart_access_ward WHERE state_code = :c AND hotspot_rank <= 15 ORDER BY hotspot_rank""", c=code)
    cand = q("""SELECT rank, longitude, latitude, cell_population, walk_min, motor_min, nearest_facility_id,
                       nearest_facility_name, lga_id, lga, ward, note
                FROM access_candidates WHERE state_code = :c ORDER BY rank""", c=code)
    # Isolated PHCs ranked by impact: people in the catchment who live beyond the main threshold, then catchment size.
    iso = q("""SELECT a.facility_id, a.name, a.latitude, a.longitude, a.lga_id, a.lga, a.ward, a.catchment_pop, a.catchment_pop_beyond_main,
                      a.catchment_mean_walk_min, a.alt_facility_name, a.alt_walk_min, a.alt_km, a.isolated,
                      l.live_tag, l.live_queue
               FROM mart_access_facility a LEFT JOIN mart_facility_live l USING (facility_id)
               WHERE a.state_code = :c AND a.access_computed AND a.isolated
               ORDER BY a.catchment_pop_beyond_main DESC NULLS LAST, a.catchment_pop DESC LIMIT 25""", c=code) \
        if one("SELECT to_regclass('mart_facility_live') IS NOT NULL AS ok")["ok"] else \
        q("""SELECT facility_id, name, latitude, longitude, lga_id, lga, ward, catchment_pop, catchment_pop_beyond_main, catchment_mean_walk_min,
                    alt_facility_name, alt_walk_min, alt_km, isolated
             FROM mart_access_facility WHERE state_code = :c AND access_computed AND isolated
             ORDER BY catchment_pop_beyond_main DESC NULLS LAST, catchment_pop DESC LIMIT 25""", c=code)
    layer = one("SELECT meta FROM access_layers WHERE state_code = :c AND kind = 'travel_time'", c=code)
    return {"state": state_info(code), "settings": _cfg(), "note": NOTE, "data_class": "real-derived",
            "summary": s, "lgas": lgas, "hotspot_wards": wards, "candidates": cand, "isolated_facilities": iso,
            "travel_time_layer": (layer or {}).get("meta")}


@router.get("/state/{code}/access")
def state_access(response: Response, code: str = CODE):
    """State travel burden: headline figures, every LGA, the 15 worst wards, candidate areas and isolated PHCs."""
    _need()
    state_info(code)
    response.headers["Cache-Control"] = CACHE
    return _state(code)


@lru_cache(maxsize=32)
def _wards_geojson(code: str) -> str:
    r = one("SELECT content FROM access_layers WHERE state_code = :c AND kind = 'wards'", c=code)
    if r is None:
        raise HTTPException(404, f"no ward layer for {code}")
    return r["content"]


@router.get("/state/{code}/access/wards.geojson")
def state_access_wards(code: str = CODE):
    """Ward polygons (simplified ~200 m) with population and share beyond the main threshold."""
    _need()
    state_info(code)
    return Response(_wards_geojson(code), media_type="application/geo+json", headers={"Cache-Control": CACHE})


@lru_cache(maxsize=32)
def _travel_png(code: str) -> bytes:
    r = one("SELECT content FROM access_layers WHERE state_code = :c AND kind = 'travel_time'", c=code)
    if r is None:
        raise HTTPException(404, f"no travel-time image for {code}")
    return base64.b64decode(r["content"])


@router.get("/state/{code}/access/travel-time.png")
def state_access_png(code: str = CODE):
    """Walking travel time to the nearest PHC, classed, Web Mercator; bounds in /state/{code}/access."""
    _need()
    state_info(code)
    return Response(_travel_png(code), media_type="image/png", headers={"Cache-Control": CACHE})


@router.get("/state/{code}/facility/{facility_id}/access")
def facility_access(code: str = CODE, facility_id: str = Path(...)):
    """One facility's catchment, nearest alternative PHC and isolation flag."""
    _need()
    r = one("SELECT * FROM mart_access_facility WHERE facility_id = :f AND state_code = :c", f=facility_id, c=code)
    if r is None:
        raise HTTPException(404, f"unknown facility {facility_id} in {code}")
    return {"facility": r, "settings": _cfg(), "note": NOTE}


@lru_cache
def _national() -> dict:
    nat = one("SELECT * FROM mart_access_national")
    zones = q("SELECT * FROM mart_access_zone")
    order = {z: i for i, z in enumerate(settings()["zones"])}
    zones.sort(key=lambda z: order.get(z["zone"], 99))
    sts = q("""SELECT state_code, state, zone, pop_total, pop_beyond_main, pct_beyond_main, walk_mean_min, n_isolated,
                      n_facilities_computed FROM mart_access_state ORDER BY pct_beyond_main DESC""")
    return {"national": nat, "zones": zones, "states": sts, "settings": _cfg(), "note": NOTE, "data_class": "real-derived"}


@router.get("/national/access")
def national_access(response: Response):
    """Travel burden across the 12 demo states, by zone and state (sums of state counts; rates recomputed)."""
    _need()
    response.headers["Cache-Control"] = CACHE
    return _national()


def state_metric_rows() -> dict[str, dict]:
    """For the national map: state_code -> access figures (empty when the marts are not loaded)."""
    if not available():
        return {}
    return {r["state_code"]: r for r in q("""SELECT state_code, pct_beyond_main AS pct_pop_beyond_threshold,
                                                     pop_beyond_main AS pop_beyond_threshold, pop_total AS access_pop_total
                                              FROM mart_access_state""")}


@router.get("/state/{code}/access/lga/{lga_id}")
def lga_access(code: str = CODE, lga_id: str = Path(...), limit: int = Query(200, le=500)):
    """An LGA's wards and facilities with access figures."""
    _need()
    lga = one("SELECT * FROM mart_access_lga WHERE state_code = :c AND lga_id = :l", c=code, l=lga_id)
    if lga is None:
        raise HTTPException(404, f"no access figures for LGA {lga_id}")
    wards = q("""SELECT ward_code, ward, pop_total, pop_beyond_main, pct_beyond_main, walk_mean_min, n_facilities, hotspot_rank
                 FROM mart_access_ward WHERE state_code = :c AND lga_id = :l ORDER BY pop_beyond_main DESC""", c=code, l=lga_id)
    fac = q("""SELECT facility_id, name, catchment_pop, catchment_pop_beyond_main, alt_walk_min, isolated
               FROM mart_access_facility WHERE state_code = :c AND lga_id = :l AND access_computed
               ORDER BY catchment_pop DESC LIMIT :n""", c=code, l=lga_id, n=limit)
    return {"lga": lga, "wards": wards, "facilities": fac, "note": NOTE}
