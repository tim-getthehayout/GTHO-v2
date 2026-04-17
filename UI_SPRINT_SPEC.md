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

## Reconciliation Checklist (end of sprint)

When this sprint is complete, do a dedicated session to:

- [ ] Merge SP-3 card spec into V2_UX_FLOWS.md §17.7 (replace current minimal card body spec)
- [ ] Verify §17.15 (already in base doc) is still accurate after implementation
- [ ] Verify §17.7 action buttons (already in base doc) match final implementation
- [ ] Convert `github/issues/` files to thin pointers referencing base doc sections
- [ ] Update V2_BUILD_INDEX.md with completed work
- [ ] Merge SP-6 feedback/help buttons into V2_UX_FLOWS.md §17.2 (add sub-row to header spec)
- [ ] Merge SP-7 feedback screen into V2_UX_FLOWS.md as new §21 (or append to §20)
- [ ] Archive this file or mark it as reconciled
