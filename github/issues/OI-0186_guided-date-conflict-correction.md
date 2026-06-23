# OI-0186 — Guided date-conflict correction on close/move

**Full spec:** `OPEN_ITEMS.md` → OI-0186. Thin pointer.
**Canonical doc home:** `V2_UX_FLOWS.md` close/move flow (document the guided-correction step when implementing).

## Summary

A window-date conflict on close/move currently surfaces the raw entity string "Validation failed for eventPaddockWindows: dateClosed must be on or after dateOpened" — no paddock named, no date, no fix, even though `openEditPaddockWindowDialog` can correct it. Replace with a plain dialog driven by the OI-0185 conflict list: name the paddock and its open date vs. the chosen out-date, and offer one-tap **Set open date to [out-date]**, **Edit…**, **Cancel** (plus **Fix all** for multi-conflict). No silent changes — each correction is shown and tapped.

## Acceptance Criteria

See OI-0186 in `OPEN_ITEMS.md` for the authoritative list. Headlines:

- [ ] Conflict opens the guided dialog naming each paddock + open date vs out-date; raw validator string never shown to the user.
- [ ] "Set open date to [out-date]" corrects the window and resumes the close/move to success in one flow.
- [ ] "Edit…" opens `openEditPaddockWindowDialog` for that window.
- [ ] Multi-conflict listed; "Fix all" clamps each open date to the out-date.
- [ ] `grep -rn "dateClosed must be on or after" src/features/events/` → 0 user-facing surfacings.

## Test Plan

- [ ] Unit: conflict → dialog lists the right paddock(s); one-tap fix resumes to a successful close.

## Related OIs

- OI-0185 (provides the conflict list — build first), OI-0162 (replaces the raw error-toast path for this case), OI-0064 (paddock-window edit dialog reused).

## Notes

UX/copy + reuse of existing edit path — no schema / migration / CP-55-56 impact. Priority P1.
