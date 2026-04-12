# Tasks

## Phase 1 — Audit
- [x] **v1 Feature Audit** — GTHO_V1_FEATURE_AUDIT.md — 58 catalog entries, 40 capabilities, 12 anti-patterns

## Phase 2 — Design Docs
- [x] **V2_BUILD_INDEX.md** — Master tracker and session handoff doc
- [x] **V2_SCHEMA_DESIGN.md** — 51 tables across 11 domains, all approved
- [x] **V2_APP_ARCHITECTURE.md** — Store, sync, DOM builder, sheets, router — approved
- [x] **V2_CALCULATION_SPEC.md** — 35 formulas, registerCalc() pattern — approved
- [x] **V2_UX_FLOWS.md** — 13 user interaction flows — approved
- [x] **V2_INFRASTRUCTURE.md** — Units, i18n, logging, RLS, testing, CI, PWA — approved
- [x] **V2_DESIGN_SYSTEM.md** — Color tokens, typography, spacing, components — approved
- [x] **V2_MIGRATION_PLAN.md** — 24 transform sections, cutover plan — approved

## Phase 3 — Build

### 3.1 Scaffold (BUILDING — 539 tests)
- [x] **CP-1** — Vite project init, build tooling, eslint
- [x] **CP-2** — Core utilities: logger, date-utils, validators, units, calc-registry
- [x] **CP-3** — Entity files D1: operations, farms, farm_settings, operation_members, user_preferences
- [x] **CP-4** — Entity files D2–D4: locations, animals, groups, feed inventory (9 entities)
- [x] **CP-5** — Entity files D5–D7: events, surveys, harvest (11 entities)
- [x] **CP-6** — Entity files D8–D11: nutrients, health, quality, infra (25 entities)
- [x] **CP-7** — i18n setup: t() function, en.json skeleton
- [x] **CP-8** — Data layer: store, localStorage, sync adapter, Supabase client
- [x] **CP-9** — UI framework: DOM builder, sheet class, router, header, CSS tokens
- [x] **CP-10** — App shell wiring + integration test

### 3.2 Core Loop
- [ ] **CP-11** — Auth flow: login, signup, session management
- [ ] **CP-12** — Onboarding wizard: operation + farm + species + class seeding
- [ ] **CP-13** — Settings screen: farm config, unit toggle, user preferences, sync status
- [ ] **CP-14** — Locations screen: CRUD, filter pills, forage type management
- [ ] **CP-15** — Animals — Groups & Classes: group CRUD, class editing
- [ ] **CP-16** — Animals — Individual animals: animal CRUD, group assignment, search
- [ ] **CP-17** — Events — Create & List: event creation, event log, event card display
- [ ] **CP-18** — Paddock & Group windows: sub-moves, group add/remove, primary paddock rule
- [ ] **CP-19** — Move wizard: close source → create destination, strip graze, join existing
- [ ] **CP-20** — Event close (no move): close sequence, observations
- [ ] **CP-21** — Dashboard: group cards, stats, FAB, mobile/desktop layout
- [ ] **CP-22** — Supabase sync wiring: online/offline, queue flush, dead letters, pull/merge
- [ ] **CP-23** — Integration smoke test: Playwright e2e for full core loop

### 3.3 Assessment (spec not yet written)
- [ ] Feed inventory, delivery, checks, transfer
- [ ] Surveys and pasture observations
- [ ] Amendments and manure management
- [ ] Health records (treatments, breeding, calving, BCS, weights)
- [ ] Calculation engine (register all 35 formulas)
- [ ] Harvest recording
- [ ] Reports

### 3.4 Advanced (spec not yet written)
- [ ] Rotation calendar, export/import, migration tool

### 3.5 Polish (spec not yet written)
- [ ] PWA, sync hardening, performance, accessibility, cutover
