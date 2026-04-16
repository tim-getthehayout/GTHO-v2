# SESSION_BRIEF_2026-04-16 — DMI-8 Daily Breakdown Calc + Chart

## Context

The 3-day DMI chart on both the dashboard card (SP-3) and event detail sheet (SP-2) is currently a deferred placeholder. The chart needs a per-day DMI breakdown with a pasture vs stored feed split. The existing DMI calcs (DMI-1 through DMI-7) produce single values, not per-day breakdowns. DMI-8 composes them into the three-state output the chart needs.

## Read First

1. `V2_CALCULATION_SPEC.md` § DMI-8 — the full calc spec (added 2026-04-16)
2. `V2_CALCULATION_SPEC.md` § DMI-2, DMI-3, DMI-5, FOR-1 — the composites DMI-8 uses
3. `App Migration Project/SP-2_event-detail_mockup.html` — chart visual reference (§ DMI — Last 3 Days)
4. `github/issues/GH-11_dashboard-card-enrichment.md` § DMI — Last 3 Days — chart spec for dashboard card

## What to Build

### 1. Register DMI-8 calc

**File:** `src/calcs/feed-forage.js` (alongside DMI-1 through DMI-7)

Function signature:
```js
function dmi8DailyBreakdown({ event, date, groupWindows, feedEntries, feedChecks, feedCheckItems, paddockWindows, observations, forageTypes, locations }) → { status, totalDmiKg?, storedDmiKg?, pastureDmiKg? }
```

**Three output states:**

**`actual`** — a feed check brackets this date:
1. Compute `totalDmiKg` via DMI-3 (sum DMI-2 for each group window active on `date`)
2. Compute `storedDmiKg` via DMI-5 (interpolate between surrounding feed checks)
3. `pastureDmiKg = totalDmiKg - storedDmiKg` (mass balance, floor at 0)
4. Return `{ status: 'actual', totalDmiKg, storedDmiKg, pastureDmiKg }`

**`estimated`** — no check, but we have: (a) at least one prior day with an actual split, AND (b) a pre-graze observation with forage height + cover, AND (c) the paddock has a forage type set:
1. Compute initial pasture DM via FOR-1: `(height - residual) × dmPerUnit × area × (cover / 100) × (utilization / 100)`
   - `height`, `cover` from the pre-graze observation
   - `residual`, `dmPerUnit` (dm_kg_per_cm_per_ha), `utilization` from the forage type
   - `area` from the paddock/location
2. Walk forward day by day from `event.dateIn`:
   - For each day: if actual exists (feed check), pasture consumed = that day's `pastureDmiKg`. If no actual, pasture consumed = `min(totalDmiKg, remainingPastureDm)`.
   - Subtract each day's pasture consumed from running total.
3. For the target date: `remainingPastureDm` = initial - cumulative consumed through yesterday
   - If `remaining >= totalDmiKg` → `pastureDmiKg = totalDmiKg`, `storedDmiKg = 0`
   - If `0 < remaining < totalDmiKg` → `pastureDmiKg = remaining`, `storedDmiKg = totalDmiKg - remaining`
   - If `remaining <= 0` → `pastureDmiKg = 0`, `storedDmiKg = totalDmiKg`
4. Return `{ status: 'estimated', totalDmiKg, storedDmiKg, pastureDmiKg }`

**`needs_check`** — none of the above conditions met (e.g., first day on a new event with no check and no forage type):
1. Return `{ status: 'needs_check' }`

Register with `registerCalc('DMI-8', ...)` following the existing pattern.

### 2. Source event bridge

When the chart's 3-day window extends before `event.dateIn` and the event has `sourceEventId`:
- Query the source event's feed entries, checks, and observations
- Compute DMI-8 for those dates using the source event's data
- Render as `actual` bars (they have real feed check data from the prior event)
- If no `sourceEventId`, dates before `dateIn` are simply not rendered (chart shows fewer than 3 bars)

### 3. Forage type missing guard

If any paddock window's location has no forage type set:
- DMI-8 cannot compute the estimate path (no `dmPerUnit`)
- Return `needs_check` for that date
- **Chart UX:** Render an inline message below the grey bar: "Set forage type to enable pasture estimate" — tapping it opens the location edit sheet for that paddock. After save, the chart re-renders.
- This matches v1's pattern for the same situation in the move wizard.
- Use `ensureSheetDOM()` for the location edit sheet if called from dashboard or event detail.

### 4. Wire the chart in SP-2 (event detail sheet) and SP-3 (dashboard card)

**Event detail sheet** (`src/features/events/detail.js`):
- Replace the deferred DMI chart placeholder with a real render function
- Call DMI-8 for each of 3 dates (today, yesterday, day before)
- Render per the mockup: solid bars for actual, striped for estimated, grey for needs_check
- Subscribe to `event_feed_checks` and `event_feed_entries` so the chart re-renders when a check is recorded

**Dashboard card** (`src/features/dashboard/index.js`):
- Replace the DMI chart placeholder comment (lines ~1115-1117) with the same chart component
- Same 3 dates, same rendering
- The chart is smaller on the card — constrain height but same logic

**Shared chart component:** Extract the bar chart rendering into a shared function (e.g., `src/ui/dmi-chart.js`) so both the detail sheet and dashboard card use the same code. Inputs: array of 3 DMI-8 results + display options.

### 5. Tests

**Unit (`tests/unit/calcs/dmi-8.test.js`, new):**
- [ ] Returns `actual` when feed check brackets the date
- [ ] Returns `estimated` with correct declining pasture balance
- [ ] Example: 1.5 days pasture DM, day 1 actual 100% pasture → day 2 estimated 50/50
- [ ] Returns `needs_check` when no check and no forage type
- [ ] Returns `needs_check` when no check and no prior actual
- [ ] Source event bridge: dates before dateIn pull from source event
- [ ] `pastureDmiKg` floors at 0 (never negative)
- [ ] `storedDmiKg` fills gap when pasture runs out
- [ ] Multiple group windows: demand adjusts if group joined/left mid-window
- [ ] Forage type missing: returns `needs_check`

**Unit (`tests/unit/ui/dmi-chart.test.js`, new):**
- [ ] Renders 3 bars with correct states
- [ ] Actual bar is solid, two-color stack
- [ ] Estimated bar is striped with "(est.)" label
- [ ] Needs-check bar is grey with "Feed check needed"
- [ ] Forage type missing renders inline prompt

## Acceptance Criteria

- [ ] `registerCalc('DMI-8', ...)` registered in feed-forage.js
- [ ] Three-state output works correctly for all scenarios
- [ ] Source event bridge pulls prior event data
- [ ] Forage type missing shows inline prompt (not a crash)
- [ ] Chart renders on both dashboard card and event detail sheet
- [ ] Shared chart component (not duplicated rendering code)
- [ ] Chart re-renders on feed check or feed entry changes
- [ ] `npx vitest run` clean
- [ ] No `console.error` in feature code (use logger)

## Schema Impact

None. DMI-8 is a compute-on-read calc that uses existing data. No new columns or tables.

**CP-55/CP-56 impact:** None.

## Related

- OI-0069 — DMI-8 implementation tracking
- SP-2 (event detail sheet) — deferred chart placeholder
- SP-3 (dashboard card) — deferred chart placeholder
- FOR-1 (standing forage DM) — existing calc, used by DMI-8 for initial pasture estimate
