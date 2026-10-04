# SESSION_BRIEF — OI-0102 multi-paddock open

**Generated:** 2026-10-04
**Source:** Grok design session
**Status:** Ready for Grok Build

## What was decided

Fall and early spring grazing opens several whole paddocks at once. That is one event with N `event_paddock_windows`, not strip graze and not one anchor plus neighbors.

Tim locked this on 2026-10-04:

- One forage card on open, copied onto one observation per window.
- One residual on a bulk close, copied onto each window that Save closes. A single-gate close has its own reading.
- `open_cohort_id` labels windows opened in the same Save. It is not a lock. One gate may close early.
- A later add-paddock does not join that cohort. The add-paddock sheet also multi-selects.
- In-use paddocks stay visible and are not selectable.
- Moved bales go to one chosen paddock of the set. No split.
- Strip graze stays single-paddock and is mutually exclusive with multi-select.
- No anchor column. Event detail must stop treating the earliest window as the primary paddock.

## What to build / change

Implement `github/issues/OI-0102_multi-paddock-open.md`. Migration 035 is specified and not applied. Apply and verify it before UI.

## Acceptance criteria

The spec's test list is the acceptance list. Do not add a stored anchor. Do not allow selecting an in-use paddock.

## Constraints and traps to avoid

- Schema first. A migration file is not applied until it has been run and verified.
- Writes go through the store. No direct Supabase writes from feature code.
- Single-select callers (harvest, amendments, todos, feed delivery) stay single-select.
- Do not invent design. Unspecified questions go back to this chat.

## References

- `github/issues/OI-0102_multi-paddock-open.md`
- `PROJECT_STATUS.md` section 5, item 1
- `OPEN_ITEMS.md` OI-0102
- Commit `c94231c`

## Open questions for the implementer

None.
