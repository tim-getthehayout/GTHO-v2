# Session Brief: Event Detail Sheet — UI Fixes (2026-04-16)

**Context:** SP-2 event detail sheet was implemented and DMI-8 chart is in. Tim reviewed the result and found 7 UI issues that need fixing. These are implementation issues — the spec (GH-10) already describes the correct behavior for most of them.

**Priority:** Fix in order listed. All are P1 — they block usability testing.

---

## Fix 1: Edit Event Dialog — Save + Cancel Buttons

**Problem:** The edit event dialog (opened from the event detail sheet) is missing navigation/action buttons.

**Fix:**
- **Top right of dialog:** Cancel button (✕ icon or text "Cancel") — closes the dialog without saving.
- **Bottom of dialog:** Three buttons in a row:
  - `Move all` — `btn btn-teal`, calls `openMoveWizard`
  - `Save & close` — `btn btn-olive`, saves changes and closes the dialog
  - `Cancel` — `btn btn-ghost`, closes without saving
- Bottom buttons should match the Actions footer pattern from GH-10 §13.

---

## Fix 2: Pre-graze and Post-graze Fields — Make User-Editable

**Problem:** Pre-graze and post-graze observation fields are rendering but are not editable by the user.

**Fix:**
- Pre-graze fields (height, cover, quality, condition) must be `<input>` elements, not read-only text. See GH-10 §5 — fields should auto-save on blur.
- Post-graze fields (height, recovery min/max days) must also be editable inputs for closed paddock windows. See GH-10 §6.
- For active events, all pre-graze fields are editable. Post-graze fields are editable when a paddock window has been closed.
- For closed events, all observation fields should be disabled (read-only).

---

## Fix 3: Feed Checks, Feed Entries, Sub-moves — Inline Edit Button

**Problem:** Feed check rows, feed entry rows, and sub-move history rows are missing their per-entry edit button.

**Fix:**
- Each row in Feed Entries (§8), Feed Checks (§9), and Sub-move History (§12) needs a small inline edit button.
- Button: `btn btn-ghost btn-xs` with a pencil icon (✏️ or SVG equivalent). Positioned at the trailing edge of the row.
- Feed entries: edit button opens `openDeliverFeedSheet` pre-filled with that entry's data.
- Feed checks: edit button opens `openFeedCheckSheet` pre-filled with that check's data.
- Sub-moves: edit button opens the sub-move edit modal for that paddock window.
- GH-10 §8 and §9 already spec trailing `Edit` (pencil) and `Delete` (✕) buttons. §12 specs an `Edit` button per row. Ensure all three sections match the spec.

---

## Fix 4: DMI/NPK Breakdown — Move Up Below DMI Bars

**Problem:** The DMI/NPK Breakdown card is rendered too far down the page, below notes and sub-move history.

**Fix:**
- Move the DMI/NPK Breakdown card to render immediately after the DMI — Last 3 Days chart (§3).
- Updated reader order:
  1. Header
  2. Event Summary
  3. DMI — Last 3 Days chart
  4. **DMI / NPK Breakdown** (moved up from position 10)
  5. Paddocks
  6. Pre-graze Observations
  7. Post-graze Observations
  8. Groups
  9. Feed Entries
  10. Feed Checks
  11. Notes
  12. Sub-move History
  13. Actions
- This groups all the nutrition data together at the top of the sheet.

---

## Fix 5: Deliver Feed Dialog — Date and Time Required

**Problem:** The deliver feed dialog allows submission without a date and time.

**Fix:**
- Date field: required, `<input type="date">`, default to today's date.
- Time field: required, `<input type="time">`, default to current time.
- Both fields must have validation — form cannot submit if either is empty.
- Show inline validation message "Date and time are required" if the user tries to save without them.

---

## Fix 6: Deliver Feed Dialog — Quantity Stepper Uses Whole Steps

**Problem:** The up/down arrows on the quantity input in the deliver feed dialog increment by 0.5 — should default to whole number steps.

**Fix:**
- Set `step="1"` on the quantity `<input type="number">` (not `step="0.5"`).
- The user can still type decimal values manually (e.g., `2.5`, `3.75`) — the input should accept any numeric value, just the stepper arrows should increment by 1.
- Do not restrict the `min` precision — only the step buttons change.

---

## Fix 7: Move Wizard Buttons — Navigation Broken

**Problem:** Move wizard buttons do not take the user anywhere. Clicking next/confirm in the move wizard does nothing.

**Fix:**
- Diagnose the issue: likely the button click handlers are not wired up, or the wizard step advancement function is broken.
- Check `src/features/events/move-wizard.js` (or equivalent) for:
  - Are `onclick` handlers attached to the Next / Confirm / Back buttons?
  - Is the step state variable being incremented?
  - Is the next step's DOM being rendered after state change?
  - Are there any errors in the console? (Check `logger` output)
- This was flagged earlier in the SP-2/SP-3 review as "move wizard not advancing" — may be the same root cause as the i18n key resolution bug if button labels are broken.
- **Test after fix:** Open event detail → click Move all → wizard should open → each step should advance → final step should execute the move and close the wizard.

---

## Acceptance Criteria

- [ ] Edit event dialog has Save, Cancel (top right), Move all, Save & close, Cancel (bottom)
- [ ] Pre-graze fields are editable inputs with auto-save on blur
- [ ] Post-graze fields are editable for closed paddock windows
- [ ] Feed entries, feed checks, and sub-move rows each have an inline edit button
- [ ] DMI/NPK Breakdown card renders immediately after the DMI chart
- [ ] Deliver feed dialog requires date and time (with defaults)
- [ ] Deliver feed quantity stepper increments by 1 (whole numbers), manual decimal entry allowed
- [ ] Move wizard buttons advance through steps and complete the move
- [ ] `npx vitest run` clean
- [ ] No `console.error` in feature code

## Schema Impact

None. All fixes are UI/wiring changes.

## Related

- GH-10 — SP-2 event detail view spec (authoritative)
- GH-11 — SP-3 dashboard card enrichment
- UI_SPRINT_SPEC.md — sprint tracking
