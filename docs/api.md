# API reference

Read-only FastAPI over the PostgreSQL marts. Interactive docs: http://localhost:8000/docs.
Every response describes simulated operational data; `/meta/data-labels` returns the banner text.

`month` is always optional (`YYYY-MM`, defaults to the latest analysis month, 2026-09). `{code}` is a state
code from `config/settings.yaml`: `kano`, `kaduna`, `bauchi`, `adamawa`, `fct`, `niger`, `ogun`, `oyo`,
`enugu`, `abia`, `delta`, `bayelsa`. Unknown codes, LGAs or facilities return 404; invalid parameters 422.

## National Command Centre (state aggregates only)

These read only the precomputed `mart_state_month`, `mart_zone_month` and `mart_national_month`. No
facility rows are returned at national level. Responses are cached in memory and sent with
`Cache-Control: public, max-age=300`, gzipped.

| Endpoint | Returns | Size (gzip) |
|---|---|---|
| `GET /national/summary?month=` | `kpis` (national totals: states, facilities, act_now, verify_then_act, verification, monitor, reports_received, reporting_completeness, on_time_rate, stale_commodity, pct_*, status), `zones` (six rows, same fields), `trend` (all months), `metrics` (map metric labels) | ~2 KB |
| `GET /national/states?month=&metric=` | One row per covered state with the same fields as `kpis`, plus `main_domain`, `status`, `action_<domain>` counts, `lgas`, `location_unverified`, `trend` (last `national.trend_months` = 6 months), `top_lgas` (top `national.top_lgas_in_brief` = 3 LGAs), `value` and `metric_rank` for the chosen metric. `metric` is one of `pct_act_now` (default), `pct_verification`, `reporting_completeness`, `pct_stale`. | ~5 KB |
| `GET /national/geo` | All 36 states + FCT as GeoJSON; `state_code` is null and `covered` false for states not in the demo. `Cache-Control: max-age=86400`. | ~20 KB |

National totals equal the sum of the state rows for every count; rates are recomputed from the summed
counts (`tests/test_national.py`, `tests/test_api.py`).

## State portal (one template for every state)

| Endpoint | Returns |
|---|---|
| `GET /state/{code}/summary?month=` | `state`, `kpis` (the state's `mart_state_month` row), Risk x Confidence `matrix`, `risk` and `confidence` distributions, `action_by_domain`, `lgas` (ranked LGA roll-up), `trend` |
| `GET /state/{code}/top?month=&limit=` | Top of the state-wide action and verification queues |
| `GET /state/{code}/geo/lgas?month=` | LGA polygons with queue counts |
| `GET /state/{code}/geo/facilities?month=&lga_id=` | Facility points with queue tag. **Location unverified** facilities are left off (they remain in every queue). |
| `GET /state/{code}/lga/{lga_id}/queue?month=` | LGA summary and its action / verification / monitor queues |
| `GET /state/{code}/facility/{facility_id}?month=` | Facility master record (incl. `coord_status`, `dist_to_lga_m`), status, explanation, trends |
| `GET /state/{code}/quality/{facility_id}?month=` | Failed DQR checks and NHLMIS freshness |

A facility or LGA requested under the wrong state returns 404.

## Access and travel burden (real-derived; Workstream A)

WorldPop 2026 population, MAP 2020 walking and motorised friction, GRID3 facilities and wards. Every `pct_*`
field is returned as a **fraction (0–1)**, like the rest of the API (the marts store percentages). 404 when the
access marts are not loaded.

| Endpoint | Returns |
|---|---|
| `GET /state/{code}/access` | Headline figures, every LGA ranked by people beyond the main threshold, the 15 worst wards, 10 candidate areas (cells beyond the threshold only), the 25 isolated PHCs with most people affected (with live tag), raster bounds |
| `GET /state/{code}/access/wards.geojson` | Ward polygons (~200 m simplified); properties keep percentages (0–100) for the map |
| `GET /state/{code}/access/travel-time.png` | Classed walking-time image, Web Mercator; bounds in `travel_time_layer` above |
| `GET /state/{code}/access/lga/{lga_id}` | An LGA's wards and facilities |
| `GET /state/{code}/facility/{id}/access` | Catchment, nearest alternative PHC, isolation |
| `GET /national/access` | Sum of the 12 states, by zone and state |

`/national/states?metric=pct_pop_beyond_threshold` maps the share of people beyond a 60-minute walk; `/national/summary`
adds `pct_pop_beyond_threshold`, `pop_beyond_threshold` to the KPIs and to each zone. `/state/{code}/cases?sort=impact`
orders by priority, then isolated PHCs first, then catchment population.

`/national/states?metric=pct_cases_overdue` maps the share of open cases past their due date (simulated action layer). Because it
moves with the simulated clock, `/national/states` merges live action figures (`open_cases`, `overdue_cases`,
`escalated_cases`, `pct_cases_acknowledged`, `response_suggested`, `state_case_*`) into every row and is served with
`Cache-Control: no-store` once the action layer is loaded.

## Hidden burden (modelled; Workstream B)

Expected cases at PHCs with a missing monthly report and implied stock where NHLMIS is stale, with 80% intervals and
validation against simulator truth. 404 when `python -m sentinel burden` has not been run.

| Endpoint | Returns |
|---|---|
| `GET /state/{code}/gaps?month=` | Summary (hidden malaria cases and range, PHCs missing, stale stock counts by label), 36-month trend with reported cases, LGAs, the 30 silent PHCs with most expected cases, the 30 stale-report PHCs with highest stock-out chance, validation |
| `GET /state/{code}/facility/{id}/gaps?month=` | One PHC's estimate (null when it reported and NHLMIS is current) |
| `GET /national/gaps?month=` | National trend, zones, states and per-state validation summary |

`/national/summary` adds `hidden_malaria_cases` (+ `_lo`, `_hi`) to the KPIs and each zone; `/national/states` adds them per state.

## Meta

| Endpoint | Returns |
|---|---|
| `GET /health` | Status, latest month, number of states |
| `GET /meta/months` | Analysis months |
| `GET /meta/states` | Covered states (code, name, zone) in display order, zones, default state |
| `GET /meta/data-labels` | Banner text; real / synthetic / derived label per table |
| `GET /meta/settings` | `settings.yaml` and `dhis2_mapping.yaml` |

## Deprecated single-state aliases

Kept so links to the Bauchi build keep working. `GET /state/summary`, `/state/top`, `/geo/lgas` and
`/geo/facilities` answer for `default_state` (Bauchi); `GET /lga/{lga_id}/queue`, `/facility/{id}` and
`/quality/{id}` resolve the state from the id. The web app redirects the old `/lga/{id}` and
`/facility/{id}` pages to their state-scoped addresses.
