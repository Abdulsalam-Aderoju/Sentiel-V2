# Progress: From Early Warning to Action

Branch `feat/action-access-burden`. Last updated 11 Oct 2026. **P0–P9 complete, plus the three-portal separation.**

## Latest change: three separate portals

The app now opens on a public landing page, then a demo sign-in sends you into one of three portals that cannot reach each other.

| Portal | Home | Sees |
|---|---|---|
| National (blue) | `/national` | State summaries only; state responses; briefing mode. No way into a state or LGA portal |
| State board (green) | `/state/{code}` | One state and its LGAs, including its Action Centre; can open its LGA portals |
| LGA (purple) | `/state/{code}/lga/{id}` | One LGA: clinics, its own Action Centre, access, people |

Key files: `web/middleware.ts` (route guard), `components/SignIn.tsx`, `components/PortalBar.tsx`, `components/actions/ActionCentreView.tsx`
(shared Action Centre body), `app/(public)/` (landing, sign-in, about), `app/(main)/national/responses`, `app/portals.css`.
API: `GET /meta/signin`, `GET /national/responses`, `GET /responses?lga_id=`. Decisions D67–D72 in `docs/decisions.md`.

Verified: guards by cookie for each portal; the LGA demo loop, then national requests a response, the state board answers, national reads
the lead and plan (Playwright, dev and Docker builds); landing and sign-in at 390 px in light and dark; 180 fast tests pass.

## Commits

P0 f84438e · P1–P4 48195b4 · P5 09265aa · merge 636e986 · P6 b8d5301 · P7 35ad433 · P8 113e121 · P9 843128d, 8f02d40 · portals (this commit)

## Not yet done

1. Re-run the slow suite (`pytest -m slow`, about 5 min) after the portal change; only the fast suite was run.
2. The Claude Docs walkthrough "PHC Sentinel, explained from scratch" (sections 8 and 9) and the build report still describe the old
   "Act as" switcher and the single app; update them if they are to be shown.
3. National has no drill-in by the owner's choice (D68, NEEDS OWNER REVIEW).
4. Owner-review list in `docs/report_action_layer.md` (D24, D63, A28, D41, D43, D44, D52, A40/A41, data licences) is unchanged.
5. Open a PR from `feat/action-access-burden` to `main` when ready.

## Handy commands

- Clean demo start: `python -m sentinel actions reset` (clock 30 Oct 2026; Bauchi demo cases are in Toro LGA).
- Advance time: `python -m sentinel actions tick --days N` or the clock buttons in any Action Centre.
- Dev API: `.venv/Scripts/python -m uvicorn sentinel.api.main:app --port 8001` (no `--reload`; restart after backend changes).
- Dev web: `cd web && API_URL=http://127.0.0.1:8001 npx next dev -p 3001`. Docker stack: http://localhost:3000.
