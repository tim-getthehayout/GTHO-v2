# Animals Screen — Remove Bulk Action Bar + Conform Group Dropdown

**Type:** UI cleanup + design-system conformance
**Priority:** P1 (redundant UI + styling inconsistency — not a data bug, but a user-visible polish gap)
**Related OI:** OI-0093 (this issue)
**Interacts with:** OI-0094 (removing the bulk action bar removes one of its eleven entry points)

## Full spec

The full spec lives in `OPEN_ITEMS.md` § **OI-0093 — Animals screen: remove bulk action bar + conform group dropdown in Edit Animal**. Read that entry end-to-end before implementing.

This file is a thin pointer per the sprint workflow — do not duplicate the spec here.

## What's wrong in one paragraph

The Animals screen currently shows a full-width green bulk action bar at the top when any animal row checkbox is selected (*"N selected · Move to group · New group · Cancel"*). Every action it exposes is already available per-animal via the row's Edit button (→ Edit Animal dialog with group dropdown) or per-group via the group tile's Edit / Split / Weights / × actions. The bar adds a parallel interaction pattern without adding capability. Separately, the group dropdown inside the Edit Animal dialog uses raw `<select>` styling and does not match the v2 picker pattern used elsewhere in the app (e.g., Deliver Feed batch picker, Move wizard group picker).

## The fix in one paragraph

Delete the `#animals-action-bar` DOM, its `renderActionBar()` function, the `selectedAnimals` Set and click handlers, and the checkbox column from each animal row. The row's existing Edit button becomes the primary per-animal action. If `openAnimalMoveSheet` is only called from the bulk bar, delete it; grep first. Rewrite the Edit Animal group dropdown to use the standard v2 picker pattern — a tap-to-open sheet with selectable group rows, consistent with Move wizard / Deliver Feed.

## Interaction with OI-0094

Entry point #11 in OI-0094's eleven-row table (Animals bulk Move action) goes away entirely when OI-0093 ships. Whichever OI lands second should update the other's scope. If OI-0093 ships first, remove #11 from OI-0094's scope and drop the table row to ten entry points. If OI-0094 ships first, ensure it does not leave a broken call site on the bulk action bar.

## Files affected

- `src/features/animals/index.js` — remove action bar, checkbox column, `selectedAnimals` + handlers, rewrite group dropdown to picker pattern. Call sites: lines 29, 59, 65, 215–227, 310–335, 378, 1104 (group field), 1323, 1358.
- `openAnimalMoveSheet` + its sheet DOM — delete if orphaned.
- `tests/unit/animals.test.js` — drop tests for the deleted bulk flow; add tests for the new picker.
- `PROJECT_CHANGELOG.md`.

## Acceptance criteria

See OI-0093 in `OPEN_ITEMS.md` § Acceptance Criteria. Headline checks:

- [ ] No green bulk action bar appears on the Animals screen under any condition.
- [ ] Per-row checkbox is removed. Each animal row has an Edit button as its primary action.
- [ ] Edit Animal → Group field uses the standard v2 picker pattern.
- [ ] Group change in Edit Animal correctly closes old membership and opens a new one (existing behavior must still work after UI change — verify with OI-0094's `splitGroupWindow` call wired in).
- [ ] If OI-0094 already shipped, entry point #11 in its table is marked done-by-default.
- [ ] Unit tests pass; visual check against V2_DESIGN_SYSTEM.md picker tokens.

## CP-55 / CP-56 impact

None. UI change only; no schema touch.
