# Feed Dialogs — V1 Parity UI Rebuild (Feed Check + Deliver Feed)

**Priority:** P1
**Area:** v2-build / UI sprint
**Files:** `src/features/feed/check.js`, `src/features/feed/delivery.js`, `src/styles/main.css`
**Labels:** `ui`, `v1-parity`, `sprint`
**Schema impact:** None — visual/interaction only
**CP-55/CP-56 impact:** None

---

## Part 0: Global Sheet CSS — Match V1 Sizing

The v2 `.sheet-panel` has different sizing and positioning from v1's `.sheet` class. This makes all v2 dialogs feel larger and more padded than v1. Fix the base CSS to match v1 globally.

### Current v2 (WRONG)
```css
.sheet-wrap.open {
  display: flex;
  align-items: flex-end;      /* anchored to bottom */
  justify-content: center;
}
.sheet-panel {
  padding: var(--space-6);     /* 24px — too much */
  width: 100%;
  max-width: 480px;            /* too narrow on desktop */
  max-height: 85vh;
}
```

### V1 Reference (TARGET)
```css
.sheet-wrap.open {
  display: flex;
  align-items: center;         /* vertically centered */
  justify-content: center;
}
.sheet {
  width: min(92vw, 680px);     /* responsive, wider max */
  padding: 16px 16px 24px;     /* tighter padding */
  max-height: 90vh;
  border-radius: var(--radius-xl);
}
```

### Changes to `src/styles/main.css`

**`.sheet-wrap.open`** — change `align-items: flex-end` → `align-items: center`

**`.sheet-panel`** — change to:
```css
.sheet-panel {
  position: relative;
  z-index: 1;
  background: var(--bg);
  border-radius: var(--radius-xl);
  padding: 16px 16px 24px;
  width: min(92vw, 680px);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}
```

**Desktop media query** — the existing `@media (min-width: 900px)` override for `.sheet-panel { max-width: 600px }` should be removed (the `min(92vw, 680px)` handles both mobile and desktop).

**Also add the sheet handle** (the gray drag indicator bar at the top of v1 sheets):
```css
.sheet-handle {
  width: 36px;
  height: 4px;
  background: var(--border2);
  border-radius: 2px;
  margin: 0 auto 16px;
}
```

Each sheet's `openXxxSheet()` function should prepend a `.sheet-handle` div as the first child of the panel.

**Desktop sidebar offset** — v1 accounts for the 220px sidebar:
```css
@media (min-width: 900px) {
  .sheet-wrap.open {
    padding-left: 220px;
  }
}
```

---

## Part 1: Feed Check Sheet — V1 Parity

## Problem

The v2 feed check sheet (`openFeedCheckSheet`) is a bare-bones form with a single numeric input per batch×location group. V1's feed check has a rich, synchronized three-control pattern per feed type: a stepper (−/+ buttons around a numeric input), a percentage input, and a range slider — all three stay in sync as the user interacts with any one of them. V1 also shows "consumed since last check" with a DMI estimate, and pre-fills with the last check's remaining value.

The v2 UI is a usability regression from v1. Users who are used to the slider-based quick check in v1 will find v2's plain numeric input awkward, especially on mobile where typing exact decimals is harder than dragging a slider.

## Goal

Rebuild `openFeedCheckSheet` so the per-item card matches v1's layout and interaction pattern exactly.

---

## V1 Per-Item Card Layout (target)

Each feed item card renders top to bottom:

### 1. Header
- **Feed type name** + unit label in parentheses: e.g., "Round bale- Grass (bales)"
- **Info line** (11px, muted): `Started: {N} {units} · Last check: {N} {units} ({weekday} {time})` or `Started: {N} {units} · No prior check`

### 2. Two-column input row
Side by side with `gap: 12px`:

**Left column (flex: 1) — "Remaining {units}":**
- Label: 11px muted
- Stepper control: amber-bordered rounded container with:
  - **Minus button** (36×38px, amber-light bg, amber-dark text, "−"): `step = -0.10`
  - **Numeric input** (center-aligned, 16px bold, transparent bg, no border): `type="number"`, `step="0.01"`, `min="0"`, `max="{startedUnits}"`
  - **Plus button** (same style as minus, "+"): `step = +0.10`

**Right column (flex: 1) — "Remaining %":**
- Label: 11px muted
- Numeric input (centered, 16px bold, standard border): `type="number"`, `min="0"`, `max="100"`, `step="0.5"`

### 3. Range slider
- Full-width `<input type="range">` with `min="0"`, `max="100"`, `step="0.5"`
- Accent color: amber (`#BA7517` or `var(--amber)`)
- Below slider: three labels `0%` | `50%` | `100%` (9px muted, space-between)

### 4. Consumed banner
- Amber-light background, rounded, padding 8px 10px
- Left: "Consumed since last check" (11px, amber-dark)
- Right: `{N} {units} · ~{M} lbs DMI` (13px bold, amber-dark)

---

## Control Synchronization Pattern

All three controls (stepper/units input, percentage input, slider) share one source of truth: `remaining` (in units) stored per item in an in-memory array.

### Input handlers

**`_fcAdj(idx, delta)`** — stepper +/- buttons
- `remaining = clamp(remaining + delta, 0, startedUnits)` (round to 2 decimals)
- Call `_fcUpdateUI(idx)` — updates all three controls

**`_fcUnitsChanged(idx)`** — user typing in units input
- Parse value, clamp to `[0, startedUnits]`
- Call `_fcUpdateUI(idx, skipUnits=true)` — update slider + pct, skip units input (user is typing)

**`_fcPctChanged(idx)`** — user typing in percentage input
- Parse percentage, clamp to `[0, 100]`
- Convert: `remaining = startedUnits × pct / 100`
- Call `_fcUpdateUI(idx, skipUnits=false, skipPct=true)` — update slider + units, skip pct input

**`_fcSliderChanged(idx)`** — user dragging slider
- Read slider value as percentage
- Convert: `remaining = startedUnits × pct / 100`
- Call `_fcUpdateUI(idx)` — updates all three controls

### Core sync function: `_fcUpdateUI(idx, skipUnits, skipPct)`
1. Calculate `pct = remaining / startedUnits × 100`
2. If `!skipUnits`: set units input value to `remaining.toFixed(2)`
3. If `!skipPct`: set pct input value to `pct.toFixed(1)`
4. Always: set slider value to `pct.toFixed(1)`
5. Update consumed display:
   - `consumed = max(0, startedUnits - remaining)`
   - `consumedDMI = consumed × weightPerUnitKg × KG_TO_LBS × (dmPct / 100)`
   - Display: `{consumed.toFixed(2)} {units} · ~{round(consumedDMI)} lbs DMI`

**Skip flags prevent cursor-jump:** When the user is typing in the units input, we don't overwrite it (which would move their cursor). Same for the percentage input. The slider always updates because dragging doesn't have this problem.

---

## Data Sources

For each batch×location group, gather:

| Field | Source | Notes |
|---|---|---|
| `startedUnits` | Sum of `eventFeedEntries.quantity` for this batch×location | Already computed as `totalDelivered` |
| `lastCheckUnits` | Most recent `eventFeedCheckItems.remainingQuantity` for this batch×location | Query `eventFeedCheckItems` joined through `eventFeedChecks` for this event, sorted by check date desc |
| `lastCheckDate` | Most recent `eventFeedChecks.date` for a check that includes this batch×location | Same query as above |
| `lastCheckTime` | Most recent `eventFeedChecks.time` | Same query |
| `weightPerUnitKg` | `batches.weightPerUnitKg` | May be null — skip DMI display if null |
| `dmPct` | `batches.dmPct` | May be null — skip DMI display if null |
| `unit` | `batches.unit` | For unit label display |
| `feedTypeName` | Look up `feedTypes` by `batches.feedTypeId`, use `.name` | For card header; fall back to batch name if feedTypeId missing |

**Initial remaining value:** Pre-fill with `lastCheckUnits` if a prior check exists, otherwise `startedUnits` (all feed remaining = 100%).

### Unit label map
```
round-bale → bales, square-bale → bales, bale → bales, tub → tubs,
bag → bags, ton → tons, lb → lbs, kg → kg
```
Default: append "s" to the unit string.

---

## Sheet Layout (full)

Top to bottom:

1. **Header row:** "Feed check" (15px bold) + "Cancel" button (right-aligned, muted)
2. **Context line:** location icon + event display name + group names (12px muted)
3. **Date/Time row:** side by side, date defaults to today, time defaults to current time
4. **Feed item cards** (one per batch×location group) — the v1 parity card described above
5. **Save button:** full-width amber, "Save feed check"

Notes field is optional — can keep or drop. V1 doesn't have a notes field on the feed check sheet itself.

---

## i18n Keys Needed

New keys (add to `feed` namespace in `en.json`):
- `feed.feedCheckRemaining{Units}` → "Remaining {units}" (or build dynamically)
- `feed.feedCheckRemainingPct` → "Remaining %"
- `feed.feedCheckConsumed` → "Consumed since last check"
- `feed.feedCheckNoprior` → "No prior check"
- `feed.feedCheckSaveBtn` → "Save feed check"

Existing keys to reuse:
- `feed.feedCheckTitle` → "Feed Check"
- `feed.feedCheckEmpty` → "No feed delivered to this event yet."

---

## Acceptance Criteria

- [ ] Each batch×location group renders as a card with stepper + pct input + slider
- [ ] Changing any one control updates the other two in real time
- [ ] Skip flags prevent cursor jump when typing in units or pct input
- [ ] Stepper adjusts by ±0.10 per click, clamped to [0, startedUnits]
- [ ] Slider range is 0–100%, step 0.5
- [ ] Consumed banner shows units consumed and approximate DMI (lbs)
- [ ] DMI calculation uses `batch.weightPerUnitKg × 2.20462 × batch.dmPct / 100`
- [ ] If `weightPerUnitKg` or `dmPct` is null, consumed banner shows units only (no DMI)
- [ ] Pre-fills remaining from last check value if one exists, otherwise from startedUnits
- [ ] Last check info line shows date (weekday format) and time if available
- [ ] Date defaults to today, time defaults to current time (HH:MM)
- [ ] Save creates `eventFeedChecks` parent + `eventFeedCheckItems` children (existing store pattern)
- [ ] Cancel closes sheet without saving
- [ ] Works on mobile (touch-friendly stepper buttons, slider works on touch)

---

## V1 Reference HTML — Feed Check Card (COPY THIS PATTERN)

This is the actual v1 HTML output for a single feed-type card. Claude Code must replicate this exact structure using the DOM builder. Do not simplify, skip elements, or change the layout. Use inline styles exactly as shown — do not substitute CSS classes unless the class already exists in v2's stylesheet.

```html
<div class="card" style="padding:14px;margin-bottom:10px;">
  <div style="margin-bottom:10px;">
    <div style="font-size:13px;font-weight:500;">Round bale- Grass (bales)</div>
    <div style="font-size:11px;color:var(--text2);">Started: 0.9 bales · Last check: 0.90 bales (Mon 09:53)</div>
  </div>
  <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px;">
    <div style="flex:1;">
      <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;">Remaining bales</label>
      <div style="display:flex;align-items:center;border:0.5px solid var(--amber);border-radius:8px;overflow:hidden;background:var(--bg);">
        <button style="width:36px;height:38px;border:none;background:var(--amber-l);color:var(--amber-d);font-size:18px;cursor:pointer;font-weight:500;font-family:inherit;">−</button>
        <input type="number" value="0.90" step="0.01" min="0" max="0.9"
          style="flex:1;text-align:center;border:none;font-size:16px;font-weight:500;padding:8px 0;background:transparent;color:var(--text);outline:none;width:50px;font-family:inherit;">
        <button style="width:36px;height:38px;border:none;background:var(--amber-l);color:var(--amber-d);font-size:18px;cursor:pointer;font-weight:500;font-family:inherit;">+</button>
      </div>
    </div>
    <div style="flex:1;">
      <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;">Remaining %</label>
      <input type="number" value="100.0" min="0" max="100" step="0.5"
        style="width:100%;padding:10px 12px;border:0.5px solid var(--border2);border-radius:8px;font-size:16px;font-weight:500;background:var(--bg);text-align:center;box-sizing:border-box;font-family:inherit;color:var(--text);">
    </div>
  </div>
  <div style="margin-bottom:8px;">
    <input type="range" min="0" max="100" value="100.0" step="0.5"
      style="width:100%;accent-color:#BA7517;">
    <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-top:2px;">
      <span>0%</span><span>50%</span><span>100%</span>
    </div>
  </div>
  <div style="background:var(--amber-l);border-radius:8px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:11px;color:var(--amber-d);">Consumed since last check</span>
    <span style="font-size:13px;font-weight:500;color:var(--amber-d);">0.00 bales · ~0 lbs DMI</span>
  </div>
</div>
```

### V1 Reference HTML — Feed Check Sheet Wrapper

```html
<div style="display:flex;justify-content:space-between;margin-bottom:14px;">
  <div style="font-size:15px;font-weight:600;">Feed check</div>
  <button style="font-size:12px;color:var(--text2);background:none;border:none;cursor:pointer;font-family:inherit;" type="button">Cancel</button>
</div>
<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">🌿 Location Name · Group Names</div>
<div style="display:flex;gap:10px;margin-bottom:14px;">
  <div style="flex:1;">
    <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;">Date</label>
    <input type="date" value="2026-04-16" style="width:100%;padding:9px 10px;border:0.5px solid var(--border2);border-radius:8px;font-size:13px;background:var(--bg);box-sizing:border-box;font-family:inherit;">
  </div>
  <div style="flex:1;">
    <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;">Time</label>
    <input type="time" value="15:27" style="width:100%;padding:9px 10px;border:0.5px solid var(--border2);border-radius:8px;font-size:13px;background:var(--bg);box-sizing:border-box;font-family:inherit;">
  </div>
</div>
<!-- feed type cards go here -->
<button style="width:100%;padding:12px;font-size:14px;font-weight:600;border-radius:8px;border:none;background:var(--amber);color:white;cursor:pointer;font-family:inherit;" type="button">Save feed check</button>
```

## Implementation Notes

- Use the DOM builder (`el()`, `text()`, `clear()`) — no innerHTML
- All user-facing strings through `t()`
- **CRITICAL: Use the inline styles from the reference HTML above.** The v1 code uses inline styles for precise layout control. Replicate them exactly using the DOM builder's `style` property. Do not substitute with CSS classes unless the class already exists in v2's stylesheet and produces the identical visual result.
- Design tokens used: `var(--amber)`, `var(--amber-l)`, `var(--amber-d)`, `var(--text2)`, `var(--text3)`, `var(--border2)`, `var(--bg)`, `var(--radius)`
- Keep the existing save logic (FeedCheckEntity.create + add to store) — this spec only changes the UI layer

---
---

# Part 2: Deliver Feed Sheet — V1 Parity UI Rebuild

**File:** `src/features/feed/delivery.js`

---

## Problem

The v2 deliver feed sheet (`openDeliverFeedSheet`) has several differences from v1's "Log feeding" sheet:

1. **Batch picker** — v2 uses a plain list with `.selected` toggle. V1 shows batch cards with a radio circle (green checkmark when selected), grouped by feed type, with batch details (quantity, DM%, cost/unit) visible before selecting.
2. **Quantity stepper** — v2 has ±1 adjusters and a separate numeric input below the batch list. V1 shows the quantity stepper **inline under each selected batch card** — tap a batch to select it, the stepper appears right there with ±0.5 steps and live detail (as-fed weight, DM, cost).
3. **Multi-batch selection** — v1 supports selecting multiple batches simultaneously (each gets its own inline stepper). V2 selects only one batch at a time.
4. **Summary bar** — v1 shows a running "Feed DMI" + "Feed cost" summary that updates live. V2 has no summary.
5. **Header** — v1 shows `{location} — Log feeding` with group names + day count, plus a "Change" button when multiple events exist. V2 shows a generic title.
6. **Styling** — v1 uses green-accent selection (green border + green-light bg), matching the Feed identity. V2 uses generic picker styling.

## Goal

Rebuild `openDeliverFeedSheet` so it matches v1's "Log feeding" layout, interaction, and styling.

---

## V1 "Log Feeding" Sheet Layout (target)

Top to bottom:

### 1. Header
- **Title:** `{location display name} — Log feeding` (16px bold)
- **Subtitle:** `{group names} · Day {N}` (12px muted)
- **"Change" button** (right-aligned, outline, xs): only visible when multiple active events exist. Tapping returns to event picker step.

### 2. Date/Time row
Side by side (`.two` layout):
- **Date** input (defaults to today)
- **Time** input with "optional" label (defaults to current time HH:MM)

### 3. "Select feed" section
- **Heading:** "Select feed" (13px bold)
- **Hint:** "Tap a batch to add it, then set the quantity." (11px muted)

### 4. Batch cards grouped by feed type
Batches grouped by `feedType.name`, each group with an uppercase category header (11px, 600 weight, muted, letter-spacing 0.4px).

**Each batch card:**
- **Unselected state:** standard border (`var(--border)`), bg `var(--bg)`
- **Selected state:** green border (`var(--green)`), bg `var(--green-l)`)
- **Card body** (`.batch-sel` pattern): flex space-between, padding 9px 12px
  - Left: batch name (13px bold) + detail line (11px muted): `{remaining} {units} · {dm}% DM · ${cost}/{unit}`
  - Right: radio circle (`.chk`, 20×20, rounded): empty when unselected, green fill + white checkmark when selected
- **When selected — inline quantity row** appears below card body:
  - Green-light bg (`var(--green-l)`), green-light2 top border
  - `onclick="event.stopPropagation()"` (prevent toggling off when adjusting qty)
  - **Label:** "Quantity ({units})" (12px, green-dark, 500 weight)
  - **Stepper:** −0.5 button | quantity display | +0.5 button
    - Buttons: `.qty-btn` (32×32, border `var(--border2)`, rounded, bg `var(--green-l2)`)
    - Value: `.qty-val` (min-width 32px, centered, 15px bold)
  - **Detail line** (when qty > 0, 11px, green-dark, 0.8 opacity):
    - `{qty × weightPerUnit} lbs as-fed · {DM} lbs DM · ${cost}` (omit as-fed if no weightPerUnit; omit cost if no costPerUnit)

### 5. Summary bar
`.card-inset` with `.two` layout:
- Left: "Feed DMI" label (11px muted) + value (18px bold): `{total DM} lbs`
- Right: "Feed cost" label (11px muted) + value (18px bold, amber): `${total cost}`

Summary updates live whenever batch selection or quantity changes.

### 6. Button row
- **"Save feeding"** — green, full width (or flex 1)
- **"Cancel"** — outline

---

## Multi-Batch Selection Pattern

V1 supports multiple simultaneous batch selections via a toggle:

**`toggleBatch(batchId)`:**
- If batch already selected: remove from `selectedLines[]`
- If batch not selected: add `{ batchId, qty: 0 }` to `selectedLines[]`
- Re-render batch list (selection state changes, stepper appears/disappears)

**`adjQty(lineIdx, delta)`:**
- `selectedLines[lineIdx].qty = max(0, round(qty + delta, 1))`
- Default step: ±0.5 (whole-unit steps, not 0.1 like feed check)
- Re-render batch list + recalculate summary

---

## Summary Calculation

```
for each selected line with qty > 0:
  asFed = batch.weightPerUnitKg ? qty × batch.weightPerUnitKg × 2.20462 : qty
  dmi += asFed × (batch.dmPct / 100)
  cost += qty × (batch.costPerUnit || 0)
```

Display:
- DMI: `{Math.round(dmi).toLocaleString()} lbs`
- Cost: `$${cost.toFixed(2)}`

---

## Data Sources

| Field | Source |
|---|---|
| Batch list | `getAll('batches').filter(b => !b.archived && b.remaining > 0)` |
| Feed type name | `getById('feedTypes', batch.feedTypeId)?.name` — group header |
| Batch name | `batch.name` |
| Remaining | `batch.remaining` |
| Unit | `batch.unit` |
| DM% | `batch.dmPct` |
| Cost/unit | `batch.costPerUnit` |
| Weight/unit | `batch.weightPerUnitKg` — for as-fed and DM calculation |
| Event location name | From event's active paddock windows → location |
| Group names | From event's group windows → group names |
| Day count | Days between `evt.dateIn` and today |

---

## CSS Classes (match v1)

These classes should be added to `src/styles/main.css` or the feed feature styles:

```css
/* Batch selector card */
.batch-sel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 12px;
  background: var(--bg2);
  border-radius: var(--radius);
  cursor: pointer;
  border: 0.5px solid var(--border);
}
.batch-sel.on {
  border-color: var(--green);
  background: var(--green-l);
}

/* Radio circle */
.chk {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--border2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.batch-sel.on .chk {
  background: var(--green);
  border-color: var(--green);
}

/* Quantity stepper button */
.qty-btn {
  width: 32px;
  height: 32px;
  border: 0.5px solid var(--border2);
  border-radius: var(--radius);
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  font-family: inherit;
  flex-shrink: 0;
}

/* Quantity value */
.qty-val {
  min-width: 40px;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
}
```

---

## Event Picker Step (when multiple events)

V1 has a two-step flow:
1. **Step 1 — Event picker:** "Feed Animals" header, "Select which location you are feeding" hint, list of active events as cards. Auto-skipped if only one active event.
2. **Step 2 — Feed form:** The main UI described above.

V2 currently receives the event directly from the caller (dashboard passes it). The two-step picker is optional — if `openDeliverFeedSheet` is always called with a specific event, skip step 1. But the "Change" button should still work if multiple events exist: it closes the sheet and re-opens with event selection (or we add the step 1 picker inside the same sheet).

**Recommendation:** Keep the current pattern (event passed by caller). Add the "Change" button only if `getAll('events').filter(active).length > 1`, and on tap close + reopen with a picker, or show a simple inline event picker at the top.

---

## i18n Keys Needed

New keys (add to `feed` namespace in `en.json`):
- `feed.logFeeding` → "Log feeding"
- `feed.selectFeedHeading` → "Select feed"
- `feed.selectFeedHint` → "Tap a batch to add it, then set the quantity."
- `feed.feedDMI` → "Feed DMI"
- `feed.feedCost` → "Feed cost"
- `feed.saveFeeding` → "Save feeding"
- `feed.changeEvent` → "Change"
- `feed.quantity` → "Quantity"
- `feed.noBatchesOnHand` → "No feed batches on hand — add inventory first."

---

## Acceptance Criteria

- [ ] Header shows `{location} — Log feeding` with group names + day count
- [ ] "Change" button appears only when multiple active events exist
- [ ] Batches grouped by feed type with uppercase category headers
- [ ] Each batch card shows name, remaining qty, DM%, cost/unit
- [ ] Radio circle (green checkmark when selected)
- [ ] Selected card gets green border + green-light background
- [ ] Tapping a selected card deselects it (toggle behavior)
- [ ] Multiple batches can be selected simultaneously
- [ ] Inline quantity stepper appears under selected batch with ±0.5 steps
- [ ] Quantity stepper shows live detail line: as-fed weight, DM, cost
- [ ] Summary bar shows live-updating Feed DMI and Feed cost
- [ ] Feed cost value styled in amber
- [ ] "Save feeding" creates one `eventFeedEntries` record per selected batch with qty > 0
- [ ] Batch `remaining` decremented for each saved entry
- [ ] Date defaults to today, time defaults to current time
- [ ] Cancel closes sheet without saving
- [ ] Works on mobile — touch-friendly card selection and stepper

---

## V1 Reference HTML — Deliver Feed Batch Card (COPY THIS PATTERN)

**Unselected batch card:**
```html
<div style="border:0.5px solid var(--border);border-radius:var(--radius);margin-bottom:4px;overflow:hidden;background:var(--bg);">
  <div class="batch-sel" style="border:none;border-radius:0;background:transparent;margin:0;"
       onclick="toggleQFBatch(123)">
    <div>
      <div style="font-size:13px;font-weight:600;">Oak Field Barn</div>
      <div style="font-size:11px;color:var(--text2);">45.0 bales · 85% DM · $45.00/bale</div>
    </div>
    <div class="chk"></div>
  </div>
</div>
```

**Selected batch card with inline stepper (qty = 2):**
```html
<div style="border:0.5px solid var(--green);border-radius:var(--radius);margin-bottom:4px;overflow:hidden;background:var(--green-l);">
  <div class="batch-sel on" style="border:none;border-radius:0;background:transparent;margin:0;"
       onclick="toggleQFBatch(123)">
    <div>
      <div style="font-size:13px;font-weight:600;">Oak Field Barn</div>
      <div style="font-size:11px;color:var(--text2);">45.0 bales · 85% DM · $45.00/bale</div>
    </div>
    <div class="chk">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <polyline points="2,6 5,9 10,3" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  </div>
  <div style="padding:8px 10px 4px;background:var(--green-l);border-top:0.5px solid var(--green-l2);"
       onclick="event.stopPropagation()">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="flex:1;font-size:12px;color:var(--green-d);font-weight:500;">
        Quantity (bales)
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="qty-btn" style="background:var(--green-l2);">−</button>
        <span class="qty-val" style="min-width:32px;text-align:center;">2</span>
        <button class="qty-btn" style="background:var(--green-l2);">+</button>
      </div>
    </div>
    <div style="font-size:11px;color:var(--green-d);margin-top:3px;opacity:.8;">
      1,980 lbs as-fed · 1,683 lbs DM · $90.00
    </div>
  </div>
</div>
```

**Feed type group header:**
```html
<div style="font-size:11px;font-weight:600;color:var(--text2);margin:8px 0 4px;text-transform:uppercase;letter-spacing:.4px;">HAY</div>
```

### V1 Reference HTML — Summary Bar

```html
<div class="card-inset" style="margin-top:10px;">
  <div class="two">
    <div>
      <div style="font-size:11px;color:var(--text2);">Feed DMI</div>
      <div style="font-size:18px;font-weight:700;">1,683 lbs</div>
    </div>
    <div>
      <div style="font-size:11px;color:var(--text2);">Feed cost</div>
      <div style="font-size:18px;font-weight:700;color:var(--amber);">$90.00</div>
    </div>
  </div>
</div>
```

### V1 Reference HTML — Sheet Header

```html
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
  <div>
    <div style="font-size:16px;font-weight:600;">D — Log feeding</div>
    <div style="font-size:12px;color:var(--text2);">Bull Group · Day 24</div>
  </div>
  <button class="btn btn-outline btn-xs" style="display:block;">Change</button>
</div>
```

### V1 Reference HTML — Date/Time Row

```html
<div class="two" style="margin-bottom:10px;">
  <div class="field">
    <label>Date</label>
    <input type="date" value="2026-04-16"/>
  </div>
  <div class="field">
    <label>Time <span style="font-size:10px;color:var(--text2);">optional</span></label>
    <input type="time" value="16:04"/>
  </div>
</div>
```

### V1 Reference HTML — Button Row

```html
<div class="btn-row" style="margin-top:14px;">
  <button class="btn btn-green">Save feeding</button>
  <button class="btn btn-outline">Cancel</button>
</div>
```

## Implementation Notes

- Use DOM builder (`el()`, `text()`, `clear()`) — no innerHTML
- All user-facing strings through `t()`
- **CRITICAL: Use the inline styles and CSS classes from the reference HTML above.** Replicate them exactly using the DOM builder's `style` property and `className`. Do not invent new styling — copy the v1 patterns.
- The batch card + inline stepper pattern requires re-rendering the batch list on toggle/qty change (same as v1's `renderQFBatches()`)
- The `.batch-sel`, `.chk`, `.qty-btn`, `.qty-val`, `.card-inset`, `.two`, `.field`, `.btn-row` classes must exist in v2's CSS. If any are missing, add them with the exact CSS from the "CSS Classes" section above.
- Green design tokens: `var(--green)`, `var(--green-l)`, `var(--green-l2)`, `var(--green-d)`
- The stepper step is ±0.5 for deliver feed vs ±0.10 for feed check
- Keep existing save logic (FeedEntryEntity.create + add to store + batch remaining update)
