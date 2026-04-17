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
| 2026-04-16 | Feed dialogs | **OI-0072** — Feed check + deliver feed v1 parity rebuild. Both dialogs get full v1 UI treatment: feed check gets triple-sync controls (stepper/slider/pct) + consumed banner; deliver feed gets tap-to-select batch cards with inline steppers, multi-batch, feed-type grouping, live DMI/cost summary. Spec includes extracted v1 HTML templates. OI-0071 closed (7 UI fixes implemented). |
| 2026-04-17 | SP-4 | **Dashboard Group tab v1 parity.** Groups view cards rebuilt to match v1: location status bar with full event timeline, DMI target + feed % bar, NPK deposited with fert value, Move/Split/Weights/Edit buttons. Includes extracted v1 HTML/CSS. |
| 2026-04-17 | SP-5 | **Sidebar, header, and layout v1 parity.** Sidebar gets logo block, nav icons, active state, sync status strip. Header simplified (remove redundant app name/op name). CSS layout bug fixed (nav overlapping header due to hardcoded `top: 60px`). |
| 2026-04-17 | Bugs | **OI-0073** — Group placement detection picks wrong eventGroupWindow (`.find()` returns first match, not open-event match). **OI-0074** — Event detail action buttons wrong layout/missing CSS classes. **OI-0075** — Locations tab display bugs (double "lbs lbs", missing acreage, missing capacity line, number formatting). |
| 2026-04-17 | SP-6 | **Feedback & Help buttons in header.** Two-row header: existing row unchanged, new compact sub-row with Feedback + Get Help buttons. Replaces v1 FAB + type toggle. Separate sheets for each. v1 dialog HTML extracted. Get Help sheet trimmed to 4 categories (Roadblock, Bug, Calculation, Question) — suggestion categories (Missing feature, Idea, UX friction) are Feedback-only. |
| 2026-04-17 | SP-7 | **Feedback screen (desktop-only).** Full v1 parity: confirmation section, stats strip, dev brief export, filtered submission list, resolve sheet, edit sheet. Desktop sidebar nav item only — not in mobile bottom nav. v1 HTML/CSS/JS extracted. |
| 2026-04-17 | SP-8 | **Field mode v1 parity.** Full rebuild: 8 configurable modules (was 4 hardcoded), module settings in Settings screen, header pill replaces green field-mode-header bar, event picker sheets for Move/Feed Check/Heat/Single Survey, expandable event cards, interactive tasks with checkboxes + due dates, feed delivery loop, field-mode sheet behavior (no backdrop close, hidden handle, "⌂ Done", full-screen mobile). Uses existing `field_mode_quick_actions` column on `user_preferences`. v1 HTML/CSS/JS extracted. |
| 2026-04-17 | SP-8 fix | **Field mode exit navigation.** Exiting field mode now returns to the screen the user was on before entering, instead of always going to dashboard. Header saves `window.location.hash` to sessionStorage on entry; exit reads it back. Files: `header.js`, `field-mode/index.js`. Base doc impact: V2_UX_FLOWS.md §16. |
| 2026-04-17 | SP-8 fixes | **3 field mode fixes.** (1) Feed check save returns to `#/field` instead of just closing. (2) Record Heat gets proper 2-step animal picker (event/group filter pills, search, multi-record) replacing auto-select-first-female. (3) Event cards: expand actually shows detail content; "Move all" button moved inside expanded section to prevent accidental taps. Session brief written. |
| 2026-04-17 | SP-10 | **Event Data Edit Consistency Suite — walkthrough started.** New section for data-behavior (not visual UI) that gates field testing. Established core principle: derived values auto-cascade via compute-on-read; structural state requires explicit reconciliation via dialogs. Shared gap/overlap resolution routine ratified — three options each for gap (leave unplaced / extend prior / retro-place) and overlap (trim / merge / reject). Retro-place flow uses reopen + close hard gate with snapshot-based rollback on Cancel. §7 Groups (group window edit dialog) fully spec'd: new Edit button between Move and Remove; dialog covers date_joined, time_joined, date_left, time_left, head_count, avg_weight_kg; auto-save on blur; Delete window action with safety guards; edge cases enumerated. §12 Sub-moves, event-level dates, §8 Feed Entries, §9 Feed Checks, §3/§6 Observations stubbed pending walkthrough. |
| 2026-04-17 | SP-10 event-level dates | **Event-level date editing ratified.** `date_in` directly editable with reject-on-narrow / confirm-on-widen behavior. `date_out` NOT directly editable — routes through new **Event Reopen** action (Edit Event dialog footer, closed events only). Reopen clears `date_out` + re-opens matching child windows (paddock and group records that closed with the event). Invariant check catches group conflicts with subsequent events: three-option picker (leave on subsequent / pull back to this event / cancel). Re-close overlap with subsequent event = warning at confirm time, no block. Empty event-row-level overlaps and empty stretches inside events accepted as "find in testing." |
| 2026-04-17 | SP-10 §12 | **Sub-move History / paddock window edit dialog ratified.** Entry from both §4 Paddocks cards (add Edit button) and §12 Sub-move History rows (existing Edit button). Same dialog. Fields: date_joined/time, date_left/time, area_pct, is_strip_graze, strip_group_id. **No gap detection** — gaps between paddock windows are legal (animals were on another open paddock). Range guards reject date_joined < event.date_in, date_left > event.date_out, date_left < date_joined, and same-paddock overlaps on same event. Delete window action with guards (can't delete last open window, can't delete anchor-only). Strip-graze flip confirms. **Resolves OI-0064** — closed-window Reopen action lives inside Edit dialog (clears date_left/time_left). |
| 2026-04-17 | SP-10 §8 + §8a | **§8 Feed Entries ratified + new Move Feed Out capability.** §8 gets reject-on-save validation guards (date range vs event window, future date, amount > 0, batch capacity). No gap/overlap concept — feed entries are point-in-time. **§8a Move Feed Out** is a new capability for active events: farmer pulls feed back out to inventory or ships it to another open event. Four-step flow in one sheet: current state → forced feed check (strikes the line) → amount + destination picker → confirm. Destinations: batch inventory (increments batch remaining) or existing open event (creates inbound delivery with source_event_id, reusing CP-29 transfer pattern). Schema adds 3 columns to `event_feed_entries`: `entry_type` (delivery/removal, default 'delivery'), `destination_type` (batch/event, nullable), `destination_event_id` (uuid FK nullable) with check constraints. DMI / NPK / cost calcs updated to sum deliveries minus removals (compute-on-read). CP-55/CP-56 impact: serialize all three, default to delivery/NULL/NULL for old backups. |
| 2026-04-17 | SP-10 §3 + §6 + wrap | **Observations ratified + SP-10 walkthrough complete.** §3 Pre-graze and §6 Post-graze inline edit behavior spec'd: auto-save on blur, field-level validation (non-negative, % ≤ 100, recovery window 0-365), silent cascade through compute-on-read per Tim's directive ("changes to those values should affect inferred DMI etc by design so expected"). No gap/overlap concept (observations are per-paddock snapshots, not lifecycle windows). Recovery-window-in-planning conflicts surface at the **future event's planning step**, not on the §6 edit. All SP-10 sections (§7 groups, §12 sub-moves, event-level dates, §8/§8a feed entries + move-out, §9 feed checks, §3/§6 observations) now ratified. Ready for Claude Code. |
| 2026-04-17 | SP-10 §9 | **Feed Checks edit behavior ratified.** Range guard on date (same as §8). Invariant check on save: `consumed(Ti → Ti+1) ≥ 0` across all adjacent intervals on a feed line. Four cases documented: (A) benign edit cascades silently via compute-on-read; (B) edit breaks a later interval → **Re-snap dialog** offers to delete later invalid check(s) and save, farmer re-measures; (C) edit breaks an earlier interval → surface conflict, Cancel only (no auto-delete of earlier checks — too destructive); (D) back-fill past-dated check runs same invariant check, uses B or C resolution by direction. Delete always safe (only widens intervals). Step 2 Move-Feed-Out checks are ordinary checks — editable and deletable on the same terms. No schema changes. |
| 2026-04-17 | SP-10 §8a revision | **Four refinements.** (1) Second entry point added — per-entry `Move out` action on each feed row in the §8 list, opens the same sheet pre-selected to that row's batch × location. Math still operates on aggregate remaining (feed doesn't carry per-delivery provenance in the pasture). (2) Step 2 feed check is now **staged, not written** — only commits atomically in Step 4 Confirm. Cancel at any point leaves the source event pristine. (3) Terminology — "group" replaced with "feed line" (one batch × location aggregation row) to avoid collision with "animal group." (4) DMI / NPK / cost logic block added with explicit formulas: `available(T) = Σ deliveries − Σ removals`; `consumed(T1→T2) = (remaining(T1) + deliveries − removals) − remaining(T2)`. Same-day ordering edge case (move-out check vs farmer-entered check) documented as "latest wins, flag for field testing." |
| 2026-04-17 | SP-9 | **Survey sheet v1 parity.** Single sheet with three modes (bulk / single / bulk-edit). Bulk chrome with DRAFT tag, Save Draft + Finish & Save, farm/type/search filters, collapsed cards with ✓ Complete badge. Per-paddock rating slider + veg height + forage cover + forage condition + recovery window with live date preview. **New bale-ring residue helper** auto-computes forage cover % from a ring count × farm-configured ring diameter (default 12 ft). Draft lifecycle: immediate localStorage + 1s-debounced Supabase sync. Field-mode picker sheet for single surveys. Schema: adds `farm_settings.bale_ring_residue_diameter_ft` (migration 022). CP-55/CP-56 impact noted. v1 HTML/CSS/JS extracted in full spec. |

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

## SP-4: Dashboard Group Card — V1 Parity

**Status:** Spec complete · Ready for Claude Code
**Spec file:** `github/issues/dashboard-group-card-v1-parity.md` (full, authoritative)
**Depends on:** `BUG_group-placement-detection.md` (must land first or same session)
**Schema:** None. Visual/rendering only. No CP-55/CP-56 impact.

### Goal

Rebuild the v2 dashboard group card to match v1: location status bar with full event timeline (day count, date, feedings, cost, AU, AUDs, ADA, pasture DM, stored feed DM), DMI target with amber progress bar, NPK deposited in purple with fertilizer dollar value, Move/Split/Weights/Edit buttons.

### Key fixes included

- Group placement bug (BUG_group-placement-detection.md): `.find()` picks wrong GW → orphaned data
- NPK NaN display bug: missing `animalClassId` on group windows
- Missing v1 data lines: composition, location bar, sub-move summary, DMI target, feed % bar

See spec file for full v1 HTML/CSS extraction and calc reference mapping.

### Linked OPEN_ITEMS

- **OI-0073** — Group placement detection bug
- **OI-0074** — Event detail action buttons

---

## SP-5: Sidebar, Header, and Layout — V1 Parity

**Status:** Spec complete · Ready for Claude Code
**Spec file:** `github/issues/sidebar-header-layout-v1-parity.md` (full, authoritative)
**Schema:** None. Visual/layout only. No CP-55/CP-56 impact.

### Goal

Rebuild sidebar with v1 structure: logo block at top (green icon + app name + farm name), nav items with SVG icons and active-state highlighting, sync status strip at bottom. Simplify header (remove redundant app name/op name). Fix CSS layout bug where nav overlaps header.

### Key fixes included

- CSS bug: `position: fixed; top: 60px` hardcoded → nav overlaps header when header height exceeds 60px
- Missing: logo block, nav icons, active state, sync timestamp
- Redundant: app name + operation name in header (sidebar has them)

---

## Locations Tab Display Fixes

**Status:** Spec complete · Ready for Claude Code
**Spec file:** `github/issues/BUG_locations-tab-display-fixes.md`
**Schema:** None. Visual/display only. No CP-55/CP-56 impact.

### Issues

8 display bugs: double "lbs lbs" suffix, missing acreage in header, missing green capacity line, badge text inconsistency, stored feed calc mismatch, missing number formatting (commas), empty DMI chart bars (deferred — OI-0076, needs fresh data), empty top stat cards.

### Linked OPEN_ITEMS

- **OI-0076** — DMI chart empty bars deferred until fresh v2 test data available

---

## SP-6: Feedback & Help Buttons in Header

**Status:** Spec complete · Ready for implementation
**Spec file:** `github/issues/feedback-help-header-buttons.md`
**Base doc:** V2_UX_FLOWS.md §17.2 (needs update), V2_SCHEMA_DESIGN.md §11.2 (submissions table — no change)

### Problem

V1 had a floating action button (FAB) at bottom-right that opened a single feedback sheet with a type toggle (Feedback vs Get Help). V2 spec says "move feedback to the header" (§17.2, §20.6) but the header right-cluster table never listed the button, and no implementation exists. The v1 type toggle adds a decision step before the user can start writing.

### Design Decision

**Two-row header.** The existing header row is unchanged. A new compact sub-row sits directly below, containing two small buttons: **Feedback** and **Get Help**. This eliminates the v1 type toggle — each button opens its own pre-configured sheet.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  [Logo] Farm Name ▾        [sync] [b2026…] [FM] [TJ]   │  ← existing row (unchanged)
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│                              [💬 Feedback] [🆘 Get Help] │  ← new sub-row, right-aligned
└─────────────────────────────────────────────────────────┘
│  [Dashboard] [Rotation Calendar] [Animals] ...          │  ← nav (unchanged)
```

**Sub-row specs:**

| Property | Value | Notes |
|----------|-------|-------|
| Height | 28px | Compact — `btn-xs` sizing |
| Alignment | Right-aligned, matching right-cluster | Buttons flush with user menu above |
| Gap | 8px between buttons | Same as header-right gap |
| Padding | 0 12px | Left auto-margin pushes right |
| Border | 1px `--border` bottom | Subtle separator same as header bottom border |
| Background | `--bg` | Same as header |

**Button specs (both buttons):**

| Property | Value |
|----------|-------|
| Class | `btn btn-outline btn-xs` |
| Font | 11px, weight 500 |
| Padding | 3px 10px |
| Border radius | `--radius` (6px) |
| Icons | 💬 / 🆘 emoji prefix |

**Responsive behavior:**

| Viewport | Behavior |
|----------|----------|
| ≥ 900px (desktop) | Sub-row visible in header area (sidebar layout, buttons in main content header) |
| < 900px (mobile) | Sub-row visible, same position. Buttons small enough to fit any width ≥ 280px |
| Field Mode | Sub-row **hidden** (same as v1 FAB hidden in field mode) |

### Feedback Sheet (opened by Feedback button)

Pre-configured with `type = 'feedback'`. No type toggle. Sheet title: "Leave feedback".

**Fields (match v1 exactly, minus type toggle):**

1. **Context tag** (auto-filled, read-only) — current screen + active event info
2. **Category pills** (required) — all 7: 🚧 Roadblock, Bug, UX friction, Missing feature, Calculation, Idea, Question
3. **Area dropdown** (auto-filled, editable) — mapped from current screen
4. **Note textarea** (required) — placeholder: "What did you notice? What did you expect?"
5. **Save / Cancel buttons**

### Get Help Sheet (opened by Get Help button)

Pre-configured with `type = 'support'`. No type toggle. Sheet title: "Get help".

**Category split from Feedback:** The Get Help sheet shows only "I have a problem" categories. "I have a suggestion" categories (Missing feature, Idea, UX friction) are Feedback-only — they don't belong in a help request.

**Fields:**

1. **Context tag** (auto-filled, read-only)
2. **Category pills** (required) — 4 only: 🚧 Roadblock, Bug, Calculation, Question
3. **Area dropdown** (auto-filled, editable)
4. **Priority dropdown** (always visible, not conditionally shown) — Normal, High (blocking my work), Urgent (data at risk), Low (when you get a chance)
5. **Note textarea** (required) — placeholder: "Describe what you need help with…"
6. **Save / Cancel buttons**

### Data Model

No schema changes. Both sheets write to the existing `submissions` table (V2_SCHEMA_DESIGN.md §11.2). The `type` field is set automatically ('feedback' or 'support') based on which button opened the sheet.

### v1 Dialog HTML Reference

Extracted from v1 `index.html` for parity. Claude Code should use the v2 DOM builder (`el()`) to replicate this structure, NOT copy the HTML directly.

**v1 FAB (replaced by header sub-row buttons):**
```html
<!-- v1 FAB — REMOVED in v2, replaced by header sub-row -->
<button class="fab" onclick="openFeedbackSheet()" id="fab-feedback" style="position:relative;">
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
  <span id="fb-badge" style="display:none;position:absolute;top:-4px;right:-4px;background:var(--red);color:white;border-radius:10px;font-size:9px;font-weight:700;padding:1px 5px;min-width:16px;text-align:center;line-height:14px;"></span>
</button>
```

**v1 Feedback Sheet (reference for both v2 sheets):**
```html
<div class="sheet-wrap" id="fb-sheet-wrap">
  <div class="sheet-backdrop" onclick="closeFeedbackSheet()"></div>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div style="font-size:16px;font-weight:600;margin-bottom:10px;" id="fb-sheet-title">Leave feedback</div>

    <!-- v1 TYPE TOGGLE — REMOVED in v2 (separate buttons replace this) -->
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <button class="fb-type-pill sel" id="fb-type-feedback" onclick="selFbType('feedback',this)"
        style="flex:1;padding:8px;border:1.5px solid var(--border2);border-radius:var(--radius);background:var(--bg);color:var(--text);font-size:13px;font-weight:500;cursor:pointer;">
        💬 Feedback</button>
      <button class="fb-type-pill" id="fb-type-support" onclick="selFbType('support',this)"
        style="flex:1;padding:8px;border:1.5px solid var(--border2);border-radius:var(--radius);background:var(--bg);color:var(--text);font-size:13px;font-weight:500;cursor:pointer;">
        🆘 Get Help</button>
    </div>

    <!-- CONTEXT TAG — keep in v2 -->
    <div class="ctx-tag"><span id="fb-ctx-text">—</span></div>

    <!-- CATEGORY PILLS — v2 CHANGE: Feedback sheet shows all 7; Get Help sheet shows only 4 -->
    <!-- Feedback sheet: all 7 pills below -->
    <!-- Get Help sheet: only Roadblock, Bug, Calculation, Question (drop UX friction, Missing feature, Idea) -->
    <div style="font-size:13px;color:var(--text2);margin-bottom:8px;">Category</div>
    <div class="cat-pills">
      <button class="cat-pill cp-roadblock" onclick="selCat('roadblock',this)">🚧 Roadblock</button>
      <button class="cat-pill cp-bug" onclick="selCat('bug',this)">Bug</button>
      <button class="cat-pill cp-ux" onclick="selCat('ux',this)">UX friction</button>           <!-- FEEDBACK ONLY -->
      <button class="cat-pill cp-feature" onclick="selCat('feature',this)">Missing feature</button> <!-- FEEDBACK ONLY -->
      <button class="cat-pill cp-calc" onclick="selCat('calc',this)">Calculation</button>
      <button class="cat-pill cp-idea" onclick="selCat('idea',this)">Idea</button>               <!-- FEEDBACK ONLY -->
      <button class="cat-pill cp-question" onclick="selCat('question',this)">Question</button>
    </div>

    <!-- AREA DROPDOWN — keep in v2, update options to match v2 screen names -->
    <div class="field" style="margin-top:10px;">
      <label>Area</label>
      <select id="fb-area" style="width:100%;padding:8px 10px;border:0.5px solid var(--border2);border-radius:var(--radius);background:var(--bg);color:var(--text);font-family:inherit;font-size:14px;">
        <option value="">— pick area —</option>
        <option value="home">Home</option>
        <option value="animals">Animals</option>
        <option value="events">Events</option>
        <option value="feed">Feed</option>
        <option value="pastures">Fields</option>
        <option value="harvest">Harvest</option>
        <option value="field-mode">Field Mode</option>
        <option value="reports">Reports</option>
        <option value="todos">To-Dos</option>
        <option value="settings">Settings</option>
        <option value="sync">Sync / Data</option>
        <option value="other">Other</option>
      </select>
    </div>

    <!-- PRIORITY — v2: always visible in Get Help sheet, hidden in Feedback sheet -->
    <div class="field" id="fb-priority-row" style="display:none;">
      <label>Priority</label>
      <select id="fb-priority" style="width:100%;padding:8px 10px;border:0.5px solid var(--border2);border-radius:var(--radius);background:var(--bg);color:var(--text);font-family:inherit;font-size:14px;">
        <option value="normal">Normal</option>
        <option value="high">High — blocking my work</option>
        <option value="urgent">Urgent — data at risk</option>
        <option value="low">Low — when you get a chance</option>
      </select>
    </div>

    <!-- NOTE + BUTTONS — keep in v2 -->
    <div class="field"><label>Note</label><textarea id="fb-note" placeholder="What did you notice? What did you expect?"></textarea></div>
    <div class="btn-row">
      <button class="btn btn-green" onclick="saveFeedbackItem()">Save note</button>
      <button class="btn btn-outline" onclick="closeFeedbackSheet()">Cancel</button>
    </div>
  </div>
</div>
```

**v1 CSS (reference for v2 styling):**
```css
/* Category pills */
.cat-pills { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
.cat-pill { padding:6px 14px; border-radius:20px; font-size:13px; font-weight:500; cursor:pointer;
            border:0.5px solid var(--border2); background:transparent; color:var(--text2); }
.cp-bug.sel { background:var(--red-l); color:var(--red-d); border-color:var(--red); }
.cp-ux.sel { background:var(--amber-l); color:var(--amber-d); border-color:var(--amber); }
.cp-feature.sel { background:var(--purple-l); color:var(--purple-d); border-color:var(--purple); }
.cp-calc.sel { background:var(--teal-l); color:var(--teal-d); border-color:var(--teal); }
.cp-idea.sel { background:var(--green-l); color:var(--green-d); border-color:var(--green); }
.cp-roadblock.sel { background:var(--red-l); color:var(--red-d); border-color:var(--red); }
.cp-roadblock { font-weight:700; }
.cp-question.sel { background:var(--teal-l); color:var(--teal-d); border-color:var(--teal); }

/* Context tag */
.ctx-tag { display:inline-flex; align-items:center; gap:5px; padding:4px 10px;
           background:var(--bg2); border:0.5px solid var(--border); border-radius:var(--radius);
           font-size:12px; color:var(--text2); margin-bottom:14px; }
```

### v2 Area Dropdown Update

V2 screen names differ from v1. Update the area options:

| v1 value | v2 value | Notes |
|----------|----------|-------|
| `home` | `dashboard` | Screen renamed |
| `events` | `rotation-calendar` | Nav label changed |
| `pastures` | `locations` | Entity renamed |
| `todos` | — | Removed from v2 launch (future) |
| All others | Same | animals, feed, harvest, field-mode, reports, settings, sync, other |

### Acceptance Criteria

- [ ] Header renders a sub-row below the existing header row with two right-aligned buttons
- [ ] "Feedback" button opens feedback sheet (type pre-set to 'feedback', no type toggle)
- [ ] "Get Help" button opens help sheet (type pre-set to 'support', priority always visible)
- [ ] Both sheets write to `submissions` entity with correct `type` field
- [ ] Context tag auto-fills with current screen + active event
- [ ] Area dropdown auto-fills from screen mapping (using v2 screen names)
- [ ] Feedback sheet shows all 7 category pills
- [ ] Get Help sheet shows only 4 category pills (Roadblock, Bug, Calculation, Question)
- [ ] Category pills match v1 styling (color-coded `.sel` states)
- [ ] Sub-row hidden in Field Mode
- [ ] Build stamp still hidden below 360px (no regression)
- [ ] Sub-row does not break mobile layout at 280px minimum width
- [ ] Badge (unread count) — deferred to Feedback screen (CP-TBD), not on header buttons
- [ ] i18n: all user-facing strings use `t()`

### CP-55/CP-56 Spec Impact

None. No schema changes. The `submissions` table already exists in V2_SCHEMA_DESIGN.md §11.2. Both sheets write the same record shape as v1 would have. No export/import spec update needed.

### Linked OPEN_ITEMS

None required — fully spec'd.

---

## SP-7: Feedback Screen (Desktop-Only)

**Status:** Spec complete · Ready for implementation
**Spec file:** `github/issues/feedback-screen-desktop.md` (full spec — not a thin pointer during sprint)
**Base doc:** V2_UX_FLOWS.md §17.2 (nav items list needs Feedback added)
**Depends on:** SP-6 (feedback/help sheets must exist first — SP-7 reuses their submission logic)

### Problem

V1 has a full Feedback screen that shows all submitted feedback with filters, stats, confirmation flow, dev brief export, resolve/edit/delete capabilities, and threaded dev responses. V2 has no equivalent — users can submit feedback (SP-6) but can't review, filter, confirm fixes, or export. This screen is a dev/admin tool for managing the feedback loop.

### Design Decision

**Desktop-only screen.** Feedback management is a desktop task — not needed in the field. Add a "Feedback" nav item to the desktop sidebar (between Settings and the sync strip) that is NOT in the mobile bottom nav. Route: `#/feedback`.

### Screen Sections (top to bottom, matching v1 order)

1. **Confirmation section** — banner + cards for items with `status === 'resolved'` awaiting user confirmation
2. **Stats strip** — badge row showing open / planned / awaiting / closed / support counts
3. **Dev session brief card** — Generate + Copy buttons, monospace output block
4. **All submissions card** — 3 filter dropdowns (type, area, status/category) + scrollable list of submission rows

### Nav Item Placement

Add to desktop sidebar only. Position: after Settings, before the sync strip at bottom.

| Property | Value |
|----------|-------|
| Label | `Feedback` |
| Icon | 💬 (emoji, matching SP-6 feedback button) |
| Route | `#/feedback` |
| Badge | Red badge with count of `status === 'open' OR status === 'resolved'` items |
| Desktop sidebar | Visible |
| Mobile bottom nav | **Not shown** |
| testid | `nav-feedback` |

### Data Dependencies

- Reads from the `submissions` entity (same data as SP-6 writes to)
- No new entities or schema changes
- All mutations go through the store: `store.update('submissions', ...)` or `store.remove('submissions', ...)`

### Full Implementation Spec

See `github/issues/feedback-screen-desktop.md` for the complete implementation spec including all v1 HTML/CSS/JS reference code, function signatures, data structures, and acceptance criteria.

---

## SP-8: Field Mode — V1 Parity

**Status:** Spec complete · Ready for Claude Code
**Spec file:** `github/issues/field-mode-v1-parity.md` (full, authoritative)
**Schema:** None new — `field_mode_quick_actions` already exists on `user_preferences`. No CP-55/CP-56 impact.

### Goal

Full v1 parity for field mode: 8 configurable modules (v2 currently has 4 hardcoded), user-selectable tile grid, module settings in Settings screen, event picker sheets for Move/Feed Check/Heat/Single Survey, expandable event cards, interactive tasks, feed delivery loop, and field-mode-aware sheet behavior.

### Two structural changes from current v2

1. **Remove the green field-mode-header bar.** V2 renders a dark-green header bar inside the field mode screen. V1 doesn't have this — navigation in/out of field mode uses the **header pill button** (already in the app header), which changes text: "⊞ Field" → "← Detail" (on home) → "⌂ Home" (on sub-screens).
2. **Add module settings to Settings screen.** V1 has a Settings section where users toggle which of the 8 modules appear. V2 has the `fieldModeQuickActions` column in the schema but no UI to configure it.

### 9-part spec

| Part | What | Key files |
|------|------|-----------|
| 1 | Header pill replaces green bar | `header.js`, `field-mode/index.js`, `main.css` |
| 2 | Module settings card in Settings | `settings/index.js` |
| 3 | Full 8-module tile grid from FIELD_MODULES constant | `field-mode/index.js` |
| 4 | 8 module handlers (feed, move, harvest, feedcheck, surveybulk, surveysingle, animals, heat) | `field-mode/index.js` |
| 5 | Shared event picker sheet | `field-mode/index.js` (new) |
| 6 | Field-mode sheet behavior (no backdrop, hidden handle, "⌂ Done") | Cross-cutting CSS + sheet openers |
| 7 | Expandable event cards | `field-mode/index.js` |
| 8 | Interactive tasks with checkboxes + due dates + "+ Add" | `field-mode/index.js` |
| 9 | Home sub-heading | `field-mode/index.js`, i18n |

### Linked OPEN_ITEMS

None required — fully spec'd from v1 extraction. Open questions flagged in spec file for discovery during implementation (heat picker sheet existence, single survey picker existence, feed loop wiring).

---

## SP-9: Survey Sheet — V1 Parity

**Status:** Spec complete · Ready for Claude Code
**Spec file:** `github/issues/survey-sheet-v1-parity.md` (full, authoritative)
**Base doc impact:** V2_UX_FLOWS.md §7 (short paragraph) — will be expanded during end-of-sprint reconciliation.
**Schema:** Adds `farm_settings.bale_ring_residue_diameter_ft` (migration 022). Verifies `event_observations.bale_ring_residue_count` exists. **CP-55/CP-56 impact flagged** in spec file §10.
**Depends on:** OI-0063 (event_observations alignment — closed 2026-04-15); SP-8 (field-mode tile wiring — ready).

### Goal

Full v1 parity for the survey experience. V2's generic list/create flow is replaced by v1's single sheet with three modes (bulk / single / bulk-edit) plus a field-mode pasture picker. Two deliberate deltas: home "Pasture readiness" card entry point is dropped (not in v2), and a new bale-ring residue helper auto-computes forage cover %.

### 8 parts

| Part | What | Key files |
|------|------|-----------|
| 1 | Entry-point matrix — 8 paths consolidated into `openBulkSurveySheet` / `openSurveySheet` / `openPastureSurveyPickerSheet` | `surveys/index.js`, `locations/surveys-tab.js`, `locations/edit-sheet.js`, `field-mode/index.js` |
| 2 | Sheet shell with mode switcher (`_setSurveySheetMode`: bulk / single / bulk-edit) | `surveys/survey-sheet.js` |
| 3 | Paddock card (collapsed header + expanded body) — rating slider, veg height, forage cover, bale-ring helper, forage condition, recovery window | `surveys/paddock-card.js` |
| 4 | Bulk chrome — Cancel · DRAFT pill · Expand/Collapse · Save Draft · Finish & Save · ✕ · date · farm/type/search pills | `surveys/bulk-header.js` |
| 5 | Bale-ring residue helper — farm setting (diameter default 12 ft) + registered calc `survey.baleRingCover` + auto-fill forage cover | `calc/survey-bale-ring.js`, `entities/farm-settings.js`, `features/settings/index.js` |
| 6 | Draft lifecycle — immediate localStorage + 1s debounced Supabase sync | `surveys/draft.js`, `data/store.js` |
| 7 | Commit rules — one obs per rated paddock, recovery-window inversion, bulk-edit replaces-not-appends | `data/store.js` (`commitSurvey`) |
| 8 | Field-mode adaptations — picker sheet, backdrop disabled, `⌂ Done`, `_fieldModeGoHome()` on close | `surveys/picker-sheet.js` |

### Key decisions (from walkthrough 2026-04-17)

- **Home readiness card dropped** — v2 has no equivalent surface; entry point omitted.
- **Bale-ring diameter = 12 ft default**, per-farm editable. Ring count stored on observations so recovery over time is visible. Calculation treats rings as bare ground (cover % = 100 − rings_area / paddock_area × 100).
- **Complete badge = strict v1 parity** — rating + vegHeight + forageCover + forageCondition + recoveryMin + recoveryMax. Bale-ring count not required.

### Linked OPEN_ITEMS

None required — fully spec'd. Open questions resolved in walkthrough, captured in spec §13.

---

## SP-10: Event Data Edit Consistency Suite

**Status:** **Ratified 2026-04-17 — Ready for Claude Code.** All seven sections walked through and ratified (§7 Groups, §12 Sub-moves, event-level dates incl. Event Reopen, §8 Feed Entries, §8a Move Feed Out [new capability], §9 Feed Checks, §3 Pre-graze + §6 Post-graze Observations).
**Spec file:** `github/issues/` TBD — to be authored as a thin pointer to this section once handoff prompt is run.
**Base doc:** Reconciles into V2_UX_FLOWS.md (new §17.15.1 "Event Data Editing") and V2_APP_ARCHITECTURE.md (new "Consistency & Rollback" subsection). **Not** a design-system doc change — this is data-behavior, not visual UI.
**Schema:** §8a adds three columns to `event_feed_entries` (`entry_type`, `destination_type`, `destination_event_id`) + check constraints. CP-55/CP-56 spec impact noted in §8a. All other sections enforce consistency at the app layer via dialogs, not DB constraints.
**Session brief:** To be written as part of Claude Code handoff (see end of this section).

### Summary

SP-2 ships the event detail **sheet** (the container and its 13 sections). SP-10 ships the **edit behavior** of every field inside that sheet — what happens when a user changes a date, a head count, an amount, an observation value, and how the rest of the event's data (and, where applicable, other events) stay consistent.

Field testing is blocked until this is complete: the product has to answer "what happens if I edit X?" predictably for every X on the event detail, or users will create silent inconsistencies that accumulate over time.

### Core Principle (promote to V2_APP_ARCHITECTURE.md at reconciliation)

- **Derived values compute on read.** DMI, NPK, cost, days on pasture, forecast end, accuracy stats — none are stored; all are recomputed from their inputs on every read. Any edit to an input automatically produces the correct downstream number on the next render. This is existing v2 architecture (CLAUDE.md "Compute on Read" rule) and it's why SP-10 doesn't need cascade logic for calculations.
- **Structural state requires explicit reconciliation.** Edits that would rewrite a *different* record (prior event's `date_left`, sibling paddock window's `date_joined`, head-count snapshots) never cascade silently. They surface a resolution dialog and the user chooses.
- **Edits to date-bounded records need explicit consistency resolution, not silent cross-record writes.** Applies to group windows, paddock windows, and event-level dates.

### Walkthrough order (easy → hard → easy, grouped by cascade semantics)

| # | Section | Type | Needs resolution routine? | Status |
|---|---|---|---|---|
| 1 | §7 Groups (group window edit) | Structural | Yes — gap + overlap | **Ratified** |
| 2 | §12 Sub-move History (paddock window edit) | Structural | Yes — within-event only (no gap detection — gaps are legal) | **Ratified** |
| 3 | Event-level dates (`date_in` / `date_out`) | Structural | Yes — `date_in` direct edit w/ guards; `date_out` via Event Reopen | **Ratified** |
| 4 | §8 Feed Entries + §8a Move Feed Out (new) | Value + date; new capability | No gap/overlap; §8a is a new removal flow with 3 new columns | **Ratified** |
| 5 | §9 Feed Checks | Value + date | Invariant check on save (Re-snap dialog for impossible later checks) | **Ratified** |
| 6 | §3 Pre-graze Observations | Value | No — field-level validation + silent cascade | **Ratified** |
| 7 | §6 Post-graze Observations | Value | No — field-level validation + silent cascade | **Ratified** |

Read-only (no SP-10 concern): §10 DMI/NPK Breakdown, §11 Notes (already auto-save).

### Shared Routine: Gap / Overlap Resolution

Triggered whenever a structural edit (group window, paddock window, event-level date) creates either:

- **Gap** — a time range where a group is unplaced (no open event_group_window covers the period)
- **Overlap** — a time range where a group is in two open/closed windows simultaneously, violating the "one open window at a time" invariant

The dialog detects which case applies (or both) and offers resolution options.

#### Gap — three options

1. **Leave unplaced** — accept the gap. The prior window's `date_left` stays put; the edited window's new `date_joined` stands. The group is recorded as unplaced for the gap period. A small banner on the dashboard surfaces unresolved unplaced windows.
2. **Extend prior event** — push the prior event_group_window's `date_left` forward to match the new `date_joined`. Continuous history preserved. One write to a different record; explicitly authorized by the user in this dialog.
3. **Move to existing event (retro-place with reopen + close)** — see detailed flow below.

#### Overlap — three options

1. **Trim the conflicting window's start** (default) — push the next window's `date_joined` forward to match the edited window's new `date_left`.
2. **Merge the windows** — if same group + same destination event, collapse into one continuous window.
3. **Reject the edit** — return to the edit dialog with an inline error. User picks new dates that don't overlap.

#### Retro-Place Flow (Gap option 3) — reopen + close hard gate

Used when the gap is actually "they were on some other event that was open at the time." Composes three existing primitives.

1. **Event picker** — filtered to events open during `[gap_start, gap_end]` (one-line swap of `!e.dateOut` for overlap check). Not the standard move wizard — a dedicated picker because retro-place is backward-motion in time.
2. **Paddock picker** — scope to paddocks that were open on the destination event **during** the gap (their `event_paddock_window.date_joined`/`date_left` overlaps the gap). Prevents assigning a group to a paddock window that didn't exist at the time.
3. **Confirm preview** — show: "Will reopen Event #N for April 1–5 and place Group X there." [Cancel] [Confirm]. At this stage nothing is committed.
4. On Confirm, execute in order:
   a. Snapshot pre-change values: `{priorDateOut: evt.dateOut, priorDateJoined: editWindow.dateJoined, newWindowId: null}`
   b. Commit the user's original edit (push group window's `date_joined` forward)
   c. Reopen destination event (set `date_out = null`)
   d. Create new open `event_group_window` on destination (date_joined = gap_start, date_left = null)
   e. Route user into the close flow for the destination event, pre-filled with `date_out = gap_end` (hard gate — no back/backdrop dismiss)
5. Close flow's **Confirm** → normal close (sets `date_left` on all open windows including the new one). Done, no orphans.
6. Close flow's **Cancel** → calls `rollbackGapResolution(snapshot)`:
   a. Delete the new event_group_window
   b. Restore Event #N's `date_out` to snapshot value
   c. Restore edited window's `date_joined` to snapshot value
   d. Inverse ops in child-before-parent order; each is a normal `store` call with `queueWrite` → Supabase.
7. Rollback safety: before step 6, set `rollback_in_progress` flag in localStorage; clear on success. On app boot, if flag is set, complete the rollback before showing the dashboard (protects against offline mid-rollback + app close).

**Tier 1 cancel** (pre-Confirm, step 3) is free — nothing committed, dialog closes.
**Tier 2 cancel** (inside close flow, step 6) runs rollback.

### §7 Groups — Group Window Edit Dialog (ratified 2026-04-17)

**Entry point:** Add `Edit` button per row on the Groups card (GH-10 §7), between `Move` and `Remove`. Opens the new Edit Group Window dialog (sheet overlay, reuses `ensureSheetDOM()` pattern).

**Rationale for separating Edit from Remove:** Edit = verb for changing history (can create gaps/overlaps → gap resolver). Remove = verb for "end this now, they're leaving" (forward-looking only, two-option picker stays as spec'd in GH-10 §7). Keeping them distinct means the user's intent matches the tool. Erasure of a window (rare — "we recorded this but it never happened") lives inside the Edit dialog as a `Delete window` action, not on the Remove button.

**Dialog fields (responsive, same layout desktop + mobile):**

| Field | Type | Notes |
|---|---|---|
| Group name | read-only | Chip at top — not editable here; group rename lives in Animals/Groups area |
| `date_joined` | date input | Required. Gap/overlap detection fires on blur. |
| `time_joined` | time input | Optional. Stored as text per schema. |
| `date_left` | date input | Shown only if window is closed; editable. Gap/overlap detection fires on blur. |
| `time_left` | time input | Optional. |
| `head_count` | number input, integer, min 1 | Point-in-time snapshot. Editing changes the historical record for this window only; does not propagate to prior/next windows for this group. |
| `avg_weight_kg` | number input, ≥ 0 | Displayed in user's unit system via `src/utils/units.js`; stored metric. |

**Save behavior:** Auto-save on blur (same pattern as Notes in §11). Brief "Saved" pulse on successful write. For date fields, auto-save triggers gap/overlap detection — if either is detected, the save is held pending until the resolution dialog resolves.

**Delete window action** (bottom of dialog, destructive confirmation):

- Only available when the window can be safely deleted without orphaning history — i.e., the group's prior window exists and can absorb the range, or the group has no prior window on this event.
- Confirmation: "Delete this window? Group X will no longer appear as having been on Event Y from `date_joined` to `date_left`. This cannot be undone."
- Deleting an **active** (open) window falls back to the existing Remove flow (Unplace / Move to existing event) since forward placement is still needed.

**Edge cases:**

- If `date_joined` is edited to a value *before* the event's `date_in`, reject with inline error — group can't join before the event exists. (Future: if Tim wants this to auto-extend `date_in`, it'd be a cascade into event-level dates, handled in walkthrough #3.)
- If `date_left` is edited to a value *after* the event's `date_out` (when event is closed), reject with inline error — same reasoning.
- If `head_count` is edited to 0, treat as Delete window (with confirmation).
- If the window is the **last** open window on the event (sole group on an active event), editing `date_left` to a non-null value effectively closes the event. Surface this explicitly: "Closing Group X's window leaves Event Y with no active groups. Close the event as well?" with Yes (run close flow) / No (leave event open, Group X unplaced).

### §12 Sub-move History — Paddock Window Edit Dialog (ratified 2026-04-17)

**Scope:** Editing `event_paddock_windows`. Much simpler than Groups because paddock windows don't chain across events and multi-paddock-open-at-once is legal (strip grazing, multi-paddock access). Gaps between paddock windows aren't an invariant — they just mean the animals were on whatever *other* paddock(s) were open during that interval.

**Entry points (two surfaces, one dialog):**

1. **§4 Paddocks card** — add `Edit` button (`btn btn-ghost btn-xs`) to every paddock window card (both anchor and sub-paddocks). Currently §4 only shows a Close button on sub-paddocks; SP-10 adds Edit alongside it so the user can correct dates, times, area %, and strip-graze config on open windows.
2. **§12 Sub-move History** — existing `Edit` button per row (already spec'd in GH-10 §12). Opens the same dialog.

Both routes open `openPaddockWindowEditDialog(paddockWindow, event, operationId, farmId)`.

**Dialog fields:**

| Field | Type | Notes |
|---|---|---|
| Paddock name | read-only | Chip at top. To change which paddock this window is for, delete the window and re-open via sub-move. |
| `date_joined` | date input | Required. Range-guarded (see below). |
| `time_joined` | time input | Optional. |
| `date_left` | date input | Shown only if window is closed. Range-guarded. |
| `time_left` | time input | Optional. |
| `area_pct` | number input, 1–100 | Percent of paddock area used (100 = full paddock; < 100 = strip graze) |
| `is_strip_graze` | toggle | Generally set at creation; editing here flips between full-paddock and strip-graze mode |
| `strip_group_id` | picker | Only shown when `is_strip_graze` is true. Select which strip group this window belongs to. |

**Save behavior:** Auto-save on blur, `Saved` pulse on success. Same pattern as §7 Groups.

**No gap detection.** A gap between two paddock windows on the same event is not an invariant violation — animals were in some other open paddock during that interval. If the user wants a different paddock to cover the gap, they edit that sibling window's dates directly or create a new window. The app does not cascade corrections across siblings.

**Range guards (reject on save, inline error):**

- `date_joined` < `event.date_in` → **reject**. "A paddock can't be open before the event started. Edit the event start date first, or pick a later join date."
- `date_left` > `event.date_out` when event is closed → **reject**. "A paddock can't stay open after the event closed. Edit the event end date first, or pick an earlier leave date."
- `date_left` < `date_joined` → **reject**. "Leave date must be after join date."
- Same-paddock, same-event, overlapping window already exists (rare — paddock closed and reopened on the same event, then user edits one of them to overlap the other) → **reject**. "This paddock already has a window during that range. Adjust the other window first."

**Delete window action** (bottom of dialog, destructive confirmation):

- "Delete this paddock window? Animals will no longer be recorded as having been on `{paddock name}` from `{date_joined}` to `{date_left}`. This cannot be undone."
- **Guard:** Cannot delete the *last* open paddock window on an active event — that would leave the event with no location for the animals. The user must either close the event or open a different paddock window first.
- **Guard:** Cannot delete the anchor (the window whose `date_joined` matches `event.date_in`) if it's the only window ever opened — that's effectively deleting the event, which belongs in the Actions footer's Delete.

**Strip-graze flip considerations:**

- Flipping `is_strip_graze` from `true` to `false` clears `strip_group_id` and sets `area_pct = 100`. Show a confirm: "Turn off strip grazing for this paddock window? The area will reset to 100%."
- Flipping `is_strip_graze` from `false` to `true` requires picking a `strip_group_id`. If no strip groups exist on this event, offer to create one inline.
- A45 (strip grazing A45 decision) permits edits mid-event; no special handling needed beyond the confirms above.

**No retro-place equivalent.** There's no "move this paddock window to a different event" concept — paddock windows belong to their event by definition. If the user wants to record the animals as having been on a paddock in a *different* event, they add a paddock window to that other event directly.

**OI-0064 "reopen folded into Edit dialog" — resolved here:**

- For a *closed* paddock window, the Edit dialog exposes a `Reopen` action alongside Delete. Reopen clears `date_left` and `time_left` (sets to NULL), restoring the window to active status. Confirmation: "Reopen `{paddock name}` on this event? Animals will be recorded as on this paddock from `{date_joined}` with no end date."
- Reopen does not touch sibling windows. The user is responsible for closing/adjusting other windows if needed (consistent with the no-cascade principle).

### Event-level Dates (`date_in` / `date_out`) — ratified 2026-04-17

**Scope:** Editing the event's overall start and end dates. The event's dates act as bookends — every paddock record and every group record inside this event must fit within them. Edits that push a bookend across an existing record, or leave a stretch of event-time with no records occupying it, need explicit resolution.

**`date_in` — directly editable.** In the Edit Event dialog. Two directions:

- **Narrowing (scenario 2 — push start later, e.g., April 5 → April 10):** If any paddock record or group record has `date_joined < new date_in`, reject with inline error pointing to the offending record. Example: "The anchor paddock (North Pasture) joined on April 5. It can't remain on the event if the event starts April 10. Edit North Pasture's join date first, or pick an earlier event start date." User must fix the child record before the event edit saves. No silent data destruction.
- **Widening (scenario 1 — push start earlier, e.g., April 5 → April 1):** Event's time range widens. No record violates. But any record whose `date_joined` equals the old `date_in` now sits later than the new event start, leaving an empty stretch at the beginning. Confirm dialog names the specific records: "Extending event start from April 5 to April 1. The following currently join April 5: anchor paddock (North Pasture), group window (Group 1). Extend them to April 1 too?" [Yes, extend all] / [No, leave empty stretch at start]. User picks.

**`date_out` — NOT directly editable.** Honors the schema comment in V2_SCHEMA_DESIGN.md §5.1 line 826 ("date_out set by the close/move sequence, not editable directly"). All end-date changes route through Event Reopen → edit / do whatever was needed → re-close at corrected date via the close flow.

**Event Reopen — new user-facing action (closed events only):**

- Location: Edit Event dialog footer, alongside Delete. Button: `Reopen event` (`btn btn-olive`).
- Confirmation: "Reopen `{event name}`? This clears the close date and re-opens the paddock and group records that closed with the event."
- Execution — three coupled writes (atomic from user perspective):
  1. Clear `events.date_out` (and `time_out`) on the event row
  2. For each paddock record whose `date_left` equals the old `date_out`, clear its `date_left` and `time_left`
  3. For each group record whose `date_left` equals the old `date_out`, clear its `date_left` and `time_left`
- **Invariant check (before executing):** If any group record being reopened would create a second open window for the same group elsewhere (that group is currently on a subsequent event), surface the conflict dialog before any writes:
  - "Reopening this event would put `{group name}` back on it, but `{group name}` is currently on `{subsequent event name}` (started `{date}`). Pick one:"
    - **(A) Reopen event but leave `{group name}` on subsequent event** — event reopens, paddock records reopen, but this group's window stays closed. Event becomes open-but-without-this-group until user adds them back manually.
    - **(B) Pull `{group name}` back to this event** — closes `{group name}`'s window on the subsequent event at today, reopens their window on this event. If that leaves the subsequent event with no groups, prompt to also close it.
    - **(C) Cancel** — no writes, dialog closes.
- Multiple-group conflict: if two or more groups trigger the invariant check, the dialog lists all of them and the user picks per group.
- After reopen succeeds, the user is taken back to the Edit Event dialog (now showing the event as active) and can edit `date_in` or child records freely. When ready, they re-close via the Actions footer's `Close & move` or by closing all open windows.

**Re-close overlap warning:**

- When the user re-closes the reopened event at a date later than a subsequent event's `date_in`, the close flow's final confirm surfaces: "`{subsequent event name}` opened `{date}`, during the period this event is now open. Continue? This is allowed but creates overlapping events in the log."
- [Continue] proceeds with the close at the requested date. [Cancel] returns to date input.
- No cascade to the subsequent event — user handles any corrections there separately.
- Rationale: at the records level, group and paddock windows don't overlap (they were moved to the subsequent event and stay there). The overlap is purely at the event-row level — a data peculiarity, not an invariant violation. Worth surfacing as a warning, not worth blocking.

**Summary table:**

| Edit | Direction | Behavior |
|---|---|---|
| `date_in` earlier (widen) | Extends event start backward | Confirm dialog: extend matching child records too, or leave empty stretch |
| `date_in` later (narrow) | Pushes event start forward | Reject if any child record's `date_joined` < new start; user fixes children first |
| `date_out` (any direction) | Not directly editable | Use Event Reopen → edit → re-close via close flow |
| Event Reopen | Re-opens closed event | Clears `date_out` + re-opens matching child windows; invariant-checks for group conflicts with subsequent events |
| Re-close after reopen | Event closed at new date | Warning if new `date_out` is later than a subsequent event's `date_in`; no block |

**Edge cases accepted as "find in testing" (per Tim, 2026-04-17):**

- Event-row-level overlap between two events (both "open" for some period) — allowed, record-level invariants still hold.
- Empty stretches inside an event after widening without extending children — allowed, surfaces as "event has no occupants for period X" in any future data-quality view.
- Strip grazing groups across reopen — A45 strip-graze config is preserved through reopen; if user wants to change strip structure on reopen, they edit the paddock windows normally via §12.

### §8 Feed Entries — ratified 2026-04-17

**Scope:** Editing existing feed entry records, plus the new capability to **move feed out** of an active event (to inventory or to another open event). GH-10 §8 already spec'd per-row Edit and Delete buttons; SP-10 adds validation guards and the move-out flow.

**Edit dialog — validation guards (reject-on-save, inline error):**

- `entry.date` < `event.date_in` → reject. "Feed entry date must be on or after the event start date."
- `entry.date` > `event.date_out` when event is closed → reject. "Feed entry date must be on or before the event end date."
- `entry.date` in the future (later than today) → reject. "Feed entry date can't be in the future."
- `amount` ≤ 0 → reject. "Quantity must be greater than zero. To remove feed from this event, use the Move feed out action."
- `batch_id` changed to a batch with insufficient remaining inventory → reject. "Selected batch has only X remaining; entry is Y."

**No gap/overlap concept.** Feed entries are point-in-time deliveries, not lifecycle windows. All DMI/cost/NPK impact cascades through compute-on-read automatically — no recalc step needed after an edit.

**Delete entry** — existing confirmation modal in GH-10 §8 stands. Confirmation copy: *"Delete this feed entry? This removes the record of delivering `{amount unit}` of `{feed type}` to `{paddock}` on `{date}`. Cannot be undone."*

**Delete vs Move Out — distinct verbs:**

- **Delete** = "this entry should never have existed" (correcting an entry mistake)
- **Move feed out** = "this feed was delivered, then pulled back out" (correcting real-world movement after the fact)

Keeping these distinct preserves history — move-out leaves an audit trail of delivery + removal, delete erases the delivery.

**Per-entry `Move out` action (inline).** Every delivery row in the §8 list gets a `Move out` action next to Edit and Delete. Tapping it opens the same `openMoveFeedOutSheet` (spec'd in §8a) with that row's batch × location **pre-selected** on Step 1. Importantly, the move-out math still operates on the **aggregate remaining for that batch × location**, not on the specific delivery row — feed doesn't carry a provenance-to-delivery link once it's in the pasture (if two deliveries put 60 lbs and 40 lbs of the same batch on the same paddock, and 20 lbs got consumed, you can't say "which 20"). The inline action is a convenience shortcut into the sheet, not a different operation.

**Why two entry points:** the card-footer `Move feed out` button is discoverable for a farmer who already has the move-out flow in mind. The per-row `Move out` is for the farmer who's scanning the feed list, spots the entry that's relevant ("oh yeah, that bale from last week"), and wants to act on it in place. Both land in the same sheet; the inline one just saves a tap.

---

#### §8a Move Feed Out (new capability)

**Entry points (two ways in, same sheet):**

1. **`Move feed out` button in the §8 Feed Entries card footer** — sits next to the existing `Deliver feed` CTA. Visible only on active events (`event.date_out` is null). Opens the sheet with no row pre-selected.
2. **Per-entry `Move out` action** on each feed entry row in the §8 list — opens the same sheet with that row's batch × location pre-selected on Step 1.

Both entry points call `openMoveFeedOutSheet(event, operationId, farmId, { preselectBatchId, preselectLocationId })`. The inline entry point passes preselect args; the footer entry point passes nothing.

**Terminology note.** Step 1 aggregates current feed state by **batch × location** (e.g., "Batch #7 Hay on North Pasture"). Throughout §8a, a **feed line** = one batch × location aggregation row. This is distinct from "animal group" — to avoid collision, §8a never uses the word "group" for this aggregation.

**Flow — four steps in a single sheet:**

**Step 1 — Current feed state.** List one feed line per batch × location for this event (same aggregation shape as the close+move wizard's feed transfer section — reuse the logic from `move-wizard.js:367-373`). Each line displays `{batchName} → {paddockName}: {currentRemaining} {unit}` where `currentRemaining` = (sum of deliveries on that line) minus (sum of removals on that line) minus (consumption implied by the most recent feed check on that line). If no feed check exists since the last delivery or removal, show `{netDelivered} {unit} (no check)` and fall back to net-delivered as the remaining.

**Step 2 — Strike the line (forced feed check).** For each selected feed line, show an inline `current remaining` input pre-filled with the Step 1 value. User confirms or corrects. **This is staged in sheet state only — no database write happens yet.** The confirmed values travel with the sheet to Step 4; only Step 4 Confirm actually writes them. Copy: *"Confirm what's currently there before moving it. This becomes a feed check on today's date when you confirm the move."*

If the user hits Cancel at any point before Step 4 Confirm, all staged values are discarded — the sheet closes, no rows are written, the source event is exactly as it was before.

**Step 3 — How much and where:**

- User specifies **amount to move** per selected feed line (number input, max = Step 2 confirmed remaining, min = 0.1). Unselected lines are ignored.
- User picks **destination** from a single picker with two modes:
  - **Back to inventory** — the batch's remaining quantity increases by the moved amount
  - **Existing open event** — picker lists active events (same filter as move wizard: `!e.dateOut && e.id !== sourceEvent.id`). User picks one. If the destination event has multiple paddocks, user also picks the destination paddock.

**Step 4 — Confirm.** Preview summary: *"Move 40 lbs Hay from Event {source} → Event {destination} (North Pasture). A feed check will also be recorded on today's date: {line} remaining {X} {unit}."* [Cancel] [Confirm]. On Confirm, execute the writes below atomically.

**Writes on Confirm (all in one store transaction — nothing writes until this step):**

1. Create one `event_feed_checks` row per selected feed line (from the Step 2 staged values), dated today, with the user-confirmed remaining amount. This strikes the line for DMI purposes.
2. Create one `event_feed_entries` row on the **source** event per selected feed line:
   - `entry_type = 'removal'`
   - `destination_type = 'batch'` or `'event'`
   - `destination_event_id = {dest.id}` if destination_type is 'event', else NULL
   - `amount = {amount moved}` (positive; the `entry_type` flag signals direction)
   - `date = today`
   - `batch_id`, `location_id` preserved from source
3. If destination is **inventory**: increment the destination batch's remaining quantity by the moved amount. (Batch-level adjustment — existing batch-stock mechanism.)
4. If destination is **event**: create a matching inbound `event_feed_entries` row on the destination event with:
   - `entry_type = 'delivery'`
   - `source_event_id = {source.id}` (reuses the existing close+move transfer pattern, CP-29)
   - `amount`, `batch_id`, `date = today`, `location_id = {picked destination paddock}`

If any write in this transaction fails, the whole transaction aborts — no feed check rows, no removal row, no inventory bump, no destination delivery row. The sheet surfaces an error and lets the user retry.

**Why a feed check is staged in Step 2 (and committed in Step 4):** without a feed check at the moment of move-out, DMI-5 (feed check interpolation) has no fixed point between "last known remaining" and "current remaining after removal." The Step 2 value strikes the line — everything before it counts as consumption at the source, the remaining amount is what gets moved. Staging-not-writing in Step 2 means Cancel leaves the source event pristine; the write only lands if the whole move actually happens.

**Validation guards in the sheet:**

- Move amount > Step 2 confirmed remaining → inline error on Step 3. "Can't move more than what's there. Current remaining after check: X."
- Destination event + destination paddock not selected → Confirm button disabled.
- Destination event has the same id as source event → filtered out by the picker (not selectable).

**DMI / NPK / cost logic — how compute-on-read handles removals (and why Step 2 works):**

The mental model Tim confirmed: *"DMI should already have removed the available feed to check when it was removed, so the feed check is based on the amount of feed available at the time of the second feed check. Same logic if the farmer moves feed in in the morning — the total available goes up, surfaced at the next feed check. And moving the feed out in your scenario would have generated a feed check at that time, which now becomes base for DMI (what was there minus what was removed from what was there)."*

Written out for the calc layer:

For any feed line (batch × location) on an active event, the running "available feed" at time `T` is:

```
available(T) = Σ deliveries(date ≤ T) − Σ removals(date ≤ T)
```

A feed check at time `T` records `remaining(T)`. Consumption between two checks at `T1` and `T2` is:

```
consumed(T1 → T2) = (remaining(T1) + deliveries(T1 < date ≤ T2) − removals(T1 < date ≤ T2)) − remaining(T2)
```

DMI-5 divides that consumption by head-days across `T1 → T2` for per-head intake.

**What the Step 2 feed check guarantees:** at the exact instant of move-out, there's a recorded `remaining` value. Everything consumed before move-out lands in the pre-move-out interval's consumption. The removal row subtracts the moved amount from `available`. The next farmer-entered feed check after move-out compares `remaining(next)` against `(remaining(moveOut) + new deliveries − no removals) = (remaining(moveOut) − movedAmount + any deliveries since)` — which gives the correct post-move-out consumption. This is exactly the "what was there minus what was removed from what was there" framing.

**Code-level change (one place):** the calc registry entries for DMI-1, DMI-5, NPK-1, NPK-2, and cost-per-day currently sum deliveries only. They need to sum deliveries minus removals. This is a one-line change per calc (already default-safe because legacy rows have `entry_type = 'delivery'` and therefore contribute zero to the removals sum).

**Same-day ordering edge case (documented, not blocked):** if a farmer moves feed out at 9 AM (which writes a feed check at `date = today`) and then enters a genuine feed check also at `date = today` later that afternoon, the two checks share a date. The store treats the last-written check on a given date as authoritative for DMI purposes (latest wins). This is the simplest behavior and matches v1. If the farmer's afternoon check conflicts with the morning move-out check, "latest wins" is the right policy — the farmer saw current reality more recently than the move-out logic computed it. Not blocked, not warned. Flag for field testing — if it causes confusion, we revisit with a time-of-day stamp on feed checks.

**Edge cases:**

- Event has no feed entries → `Move feed out` button is disabled with tooltip "No feed to move."
- Event has feed entries but all are already fully consumed per checks → button remains active but Step 1 will show zeros across the board; user sees "No remaining feed to move" and cancels.
- Moving feed from a closed event → not possible (button only on active events). If needed, user reopens the event first via the event-level Reopen action (see Event-level Dates section).
- Partial batch move with leftover → standard case, new removal row reflects the partial amount.

**Schema impact:**

Three new columns on `event_feed_entries`:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `entry_type` | text enum (`delivery`, `removal`) | `'delivery'` | Direction of the entry |
| `destination_type` | text enum (`batch`, `event`) nullable | NULL | Where the removed feed went (only set if `entry_type = 'removal'`) |
| `destination_event_id` | uuid FK → events(id) ON DELETE SET NULL, nullable | NULL | Destination event (only set if `destination_type = 'event'`) |

Check constraints:
- `entry_type = 'removal'` implies `destination_type IS NOT NULL`
- `destination_type = 'event'` implies `destination_event_id IS NOT NULL`
- `destination_type = 'batch'` implies `destination_event_id IS NULL`

**CP-55/CP-56 impact (per Export/Import Spec Sync Rule):**

- CP-55 export must serialize all three new columns.
- CP-56 import defaults for old backups: `entry_type = 'delivery'`, `destination_type = NULL`, `destination_event_id = NULL`. No data migration needed — all legacy entries are deliveries by definition.
- Migration bumps `schema_version` and adds `BACKUP_MIGRATIONS` entry.
- `destination_event_id` adds an FK to events. V2_MIGRATION_PLAN.md §5.3a ordering: `event_feed_entries` stays in position — `destination_event_id` points to the same `events` table it already points through via `event_id`, so no new FK cycle.

**Linked OPEN_ITEMS:**

- **OI-0082** — Move Feed Out capability (this section). Tracks the new capability separately from OI-0081 because it has schema impact: three new columns on `event_feed_entries` + check constraints, CP-55/CP-56 spec impact, calc registry one-line update per affected formula.

### §9 Feed Checks — ratified 2026-04-17

**Scope:** Editing and deleting existing feed check records (`event_feed_checks`), plus back-filling a forgotten check with a past date.

**Edit dialog fields:** `date`, `time` (optional, defaults to noon), `remaining_amount`, optional `notes`. Batch and location are **read-only** on edit — changing which feed line a check belongs to isn't an edit, it's a delete + re-add.

**Range guard on date (reject-on-save, inline error):**

- `check.date` < `event.date_in` → reject. "Feed check date must be on or after the event start date."
- `check.date` > `event.date_out` when event is closed → reject. "Feed check date must be on or before the event end date."
- `check.date` in the future → reject. "Feed check date can't be in the future."
- `remaining_amount` < 0 → reject. "Remaining amount can't be negative."

**Invariant check on save (this is the structural piece):**

A feed line is a batch × location within an event. Across all checks on that feed line, consumption between consecutive checks must be ≥ 0:

```
consumed(Ti → Ti+1) = remaining(Ti)
                   + Σ deliveries(Ti < date ≤ Ti+1)
                   − Σ removals(Ti < date ≤ Ti+1)
                   − remaining(Ti+1)
                   ≥ 0
```

Translation: between two checks, the feed can only go down unless something was delivered. A later check reading higher than the prior check with nothing delivered is impossible — it would mean feed appeared from nowhere.

When the user saves an edit (or back-fills a past-dated check), re-check this invariant across the check's neighbors:

**Case A — edit is benign.** All adjacent-interval consumptions are still ≥ 0. Save silently, let compute-on-read cascade. DMI-5 recomputes for the intervals on either side of the edited check. No prompt, no warning. This matches the core principle: *derived values auto-cascade.* The subsequent feed check records don't change — they remain observations of what the farmer saw at those specific times. Only the derived consumption numbers flow through.

**Case B — edit breaks a later interval.** A check after the edited one now implies negative consumption (the edited check's new value is lower than a later check's recorded value, with no delivery between them). The later check can't be right given the edit. Surface a **Re-snap dialog** before the edit commits:

> "This edit makes a later feed check impossible.
>
> You're changing the check on `{T date}` from `X` to `Y` {unit}.
> But the check on `{T+k date}` recorded `Z` {unit} — which would mean feed appeared from nowhere between those dates.
>
> To proceed, we'll delete the later check(s) that no longer fit:
> • `{T+k date} — {Z unit}`
> • (any others in the same impossible run)
>
> After saving, enter a new feed check to re-measure what's actually there now.
>
> [Cancel edit] [Delete later checks and save]"

If the user clicks **Delete later checks and save**, the edit commits in a single transaction with the deletions. The farmer is then prompted (non-modal toast): *"Enter a new feed check to re-snap the line →"* with a shortcut button to open the check dialog pre-filled for that feed line.

**Case C — edit breaks an earlier interval.** Less common, happens when farmer edits a check *upward* such that the previous interval now implies negative consumption (the earlier check reads lower than the edited one with no delivery between). This usually means either the current edit is too high, or the earlier check was too low. We don't auto-delete earlier checks — that's too destructive. Instead surface:

> "This edit is inconsistent with an earlier feed check.
>
> You're changing the check on `{T date}` to `Y` {unit}.
> But the check on `{T−k date}` recorded `W` {unit} — which would mean feed appeared from nowhere between those dates.
>
> One of the two checks is wrong. Review them and edit the right one.
>
> [Cancel edit]"

Only Cancel is offered — no auto-fix. The farmer decides which check to correct.

**Case D — back-fill a past check.** User adds a net-new check dated in the past (e.g., "I forgot to log Tuesday's check"). The inserted check slots into the timeline and runs the same invariant check against both neighbors (previous check and next check). If it violates either side, use Case B or Case C resolution depending on direction.

**Delete a feed check:**

Existing confirmation modal: *"Delete this feed check? {batchName} → {paddockName}, {remaining} {unit} on {date}."* No invariant check needed — deleting a check only widens the consumption interval on either side, which never creates an impossibility. Compute-on-read re-spans the interval automatically.

**Move Feed Out interaction (from §8a):**

The Step 2 "strike the line" check that Move Feed Out writes is an ordinary `event_feed_checks` row. It can be edited and deleted like any other check, with the same invariant rules. If a farmer deletes the Step 2 check after a move-out has happened, the removal row stays — the DMI for the interval just widens. This is acceptable but worth noting in field testing.

**DMI cascade (same as §8):** all feed calcs recompute via compute-on-read. No explicit recalc step. No cache to bust.

**Edge cases:**

- Check with no prior check on that feed line → benign, no previous interval to validate against. Just validates against the next check (if any) and deliveries/removals since the event start.
- Check with no later check on that feed line → benign, no next interval to validate against.
- Zero-delta edit (user opens dialog, changes nothing, saves) → no-op.
- Two checks on the same date on the same feed line → "latest-wins" policy from §8a applies. Same-day edits target the most recently saved one by default; the list UI should display the timestamp to disambiguate.

**No schema impact.** All fields already exist on `event_feed_checks`.

**Linked OPEN_ITEMS:**

- None — §9 is existing capability, SP-10 just adds the invariant check and re-snap flow.



### §3 Pre-graze Observations — ratified 2026-04-17

**Scope:** Editing per-paddock pre-graze observation values inline on the Edit Event dialog's §3 card (per OI-0068 — inline fields, not a modal).

**Fields edited inline:** `grass_height_cm`, `forage_cover_pct`, `forage_condition`, `veg_height_cm`, `bale_ring_residue_count` (when bale-ring helper applies), `pre_graze_rating`, optional `notes`.

**Behavior:** auto-save on blur per field. No submit button. If validation rejects, value reverts with inline error text on the field.

**Field-level validation guards (reject-on-blur, revert value + show error):**

- Numeric fields < 0 → reject. *"Value must be zero or greater."*
- `forage_cover_pct` > 100 → reject. *"Cover % can't exceed 100."*
- `pre_graze_rating` outside the slider's configured min/max → reject (slider UI already clamps, this is a belt-and-suspenders guard on direct keyboard entry).
- Blank required field → no error shown until the user attempts to commit the event or leave the screen; keep the field editable.

**Cascade behavior — silent, by design.** Pre-graze observation values feed the **pre-graze DM kg/ha** calc, which feeds DMI targets and the move recommendation. When a farmer edits a value days or weeks after the fact, compute-on-read re-derives pre-graze DM, DMI target, and move recommendation for that event.

Tim's framing (2026-04-17): *"changes to those values should affect inferred DMI etc by design so expected."*

No warning on large deltas. No confirmation on edits that move DMI significantly. The farmer is correcting an observation — the downstream math *should* respond to that correction. Any surprise is better addressed by good change-log surfacing in Reports (diff of before/after calculated DMI for the event), not by gating the edit. Flag for field testing — if farmers find a retroactive DMI shift confusing, we revisit with an optional "this edit changed X's value by Y%, which shifts DMI from A to B — continue?" confirmation.

**No gap/overlap concept.** Pre-graze observations are per-paddock snapshots at event start — not lifecycle windows.

**Delete an observation row:** existing confirmation modal. Safe — just widens the "no observation on this paddock" state, which the calc layer handles (falls back to farm default or flags "no data" in Reports).

**No schema impact.**

**Linked OPEN_ITEMS:**

- OI-0068 closed — inline field pattern covers this.

### §6 Post-graze Observations — ratified 2026-04-17

**Scope:** Editing per-paddock post-graze observation values inline on the Edit Event dialog's §6 card. Card always renders (per SP-2 round 2), showing an empty-state hint if no post-graze data has been recorded yet.

**Fields edited inline:** `post_graze_height_cm`, `post_graze_cover_pct`, `post_graze_rating`, `recovery_window_days`, optional `notes`.

**Behavior:** auto-save on blur per field. Same pattern as §3.

**Field-level validation guards:**

- Numeric fields < 0 → reject. *"Value must be zero or greater."*
- `post_graze_cover_pct` > 100 → reject. *"Cover % can't exceed 100."*
- `recovery_window_days` < 0 or > 365 → reject. *"Recovery window must be between 0 and 365 days."*
- Live date preview next to `recovery_window_days` shows `{event.date_out + recovery_window_days}` so the farmer can sanity-check the target re-graze date as they type.

**Cascade behavior — silent, by design.** Post-graze observations feed the **post-graze DM kg/ha** calc (used for utilization %) and the **recovery window end date** (used in rotation calendar to mark the paddock as rest-eligible after that date). Edits cascade silently through compute-on-read.

**Recovery window specifically:** when `recovery_window_days` is edited, the paddock's next-eligible-graze date shifts. If a future event is already planned during what becomes the recovery window, flag it **at the planning step of that future event**, not here. §6 stays silent on the edit. This keeps the edit dialog from doing planning-level checks that belong in the planner.

**No gap/overlap concept.** Post-graze observations are per-paddock snapshots at event close.

**No schema impact.**

**Linked OPEN_ITEMS:**

- None.


### Linked OPEN_ITEMS

- **OI-0081** — SP-10 umbrella (ratified 2026-04-17, ready for Claude Code). Covers all seven edit-behavior sections.
- **OI-0082** — SP-10 §8a Move Feed Out (new capability). Separately tracked because it has schema impact.
- OI-0064 — Manage button dropped from sub-move history; reopen folds into Edit dialog. Folded into SP-10 §12.
- OI-0068 — SP-2 pre-graze observations: inline fields, not modal (closed; SP-10 §3 confirmed pattern).

### Change Log

| Date | Session | What changed |
|---|---|---|
| 2026-04-17 | SP-10 walkthrough start | Section added. Core principle documented. Walkthrough order set. Shared gap/overlap routine ratified. §7 Groups fully spec'd. §12, event-level dates, §8, §9, §3, §6 stubbed pending walkthrough. |
| 2026-04-17 | SP-10 §12 | Sub-move History / paddock window edit ratified. Entry from §4 Paddocks + §12 Sub-move rows. Fields: date_joined/time, date_left/time, area_pct, is_strip_graze, strip_group_id. No gap detection. Range guards + same-paddock overlap reject. Delete window + guards. Resolves OI-0064 (closed-window reopen folds into Edit). |
| 2026-04-17 | SP-10 event-level dates | `date_in` directly editable with reject-on-narrow / confirm-on-widen. `date_out` NOT directly editable — routed through new **Event Reopen** action (closed events only). Reopen re-opens matching child windows and runs invariant check for group conflicts on subsequent events (three-option picker). Re-close overlap = warning, no block. |
| 2026-04-17 | SP-10 §8 + §8a | §8 Feed Entries validation guards ratified (reject-on-save, no gap/overlap concept — entries are point-in-time). **§8a Move Feed Out** spec'd: new capability on active events, four-step sheet (current state → forced feed check → amount + destination → confirm), destination is batch inventory or existing open event. Schema adds 3 columns to `event_feed_entries` (`entry_type`, `destination_type`, `destination_event_id`) + check constraints. DMI/NPK/cost calcs updated to sum deliveries minus removals (compute-on-read, one-line change). CP-55/CP-56 impact noted. |
| 2026-04-17 | SP-10 §8a revision | Revised §8a: added per-row inline entry point (same sheet, pre-selected feed line); Step 2 feed check now staged-until-Step-4-Confirm (Cancel leaves source pristine); replaced "group" with "feed line" to avoid animal-group collision; added explicit DMI logic block with formulas for available/consumed including removals; same-day ordering edge case (two checks dated today) documented as latest-wins, flag for field testing. |
| 2026-04-17 | SP-10 §9 | Feed Checks edit behavior ratified. Range guard on date. Invariant `consumed(Ti → Ti+1) ≥ 0` checked on save across all adjacent intervals on a feed line. Benign edits cascade silently; later-interval breaks surface the Re-snap dialog (offer to delete later invalid checks + save, farmer re-measures); earlier-interval breaks surface conflict with Cancel only (no auto-delete of earlier checks). Back-fill past-dated checks runs same invariant check. Delete always safe — only widens intervals. No schema changes. |
| 2026-04-17 | SP-10 §3 + §6 + wrap | Observations ratified. Auto-save on blur per field. Field-level validation only (non-negative, % ≤ 100, recovery 0-365). Silent cascade through compute-on-read by design — no threshold warnings on DMI shifts. Recovery-window-in-planning conflicts surface at the future event's planning step, not on the §6 edit. **All SP-10 sections ratified** — ready for Claude Code. |

---

## Reconciliation Checklist (end of sprint)

When this sprint is complete, do a dedicated session to:

- [ ] Merge SP-3 card spec into V2_UX_FLOWS.md §17.7 (replace current minimal card body spec)
- [ ] Verify §17.15 (already in base doc) is still accurate after implementation
- [ ] Verify §17.7 action buttons (already in base doc) match final implementation
- [ ] Convert `github/issues/` files to thin pointers referencing base doc sections
- [ ] Update V2_BUILD_INDEX.md with completed work
- [ ] Merge SP-6 feedback/help buttons into V2_UX_FLOWS.md §17.2 (add sub-row to header spec)
- [ ] Merge SP-7 feedback screen into V2_UX_FLOWS.md as new §21 (or append to §20)
- [ ] Merge SP-8 field mode into V2_UX_FLOWS.md §16 (replace current field mode spec with v1 parity version; include "exit returns to previous screen" behavior)
- [ ] Merge SP-9 survey sheet v1 parity into V2_UX_FLOWS.md §7 (expand the current short paragraph into the full spec: three modes, paddock card, bulk chrome, bale-ring helper, draft lifecycle, commit rules, field-mode adaptations). Also: §17 may need a new sub-section documenting the Surveys sub-tab on the Locations screen (draft banner + committed list).
- [ ] Document the `survey.baleRingCover` calc in V2_CALCULATION_SPEC.md (inputs, output, formula).
- [ ] Update V2_SCHEMA_DESIGN.md §4 (farm_settings) to include `bale_ring_residue_diameter_ft`; confirm `event_observations.bale_ring_residue_count` is documented.
- [ ] Update CP-55 / CP-56 spec(s) with new farm_settings column handling and schema_version bump to 22.
- [ ] **SP-10 reconciliation** — merge into V2_UX_FLOWS.md as new §17.15.1 "Event Data Editing" (gap/overlap resolver, retro-place flow, per-section edit behavior) and into V2_APP_ARCHITECTURE.md as new "Consistency & Rollback" subsection (core principle, snapshot/rollback pattern). Convert SP-10 spec file in `github/issues/` to a thin pointer once integrated.
- [ ] **SP-10 §8a schema reconciliation** — update V2_SCHEMA_DESIGN.md `event_feed_entries` table to include `entry_type`, `destination_type`, `destination_event_id` columns + check constraints. Update V2_CALCULATION_SPEC.md for DMI-1, DMI-5, NPK-1, NPK-2, cost-per-day to reflect "sum deliveries minus removals." Update CP-55 / CP-56 specs with new columns + schema_version bump. Update V2_MIGRATION_PLAN.md §5.3a ordering note (no change to ordering, just confirm `event_feed_entries` stays in position since the new FK points at the same `events` table it already references).
- [ ] Archive this file or mark it as reconciled
