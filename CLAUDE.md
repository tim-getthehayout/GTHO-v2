# CLAUDE.md — GTHO v2

## Project Overview

**GTHO v2** is the full rebuild of Get The Hay Out — a pasture tracking and grazing management PWA. This repo contains both the design docs (Phase 1–2) and the application code (Phase 3+).

- **Stack:** Vanilla JS (ES modules), Vite, Supabase, GitHub Pages
- **Design docs:** `*.md` files in repo root — approved specs that define what to build
- **Application code:** `src/` directory — implemented from the design docs
- **Live v1 site:** getthehayout.com (separate repo: `get-the-hay-out`)

## Active Sprint: UI Improvements (2026-04-15)

**TEMPORARY — remove after reconciliation session.**

A UI sprint is in progress. All new UI design decisions are in `UI_SPRINT_SPEC.md` (repo root). **Read this file before implementing any dashboard, event detail, or location card work.** It contains specs SP-1 through SP-3 that supersede the base docs where they conflict.

The base docs (V2_UX_FLOWS.md §17.7 and §17.15) have already been partially updated, but SP-3 (card enrichment) lives only in the sprint spec for now.

`github/issues/` files for this sprint are full specs (not thin pointers) during the sprint. They will be converted to thin pointers during the reconciliation session.

## Start Here

1. Read `V2_BUILD_INDEX.md` — master tracker, current phase, what's done and what's next
2. **Read `UI_SPRINT_SPEC.md`** — active UI sprint specs (SP-1 through SP-3)
3. Check `OPEN_ITEMS.md` — unresolved design/build questions
3. Check `github/issues/` — spec files ready for implementation

## Git Workflow

- **`main`** — single branch, all work committed directly
- **Deploy:** GitHub Actions workflow (`.github/workflows/deploy.yml`) runs lint → test → build → deploy to GitHub Pages on every push to main. Site at `https://tim-getthehayout.github.io/GTHO-v2/`
- Commit after each completed checkpoint or substantive edit
- **Never use worktree isolation** (`isolation: "worktree"`)

## Design Docs (read-only for Claude Code)

These are the approved specs. Claude Code reads them during implementation but does not edit them. Cowork owns all design doc changes.

| Document | Purpose |
|----------|---------|
| GTHO_V1_FEATURE_AUDIT.md | What v1 does (58 features, 12 anti-patterns) |
| V2_SCHEMA_DESIGN.md | All 51 tables across 11 domains |
| V2_APP_ARCHITECTURE.md | Code patterns: store, sync, DOM builder, sheets, router |
| V2_CALCULATION_SPEC.md | 35 registered formulas, registerCalc() pattern |
| V2_UX_FLOWS.md | 13 user interaction flows |
| V2_INFRASTRUCTURE.md | Units, i18n, logging, RLS, testing, CI, PWA |
| V2_DESIGN_SYSTEM.md | Color tokens, typography, spacing, components |
| V2_MIGRATION_PLAN.md | v1 → v2 data transforms, cutover plan |

## Implementation Rules

### IDs and Data Shape

- **All IDs:** `crypto.randomUUID()`, stored as native `uuid` type in Supabase
- **camelCase in JS, snake_case in Supabase.** Entity files handle mapping via `toSupabaseShape()` / `fromSupabaseShape()`
- **Metric internally.** All values stored in metric; `src/utils/units.js` handles display conversion

### Schema-First Development

Every data change starts with a migration SQL file, then the entity file, then feature code. Never add a UI field without a matching Supabase column.

For every new field:
1. SQL migration in `supabase/migrations/`
2. **Execute the migration against Supabase** (see rule below)
3. Entity file updated (`FIELDS`, `validate()`, `toSupabaseShape()`, `fromSupabaseShape()`)
4. Store getter/action updated
5. Feature code uses the field
6. Test covers the field

### Migration Execution Rule — Write + Run + Verify

**Every migration SQL file must be executed against the Supabase database in the same session it is created.** Writing a `.sql` file to `supabase/migrations/` is not sufficient — the database does not auto-apply migrations. A migration file that exists only on disk means the code references columns and policies that don't exist in Supabase, causing silent sync failures.

**Required sequence for every migration:**
1. **Write** the migration file to `supabase/migrations/NNN_description.sql`
2. **Execute** the SQL against Supabase via MCP (or provide the SQL for manual execution if MCP is unavailable)
3. **Verify** the change landed by querying the schema: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'TABLE' AND column_name = 'NEW_COLUMN';` (for new columns) or the equivalent check for policies, tables, or functions
4. **Report** the verification result in the commit message: "Migration NNN applied and verified"

If step 2 or 3 fails, do not proceed with entity/feature code. Fix the migration first.

**Why this matters:** Migrations 013–017 were committed as files but never executed (OI-0053). The app wrote to localStorage normally but every Supabase sync failed — columns didn't exist, RLS policies were wrong. The failure was silent to the user because the app reads from localStorage first. This class of bug is invisible until someone checks Supabase directly or tries to use a second device.

**Origin:** OI-0053 — five migrations committed but never executed against Supabase. Blocked all sync for onboarding and migration testing.

### Data Mutation Pattern

All mutations go through the store. Never mutate state directly from feature code.

```
store.addEvent(data)  // validate → mutate → persist → queue sync → notify subscribers
```

### Compute on Read

Derived values (DMI, NPK, cost, status, days on pasture) are never stored. They are computed via registered calculations. See V2_CALCULATION_SPEC.md.

### Logging

No `console.error` in feature code. Use `logger.error(category, message, context)` from `src/utils/logger.js`. `console.*` is only acceptable in logger.js itself and in test files.

### No innerHTML

All dynamic content uses the DOM builder (`el()`, `text()`, `clear()`). No innerHTML with user-supplied data. XSS prevention at the framework level.

### File Organization

- `src/entities/` — one file per table, kebab-case matching table name
- `src/features/` — organized by domain (events/, feed/, animals/, etc.)
- `src/data/` — store, sync adapter, localStorage, Supabase client
- `src/ui/` — DOM builder, sheet class, router, header
- `src/utils/` — validators, units, calc registry, logger, date utils
- `src/i18n/` — t() function, locale files
- `supabase/migrations/` — numbered SQL migration files
- `tests/unit/` — Vitest (one per entity, one per calc, one per util)
- `tests/e2e/` — Playwright (critical user flows)

### Code Quality Checks (before every commit)

1. `npx vitest run` — all unit tests pass
2. No `innerHTML` assignments with dynamic content
3. Every entity export includes: `FIELDS`, `create()`, `validate()`, `toSupabaseShape()`, `fromSupabaseShape()`
4. Every store action follows: validate → mutate → persist → queue sync → notify
5. No hardcoded English — all user-facing strings use `t()`
6. Every new migration file must: (a) end with `UPDATE operations SET schema_version = N;` (b) add a `BACKUP_MIGRATIONS` entry in `src/data/backup-migrations.js` — no-op is fine: `N-1: (b) => { b.schema_version = N; return b; },` (c) if the migration adds a table or FK, update V2_MIGRATION_PLAN.md §5.3 and §5.3a. See V2_MIGRATION_PLAN.md §5.11a for rationale. "Always do it, no judgment calls."
7. **Store call param-count check:** Every `add()` call must have 5 params (`entityType, record, validateFn, toSupabaseFn, table`). Every `update()` call must have 6 params (`entityType, id, changes, validateFn, toSupabaseFn, table`). Every `remove()` call must have 3 params (`entityType, id, table`). Missing sync params (`toSupabaseFn`, `table`) cause silent data loss — records save to localStorage but never sync to Supabase. Grep for `add('` and `update('` with fewer than the required param count as a pre-commit sanity check. **Origin:** OI-0050 — onboarding and settings had 15 broken calls that went undetected because the app reads from localStorage first.

### E2E Testing — Verify Supabase, Not Just UI

E2E tests must verify that data reaches Supabase, not just that the UI renders correctly. After any write operation in an e2e test (onboarding, settings change, event creation, animal add, etc.), query Supabase directly to confirm the record exists. The app reads from localStorage first, so a broken sync path is invisible to UI-only assertions.

**Pattern for e2e sync verification:**
```js
// After UI action that creates a record:
const { data } = await supabase.from('table_name').select('id').eq('id', expectedId);
expect(data).toHaveLength(1);
```

**Why this matters:** A sync bug in onboarding (OI-0050) went undetected through all prior testing because e2e tests only checked localStorage/UI state. The app appeared to work perfectly in single-user mode while no data existed in Supabase.

## Invention Required — Stop and Flag

If a feature or checkpoint requires designing something that is **not spec'd in the design docs or a session brief**, do not invent it. Instead:

1. Add an entry to OPEN_ITEMS.md with status `open — DESIGN REQUIRED, do not build`
2. List the specific questions that need answering before implementation can start
3. Stop work on that feature and continue with other items that are fully spec'd
4. Do not make UI, data model, or flow decisions on behalf of the project — these require Tim's approval

**Examples of invention-required decisions:**
- A new UI flow with no wireframe or step description in the specs
- A new entity field not present in V2_SCHEMA_DESIGN.md
- A new Supabase table not in the schema design
- A user interaction pattern (wizard step, confirmation dialog, navigation route) with no spec

**When in doubt, flag it.** An OPEN_ITEMS.md entry is cheap. A wrong design decision requires a corrective commit.

## Architecture Audit — Before Every Commit

Before committing code, verify these consistency checks:

1. **Entity ↔ Schema alignment:** Every field in an entity's `FIELDS` must have a matching column in the migration SQL, and vice versa. Column types must match. `sbColumn` names must exactly match SQL column names.
2. **Shape round-trip:** `toSupabaseShape()` must map every field. `fromSupabaseShape()` must reverse every mapping. Unit tests verify: `fromSupabaseShape(toSupabaseShape(record))` returns the original.
3. **Store ↔ Entity alignment:** Every entity type in the store's state must have a corresponding entity file. Store actions must use `validate()` before persisting and `toSupabaseShape()` before syncing.
4. **Doc ↔ Code alignment:** If code deviates from the design docs, flag it — don't silently diverge. If intentional, note it in OPEN_ITEMS.md for Cowork to update the spec.
5. **Calc registry:** Every formula function must have a matching `registerCalc()` call. Registry metadata must match the actual implementation.
6. **Pure-insert flow invariants (OI-0115):** Some flows must NEVER mutate their parent entity — they're architecturally pure INSERTs. Protect these with grep-based pre-commit contracts:
   - `grep -rn "update('events'" src/features/events/submove.js` — must return 0 matches. Sub-move Open + Sub-move Close + Advance Strip are pure INSERT/UPDATE on `event_paddock_windows`; they must not touch the parent event.
   - Any subscription handler that writes to the store (e.g. detail.js's `dateInInput` change listener) must guard against phantom firing during a parent re-render cascade: check `elem.isConnected` before writing, and compare the new value to the render-time snapshot to reject no-op phantom events. Without these guards, a re-render that tears down the element can trigger a browser-fired `change` with a browser-default value — silently corrupting the store.
   - **Live-remaining consumers (OI-0139):** "Live remaining feed per (batchId, locationId)" is a pure read-time derivation — no column stores it, and every consumer must call the single helper `getLiveRemainingForMove(eventId)` in `src/calcs/feed-state.js`. The formula is `latestCheck.remainingQuantity + Σ deliveries with (date, time) strictly > latestCheck (date, time)`, falling back to `Σ all deliveries` when no prior check exists. The strict-`>` rule is load-bearing (a same-instant delivery is captured *by* the check, not in addition to it). The feed-check sheet (`src/features/feed/check.js`), move-wizard Step 3 (`src/features/events/move-wizard.js`), and sub-move close hint (`src/features/events/submove.js`) are the consumers. Grep contracts (run before every commit, all must hold):
     - `grep -nE "lastCheckUnits != null \?" src/features/feed/check.js` — must return 0 matches. The pre-OI-0139 per-line formula is gone; the sheet consumes the helper.
     - `grep -nE "\.localeCompare\(fcStamp\)|> fcStamp|>= fcStamp" src/calcs/feed-state.js` — must include at least one strict-`>` match and zero `>=` matches.
     - `grep -rn "getLiveRemainingForMove" src/` — every consumer surface that needs live-remaining must show up here. If you add a fourth surface (e.g. dashboard feed widget, report card), import the helper rather than re-deriving the formula. Origin: OI-0139 (2026-04-30 — Pasture D's 0-remaining check followed by a fresh bale silently disappeared from the next prefill because two consumers had drifted from each other).
7. **Derived-on-read invariants (OI-0117, OI-0133):** Fields that are derived from child rows at read time must not acquire stored columns on the parent. `events.date_in` / `events.time_in` were dropped in migration 028 because they duplicated the earliest child window. `groups.farm_id` was dropped in migration 032 (OI-0133) because it duplicated the destination-farm fact already carried by the group's open `event_group_window → event.farm_id` — and silently drifted on every cross-farm move that forgot to sync it. Grep contracts keep both regressions out:
   - `grep -rn "events\.date_in\|events\.time_in" src/` — must return 0 matches. The columns no longer exist in Supabase; any reference would indicate someone re-invented the bug class.
   - `grep -rn "\.dateIn\|\.timeIn" src/` — allowed hits are only `src/features/events/event-start.js` (the source of truth), `src/calcs/feed-forage.js` (DMI-8 receives a caller-decorated event), `src/features/events/feed-entry-inline-form.js` (pure validators receiving a decorated event), form-field names (`inputs.dateIn`, `state.dateIn`), v1 migration parsing (`ev.dateIn` / `ev.date_in`), and comments. No other live read of `event.dateIn` / `event.timeIn` is allowed — use `getEventStart(eventId)` / `getEventStartDate(eventId)` instead.
   - `grep -rn "groups\.farm_id\|g\.farm_id" src/` — allowed hits are only the `BACKUP_MIGRATIONS[31]` rule body in `src/data/backup-migrations.js` (which intentionally `delete g.farm_id` on every groups row in pre-v32 backups) and its adjacent comment. Any hit outside that rule indicates someone re-introduced the drift class.
   - `grep -rn "\.farmId" src/entities/group.js src/features/animals/index.js` — must return 0 matches aside from comments. No read of `group.farmId` is allowed — use `getGroupCurrentFarm(groupId)` in `src/data/store.js` instead.

### Corrections to Already-Built Code

Any corrective work on code that has already been committed must be logged in OPEN_ITEMS.md **before** beginning the fix: what is wrong, why it is wrong (which spec it violates), what the correct behavior should be, and which other files are affected. This ensures Tim always has visibility into what is being corrected and why. Do not silently fix and commit.

## Export/Import Spec Sync Rule

v2 maintains its own backup/restore format (CP-55 export, CP-56 import). Any change that alters the shape of app state — a new Supabase table, a new column, a new entity field, a renamed/removed field, a JSONB shape change, a migration number bump — can break backup/restore if the spec is not updated in lockstep.

**Rule:** Every schema or state-shape change must be flagged at the time it is proposed as "impacts CP-55/CP-56 spec." The flag includes what needs to be added, renamed, or removed in the export payload, and whether CP-56 needs a migration rule so older backups still import.

**Why this matters:** v1 burned us with "UI fields without Supabase columns = silent data loss" (see `Known Traps`). The same class of bug in v2 is "schema field without export/import spec entry = backup round-trip silently drops data." The backup is only a backup if everything round-trips.

**When to flag:**

| Change type | What the spec flag must cover |
|---|---|
| New Supabase table | Export includes the table. Import reads it. CP-56 handles missing-table case for old backups (empty default). |
| New column | Export serializes the column. Import reads it. CP-56 handles missing-column case for old backups. |
| Renamed column | Export uses the new name. CP-56 maps old name → new name for old backups. |
| Removed column | Export omits. CP-56 either drops the field or migrates it forward. Document which. |
| New entity field (in-memory only) | If the field is persisted to Supabase, same as column rule. If memory-only and derived, note that it is excluded from export. |
| JSONB shape change | Export serializes the new shape. CP-56 transforms old shape → new shape. |
| Schema version bump | `schema_version` stamp in the backup JSON must tick. CP-56's migration chain covers the new version. |

**How to apply:**

1. When Cowork specs a schema change, it must include a "CP-55/CP-56 spec impact" line in the spec file under `github/issues/`.
2. When Claude Code implements a schema change, verify that impact line is present and that CP-55/CP-56 specs reflect it. If they do not, add an entry to `OPEN_ITEMS.md` flagging the drift **before** committing the schema change.
3. Once CP-55 and CP-56 specs exist, they are the authoritative enumeration of what is in a backup. Any subsequent schema change that is not reflected in those specs is a drift and must be corrected in the same commit (or explicitly deferred with an OPEN_ITEMS entry naming the follow-up).
4. This rule applies from 2026-04-13 forward. Existing pre-CP-55 schema amendments (strip grazing columns, `operations.unit_system`, `user_preferences.active_farm_id`, `events.source_event_id`, `npk_price_history`, `animal_notes`, `animal_classes` rename/splits, `animal_calving_records.dried_off_date`, `farm_settings` forage quality scale, `app_logs` +operation_id/+context) are handled by the initial CP-55 spec write-up — they do not need retroactive flags.

## Fix Root Causes, Not Symptoms

When encountering a bug or missing capability, identify and fix the root cause. Do not overload existing fields, skip schema changes, or use workarounds unless the user explicitly chooses that path after seeing the options.

Present the options:
1. **Root cause fix** — the correct structural change
2. **Workaround** — quicker but less correct, and what it sacrifices

Default to root cause. If you catch yourself mapping new data into a field that wasn't designed for it, stop and flag it.

## Doc Ownership

**Cowork** owns (edits directly):
- All design docs (V2_*.md, GTHO_V1_FEATURE_AUDIT.md)
- **OPEN_ITEMS.md** — add/close/update entries
- **github/issues/** — spec files for Claude Code handoff
- **V2_BUILD_INDEX.md** — phase status and current focus

**Claude Code** owns (updates during implementation):
- **PROJECT_CHANGELOG.md** — one row per change, every commit
- **CLAUDE.md** — this file (only when rules need updating)
- All code in `src/`, `tests/`, `supabase/`

**Shared:**
- **IMPROVEMENTS.md** — anyone can log discoveries
- **TASKS.md** — Cowork updates design tasks, Claude Code updates build tasks

### TASKS.md Completion Rule

When a task tracked in TASKS.md is completed — whether a design task (Cowork) or a build task (Claude Code) — update TASKS.md in the same session. Check the box, and if the description needs updating to reflect what was actually delivered, update it. Do not leave completed work unchecked across sessions.

### Spec File Handoff (from Cowork)

Cowork writes spec files to `github/issues/`. Files without a `GH-` prefix are unfiled — Claude Code should:
1. Create a GitHub issue: `gh issue create --title "TITLE" --body "$(cat github/issues/FILENAME.md)" --label "LABELS"`
2. Rename the file: `FILENAME.md` → `GH-{number}_FILENAME.md`

### Closing GitHub Issues

When all acceptance criteria in a GitHub issue have been implemented, tested, and committed, close the issue:
```
gh issue close {number} --comment "Completed in commit {hash}. All acceptance criteria met, {N} tests passing."
```
Close the issue in the same session that completes the work — do not leave implemented issues open.

### Session Brief Handoff

When a SESSION_BRIEF is provided, look for `## OPEN_ITEMS changes` and apply all entries to `OPEN_ITEMS.md` before starting implementation work.

### OPEN_ITEMS.md Closure Discipline

Three close-out rules keep OPEN_ITEMS.md from drifting stale. All three apply at commit time — not during a later reconciliation sweep.

**1. Piggyback rule — grep for siblings before closing.** When a fix lands that closes an OI, grep OPEN_ITEMS.md for every sibling OI that references the same file path, feature name, or symbol. If the same code change resolves a sibling, flip it to closed in the same commit. One code change often closes multiple OIs — don't assume the headline is the only one.

**2. Orphan-flip belt-and-braces — commits that cite `OI-NNNN` must touch OPEN_ITEMS.md.** Any commit whose message references an OI ID must include a staged edit to `OPEN_ITEMS.md` in the same commit. Grep contract (post-commit check): if `git log -1 --format=%B | grep -E 'OI-[0-9]+'` matches, then `git diff-tree --no-commit-id --name-only -r HEAD | grep OPEN_ITEMS.md` must return a match. If it doesn't, the status line wasn't flipped — amend or follow with a corrective commit in the same session. Prevents the "fixed the code but forgot to flip the status line" class.

**3. Downstream-moot sweep — structural changes retire older OIs.** When a commit drops a table, renames a column, deletes a file, bumps `schema_version`, or adds a `BACKUP_MIGRATIONS` rule, grep `OPEN_ITEMS.md` for the retired symbol (column name, table name, filename, old version number). Flip any now-moot entries to closed with a "made moot by OI-NNNN / migration NNN" note in the same commit. The person shipping the structural change is the only one positioned to know the older OI became moot — a later reconciliation pass can only find it by accident.

**Origin:** 2026-04-20 reconciliation sweep flipped five OIs that had been stale a week or more: OI-0116 (piggyback — rode with OI-0117), OI-0052 (piggyback — rode with main.js auth rewrite), OI-0051 (orphan flip — shipped but never closed), OI-0087 and OI-0088 (downstream-moot — retired by OI-0113 dropping `event_observations` and migration 029 bumping schema_version to 29). Enforcing these three rules at commit time would have caught all five at the moment the fix landed.

## Build Phases

Implementation follows the checkpoint sequence in V2_BUILD_INDEX.md. Each phase has spec files in `github/issues/` that define exactly what to build.

| Phase | Scope |
|-------|-------|
| 3.1 Scaffold | Vite, store, entities, sync adapter, router, DOM builder, i18n, units, logger |
| 3.2 Core Loop | Events, locations, animals, dashboard, offline sync |
| 3.3 Assessment | Surveys, feed management, calc engine, reports |
| 3.4 Advanced | Rotation calendar, export/import, migration tool |
| 3.5 Polish | PWA, sync hardening, performance, accessibility, cutover |

**Rule:** Complete one checkpoint before starting the next. Commit after each checkpoint. Don't jump ahead.

## Scoped Changes Only

Only modify the specific file(s) needed for the requested change. Do not refactor, rename, or reformat surrounding code unless explicitly asked.

## Known Traps (v1 lessons)

These burned us in v1 — don't repeat them in v2:
- Missing sync calls after state mutation (v1: `queueWrite` forgotten in complex functions)
- UI fields without Supabase columns = silent data loss
- Duplicate function definitions silently overwrite each other
- Mutation functions that forget to notify subscribers = stale UI
- Unit confusion: always store metric, display converted
- **FK-ordering in backup restore.** Supabase enforces FK integrity at write time. Any wholesale delete/insert (CP-56 import, migration tooling, test fixture setup) must iterate tables in FK-dependency order — parents before children for inserts, children before parents for deletes. The authoritative order lives in **V2_MIGRATION_PLAN.md §5.3a**. Every schema change that adds a table or FK must update §5.3a in the same commit. Self-referential tables (currently `animals`, `events`) use the two-pass pattern documented in §5.3a.
- **PostgREST returns `numeric`/`decimal` columns as JavaScript strings** (arbitrary-precision safety), not numbers. Every entity's `fromSupabaseShape(row)` must coerce via `Number(row.col) != null ? Number(row.col) : null` for every field whose `FIELDS` entry has type `numeric` or `integer`. Pure integer types (int4/int8 under the safe-integer ceiling) come back as numbers, but coerce defensively anyway. Reference pattern: `src/entities/event-observation.js`. **Harm if skipped:** silent math corruption via concat (`"0"+"1"+"2"="012"`), `.toFixed()` TypeError at render time, strict `typeof === 'number'` validate rejection (records silently fail to persist), and lex comparisons on thresholds that render the wrong badge colour. Origin: OI-0103 → OI-0106 sweep (2026-04-18). Round-trip test required per new numeric column.
- **Phantom `change` / `blur` events on teardown-replaced inputs** can silently corrupt the store when a subscription cascade rebuilds a section while a form input is focused. Any change/blur handler that writes to the store (via `update()`) must guard with (a) `if (!elem.isConnected) return;` to skip phantom firings after the element was removed by a re-render, and (b) a value-identity check against the render-time snapshot so a phantom event with the same value is a no-op. Without both guards, iOS Safari in particular will fire `change` with a browser-default value (e.g. today's date on a `<input type="date">` whose native picker was implicitly focused during layout shift) and corrupt whatever the handler writes. Reference pattern: `src/features/events/detail.js:renderSummary` dateInInput handler. **Harm if skipped:** `event.date_in` or any other field written from a change handler gets overwritten with garbage during re-render cascades fired by other saves (e.g. sub-move Save → `notify('eventPaddockWindows')` → `renderSummary` → teardown → phantom change on the removed input). Origin: OI-0115 (2026-04-18).
- **Two stored columns for one derivable fact = silent drift.** `events.date_in` / `events.time_in` duplicated what the earliest child window (`event_paddock_windows.date_opened` / `event_group_windows.date_joined`) already held. OI-0115 was exactly this drift biting: sub-move Save overwrote the stored start via a phantom change event on a teardown-replaced input, and the parent event's stored start silently fell out of sync with every downstream calc that still read it. OI-0117 dropped both columns in migration 028; reads now go through `getEventStart(eventId)` / `getEventStartDate(eventId)` in `src/features/events/event-start.js`, and the hero-line edit writes through to the earliest child window via `setEventStart()`. **General rule:** if a value is derivable from child rows at read time, derive it on read — do not also store it on the parent. The only correct "copy" is the child row itself. Origin: OI-0117 (2026-04-18).
- **Backdated event entries must NEVER feed the group-window split changeDate.** Five callsites (cull-sheet, calving, weight, split-group, group-weigh) used to pass the user-supplied date as the `changeDate` arg to `maybeSplitForGroup` / `splitGroupWindow`. When the date predates the open `event_group_window`'s `date_joined`, `getLiveWindowHeadCount({ now: backdatedDate })` returns 0, `splitGroupWindow` silently delegates to `closeGroupWindow`, and the still-open window gets stamped closed with `date_left < date_joined` — erasing the group's location. The historical date belongs on the entity row only (membership `dateLeft` / `dateJoined`, calving `calvedAt`, weight `recordedAt`); the split call always uses today via `new Date().toISOString().slice(0, 10)`. Validator guards on `event-group-window` (`dateLeft >= dateJoined`) and `event-paddock-window` (`dateClosed >= dateOpened`) close the loop at save time. **Grep contracts** (run before commit, all three must return 0 matches):
  ```bash
  grep -rnE "maybeSplitForGroup\([^,]+, (cullDate|calvingDate|weighDate|dateInput\.value|date[^A-Z])" src/features/
  grep -rnE "splitGroupWindow\([^,]+, [^,]+, (cullDate|calvingDate|weighDate|dateInput\.value)" src/features/
  grep -rnE "closeGroupWindow\([^,]+, [^,]+, (cullDate|calvingDate|weighDate|dateInput\.value)" src/features/
  ```
  Origin: OI-0137 (2026-04-22 live repro on Tim's Cow-Calf Herd — single backdated cull silently unplaced the group).
