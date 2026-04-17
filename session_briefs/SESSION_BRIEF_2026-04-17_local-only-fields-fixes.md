## Session Handoff — 2026-04-17 (Local-Only Fields Audit: Backup Pipeline Fixes)

**Context:** Cowork ran a full local-only fields audit on v2 today (see `AUDIT_LOCAL_ONLY_FIELDS.md`). Six checks × 53 tables, with the live Supabase schema dump (`SCHEMA_DUMP_2026-04-17.md`) as ground truth. The entity-to-Supabase write path is clean — every field captured by the UI reaches Supabase. Three findings, all on the backup/restore path:

- **FIND-01 / OI-0089 (LOW, Cowork-owned):** doc drift in `V2_SCHEMA_DESIGN.md`. Not in this brief — Cowork will fix.
- **FIND-02 / OI-0087 (HIGH):** `event_observations` missing from both `BACKUP_TABLES` and `FK_ORDER`.
- **FIND-03 / OI-0088 (HIGH):** `CURRENT_SCHEMA_VERSION = 20` in backup-import.js is stale vs live `schema_version = 23`.

Both HIGH findings share one root cause: migrations 021, 022, 023 landed in Supabase without the `CLAUDE.md` Export/Import Spec Sync Rule being followed. Fixing the rule wasn't a judgment call at the time — it just wasn't remembered. This brief fixes the leaks and adds two tiny mechanical tests so the rule is enforced by CI rather than by memory.

**What Cowork did this session:** Wrote `AUDIT_LOCAL_ONLY_FIELDS.md`, added OI-0087/OI-0088/OI-0089 to `OPEN_ITEMS.md`, updated the OPEN_ITEMS Change Log, wrote this brief. No code changed.

---

## OPEN_ITEMS changes

Already applied by Cowork — no action needed here. Claude Code should close OI-0087 and OI-0088 in this session's commit message (OI-0089 stays open; it's Cowork's to close).

---

## Work Items (ordered)

### 1. Fix OI-0087 — add `event_observations` to backup export + import

**File:** `src/data/backup-export.js`

Add exactly one entry to the `BACKUP_TABLES` object at the position after `event_paddock_windows` and before `event_group_windows` (matches §5.3a FK order — position 32):

```js
event_observations: { paginate: true },
```

**File:** `src/data/backup-import.js`

Add exactly one entry to the `FK_ORDER` array at position 32 (between `'event_paddock_windows'` and `'event_group_windows'`):

```js
'event_observations',
```

**Verification:** After the edits, both `Object.keys(BACKUP_TABLES).length` and `FK_ORDER.length` must equal 50 (and equal `V2_MIGRATION_PLAN.md §5.3a` entry count).

### 2. Fix OI-0088 — bump `CURRENT_SCHEMA_VERSION` to 23

**File:** `src/data/backup-import.js`

Find the constant at the top of the file:

```js
const CURRENT_SCHEMA_VERSION = 20;
```

Change to:

```js
const CURRENT_SCHEMA_VERSION = 23;
```

**Verification:** `grep -n CURRENT_SCHEMA_VERSION src/data/backup-import.js` — should show the new value. `operations.schema_version` in live Supabase is 23 (confirmed in `SCHEMA_DUMP_2026-04-17.md` Q5).

Nothing else in backup-import.js needs to change. Cowork verified during the audit that `BACKUP_MIGRATIONS` entries 20, 21, 22 already exist and each advances `schema_version` by exactly 1 — the chain is complete, only the constant was stale.

### 3. Add two preventative unit tests

Both findings would have been caught at commit time by these tests. Add them so the next migration that forgets the spec-sync rule fails CI instead of shipping silently.

**New file:** `tests/unit/backup-sync.test.js`

```js
import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BACKUP_TABLES } from '../../src/data/backup-export.js';
import { FK_ORDER, CURRENT_SCHEMA_VERSION } from '../../src/data/backup-import.js';

describe('backup-sync invariants', () => {
  test('BACKUP_TABLES and FK_ORDER have the same length', () => {
    // If they diverge, a new table was added to one side of the backup pipeline
    // but not the other. Backups will silently drop data. See OI-0087.
    expect(Object.keys(BACKUP_TABLES).length).toBe(FK_ORDER.length);
  });

  test('every BACKUP_TABLES key is in FK_ORDER', () => {
    const exportKeys = Object.keys(BACKUP_TABLES).sort();
    const importOrder = [...FK_ORDER].sort();
    expect(exportKeys).toEqual(importOrder);
  });

  test('CURRENT_SCHEMA_VERSION matches latest migration file', () => {
    // If a migration lands without bumping this constant, current-version
    // backups are not round-trippable through the importer. See OI-0088.
    const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
    const nums = fs.readdirSync(migrationsDir)
      .map(f => parseInt(f.split('_')[0], 10))
      .filter(n => !Number.isNaN(n));
    expect(CURRENT_SCHEMA_VERSION).toBe(Math.max(...nums));
  });
});
```

**Requirements for the tests to run:**

1. `FK_ORDER` must be exported from `src/data/backup-import.js`. If it is currently declared with `const FK_ORDER = [...]` (no `export`), add `export`. Same for `CURRENT_SCHEMA_VERSION` if not already exported. These should be named exports — do not change default export shape.
2. `BACKUP_TABLES` should already be exported (verify).
3. If either change breaks an existing import elsewhere, fix the import sites in the same commit.

### 4. Run the full test suite

```bash
npx vitest run
```

Expected: all prior tests still pass, plus 3 new passing assertions from `backup-sync.test.js`.

### 5. Commit and push

```bash
cd /Users/timjoseph/Github/GTHO-v2
git add src/data/backup-export.js src/data/backup-import.js tests/unit/backup-sync.test.js PROJECT_CHANGELOG.md
git commit -m "fix: close backup-pipeline leaks caught by local-only fields audit (OI-0087, OI-0088)

- Add event_observations to BACKUP_TABLES (backup-export.js) at position 32
  per V2_MIGRATION_PLAN.md §5.3a FK order. Closes OI-0087.
- Add event_observations to FK_ORDER (backup-import.js) at matching position.
- Bump CURRENT_SCHEMA_VERSION from 20 to 23 (matches live operations.schema_version
  and highest migration file 023). Closes OI-0088.
- Add tests/unit/backup-sync.test.js with three mechanical invariants so the
  next spec-sync drift fails CI instead of shipping silently.

Audit details in AUDIT_LOCAL_ONLY_FIELDS.md (FIND-02, FIND-03).
Ground truth: SCHEMA_DUMP_2026-04-17.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
git push origin main
```

### 6. PROJECT_CHANGELOG.md row

Add one row:

> `2026-04-17 | fix | backup-export.js, backup-import.js, tests/unit/backup-sync.test.js | Closed OI-0087 and OI-0088 from Cowork's local-only fields audit. Added event_observations to BACKUP_TABLES/FK_ORDER; bumped CURRENT_SCHEMA_VERSION 20→23; added 3 mechanical invariant tests so the Export/Import Spec Sync Rule is enforced by CI.`

---

## Acceptance Criteria

- [ ] `Object.keys(BACKUP_TABLES).length === 50` and `FK_ORDER.length === 50`
- [ ] `event_observations` is at position 32 (0-indexed: between `event_paddock_windows` at 31 and `event_group_windows` at 33) in both structures
- [ ] `CURRENT_SCHEMA_VERSION === 23`
- [ ] `FK_ORDER` and `CURRENT_SCHEMA_VERSION` are exported from `backup-import.js`
- [ ] `tests/unit/backup-sync.test.js` exists with all three tests passing
- [ ] `npx vitest run` passes (all prior tests still green)
- [ ] Commit message closes OI-0087 and OI-0088
- [ ] PROJECT_CHANGELOG.md updated
- [ ] Pushed to `main`

---

## What NOT to do

- **Do not fix OI-0089.** That's Cowork's — it's a doc-drift fix in `V2_SCHEMA_DESIGN.md`, not a code change.
- **Do not refactor the backup pipeline.** Scoped changes only (CLAUDE.md rule). Three tiny edits plus one new test file.
- **Do not modify `BACKUP_MIGRATIONS`.** The chain was verified complete during the audit — entries 20, 21, 22 all exist and each bumps `schema_version` by 1.
- **Do not generate a new migration.** The live schema is already at 23; this is catch-up work for the backup constants, not new SQL.
- **Do not skip the tests.** The whole point of this session is to move from "remember the rule" to "CI enforces the rule."

---

## Follow-up

After this commit lands, the only remaining item from the audit is OI-0089 (doc drift in V2_SCHEMA_DESIGN.md) — Cowork will handle that in a separate session.

The preventative tests added here mean the next Cowork audit can be driven entirely by CI output rather than by a hand-run matrix. If the two tests stay green, `BACKUP_TABLES`, `FK_ORDER`, and `CURRENT_SCHEMA_VERSION` cannot drift from each other or from the migration files without failing the build.
