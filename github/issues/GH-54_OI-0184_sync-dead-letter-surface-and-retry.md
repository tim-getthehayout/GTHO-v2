# OI-0184 — Surface + auto-retry failed syncs (dead-letter queue)

**Full spec:** `OPEN_ITEMS.md` → OI-0184. This file is a thin pointer (per "specs live in base docs, not spec files").
**Canonical doc home:** `V2_INFRASTRUCTURE.md` sync section (add the dead-letter surfacing + auto-retry contract when implementing).

## Summary

Failed writes in `src/data/custom-sync.js` exhaust 5 retries, land in a `_dead_letter_queue`, and then go silent: `getDeadLetters()` / `retryDeadLetters()` have **zero consumers**, the queue is never auto-retried, and the OI-0141 sync indicator stays green because `getStatus()` returns to `idle` after the next successful push. A user's saved correction can therefore never reach Supabase with no visible signal (live repro 2026-06-23 — Tim's E-5 window correction).

## Acceptance Criteria

See OI-0184 in `OPEN_ITEMS.md` for the full, authoritative list. Headlines:

- [ ] Dead-lettered push → sync indicator turns red with a count (not green).
- [ ] Dead letters auto-retry on reconnect / visibility / manual tap; heal without user action when back online.
- [ ] Tapping the red indicator runs `retryDeadLetters()` + `flush()`.
- [ ] `getStatus`/`getSyncHealth` cannot report green while dead-letter or pending queue is non-empty.
- [ ] `grep -rn "getDeadLetters\|retryDeadLetters" src/` shows ≥ 1 consumer outside `custom-sync.js`.

## Test Plan

- [ ] Unit: 5 failed pushes → dead-lettered → health = failed → reconnect → auto-retry → health = green.

## Related OIs

- OI-0141 (sync indicator push+pull semantics — extend it), OI-0049 (`pushAllToSupabase` manual fallback), OI-0050 / OI-0053 (silent-sync-failure class).

## Notes

No schema / migration / CP-55-56 impact — sync-transport reliability only. Priority P0.
