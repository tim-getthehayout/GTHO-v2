# Tasks

## Phase 1 — Audit
- [x] **v1 Feature Audit** - GTHO_V1_FEATURE_AUDIT.md — 58 catalog entries, 40 capabilities, 12 anti-patterns

## Phase 2 — Design Docs
- [x] **V2_BUILD_INDEX.md** - Master tracker and session handoff doc
- [x] **V2_SCHEMA_DESIGN.md** - 12 event tables approved, remaining domains PENDING
- [ ] **V2_APP_ARCHITECTURE.md** - Draft — needs Tim review
- [ ] **V2_CALCULATION_SPEC.md** - Draft — 42 formulas, needs Tim review
- [ ] **V2_UX_FLOWS.md** - Draft — move wizard, feed check, survey flows, needs Tim review
- [ ] **V2_INFRASTRUCTURE.md** - Draft — units, i18n, logging, RLS, testing, AI
- [ ] **V2_MIGRATION_PLAN.md** - Draft — v1→v2 data, rollout phases, cutover

## Schema — Approved Domains
- [x] **D2: Locations** - locations table designed and approved
- [x] **D5: Event System** - events, paddock windows, group windows — approved
- [x] **D5: Feed System** - feed entries, feed checks, feed check items — approved
- [x] **D6: Surveys** - surveys, draft entries, paddock observations — approved
- [x] **D7: Harvest** - harvest events, harvest event fields — approved

## Schema — Pending Domains
- [ ] **D1: Operation & Farm Setup** - operations, farms, operation_members
- [ ] **D2: Forage Types** - forage_types reference table
- [ ] **D3: Animals & Groups** - animals, groups, memberships, animal_classes
- [ ] **D4: Feed Inventory** - feed_types, batches
- [ ] **D8: Nutrients & Amendments** - amendments, amendment_locations, input_products, soil_tests, manure
- [ ] **D9: Livestock Health** - BCS, treatments, breeding, calving, treatment_types, ai_bulls
- [ ] **D10: Feed Quality** - batch_nutritional_profiles
- [ ] **D11: App Infrastructure** - app_logs, submissions, todos, release_notes

## Architecture Walkthrough
- [x] **Group 1: Core Patterns** - Store, SyncAdapter, DOM builder, Sheet class, registerCalc() — all adopted
- [x] **Group 2: Calculations** - 42 formulas reviewed, per-class rates, price stamping, 3-tier config approved
- [ ] **Group 3: UI & UX** - Router, reactive subscribers, reports, dashboard widgets, move wizard
- [ ] **Group 4: AI & Voice** - 3-phase inference, conversational parsing, guided scripts, source audit
- [ ] **Group 5: Infrastructure** - Units, i18n, logging, feedback, RLS, testing, CI, PWA
- [ ] **Group 6: Migration** - Data pipeline, rollout phases, cutover plan

## Phase 3 — Build (not started)
- [ ] **Phase 3.1: Scaffold** - CP 1-6: Vite, store, entities, sync, router, sheet, DOM, i18n, units, logger
- [ ] **Phase 3.2: Core Loop** - CP 7-14: Events, locations, animals, dashboard, offline sync
- [ ] **Phase 3.3: Assessment** - CP 15-21: Surveys, feed mgmt, calc engine, reports
- [ ] **Phase 3.4: Advanced** - CP 22-32: Voice, rotation calendar, export/import, migration tool
- [ ] **Phase 3.5: Polish** - PWA, sync hardening, perf, accessibility, cutover
