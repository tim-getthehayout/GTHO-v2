# GTHO v2 — Build Index & Progress Tracker

**Purpose:** Master index for the v2 rebuild. Maps every design doc, tracks design and build progress, and serves as the handoff document between sessions. **Any new session starts here.**

**Last updated:** 2026-04-13
**Current phase:** Phase 3 — Build (IN PROGRESS)

---

## How to Use This Document

### Starting a new session
1. Read this file first
2. Check "Current Focus" below for what's in progress
3. Open the relevant design doc(s) for context
4. When done, update the status table and "Current Focus" before ending

### Status key
| Status | Meaning |
|--------|---------|
| — | Not started |
| DRAFTING | Interactive design in progress with Tim |
| DRAFT | Written but not yet reviewed by Tim |
| APPROVED | Tim reviewed and approved |
| BUILDING | Claude Code is implementing from this spec |
| BUILT | Code written, tests passing |
| LIVE | Deployed to production |

---

## Current Focus

**Phase:** 3 — Build
**Active work:** Phase 3.3 Assessment — **COMPLETE** (CP-24 through CP-53). All 35 calculation formulas registered. 4 report tabs + dashboard real metrics. 563 tests passing.
**Next up:** Phase 3.4 — Advanced (CP-54: Rotation calendar). Design locked 2026-04-13 — major scope expansion from the original row: continuous zoomable timeline, two view modes (Estimated Status + DM Forecast), linked paddocks, strip-graze bands, capacity shading, lives only on the Events screen (no Reports copy). See V2_DESIGN_SYSTEM.md §4.3, V2_UX_FLOWS.md §19, V2_CALCULATION_SPEC.md FOR-6/CAP-1. CP-54 now bundles GH-4 (strip grazing) so OI-0001 closes with this checkpoint. The other ready spec, `github/issues/unit-system-operations-migration.md`, remains available for pickup (closes OI-0002).

---

## Phase Overview

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 — Audit | Exhaustive catalog of v1 features, data, and behavior | APPROVED |
| Phase 2 — Design | Complete spec for every table, pattern, formula, and flow | APPROVED |
| Phase 3 — Build | Claude Code implements from Phase 2 specs | IN PROGRESS |

---

## Design Doc Library

All design docs live in this repo (GTHO-v2). Claude Code reads them during Phase 3 but does not edit them. Cowork owns all design doc changes.

| Document | Answers | Status | Notes |
|----------|---------|--------|-------|
| [GTHO_V1_FEATURE_AUDIT.md](GTHO_V1_FEATURE_AUDIT.md) | What does v1 do? | APPROVED | Phase 1 deliverable. 58 catalog entries, 40 rebuild capabilities, 12 anti-patterns. |
| [V2_SCHEMA_DESIGN.md](V2_SCHEMA_DESIGN.md) | What tables do I create and why? | APPROVED | All 11 domains designed and approved. 51 tables across D1–D11 (npk_price_history added 2026-04-12). Amended 2026-04-12: app_logs +operation_id/+context; animal_classes species split + dmi_pct_lactating + excretion rename; animal_calving_records +dried_off_date; farm_settings -default_dm_per_aud_kg +forage_quality_scale_min/max; +npk_price_history (D8.10). Amended 2026-04-12: event_paddock_windows +is_strip_graze/+strip_group_id/+area_pct (strip grazing). |
| [V2_APP_ARCHITECTURE.md](V2_APP_ARCHITECTURE.md) | What code patterns do I follow? | APPROVED | Store, sync adapter, DOM builder, sheet class, router, file structure. 50 entities, 13 feature dirs. Audited against schema + v1 capabilities. |
| [V2_CALCULATION_SPEC.md](V2_CALCULATION_SPEC.md) | What formulas exist and how are they registered? | APPROVED | 35 formulas (10 domains), registerCalc() pattern, reference console, 3-tier config, 10 v1 bugs. Reviewed and harmonized with schema 2026-04-12. Amended 2026-04-12: NPK-3, FOR-1, REC-1 updated for strip grazing area_pct. |
| [V2_UX_FLOWS.md](V2_UX_FLOWS.md) | What does each user interaction look like? | APPROVED | 16 sections. §1–§13: move wizard, paddock windows, group windows, feed delivery/check/transfer, survey, amendment, event close, harvest, event card, batch adjustment, feed day goal. §14: reusable health recording components (weight, BCS, treatment, breeding, heat, calving, note + group session mode + quick-action bar). §15: entity CRUD forms (animal, group, location, feed type). §16: field mode (home screen, navigation, heat quick-access, feed loop). Component-first: each form documented once with all entry points and context pre-fill. OI-0003 opened for animal_notes schema gap. |
| [V2_INFRASTRUCTURE.md](V2_INFRASTRUCTURE.md) | How does the plumbing work? | APPROVED | Units, i18n, logging, feedback, RLS, testing, CI, PWA. Reviewed and harmonized with schema 2026-04-12. §8 AI is roadmap only (not Phase 3 build target). |
| [V2_DESIGN_SYSTEM.md](V2_DESIGN_SYSTEM.md) | What does it look like? | APPROVED | Color tokens, typography, spacing, layout breakpoints, component patterns. Extracted from v1 CSS + live app audit. Reviewed and harmonized 2026-04-12: §1.8 threshold color mapping, §3.15 strip grazing progress, §5.3 i18n note, §6 expanded relationships, stale refs fixed. Amended 2026-04-12: §7 added — quick-action bar, field mode home, field mode nav, health recording sheet layout, group session progress, BCS chip selector. |
| [V2_MIGRATION_PLAN.md](V2_MIGRATION_PLAN.md) | How does v1 data get into v2? | APPROVED | 24 transform sections covering all v1 tables. ID remapping, unit conversions (imperial→metric), JSONB extraction, 5-way health event split, validation with NPK parity check, cutover plan. Reviewed and harmonized with schema 2026-04-12. |

---

## Schema Design Progress (V2_SCHEMA_DESIGN.md)

Tracks each domain within the schema doc. Every domain goes through: narrative walkthrough with Tim → table design → approval.

| Domain | Tables | Status | Session |
|--------|--------|--------|---------|
| D1: Operation & Farm Setup | operations, farms, farm_settings, operation_members, user_preferences | APPROVED | 2026-04-11 |
| D2: Locations | locations | APPROVED | 2026-04-11 |
| D2: Locations | forage_types | APPROVED | 2026-04-11 |
| D3: Animals & Groups | animal_classes, animals, groups, animal_group_memberships | APPROVED | 2026-04-11 |
| D4: Feed Inventory | feed_types, batches, batch_adjustments | APPROVED | 2026-04-11 |
| D5: Event System | events, event_paddock_windows, event_group_windows | APPROVED | 2026-04-11 |
| D5: Event System | event_feed_entries, event_feed_checks, event_feed_check_items | APPROVED | 2026-04-11 |
| D6: Surveys | surveys, survey_draft_entries, paddock_observations | APPROVED | 2026-04-11 |
| D7: Harvest | harvest_events, harvest_event_fields | APPROVED | 2026-04-11 |
| D8: Nutrients & Amendments | input_product_categories, input_product_units, input_products, spreaders, soil_tests, amendments, amendment_locations, manure_batches, manure_batch_transactions | APPROVED | 2026-04-11 |
| D9: Livestock Health | ai_bulls, treatment_categories, treatment_types, dose_units, animal_bcs_scores, animal_treatments, animal_breeding_records, animal_heat_records, animal_calving_records, animal_weight_records | APPROVED | 2026-04-11 |
| D10: Feed Quality | batch_nutritional_profiles | APPROVED | 2026-04-11 |
| D11: App Infrastructure | app_logs, submissions, todos, todo_assignments, release_notes | APPROVED | 2026-04-11 |

---

## Architecture Decisions Log

Decisions made during design sessions that affect multiple docs. Each decision has a short rationale so future sessions don't revisit them.

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| A1 | Window model, not anchor paddock | All paddock/group participation via time windows. Event has no pastureId. Eliminates sub-move duplication. | 2026-04-11 |
| A2 | Compute on read, not store | Derived values (DMI, NPK, cost, status) never stored. Exception: group window snapshots (head_count, avg_weight_kg). | 2026-04-11 |
| A3 | Locations replace pastures | type='confinement' or 'land', land_use='pasture'/'mixed_use'/'crop'. "If it captures manure, it's confinement." | 2026-04-11 |
| A4 | Feed always delivered to paddock | event_feed_entries.location_id NOT NULL. No event-level feed. | 2026-04-11 |
| A5 | Transfers via source_event_id | Positive-only quantities. Destination entry points to source event. No negative qty / transfer_pair_id. | 2026-04-11 |
| A6 | Feed checks normalized | Parent (event_feed_checks) + child (event_feed_check_items). No JSONB. Absolute remaining, not percentage. | 2026-04-11 |
| A7 | Surveys: container + draft entries + observations | Draft entries editable while open. Commit writes to paddock_observations. | 2026-04-11 |
| A8 | Harvest creates batch | harvest_event_fields.batch_id links to auto-created batch. Batch inherits DM%/weight from harvest. | 2026-04-11 |
| A9 | Store pattern adopted | Single data access point. Getters return copies. Actions: validate→mutate→persist→notify. | 2026-04-11 |
| A10 | Pluggable SyncAdapter adopted | Interface-based sync. Offline queue + exponential backoff + dead letters. Future PowerSync swap. 14-scenario test suite. | 2026-04-11 |
| A11 | DOM builder — no innerHTML | el(), text(), clear(). XSS prevention at framework level. | 2026-04-11 |
| A12 | Sheet lifecycle class adopted | Always-in-DOM, .open toggle, backdrop close, onOpen/onClose/onSave callbacks. | 2026-04-11 |
| A13 | registerCalc() pattern adopted | Metadata-driven formula registration. Reference console for admin audit. PDF export. Enhance with type safety + unit metadata. | 2026-04-11 |
| A14 | Per-class animal rates | animal_classes gets dmi_pct, excretion rates, weaning_age_days. Not global. | 2026-04-11 |
| A15 | Per-forage-type utilization | forage_types gets utilization_pct, dm_kg_per_cm_per_ha, min_residual_height_cm. Not global. | 2026-04-11 |
| A16 | NPK price date-stamping via history table | Historical events use prices at event time. npk_price_history table (D8.10) per-farm with effective_date. Query: latest effective_date ≤ event date. farm_settings prices stay as quick-lookup for current. | 2026-04-11 (resolved 2026-04-12) |
| A17 | 3-tier config fallback | Field-level → type-level → global defaults. Applies to recovery days, residual height, utilization %, excretion rates. | 2026-04-11 |
| A18 | Settings per-farm, not per-operation | All config on farm_settings (1:1 child of farms). No operation_settings table. Single-farm ops: identical behavior. Multi-farm: each farm independent. Copy settings UX for convenience. | 2026-04-11 |
| A19 | No herd_type on operations | Species mix defined by animal_classes rows, not a single string. Onboarding UX pre-populates classes based on species selection. | 2026-04-11 |
| A20 | Currency on operations, NPK prices on farm_settings | Currency is truly operation-wide. NPK prices differ per farm due to freight differentials. | 2026-04-11 |
| A21 | User preferences separate from operation_members | UI prefs (view mode, field mode, quick actions) on user_preferences table. Access control stays on operation_members. Different concerns, different tables. | 2026-04-11 |
| A22 | Spreaders as reference table, not global setting | V1's single manure_load_kg replaced by equipment/spreaders table (D8). Farms have multiple spreaders of different sizes. | 2026-04-11 |
| A23 | Batch adjustments normalized | V1's JSONB adjustments[] on batch replaced by batch_adjustments table. Enables user tracking (adjusted_by), cross-batch queries (monthly shrinkage), and auditability. | 2026-04-11 |
| A24 | App logs direct-write to Supabase | No sync queue dependency. Logs bypass the sync adapter — if sync is broken, you still get logs. No operation_id; scoped by user/session. | 2026-04-11 |
| A25 | Submission thread kept as JSONB | Append-only conversation log, only read with parent, never queried independently. Matches principle #6 exception for conversation threads. | 2026-04-11 |
| A26 | Todo assignments normalized | V1's assignedTo[] JSONB replaced by todo_assignments junction table. Enables "my tasks" query without array scanning. | 2026-04-11 |
| A27 | Class role drives action gating | System-defined roles per species, user-defined class names. Roles gate actions (calving, breeding, heat). Calving triggers class reassignment prompt, not auto-transition. | 2026-04-11 |
| A28 | Sire linkage via proper FKs | sire_animal_id (herd bull) or sire_ai_bull_id (AI sire) replace v1's free-text sireTag. Lineage on animal; breeding history on breeding records. | 2026-04-11 |
| A29 | Confirmed bred derived from breeding records | Not stored on animal. Most recent breeding record with confirmed_date and no subsequent calving = currently confirmed. Resets naturally. | 2026-04-11 |
| A30 | Groups are farm-scoped | Each farm maintains its own groups. Cross-farm animal moves are group-to-group transfers via membership ledger. | 2026-04-11 |
| A31 | Treatment categories as user-extensible reference table | V1's hardcoded 4-value enum replaced by treatment_categories table. System seeds defaults, users add their own. Reports filter by category_id FK. | 2026-04-11 |
| A32 | BCS scale species-dependent, app-enforced | Cattle 1–9, sheep/goat 1–5. Raw numeric stored; app validates range based on animal's class species at input. | 2026-04-11 |
| A33 | Dose as structured amount + unit | V1's freeform dose text split into dose_amount (numeric) + dose_unit_id (FK to shared dose_units table). Enables clean usage reporting. | 2026-04-11 |
| A34 | Heat observations split from breeding records | V1 stored heats as breeding events (subtype='heat'). V2 gives them own table — different shape, different queries. Breeding method now 'ai' or 'bull' only. | 2026-04-11 |
| A35 | Input product categories as user-extensible reference table | Same pattern as treatment_categories (A31). V1's implicit categories replaced by proper table for filtering and user customization. | 2026-04-11 |
| A36 | Full 13-element nutrient panel | N, P, K, S, Ca, Mg, Cu, Fe, Mn, Mo, Zn, B, Cl tracked on soil_tests, input_products (as %), amendment_locations (as kg), and manure_batches (as kg). Supports fertilizer planning against soil test gaps. | 2026-04-11 |
| A37 | Beef/dairy cattle species split | 'cattle' split into 'beef_cattle' and 'dairy_cattle'. Same roles, different management: lactation logic (beef = calf weaning, dairy = explicit dry-off), DMI rates, weaning defaults. Species drives behavioral branching. | 2026-04-12 |
| A38 | Lactation status derived from calving/weaning timeline | Not stored on animal. Beef: lactating if most recent calf still in calf-role class. Dairy: lactating if dried_off_date null or future. dmi_pct_lactating on animal_classes stores the rate; calving records store the timeline. Compute on read (A2). | 2026-04-12 |
| A39 | Excretion rates and DMI as 2-tier config | Class-level (seeded with NRCS industry standards at onboarding, editable per class) → NRCS code constant fallback. No farm_settings Tier 3. Eliminates default_dm_per_aud_kg from farm_settings. | 2026-04-12 |
| A40 | Excretion columns use _rate not _pct | NRCS standard unit is kg/1000kg BW/day, not a percentage. Column names: excretion_n_rate, excretion_p_rate, excretion_k_rate. Prevents unit confusion during implementation. | 2026-04-12 |
| A41 | Forage quality scale farm-configurable | forage_quality_scale_min/max on farm_settings (default 1–100). Operations using RFQ can set 0–200+. forage_condition (poor/fair/good/excellent) is a separate categorical assessment unaffected by scale. | 2026-04-12 |
| A42 | "Sub-move" retained as user-facing term | Backend is event_paddock_windows. UI says "Sub-move" for adding/removing paddock windows mid-event. UX flows doc bridges both terms. Farmers know "sub-move" from v1. | 2026-04-12 |
| A43 | Feed day goal is farm-level | feed_day_goal on farm_settings (default 90, range 7–365). UI label: "Days of Stored Feed on Hand." Different farms may have different feed security targets. | 2026-04-12 |
| A44 | Unit system on operations, not farms or users | `operations.unit_system` (metric/imperial, default imperial). Same rationale as currency (A20): a user doesn't think in acres at one farm and hectares at another. Storage is always metric (V2_INFRASTRUCTURE.md §1.1); column only controls display. Resolves OI-0002. On toggle, all unit-sensitive settings re-render in place (same stored metric value, new display). | 2026-04-13 |
| A45 | Strip grazing via sequential paddock windows | Large paddocks grazed in stages ("strip graze") are represented as multiple `event_paddock_windows` rows on the same `location_id` within one event, linked by a shared `strip_group_id`. Three columns added: `is_strip_graze` (UI trigger), `strip_group_id` (analytical link), `area_pct` (size of each strip). No new tables. Reuses observation, feed, and group window models unchanged. Calc layer uses effective area (paddock_area × area_pct/100) for stocking density, NPK, and per-strip recovery. Resolves OI-0001. | 2026-04-13 |

---

## Phase 3 — Build Specifications

Implementation specs for Claude Code. Each sub-phase has sequenced checkpoints with acceptance criteria. Complete one checkpoint before starting the next. Commit after each.

### Phase 3.1 — Scaffold

**Goal:** Set up the v2 application foundation. When done, the app shell loads, the router works, and a round-trip test proves data flows from UI → store → localStorage → Supabase shape → back.

**What this phase does NOT include:** No feature UI, no Supabase connection, no auth, no registered calculations, no PWA/service worker.

| CP | What to build | Key deliverables | Tests |
|----|--------------|-----------------|-------|
| CP-1 | Vite project init | package.json, vite.config.js, index.html shell, .gitignore, .env.example, eslint | Build passes |
| CP-2 | Core utilities | logger.js, date-utils.js, validators.js, units.js, calc-registry.js | 4 test files, all 6 unit conversions |
| CP-3 | Entities D1 (5) | operation.js, farm.js, farm-setting.js, operation-member.js, user-preference.js + migration SQL | Shape round-trip tests × 5 |
| CP-4 | Entities D2–D4 (9) | location.js, forage-type.js, animal-class.js, animal.js, group.js, animal-group-membership.js, feed-type.js, batch.js, batch-adjustment.js + 3 migrations | Shape round-trip tests × 9 |
| CP-5 | Entities D5–D7 (11) | event.js, event-paddock-window.js, event-group-window.js, event-feed-entry.js, event-feed-check.js, event-feed-check-item.js, survey.js, survey-draft-entry.js, paddock-observation.js, harvest-event.js, harvest-event-field.js + 3 migrations | Shape round-trip tests × 11 |
| CP-6 | Entities D8–D11 (25) | All remaining entities + 4 migrations. D8 nutrients (10), D9 health (10), D10 quality (1), D11 infra (5 — including npk-price-history.js) | Shape round-trip tests × 25. Total: 50 entities |
| CP-7 | i18n | i18n.js with t()/loadLocale(), en.json skeleton | Key lookup, interpolation, missing key fallback |
| CP-8 | Data layer | store.js, local-storage.js, sync-adapter.js (interface), custom-sync.js (Supabase impl), supabase-client.js | Store init/getters/actions/subscribers, localStorage round-trip |
| CP-9 | UI framework | dom.js, sheet.js, router.js, header.js, main.css with design system tokens | DOM builder, sheet toggle, route mapping |
| CP-10 | App shell | Wire main.js boot, 7 placeholder screens, integration test | Full round-trip: create → read → shape → subscriber. App boots clean. |

**Schema source of truth:** V2_SCHEMA_DESIGN.md. Copy column names, types, and constraints exactly. Do not invent fields.

**Entity pattern:** Every file exports `FIELDS`, `create()`, `validate()`, `toSupabaseShape()`, `fromSupabaseShape()`. Build D1 (CP-3) as the template, then batch the rest.

---

### Phase 3.2 — Core Loop

**Goal:** First usable screens. User can log in, set up operation/farm, create locations and animal groups, create and manage grazing events (including sub-moves, group changes, and the full move wizard), view the dashboard, and sync to Supabase with offline support.

**What this phase does NOT include:** No feed delivery/checks/transfer, no surveys, no amendments/manure, no health records, no calculations/formulas, no reports, no rotation calendar, no harvest, no batch/feed inventory management, no PWA. Screens that reference feed or computed metrics show placeholder "—" until Phase 3.3.

**Prerequisites:** Phase 3.1 complete. v2 Supabase project created with D1–D5 migrations applied. `.env` configured.

| CP | What to build | Spec source | Acceptance criteria |
|----|--------------|-------------|---------------------|
| CP-11 | Auth flow | V2_INFRASTRUCTURE.md §5, V2_DESIGN_SYSTEM.md auth overlay | Login/signup against Supabase Auth. Session persists across reload. Unauthenticated users blocked. |
| CP-12 | Onboarding wizard | V2_SCHEMA_DESIGN.md D1, A19, A27, A39 | Creates operation + farm + farm_settings + member + preferences + seeds animal_classes with NRCS defaults + seeds reference tables. App navigates to dashboard. Returning users skip. |
| CP-13 | Settings screen (basic) | V2_SCHEMA_DESIGN.md §1.3/§1.5, V2_INFRASTRUCTURE.md §1 | Unit toggle works app-wide. Farm settings save. Sync status displays. Logout works. |
| CP-14 | Locations screen | V2_SCHEMA_DESIGN.md D2, V2_DESIGN_SYSTEM.md §4.4, A3, A15, A17 | Location CRUD. Filter pills by type/land_use. Forage type CRUD. Area in user's unit. Confinement shows capture_percent. |
| CP-15 | Animals — Groups & Classes | V2_SCHEMA_DESIGN.md D3, A14, A27, A30 | Group CRUD. Class editing (rates, names). Group filter pills. |
| CP-16 | Animals — Individual animals | V2_SCHEMA_DESIGN.md D3 §3.2/§3.4 | Animal CRUD. Group assignment creates/closes memberships. Search/filter. Column sorting. |
| CP-17 | Events — Create & List | V2_UX_FLOWS.md §11, §1.2, V2_SCHEMA_DESIGN.md D5 | Event creation with location + group. Event list with status. Event card displays paddock/group windows. Location picker with Ready/Recovering/In Use/Confinement sections. |
| CP-18 | Paddock & Group windows | V2_UX_FLOWS.md §2, §3, V2_DESIGN_SYSTEM.md §3.5 z-index | Sub-move open/close with observations. Primary paddock close disabled. Group add/remove. Advance Strip button wired. Event card updates live. |
| CP-19 | Move wizard | V2_UX_FLOWS.md §1 (full flow), V2_DESIGN_SYSTEM.md §3.12 | Close source → create destination. Strip graze flags. Join existing event. Save actions in correct order. Feed transfer shows placeholder. |
| CP-20 | Event close (no move) | V2_UX_FLOWS.md §9 | All windows closed. Event status → closed. Observation created. Feed check shows placeholder. |
| CP-21 | Dashboard | V2_DESIGN_SYSTEM.md §4.1, §3.13, §3.8 | Group cards with location status. Move action opens wizard. Mobile collapse/expand. Desktop 2-col grid. FAB with creation options. Reactive updates. |
| CP-22 | Supabase sync wiring | V2_APP_ARCHITECTURE.md §5, V2_INFRASTRUCTURE.md §3.4–3.5, A10, A24 | Online write → Supabase. Offline queue → flush on reconnect. Pull merges remote. Dead letters after 5 failures. Sync indicator. App works offline. |
| CP-23 | Integration smoke test | — | Playwright e2e: signup → onboard → create locations → create group + animals → create event → sub-move → move wizard → close event → verify persistence. |

**Onboarding design note:** The onboarding UX flow is not detailed in V2_UX_FLOWS.md. CP-12 defines the minimum needed to bootstrap the data model. If any step needs richer UI, flag as `DESIGN REQUIRED`. Polished onboarding is Phase 3.5.

**`data-testid` convention:** `[screen]-[element]-[identifier]`. Examples: `locations-card-{id}`, `events-move-btn`, `dashboard-group-card-{id}`, `move-wizard-step-2`. Apply to every interactive element and list container starting in CP-14.

**Confinement NPK routing:** Move wizard and event close reference manure batch transactions for confinement locations. Do not build this — log a TODO in code. Wired in Phase 3.3 when amendments/manure system is built.

---

### Phase 3.3 — Assessment

**Goal:** Build the data collection and analysis features that make GTHO useful beyond basic event tracking. When done, users can manage feed inventory, deliver/check/transfer feed, run pasture surveys, record amendments and manure, harvest hay, record all health events, run all 35 calculation formulas, and view reports.

**What this phase does NOT include:** No rotation calendar visualization (3.4), no v1 data migration tool (3.4), no export/import (3.4), no PWA/service worker (3.5), no onboarding polish (3.5).

**Prerequisites:** Phase 3.2 complete. All D1–D5 migrations applied. Auth, events, move wizard, dashboard, and sync working.

**Build order rationale:** Feed inventory first (daily use, no dependencies beyond D1). Then feed delivery/checks/transfer (depends on batches). Surveys next (depends on locations + paddock_observations). Health records (depends on animals, no feature dependencies). Amendments/manure (depends on locations + events + products). Harvest (depends on feed_types + batches). Calc engine after features provide data. Reports last (consumes everything).

| CP | What to build | Spec source | Acceptance criteria |
|----|--------------|-------------|---------------------|
| CP-24 | Feed reference tables | V2_SCHEMA_DESIGN.md D4 §4.1 | feed_types CRUD. Settings screen section for managing feed types. harvest_active toggle. Migration SQL applied. |
| CP-25 | Batch inventory | V2_SCHEMA_DESIGN.md D4 §4.2–§4.3, V2_UX_FLOWS.md §12 | Batch CRUD. Batch list screen with remaining quantity + progress bar. Batch adjustment flow (reconcile, waste, sold). batch_adjustments table populated with reason + delta. Feed screen shows DM on hand, daily run rate, days on hand. |
| CP-26 | Feed day goal | V2_UX_FLOWS.md §13, V2_DESIGN_SYSTEM.md §1.8 | farm_settings.feed_day_goal editable from feed screen header and settings. Progress bar with threshold coloring (green ≥ goal, amber 33–99%, red < 33%). |
| CP-27 | Feed delivery | V2_UX_FLOWS.md §4 | Feed delivery sheet: batch selector with quantity adjusters (±0.5), paddock picker within active event, date/time. Field mode support (returns to event picker after save). event_feed_entries created and synced. |
| CP-28 | Feed check | V2_UX_FLOWS.md §5 | Feed check sheet: one row per batch × paddock showing "Started" (DMI-1a formula) and remaining input. Creates event_feed_check + event_feed_check_items. |
| CP-29 | Feed transfer (move wizard integration) | V2_UX_FLOWS.md §6 | Move wizard step shows remaining feed per batch per paddock with "Move to new event?" toggles. Creates close-reading feed_check on source + feed_entry on destination with source_event_id. Replaces Phase 3.2 placeholder. |
| CP-30 | Event close — full version | V2_UX_FLOWS.md §9 | Event close includes optional feed check if feed exists. Confinement NPK routing: creates manure_batch_transaction (type='input') if any paddock window has capture_percent > 0. Replaces Phase 3.2 placeholder. |
| CP-31 | Survey workflow | V2_UX_FLOWS.md §7, V2_SCHEMA_DESIGN.md D6 | Survey create (bulk/single). Draft entry form: forage_height, cover_pct, condition picker, quality slider, bale_ring_residue, recovery days, notes. Auto-save drafts. "Finish survey" commits to paddock_observations. Migration SQL applied. |
| CP-32 | Health — reference tables | V2_SCHEMA_DESIGN.md D9 (reference tables), A27, A31, A33 | ai_bulls CRUD. treatment_categories + treatment_types CRUD (seeded defaults). dose_units seeded. Settings screen sections for each. Migration SQL applied. |
| CP-33 | Health — weight & BCS | V2_SCHEMA_DESIGN.md D9 §9.6/§9.5, A32 | Weight recording per animal (manual + group update). BCS scoring with species-dependent scale (cattle 1–9, sheep 1–5). animal_weight_records + animal_bcs_scores created. Latest weight derived. Animals screen shows current weight + last BCS. |
| CP-34 | Field mode | V2_UX_FLOWS.md §16, V2_DESIGN_SYSTEM.md §2.2/§7, v1 CSS field-mode section | Field mode toggle: hides nav chrome, task-focused screens. URL param + user preference persistence. Full-screen sheets on mobile. Quick-action shortcuts. Retrofit field mode paths into feed delivery (CP-27), feed check (CP-28), and move wizard (CP-19). Moved from Phase 3.5 — enables all subsequent 3.3 features to build with field mode natively. |
| CP-35 | Health — treatments | V2_SCHEMA_DESIGN.md D9 §9.7 | Treatment recording: animal, type (from treatment_types), structured dose (amount + unit), withdrawal_date. animal_treatments created. Animals screen shows treatment action button. |
| CP-36 | Health — breeding & heat | V2_SCHEMA_DESIGN.md D9 §9.8/§9.9, A28, A29, A34 | Breeding record: method (ai/bull), sire selection (herd bull FK or AI bull FK), confirmed_date, expected_calving. Heat observation: separate table, batch heat picker. "Confirmed bred" derived from latest breeding record. Animals screen shows breeding status. |
| CP-37 | Health — calving | V2_SCHEMA_DESIGN.md D9 §9.10, A27, A38 | Calving record: dam → calf link, sex, tag, weight (→ weight_record source='calving'), class assignment, group assignment. Dried_off_date for dairy. Calving triggers class reassignment prompt (A27). Lactation status derived (A38). |
| CP-38 | Amendment — reference tables | V2_SCHEMA_DESIGN.md D8 §8.1–§8.4, A22, A35, A36 | input_product_categories + input_products CRUD (13-element NPK panel). input_product_units seeded. spreaders CRUD. Settings screen sections. Migration SQL applied. |
| CP-39 | Soil tests | V2_SCHEMA_DESIGN.md D8 §8.5 | Soil test recording per paddock: full 13-element panel + pH, buffer pH, CEC, base saturation, organic matter. Multiple tests per paddock over time. Fields screen shows latest results. |
| CP-40 | Amendment entry | V2_UX_FLOWS.md §8, V2_SCHEMA_DESIGN.md D8 §8.6–§8.7 | Amendment flow: date, source (product or manure), product picker, quantity + unit, cost override, multi-select paddocks. NPK preview computed from composition × quantity. Saves amendment + amendment_locations (nutrients split by area). |
| CP-41 | Manure system | V2_SCHEMA_DESIGN.md D8 §8.8–§8.9 | Manure batch CRUD (13-element composition). Transaction ledger: type='input' from event close (confinement) + type='application' via amendments. Remaining volume derived. Wire to CP-30 confinement event close. |
| CP-42 | NPK price history | V2_SCHEMA_DESIGN.md D8 §8.10, A16 | npk_price_history per-farm with effective_date. Farm settings shows current prices. Historical events use price at event time (latest effective_date ≤ event date). |
| CP-43 | Harvest | V2_UX_FLOWS.md §10, V2_SCHEMA_DESIGN.md D7 | Harvest flow: select location, toggle harvest_active feed types, enter quantity/weight/DM%/cutting. Creates harvest_event + harvest_event_fields. Auto-creates batch per field (source='harvest'). |
| CP-44 | Feed quality / batch profiles | V2_SCHEMA_DESIGN.md D10, V2_UX_FLOWS.md §12 (feed test) | batch_nutritional_profiles: lab results entry (DM%, protein, ADF, NDF, TDN, RFV, NPK, minerals). Source tracking (harvest/feed_test/estimate). Latest profile by tested_at used in calculations. |
| CP-45 | Calculation engine — core | V2_CALCULATION_SPEC.md §1–§3, A13 | registerCalc() infrastructure: registry, metadata, dependency resolution. Register 9 immediately-available formulas: NPK-1, NPK-3, ANI-1, ANI-2, ANI-3, TIM-1, TIM-2, TIM-3, UNT-1. Reference console (admin screen) with formula list + example values. |
| CP-46 | Calculation engine — feed & forage | V2_CALCULATION_SPEC.md §4 (DMI, Forage, Feed Residual domains) | Register 19 feed/forage-dependent formulas: DMI-1 through DMI-7, FOR-1 through FOR-5, FED-1 through FED-5, DMI-1a. All consume data from CP-27/28/31 features. |
| CP-47 | Calculation engine — cost, NPK, recovery, survey | V2_CALCULATION_SPEC.md §4 (Cost, NPK, Recovery, Survey domains) | Register remaining 7 formulas: NPK-2, NPK-4, CST-1, CST-2, CST-3, REC-1, SUR-1, UNT-2. All 35 formulas registered. Reference console shows complete catalog. |
| CP-48 | Reports — feed & DMI | V2_DESIGN_SYSTEM.md §4.6, v1 feature audit | Feed & DMI Trends report tab. Charts: daily DMI over time, pasture vs stored feed split, feed cost per group. Data sourced from calc engine (DMI-1 through DMI-7, CST-1). |
| CP-49 | Reports — NPK fertility | V2_DESIGN_SYSTEM.md §4.6, v1 feature audit | NPK Fertility report tab. Per-paddock NPK deposited (grazing + amendments). Soil test comparison. NPK value ($). Data sourced from NPK-1 through NPK-4. |
| CP-50 | Reports — animal performance | V2_DESIGN_SYSTEM.md §4.6, v1 feature audit | Animal Performance report tab. Weight gain/loss over time, BCS trends, breeding status summary, treatment log by category. Data sourced from ANI-1 through ANI-3 + health records. |
| CP-51 | Reports — season summary & pasture surveys | V2_DESIGN_SYSTEM.md §4.6, v1 feature audit | Season Summary tab: AUDS by paddock, feed cost totals, NPK totals, stocking efficiency (FOR-5). Pasture Surveys tab: forage height/cover/quality trends over time. Weaning report: target dates (ANI-3), actual weights. |
| CP-52 | Dashboard — full metrics | V2_DESIGN_SYSTEM.md §4.1 | Dashboard stat cells now show real computed values (replacing "—" placeholders from 3.2): Pasture DMI, Feed Cost, Pasture %, NPK/Acre, NPK Value. Group cards show feed info, DMI split bars. All values from calc engine. |
| CP-53 | Integration smoke test | — | Playwright e2e: full lifecycle — create batch → deliver feed → feed check → survey → record amendment → harvest → calving → move with feed transfer → close event → verify all calcs compute → verify reports render. Field mode paths included. |

**Health records UX note:** V2_UX_FLOWS.md §14 now contains full component-first flows for all health record types (Weight §14.2, BCS §14.3, Treatment §14.4, Breeding §14.5, Heat §14.6, Calving §14.7, Note §14.8). Each sheet is documented once with all entry points and context pre-fill behavior. §14.9 covers group session mode. §14.10 covers the per-animal quick-action bar. CP-33 and CP-35 through CP-37 should build from these flows. `animal_notes` table needs schema amendment (OI-0003, confirmed).

**Confinement NPK routing:** CP-30 wires event close → manure batch input. CP-41 wires manure batch → amendment application. These two checkpoints complete the confinement nutrient loop that was deferred from Phase 3.2.

**Field mode note:** CP-34 (moved from Phase 3.5) builds the field mode infrastructure. Feed delivery (CP-27), feed check (CP-28), and move wizard (CP-19) need field mode paths retrofitted. All features from CP-35 onward should build with field mode support natively.

**Formula registration order:** CP-45 builds the engine + 9 formulas that need only core data. CP-46 adds the 19 formulas that need feed/forage data (built in CP-24–31/43). CP-47 adds the final 7 that need amendments/prices/surveys. This ensures formulas are never registered before their data sources exist.

---

### Phase 3.4 — Advanced

**Goal:** Visualization, data portability, and v1 migration. When done, users can view the rotation calendar, export/import data, and migrate from v1.

**What this phase does NOT include:** No PWA (3.5), no performance optimization (3.5), no accessibility hardening (3.5).

**Prerequisites:** Phase 3.3 complete. All 35 formulas registered. Reports rendering.

| CP | What to build | Spec source | Acceptance criteria |
|----|--------------|-------------|---------------------|
| CP-54 | Rotation calendar | V2_DESIGN_SYSTEM.md §4.3, V2_UX_FLOWS.md §19, V2_CALCULATION_SPEC.md FOR-6 / CAP-1, GH-6 (implementation spec), GH-4 strip-grazing (bundled) | Continuous zoomable timeline (Day / Week / Month / Last 90 days presets; Jump presets: Today, Last 30d, Last 90d, This year, Pick date…). Paddock-row × date-column grid with Today line, top + bottom date axes. Past event blocks (group · AUDS · days · pasture/feed% · DMI · head; multi-group rule: "Multiple Groups (N)" + hover tooltip). Active event: white-ring NOW indicator. Linked paddocks: dashed outline + dotted connector, primary carries full block. Strip-grazed active: proportional vertical bands behind label. Sub-moves: lighter-green destination block + thin connector arrow. Two view modes: **Estimated Status** (ambient DM gradient between min/max recovery dates) and **DM Forecast** (capacity split: period covered vs hay needed, with surplus chip when DM ≥ demand). Mode indicator pill at top-right. Two titled lightboxes: Timeline Selection (Zoom/Jump; default Zoom = Week, Jump = Today) + Dry Matter Forecaster (multi-select Groups, Period; defaults to no groups selected → Estimated Status View). Show Confinement Locations on/off pill. Legend split Past (always) / Future (mode-conditional). Right sidebar mirrors paddock column rows 1:1 with visible-range totals footer. Lives only on the Events screen — no Reports copy (any season-scale view is reachable by changing Zoom + Jump). Calendar/List view toggle in the header; List view reuses v1 GRZ-10 event log (parent row + sub-move thread + All/Open/Closed filter). Mobile: calendar is NOT rendered below 900px — mobile Events falls back to a GRZ-11 active-rotation banner + GRZ-10 events log. Bundles GH-4 strip grazing (OI-0001 closed by this CP). |
| CP-55 | Export — JSON backup | V2_MIGRATION_PLAN.md §3 | Export all app state as JSON backup file. Download via browser. Includes all entities, settings, and metadata. Schema version stamped. |
| CP-56 | Import — JSON restore | V2_MIGRATION_PLAN.md §3 | Import JSON backup. Validate schema version. Replace local state. Push all to Supabase. Handle missing fields gracefully (migrations for old backup shapes). |
| CP-57 | v1 → v2 migration tool | V2_MIGRATION_PLAN.md §1–§2 (all 24 transforms) | Read v1 JSON export. Apply all 24 transform sections: ID remapping, imperial→metric unit conversions, JSONB extraction, 5-way health event split, batch normalization. Validation with NPK parity check. Preview screen before commit. |
| CP-58 | Integration test — migration | — | Playwright e2e: export v1 backup → run migration tool → verify all data appears correctly in v2 screens → verify calculations produce expected values → verify no data loss. |

---

### Phase 3.5 — Polish

**Goal:** Production-ready. When done, the app is installable, fast, accessible, resilient offline, and ready for v1 cutover.

**Prerequisites:** Phase 3.4 complete. Migration tool tested.

| CP | What to build | Spec source | Acceptance criteria |
|----|--------------|-------------|---------------------|
| CP-59 | PWA — service worker | V2_INFRASTRUCTURE.md §7.3 | Cache-first for app shell, network-first for API. Install prompt. Update prompt when new version detected. Manifest with icons. |
| CP-60 | Sync hardening | V2_APP_ARCHITECTURE.md §5, V2_INFRASTRUCTURE.md §3.4–3.5 | Conflict resolution for concurrent edits. Dead letter queue UI in settings. Retry with exponential backoff. Sync indicator states: ok/pending/error/offline. Queue export for debugging. |
| CP-61 | Performance | — | Lighthouse score ≥ 90 (performance). Lazy-load report screens. Virtual scroll for animal lists > 100 items. Bundle size audit. |
| CP-62 | Accessibility | V2_DESIGN_SYSTEM.md §5.2 | WCAG 2.1 AA. 44px touch targets on all interactive elements. Keyboard navigation for all sheets. Screen reader labels. Color contrast verification. Focus management on sheet open/close. |
| CP-63 | Onboarding polish | V2_BUILD_INDEX.md CP-12 note | Guided first-run experience. Species selection → class seeding → first location → first group. Help tooltips on key screens. Empty state messaging per V2_DESIGN_SYSTEM.md §3.11. |
| CP-64 | Cutover preparation | V2_MIGRATION_PLAN.md §4 | Pre-cutover checklist: migration dry-run, data parity verification, DNS/GitHub Pages swap plan, rollback procedure, v1 read-only mode toggle. Documentation for Tim to execute cutover. |
| CP-65 | Final integration test | — | Full e2e suite: all critical paths from 3.2 (CP-23) + 3.3 (CP-53) + 3.4 (CP-58) run clean. Offline mode verified. PWA install verified. Performance budget met. Field mode paths verified. |

---

## Handoff Template

When a session ends, update "Current Focus" above and write a session brief file to `session_briefs/`:

**Filename:** `session_briefs/SESSION_BRIEF_YYYY-MM-DD_subject-summary.md` (kebab-case subject slug after the date)

```
## Session Handoff — [DATE]
**What was done:** [1-2 sentences]
**What's next:** [specific next step]
**Decisions made:** [reference A# from decisions log]
**Docs updated:** [list files changed]
**Open questions:** [anything unresolved]
```

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-04-12 | Session 6 — Infrastructure review | Current focus updated. Schema design row: noted 2026-04-12 app_logs amendment. Infrastructure status: DRAFT → APPROVED. |
| 2026-04-12 | Session 7 — Calculation spec review | 13 issues found and resolved. 4 new decisions (A37–A40). A16 resolved. Schema row updated for amendments. Calc spec row: 42 → 35 formulas. Current focus updated. |
| 2026-04-12 | Session 8a — Design system audit | New doc: V2_DESIGN_SYSTEM.md. Extracted v1 CSS (518 lines), captured 9 live app screens. Documents tokens (colors, typography, spacing, radii, shadows), layout system (900px breakpoint, mobile/desktop), 14 component patterns, v2 improvement recommendations. Build index updated. |
| 2026-04-12 | Session 8b — UX flows review | 8 issues found and resolved. 3 new sections added (§11 Event Card, §12 Batch Adjustment, §13 Feed Day Goal). 3 new decisions (A41–A43). Schema amended: farm_settings +forage_quality_scale_min/max. Confinement close handling added. Feed delivery expanded. Sub-move terminology bridged (A42). Time fields added consistently across all flows. |
| 2026-04-12 | Session 9 — Migration plan review | 12 issues found and resolved. 16 new transform sections (§2.9–§2.24). §2.7 expanded to 5-way health event split (+heat records). §2.8 rewritten for 3-table extraction (operations+farms+farm_settings). All imperial unit conversions confirmed. v1 bugs documented (weight_per_unit_kg stores lbs, soil_tests default lbs/acre). NPK deposits used for validation-only parity check. Calc count corrected (42→35). Migration plan DRAFT → APPROVED. |
| 2026-04-12 | Session 10 — Design system review | 6 issues found and resolved. §4.8 stale "anchor/primary" → "primary". §1.8 threshold color mapping added (forage quality bands, feed days-on-hand urgency). §3.15 strip grazing progress component added. §5.3 i18n integration note added. §6 relationship table expanded (+schema, +infrastructure). §4.7 v2 sync note added. UX flows amended: §2.2 primary paddock rule, §11.1/§11.2 primary label + Close button disabled. Design system DRAFT → APPROVED. **Phase 2 — Design complete. All 7 docs APPROVED.** |
| 2026-04-12 | Session 11 — Phase 3 prep | Repo migrated to GTHO-v2 (fresh repo, pushed to GitHub). CLAUDE.md rewritten for combined docs + code repo — added Invention Required rule, Architecture Audit, and Corrections logging from failed v2 rebuild. Phase 3.1 Scaffold spec written (10 checkpoints, detailed build order). Phase 3.2 Core Loop spec written (13 checkpoints: auth, onboarding, settings, locations, animals, events, move wizard, dashboard, sync). Both specs integrated into Build Index. TASKS.md updated. Build index phase status: Phase 3 IN PROGRESS. |
| 2026-04-12 | Session 11b — UX flow gap fill | V2_UX_FLOWS.md: added §14 (7 reusable health recording components + group session mode + quick-action bar), §15 (4 entity CRUD forms), §16 (field mode complete UX). Component-first approach — each form documented once with entry points × context pre-fill mapped. V2_DESIGN_SYSTEM.md: added §7 (6 new component patterns for quick-action bar, field mode home/nav, health sheet layout, group session progress, BCS chip selector). OI-0003 opened: animal_notes schema gap (D9 has no notes table; v1 had health event type 'note'). Phase 3.3–3.5 build specs written (42 checkpoints). V2_INFRASTRUCTURE.md: §7.2 dual Supabase access paths (MCP connector + .env.build). |
| 2026-04-12 | Session 12 — Build index resequence | Field mode (was CP-63 in Phase 3.5) moved into Phase 3.3 as CP-34 (after Health weight & BCS). Rationale: features from CP-35 onward build with field mode natively instead of retrofitting in 3.5. Feed delivery (CP-27), feed check (CP-28), move wizard (CP-19) need field mode retrofit in CP-34. All CPs after CP-33 renumbered +1. Phase 3.3: CP-24–CP-53 (was CP-52). Phase 3.4: CP-54–CP-58 (was CP-53–CP-57). Phase 3.5: CP-59–CP-65 (was CP-58–CP-65, minus field mode). Cross-references updated. Total checkpoint count unchanged (65). |
| 2026-04-13 | Session 14 — Rotation calendar design (CP-54) | Full design locked. Major scope expansion from the original CP-54 row (month-columns × AUDS-colored-cells) to a continuous zoomable timeline with two view modes (Estimated Status + DM Forecast), linked-paddock rendering, proportional strip-graze bands, sub-move connectors, never-grazed tan capacity blocks with survey CTA, 1:1 right-hand sidebar, two toolbar lightboxes (Timeline Selection + Dry Matter Forecaster), Show Confinement Locations on/off pill, and mode indicator pill. Calendar lives only on the Events screen — the Reports → Rotation Calendar tab is removed (6 tabs now, Feed & DMI Trends first). Mobile fallback: no calendar below 900px, mobile Events uses the v1 GRZ-11 banner + GRZ-10 events log pattern. Doc updates: V2_DESIGN_SYSTEM.md §4.3 (Events rewritten), §4.6 (Reports tab strip trimmed to 6). V2_BUILD_INDEX.md CP-54 row rewritten with full acceptance criteria. V2_UX_FLOWS.md new §19 Rotation Calendar (8 subsections, Events-only). V2_CALCULATION_SPEC.md gained FOR-6 (Forecast Standing DM at Date) and new §4.11 Capacity Forecast domain with CAP-1 (Period Capacity Coverage); formula count 35 → 37, domain count 10 → 11. OI-0001 (strip grazing) explicitly bundled into CP-54. CP-54 implementation spec is the next step. |
| 2026-04-13 | Session 13 — Strip grazing + unit system integration | OI-0001 closed: strip grazing design confirmed integrated across V2_SCHEMA_DESIGN.md (event_paddock_windows: is_strip_graze/strip_group_id/area_pct), V2_CALCULATION_SPEC.md (NPK-3/FOR-1/REC-1 effective area), V2_UX_FLOWS.md (§1.4 move wizard, §2.4 advance strip, §11 event card), V2_DESIGN_SYSTEM.md §3.15. Decision A45 logged. OI-0002 closed: Tim decided unit system lives on `operations` (A44). V2_SCHEMA_DESIGN.md §1.1 amended — `unit_system text NOT NULL DEFAULT 'imperial' CHECK IN ('metric','imperial')`. V2_INFRASTRUCTURE.md §1.3 added (unit system storage). V2_MIGRATION_PLAN.md §2.8 updated (default 'imperial'). Implementation spec written: `github/issues/unit-system-operations-migration.md` covering entity update, store action, settings re-render on toggle (every unit-sensitive settings field updates in place), onboarding selector, and localStorage → operation migration path. |

---

*This document is the single source of truth for project status. If it's not tracked here, it's not part of the plan.*
