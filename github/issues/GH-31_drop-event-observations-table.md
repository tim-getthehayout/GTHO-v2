# Drop `event_observations` table — migration 029 + code sweep (OI-0113)

**Added:** 2026-04-20
**Area:** v2-build / schema / observations / cleanup
**Priority:** P3 (no user-visible harm; pure hygiene + removes the last reference to a dead collection so a future reader can't resurface it)
**Decision:** Tim chose **Option A — drop (clean cut)** on 2026-04-20, conditional on a pre-spec audit confirming no live code still touches the table. Cowork ran the audit on 2026-04-20 and the findings are inlined below. This file is the implementation handoff.

**Thin-pointer note:** not a thin pointer — it's a schema drop plus an export/import spec update plus a cross-cutting grep-driven code sweep. At sprint reconciliation, V2_SCHEMA_DESIGN.md §5.8 is deleted (see below) and V2_MIGRATION_PLAN.md §5.3 / §5.3a drop the table from the list; those edits are authoritative once they land. Until then this file is the source of truth.

---

## Why we're doing this

OI-0112 (shipped `13a3327`, 2026-04-18) and OI-0119 (shipped `65fc3b8`, 2026-04-20) together zeroed every writer and every reader of `event_observations` in v2. All seven observation surfaces write to `paddock_observations` with `source: 'event' | 'survey'` and `type: 'open' | 'close'`. The DMI-8 chart — the last unmigrated reader — now reads the same table via the shared `dmi-chart-context.js` helper.

Keeping the table, entity, and backup pipeline rows for a dead collection has three concrete costs:

1. Every backup carries an empty table entry forever (CP-55 export loop hits it on every pagination pass).
2. Every new contributor reads the entity file, the table def, and the RLS policies and asks "what's this for?" — and the answer is "nothing, don't touch it." That's a documented trap surface waiting to happen.
3. The longer the dead table sits, the more likely a future feature reintroduces a writer or reader by analogy ("we have `paddock_observations` and `event_observations`, pick the right one") and we're back in OI-0119's "silent field-name drift" territory.

Option B (keep frozen with REVOKE INSERT + a CHECK constraint) preserves column inventory in case we ever re-separate observation tables. That argument is weak — `paddock_observations` with `source: 'event'` is semantically identical, the column set is already aligned, and if we ever need to split for scale or access reasons we'd do it from a fresh design anyway. Option A wins on every axis except "what if we change our mind in the next 6 months" and the cost of restoring in that hypothetical is recreating a 17-column table — a 10-line migration.

## Pre-spec audit findings (2026-04-20)

Complete grep sweep across `src/`, `tests/`, docs, and Supabase. **Everything Option A needs to touch is enumerated here** — no other references exist in live code.

### Live code references (must change)

| File | Line(s) | What it is | What to do |
|---|---|---|---|
| `src/entities/event-observation.js` | entire file | Entity file with FIELDS, create, validate, toSupabaseShape, fromSupabaseShape | **Delete** |
| `src/data/push-all.js` | 32, 72 | Import of `toSupabaseShape as eventObsToSb` + `eventObservations` entry in the push table | **Remove both lines** |
| `src/data/sync-registry.js` | 25, 83 | Import of `fromSupabaseShape as fromEventObservation` + `eventObservations` entry in the registry | **Remove both lines** |
| `src/data/store.js` | 29 | `'eventObservations'` in the entity type list constant | **Remove** |
| `src/data/store.js` | 447 | `observations: getAll('eventObservations').filter(o => o.eventId === eventId)...` inside `captureEventSnapshot` | **Remove the key from the returned object** |
| `src/data/store.js` | 479 | `{ key: 'eventObservations', data: snapshot.observations }` inside `restoreEventSnapshot`'s `childTypes` array | **Remove the entry** |
| `src/data/backup-export.js` | 38 | `event_observations: { paginate: true }` in BACKUP_TABLES | **Remove** |
| `src/data/backup-import.js` | 59 | `'event_observations'` in FK_ORDER | **Remove** |
| `src/data/backup-import.js` | 20 | `CURRENT_SCHEMA_VERSION = 28` | **Bump to 29** |
| `src/data/backup-migrations.js` | end of BACKUP_MIGRATIONS object | (new entry needed) | **Add `28: (b) => { delete b.tables?.event_observations; b.schema_version = 29; return b; }`** |

### Test references (must change)

| File | Line(s) | What to do |
|---|---|---|
| `tests/unit/entities/event-observation.test.js` | entire file | **Delete** |
| `tests/fixtures/backup-v14.json` | 111 (`"event_observations": []`) | **Leave as-is** — this is a v14 backup fixture. The BACKUP_MIGRATIONS chain carries the key forward to v28 then deletes it at the new 28→29 step. If the fixture is ever regenerated to a newer schema version, the key will naturally be absent. |
| `tests/unit/dmi-chart-context.test.js` | comment at line 4; test name at line 78 ("reads observations from paddock_observations (not event_observations)") | **Leave as-is** — these are useful negative-assertion test docs. The test body asserts behavior against `paddock_observations`, not against the dead table. Rename is cosmetic and not required, but if you touch the test for other reasons tighten the phrasing to "reads observations from paddock_observations (the event_observations table was dropped in migration 029)". |

### Stale comment references (update to avoid leaving dangling pointers to a deleted file)

| File | Line | Current text | Replace with |
|---|---|---|---|
| `src/entities/farm-setting.js` | 104 | `// pattern matches event-observation.js.` | `// pattern matches paddock-observation.js.` |
| `src/entities/batch.js` | 85 | `Pattern: \`event-observation.js\`.` | `Pattern: \`paddock-observation.js\`.` |
| `tests/unit/numeric-coercion-tier1.test.js` | 14 | `coerces exactly as \`event-observation.js\` does.` | `coerces exactly as \`paddock-observation.js\` does.` |

Rationale: these are docstring references pointing at the coercion pattern's canonical example. `event-observation.js` used the Tier 1 coercion pattern correctly; `paddock-observation.js` is its direct successor and uses the same `const n = (v) => v != null ? Number(v) : null;` pattern. Leaving the pointers in after deletion produces "go read this deleted file" instructions for future contributors.

### History references (do NOT touch)

| File | Why it stays |
|---|---|
| `supabase/migrations/021_create_event_observations.sql` | Migration history is immutable. Migration 029's DROP TABLE CASCADE handles the existing DB; the 021 file stays for anyone reproducing the chain. |
| `supabase/migrations/022_survey_bale_ring_columns.sql` (line 4 `ALTER TABLE event_observations ADD COLUMN ...`) | Same — history is immutable. The column drop rides along with CASCADE at migration 029. |
| `src/data/backup-migrations.js` lines 43 (`20 → 21: Create event_observations table (OI-0063, SP-2)`) + 45 (`21 → 22: Add bale_ring_residue_count to event_observations ...`) | These are historical migration-chain comments describing the 20→21 and 21→22 rules that any older backup still has to walk through. They stay for documentation; the new 28→29 rule is what discards the key for all older backups in one shot. |
| `src/features/events/dmi-chart-context.js` lines 7–8, 40 (comments explaining OI-0112/OI-0119 fix lineage) | Useful negative-assertion comments. Optional tiny edit: "NOT the dead event_observations collection" → "NOT the dropped event_observations collection (removed in migration 029, OI-0113)." Keep or reword at author's discretion. |
| `src/features/dashboard/index.js` line 1111 comment | Same rationale as dmi-chart-context.js. Optional reword. |
| `OPEN_ITEMS.md`, `PROJECT_CHANGELOG.md`, `IMPROVEMENTS.md`, `V2_*.md`, `SESSION_BRIEF_*.md`, `GH-*.md`, `UI_SPRINT_SPEC.md`, `AUDIT_LOCAL_ONLY_FIELDS.md`, `SCHEMA_DUMP_2026-04-17.md`, `TASKS.md` | All historical docs. Cowork updates the live docs (V2_SCHEMA_DESIGN.md §5.8 removal, V2_MIGRATION_PLAN.md §5.3 / §5.3a updates) in the same commit as this one, but does NOT rewrite closed OI entries or past change log rows. |

### Supabase data audit

At audit time the Supabase table has **one row**:

```
id: ef5221a6-911f-48f9-8e6f-6ad4f223d123
operation_id: ef11ee62-b720-4f0c-848a-18e1dd93de30
event_id: da54838f-c79d-4749-a74f-601c7139599f
paddock_window_id: null
observation_phase: pre_graze
forage_height_cm: 25.40
forage_cover_pct: 95.00
forage_quality: 95
forage_condition: lush
created_at: 2026-04-18 16:56:24 UTC
updated_at: 2026-04-18 16:56:48 UTC
```

Not zero rows as the original OI assumed. This is a **pre-OI-0112 orphan** — the row was written 2026-04-18 during the morning of the observation-boxes redesign ship day, before the writer migration landed in commit `13a3327`. Its parent event (`da54838f-...`) still exists and has two `event_paddock_windows` and **two matching `paddock_observations` rows** (source='event', type='open', tied to the paddock windows). So the event's pre-graze data is intact in `paddock_observations` and the `event_observations` row is genuinely dead weight with no information that isn't already represented correctly elsewhere.

**Implication:** dropping the table loses nothing. The CASCADE handles the single row + its RLS policies + the `bale_ring_residue_count` column added by migration 022.

---

## Implementation

### 1. Migration 029 — drop the table

Create `supabase/migrations/029_drop_event_observations.sql`:

```sql
-- Migration 029: Drop event_observations table (OI-0113)
-- OI-0112 (2026-04-18) migrated all writers to paddock_observations.
-- OI-0119 (2026-04-20) migrated the last reader (DMI-8 chart) to paddock_observations.
-- Pre-drop audit (2026-04-20) confirmed: one pre-OI-0112 orphan row, zero live readers,
-- zero live writers. The event referenced by that row has equivalent pre-graze data in
-- paddock_observations — drop is safe.

DROP TABLE IF EXISTS event_observations CASCADE;

UPDATE operations SET schema_version = 29;
```

CASCADE handles:
- RLS policies created in migration 021 (`event_observations_select`, `_insert`, `_update`, `_delete`).
- The `bale_ring_residue_count` column added in migration 022.
- The one pre-OI-0112 orphan row.

Execute + verify per CLAUDE.md §"Migration Execution Rule":

1. Write the file.
2. Execute via Supabase MCP: `mcp__...__apply_migration` with the SQL.
3. Verify via `mcp__...__execute_sql` with `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'event_observations';` — must return `0`.
4. Verify `SELECT schema_version FROM operations LIMIT 1;` returns `29`.
5. Report both verification results in the commit message.

### 2. Entity file deletion + imports

Delete `src/entities/event-observation.js`.

Remove the four referencing import lines listed in the audit table:
- `src/data/push-all.js:32` — `import { toSupabaseShape as eventObsToSb } from '../entities/event-observation.js';`
- `src/data/push-all.js:72` — `eventObservations: eventObsToSb,` inside the push table
- `src/data/sync-registry.js:25` — `import { fromSupabaseShape as fromEventObservation } from '../entities/event-observation.js';`
- `src/data/sync-registry.js:83` — `eventObservations: { table: 'event_observations', from: fromEventObservation },`

### 3. Store cleanup

`src/data/store.js`:

- Remove `'eventObservations'` from the entity-types list (line 29).
- Remove the `observations: getAll('eventObservations').filter(...)` key from the `captureEventSnapshot` return object (line 447).
- Remove the `{ key: 'eventObservations', data: snapshot.observations }` entry from `restoreEventSnapshot`'s `childTypes` array (line 479).

Audit note: `captureEventSnapshot` and `restoreEventSnapshot` are defined but are not called from anywhere else in `src/`. They're dormant API intended for a future rollback feature. Dropping the two `eventObservations` lines doesn't change behavior because no caller exists; this is purely keeping the helper from going stale.

### 4. Backup pipeline — export / import / migration chain

`src/data/backup-export.js` line 38: remove `event_observations: { paginate: true },` from BACKUP_TABLES.

`src/data/backup-import.js`:
- Line 20: bump `const CURRENT_SCHEMA_VERSION = 28;` → `= 29;`
- Line 59: remove `'event_observations',` from FK_ORDER.

`src/data/backup-migrations.js`: add a new entry AFTER the existing 27→28 rule:

```js
  // 028 → 029: OI-0113 — drop event_observations table. Zero writers since
  //            OI-0112 (2026-04-18); zero readers since OI-0119 (2026-04-20).
  //            Older backups may carry the key with rows (e.g. the single
  //            pre-OI-0112 orphan observed on Tim's operation 2026-04-18).
  //            Discard the key — paddock_observations carries the equivalent
  //            data with source='event', type='open'/'close'.
  28: (b) => {
    if (b.tables) delete b.tables.event_observations;
    b.schema_version = 29;
    return b;
  },
```

### 5. Test cleanup

Delete `tests/unit/entities/event-observation.test.js`.

No change to `tests/fixtures/backup-v14.json` — the BACKUP_MIGRATIONS chain now carries v14 backups through to v29 and the new 28→29 step deletes the `event_observations` key cleanly. If existing backup-import tests assert a final state for a v14 fixture, verify they still pass after the chain extension; the `event_observations` key should no longer be present after migration (instead of being an empty array).

No change to `tests/unit/dmi-chart-context.test.js` — its `event_observations` references are negative-assertion docstrings that become more accurate, not less, after the drop.

### 6. Stale comment updates

Replace the three pointer comments enumerated in the audit table. All three point to `event-observation.js`'s Tier 1 numeric-coercion pattern; the natural successor is `paddock-observation.js` which uses the same pattern.

- `src/entities/farm-setting.js:104` — `// pattern matches event-observation.js.` → `// pattern matches paddock-observation.js.`
- `src/entities/batch.js:85` — ``Pattern: `event-observation.js`.`` → ``Pattern: `paddock-observation.js`.``
- `tests/unit/numeric-coercion-tier1.test.js:14` — ``coerces exactly as `event-observation.js` does.`` → ``coerces exactly as `paddock-observation.js` does.``

### 7. Base-doc removals (Cowork has pre-staged these — double-check in the commit)

- `V2_SCHEMA_DESIGN.md §5.8 event_observations` — the section is deleted in the Cowork commit that lands this spec. If for any reason it's still present when you start the implementation, flag it in the commit message and delete the section.
- `V2_MIGRATION_PLAN.md §5.3` — remove `event_observations` from the table list and from the FK-dependency order in §5.3a. CLAUDE.md §"Known Traps" ("FK-ordering in backup restore") requires §5.3a stays authoritative.

---

## Acceptance criteria

- [ ] `supabase/migrations/029_drop_event_observations.sql` exists, executed against Supabase, verified via `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'event_observations';` returning `0`. Commit message includes "Migration 029 applied and verified."
- [ ] `SELECT schema_version FROM operations LIMIT 1;` returns `29`.
- [ ] `src/entities/event-observation.js` deleted (file no longer exists).
- [ ] `tests/unit/entities/event-observation.test.js` deleted (file no longer exists).
- [ ] `grep -rn "event_observations\|eventObservations\|EventObservation\|event-observation" src/` returns zero matches, with the single acceptable exception being the optional historical comments in `dmi-chart-context.js` and `dashboard/index.js` if you choose to keep them reworded ("dropped in migration 029" phrasing). If you drop those comments entirely, grep must be fully clean.
- [ ] `grep -rn "event_observations\|eventObservations\|EventObservation" tests/` returns matches only in `tests/fixtures/backup-v14.json` (the historical fixture) and in `tests/unit/dmi-chart-context.test.js` if you kept its negative-assertion docstrings. No match in any other test file.
- [ ] `CURRENT_SCHEMA_VERSION === 29` in `src/data/backup-import.js`.
- [ ] `BACKUP_MIGRATIONS[28]` exists in `src/data/backup-migrations.js` and deletes `b.tables.event_observations`.
- [ ] `event_observations` removed from `BACKUP_TABLES` in `backup-export.js` and from `FK_ORDER` in `backup-import.js`.
- [ ] Three stale pointer comments updated (farm-setting.js, batch.js, numeric-coercion-tier1.test.js).
- [ ] V2_SCHEMA_DESIGN.md §5.8 removed; V2_MIGRATION_PLAN.md §5.3 + §5.3a updated. (Cowork-owned; verify they're present in the commit.)
- [ ] `npx vitest run` passes. Specifically: backup round-trip test still green with the v14 fixture (the `event_observations: []` key walks the chain to v29 and gets deleted at the new step); all entity tests still green.
- [ ] `PROJECT_CHANGELOG.md` row added with migration number 029, the count of removed references (~10 live code + 3 comments + 2 tests + 2 doc sections), and a "no user-visible impact" note.
- [ ] OPEN_ITEMS.md OI-0113 status flipped to `closed — 2026-04-20, commit {hash}` with a one-line ship summary.
- [ ] GitHub issue filed: `gh issue create --title "Drop event_observations table (OI-0113)" --body "$(cat github/issues/drop-event-observations-table.md)" --label "backend,schema,cleanup"`. Rename the file with the GH number prefix: `drop-event-observations-table.md` → `GH-{N}_drop-event-observations-table.md`. Close the issue after merge.

## CP-55 / CP-56 impact

**Yes** — captured in the BACKUP_MIGRATIONS[28] entry above.

- CP-55 (export): `event_observations` removed from BACKUP_TABLES — new backups will not include the table.
- CP-56 (import): `CURRENT_SCHEMA_VERSION` bumps to 29; the 28→29 migration rule discards any `tables.event_observations` key from older backups (schema v14 through v28). No round-trip loss because paddock_observations carries the equivalent data.
- FK_ORDER: `event_observations` removed — CP-56 delete phase no longer iterates the dropped table.

Per CLAUDE.md §"Export/Import Spec Sync Rule" this is flagged as a **removed column/table** change; CP-56's migration chain covers pre-v29 backups.

## Schema change

**Yes** — migration 029 drops the table and its policies (CASCADE). Bumps `schema_version` 28 → 29.

## Dependencies (all cleared)

- **OI-0111** (bale-ring metric rename) — shipped. Migration 027.
- **OI-0112** (observation boxes redesign, writer migration) — shipped `13a3327`, 2026-04-18.
- **OI-0117** (drop events.date_in / time_in) — shipped. Migration 028.
- **OI-0119** (DMI-8 cascade rewrite, last reader migration) — shipped `65fc3b8`, 2026-04-20.

Nothing blocks this ship.

## Risk notes

- Supabase has one orphan row today. If a second row lands between the audit (2026-04-20 ~afternoon) and the migration run, it also falls inside the CASCADE drop — no special handling needed. Worth a final `SELECT COUNT(*) FROM event_observations;` immediately before running the migration; if the count is unexpectedly large (say, >5), pause and flag before dropping.
- The `captureEventSnapshot` / `restoreEventSnapshot` pair has no live callers today. If a future rollback feature lands between when this issue is specced and when it ships and starts using those helpers with observation data, the rollback should go through `paddock_observations` instead. Flag this in the implementation commit if any adjacent code starts referencing the snapshot helpers.
- No grep contract is being added to CLAUDE.md for this — the three stale pointer-comment updates are one-shot cleanup, not a recurring class of bug. If a future contributor reintroduces a reference to `event_observations`, the grep check in the acceptance criteria above catches it at PR time.

## Related

- **OI-0063** — shipped the column alignment that made this table redundant. Closed.
- **OI-0087** — added `event_observations` to the backup pipeline. Closed. This OI un-adds it.
- **OI-0089** — V2_SCHEMA_DESIGN.md §5.8 added. Closed. This OI removes that section.
- **OI-0112** — Observation Boxes Redesign (writer migration). Closed.
- **OI-0119** — DMI-8 cascade rewrite (last reader migration). Closed.
- **OI-0117** — Derived event start datetime. Migration 028. Context for the numbering bump (028 is taken; this is 029).

---

**Session brief:** `session_briefs/SESSION_BRIEF_2026-04-20_oi0113-drop-event-observations.md`
