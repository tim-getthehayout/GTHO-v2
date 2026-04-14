# SESSION BRIEF — Sync Insert/Update Split + RLS Policy Migration

**Date:** 2026-04-14
**From:** Cowork
**To:** Claude Code
**Context:** Tier 3 migration testing is blocked. Onboarding completes in localStorage but nothing syncs to Supabase. Root cause: the sync adapter uses `.upsert()` for all writes, and Supabase evaluates upsert as INSERT + UPDATE, requiring both policies to pass. During onboarding, UPDATE policies that check `operation_members` fail because the membership row doesn't exist yet. This cascades to every table — 24 records dead-letter on every onboarding attempt.

**Priority:** P0 — blocks all Supabase sync during onboarding and all Tier 3+ testing.

**OI:** OI-0054

---

## What to do

### Part 1 — Sync adapter: use `.insert()` for new records, `.update()` for existing

**File:** `src/data/custom-sync.js`

The `push()` method (line 112) currently calls `_pushToRemote()` which always uses `.upsert()` (line 205). Change this so:

1. Add an `operation` parameter to `push(table, record, operation)` where `operation` is `'insert'` or `'update'`. Default to `'upsert'` for backward compatibility.

2. In `_pushToRemote()`, use the operation to choose the Supabase method:
   - `'insert'` → `supabase.from(table).insert(record)`
   - `'update'` → `supabase.from(table).update(record).eq('id', record.id)`
   - `'upsert'` (default/recovery) → `supabase.from(table).upsert(record, { onConflict: 'id' })`

3. The offline queue (`_enqueue`) must also store the `operation` type so it's preserved through flush.

4. `retryDeadLetters()` (line 312) should use `'upsert'` since we don't know the original operation.

**File:** `src/data/sync-adapter.js`

Update the `SyncAdapter` base class `push()` signature to include the `operation` parameter.

**File:** `src/data/store.js` (or wherever `add()` and `update()` call `sync.push()`)

- `add()` must pass `'insert'` as the operation
- `update()` must pass `'update'` as the operation

### Part 2 — RLS migration 018: split FOR ALL policies into granular per-command

**File:** `supabase/migrations/018_granular_rls_policies.sql`

For every table that currently has a `FOR ALL` policy referencing `operation_members` (~40 tables — see the full list from `pg_policies` query), replace the single `FOR ALL` policy with four granular policies:

```sql
-- Pattern for each table (replace [table] and [policy_prefix]):
DROP POLICY IF EXISTS [policy_prefix]_all ON [table];

CREATE POLICY [policy_prefix]_insert ON [table] FOR INSERT
  WITH CHECK (true);

CREATE POLICY [policy_prefix]_select ON [table] FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

CREATE POLICY [policy_prefix]_update ON [table] FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

CREATE POLICY [policy_prefix]_delete ON [table] FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));
```

**Special cases:**
- `event_feed_check_items` — uses `feed_check_id IN (SELECT ...)` pattern, not direct `operation_id`. Adapt the same split but keep the join-based check for SELECT/UPDATE/DELETE.
- `harvest_event_fields` — same join pattern as above.
- `survey_draft_entries` — same join pattern.
- `todo_assignments` — same join pattern.
- `dose_units`, `input_product_units` — RLS already disabled, skip.
- `operations` — already has granular policies, skip.
- `operation_members` — already has granular policies (updated in migration 017 + manual fix), skip.
- `user_preferences`, `app_logs` — user-scoped (`user_id = auth.uid()`), not membership-scoped. Skip.

End migration with: `UPDATE operations SET schema_version = 18;`

Add `BACKUP_MIGRATIONS` entry: `17: (b) => { b.schema_version = 18; return b; },`

### Part 3 — Update migration 001 to match

Update the RLS policy definitions in `001_d1_operations_farms.sql` to use the granular pattern instead of `FOR ALL`. Add comment: `-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)`.

Do the same for any other migration file that creates `FOR ALL` policies for the affected tables.

### Part 4 — Execute migration 018 against Supabase

**CRITICAL:** Execute the migration SQL against the live Supabase database in this session. Do NOT just commit the file. See CLAUDE.md "Migration Execution Rule — Write + Run + Verify."

Verify by querying:
```sql
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'farms'
ORDER BY cmd;
```
Should show 4 rows: DELETE, INSERT, SELECT, UPDATE (not ALL).

### Part 5 — Verify the fix

1. Clear `_dead_letter_queue` and all `gtho_v2_*` keys from localStorage
2. Reload the page, complete onboarding
3. Check `_dead_letter_queue` — must be empty (`null` or `[]`)
4. Query Supabase: `SELECT * FROM operations;` and `SELECT * FROM operation_members;` — both must have rows
5. Query: `SELECT count(*) FROM animal_classes WHERE operation_id = '<new_op_id>';` — should return seed data count

---

## OPEN_ITEMS changes

Apply before starting:

- **OI-0054** — already added by Cowork (sync upsert + RLS split)

## After all steps

1. Run `npx vitest run` — all tests must pass
2. Commit all changes with a descriptive message
3. Update PROJECT_CHANGELOG.md per normal protocol
