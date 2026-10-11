# Data contract

Every input field answers "where does this come from?" (Phase 0 gate). Class: **real**, **synthetic mirror**
(simulated in the documented structure of a real system), **derived** (computed by Sentinel), **phase two** (not used).

## Coverage

Twelve states, two per geopolitical zone, listed in `config/settings.yaml` (`states`): Kano, Kaduna (North
West); Bauchi, Adamawa (North East); FCT, Niger (North Central); Ogun, Oyo (South West); Enugu, Abia
(South East); Delta, Bayelsa (South South). Ogun, Abia, Delta and Bayelsa replace Lagos, Anambra, Rivers and
Cross River, which are not in GRID3 Health Facilities v3.0 (decision D9). Each state has the same inputs,
in `data/raw/grid3/` (real, committed) and `data/states/{code}/` (generated).

| State | Public PHCs | LGAs | Near boundary | Location unverified |
|---|---|---|---|---|
| Kano | 1,527 | 44 | 5 | 1 |
| Kaduna | 1,363 | 23 | 10 | 17 |
| Bauchi | 1,454 | 20 | 5 | 28 |
| Adamawa | 1,249 | 21 | 7 | 1 |
| FCT (Abuja) | 409 | 6 | 7 | 5 |
| Niger | 2,104 | 25 | 80 | 92 |
| Ogun | 881 | 20 | 40 | 2 |
| Oyo | 1,150 | 33 | 141 | 33 |
| Enugu | 894 | 17 | 62 | 10 |
| Abia | 1,018 | 17 | 94 | 11 |
| Delta | 559 | 25 | 41 | 20 |
| Bayelsa | 316 | 8 | 12 | 11 |
| **Total** | **12,924** | **259** | **504** | **231** |

36 analysis months x 12,924 PHCs = 465,264 facility-months.

## Inputs (what a state would supply)

Paths are per state: `{code}` is the state code (`bauchi`, `kano`, ...).

| File | Format | Class | Fields | Mapped by |
|---|---|---|---|---|
| `data/raw/grid3/{code}_health_facilities_v3.geojson` | GRID3 v3.0 layer | real | unique_id, facility_name, lga_standard, ward_standard, latitude, longitude, facility_level, facility_ownership, ... | `facility/grid3.py` |
| `data/raw/grid3/{code}_lga_boundaries.geojson` | GRID3 LGA boundaries | real | lganame, lgacode, geometry | `facility/grid3.py` |
| `data/raw/grid3/nga_state_boundaries.geojson` | GRID3 state boundaries (all 37), simplified ~1 km | real | statename, statecode, geometry | national map |
| `data/states/{code}/exports/dhis2_datavalues.csv.gz` | DHIS2 `/api/dataValueSets.csv` | synthetic mirror | dataelement, period, orgunit, categoryoptioncombo, attributeoptioncombo, value, storedby, created, lastupdated | `config/dhis2_mapping.yaml` → `dhis2.data_elements` |
| `data/states/{code}/exports/dhis2_complete_registrations.csv` | DHIS2 `/api/completeDataSetRegistrations` | synthetic mirror | dataset, period, orgunit, date, completed | `dhis2.dataset` |
| `data/states/{code}/exports/dhis2_orgunits.csv` | DHIS2 org unit metadata | synthetic mirror | id, name, code, level, parent | reference only |
| `data/states/{code}/exports/nhlmis_facility_reports.csv` | NHLMIS bimonthly facility report | synthetic mirror | facility_code, reporting_period_start/end, product_code, beginning_balance, quantity_received, quantity_dispensed, losses_adjustments, physical_count, days_out_of_stock, adjusted_consumption, amc, quantity_required, date_submitted | `nhlmis.columns` |

## DHIS2 data elements

| Internal field | Data element (mapping file) | Domain use |
|---|---|---|
| opd | OPD attendance - total | Service pressure, coherence |
| confirmed_malaria | Malaria - confirmed (RDT or microscopy) | Service pressure, rising demand |
| anc1 | ANC 1st visit | Outliers, coherence |
| deliveries | Deliveries - total | Outliers, coherence |
| penta1, penta3 | Penta 1 / Penta 3 doses given (0-11m) | Dropout, coherence |
| sessions_planned, sessions_conducted | RI sessions planned / conducted | Vaccine Watch |
| vaccine_stockout_flag | Vaccine stockout during month (any antigen) | Vaccine High/Critical |
| vaccine_stock_balance | Penta vaccine stock balance end of month | Context |
| refrigerator_functional | Vaccine refrigerator functional | Vaccine High/Critical |

## Facility master columns added for multi-state

| Column | Values | Use |
|---|---|---|
| `state_code` | settings code | Every table carries it in the database |
| `coord_status` | `ok` (inside own LGA polygon), `near_boundary` (outside, within `geography.near_boundary_km` = 5 km; mapped), `location_unverified` (further; in every queue, not mapped) | Map filter, facility page note |
| `in_state` | bool | Point falls inside any LGA polygon of the state |
| `lmis_facility_code` | `{GRID3 state code}-LMIS-{hash}` | Synthetic NHLMIS linkage key |

## Derived tables

Per-state tables are built in `data/states/{code}/marts/` and loaded into one table each with a `state_code` column.

| Table | Grain | Contents |
|---|---|---|
| `fact_quality_flags` | facility x month x rule | rule_id, family, severity, explanation, source_date |
| `fact_domain_results` | facility x month x domain | severity, credible, signal, evidence (JSON) |
| `mart_facility_month` | facility x month | report status, source ages, confidence + reasons, operational risk, queue, tag, ranks |
| `mart_queue` | facility x month | queue, tag, rank (state, LGA), evidence summary, next action, explanation (JSON) |
| `mart_lga_month` | LGA x month | queue counts, quadrants, silent, stale, completeness, LGA rank |
| `mart_commodity_month` | facility x month x commodity | latest visible NHLMIS record, age, stale flag |
| `mart_service_baseline` | facility x month x indicator | value, seasonal expected, MAD, robust z |
| `mart_state_month` | state x month | facilities, queue and quadrant counts, reports received, on time, stale commodity, silent, low confidence, critical, action by domain, location unverified; shares and rates recomputed from counts; main risk domain; status (`act_and_verify`, `action_load`, `evidence_gap`, `watch`) |
| `mart_zone_month` | zone x month | sum of its states' counts; rates recomputed |
| `mart_national_month` | month | sum of all states' counts; rates recomputed |
| `dim_state_geo` | state (all 37) | simplified geometry; `state_code` null when not in the demo |

## Ground truth (never read by the engines)

`data/states/{code}/eval/`: `answer_key_faults.csv`, `answer_key_scenarios.csv` (both with a `state_code`
column), `reporting_truth.csv`, `nhlmis_reporting_truth.csv`, `truth_monthly.parquet`, `truth_stock.parquet`,
`realism_report.json` (with the state's simulator parameters). `data/national/answer_key_faults.csv` and
`answer_key_scenarios.csv` combine all states.

## Phase two (not used)

General essential medicines, staffing, supplier lead time, order fill rate.

## Access outputs (Workstream A)

Built by `python -m sentinel fetch-access` (once) then `python -m sentinel access [--state CODE] [--workers N]`.
Real-data derived, not simulated: every table has `data_class = 'real-derived'` (the GeoJSON carries it in
`metadata`). Keys match the existing tables: `state_code` (settings code), `lga_id` (GRID3 `lgacode` string, as in
`dim_facility` and `dim_lga`), `facility_id` (GRID3 `unique_id`). Decisions D40-D52, assumptions A40-A48, sources in
`docs/data_sources.md`.

Per state, in `data/states/{code}/access/`; national roll-ups in `data/national/`.

| File | Grain | Contents |
|---|---|---|
| `mart_access_facility.parquet` | every facility in `dim_facility` | identity and location columns from `dim_facility`; `included` (passes `access.facility_filter`), `access_computed` (included and coordinates usable; false for `location_unverified`, metrics null); `catchment_pop`, `catchment_pop_beyond_main`, `catchment_mean_walk_min`, `catchment_mean_motor_min`; nearest alternative PHC `alt_facility_id`, `alt_facility_name`, `alt_state_code` (may be a neighbouring covered state), `alt_walk_min`, `alt_km` (straight line); `nearest_other_km`; `isolated` (alternative beyond the main threshold, or none); `n_colocated` (included facilities in the same 1 km cell); `primary_mode`, `main_threshold` |
| `mart_access_ward.parquet` | GRID3 ward | `ward_code`, `ward`, `lga_id`, `lga`, `urban`, access measures (below), `n_facilities` (computed facilities inside the ward polygon), `hotspot_rank` (1 = most people beyond the main threshold) |
| `mart_access_lga.parquet` | LGA | `lga_id`, `lga`, access measures, `n_facilities`, `n_wards`, `rank_pop_beyond_main` |
| `mart_access_state.parquet` | one row | `state`, `zone`, access measures; `pop_outside_wards`, `pop_nearest_out_of_state_facility`, `pop_unreachable`; `n_facilities_total`, `n_facilities_included`, `n_facilities_computed`, `n_facilities_location_unverified`, `n_isolated`, `n_lgas`, `n_wards`; `primary_mode`, `main_threshold`, `main_threshold_unit`, `facility_filter`, `population_source`, `population_year`, `friction_source`, `resolution_m` |
| `access_candidates.parquet` | up to 10 per state | `rank`, `longitude`, `latitude` (1 km cell centre), `cell_population`, `score_pop_x_burden`, `walk_min`, `motor_min`, `dist_km_nearest`, `nearest_facility_id`, `nearest_facility_name`, `lga_id`, `lga`, `ward_code`, `ward`, `cell_size_km`, `note` ("candidate area for outreach or a new service point") |
| `wards.geojson` | ward polygons, simplified ~200 m (40-320 KB) | properties `ward_code`, `ward`, `lga_id`, `lga`, `state_code`, `pop_total`, `pop_beyond_main`, `pct_beyond_main`, `walk_mean_min`, `walk_median_min`, `n_facilities`, `hotspot_rank` |
| `travel_time.png` + `travel_time.json` | state overlay | walking-time classes (<= 30, 30-60, 60-120, > 120 min) as a transparent Web Mercator PNG; the JSON has `bounds` `[[south, west], [north, east]]` for a Leaflet `imageOverlay`, class labels and colours |
| `data/national/mart_access_state.parquet` | 12 rows | the per-state rows concatenated |
| `data/national/mart_access_zone.parquet`, `mart_access_national.parquet` | zone / one row | summed counts (`pop_*`, `sum_pop_x_*`, `n_*`), `pct_*` and `*_mean_*` recomputed from them, `n_states`, `coverage_note` (12 demo states only, not all of Nigeria). No medians |

**Access measures** (ward, LGA, state; population-weighted over WorldPop 100 m population):

| Column | Meaning |
|---|---|
| `pop_total` | population (WorldPop 2026) |
| `walk_mean_min`, `walk_median_min` | walking minutes to the nearest included facility |
| `motor_mean_min`, `motor_median_min` | motorised minutes |
| `dist_mean_km`, `dist_median_km` | straight-line km to the nearest included facility |
| `pop_beyond_{30,60,120}min_walk`, `pct_beyond_...` | people (and %) with walking time strictly above the threshold |
| `pop_beyond_{30,60}min_motor`, `pct_beyond_...` | same, motorised |
| `pop_beyond_{5,10}km`, `pct_beyond_...` | same, straight-line distance |
| `pop_beyond_main`, `pct_beyond_main` | headline measure: beyond `access.main_threshold_minutes` (60) in `primary_mode` (walking), or `main_threshold_km` in the distance fallback |
| `sum_pop_x_{walk,motor}_min`, `sum_pop_x_dist_km`, `pop_{walk,motor,dist}_finite` | sums that let any grouping recompute a weighted mean: mean = sum_pop_x / pop_finite |

Rules: exactly at a threshold counts as within (D47). Medians are quantised by the 1 km grid (one orthogonal step
is 12 min walking at 5 km/h), so many medians read 12.0. Logs: `data/states/{code}/logs/access.json`.


## Hidden burden marts (Workstream B, modelled)

Built by `python -m sentinel burden` (after `pipeline`); per state in `data/states/{code}/burden/`, roll-ups in `data/national/`.

| Table | Grain | Columns |
|---|---|---|
| `mart_hidden_burden_facility` | facility × month, rows with a missing report or a stale NHLMIS report | `report_missing`; `est_/lo_/hi_/var_{confirmed_malaria,opd}` (null when history is too short); `nhlmis_stale`; per stock group `act_`/`rdt_`: `last_stock`, `amc`, `last_period_end`, `months_since`, `implied`, `implied_lo`, `implied_hi`, `p_out`, `label` (elevated_risk / watch / no_signal / unknown); `implied_stock_label` (= ACT label); `lga_id`, `lga`, `state_code`, `data_class` = modelled |
| `mart_hidden_burden_lga` | LGA × month | `n_report_missing`, `n_estimated`, `hidden_malaria_cases`/`_lo`/`_hi`/`_var`, `hidden_opd`/…, `n_stale_stock`, `n_stock_elevated`, `n_stock_watch` |
| `mart_hidden_burden_state` / `_zone` / `_national` | state / zone / all × month | as LGA, plus `reported_malaria_cases`; zone and national also `n_states` |
| `burden_validation` (JSON per state) | state | facility WAPE, MAPE, median APE, interval coverage, bias; state-total MAPE and coverage; stock base rate, outcome rate by label, lift, recall, interval coverage |
