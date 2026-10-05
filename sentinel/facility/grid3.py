"""Phase 1: Bauchi facility master and LGA geography from GRID3 (real, public data).

fetch()  downloads the raw layers into data/raw/grid3 (committed, so builds are offline).
build()  filters to public primary facilities, standardises, de-duplicates and
         validates each coordinate against its LGA polygon.
"""
from __future__ import annotations

import hashlib
import json
import re
import string

import pandas as pd
import requests
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

from ..config import RAW_DIR, STAGING_DIR, settings

ARCGIS = "https://services3.arcgis.com/BU6Aadhn6tbBEdyk/arcgis/rest/services"
FACILITY_LAYER = "GRID3_NGA_health_facility_v3_0"
LGA_LAYER = "NGA_LGA_Boundaries_2"
GRID3_DIR = RAW_DIR / "grid3"

FACILITY_FIELDS = [
    "unique_id", "latitude", "longitude", "state_standard", "lga_standard", "ward_standard",
    "facility_name", "facility_level", "facility_type", "facility_ownership",
    "facility_ownership_type", "functional", "nhfr_facility_code", "issues", "flag_count",
]


def _query_geojson(layer: str, where: str, out_fields: str, page: int = 1000, **extra) -> dict:
    features, offset = [], 0
    while True:
        params = {
            "where": where, "outFields": out_fields, "f": "geojson", "orderByFields": "OBJECTID" if layer == FACILITY_LAYER else "FID",
            "resultOffset": offset, "resultRecordCount": page, **extra,
        }
        r = requests.get(f"{ARCGIS}/{layer}/FeatureServer/0/query", params=params, timeout=120)
        r.raise_for_status()
        batch = r.json().get("features", [])
        features.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return {"type": "FeatureCollection", "features": features}


def raw_paths(state: str) -> tuple:
    s = state.lower()
    return GRID3_DIR / f"{s}_health_facilities_v3.geojson", GRID3_DIR / f"{s}_lga_boundaries.geojson"


def fetch(state: str | None = None) -> None:
    state = state or settings()["state"]
    GRID3_DIR.mkdir(parents=True, exist_ok=True)
    fac_path, lga_path = raw_paths(state)
    fac = _query_geojson(FACILITY_LAYER, f"state_standard='{state}'", ",".join(FACILITY_FIELDS))
    fac_path.write_text(json.dumps(fac), encoding="utf-8")
    lga = _query_geojson(LGA_LAYER, f"statename='{state}'", "lganame,lgacode,statename",
                         page=100, geometryPrecision=5)
    lga_path.write_text(json.dumps(lga), encoding="utf-8")
    print(f"GRID3: {len(fac['features'])} facilities, {len(lga['features'])} LGA polygons -> {GRID3_DIR}")


# Spelling differences between the GRID3 facility layer and the boundary layer.
LGA_ALIASES = {"damban": "dambam"}


def norm_key(s: str) -> str:
    k = re.sub(r"[^a-z0-9]", "", str(s).lower())
    return LGA_ALIASES.get(k, k)


def clean_name(s: str) -> str:
    return re.sub(r"\s+", " ", str(s)).strip()


def synthetic_uid(seed: str) -> str:
    """Deterministic 11-character DHIS2-style UID (first char a letter)."""
    alphabet = string.ascii_letters + string.digits
    h = hashlib.sha256(seed.encode()).digest()
    return string.ascii_letters[h[0] % 52] + "".join(alphabet[b % 62] for b in h[1:11])


def _haversine_m(lat1, lon1, lat2, lon2):
    import numpy as np
    r = 6_371_000
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(lon2 - lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def build(state: str | None = None) -> pd.DataFrame:
    state = state or settings()["state"]
    fac_path, lga_path = raw_paths(state)
    fac = pd.DataFrame([f["properties"] for f in json.loads(fac_path.read_text(encoding="utf-8"))["features"]])
    lga_fc = json.loads(lga_path.read_text(encoding="utf-8"))
    log: dict[str, int] = {"raw_records": len(fac)}

    fac = fac[(fac["facility_level"] == "Primary") & (fac["facility_ownership"] == "Public")].copy()
    log["public_primary"] = len(fac)

    fac["facility_name"] = fac["facility_name"].map(clean_name)
    fac["lga"] = fac["lga_standard"].map(clean_name)
    fac["ward"] = fac["ward_standard"].fillna("").map(clean_name)
    n = len(fac)
    fac = fac.dropna(subset=["latitude", "longitude"])
    log["missing_coordinates_dropped"] = n - len(fac)
    n = len(fac)
    fac = fac.drop_duplicates("unique_id")
    log["duplicate_ids_dropped"] = n - len(fac)

    # De-duplicate: same normalised name in the same LGA within 100 m; keep the record with fewer GRID3 flags.
    fac["name_key"] = fac["facility_name"].map(norm_key)
    fac["flag_count"] = fac["flag_count"].fillna(0)
    fac = fac.sort_values(["flag_count", "unique_id"])
    keep = []
    for _, grp in fac.groupby(["lga", "name_key"], sort=False):
        kept: list = []
        for idx, row in grp.iterrows():
            if any(_haversine_m(row.latitude, row.longitude, fac.at[k, "latitude"], fac.at[k, "longitude"]) < 100 for k in kept):
                continue
            kept.append(idx)
        keep.extend(kept)
    log["near_duplicates_removed"] = len(fac) - len(keep)
    fac = fac.loc[keep]

    # Validate each coordinate against its own LGA polygon.
    lgas = {norm_key(f["properties"]["lganame"]): f for f in lga_fc["features"]}
    unmatched = sorted(set(fac["lga"].map(norm_key)) - set(lgas))
    if unmatched:
        raise ValueError(f"facility LGAs with no boundary polygon: {unmatched}")
    polys = {k: shape(f["geometry"]) for k, f in lgas.items()}
    keys = list(polys)
    tree = STRtree([polys[k] for k in keys])

    def containing_lga(pt: Point) -> str | None:
        for i in tree.query(pt, predicate="within"):
            return keys[int(i)]
        return None

    pts = [Point(lon, lat) for lat, lon in zip(fac["latitude"], fac["longitude"])]
    fac["lga_key"] = fac["lga"].map(norm_key)
    fac["in_lga_polygon"] = [polys[k].contains(p) for k, p in zip(fac["lga_key"], pts)]
    fac["dist_to_lga_m"] = [
        0.0 if inside else polys[k].distance(p) * 111_000  # degrees -> metres, approximate
        for k, p, inside in zip(fac["lga_key"], pts, fac["in_lga_polygon"])
    ]
    fac["polygon_lga"] = [containing_lga(p) for p in pts]
    log["outside_own_lga_polygon"] = int((~fac["in_lga_polygon"]).sum())
    log["outside_state"] = int(fac["polygon_lga"].isna().sum())

    lga_code = {norm_key(f["properties"]["lganame"]): f["properties"]["lgacode"] for f in lga_fc["features"]}
    lga_name = {norm_key(f["properties"]["lganame"]): f["properties"]["lganame"] for f in lga_fc["features"]}

    dim = pd.DataFrame({
        "facility_id": fac["unique_id"],
        "name": fac["facility_name"],
        "state": state,
        "lga_id": fac["lga_key"].map(lga_code).astype(str),
        "lga": fac["lga_key"].map(lga_name),   # boundary-layer spelling is canonical
        "ward": fac["ward"],
        "latitude": fac["latitude"].round(6),
        "longitude": fac["longitude"].round(6),
        "facility_type": fac["facility_type"],
        "ownership_type": fac["facility_ownership_type"],
        "functional_status": fac["functional"],
        "nhfr_code": fac["nhfr_facility_code"].replace("", None),
        "in_lga_polygon": fac["in_lga_polygon"],
        "dist_to_lga_m": fac["dist_to_lga_m"].round(0),
        # ok: inside own LGA; near_boundary: within 5 km (boundary precision);
        # invalid: implausible point. Invalid points are kept as facilities (they
        # still report) but are not drawn on the map.
        "coord_status": [
            "ok" if inside else ("near_boundary" if d <= 5000 else "invalid")
            for inside, d in zip(fac["in_lga_polygon"], fac["dist_to_lga_m"])],
        # Linkage keys to DHIS2 / NHLMIS. In a pilot these come from the state's
        # org unit list; here they are deterministic synthetic mirrors.
        "dhis2_orgunit_uid": fac["unique_id"].map(lambda u: synthetic_uid("ou:" + u)),
        "lmis_facility_code": fac["unique_id"].map(lambda u: "BA-LMIS-" + hashlib.md5(u.encode()).hexdigest()[:6].upper()),
    }).sort_values(["lga", "name"]).reset_index(drop=True)

    assert dim["dhis2_orgunit_uid"].is_unique and dim["lmis_facility_code"].is_unique

    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    dim.to_parquet(STAGING_DIR / "dim_facility.parquet", index=False)
    lga_out = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": f["geometry"], "properties": {
            "lga_id": str(f["properties"]["lgacode"]), "lga": f["properties"]["lganame"], "state": state}}
        for f in lga_fc["features"]]}
    (STAGING_DIR / "dim_lga.geojson").write_text(json.dumps(lga_out), encoding="utf-8")

    log["facilities_loaded"] = len(dim)
    log["lgas"] = dim["lga"].nunique()
    print("Facility master:", json.dumps(log))
    return dim
