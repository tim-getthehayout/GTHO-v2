# SESSION BRIEF — Fix REFERENCE_TABLES Blocking Import Delete Phase

**Date:** 2026-04-14
**From:** Cowork
**To:** Claude Code
**Context:** After fixing OI-0055 (operation_id on 4 tables), the v1 import now crashes on the operations DELETE with `update or delete on table "operations" violates foreign key constraint "forage_types_operation_id_fkey" on table "forage_types"`. Root cause: 5 per-operation tables are in `REFERENCE_TABLES`, which causes `deleteTableRows()` to skip them. Their rows still reference the operations row, so the operations DELETE hits FK constraints.

**Priority:** P1 — blocks all v1 → v2 data migration testing.

**OI:** OI-0056

---

## What to do

### Part 1 — Remove per-operation tables from REFERENCE_TABLES

**File:** `src/data/backup-import.js`

Change line ~87-91 from:

```js
const REFERENCE_TABLES = new Set([
  'treatment_categories', 'treatment_types', 'dose_units',
  'input_product_categories', 'input_product_units',
  'forage_types', 'animal_classes',
]);
```

To:

```js
const REFERENCE_TABLES = new Set([
  'dose_units',
  'input_product_units',
]);
```

**Why:** Only `dose_units` and `input_product_units` are truly global reference tables — they have no `operation_id` column and are not scoped to any operation. The other five tables (`forage_types`, `animal_classes`, `treatment_categories`, `treatment_types`, `input_product_categories`) all have `operation_id` and FK to `operations`. They are per-operation seed data. During import, the backup is authoritative — these tables should be deleted and re-inserted from the backup, just like all other operation-scoped tables.

The `REFERENCE_TABLES` skip in `deleteTableRows()` means these 5 tables' rows are never deleted. When the loop reaches `operations`, the FK constraints from these undeletion rows block the delete. This is the crash.

### Part 2 — Verify dose_units and input_product_units are handled correctly

These two tables stay in `REFERENCE_TABLES` (upsert, no delete). Verify:

1. They are NOT in `FK_ORDER` — or if they ARE in `FK_ORDER`, confirm that `deleteTableRows()` correctly skips them via the `REFERENCE_TABLES` check.
2. `insertTableRows()` correctly upserts them (it already does — line ~197 checks `REFERENCE_TABLES`).
3. Neither table has a FK to `operations` — so the operations delete is not affected by them.

**Check:** `dose_units` is in `FK_ORDER` at position ~10. `deleteTableRows()` returns early for it (line 176: `if (REFERENCE_TABLES.has(table)) return;`). This is correct — no delete attempt, no error. The dose_units 400 error Tim saw in the Network tab was from a separate SELECT query elsewhere (probably pullAll or form lookup), not from the import.

### Part 3 — Verify FK_ORDER is complete

Confirm that all 5 tables being removed from `REFERENCE_TABLES` are present in `FK_ORDER` at the correct position (before any tables that reference them, after `operations`). They are currently in FK_ORDER:

- `forage_types` — index 2
- `animal_classes` — index 3
- `treatment_categories` — index 9 (via `dose_units` at 10)
- `treatment_types` — index 17 (under `input_products`)
- `input_product_categories` — index 7

These positions should be correct for FK ordering (they come after `operations` and `farms`, before child tables that reference them). No reordering needed.

### Part 4 — Test the import

1. Clear `_dead_letter_queue` and all `gtho_v2_*` keys from localStorage
2. Reload the page, complete onboarding
3. Select a v1 export file and run the import through the full two-step confirmation
4. Verify: import completes without errors
5. Verify in Supabase: `SELECT count(*) FROM forage_types WHERE operation_id = '<op_id>';` — should match backup
6. Repeat for `animal_classes`, `treatment_categories`, `treatment_types`, `input_product_categories`

### Part 5 — Clean up stale Supabase data (optional but recommended)

There is one stale operation in Supabase from a prior successful onboarding (`0ee3e183-70b7-457c-8dd2-9a0a9381b194`, schema_version 14). It has orphaned seed data. Clean it up via Supabase MCP:

```sql
-- Delete child data first (reverse FK order)
DELETE FROM forage_types WHERE operation_id = '0ee3e183-70b7-457c-8dd2-9a0a9381b194';
DELETE FROM animal_classes WHERE operation_id = '0ee3e183-70b7-457c-8dd2-9a0a9381b194';
DELETE FROM treatment_categories WHERE operation_id = '0ee3e183-70b7-457c-8dd2-9a0a9381b194';
DELETE FROM treatment_types WHERE operation_id = '0ee3e183-70b7-457c-8dd2-9a0a9381b194';
DELETE FROM input_product_categories WHERE operation_id = '0ee3e183-70b7-457c-8dd2-9a0a9381b194';
DELETE FROM farm_settings WHERE operation_id = '0ee3e183-70b7-457c-8dd2-9a0a9381b194';
DELETE FROM user_preferences WHERE operation_id = '0ee3e183-70b7-457c-8dd2-9a0a9381b194';
DELETE FROM farms WHERE operation_id = '0ee3e183-70b7-457c-8dd2-9a0a9381b194';
DELETE FROM operation_members WHERE operation_id = '0ee3e183-70b7-457c-8dd2-9a0a9381b194';
DELETE FROM operations WHERE id = '0ee3e183-70b7-457c-8dd2-9a0a9381b194';
```

This is housekeeping, not required for the fix.

---

## OPEN_ITEMS changes

Apply before starting:

- **OI-0056** — already added by Cowork (REFERENCE_TABLES blocking import delete)

## After all steps

1. Run `npx vitest run` — all tests must pass
2. Commit all changes with a descriptive message referencing OI-0056
3. Update PROJECT_CHANGELOG.md per normal protocol
