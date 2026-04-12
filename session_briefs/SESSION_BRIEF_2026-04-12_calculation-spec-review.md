# Session Brief — 2026-04-12 (Session 7)

**Project:** GTHO v2 Rebuild (App-Migration-Project repo)
**Phase:** 2 — Design
**Repo:** App-Migration-Project (docs-only project, `main` branch)

---

## Context

Continuing the architecture walkthrough of DRAFT docs. This session reviewed V2_CALCULATION_SPEC.md — the formula catalog (35 formulas, registerCalc() pattern, 3-tier config, reference console, v1 bugs).

---

## What Was Done This Session

1. **V2_CALCULATION_SPEC.md — full review, 13 issues found and resolved:**

   **§3.1 Configurable Parameters (Issues 1, 4, 5):**
   - All Tier 3 column references changed from `operations.*` to `farm_settings.*` (A18 alignment).
   - Four default values synced with schema: DM per AUD 11.8→12 kg, residual height 7.6→10 cm, utilization 50→65%, recovery min 30→21 days.
   - Excretion rates and DMI changed to 2-tier config (class → NRCS code constant). No farm_settings Tier 3 needed — classes seeded with industry standards at onboarding, editable per class (A39).
   - `default_dm_per_aud_kg` removed from farm_settings. DM-per-AUD is now derived: `default_au_weight_kg × dmi_pct / 100`.
   - `default_dmi_pct` reference removed (never existed in schema).

   **Excretion Rate Alignment (Issue 2):**
   - Schema columns renamed: `excretion_n_pct` → `excretion_n_rate` (and P, K). NRCS standard unit is kg/1000kg BW/day, not a percentage. Prevents unit confusion during implementation (A40).
   - registerCalc() example updated to use `excretionNRate`.

   **Lactation-Aware DMI (Issue 3):**
   - Added `dmi_pct_lactating` to animal_classes schema.
   - Added `dried_off_date` to animal_calving_records for dairy dry-off tracking.
   - DMI-2 formula updated with lactation determination logic: beef = calf weaning ends lactation; dairy = explicit dry-off date ends lactation. Compute on read (A2, A38).

   **Beef/Dairy Species Split (Issue 3, continued):**
   - Species `'cattle'` split into `'beef_cattle'` and `'dairy_cattle'` (A37). Same roles, different management logic (lactation cycles, DMI defaults, weaning ages).
   - Standard roles table updated with two cattle rows and species-specific notes.
   - Species CHECK constraint added to SQL.

   **NPK Price History (Issue 6):**
   - A16 resolved: `npk_price_history` table added (D8.10). Per-farm price tracking with effective_date. Query pattern: latest effective_date ≤ event date.
   - farm_settings NPK prices remain as quick-lookup for current. Settings UI creates history row when prices are updated.
   - NPK-2, CST-3, and v1 bugs table updated to reference price history pattern.

   **Formula Catalog Cleanup (Issues 8–13):**
   - Formula count corrected: 42 → 35 (10 domains). DMI section header: 7 → 8.
   - v1 bug #10 wording updated for species split.
   - REC-1 input clarified: references paddock_observations type='close' row.
   - DMI-7 terminology fixed: "paddock window feed checkpoints" → proper schema references.
   - SUR-1 forage quality thresholds: kept hardcoded, flagged as post-launch enhancement.

2. **Schema amendments — GTHO_V2_SCHEMA_DESIGN.md:**
   - D3 animal_classes: species CHECK updated, +dmi_pct_lactating, excretion columns renamed _pct → _rate, design decisions expanded.
   - D8 +npk_price_history (§8.10): new table with full design decisions.
   - D9 animal_calving_records: +dried_off_date, design decision for dairy dry-off.
   - D1 farm_settings: -default_dm_per_aud_kg, design decision explaining removal.
   - Appendix B and Change Log updated.

3. **V2_BUILD_INDEX.md updated:**
   - Current focus reflects calculation spec review in progress.
   - Schema row updated with all amendments.
   - Calc spec row: 42 → 35 formulas.
   - A16 resolved. Four new decisions added (A37–A40).
   - Change log entry for Session 7.

---

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| A37 | Beef/dairy cattle species split | Same roles, different management: lactation logic, DMI rates, weaning defaults. Species drives behavioral branching. |
| A38 | Lactation status derived from calving/weaning timeline | Not stored on animal. Beef: calf still in calf-role = dam lactating. Dairy: dried_off_date null/future = dam lactating. Compute on read (A2). |
| A39 | Excretion rates and DMI as 2-tier config | Class-level (NRCS standards seeded at onboarding, editable) → code constant. No farm_settings Tier 3. default_dm_per_aud_kg removed. |
| A40 | Excretion columns use _rate not _pct | NRCS unit is kg/1000kg BW/day, not percentage. Prevents implementation confusion. |
| A16 | Resolved: price history table, not snapshots | npk_price_history per-farm with effective_date. One update when prices change; historical events auto-resolve. |

---

## What's Next

**V2_CALCULATION_SPEC.md pending final approval.** All 13 issues resolved. Tim should review the updated doc and approve.

1. Approve V2_CALCULATION_SPEC.md → APPROVED
2. Continue walkthrough with **V2_UX_FLOWS.md** — move wizard, feed check, survey, amendment, close sequence, paddock picker
3. Then **V2_MIGRATION_PLAN.md** — ID remapping, transforms, validation, cutover
4. After both reviewed and approved, Phase 2 is complete

---

## Files Changed

| File | Action |
|------|--------|
| V2_CALCULATION_SPEC.md | §1.1 registerCalc example aligned. §3.1 all Tier 3 refs → farm_settings, defaults synced, excretion/DMI made 2-tier, DM-per-AUD derived. §4.2 DMI-2 lactation-aware logic added. §4.2 header 7→8 formulas. §4.1 NPK-2/CST-3 → price history. §4.7 REC-1 input clarified. §4.2 DMI-7 terminology fixed. §4.9 SUR-1 post-launch note. §5 bug #3/#9/#10 updated. Purpose line 42→35. |
| GTHO_V2_SCHEMA_DESIGN.md | D3 animal_classes: species split, +dmi_pct_lactating, excretion _pct→_rate. D8 +npk_price_history (§8.10). D9 animal_calving_records: +dried_off_date. D1 farm_settings: -default_dm_per_aud_kg. Appendix B + Change Log updated. |
| V2_BUILD_INDEX.md | Current focus, schema row, calc spec row, A16 resolved, A37–A40 added, change log entry. |

---

## Open Questions

- None outstanding. All 13 issues identified during review have been resolved.

---

## How to Start the Next Session

1. Read `V2_BUILD_INDEX.md` — current focus and full status
2. If V2_CALCULATION_SPEC.md not yet approved, review the changes and approve
3. Open `V2_UX_FLOWS.md` — next doc for walkthrough
4. Same process: review against finalized schema, update stale references, flag decisions, approve
