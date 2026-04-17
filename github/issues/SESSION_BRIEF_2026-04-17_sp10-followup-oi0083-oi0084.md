# Session Brief: SP-10 Follow-up — OI-0083 + OI-0084 (2026-04-17)

**Context:** SP-10 Phases 1–5 landed on 2026-04-17. Two items got deferred with a "design-required" flag:
- **OI-0083** — Retro-place flow (Phase 3 portion that Claude Code deferred)
- **OI-0084** — §9 Feed check edit + re-snap invariant dialog (Phase 6)

Tim walked through both with Cowork the same day and resolved them. This brief is the handoff for the build. **Both items are P1 — they complete SP-10 and unblock field testing.**

---

## OI-0083 — Retro-place flow

**Design decisions (all locked — do not re-ask):**
1. Destination event picker = **sheet picker with event cards** (full-screen sheet, card per candidate event with dates, location(s), current groups, head count). Not a dropdown.
2. Picker filter = **full containment only**. `event.date_in ≤ gap_start` AND `event.date_out ≥ gap_end`. Partial-overlap events excluded.
3. Flow simplified to **atomic two-write transaction** — no reopen, no re-close, no snapshot rollback for this flow. The prior spec's reopen-close ceremony was unnecessary once full containment was locked.
4. Conflict check = **block with error** (not a three-option resolver) if the group already has an overlapping window on the destination.
5. No undo toast after completion. User deletes the retro-placed window via the destination event's §7 Edit dialog if reversing.

**What to build:**

Create `src/features/events/retro-place.js`. The flow:

1. **Sheet picker.** Filter candidate events to those that fully contain the gap. Render one card per event. Card content: event name/dates, paddock(s) open during the gap, current group chips with head counts. Tap to select.
2. **Paddock picker (only if needed).** If the selected event has more than one paddock window that fully contains the gap, show a sub-picker. If exactly one, skip.
3. **Conflict check.** After picker selection, before the confirm dialog: query `event_group_windows` for the group being placed on the destination event. If any existing window's date range overlaps `[gap_start, gap_end]`, abort the flow with an error toast — do not open the confirm dialog. Copy: *"Group X already has a window on Event #N from `{dateA}` to `{dateB}`. This contradicts the gap you're trying to fill. Cancel this retro-place and review the existing window."*
4. **Confirm dialog.** Preview copy (exact):
   > *"Place Group X on Event #N, Paddock P, from `{gap_start}` to `{gap_end}`.*
   >
   > *Event #N stays closed with its original end date (`{event.date_out}`).*
   >
   > *Group X's join date on the current event changes from `{prior}` to `{new}`.*
   >
   > *[Cancel] [Confirm]"*
5. **On Confirm — atomic two-write transaction** (single store transaction, both or neither):
   - Update the source event's group window: `date_joined = {new date from edit}`.
   - Insert a new `event_group_window` on destination: `event_id = dest.id`, `group_id = {same}`, `date_joined = gap_start`, `date_left = gap_end`, `head_count = {source window's head_count}`, `avg_weight_kg = {source window's avg_weight_kg}`, new UUID.
   - Sync both records together.
6. **On Cancel at any step:** no writes. User returns to the gap resolver dialog and can pick a different option.

**Wire-up:** register as the handler for Option 3 in `resolve-window-change.js` (the gap resolver dialog from Phase 1). The existing snapshot/rollback infrastructure is **not used** for retro-place — it was designed for the earlier ceremony that no longer exists. Leave the infrastructure in place for future use by other flows (Event Reopen already uses it).

**Acceptance criteria:**
- [ ] Picker excludes events that don't fully contain the gap.
- [ ] Conflict check aborts before confirm if group already has an overlapping window on destination.
- [ ] Confirm commits both writes atomically; either both land or neither does.
- [ ] Cancel at any step leaves no writes.
- [ ] Destination event's `date_out` is untouched throughout the flow.
- [ ] Destination event's §7 list shows the new historical window after save.
- [ ] Deleting the new window via the §7 Edit dialog works (existing functionality).
- [ ] Unit test covers the atomic transaction (both writes land) and the conflict-check abort.
- [ ] E2E test: create two events with a gap between them, retro-place, verify destination Supabase `event_group_windows` row exists with correct dates.

**Spec reference:** `UI_SPRINT_SPEC.md` § SP-10 "Retro-Place Flow" (fully rewritten 2026-04-17 — ignore any cached understanding from the prior reopen-close version).

---

## OI-0084 — §9 Feed check edit + re-snap invariant dialog

**Not design-required** — SP-10 §9 has the full spec. The "design-required" flag was a scope surprise: feed checks are add-only in the current code (`src/features/events/check.js`), so the edit dialog has to be built from scratch rather than extended.

**What to build:**

1. **Feed check edit dialog** — new file `src/features/events/edit-feed-check.js`. Opens from the per-row inline Edit button in the §9 card (button already rendered per the OI-0071 fix; wire it to this). Fields:
   - `date` (date input, required)
   - `time` (time input, optional)
   - `remaining_amount` (number input, ≥ 0, required)
   - `notes` (text input, optional)
   - `batch_id` and `location_id` shown as read-only chips (changing batch/location means delete + re-add, not edit).
   - **Submit button** ("Save"). Not auto-save-on-blur — the invariant check needs all fields together.

2. **Range guards** (reject-on-save, inline error per SP-10 §9):
   - `check.date < event.date_in` → reject.
   - `check.date > event.date_out` when event is closed → reject.
   - `check.date` in the future → reject.
   - `remaining_amount < 0` → reject.

3. **Invariant check on save.** For the feed line (`batch_id` × `location_id` × `event_id`), load all checks and deliveries/removals on that line. Compute `consumed(Ti → Ti+1)` for every adjacent interval affected by the edited check. The formula is in SP-10 §9 and §8a. Four cases:
   - **Case A — benign** (all intervals still ≥ 0): save silently. Compute-on-read cascades DMI/NPK/cost.
   - **Case B — later-interval break** (a later check now implies negative consumption): open **Re-snap dialog** (see below).
   - **Case C — earlier-interval break**: surface conflict with `[Cancel edit]` only. Copy per SP-10 §9.
   - **Case D — back-fill** (user is adding a check dated in the past — likely via the existing Add dialog, but the invariant check still runs): uses B or C resolution depending on which side breaks.

4. **Re-snap dialog** — can be inline inside `edit-feed-check.js` or a separate module. Lists the specific impossible later check(s) with their dates and values. Buttons: `[Cancel edit]` | `[Delete later checks and save]`. On confirm, atomic transaction: delete the impossible checks + save the edit together. After save, non-modal toast: *"Enter a new feed check to re-snap the line →"* with a shortcut button that opens the Add Feed Check dialog pre-filled for that feed line.

5. **Delete feed check** — existing behavior. No invariant check needed; widening an interval is always safe.

**Acceptance criteria:**
- [ ] Per-row Edit button in §9 opens the new edit dialog, pre-filled with the check's current values.
- [ ] Range guards reject out-of-window dates and negative amounts with inline errors.
- [ ] Case A saves silently.
- [ ] Case B opens the Re-snap dialog; `[Delete later checks and save]` atomically deletes + saves.
- [ ] Case C surfaces the conflict with Cancel only.
- [ ] Delete still works unchanged.
- [ ] DMI / NPK / cost numbers on the dashboard update automatically after an edit (compute-on-read works).
- [ ] Unit tests: one per case (A/B/C/D) with example check sequences.
- [ ] PROJECT_CHANGELOG.md updated with one row.

**Spec reference:** `UI_SPRINT_SPEC.md` § SP-10 §9.

**No schema impact.**

---

## OPEN_ITEMS changes

Already applied by Cowork in the same session:
- OI-0083 status changed from "DESIGN REQUIRED" to "DESIGN COMPLETE, ready for Claude Code"; body rewritten with the locked decisions.
- OI-0084 status changed from "DESIGN REQUIRED" to "DESIGN COMPLETE, ready for Claude Code"; body clarified that it's a build-scope item, not a design gap.

Close on completion:
- OI-0083 — close after retro-place flow is built and tested.
- OI-0084 — close after feed check edit + re-snap dialog is built and tested.

---

## Files likely to touch

**New:**
- `src/features/events/retro-place.js`
- `src/features/events/edit-feed-check.js`
- Optional: `src/features/events/feed-check-resnap-dialog.js`

**Modified:**
- `src/features/events/resolve-window-change.js` (wire Option 3 to `retro-place.js`)
- `src/features/events/event-detail.js` (wire §9 per-row Edit button to the new dialog)
- `src/data/store.js` (atomic transaction helper — may already be generic enough from Phase 1)
- `tests/unit/retro-place.test.js` (new)
- `tests/unit/edit-feed-check.test.js` (new)

---

## Design principles to watch

- **Do not use worktree isolation.**
- **Scoped changes only** — do not refactor surrounding code.
- **Do not invent.** If you hit something that's not in SP-10 § Retro-Place Flow or § §9, stop and flag it.
- **Store param-count check** (CLAUDE.md #7) before commit.
- **Atomic-transaction-or-nothing** is the key safety property for retro-place. Both writes land together or neither does.
