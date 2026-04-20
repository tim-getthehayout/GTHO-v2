# DMI-8 cascade rewrite — fix empty 3-day chart bars (combined fix) (OI-0119)

**Added:** 2026-04-20
**Area:** v2-build / calcs / dashboard / event-detail / ui
**Priority:** P1 (live field-testing surface — chart is the primary data-density carrier on dashboard card and event detail; same silent field-name drift class as OI-0075 Bug 3)
**Thin pointer note:** full spec during UI sprint per CLAUDE.md §"Active Sprint." Reduce to a thin pointer referencing **V2_CALCULATION_SPEC.md §4.2 DMI-8** (rewritten with this OI) at sprint reconciliation. The base doc is the canonical spec; this file enumerates the implementation plan.

## What Tim is hitting

On the dashboard home (location cards G-1/G-3, D, B2/B-1) and on Event Detail's §3 DMI chart, the 3-day stacked bars render empty (`—` values, grey bars, no pasture/stored split) on active events that have real pre-graze observations, real animal placements, and in some cases real feed entries. Two screenshots captured 2026-04-20: three of three location cards with empty charts on events that have been open for 3–5 days. G-1/G-3 partially renders (legacy data path still works on one window), but D and B2 are fully grey.

## Three root causes — all present, all silent

### 1. Dead-table observation read (silent field-name drift, same class as OI-0075 Bug 3)

OI-0112 migrated every observation **writer** from `event_observations` → `paddock_observations` and zeroed the writers on the old table. DMI-8's chart-data **builders** were missed in that sweep. Four call sites still read the dead collection:

| File | Line | Code | Result |
|---|---|---|---|
| `src/features/dashboard/index.js` | 1348 | `getAll('eventObservations').filter(o => o.eventId === event.id)` | observations = `[]` on every post-OI-0112 event → FOR-1 gate fails → grey bar |
| `src/features/dashboard/index.js` | 1382 | same pattern in `getSrcCtx()` source-event bridge | source bridge always returns no observations → grey bar |
| `src/features/events/detail.js` | 432 | same pattern in `buildDmi8ChartData` | detail chart same failure mode |
| `src/features/events/detail.js` | 475 | same pattern in source-event bridge | detail source bridge same |

**Correct pattern** (already in use on the capacity line since OI-0075 Bug 3, and in detail.js §5 since OI-0107):

```js
const obs = getAll('paddockObservations')
  .filter(o => o.locationId === pw.locationId && o.type === 'open' && o.source === 'event')
  .sort((a, b) => (b.observedAt || '').localeCompare(a.observedAt || ''));
const preGraze = obs.find(o => o.sourceId === pw.id) || obs[0] || null;
```

### 2. `loc.areaHa` vs `loc.areaHectares` field-name drift in `detail.js` only

OI-0075 Bug 3 fixed this in `dashboard/index.js` at eight read sites by using `loc.areaHectares ?? loc.areaHa`. `detail.js:440` and `detail.js:480` (source-event bridge) were missed.

```js
// detail.js:440 — current (buggy)
locations[pw.locationId] = { areaHa: loc.areaHa };

// fix
locations[pw.locationId] = { areaHa: loc.areaHectares ?? loc.areaHa };
```

Result of the bug: `area_hectares` resolves to `undefined`, FOR-1 returns 0, pasture estimate path silently falls through.

### 3. Three logic gaps in DMI-8 itself

(a) **Feed entries ignored.** `src/calcs/feed-forage.js:539`:

```js
fn({ event, date, groupWindows, memberships, animals, animalWeightRecords,
     feedEntries: _feedEntries, feedChecks, feedCheckItems,
     paddockWindows, observations, ... })
```

The leading underscore on `_feedEntries` is the marker — intentionally unused. The estimated path derives `storedDmiKg` as the residual of pasture balance (`storedDmiKg = totalDmiKg - pastureDmiKg`), not from actual deliveries. Any event with stored feed deliveries but no bracketing feed checks shows either full pasture or full stored, never the realistic mix.

(b) **Actual path requires TWO bracketing feed checks.** `feed-forage.js:586-596` requires both `prevCheck` AND `nextCheck` covering the target date. Single-check case (the most common "today" scenario — one check exists, today is after the latest check) silently falls to needs_check / estimated.

(c) **No cascade model.** No representation of "pasture consumed first, stored consumed to fill the shortfall, deficit when both are exhausted."

## Why this is a combined rewrite, not three small fixes

The three bugs interact:

- Fixing the dead-table read alone un-greys bars but feeds the still-broken estimated path → wrong numbers.
- Fixing the single-check actual path alone forces a design decision about retroactive conversion (spoiler: stored should convert, pasture should not).
- Fixing the feed-entries inclusion alone leaves no cascade to decide which bucket the demand draws from first.

Per CLAUDE.md §"Fix Root Causes, Not Symptoms": three separate hotfixes deferring the cascade is the workaround. The root-cause path is one coherent model.

## The new DMI-8 model — cascade bucket walk

**Five statuses** per date (was three):

1. **`no_animals`** — `totalDmiKg <= 0`. Blank bar at bar height, `—` label, no CTA.
2. **`actual`** — feed check on or bracketing this date. Includes single-check projection (deliveries since check minus current remaining).
3. **`estimated`** — cascade walk seeds pasture from `FOR-1(pre-graze)` and stored from deliveries; allocates demand pasture-first.
4. **`needs_check`** — cascade can't run (rare legacy-data fallback).
5. **`no_pasture_data`** — pre-graze missing OR forage type missing. Inline CTA link.

**Cascade allocation per day** (preference: pasture → stored → deficit):

| Pasture remaining | Stored remaining | `pastureDmiKg` | `storedDmiKg` | `deficitKg` |
|---|---|---|---|---|
| `≥ demand` | any | `demand` | `0` | `0` |
| `0 < p < demand`, stored ≥ shortfall | `≥ (demand - p)` | `p` | `demand - p` | `0` |
| `0 < p < demand`, stored < shortfall | `< (demand - p)` | `p` | stored | `demand - p - stored` |
| `≤ 0` | `≥ demand` | `0` | `demand` | `0` |
| `≤ 0` | `< demand` | `0` | stored | `demand - stored` |

**Pasture bucket reset rules:**

- Event start: bucket = `FOR-1(pre-graze on primary paddock window)`.
- Sub-move open: bucket **adds** `FOR-1(new window's pre-graze)` (parallel sub-paddocks pool).
- Sub-move close: drop the closing window's attributable remainder.
- Feed check: pasture bucket NOT re-anchored (pre-graze too subjective).

**Stored bucket reset rules:**

- Event start: bucket = sum of deliveries on or before that date.
- Per delivery during walk: add the delivery's DM on its date.
- Feed check: re-anchor to `deliveries_since_check_start - sum(remaining)`.

**Retroactive actual-conversion (Tim chose Option A):**

When a feed check is added, the **prior interval's `storedDmiKg`** flips from `estimated` → `actual`. Pasture bars in that interval stay `estimated`. Implementation: DMI-8 is pure-functional; re-running it after a check insertion produces the converted output naturally.

**New sub-move close flow rule:**

When `event.hasStoredFeed` is true (any `event_feed_entries` row exists), the Sub-move Close sheet renders a required feed-check card inline and blocks Save until the farmer records remaining stored feed. This strikes a clean actual/estimated boundary at the close date. No pasture observation is forced (pasture observations are too subjective to be a useful boundary marker). No stored-feed close prompt as before.

**Source-event bridge — date-routing only (Tim's simplification):**

For each date in the 3-day chart window:

```js
const ownerEvent = (date < event.dateIn) && event.sourceEventId
  ? getById('events', event.sourceEventId)
  : event;
runDmi8(ownerEvent, date, ...);
```

No state handoff between events; each event's cascade is self-contained. **Trade-off accepted:** stored bales physically carried across the boundary do not appear on the new event's chart unless logged as a delivery on the new event. Matches v1 + v2 existing semantics. Future enhancement (carry-stored toggle at event start) captured but out of scope.

**Pre-graze partial default (Tim chose Option 3 — best-effort with "Fix" CTA):**

When a pre-graze observation has `forageHeightCm` but no `forageCoverPct`, default cover to **100%** for the cascade computation. Render a subtle "(assuming 100% cover — Fix)" inline hint with a link to edit the observation. Do NOT fall to `no_pasture_data`.

## Render additions for `src/ui/dmi-chart.js`

| Status | Bar | Label | CTA |
|---|---|---|---|
| `actual` | solid two-stack (green pasture / amber stored) | total, day label | none |
| `estimated` | striped two-stack (existing diagonal pattern) | total `(est.)`, day label | none |
| `estimated` with `deficitKg > 0` | striped two-stack + **red segment atop the stored stack** for deficit portion | total `(est.)` with `+X deficit` sub-label, day label | none |
| `needs_check` | grey short bar (existing), `—` value | "Feed check needed" | none |
| `no_pasture_data`, reason `'missing_observation'` | grey short bar, `—` value | "Add pre-graze" | inline link → Edit Paddock Window dialog (OI-0118) for the owning window |
| `no_pasture_data`, reason `'missing_forage_type'` | grey short bar, `—` value | "Set forage type" | inline link → Location edit sheet for the owning location |
| `no_animals` | blank space at bar height (no rendered bar), `—` value | day label only | none |

**Legend updates:** add red `■ deficit` swatch **only when** at least one bar in the 3-day window has `deficitKg > 0`. Always-on swatches remain `■ grazing` (green) and `■ stored` (amber).

## Files to change

### `src/calcs/feed-forage.js`

Full rewrite of DMI-8 (currently lines ~534–641). Implementation outline:

```js
fn({ event, date, groupWindows, memberships, animals, animalWeightRecords,
     feedEntries, feedChecks, feedCheckItems,    // <-- feedEntries no longer underscored
     paddockWindows, observations,
     forageTypes, locations, ... })
{
  // Step 0 — demand
  const totalDmiKg = computeDmi3(event, date, groupWindows, memberships, animals, animalWeightRecords);
  if (totalDmiKg <= 0) return { status: 'no_animals' };

  // Step 1 — open windows on this date
  const openWindows = paddockWindows.filter(pw =>
    pw.eventId === event.id && pw.dateOpened <= date && (!pw.dateClosed || pw.dateClosed > date)
  );
  if (openWindows.length === 0) return { status: 'no_animals' }; // edge case

  // Gate: forage type + observation per window
  for (const pw of openWindows) {
    const loc = locations.find(l => l.id === pw.locationId);
    if (!loc?.forageTypeId) return { status: 'no_pasture_data', reason: 'missing_forage_type' };
    const obs = pickPreGraze(observations, pw);
    if (!obs?.forageHeightCm) return { status: 'no_pasture_data', reason: 'missing_observation' };
  }

  // Step 2 — actual path
  const checkOnOrBracketing = findCheckCovering(feedChecks, feedCheckItems, date);
  if (checkOnOrBracketing) {
    const storedDmiKg = computeStoredViaCheck(checkOnOrBracketing, feedEntries, date);
    const pastureDmiKg = Math.max(totalDmiKg - storedDmiKg, 0);
    return { status: 'actual', totalDmiKg, storedDmiKg, pastureDmiKg, deficitKg: 0 };
  }

  // Step 3 — estimated cascade walk
  const cascade = walkCascade({
    event, date, openWindows, observations, locations, forageTypes,
    feedEntries, feedChecks, feedCheckItems, groupWindows, memberships,
    animals, animalWeightRecords,
  });
  if (!cascade) return { status: 'needs_check' };
  return { status: 'estimated', ...cascade };
}
```

`walkCascade` walks day by day from event start (or earlier if a sub-move opened before `date`), maintaining `remainingPastureDm` and `remainingStoredDm`, applying the allocation table on each day. Returns `{ totalDmiKg, pastureDmiKg, storedDmiKg, deficitKg }` for the target date.

Helper functions to add:

- `pickPreGraze(observations, pw)` — filter `paddockObservations` (passed in via the `observations` param — the calling code must pass paddockObservations, NOT eventObservations) by `locationId === pw.locationId && type === 'open' && source === 'event'`, prefer `sourceId === pw.id`, fall back to most-recent.
- `computeStoredViaCheck(check, feedEntries, date)` — DMI-5 interpolation with single-check projection fallback.
- `walkCascade(...)` — the cascade walker.

### `src/features/dashboard/index.js`

Lines 1336–1425. Two changes:

1. Migrate dead-table reads. Replace:
   ```js
   const chartObs = getAll('eventObservations').filter(o => o.eventId === event.id);
   ```
   with:
   ```js
   const chartObs = getAll('paddockObservations').filter(o =>
     o.type === 'open' && o.source === 'event'
   );
   ```
   (the per-window pick happens inside DMI-8 via `pickPreGraze`).

2. Migrate source-event bridge in `getSrcCtx()` (line ~1382). Replace the per-event call to a date-routing call: for each date in the 3-day window, choose `event` or `event.sourceEvent`, and call DMI-8 with that event's full context (windows, observations, feed entries, feed checks all scoped to that event).

### `src/features/events/detail.js`

Lines 389–538. Three changes:

1. Same dead-table → paddockObservations migration as dashboard.
2. Same date-routing source-event bridge as dashboard.
3. `loc.areaHa` → `loc.areaHectares ?? loc.areaHa` at lines 440 and 480 (sibling fix to OI-0075 Bug 3).

### `src/ui/dmi-chart.js`

Add three new render branches to the existing `for (const d of days)` loop:

- `r.status === 'no_animals'` → blank space at `barHeight`, `—` label.
- `r.status === 'no_pasture_data'` → grey short bar, distinct label per `r.reason`, inline CTA link via a new `opts.onNoPastureData(reason, pw)` callback.
- For `r.status === 'estimated'` with `r.deficitKg > 0` → render an additional red segment atop the amber stored segment.

Update the legend to conditionally add a red `■ deficit` swatch only when `days.some(d => d.result.deficitKg > 0)`.

### `src/features/events/submove.js`

In the `openSubmoveCloseSheet` flow, add:

```js
if (event.hasStoredFeed) {
  // Render a required feed-check card inline. Block Save until filled.
  // Same renderFeedCheckCard component used in Close Event flow.
}
```

Where `event.hasStoredFeed` = `getAll('eventFeedEntries').some(fe => fe.eventId === event.id)`.

### `src/features/events/close.js`

Audit only. Close Event already has feed-check-on-close behavior. Confirm no regression with the new DMI-8 retroactive conversion semantics.

### Tests

- `tests/unit/calcs/dmi-8.test.js` (new) — see Acceptance criteria below for the case list.
- `tests/unit/dashboard-dmi-chart.test.js` — update for the new render statuses; round-trip on the chart context builder.
- `tests/unit/detail-dmi-chart.test.js` — same.
- `tests/e2e/dmi-chart.spec.js` (new) — create event with pre-graze + groups → assert 3 bars with correct statuses → add a feed check → assert prior interval bar converts to `actual`. Per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI."

## Acceptance criteria

- [ ] Dashboard location cards G-1/G-3, D, B2/B-1 render non-empty 3-day charts for the active events (screenshot-reproducible).
- [ ] Event Detail §3 DMI chart renders non-empty 3-day bars on the same events.
- [ ] `getAll('eventObservations')` is not called from `dashboard/index.js` or `detail.js` chart builders (grep returns 0 outside any deprecated-collection fallback in sync-adapter).
- [ ] `loc.areaHa` without the `areaHectares` fallback is not referenced in the `detail.js` DMI-chart builder (grep).
- [ ] DMI-8 reads `feedEntries` (no leading underscore in the destructure); unit test covers delivered-stored contribution to the cascade.
- [ ] Actual-path single-check projection works (test: one check before today, assert today's bar renders `actual` not `estimated`).
- [ ] Cascade allocates demand pasture-first, stored-second, deficit-third (unit test walks a 4-day cascade through each row of the allocation table).
- [ ] A feed check retroactively converts the PRIOR interval's `storedDmiKg` bar from `estimated` → `actual` (test asserts status flip after check insertion); pasture bars in the same interval stay `estimated`.
- [ ] Sub-move open adds the new window's standing DM to the pasture bucket; sub-move close drops the closing window's attributable remainder.
- [ ] Sub-move Close sheet requires a feed check when the event has any stored-feed deliveries (unit + e2e test).
- [ ] Parallel sub-paddocks pool pasture correctly (unit test with 2 open sub-paddocks, assert pooled `initialPastureDm`).
- [ ] Source-event bridge routes pre-event-start days to the source event's own DMI-8 context (unit test).
- [ ] `no_animals`, `needs_check`, `no_pasture_data` are distinct statuses with distinct renders (unit tests on the chart renderer).
- [ ] Pre-graze partial (height present, cover missing) renders with 100% cover default and a "(Fix)" hint (unit test).
- [ ] Chart deficit days render with red top segment and `+X deficit` sub-label.
- [ ] Legend adds red deficit swatch only when at least one bar has deficit > 0.
- [ ] Full unit suite stays green; new cases added per the files-affected list above.
- [ ] PROJECT_CHANGELOG.md row added on commit.

## Architecture audit (per CLAUDE.md §"Architecture Audit — Before Every Commit")

- **Entity ↔ Schema:** no entity changes.
- **Shape round-trip:** no entity changes.
- **Store ↔ Entity:** no store changes.
- **Doc ↔ Code:** V2_CALCULATION_SPEC.md §4.2 DMI-8 is updated in this OI's commit (the calc spec is authoritative; not sprint-deferred).
- **Calc registry:** DMI-8 already registered. This is a fn body rewrite, not a registration change.
- **Pure-insert flow invariants:** sub-move close adds a feed-check card to the close sheet but does not change submove.js's `update('events'...)` invariant — the new write target is `event_feed_checks` + `event_feed_check_items`, both of which submove was already allowed to insert into via the close-sheet flow.
- **Derived-on-read invariants:** DMI-8 is compute-on-read. No new stored fields.

## Base doc impact (sprint reconciliation)

- **V2_CALCULATION_SPEC.md §4.2 DMI-8** — rewritten inline with this OI (this commit).
- **V2_UX_FLOWS.md §12 Sub-moves** — add forced-feed-check rule to sub-move close flow when stored feed present. Reconciliation.
- **V2_UX_FLOWS.md §17.7 Dashboard** — chart status set expands from 3 to 5 + deficit render. Reconciliation.
- **V2_UX_FLOWS.md §17.15 Event Detail** — same. Reconciliation.
- **UI_SPRINT_SPEC.md SP-3** — chart cascade behavior + new statuses. Reconciliation.

## CP-55/CP-56 impact: NONE

DMI-8 is compute-on-read. No new columns. The forced feed-check on sub-move close uses the existing `event_feed_checks` + `event_feed_check_items` pipeline (already in CP-55).

## Schema change: NONE

## Related

- **OI-0069** (closed with this OI) — original DMI-8 spec. Calc shipped per OI-0069 but the three latent bugs require this corrective rewrite per CLAUDE.md §"Corrections to Already-Built Code."
- **OI-0076** (closed — superseded) — "DMI Chart Empty Bars — Deferred Until Fresh V2 Test Data." Tim generated fresh data; the deferral hypothesis (v1-migration data incompleteness) was a minority contributor.
- **OI-0075 Bug 3** (precedent) — same "silent field-name drift" class. Same fix pattern. This OI applies the pattern to the DMI chart's observation read + the missed `detail.js` area-field site.
- **OI-0112** (shipped, orphan) — migrated observation writers to `paddock_observations`. The DMI-8 chart was the last unmigrated reader.
- **OI-0113** (pending — drop `event_observations` table) — this OI's fix is a prerequisite (last unmigrated reader).
- **OI-0118** (shipped) — pre-graze card reachability on closed windows. The `no_pasture_data` inline CTA links here.
- **OI-0070** (EST-1) — accuracy report. Unblocked for field testing once DMI-8 produces correct splits.

## Future work (captured, not in scope)

- **Carry-stored-from-prior-event toggle** at event start — surfaced if field testing shows missing stored feed on the first day of a new event after a physical bale carryover. New OI at that point.
