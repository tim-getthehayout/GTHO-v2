# OI-0151 — Store notifications have no batch concept; bulk operations fire one synchronous notify per entity type → dashboard rerender storm (Phase 1)

**Priority:** **P0 — app currently unusable on populated operations** (post-OI-0149 paint-first regression). Tim's cold-load froze the dashboard with locked menus and Chrome eventually killed the tab; reproduces every cold load until OI-0151 ships. Tim chose root-cause fix over hot-revert.
**Origin:** Full Phase 1 design + acceptance criteria + grep contracts + reproducer + architectural notes live in `OPEN_ITEMS.md` → OI-0151. This file is a thin pointer per the project rule "specs in OPEN_ITEMS.md, github/issues/ acts as a pointer."
**Labels:** `infra`, `sync`, `task`, `P0 — critical`
**Status:** **Phase 1 DESIGN LOCKED** — 2026-05-03 session, ready for Claude Code.

## Summary

Root-cause fix for the dashboard rerender storm OI-0149's paint-first exposed. The store's `notify(entityType)` was designed for "one mutation → one update"; any operation that mutates many entity types in sequence (the pull, future CP-56 import, v1 importer, future bulk flows) fires N synchronous notifications and drags every multi-subscription consumer (the dashboard subscribes the same `rerender` against six entity types) through N redundant rerenders.

**Phase 1 (this OI):**

1. Add `beginBatch()` / `endBatch()` to `src/data/store.js`. Counter-based — nested batches do not drain on inner `endBatch()`. Batch-aware `notify()` adds to a dirty set and short-circuits while a batch is open. Outside a batch, `notify()` queues a single microtask drain that absorbs further synchronous-tick notifications. The drain dedupes callbacks by identity so a callback registered against N dirty types fires once.
2. Wrap `_doPullAllRemote()`'s for-loop body in `try { beginBatch(); ... } finally { endBatch(); }` in `src/data/pull-remote.js`.

**Phase 2 (deferred):** CP-56 backup restore, v1 importer, future bulk-archive flows wrap their multi-mutation operations in `beginBatch() / endBatch()` opportunistically as they ship. CP-56 spec gets a one-line addition. Out of scope here.

## What ships (Phase 1)

- `src/data/store.js` — `batchDepth` / `dirtyEntities` / `drainQueued`; exports `beginBatch` / `endBatch`; `notify()` rewritten to add-then-coalesce; new `drainNotifications(dirtyTypes)` helper with identity dedupe and per-callback try/catch.
- `src/data/pull-remote.js` — for-loop body wrapped in `try { beginBatch(); ... } finally { endBatch(); }`. No other change.
- `tests/unit/store-batch.test.js` — new file: identity-dedup, nested batch counter, microtask coalescing, subscriber-throw isolation, defensive `endBatch` no-op, batch + microtask sharing the dirty set.
- `tests/unit/pull-remote.test.js` — extended with an integration `describe` that uses the real store via `vi.importActual`; asserts a 6-entity-type pull fires a multi-subscription callback exactly once.
- `tests/unit/store.test.js`, `tests/unit/integration.test.js`, `tests/unit/pull-remote-timestamp.test.js` — minor updates: tests that previously asserted on synchronous notify timing now `await Promise.resolve()` after the mutation; the store-mock in `pull-remote-timestamp.test.js` adds `beginBatch` / `endBatch` no-ops so the new imports resolve.

## Files (anticipated)

- `src/data/store.js` — batch primitive
- `src/data/pull-remote.js` — wrap merge loop in batch
- `tests/unit/store-batch.test.js` — new
- `tests/unit/pull-remote.test.js` — extended
- `tests/unit/store.test.js` / `tests/unit/integration.test.js` / `tests/unit/pull-remote-timestamp.test.js` — minimal updates for the new microtask contract
- `OPEN_ITEMS.md` — flip OI-0151 status to shipped + commit hash
- `PROJECT_CHANGELOG.md` — row

No source code changes outside the two files listed; no schema; no entity changes.

## Schema change

**NONE.**

## CP-55/CP-56 impact

**NONE for OI-0151's own scope.** Forward-link only: when CP-56 backup restore ships, its FK-ordered restore loop should wrap in `beginBatch() / endBatch()`. Spec note to add at that point.

## Acceptance criteria

See `OPEN_ITEMS.md` → OI-0151 → "Acceptance criteria — Phase 1" — full list. Highlights:

- `beginBatch` / `endBatch` exported from `src/data/store.js` with nested-batch counter.
- `notify()` is batch-aware AND microtask-coalesces outside batch.
- `drainNotifications` dedupes callbacks by identity.
- `_doPullAllRemote()` wrapped in `try { beginBatch(); ... } finally { endBatch(); }`.
- Unit test asserts a pull merging 6 entity types fires a registered callback exactly once.
- OI-0149's `tests/unit/main-boot.test.js` still passes unchanged (paint-first invariant intact).
- OI-0141's freshness invariant intact.
- OPEN_ITEMS.md flipped to shipped.
- PROJECT_CHANGELOG.md row added.
- GitHub issue closed with commit hash.

## Grep contracts (locked at design close-out)

All four must hold post-Phase-1:

- `grep -nE "export function beginBatch|export function endBatch" src/data/store.js` — ≥ 2 matches.
- `grep -nE "beginBatch\(\)" src/data/pull-remote.js` — ≥ 1 match.
- `grep -nE "queueMicrotask\(" src/data/store.js` — ≥ 1 match.
- `grep -nE "if \(fired\.has\(cb\)\) continue;" src/data/store.js` — ≥ 1 match.

## Project rules to apply

- **CLAUDE.md §"Code Quality Checks"** — `npx vitest run` green before commit.
- **CLAUDE.md §"OPEN_ITEMS.md Closure Discipline"** rule 2 — flip OI-0151 to shipped in the same commit. The OI-0148 commit-msg hook enforces.

## Not in scope

- **Phase 2** — opt-in `beginBatch/endBatch` wraps in CP-56 import, v1 importer, future bulk flows. Lands when those producers ship.
- **rAF-debounce in dashboard** — rejected. Fix the producer, not every consumer.

## Checklist for Claude Code

- [ ] Read `OPEN_ITEMS.md` → OI-0151 in full before starting (canonical design).
- [ ] Implement per the Phase 1 design.
- [ ] All four grep contracts hold.
- [ ] Full vitest suite green (`npx vitest run`).
- [ ] OI-0149's `tests/unit/main-boot.test.js` still passes.
- [ ] `npm run build` clean.
- [ ] Manual smoke test on Tim's populated op (cold load — dashboard paints, no freeze, exactly one rerender after the pull settles). Sync indicator still flips green ↔ amber correctly.
- [ ] OPEN_ITEMS.md OI-0151 flipped to shipped in the same commit (orphan-flip rule, enforced by OI-0148 hook).
- [ ] PROJECT_CHANGELOG.md row added.
- [ ] GitHub issue closed.
