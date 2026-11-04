# GTHO v2 — Project Status

**Last updated:** 2026-11-04 (feed day goal DMI denominator decision)  
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
- Schema stamp 36. Migration `036_batch_adjustment_date.sql` applied and verified in Supabase on 2026-11-03. `batch_adjustments.adjustment_date` is a nullable date. Migration 035 remains applied.
- Feed batch adjustment date + archive is on `main` (fast-forward to `e679e7e`, feature commit `22968d3`). Adds `batch_adjustments.adjustment_date`, archive/unarchive + show/hide archived pill, and a batch-card activity list (feed out + adjustments) with edit only on adjustments. Migration 036 and `BACKUP_MIGRATIONS` 35→36 are on `main` and applied. Pages deploy of the merge is pending header stamp confirmation.
- Farm map is on `main` (`a554f01`, PR #58). Locations store GeoJSON, centroid, and `map_source`. Todos may store a point. Shared picker covers harvest, amendments, the move wizard, and todos. Import is GeoJSON, KML, and KMZ.
- Auth boot gate is on `main` (`1cedc14`, follow-ups `87784b8` and `26fc83c`). An empty browser cache is not a new operation. Confirmed by Tim after a hard refresh. Do not finish the new-operation wizard on a PC that already has an operation.
- Multi-paddock open is on `main` (`8748872`). One Save opens N whole paddocks on one event. Windows from that Save share `open_cohort_id`. Pages deploy succeeded. Confirm header stamp `b2026-10-04.1957-8748872` after a hard refresh.
- Home Screen update prompt is on `main`. Feature commit `5c2db09` (GH-59). A waiting worker or a `version.json` mismatch shows Update now / Later. No auto-reload. Pages published `5c2db09` as `b2026-10-04.2101-5c2db09`, then the status commit `61472d3` as `b2026-10-04.2104-61472d3`. The header stamp matches the commit Pages last built. The existing Home Screen icon was added without a manifest and will not update itself. Remove it and add it again after the current stamp shows in Safari. The next deploy after that re-add is the one that should show the banner.
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
| 2026-10-04 | Home Screen update is a confirmed prompt, not a reload | OI-0192 shipped in `5c2db09`. Waiting worker or `version.json` mismatch shows Update now / Later. No auto-reload. Header stamp of status commit `61472d3` is `b2026-10-04.2104-61472d3`. Spec: `github/issues/GH-59_OI-0192_pwa-update-prompt.md`. |
| 2026-11-03 | Feed batch adjustments get a user-settable date; empty batches can be archived | On `main` (fast-forward to `e679e7e`, feature at `22968d3`). `batch_adjustments.adjustment_date` (date). Archive/unarchive + show/hide archived pill. Batch card shows feed-out and adjustments; edit pill only on adjustments. Feed-out amounts stay editable only on the event card. Migration 036 applied and verified 2026-11-03. Spec: `session_briefs/SESSION_BRIEF_2026-11-03_feed-batch-adjust-date-and-archive.md`. Header stamp after Pages succeeds. |
| 2026-11-03 | Feed day goal banner must refresh live on inventory changes | Banner is computed on read but was only rendered once. Adjusting remaining, adding a batch, or a delivery left days-on-hand and the progress bar stale until screen re-entry. Fix: refresh helper called from the existing store subscriptions. Spec: `session_briefs/SESSION_BRIEF_2026-11-03_feed-day-goal-banner-refresh.md`. |
| 2026-11-04 | Feed day goal denominator is farm-wide active animal DMI | Days on hand = total DM of current non-archived inventory ÷ sum of DMI for every animal with `active !== false`, regardless of group, event, or location. Replaces the 30-day delivery average. Matches V2_UX_FLOWS.md §13.2 intent. Spec: `session_briefs/SESSION_BRIEF_2026-11-04_feed-day-goal-dmi-denominator.md`. |

## 5. Open Questions / Next Steps

1. Feed day goal denominator change is ready for Grok Build. Spec: `session_briefs/SESSION_BRIEF_2026-11-04_feed-day-goal-dmi-denominator.md`. Days on hand must use farm-wide active animal DMI, not the 30-day delivery average.
2. Feed day goal banner refresh is on `main` (`3aedbae`). Pages workflow succeeded. Confirm header stamp after a hard refresh. Spec: `session_briefs/SESSION_BRIEF_2026-11-03_feed-day-goal-banner-refresh.md`.
3. OI-0192 is closed. Shipped in `5c2db09`. Header stamp of `61472d3` is `b2026-10-04.2104-61472d3`. After the current stamp shows in Safari, remove the Home Screen icon and add it again. The old web clip will not update itself. The next deploy after that re-add should show the banner.
4. OI-0102 is closed. Shipped in `8748872`. Confirm header stamp `b2026-10-04.1957-8748872`.
5. OI-0188 — no UI into a closed event. Design required. Body in `OPEN_ITEMS.md`.
6. OI-0189 — UTC date after 8 PM Eastern. Design required.
7. OI-0190 — destination start edit does not cascade to the source close. Design required.
8. Patch `V2_SCHEMA_DESIGN.md` §2.1 with the migration 034 columns, and the `event_paddock_windows` section with migration 035 `open_cohort_id`, when the schema doc is next touched. The backup export selects all columns, so the new column is included without a column list change.
9. OI-0191 is closed. Shipped in `1cedc14`. Pages did not publish it until `26fc83c` because lint and unit tests failed. Tim confirmed the post-June build after a hard refresh. Live stamp at this close: `b2026-10-04.1607-1e76f0a`.
10. Feed batch adjustment date + archive is on `main`. Migration 036 applied and verified. Confirm Pages header stamp after the workflow succeeds.

## 6. Framework feedback (process only)

| Date | Discovery | Suggested framework change | Status |
|------|-----------|----------------------------|--------|
| 2026-11-04 | Project chat implemented and pushed a code change (feed banner refresh) instead of writing the brief and handing off to Grok Build | Keep role split strict: docs + brief in project chat, code in Build. Note when the split is mixed. | Noted |
| 2026-10-04 | Uploading the framework pack into an existing app repo overwrites the project `AGENTS.md` and lands templates in the root | Adoption note: copy into `project-framework/` and keep a project `AGENTS.md` at root | Parked |
| 2026-10-04 | A green local commit is not the live app if Pages fails before upload | End-of-session gate should name the header stamp only after the deploy workflow succeeds | Parked |
| 2026-10-04 | A docs commit on `main` rebuilds the header stamp | The stamp named in that commit is the previous deploy. The header then shows the docs commit's own sha | Parked |

---

*Update this file after every significant decision so future sessions start with accurate context.*
