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

### 3.1 Scaffold (spec: `github/issues/phase-3-1-scaffold.md`)
- [ ] **CP-1** — Vite project init, build tooling, eslint
- [ ] **CP-2** — Core utilities: logger, date-utils, validators, units, calc-registry
- [ ] **CP-3** — Entity files D1: operations, farms, farm_settings, operation_members, user_preferences
- [ ] **CP-4** — Entity files D2–D4: locations, animals, groups, feed inventory (9 entities)
- [ ] **CP-5** — Entity files D5–D7: events, surveys, harvest (11 entities)
- [ ] **CP-6** — Entity files D8–D11: nutrients, health, quality, infra (25 entities)
- [ ] **CP-7** — i18n setup: t() function, en.json skeleton
- [ ] **CP-8** — Data layer: store, localStorage, sync adapter, Supabase client
- [ ] **CP-9** — UI framework: DOM builder, sheet class, router, header, CSS tokens
- [ ] **CP-10** — App shell wiring + integration test

### 3.2 Core Loop (spec needed)
- [ ] Events, locations, animals, dashboard, offline sync

### 3.3 Assessment (spec needed)
- [ ] Surveys, feed management, calc engine, reports

### 3.4 Advanced (spec needed)
- [ ] Rotation calendar, export/import, migration tool

### 3.5 Polish (spec needed)
- [ ] PWA, sync hardening, performance, accessibility, cutover
