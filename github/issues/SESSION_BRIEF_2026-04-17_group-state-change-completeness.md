# Session Brief — Group State-Change Entry Point Completeness (Package 2)

**Date:** 2026-04-17
**Issues covered:** OI-0094 (primary), OI-0093 (secondary, independent but coordinated)
**Prerequisite:** OI-0091 + OI-0073 package must be shipped and merged. If `splitGroupWindow` / `closeGroupWindow` / `getLiveWindowHeadCount` / `getLiveWindowAvgWeight` are not present in the codebase, stop — package 1 has not landed yet. Run package 1 first.

## Why this package exists

After OI-0091's original three flows (cull, whole-group move, event close) were spec'd, a follow-up audit of every place in the codebase that can mutate a group's state mid-event found eleven more entry points. Every one of them generates the same class of stale-snapshot bug OI-0091 fixes for the three covered flows. OI-0094 closes those eleven holes. OI-0093 is a separate UI cleanup that happens to remove one of those eleven entry points (Animals bulk Move) entirely.

Both were split out of OI-0091 mid-flight because Claude Code was already executing package 1. Widening package 1 would have caused churn; running package 2 after package 1 lands keeps scope clean.

## OPEN_ITEMS changes

Apply these before starting implementation:

- **OI-0094** — mark `status` from `open — design note complete, ready for Claude Code` to `in progress — Claude Code implementing (package 2)` when you start.
- **OI-0093** — same transition.
- When both are done: close both OIs, link to the commit hashes, update the Change Log with a completion row.

## Implementation order

Five phases. Phase 5 closes both OIs.

### Phase 1 — Verify OI-0091 helpers are available (sanity check)

Before touching any entry point, grep the codebase to confirm package 1 landed:

```bash
grep -n "splitGroupWindow\|closeGroupWindow\|getLiveWindowHeadCount\|getLiveWindowAvgWeight" src/data/store.js src/utils/calc-helpers.js 2>/dev/null
```

If any of the four helpers is missing, stop and ask Tim. Package 1 must ship first.

### Phase 2 — Close the ten non-UI entry points in OI-0094

Work in this order (roughly simplest → most complex):

1. **`src/features/events/group-windows.js` — §7 Add group (entry #6)** — this is the simplest. On Add, open a new `event_group_window` with live values from the selected group. No prior window to split, so no `splitGroupWindow` call — just open with live head count + avg weight.
2. **`src/features/events/group-windows.js` — §7 Remove group (entry #7)** — replace the direct `update()` that closes the window with `closeGroupWindow(groupId, eventId, closeDate, closeTime)`.
3. **`src/features/events/edit-group-window.js` — Delete window (entry #9)** — no logic change, but add a confirm dialog: *"Delete this window? This removes the group's historical presence on this event. Use only to clean up mistakes."*
4. **`src/features/events/edit-group-window.js` — per-row Edit on OPEN windows (entry #8)** — implement the locked sub-decision. When `dateLeft === null`, render `headCount` / `avgWeightKg` as disabled labels showing `getLiveWindowHeadCount(gw)` / `getLiveWindowAvgWeight(gw)` values. Caption below both fields: *"System generated from live memberships. Use Cull, Move, or Reweigh to change."* When `dateLeft !== null`, keep current editable behavior.
5. **`src/features/health/calving.js` — calving (entry #5)** — after the new calf membership is added, call `splitGroupWindow` for the dam's group if that group is on an open event. This increments head count by 1 and recalculates avg weight with the calf included.
6. **`src/features/animals/index.js` — Edit Group checkboxes (entry #1)** — after each membership add/close, call `splitGroupWindow` for the affected group on its open event (if any).
7. **`src/features/animals/index.js` — Edit Animal group dropdown (entry #3)** — two groups affected: source (membership closed) and target (membership opened). Call `splitGroupWindow` for each on their respective open events.
8. **`src/features/animals/index.js` — Group Weights sheet (entry #4)** — after bulk weight updates, call `splitGroupWindow` for the group (head count unchanged, avg weight shifts). Only if the group is on an open event.
9. **`src/features/animals/index.js` — Split Group sheet (entry #2)** — source group's memberships close → `splitGroupWindow` for source; new group's memberships open → if the new group is also on an open event (rare but possible if split target is an existing group), `splitGroupWindow` for target too.
10. **`src/features/events/reopen-event.js` — Event reopen (entry #10)** — for each window that was closed by the event-close flow on `date_out`, apply this logic: if the group has not since moved or been culled, reopen the window (clear `dateLeft` / `timeLeft`); otherwise keep closed. Surface a summary dialog before commit: *"N group windows will be reopened. M stay closed because the group has since left."* Require explicit confirm.

For each of the ten: add a unit test in the matching `tests/unit/*.test.js` file verifying the helper is called with the right arguments after the mutation.

### Phase 3 — OI-0093 UI cleanup (can run in parallel with Phase 2)

- Delete `#animals-action-bar` DOM, `renderActionBar()`, `selectedAnimals` Set + click handlers, checkbox column in animal rows.
- Grep for `openAnimalMoveSheet`. If only called from the bulk bar, delete function + its sheet DOM. If called elsewhere, rewire callers.
- Rewrite Edit Animal group dropdown (`src/features/animals/index.js:1104`) to use the v2 picker pattern — reference Deliver Feed batch picker or Move wizard group picker for the pattern. Check `V2_DESIGN_SYSTEM.md` for tokens.
- Update `tests/unit/animals.test.js` — drop bulk-flow tests, add picker tests.
- After Phase 3 lands, remove entry point #11 from OI-0094's scope (it no longer exists).

### Phase 4 — E2E test

Add `tests/e2e/group-state-change-completeness.spec.js` with representative flows:

- Add an animal to a group via Edit Group sheet → event detail §7 head count increases by 1; dashboard card matches.
- Add a calf via calving flow → same check.
- §7 Add group → new row appears in §7 with live head count; dashboard card shows the group.
- §7 Remove group → row disappears from §7 on next refresh; window is closed in Supabase with live stamped values.
- Event reopen → summary dialog renders with expected counts; reopened windows have `dateLeft === null`; windows for groups that have since left stay closed.
- Edit Animal dialog group change → source group card decrements, target group card increments; both dashboard + §7 match.

Verify each write hits Supabase (not just localStorage) per CLAUDE.md's e2e sync verification pattern.

### Phase 5 — Doc + cleanup + close

- Update `V2_APP_ARCHITECTURE.md` window-split section with a table of all entry points that must use the helpers. This is the living reference for future flow authors.
- Grep check: `grep -rn "event_group_windows" src/features/` should return only reads and `splitGroupWindow` / `closeGroupWindow` calls. Any direct `update()` / `insert()` on `event_group_windows` outside the two helpers is a miss — fix before commit.
- Grep check: `grep -rn "gw\.headCount\|gw\.avgWeightKg\|e\.headCount" src/features/` — these should appear only in CLOSED-window render paths. Any open-window read that uses `gw.headCount` instead of `getLiveWindowHeadCount(gw)` is a miss.
- Update PROJECT_CHANGELOG.md with one row per OI, plus the e2e test addition.
- Close OI-0094 and OI-0093 in OPEN_ITEMS.md. Add a Change Log row.
- Commit message: `feat(groups): complete window-split coverage across all 11 state-change entry points (OI-0094) + remove Animals bulk action bar (OI-0093)`.

## Known traps

- **Don't call `splitGroupWindow` when the group is not on an open event.** All state changes can happen to a group with no active event — e.g., editing a group that's not currently placed anywhere. Guard each call: look up the group's open `event_group_window`; if none, skip the helper call (just run the membership mutation).
- **Split Group sheet may target a brand-new group with no open event.** The target group in a split is usually new, so `splitGroupWindow` is a no-op for it. Only the source group needs a split on entry #2.
- **Calving with no event placement.** If the dam's group isn't on any open event, the calving flow adds the membership without calling `splitGroupWindow`. Don't crash on the null lookup.
- **Event reopen edge cases.** The summary dialog must correctly account for groups that culled to zero after the close — those windows should stay closed (no live memberships to split from). Test this explicitly.
- **§7 per-row Edit on a CLOSED window editing `dateLeft` backward.** If the farmer moves `dateLeft` back past a later state change, the window boundaries become inconsistent. Out of scope for OI-0094 — flag as an OPEN_ITEMS follow-up if encountered, don't fix inline.

## Git workflow reminder

Per CLAUDE.md: work on `main`, commit after each phase (or at least after Phase 2, Phase 3, Phase 4, Phase 5), single branch. Each commit gets a PROJECT_CHANGELOG.md row. Deploy runs on push via the GitHub Actions workflow.
