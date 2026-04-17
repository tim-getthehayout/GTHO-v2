# Local-Only Fields Audit — 2026-04-17

**Purpose.** Surface any data field that the app captures in localStorage but never syncs to Supabase. Six different leak points have burned v1 and v2 before (OI-0050, OI-0053, OI-0095, OI-0106, OI-0181, and the v1 dose-unit/area-unit class of bug). This audit treats live Supabase as the ground truth and reconciles every other source against it.

**Scope.** v2 (GTHO-v2 repo) — 53 tables, 53 entity files, 23 executed migrations, `schema_version = 23`.

**Ground truth.** `SCHEMA_DUMP_2026-04-17.md` — full `information_schema` dump including all tables, columns, FKs, RLS policies, and `operations.schema_version`. Produced by Claude Code via Supabase MCP (see `session_briefs/SESSION_BRIEF_2026-04-17_live-schema-dump.md`).

## Methodology — 5 sources × 6 checks

Every table is a row. Every check is a column. A cell is either green (passes) or a concrete finding.

### Sources enumerated

| Source | Count | Role |
|---|---|---|
| Live Supabase (Q1 schema dump) | 53 | Ground truth |
| `src/entities/*.js` | 53 | Code truth |
| `supabase/migrations/*.sql` CREATE TABLE | 53 | Migration truth |
| `src/data/sync-registry.js` | 52 + `app_logs` excluded by design | Pull-remote wiring |
| `V2_SCHEMA_DESIGN.md` | 51 | Design truth |
| `V2_MIGRATION_PLAN.md` §5.3a + §5.4 | 50 + 3 excluded | FK-ordered backup/restore truth |

### Checks run

1. **Live schema ↔ entity FIELDS parity** — every `sbColumn` in `FIELDS` must be a real Supabase column; every Supabase column (except reserved system columns) should be read by at least one entity.
2. **Shape function round-trip** — `toSupabaseShape()` and `fromSupabaseShape()` must mention every `FIELDS` entry and nothing else.
3. **Store `add`/`update`/`remove` param count** — 5 / 6 / 3 args respectively (OI-0050 class).
4. **Sync-registry coverage** — every non-`app_logs` entity type must be in `SYNC_REGISTRY` with a `table` and `fromSupabaseShape`.
5. **Backup export/import (CP-55/CP-56) coverage** — every non-excluded table must appear in both `BACKUP_TABLES` (export) and `FK_ORDER` (import); `CURRENT_SCHEMA_VERSION` must match live `operations.schema_version`.
6. **Migration execution** — already verified by Claude Code: DB `schema_version = 23` matches highest file `023_feed_removal_columns.sql`. No ghost migrations.

### Automation

The column-level diffs were mechanical Python scripts run against `/sessions/keen-bold-einstein/mnt/GTHO-v2/` — see the session transcript for the exact scripts. Every check took < 2 seconds so re-running the audit as a periodic pre-deploy gate is cheap.

## Results matrix

| Check | Coverage | Findings |
|---|---|---|
| 1. Entity ↔ live column parity | 53/53 entities | ✅ 0 |
| 2. Shape function round-trip | 53/53 entities | ✅ 0 |
| 3. Store param count (OI-0050 class) | 215 call sites (96 add + 75 update + 44 remove) | ✅ 0 |
| 4. Sync-registry coverage | 52/52 non-`app_logs` entity types | ✅ 0 |
| 5. Backup export/import (CP-55/CP-56) | 53 tables | ⚠️ **3 findings** |
| 6. Migration execution | `schema_version = 23` = file 023 | ✅ 0 |

**Bottom line.** The entity-to-Supabase write path is clean. Every field captured by the UI reaches Supabase. The only leaks sit on the backup/restore path — real data is in Supabase, but a backup round-trip through the current `backup-export.js` / `backup-import.js` silently drops `event_observations` and rejects current-version backups entirely.

## Findings

### FIND-01 — V2_SCHEMA_DESIGN.md missing two tables (LOW)

Two tables exist in live Supabase, in all entity/store/migration/backup code, and in `V2_MIGRATION_PLAN.md §5.3a` — but are not documented in the canonical design doc:

- `animal_notes` — added in migration 012 (`012_d9_animal_notes.sql`)
- `event_observations` — added in migration 021 (`021_create_event_observations.sql`)

**Impact.** Pure doc drift. Any contributor treating `V2_SCHEMA_DESIGN.md` as canonical will not know these tables exist. No runtime effect.

**Fix.** Add §3.5 `animal_notes` and §5.8 `event_observations` sections to `V2_SCHEMA_DESIGN.md` with full field lists.

**Tracked as:** OI-0089.

### FIND-02 — `event_observations` missing from backup pipeline (HIGH)

Migration 021 created the `event_observations` table. The entity file, store, sync-registry, live Supabase, and §5.3a FK list all know about it. But:

| File | Status |
|---|---|
| `src/data/backup-export.js` `BACKUP_TABLES` | ❌ Missing (has 49 entries, should have 50) |
| `src/data/backup-import.js` `FK_ORDER` | ❌ Missing (has 49 entries, should have 50 at position 32) |

**Impact.** Farmers creating event observations (a SP-2-era feature) have their data written to Supabase correctly, but:

- Exporting a backup silently drops every observation.
- Restoring a backup from before `event_observations` existed leaves `event_observations` untouched, which is fine.
- Restoring a backup from *today*, if observations were captured in that backup's source Supabase, silently drops them — because `BACKUP_TABLES` never fetched them in the first place.

The latent risk compounds over time: every event observation ever created is at risk of loss the moment a farmer restores a backup to reset state or migrate between environments.

**Root cause.** Migration 021 landed without updating the backup spec in lockstep. This is exactly the class of bug the `CLAUDE.md` "Export/Import Spec Sync Rule" was written to prevent — the rule just wasn't followed.

**Fix.**

1. Add `event_observations: { paginate: true },` to `BACKUP_TABLES` in `src/data/backup-export.js` (position per §5.3a — after `event_paddock_windows`, before `event_group_windows`).
2. Add `'event_observations',` to `FK_ORDER` in `src/data/backup-import.js` at position 32 (between `event_paddock_windows` and `event_group_windows`).
3. Add a test that asserts `FK_ORDER.length === Object.keys(BACKUP_TABLES).length === §5.3a length`. This is the mechanical check that would have caught this at commit time.

**Tracked as:** OI-0087.

### FIND-03 — `CURRENT_SCHEMA_VERSION` stale (HIGH)

```
backup-import.js: CURRENT_SCHEMA_VERSION = 20
live Supabase:   operations.schema_version = 23
```

The `BACKUP_MIGRATIONS` chain itself is fine — entries cover 14 → 15 → … → 22 → 23, so an old backup can be fully migrated forward. But `CURRENT_SCHEMA_VERSION = 20` is what the importer compares an incoming backup's `schema_version` against.

**Impact.** A backup exported today from the live app carries `schema_version: 23`. When re-imported into the current build:

- If the importer rejects future backups (`backup.schema_version > CURRENT_SCHEMA_VERSION`) → import fails entirely.
- If the importer caps migration at `CURRENT_SCHEMA_VERSION` → the chain stops at 20 and columns added in migrations 021–023 (`event_observations` table, `survey_bale_ring_columns`, `feed_removal_columns`) are not migrated. Any backup originating from those columns is silently mis-migrated.

Either way, **current-version backups are not round-trippable through the current app.** The specific failure mode depends on the importer's branch logic — exact severity is P0 if reject-on-future, P1 if silent mis-migration.

**Root cause.** Migrations 021, 022, 023 landed without bumping `CURRENT_SCHEMA_VERSION`. Same root cause as FIND-02 (spec-sync rule not followed).

**Fix.**

1. Update `src/data/backup-import.js`: `const CURRENT_SCHEMA_VERSION = 23;`
2. Verify `BACKUP_MIGRATIONS` entries 20, 21, 22 exist and each advances `schema_version` by 1 correctly.
3. Add a test that asserts `CURRENT_SCHEMA_VERSION === max(migration file numbers)`. Mechanical check catches the next one.

**Tracked as:** OI-0088.

## Preventative patterns

Both HIGH findings share a single root cause: **migrations landed in Supabase and in entity code without the `CLAUDE.md` Export/Import Spec Sync Rule being followed.** Rather than relying on the rule being remembered, a tiny mechanical test would make this class of bug impossible:

```js
// tests/unit/backup-sync.test.js
import { BACKUP_TABLES } from '../../src/data/backup-export.js';
import { FK_ORDER } from '../../src/data/backup-import.js';  // need to export it
import { CURRENT_SCHEMA_VERSION } from '../../src/data/backup-import.js';
import fs from 'fs';

test('BACKUP_TABLES matches FK_ORDER length', () => {
  expect(Object.keys(BACKUP_TABLES).length).toBe(FK_ORDER.length);
});

test('CURRENT_SCHEMA_VERSION matches latest migration file', () => {
  const migrations = fs.readdirSync('supabase/migrations')
    .map(f => parseInt(f.split('_')[0], 10))
    .filter(n => !Number.isNaN(n));
  expect(CURRENT_SCHEMA_VERSION).toBe(Math.max(...migrations));
});
```

Added to the session brief for Claude Code.

## Ongoing use

This matrix should be re-run before every schema migration lands. The full audit took < 5 minutes once the live schema dump was available, and the scripts are in the session transcript. If the two preventative tests from the "Preventative patterns" section are added to the unit test suite, they will catch future drift at commit time rather than requiring a separate audit.

## Change Log

| Date | Change |
|------|--------|
| 2026-04-17 | Initial audit. 6 checks × 53 tables. 3 findings (FIND-01 low, FIND-02/03 high). |
