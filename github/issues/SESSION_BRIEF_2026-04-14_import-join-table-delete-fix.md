# SESSION BRIEF — Add operation_id to 4 Tables + Fix Import Delete/Parity

**Date:** 2026-04-14
**From:** Cowork
**To:** Claude Code
**Context:** v1 import (CP-57) crashes during the delete phase of `importOperationBackup()` because four child/junction tables lack a direct `operation_id` column. The `deleteTableRows()` function does `WHERE operation_id = $1` on every table, which fails on `todo_assignments` with `column operation_id does not exist`. The `parityCheck()` function has the same bug. Rather than work around this with indirect queries through parent FKs, the root-cause fix is to add `operation_id` to all four tables — enforcing Design Principle #8 with no exceptions.

**Priority:** P1 — blocks all v1 → v2 data migration testing.

**OI:** OI-0055

---

## What to do

### Part 1 — Migration 019: Add operation_id to four tables

**File:** `supabase/migrations/019_add_operation_id_to_child_tables.sql`

Add `operation_id uuid NOT NULL REFERENCES operations(id)` to these four tables. Since the tables may already have rows (from onboarding seed data or prior testing), the migration must:

1. Add the column as nullable first
2. Backfill from the parent table
3. Set NOT NULL constraint
4. Add the FK constraint

```sql
-- 1. event_feed_check_items: backfill from event_feed_checks
ALTER TABLE event_feed_check_items ADD COLUMN operation_id uuid;

UPDATE event_feed_check_items ci
SET operation_id = fc.operation_id
FROM event_feed_checks fc
WHERE ci.feed_check_id = fc.id;

ALTER TABLE event_feed_check_items ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE event_feed_check_items
  ADD CONSTRAINT event_feed_check_items_operation_id_fkey
  FOREIGN KEY (operation_id) REFERENCES operations(id);

-- 2. harvest_event_fields: backfill from harvest_events
ALTER TABLE harvest_event_fields ADD COLUMN operation_id uuid;

UPDATE harvest_event_fields hf
SET operation_id = he.operation_id
FROM harvest_events he
WHERE hf.harvest_event_id = he.id;

ALTER TABLE harvest_event_fields ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE harvest_event_fields
  ADD CONSTRAINT harvest_event_fields_operation_id_fkey
  FOREIGN KEY (operation_id) REFERENCES operations(id);

-- 3. survey_draft_entries: backfill from surveys
ALTER TABLE survey_draft_entries ADD COLUMN operation_id uuid;

UPDATE survey_draft_entries sde
SET operation_id = s.operation_id
FROM surveys s
WHERE sde.survey_id = s.id;

ALTER TABLE survey_draft_entries ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE survey_draft_entries
  ADD CONSTRAINT survey_draft_entries_operation_id_fkey
  FOREIGN KEY (operation_id) REFERENCES operations(id);

-- 4. todo_assignments: backfill from todos
ALTER TABLE todo_assignments ADD COLUMN operation_id uuid;

UPDATE todo_assignments ta
SET operation_id = t.operation_id
FROM todos t
WHERE ta.todo_id = t.id;

ALTER TABLE todo_assignments ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE todo_assignments
  ADD CONSTRAINT todo_assignments_operation_id_fkey
  FOREIGN KEY (operation_id) REFERENCES operations(id);

-- 5. Update RLS policies for these four tables
-- The existing INSERT policies are WITH CHECK (true) — no change needed.
-- The existing SELECT/UPDATE/DELETE policies use join-based checks —
-- replace with the standard direct operation_id pattern.

-- event_feed_check_items
DROP POLICY IF EXISTS event_feed_check_items_select ON event_feed_check_items;
CREATE POLICY event_feed_check_items_select ON event_feed_check_items FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS event_feed_check_items_update ON event_feed_check_items;
CREATE POLICY event_feed_check_items_update ON event_feed_check_items FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS event_feed_check_items_delete ON event_feed_check_items;
CREATE POLICY event_feed_check_items_delete ON event_feed_check_items FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

-- harvest_event_fields
DROP POLICY IF EXISTS harvest_event_fields_select ON harvest_event_fields;
CREATE POLICY harvest_event_fields_select ON harvest_event_fields FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS harvest_event_fields_update ON harvest_event_fields;
CREATE POLICY harvest_event_fields_update ON harvest_event_fields FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS harvest_event_fields_delete ON harvest_event_fields;
CREATE POLICY harvest_event_fields_delete ON harvest_event_fields FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

-- survey_draft_entries
DROP POLICY IF EXISTS survey_draft_entries_select ON survey_draft_entries;
CREATE POLICY survey_draft_entries_select ON survey_draft_entries FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS survey_draft_entries_update ON survey_draft_entries;
CREATE POLICY survey_draft_entries_update ON survey_draft_entries FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS survey_draft_entries_delete ON survey_draft_entries;
CREATE POLICY survey_draft_entries_delete ON survey_draft_entries FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

-- todo_assignments
DROP POLICY IF EXISTS todo_assignments_select ON todo_assignments;
CREATE POLICY todo_assignments_select ON todo_assignments FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS todo_assignments_update ON todo_assignments;
CREATE POLICY todo_assignments_update ON todo_assignments FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS todo_assignments_delete ON todo_assignments;
CREATE POLICY todo_assignments_delete ON todo_assignments FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

-- Bump schema version
UPDATE operations SET schema_version = 19;
```

Add `BACKUP_MIGRATIONS` entry in `src/data/backup-migrations.js`:
```js
18: (backup) => {
  // Add operation_id to four child tables from their parent
  const tables = {
    event_feed_check_items: { parentTable: 'event_feed_checks', fkCol: 'feed_check_id' },
    harvest_event_fields:   { parentTable: 'harvest_events',    fkCol: 'harvest_event_id' },
    survey_draft_entries:   { parentTable: 'surveys',           fkCol: 'survey_id' },
    todo_assignments:       { parentTable: 'todos',             fkCol: 'todo_id' },
  };
  for (const [table, { parentTable, fkCol }] of Object.entries(tables)) {
    const parentRows = backup.tables[parentTable] || [];
    const parentMap = Object.fromEntries(parentRows.map(r => [r.id, r.operation_id]));
    const rows = backup.tables[table] || [];
    for (const row of rows) {
      row.operation_id = parentMap[row[fkCol]] || backup.operation_id;
    }
  }
  backup.schema_version = 19;
  return backup;
},
```

### Part 2 — Update entity files

For each of the four tables, update the entity file to include `operation_id`:

**Files:**
- `src/entities/event-feed-check-item.js`
- `src/entities/harvest-event-field.js`
- `src/entities/survey-draft-entry.js`
- `src/entities/todo-assignment.js`

For each entity:
1. Add `operation_id` to `FIELDS` (type: 'uuid', required: true, sbColumn: 'operation_id')
2. Add `operation_id` to `create()` — it should be passed in, not generated
3. Add `operation_id` to `validate()` — required uuid
4. Add `operation_id` to `toSupabaseShape()` and `fromSupabaseShape()`

### Part 3 — Update store calls

Wherever these four entity types are created (via `store.add()`), ensure `operation_id` is included in the record. The operation_id should come from the current operation context (same as all other tables). Grep for `add('event_feed_check_items'`, `add('harvest_event_fields'`, `add('survey_draft_entries'`, `add('todo_assignments'` to find all call sites.

### Part 4 — Update backup-import.js CURRENT_SCHEMA_VERSION

**File:** `src/data/backup-import.js`

Change line 19: `const CURRENT_SCHEMA_VERSION = 18;` → `const CURRENT_SCHEMA_VERSION = 19;`

### Part 5 — Execute migration 019 against Supabase

**CRITICAL:** Execute the migration SQL against the live Supabase database in this session. Do NOT just commit the file. See CLAUDE.md "Migration Execution Rule — Write + Run + Verify."

Verify by querying:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'todo_assignments' AND column_name = 'operation_id';
```
Should return one row (uuid). Repeat for all four tables.

Also verify RLS:
```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('todo_assignments', 'event_feed_check_items', 'harvest_event_fields', 'survey_draft_entries')
ORDER BY tablename, cmd;
```
Should show 4 policies per table (DELETE, INSERT, SELECT, UPDATE).

### Part 6 — Verify the fix

1. Clear `_dead_letter_queue` and all `gtho_v2_*` keys from localStorage
2. Reload the page, complete onboarding
3. Check `_dead_letter_queue` — must be empty
4. Select a v1 export file and run the import through the full two-step confirmation
5. Check that the import completes without errors
6. Check Supabase: `SELECT count(*) FROM event_feed_check_items;` and similar for all four tables — should match backup counts

---

## OPEN_ITEMS changes

Apply before starting:

- **OI-0055** — already added by Cowork (add operation_id to 4 tables)

## After all steps

1. Run `npx vitest run` — all tests must pass
2. Commit all changes with a descriptive message referencing OI-0055
3. Update PROJECT_CHANGELOG.md per normal protocol
