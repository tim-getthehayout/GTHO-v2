# GTHO v2 — Migration Plan

**Status:** APPROVED
**Source:** Prior ARCHITECTURE.md §14, §18, §19, §20
**Purpose:** Define how v1 data moves to v2, the rollout phases, and the cutover plan.

---

## 1. Migration Pipeline

### 1.1 Overview

```
v1 Supabase → Export JSON → Transform → Validate → Import → v2 Supabase
```

This is a one-time migration for Tim's data. There is one user, one operation.

### 1.2 Transform Steps

| Step | What | Details |
|------|------|---------|
| ID Remap | All IDs → fresh UUIDs | Maintain FK relationships. Map table: {old_id: new_uuid} per table. |
| Name Normalize | Field names → canonical glossary | v1 field aliases → v2 canonical names (see V2_APP_ARCHITECTURE.md §8) |
| Unit Convert | Imperial → metric | weight_lbs → weight_kg, area_acres → area_hectares, height_inches → height_cm |
| Schema Map | v1 table shapes → v2 table shapes | pastures → locations (add type/land_use), events (drop pastureId/animalCount), etc. |
| Table Split | Mega-tables → normalized | animal_health_events → animal_bcs_scores + animal_treatments + animal_breeding_records + animal_heat_records + animal_calving_records (5-way split per A34) |
| JSONB Extract | JSONB blobs → proper tables | operation_settings.data → operations columns, survey.draft_ratings → survey_draft_entries, residual_checks.type_checks → event_feed_check_items |

### 1.3 Validation

After transform, before import:
- FK resolution: every FK points to a record that exists
- Required fields: no NULLs in NOT NULL columns
- Type checks: UUIDs are valid, dates parse, numbers are numeric
- Orphan detection: child records without parents flagged
- Duplicate detection: no duplicate PKs

### 1.4 Audit Report

After migration, generate:
- Record counts per table (v1 vs v2)
- ID remap statistics
- Validation failures (with row-level detail)
- Orphaned records
- Skipped records (and why)

---

## 2. Key Transform Decisions

### 2.1 pastures → locations

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id (bigint or text) | id (uuid) | Remap |
| location_type ('paddock'/'drylot'/'barn') | type + land_use | 'drylot' or 'barn' → type='confinement'. 'paddock' → type='land', land_use='pasture' |
| acres | area_hectares | × 0.404686 |
| residual_graze_height (inches) | — | Dropped. Belongs on forage_type. |
| forage_type_id (text) | forage_type_id (uuid) | Remap |

### 2.2 events

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id (bigint) | id (uuid) | Remap |
| pasture_id | — | Dropped. Becomes event_paddock_window. |
| animal_count | — | Dropped. Becomes event_group_window.head_count. |
| avg_weight | — | Dropped. Becomes event_group_window.avg_weight_kg (convert lbs→kg). |
| status | — | Dropped. Derived from date_out. |
| no_pasture | — | Dropped. Inferred from location type, or set on paddock window. |

### 2.3 event_sub_moves → event_paddock_windows

v1 sub-moves become additional paddock windows on the parent event. The "anchor paddock" becomes the first paddock window (same date_opened as event date_in).

### 2.4 event_group_memberships → event_group_windows

v1 group memberships become group windows. head_snapshot → head_count, weight_snapshot → avg_weight_kg (convert to metric).

### 2.5 event_feed_deliveries → event_feed_entries

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| sub_move_id | location_id | If sub_move_id set: look up sub-move's pasture_id → remap to location UUID. If null: delivery was to anchor paddock — resolve via event's first paddock window (earliest date_opened) → use that location_id. v1 ties feed to event_id, not to a paddock directly. |
| qty (can be negative for transfers) | quantity (always positive) | Take absolute value. If negative, create entry on destination event with source_event_id. |
| transfer_pair_id | source_event_id | Find paired entry, link to its event_id. |

### 2.6 event_feed_residual_checks → event_feed_checks + event_feed_check_items

Split JSONB type_checks into normalized rows:
- Parent: id, event_id, date, is_close_reading, notes
- Children: one row per entry in type_checks array → feed_check_id, batch_id, location_id, remaining_quantity

### 2.7 animal_health_events → 5 tables + weight records

Split by type field:

| v1 type | v1 subtype | v2 Table | Key Transforms |
|---------|-----------|----------|----------------|
| 'bcs' | — | animal_bcs_scores | score → score (keep numeric). likelyCull → likely_cull. |
| 'treatment' | — | animal_treatments | dose (freeform text) → dose_amount (numeric) + dose_unit_id (FK). treatmentTypeId → treatment_type_id (remap). |
| 'breeding' | 'ai' or 'bull' | animal_breeding_records | method = subtype. sireRegNum dropped (resolve via FK). aiBullId → sire_ai_bull_id (remap). bullAnimalId → sire_animal_id (remap). |
| 'breeding' | 'heat' | animal_heat_records | date → observed_at. Notes only. Per A34: heats are separate from breeding. |
| 'calving' | — | animal_calving_records | animalId → dam_id. Link calf via calf_id (remap from v1 calf record if exists). Birth weight → animal_weight_records row (source='calving'). dried_off_date: NULL for all migrated records (new in v2 per A38). |

**Notes:**
- v1 type='note' → append to `animals.notes`. Format: `"[YYYY-MM-DD] note text\n"` per entry, chronological order. The animal record has a text notes field; concatenating preserves the info without adding a new table.
- v1 dose is freeform text (e.g., "10ml", "2 tabs"). Best-effort parse: regex extracts number → dose_amount, unit string → match to dose_units row. Unparseable entries: copy raw dose text to treatment notes field, leave dose_amount/dose_unit_id NULL. Audit report lists all unparseable doses for manual review.
- Birth weight extracted from calving records becomes a separate animal_weight_records row — do not store on calving record (v2 schema stores weight history separately).

### 2.8 operation_settings JSONB → operations + farms + farm_settings

v1 stores all config in a single JSONB blob on `operation_settings.data`. v2 splits this across three tables:

**operations:**

| v1 JSONB key | v2 Field | Transform |
|-------------|----------|-----------|
| herdName | name | Direct copy |
| — | timezone | New in v2. Set to Tim's timezone during migration. |
| — | currency | Default 'USD' (v1 has no currency field). |
| — | unit_system | Default `'imperial'`. v1 has no unit toggle — it operates exclusively in imperial units (lbs, acres, inches). New operations created post-migration default to `'imperial'` and can switch in Settings. |

**farms** (create one "Home Farm" record per A18):

| v1 JSONB key | v2 Field | Transform |
|-------------|----------|-----------|
| — | id | New UUID |
| — | operation_id | FK to migrated operation |
| — | name | "Home Farm" (or derive from herdName) |

**farm_settings** (1:1 child of farms):

| v1 JSONB key | v2 Field | Transform |
|-------------|----------|-----------|
| auWeight | default_au_weight_kg | × 0.453592 (lbs→kg) |
| residualGrazeHeight | default_residual_height_cm | × 2.54 (inches→cm) |
| forageUtilizationPct | default_utilization_pct | Direct (already %) |
| recoveryRequired | recovery_required | Direct (boolean) |
| recoveryMinDays | default_recovery_min_days | Direct |
| recoveryMaxDays | default_recovery_max_days | Direct |
| nPrice | n_price_per_kg | ÷ 0.453592 (per-lb → per-kg). v1 stores per-lb. |
| pPrice | p_price_per_kg | ÷ 0.453592 |
| kPrice | k_price_per_kg | ÷ 0.453592 |
| volumeRate | default_manure_rate_kg_per_day | Convert lbs→kg |
| audsTarget% | threshold_aud_target_pct | Direct |
| audsWarning% | threshold_aud_warn_pct | Direct |
| pasturePercent target/warn | threshold_rotation_target_pct / threshold_rotation_warn_pct | Direct |
| npkPerAcre | threshold_npk_warn_per_ha | Convert per-acre → per-ha (÷ 0.404686) |
| costPerDay target/warn | threshold_cost_per_day_target / threshold_cost_per_day_warn | Direct (currency amount) |
| — | feed_day_goal | Default 90 (new in v2 per A43) |
| — | forage_quality_scale_min | Default 1 (new in v2 per A41) |
| — | forage_quality_scale_max | Default 100 (new in v2 per A41) |

**Dropped v1 keys:** herdType (A19 — species defined by animal_classes), herdCount/herdWeight (derived), dmPerAud (A39 — now per-class), selectedMetrics/periodFilter (UI prefs → user_preferences), manure loadLbs (A22 — now spreaders table), wean targets (moved to animal_classes.weaning_age_days), version, testerName, syncQueue.

### 2.9 animal_weight_records

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| animalId | animal_id (uuid) | Remap |
| weightLbs | weight_kg | × 0.453592 |
| recordedAt | recorded_at | Direct (timestamptz) |
| — | source | 'import' for all migrated records |
| notes | notes | Direct |

### 2.10 forage_types

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| name | name | Direct |
| dm_pct | dm_pct | Direct |
| n_per_tonne_dm | n_per_tonne_dm | Direct |
| p_per_tonne_dm | p_per_tonne_dm | Direct |
| k_per_tonne_dm | k_per_tonne_dm | Direct |
| dm_lbs_per_inch_per_acre | dm_kg_per_cm_per_ha | × 0.4412 (lbs→kg ÷ inch→cm ÷ acre→ha) |
| — | min_residual_height_cm | Populate from v1 global setting if available (× 2.54 to metric). |
| — | utilization_pct | Populate from v1 global setting (per A15 — moved from global to per-type). |
| — | archived | false (v1 uses hard delete) |

### 2.11 surveys → surveys + survey_draft_entries

**surveys (parent):**

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| status | status | Direct ('draft' or 'committed') |
| — | survey_date | Extract from v1 created_at or earliest observation date |
| — | type | 'bulk' (v1 surveys are always multi-paddock) |

**survey_draft_entries** (extract from draftRatings JSONB):

Each key in `draftRatings` is a paddock ID. Each value becomes a row:

| v1 JSONB field | v2 Field | Transform |
|---------------|----------|-----------|
| (key) | location_id | Remap paddock ID |
| vegHeight | forage_height_cm | × 2.54 (inches→cm) |
| forageCoverPct | forage_cover_pct | Direct |
| rating | forage_quality | Direct (v1 is 0–100, v2 default scale is 1–100 per A41 — no conversion needed) |
| forageQuality | forage_condition | Direct ('Poor'→'poor', 'Fair'→'fair', 'Good'→'good', 'Excellent'→'excellent' — lowercase normalize) |
| recoveryMinDays | recovery_min_days | Direct |
| recoveryMaxDays | recovery_max_days | Direct |
| notes | notes | Direct |

**Note:** Only extract draft entries for surveys still in 'draft' status. Committed surveys already wrote to paddock_observations.

### 2.12 paddock_observations

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| pastureId | location_id | Remap |
| observedAt | observed_at | Direct |
| source | source | Map: 'survey' → 'survey', 'event_open'/'event_close' → 'event', 'sub_move_open'/'sub_move_close' → 'event' |
| sourceId | source_id | Remap to new event/survey UUID |
| vegHeight | forage_height_cm | × 2.54 |
| forageCoverPct | forage_cover_pct | Direct |
| forageQuality | forage_quality | Direct (v1 stores 0–100 numeric, matches v2 default scale) |
| forageCondition | forage_condition | Direct (lowercase normalize) |
| recoveryMinDays | recovery_min_days | Direct |
| recoveryMaxDays | recovery_max_days | Direct |
| notes | notes | Direct |
| — | residual_height_cm | NULL (v1 doesn't capture separately) |
| — | bale_ring_residue_count | NULL (new in v2) |

**Dropped:** pastureName (resolve via FK), confidenceRank (v2 derives from source type).

### 2.13 groups

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| name | name | Direct |
| operation_id | farm_id | Remap to new farm UUID (per A30 — groups are farm-scoped in v2) |

### 2.14 animal_classes

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| name | name | Direct |
| species | species | Map: 'cattle' → 'beef_cattle' (Tim's operation is all beef). Multi-species operations would need per-class mapping. |
| weight | default_weight_kg | × 0.453592 |
| dmi_pct | dmi_pct | Direct |
| — | dmi_pct_lactating | NULL (new in v2 per A38). Seed with NRCS defaults post-migration. |
| — | excretion_n_rate, excretion_p_rate, excretion_k_rate | NULL. Seed with NRCS defaults post-migration (per A39, A40). |
| — | weaning_age_days | Populate from v1 operation_settings wean targets by species |
| — | role | Map from species + class name heuristic (e.g., "Cow" → 'cow', "Calf" → 'calf') |

### 2.15 animals

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| tag | tag | Direct |
| name | name | Direct |
| sex | sex | Direct |
| class_id | class_id | Remap |
| damId | dam_id | Remap (nullable) |
| birthDate | birth_date | Direct |
| — | sire_animal_id | Populate from v1 breeding/calving records if linkable |
| — | sire_ai_bull_id | Populate from v1 breeding records if linkable |
| notes | notes | Direct |
| archived | archived | Direct |

**Dropped:** weaned (derived in v2 from calving timeline per A38), weanTargetDate (class-level per A14), weightHistory[] (superseded by animal_weight_records table).

### 2.16 batches

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| feed_type_id | feed_type_id | Remap |
| name | name | Direct |
| quantity | quantity | Direct (already in feed-type units) |
| remaining | remaining | Direct |
| unit | unit | Direct |
| weight_per_unit_kg | weight_per_unit_kg | × 0.453592 (v1 column is misnamed — stores lbs despite `_kg` suffix) |
| dm_pct | dm_pct | Direct |
| — | cost_per_unit | Migrate from v1 feed_type cost if per-batch cost not available |
| — | source | 'purchase' (default; 'harvest' if linked to harvest_event) |
| purchase_date | purchase_date | Direct |
| notes | notes | Direct |

### 2.17 batch_adjustments (extract from JSONB)

v1 stores adjustments as an embedded array on each batch record. Each element becomes a row:

| v1 Array Element | v2 Field | Transform |
|-----------------|----------|-----------|
| — | id (uuid) | New UUID |
| (parent batch) | batch_id | Remap |
| previousQty | previous_qty | Direct |
| newQty | new_qty | Direct |
| — | delta | Compute: new_qty - previous_qty |
| reason | reason | Direct |
| — | adjusted_by | NULL (v1 doesn't track who adjusted) |
| timestamp | created_at | Direct |

### 2.18 harvest_events + harvest_event_fields

**harvest_events:**

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| date | date | Direct |
| notes | notes | Direct |

**harvest_event_fields:**

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| harvest_event_id | harvest_event_id | Remap |
| pasture_id | location_id | Remap |
| feed_type_id | feed_type_id | Remap |
| quantity | quantity | Direct |
| weight_per_unit_kg | weight_per_unit_kg | × 0.453592 (v1 stores lbs despite column name) |
| dm_pct | dm_pct | Direct |
| cutting_number | cutting_number | Direct |
| batch_id | batch_id | Remap (nullable) |

### 2.19 manure_batches + manure_batch_transactions

**manure_batches:**

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| label | label | Direct |
| source_location_id | source_location_id | Remap |
| estimated_volume_lbs | estimated_volume_kg | × 0.453592 (v1 stores lbs) |
| n_lbs | n_kg | × 0.453592 |
| p_lbs | p_kg | × 0.453592 |
| k_lbs | k_kg | × 0.453592 |
| — | s_kg through cl_kg (10 elements) | NULL (v1 tracks N/P/K only; expanded panel is new per A36) |

**manure_batch_transactions:**

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| batch_id | batch_id | Remap |
| type | type | Direct ('input' or 'application') |
| transaction_date | transaction_date | Direct |
| volume_lbs | volume_kg | × 0.453592 |
| source_event_id | source_event_id | Remap (nullable) |
| amendment_id | amendment_id | Remap (nullable) |

### 2.20 input_applications → amendments + amendment_locations

v1's `input_applications` + `input_application_locations` map to v2's `amendments` + `amendment_locations`:

**amendments:**

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| applied_at | applied_at | Direct |
| input_product_id | input_product_id | Remap |
| — | source_type | 'product' (manure amendments are separate path) |
| — | spreader_id | NULL (v1 uses global manure_load_kg, not per-spreader) |
| total_qty | total_qty | Direct |
| notes | notes | Direct |

**amendment_locations:**

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| application_id | amendment_id | Remap |
| pasture_id | location_id | Remap |
| qty | qty | Direct |
| n_kg, p_kg, k_kg | n_kg, p_kg, k_kg | Direct |
| — | s_kg through cl_kg (10 elements) | NULL (v1 tracks N/P/K only) |
| area_acres | area_ha | × 0.404686 |

### 2.21 todos → todos + todo_assignments

**todos:**

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| title | title | Direct |
| body | body | Direct |
| status | status | Direct |
| due_date | due_date | Direct |

**todo_assignments** (extract from assignedTo JSONB array):

Each element in `assignedTo[]` becomes a row:

| v1 Array Element | v2 Field | Transform |
|-----------------|----------|-----------|
| — | id (uuid) | New UUID |
| (parent todo) | todo_id | Remap |
| userId | member_id | Remap to operation_members UUID |

### 2.22 soil_tests

| v1 Field | v2 Field | Transform |
|----------|----------|-----------|
| id | id (uuid) | Remap |
| land_id | location_id | Remap |
| date | test_date | Direct |
| n, p, k | n, p, k | v1 stores in lbs/acre (unit field defaults 'lbs/acre'). Convert to v2 unit (kg/ha): × 1.12085 (lbs/acre → kg/ha). |
| unit | — | Dropped (v2 uses metric internally) |
| pH | ph | Direct |
| organicMatter | organic_matter | Direct |
| — | s through cl (10 elements) | NULL (v1 tracks N/P/K only) |
| lab | lab_name | Direct |
| notes | notes | Direct |

### 2.23 event_npk_deposits — drop (validation only)

v1 stores pre-calculated NPK excretion values per event. v2 computes NPK on read (A2) — no target table exists.

**Action:** Do not import. Instead, use v1 `event_npk_deposits` data during the **validation step** (§1.3) to cross-check that v2's on-the-fly NPK calculations produce comparable results for migrated events. Include in the audit report (§1.4) as a "calculation parity" section: for each migrated event, compare v1 stored NPK vs v2 computed NPK, flag any deltas > 1%.

### 2.24 Straight remap tables

These tables need ID remapping and operation_id scoping but no structural changes:

- **feed_types** — remap IDs. Move cost_per_unit to batch level if not already (v2 stores cost on batch, not type).
- **ai_bulls** — remap IDs. Field names align.
- **batch_nutritional_profiles** — empty (Tim has no feed test data). No v1 data to migrate.
- **treatment_types** — remap IDs. treatment_categories extracted if v1 has implicit categories.
- **input_products** — remap IDs. input_product_categories extracted if v1 has implicit categories.
- **spreaders** — empty (new in v2 per A22). No v1 data to migrate. Tim can set up spreaders in v2 if/when needed.
- **operation_members** — remap IDs. Role mapping if v1 roles differ.
- **user_preferences** — new table. Populate from v1 operation_settings UI prefs (selectedMetrics, periodFilter, etc.).

---

## 3. Rollout Phases

### Phase 1 — Scaffold (Checkpoints 1-6)

Build the app shell: Vite, store, entities, SyncAdapter, router, Sheet class, DOM builder, i18n, units, logger, calc-registry. App boots, routes, persists, syncs. No features.

**Gate:** App shell loads, routes work, store persists to localStorage, sync adapter connects to Supabase, all entity shape round-trips pass.

### Phase 2 — Core Loop (Checkpoints 7-14)

Create/edit/delete grazing events, location management, animal/group management, basic dashboard, offline create + sync. Farmer can track grazing.

**Gate:** Can create an event, add paddock/group windows, deliver feed, do a feed check, close the event via move wizard, see it on dashboard.

### Phase 3 — Assessment (Checkpoints 15-21)

Pasture surveys, feed management (transfers, inventory), calculation engine (NPK, DMI, cost, forage) with registerCalc(), reports, offline-capable.

**Gate:** All 35 registered calculations tested (per approved V2_CALCULATION_SPEC.md). Survey workflow complete. Reports render correctly.

### Phase 4 — Advanced (Checkpoints 22-32)

Voice field mode (5 checkpoints), rotation calendar, season comparison, export/import, v1→v2 migration tool, multi-farm, settings screen with calc reference console.

**Gate:** Voice creates a valid event. Migration tool successfully imports Tim's v1 data. Reference console shows all calcs.

### Phase 5 — Polish

PWA optimization, offline sync hardening, performance, accessibility, feedback system, production migration testing, cutover.

**Gate:** Lighthouse PWA score > 90. All 14 sync scenarios pass. Tim's full dataset migrated and verified.

---

## 4. Cutover Plan

### 4.1 Pre-Cutover

1. Run migration tool against v1 production data → v2 staging
2. Tim verifies: spot-check events, feed entries, surveys, NPK calculations
3. Fix any migration issues, re-run
4. Repeat until clean

### 4.2 Cutover Day

1. Tim stops using v1
2. Final migration run (captures any last-minute v1 data)
3. Tim verifies v2 data
4. DNS/domain swap: getthehayout.com → v2 GitHub Pages
5. v1 remains accessible at a subdomain (legacy.getthehayout.com) for reference

### 4.3 Post-Cutover

- v1 Supabase project kept read-only for 90 days
- After 90 days with no issues, v1 project archived
- Key rotation on v2 Supabase (rotate service role key, update .env.build, verify edge functions)

---

*End of document. For data schemas see V2_SCHEMA_DESIGN.md. For code patterns see V2_APP_ARCHITECTURE.md. For formulas see V2_CALCULATION_SPEC.md. For UX flows see V2_UX_FLOWS.md.*
