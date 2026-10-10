# External data sources

Real, public datasets used by PHC Sentinel. Large files are **not committed**: `python -m sentinel fetch-access`
downloads them into `data/raw/access/` (gitignored) and writes `data/raw/access/manifest.json` with URL, size,
download date and SHA-256 for each file. Checksums below are from the download on **10 Oct 2026**. If a provider
republishes a file, the checksum changes; compare with the manifest before trusting a rebuild.

GRID3 health facilities and LGA boundaries (the facility master) are documented in `README.md` and
`docs/decisions.md` (D9-D11); their raw files are committed under `data/raw/grid3/`.

## Access and travel burden (Workstream A)

### 1. Population: WorldPop Global2 R2025A, constrained, 100 m, 2026

| | |
|---|---|
| Product | WorldPop Global2 R2025A v1, constrained population counts (people per 100 m pixel), Nigeria |
| Year | **2026** (R2025A covers 2015-2030; years after the input census/estimates are projections). 2026 matches the analysis period (`calendar.last_period` 2026-09). Configurable: `access.sources.population` |
| URL | https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/2026/NGA/v1/100m/constrained/nga_pop_2026_CN_100m_R2025A_v1.tif |
| File | `nga_pop_2026_CN_100m_R2025A_v1.tif`, 158,261,911 bytes, EPSG:4326, 3 arc-second (~100 m), 14,418 x 11,539, nodata -99999, file created 2025-08-08 |
| SHA-256 | `faf500222458db1fad3baf5012c70c935ea0e5fedc4c1e78fa8d4565cb0994b0` |
| Licence | **CC BY 4.0** (GeoTIFF `TIFFTAG_COPYRIGHT` = `CC-BY-4.0`) |
| Citation | WorldPop (www.worldpop.org, School of Geography and Environmental Science, University of Southampton). Global2 R2025A: global gridded population estimates 2015-2030, version 1, constrained, 100 m, Nigeria 2026. Accessed 10 Oct 2026. (**NEEDS OWNER REVIEW**: add the dataset DOI from the WorldPop dataset page; it was not opened during the build, so none is cited here) |
| Coverage confirmed | Whole of Nigeria. Raster total for 2026 = **239.97 M** people. State totals recomputed with GRID3 state polygons match the pipeline's LGA-union clip (e.g. Kano 15.85 M, Ogun 10.99 M, FCT 5.27 M, Bayelsa 2.82 M) |
| Alternative checked | `.../Global_2000_2020_Constrained/2020/maxar_v1/NGA/nga_ppp_2020_constrained.tif` (2020, 52 MB) is also available; not used because it is six years older |

### 2. Travel friction: Malaria Atlas Project 2020 global friction surfaces

| | |
|---|---|
| Product | Global walking-only friction surface 2020 and global motorised friction surface 2020 (minutes required to cross one metre of each pixel) |
| Source | MAP GeoServer WCS, `https://data.malariaatlas.org/geoserver/Accessibility/wcs`, coverages `Accessibility__202001_Global_Walking_Only_Friction_Surface` and `Accessibility__202001_Global_Motorized_Friction_Surface` |
| Request | WCS 2.0.1 `GetCoverage`, `subset=Long(2.0,15.2)`, `subset=Lat(3.8,14.3)`, `format=image/geotiff` (Nigeria plus a buffer; `access.sources.friction_bbox`) |
| Files | `map_friction_walking_2020_nga.tif` (12,583,412 bytes), `map_friction_motorised_2020_nga.tif` (12,583,412 bytes); EPSG:4326, 30 arc-second (~0.93 km), float32 |
| SHA-256 | walking `efdbd653ea4fbb2d73876bd47687d6026c434519d2a5ea6bb5d324b10e891a2b`; motorised `e7aff7be361b23a4afe73776394767551f238f25178bc107263aadd9ed083596` |
| Values seen | Walking 0.012 min/m (5 km/h) to 0.06 min/m (1 km/h), no nodata in the clip. Motorised from 0.0005 min/m (120 km/h) on major roads |
| Licence | **CC BY 4.0** (MAP open data). **NEEDS OWNER REVIEW**: the licence was not shown in the WCS response; confirm on the MAP data page before external publication |
| Citation | Weiss, D.J., Nelson, A., Vargas-Ruiz, C.A. et al. Global maps of travel time to healthcare facilities. *Nature Medicine* 26, 1835-1838 (2020). https://doi.org/10.1038/s41591-020-1059-1 |
| Coverage confirmed | Whole clip, Nigeria included |
| Fallback | Not needed. If the friction files are missing, `access` falls back to straight-line distance (`primary_mode` reported as `distance`, thresholds in km) |

### 3. Ward boundaries: GRID3 Nigeria ward boundaries

| | |
|---|---|
| Layer | `NGA_Ward_Boundaries` (service name `grid3_nga_boundary_vaccwards`), GRID3 ArcGIS Online, `https://services3.arcgis.com/BU6Aadhn6tbBEdyk/arcgis/rest/services/NGA_Ward_Boundaries/FeatureServer/0` (9,410 wards nationally) |
| Fields used | `wardname`, `wardcode`, `lganame`, `lgacode`, `statename`, `statecode`, `urban` |
| Request | `where=statecode='<GRID3 code>'`, `maxAllowableOffset=0.001` (~100 m simplification), `geometryPrecision=5`, GeoJSON, 500 per page |
| Files | `data/raw/access/wards/{code}_wards.geojson` (49 KB to 393 KB each). SHA-256 per file is in `manifest.json` |
| Ward to LGA | `lgacode` equals the `lga_id` (GRID3 `lgacode`) in `dim_lga` for all 12 states (no mismatches) |
| Quality | 40 wards ship with `status = 'Invalid'` and **no geometry** (Abia 17, Enugu 20, Ogun 2, Delta 1). They are dropped and listed in `data/states/{code}/logs/access.json` (`wards_without_geometry`). Population that falls in no ward polygon is reported as `pop_outside_wards` (0.04-0.62% of each state) |
| Licence | GRID3 data are published under **CC BY 4.0** (as for the GRID3 facility and boundary layers already used). **NEEDS OWNER REVIEW**: confirm the ward layer's own terms on its item page |
| Citation | GRID3 (Geo-Referenced Infrastructure and Demographic Data for Development). Nigeria ward boundaries. GRID3 Nigeria, accessed 10 Oct 2026 |

### Not used

- **OpenStreetMap roads**: skipped. The MAP motorised surface already encodes roads (from OSM and Google, 2020).

## Ward file checksums (SHA-256)

| File | Bytes | SHA-256 |
|---|---|---|
| kano_wards.geojson | 393,067 | `9a62db6ba4babb12eb3cc3f354827d909a69d2bb007cc3ced29e360ccdfa63dd` |
| kaduna_wards.geojson | 310,624 | `30edc8d9e49e816c6d4acf97c61753bf2912ff35a0f69c27a0e1805dcf7b086e` |
| bauchi_wards.geojson | 377,612 | `53b53b7ed09f3068074c3d8d294eca5682bfbf03a957d31c46319cbc0a6fd416` |
| adamawa_wards.geojson | 193,299 | `1a924328992b2966544be589afd174f6df7cfc1eb9a7ef35119717328d88de1d` |
| fct_wards.geojson | 48,888 | `b5ff93566ae14ed1f8f781cbcc2d169883eae42b327a28b65fd18f9e6613a76f` |
| niger_wards.geojson | 267,295 | `cee2df147e3c023ad501c52f345c7d308ee9d69084d11348ec5c4d346f1cedb5` |
| ogun_wards.geojson | 187,199 | `4053d0091bdd0b9d22317c2d9a03e65ee2c100658ece5a5d82d7e54b089fb726` |
| oyo_wards.geojson | 233,703 | `7dfdbfafb8f118ec24f0a4b2f7de8ec30fad39babb0535f000376c779699d635` |
| enugu_wards.geojson | 154,617 | `0c56da049d29e1ef5fa2236404b3187a1ac767f9a574a2784005d2382fe30b41` |
| abia_wards.geojson | 161,758 | `9ecc0bf9a4215da0714ef7e49760a32b646405521a7cb99a33dc14dfefc44f0f` |
| delta_wards.geojson | 198,713 | `518827b5efadcd5cad51072fa90e8a4b76ea6cbf1f7d55e01eaac7113aaadbce` |
| bayelsa_wards.geojson | 73,669 | `095ed8e294b36746ec990b3399b9d094d531a28e5f2728f26db9822acc8814c5` |
