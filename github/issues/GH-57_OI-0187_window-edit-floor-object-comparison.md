# OI-0187 — Window edit dialogs compare a date string against the floor OBJECT, blocking every date edit on a multi-window event

**Full spec:** `OPEN_ITEMS.md` → OI-0187. Thin pointer.

## Summary

`getEventStartFloorExcluding()` (`src/features/events/event-start.js:133`) returns an object `{ date, time, name }`, but both edit dialogs compare the user's typed date string directly against that object:

- `src/features/events/edit-paddock-window.js:231` — `if (floorDate && newDateOpened < floorDate)`
- `src/features/events/edit-group-window.js:117` — `if (floorDate && newDateJoined < floorDate)`

`"2026-06-11" < {object}` coerces the object to `"[object Object]"`; since `"2"` sorts before `"["`, the comparison is **always true** whenever a sibling window exists. The real floor (`floorDate.date`) is never read, so every open/join-date edit on any multi-window event is blocked unconditionally with "Paddock can't open before the event started" / "Group can't join before the event started". Live repro 2026-06-23: anchor B-3 opened the 9th, editing the B-2 sub-move to the 11th (valid, 11 > 9) is rejected.

## Fix

Compare against `floorDate.date` in both files:

- `edit-paddock-window.js:231` → `if (floorDate && newDateOpened < floorDate.date) { … }`
- `edit-group-window.js:117` → `if (floorDate && newDateJoined < floorDate.date) { … }`

Date-only by intent — no datetime/time component in this guard.

## Acceptance Criteria

See OI-0187 in `OPEN_ITEMS.md` for the authoritative list. Headlines:

- [ ] Editing a sub-move paddock window to a date on/after the earliest sibling opening saves (2026-06-23 B-2→11th repro passes).
- [ ] Editing to a date strictly before the earliest sibling still blocks with the existing message.
- [ ] Same two assertions for `edit-group-window.js` (join date).
- [ ] Grep contract: `grep -nE "newDate(Opened|Joined) < floorDate\b" src/features/events/` returns 0 matches.

## Test Plan

- [ ] Unit: window with an earlier sibling accepts a later open/join date; rejects an earlier one. Covers both dialogs.

## Related OIs

- OI-0117 (introduced the floor guard — this is a defect in that change), OI-0116 (same error message, original scenario), OI-0064 (the edit dialog).

## Notes

Validation-logic fix only — no schema / migration / CP-55-56 impact. Priority P1.
