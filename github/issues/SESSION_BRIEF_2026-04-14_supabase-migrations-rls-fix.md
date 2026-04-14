# SESSION BRIEF — Supabase Migrations + RLS Bootstrap Fix

**Date:** 2026-04-14
**From:** Cowork
**To:** Claude Code
**Context:** Tier 3 migration testing is blocked. Onboarding completes in localStorage but nothing syncs to Supabase. The dead letter queue shows every record failed. Two root causes: (1) migrations 014–016 were never applied to the Supabase instance, and (2) the `operation_members` RLS policy has an infinite recursion bug that prevents inserting the first member row.

**Priority:** P0 — blocks all Supabase sync, not just migration testing.

---

## What to do

### Step 1 — Run missing migrations (014, 015, 016)

Apply these three migration files to the Supabase database via MCP, in order:

1. `supabase/migrations/014_multi_farm_context.sql` — adds `active_farm_id` to `user_preferences`
2. `supabase/migrations/015_schema_version_stamp.sql` — adds `schema_version` to `operations`
3. `supabase/migrations/016_invite_token.sql` — adds `invite_token` to `operation_members`, creates `claim_invite_by_token()` and `claim_pending_invite_by_email()` RPCs

Read each file and execute the SQL. Verify each column exists after running.

### Step 2 — Fix operation_members RLS infinite recursion (OI-0053)

**Current policy (broken):**
```sql
CREATE POLICY operation_members_all ON operation_members FOR ALL
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));
```

This queries `operation_members` to authorize access to `operation_members` — infinite recursion. Supabase detects it and rejects the query.

**Fix:** Drop the single `FOR ALL` policy and replace with granular policies:

```sql
-- Drop the broken policy
DROP POLICY operation_members_all ON operation_members;

-- SELECT: you can see members of operations you belong to
CREATE POLICY operation_members_select ON operation_members FOR SELECT
  USING (operation_id IN (
    SELECT om.operation_id FROM operation_members om
    WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
  ));

-- INSERT: you can insert a row for yourself (onboarding bootstrap)
-- or insert an invite row if you're an owner/admin of that operation
CREATE POLICY operation_members_insert ON operation_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR operation_id IN (
      SELECT om.operation_id FROM operation_members om
      WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
      AND om.role IN ('owner', 'admin')
    )
  );

-- UPDATE: you can update members in operations you own/admin
CREATE POLICY operation_members_update ON operation_members FOR UPDATE
  USING (operation_id IN (
    SELECT om.operation_id FROM operation_members om
    WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
    AND om.role IN ('owner', 'admin')
  ));

-- DELETE: you can delete members in operations you own
CREATE POLICY operation_members_delete ON operation_members FOR DELETE
  USING (operation_id IN (
    SELECT om.operation_id FROM operation_members om
    WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
    AND om.role = 'owner'
  ));
```

**Why the INSERT policy breaks the recursion:** When a new user creates their first operation and inserts themselves as owner, the `user_id = auth.uid()` check passes without querying `operation_members`. The OR branch (admin/owner inviting others) still does the subquery, but that works because the inviter already has an accepted row.

**Important:** The SELECT policy still has a self-referential subquery, but Supabase handles SELECT self-references without recursion (it's only the `FOR ALL` combining read+write checks that triggers the infinite loop). If Supabase still flags recursion on SELECT, fall back to:

```sql
CREATE POLICY operation_members_select ON operation_members FOR SELECT
  USING (user_id = auth.uid() OR operation_id IN (
    SELECT om.operation_id FROM operation_members om
    WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
  ));
```

### Step 3 — Check dose_units and input_product_units RLS

These tables had "violates row-level security policy" errors. The migration files (009, 008) do NOT enable RLS on these tables. Check if RLS was enabled manually on the Supabase instance:

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('dose_units', 'input_product_units');
```

If `rowsecurity = true`, either:
- (a) Disable RLS: `ALTER TABLE dose_units DISABLE ROW LEVEL SECURITY;` (matches the migration intent — these are operation-scoped via FK, not RLS)
- (b) Add a simple policy matching other tables: `CREATE POLICY dose_units_all ON dose_units FOR ALL USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL));`

**Problem:** `dose_units` doesn't have an `operation_id` column — it's a standalone lookup. If RLS is enabled, option (a) is correct. Same for `input_product_units`.

### Step 4 — Write migration 017 for the RLS fix

Create `supabase/migrations/017_fix_operation_members_rls.sql` containing:
- The DROP + replacement policies from Step 2
- Any dose_units/input_product_units RLS changes from Step 3
- End with `UPDATE operations SET schema_version = 17;`
- Add a `BACKUP_MIGRATIONS` entry in `src/data/backup-migrations.js` (no-op: `16: (b) => { b.schema_version = 17; return b; },`)

### Step 5 — Verify the fix

After applying all SQL:

1. Clear the dead letter queue in the browser: `localStorage.removeItem('_dead_letter_queue')`
2. Clear all `gtho_v2_*` localStorage keys
3. Reload the page, log in, complete onboarding
4. Check Supabase directly: `SELECT * FROM operations; SELECT * FROM operation_members;`
5. Both should have rows. All seed data (animal_classes, forage_types, etc.) should also be present.

### Step 6 — Update migration 001

Update the policy definition in `001_d1_operations_farms.sql` to match the new granular policies from Step 2. This keeps the migration files correct for any future fresh database setup. Add a comment noting the fix: `-- Fixed: original FOR ALL policy caused infinite recursion (OI-0053, migration 017)`.

---

## OPEN_ITEMS changes

Apply before starting:

- **OI-0053** — already added by Cowork (operation_members RLS infinite recursion)

## After all steps

1. Run `npx vitest run` — all tests must pass (current baseline: 779)
2. Commit all changes with a descriptive message
3. Update PROJECT_CHANGELOG.md per normal protocol
