# OI-0150 — Dev Mode hardening sweep (Phase 1, three tracks)

**Priority:** P2 (no user-visible flow blocked; dev/audit and dev/logs are gated behind `is_dev`; freeze surface area expands as operation data grows; the logger pipe gap means the diagnostic surface we built does not see real errors).
**Origin:** Full Phase 1 design + acceptance criteria + grep contracts + reproducer + architectural notes live in `OPEN_ITEMS.md` → OI-0150. This file is a thin pointer per the project rule.
**Labels:** `infra`, `dev-mode`, `task`, `P2 — normal`
**Status:** **Phase 1 DESIGN LOCKED** — hold lifted 2026-05-04 after OI-0154 field-tested clean. Ready for Claude Code immediately.

## Summary

Three tracks of dev-mode hardening:

- **Track A — audit page render-yielding** (`src/features/dev-mode/audit.js`). Make `renderEventAudit` async + insert `await new Promise(r => setTimeout(r, 0))` between every two top-level sections. Yield between paddock-window iterations in `renderPaddockWindowBlocks`. Cap DMI-8 daily-breakdown table at 30 most-recent days behind a `<details>` disclosure for older days.
- **Track B — dev/logs viewer hardening** (`src/features/dev-mode/logs.js`). Debounce search input at 250ms. Lazy-render each row's `<pre>` block on first `toggle` event (memoize via `data-built` attribute). Lower `FETCH_LIMIT` 1000 → 200 with cursor-paginated "Load more" button using `lt('created_at', oldestSeen)`.
- **Track C — wire logger buffer → `app_logs`** (new `src/data/log-flush.js`, edits to `src/utils/logger.js` + `src/main.js` + `src/data/pull-remote.js`). New `flushLoggerBuffer()` decorates each buffer entry with `user_id` / `operation_id` / `session_id` / `app_version` and batch-inserts into `app_logs`. Boot stamps `gtho_session_id` in `sessionStorage`. Triggers: `visibilitychange` to hidden, `pagehide`, after every successful `pullAllRemote()`.

## Files (anticipated)

- `src/features/dev-mode/audit.js` — Track A edits
- `src/features/dev-mode/logs.js` — Track B edits
- `src/utils/logger.js` — Track C: `createEntry` stamps `session_id`
- `src/data/log-flush.js` — Track C: new file
- `src/data/pull-remote.js` — Track C: post-pull flush trigger
- `src/main.js` — Track C: boot session-id + visibility/pagehide handlers
- `tests/unit/dev-mode/audit-*.test.js` — Track A: adapt to async + add yielding-contract test
- `tests/unit/dev-mode/logs.test.js` (new) — Track B: debounce + lazy `<pre>` + cursor pagination
- `tests/unit/data/log-flush.test.js` (new) — Track C: flush + decoration + retry semantics

## Schema change

**NONE** for any track.

## CP-55/CP-56 impact

**NONE** — `app_logs` is already excluded from `BACKUP_TABLES` per `src/data/backup-export.js:15`. Track C just starts populating it; backup format unchanged.

## Acceptance

See `OPEN_ITEMS.md` → OI-0150 → "Acceptance criteria — Track A / Track B / Track C". Highlights:

- **Track A:** `renderEventAudit` is async; awaits `setTimeout(r, 0)` between every two top-level sections; `renderPaddockWindowBlocks` yields between windows; DMI-8 daily breakdown caps at 30 most-recent days unless older-days disclosure is opened.
- **Track B:** Search input debounced at 250ms; closed `<details>` rows have no `<pre>` child until first `toggle`; default fetch is 200 rows; "Load more" button pages with `lt('created_at', oldestSeen)`; CSV tooltip documents scope.
- **Track C:** After `logger.error(...)` an entry appears in `app_logs` for the current user within ~one visibility-change cycle; buffer is empty after successful flush; `session_id` populated and consistent within one browser session; RLS denial / offline failure leaves the buffer intact.

## Grep contracts

All seven must hold post-Phase-1:

- **Track A:**
  - `grep -nE "await new Promise\(r => setTimeout\(r, 0\)\)" src/features/dev-mode/audit.js` → ≥ 2 matches
  - `grep -nE "MOST_RECENT_DAYS|capDays" src/features/dev-mode/audit.js` → ≥ 1 match
- **Track B:**
  - `grep -nE "FETCH_LIMIT = 200" src/features/dev-mode/logs.js` → exactly 1 match
  - `grep -nE "data-built" src/features/dev-mode/logs.js` → ≥ 1 match
  - `grep -nE "debounce|setTimeout.*250" src/features/dev-mode/logs.js` → ≥ 1 match
- **Track C:**
  - `grep -rnE "flushLoggerBuffer" src/` → ≥ 4 matches (definition + 3 call sites)
  - `grep -rnE "gtho_session_id" src/` → ≥ 2 matches (set in main.js, read in log-flush.js)

## Project rules to apply

- **CLAUDE.md §"Code Quality Checks"** — `npx vitest run` green before commit.
- **CLAUDE.md §"OPEN_ITEMS.md Closure Discipline"** rule 2 — flip OI-0150 to closed in the same commit. The OI-0148 commit-msg hook enforces.
- **OI-0155 lesson** — pre-commit hygiene check on staged files. Cowork's design-doc edits in the working tree must be unstaged before commit so the OI-0150 boundary stays clean.

## Not in scope

- **Track A Phase 2** — O(n²) `.find()` inside `.filter()` patterns. The bottleneck is the synchronous render holding the main thread, not the per-iteration cost; yielding between sections fixes the user-visible problem.
- **Track B Phase 2** — virtual scrolling. With 200-row pages and lazy `<pre>` rendering, virtual scroll is overkill until track C drives real volume.
- **Track C Phase 2** — realtime subscription. The flush triggers cover "see what happened in my session"; if Tim wants live error streaming he refreshes dev/logs.

## Bundling

Single commit unless there's a strong reason to split — the three tracks are related (all dev-mode hardening) and one commit keeps the orphan-flip + status-flip in OPEN_ITEMS.md atomic.

## Checklist for Claude Code

- [ ] Read `OPEN_ITEMS.md` → OI-0150 in full before starting (canonical design).
- [ ] Implement all three tracks per the locked design.
- [ ] All seven grep contracts hold.
- [ ] Full vitest suite green (`npx vitest run`).
- [ ] `npm run lint` 0 errors; `npm run build` clean.
- [ ] Trace the mystery `app_logs` row: `select id, user_id, source, message, app_version, created_at from app_logs where user_id = auth.uid() limit 5;` — document any pre-existing rows in the close-out. If origin unknown, document as such.
- [ ] OPEN_ITEMS.md OI-0150 flipped to closed in the same commit (orphan-flip rule, enforced by OI-0148 hook).
- [ ] PROJECT_CHANGELOG.md row added.
- [ ] GitHub issue closed.
