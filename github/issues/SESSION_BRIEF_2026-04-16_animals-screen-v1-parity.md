# SESSION BRIEF — Animals Screen V1 Parity UI Rebuild

**Date:** 2026-04-16
**From:** Cowork
**To:** Claude Code
**Spec file:** `github/issues/animals-screen-ui-v1-parity.md`

---

## What This Is

A full UI rebuild of the Animals screen and all 17 of its dialogs to match v1's layout, spacing, and interaction patterns. The v2 Animals screen was built from prose specs and has very little visual resemblance to v1. The spec file contains the exact v1 HTML patterns — translate them to v2's DOM builder (`el()`, `text()`, `clear()`).

## Why It Matters

This is part of the ongoing UI sprint to bring v2 to visual parity with v1 before launch. The Animals screen is one of the most-used screens in the app. Users expect it to look and feel like v1.

## What Changed in V1 Since Last Build

Nothing — this is a visual rebuild, not a functional change. All data flows, store actions, and sync behavior stay the same.

## Scope

**Files to modify:**
- `src/features/animals/index.js` — primary target, rebuild all render functions
- `src/styles/main.css` — add/fix CSS classes (`.agc-*`, `.bcs-chip`, badge classes, etc.)

**Do NOT modify:**
- Entity files, store, sync adapter, or any data layer code
- Other feature files (feed, events, dashboard, etc.)

## Implementation Order

Work through the spec parts in order:

1. **Part 1 (CSS)** — Verify all shared CSS classes exist in `main.css`. Add missing ones, fix mismatched ones. Don't duplicate — check first.
2. **Part 2 (Main layout)** — Rebuild the screen skeleton: sticky filter header, search, config buttons, groups card container, animal list container.
3. **Part 3 (Groups list)** — Rebuild `renderGroupsList()` equivalent with the v1 row pattern (3px left color bar, inline badges, action buttons).
4. **Part 4 (Animal list)** — Rebuild the sort header and individual animal rows with checkboxes, badges, and quick-action buttons.
5. **Parts 5–11 (Sheets)** — Rebuild each sheet. Verify the sheet-wrap/sheet-panel/sheet-handle/sheet-backdrop pattern matches v1 (the feed-check spec already fixed this — confirm it landed).

## Key Patterns to Preserve

- **Shared containers:** Add/Edit animal = one sheet. Note/Treatment/Breeding/BCS = one unified event sheet. Don't split these into separate sheets.
- **No innerHTML:** All HTML in the spec is a visual reference. Translate to `el()` / `text()` / `clear()`.
- **Scroll preservation:** When toggling animal selection checkboxes, save and restore `scrollTop` to prevent the list jumping.
- **Filter toggle:** Clicking a group row in the groups list toggles the animal list filter. Clicking again clears it.
- **Selection action bar:** Green sticky bar appears when any checkbox is ticked, disappears when all are cleared.

## OPEN_ITEMS Changes

None — no new open items from this session.

## Verification

After implementation, the Animals screen should visually match the v1 screenshot. Key things to check:
- Group filter chips across top (rounded pills, colored dots, green active state)
- Group rows with 3px left color bar and inline action buttons
- Animal rows with checkbox, inline badges (location, bred, todo count), quick-action button row
- All 17 sheets open and close correctly with v1 styling
