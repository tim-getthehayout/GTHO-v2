# Session Brief — 2026-04-11 (Session 3)

**Project:** GTHO v2 Rebuild (App-Migration-Project repo)
**Phase:** 2 — Design
**Repo:** App-Migration-Project (docs-only project, `main` branch)

---

## Context

Continuing Phase 2 schema design. Prior sessions completed D1, D2, D4–D7, and D11 with 26 architecture decisions (A1–A26). This session tackled D3: Animals & Groups — the core livestock domain.

---

## What Was Done This Session

1. **D3: Animals & Groups** — 4 tables designed and APPROVED:

   - `animal_classes` — Reference table with a **role + name model (A27)**. Each class has a system-defined `role` (cow, heifer, bull, steer, calf, ewe, ram, wether, lamb, doe, buck, kid) that drives business logic (action gating, weaning transitions, breeding eligibility) and a user-defined `name` for operational labeling. Users can have multiple classes per role ("Spring Heifers" and "Fall Heifers" both role=heifer). Species list: cattle, sheep, goat, other (no pig). Tier 2 in 3-tier config cascade (A14, A17).

   - `animals` — Core entity. Proper sire FKs replace v1's free-text sireTag: `sire_animal_id` for herd bulls, `sire_ai_bull_id` for AI sires (A28). Confirmed bred status removed from animal — now derived from breeding records (A29). Cull fields flattened from v1's JSONB cullRecord to three columns. No stored derived fields (weight, group, wean target date — all compute on read per A2). No JSONB arrays (healthEvents, calvingRecords, weightHistory all moved to proper tables).

   - `groups` — Farm-scoped operational label (A30). Just name + color. Each farm maintains separate groups. No animalIds array — membership always derived from ledger.

   - `animal_group_memberships` — Complete history ledger of which animal was in which group and when. Open membership (date_left IS NULL) = currently in group. Dovetails with event_group_windows: membership says who's in the group, event windows say the group was on a pasture during a time period.

2. **4 new architecture decisions logged (A27–A30):**
   - A27: Class role drives action gating; calving triggers class reassignment prompt, not auto-transition
   - A28: Sire linkage via proper FKs (herd bull or AI bull), not free text
   - A29: Confirmed bred derived from breeding records, not stored on animal
   - A30: Groups are farm-scoped, not operation-scoped

3. **Docs updated:**
   - GTHO_V2_SCHEMA_DESIGN.md — D3 section fully written with column specs, design decisions, role tables, SQL
   - V2_BUILD_INDEX.md — D3 marked APPROVED, A27–A30 logged, current focus updated to D8

---

## Decision Log (Key Decisions for Next Session)

All decisions are in V2_BUILD_INDEX.md § Architecture Decisions Log. New this session:

- **A27:** Role + name model for animal classes. System roles per species gate actions (calving only for cow/heifer/ewe/doe, breeding only for eligible roles, etc.). Class names are user labels. Calving on a heifer-role animal prompts class reassignment (e.g., to "First-Calf Heifer") but doesn't force it. "First-Calf Heifer" is still role=heifer — same business rules, different management label.
- **A28:** V1's sireTag (free text) replaced by two FKs: `sire_animal_id` (herd bull in the animals table) or `sire_ai_bull_id` (AI sire in ai_bulls reference table). At most one populated. This is lineage on the animal; breeding event details live on `animal_breeding_records` (D9).
- **A29:** `confirmed_bred` and `confirmed_bred_date` removed from animals table. Status derived from breeding records: most recent breeding record with a `confirmed_date` and no subsequent calving event = currently confirmed bred. Resets naturally when calving is recorded. Keeps a running history of breeding confirmations over time.
- **A30:** Groups scoped to farm, not operation. A "Cull" group on Farm 1 is separate from "Cull" on Farm 2. Cross-farm animal moves = close membership in Farm 1's group, open in Farm 2's group. Moving an entire group between farms = update farm_id on the group record.

**Other notable decisions (not A-numbered):**
- Species list: cattle, sheep, goat, other. No pig for now.
- "First-Calf Heifer" is a class with role=heifer, not a separate system role. Keeps the role list clean.
- Reason field on memberships is free text, not enum — new reasons can emerge without schema changes.
- One open membership per animal at a time — app-enforced, not DB constraint (offline sync tolerance).

---

## What's Next

**3 domains remaining.** All are Tier 2 (more complex):

1. **D8: Nutrients & Amendments** — amendments, amendment_locations, input_products, soil_tests, manure_batches, manure_batch_transactions, plus spreaders/equipment table (A22). Dense domain — consider splitting into sub-sessions.
2. **D9: Livestock Health** — animal_bcs_scores, animal_treatments, animal_breeding_records, animal_calving_records, treatment_types, ai_bulls. Split from v1's mega health-events table. **Note:** A28 and A29 from this session affect D9 design — breeding records now carry confirmed_date, and ai_bulls is referenced by animals.sire_ai_bull_id.
3. **D10: Feed Quality** — batch_nutritional_profiles. Single table, links to batches.

### Design approach (same as prior sessions):
- Interactive narrative — walk through each table with Tim
- One domain at a time
- Decisions logged as A# entries
- SQL included for each table

---

## Files Changed

| File | Action |
|------|--------|
| GTHO_V2_SCHEMA_DESIGN.md | D3 section fully written (was DESIGN PENDING stubs) — 4 tables with column specs, role tables, design decisions, SQL |
| V2_BUILD_INDEX.md | D3 status → APPROVED, A27–A30 added, current focus updated to D8 |

---

## Open Questions

- **D8 scope:** Still flagged from prior session — D8 is dense (6+ tables including spreaders/equipment per A22). May benefit from splitting into two sub-sessions: nutrient tracking (soil tests, amendments, inputs) and manure/equipment (batches, transactions, spreaders).
- **D9 interaction with A28/A29:** The ai_bulls table (D9) is now referenced by animals.sire_ai_bull_id. Design D9's ai_bulls table before or alongside animal_breeding_records to ensure FK consistency.

---

## How to Start the Next Session

1. Read `V2_BUILD_INDEX.md` — current focus and full status table
2. Read `GTHO_V2_SCHEMA_DESIGN.md` — for approved tables and design principles
3. Start D8 Nutrients & Amendments (or D9 if Tim prefers — D9 may be more natural following D3 since it's the health/breeding side of animals)
4. After each domain: update schema doc, log decisions, mark status
