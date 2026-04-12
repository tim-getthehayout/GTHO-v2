# Session Brief — 2026-04-11 (Session 2)

**Project:** GTHO v2 Rebuild (App-Migration-Project repo)
**Phase:** 2 — Design
**Repo:** App-Migration-Project (docs-only project, `main` branch)

---

## Context

Continuing Phase 2 schema design. Prior sessions completed D1 (Operations & Farm Setup), D2 locations table, and D5-D7 (Events, Surveys, Harvest) with 22 architecture decisions (A1–A22). This session tackled the remaining Tier 1 domains: D2 forage_types, D4 Feed Inventory, and D11 App Infrastructure.

---

## What Was Done This Session

1. **D2 remainder: forage_types** — 1 table designed and APPROVED:
   - `forage_types` — reference table for forage species/cultivars. Carries per-type grazing parameters (utilization_pct, dm_kg_per_cm_per_ha, min_residual_height_cm) as Tier 2 defaults in the 3-tier config cascade (A15, A17). Locations and feed types FK to this table.

2. **D4: Feed Inventory** — 3 tables designed and APPROVED:
   - `feed_types` — product catalog with category (hay, silage, haylage, balage, grain, supplement), cutting_number for product template identity, harvest_active toggle, forage_type FK. cost_per_unit dropped (moved to batches).
   - `batches` — inventory records with batch_number for organic feed lot traceability, source (purchase/harvest), cost_per_unit. Harvest batches auto-created via D7 (A8).
   - `batch_adjustments` — normalized from v1's JSONB adjustments[] array. Tracks who, when, why for every inventory correction (A23).

3. **D11: App Infrastructure** — 5 tables designed and APPROVED:
   - `app_logs` — direct-write to Supabase, no sync queue, no operation_id (A24).
   - `submissions` — feedback/support with thread kept as JSONB (conversation log exception, A25). All other fields normalized.
   - `todos` — location_id FK replaces paddock text string. animal_id FK kept for animal-linked tasks. due_date promoted to proper column.
   - `todo_assignments` — junction table replacing v1's assignedTo[] JSONB array (A26).
   - `release_notes` — new global table replacing v1's hardcoded "what's new" modal.

4. **4 new architecture decisions logged (A23–A26):**
   - A23: Batch adjustments normalized from JSONB to proper table
   - A24: App logs direct-write to Supabase (no sync queue)
   - A25: Submission thread kept as JSONB (conversation log exception)
   - A26: Todo assignments normalized from JSONB to junction table

5. **Docs updated:**
   - GTHO_V2_SCHEMA_DESIGN.md — D2 forage_types, D4, D11 sections fully written with column specs, design decisions, SQL
   - V2_BUILD_INDEX.md — D2/D4/D11 marked APPROVED, A23–A26 logged, current focus updated

---

## Decision Log (Key Decisions for Next Session)

All decisions are in V2_BUILD_INDEX.md § Architecture Decisions Log. New this session:

- **A23:** Batch adjustments normalized. V1 stored adjustments as a JSONB array on the batch record. V2 normalizes to batch_adjustments table for auditability (who adjusted, when, why) and cross-batch queries (monthly shrinkage reports).
- **A24:** App logs bypass the sync queue and write directly to Supabase. Logs are most valuable when sync itself is broken. No operation_id — scoped by user/session.
- **A25:** Submission thread stays as JSONB. It's an append-only conversation log, only read with its parent, never queried independently. Intentional exception to the no-JSONB principle.
- **A26:** Todo assignments normalized. V1's assignedTo[] JSONB replaced by todo_assignments junction table. Enables "show me all tasks assigned to me" without array scanning.

**Other notable decisions (not A-numbered):**
- Feed type categories expanded: hay, silage, haylage, balage, grain, supplement. "Stored feed" renamed to "supplement." App-managed list (Option B), no DB constraint.
- cutting_number kept on feed_types — it's product template identity ("2nd Cut Timothy Hay" is a different product), not harvest event data.
- batch_number (text) added to batches for organic feed lot traceability.
- cost_per_unit moved from feed_types to batches — cost is per-delivery, not per-product.

---

## What's Next

**4 domains remaining.** All are Tier 2 (more complex):

1. **D3: Animals & Groups** — animals, groups, animal_group_memberships, animal_classes (A14). Core entity domain — animals FK into events, todos, health records.
2. **D8: Nutrients & Amendments** — amendments, amendment_locations, input_products, soil_tests, manure_batches, manure_batch_transactions, plus spreaders/equipment table (A22). Dense domain — consider splitting into sub-sessions.
3. **D9: Livestock Health** — animal_bcs_scores, animal_treatments, animal_breeding_records, animal_calving_records, treatment_types, ai_bulls. Split from v1's mega health-events table.
4. **D10: Feed Quality** — batch_nutritional_profiles. Single table, links to batches.

### Design approach (same as prior sessions):
- Interactive narrative — walk through each table with Tim
- One domain at a time
- Decisions logged as A# entries
- SQL included for each table

---

## Files Changed

| File | Action |
|------|--------|
| GTHO_V2_SCHEMA_DESIGN.md | D2 forage_types, D4, D11 sections fully written (were DESIGN PENDING stubs) |
| V2_BUILD_INDEX.md | D2/D4/D11 status → APPROVED, A23–A26 added, current focus updated |

---

## Open Questions

- **D8 scope:** D8 is dense (6+ tables including new spreaders/equipment per A22). May benefit from splitting into two sub-sessions: nutrient tracking (soil tests, amendments, inputs) and manure/equipment (batches, transactions, spreaders).

---

## How to Start the Next Session

1. Read `V2_BUILD_INDEX.md` — current focus and full status table
2. Read `GTHO_V2_SCHEMA_DESIGN.md` — for approved tables and design principles
3. Start D3 Animals & Groups with Tim using the interactive narrative approach
4. After each domain: update schema doc, log decisions, mark status
