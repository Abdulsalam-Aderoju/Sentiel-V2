"""Download the external inputs for the access and travel-burden marts into data/raw/access/.

fetch_national()  WorldPop population raster and MAP friction surfaces (Nigeria clip), once.
fetch_wards(code) GRID3 ward boundaries for one state (simplified).

Large rasters are not committed (data/raw/access/ is gitignored). Every file's SHA-256 is
written to data/raw/access/manifest.json and recorded in docs/data_sources.md.
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import requests

from ..config import RAW_DIR, settings
from ..config import state as state_cfg

ACCESS_RAW = RAW_DIR / "access"
ARCGIS = "https://services3.arcgis.com/BU6Aadhn6tbBEdyk/arcgis/rest/services"
MANIFEST = ACCESS_RAW / "manifest.json"


def cfg() -> dict:
    return settings()["access"]


def population_path() -> Path:
    return ACCESS_RAW / Path(cfg()["sources"]["population"]["url"]).name


def friction_path(mode: str) -> Path:
    return ACCESS_RAW / f"map_friction_{mode}_2020_nga.tif"


def wards_path(code: str) -> Path:
    return ACCESS_RAW / "wards" / f"{code}_wards.geojson"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _record(path: Path, url: str) -> None:
    man = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    man[path.relative_to(ACCESS_RAW).as_posix()] = {
        "url": url, "bytes": path.stat().st_size, "sha256": sha256(path),
        "downloaded": time.strftime("%Y-%m-%d")}
    MANIFEST.write_text(json.dumps(man, indent=1), encoding="utf-8")


def _download(url: str, dest: Path, params: dict | None = None, force: bool = False) -> None:
    if dest.exists() and not force:
        print(f"exists: {dest.name}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(4):
        try:
            with requests.get(url, params=params, stream=True, timeout=300) as r:
                r.raise_for_status()
                if "xml" in r.headers.get("content-type", ""):
                    raise RuntimeError(f"server returned XML, not a raster: {r.text[:500]}")
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            break
        except (requests.RequestException, OSError) as e:
            if attempt == 3:
                raise
            print(f"retry {attempt + 1} after {e}")
            time.sleep(5 * (attempt + 1))
    tmp.replace(dest)
    full = requests.Request("GET", url, params=params).prepare().url
    _record(dest, full)
    print(f"downloaded {dest.name} ({dest.stat().st_size / 1e6:.1f} MB)")


def fetch_national(force: bool = False) -> None:
    src = cfg()["sources"]
    _download(src["population"]["url"], population_path(), force=force)
    x0, y0, x1, y1 = src["friction_bbox"]
    for mode, cov in (("walking", src["friction_walking"]), ("motorised", src["friction_motorised"])):
        params = {"service": "WCS", "version": "2.0.1", "request": "GetCoverage", "coverageId": cov,
                  "subset": [f"Long({x0},{x1})", f"Lat({y0},{y1})"], "format": "image/geotiff"}
        try:
            _download(src["friction_wcs"], friction_path(mode), params=params, force=force)
        except Exception as e:  # noqa: BLE001 - friction is optional; compute falls back to distance
            print(f"WARNING: {mode} friction surface unavailable ({e}); access falls back to distance")


def fetch_wards(code: str, force: bool = False) -> None:
    """GRID3 ward polygons for one state, simplified (~100 m) with 5-decimal coordinates."""
    dest = wards_path(code)
    if dest.exists() and not force:
        return
    st = state_cfg(code)
    layer = cfg()["sources"]["wards_layer"]
    feats, offset = [], 0
    while True:
        r = requests.get(f"{ARCGIS}/{layer}/FeatureServer/0/query", timeout=180, params={
            "where": f"statecode='{st['grid3_code']}'",
            "outFields": "wardname,wardcode,lganame,lgacode,statename,statecode,urban",
            "orderByFields": "FID", "resultOffset": offset, "resultRecordCount": 500,
            "maxAllowableOffset": 0.001, "geometryPrecision": 5, "f": "geojson"})
        r.raise_for_status()
        batch = r.json().get("features", [])
        feats.extend(batch)
        if len(batch) < 500:
            break
        offset += 500
    if not feats:
        raise RuntimeError(f"no GRID3 wards for {code} (statecode {st['grid3_code']})")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps({"type": "FeatureCollection", "features": feats}), encoding="utf-8")
    _record(dest, f"{ARCGIS}/{layer}/FeatureServer/0/query?where=statecode='{st['grid3_code']}'")
    print(f"GRID3 wards {st['name']}: {len(feats)}")
