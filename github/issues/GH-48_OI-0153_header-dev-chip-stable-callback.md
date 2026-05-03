# OI-0153 — `renderHeader` `operationMembers` subscriber re-renders the entire header recursively (destructive even on single-pass execution); refactor to a stable update-the-chip callback (Phase 1)

**Priority:** **P0 — load-bearing consumer fix.** OI-0152 stopped the *infinite loop* in `drainNotifications`; the *single-pass destruction* still happens on every `operationMembers` notify. Pages paint, the boot pull settles a few seconds later, `clear(container); renderHeader(container);` fires once and wipes the `<main>` content area along with everything else under `app`. Menus stay clickable (rebuilt with the chrome) but new routes render into a detached `<main>`, leaving every screen blank. Hold lifted on smoke-test confirmation 2026-05-03.
**Origin:** Full Phase 1 design + acceptance criteria + reproducer + architectural notes live in `OPEN_ITEMS.md` → OI-0153. This file is a thin pointer per the project rule "specs in OPEN_ITEMS.md, github/issues/ acts as a pointer."
**Labels:** `infra`, `task`, `P0 — critical`
**Status:** **Phase 1 DESIGN LOCKED** — 2026-05-03 session, ready for Claude Code immediately (hold lifted).

## Summary

Replace the recursive-resubscribe `operationMembers` callback in `src/ui/header.js` with a stable update-only callback that mutates only the `[DEV]` chip in place. The callback identity stays consistent across `renderHeader` calls; the rest of the header (and the live `<main>` sibling under `app`) is left untouched.

## What ships (Phase 1)

- `src/ui/header.js`:
  - Extract `renderDevChip()` helper returning the chip `<button>` element (or `null` when the user is not dev). Same gating logic that lived inline in `renderHeader`'s build path; just lifted into its own function.
  - Add `updateDevChip(container)` helper that handles all four state transitions: chip → chip (replace), chip → null (remove), null → chip (insert at anchor), null → null (no-op).
  - Add `data-testid="header-dev-chip-anchor"` to the chip's parent (`header-right` cluster) so `updateDevChip` can insert when the chip wasn't there before.
  - Replace the recursive subscription `subscribe('operationMembers', () => { clear(container); renderHeader(container); })` with `subscribe('operationMembers', () => updateDevChip(container))`.
  - The `todos` subscription stays unchanged — `subscribe('todos', () => updateBadges())` is already a stable update-only callback.
- `tests/unit/ui/header.test.js` (new) — three cases:
  - Toggling `is_dev` on Tim's row mutates only the chip; sidebar / header / bottom-nav / chip-anchor identities stay stable; the simulated `<main>` sibling under `app` is preserved across the notify cycle (with text content intact).
  - `false → true` insertion lands the chip inside `header-dev-chip-anchor` and as the leftmost child (matching the build-path order).
  - Initial dev-true render carries the chip-anchor testid on the parent.

## Files

- `src/ui/header.js` — refactor
- `tests/unit/ui/header.test.js` — new

No source code changes outside `header.js`; no schema; no entity changes.

## Schema change

**NONE.**

## CP-55/CP-56 impact

**NONE** — pure UI refactor in the header.

## Acceptance criteria

See `OPEN_ITEMS.md` → OI-0153 → "Acceptance criteria — Phase 1". Highlights:

- Single `subscribe('operationMembers', ...)` call in `src/ui/header.js`; callback body does not contain `renderHeader(`.
- Toggling `is_dev` updates the chip within one drain cycle without rebuilding the rest of the header.
- Transient header state (open farm-picker, focused field-mode toggle) preserved across notifies.
- All existing unit tests pass; new test asserts chip toggles without re-invoking `renderHeader`.
- OPEN_ITEMS.md OI-0153 flipped to shipped.
- PROJECT_CHANGELOG.md row added.
- GitHub issue closed.

## Grep contracts (locked at design close-out)

Both must hold post-Phase-1:

- `grep -nE "subscribe\('operationMembers'" src/ui/header.js` — exactly **1 match**.
- `grep -nE "subscribe\('operationMembers'.*renderHeader" src/ui/header.js` — **0 matches**. Recursive callback body is the bug; if it reappears, the regression is back.

## Project rules to apply

- **CLAUDE.md §"Code Quality Checks"** — `npx vitest run` green before commit.
- **CLAUDE.md §"OPEN_ITEMS.md Closure Discipline"** rule 2 — flip OI-0153 to shipped in the same commit. The OI-0148 commit-msg hook enforces.

## Not in scope

- O(n²) sweep in audit / dashboard renderers (separate OI when those surfaces matter under load).
- Consumer audit for other `subscribe-to-yourself` patterns (none currently in the codebase per OI-0153's grep — this was the only example).

## Checklist for Claude Code

- [ ] Read `OPEN_ITEMS.md` → OI-0153 in full before starting (canonical design).
- [ ] Implement per the Phase 1 design.
- [ ] Both grep contracts hold.
- [ ] Full vitest suite green (`npx vitest run`); existing OI-0146 doorway tests still pass.
- [ ] `npm run lint` 0 errors; `npm run build` clean.
- [ ] Manual smoke test on Tim's populated op (cold load — dashboard paints + stays visible after the boot pull settles; menus + content render correctly across routes; `[DEV]` chip visible).
- [ ] OPEN_ITEMS.md OI-0153 flipped to shipped in the same commit (orphan-flip rule, enforced by OI-0148 hook).
- [ ] PROJECT_CHANGELOG.md row added.
- [ ] GitHub issue closed.
