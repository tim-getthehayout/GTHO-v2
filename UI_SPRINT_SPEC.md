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

**Status:** Spec complete · Ready for Claude Code
**Spec file:** `github/issues/event-detail-view.md` (full, authoritative)
**Mockup:** `App Migration Project/SP-2_event-detail_mockup.html` (v4, approved 2026-04-15)
**Base doc:** V2_UX_FLOWS.md §17.15 (interim placeholder — reconciliation will replace with the spec file content)
**Schema:** Impacts `event_observations` — see "Schema Impacts" below. CP-55/CP-56 spec update required.

### Summary

Full-screen single-column view (max-width 720px) for a specific event. The v2 equivalent of v1's "Edit event" sheet. Shows all event data and provides action buttons that launch existing sheets.

### Navigation

Query param: `#/events?detail={eventId}`. Events screen renders detail view when present, calendar/list otherwise. Back arrow uses `history.back()` (falls back to `#/dashboard`).

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

## SP-3: Dashboard Location Card Enrichment

**Status:** Spec in progress
**Spec file:** TBD
**Base doc impact:** V2_UX_FLOWS.md §17.7 (card body spec needs expansion)

### Problem

V2 dashboard location cards show minimal info: location name, groups (as flat text), day count, feed count/cost. V1 cards show much more: acreage, event type badge, move-in date, total cost, weight/AU, capacity estimates, days remaining, ADA, pasture/stored/DMI breakdown, per-group rows with individual Move buttons, 3-day DMI chart, feed check button.

### Target: Match v1 card richness

**V1 card anatomy (reference — from live v1 site, observed 2026-04-15):**

```
┌────────────────────────────────────────────────┐
│ 🌿 D  7.42 ac                                 │
│ [stored feed & grazing]  Day 23 · In Mar 24 · │
│                                       $45.00   │
│ Weight: 4,350 lbs · 4.3 AU                    │
│ Est. capacity: 80 AUDs · ~6 days remaining    │
│   (incl. stored feed) · 4" · ADA est: 10.8/ac │
│ Pasture: 2,078 lbs DM · Stored feed: 638 lbs  │
│   DM · DMI demand: 109 lbs/day                │
│                                                │
│ + Add sub-move                                 │
│ ─────────────────────────────────────────────  │
│ GROUPS                                         │
│ ● Bull Group              [Move] [🔄]         │
│   3 head · avg 1450 lbs                       │
│ + Add group                                    │
│ ─────────────────────────────────────────────  │
│ DMI — LAST 3 DAYS                              │
│ ▓▓▓  ▓▓▓  ▓▓▓   109 lbs DMI today             │
│ Mon✓  Tue  Wed   ■ grazing  ■ stored           │
│ ─────────────────────────────────────────────  │
│ [        Feed check        ]                   │
│ ─────────────────────────────────────────────  │
│ DMI 109 lbs/day · 0% stored · 100% pasture    │
│ NPK: N32.0 / P9.0 / K30.0 lbs · $36.07 value │
│ [Feed check]  [Feed]                           │
└────────────────────────────────────────────────┘
```

### V2 enriched card spec

The v2 card keeps the card-based layout but adds v1's data density. Since v2 also has the event detail view (SP-2), the card is a **summary** — users tap Edit (or the card itself) to see the full detail.

**Card structure (enriched):**

```
┌────────────────────────────────────────────────┐
│ D  7.42 ac                        [pasture]    │
│ Day 23 · In Mar 24, 26 · $45.00               │
│ 3 head · 4,350 lbs · 4.3 AU                   │
│ Est. ~6 days remaining · ADA 10.8/ac           │
│ DMI: 109 lbs/day (100% pasture)                │
│ ─────────────────────────────────────────────  │
│ GROUPS                                         │
│ ● Bull Group                         [Move]    │
│   3 head · avg 1450 lbs · 4.3 AU              │
│ ─────────────────────────────────────────────  │
│ [  Move  ] [ Survey ] [  Edit  ]               │
└────────────────────────────────────────────────┘
```

**Line-by-line spec:**

1. **Header row:** Location name (14px, 700) + acreage (14px, 400, `--text2`) + land use badge (right)
   - Acreage from `locations.areaHa`, converted via `units.js`

2. **Stats row 1:** "Day {N} · In {dateIn formatted} · ${totalCost}"
   - Day count from `daysBetweenInclusive(event.dateIn, today)`
   - Date in formatted as "Mar 24, 26" (short month + day + 2-digit year)
   - Total cost = sum of `eventFeedEntries` costs (use calc CST-1 if available)

3. **Stats row 2:** "{headCount} head · {totalWeight} lbs · {AU} AU"
   - Head count = sum of active group windows' `headCount`
   - Total weight = sum of `headCount × avgWeightKg`, converted to display units
   - AU = total weight in lbs ÷ 1000

4. **Stats row 3:** "Est. ~{N} days remaining · ADA {X}/ac"
   - Days remaining from capacity calc (if available, otherwise omit line)
   - ADA = AU ÷ location area in display units

5. **Stats row 4:** "DMI: {N} lbs/day ({X}% pasture)"
   - From calc engine DMI-1 if registered
   - Shows pasture vs stored percentage

6. **Groups section:**
   - Section label "GROUPS" (`.sec` style)
   - One row per active group window
   - Each row: status dot + group name (left) + **Move** button (right, `btn btn-teal btn-xs`)
   - Sub-line: head count · avg weight (display units) · AU
   - Move button calls `openMoveWizard` scoped to that group's event

7. **Action buttons:** Same as current but wired correctly per SP-1

**Calc-dependent fields:** Any field that depends on an unregistered calc shows "—" rather than erroring. The card degrades gracefully — if no calcs are available, it still shows head count, weight, day count, and dates (all computable from raw store data).

**Performance note:** Cards re-render when store changes. Keep card rendering cheap — pre-compute values in the rendering loop, don't call calcs inside DOM builders.

### Acceptance Criteria

- [ ] Location card header shows location name + acreage + land use badge
- [ ] Stats rows show: day count + date in + cost, head/weight/AU, days remaining + ADA, DMI summary
- [ ] Groups section shows per-group rows with individual Move buttons
- [ ] Move button on group row opens move wizard for that event
- [ ] All calc-dependent fields show "—" gracefully when calcs aren't registered
- [ ] Card renders correctly on mobile (single column) and desktop (2-column grid)
- [ ] Existing location card tests still pass (update assertions for new content)

---

## Reconciliation Checklist (end of sprint)

When this sprint is complete, do a dedicated session to:

- [ ] Merge SP-3 card spec into V2_UX_FLOWS.md §17.7 (replace current minimal card body spec)
- [ ] Verify §17.15 (already in base doc) is still accurate after implementation
- [ ] Verify §17.7 action buttons (already in base doc) match final implementation
- [ ] Convert `github/issues/` files to thin pointers referencing base doc sections
- [ ] Update V2_BUILD_INDEX.md with completed work
- [ ] Archive this file or mark it as reconciled
