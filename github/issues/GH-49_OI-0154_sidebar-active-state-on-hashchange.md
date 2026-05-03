# OI-0154 — Sidebar (and mobile bottom nav) active-menu-item state stays stale on navigation; hashchange listener was hidden behind the OI-0153 destructive rebuild (Phase 1)

**Priority:** P3 (visual nit; "Dashboard" stays highlighted regardless of which menu is clicked; navigation still works correctly, content renders correctly, only the active-state styling is wrong). Surfaced as a regression of OI-0153 but is structurally a latent bug all along — masked pre-OI-0153 by the destructive rebuild.
**Origin:** Full Phase 1 design + acceptance criteria + reproducer + architectural notes live in `OPEN_ITEMS.md` → OI-0154. This file is a thin pointer.
**Labels:** `infra`, `task`, `P3 — low`
**Status:** **Phase 1 DESIGN LOCKED** — 2026-05-03 session, ready for Claude Code immediately.

## Summary

Mirror the existing field-mode-pill hashchange pattern in `src/ui/header.js`. Two helpers (`updateActiveSidebarItem(container)` + `updateActiveBottomNavItem(container)`) registered on `hashchange`, plus a `data-href` attribute on each sidebar / bottom-nav item builder so the helpers can compare without needing the build code in scope.

## What ships (Phase 1)

- `src/ui/header.js`:
  - `data-href` attribute on each sidebar nav-item (`sidebarNavItem`, `sidebarNavItemBadge`) and each bottom-nav item (`renderBottomNav`'s loop).
  - `updateActiveSidebarItem(container)` helper — queries `.dsk-nav-item[data-href]`, toggles the `active` class to match the item whose `data-href` equals `window.location.hash || '#/'`. Mirrors the build-time logic (exact-match OR — for non-root hrefs — startsWith).
  - `updateActiveBottomNavItem(container)` helper — same logic scoped to `.bnav-item[data-href]`.
  - Hashchange listener registered inside `renderHeader`'s build path immediately after the existing field-mode-pill listener; cleanup pushed into `unsubs` for symmetry. `updateActiveItems()` called once at end of `renderHeader` so the initial mount is correct.
- `tests/unit/ui/header.test.js` — extend with five new cases:
  - Initial mount at `#/` highlights Dashboard.
  - Hashchange to `#/animals` moves the active class from Dashboard to Animals; sidebar / header / bottom-nav element identities unchanged (no chrome rebuild).
  - Three-route sweep (`#/` → `#/animals` → `#/settings` → `#/`) keeps the active class correct each time.
  - Bottom-nav items toggle their `active` class on hashchange (DOM contract; CSS hookup deferred).
  - Every sidebar + bottom-nav item carries `data-href` equal to its route hash.

## Files

- `src/ui/header.js` — single-file refactor
- `tests/unit/ui/header.test.js` — extend

No source code changes outside `src/ui/header.js`; no schema; no entity changes.

## Schema change

**NONE.**

## CP-55/CP-56 impact

**NONE** — pure UI fix in the header.

## Acceptance criteria

See `OPEN_ITEMS.md` → OI-0154 → "Acceptance criteria — Phase 1". Highlights:

- Clicking any sidebar menu item navigates *and* updates the highlighted item.
- Direct hash navigation (typing `#/animals`, browser back/forward) updates the active state without requiring a click.
- OI-0146 (chip) + OI-0153 (chip update) behaviors intact; field-mode pill swap intact.
- No additional re-render of header chrome on hashchange — only the active-class toggle.
- OPEN_ITEMS.md flipped to closed.
- PROJECT_CHANGELOG.md row added.
- GitHub issue closed.

## Grep contracts

- `grep -nE "renderHeader\(" src/ui/header.js` — only the public function definition + doc comments referencing the pre-OI-0153 destructive pattern; **no** callsite inside any hashchange or subscribe callback.
- `grep -nE "data-href" src/ui/header.js` — must return ≥ 8 matches.

## Project rules to apply

- **CLAUDE.md §"Code Quality Checks"** — `npx vitest run` green before commit.
- **CLAUDE.md §"OPEN_ITEMS.md Closure Discipline"** rule 2 — flip OI-0154 to closed in the same commit. The OI-0148 commit-msg hook enforces.

## Not in scope

- CSS rule for `.bnav-item.active` — bottom-nav today has no active visual style. The DOM toggle works; visual style is a separate cosmetic followup if Tim wants it.
- Sweep of other latent UI state that depended on the pre-OI-0153 destructive rebuild — file as a separate sweep OI if more than one surfaces.

## Checklist for Claude Code

- [ ] Read `OPEN_ITEMS.md` → OI-0154 in full before starting (canonical design).
- [ ] Implement per the Phase 1 design.
- [ ] Both grep contracts hold.
- [ ] Full vitest suite green; OI-0146 / OI-0153 invariant tests still pass.
- [ ] `npm run lint` 0 errors; `npm run build` clean.
- [ ] Manual smoke test on Tim's populated op (click each menu item, confirm active highlight moves; browser back/forward also moves it).
- [ ] OPEN_ITEMS.md OI-0154 flipped to closed in the same commit (orphan-flip rule, enforced by OI-0148 hook).
- [ ] PROJECT_CHANGELOG.md row added.
- [ ] GitHub issue closed.
