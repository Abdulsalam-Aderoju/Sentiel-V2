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
