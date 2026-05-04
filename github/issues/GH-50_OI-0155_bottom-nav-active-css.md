# OI-0155 — Mobile bottom-nav `.bnav-item.active` rule does not exist; OI-0154 set the class but mobile users see no visual difference (Phase 1)

**Priority:** P3 (cosmetic only; navigation works correctly on mobile, only the active-state highlight is invisible).
**Origin:** Full Phase 1 design + acceptance criteria + reproducer + architectural notes live in `OPEN_ITEMS.md` → OI-0155. This file is a thin pointer.
**Labels:** `infra`, `task`, `P3 — low`
**Status:** **Phase 1 DESIGN LOCKED** — 2026-05-03 session, ready for Claude Code immediately.

## Summary

Add the missing `.bnav-item.active` CSS rule that consumes the DOM contract OI-0154 established. Match the visual treatment of the desktop sidebar's `.dsk-nav-item.active` rule — same accent color and weight tokens — adapted for the bottom-nav's text-only labels.

## What ships (Phase 1)

- `src/styles/main.css` — two new rules immediately after the existing `.bnav-label` rule:
  - `.bnav-item.active { color: var(--green-d); }` — same accent color as the desktop active-state rule.
  - `.bnav-item.active .bnav-label { font-weight: 600; }` — bumps the label weight to match desktop. The cascade isn't enough here because `.bnav-label` has its own explicit `font-weight: 500`.
  - No SVG fill/stroke rule needed — the bottom-nav items are text-only today (the `renderBottomNav` builder appends only a `<span class="bnav-label">` child).
  - No new design tokens introduced.

## Files

- `src/styles/main.css` — single CSS rule block

No JS changes. No schema. No entity changes.

## Schema change

**NONE.**

## CP-55/CP-56 impact

**NONE** — pure CSS cosmetic.

## Acceptance criteria

See `OPEN_ITEMS.md` → OI-0155 → "Acceptance criteria — Phase 1". Highlights:

- Active bottom-nav item is visually distinguishable from inactive items on mobile.
- Visual treatment matches the desktop sidebar's active-state design intent.
- No regression on inactive `.bnav-item` styling.
- No regression on the desktop sidebar's `.dsk-nav-item.active` rule.

## Grep contracts

- `grep -nE "\.bnav-item\.active" src/styles/` — ≥ 1 match (the new rule).
- `grep -nE "\.bnav-item\b" src/styles/` — ≥ 1 match (base rule wasn't accidentally removed).
- `grep -nE "dsk-nav-item-active|\.dsk-nav-item\.active" src/styles/` — ≥ 1 match (desktop rule untouched).

## Project rules to apply

- **CLAUDE.md §"Code Quality Checks"** — `npx vitest run` green before commit.
- **CLAUDE.md §"OPEN_ITEMS.md Closure Discipline"** rule 2 — flip OI-0155 to closed in the same commit. The OI-0148 commit-msg hook enforces.

## Not in scope

- Optional getComputedStyle JS test — JSDOM doesn't auto-load the project CSS, so a computed-style assertion in unit tests is unreliable. The grep contract proves the rule is in source; visual confirmation requires a real browser. OI-0154's DOM-level toggle tests already cover the contract.

## Checklist for Claude Code

- [ ] Read `OPEN_ITEMS.md` → OI-0155 in full before starting (canonical design).
- [ ] Implement per the Phase 1 design (single CSS rule block).
- [ ] All three grep contracts hold.
- [ ] Full vitest suite green; OI-0146 / OI-0153 / OI-0154 tests still pass.
- [ ] `npm run lint` 0 errors; `npm run build` clean.
- [ ] Manual smoke test on mobile DevTools emulation (active bottom-nav item visually distinct; tap between items).
- [ ] OPEN_ITEMS.md OI-0155 flipped to closed in the same commit (orphan-flip rule, enforced by OI-0148 hook).
- [ ] PROJECT_CHANGELOG.md row added.
- [ ] GitHub issue closed.
