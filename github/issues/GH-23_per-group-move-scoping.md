# Per-group Move button scoping (OI-0066)

**Priority:** P3
**Area:** v2-build / dashboard / move wizard / scope
**Status at spec:** UNTOUCHED (confirmed by pre-build audit 2026-04-18)

## Problem

SP-3 added a per-group Move button on each group row inside the dashboard
location card. That button currently calls `openMoveWizard(event, operationId)`
— the same handler as the card-level "Move all" button. Result: clicking Move
on one group row moves **all** groups on that event, not just that group.

V1 behavior (and the desired v2 behavior): the per-group Move scopes the
wizard to that specific `event_group_window`, so other groups on the event
stay in place and the source event stays open until the last group leaves.

## Fix

1. Add `scopedGroupWindowId` to the `openMoveWizard` options:
   `openMoveWizard(event, operationId, farmId, { scopedGroupWindowId })`.
2. Wire the per-group Move buttons on both dashboard card variants
   (`buildGroupCard`, `buildLocationCard` group row) to pass the window's id.
3. Inside the wizard's save path:
   - Close only the scoped group window.
   - Leave the source event's paddock windows open and the event's
     `dateOut` unset, so long as any other GW on the event remains open.
   - When the LAST group leaves, close every open PW and stamp the event
     `dateOut` — matches the existing non-scoped behavior.
   - Skip feed transfer entirely in scoped mode (feed stays with the
     remaining groups on the source event).
4. Card-level "Move all" continues to work exactly as today — no scope
   param, full-event move.

## Acceptance criteria

- [ ] Per-group Move opens the wizard pre-scoped to that group; the
      wizard's close-out only touches the one `event_group_window`.
- [ ] On save, only the scoped GW gets `dateLeft`; other open GWs on the
      source event stay `dateLeft = null`.
- [ ] Source event stays open as long as at least one GW on it is open.
      Event + paddock windows only close when the last group leaves.
- [ ] Card-level "Move all" behavior unchanged; existing tests pass.
- [ ] New unit test covers scoped-vs-non-scoped invariants + last-group
      close-out.

## CP-55/CP-56 impact

None — no schema change, no new fields; `event_group_windows` rows are
already the unit of scoping.

## Schema change

None.

## Base doc impact

V2_UX_FLOWS.md §13 (Move wizard) and §17.7 (Dashboard card per-group row)
get a line noting the scoped variant at end-of-sprint reconciliation per
UI_SPRINT_SPEC.md SP-12.

## Related OIs

- **OI-0091** — event window split on state change. Architectural
  foundation this OI builds on.
- **OI-0073** — group placement detection (closed with OI-0091).
- **SP-3 / GH-11** — added the per-group row + Move button this OI
  completes the scoping for.
