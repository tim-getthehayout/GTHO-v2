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
- **Unparseable doses** (CSV download) — animal tag, date, raw dose text, treatment type. Auto-downloads alongside the import results. Tim reviews and manually fixes in v2 if needed.
- **NPK parity check** — for every migrated event with v1 `event_npk_deposits` data, compare v2 NPK-1 calc output against v1 stored values. Flag deltas > 1% with per-event detail. See §2.23.

### 1.5 v1 Export Shape

v1's `exportDataJSON()` serializes the entire `S` state object via `JSON.stringify(S, null, 2)`. The backup is a flat JSON object with the keys below. This is the authoritative input shape for CP-57 transforms.

**Source:** v1 `ensureDataArrays()` + ARCHITECTURE.md Data Model section. Pinned to v1 codebase as of 2026-04-14.

**Arrays (26):**

| v1 Key | Description | §2 Transform |
|--------|-------------|--------------|
| `pastures` | All locations. `locationType`: `"pasture"` or `"confinement"` | §2.1 |
| `events` | Grazing events. Nested: `feedEntries[]`, `groups[]`, `feedResidualChecks[]`, `npkLedger[]`, `subMoves[]`, `forageCoverIn`, `forageCoverOut` | §2.2, §2.3, §2.4, §2.5, §2.6 |
| `feedTypes` | Feed type templates (unit, DM%, category, NPK%, forageTypeId, cuttingNum, harvestActive, defaultWeightLbs) | §2.24 |
| `batches` | Feed batches (typeId links to feedType) | §2.16 |
| `manureBatches` | Manure batches from confinement events | §2.19 |
| `inputProducts` | Commercial amendment products | §2.24 |
| `inputApplications` | Amendment application records | §2.20 |
| `animalClasses` | Species/class definitions (weight, DMI%) | §2.14 |
| `animalGroups` | Named herd compositions (id, name, color, animalIds[], classes[], archived) | §2.13 |
| `animals` | Individual animal records | §2.15 |
| `users` | Farm users (legacy shim — retained for todo assignment) | §2.24 (operation_members) |
| `todos` | Farm task records | §2.21 |
| `feedback` | Submissions (Supabase table: `submissions`) | §2.24 |
| `surveys` | Pasture survey ratings | §2.11 |
| `treatmentTypes` | Treatment type templates (id, name, category, archived) | §2.24 |
| `aiBulls` | AI sire records | §2.24 |
| `paddockObservations` | Unified paddock condition log | §2.12 |
| `animalWeightRecords` | Weight time series (id, animalId, recordedAt, weightLbs, note, source) | §2.9 |
| `animalGroupMemberships` | Group membership ledger (id, animalId, groupId, dateJoined, dateLeft) | §2.24 |
| `inputApplicationLocations` | Amendment location ledger (id, applicationId, pastureId, acres, NPK lbs) | §2.20 |
| `manureBatchTransactions` | Manure batch transaction ledger | §2.19 |
| `farms` | Farm grouping for all land | §2.8 (merge into v2 farms) |
| `soilTests` | Soil test records per field | §2.22 |
| `forageTypes` | Forage nutritional reference library (id, name, dmPct, NPK per tonne DM, isSeeded) | §2.10 |
| `harvestEvents` | Harvest events with nested `fields[]` | §2.18 |
| `batchNutritionalProfiles` | Per-batch NPK data (empty — Tim has no feed test data) | §2.24 (straight remap) |

**Objects/Scalars:**

| v1 Key | Description | §2 Transform |
|--------|-------------|--------------|
| `herd` | Legacy herd summary {name, type, count, weight, dmi} | §2.8 (herd.name → operations.name). Rest dropped — superseded by animalGroups. |
| `settings` | All settings — see sub-fields below | §2.8 (split across operations, farms, farm_settings, user_preferences) |
| `errorLog` | Client-side error log (capped 200) | Dropped. Diagnostic noise. |
| `setupUpdatedAt` | ISO timestamp for Drive merge | Dropped. v2 uses per-record updated_at. |
| `testerName` | Farmer name for feedback attribution | Dropped. v2 uses auth identity. |
| `version` | Legacy field (always `'v1.2'`) | Dropped. |
| `_herdMigrated` | Migration flag | Dropped. |
| `_groupsMigrated` | Migration flag | Dropped. |
| `_paddocksMigrated` | Migration flag | Dropped. |

**`settings` sub-fields (relevant to migration):**

| v1 Sub-field | Default | §2 Target |
|-------------|---------|-----------|
| `nPrice` / `pPrice` / `kPrice` | 0.55 / 0.65 / 0.42 | §2.8 farm_settings (convert $/lb → $/kg) + §2.25 npk_price_history |
| `nExc` / `pExc` / `kExc` | 0.32 / 0.09 / 0.30 | §2.8 → animal_classes excretion rates (if populated) |
| `manureVolumeRate` | 65 gal/AU/day | §2.8 farm_settings.default_manure_rate_kg_per_day |
| `manureLoadLbs` | 8000 | Dropped. v2 uses spreaders table (§2.24). |
| `manureVolumeUnit` | `'loads'` | Dropped. Display pref only. |
| `homeStats` | Array of stat keys | §2.24 user_preferences |
| `homeStatPeriod` | `'7d'` | §2.24 user_preferences |
| `homeViewMode` | `'groups'` | §2.24 user_preferences |
| `auWeight` | 1000 lbs | §2.8 farm_settings.default_au_weight_kg (× 0.453592) |
| `recoveryRequired` | false | §2.8 farm_settings |
| `recoveryMinDays` / `recoveryMaxDays` | 30 / 60 | §2.8 farm_settings |
| `thresholds` | {} | §2.8 farm_settings (threshold_* fields) |
| `feedDayGoal` | 90 | §2.8 farm_settings |
| `weanTargets` | {cattle:205, sheep:60, goat:60} | §2.14 animal_classes.weaning_age_days |
| `residualGrazeHeight` | (from operations row) | §2.8 farm_settings.default_residual_height_cm (× 2.54) |
| `forageUtilizationPct` | (from operations row) | §2.8 farm_settings.default_utilization_pct |
| `dmPerAUD` | (from operations row) | Dropped. v2 derives from per-class DMI (A39). |

### 1.6 CP-57 Architecture — Reuse of CP-56 Import Pipeline

CP-57's job is: read v1 JSON → apply 24 transforms → produce a v2-shaped backup envelope (same format as CP-55 §5.2) → feed that envelope into the CP-56 import pipeline (§5.7).

**Why reuse:** CP-56 already handles FK-ordering (§5.3a), wholesale replace, parity check, progress UI, and error handling. Building a parallel write path would duplicate all of that.

**CP-56 steps that CP-57 skips:**
- **Auto-backup (§5.7 step 4):** On first migration the v2 operation is empty — there is nothing to back up. CP-57 skips the auto-backup step when the target operation has no existing data. (On subsequent re-runs where data already exists, the auto-backup runs normally.)

**Synthesized envelope:**
- `format`: `"gtho-v2-backup"`
- `format_version`: current (currently `1`)
- `schema_version`: current build's schema version (read dynamically per §5.11)
- `exported_at`: migration timestamp
- `exported_by`: Tim's auth identity
- `operation_id`: the new v2 operation UUID
- `build_stamp`: current build
- `counts`: computed from transformed data
- `tables`: all transformed v2 tables

### 1.7 CP-57 Tool UX

The v1 migration tool lives in **Settings → Import**, alongside the existing CP-56 "Import backup" option. Two entry points in the same section:
- "Import backup" — restores a v2 backup (CP-56)
- "Import from v1" — reads a v1 JSON export, transforms, and imports (CP-57 → CP-56)

**Input:** File upload. Tim exports from v1 via `exportDataJSON()`, picks the file in v2.

**Re-run:** Allowed. Since CP-56 does a wholesale replace, re-running replaces whatever's there. Useful if the first attempt fails or Tim wants to re-run with updated v1 data.

**Post-cutover cleanup:** Remove the "Import from v1" option after Tim is live on v2 and migration is verified (OI-0036).

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
| — | source_event_id | NULL for all migrated events. New in v2 (GH-5, migration 014) — links cross-farm moves. v1 has no equivalent; all migrated events are origin events. |

### 2.3 event_sub_moves → event_paddock_windows

v1 sub-moves become additional paddock windows on the parent event. The "anchor paddock" becomes the first paddock window (same date_opened as event date_in).

**Strip grazing columns (A45 — new in v2):** All migrated paddock windows default to full-paddock — `is_strip_graze = false`, `strip_group_id = NULL`, `area_pct = 100`. v1 has no strip graze concept. These match the column defaults in migration 005 (`is_strip_graze DEFAULT false`, `area_pct DEFAULT 100`), but the migration tool sets them explicitly for clarity. Strip grazing is a v2-only workflow; users who want it on previously-migrated events would need to close and re-create.

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
- v1 type='note' → `animal_notes` table rows (one per note). `noted_at` from the health event date. `note` from the health event text. v2 has a dedicated `animal_notes` table (migration 012, per OI-0003) — routing notes here preserves per-note timestamps as first-class records. Any pre-existing v1 `animals.notes` free-text stays in the v2 `animals.notes` field as-is (it may contain context that predates the health events system). Minor duplication is possible if v1 wrote the same note to both places — accepted; Tim's note volume is low and doubles are harmless.
- v1 dose is freeform text (e.g., "10ml", "2 tabs"). Best-effort parse: regex extracts number → dose_amount, unit string → match to dose_units row. Unparseable entries: copy raw dose text to treatment notes field, leave dose_amount/dose_unit_id NULL. Unparseable doses are exported as a **CSV audit file** (auto-downloaded alongside import results) with columns: animal tag, date, raw dose text, treatment type. See §1.4.
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
| — | schema_version | Set to the current schema version at time of migration. Read dynamically — same constant or derivation that CP-55 export uses per §5.11. Required so subsequent CP-55 backups carry the correct version. |

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
| — | archived | `false` for all migrated classes. v1 uses hard delete — any class present in the export is active. |

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
- **user_preferences** — new table. Populate from v1 operation_settings UI prefs (selectedMetrics, periodFilter, etc.). `active_farm_id = NULL` — puts migrated user in "All farms" mode (v1 has no multi-farm concept; with one farm post-migration the UX is identical, and the preference is neutral if a second farm is added later).

### 2.25 npk_price_history

v1 stores only current NPK prices in `operation_settings` JSONB (`nPrice`/`pPrice`/`kPrice`). Tim has never changed these values, so there is no price history to extract.

**Action:** Create one `npk_price_history` row with all three prices:
- `effective_date` = migration date
- `n_price_per_kg` = v1 `nPrice` converted from $/lb → $/kg (÷ 0.453592, same conversion as §2.8 farm_settings)
- `p_price_per_kg` = v1 `pPrice` converted from $/lb → $/kg
- `k_price_per_kg` = v1 `kPrice` converted from $/lb → $/kg
- `farm_id` = FK to the migrated farm

This seeds the price history so v2 reports can look up prices by date from day one.

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

## 5. Backup Format (CP-55 / CP-56)

This section defines v2's own backup/restore format — separate from the v1→v2 migration tool in §1–2. v1→v2 migration reads v1's export shape and applies 24 transforms. This section defines the v2 JSON backup that v2 exports and re-imports into itself to protect against data loss, to move an operation between Supabase projects, and to seed test/staging environments.

**Scope note.** CP-55 implements the export. CP-56 implements the import. Both read from this single canonical format definition. Any schema or state-shape change must update this section in the same commit — see `CLAUDE.md` → "Export/Import Spec Sync Rule."

### 5.1 Design Principles

1. **Round-trip or nothing.** Export → Import on the same schema version must reproduce state byte-equivalent (modulo timestamp metadata fields). If a field is not in this spec, it is not backed up.
2. **Forward-compatible import.** Backups taken on older schema versions must import into newer builds via a migration chain — one migration function per schema version bump, applied in order.
3. **Reject newer backups.** A backup whose `schema_version` is greater than the current build refuses to import, with a clear error. Users must update their client first.
4. **Operation-scoped.** One backup contains exactly one operation's data. Multi-operation users export one file per operation.
5. **No auth material.** Access control (operation_members, RLS rules, auth tokens, passwords) is never in the backup. Access control belongs to the Supabase project, not the data.
6. **Diagnostic noise excluded.** `app_logs` is not in the backup. Logs are recovery scaffolding, not user data.

### 5.2 File Format

**File name:** `gtho-v2-backup__{operation-slug}__{YYYY-MM-DD_HHmm}__schema-v{N}.json`

- `operation-slug` = kebab-case of `operations.name`, truncated to 48 chars, ASCII-only (non-ASCII replaced with `-`).
- `YYYY-MM-DD_HHmm` = export timestamp in operation's configured timezone (fallback: UTC).
- `N` = `schema_version` (integer).

**MIME:** `application/json`. **Encoding:** UTF-8. **Line endings:** `\n`. **Indentation:** 2-space pretty-print (readable by humans; small enough for any real-world operation).

**Top-level shape:**

```json
{
  "format": "gtho-v2-backup",
  "format_version": 1,
  "schema_version": 14,
  "exported_at": "2026-04-13T18:22:00Z",
  "exported_by": {
    "user_id": "uuid",
    "email": "tim@6knot.com"
  },
  "operation_id": "uuid",
  "build_stamp": "b20260413.1822",
  "counts": {
    "farms": 2,
    "events": 847,
    "animals": 312,
    "batches": 56,
    "todos": 14
  },
  "tables": {
    "operations": [ /* 1 row */ ],
    "farms": [ /* N rows */ ],
    /* ... all included tables ... */
  }
}
```

The `counts` block is metadata for the import preview sheet (V2_UX_FLOWS.md §20.3); CP-55 populates it on export, CP-56 reads it to build the confirm dialog without parsing every table first.

`format_version` ticks independently of `schema_version` — `format_version` covers changes to the envelope itself (e.g., if `counts` becomes nested, or `exported_by` adds fields). `schema_version` covers changes to what's inside `tables`.

### 5.3 Tables Included

Every table in V2_SCHEMA_DESIGN.md is included **except** the exclusions in §5.4. The authoritative list as of `schema_version` 14 (2026-04-13):

**D1 — Operation & Farm Setup**
operations, farms, farm_settings, user_preferences

**D2 — Locations**
locations, forage_types

**D3 — Animals & Groups**
animal_classes, animals, groups, animal_group_memberships

**D4 — Feed Inventory**
feed_types, batches, batch_adjustments

**D5 — Event System**
events, event_paddock_windows, event_group_windows, event_feed_entries, event_feed_checks, event_feed_check_items

**D6 — Surveys**
surveys, survey_draft_entries, paddock_observations

**D7 — Harvest**
harvest_events, harvest_event_fields

**D8 — Nutrients & Amendments**
input_product_categories, input_product_units, input_products, spreaders, soil_tests, amendments, amendment_locations, manure_batches, manure_batch_transactions, npk_price_history

**D9 — Livestock Health**
ai_bulls, treatment_categories, treatment_types, dose_units, animal_bcs_scores, animal_treatments, animal_breeding_records, animal_heat_records, animal_calving_records, animal_weight_records, animal_notes

**D10 — Feed Quality**
batch_nutritional_profiles

**D11 — App Infrastructure**
submissions, todos, todo_assignments

Reference tables (`treatment_categories`, `treatment_types`, `dose_units`, `input_product_categories`, `input_product_units`, `forage_types`, `animal_classes`) are included because users extend them. On import, CP-56 merges by `id` — user-added rows overwrite any seed collision; seed rows not in the backup are left as-is.

The domain grouping above is for human readability. **Implementers must use §5.3a below for the authoritative insert/delete order** — domain order is not FK-safe on its own.

### 5.3a Insert / Delete Order (FK-Dependency Ordering)

Supabase enforces foreign-key integrity at write time. A wholesale replace that ignores FK ordering fails immediately:

- **Inserts** must run parents → children (a child row cannot reference a parent that has not been inserted yet).
- **Deletes** must run children → parents (a parent row cannot be deleted while child rows still reference it — unless the FK is `ON DELETE CASCADE`, in which case the child is implicitly removed with its parent, but relying on that silently loses audit trail and is forbidden in the restore path).

**Rule:** Inserts iterate the list below top-to-bottom. Deletes iterate the list bottom-to-top. The list below is the authoritative ordering for CP-56 and must be updated in lockstep with any schema change that adds a new table or FK (per the Export/Import Spec Sync Rule).

1. `operations`
2. `farms`
3. `forage_types`
4. `animal_classes`
5. `feed_types`
6. `ai_bulls`
7. `spreaders`
8. `input_product_categories`
9. `input_product_units`
10. `treatment_categories`
11. `dose_units`
12. `farm_settings`
13. `user_preferences`
14. `locations`
15. `animals` — **two-pass** because of self-referential `dam_id` / `sire_animal_id`: pass 1 inserts all rows with self-FKs set to `NULL`; pass 2 issues `UPDATE` statements to set `dam_id` and `sire_animal_id`.
16. `groups`
17. `batches`
18. `treatment_types`
19. `input_products`
20. `animal_group_memberships`
21. `batch_adjustments`
22. `batch_nutritional_profiles`
23. `soil_tests`
24. `surveys`
25. `events` — **two-pass** because of self-referential `source_event_id`: pass 1 inserts with `source_event_id` set to `NULL`; pass 2 `UPDATE`s to set `source_event_id`.
26. `manure_batches`
27. `amendments`
28. `amendment_locations`
29. `manure_batch_transactions`
30. `npk_price_history`
31. `event_paddock_windows`
32. `event_group_windows`
33. `event_feed_entries`
34. `event_feed_checks`
35. `event_feed_check_items`
36. `paddock_observations`
37. `survey_draft_entries`
38. `harvest_events`
39. `harvest_event_fields`
40. `animal_weight_records`
41. `animal_treatments`
42. `animal_bcs_scores`
43. `animal_breeding_records`
44. `animal_heat_records`
45. `animal_calving_records`
46. `animal_notes`
47. `todos`
48. `todo_assignments`
49. `submissions`

**Verification rule.** During CP-56 implementation, Claude Code must cross-check this list against every `FOREIGN KEY` / `REFERENCES` clause in `supabase/migrations/*.sql`. If any FK points from a table to one that appears later in this list (an "upward" reference), the list is wrong and must be corrected in the same commit.

**Two-pass tables.** Any table with a self-referential nullable FK uses the two-pass pattern above. As of `schema_version` 14, these are `animals` (dam/sire) and `events` (source_event_id). When a new self-referential FK lands, flag it as impacting §5.3a and extend the two-pass list here.

**`todo_assignments.user_id`** references `operation_members`, which is excluded from the backup (§5.4). Restoring an operation into a Supabase project that does not already have the referenced `operation_members` rows will fail. This is accepted: backups are intended to restore into the same project or one where operation access has been re-provisioned first.

### 5.4 Tables Excluded

- **`operation_members`** — access control, managed per-Supabase-project, never in the backup.
- **`app_logs`** — diagnostic noise (A24). Grows unbounded. Not part of user data.
- **`release_notes`** — global published content, not per-operation.

### 5.5 Column Serialization Rules

- **UUIDs:** serialized as lowercase canonical strings (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
- **Timestamps:** ISO 8601 UTC with `Z` suffix. Nanosecond precision is truncated to millisecond.
- **Dates:** `YYYY-MM-DD`.
- **Numerics:** JSON numbers. No quoting. NaN/Infinity are invalid and must not appear.
- **Enums:** lowercase string, matching the CHECK constraint exactly.
- **Booleans:** JSON `true`/`false`.
- **Nullable columns:** `null`, not omitted.
- **JSONB columns:** nested JSON object (not a stringified blob).
- **Arrays:** JSON arrays (e.g., `paddocks[]`, `assignedTo[]` — though most array-like v1 shapes are normalized in v2).

All values are stored in **metric** (V2_INFRASTRUCTURE.md §1.1). The backup is unit-system-agnostic; `operations.unit_system` is exported like any other column and controls display only.

### 5.6 Export Procedure (CP-55)

1. **Online check.** Refuse export if the sync queue has pending writes or the app is offline. The backup must include the latest committed state; pending writes risk truncation. Show toast: "Sync pending — retry when sync completes."
2. **Resolve operation scope.** Backup contains the operation identified by the user's currently-selected operation. If a user belongs to multiple operations, the UI picks the active one implicitly; no operation picker in the export flow.
3. **Read from Supabase, not local store.** Export reads fresh from Supabase to ensure the backup reflects the server of record, not a stale local cache. A long-lived operation export may require pagination per table (1000 rows per page).
4. **Assemble envelope.** Fill `format`, `format_version` (currently `1`), `schema_version`, `exported_at`, `exported_by`, `operation_id`, `build_stamp`, `counts`, and each table's row array.
5. **Write & download.** Serialize with `JSON.stringify(envelope, null, 2)`. Create a blob, trigger download via hidden `<a download>`. Name per §5.2.
6. **Log the export.** `logger.info('backup', 'export complete', { operation_id, row_count, file_bytes })`. No app_logs row for the contents — only the event of exporting.
7. **Progress UI.** Show a progress sheet ("Exporting… 40%") that updates per table. For operations with >10,000 total rows, the export must not block the main thread; use `setTimeout` yields between tables.

### 5.7 Import Procedure (CP-56)

CP-56 detail lives here as the single source of truth. This section, together with §5.2, §5.3, §5.3a, §5.4, §5.5, §5.8, and §5.9, is the complete CP-56 specification. The `github/issues/cp-56-*.md` file is a thin pointer to this section.

1. **File validation.** Parse JSON. Reject if `format !== "gtho-v2-backup"`. Reject if `format_version` is greater than the current build's supported `format_version`. Reject if `schema_version` is greater than the current build's `schema_version`. All three reject paths show a clear error naming the mismatch and what to do (upgrade client, or use an older backup).
2. **Pending-writes gate.** Refuse import if the sync queue has pending writes or the app is offline. The wholesale replace would silently overwrite unsynced local work. Toast: "Sync pending — retry when sync completes." Same gate CP-55 uses on export (§5.6.1).
3. **Preview sheet.** Read `counts`, render preview: target operation name ("Replacing data in: {operations.name}"), export date (`exported_at` in operation timezone), exporter email, schema version, counts (farms, events, animals, batches, todos). Two buttons: `[Cancel]` and `[Replace All Data]` (red, `--danger`). Second tap on Replace triggers a second-step confirm: "This cannot be undone. Replace all operation data?" Only the second Yes proceeds.
4. **Auto-backup of current state** (the revert safety net). Before the destructive replace runs, CP-56 calls the CP-55 export path (§5.6) to produce a fresh backup of the current operation state and triggers a browser download with the name `gtho-v2-auto-backup-before-restore__{operation-slug}__{YYYY-MM-DD_HHmm}__schema-v{N}.json`. If the auto-backup export fails for any reason (network, CP-55 refusal, download blocked), CP-56 halts with a clear error — the import does not proceed without a safety net. A toast confirms: "Saved a backup of your current data to Downloads as {filename}." See §5.7a for the full revert mechanism rationale.
5. **Migrate the imported backup forward if needed.** If `backup.schema_version < current.schema_version`, apply `BACKUP_MIGRATIONS` (§5.9) in order — one function per version bump. After the chain, assert `backup.schema_version === current.schema_version` before continuing. If any migration is missing for a required `from_version`, refuse with a clear error naming the gap.
6. **Wholesale replace — transaction strategy.** Client-side per-table replace, in FK-dependency order per §5.3a, with halt-on-first-failure. For each table (iterating §5.3a top-to-bottom for deletes, then top-to-bottom again for inserts):
   - **Deletes:** iterate §5.3a **bottom-to-top**. For each table, `DELETE FROM {table} WHERE operation_id = $1` (for `operation_id`-scoped tables) or `DELETE FROM {table} WHERE id = $1` (for `operations` itself). Every user-data table has a direct `operation_id` column per Design Principle #8 — no indirect queries through parent FKs are needed.
   - **Inserts:** iterate §5.3a **top-to-bottom**. For each table, insert backup rows in batches of up to 500 rows per `POST`. Self-referential tables (§5.3a — currently `animals` and `events`) use the two-pass pattern: pass 1 inserts with self-FKs `NULL`; pass 2 issues `UPDATE` statements to set them.
   - **On any failure**, halt immediately. Log `logger.error('backup', 'import failed', { stage, table, error })`. Do not attempt to continue with subsequent tables.
   - **Reference-table rows** (`treatment_categories`, `treatment_types`, `dose_units`, `input_product_categories`, `input_product_units`, `forage_types`, `animal_classes`) merge by `id` instead of delete-then-insert: backup rows `UPSERT` onto existing seed rows; seed rows not in the backup are untouched (§5.3).
   - No atomicity across tables. The auto-backup file from step 4 is the rollback mechanism.
7. **Re-seed local store.** After the last successful insert, call `store.hydrate()` to reload state from Supabase into local memory. All subscribers re-render.
8. **Post-import parity check.** Compare `counts` in the imported backup against post-import row counts in Supabase for each counted table (farms, events, animals, batches, todos). Also compare `backup.tables[t].length` against post-import row counts for every other table in §5.3a. Every table uses the standard `WHERE operation_id = $1` filter for counting. On mismatch, surface a report sheet listing per-table expected vs actual, and instruct the user: "Import verification failed. Your pre-import backup is saved in Downloads as {filename} — import that file to return to your prior state."
9. **Log the import.** `logger.info('backup', 'import complete', { operation_id, row_count, migrations_applied })` on success. Error paths log via `logger.error('backup', 'import failed', { stage, ... })`.
10. **Progress UI.** Non-blocking progress sheet names the current phase and table: `Validating` → `Saving current data (auto-backup)` → `Migrating (vN → vM)` → `Replacing data ({table})` → `Refreshing` → `Verifying`. Phase label is visible throughout.

### 5.7a Revert Mechanism (Design Decision)

The revert safety net for CP-56 is an **auto-downloaded pre-import backup file**, not an in-app stash.

**How revert works.** If a user wants to undo an import — either because the post-import parity check failed, because the imported data turned out to be wrong, or because they changed their mind — they import the auto-backup file that CP-56 downloaded to their disk in step 4 above. There is no in-app "Revert" button. Revert = "Settings → Import backup → pick the `gtho-v2-auto-backup-before-restore__…` file."

**Why not localStorage / IndexedDB / Supabase side table.** A pre-import snapshot of a real operation routinely exceeds localStorage's ~5 MB per-origin quota. IndexedDB solves size but adds a second durable-storage surface to maintain. A Supabase side table would require schema, RLS, retention policy, and cleanup — a meaningful build for a recovery path that is rarely exercised. The auto-downloaded file reuses the CP-55 export code, has no size limit, is durable across browser-data wipes, and gives the user explicit ownership of their recovery path.

**Tradeoffs accepted.** The user sees two downloads in quick succession (auto-backup, then any other artifact the session produces). The preview sheet copy warns of this explicitly. The user is responsible for not deleting the auto-backup file before they are confident the new import is good. After 30 days or whatever their own retention habits are, the file is their responsibility.

**Failure mode.** If CP-56 cannot produce the auto-backup (sync queue pending, offline, download blocked, disk full), it halts before the destructive replace. The import does not proceed without a safety net — this is a hard rule. The user sees a clear error and can retry after resolving the underlying issue.

### 5.8 Missing-Table and Missing-Column Handling

- **Missing table in backup** (because it did not exist at export time): CP-56 treats it as an empty array. No error.
- **Missing column in a row** (because the column was added after export): CP-56 uses the column's default per V2_SCHEMA_DESIGN.md. Non-nullable columns without a default cause a per-row error surfaced in the import report.
- **Extra table in backup** (because the table was removed between export and import): CP-56 drops the extra table silently, logs a warning. A migration function registered for that version bump can re-home the data if needed.
- **Extra column in a row** (because the column was removed): dropped silently.
- **Renamed column:** the migration function for the version bump that did the rename maps old name → new name explicitly. Backups taken before the rename transform through the migration; the raw JSON keys never match the post-rename schema without it.

### 5.9 Migration Chain Registry

`src/data/backup-migrations.js`:

```
export const BACKUP_MIGRATIONS = {
  // from_version → transform(backup) → backup at next version
  // Example (no entries yet because CP-55 is the first version):
  // 14: (b) => { b.tables.whatever.forEach(r => r.new_field = defaultValue); b.schema_version = 15; return b; },
};
```

When the schema next changes, the diff flags "CP-55/CP-56 spec impact" and a migration entry is added here in lockstep. The initial CP-55 export ships with `schema_version = 14` (latest migration number applied as of 2026-04-13) and an empty `BACKUP_MIGRATIONS`.

### 5.10 Security & Privacy

- Backups contain PII (user email, farm addresses if stored, animal identifiers, veterinary notes). The export triggers a download to the user's device; it is not automatically uploaded anywhere.
- The UI warns before export: "This file contains your full operation data including animal records and notes. Store it somewhere private."
- There is no in-app backup history or cloud backup storage in CP-55/CP-56. Users manage files themselves. A cloud backup feature is a Phase 3.5+ consideration.
- `exported_by.email` is included for provenance. If this is later determined to be a leak vector (e.g., sharing backups between users), replace with `user_id` only in a future `format_version` bump.

### 5.11 Schema Version Stamping

`schema_version` is the highest migration number in `supabase/migrations/` at the time of export. On boot, the app computes this by reading a stamp stored in `operations` (column `schema_version INTEGER NOT NULL DEFAULT 1`). The stamp advances when migrations run. CP-55 reads `operations.schema_version` and writes it into the backup envelope. CP-56 uses it to select the migration chain.

**Pre-CP-55 data.** Operations that existed before CP-55 ships do not have a `schema_version` column populated — migration `015_schema_version_stamp.sql` will be added alongside CP-55 to backfill the current value for every existing operation.

### 5.11a Schema Version Bump Convention

**Rule: "always do it, no judgment calls."** Every new migration file must:

1. **End with `UPDATE operations SET schema_version = N;`** where N is the migration number. This stamps the DB. No exceptions — even migrations that only add an index or tweak a constraint bump the version.
2. **Add a `BACKUP_MIGRATIONS` entry** in `src/data/backup-migrations.js`. If the migration does not change the shape of backup data, add a no-op entry that just ticks the version: `N-1: (b) => { b.schema_version = N; return b; },`. If it does change shape (new column, renamed field, new table), add the actual transform.
3. **If the migration adds a table or FK**, update §5.3 (table list) and §5.3a (FK-dependency ordering) in this file.

**Why "always":** "Sometimes" requires Claude Code to make a judgment call about whether a particular migration needs a bump or a registry entry. Judgment calls are where things get missed. The cost of a no-op migration entry is one line of code. The cost of a missed entry is a broken backup chain that nobody notices until a user tries to restore.

**Enforcement:** CLAUDE.md "Code Quality Checks" item #6 repeats this rule. It is verified before every commit.

### 5.12 Round-Trip Test

Every new migration adds a round-trip test in `tests/unit/backup-roundtrip.spec.js`:

1. Build a seeded state at `schema_version = N` (fixture JSON).
2. Export. Assert every included table, every column, every row present and byte-equal to expected.
3. Import the just-exported backup on a clean state. Assert the state matches the original seed.
4. Import a backup fixture at `schema_version = N-1`. Assert the migration chain runs and final state matches the expected post-migration seed.

This test is the canary for "did we forget to flag an export/import spec impact?" — if a schema change lands without updating §5.3 and the test fixture, the round-trip fails.

---

*End of document. For data schemas see V2_SCHEMA_DESIGN.md. For code patterns see V2_APP_ARCHITECTURE.md. For formulas see V2_CALCULATION_SPEC.md. For UX flows see V2_UX_FLOWS.md.*
