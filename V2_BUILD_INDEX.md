# GTHO v2 — Build Index & Progress Tracker

**Purpose:** Master index for the v2 rebuild. Maps every design doc, tracks design and build progress, and serves as the handoff document between sessions. **Any new session starts here.**

**Last updated:** 2026-04-12
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
**Active work:** Phase 3.2 Core Loop — CP-11 through CP-17 complete. All 11 Supabase migrations applied. 538 tests passing.
**Next up:** CP-18 (Paddock & Group windows).

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
| [V2_UX_FLOWS.md](V2_UX_FLOWS.md) | What does each user interaction look like? | APPROVED | 13 flows: move wizard, paddock windows (sub-moves), group windows, feed delivery, feed check, feed transfer, survey, amendment, event close, harvest, event card, batch adjustment, feed day goal. Reviewed and harmonized with schema 2026-04-12. Schema amended: farm_settings +forage_quality_scale_min/max (A41). Amended 2026-04-12: §1.4 strip graze option in move wizard, §2.4 Advance Strip flow, §11 strip progress on event card. Amended 2026-04-12: §2.2 primary paddock rule (first window by start_time cannot be closed independently), §11.1 primary label on paddock section, §11.2 Close button disabled note. |
| [V2_INFRASTRUCTURE.md](V2_INFRASTRUCTURE.md) | How does the plumbing work? | APPROVED | Units, i18n, logging, feedback, RLS, testing, CI, PWA. Reviewed and harmonized with schema 2026-04-12. §8 AI is roadmap only (not Phase 3 build target). |
| [V2_DESIGN_SYSTEM.md](V2_DESIGN_SYSTEM.md) | What does it look like? | APPROVED | Color tokens, typography, spacing, layout breakpoints, component patterns. Extracted from v1 CSS + live app audit. Reviewed and harmonized 2026-04-12: §1.8 threshold color mapping, §3.15 strip grazing progress, §5.3 i18n note, §6 expanded relationships, stale refs fixed. |
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

### Phase 3.3 — Assessment (spec not yet written)

**Scope:** Feed inventory management, feed delivery/checks/transfer, surveys, amendments, harvest, calculation engine (register all 35 formulas), reports, health records.

### Phase 3.4 — Advanced (spec not yet written)

**Scope:** Rotation calendar, export/import, migration tool (v1 → v2 data).

### Phase 3.5 — Polish (spec not yet written)

**Scope:** PWA/service worker, sync hardening, performance, accessibility, onboarding polish, cutover to production.

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

---

*This document is the single source of truth for project status. If it's not tracked here, it's not part of the plan.*
