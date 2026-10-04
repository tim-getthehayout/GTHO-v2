# GTHO v2 — Project Status

**Last updated:** 2026-10-04 (OI-0192 shipped)  
**Purpose:** Single living source of truth for this project. Read at the start of every new conversation or Grok Build session. Update after every significant decision or change.

Detail stays in the specs and in `OPEN_ITEMS.md`. This file is the current picture, not a second backlog.

---

## 1. Project Goals

- Pasture and grazing PWA for the farm: locations, animals, moves, harvest, amendments, todos.
- Offline-first, then sync to Supabase.
- Location-aware work: pastures are polygons; a to-do is a pasture or a map point.

## 2. Constraints & Priorities

- Schema first. No UI field without a Supabase column.
- A migration file is not applied until it has been run and verified.
- Writes go through the store and sync queue.
- `main` deploys to GitHub Pages. Do not force-push.
- GPS is foreground only. Shapefile import is out of v1.

## 3. Current State

- App: `https://tim-getthehayout.github.io/GTHO-v2/` from `main`.
- Stack: vanilla JS, Vite, Supabase, GitHub Pages. v1 is `get-the-hay-out`.
- Schema stamp 35. Migration `035_paddock_window_open_cohort.sql` applied in Supabase on 2026-10-04. `event_paddock_windows.open_cohort_id` is a nullable uuid. Migration 034 (map geometry) remains applied.
- Farm map is on `main` (`a554f01`, PR #58). Locations store GeoJSON, centroid, and `map_source`. Todos may store a point. Shared picker covers harvest, amendments, the move wizard, and todos. Import is GeoJSON, KML, and KMZ.
- Auth boot gate is on `main` (`1cedc14`, follow-ups `87784b8` and `26fc83c`). An empty browser cache is not a new operation. Confirmed by Tim after a hard refresh. Do not finish the new-operation wizard on a PC that already has an operation.
- Multi-paddock open is on `main` (`8748872`). One Save opens N whole paddocks on one event. Windows from that Save share `open_cohort_id`. Pages deploy succeeded. Confirm header stamp `b2026-10-04.1957-8748872` after a hard refresh.
- Home Screen update prompt is on `main` (`5c2db09`). A waiting worker or a `version.json` mismatch shows Update now / Later. No auto-reload. Pages deploy succeeded. Confirm header stamp `b2026-10-04.2101-5c2db09` after a hard refresh. The existing Home Screen icon was added without a manifest and will not update itself. Remove it and add it again after this stamp shows in Safari. The next deploy after that re-add is the one that should show the banner.
- Working rules: root `AGENTS.md` is the session and implementation file. `CLAUDE.md` is a retired pointer. Process reference: `project-framework/AGENTS.md`. A shipped change must name the header build stamp to confirm. A push is not live until the Pages workflow succeeds.
- `V2_SCHEMA_DESIGN.md` §2.1 does not yet list the migration 034 columns. Do not treat that section as the live schema for map fields.

## 4. Key Decisions / Decision Log

| Date | Decision | Notes |
|------|----------|-------|
| 2026-10-04 | Pastures are polygons; to-do location is a location or a point | Migration 034 applied. Shapefile deferred. |
| 2026-10-04 | Adopt the project framework inside this repo | Process files live in `project-framework/`. Root `AGENTS.md` is the project file. |
| 2026-10-04 | Do not rewrite the V2 design docs to match the framework | Specs stay. Status points at them. |
| 2026-10-04 | Root `AGENTS.md` matches the template workflow | Template sections kept. GTHO doc ownership and OI close rules are overrides, not a replacement. |
| 2026-10-04 | `AGENTS.md` replaces `CLAUDE.md` | Implementation rules moved into `AGENTS.md`. `CLAUDE.md` is a redirect stub. |
| 2026-10-04 | Map is in the live app | Import, centered labels, click bubble with acreage and last closed grazing, map pick on the move pasture picker. Confirm header stamp ending `1e76f0a`. |
| 2026-10-04 | Existing operation must not enter the new-operation wizard | OI-0191. Empty `localStorage` checks `operation_members` before the wizard. Full cold pull stays after paint (OI-0149). Tim confirmed the new build after a hard refresh. |
| 2026-10-04 | Multi-paddock open is one event, N windows, one reading fanned out | OI-0102 shipped in `8748872`. `open_cohort_id` labels the set and does not lock it. In-use paddocks stay visible and are not selectable. Migration 035 applied and verified. Header stamp `b2026-10-04.1957-8748872`. |
| 2026-10-04 | Home Screen update is a confirmed prompt, not a reload | OI-0192 shipped in `5c2db09`. Waiting worker or `version.json` mismatch shows Update now / Later. No auto-reload. Header stamp `b2026-10-04.2101-5c2db09`. Spec: `github/issues/GH-59_OI-0192_pwa-update-prompt.md`. |

## 5. Open Questions / Next Steps

1. OI-0192 is closed. Shipped in `5c2db09`. Confirm header stamp `b2026-10-04.2101-5c2db09`. After that stamp shows in Safari, remove the Home Screen icon and add it again. The old web clip will not update itself. The next deploy after that re-add should show the banner.
2. OI-0102 is closed. Shipped in `8748872`. Confirm header stamp `b2026-10-04.1957-8748872`.
3. OI-0188 — no UI into a closed event. Design required. Body in `OPEN_ITEMS.md`.
4. OI-0189 — UTC date after 8 PM Eastern. Design required.
5. OI-0190 — destination start edit does not cascade to the source close. Design required.
6. Patch `V2_SCHEMA_DESIGN.md` §2.1 with the migration 034 columns, and the `event_paddock_windows` section with migration 035 `open_cohort_id`, when the schema doc is next touched. The backup export selects all columns, so the new column is included without a column list change.
7. OI-0191 is closed. Shipped in `1cedc14`. Pages did not publish it until `26fc83c` because lint and unit tests failed. Tim confirmed the post-June build after a hard refresh. Live stamp at this close: `b2026-10-04.1607-1e76f0a`.

## 6. Framework feedback (process only)

| Date | Discovery | Suggested framework change | Status |
|------|-----------|----------------------------|--------|
| 2026-10-04 | Uploading the framework pack into an existing app repo overwrites the project `AGENTS.md` and lands templates in the root | Adoption note: copy into `project-framework/` and keep a project `AGENTS.md` at root | Parked |
| 2026-10-04 | A green local commit is not the live app if Pages fails before upload | End-of-session gate should name the header stamp only after the deploy workflow succeeds | Parked |

---

*Update this file after every significant decision so future sessions start with accurate context.*
