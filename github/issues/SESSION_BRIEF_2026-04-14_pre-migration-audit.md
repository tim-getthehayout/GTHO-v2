# SESSION BRIEF — Pre-Migration Audit (Tier 1)

**Date:** 2026-04-14
**From:** Cowork
**To:** Claude Code
**Context:** All work through CP-57 is complete (747 tests passing). Before CP-58 (integration test — migration with real v1 data), we need to verify there's no drift between code and spec. This session covers the programmatic audits that Claude Code can run.

---

## What to do

Run six audits. For each one, fix what you can fix directly. If something requires a design decision, add it to OPEN_ITEMS.md and move on. Commit after each audit (or batch related fixes into one commit).

---

### Audit 1 — Entity ↔ Schema Alignment

**Goal:** Every field in every entity's `FIELDS` has a matching column in migration SQL, and vice versa.

**How:**
1. For each of the 52 entity files in `src/entities/`, read the `FIELDS` object.
2. For the corresponding migration SQL in `supabase/migrations/`, read the `CREATE TABLE` columns.
3. Verify: every FIELDS entry has a matching SQL column (check `sbColumn` matches SQL column name exactly). Every SQL column has a matching FIELDS entry. Column types are compatible.
4. Report any mismatches. Fix entity files if the SQL is authoritative. Flag in OPEN_ITEMS.md if the SQL itself looks wrong.

**Scope:** All 52 entity files. Do not skip any.

---

### Audit 2 — Shape Round-Trip Verification

**Goal:** `fromSupabaseShape(toSupabaseShape(record))` returns the original for every entity.

**How:**
1. Check which entities already have round-trip tests in `tests/unit/`.
2. For any entity missing a round-trip test, add one. Use a representative record with all fields populated.
3. Run the full test suite after adding tests.

**Priority entities** (most likely to have drift due to late schema changes): `operation.js`, `event.js`, `animal.js`, `event-paddock-window.js`, `user-preference.js`, `npk-price-history.js`, `animal-calving-record.js`, `farm-setting.js`.

---

### Audit 3 — Store ↔ Entity Alignment

**Goal:** Every entity type in the store's state has a corresponding entity file, and store actions use `validate()` before persisting.

**How:**
1. Read `src/data/store.js`. List every entity type in the initial state.
2. Verify each has a matching entity file in `src/entities/`.
3. For each store action that creates/updates data, verify it calls the entity's `validate()` function before mutating state.
4. Report any actions that skip validation.

---

### Audit 4 — Migration Transform Completeness

**Goal:** `src/data/v1-migration.js` covers all 25 transform sections from V2_MIGRATION_PLAN.md §2 and field mappings match.

**How:**
1. Read V2_MIGRATION_PLAN.md §2.1 through §2.25.
2. For each section, find the corresponding transform function in `v1-migration.js`.
3. Verify every field mapping in the spec table has a matching line in the transform code.
4. Pay special attention to:
   - §2.7 (health event 5-way split + animal_notes routing)
   - §2.8 (operations — schema_version set dynamically)
   - §2.14 (animal_classes — `archived = false`)
   - §2.24 (user_preferences — `active_farm_id = NULL`)
   - §2.25 (npk_price_history — $/lb to $/kg conversion)
5. Report any missing transforms or field mismatches.

---

### Audit 5 — OI-0012: Calc Test Coverage Gap

**Goal:** Add ~10 targeted tests to `tests/unit/calcs.test.js`.

**Must cover:**
- DMI-1: residual lookup by date (not array index) — this is a v1 bug fix regression test
- DMI-2: lactation logic — beef (calf-in-class) vs dairy (dried_off_date) branching
- FED-1: residual interpolation
- CST-1: feed cost per group
- CST-2: feed cost per head
- CST-3: feed cost per kg gain
- REC-1: recovery window with strip graze `area_pct`

**Reference:** V2_CALCULATION_SPEC.md §4 has the formula definitions.

---

### Audit 6 — OI-0013: Calc Reference Description Spot-Check

**Goal:** Every `registerCalc()` call's `description` and `formula` fields match V2_CALCULATION_SPEC.md §4.

**How:**
1. Read every `registerCalc()` call in `src/calcs/core.js`, `src/calcs/feed-forage.js`, `src/calcs/advanced.js`, and any other calc files (e.g., `capacity.js`).
2. Compare the `description` and `formula` metadata strings against V2_CALCULATION_SPEC.md §4.
3. Fix any drift — the spec is authoritative.

---

## OPEN_ITEMS changes

Apply these before starting:

_(none — all current OIs are already up to date)_

## After all audits

1. Run `npx vitest run` — all tests must pass (current baseline: 747).
2. Update OPEN_ITEMS.md: close OI-0012 and OI-0013 if fully addressed.
3. Commit all changes with a descriptive message.
4. Do NOT update TASKS.md or PROJECT_CHANGELOG.md from this session — Cowork will handle TASKS.md, and PROJECT_CHANGELOG.md follows your normal commit protocol.
