# Session Brief — 2026-04-12 (Session 9)

**Project:** GTHO v2 Rebuild (App-Migration-Project repo)
**Phase:** 2 — Design
**Repo:** App-Migration-Project (docs-only project, `main` branch)

---

## Context

Continuing the architecture walkthrough of DRAFT docs. This session reviewed V2_MIGRATION_PLAN.md — all transform mappings audited against finalized v2 schema, v1 feature audit, v1 source code, and all previously approved docs (schema, architecture, calc spec, UX flows, infrastructure).

---

## What Was Done This Session

1. **V2_MIGRATION_PLAN.md — full review, 12 issues found and resolved:**

   **Missing transform sections (Issue 1):**
   - 16 new sections added (§2.9–§2.24) covering: animal_weight_records, forage_types, surveys + survey_draft_entries, paddock_observations, groups, animal_classes, animals, batches, batch_adjustments, harvest_events + harvest_event_fields, manure_batches + manure_batch_transactions, amendments + amendment_locations, todos + todo_assignments, soil_tests, event_npk_deposits (validation-only), and straight remap tables.

   **Health event split expanded (Issue 2):**
   - §2.7 expanded from 4-way to 5-way split: added animal_heat_records (per A34). Calving records now document birth weight → animal_weight_records extraction and dried_off_date as NULL for migrated records.

   **Operation settings extraction rewritten (Issue 3):**
   - §2.8 expanded from one-liner to full 3-table mapping: operations (name, timezone, currency), farms (create Home Farm per A18), farm_settings (all 20+ settings with unit conversions). Dropped keys documented.

   **v1 health notes decision (Issue 4):**
   - type='note' health events → append to animals.notes field as `"[YYYY-MM-DD] note text"`. No new table needed.

   **Forage quality mapping corrected (Issue 5):**
   - v1 actually has two fields: `rating` (0–100 numeric) and `forageQuality` (categorical: Poor/Fair/Good/Excellent). Maps directly to v2 `forage_quality` and `forage_condition`. No scale conversion needed. Feature audit's claim of "1–5 scale" was wrong — v1 code confirms 0–100.

   **Cattle species confirmed (Issue 6):**
   - Tim's operation is all beef cattle. 'cattle' → 'beef_cattle' for all classes.

   **Treatment dose parsing (Issue 7):**
   - Best-effort regex parse (number + unit string). Unparseable entries: raw dose text → treatment notes field, dose_amount/dose_unit_id left NULL. Audit report lists all unparseable doses.

   **Spreaders and feed tests skipped (Issues 8, 12):**
   - No v1 data for either. Noted as empty/skippable.

   **NPK price conversion confirmed (Issue 9):**
   - v1 stores per-lb. Conversion: ÷ 0.453592 for per-kg.

   **Feed entry location resolution corrected (Issue 10):**
   - v1 ties feed to event_id (not sub_move). Updated §2.5: if sub_move_id set → look up sub-move's pasture → remap; if null → resolve via event's first paddock window.

   **Imperial unit conversions firmed up (Issue 11):**
   - All "convert if v1 stores lbs" hedges replaced with confirmed conversion factors. v1 bugs documented: `weight_per_unit_kg` column stores lbs (naming bug), `soil_tests` default to lbs/acre.

   **Calc count corrected:**
   - §3 Phase 3 gate: 42 → 35 (per approved V2_CALCULATION_SPEC.md).

   **NPK deposits as validation tool:**
   - §2.23: v1 event_npk_deposits dropped from import (no v2 target table per A2). Used during validation step to cross-check v2 computed NPK against v1 stored values. Flag deltas > 1%.

   **§1.2 Table Split row updated:**
   - Now lists all 5 target tables for health event split.

   **Soil tests fully mapped (§2.22):**
   - v1 fields confirmed: land_id, n/p/k in lbs/acre (× 1.12085 → kg/ha), pH, organicMatter, lab, notes. Unit field dropped (v2 is metric internally).

2. **V2_BUILD_INDEX.md updated:**
   - Current focus reflects migration plan APPROVED.
   - Migration plan row updated: DRAFT → APPROVED with details.
   - Session 9 change log entry added.

---

## Decision Log

No new architecture decisions this session. All transforms follow existing decisions (A1–A43).

---

## What's Next

**V2_MIGRATION_PLAN.md APPROVED.** 6 of 7 design docs now approved. 1 DRAFT remaining.

1. Review **V2_DESIGN_SYSTEM.md** — clean up stale v1 references (§4.8 "anchor/primary label" removed per Session 8b open question), verify terminology against approved docs.
2. After design system approved, **Phase 2 is complete**.

---

## Files Changed

| File | Action |
|------|--------|
| V2_MIGRATION_PLAN.md | Status → APPROVED. §1.2 table split updated. §2.5 location resolution corrected. §2.7 expanded to 5-way split +notes migration +dose parsing. §2.8 rewritten as 3-table extraction. 16 new sections §2.9–§2.24. §3 calc count 42→35. All unit conversions confirmed. |
| V2_BUILD_INDEX.md | Current focus updated. Migration plan row DRAFT → APPROVED. Session 9 change log entry. |

---

## OPEN_ITEMS changes

None. No new open items from this session.

---

## Open Questions

None.

---

## How to Start the Next Session

1. Read `V2_BUILD_INDEX.md` — current focus and full status
2. Open `V2_DESIGN_SYSTEM.md` — last doc for walkthrough
3. Known cleanup: §4.8 references "anchor/primary label" (removed concept, flagged in Session 8b)
4. Same process: review against finalized schema + approved docs, fix stale references, approve
5. After approval, Phase 2 — Design is complete
