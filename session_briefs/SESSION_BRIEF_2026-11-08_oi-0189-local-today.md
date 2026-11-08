# SESSION_BRIEF — OI-0189 local-today date fix

**Generated:** 2026-11-08  
**Source:** GTHO Design session  
**Status:** Ready for GTHO Build

## What was decided

After 8 PM Eastern, `new Date().toISOString().slice(0, 10)` is already tomorrow because ISO strings are UTC. That inflates "Day N" labels and dashboard pasture % (`daysBetweenInclusive(..., todayStr)` then `dmiKgPerDay * days`). Live repro: Tim's K-5 card read "Day 2 · In May 8, 26" at 8:23 PM Eastern when animals went in that same local day; it should read "Day 1".

On 2026-11-08 Tim chose the June note's device-local calendar date, not the operation timezone field. Add `getLocalTodayStr()` to `src/utils/date-utils.js` as drafted:

```js
export function getLocalTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

Do not use `operations.timezone` for this item. Do not change `today(timezone)`'s existing default. Forms that already call `today()` with no timezone currently resolve as UTC and must use `getLocalTodayStr()`.

Dates are already stored as date-only strings in local-day semantics; this aligns runtime "today" with that convention. No schema change. No CP-55/CP-56 impact.

## What to build / change

- Add `getLocalTodayStr()` and unit tests in `tests/unit/utils/date-utils.test.js` covering midnight, noon, and 11:59 PM local across multiple timezone offsets (mock `Date`).
- Replace every `new Date().toISOString().slice(0, 10)` in `src/features/` with `getLocalTodayStr()`. As of 2026-11-08 that is 80 matches in 42 files (the June file list is stale).
- Also replace the same UTC-today default in:
  - `src/entities/batch-move.js` (`movedAt`)
  - `src/entities/batch-adjustment.js` (`adjustmentDate`)
- Switch these no-timezone `today()` callers to `getLocalTodayStr()`:
  - `src/features/animals/cull-sheet.js`
  - `src/features/events/feed-entry-inline-form.js`
  - `src/features/events/edit-feed-check.js`
- Include `daysSince`-style recovery / rest-period surfaces that currently take "today" from the UTC slice.

The 42 `src/features/` files as of 2026-11-08:

- `src/features/amendments/entry.js`
- `src/features/amendments/manure.js`
- `src/features/amendments/npk-prices.js`
- `src/features/amendments/soil-tests.js`
- `src/features/animals/cull-sheet.js`
- `src/features/animals/index.js`
- `src/features/dashboard/index.js`
- `src/features/dev-mode/audit.js`
- `src/features/dev-mode/audit-resolvers.js`
- `src/features/dev-mode/logs.js`
- `src/features/events/close.js`
- `src/features/events/detail.js`
- `src/features/events/dmi-chart-context.js`
- `src/features/events/edit-group-window.js`
- `src/features/events/edit-paddock-window.js`
- `src/features/events/group-windows.js`
- `src/features/events/index.js`
- `src/features/events/list-view/events-log.js`
- `src/features/events/mobile-events-screen.js`
- `src/features/events/move-feed-out.js`
- `src/features/events/move-wizard.js`
- `src/features/events/place-wizard.js`
- `src/features/events/retro-place.js`
- `src/features/events/rotation-calendar/calendar-grid.js`
- `src/features/events/submove.js`
- `src/features/feedback/index.js`
- `src/features/feed/batch-balances.js`
- `src/features/feed/check.js`
- `src/features/feed/delivery.js`
- `src/features/feed/index.js`
- `src/features/feed/quality.js`
- `src/features/field-mode/index.js`
- `src/features/harvest/index.js`
- `src/features/health/bcs.js`
- `src/features/health/breeding.js`
- `src/features/health/calving.js`
- `src/features/health/heat.js`
- `src/features/health/treatment.js`
- `src/features/health/weight.js`
- `src/features/locations/index.js`
- `src/features/reports/index.js`
- `src/features/surveys/index.js`

## Acceptance criteria

- `getLocalTodayStr()` exists in `src/utils/date-utils.js` with the unit tests above.
- Grep contract: `grep -rn "new Date().toISOString().slice(0, 10)" src/features/` returns 0 matches. `src/utils/` and test files are exempt.
- Live repro fixed: simulated 8:23 PM EDT on 2026-05-08 with `dateOpened = '2026-05-08'` — card reads "Day 1".
- Dashboard pasture-% regression: simulated late-evening local time produces the same value as simulated noon local time on the same day.
- `daysSince` / rest-period surfaces consume `getLocalTodayStr()` too.
- vitest green, lint clean on changed files.
- `PROJECT_CHANGELOG.md` gets a row (GTHO Build owns that file).

## Constraints and traps to avoid

- Do not replace or redefine `today(timezone)`. Add `getLocalTodayStr()` as the date-only local-today helper and use it for this sweep.
- Do not convert some other `Date` through `toISOString().slice(0, 10)` as part of this item. That is a different bug. Out of scope examples: weaning-date math in `src/calcs/core.js`, `dateAddDays` in `src/calcs/feed-forage.js`, and computed dates such as a projected calving date that are not "now as today".
- Location-card "~X days remaining" (`for3.fn({ availableDmKg, groupDmiKgPerDay })`) and instantaneous DMI demand are insulated — they do not use `todayStr`. Leave them alone.
- No schema change. Do not wire `operations.timezone` into this helper.
- No `innerHTML`. Scoped changes only. Follow `AGENTS.md`.

## References

- `OPEN_ITEMS.md` — OI-0189
- `PROJECT_STATUS.md` §4 decision log 2026-11-08 and §5 item 6
- Related: OI-0117 / OI-0133 (derive-on-read hygiene)

## Open questions for the implementer

- None. Tim locked device-local today on 2026-11-08.
