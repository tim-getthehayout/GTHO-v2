# Open Items

## Open

---

### OI-0055 — Four Tables Missing operation_id Column — Breaks Import, RLS, and Scoped Queries
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** CP-56 / CP-57
**Status:** open — schema fix required (migration 019)

**Problem:** Four child/junction tables were designed without a direct `operation_id` column, relying on transitive scoping through a parent FK:

| Table | Parent FK | Parent table |
|---|---|---|
| `todo_assignments` | `todo_id` | `todos` |
| `event_feed_check_items` | `feed_check_id` | `event_feed_checks` |
| `harvest_event_fields` | `harvest_event_id` | `harvest_events` |
| `survey_draft_entries` | `survey_id` | `surveys` |

This violates Design Principle #8 ("every user-data table has `operation_id`") and causes failures anywhere code assumes a direct `operation_id` column: backup import delete (`deleteTableRows()`), parity check (`parityCheck()`), RLS policies (which had to use join-based USING clauses), and any future operation-scoped query. The v1 import crashed on `todo_assignments` with `column operation_id does not exist` — zero data was imported.

**Root cause fix (not workaround):** Add `operation_id uuid NOT NULL` with FK to `operations` on all four tables. Migration 019 adds the column, backfills from parent, adds NOT NULL constraint, and creates standard granular RLS policies matching Pattern A from V2_INFRASTRUCTURE.md §5.1. Entity files, shape functions, and store calls updated to include `operation_id`. This eliminates the exception class entirely — no `INDIRECT_OPERATION_TABLES` map needed.

**CP-55/CP-56 impact:** Export must include the new column. Import delete and parity check work with the standard `operation_id` pattern (no special cases). BACKUP_MIGRATIONS entry 18 adds `operation_id` to these four tables in older backups by looking up the parent FK.

**Spec file:** `github/issues/SESSION_BRIEF_2026-04-14_import-join-table-delete-fix.md`

---

### OI-0054 — Sync Adapter Uses Upsert Which Requires UPDATE Policy to Pass on INSERT
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P0
**Checkpoint:** pre-Tier-3-testing
**Status:** closed — fixed 2026-04-14

**Problem:** `custom-sync.js` line 205 uses `.upsert(record, { onConflict: 'id' })` for every write. Supabase treats upsert as INSERT + UPDATE, requiring both policies to pass. During onboarding, the `operation_members` row doesn't exist yet, so any UPDATE policy that checks membership fails. This cascades to every table: operations (rejected despite `WITH CHECK (true)` on INSERT, because upsert also evaluates UPDATE policy) → operation_members (FK violation because operations row didn't land) → all other tables (RLS violation because no member row exists).

24 records dead-lettered on every onboarding attempt. Tier 3 migration testing is blocked.

**Root cause:** The sync adapter doesn't distinguish between new records (from store `add()`) and existing records (from store `update()`). It uses upsert for both, which is semantically incorrect and triggers the wrong RLS evaluation path.

**Two-part fix required:**

1. **Sync adapter (custom-sync.js):** `push()` must accept an `operation` hint ('insert' or 'update'). Store's `add()` passes 'insert' → sync uses `.insert()`. Store's `update()` passes 'update' → sync uses `.update().eq('id', id)`. Recovery/resync path keeps `.upsert()` (by the time recovery runs, the member row exists).

2. **RLS migration (018):** Split every `FOR ALL` policy into granular INSERT/SELECT/UPDATE/DELETE. INSERT uses `WITH CHECK (true)` (FK constraints enforce valid operation_id). SELECT/UPDATE/DELETE check membership. This is defense-in-depth: even if the sync adapter uses upsert, INSERT won't be blocked by the UPDATE check. See V2_INFRASTRUCTURE.md §5.1 for the updated patterns.

**Affects:** All tables with `FOR ALL` policies (~40 tables). All onboarding seed data. All Tier 3+ migration testing.

**Base docs updated:** V2_INFRASTRUCTURE.md §5.1 (RLS patterns), V2_APP_ARCHITECTURE.md §5.2 (sync write methods).

---

### OI-0053 — operation_members RLS Policy Infinite Recursion Blocks All Sync
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P0
**Checkpoint:** pre-Tier-3-testing
**Status:** closed — partially fixed 2026-04-14, remaining work tracked in OI-0054

Dropped `operation_members_all` (FOR ALL, self-referential → infinite recursion). Replaced with 4 granular policies: SELECT (own row + operation members), INSERT (self-bootstrap via `user_id = auth.uid()` + admin/owner invite), UPDATE (admin/owner), DELETE (owner only). Applied missing migrations 014–016 to Supabase. Disabled RLS on `dose_units` and `input_product_units` (no `operation_id` column). Migration 017 written. Migration 001 updated for fresh DB setups. Schema version bumped to 17.

**Post-fix discovery:** The recursion fix alone was insufficient. The `operation_members` SELECT policy was further simplified to `USING (user_id = auth.uid())` to eliminate all self-referential subqueries. Even with that fix, sync still failed because the sync adapter uses `.upsert()` which requires UPDATE policies to pass during INSERT (see OI-0054).

**Spec file:** `github/issues/SESSION_BRIEF_2026-04-14_supabase-migrations-rls-fix.md`

---

### OI-0052 — Onboarding Wizard Renders 3× on First Load
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** pre-Phase-3.5
**Status:** open — code fix required

`boot()` in `main.js` calls `showApp(app)` on initial load (line 70), which renders the onboarding wizard. Then Supabase's `onAuthStateChange` fires `INITIAL_SESSION` and `TOKEN_REFRESHED` events, each triggering the `onAuthChange` callback (line 81) which calls `clear(app)` + `showApp(app)` again. Each `showApp` call creates a new onboarding container and appends it. Result: 3 copies of step 1 visible.

Affects authenticated app shell too (duplicate headers/routes), but less visible because the content looks the same.

**Root cause:** `onAuthStateChange` fires for all events including `INITIAL_SESSION`, which duplicates the work `boot()` already did.

**Fix options:**
1. Guard `showApp` with a flag so it only executes once (reset on explicit logout)
2. Filter `onAuthStateChange` events — skip `INITIAL_SESSION` since `boot()` handles it; only react to `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED` (and for token refresh, don't re-render)

---

### OI-0051 — Migration Summary Screen: Add "Copy Error Log" Button
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** pre-Tier-3-testing
**Status:** open — code addition required

The migration summary screen (`src/features/settings/v1-import.js`) shows success/failure/parity results and auto-downloads unparseable dose CSV, but provides no way to capture the error log for troubleshooting. During Tier 3 testing (real v1 data on the deployed site), Tim needs an easy way to share errors without opening DevTools.

**What to add:** A "Copy error log" button on all three migration result screens (success, parity failure, error). On tap, collects the last 50 `app_logs` entries (from in-memory logger buffer or Supabase query), any migration-specific warnings from the `audit` object, and the `result` object summary. Formats as text, copies to clipboard. Toast: "Error log copied."

**Where:** `showV1SuccessReport()`, `showV1ParityReport()`, and the error card in `handleV1Import()` — add button to each.

---

### OI-0050 — Onboarding & Settings Records Never Sync to Supabase
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** pre-CP-66
**Status:** closed — fixed 2026-04-14

All 10 `add()` calls in onboarding and all 5 `update()` calls in settings now include `toSupabaseFn` and `table` params. Full codebase audit confirmed no other `add()`/`update()` calls missing sync params. "Resync to server" button added to Settings → Sync & Data as recovery path for existing users (`pushAllToSupabase()` re-queues all localStorage data).

**Spec file:** `github/issues/BUG_onboarding-settings-sync-gap.md`

---

### OI-0048 — Migration: Observation Type Inference Defaults All to 'open'
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

Type now inferred from raw v1 source string: `rawSource.includes('close') ? 'close' : 'open'`. Covers `event_close` and `sub_move_close`. 4 unit tests added.

**Spec file:** `github/issues/v1-migration-open-event-fixes.md`

---

### OI-0049 — Migration: Feed Transfer Source Linking Dropped
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

Transfer pair index built before event loop, `source_event_id` resolved via `transferPairId` for both sides. Orphaned pairs logged to audit warnings. Stats tracked: `transferPairsFound`, `transferPairsLinked`, `transferPairsOrphaned`. 3 unit tests added.

**Spec file:** `github/issues/v1-migration-open-event-fixes.md`

---

### OI-0047 — Member Management & Invite Flow Missing from V2 UX Specs
**Added:** 2026-04-14 | **Area:** v2-design | **Priority:** P2
**Checkpoint:** pre-Phase-3.5
**Status:** open — spec written, pending approval

V2_UX_FLOWS.md §20.1 references "operation members list (admin only; link to member management)" but no §20.3 flow was ever designed. V1 had a working invite system (`sbInviteMember` + OTP email + `claim_pending_invite` RPC). V2's `operation_members` schema (§1.4) supports pending invites but there's no UI flow, no invite mechanism, and no build checkpoint.

**Spec file:** `github/issues/CP-66_member-management-invite.md`
**Schema impact:** Adds `invite_token uuid` column to `operation_members`. Impacts CP-55/CP-56.
**Decisions made:** Shareable link approach (admin copies URL, sends via text/email/etc.). No Supabase email service required. Email-based fallback claim preserved from v1 for belt-and-suspenders.

---

### OI-0046 — App Header Missing "Get The Hay Out" App Name
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P3
**Checkpoint:** post-GH-5
**Status:** closed — fixed 2026-04-14

Added `t('app.name')` as `.header-app-name` element above the operation name in `src/ui/header.js`. Styled as 11px uppercase muted text (`--text2`). Does not compete with operation name or farm picker.

---

### OI-0040 — Move Wizard / Event Close Missing Residual Height + Recovery Day Inputs
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

Added post-graze observation fields (residual height, recovery min/max days) to event close, move wizard close-out panel, and sub-move close. Added pre-graze observation fields (forage height, forage cover %) to move wizard destination panel and sub-move open. Validation controlled by `farm_settings.recovery_required`. Fields pre-fill from farm_settings defaults. New `observation-fields.js` helper module reused across all 3 surfaces. `createObservation()` extended with optional `fields` parameter. Recovery required toggle added to Settings.

---

### OI-0041 — Move Wizard Missing Pre-Graze Observation Fields
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** post-CP-57
**Status:** closed — merged into OI-0040 fix (2026-04-14)

Pre-graze fields (forage height, forage cover %) added to move wizard destination panel and sub-move open sheet.

---

### OI-0042 — Health Recording: Group Session Mode Not Implemented
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P3
**Checkpoint:** post-CP-57
**Status:** open — deferred to Phase 3.5 (Polish). Single-animal mode is functional; group iteration is a workflow convenience.

V2_UX_FLOWS.md §14 specifies group session mode for Weight, BCS, and Treatment recording (iterate through animals in a group). This is not implemented — health recording is single-animal only. No advance-to-next or group iteration pattern in weight.js, bcs.js, or treatment.js.

---

### OI-0043 — Field Mode Tile Navigation Targets Incorrect
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

"Harvest" tile now navigates to `#/harvest` (the harvest recording screen) instead of `#/feed` (feed inventory). "Feed Animals" stays at `#/events` which is the correct parent screen for feed delivery actions. Direct-to-sheet opening deferred — the parent screen navigation gives the user the right context.

---

### OI-0044 — Remaining i18n Hardcoded Strings (6 low-priority)
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P4
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

All 28 i18n violations fixed. Final 6: mobile-events-screen.js detail summary, reports/reference-console.js title, rotation-calendar/toolbar.js add button, settings parity reports, amendments/entry.js currency display.

---

### OI-0045 — Dead Export: daysBetweenExact() in date-utils.js
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P4
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

Removed `daysBetweenExact()` from `src/utils/date-utils.js` and its 3 tests from `tests/unit/date-utils.test.js`.

---

### OI-0039 — §2.25 Spec Text Describes Per-Element Rows but Schema Uses Single Row
**Added:** 2026-04-14 | **Closed:** 2026-04-14 | **Area:** v2-design | **Priority:** P3
**Checkpoint:** CP-57
**Status:** closed — spec updated 2026-04-14

**Resolution:** V2_MIGRATION_PLAN.md §2.25 rewritten to match the implemented schema: one row per effective date with three price columns (`n_price_per_kg`, `p_price_per_kg`, `k_price_per_kg`), not three rows with an `element` discriminator. Code was already correct. Spec-only fix.

---

### OI-0037 — CP-57 Drift: schema_version hardcoded instead of imported from backup-import.js
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** CP-57
**Status:** closed — fixed 2026-04-14

**What is wrong:** `src/data/v1-migration.js` defines its own `CURRENT_SCHEMA_VERSION = 14` constant. §2.8 says "Read dynamically — same constant or derivation that CP-55 export uses per §5.11." If a new migration lands, v1-migration.js would retain stale value.

**Spec violated:** V2_MIGRATION_PLAN.md §2.8 (`schema_version` row) and §1.6 (`schema_version: current build's schema version (read dynamically per §5.11)`).

**Correct behavior:** Import `CURRENT_SCHEMA_VERSION` from `backup-import.js` (the single source of truth) instead of declaring a duplicate constant.

**Files affected:** `src/data/v1-migration.js`

---

### OI-0038 — CP-57 Drift: auto-backup not skipped for empty operations per §1.6
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-57
**Status:** closed — fixed 2026-04-14

**What is wrong:** `src/features/settings/v1-import.js` calls `importOperationBackup()` unconditionally. §1.6 says "CP-57 skips the auto-backup step when the target operation has no existing data." On first migration an empty operation produces a useless auto-backup download.

**Spec violated:** V2_MIGRATION_PLAN.md §1.6 (CP-57 Architecture — CP-56 steps that CP-57 skips).

**Correct behavior:** Add a `skipAutoBackup` option to `importOperationBackup()`. CP-57 passes `skipAutoBackup: true` when the target operation is empty (no events, animals, or locations). CP-56's own import path never sets it.

**Files affected:** `src/data/backup-import.js`, `src/features/settings/v1-import.js`, `src/data/v1-migration.js`

---

### OI-0036 — Remove v1 Import Option from Settings After Cutover
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P4
**Checkpoint:** post-cutover
**Status:** open — deferred until v2 is live and v1 migration is complete

The "Import from v1" option in Settings → Import (CP-57) is a one-time migration tool. After Tim has migrated, verified data, and gone live in v2, the v1 import entry point should be removed from the UI. Not urgent — it does no harm sitting there — but it's cleanup that keeps Settings tidy.

**Fix:** Remove the "Import from v1" button/section from the Settings → Import screen. Delete or gate the migration transform code behind a feature flag or remove entirely. One PR after cutover is confirmed.

---

### OI-0020 — Calc Reference Console Destination (Reports → Settings)
**Added:** 2026-04-13 | **Area:** v2-design → v2-build | **Priority:** P3
**Checkpoint:** post-CP-54 (future)

The Calc Reference console (renders all registered formulas grouped by domain) currently lives in Reports and is reached as a tab alongside the six report tabs listed in §4.6. It is a developer/audit surface, not a user-facing report. The right long-term home is **Settings → Developer** (or equivalent), which keeps Reports focused on user-facing analytics.

**Why defer:** moving it now expands CP-54 scope. Reports already renders it; no user-visible regression by leaving it there one CP longer. The Settings surface for this doesn't yet have a design.

**Fix path:**
1. Design a Settings → Developer (or Settings → Advanced) section that houses the calc reference (and any other admin/diagnostic surfaces).
2. Move the console render from Reports to the new Settings section.
3. Remove the tab from Reports; update §4.6 to list exactly the 6 tabs with no "plus Calc Reference" aside.
4. Grep and delete any `#/reports/reference` routes.

**Out of scope for CP-54.** Claude Code should leave the reference console in Reports for this checkpoint.

---

### OI-0012 — Calc Test Coverage Gap
**Added:** 2026-04-13 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-45/CP-46/CP-47
**Status:** closed — fixed 2026-04-14

Added 29 targeted tests to `tests/unit/calcs.test.js` (13 → 42 total): DMI-1 residual-by-date regression (3 tests), DMI-2 lactation branching beef vs dairy (3 tests), DMI-5 interpolation (2 tests), FED-1 residual percentage (3 tests), CST-1 feed cost (2 tests), CST-2 batch unit cost (2 tests), CST-3 NPK value (2 tests), REC-1 strip graze independent recovery (1 test). All requested coverage gaps addressed.

---

### OI-0013 — Reference Console Description Spot-Check
**Added:** 2026-04-13 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-45/CP-46/CP-47
**Status:** closed — fixed 2026-04-14

Audited all 37 `registerCalc()` calls across 4 files (core.js, feed-forage.js, advanced.js, capacity.js) against V2_CALCULATION_SPEC.md §4. Found 1 mismatch: CST-2 description said "cost_total / quantity_original" but spec says "bidirectional" — corrected. All other 36 descriptions match (some code descriptions add clarifying detail beyond the spec, which is acceptable).

---

### OI-0008 — CP-17: Location Picker Recovery Section Always Empty
**Added:** 2026-04-12 | **Updated:** 2026-04-14 | **Area:** v2-build | **Priority:** P3
**Checkpoint:** CP-17
**Status:** open — unblocked, ready to build

**No longer blocked.** OI-0040 fix landed — close observations now capture `recovery_min_days` and `recovery_max_days`. REC-1 calc is implemented in `src/calcs/advanced.js`. All the data and calc pieces exist.

**What remains:** Wire REC-1 into the location picker in `src/features/events/index.js` (line ~644 `renderLocationPicker()`). Currently a comment at line ~664 says "without paddock_observations we can't determine recovery status" and puts all non-in-use land locations into "Ready."

**Fix:**
1. For each non-in-use land location, query its most recent close observation (`type='close'`)
2. If that observation has `recoveryMinDays`, run REC-1 to get `earliestReturn`
3. If today < `earliestReturn` → classify as "Recovering" instead of "Ready"
4. Add a "Recovering" section to the sections array (between Ready and In Use)
5. ~15–20 lines of code. No schema change, no new calc.

---

## Closed

### OI-0035 — Schema Version Bump Convention Not Spec'd
**Added:** 2026-04-14 | **Closed:** 2026-04-14 | **Area:** v2-design / v2-build
**Resolution:** Convention defined and codified in two places: (1) **V2_MIGRATION_PLAN.md §5.11a** — new subsection "Schema Version Bump Convention" specifying that every new migration SQL ends with `UPDATE operations SET schema_version = N;` and adds a `BACKUP_MIGRATIONS` entry (no-op is fine: `N-1: (b) => { b.schema_version = N; return b; }`), plus update §5.3/§5.3a if the migration adds a table or FK. (2) **CLAUDE.md Code Quality Check #6** — enforced at commit time, same three requirements. Principle: "always do it, no judgment calls" — removes the need for case-by-case assessment of whether a migration changes backup shape.

---

### OI-0034 — CP-57 §2.7 Unparseable-Dose Audit Report Surface
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Downloaded CSV file. Format: one row per unparseable dose (animal tag, date, raw dose text, treatment_type, notes). Downloaded automatically at end of migration alongside the summary screen. V2_MIGRATION_PLAN.md §1.4 (Audit Report) and §2.7 updated to specify CSV download surface.

---

### OI-0033 — CP-57 §2.23 Calculation Parity Check — Promote to Formal AC
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Promoted to formal CP-57 acceptance criterion. NPK parity check: v1 stored NPK per event vs v2 on-read NPK calc, flag deltas >1% in the audit report. V2_MIGRATION_PLAN.md §1.4 updated with parity check bullet. Reference in §2.23 retained.

---

### OI-0032 — CP-57 Architecture: Reuse of CP-56 Import Pipeline
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Confirmed: CP-57 reads v1 JSON → applies 24 transforms → produces a v2-shaped backup envelope (same format as CP-55) → feeds into CP-56 import pipeline. Gets FK-ordering (§5.3a), parity check, and migration chain for free. Auto-backup step skipped when target operation is empty (one-off migration, nothing to back up). `schema_version` in synthesized envelope set to current. Documented in new **V2_MIGRATION_PLAN.md §1.6** (CP-57 Architecture).

---

### OI-0031 — CP-57 Tool UX: Where Does the Migration Tool Live?
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Settings → Import, alongside CP-56's "Import backup." Labeled "Import from v1." File upload (v1 JSON export). Re-run allowed (user can retry after failed attempt). Documented in new **V2_MIGRATION_PLAN.md §1.7** (CP-57 Tool UX). Post-cutover cleanup: OI-0036 added to remove the v1 import option after migration is complete.

---

### OI-0030 — CP-57 §1 Missing: v1 Export JSON Shape
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Option (a) — snapshot v1 export shape into v2 docs. New **V2_MIGRATION_PLAN.md §1.5** documents the complete v1 `S` object: 26 arrays (events, paddocks, animals, groups, etc.), objects/scalars (users, operationSettings, settings sub-fields), each with §2 transform cross-reference. Pulled from v1's `ensureDataArrays()` in index.html and ARCHITECTURE.md data model section.

---

### OI-0029 — CP-57 §2.14 animal_classes — Verify Rename/Splits Alignment
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Verified against `supabase/migrations/003_d3_animals_groups.sql`. §2.14 field list matches current schema. Added `archived = false` row to §2.14 for all migrated classes (column exists in schema, not previously in the transform spec). No rename/split drift found — the "rename/splits" noted in CLAUDE.md referred to earlier design iteration, not a code-level divergence.

---

### OI-0028 — CP-57 §2 Missing Transform: npk_price_history
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** v1 tracks only current NPK prices (not history) in `operation_settings` JSONB (`nPrice`/`pPrice`/`kPrice`). Migration creates one `npk_price_history` row per element (N, P, K) with `effective_date = migration date` and current prices converted from $/lb to $/kg. New **V2_MIGRATION_PLAN.md §2.25** (npk_price_history) documents the transform. Tim confirmed current values with migration date as first record is the right approach.

---

### OI-0027 — CP-57 §2.24 user_preferences.active_farm_id Default for Migrated Prefs
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Added `active_farm_id = NULL` to V2_MIGRATION_PLAN.md §2.24 user_preferences transform. Puts migrated user in "All farms" mode; they can pick an active farm after migration. v1 has no multi-farm concept. One-line spec update.

---

### OI-0026 — CP-57 §2.8 operations.schema_version Stamp During Migration
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Added row to V2_MIGRATION_PLAN.md §2.8 operations transform table: `schema_version | Set to current schema version at time of migration. Read dynamically per §5.11.` Ensures migrated operations get the correct stamp for subsequent backups/imports.

---

### OI-0025 — CP-57 §2.7 Animal Notes Routing: animal_notes Table vs animals.notes Field
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** v1 type='note' health events → `animal_notes` table rows (one per note, `noted_at` from health event date). v1 `animals.notes` (free text field) stays as-is in `animals.notes` — not moved to `animal_notes`. V2_MIGRATION_PLAN.md §2.7 rewritten with updated notes routing. Tim confirmed: not many notes, so the clean one-per-row approach works.

---

### OI-0024 — CP-57 §2.3 event_paddock_windows Strip Graze Defaults
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** Added paragraph to V2_MIGRATION_PLAN.md §2.3 specifying full-paddock defaults for all migrated paddock windows: `is_strip_graze = false`, `strip_group_id = NULL`, `area_pct = 100`. Verified against migration 005 (`is_strip_graze DEFAULT false`, `area_pct DEFAULT 100 CHECK > 0 AND <= 100`) and V2_SCHEMA_DESIGN.md §5.2 — DB defaults match the migration values, but the spec sets them explicitly for clarity. v1 has no strip graze concept; users wanting strip graze on previously-migrated events would close and re-create. Note: `area_pct = 100` confirmed as the "full paddock" value (not NULL).

---

### OI-0023 — CP-57 §2.2 events.source_event_id Default for Migrated Events
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** Added line to V2_MIGRATION_PLAN.md §2.2 events transform table: `source_event_id | NULL for all migrated events. New in v2 (GH-5, migration 014) — links cross-farm moves. v1 has no equivalent; all migrated events are origin events.` No design discussion needed — v1 has no cross-farm move concept.

---

### OI-0021 — CP-56 Transaction Strategy (Atomic Restore)
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** **Option B — per-table client-side replace in FK-dependency order, with halt-on-first-failure.** No Postgres stored procedure. Rationale: the payload-size ceiling on Supabase `rpc` (~50 MB even with bumped limits) would force chunking for real operations, and chunked RPC is not atomic across chunks either — so Option A gives atomicity in dev and a fake promise in production. Option B keeps the implementation surface smaller (no SQL function to maintain in lockstep with schema changes), fails loudly at the specific table/row that violated, and is safe because the auto-backup file from OI-0022 is the rollback mechanism. Decision locked in V2_MIGRATION_PLAN.md §5.7.6 (wholesale replace, halt, reference §5.3a for order). FK-ordering authoritative list added as new §5.3a with two-pass pattern for `animals` and `events` self-references. CLAUDE.md "Known Traps" updated with FK-ordering rule pointing at §5.3a.

### OI-0022 — CP-56 Revert Safety Net (24h Stash Mechanism)
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** **Auto-downloaded pre-import backup file.** Before the destructive replace runs, CP-56 calls the CP-55 export path to produce a fresh backup of the current operation state and triggers a browser download named `gtho-v2-auto-backup-before-restore__{slug}__{timestamp}__schema-v{N}.json`. Revert = re-import that file via the normal import flow. No in-app stash, no localStorage quota problem, no IndexedDB surface, no Supabase side table. If the auto-backup fails to produce (sync pending, offline, download blocked, disk full), CP-56 halts before the destructive replace — the import does not proceed without a safety net. Decision locked in V2_MIGRATION_PLAN.md §5.7.4 (step 4 of import procedure) and new §5.7a (Revert Mechanism — Design Decision) covering rationale, tradeoffs, and failure modes.

### OI-0019 — No Logout Affordance in Header (v1 Parity)
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design → v2-build
**Resolution:** Designed alongside OI-0015 since they share the same header real estate. User menu button (circle with initials) added to right cluster; tap opens popover with user email and Log Out. Logout triggers confirm dialog only when unsynced writes exist in the queue. Field Mode exits first before logout. Full spec: `github/issues/header-redesign-and-multi-farm-context.md`.

---

### OI-0015 — Header Shows Farm Name, Needs Operation Name + Farm Picker
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design → v2-build
**Resolution:** Full design locked. Key decisions: (1) `user_preferences.active_farm_id uuid NULL` — per-user, syncs across devices, null = "All farms" mode; (2) "All farms" mode supported — farm-scoped screens aggregate with per-record farm chips; (3) switch-with-unsaved-work shows a confirm dialog (Switch anyway / Cancel), drafts stay tied to their source farm; (4) active farm scopes display, not permissions — wizards include a **farm chip** at the top of destination pickers so cross-farm moves work without context switching; (5) **no event straddles farms** — whole-group cross-farm moves close the source event and open a new event linked by `events.source_event_id`; (6) individual animal cross-farm moves are membership edits only, no new event; (7) **build stamp restored** to header right cluster for testing diagnostics; (8) event cards render directional markers ("← from {farm}" / "→ to {farm}") when `source_event_id` links to an event on a different farm. Doc updates applied to V2_SCHEMA_DESIGN.md (§1.5, §5.1), V2_UX_FLOWS.md (§1, §17.2, new §18), V2_DESIGN_SYSTEM.md (§3.6). Full spec: `github/issues/header-redesign-and-multi-farm-context.md`.

---

### OI-0017 — Product Add Dialog Missing Unit Selection
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added unit selection (from `inputProductUnits`) to the input product create/edit sheet in `src/features/amendments/reference-tables.js`. Saves `unitId` on the product. Unit name shown in product list. Feed type sheet already had a unit selector (bale/ton/kg/lb). Treatment recording sheet already had dose unit selector. The gap was only on amendment input products.

---

### OI-0018 — Sync Status Not Shown in App Header
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added compact sync indicator to `src/ui/header.js` — dot-based (sync-ok/sync-pending/sync-err/sync-off classes from existing §3.14 design tokens). Reads from `getSyncAdapter().getStatus()`. Tap navigates to `#/settings`. CSS button in `.header-sync-btn`. No duplicate logic — reuses existing store sync state.

---

### OI-0016 — Dose Units: No Add/Edit UI
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added dose unit CRUD to `src/features/health/reference-tables.js` — add/edit sheet, archive action, list with testids. Follows existing category/type pattern. No schema change needed (table exists). Seed data preserved; users can now extend.

---

### OI-0014 — Event Close Manure Transaction volumeKg Placeholder
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Verified architecturally sound. `volumeKg=0` is a deliberate placeholder — the stored record links the event to the manure batch for tracing. Real volume requires NPK-1 calc inputs (excretion_rate × avg_weight × head_count × duration × capture_pct). Reports will compute at display time via NPK-1, not from the stored column. Code comment updated in `close.js` to document this decision. No functional change needed until Phase 3.4 amendments reports are built — re-verify when writing that display path.

---

### OI-0011 — Feed Screen Metrics Still Show Placeholders
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Wired DM on hand (sum batch.remaining × dm_pct for non-archived batches), daily run rate (average daily DM delivered over 30 days from event_feed_entries), and days on hand (DM on hand ÷ run rate) into feed day goal banner. Progress bar threshold coloring now works. Three stat cells added below the heading. Unit-aware via display().

---

### OI-0001 — Strip Grazing: Partial Paddock Windows
**Added:** 2026-04-12 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** Design integrated into main docs. Schema (V2_SCHEMA_DESIGN.md §5.2 event_paddock_windows) has `is_strip_graze`, `strip_group_id`, `area_pct`. Calc spec (V2_CALCULATION_SPEC.md) NPK-3, FOR-1, REC-1 updated for effective strip area. UX flows (V2_UX_FLOWS.md) §1.4 (move wizard strip graze option), §2.4 (advance strip action), §11 (event card strip progress) all documented. Design system §3.15 covers strip grazing progress component. Decision logged as A45 in V2_BUILD_INDEX.md. Spec remains at `github/issues/strip-grazing-paddock-windows.md` for Claude Code when this work is picked up during the rotation calendar (CP-54) or a dedicated checkpoint.

---

### OI-0002 — Unit System: No Schema Column
**Added:** 2026-04-12 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Design decision made: unit system lives on `operations` (operation-wide, same rationale as currency). Schema amended — `operations.unit_system text NOT NULL DEFAULT 'imperial' CHECK IN ('metric','imperial')`. Decision logged as A44 in V2_BUILD_INDEX.md. V2_INFRASTRUCTURE.md §1.3 added. V2_MIGRATION_PLAN.md §2.8 updated. Implementation spec written: `github/issues/unit-system-operations-migration.md` — includes localStorage → operation migration path, full list of unit-sensitive settings that must re-render on toggle, and input field conversion behavior.

---

### OI-0009 — Desktop Layout: Nav Sidebar Overlaps Main Content
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added `grid-column: 2` to `.app-content` in the `@media (min-width: 900px)` block of `src/styles/main.css`. This places the main content in the `1fr` column (right side), while the fixed nav covers the 220px left column. GH issue #1.

---

### OI-0010 — Dashboard Home Screen Not Rendering Per v1 / Missing §17 Implementation
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Complete rebuild of dashboard per V2_UX_FLOWS.md §17. Header bar updated to show farm name. Farm overview stats row (5-metric desktop, 3-metric mobile with threshold colors). Period selector pills (24h/3d/7d/30d/All). View toggle (Groups/Locations, default locations for new users). Group cards with composition line, location status bar, DMI progress, NPK deposited, action buttons (Move/Place/Weights/Edit), and collapse/expand on mobile. Location cards with active events by location, group lists, feed status, strip graze info, and unplaced groups section. Open tasks section (4 compact todo cards + Add task + All tasks link). Survey draft card (conditional). Weaning nudge (conditional). Mobile bottom nav (7 items, fixed bottom). Todos feature UI created: `src/features/todos/` with todo list screen (`#/todos` route), 3-axis filter bar (status/user/location), todo create/edit sheet, todo card component (compact + full modes). Todos nav entry with red badge (open count) on both desktop sidebar and mobile bottom nav. GH issue #2.

---

### OI-0003 — Animal Notes: No Schema Table
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-design
**Resolution:** Option A — add `animal_notes` table (id, operation_id, animal_id, noted_at, note, created_at, updated_at). Tim confirmed animals need notes. Schema amendment needed in V2_SCHEMA_DESIGN.md D9. V2_UX_FLOWS.md §14.8 updated to remove pending-decision language.

---

### OI-0004 — CP-22: Pull/Merge from Supabase Not Implemented
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Built sync registry (`src/data/sync-registry.js`) mapping all 50 entity types to table names + `fromSupabaseShape`. Added `mergeRemote()` to store (remote wins when `updated_at` newer, 5 unit tests). Added `pullAllRemote()` orchestrator (`src/data/pull-remote.js`). Wired into boot (flush queue then pull) and reconnect (window 'online' → flush then pull).

---

### OI-0006 — CP-18: Advance Strip Button Not Rendered
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Advance Strip button now renders on event cards when any paddock window has `isStripGraze=true` and is open. Sheet has two phases: close current strip (date/time) + open next strip (date/time). "End strip early" closes without opening next. Strip progress label shows "Strip N of M — Location". Creates close + open observations. Forage fields deferred to Phase 3.3. Strip progress bar visualization (§3.15) deferred — label only for now.

---

### OI-0007 — CP-17/18/20: Paddock Observations Not Created
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Added `createObservation()` helper. Observations now created at all 5 locations: event creation (open), sub-move open (open), sub-move close (close), move wizard (close per source window + open for destination), event close (close per window). Forage height/cover/quality fields remain null until Phase 3.3 populates them.

---

### OI-0005 — CP-23: E2E Test Has Wrong Selectors and Was Never Run
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Fixed 3 onboarding selector mismatches (`onboarding-op-name` → `onboarding-operation-name`, `onboarding-next` → step-specific `onboarding-next-1/2/3`, `.onboarding` → `[data-testid="onboarding-wizard"]`). Changed auth flow from signup to login (Supabase rejects fake email domains). Added `beforeAll` guard requiring E2E_EMAIL/E2E_PASSWORD env vars. All 35 selectors verified against source. Playwright browsers confirmed installed. Test requires pre-created Supabase auth account to run.

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-04-13 | Strip grazing + unit system integration | OI-0001 closed — strip grazing design integrated into V2_SCHEMA_DESIGN.md, V2_CALCULATION_SPEC.md, V2_UX_FLOWS.md, V2_DESIGN_SYSTEM.md; A45 logged. OI-0002 closed — `operations.unit_system` column added to schema; A44 logged; V2_INFRASTRUCTURE.md §1.3 added; V2_MIGRATION_PLAN.md §2.8 updated; implementation spec written to `github/issues/unit-system-operations-migration.md` covering entity update, store action, settings re-render on toggle, onboarding selector, and localStorage → operation migration. |
| 2026-04-13 | Pre-CP-54 audit + nits | Added OI-0011 (feed metrics placeholders, P2), OI-0012 (calc test gap, P2), OI-0013 (calc reference descriptions spot-check, P2), OI-0014 (event close manure volumeKg placeholder, P3) from audit. Added Tim nits: OI-0015 (header: operation name + farm picker, P2, DESIGN REQUIRED), OI-0016 (dose units CRUD, P3), OI-0017 (product add dialog missing unit selection, P2), OI-0018 (sync status not in app header, P2), OI-0019 (no logout affordance in header — v1 parity regression, P2). |
| 2026-04-13 | Header + multi-farm context design | OI-0015 closed — full design locked for header redesign (operation name + farm picker + user menu + build stamp) and multi-farm context (active_farm_id, "All farms" mode, cross-farm move pattern, no-straddling-events rule, source_event_id linkage). OI-0019 closed — bundled into same design (user menu popover with Log Out). Spec written to `github/issues/header-redesign-and-multi-farm-context.md`. Doc updates applied to V2_SCHEMA_DESIGN.md §1.5 and §5.1 (two new columns), V2_UX_FLOWS.md §17.2 (rewritten), §1 (farm chip on pickers), new §18 (farm switching), V2_DESIGN_SYSTEM.md §3.6 (extended with farm picker + user menu patterns). |
| 2026-04-13 | Rotation calendar design (CP-54) | Full design locked for CP-54. Major scope expansion from the original CP-54 row (month-columns × AUDS-colored-cells) to a continuous zoomable timeline with two view modes (Estimated Status + DM Forecast), linked-paddock rendering, proportional strip-graze bands, sub-move connectors, never-grazed tan capacity blocks with survey CTA, right-hand sidebar aligned 1:1 with the paddock column, two toolbar lightboxes (Timeline Selection + Dry Matter Forecaster), Show Confinement Locations on/off pill, and a mode indicator pill in the header. Calendar lives only on the Events screen — Reports → Rotation Calendar tab removed (Reports tab strip trimmed to 6: Feed & DMI Trends first). Mobile fallback: no calendar below 900px, mobile Events uses the v1 GRZ-11 banner + GRZ-10 events log pattern. List view on Events reuses v1 GRZ-10 event log. Doc updates: V2_DESIGN_SYSTEM.md §4.3 (Events rewritten), §4.6 (Rotation Calendar tab removed). V2_BUILD_INDEX.md CP-54 row rewritten with full acceptance criteria. V2_UX_FLOWS.md new §19 Rotation Calendar (8 subsections, Events-only). V2_CALCULATION_SPEC.md gained FOR-6 (Forecast Standing DM at Date) in the Forage domain and new §4.11 Capacity Forecast domain with CAP-1 (Period Capacity Coverage); formula count 35 → 37. OI-0001 (strip grazing) now explicitly bundled into CP-54 per the closure note. CP-54 implementation spec pending (next step this session). |
| 2026-04-13 | CP-54 pre-build reconciliation (Claude Code audit) | Added OI-0020 (Calc Reference console destination — Reports vs Settings, P3). GH-6 spec updated: calc file paths corrected to `src/calcs/feed-forage.js` (FOR-6) and new `src/calcs/capacity.js` (CAP-1) — not feature dirs, matching the existing 35-formula pattern; Reports cleanup reworded from "remove Rotation Calendar tab" (never built in code) to "confirm §4.6 alignment by adding Pasture Surveys + Weaning placeholder tabs"; Reference console left in Reports for this CP per OI-0020. V2_DESIGN_SYSTEM.md §4.6 updated to reflect reality: Calc Reference renders alongside the 6 report tabs in v2.0, planned destination Settings → Developer (OI-0020). No CP-54 build impact. |
| 2026-04-13 | CP-56 spec draft (while CP-55 in flight) | Drafted `github/issues/cp-56-import-json-restore.md` extracting acceptance criteria from V2_MIGRATION_PLAN.md §5.7–§5.9 and V2_UX_FLOWS.md §20.3. Surfaced two blocking design gaps as open items: **OI-0021** (transaction strategy — Postgres `rpc` stored procedure vs client-side per-table replace, P1, DESIGN REQUIRED) and **OI-0022** (revert safety net — 24h stash mechanism is referenced in §5.7.6 but undesigned; localStorage ~5MB budget likely insufficient for real operation backups, P1, DESIGN REQUIRED). Both OIs block CP-56 implementation; spec file references them explicitly in the "Blocked by open design questions" section. |
| 2026-04-13 | CP-56 design decisions locked + FK-ordering added | **OI-0021 closed** — picked per-table client-side replace with halt-on-first-failure (Option B); skipped Postgres `rpc` because payload size ceiling forces chunking which breaks atomicity in production anyway. **OI-0022 closed** — picked auto-downloaded pre-import backup file as the revert mechanism; skipped localStorage/IndexedDB/Supabase-side-table options because size-safe, durable, and reuses CP-55 code. Third issue Tim flagged: parent/child FK ordering was missing from the spec (same class of bug that burned v1). Added **new V2_MIGRATION_PLAN.md §5.3a** — authoritative FK-dependency insert/delete order for all 49 included tables, with two-pass pattern for self-referential tables (`animals`, `events`). V2_MIGRATION_PLAN.md §5.7 rewritten with 10 numbered steps; new §5.7a documents the revert mechanism rationale. CLAUDE.md "Known Traps" gained an FK-ordering entry pointing at §5.3a. CP-56 spec file slimmed to a thin pointer to the base docs — one source of truth per Tim's direction. |
| 2026-04-13 | CP-57 reconciliation — OI-0023 closed | **OI-0023 closed** — V2_MIGRATION_PLAN.md §2.2 events transform table gained `source_event_id = NULL` line. v1 has no cross-farm move concept; all migrated events are origin events. One-line spec update, no design discussion needed. |
| 2026-04-14 | CP-57 reconciliation — OI-0035 added | **OI-0035 added** — schema_version bump convention not spec'd. Surfaced during OI-0026 walkthrough: no doc enforces that each new migration SQL bumps `operations.schema_version` or adds a `BACKUP_MIGRATIONS` entry. P1 because it affects all future schema changes, not just CP-57. Separate from the CP-57 reconciliation set. |
| 2026-04-13 | CP-57 reconciliation — OI-0024 closed | **OI-0024 closed** — V2_MIGRATION_PLAN.md §2.3 gained a "Strip grazing columns (A45 — new in v2)" paragraph specifying `is_strip_graze = false`, `strip_group_id = NULL`, `area_pct = 100` for all migrated windows. Verified DB defaults in migration 005 and V2_SCHEMA_DESIGN.md §5.2 match the migration values; spec sets them explicitly anyway. Confirmed `area_pct = 100` represents full paddock. |
| 2026-04-14 | CP-57 reconciliation — batch closure (OI-0025 through OI-0035) | Closed 11 OIs in batch: **OI-0025** (animal notes → `animal_notes` rows), **OI-0026** (schema_version stamp in §2.8), **OI-0027** (active_farm_id = NULL in §2.24), **OI-0028** (npk_price_history transform — new §2.25), **OI-0029** (animal_classes verified, added `archived = false` to §2.14), **OI-0030** (v1 export shape — new §1.5), **OI-0031** (migration tool UX — new §1.7), **OI-0032** (CP-56 pipeline reuse — new §1.6), **OI-0033** (NPK parity check promoted to AC in §1.4), **OI-0034** (unparseable dose audit → CSV download in §1.4 + §2.7), **OI-0035** (schema version bump convention — new §5.11a + CLAUDE.md check #6). Added **OI-0036** (remove v1 import after cutover, P4, deferred). V2_MIGRATION_PLAN.md gained 6 edits (§1.4, §1.5, §1.6, §1.7, §2.7, §2.8, §2.14, §2.24, §2.25, §5.11a). CLAUDE.md gained Code Quality Check #6. |
| 2026-04-14 | Tier 3 testing blocked — Supabase sync failures | **OI-0052 added** — onboarding wizard renders 3× due to `onAuthStateChange` firing `INITIAL_SESSION` + `TOKEN_REFRESHED` after `boot()` already called `showApp()`. P2, cosmetic but also causes triple `pullAllRemote()`. **OI-0053 added** — P0 blocker: `operation_members` RLS `FOR ALL` policy has infinite recursion (queries itself). Prevents inserting first member row, which cascades to block all other tables. Also discovered migrations 014–016 never applied to Supabase (missing columns: `active_farm_id`, `schema_version`, `invite_token`). `dose_units` and `input_product_units` have RLS enabled outside of migrations. Session brief written: `SESSION_BRIEF_2026-04-14_supabase-migrations-rls-fix.md`. Build index updated: audit status corrected to complete, test count 747 → 779. |
| 2026-04-14 | RLS recursion fix + upsert bootstrap discovery | **OI-0053 closed** (partially) — infinite recursion fixed by splitting `FOR ALL` into granular policies on `operation_members`, then further simplifying SELECT to `user_id = auth.uid()` (no self-referential subquery). However, sync still fails because sync adapter uses `.upsert()` which Supabase evaluates as INSERT+UPDATE, requiring UPDATE policies to pass. UPDATE policies check `operation_members` which doesn't exist during onboarding bootstrap → all 24 onboarding records dead-letter. **OI-0054 added** — P0: two-part fix: (1) sync adapter must use `.insert()` for new records and `.update()` for existing, not `.upsert()` for all; (2) split all ~40 `FOR ALL` RLS policies into granular per-command policies with `WITH CHECK (true)` on INSERT. Base docs updated: V2_INFRASTRUCTURE.md §5.1 rewritten with 3 RLS patterns (operation-scoped granular, operation_members bootstrap-safe, user-scoped) + new §5.1a (onboarding bootstrap sequence). V2_APP_ARCHITECTURE.md §5.2 updated with write-method-by-operation-type table. |
| 2026-04-14 | OI-0054 closed — sync + RLS fix verified | Claude Code implemented both parts: sync adapter now uses `.insert()` for `add()` and `.update()` for `update()` (`.upsert()` only for recovery); migration 018 split all ~40 `FOR ALL` policies into granular INSERT/SELECT/UPDATE/DELETE. Verified: fresh onboard → dead letter queue empty → `operations`, `operation_members`, `animal_classes` (5 rows) all confirmed in Supabase. Supabase sync fully working. Tier 3 migration testing unblocked. |
| 2026-04-14 | OI-0055 added — import delete crash on join tables | v1 import (CP-57) crashed on `todo_assignments` delete: `column operation_id does not exist`. Root cause: four child/junction tables (`todo_assignments`, `event_feed_check_items`, `harvest_event_fields`, `survey_draft_entries`) were designed without direct `operation_id`, violating Design Principle #8. Fix: migration 019 adds `operation_id uuid NOT NULL FK → operations` to all four tables, enforcing uniform `WHERE operation_id = $1` with no exceptions. Design docs updated: V2_SCHEMA_DESIGN.md (DP#8 + all 4 table specs), V2_APP_ARCHITECTURE.md (§5.5 backup architecture), V2_MIGRATION_PLAN.md (§5.7 steps 6 & 8). Session brief written for Claude Code. |
| 2026-04-13 | CP-57 pre-work — per-gap reconciliation OIs logged | Added **OI-0023** through **OI-0034** (12 items) covering every §1–§2 gap between V2_MIGRATION_PLAN.md and current schema/design. Split by concern: OI-0023 (events.source_event_id default), OI-0024 (strip graze defaults on paddock windows), OI-0025 (animal_notes routing — design required), OI-0026 (operations.schema_version stamp), OI-0027 (user_preferences.active_farm_id default), OI-0028 (npk_price_history transform — design required), OI-0029 (animal_classes rename/splits verification), OI-0030 (v1 export JSON shape — spec update), OI-0031 (CP-57 tool UX — design required), OI-0032 (reuse of CP-56 import pipeline — design required), OI-0033 (§2.23 parity check as formal AC), OI-0034 (§2.7 unparseable-dose audit surface — design required). Status tags distinguish SPEC UPDATE REQUIRED (obvious one-liners) from DESIGN REQUIRED (needs Tim's decision). To be walked through one at a time; each closure updates V2_MIGRATION_PLAN.md inline. CP-57 spec file in `github/issues/` written after all 12 close. |

