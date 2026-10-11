# Progress: From Early Warning to Action

Branch `feat/action-access-burden`. Last updated 11 Oct 2026. **All phases P0–P9 are complete.**

## Commits

| Phase | Commit | What |
|---|---|---|
| P0 | f84438e | Plan and action-layer config |
| P1–P4 | 48195b4 | Action-layer backend: directory, rules, cases, messaging, replies, live overlay, API, scope |
| P5 | 09265aa | Action Centre UI |
| merge | 636e986 | Workstream A pipeline (`feat/access-travel-burden`) |
| P6 | b8d5301 | Access in DB, API and UI; R11; impact sort |
| P7 | 35ad433 | Hidden burden with validation; Behind the gaps tab; R12 |
| P8 | 113e121 | National strip, state response request, overdue metric, briefing slides |
| P9 | (this commit) | README, Validation lab, Docker pipeline (+ libexpat fix), phone-width fixes, final report |

## Verification (11 Oct 2026)

- `pytest`: 190 passed (175 fast + 15 slow, including the Bauchi regression and action DB tests).
- Clean `docker compose up --build`: pipeline exited 0; API and web up; 8,425 cases opened. The access step needed
  `libexpat` in the image (now installed; proven by running `access` in the container with the same figures).
- Browser pass on the Docker build: demo loop 23 s, 80 page views with zero console errors and visible focus everywhere.
  Two 390 px overflows (briefing controls, directory filters) found and fixed in CSS.

## Optional follow-ups

1. Done: the Docker web on port 3000 was rebuilt with the phone-width fixes (rechecked, no overflow).
2. A full Docker run with network to see `fetch-access` + `access` end to end in one pipeline (the first run's
   download worked; the second lost DNS mid-download).
3. Owner decisions listed in `docs/report_action_layer.md` → "Needs owner review".
4. Open a PR from `feat/action-access-burden` to `main` when the owner is happy.

## Handy commands

- Clean demo start: `python -m sentinel actions reset` (clock 30 Oct 2026; Bauchi demo cases in Toro LGA:
  `/state/bauchi/cases?demo=true`).
- Advance time: `python -m sentinel actions tick --days N`.
- Dev API: `.venv/Scripts/python -m uvicorn sentinel.api.main:app --port 8001` (no `--reload`; restart after backend changes).
