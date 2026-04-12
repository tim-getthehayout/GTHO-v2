# Session Brief — 2026-04-11

**Project:** GTHO v2 Rebuild (App-Migration-Project repo)
**Phase:** 2 — Design
**Repo:** App-Migration-Project (docs-only project, `main` branch)

---

## Context

Continuing Phase 2 schema design. The prior session completed 12 event-system tables (D2 locations, D5 events, D6 surveys, D7 harvest) and established 17 architecture decisions (A1–A17). This session tackled D1 (Operations & Farm Setup) — the root entity domain that every other table FKs into.

---

## What Was Done This Session

1. **D1: Operations & Farm Setup** — 5 tables designed and APPROVED:
   - `operations` — lean identity table (name, timezone, currency). No herd_type (A19).
   - `farms` — physical properties with lat/lng for future map features.
   - `farm_settings` — ALL operational config, per-farm not per-operation (A18). Grazing defaults, NPK prices, manure rate, feed planning, thresholds. Replaces v1's operation_settings JSONB bag.
   - `operation_members` — user access with owner/admin/team_member roles, phone number added.
   - `user_preferences` — per-user UI prefs: view modes, field mode default, stat period, quick action buttons.

2. **5 new architecture decisions logged (A18–A22):**
   - A18: Settings per-farm, not per-operation
   - A19: No herd_type on operations (species defined by animal_classes)
   - A20: Currency on operations, NPK prices on farm_settings (freight differentials)
   - A21: User preferences separate from operation_members
   - A22: Spreaders as reference table in D8, not a global setting

3. **Docs updated:**
   - GTHO_V2_SCHEMA_DESIGN.md — full D1 section with column specs, design decisions, SQL
   - V2_BUILD_INDEX.md — D1 marked APPROVED, A18–A22 logged, current focus updated

---

## Decision Log (Key Decisions for Next Session)

All decisions are in V2_BUILD_INDEX.md § Architecture Decisions Log. New this session:

- **A18:** All config lives on `farm_settings` (1:1 child of farms). No `operation_settings` table. Multi-farm operations get per-farm flexibility. "Copy settings" is a UX feature.
- **A19:** herd_type dropped from operations. An operation with cattle AND sheep just has animal_classes for both. Species selection at onboarding pre-populates classes.
- **A20:** Currency is operation-wide. NPK prices are per-farm because freight costs differ by location.
- **A21:** UI preferences (view mode, field mode, quick actions) live on `user_preferences`, not `operation_members`. Different concerns, different tables.
- **A22:** V1's single `manure_load_kg` setting replaced by a spreaders/equipment reference table (to be designed in D8).

---

## What's Next

**Continue schema design for remaining 7 domains.** Recommended order:

### Tier 1 (simpler reference tables):
1. **D2 remainder: forage_types** — reference table carrying per-type utilization (A15), dm_kg_per_cm_per_ha, min_residual_height_cm, NPK rates per tonne DM.
2. **D4: Feed Inventory** — feed_types, batches. Batch links to harvest (A8).
3. **D11: App Infrastructure** — app_logs, submissions, todos, release_notes.

### Tier 2 (more complex):
4. **D3: Animals & Groups** — animals, groups, animal_group_memberships, animal_classes (A14).
5. **D8: Nutrients & Amendments** — amendments, amendment_locations, input_products, soil_tests, manure batches/transactions, **plus new spreaders/equipment table (A22)**.
6. **D9: Livestock Health** — BCS scores, treatments, breeding, calving, treatment types, AI bulls.
7. **D10: Feed Quality** — batch_nutritional_profiles.

### Design approach (same as prior sessions):
- Interactive narrative — walk through each table with Tim
- One domain at a time
- Decisions logged as A# entries
- SQL included for each table

---

## Files Changed

| File | Action |
|------|--------|
| GTHO_V2_SCHEMA_DESIGN.md | D1 section fully written (was DESIGN PENDING stubs) |
| V2_BUILD_INDEX.md | D1 status → APPROVED, A18–A22 added, current focus updated |

---

## Open Questions

- **Spreaders/equipment table (A22):** Flagged for D8 design. Farms have multiple spreaders of different sizes — need a reference table so manure application events can reference which spreader was used.

---

## How to Start the Next Session

1. Read `V2_BUILD_INDEX.md` — current focus and full status table
2. Read `GTHO_V2_SCHEMA_DESIGN.md` — for approved tables and design principles
3. Start D2 remainder (forage_types) with Tim using the interactive narrative approach
4. After each domain: update schema doc, log decisions, mark status
