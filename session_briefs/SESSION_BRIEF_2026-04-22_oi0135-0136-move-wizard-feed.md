# SESSION BRIEF — 2026-04-22 — OI-0135 + OI-0136 move-wizard feed handling

**Handoff:** Cowork → Claude Code
**Repo:** `GTHO-v2`
**Branch:** `main` (single branch)
**Priority:** P0 — blocks continued field testing. Every stored-feed move produces corrupt downstream data until fixed.

---

## Why this matters

Tim's 4/21 E-3 → F-1 move didn't prompt a feed check. Investigating his Supabase data uncovered two defects that together corrupt feed state on every rotation move carrying stored feed:

1. **OI-0135** — move-wizard transfers **original delivery total** forward, not live-remaining. Tim's G-1 had three feed checks showing 0.5 bale remaining; the 4/20 G→E move transferred 1 bale to E-3. DMI-8 now reads E-3 as having 1 bale when it physically had 0.5.
2. **OI-0136** — move-wizard "Leave as residual" silently auto-stamps without a verify prompt. Sub-move close (OI-0119) forces a required input; full-event move is asymmetrically silent.

Ship both in one session. OI-0135 first (helper + wiring), then OI-0136 (input layered on top).

---

## OPEN_ITEMS changes

All entries land in `OPEN_ITEMS.md` in the same commit as the code:

- Add **OI-0135** status `open — ready for implementation` → flip to `shipped in commit {hash}` once Part 1 of this brief lands.
- Add **OI-0136** status `open — ready for implementation` → flip to `shipped in commit {hash}` once Part 2 lands.
- If shipping as one bundle, use the same commit hash for both.

Both already exist in OPEN_ITEMS.md — Claude Code just flips the status line per the orphan-flip belt-and-braces rule.

Piggyback sweep at commit time: grep OPEN_ITEMS.md for `move-wizard`, `feed transfer`, `residual`, `feed check`, `event_feed_check_items`, `event_feed_entries`. Any OI whose fix rides along with this one: close in the same commit with a "piggyback of OI-0135/OI-0136" note.

Downstream-moot sweep: no migrations shipping, no table/column drops — no downstream-moot sweep needed.

---

## Part 1 — OI-0135 live-remaining helper

### Files to touch

- `src/features/events/move-wizard.js` — lines 411-498 (Step 3 render), lines 556-613 (Step 1 close-reading), lines 731-750 (Step 8 destination delivery)
- `src/calcs/feed-state.js` (**new**, optional) — if extracting `getLiveRemainingForMove` for reuse (recommended — sub-move close will benefit too)
- `src/features/events/submove.js` — lines 193-198 (display hint; not a bug-fix, a drift-prevention — make the "started: N" label read live-remaining so sub-move close and move-wizard use identical semantics)
- `tests/unit/move-wizard.test.js` — four new cases (see OI-0135 Acceptance Criteria)
- `tests/unit/feed-state.test.js` (**new**, if extracted)
- `tests/e2e/move-wizard-live-remaining.spec.js` (**new**) — Supabase round-trip

### Helper signature (from OI-0135 spec body)

```js
function getLiveRemainingForMove(eventId) {
  const feedEntries = getAll('eventFeedEntries').filter(e => e.eventId === eventId);
  const allChecks = getAll('eventFeedChecks')
    .filter(fc => fc.eventId === eventId)
    .sort((a, b) => {
      const ad = `${a.date}T${a.time || '00:00'}`;
      const bd = `${b.date}T${b.time || '00:00'}`;
      return bd.localeCompare(ad); // most recent first
    });
  const checkItems = getAll('eventFeedCheckItems');

  const result = {};
  for (const e of feedEntries) {
    const key = `${e.batchId}|${e.locationId}`;
    result[key] = (result[key] ?? 0) + (Number(e.quantity) ?? 0);
  }
  const seen = new Set();
  for (const fc of allChecks) {
    const items = checkItems.filter(ci => ci.feedCheckId === fc.id);
    for (const ci of items) {
      const key = `${ci.batchId}|${ci.locationId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result[key] = Number(ci.remainingQuantity) ?? 0;
    }
  }
  return result;
}
```

### Wiring

- Step 3 render (lines 421-427): replace `feedGroups[key].total += entry.quantity` loop with `const liveRemaining = getLiveRemainingForMove(sourceEvent.id);` and set `group.total = liveRemaining[key] ?? 0`.
- The "remaining: N unit" radio label (line 466) now reads the correct value.
- Step 1 write (line 588): `const remaining = choice === 'residual' ? group.total : 0;` stays as-is — `group.total` is now live-remaining.
- Step 8 destination delivery (line 744): `quantity: toggle.total,` stays as-is — `toggle.total` propagates from `group.total` via the transferToggles array.

### Live-data repair SQL (execute in same session, via Supabase MCP)

Run after the code fix lands so state matches what the corrected code would have written:

```sql
-- Correct E-3 event's inherited delivery from 1 bale to 0.5 bale (live-remaining at G-1 close).
UPDATE event_feed_entries
SET quantity = 0.5
WHERE id = '68c65baf-592e-4305-9d08-087624c97870';

-- Correct the close-reading on E-3 (fa16a58d) from remaining=1 to remaining=0.5.
UPDATE event_feed_check_items
SET remaining_quantity = 0.5
WHERE feed_check_id = '2aa102b9-871e-4a92-9359-fd5e08e98a80';
```

**Do NOT touch** the F-1 manual delivery row (`bd5204a0-209b-406d-9224-27c07ce78191`) — open question below.

### Open question (raise with Tim before committing Part 1 repair SQL)

The F-1 event has a manual delivery (`bd5204a0`, 1 bale Oak Field Barn, `source_event_id=NULL`, created 4/21 19:40 UTC, 29 min after the E→F move). Two interpretations:

(a) Fresh physical bale delivered to F-1 — leave as-is. Totally separate from the E-3 bale.
(b) Tim meant "Move" in the E→F wizard but the Residual-with-auto-stamp confused him, and this is a compensating manual entry for the bale that physically travelled. In that case the correct state is `event_feed_entries.id=bd5204a0 quantity=0.5 source_event_id=fa16a58d-5384…`, and the E-3 close-reading item `2aa102b9`'s `remaining_quantity` should be 0 (not 0.5), because the bale moved rather than staying residual.

Ask Tim before executing the repair. Default to (a) if no response.

---

## Part 2 — OI-0136 forced residual input

### Files to touch

- `src/features/events/move-wizard.js` — Step 3 render (lines 411-498), save handler (lines 526-546), Step 1 write path (lines 588-612)
- `src/i18n/locales/en.json` — two new keys: `event.feedTransferResidualAmountLabel` ("Amount remaining at {loc}"), `event.feedTransferResidualAmountBlocked` ("Record remaining for every residual-left feed before saving.")
- `tests/unit/move-wizard.test.js` — four new cases (blank / negative / valid / Move-no-input; see OI-0136 Acceptance Criteria)
- `tests/e2e/move-wizard-residual-input.spec.js` (**new**) — Supabase round-trip with corrected value

### UI shape

Per (batch, location) line card:

```
Oak Field Barn → G-1 — remaining: 0.5 bale
  ( ) Move to new paddock       (default)
  (•) Leave as residual
      Amount remaining at G-1: [ 0.5 ] bale   ← conditional, prefilled, required-if-residual
```

Conditional input:
- Renders only when `toggle.choice === 'residual'`
- `data-testid`: `move-wizard-residual-input-{batchId}-{locationId}` (parallel to sub-move close's `submove-close-feed-{batchId}-{locationId}`)
- Default value: `liveRemaining[key]` from OI-0135 helper
- Validation on Save: `value !== '' && !isNaN(Number(value)) && Number(value) >= 0`
- Switching radio Move ↔ Residual live-toggles the input visibility; switching back to Move discards any entered correction

Save handler: iterate all toggles, for each with `choice === 'residual'` validate the input; prepend aggregate error to `statusEl` and return before any write if any fail.

Write path (line 588): when `choice === 'residual'`, use `Number(input.value)` (the entered/confirmed value) rather than the helper's default.

---

## Code Quality Checks (per CLAUDE.md)

1. `npx vitest run` — all unit + new tests pass
2. No `innerHTML` with dynamic content added
3. No store call param-count regressions — add/update signatures unchanged
4. No hardcoded English — both new i18n keys in `en.json`
5. No new migration → no `BACKUP_MIGRATIONS` entry needed, no `schema_version` bump
6. Architecture audit: verify `getLiveRemainingForMove` lives in `src/calcs/feed-state.js` or local to `move-wizard.js` consistently; if extracted, export + import cleanly; no module-initialization side effects
7. Grep contract: `grep -rn "entry\.quantity" src/features/events/move-wizard.js` — should now only match in the helper's delivery-sum fallback loop, not in the Step 1 or Step 3 paths (those route through `liveRemaining[key]` now)

---

## Commit message format

Bundle into one commit if Part 1 + Part 2 ship together:

```
fix(move-wizard): use live-remaining + force residual input (OI-0135, OI-0136)

- Add getLiveRemainingForMove(eventId) helper resolving most-recent feed
  check per batch×location; delivery-sum fallback when no check exists.
- Wire into move-wizard Step 3 render label + Step 1 close-reading write
  + Step 8 destination delivery qty — all three sites now use
  live-remaining instead of original delivery total.
- Add required remaining-qty input under Residual radio choice,
  prefilled with live-remaining; block Save on blank/negative entries.
- Sub-move close display hint updated to read live-remaining for
  consistency with move-wizard label (submove.js:193-198).
- OPEN_ITEMS.md: OI-0135 + OI-0136 flipped to shipped.
- Live data repair: E-3 event_feed_entries qty 1→0.5, E-3 close-reading
  remaining_quantity 1→0.5 via Supabase MCP (F-1 manual delivery
  untouched pending Tim's clarification).

Tests: 4+4 unit cases, 2 e2e, all passing.
CP-55/CP-56 impact: none. Schema change: none.
```

If shipping separately, split per-OI with the same body structure.

---

## Acceptance criteria (combined — both OIs)

From OI-0135:
- [ ] Move-wizard Step 3 label reads "remaining: N unit" where N is live-remaining (most-recent check) when a check exists, delivery total when not
- [ ] Move choice writes `event_feed_entries.quantity = liveRemaining` on destination
- [ ] Residual choice writes `event_feed_check_items.remaining_quantity = liveRemaining` on close-reading (before OI-0136's override)
- [ ] Zero-remaining edge: radio still renders, no-op on data
- [ ] No prior check: falls back to delivery total
- [ ] 4 unit-test cases, 1 e2e
- [ ] Live-data repair SQL executed and verified (see Open Question first)

From OI-0136:
- [ ] Residual radio reveals required input prefilled with live-remaining
- [ ] Save blocked on blank / non-numeric / negative
- [ ] Entered value overrides the default on Supabase round-trip
- [ ] Move path has no input, no regression
- [ ] Live radio toggle reveals/hides input; toggling back discards correction
- [ ] 4 unit-test cases, 1 e2e

---

## Reconciliation check

At commit time, verify per the OPEN_ITEMS.md closure discipline rules:

1. **Orphan-flip belt-and-braces:** commit message references `OI-0135` and `OI-0136` → `git diff-tree --no-commit-id --name-only -r HEAD | grep OPEN_ITEMS.md` must return a match.
2. **Piggyback:** grep OPEN_ITEMS.md for siblings before committing; flip any now-moot OIs in the same commit.
3. **Downstream-moot:** N/A (no structural change).
4. **TASKS.md:** update if either OI is tracked there.
