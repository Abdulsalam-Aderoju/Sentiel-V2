# Assumptions register (proposal Appendix C, extended)

| ID | Assumption | Basis | Handling |
|---|---|---|---|
| A1 | Service reporting is monthly; programme commodities bimonthly | Published system descriptions [10][16] | Built into the spine (`spine.py`) |
| A2 | Facility minimum stock 2 months, maximum 4 | Published Nigerian min-max policy [10] | `commodity.min_months`, `max_months` |
| A2b | Emergency order point 1 month | Min-max practice; **confirm against [10] in Phase 0** | `commodity.eop_months` |
| A3 | Strain modestly increases the chance of silence | Capacity-related non-reporting evidence [17] | Simulator parameter `strain_silence_multiplier` (1.5), labelled |
| A4 | Demand above the seasonal baseline signals pressure | Consumption follows service volume | Worded as pressure; capped at Watch alone (D1) |
| A5 | Robust z, session and dropout thresholds | Statistical convention, design judgement | All in `settings.yaml`; sensitivity tests in Phase 8 |
| A6 | Operational history is synthetic | No public facility-level longitudinal data | Banner on every page, `meta_data_labels` table |
| A7 | States can export from DHIS2 | States and LGAs use DHIS2 monthly [16] | Adapter reads data value set + registration exports |
| A8 | Analysis runs 30 days after month end; DHIS2 deadline 15 days; NHLMIS deadline 15 days after period end | Design judgement | `calendar`, `reporting` in settings |
| A9 | One LGA delivery carries all malaria commodities | LMCU distribution practice | Simulator: delivery success shared across products |
| A10 | The LMCU pre-positions malaria commodities ahead of the rainy season | NMEP seasonal planning | Simulator: orders follow max(recent use, seasonal forecast) |
| A11 | Simulated reporting rates fall within published Bauchi ranges | [14]: ~65% timeliness, ~71% completeness in a weak LGA | `realism_report.json`: completeness 0.80, timeliness 0.67 |
| A12 | DHIS2 org unit UIDs and LMIS facility codes link to GRID3 IDs | In a pilot this comes from the state's org unit list / NHFR codes | Synthetic deterministic keys in `dim_facility` |
| A13 | Monthly reporting, on-time, NHLMIS reporting and LGA delivery probabilities differ by state | **Design assumption.** No published facility-level 2026 figures exist per state; ranges are spread so the national view shows contrast, and stay within the published Bauchi range used for A11 ([14]: ~65% timeliness, ~71% completeness in a weak LGA). They are not claims about any state. | `states[].sim.*_range`; realism report per state |
| A14 | Malaria seasonality has three profiles: `sudan_sahel` (short, sharp Aug–Oct peak), `guinea_savanna` (the original Bauchi profile), `forest_south` (longer, flatter Apr–Oct season) | **Design assumption**, direction from the north–south gradient in rainy-season length; magnitudes are not survey values | `simulator.seasonality`, `states[].sim.season` |
| A15 | Relative malaria burden: higher in the North West / North Central demo states, lower in the South and FCT | **Design assumption**; direction informed by the zonal gradient reported in the Nigeria Malaria Indicator Survey 2021. Multipliers (0.70–1.10) are not the survey's prevalence values. | `states[].sim.malaria_burden` |
| A16 | Median monthly OPD attendance per PHC differs by state (260–450) | **Design assumption** | `states[].sim.base_opd_median` |
| A17 | Facilities more than 5 km outside their own LGA polygon cannot be placed reliably on a map | **Design assumption** (boundary simplification and GRID3 geocoding precision) | `geography.near_boundary_km`; D11 |
| A18 | A state is "High action load" at >= 17% of PHCs in ACT NOW and has an "Evidence gap" at >= 36% in Data Verification | **Design assumption**, set near the middle of the simulated state range; a pilot would set them with state M&E teams | `national.status`; D15 |
| A19 | Ogun, Abia, Delta and Bayelsa stand in for Lagos, Anambra, Rivers and Cross River | GRID3 Health Facilities v3.0 coverage (Step-1 check, 10 Oct 2026) | D9 |
| A20 | Officer responsiveness varies by LGA and by person: Beta(6, 2.5) LGA means, person concentration 12, 5% never reply | **Simulator parameter**, labelled synthetic | `directory.responsiveness` |
| A21 | Replies arrive after a mean 1.5 days (max 6), longer for less responsive people; 3% of deliveries fail | **Simulator parameter** | `simulation.reply_delay_days`, `delivery_failure_rate` |
| A22 | Reported counts are truth ± 10%; 8% of replies are messily formatted and 3% unparseable | **Simulator parameter**, so the parser and the review queue are exercised | `simulation.reply_noise`, `typo_rate`, `unparseable_rate` |
| A23 | Approved resupply arrives in 3–7 days; a promised report is ingested 1–3 days after REPORT SENT; only 10% of truly silenced facilities recover a report on request | **Simulator parameter** | `simulation.*` |
| A24 | A vaccine resupply requests twice the month's Penta doses given (minimum 20); commodity resupply uses NHLMIS quantity_to_order when current, else AMC × 4 months minus last stock | **Design assumption**; a pilot uses the state cold-chain officer's allocation | `service.resupply_rows` |
| A25 | Simulated officers acknowledge open cases with probability 0.55 per day, scaled by responsiveness | **Simulator parameter**; approvals are never simulated | `simulation.ack_probability_per_day` |
| A26 | The directory has 2 staff per PHC, 5 officers per LGA, 6 per state and 3 national roles; names are first name × surname from zone pools, phones `SIM-{ST}-{6 digits}`, emails on `.invalid` | **Design assumption**; no real office-holder is named | `config/name_pools.yaml`, `directory.py` |
| A27 | Ground truth for simulated replies is the September closing stock minus daily demand × days since, plus delivered resupply | **Simulator parameter** (from the evaluation truth tables) | `simulate.truth_stock` |
| A28 | An isolated PHC (next PHC beyond a 60-min walk) with at least 10,000 people in its catchment warrants a priority raise (R11) | **Design assumption**, about the top quarter of isolated catchments; it raises no priority at reset because every case it applies to already opens at P1. **NEEDS OWNER REVIEW** | `rules.R11_access_isolated` |

## Per-state simulator parameters (A13–A16)

All values are labelled simulator inputs in `config/settings.yaml`. Bauchi uses the defaults
(`simulator.state_defaults`), which are the original single-state calibration. The last column is the
simulated result over 36 months (final DHIS2 completeness / timeliness / NHLMIS reporting rate), from each
state's `realism_report.json`; every state passes the realism checks (no impossible stock flows,
completeness 0.65–0.97, timeliness 0.55–0.92).

| State | Zone | Monthly report | On time | NHLMIS report | LGA delivery | OPD median | Malaria burden | Season | Simulated completeness / timeliness / NHLMIS |
|---|---|---|---|---|---|---|---|---|---|
| Kano | North West | 0.70–0.93 | 0.72–0.92 | 0.70–0.95 | 0.84–0.97 | 420 | 1.10 | sudan_sahel | 0.80 / 0.66 / 0.81 |
| Kaduna | North West | 0.78–0.96 | 0.75–0.95 | 0.74–0.96 | 0.84–0.97 | 380 | 1.00 | guinea_savanna | 0.84 / 0.72 / 0.82 |
| Bauchi | North East | 0.74–0.95 | 0.75–0.95 | 0.70–0.95 | 0.84–0.97 | 350 | 1.00 | guinea_savanna | 0.80 / 0.68 / 0.79 |
| Adamawa | North East | 0.66–0.90 | 0.68–0.90 | 0.70–0.95 | 0.80–0.95 | 300 | 1.05 | guinea_savanna | 0.74 / 0.59 / 0.79 |
| FCT (Abuja) | North Central | 0.84–0.97 | 0.82–0.96 | 0.80–0.97 | 0.88–0.98 | 450 | 0.70 | guinea_savanna | 0.87 / 0.79 / 0.87 |
| Niger | North Central | 0.70–0.92 | 0.75–0.95 | 0.66–0.92 | 0.82–0.96 | 300 | 1.10 | guinea_savanna | 0.77 / 0.66 / 0.80 |
| Ogun | South West | 0.80–0.96 | 0.78–0.95 | 0.70–0.95 | 0.84–0.97 | 320 | 0.75 | forest_south | 0.86 / 0.75 / 0.78 |
| Oyo | South West | 0.76–0.95 | 0.75–0.95 | 0.70–0.95 | 0.84–0.97 | 330 | 0.80 | forest_south | 0.83 / 0.70 / 0.80 |
| Enugu | South East | 0.80–0.96 | 0.75–0.95 | 0.76–0.96 | 0.84–0.97 | 300 | 0.80 | forest_south | 0.83 / 0.71 / 0.84 |
| Abia | South East | 0.72–0.93 | 0.70–0.92 | 0.70–0.95 | 0.84–0.97 | 280 | 0.80 | forest_south | 0.81 / 0.69 / 0.80 |
| Delta | South South | 0.74–0.94 | 0.75–0.95 | 0.70–0.95 | 0.82–0.96 | 300 | 0.85 | forest_south | 0.82 / 0.71 / 0.79 |
| Bayelsa | South South | 0.64–0.90 | 0.66–0.90 | 0.62–0.90 | 0.78–0.94 | 260 | 0.90 | forest_south | 0.73 / 0.57 / 0.77 |

## Access and travel burden, Workstream A (A40-A48)

No national policy standard for travel time or distance to a PHC was opened during the build, so every threshold
below is a **design assumption**. A commonly quoted "PHC within 5 km / 30 minutes" norm was not verified and is
not cited.

| ID | Assumption | Basis | Handling |
|---|---|---|---|
| A40 | Walking thresholds 30, 60 and 120 minutes | **Design assumption**, the bands used in the global travel-time literature. **NEEDS OWNER REVIEW** against the National Health Policy / Ward Minimum Health Care Package | `access.thresholds_minutes` |
| A41 | Headline measure: people more than **60 minutes' walk** from the nearest included PHC | **Design assumption**. **NEEDS OWNER REVIEW** | `access.main_threshold_minutes` |
| A42 | Straight-line thresholds 5 and 10 km; 5 km is the headline when travel time is unavailable | **Design assumption** | `access.thresholds_km`, `access.main_threshold_km` |
| A43 | Motorised thresholds 30 and 60 minutes | **Design assumption**; secondary measure, assumes a vehicle is available | `access.thresholds_minutes_motorised` |
| A44 | A facility with "Unknown" functional status is open | Most GRID3 records are Unknown (D40) | `access.facility_filter` |
| A45 | MAP 2020 friction surfaces still describe travel in 2026 | Most recent global surface; roads built since 2020, seasonal flooding and insecurity are not represented | Source year in `mart_access_state.friction_source` |
| A46 | People use their nearest PHC by travel time | Standard accessibility assumption; ignores cost, quality, opening hours and preference | Catchments described as geographic, not utilisation (D48) |
| A47 | WorldPop 2026 projected counts represent current population | WorldPop R2025A projection; differs from NPC projections in some states (Ogun, FCT higher) | D41 |
| A48 | 30 km buffer, 1 km cells, candidates 10 km apart | **Design assumption**; sensitivity of the friction resampling rule is reported in D43 | `access.*` |


## Hidden burden (Workstream B)

| ID | Assumption | Basis | Handling |
|---|---|---|---|
| A60 | A silent PHC's caseload follows its own seasonal history, shifted by the same month-specific factor as PHCs that did report | **Design assumption**; validated (facility error 15–16%) in the simulation, where silence is partly driven by strain. A real system should check whether silent PHCs differ systematically | D61 |
| A61 | Facility forecast errors are independent when summed to state totals | **Design assumption**; totals held their 80% range in 58–92% of months, so it is optimistic for some states | D62 |
| A62 | A stale-report PHC's stock follows the state's average NHLMIS net flow since its last report | **Design assumption**; PHCs whose LMIS reporting stopped may also have lost deliveries | D63 |
| A63 | 80% intervals, 6 months minimum history, 12-month error window, labels at P ≥ 0.5 / 0.3 | **Design assumption**, chosen for readability; all in `settings.yaml` | `burden.*` |
