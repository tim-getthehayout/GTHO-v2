# Event Detail header — add editable `time_in` input next to the existing date input (OI-0116)

**Added:** 2026-04-18
**Area:** v2-build / events / detail-sheet / ui
**Priority:** P2 (usability gap — `time_in` is currently only editable via the "Edit on paddock window" dialog, which is unintuitive; farmer has to drill through the paddock list to find it)
**Thin pointer note:** not a thin pointer — the event-detail hero-line spec in `V2_UX_FLOWS.md §17.15` shows the date input but doesn't call out a time input. At sprint reconciliation, V2_UX_FLOWS.md §17.15 gets an "In [date] [time]" cell update; this spec is the interim handoff.

## What Tim is hitting

On the Event Detail sheet's hero line (`src/features/events/detail.js:300-349`), the "In [date]" row renders an editable `<input type="date">` for `event.date_in`. There is no sibling input for `event.time_in` — the only way to edit the time is to open the Paddock Windows list on the same sheet, tap Edit on the earliest window, and change `timeOpened` there. That's a two-hop detour the farmer doesn't find without being told.

With the OI-0117 refactor coming later, both the date and time inputs on this line will become write-through to the earliest child window. In the meantime, adding the time input as a straight `events.time_in` writer closes the usability gap without blocking on the bigger refactor.

## Acceptance criteria

1. **Time input renders** next to the date input on the "In" line, same visual style and size, small `HH:MM` placeholder. Layout: `In [date-input] [time-input] · Out [date] · $[cost]`.
2. **Value** — initial value reads from `event.timeIn` (or empty when `timeIn` is null).
3. **Edit persists** — on `change`, writes `{ timeIn: newTime }` via `update('events', ctx.eventId, {...}, EventEntity.validate, EventEntity.toSupabaseShape, 'events')`. All six store-call params per CLAUDE.md §"Store call param-count check".
4. **OI-0115 teardown guards** — the same three guards on the existing `dateInInput` change handler apply here verbatim:
   - `if (!timeInInput.isConnected) return;` — phantom-change-after-teardown.
   - `if (newTime === renderedTimeIn) return;` — no-op phantom with render-time-snapshot value.
   - `if (newTime === evt?.timeIn) return;` — no-op against current store.
5. **Empty-string → null normalization** — when the user clears the field, persist `timeIn: null` (not `""`). Entity validate should accept `null`.
6. **Unit test added** — a new `tests/unit/features/events/detail.test.js` (or extension of the existing file) that: renders the header, dispatches a `change` event on the time input with a new value, asserts `getById('events', id).timeIn` is the new value; then dispatches a phantom change after teardown and asserts the value is unchanged (OI-0115 regression coverage extended to this input).
7. **E2E test added** — per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI": after the UI edit, query Supabase `events.time_in` directly and assert it matches.
8. **No schema change.** `events.time_in` already exists as `text NULL`.
9. **PROJECT_CHANGELOG.md row** on commit per CLAUDE.md §"Doc Ownership".

## Files touched

- `src/features/events/detail.js` — header rendering around lines 300–349. Insert the time input inside the IIFE pattern that already wraps `dateInInput`, same guard structure.
- `tests/unit/features/events/detail.test.js` — new or extended file with the header render + time-in edit tests.
- `tests/e2e/` — extend whichever existing event-detail e2e covers the header (or add a new small one).
- `PROJECT_CHANGELOG.md` — one row on commit (Claude Code owns).

## Non-goals

- **No derived-from-child-window behavior here.** That's OI-0117. This spec writes to `events.time_in` directly exactly like the current date input writes to `events.date_in`. When OI-0117 ships, both inputs switch target from the `events` row to the earliest child window's `time_opened` / `date_opened` — the UI stays identical.
- **No guard changes** to `edit-paddock-window.js` / `edit-group-window.js`. Those are OI-0117's territory.
- **No layout reshuffle of the hero line.** Just slot the time input between the date input and the `·` separator.

## Related

- **OI-0115** (shipped, GH-25) — the three teardown guards that this spec is extending to the new input.
- **OI-0117** (next) — derive `event.dateIn`/`timeIn` from the earliest child window, drop the columns. This input becomes write-through then, but no UI change visible to the user.
- **Base doc:** V2_UX_FLOWS.md §17.15 Event Detail hero line — needs "In [date] [time]" update at sprint reconciliation.

## Commit message skeleton

```
feat(event-detail): editable time_in input in hero line (OI-0116)

Adds a time input next to the existing date input on the Event Detail
hero line, with the same OI-0115 teardown guards. Closes the usability
gap where editing event start time required drilling into the paddock
windows list.

Writes to events.time_in directly; will switch to write-through on the
earliest child window when OI-0117 lands.

No schema change. No CP-55/CP-56 impact.
Closes OI-0116 and [GH issue number after filing].
```
