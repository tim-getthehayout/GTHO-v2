# UI Sprint Spec — Dashboard & Event Detail (2026-04-15)

Working design doc for the current round of UI improvements. Accumulates all design decisions here first. At the end of the sprint, a dedicated reconciliation session merges finalized content into the base docs (V2_UX_FLOWS.md, V2_DESIGN_SYSTEM.md, etc.) and converts `github/issues/` files to thin pointers.

**Rule:** Claude Code should read this file alongside the base docs during implementation. If this file conflicts with a base doc, this file wins (it's newer).

**Base doc sections already updated (no reconciliation needed):**
- V2_UX_FLOWS.md §17.7 — action button behavior (updated 2026-04-15)
- V2_UX_FLOWS.md §17.15 — event detail view (added 2026-04-15)

---

## Change Log

| Date | Section | What changed |
|------|---------|-------------|
| 2026-04-15 | SP-1 | Fix dashboard action buttons |
| 2026-04-15 | SP-2 | Event detail view |
| 2026-04-15 | SP-3 | Dashboard location card enrichment |
| 2026-04-15 | SP-2 | Design review round 1 — observation layout, post-graze recovery window, per-paddock DM stats, Remove-group picker, anchor-no-close rule, Manage button removed. Schema impacts added. Status → Ready for Claude Code. |
| 2026-04-15 | SP-3 | Scope correction — card targets v1 parity, not slimmer summary. Only two deltas from v1: drop small bottom Feed check / Feed buttons; add large green Feed button under large amber Feed check. Per-group reweigh removed from card, deferred to Animals area. Spec rewritten, mockup v3 approved. Status → Ready for Claude Code. |
| 2026-04-16 | SP-2 | Design review round 2 — event detail changed from full-screen route to **sheet overlay** (OI-0067). Pre-graze observations changed from modal to **inline editable fields** per v4 mockup (OI-0068). Post-graze card always renders with empty-state hint. |
| 2026-04-16 | SP-3 | Bug report — i18n keys render as raw text on buttons; click handlers not firing. Session brief written. |

---

## SP-1: Fix Dashboard Action Buttons

**Status:** Spec complete · Ready for implementation
**Spec file:** `github/issues/fix-dashboard-action-buttons.md`
**Base doc:** V2_UX_FLOWS.md §17.7 (already updated)

### Problem

All three action buttons on dashboard location cards (`Move`, `Survey`, `Edit`) navigate to generic routes (`#/events` or `#/surveys`) instead of acting on the specific event.

### Fix

**File:** `src/features/dashboard/index.js` — `renderLocationsView()` function (lines ~852–856)

**Move button:**
- Import `openMoveWizard` from `../events/move-wizard.js`
- Replace `navigate('#/events')` with `openMoveWizard(event, operationId, farmId)`
- `operationId` = `getAll('operations')[0].id`, `farmId` = active farm or `getAll('farms')[0].id`

**Edit button (interim):**
- Import `openCloseEventSheet` from `../events/close.js`
- Replace `navigate('#/events')` with `openCloseEventSheet(event, operationId)`
- Interim until SP-2 (event detail view) is built, then switch to `navigate('#/events?detail=' + event.id)`

**Survey button:**
- Export `openCreateSurveySheet` from `src/features/surveys/index.js` (currently not exported)
- Import in dashboard, replace `navigate('#/surveys')` with `openCreateSurveySheet(operationId)`

**Context:** `renderLocationsView(gridEl)` needs `operationId` and `farmId`. Pass from `renderDashboard()` which already has `operations` and `farms`.

### Acceptance Criteria

- [ ] Move button opens move wizard for that specific event
- [ ] Edit button opens close-event sheet for that event (interim)
- [ ] Survey button opens survey create sheet
- [ ] All three work on every active event card, not just the first
- [ ] `openCreateSurveySheet` export doesn't break existing survey screen

---

## SP-2: Event Detail View

**Status:** Refinement in progress · Session brief written 2026-04-16
**Spec file:** `github/issues/GH-10_event-detail-view.md` (full, authoritative — updated 2026-04-16)
**Mockup:** `App Migration Project/SP-2_event-detail_mockup.html` (v4, approved 2026-04-15)
**Base doc:** V2_UX_FLOWS.md §17.15 (interim placeholder — reconciliation will replace with the spec file content)
**Schema:** Impacts `event_observations` — see "Schema Impacts" below. CP-55/CP-56 spec update required.
**Session brief:** `github/issues/SESSION_BRIEF_2026-04-16_sp2-sp3-refinement.md`

### Summary

**Sheet overlay** (max-width 720px) for a specific event. The v2 equivalent of v1's "Edit event" sheet. Shows all event data and provides action buttons that launch existing sheets. Opens on top of the current screen (typically the dashboard).

### Navigation

Sheet, not a route. `openEventDetailSheet(event, operationId, farmId)` from the dashboard Edit button. `closeEventDetailSheet()` from back arrow or backdrop click. No `#/events?detail=` route.

### Page order (finalized in design review 2026-04-15)

1. Header (back + Active/Closed badge)
2. **Event Summary** (hero line with day count, head, weight, DMI, AU)
3. **DMI — Last 3 Days** (stacked bar chart)
4. **Paddocks** (anchor + open sub-paddocks, per-paddock DM stats)
5. **Pre-graze Observations** (height, cover, quality, condition, stored-only toggle)
6. **Post-graze Observations** (avg height · recovery min/max days on one row)
7. **Groups** (Move + Remove picker)
8. **Feed Entries** (Edit + Delete per row, Deliver feed CTA)
9. **Feed Checks** (Edit + Delete per row, Feed check CTA)
10. **DMI / NPK Breakdown**
11. **Notes** (auto-save on blur)
12. **Sub-move History** (Edit only — no inline Delete, no Manage)
13. **Actions** (Move all / Close & move / Delete)

### Key decisions from design review round 1 (2026-04-15)

- **Anchor-no-close rule:** when only one paddock window is open (the anchor), do not show a Close button on its card. The event ends via the footer's `Close & move` action.
- **Post-graze layout:** avg height + min/max recovery days on a single row to save vertical space. Min/Max are days, not heights.
- **Forage height:** numeric input, max 3 digits.
- **Forage cover:** narrow slider (~240px max width) with percentage readout.
- **Per-paddock stats:** each paddock card shows `Est. pasture DM` and `Est. days available` from CAP-1.
- **Remove group picker:** Remove does not delete silently — opens a picker with two options: Unplace (dissociate, no destination) or Move to existing event (standard move wizard).
- **Manage button dropped** from sub-move history; reopen folds into the Edit dialog.
- **Line-item affordances:** feed entries and feed checks get Edit + Delete (confirmation). Sub-move history gets Edit only.
- **Stored feed flag:** single `100% stored feed` toggle inside pre-graze observations.
- **One component per overlay pattern:** pre-graze modal, post-graze modal, confirmation dialog, etc. each have a single responsive implementation — no parallel desktop/mobile builds. Logged as `IMPROVEMENTS.md` item #12.

### Schema Impacts

Aligns `event_observations` with `paddock_observations`. Adds fields so pre-graze observations capture the same pasture-assessment data a survey would, plus post-graze-only fields.

New columns on `event_observations`:

| Column | Type | Purpose |
|---|---|---|
| `forage_quality` | integer (1–100) | match paddock_observations |
| `forage_condition` | text enum | match paddock_observations |
| `forage_cover_pct` | numeric(5,2) | match paddock_observations (verify absence) |
| `forage_height_cm` | numeric(6,2) | match paddock_observations (verify absence) |
| `stored_feed_only` | boolean default false | pre-graze toggle |
| `post_graze_height_cm` | numeric(6,2) nullable | post-graze only |
| `recovery_min_days` | integer nullable | post-graze only |
| `recovery_max_days` | integer nullable | post-graze only |
| `observation_phase` | text enum `pre_graze` / `post_graze` | NEW — which side of grazing |
| `paddock_window_id` | uuid FK → event_paddock_windows(id) | NEW — per-paddock observations |

Backward compat for reads: `pre_graze` filter includes `observation_phase IS NULL` (old rows).

**CP-55/CP-56 impact (per Export/Import Spec Sync Rule):**
- CP-55 export must serialize all new columns.
- CP-56 import must default missing fields for old backups (nulls for new columns; `stored_feed_only = false`; `observation_phase = null` treated as pre-graze; `paddock_window_id = null` = orphan attached to event).
- Migration bumps `schema_version` and adds `BACKUP_MIGRATIONS` entry.
- If new FK changes restore ordering, update V2_MIGRATION_PLAN.md §5.3 and §5.3a in the same commit.

### Linked OPEN_ITEMS

- OI-0063 — `event_observations` schema alignment
- OI-0064 — Manage button dropped from sub-move history

---

## SP-3: Dashboard Location Card — V1 Parity

**Status:** Spec complete · Ready for Claude Code
**Spec file:** `github/issues/dashboard-card-enrichment.md` (full, authoritative)
**Mockup:** `App Migration Project/SP-3_location-card_mockup.html` (v3, approved 2026-04-15)
**Base doc impact:** V2_UX_FLOWS.md §17.7 (will be replaced during end-of-sprint reconciliation)
**Schema:** None. Visual/rendering only. No CP-55/CP-56 impact.

### Goal

Rebuild the v2 dashboard location card to match the v1 card **exactly**, with only two deliberate changes. V1 users (every user during migration) must not experience the v2 dashboard as a regression.

### The two changes from v1

1. **Remove** the two small "Feed check" and "Feed" buttons that sit at the very bottom of the v1 card (below the NPK line).
2. **Add** a second large "Feed" button (green, full-width, matching the Feed-check button's size and style) directly below the existing large amber "Feed check" button.

That is the entire delta. Every other element renders exactly as v1 does.

### Additional decision (2026-04-15)

- **Per-group reweigh icon removed from the card.** V1 shows a reweigh/scale icon next to the per-group Move button. V2 removes this from the dashboard card and reserves reweigh for the Animals area of the app. Tracked as an open follow-up — does not block SP-3.

### What the card includes (v1 parity)

Top to bottom:

1. Left green accent bar
2. Header: leaf icon · name · acreage · floating Edit + Move-all buttons top-right
3. Event type badge (e.g., `stored feed & grazing`, `grazing`) inline with summary line
4. Summary: `Day N · In {date} · ${cost}`
5. Weight: `{W} lbs · {AU} AU`
6. Green capacity line: `Est. capacity: {N} AUDs · ~{M} days remaining (incl. stored feed) · {H}" · ADA est: {X}/ac`
7. Gray breakdown: `Pasture: {X} lbs DM · Stored feed: {Y} lbs DM · DMI demand: {Z} lbs/day`
8. `+ Add sub-move` teal link
9. `SUB-PADDOCKS` section (when sub-moves exist): per-paddock row with dot, name, acreage, since-date, active/closed label, Close button on active rows
10. `GROUPS` section: per-group row with dot, name, head + avg-weight sub-line, Move button (no reweigh icon)
11. `DMI — LAST 3 DAYS` chart: 3 bars (today solid, future striped + labeled `(est.)`), stored-feed segment at base when present, today's number large on the right, grazing/stored legend
12. Large amber **Feed check** button (full-width)
13. Large green **Feed** button (full-width) — **NEW** — directly below Feed check
14. DMI/NPK summary: `DMI {N} lbs/day · X% stored · Y% est. pasture` and `NPK: N.. / P.. / K.. lbs · $value value`
15. No small bottom buttons (the two small `Feed check` / `Feed` buttons from v1 are gone)

See `github/issues/dashboard-card-enrichment.md` for the full line-by-line spec, calc references, tests, and acceptance criteria.

### Linked OPEN_ITEMS

- **OI-0065** — Per-group reweigh moves from dashboard card to Animals area (P3, DESIGN REQUIRED, not blocking)
- **OI-0066** — Per-group Move on dashboard card is event-scoped, not group-scoped (P3, follow-up)

---

## Reconciliation Checklist (end of sprint)

When this sprint is complete, do a dedicated session to:

- [ ] Merge SP-3 card spec into V2_UX_FLOWS.md §17.7 (replace current minimal card body spec)
- [ ] Verify §17.15 (already in base doc) is still accurate after implementation
- [ ] Verify §17.7 action buttons (already in base doc) match final implementation
- [ ] Convert `github/issues/` files to thin pointers referencing base doc sections
- [ ] Update V2_BUILD_INDEX.md with completed work
- [ ] Archive this file or mark it as reconciled
