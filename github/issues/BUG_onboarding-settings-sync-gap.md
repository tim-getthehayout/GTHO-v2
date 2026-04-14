# BUG: Onboarding & Settings Records Never Sync to Supabase

## Summary

All `add()` calls in `src/features/onboarding/index.js` and all `update()` calls in `src/features/settings/index.js` are missing the `toSupabaseFn` and `table` parameters. The store's sync check (`if (syncAdapter && toSupabaseFn && table)`) fails silently, so these records save to localStorage only and never queue a Supabase write.

**Impact:** After onboarding, the operation, farm, farm_settings, operation_members, user_preferences, and all seeded reference data (animal_classes, treatment_categories, input_product_categories, forage_types, dose_units) exist only in localStorage. Any settings changes (farm settings, user preferences) also never sync. The app appears to work but is effectively offline-only for these records. RLS policies that depend on `operation_members` have no rows to match.

**Blocker for:** CP-66 (member invite) — invites require the owner's `operation_members` row to exist in Supabase.

## Root Cause

The store's `add()` expects 5 params: `add(entityType, record, validateFn, toSupabaseFn, table)`.
The store's `update()` expects 6 params: `update(entityType, id, changes, validateFn, toSupabaseFn, table)`.

Onboarding passes only 3 to `add()`. Settings passes only 4 to `update()`. Without the last two params, sync is skipped.

## Broken Calls — Onboarding (10 × `add()`)

File: `src/features/onboarding/index.js`

| Line (approx) | Entity | Table name needed |
|---|---|---|
| 304 | operations | operations |
| 312 | farms | farms |
| 319 | farmSettings | farm_settings |
| 330 | operationMembers | operation_members |
| 337 | userPreferences | user_preferences |
| 356 | animalClasses | animal_classes |
| 362 | treatmentCategories | treatment_categories |
| 371 | inputProductCategories | input_product_categories |
| 380 | forageTypes | forage_types |
| 394 | doseUnits | dose_units |

## Broken Calls — Settings (5 × `update()`)

File: `src/features/settings/index.js`

| Line (approx) | Entity | Table name needed |
|---|---|---|
| 155 | farmSettings | farm_settings |
| 180 | userPreferences | user_preferences |
| 188 | userPreferences | user_preferences |
| 201 | userPreferences | user_preferences |
| 209 | userPreferences | user_preferences |

## Fix

For each broken call:

1. Import `toSupabaseShape` from the corresponding entity file (e.g., `import { toSupabaseShape as opToSb } from '../../entities/operation.js'`)
2. Pass it and the Supabase table name as the final two params

**Example — before:**
```js
add('operationMembers', member, validateOpMember);
```

**After:**
```js
import { toSupabaseShape as opMemberToSb } from '../../entities/operation-member.js';
// ...
add('operationMembers', member, validateOpMember, opMemberToSb, 'operation_members');
```

Same pattern for `update()` — add `toSupabaseFn` and `table` as params 5 and 6.

## Acceptance Criteria

- [ ] All 10 `add()` calls in onboarding include `toSupabaseFn` and `table` params
- [ ] All 5 `update()` calls in settings include `toSupabaseFn` and `table` params
- [ ] After onboarding completes, verify all 10 record types exist in Supabase (not just localStorage)
- [ ] After changing a farm setting, verify the change appears in Supabase `farm_settings` table
- [ ] After changing a user preference, verify the change appears in Supabase `user_preferences` table
- [ ] Existing users who already onboarded (records in localStorage but not Supabase) can use "Resync to server" to push their data — verify this works as the recovery path
- [ ] No other `add()` or `update()` calls in the codebase are missing sync params (full audit)

## Test Plan

- [ ] Unit: mock syncAdapter, call `add()` with 5 params, verify `queueWrite` is called
- [ ] Unit: mock syncAdapter, call `update()` with 6 params, verify `queueWrite` is called
- [ ] Integration: run onboarding flow, check Supabase tables for all 10 record types
- [ ] Integration: change farm setting, verify Supabase `farm_settings` row updated
- [ ] Integration: change user preference, verify Supabase `user_preferences` row updated
- [ ] Regression: verify "Resync to server" button still works as recovery for users who onboarded before this fix

## Related OIs

- OI-0049 (new — onboarding & settings sync gap)

## Notes

**Why this wasn't caught:** The app works fine in single-user mode because localStorage is the primary read source. Supabase sync is invisible unless you check the database directly or try multi-user features (which depend on RLS → operation_members).

**Recovery for existing users:** The "Resync to server" button in Settings → Sync & Data calls `pushAllToSupabase()` which re-queues everything from localStorage. This is the manual recovery path. After this fix, new users won't need it.

**Priority:** P1 — blocks CP-66 and any multi-user functionality. All data created during onboarding and settings changes is at risk of loss if localStorage is cleared.
