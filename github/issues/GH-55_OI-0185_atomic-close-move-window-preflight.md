# OI-0185 — Atomic close/move with pre-flight window-close validation

**Full spec:** `OPEN_ITEMS.md` → OI-0185. Thin pointer.
**Canonical doc home:** `V2_UX_FLOWS.md` close/move flow (document the pre-flight + all-or-nothing contract when implementing).

## Summary

`close.js` `executeClose` and `move-wizard.js` `executeMoveWizard` close every open child window to the chosen out-datetime with no up-front validation that each window can legally close there. A window opening after the out-datetime makes the entity validator throw mid-sequence — after group departures are already written — leaving a partial close / orphaned animals. Live repro: 2026-06-14 E-series→D move threw on E-5's close (E-5 opened 06-14, move-out 06-06) and orphaned 46 head. `executeClose` has no pre-flight and no rollback; `executeMoveWizard` (post-OI-0162) pre-flights FeedEntry creation and idempotency but **not** source window close dates.

## Acceptance Criteria

See OI-0185 in `OPEN_ITEMS.md` for the authoritative list. Headlines:

- [ ] Pre-flight dry-runs every open source window's proposed close through its entity `validate()` before any write; on conflict, zero writes and return the conflict list (handed to OI-0186).
- [ ] Close with a conflicting window → zero writes (no half-closed windows, `date_out` unchanged).
- [ ] Move with a conflicting source window → zero source-departure writes, no orphan destination (reproduce 2026-06-14 E-series→D).
- [ ] Clean close/move unchanged — all existing close + move-wizard tests pass.
- [ ] Shared helper `src/features/events/window-close-guard.js` is the single validation path, consumed by `close.js` + `move-wizard.js`.

## Test Plan

- [ ] Unit: synthetic conflicting window on both paths → assert store unchanged (partial-state impossible).
- [ ] Regression: full OI repro (E-series→D) leaves no `left` stamp and no orphan event.

## Related OIs

- OI-0162 (extends — adds the window-close-date dimension and `close.js` coverage), OI-0186 (consumes the conflict list — build 0185 first), OI-0137 (the validators being pre-flighted).

## Notes

Control-flow + validation ordering only — no schema / migration / CP-55-56 impact. Priority P0.
