# Data contract

Every input field answers "where does this come from?" (Phase 0 gate). Class: **real**, **synthetic mirror**
(simulated in the documented structure of a real system), **derived** (computed by Sentinel), **phase two** (not used).

## Inputs (what a state would supply)

| File | Format | Class | Fields | Mapped by |
|---|---|---|---|---|
| `data/raw/grid3/bauchi_health_facilities_v3.geojson` | GRID3 v3.0 layer | real | unique_id, facility_name, lga_standard, ward_standard, latitude, longitude, facility_level, facility_ownership, ... | `facility/grid3.py` |
| `data/raw/grid3/bauchi_lga_boundaries.geojson` | GRID3 LGA boundaries | real | lganame, lgacode, geometry | `facility/grid3.py` |
| `data/exports/dhis2_datavalues.csv.gz` | DHIS2 `/api/dataValueSets.csv` | synthetic mirror | dataelement, period, orgunit, categoryoptioncombo, attributeoptioncombo, value, storedby, created, lastupdated | `config/dhis2_mapping.yaml` → `dhis2.data_elements` |
| `data/exports/dhis2_complete_registrations.csv` | DHIS2 `/api/completeDataSetRegistrations` | synthetic mirror | dataset, period, orgunit, date, completed | `dhis2.dataset` |
| `data/exports/dhis2_orgunits.csv` | DHIS2 org unit metadata | synthetic mirror | id, name, code, level, parent | reference only |
| `data/exports/nhlmis_facility_reports.csv` | NHLMIS bimonthly facility report | synthetic mirror | facility_code, reporting_period_start/end, product_code, beginning_balance, quantity_received, quantity_dispensed, losses_adjustments, physical_count, days_out_of_stock, adjusted_consumption, amc, quantity_required, date_submitted | `nhlmis.columns` |

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

## Derived tables

| Table | Grain | Contents |
|---|---|---|
| `fact_quality_flags` | facility x month x rule | rule_id, family, severity, explanation, source_date |
| `fact_domain_results` | facility x month x domain | severity, credible, signal, evidence (JSON) |
| `mart_facility_month` | facility x month | report status, source ages, confidence + reasons, operational risk, queue, tag, ranks |
| `mart_queue` | facility x month | queue, tag, rank (state, LGA), evidence summary, next action, explanation (JSON) |
| `mart_lga_month` | LGA x month | queue counts, quadrants, silent, stale, completeness, LGA rank |
| `mart_commodity_month` | facility x month x commodity | latest visible NHLMIS record, age, stale flag |
| `mart_service_baseline` | facility x month x indicator | value, seasonal expected, MAD, robust z |

## Ground truth (never read by the engines)

`data/eval/`: `answer_key_faults.csv`, `answer_key_scenarios.csv`, `reporting_truth.csv`, `nhlmis_reporting_truth.csv`,
`truth_monthly.parquet`, `truth_stock.parquet`, `realism_report.json`.

## Phase two (not used)

General essential medicines, staffing, supplier lead time, order fill rate.
