# Group State-Change Entry Point Completeness — OI-0091 Follow-up Package

**Type:** Architectural completeness pass (package 2 of 2)
**Priority:** P0 (silent calc wrongness persists on 11 entry points until this ships, even after OI-0091)
**Related OI:** OI-0094 (this issue)
**Prerequisite:** OI-0091 + OI-0073 package must be shipped and merged first. Do not begin until that commit lands.
**Interacts with:** OI-0093 (removes entry point #11 — Animals bulk Move — from scope if it ships before this one)

## Full spec

The full spec lives in `OPEN_ITEMS.md` § **OI-0094 — Group state-change entry point completeness**. Read that entry end-to-end before implementing — including the eleven-row entry-point table and the locked 2026-04-17 sub-decision on §7 per-row headCount / avgWeightKg.

This file is a thin pointer per the sprint workflow — do not duplicate the spec here.

## Why this is a second package

OI-0091 closed the three flows Tim's Shenk Culls bug surfaced (cull, whole-group move, event close). A follow-up audit found eleven more places in the codebase where a group's state can change mid-event without going through the window-split helpers. Shipping them as a second package lets OI-0091 land clean, Tim verify in field data, and this package complete the architectural coverage without scope creep on package 1.

## The pattern in one paragraph

For each of the eleven entry points, replace the direct `event_group_windows` or membership mutation with the appropriate OI-0091 helper call: `splitGroupWindow(groupId, eventId, changeDate, changeTime, { headCount, avgWeightKg })` after membership changes on an open event, `closeGroupWindow(groupId, eventId, closeDate, closeTime)` on terminal state changes. Add unit tests per entry point. Update `V2_APP_ARCHITECTURE.md`'s window-split section with a living table of all entry points so future flow authors have a reference.

## Locked sub-decision (§7 per-row Edit — entry #8)

Per Tim 2026-04-17 — *"those two fields should be view only. That's how they were in v1 as well. System generated."* — the §7 per-row Edit dialog handles `headCount` / `avgWeightKg` as follows:

- **Open window (`dateLeft === null`):** render both fields as disabled view-only labels showing the live values from `getLiveWindowHeadCount(gw)` / `getLiveWindowAvgWeight(gw)`. Caption: *"System generated from live memberships. Use Cull, Move, or Reweigh to change."*
- **Closed window (`dateLeft !== null`):** both fields remain editable (historical correction escape hatch).
- Date/time joined and date/time left remain editable in both states.

This is v1 parity and aligns the UI with the OI-0091 rule: open = live, closed = stored snapshot.

## The eleven entry points

See the table in OPEN_ITEMS.md § OI-0094. In short:

- `src/features/animals/index.js` — 5 call sites (Edit Group checkboxes, Split Group, Edit Animal group dropdown, Group Weights, Animals bulk Move)
- `src/features/health/calving.js` — calving adds membership
- `src/features/events/group-windows.js` — §7 Add group / Remove group
- `src/features/events/edit-group-window.js` — §7 per-row Edit (entry #8 — view-only rule) + Delete window
- `src/features/events/reopen-event.js` — event reopen with new "N reopened, M stayed closed" summary dialog

## Out of scope

- **New store or calc helpers.** Reuse OI-0091's `splitGroupWindow` / `closeGroupWindow` / `getLiveWindowHeadCount` / `getLiveWindowAvgWeight` verbatim.
- **Schema changes.** None. No CP-55 / CP-56 impact.
- **OI-0093 bulk action bar removal.** Separate issue. If OI-0093 ships before OI-0094, remove entry #11 from this package's scope.
- **OI-0092 residual feed NPK.** Separate track.

## Acceptance criteria

See OI-0094 in `OPEN_ITEMS.md` § Acceptance Criteria (full list). Headline checks:

- [ ] All eleven entry points call `splitGroupWindow` / `closeGroupWindow` (or have an explicit documented reason not to).
- [ ] §7 per-row Edit dialog view-only behavior on open windows implemented per locked sub-decision.
- [ ] §7 per-row Edit dialog keeps fields editable on closed windows.
- [ ] Unit tests cover each entry point. Edit-group-window test covers both open (view-only) and closed (editable) paths.
- [ ] E2E test covers the Animals-screen flows, calving, §7 flows, and event reopen.
- [ ] No direct `event_group_windows` mutations remain in the affected files except via the two helpers (grep check).
- [ ] `V2_APP_ARCHITECTURE.md` window-split section gains a table of all entry points.
- [ ] PROJECT_CHANGELOG.md updated.

## Session brief

`github/issues/SESSION_BRIEF_2026-04-17_group-state-change-completeness.md` covers the implementation order for this package.
