# OI-0149 — Cold-boot `pullAllRemote()` blocks paint; `visibilitychange` handler stacks concurrent pulls

**Priority:** P1 (every cold load and every tab-foreground gesture is exposed; observed three times in a single session 2026-05-03 — overnight on `#/dev/audit`, post tab-kill on `#/`, and on navigation to `#/dev/logs` with only one row of data).
**Origin:** Full Phase 1 design + acceptance criteria + grep contracts + reproducer + architectural notes live in `OPEN_ITEMS.md` → OI-0149. This file is a thin pointer per the project rule "specs in OPEN_ITEMS.md, github/issues/ acts as a pointer."
**Labels:** `infra`, `sync`, `task`, `P1 — high`
**Status:** **Phase 1 DESIGN LOCKED** — 2026-05-03 session, ready for Claude Code.

## Summary

Repair pass on OI-0141 (closed 2026-05-01). OI-0141's `visibilitychange` listener kicks `flush() + pullAllRemote()` on every tab foreground; combined with the existing cold-boot pattern of `await flush(); await pullAllRemote()` *before* route registration / `initRouter()`, every laptop wake / alt-tab repays ~50 sequential network round-trips in front of the user.

**Phase 1 (this OI):**

1. Restructure `showApp()` in `src/main.js` so route registration + `renderHeader` + `initRouter(content)` happen *before* the pull starts. Move `flush() + pullAllRemote()` to a fire-and-forget block after `initRouter`. Online + visibilitychange handlers no longer `await` at the call site — the dedupe at `pullAllRemote()` absorbs concurrent firings.
2. Add a module-scoped `inFlight` promise to `src/data/pull-remote.js` so two concurrent callers share one in-flight pull. Mirrors the `_flushing` guard pattern at `src/data/custom-sync.js:259`.

**Phase 2 (deferred, separate OI):** switch `pullAll(table)` to incremental `pull(table, since)` keyed off the existing `getLastPulledAt()`. Out of scope here — needs cold-boot fallback + schema-version-bump-resets-pull stories.

## What ships (Phase 1)

- `src/main.js` — `showApp()` paints from localStorage first; `flush() + pullAllRemote()` fire-and-forget after `initRouter(content)`; online + visibilitychange handlers no longer `await` the chain.
- `src/data/pull-remote.js` — `inFlight` promise dedupe; export remains `pullAllRemote()` with same signature.
- `tests/unit/pull-remote.test.js` — new tests covering the dedupe (two concurrent callers → one inner wave, `inFlight` clears after settle, including reject paths and the visibilitychange-during-boot timing case).
- `tests/unit/main-boot.test.js` — new tests asserting `route('#/', renderDashboard)` is registered and `initRouter(content)` is called before `adapter.pullAll(...)` resolves; `renderHeader` runs before `initRouter`.

## Files (anticipated)

- `src/main.js` — restructure `showApp()`
- `src/data/pull-remote.js` — `inFlight` promise + `_doPullAllRemote()` inner
- `tests/unit/pull-remote.test.js` — new
- `tests/unit/main-boot.test.js` — new
- `OPEN_ITEMS.md` — flip OI-0149 status to shipped + commit hash
- `PROJECT_CHANGELOG.md` — row

No source-code changes outside the two files listed; no schema; no entity changes.

## Schema change

**NONE.**

## CP-55/CP-56 impact

**NONE** — pure code reorganization in the boot/sync layer; no state shape change, no schema_version bump, no new tables, no entity field changes, no backup-format change.

## Acceptance criteria

See `OPEN_ITEMS.md` → OI-0149 → "Acceptance criteria — Phase 1" — full list, do not duplicate here. Highlights:

- `showApp()` calls `initRouter(content)` *before* `pullAllRemote()` starts.
- `pullAllRemote()` called twice in quick succession returns the same promise; only one wave of `adapter.pullAll(...)` requests fires.
- Visibilitychange-triggered pull while a boot pull is in flight does not fire a second wave.
- No regression on OI-0141's invariants: data from another device still appears within ~1 second of foregrounding; sync indicator still flips `sync-ok` ↔ `sync-stale` correctly.
- OPEN_ITEMS.md OI-0149 flipped to shipped in the same commit.
- PROJECT_CHANGELOG.md row added.
- GitHub issue closed.

## Grep contracts (locked at design close-out)

All three must hold post-Phase-1:

- `grep -nE "let inFlight|inFlight = null" src/data/pull-remote.js` — ≥ 2 matches (declaration + reset).
- `grep -nE "await pullAllRemote\(\)" src/main.js` — 0 matches.
- `grep -nE "await syncAdapter\.flush\(\)" src/main.js` — 0 matches.

## Project rules to apply

- **CLAUDE.md §"Code Quality Checks"** — `npx vitest run` green before commit.
- **CLAUDE.md §"OPEN_ITEMS.md Closure Discipline"** rule 2 — flip OI-0149 to shipped in the same commit. The OI-0148 commit-msg hook enforces.

## Not in scope

- **Phase 2** — incremental `since`-based pull. Separate OI when Phase 1 ships and field-tests clean.
- **Audit page render anti-patterns** (latent cousin per OI-0149's "Related" — the heavy synchronous render in `src/features/dev-mode/audit.js`, dev/logs viewer with no debounce, fixed `FETCH_LIMIT = 1000`). Worth a follow-on OI: "render-yielding in heavy dev-mode screens." Not OI-0149's scope.
- **`app_logs` client write path** — viewer reads from a table the v2 client never populates. Filed-but-deferred candidate for the same follow-on.

## Checklist for Claude Code

- [ ] Read `OPEN_ITEMS.md` → OI-0149 in full before starting (canonical design).
- [ ] Implement per the Phase 1 design.
- [ ] All three grep contracts hold.
- [ ] Full vitest suite green (`npx vitest run`).
- [ ] OPEN_ITEMS.md OI-0149 flipped to shipped in the same commit (orphan-flip rule, enforced by OI-0148 hook).
- [ ] PROJECT_CHANGELOG.md row added.
- [ ] GitHub issue closed.
