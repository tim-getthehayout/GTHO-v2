# Edit Animal silent-drop inputs — complete fix (damId, sireTag, weaned, confirmedBred)

**Type:** Data-integrity fix + schema amendment
**Priority:** P1 (silent data loss on every Edit Animal save today)
**Related OI:** OI-0099
**Prerequisite:** OI-0096 (shipped 2026-04-18 — already on main)
**CP-55 / CP-56 impact:** Yes — `animals.confirmed_bred` added to backup/restore shape

## Full spec

The full spec, including the **Locked design decisions (2026-04-18)** section, lives in `OPEN_ITEMS.md` § **OI-0099 — Edit Animal silent-drop inputs**. Read that entry end-to-end before implementing. This file is a thin pointer per the sprint workflow — do not duplicate the spec here.

## What's wrong in one paragraph

The Edit Animal dialog (`src/features/animals/index.js`) captures four inputs that `saveAnimal` silently drops: `damId`, `sireTag`, `weaned`, `confirmedBred`. Two are pure wiring bugs (Class A); two are "UI field without Supabase column" traps (Class B). Tim chose on 2026-04-18 to bundle all four into one ship rather than fix Class A first and leave Class B misleadingly live.

## The four fixes (post-design-lock summary)

1. **`damId` (Class A).** Add `damId: inputs.damId.value || null` to the `data` object in `saveAnimal`. Entity + column already exist.

2. **`weaned` + `weanedDate` (Class A).** Add `weaned: inputs.weaned?.checked ?? null` to the `data` object. When `weaned` flips from false to true, auto-stamp `weanedDate = todayStr` and render an editable date field so the farmer can back-date. When `weaned` flips off, clear `weanedDate` to `null`. Entity + `weaned_date` column already exist.

3. **`sireTag` → picker + inline Add AI bull (Class B).** Remove the freeform `<input type="text">`. Replace with a sire picker offering three modes:
   - **Animal in this herd** — select from `animals` filtered `operationId` and `sex === 'male'`. Row format: `{tagNum} — {name}`. Writes `sireAnimalId`.
   - **AI bull from list** — select from `ai_bulls` filtered `operationId` and `archived === false`. Row format: `{name} · {tag}` when tag exists. Writes `sireAiBullId`.
   - **Add AI bull (inline)** — tiny sub-dialog captures `name` (required), `tag` (optional), `breed` (optional). Creates a new `ai_bulls` record via `AiBullEntity.create()` + the standard 5-param `add('aiBulls', ...)`. Immediately sets `sireAiBullId` on the current animal and returns the farmer to Edit Animal.
   - Mutual exclusivity enforced: only one of `sireAnimalId` / `sireAiBullId` is set at a time. Selecting a new sire in either list clears the other.
   - **No new `animals` column.** No schema change for sire.
   - **Semantic note to acknowledge in code comments:** `ai_bulls` will effectively hold historical/external non-AI bulls that farmers enter inline. Acceptable; a rename or split is a separate future OI.

4. **`confirmedBred` → new column (Class B).** Add `animals.confirmed_bred boolean NOT NULL DEFAULT false`. New migration file. Entity gains `confirmedBred` field (`FIELDS`, `create`, `validate`, `toSupabaseShape`, `fromSupabaseShape` all updated). `saveAnimal` reads `inputs.confirmedBred?.checked ?? false`.

## Schema change (definite)

- **New column:** `animals.confirmed_bred boolean NOT NULL DEFAULT false`
- **Migration file:** `supabase/migrations/NNN_add_confirmed_bred.sql` (next available number — verify with `ls supabase/migrations/`)
- **Migration must end with** `UPDATE operations SET schema_version = N;` per CLAUDE.md Code Quality Check #6
- **`BACKUP_MIGRATIONS` entry** in `src/data/backup-migrations.js`: no-op because the column defaults to false and CP-56 can safely treat missing column as false. Example:
  ```js
  // Schema vN: add animals.confirmed_bred (default false)
  "N-1": (b) => { b.schema_version = N; return b; },
  ```
- **Migration Execution Rule applies (CLAUDE.md):** write + run + verify + report in commit message.
- **V2_SCHEMA_DESIGN.md §3.2** (`animals` table) updated to include `confirmed_bred boolean NOT NULL DEFAULT false`.

## CP-55 / CP-56 impact (definite)

- **CP-55** (`src/features/export/backup-export.js` or equivalent) — `animals` shape gains `confirmed_bred`. No other shape changes.
- **CP-56** (`src/features/import/backup-import.js` or equivalent) — migration-chain entry for the new schema version: backups from before this version treat missing `confirmed_bred` as `false`.
- **No impact** from the sireTag picker change — existing `sireAnimalId` / `sireAiBullId` columns are already handled.

## The pattern in one paragraph

For Class A, the fix is a one-line read into the `data` object in `saveAnimal`. For Class B sireTag, the fix is a UI replacement that reuses existing FK columns — no schema work, just a picker component and an inline bull-create sub-dialog. For Class B confirmedBred, the fix is a standard schema-first amendment: migration → entity → store call → UI read → tests → export/import spec → doc. Every store call in `saveAnimal` and the inline Add AI bull path must use the correct 5 / 6 / 3 param counts (CLAUDE.md pre-commit sanity check).

## Out of scope

- **Rename of `ai_bulls`** — semantic tension acknowledged in code comments; rename is a future OI if Tim decides to pursue it.
- **Breeding-history table (B6)** — explicitly deferred. A richer `animal_breeding_status` table would be overkill for this OI; open a separate design OI if needed.
- **`name` vs `tagNum` fallback** on line 1380 — intentional, not a bug.
- **Other inputs on the Edit Animal dialog** — only the four named inputs are in scope. Do not touch `sex`, `classId`, `birthDate`, `notes`, `groupId`, `tagNum`, `name`, `eid`, or the weight-history list.
- **OI-0098** (inline edit/delete of historical weight records) — separate, DESIGN REQUIRED.

## Acceptance criteria

See OI-0099 § "Acceptance criteria (bundled Class A + Class B, post design lock)" in `OPEN_ITEMS.md` for the full 21-item list. Headline checks:

- [ ] All four inputs round-trip through `saveAnimal` → `update()` → Supabase on edit
- [ ] `weanedDate` auto-stamp + editable date field + clear-on-uncheck behavior matches spec
- [ ] Sire picker renders with three modes (animal / AI bull / Add AI bull inline); picker rows show ear tag + name
- [ ] Inline Add AI bull creates an `ai_bulls` row and immediately sets `sireAiBullId` on the current animal
- [ ] `animals.confirmed_bred` migration written, executed, and verified per CLAUDE.md Migration Execution Rule
- [ ] `schema_version` ticks; `BACKUP_MIGRATIONS` no-op entry added
- [ ] V2_SCHEMA_DESIGN.md §3.2 updated
- [ ] CP-55 export shape gains `confirmed_bred`; CP-56 migration-chain entry added
- [ ] Unit tests: Edit Animal dialog round-trips all four inputs; entity shape round-trip covers `confirmedBred`
- [ ] E2E test verifies Supabase (not just localStorage) per CLAUDE.md E2E rule
- [ ] Param-count check passes on every `add()` / `update()` call in the touched paths
- [ ] PROJECT_CHANGELOG.md row added
- [ ] GitHub issue closed with commit hash

## Files likely affected

- `src/features/animals/index.js` — `saveAnimal` reads four inputs; Edit Animal dialog replaces sireTag input with picker; inline Add AI bull sub-dialog; weanedDate editable field
- `src/entities/animal.js` — `FIELDS`, `create`, `validate`, `toSupabaseShape`, `fromSupabaseShape` gain `confirmedBred`
- `src/entities/ai-bull.js` — no changes unless the inline create flow surfaces a missing helper
- `supabase/migrations/NNN_add_confirmed_bred.sql` — new file
- `src/data/backup-migrations.js` — new no-op entry
- `src/features/export/*` and `src/features/import/*` (CP-55 / CP-56) — animals shape gains `confirmed_bred`; import migration-chain entry added
- `V2_SCHEMA_DESIGN.md` — §3.2 animals table updated
- `tests/unit/animals.test.js` — Edit Animal test extended; shape round-trip test gains `confirmedBred`
- `tests/unit/ai-bull.test.js` (new or extend) — inline Add AI bull flow covered
- `tests/e2e/*` — new or extended e2e for Edit Animal five-input persistence with Supabase assertion
- `PROJECT_CHANGELOG.md` — new row

## Line-number reference (current as of 2026-04-18)

Line numbers drift; verify with grep before editing:
- `function saveAnimal` — ~1375 in `src/features/animals/index.js`
- `inputs.damId` — ~1228
- `inputs.sireTag` — ~1232 (to be removed)
- `inputs.weaned` — ~1259
- `inputs.confirmedBred` — ~1291
