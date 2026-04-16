# SP-2: Event Detail View

**Labels:** spec, task, P1 — high, v2-design
**Sprint:** UI Improvements (2026-04-15)
**Source:** `UI_SPRINT_SPEC.md` § SP-2
**Base doc impact:** V2_UX_FLOWS.md §17.15 (draft added 2026-04-15 — reconciliation will replace it with this spec at end of sprint)
**Schema impact:** Yes — see § "Schema Impacts" below. Updates CP-55/CP-56 export/import spec.

## Read First

1. `UI_SPRINT_SPEC.md` § SP-2 — sprint-level summary and decision trail from the 2026-04-15 design review
2. `SP-2_event-detail_mockup.html` (in `App Migration Project` folder) — the approved v4 wireframe this spec implements
3. `V2_UX_FLOWS.md` §17.15 — interim placeholder (do not edit; reconciliation owns it)
4. `V2_DESIGN_SYSTEM.md` — tokens for colors, spacing, typography, buttons
5. `V2_SCHEMA_DESIGN.md` §§ observations, events, groups, feed — context for data reads and the proposed `event_observations` columns
6. `V2_CALCULATION_SPEC.md` — DMI-1, DMI-2, CAP-1, NPK-1, NPK-2, CST-1 (fields that depend on these)
7. `CLAUDE.md` → "Active Sprint" and "Export/Import Spec Sync Rule"

## Summary

Build the Event Detail View — a full-screen, single-column, max-width 720px view that shows all data for one event (active or closed) and surfaces the actions the user can take on it. This replaces v1's "Edit event" sheet and is the target that dashboard "Edit" buttons (SP-1 interim) will eventually route to.

Accessed via `#/events?detail={eventId}`. The events screen checks for the `detail` query param: if present, render this view; otherwise render the calendar/list. Back button returns to the previous hash.

**This is a view-plus-launcher** — it reads state and invokes existing exported sheet/wizard functions. It does not contain new mutation logic except notes auto-save. All add/edit/remove/move/close/delete operations go through the existing sheets.

## Navigation and Layout

- **Sheet overlay** (not a routed view). Opened via `openEventDetailSheet(event, operationId, farmId)`. No route — the sheet opens on top of the current screen (typically the dashboard). Closed via back arrow or backdrop click.
- Uses the `ensureSheetDOM()` pattern since it's called cross-route from the dashboard.
- Container: single column, `max-width: 720px`, centered on ≥720px viewports, full-width on mobile. Sheet body scrolls independently (`overflow-y: auto`); page behind gets `overflow: hidden` while sheet is open.
- Padding: `--space-4` (top/side), section spacing `--space-5` between cards
- Responsive rule: **one component per pattern** — pre-graze / post-graze / notes / sub-moves reopen via a single responsive modal/sheet implementation (not parallel desktop/mobile builds). See `IMPROVEMENTS.md` item #12.
- Header row: back arrow (`←`) + event status badge (`Active` teal / `Closed` grey). No title — the Event Summary card immediately below carries the identity.
- **No `#/events?detail=` route.** The events screen always renders calendar/list. The detail sheet is a separate overlay.
- Reader order (top to bottom):
  1. Header (back + status)
  2. **Event Summary** (hero card — above the fold)
  3. **DMI — Last 3 Days** chart
  4. **DMI / NPK Breakdown** (groups nutrition data with chart above)
  5. **Paddocks** (anchor + open sub-paddocks)
  6. **Pre-graze Observations**
  7. **Post-graze Observations**
  8. **Groups**
  9. **Feed Entries**
  10. **Feed Checks**
  11. **Notes**
  12. **Sub-move History**
  13. **Actions** (Move all / Close & move / Delete)

## Section Specs

### 1. Header

- Left: `←` back button, `aria-label="Back"`, calls `closeEventDetailSheet()`.
- Right: status badge. `Active` uses `--teal` background; `Closed` uses `--text2` on `--bg3`. No other chrome.

### 2. Event Summary (hero)

Card at top. Displays headline stats without a section label.

- **Hero line (one row, wrap on narrow):** `Day {N} · {headCount} head · {totalWeightLbs} lbs · {dailyDMI} lbs DMI · {AU} AU`
  - `Day N` = `daysBetweenInclusive(event.dateIn, today)`
  - Weight and DMI convert via `units.js` from the operation's `unit_system`
  - If `dailyDMI` calc not registered, omit that token (keep separators tight: `Day 23 · 3 head · 4,350 lbs · 4.3 AU`)
- **Sub-line:** `In {dateIn}` · `Out —` (active) or `Out {dateOut}` (closed) · `${totalCost}`
  - Date format: `Mar 24, 26` (short month, day, 2-digit year) via a shared formatter (create `src/utils/date-format.js` if it doesn't exist)
  - Total cost from CST-1 (via `feedCost`); show `$0.00` when no feed

### 3. DMI — Last 3 Days

- 3-day stacked bar chart. Days on X axis, DMI lbs on Y. Two colors stacked: grazing `--green`, stored `--amber`.
- Label to the right of the chart: `{todaysDMI} lbs DMI today`
- Dependency: DMI-1 must produce a daily breakdown with a source split (pasture vs stored). If DMI-1 isn't registered or doesn't split, **hide the entire card** and emit a `logger.info('dmi.chart.skipped', ...)` with the reason.

### 4. Paddocks

One card per currently open paddock window on this event.

- Header row: `Paddock {name}` · `{area} {ac|ha}` · `Day {N} on paddock`
- Stats row: `Est. pasture DM: {lbs} · Est. days available: {N}`
  - `Est. pasture DM` from CAP-1 (or successor) per paddock. Omit the line if no calc.
- Latest observation sub-line: `Height {cm→in} · Cover {%}` from the most recent pre-graze observation for that paddock window. Show `—` for any field that has no observation.
- **Rule (anchor no-close):** If the event has exactly one open paddock window (the anchor), **do not render a Close button** on that paddock card. The event ends when all sub-paddocks are closed — closing the anchor closes the event and belongs in the **Actions** footer (`Close & move`). Show the Close button only on sub-paddock cards opened via sub-move.
- Close button (sub-paddocks only): `btn btn-teal btn-xs` labeled `Close paddock` — opens the close-paddock confirmation sheet for that window.

### 5. Pre-graze Observations

Card with **inline editable fields** (not a modal). All fields editable for active events; disabled for closed events. Changes auto-save on blur with a `Saved` flash (same pattern as Notes).

**Row 1 (flex, wrap on narrow):**
- Avg. Forage Height: `<input type="number">` (narrow, ~52px), step 0.5, max 999, unit label `(in.)` or `(cm)` per operation unit system
- Forage Cover: `<input type="number">` (60px), 0–100, step 1, unit `(%)` + narrow slider (`<input type="range">`, ~140px max width) directly below the input. Slider and input stay in sync.

**Row 2 (flex, wrap on narrow):**
- Forage Quality: `<input type="number">` (60px), 1–100, step 1, unit `(1–100)`
- Condition: chip picker with 4 options — `Poor` / `Fair` / `Good` / `Excellent`. Active chip gets green background (`var(--green)`, white text). Match the `.qual-chip` style from the v4 mockup.

**Note:** The `100% stored feed` toggle is per-paddock (shown on each paddock card in § Paddocks), NOT in this pre-graze card.

- Read from the most recent observation row for this event with `observation_phase = 'pre_graze'` (or no phase value — see schema impacts for backward compat).
- **No modal, no "Add" button.** Fields are always visible. If no pre-graze observation exists yet, show the same fields but empty/placeholder. First blur on any field creates the observation record.
- Use `.obs-line`, `.obs-field`, `.obs-field-row`, `.cover-slider`, `.qual-picker`, `.qual-chip` CSS from the v4 mockup — they're production-ready.

### 6. Post-graze Observations

Card with limited fields. **Always rendered** (even when no observations exist yet).

- **Row 1 (single row to save space):** `Avg height {cm→in}` · `Recovery window: Min {N} days · Max {N} days`
- Min/Max are integers in days (not heights). Min ≤ Max enforced on save.
- Read from observation rows with `observation_phase = 'post_graze'` for this event, joined to the paddock window the observation applies to. If multiple open-close cycles exist on the event (sub-moves), show one row per closed paddock window, labeled with the paddock name.
- **Empty state:** When no post-graze observations exist, show hint text: "Captured when a paddock is closed. No post-graze observations yet." No add button — observations are created during the close flow.

### 7. Groups

Card listing each active group window attached to the event.

- Per-row layout (flex): status dot + group name on the left; two small buttons on the right: `Move` (`btn btn-teal btn-xs`) and `Remove` (`btn btn-ghost btn-xs` with `✕` icon).
- Sub-line: `{head} head · avg {weight} {unit} · {AU} AU`
- `Add group` button at the bottom of the card — opens `openGroupAddSheet`.
- **Move** calls `openMoveWizard(event, operationId, farmId)` scoped to this event.
- **Remove** opens a picker with two options:
  1. **Unplace** — dissociate the group window from this event and mark it unplaced (no destination event)
  2. **Move to existing event** — launches the standard move wizard for this group
  - Default focus: Unplace. Confirmation required before any destructive action (the Unplace path is the only non-wizard branch).
  - Existing remove sheet is reusable if one exists; otherwise add a lightweight picker modal. Check `src/features/groups/` for existing patterns before inventing one.

### 8. Feed Entries

Per-entry rows. Each row: feed type, amount + unit, date, cost. Trailing actions: `Edit` (pencil) and `Delete` (✕). Delete is a destructive confirmation modal (single responsive component).

- `Deliver feed` button at bottom of the card — opens `openDeliverFeedSheet`.
- Edit opens the existing feed-entry edit flow.

### 9. Feed Checks

Per-check rows. Each row: check date, observation values. Trailing actions: `Edit` and `Delete` (same pattern as feed entries).

- `Feed check` button at bottom — opens `openFeedCheckSheet`.

### 10. DMI / NPK Breakdown

Read-only stats card. If DMI-1 and NPK-1/NPK-2 are registered:

- Line 1: `DMI: {daily} {unit}/day ({pasturePct}% pasture · {storedPct}% stored)`
- Line 2: `NPK: N {Nlbs} / P {Plbs} / K {Klbs} lbs · ${value} value`

If any calc is missing, omit that line. If both are missing, hide the entire card.

### 11. Notes

- Plain textarea, full width, min 3 rows, auto-grows.
- Auto-save on blur. Writes to `events.notes`. Show a small `Saved` confirmation for 2 seconds after write.

### 12. Sub-move History

Collapsible card (default collapsed if the event has no sub-moves, expanded if any exist).

- Per-row: paddock name, date opened, date closed (or `—` if still open), sub-line with observations recorded on that window.
- Trailing action: `Edit` only — opens the sub-move edit modal. **No inline Delete.** No `Manage` button (dropped during design review — reopen lives inside the Edit dialog).
- `Add sub-move` button at bottom — opens `openSubmoveOpenSheet`.

### 13. Actions (footer)

Sticky or inline at bottom of the view, in this order left → right:

- `Move all` — `btn btn-teal`, calls `openMoveWizard(event, ...)` for the whole event
- `Close & move` — `btn btn-olive`, calls the combined close+move flow (`openCloseAndMoveSheet` if present; otherwise sequence close → move)
- `Delete` — `btn btn-danger`, opens the destructive confirmation modal. Confirm removes the event via `store.removeEvent(eventId)` and navigates back.

For closed events, show only `Delete`.

## Sheet Integration

- **No route.** The detail view is a sheet overlay, not a routed page. The events screen always renders calendar/list.
- Open: `openEventDetailSheet(event, operationId, farmId)` — called from the dashboard Edit button (and anywhere else that needs to show event details).
- Close: `closeEventDetailSheet()` — called from back arrow and backdrop click.
- Uses `ensureSheetDOM()` pattern (same as move wizard, close event, create survey — see OI-0062).
- If the event ID doesn't resolve, log `logger.warn('events.detail.not_found', { id })` and close the sheet.

## Data Dependencies

| Section | Reads | Calc |
|---|---|---|
| Event Summary | events, group_windows, batches | CST-1, DMI-1 (summary only), AU formula |
| DMI chart | events, feed_entries, event_observations | DMI-1 with daily split |
| Paddocks | event_paddock_windows, event_observations | CAP-1 per paddock |
| Pre/Post observations | event_observations | — |
| Groups | group_windows, groups, batches | AU formula |
| Feed entries | event_feed_entries, feed_types | CST-1 |
| Feed checks | feed_checks | — |
| DMI/NPK | events, feed_entries, event_observations, npk_price_history | DMI-1, NPK-1, NPK-2 |
| Notes | events.notes | — |
| Sub-move history | event_paddock_windows, event_observations | — |

## Store Subscription

Subscribe in `onMount` to the following entity types. Each triggers a surgical re-render of only the affected card:

- `events` (header, summary, notes, actions)
- `event_paddock_windows` (paddocks, sub-move history)
- `event_observations` (pre/post observations, paddock stats, DMI chart)
- `event_feed_entries` (feed entries, DMI/NPK breakdown, cost in summary)
- `feed_checks` (feed checks)
- `group_windows` (groups, summary totals)

Keep scroll position across re-renders. Use the same subscription pattern in `src/features/dashboard/index.js`.

## Schema Impacts

Aligns `event_observations` with `paddock_observations` so both record the same pasture-assessment fields (pre-graze observations during an event should capture what a standalone paddock survey would), plus the post-graze-only fields.

**New migration file** (next available number in `supabase/migrations/`): add the following to `event_observations`:

| Column | Type | Notes |
|---|---|---|
| `forage_quality` | integer 1–100 | matches paddock_observations |
| `forage_condition` | text (enum: `dry` / `fair` / `good` / `lush`) | matches paddock_observations |
| `forage_cover_pct` | numeric(5,2) | matches paddock_observations; may already exist |
| `forage_height_cm` | numeric(6,2) | matches paddock_observations; may already exist |
| `stored_feed_only` | boolean default false | existing pre-graze toggle |
| `post_graze_height_cm` | numeric(6,2) nullable | post-graze only |
| `recovery_min_days` | integer nullable | post-graze only |
| `recovery_max_days` | integer nullable | post-graze only |
| `observation_phase` | text enum `pre_graze` / `post_graze` | NEW — which side of grazing this observation represents |
| `paddock_window_id` | uuid FK → event_paddock_windows(id) | NEW — which window this observation belongs to (needed for per-paddock post-graze rows) |

Verify each column doesn't already exist before adding — some may be present from earlier migrations. Write idempotent `ADD COLUMN IF NOT EXISTS` where possible.

**Entity updates:** `src/entities/event-observation.js` — update `FIELDS`, `validate()`, `toSupabaseShape()`, `fromSupabaseShape()` to include the new fields. Add a round-trip unit test.

**Store/read path:** The pre-graze read must filter `observation_phase = 'pre_graze' OR observation_phase IS NULL` for backward compat with rows written before this migration. Post-graze reads strictly require `observation_phase = 'post_graze'`.

**CP-55 / CP-56 impact (mandatory per the Export/Import Spec Sync Rule):**

1. CP-55 export: `event_observations` payload now includes all new columns. Update the CP-55 spec (`github/issues/` file once CP-55 is spec'd, or the draft in V2_SCHEMA_DESIGN.md) to list them.
2. CP-56 import: if a backup is missing any of the new columns (old backup), default: `forage_quality` null, `forage_condition` null, `forage_cover_pct` null, `forage_height_cm` null, `stored_feed_only` false, `post_graze_height_cm` null, `recovery_min_days` null, `recovery_max_days` null, `observation_phase` null (treat as pre-graze per the read rule above), `paddock_window_id` null (orphan observation — attach to the event without a paddock window).
3. Bump `schema_version` in the migration and add a `BACKUP_MIGRATIONS` entry per the standard rule.
4. Update V2_MIGRATION_PLAN.md §5.3 and §5.3a if the new `paddock_window_id` FK changes the FK-dependency ordering for restore.

## Implementation Checklist

1. [ ] Write + execute + verify migration (per CLAUDE.md "Migration Execution Rule")
2. [ ] Update `src/entities/event-observation.js` — FIELDS, shape functions, round-trip test
3. [ ] Update `src/data/backup-migrations.js` with schema_version bump
4. [ ] Router: events screen parses `detail=` query param → renders detail view
5. [ ] Build `src/features/events/detail.js` (new file) with the 13 sections above
6. [ ] Responsive layout: one observation modal component, one confirm-delete modal component
7. [ ] Wire up existing sheet launchers (move wizard, close event, group add, feed delivery, feed check, sub-move open)
8. [ ] Implement Remove-group picker (Unplace vs Move to existing event)
9. [ ] Notes auto-save on blur with `Saved` flash
10. [ ] Store subscriptions with surgical re-render per card
11. [ ] `—` / hide rules for missing calcs (never show `—` where an entire row can be omitted; chart/NPK cards hide when dependency missing)
12. [ ] Accessibility: keyboard navigation on all actions, `aria-label`s on icon buttons, focus trap in modals
13. [ ] Unit tests for the detail render path (see Tests section)
14. [ ] E2E: navigate to `#/events?detail=<id>`, verify each section, verify actions open their sheets

## Tests

**Unit (`tests/unit/features/events/detail.test.js`, new):**
- [ ] Renders hero summary line with correct tokens
- [ ] Omits DMI token when calc not registered
- [ ] Hides DMI chart card when DMI-1 doesn't produce daily split
- [ ] Renders one paddock card per open window
- [ ] Anchor-only event: no Close button on the anchor paddock card
- [ ] Event with sub-paddock: Close button on sub-paddock card, not anchor
- [ ] Pre-graze card is editable when active, read-only when closed
- [ ] Post-graze card renders only when at least one paddock window is closed
- [ ] Groups section: Remove button opens the picker with Unplace + Move options
- [ ] Notes auto-saves on blur (spy `store.updateEvent`)
- [ ] Sub-move history collapsed by default when empty, expanded when populated
- [ ] Closed event: footer shows only Delete
- [ ] Stale event ID: empty state + logger.warn called

**Unit (`tests/unit/entities/event-observation.test.js`):**
- [ ] Round-trip: `fromSupabaseShape(toSupabaseShape(record))` equals original, including all new fields
- [ ] validate() accepts pre_graze and post_graze phase values; rejects others
- [ ] validate() rejects forage_quality outside 1–100

**E2E (`tests/e2e/event-detail.spec.ts`, new):**
- [ ] Dashboard Edit button (SP-1) → detail view loads (once SP-1's navigate switch to detail is wired in)
- [ ] Back arrow returns to previous screen
- [ ] Add pre-graze observation → card populates after save
- [ ] Remove group (Unplace path) → group disappears; Supabase verified via direct query
- [ ] Delete event confirmation → event removed; Supabase verified

## Acceptance Criteria

- [ ] All 13 sections render per spec with correct data and layout
- [ ] Migration executed and verified in Supabase
- [ ] `event_observations` entity round-trips all new fields
- [ ] Single responsive component per overlay pattern (no parallel modal/sheet builds)
- [ ] Anchor-no-close rule observed
- [ ] Remove-group picker functions with both paths
- [ ] Notes auto-save works; no data loss on navigation away
- [ ] Closed events render read-only observations and Delete-only footer
- [ ] `npx vitest run` clean; new e2e test passes
- [ ] CP-55/CP-56 spec updated; reconciliation note added

## Related OPEN_ITEMS

- OI-0063 — `event_observations` schema alignment (this spec)
- OI-0064 — Manage button dropped from sub-move history; reopen folded into Edit dialog
- OI-0040 — move wizard / event close missing residual height + recovery day inputs (detail view surfaces these once the underlying inputs exist)
- OI-0041 — move wizard missing pre-graze observation fields (detail view surfaces these)

## Out of Scope (deferred)

- Tap-card-to-open-detail from dashboard (wait until SP-3 ships and we wire `navigate('#/events?detail=' + id)`)
- Per-group-scoped Move (currently event-scoped — see SP-3's deferred list)
- 3-day DMI chart on dashboard cards (detail view only — keeps cards cheap)

## Reconciliation Note

After the sprint ends, a dedicated session will:
1. Replace V2_UX_FLOWS.md §17.15 with the content of this spec (edited to remove sprint-only framing).
2. Convert this file to a thin pointer referencing §17.15.
3. Ensure the new `event_observations` columns are documented in V2_SCHEMA_DESIGN.md.
4. Verify CP-55/CP-56 spec files list the new columns.
