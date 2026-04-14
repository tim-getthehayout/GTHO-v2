# SESSION BRIEF — Fix Import Delete + Parity for Join Tables Without operation_id

**Date:** 2026-04-14
**From:** Cowork
**To:** Claude Code
**Context:** v1 import (CP-57) crashes during the delete phase of `importOperationBackup()`. The function assumes every table has a direct `operation_id` column, but four join tables reach the operation through a parent FK. The import never gets past the delete step — zero data is imported.

**Priority:** P1 — blocks all v1 → v2 data migration testing.

**OI:** OI-0055

---

## What to do

### Part 1 — Add INDIRECT_OPERATION_TABLES map to backup-import.js

**File:** `src/data/backup-import.js`

Add a constant (near the other table maps like `TWO_PASS_TABLES` and `REFERENCE_TABLES`) that maps each join table to its parent FK:

```js
/**
 * Tables without a direct operation_id column.
 * Deletes and parity checks must go through the parent FK.
 * See V2_MIGRATION_PLAN.md §5.7 step 6.
 */
const INDIRECT_OPERATION_TABLES = {
  todo_assignments:       { fkCol: 'todo_id',         parentTable: 'todos' },
  event_feed_check_items: { fkCol: 'feed_check_id',   parentTable: 'event_feed_checks' },
  harvest_event_fields:   { fkCol: 'harvest_event_id', parentTable: 'harvest_events' },
  survey_draft_entries:   { fkCol: 'survey_id',        parentTable: 'surveys' },
};
```

Export it alongside `FK_ORDER`, `REFERENCE_TABLES`, `TWO_PASS_TABLES` at the bottom of the file.

### Part 2 — Fix deleteTableRows()

**File:** `src/data/backup-import.js` — `deleteTableRows()` function (line ~175)

Current code (line 178):
```js
const filterCol = table === 'operations' ? 'id' : 'operation_id';
```

Replace with logic that handles indirect tables:

```js
async function deleteTableRows(table, operationId) {
  if (REFERENCE_TABLES.has(table)) return;

  if (INDIRECT_OPERATION_TABLES[table]) {
    const { fkCol, parentTable } = INDIRECT_OPERATION_TABLES[table];
    // Get parent IDs first, then delete by FK
    const { data: parents, error: parentErr } = await supabase
      .from(parentTable)
      .select('id')
      .eq('operation_id', operationId);
    if (parentErr) throw new Error(`Delete failed on ${table}: could not query ${parentTable}: ${parentErr.message}`);
    if (parents && parents.length > 0) {
      const parentIds = parents.map(p => p.id);
      const { error } = await supabase
        .from(table)
        .delete()
        .in(fkCol, parentIds);
      if (error) throw new Error(`Delete failed on ${table}: ${error.message}`);
    }
    return;
  }

  const filterCol = table === 'operations' ? 'id' : 'operation_id';
  const { error } = await supabase
    .from(table)
    .delete()
    .eq(filterCol, operationId);
  if (error) throw new Error(`Delete failed on ${table}: ${error.message}`);
}
```

**Why two-step (query parents, then delete by IDs) instead of a single subquery:**
Supabase's PostgREST `.in()` filter doesn't support subqueries as a value — it only accepts a literal array. So we have to fetch the parent IDs first, then pass them to `.in()`.

### Part 3 — Fix parityCheck()

**File:** `src/data/backup-import.js` — `parityCheck()` function (line ~252)

Current code (line 259):
```js
const filterCol = table === 'operations' ? 'id' : 'operation_id';
const { count, error } = await supabase
  .from(table)
  .select('*', { count: 'exact', head: true })
  .eq(filterCol, operationId);
```

Add the same indirect-table handling:

```js
async function parityCheck(backup, operationId) {
  const mismatches = [];

  for (const table of FK_ORDER) {
    const backupRows = backup.tables[table] || [];
    const expected = backupRows.length;

    let count, error;

    if (INDIRECT_OPERATION_TABLES[table]) {
      const { fkCol, parentTable } = INDIRECT_OPERATION_TABLES[table];
      const { data: parents, error: parentErr } = await supabase
        .from(parentTable)
        .select('id')
        .eq('operation_id', operationId);
      if (parentErr) {
        mismatches.push({ table, expected, actual: -1 });
        continue;
      }
      if (!parents || parents.length === 0) {
        count = 0;
      } else {
        const parentIds = parents.map(p => p.id);
        const result = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .in(fkCol, parentIds);
        count = result.count;
        error = result.error;
      }
    } else {
      const filterCol = table === 'operations' ? 'id' : 'operation_id';
      const result = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(filterCol, operationId);
      count = result.count;
      error = result.error;
    }

    if (error) {
      mismatches.push({ table, expected, actual: -1 });
      continue;
    }

    if (REFERENCE_TABLES.has(table)) {
      if (count < expected) {
        mismatches.push({ table, expected, actual: count });
      }
    } else if (count !== expected) {
      mismatches.push({ table, expected, actual: count });
    }
  }

  return { pass: mismatches.length === 0, mismatches };
}
```

### Part 4 — Add unit tests

**File:** `tests/unit/backup-import.test.js` (extend existing, or create if needed)

Add tests that verify:

1. `INDIRECT_OPERATION_TABLES` includes exactly the four tables: `todo_assignments`, `event_feed_check_items`, `harvest_event_fields`, `survey_draft_entries`
2. Each entry has `fkCol` and `parentTable` properties
3. Each `parentTable` exists in `FK_ORDER`
4. Each indirect table appears in `FK_ORDER` AFTER its `parentTable` (FK dependency ordering)

---

## OPEN_ITEMS changes

Apply before starting:

- **OI-0055** — already added by Cowork (import join-table delete crash)

## After all steps

1. Run `npx vitest run` — all tests must pass
2. Commit all changes with a descriptive message referencing OI-0055
3. Update PROJECT_CHANGELOG.md per normal protocol
