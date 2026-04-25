# OI-0137 — Backdated cull / calving / weight / split / group-weigh silently closes the group's open event_group_window

**Priority:** P0 (live data corruption bug class — reproduced on Tim's live DB 2026-04-22)
**Origin:** Full diagnosis + decisions in `OPEN_ITEMS.md` → OI-0137. This spec implements the five code fixes, two validator guards, one-row data repair, and grep contracts.
**Labels:** `bug`, `data-integrity`, `v2-build`

## Summary

Five code sites pass a user-supplied historical date as the `changeDate` argument to `maybeSplitForGroup` / `splitGroupWindow`. When the date is backdated before the group's currently-open window was joined, `getLiveWindowHeadCount(..., { now: historicalDate })` returns 0 memberships, `splitGroupWindow` silently delegates to `closeGroupWindow`, and the current open window is stamped closed with an impossible date (`date_left < date_joined`). The group then has no open window anywhere → `getGroupCurrentFarm()` returns null → the group is legitimately displayed as unplaced.

Fix: always pass today's date as `changeDate`. The historical date still flows to the entity row being recorded (membership close / calving record / weight record). Add validator guards on both window entities so this state is also unreachable via future regressions.

## Reproducer (live, 2026-04-22)

Cull of animal tag #11 (Cow-Calf Herd ewe) via the cull sheet with `cullDate=2025-08-30` (backdated eight months). Two DB rows written 14 ms apart:
- `animal_group_memberships` row → `date_left=2025-08-30, reason='cull'` (correct)
- `event_group_windows.7733d0f0` → `date_left=2025-08-30, head_count=0` (corrupt — window was joined 2026-04-21)

Result: Cow-Calf Herd had no open window anywhere, dashboard correctly hid it, group labeled "unplaced."

## Decisions (confirmed by Tim, 2026-04-22)

1. **Always use today's date for the group-window split changeDate.** Historical facts stay on the entity row only.
2. **Add validator guards** on `event-group-window` and `event-paddock-window` so `date_left < date_joined` (and `date_closed < date_opened`) are unreachable at save time.
3. **DELETE the corrupt window `7733d0f0-36ef-434c-b32f-e78315c25688`.** Tim already manually re-placed Cow-Calf in F-1 via window `faedbab2`; `7733d0f0` is pure garbage.

## Acceptance criteria

### Code — five call-site fixes

In every site below, the user-supplied date variable still flows to the entity row being recorded (membership `dateLeft`, calving record `calvedAt`, weight record `recordedAt`, etc.). Only the argument passed to `maybeSplitForGroup` / `splitGroupWindow` switches to today.

Use the same "today" expression every site already uses elsewhere: `const todayStr = new Date().toISOString().slice(0, 10);` (or reuse a local `todayStr` that's already in scope).

**1. `src/features/animals/cull-sheet.js:118-121` (in `confirmCull`)**

Current:
```js
const liveHead = getLiveWindowHeadCount({ ...gw, dateLeft: null }, { memberships, now: cullDate });
const liveAvg = getLiveWindowAvgWeight({ ...gw, dateLeft: null }, { memberships, animals, animalClasses, animalWeightRecords, now: cullDate });
splitResults.push(splitGroupWindow(groupId, gw.eventId, cullDate, null, {
  headCount: liveHead,
  avgWeightKg: liveAvg,
}));
```

Fix: declare `const todayStr = new Date().toISOString().slice(0, 10);` once at the top of the group-window loop, then replace all three `cullDate` → `todayStr` (the two `now:` args in the helper calls AND the third arg to `splitGroupWindow`). `cullDate` must remain on the membership close at line 101 (`{ dateLeft: cullDate, reason: 'cull' }`) and on the animal update at line 91 (`{ active: false, cullDate, ... }`).

**2. `src/features/health/calving.js:165`**

Current: `maybeSplitForGroup(calfGroupSelect.value, dateInput.value);`

Fix: `maybeSplitForGroup(calfGroupSelect.value, new Date().toISOString().slice(0, 10));`

`dateInput.value` must remain on the membership `dateJoined` at line 159 and on `calvedAt` construction earlier in the handler.

**3. `src/features/health/weight.js:74`**

Current: `maybeSplitForGroup(m.groupId, dateInput.value);`

Fix: declare `const todayStr = new Date().toISOString().slice(0, 10);` once above the loop and pass `todayStr`. `dateInput.value` must remain on the `recordedAt` at line 63.

**4. `src/features/animals/index.js:782-783` (split-group sheet Save handler)**

Current:
```js
maybeSplitForGroup(group.id, date);
maybeSplitForGroup(targetGroupId, date);
```
where `const date = dateInput.value || todayStr;` is declared at line 759.

Fix: pass `todayStr` to both calls. `date` must remain on the membership `dateLeft` / `dateJoined` writes at lines 776-777. The existing `todayStr` local is already in scope near the top of the handler.

**5. `src/features/animals/index.js:1232` (group-weigh sheet Save handler)**

Current: `if (anyChange) maybeSplitForGroup(group.id, dateInput.value);`

Fix: `if (anyChange) maybeSplitForGroup(group.id, new Date().toISOString().slice(0, 10));`

`dateInput.value` must remain on the weight record `date` at line 1227.

### Code — two validator guards

**6. `src/entities/event-group-window.js` validate()**

After the existing `dateJoined` required check (line 40), add:
```js
if (record.dateLeft && record.dateJoined && record.dateLeft < record.dateJoined) {
  errors.push('dateLeft must be on or after dateJoined');
}
```

Lexicographic ISO-date compare is correct (YYYY-MM-DD strings compare chronologically).

**7. `src/entities/event-paddock-window.js` validate()**

After the existing `dateOpened` required check, add parity guard:
```js
if (record.dateClosed && record.dateOpened && record.dateClosed < record.dateOpened) {
  errors.push('dateClosed must be on or after dateOpened');
}
```

### Live-data repair

**8. Delete the corrupt row on Tim's live DB.**

```sql
DELETE FROM event_group_windows WHERE id = '7733d0f0-36ef-434c-b32f-e78315c25688';
```

Verify: the row is gone, `faedbab2` remains as the only open window for Cow-Calf Herd on event `38cb666e`, and the group's farm derivation returns F-1 correctly.

Execute via Supabase MCP and report the verify query result in the commit message.

### Unit tests

**9. `tests/unit/entities/event-group-window.test.js`**

Add two cases to the existing validate() describe block:
- `date_left before date_joined` → validate returns `{ valid: false, errors: [...'dateLeft must be on or after dateJoined'] }`
- `date_left equal to date_joined` → valid (same-day open-and-close is legal)

**10. `tests/unit/entities/event-paddock-window.test.js`**

Parallel cases for `dateClosed`/`dateOpened`.

**11. `tests/unit/features/animals/cull-sheet.test.js`** (or wherever `confirmCull` has a test)

Add a regression test: seed one group with an open `event_group_window` joined today, seed one animal in it, seed a second animal also in it, call `confirmCull({ animal: secondAnimal, cullDate: '2025-08-30', ... })`. Assert:
- The open window's `date_left` stays null (window still open)
- A NEW window was opened with `dateJoined = today` and `headCount = 1` (the remaining animal)
- The culled membership has `dateLeft = '2025-08-30'` (historical date preserved on the entity row)

**12. `tests/unit/features/health/calving.test.js`** and **`tests/unit/features/health/weight.test.js`**

Analogous regression tests: backdate the event, assert the open window's `dateLeft` is not stamped with the backdated date.

### Grep contracts (post-commit check)

Add these to the architecture-audit sweep (`scripts/audit.sh` if it exists, or document in CLAUDE.md under Known Traps):

```bash
# No callsite should pass cullDate / calvingDate / weighDate / dateInput.value as the
# third arg to split/close/maybeSplit. Always today's date.
grep -rnE "maybeSplitForGroup\([^,]+, (cullDate|calvingDate|weighDate|dateInput\.value|date[^A-Z])" src/features/
grep -rnE "splitGroupWindow\([^,]+, [^,]+, (cullDate|calvingDate|weighDate|dateInput\.value)" src/features/
grep -rnE "closeGroupWindow\([^,]+, [^,]+, (cullDate|calvingDate|weighDate|dateInput\.value)" src/features/
# Each must return 0 matches.
```

## Files to edit

- `src/features/animals/cull-sheet.js` — fix 1
- `src/features/health/calving.js` — fix 2
- `src/features/health/weight.js` — fix 3
- `src/features/animals/index.js` — fixes 4, 5
- `src/entities/event-group-window.js` — fix 6
- `src/entities/event-paddock-window.js` — fix 7
- `tests/unit/entities/event-group-window.test.js` — test 9
- `tests/unit/entities/event-paddock-window.test.js` — test 10
- `tests/unit/features/animals/cull-sheet.test.js` — test 11
- `tests/unit/features/health/calving.test.js` — test 12a
- `tests/unit/features/health/weight.test.js` — test 12b

## Live DB repair

- Execute `DELETE FROM event_group_windows WHERE id = '7733d0f0-36ef-434c-b32f-e78315c25688';` via Supabase MCP.
- Verify: `SELECT id, date_joined, date_left FROM event_group_windows WHERE group_id = 'bc5f02fd-cd7b-4304-b3b6-6a1107056386' AND date_left IS NULL;` → should return one row, `faedbab2`.
- Report both the DELETE row-count and the verify result in the commit message.

## Not in scope

- No schema change. No migration file needed.
- No change to `splitGroupWindow` / `closeGroupWindow` / `maybeSplitForGroup` signatures in `store.js`. The helpers are correct; the callers were wrong.
- No rewrite of historical event windows. Past event windows that closed with backdated dates from prior culls are knowingly left as-is per Tim's call ("retroactively adjusting every event window from the past is a nightmare and high risk").
- CP-55 / CP-56 impact: none. No schema change, no shape change.

## Checklist for Claude Code

- [ ] All five code fixes landed, each verified via git diff that `cullDate` / `calvingDate` / `weighDate` / `dateInput.value` / `date` local flows to the entity row but NOT to the split call
- [ ] Both validator guards landed on `event-group-window` and `event-paddock-window`
- [ ] Grep contracts all return 0 matches from `src/features/`
- [ ] Unit tests pass: `npx vitest run tests/unit/entities/event-group-window.test.js tests/unit/entities/event-paddock-window.test.js tests/unit/features/animals/cull-sheet.test.js tests/unit/features/health/calving.test.js tests/unit/features/health/weight.test.js`
- [ ] Full test suite passes: `npx vitest run`
- [ ] Live-data DELETE executed via Supabase MCP and verified
- [ ] OPEN_ITEMS.md OI-0137 flipped to closed with commit hash and test counts in same commit (orphan-flip rule)
- [ ] Piggyback sweep: grep OPEN_ITEMS.md for any sibling OI that references cull-sheet, calving, weight, or `maybeSplitForGroup` — flip any now-moot entries in the same commit
- [ ] PROJECT_CHANGELOG.md row added
- [ ] TASKS.md updated if this OI was tracked there
- [ ] GitHub issue closed with `gh issue close {N} --comment "Completed in commit {hash}. All acceptance criteria met, {N} tests passing. Live-data DELETE executed on operation ef11ee62."`
