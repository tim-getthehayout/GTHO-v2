# Phase 3.1 — Scaffold

> **Note:** The authoritative build spec is in V2_BUILD_INDEX.md. This file contains the detailed checkpoint breakdown for Claude Code.

## Summary

Set up the v2 application foundation: Vite project, utilities, all 50 entity files with migrations, the store/sync data layer, UI framework, and i18n. No feature screens yet — this phase builds the infrastructure that all features plug into. When done, the app shell loads, the router works, and a round-trip test proves data flows from UI → store → localStorage → Supabase shape → back.

## Build Order

Checkpoints must be completed in sequence. Commit after each one. Do not skip ahead.

### CP-1: Vite Project Init

Create the project skeleton with build tooling.

**Create:**
- `package.json` — name: `gtho-v2`, scripts: `dev`, `build`, `preview`, `test:unit`, `test:e2e`, `lint`
- `vite.config.js` — ES module build, resolve aliases if needed
- `index.html` — minimal shell: `<div id="app"></div>`, links to `/src/main.js`
- `src/main.js` — entry point (empty boot function for now)
- `.gitignore` — node_modules, dist, .env*, .DS_Store
- `.env.example` — `VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=`
- `eslint.config.js` — flat config, ES modules

**Install:** vite, vitest, eslint, @supabase/supabase-js, playwright (dev)

**Test:** `npm run dev` starts without errors. `npm run build` produces dist/.

- [ ] Vite dev server starts clean
- [ ] Production build succeeds
- [ ] Vitest runs (no tests yet, but harness works)

---

### CP-2: Core Utilities

Pure functions with no app dependencies. These are the building blocks everything else imports.

**Create:**
- `src/utils/logger.js` — `logger.info()`, `.warn()`, `.error()` per V2_INFRASTRUCTURE.md §3.2. localStorage buffer for offline. No Supabase client yet (injected later).
- `src/utils/date-utils.js` — Date arithmetic, formatting helpers. Timezone-aware using operation timezone.
- `src/utils/validators.js` — `required()`, `isUuid()`, `isIn()`, `isPositiveNumber()`, `isDate()`, etc. Return `{ valid, errors[] }`.
- `src/utils/units.js` — `convert(value, from, to)`, `display(value, measureType, decimals)` per V2_INFRASTRUCTURE.md §1. All 6 measurement types from the conversion table.
- `src/utils/calc-registry.js` — `registerCalc()`, `getAllCalcs()`, `getCalcsByCategory()`, `getCalcById()` per V2_CALCULATION_SPEC.md. Registry only — no formulas registered yet.

**Tests (in `tests/unit/`):**
- `units.test.js` — all 6 conversion types, bidirectional accuracy
- `validators.test.js` — valid inputs pass, invalid inputs return errors
- `date-utils.test.js` — edge cases: midnight, DST, date math
- `calc-registry.test.js` — register, retrieve, category filter

- [ ] All 4 test files pass
- [ ] No `console.*` in any util (logger excepted)
- [ ] Every file has `/** @file */` doc comment

---

### CP-3: Entity Files — D1 Operation & Farm Setup (5 entities)

First entity batch. Establishes the pattern all other entities follow.

**Create each entity file in `src/entities/` with exports: `FIELDS`, `create()`, `validate()`, `toSupabaseShape()`, `fromSupabaseShape()`**

| File | Table | Key fields |
|------|-------|-----------|
| `operation.js` | operations | name, timezone, currency |
| `farm.js` | farms | operation_id, name, area_hectares |
| `farm-setting.js` | farm_settings | farm_id, unit_system, all config fields |
| `operation-member.js` | operation_members | operation_id, user_id, role |
| `user-preference.js` | user_preferences | user_id, view_mode, field_mode |

**Create migration SQL in `supabase/migrations/`:**
- `001_d1_operations_farms.sql` — CREATE TABLE for all 5 D1 tables with RLS policies

**Source of truth for column specs:** V2_SCHEMA_DESIGN.md Domain 1 (§1.1–§1.5). Copy column names, types, and constraints exactly.

**Tests:**
- `entities/operation.test.js` (and one per entity) — `create()` returns valid record, `validate()` catches missing required fields, shape round-trip: `fromSupabaseShape(toSupabaseShape(record))` === original

- [ ] 5 entity files created, all export FIELDS/create/validate/toSupabaseShape/fromSupabaseShape
- [ ] Migration SQL matches V2_SCHEMA_DESIGN.md exactly
- [ ] Shape round-trip tests pass for all 5

---

### CP-4: Entity Files — D2 Locations + D3 Animals + D4 Feed (9 entities)

**Entities:**

| File | Table |
|------|-------|
| `location.js` | locations |
| `forage-type.js` | forage_types |
| `animal-class.js` | animal_classes |
| `animal.js` | animals |
| `group.js` | groups |
| `animal-group-membership.js` | animal_group_memberships |
| `feed-type.js` | feed_types |
| `batch.js` | batches |
| `batch-adjustment.js` | batch_adjustments |

**Migrations:**
- `002_d2_locations.sql`
- `003_d3_animals_groups.sql`
- `004_d4_feed_inventory.sql`

**Source of truth:** V2_SCHEMA_DESIGN.md Domains 2–4.

**Tests:** One test file per entity. Same pattern as CP-3.

- [ ] 9 entity files with full exports
- [ ] 3 migration files match schema design
- [ ] Shape round-trip tests pass for all 9

---

### CP-5: Entity Files — D5 Events + D6 Surveys + D7 Harvest (11 entities)

**Entities:**

| File | Table |
|------|-------|
| `event.js` | events |
| `event-paddock-window.js` | event_paddock_windows |
| `event-group-window.js` | event_group_windows |
| `event-feed-entry.js` | event_feed_entries |
| `event-feed-check.js` | event_feed_checks |
| `event-feed-check-item.js` | event_feed_check_items |
| `survey.js` | surveys |
| `survey-draft-entry.js` | survey_draft_entries |
| `paddock-observation.js` | paddock_observations |
| `harvest-event.js` | harvest_events |
| `harvest-event-field.js` | harvest_event_fields |

**Migrations:**
- `005_d5_events.sql`
- `006_d6_surveys.sql`
- `007_d7_harvest.sql`

**Source of truth:** V2_SCHEMA_DESIGN.md Domains 5–7.

- [ ] 11 entity files with full exports
- [ ] 3 migration files match schema design
- [ ] Shape round-trip tests pass for all 11

---

### CP-6: Entity Files — D8 Nutrients + D9 Health + D10 Quality + D11 Infra (25 entities)

Remaining entities. Largest batch but same pattern.

**D8 — Nutrients & Amendments (10 entities):**
input-product-category.js, input-product-unit.js, input-product.js, spreader.js, soil-test.js, amendment.js, amendment-location.js, manure-batch.js, manure-batch-transaction.js, npk-price-history.js

**D9 — Livestock Health (10 entities):**
ai-bull.js, treatment-category.js, treatment-type.js, dose-unit.js, animal-bcs-score.js, animal-treatment.js, animal-breeding-record.js, animal-heat-record.js, animal-calving-record.js, animal-weight-record.js

**D10 — Feed Quality (1 entity):**
batch-nutritional-profile.js

**D11 — App Infrastructure (4 entities):**
app-log.js, submission.js, todo.js, todo-assignment.js, release-note.js

**Migrations:**
- `008_d8_nutrients_amendments.sql`
- `009_d9_livestock_health.sql`
- `010_d10_feed_quality.sql`
- `011_d11_app_infrastructure.sql`

**Source of truth:** V2_SCHEMA_DESIGN.md Domains 8–11.

- [ ] 25 entity files with full exports (check: should total 50 entities across CP-3 through CP-6)
- [ ] 4 migration files match schema design
- [ ] Shape round-trip tests pass for all 25

---

### CP-7: i18n Setup

**Create:**
- `src/i18n/i18n.js` — `t(key, replacements)`, `loadLocale(code)`, `setLocale()` per V2_INFRASTRUCTURE.md §2
- `src/i18n/locales/en.json` — Skeleton with top-level keys: `app`, `nav`, `action`, `unit`, `event`, `location`, `animal`, `feed`, `survey`, `harvest`, `amendment`, `health`, `settings`, `error`, `validation`. Populate nav and action keys. Feature-specific strings added in Phase 3.2+.

**Tests:**
- `i18n.test.js` — key lookup, interpolation, missing key returns key itself

- [ ] `t()` resolves nested keys
- [ ] Interpolation works: `t('key', { n: 5 })` replaces `{n}`
- [ ] Missing key returns the key string (not undefined, not throw)

---

### CP-8: Data Layer — Store + Sync

The backbone. Store is the single data access point. Sync adapter handles Supabase communication.

**Create:**
- `src/data/local-storage.js` — `saveToStorage(entityType, data)`, `loadFromStorage(entityType)`, `clearStorage()`
- `src/data/sync-adapter.js` — Base class with interface per V2_APP_ARCHITECTURE.md §5.1: `push()`, `pushBatch()`, `pull()`, `pullAll()`, `delete()`, `isOnline()`, `getStatus()`, `onStatusChange()`
- `src/data/custom-sync.js` — Supabase implementation: offline queue in localStorage, exponential backoff (1s→2s→4s→8s→16s, max 5 retries), dead letter handling per V2_INFRASTRUCTURE.md §3.5
- `src/data/supabase-client.js` — Initialize `@supabase/supabase-js` from env vars
- `src/data/store.js` — Per V2_APP_ARCHITECTURE.md §4:
  - State object with arrays for all 50 entity types
  - Getters return shallow copies (one per entity type + filtered variants like `getEventsByLocation()`)
  - Actions follow: validate → mutate state → persist to localStorage → queue sync → notify subscribers
  - `subscribe(entityType, callback)` returns unsubscribe function
  - `init()` loads from localStorage on startup

**Tests:**
- `store.test.js` — init loads from storage, getter returns copy (not reference), action validates before mutating, action notifies subscribers, subscribe/unsubscribe works
- `local-storage.test.js` — save/load round-trip, clearStorage
- `sync-adapter.test.js` — interface contract (methods exist, throw "not implemented")

- [ ] Store init loads all entity types from localStorage
- [ ] Store getters return copies, not references
- [ ] Store actions validate → mutate → persist → notify (in that order)
- [ ] Sync adapter interface defined with all 8 methods
- [ ] Custom sync has offline queue + retry logic

---

### CP-9: UI Framework — DOM Builder + Sheet + Router

**Create:**
- `src/ui/dom.js` — `el(tag, attrs, children)`, `text(str)`, `clear(container)` per V2_APP_ARCHITECTURE.md §6.1
- `src/ui/sheet.js` — `Sheet` class with `open(data)`, `close()`, `save()`, `.open` CSS toggle, backdrop close per V2_APP_ARCHITECTURE.md §6.2
- `src/ui/router.js` — Hash-based routing per V2_APP_ARCHITECTURE.md §6.3. Routes map to render functions. Unknown hash → dashboard. Exports `navigate(hash)`.
- `src/ui/header.js` — App header with nav links and farm switcher placeholder

**CSS:**
- `src/styles/main.css` — Design system tokens from V2_DESIGN_SYSTEM.md: CSS custom properties for colors, typography scale, spacing scale, border radii, shadows. Sheet open/close styles. Responsive breakpoint (900px). Mobile-first layout.

**Tests:**
- `dom.test.js` — el() creates elements with attrs and children, text() creates text nodes, clear() empties container
- `router.test.js` — routes resolve to functions, unknown hash falls back to dashboard

- [ ] DOM builder creates elements without innerHTML
- [ ] Sheet open/close toggles `.open` class
- [ ] Router maps 7 hash routes to render functions
- [ ] CSS tokens match V2_DESIGN_SYSTEM.md values

---

### CP-10: App Shell + Integration Test

Wire everything together. The app boots, shows a header with nav, routes between empty screens.

**Update:**
- `src/main.js` — Boot sequence: init store → load locale → init router → render header → navigate to `#/`
- `index.html` — Link main.css, add manifest placeholder, add `<meta name="app-version">`

**Create placeholder render functions** (one per route, just renders a heading via DOM builder):
- `src/features/dashboard/index.js` — `renderDashboard()`
- `src/features/events/index.js` — `renderEventsScreen()`
- `src/features/locations/index.js` — `renderLocationsScreen()`
- `src/features/feed/index.js` — `renderFeedScreen()`
- `src/features/animals/index.js` — `renderAnimalsScreen()`
- `src/features/reports/index.js` — `renderReportsScreen()`
- `src/features/settings/index.js` — `renderSettingsScreen()`

**Integration test (`tests/unit/integration.test.js`):**
1. Create a location via `store.addLocation()` — verify validation runs
2. Read it back via `store.getLocations()` — verify it returns a copy
3. Verify `toSupabaseShape()` produces correct snake_case
4. Verify `fromSupabaseShape()` round-trips back to original
5. Verify subscriber was notified on add

- [ ] App boots without errors (`npm run dev`)
- [ ] Hash navigation works between all 7 routes
- [ ] Integration test proves: create → read → shape round-trip → subscriber notification
- [ ] `npm run build` produces working production bundle
- [ ] All unit tests pass (`npx vitest run`)

## Test Plan

- [ ] `npx vitest run` — all unit tests pass (target: 50+ entity tests + util tests + store tests + integration)
- [ ] `npm run build` — production build succeeds
- [ ] `npm run dev` — app shell loads, routes work, no console errors
- [ ] No innerHTML anywhere in src/
- [ ] No hardcoded English in feature code (i18n skeleton in place)
- [ ] Every entity shape round-trips correctly
- [ ] Migration SQL column names match entity sbColumn names exactly

## Notes

**What this phase does NOT include:**
- No feature UI (forms, lists, wizards) — that's Phase 3.2
- No Supabase connection (env vars not configured yet) — sync adapter is wired but offline-only until Tim sets up the v2 Supabase project
- No auth flow — that's Phase 3.2
- No registered calculations — formulas are registered in Phase 3.3 when the calc engine is built
- No PWA/service worker — that's Phase 3.5

**Context window management:** 50 entity files is a lot. Each entity follows the exact same pattern. Build D1 (CP-3) carefully as the template, then batch the rest. If any entity's schema has ambiguity, flag it in OPEN_ITEMS.md as `DESIGN REQUIRED` per CLAUDE.md rules — do not guess.

**The schema design doc (V2_SCHEMA_DESIGN.md) is the single source of truth for every column.** Do not invent fields. If a column is in the schema, it must be in the entity. If it's not in the schema, it doesn't exist.
