# SESSION BRIEF — Audit & Fix Duplicate Data from v1 Migration

**Date:** 2026-04-15
**Priority:** P1 — duplicates cause incorrect counts (158 head vs 79), duplicate cards, and confusing UI
**Scope:** Investigation + cleanup. NO schema changes, NO code changes.

## Context

After migrating v1 data into v2, the dashboard shows doubled numbers: 158 head instead of 79, 12 groups instead of 6, 8 active events instead of the expected count. Location cards (D, J2, B-3, Corral) each appear twice. Product categories in Settings are also duplicated. Open tasks appear duplicated ("Check 2509 scabs on side" × 2).

The likely cause is either:
- Two copies of the same operation in Supabase (from test migrations)
- Orphaned records from a previous test migration that weren't cleaned up
- Both operations visible because "All farms" mode aggregates across operations

Related: OI-0060 (stale test operations in Supabase)

## Investigation Steps

### 1. Count operations and farms
```sql
SELECT id, name, created_at FROM operations ORDER BY created_at;
SELECT id, name, operation_id, created_at FROM farms ORDER BY created_at;
```
Expected: 1 operation ("Down East Beef and Lamb") with 1+ farms. If there are 2+ operations with the same name, that's the duplication source.

### 2. Count records per operation
For each operation_id found above, count:
```sql
SELECT operation_id, COUNT(*) FROM events GROUP BY operation_id;
SELECT operation_id, COUNT(*) FROM groups GROUP BY operation_id;
SELECT operation_id, COUNT(*) FROM locations GROUP BY operation_id;
SELECT operation_id, COUNT(*) FROM animal_classes GROUP BY operation_id;
SELECT operation_id, COUNT(*) FROM batches GROUP BY operation_id;
SELECT operation_id, COUNT(*) FROM todos GROUP BY operation_id;
SELECT operation_id, COUNT(*) FROM product_categories GROUP BY operation_id;
```

### 3. Check operation_members
```sql
SELECT om.operation_id, o.name, om.user_id, om.role 
FROM operation_members om 
JOIN operations o ON o.id = om.operation_id 
ORDER BY o.created_at;
```
This shows which operations Tim's account is a member of — and therefore which ones the app loads.

### 4. Identify which operation is the "real" one
If there are multiple operations, compare:
- Which has more complete data (more events, groups, etc.)
- Which was created most recently (latest migration)
- Whether one is clearly a test run

### 5. Report findings
Before doing any cleanup, report:
- How many operations exist
- Which one(s) appear to be test data
- Record counts per operation
- Recommended cleanup action

## Cleanup (after Tim approves)

If duplicate operations are confirmed:
1. **Identify the stale operation ID** (the test one)
2. **Delete in FK order** (children before parents) per V2_MIGRATION_PLAN.md §5.3a:
   - event_observations, event_feed_checks, event_feed_entries, event_group_windows, event_paddock_windows, events
   - animal_group_memberships, animal_health_records, animal_calving_records, animal_notes, animals
   - groups, locations, batches, product_categories, todos, todo_assignments
   - npk_price_history, farm_settings, farms
   - operation_members (for the stale operation only)
   - operations (the stale row)
3. **Do NOT delete** the user_preferences or app_logs rows
4. **Verify** the dashboard now shows correct counts

## OPEN_ITEMS Changes

- Close OI-0060 if stale operations are cleaned up

## Important

- **Do NOT delete anything without reporting findings first.** Tim needs to confirm which operation to keep.
- **Do NOT modify code.** This is data-level cleanup only.
- Use the Supabase MCP or a Node script with the project's Supabase credentials to query.
