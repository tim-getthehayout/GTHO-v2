# OI-0139 — Feed-check sheet prefill ignores deliveries timestamped after the most-recent feed check; same flaw in `getLiveRemainingForMove`

**Priority:** P0 (live field-data confusion — reproduced on Tim's live DB 2026-04-30)
**Origin:** Full diagnosis + decisions in `OPEN_ITEMS.md` → OI-0139. This spec implements the two formula fixes, six unit-test cases per consumer, one e2e Supabase round-trip test, and the optional structural cleanup.
**Labels:** `bug`, `data-integrity`, `feed`, `v2-build`

## Summary

Two consumers compute "live remaining feed per (batchId, locationId)" with the same flawed formula: when a prior feed check exists for the pair, both override their seeded delivery total with the most-recent check's `remaining_quantity` **without adding deliveries timestamped after the check**. As a result, a fresh bale delivered after a "0 remaining" check disappears from:

1. The next feed-check sheet's prefill (units stepper reads 0 instead of the new bale's quantity).
2. `getLiveRemainingForMove(eventId)` — used by move-wizard Step 3 transfer/residual amount and the sub-move close display hint. Any rotation closing on top of a stale check silently under-transfers the destination event and over-anchors the source close-reading.

Fix: per `(batchId, locationId)`, live-remaining = `lastCheck.remainingQuantity + Σ deliveries with (date, time) strictly > last check's (date, time)`. Fall back to `Σ all deliveries` when no prior check exists. Strict `>` so a same-instant delivery is captured *by* the check, not double-counted.

## Reproducer (live, 2026-04-30, project `sxkmultsfsmfcijvsauf`)

Pasture D event `52bca23d-5f10-4214-a0a0-804f57a29f3c`, batch `bef27752-9bf8-447f-8f6f-c4828544f73d`, location `a334f135-68c7-4498-b9e6-f55895aaa56a`:

- `event_feed_entries`: 2026-04-16 qty=1 (`cda3051f`), **2026-04-29 15:02 qty=1** (`48735447`).
- `event_feed_check_items.remaining_quantity` history (most recent first): 2026-04-28 13:51 → **0**, 2026-04-24 11:33 → 0.40, 2026-04-20 15:09 → 0.70, 2026-04-18 10:30 → 0.80, 2026-04-16 13:19 → 0.85.

Correct live-remaining today = `0 + 1 = 1 bale`. Current code prefills 0.

The §8 Feed Entries card on the event detail correctly shows two delivery rows — that's working. The bug is purely in the prefill formula and in the helper that backs the move surfaces.

## Decisions (confirmed by Tim, 2026-04-30)

1. **Code-only fix. No data repair.** The 2026-04-28 reading of 0 is a legitimate observation (the feeder really was empty at 13:51 that day); the 2026-04-29 delivery is a legitimate fact. Combining them was wrong. Ship the formula fix and the next render reads 1 — no SQL, no row mutation.
2. **No schema change. No migration. No CP-55/CP-56 impact.** `event_feed_entries.date/time` and `event_feed_check_items` already carry the timestamps the fix needs.
3. **Strict `>` timestamp rule.** A delivery saved at the exact same `(date, time)` as the latest check is treated as captured *by* the check, not in addition to it. Prevents double-count when a farmer takes a check and logs a delivery in the same minute.
4. **Lift the formula into `getLiveRemainingForMove` and have `feed/check.js` consume the helper** instead of computing its own per-line remaining. Single source of truth across the feed-check sheet, move-wizard Step 3, and sub-move close display hint. Required, not optional — the duplication is what caused the regression to ship.

## Acceptance criteria

### Code — `src/calcs/feed-state.js` (fix the helper first; the sheet will consume it)

Replace `getLiveRemainingForMove`'s "override with last check" loop with the post-check-delivery rule. Probable shape (Claude Code may refactor freely as long as the contract holds):

```js
export function getLiveRemainingForMove(eventId) {
  const feedEntries = getAll('eventFeedEntries').filter(e => e.eventId === eventId);
  const allChecks = getAll('eventFeedChecks')
    .filter(fc => fc.eventId === eventId)
    .sort((a, b) => {
      const ad = `${a.date}T${a.time || '00:00'}`;
      const bd = `${b.date}T${b.time || '00:00'}`;
      return bd.localeCompare(ad); // most recent first
    });
  const checkItems = getAll('eventFeedCheckItems');

  // 1. Seed every (batch, location) pair with the lifetime delivery sum.
  const result = {};
  for (const e of feedEntries) {
    const key = `${e.batchId}|${e.locationId}`;
    result[key] = (result[key] ?? 0) + (Number(e.quantity) || 0);
  }

  // 2. For every pair that has at least one check, override the seed with
  //    `latestCheck.remainingQuantity + Σ deliveries strictly after the check timestamp`.
  const seen = new Set();
  for (const fc of allChecks) {
    const fcStamp = `${fc.date}T${fc.time || '00:00'}`;
    const items = checkItems.filter(ci => ci.feedCheckId === fc.id);
    for (const ci of items) {
      const key = `${ci.batchId}|${ci.locationId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const postCheckDeliveries = feedEntries
        .filter(e => e.batchId === ci.batchId && e.locationId === ci.locationId)
        .filter(e => `${e.date}T${e.time || '00:00'}` > fcStamp)
        .reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
      result[key] = (Number(ci.remainingQuantity) || 0) + postCheckDeliveries;
    }
  }
  return result;
}
```

The strict `>` comparison is the load-bearing rule. **Do not** use `>=` or the same-instant delivery double-count case will regress.

### Code — `src/features/feed/check.js` (consume the helper)

Replace the per-line `remaining` computation in `openFeedCheckSheet` (currently `src/features/feed/check.js:84-87`) with a call to `getLiveRemainingForMove(evt.id)`:

```js
import { getLiveRemainingForMove } from '../../calcs/feed-state.js';
// …
const liveRemaining = getLiveRemainingForMove(evt.id);

const items = Object.entries(groups).map(([key, group]) => {
  const batch = getById('batches', group.batchId);
  // …
  const startedUnits = group.totalDelivered;
  const lastItem = lastCheckItems.find(i => i.batchId === group.batchId && i.locationId === group.locationId);
  const lastCheckUnits = lastItem ? lastItem.remainingQuantity : null;
  const remaining = liveRemaining[key] ?? startedUnits;   // ← consumes the helper
  // …
});
```

Notes:
- `lastCheckUnits` is still computed for the "Last check: X (Day HH:MM)" info-line render at lines 182-186 — that's reporting the prior reading, *not* the prefill, and that string stays useful.
- `startedUnits` (lifetime delivery sum) remains the **upper bound** on the units stepper. Keep the existing `max` attribute on the units input and the `Math.min(item.startedUnits, ...)` clamps in `fcAdj`, `fcUnitsChanged`, `fcPctChanged`, `fcSliderChanged`.
- The "Consumed" banner math (`item.startedUnits - item.remaining`) continues to work correctly because both sides reflect the new prefill value.

### Unit tests

**`tests/unit/calcs/feed-state.test.js`** (new, or extend an existing file covering `getLiveRemainingForMove`).

Five cases per pair, asserted on the helper's return shape `{ "${batchId}|${locationId}": number }`:

| # | Setup | Expected `result['${batch}|${loc}']` |
|---|-------|--------------------------------------|
| 1 | One delivery qty=1, no prior check | `1` (lifetime delivery seed, unchanged) |
| 2 | One delivery qty=1, one check at 0.5, no post-check delivery | `0.5` (existing OI-0135 path, must not regress) |
| 3 | One check at 0 (date=2026-04-28 13:51) + one delivery qty=1 (date=2026-04-29 15:02) | `1` (the Pasture D case — `0 + 1`) |
| 4 | Two checks (prior 0.85 at 04-16, latest 0 at 04-28) + one delivery qty=1 between them (04-20) + one delivery qty=1 after the latest (04-29) | `1` (only post-*latest*-check deliveries are added) |
| 5 | One check at 0.5 (date=2026-04-28 13:51) + one delivery qty=1 at the exact same `(date, time)` (date=2026-04-28 13:51) | `0.5` (strict-`>` rule; same-instant delivery is captured by the check) |
| 6 | One check at 0.3 + one delivery qty=1 with `time: null` dated strictly after the check's date | `1.3` (null time coerced to `00:00`; date comparison alone clears strict-`>`) |

**`tests/unit/features/feed/feed-check-prefill.test.js`** (new, or extend existing feed-check coverage).

Same six cases, but asserted at the sheet level: open `openFeedCheckSheet(evt, operationId)` against a seeded store, find the units stepper input by selector, and assert its `value` matches the expected prefill. Use the existing test scaffolding pattern (cf. `tests/unit/features/feed/feed-check-save.test.js` if present per OI-0103 — pattern reference).

### E2E test — Supabase round-trip

**`tests/e2e/feed-check-post-delivery-prefill.spec.js`** (new). Per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI":

1. Scaffold an event with one batch + one location.
2. Save a feed check with `remaining_quantity = 0` (UI path).
3. Save a delivery dated the next day, qty=1 (UI path).
4. Open the feed-check sheet on the event.
5. Assert the units stepper input value === `1` (the post-check delivery).
6. Save the new feed check (accepting the prefill).
7. Query Supabase: `SELECT remaining_quantity FROM event_feed_check_items WHERE feed_check_id = $newId AND batch_id = $batchId AND location_id = $locationId` — assert one row with `remaining_quantity = 1`.

The Supabase query in step 7 is the load-bearing assertion — UI-only e2e was the gap that let OI-0050 + OI-0103 ship broken.

### Grep contract (post-commit check)

```bash
# Feed-check sheet must NOT compute its own per-line remaining anymore — must consume the helper.
grep -nE "lastCheckUnits != null \?" src/features/feed/check.js
# Expect: 0 matches (the old formula is gone).

# Helper must use strict-greater on the timestamp comparison, not >= or no comparison.
grep -nE "\.localeCompare\(fcStamp\)|> fcStamp|>= fcStamp" src/calcs/feed-state.js
# Expect: at least one strict-`>` match. No `>=` matches.
```

Document this in CLAUDE.md §"Architecture Audit — Before Every Commit" §6 (pure-insert / pure-derive flow invariants) under a new bullet for "live-remaining consumers."

## Files to edit

- `src/calcs/feed-state.js` — `getLiveRemainingForMove` rewrite
- `src/features/feed/check.js` — consume the helper instead of duplicating the formula
- `tests/unit/calcs/feed-state.test.js` — six new cases (new file or extend)
- `tests/unit/features/feed/feed-check-prefill.test.js` — six new cases (new file or extend)
- `tests/e2e/feed-check-post-delivery-prefill.spec.js` — new e2e

## Not in scope

- **No data repair.** No SQL, no row mutation. Code-only fix; the historical 04-28 check at 0 stays correct.
- **No schema change. No migration. No CP-55/CP-56 impact.**
- **No change to `event_feed_entries` or `event_feed_check_items` writers.** They are correct — the bug is at *read time* in two consumers.
- **No move-wizard or sub-move-close UI changes** — they consume `getLiveRemainingForMove`, so fixing the helper fixes them automatically. Cover their consumption with the helper-level unit tests; no separate UI test required for those surfaces.

## Checklist for Claude Code

- [ ] `getLiveRemainingForMove` rewritten in `src/calcs/feed-state.js`; uses strict `>` timestamp comparison; six unit tests pass
- [ ] `src/features/feed/check.js` `openFeedCheckSheet` consumes `getLiveRemainingForMove` instead of computing its own per-line remaining; six prefill unit tests pass
- [ ] E2E test passes against live Supabase with round-trip assertion on `event_feed_check_items.remaining_quantity`
- [ ] Manual verification: on Tim's Pasture D event (`52bca23d-...`), reload the app and open the feed-check sheet — units stepper prefills at `1`, not `0`
- [ ] Manual verification: open the move wizard on a same-paired event with a 0-check + post-check delivery — Step 3 transfer-amount default reads the post-check delivery quantity, not 0
- [ ] Grep contract returns the expected 0 / non-zero counts
- [ ] Full test suite passes: `npx vitest run`
- [ ] OPEN_ITEMS.md OI-0139 flipped to closed with commit hash and test counts in the same commit (orphan-flip rule per CLAUDE.md §"OPEN_ITEMS.md Closure Discipline")
- [ ] Piggyback sweep: grep OPEN_ITEMS.md for sibling OIs referencing `feed-state`, `getLiveRemainingForMove`, or `feed/check.js` — flip any now-moot entries in the same commit. (Expected to be a no-op; OI-0135 already closed and this OI is its successor, not a sibling.)
- [ ] CLAUDE.md §"Architecture Audit" §6 extended with the new grep contract bullet
- [ ] PROJECT_CHANGELOG.md row added
- [ ] TASKS.md updated if this OI was tracked there
- [ ] GitHub issue closed with `gh issue close {N} --comment "Completed in commit {hash}. All acceptance criteria met, {N} tests passing. Pasture D feed-check prefill verified at 1 (was 0)."`
