# PHC Sentinel

*See risk before it becomes a shortage.* Young Data Professionals Datathon 2026, Track 01: Health.

PHC Sentinel is an early-warning tool for primary health care. It turns imperfect routine PHC data into two
separate outputs for every facility, **operational risk** and **data confidence**, and routes each facility
into a ranked queue:

|                         | High / moderate confidence | Low confidence                          |
|-------------------------|----------------------------|-----------------------------------------|
| **High / critical risk** | Resource action: ACT NOW   | Resource action: VERIFY THEN ACT        |
| **Normal / watch risk**  | Monitor                    | Data verification: DO NOT ASSUME SAFE   |

Low observed risk with low confidence is not safe.

It runs for **12 states, two per geopolitical zone**, each with its own state portal, plus a **National
Command Centre** that rolls the state results up for federal users.

| Zone | States |
|---|---|
| North West | Kano, Kaduna |
| North East | Bauchi, Adamawa |
| North Central | FCT (Abuja), Niger |
| South West | Ogun, Oyo |
| South East | Enugu, Abia |
| South South | Delta, Bayelsa |

Lagos, Anambra, Rivers and Cross River were requested but are not in GRID3 Health Facilities v3.0, so
same-zone states stand in for them ([decision D9](docs/decisions.md)). The list lives in `config/settings.yaml`.

> **Data:** facility lists (12,924 public PHCs) and LGA/state boundaries are real (GRID3 v3.0, CC BY 4.0).
> All operational reporting data are **simulated** in the structure of real DHIS2 and NHLMIS exports, and a
> banner says so on every page.

### From early warning to action

Three layers sit on top of the queues. Each carries its data class on every screen.

| Layer | What it adds | Data |
|---|---|---|
| **Action Centre** | Every flagged PHC becomes a **case** with a named owner, a playbook, a deadline and an escalation ladder. Messages to facilities are drafted and **approved by a person** before a simulated send; replies such as `ACT 12 RDT 0 FRIDGE 1` are parsed and update a **live status** overlay; a confirmed shortage pre-fills a resupply request for approval. A simulated clock and responders make the loop playable in under 90 seconds. | **Synthetic** people (27,218), messages and replies; nothing is ever sent |
| **Access** | People more than a 60-minute walk from a public PHC, by ward and LGA; isolated PHCs (next PHC > 60 min) ranked by people affected; candidate areas for outreach. Isolation raises case priority. | **Real-derived**: WorldPop 2026, MAP friction surfaces, GRID3 |
| **Behind the gaps** | Malaria cases expected at PHCs whose report is missing, with 80% ranges, and the stock-out risk behind out-of-date NHLMIS reports, each validated against the simulator's truth. | **Modelled** |

## Views

Every view has its own address and is one click from the landing page. The demo has no login; a pilot adds
real authentication with state-scoped access.

| URL | View |
|---|---|
| `/` | Role switcher: National Command Centre, or pick a state |
| `/national` | National Command Centre: headline numbers, interactive Nigeria map (colour by % act now, % data verification, reporting completeness or % stale stock reports), state cards with search / zone filter / sort, zone comparison, and a state brief opened from the map or a card. Brief, metric and filters stay in the URL, e.g. `/national?state=kano&metric=pct_stale`. Also: who is acting, people beyond a 60-min walk, hidden malaria cases, and map metrics `pct_pop_beyond_threshold` and `pct_cases_overdue`; a national persona can request a state response from the brief. |
| `/national/briefing` | Briefing mode: large-type slides for senior officials (arrow keys, printable) |
| `/state/{code}` | State overview: LGA ranking, Risk x Confidence, map, queue trend |
| `/state/{code}/lga/{id}` | LGA action and verification queues |
| `/state/{code}/facility/{id}` | Facility explanation: evidence by domain, why confidence is reduced, trends; live status, Take action, access panel |
| `/state/{code}/actions` | **Action Centre**: case list / kanban with filters and bulk actions, approvals tray, simulated outbox and inbox, LGA performance, escalations, demo guide, simulated clock |
| `/cases/{id}` | Case: playbook stepper, timeline, messages and replies, live status, resupply request, escalation ladder, people |
| `/state/{code}/access` | Access: ward map (or travel-time raster), LGAs, isolated PHCs, hotspot wards, candidate areas |
| `/state/{code}/gaps` | Behind the gaps: hidden cases with ranges, silent PHCs, stale stock at risk, validation |
| `/state/{code}/people`, `/state/{code}/resupply`, `/me` | Synthetic directory; printable resupply requests; my cases (for the persona you act as) |
| `/about` | Method, coverage, **validation lab**, data labels, access model, limitations |

## Run it

**Docker (one command):**

```bash
docker compose up --build
```

This builds the 12 facility masters, simulates each state's exports, runs the engines (3 states in parallel,
`SENTINEL_WORKERS`), builds the national marts and the hidden-burden estimates, downloads the open access rasters
(skipped with a message if offline), loads PostGIS, builds the synthetic directory and opens the action-layer cases
with the demo scenario, then starts the app. Allow about 30 minutes and ~6 GB of disk for the first build.
Web: http://localhost:3000 · API docs: http://localhost:8000/docs

**Local development:**

```bash
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # (bin/ on macOS/Linux)
docker compose up -d db                       # PostGIS on localhost:5433
python -m sentinel all                        # 12 states + national marts (~13 min with 3 workers)
python -m sentinel burden                     # hidden burden + validation (~3 min)
python -m sentinel fetch-access               # once: WorldPop, MAP friction, GRID3 wards (~180 MB, not committed)
python -m sentinel access                     # access marts (~25 s)
python -m sentinel load-db                    # ~8 min (loads access and burden too)
python -m sentinel actions load               # synthetic directory + truth for the simulator, then reset
uvicorn sentinel.api.main:app --port 8000
cd web && npm install && API_URL=http://localhost:8000 npm run dev
pytest -m "not slow"                          # 175 unit + API tests, ~1 min
pytest -m slow                                # 15 tests: Bauchi rebuild vs the frozen baseline, and the action loop against the database (~5 min)
```

One state only: `python -m sentinel all --state kano`. Step-1 coverage check against GRID3:
`python -m sentinel coverage`. Add a state: add an entry to `states` in `settings.yaml`, then
`python -m sentinel fetch-grid3 --state <code>`.

**Action layer, day to day:** `python -m sentinel actions reset` restores the clean start (clock 30 Oct 2026, 8,425
cases, demo scenario seeded); `python -m sentinel actions tick --days 3` advances the simulated clock. In the app, choose
who you are acting as in the top bar; the Action Centre's demo guide has a one-click "Act as" for the scripted LGA.

**The 90-second demo loop** (Bauchi, Toro LGA, after a reset): act as the Toro LGA PHC Coordinator → open the
Verify-then-act case in the demo guide → approve the drafted SMS → advance the clock one day (the outbox shows it
delivered) and another (the reply `ACT 12 RDT 0 FRIDGE 1` arrives; live status turns ACT NOW, field-verified) → the case
moves to *resupply requested* with pre-filled ACT and RDT quantities → approve them → advance two more days: the scripted
unacknowledged case escalates to the LGA PHC Coordinator, then to the State LMCU Coordinator → the Action Centre KPIs show it all.
The browser run of this loop takes about 25 seconds.

## How it works

```
GRID3 facilities ──┐                              (per state, data/states/{code}/)
DHIS2 exports ─────┼─> adapters (mapping file) ─> monthly spine (point-in-time)
NHLMIS exports ────┘                                  │
                       ┌──────────────┬───────────────┼───────────────┐
                 WHO-aligned DQR   commodity risk  vaccine risk   service pressure
                       │                └───────────────┼───────────────┘
                data confidence                 operational risk (worst credible domain)
                       └──────────── queues + ranking + explanation
                                          │
              state marts ──> national marts (sum of states) ──> PostGIS ──> API ──> web
```

| Path | What |
|---|---|
| `config/settings.yaml` | Every threshold with its basis; the state list, zones and per-state simulator parameters |
| `config/dhis2_mapping.yaml` | Source identifiers → internal fields. **To pilot: replace the export files and edit this file.** |
| `sentinel/facility/grid3.py` | Phase 1: GRID3 fetch, filter, de-duplicate, LGA polygon check, boundary tags |
| `sentinel/simulator/` | Phase 2: seeded truth + reporting layer + fault injection per state, written as DHIS2 / NHLMIS exports |
| `sentinel/ingest/` | Phase 3: mapping-driven adapters with validation and a rejection log |
| `sentinel/spine.py` | Phase 3: point-in-time monthly spine; NHLMIS marked stale once the next report is overdue |
| `sentinel/engines/dqr.py` | Phase 4: 14 WHO-aligned rules, each with severity and a plain-language reason |
| `sentinel/engines/baseline.py`, `risk.py` | Phase 5: seasonal robust baselines; commodity, vaccine and pressure domains |
| `sentinel/engines/decision.py` | Phase 6: confidence, worst-credible-domain risk, queues, ranking, next actions, LGA roll-up |
| `sentinel/national.py` | State, zone and national marts (counts summed; rates recomputed from counts) |
| `sentinel/actions/` | Action layer: directory, rule engine (`config/actions.yaml`), cases and playbooks, messaging (simulated provider only), reply parser, live overlay, simulated clock and responders, demo scenario |
| `sentinel/access/` | Access: raster fetch, travel-time and catchment computation (settings `access:`) |
| `sentinel/burden/` | Hidden burden: estimates, implied stock, validation against truth (settings `burden:`) |
| `sentinel/db.py`, `sentinel/api/` | PostGIS load and the FastAPI API ([docs/api.md](docs/api.md)); action writes go through `sentinel/actions/service.py` |
| `web/` | Next.js: landing, National Command Centre, briefing mode, state portal template, method & data |
| `config/actions.yaml`, `message_templates.yaml`, `name_pools.yaml` | Roles, rules R01–R12, playbooks, escalation ladders, SLAs, messaging limits, simulation parameters; SMS templates; synthetic name pools |
| `docs/` | [Action-layer report](docs/report_action_layer.md), [data sources](docs/data_sources.md), [Data contract](docs/data_contract.md), [assumptions register](docs/assumptions.md), [design decisions](docs/decisions.md), [API](docs/api.md) |

## Facility locations

Each GRID3 point is checked against its own LGA polygon (Python at build time, PostGIS view
`v_facility_lga_check` after load). Outside the polygon but within 5 km is **Near boundary** and stays on the
map; further away is **Location unverified**: the facility stays in every queue but is not drawn
(`geography.near_boundary_km`). Across the 12 states: 12,189 inside, 504 near boundary, 231 unverified.

## Guarantees checked

Across all 465,264 facility-months, in every state:

- no facility with an overdue commodity report gets High confidence;
- every missing monthly report means Low confidence;
- every Normal/Watch risk + Low confidence facility goes to Data Verification, never Monitor;
- every High/Critical risk + Low confidence facility carries VERIFY THEN ACT;
- national and zone totals equal the sum of their states;
- Bauchi's outputs are identical to the single-state build (Sep 2026: 188 act now, 72 verify then act,
  581 do not assume safe, 613 monitor), by hash over every facility-month (`tests/test_bauchi_regression.py`).

And in the action layer:

- a person approves every outbound message; the simulation never approves; nothing moves stock automatically;
- `SimulatedProvider` is the only implementation; configuring any other provider fails (the stubs raise `NotImplementedError`);
- every SMS is at most 160 characters and every template variant says DEMO;
- the assessed marts are never written: with no field verification, live status equals the assessed status for every PHC;
  a field count lifts confidence to Moderate at most and never past a missing report;
- escalation moves one step per breach and stops at the top; scope is enforced by the API (403);
- national action, access and hidden-burden totals equal the sum of their states.

## What we claim, and what we don't

We claim the engines detect what they were designed to detect, follow WHO DQR methods and published
inventory policy, and run on the structure of real DHIS2 and NHLMIS exports. We do **not** claim
real-world predictive accuracy, optimal thresholds, coverage of general essential medicines or staffing,
or that simulated numbers describe actual facilities in any state. Differences between states come from
labelled simulator parameters ([assumptions A13–A16](docs/assumptions.md)), not from real state performance.

Every person in the directory is invented (first name × surname from zone pools, no real office-holder),
phone numbers are `SIM-…` and emails end in `.invalid`; no message is ever sent. Access figures are real-derived
but catchments are proximity, not observed use. Hidden-burden figures are estimates with stated ranges; the
stock signal is a reason to check sooner, not proof of a stock-out.
