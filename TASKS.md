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

### 3.1 Scaffold (COMPLETE — 538 tests)
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

### 3.2 Core Loop (COMPLETE — 538 tests)
- [x] **CP-11** — Auth flow: login, signup, session management
- [x] **CP-12** — Onboarding wizard: operation + farm + species + class seeding
- [x] **CP-13** — Settings screen: farm config, unit toggle, user preferences, sync status
- [x] **CP-14** — Locations screen: CRUD, filter pills, forage type management
- [x] **CP-15** — Animals — Groups & Classes: group CRUD, class editing
- [x] **CP-16** — Animals — Individual animals: animal CRUD, group assignment, search
- [x] **CP-17** — Events — Create & List: event creation, event log, event card display
- [x] **CP-18** — Paddock & Group windows: sub-moves, group add/remove, primary paddock rule
- [x] **CP-19** — Move wizard: close source → create destination, strip graze, join existing
- [x] **CP-20** — Event close (no move): close sequence, observations
- [x] **CP-21** — Dashboard: group cards, stats, FAB, mobile/desktop layout
- [x] **CP-22** — Supabase sync wiring: online/offline, queue flush, dead letters, pull/merge
- [x] **CP-23** — Integration smoke test: Playwright e2e for full core loop

### 3.3 Assessment (COMPLETE — 563 tests)
- [x] **CP-24** — Feed types CRUD
- [x] **CP-25** — Batch inventory with adjustments
- [x] **CP-26** — Feed day goal banner
- [x] **CP-27** — Feed delivery from events
- [x] **CP-28** — Feed check
- [x] **CP-29** — Feed transfer in move wizard
- [x] **CP-30** — Event close full version (feed check + confinement NPK)
- [x] **CP-31** — Survey workflow (bulk/single, draft entries, commit to observations)
- [x] **CP-32** — Health reference tables (AI sires, treatment categories/types, dose units)
- [x] **CP-33** — Weight & BCS recording
- [x] **CP-34** — Field mode
- [x] **CP-35** — Treatment recording
- [x] **CP-36** — Breeding & heat recording
- [x] **CP-37** — Calving (calf creation, class reassignment)
- [x] **CP-38** — Amendment reference tables (product categories, input products, spreaders)
- [x] **CP-39** — Soil tests
- [x] **CP-40** — Amendment entry
- [x] **CP-41** — Manure system (batches + transaction ledger)
- [x] **CP-42** — NPK price history
- [x] **CP-43** — Harvest recording
- [x] **CP-44** — Feed quality / batch profiles
- [x] **CP-45** — Calc engine core (9 formulas)
- [x] **CP-46** — Calc engine feed & forage (20 formulas)
- [x] **CP-47** — Calc engine advanced (6 formulas, all 35 registered)
- [x] **CP-48–51** — Reports (4 tabs + reference console)
- [x] **CP-52** — Dashboard full metrics (real DMI, feed cost, days on pasture)
- [x] **CP-53** — E2E smoke test updated

### Pre-3.4 Work Items
- [x] **Unit system migration** — Move unit_system from localStorage to operations table (A44, GH-3)
- [x] **Strip grazing paddock windows** — Dual area/pct input, progress bar visualization, unit-aware (A45, GH-4)
- [x] **OI-0011** — Feed screen metrics wired to live data (DM on hand, run rate, days on hand)
- [x] **OI-0014** — Manure volumeKg placeholder verified as architecturally correct
- [x] **OI-0016** — Dose units CRUD (add/edit/archive)
- [x] **OI-0017** — Product add dialog unit selection (amendment input products)
- [x] **OI-0018** — Sync status indicator in app header

### 3.4 Advanced
- [ ] **CP-54** — Rotation calendar
- [ ] **CP-55** — Export/import
- [ ] **CP-56** — v1 migration tool
- [ ] **CP-57** — Migration validation
- [ ] **CP-58** — Migration UI

### 3.5 Polish
- [ ] **CP-59** — PWA / service worker
- [ ] **CP-60** — Sync hardening
- [ ] **CP-61** — Performance optimization
- [ ] **CP-62** — Accessibility audit
- [ ] **CP-63** — Theme polish
- [ ] **CP-64** — Cutover prep
- [ ] **CP-65** — Production launch
