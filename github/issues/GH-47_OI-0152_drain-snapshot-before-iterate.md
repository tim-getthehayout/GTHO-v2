# OI-0152 — `drainNotifications` iterates the live subscribers Set; recursive-resubscribe causes infinite loop — snapshot-before-iterate (Phase 1 hotfix)

**Priority:** **P0 — app currently locked.** Tab loads, dashboard paints, then `pullAllRemote()`'s end-of-batch drain enters an infinite loop inside `drainNotifications`. Confirmed via Sources-tab pause: page paused inside the minified `renderHeader` at the `unsubs.forEach(fn => fn())` cleanup line. Hard reload itself doesn't go through because the renderer is fully saturated.
**Origin:** Full Phase 1 design + acceptance criteria + grep contracts + reproducer + architectural notes live in `OPEN_ITEMS.md` → OI-0152. This file is a thin pointer per the project rule "specs in OPEN_ITEMS.md, github/issues/ acts as a pointer."
**Labels:** `infra`, `sync`, `task`, `P0 — critical`
**Status:** **Phase 1 DESIGN LOCKED** — 2026-05-03 session, ready for Claude Code.

## Summary

JS `Set` iteration visits values added during iteration. `drainNotifications` (introduced in OI-0151) iterates the live `subscribers[entityType]` Set; a recursive-resubscribe consumer (`renderHeader`'s `operationMembers` subscription unsubscribes itself and registers a new callback during its render) causes the iterator to visit the freshly-added entry, fire it, register another, and loop forever.

Producer-layer fix: snapshot `subs` to an array before iterating. New entries registered during a drain land in the *next* drain.

## What ships (Phase 1)

- `src/data/store.js` — single change in `drainNotifications`: `const snapshot = [...subs];` then iterate `snapshot` instead of the live Set. Inline comment explains the JS Set iteration semantics and OI-0152's reasoning.
- `tests/unit/store-batch.test.js` — extended with two cases:
  - Recursive-resubscribe pattern (mimicking `renderHeader`'s `operationMembers`) fires the callback exactly once per drain. Without the snapshot fix the test would loop forever (or trip Vitest's timeout).
  - Subscribers registered mid-drain are deferred to the next drain.

## Files

- `src/data/store.js` — snapshot-before-iterate
- `tests/unit/store-batch.test.js` — extended

No source code changes outside the one file; no schema; no entity changes.

## Schema change

**NONE.**

## CP-55/CP-56 impact

**NONE.**

## Acceptance criteria

See `OPEN_ITEMS.md` → OI-0152 → "Acceptance criteria — Phase 1" — full list. Highlights:

- `drainNotifications` snapshots `subs` to an array before the inner for-of.
- Boot on Tim's populated op no longer locks the tab; hard reload works while the app is open; console accepts JS input within 1s of paint.
- New unit test asserts callback fires exactly once per drain under recursive-resubscribe.
- All existing unit tests pass without modification.
- OI-0151's invariants intact (batch dedup-by-identity, microtask coalescing, error isolation).
- OPEN_ITEMS.md flipped to shipped.
- PROJECT_CHANGELOG.md row added.
- GitHub issue closed.

## Grep contracts (locked at design close-out)

Both must hold post-Phase-1:

- `grep -nE "const snapshot = \[\.\.\.subs\]" src/data/store.js` — ≥ 1 match.
- `grep -nE "for \(const cb of subs\)" src/data/store.js` — **0 matches**. The live-Set iteration is the bug; if it reappears, the regression is back.

## Project rules to apply

- **CLAUDE.md §"Code Quality Checks"** — `npx vitest run` green before commit.
- **CLAUDE.md §"OPEN_ITEMS.md Closure Discipline"** rule 2 — flip OI-0152 to shipped in the same commit. The OI-0148 commit-msg hook enforces.

## Not in scope

- **OI-0153** (held until OI-0152 ships) — consumer-side cleanup of `renderHeader`'s recursive-resubscribe pattern. Defense-in-depth, not the load-bearing fix.

## Checklist for Claude Code

- [ ] Read `OPEN_ITEMS.md` → OI-0152 in full before starting (canonical design).
- [ ] Implement per the Phase 1 design (single change in `drainNotifications`).
- [ ] Both grep contracts hold.
- [ ] Full vitest suite green (`npx vitest run`).
- [ ] OI-0151's `tests/unit/store-batch.test.js` cases still pass; OI-0149's `tests/unit/main-boot.test.js` still passes.
- [ ] `npm run build` clean.
- [ ] Manual smoke test on Tim's populated op (cold load — dashboard paints + stays responsive; `Object.keys(localStorage).length` in DevTools console returns immediately).
- [ ] OPEN_ITEMS.md OI-0152 flipped to shipped in the same commit (orphan-flip rule, enforced by OI-0148 hook).
- [ ] PROJECT_CHANGELOG.md row added.
- [ ] GitHub issue closed.
