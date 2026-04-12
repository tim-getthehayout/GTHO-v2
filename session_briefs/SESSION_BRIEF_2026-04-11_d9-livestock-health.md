# Session Brief — 2026-04-11 (Session 4)

**Project:** GTHO v2 Rebuild (App-Migration-Project repo)
**Phase:** 2 — Design
**Repo:** App-Migration-Project (docs-only project, `main` branch)

---

## Context

Continuing Phase 2 schema design. Prior sessions completed D1–D7 and D11 with 30 architecture decisions (A1–A30). This session tackled D9 (Livestock Health), D8 (Nutrients & Amendments), and D10 (Feed Quality) — completing all remaining schema domains. D9 was prioritized ahead of D8 because it flows directly from D3 (Animals & Groups), which established the sire FK pattern (A28) and confirmed-bred derivation (A29).

---

## What Was Done This Session

1. **D9: Livestock Health** — 10 tables designed and APPROVED:

   **Reference tables (3):**
   - `ai_bulls` — AI sire catalog. Operation-scoped (shared across farms). Referenced by `animals.sire_ai_bull_id` (A28) and `animal_breeding_records.sire_ai_bull_id`. Straight lift from v1 with v2 conventions.
   - `treatment_categories` — User-extensible grouping for treatment types (A31). System seeds defaults ('Antibiotic', 'Parasiticide', 'Reproductive', 'Other'); users add their own. Reports filter by category_id FK.
   - `treatment_types` — Specific treatment definitions linked to categories via FK. Replaces v1's hardcoded category enum.

   **Shared reference (1):**
   - `dose_units` — Universal measurement units ('ml', 'mg', 'tablet', etc.). No operation_id — shared across all operations (A33). User-extensible without code changes.

   **Record tables (6):**
   - `animal_bcs_scores` — Body condition scoring. Species-dependent scale: cattle 1–9, sheep/goat 1–5, app-enforced (A32). Numeric type allows half-scores.
   - `animal_treatments` — Treatment records. Structured dose: `dose_amount` (numeric) + `dose_unit_id` (FK to dose_units) replaces v1's freeform text (A33). Links to treatment_types → treatment_categories for clean reporting.
   - `animal_breeding_records` — AI or natural service breeding events. Method is 'ai' or 'bull' only (heats split out per A34). Carries `confirmed_date` that drives A29 derivation. `expected_calving` stored with auto-default (bred_at + species gestation), user can override per vet preg check.
   - `animal_heat_records` — Estrus observations split from breeding records (A34). Simple table: animal_id, observed_at, notes. Different data shape and query patterns from actual breedings.
   - `animal_calving_records` — Birth events linking dam to calf. Sire FKs per A28. Calf data lives on calf's own animal record. Birth weight stored as weight record (source='calving'), not on calving table. Triggers class reassignment prompt on dam (A27).
   - `animal_weight_records` — Weight measurement records. Metric internal (weight_kg). Sources: manual, group_update, calving, import. Scale imports match by EID to resolve animal_id. Current weight derived from latest record (A2).

2. **D8: Nutrients & Amendments** — 9 tables designed and APPROVED:

   **Reference tables (3):**
   - `input_product_categories` — User-extensible grouping for input products (A35). System seeds defaults ('Fertilizer', 'Compost', 'Lime', 'Other'); users add their own.
   - `input_product_units` — Universal purchase/application units ('ton', 'bag', 'lb', 'kg', 'gallon'). No operation_id — shared like dose_units.
   - `input_products` — Commercial amendment catalog with full 13-element nutrient composition percentages (A36). Links to categories and units.

   **Equipment (1):**
   - `spreaders` — Replaces v1's single global manure load size (A22). Operation-scoped. Name + capacity_kg.

   **Record tables (5):**
   - `soil_tests` — Full 13-element nutrient panel (A36) plus soil properties (pH, buffer pH, CEC, base saturation, organic matter). Tracks extraction method (Mehlich I vs III). Based on standard soil analysis report format.
   - `amendments` — Application events (product or manure source). Links to spreader, tracks total quantity and cost override.
   - `amendment_locations` — Per-paddock nutrient delivery. Full 13-element panel stored as point-in-time kg facts (A36). Supports fertilizer planning against soil test gaps.
   - `manure_batches` — Full nutrient panel (A36). source_location_id FK replaces v1's locationName text. Remaining volume derived (A2). Fixes v1 known issue OI-0181 (JS/Supabase schema mismatch).
   - `manure_batch_transactions` — Volume ledger (input/application). Links to events (source_event_id) and amendments (amendment_id). No NPK duplication — nutrients live on batch and amendment_locations.

3. **6 new architecture decisions logged (A31–A36):**
   - A31: Treatment categories as user-extensible reference table
   - A32: BCS scale species-dependent, app-enforced (cattle 1–9, sheep/goat 1–5)
   - A33: Dose as structured amount + unit, shared dose_units reference table
   - A34: Heat observations split from breeding records into own table
   - A35: Input product categories as user-extensible reference table
   - A36: Full 13-element nutrient panel across soil tests, input products, amendment locations, and manure batches

4. **D10: Feed Quality** — 1 table designed and APPROVED:
   - `batch_nutritional_profiles` — Lab test results or estimates for feed batches. Core forage metrics (DM%, protein, ADF, NDF, TDN, RFV) plus minerals (N, P, K, Ca, Mg, S). Multiple profiles per batch supported (harvest estimate → lab test). Schema designed for extensibility — additional fields for dairy/beef/sheep-specific metrics can be added as nullable columns based on field tester feedback.

5. **Docs updated:**
   - GTHO_V2_SCHEMA_DESIGN.md — D9, D8, and D10 sections fully written with column specs, design decisions, SQL
   - V2_BUILD_INDEX.md — D9, D8, D10 marked APPROVED, A31–A36 logged. All 11 domains now APPROVED — schema design complete.

---

## Decision Log (Key Decisions for Next Session)

All decisions are in V2_BUILD_INDEX.md § Architecture Decisions Log. New this session:

- **A31:** V1's hardcoded treatment category enum replaced by `treatment_categories` table. System seeds defaults at onboarding. Users add custom categories without code changes. Reports filter on `category_id` FK.
- **A32:** BCS scale varies by species: cattle/horses 1–9, sheep/goats 1–5. DB stores raw numeric (allows half-scores). App validates correct range at input based on animal's class species.
- **A33:** V1's freeform `dose` text split into `dose_amount` (numeric) and `dose_unit_id` (FK to `dose_units`). `dose_units` shared, no operation_id. Enables clean usage reporting.
- **A34:** V1 stored heats as breeding events (subtype='heat'). V2 splits to `animal_heat_records` — different shape, different queries. Breeding method now 'ai' or 'bull' only.
- **A35:** Input product categories as user-extensible reference table. Same pattern as A31.
- **A36:** Full 13-element nutrient panel (N, P, K, S, Ca, Mg, Cu, Fe, Mn, Mo, Zn, B, Cl) on soil_tests (as raw readings), input_products (as %), amendment_locations (as kg applied), and manure_batches (as kg content). Based on standard soil analysis report format (Waters Agricultural Laboratories). Supports fertilizer planning against soil test gaps.

**Other notable decisions (not A-numbered):**
- AI bulls scoped to operation (not farm) — shared across all farms in the operation.
- `expected_calving` stored with auto-default and user override. Vets give adjusted dates from preg checks.
- Birth weight not on calving record — stored as weight record on calf (source='calving').
- `treatmentName` snapshot dropped — follows design principle #5.
- Spreaders operation-scoped; optional farm_id FK can be added later if per-farm scoping needed (non-breaking).
- Soil tests track extraction method (Mehlich I vs III) since same PPM means different things under different methods.
- Amendment location nutrients stored as point-in-time facts — historical values don't change if product composition is updated later.
- Manure batch transactions carry no NPK — nutrients live on the batch and flow to amendment_locations on application.

---

## What's Next

**Schema design is complete.** All 11 domains APPROVED (D1–D11), 36 architecture decisions (A1–A36).

**Remaining Phase 2 work:**
- Architecture walkthrough Groups 3–6 (UI & UX, AI & Voice, Infrastructure, Migration). These 5 DRAFT docs reference table/field names that are now finalized — ready for review passes.
- After Groups 3–6 are reviewed and approved, Phase 2 is complete and Phase 3 (Build) can begin.

---

## Files Changed

| File | Action |
|------|--------|
| GTHO_V2_SCHEMA_DESIGN.md | D9 (10 tables), D8 (9 tables), D10 (1 table) fully written — column specs, design decisions, SQL. All 11 domains complete. |
| V2_BUILD_INDEX.md | D9, D8, D10 → APPROVED, A31–A36 added. All domains APPROVED. Current focus updated to architecture walkthrough Groups 3–6. |

---

## Open Questions

- None outstanding. All prior open questions resolved this session.

---

## How to Start the Next Session

1. Read `V2_BUILD_INDEX.md` — current focus and full status table
2. Review the 5 DRAFT architecture docs (V2_APP_ARCHITECTURE.md, V2_CALCULATION_SPEC.md, V2_UX_FLOWS.md, V2_INFRASTRUCTURE.md, V2_MIGRATION_PLAN.md) — these reference table/field names that are now finalized
3. Walk through Groups 3–6 with Tim: update references to match approved schema, resolve open questions, approve each doc
4. After all groups approved: Phase 2 complete, ready for Phase 3 (Build)
