# GTHO v2 — Application Architecture

**Status:** APPROVED
**Source:** Prior ARCHITECTURE.md §1, §3, §4a, §4c, §4d, §5, §6, §11 + interactive design sessions
**Purpose:** Define the code patterns, data access rules, and UI framework for v2. Claude Code follows these patterns for all implementation work.

---

## 1. Core Principles

### 1.1 The Fertility Ledger

A pasture accumulates a fertility ledger. Every grazing event, bale grazing session, feed delivery, and soil amendment is a transaction on that ledger. The pasture's current state — NPK balance, organic matter, carrying capacity — is derived by replaying all transactions.

This is analogous to double-entry accounting: every action has a debit and a credit. Moving animals onto a pasture debits the pasture's forage and credits the animals' intake. Spreading bale grazing residue credits the pasture's NPK. The ledger is the source of truth; every metric is a view over it.

**Implementation:** The store holds raw transactions. Derived metrics are computed on demand via registered calculations (see V2_CALCULATION_SPEC.md). Reports are queries over the ledger filtered by date range, location, or category.

### 1.2 Four-Question Feature Filter

Every feature must answer at least one:

1. Does this help the farmer record a fertility transaction accurately? (Input quality)
2. Does this help the farmer see the current fertility balance of each paddock? (Current state)
3. Does this help the farmer make a better grazing decision today? (Decision support)
4. Does this help the farmer see season-over-season trends? (Historical insight)

If a proposed feature doesn't pass the filter, it doesn't belong in GTHO.

### 1.3 Data Hierarchy

```
Operation (the business)
  └── Farm (physical location)
       ├── Locations (paddocks, confinements)
       ├── Animals (via Groups)
       ├── Events (grazing, with windows + feed)
       ├── Surveys (pasture assessment)
       ├── Harvests (hay/silage cutting)
       └── Amendments (soil inputs)
```

Multi-farm: Store exposes `getFarms()` and `getActiveFarm()`. Feature code always uses `getActiveFarm()` to scope queries. Single-farm operations: farm UI is hidden. Feature code stays farm-agnostic.

### 1.4 Architecture Rules

- **One canonical name per concept.** See Naming Glossary (§8). Grep must work.
- **Metric-internal storage.** All values in metric; display layer converts (see V2_INFRASTRUCTURE.md).
- **Store is the only data access point.** No direct localStorage or Supabase access from feature code.
- **No innerHTML with user-supplied data.** Use DOM builder for all dynamic content.
- **Every calculation registered** via `registerCalc()` before use (see V2_CALCULATION_SPEC.md).
- **Schema-first development.** Every data change starts with migration SQL. Then entity file. Then feature code.
- **Compute on read.** Derived values (DMI, NPK, cost, status) never stored. Exception: group window snapshots.

---

## 2. Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | Vanilla JS (ES modules) | No framework lock-in. Tim can read every line. Small bundle. |
| Build | Vite | Fast dev server, ES module bundling, tree shaking |
| Backend | Supabase | PostgreSQL + auth + RLS + realtime. Proven in v1. |
| Testing | Vitest (unit) + Playwright (e2e) | Fast, ESM-native, good DX |
| Hosting | GitHub Pages | Simple, free, CDN-backed |
| PWA | Service worker + manifest | Offline-first, installable |

---

## 3. File Structure

```
src/
  data/
    store.js              — Single data access point (getters, actions, subscribers)
    local-storage.js      — localStorage read/write (store.js only consumer)
    sync-adapter.js       — SyncAdapter interface definition
    custom-sync.js        — Supabase sync implementation (queue, retry, dead letter)
    supabase-client.js    — Supabase client init
  entities/
    # Each file is the single source of truth for one table:
    # exports FIELDS, create(), validate(), toSupabaseShape(), fromSupabaseShape()
    #
    # D1: Operation & Farm Setup
    operation.js
    farm.js
    farm-setting.js
    operation-member.js
    user-preference.js
    # D2: Locations
    location.js
    forage-type.js        — Cross-cutting: referenced by locations AND batches
    # D3: Animals & Groups
    animal-class.js
    animal.js
    group.js
    animal-group-membership.js
    # D4: Feed Inventory
    feed-type.js
    batch.js
    batch-adjustment.js
    # D5: Event System
    event.js
    event-paddock-window.js
    event-group-window.js
    event-feed-entry.js
    event-feed-check.js
    event-feed-check-item.js
    # D6: Surveys
    survey.js
    survey-draft-entry.js
    paddock-observation.js
    # D7: Harvest
    harvest-event.js
    harvest-event-field.js
    # D8: Nutrients & Amendments
    input-product-category.js
    input-product-unit.js
    input-product.js
    spreader.js
    soil-test.js
    amendment.js
    amendment-location.js
    manure-batch.js
    manure-batch-transaction.js
    # D9: Livestock Health
    ai-bull.js
    treatment-category.js
    treatment-type.js
    dose-unit.js
    animal-bcs-score.js
    animal-treatment.js
    animal-breeding-record.js
    animal-heat-record.js
    animal-calving-record.js
    animal-weight-record.js
    # D10: Feed Quality
    batch-nutritional-profile.js
    # D11: App Infrastructure
    app-log.js
    submission.js
    todo.js
    todo-assignment.js
    release-note.js
  features/
    events/               — Event list, event card, close sequence
      index.js            — Screen render, event list, event card renderer
      move-wizard.js      — 3-step move wizard (§1)
      submove.js          — Paddock window open/close, advance strip (§2)
      group-windows.js    — Group add/remove (§3)
      close.js            — Event close sheet (§9)
    feed/                 — Feed delivery, checks, transfers, inventory
      index.js            — Feed screen render, batch list, feed day goal
      delivery.js         — Feed delivery sheet (§4) — shared: events, field mode
      check.js            — Feed check sheet (§5) — shared: events, move wizard, field mode
      transfer.js         — Feed transfer (§6) — invoked from move wizard
    locations/            — Location management
    surveys/              — Survey workflow
    harvest/              — Harvest recording
    animals/              — Animal/group management, per-animal quick-action bar (§14.10)
    health/               — Reusable recording sheets (§14): weight, BCS, treatment, breeding, heat, calving, note
      weight.js           — Weight Recording sheet (§14.2) — shared: animal edit, quick-action, group session, calving
      bcs.js              — BCS Recording sheet (§14.3) — shared: animal edit, quick-action, group session
      treatment.js        — Treatment Recording sheet (§14.4) — shared: animal edit, quick-action, group session
      breeding.js         — Breeding Recording sheet (§14.5) — shared: animal edit, quick-action
      heat.js             — Heat Recording sheet (§14.6) — shared: animal edit, quick-action, field mode
      calving.js          — Calving Recording sheet (§14.7) — from animal edit only
      note.js             — Animal Note sheet (§14.8) — shared: animal edit, quick-action
      group-session.js    — Group session wrapper (§14.9) — iterates weight/BCS/treatment
    amendments/           — Soil tests, amendment recording, manure batches, spreaders
    auth/                 — Login, signup, session management (loads before main app)
    onboarding/           — Setup wizard: species selection, class seeding, reference table defaults
    reports/              — Report generation
    settings/             — Settings, calc reference console
    dashboard/            — Home screen widgets
    field-mode/           — Field mode home screen, navigation, action tiles (§16)
  ui/
    dom.js                — DOM builder: el(), text(), clear()
    sheet.js              — Sheet lifecycle class
    router.js             — Hash-based router
    header.js             — App header with farm switcher
  utils/
    validators.js         — Input validation functions
    units.js              — Unit conversion (metric ↔ display)
    calc-registry.js      — registerCalc(), getAllCalcs(), getCalcsByCategory()
    logger.js             — Structured logging (see V2_INFRASTRUCTURE.md)
    date-utils.js         — Date arithmetic, formatting
  i18n/
    i18n.js               — t() function, loadLocale()
    locales/
      en.json             — English strings
tests/
  unit/                   — Vitest tests (one per entity, one per calc, one per util)
  e2e/                    — Playwright tests (critical user flows)
supabase/
  migrations/             — Numbered SQL migrations
```

**Rules:**
- Every file starts with a `/** @file ... */` doc comment
- Entities live in `src/entities/`
- One entity per file, named to match the table (kebab-case)
- Feature code lives in `src/features/`, organized by domain
- Utils are stateless pure functions
- No circular imports between layers (data → entities → utils only; features → everything)
- **One sheet per file.** Each sheet handler (open/close/save + DOM) lives in its own file within the feature directory. `index.js` handles the screen render and list; domain-specific sheets get their own files. This prevents central-hub screens (events, animals) from growing into monoliths.
- **Shared sheets live in their domain, not their caller.** Feed delivery is a feed feature — it lives in `feed/delivery.js` even though it's opened from event cards, field mode, and the feed screen. Health recording sheets live in `health/`. The caller imports the sheet's `open` function; the sheet doesn't know who called it.
- **Feature file size limit: ~500 lines.** If a feature file exceeds 500 lines, split it. This is a guideline, not a hard rule — but if you're past 500 lines and the file contains multiple sheet handlers, it must be split before the next commit.

---

## 4. Store Pattern

The store (`src/data/store.js`) is the single access point for all application data. It replaces the global `S` object from v1.

### 4.1 Interface

```js
// --- Getters (return copies, not references) ---
getLocations()                    // → Location[]
getLocationById(id)               // → Location | undefined
getEvents()                       // → Event[]
getEventById(id)                  // → Event | undefined
getEventsByLocation(locationId)   // → Event[]
// ... similar for all entities

// --- Actions (validate → mutate → persist → notify) ---
addEvent(eventData)
updateEvent(id, changes)
deleteEvent(id)
// ... similar for all entities

// --- Subscribers (reactive updates) ---
subscribe(entityType, callback)   // → unsubscribe function
```

### 4.2 Action Sequence

Every mutation follows this exact order:

1. **Validate** — entity's `validate()` function checks required fields, types, constraints
2. **Mutate state** — update the in-memory state array
3. **Persist to localStorage** — `saveToStorage(entityType, data)`
4. **Queue sync** — `getSyncAdapter().push(table, toSupabaseShape(record))`
5. **Notify subscribers** — all registered callbacks for this entity type fire

### 4.3 Rules

- Feature code calls `getEvents()`, never `state.events` directly
- Feature code calls `addEvent()`, never `state.events.push()` directly
- Getters return shallow copies (spread) to prevent external mutation
- Subscribers return an unsubscribe function for cleanup
- No async in getters — data is always local-first

### 4.4 Window-Split on State Change (OI-0091)

An `event_group_window` is a **period of stable group state** on an event. During that period `headCount`, `avgWeightKg`, and composition are constant by definition. Whenever the group state actually changes mid-event — cull, reweigh, wean, split, move, composition change — the current open window must **close with live values stamped at the change date** and a **new window must open the same date** carrying the new state.

**Closed windows are historical truth.** Their stored `headCount` / `avgWeightKg` snapshot is authoritative forever and must not be recomputed. **Open windows (`dateLeft === null`) are synthetic.** The stored `headCount` / `avgWeightKg` on an open row are seed values at window creation; every render and calc path must recompute live from `animal_group_memberships` at read time.

**Rule of thumb:** *stored snapshot for closed windows, live recompute for open windows, split on every state change.*

Entry points (never bypass — flows must call one of these at the mutation site):

- `splitGroupWindow(groupId, eventId, changeDate, changeTime, newState)` — `src/data/store.js`. Closes current open window (live values stamped at `changeDate`), opens a new open window carrying `newState.headCount` / `newState.avgWeightKg`. If `newState.headCount < 1`, delegates to `closeGroupWindow` (no new window opens).
- `closeGroupWindow(groupId, eventId, closeDate, closeTime)` — `src/data/store.js`. Terminal close — stamps live values, no new window. Used by event-close and last-membership-gone cascades.
- `getLiveWindowHeadCount(gw, { memberships, now })` — `src/calcs/window-helpers.js`. Every render and calc path reads head count via this helper. Open windows recompute from memberships; closed windows return the stored snapshot. Inclusive lower bound on `dateJoined`, exclusive upper on `dateLeft`.
- `getLiveWindowAvgWeight(gw, { memberships, animals, animalWeightRecords, now })` — same gating, averages live animal weights; falls back to stored `avgWeightKg` when no weight records are available.

Callers (authoritative list as of OI-0091): `cull-sheet.confirmCull`, `move-wizard` (close + destination creation both paths), `events/close`. Future triggers (wean, split, reweigh OI-0065, per-group move OI-0066) plug into the same entry points.

**Grep contract:** no direct `gw.headCount` / `gw.avgWeightKg` reads in `src/features/**` or `src/calcs/**` outside the helpers module and the entity shape layer. Violations are a pre-commit failure.

---

## 5. Sync Layer — Pluggable SyncAdapter

### 5.1 Interface

```js
// src/data/sync-adapter.js
export class SyncAdapter {
  async push(table, record) { throw new Error('Not implemented'); }
  async pushBatch(table, records) { throw new Error('Not implemented'); }
  async pull(table, since) { throw new Error('Not implemented'); }
  async pullAll(table) { throw new Error('Not implemented'); }
  async delete(table, id) { throw new Error('Not implemented'); }
  async isOnline() { throw new Error('Not implemented'); }
  getStatus() { throw new Error('Not implemented'); }     // 'idle' | 'syncing' | 'error' | 'offline'
  onStatusChange(callback) { throw new Error('Not implemented'); }
}
```

### 5.2 Custom Sync Implementation

- **Offline queue:** Writes enqueued to localStorage when offline. Flushed on reconnect.
- **Exponential backoff:** 1s → 2s → 4s → 8s → 16s, max 5 retries per write.
- **Dead letter handling:** After 5 failures, write moves to dead-letter queue with full context (table, record, error, retry count, timestamps). Manual "Resync to server" in Settings re-queues dead letters.
- **Conflict resolution:** Last-write-wins by `updated_at`, scoped by `operation_id`. Single user = rare conflicts.

**Write method by operation type:**

| Store action | Sync method | Why |
|---|---|---|
| `add()` — new record | `.insert()` | New records must use INSERT so only the INSERT RLS policy is evaluated. Using `.upsert()` triggers INSERT + UPDATE policy checks, which fails during onboarding because UPDATE policies check `operation_members` (which may not exist yet). |
| `update()` — existing record | `.update().eq('id', id)` | Existing records already passed INSERT; only UPDATE policy needed. |
| `remove()` — delete | `.delete().eq('id', id)` | Already correct. |
| Resync / recovery | `.upsert(record, { onConflict: 'id' })` | Recovery path re-pushes all records. By the time recovery runs, the user's `operation_members` row exists, so both INSERT and UPDATE policies pass. Upsert is correct here because we don't know if the record already exists in Supabase. |

**Origin:** OI-0054 — discovered during Tier 3 testing. The sync adapter used `.upsert()` for all writes. During onboarding, every table's INSERT was rejected because Supabase evaluated both INSERT and UPDATE policies, and the UPDATE policy's `operation_members` check failed (the member row didn't exist yet). 24 records dead-lettered on every onboarding attempt.

### 5.3 Future PowerSync Swap

PowerSync implements the same SyncAdapter interface. When costs justify it:
1. Create `src/data/powersync-sync.js` implementing SyncAdapter
2. Change the import in store.js
3. Configure bucket rules to match current RLS policies

One file swap. No feature code changes.

### 5.4 Sync Test Suite (14 Scenarios)

| # | Scenario | Pass Criteria |
|---|----------|---------------|
| 1 | Clean online write | Record appears in Supabase within 2s |
| 2 | Offline write + reconnect | Queued writes flush in order |
| 3 | Rapid-fire writes (20 in 1s) | All 20 arrive, correct final state |
| 4 | Mid-flush disconnect | Retry from last uncommitted |
| 5 | Two-device conflict (edit) | Last-write-wins, no data loss |
| 6 | Delete vs update race | Delete wins, no ghost record |
| 7 | Large payload (500 records) | Completes without timeout |
| 8 | Token expiry mid-sync | Refresh + retry, no data loss |
| 9 | Schema mismatch | Logged, sync continues for valid columns |
| 10 | Duplicate push (idempotency) | Upsert prevents duplicates |
| 11 | Pull with no changes | Empty result, no re-renders |
| 12 | Pull with deletes | Local record removed, UI updates |
| 13 | Dead letter | Write moves to dead_letter with context |
| 14 | Recovery ("Push All") | Everything re-queued, dead letters retried |

### 5.5 Backup / Import / Export (CP-55, CP-56, CP-57)

**Files:** `src/data/backup-export.js` (CP-55), `src/data/backup-import.js` (CP-56, CP-57), `src/data/backup-migrations.js`

The app supports full-operation JSON backup and restore. CP-55 exports, CP-56 imports, and CP-57 provides the v1 → v2 migration tool (which transforms v1 JSON into a v2 backup envelope and feeds it into the CP-56 import pipeline). The complete specification lives in V2_MIGRATION_PLAN.md §5.2 (export format), §5.7 (import procedure), and §5.9 (backup migration chain).

**Key constants in backup-import.js:**

| Constant | Purpose |
|---|---|
| `FK_ORDER` | Authoritative insert/delete order for all tables, matching V2_MIGRATION_PLAN.md §5.3a. Inserts iterate top-to-bottom (parents first). Deletes iterate bottom-to-top (children first). |
| `TWO_PASS_TABLES` | Tables with self-referential FKs (`animals`: dam_id/sire_animal_id; `events`: source_event_id). Pass 1 inserts with self-FKs NULL; pass 2 updates them. |
| `REFERENCE_TABLES` | Seed-data tables (`treatment_categories`, `treatment_types`, `dose_units`, `input_product_categories`, `input_product_units`, `forage_types`, `animal_classes`). These upsert by id instead of delete-then-insert, preserving seed rows not in the backup. |

**Delete and parity pattern:** Every user-data table has a direct `operation_id` column (Design Principle #8, no exceptions). Both `deleteTableRows()` and `parityCheck()` use the uniform `WHERE operation_id = $1` filter. No indirect queries through parent FKs are needed.

**Import flow** (10 steps, detail in V2_MIGRATION_PLAN.md §5.7):
1. Validate envelope (format, version)
2. Pending-writes gate (refuse if sync queue has pending writes)
3. Preview sheet with two-step confirmation
4. Auto-backup current state (downloaded to user's disk — the revert mechanism)
5. Migrate backup forward through `BACKUP_MIGRATIONS` chain if schema version is behind
6. Wholesale replace: delete all operation rows (children first per FK_ORDER reverse), then insert backup rows (parents first per FK_ORDER)
7. Re-seed local store from Supabase (`pullAllRemote()`)
8. Post-import parity check (backup counts vs Supabase counts per table)
9. Log result
10. Progress UI throughout

---

## 6. UI Architecture

### 6.1 DOM Builder

```js
// src/ui/dom.js
export function el(tag, attrs = {}, children = []) { ... }
export function text(str) { return document.createTextNode(str); }
export function clear(container) { while (container.firstChild) container.removeChild(container.firstChild); }
```

**Rule:** No innerHTML with user-supplied data. All dynamic content uses `el()` and `text()`. This prevents XSS at the framework level.

### 6.2 Sheet Lifecycle Class

```js
// src/ui/sheet.js
export class Sheet {
  constructor(wrapId) { ... }
  open(data) { ... }    // Add .open class, call onOpen(data)
  close() { ... }       // Remove .open class, call onClose()
  save() { ... }        // Validate, call onSave(), close
}
```

**Rules:**
- All sheets always in DOM — show/hide by toggling `.open` on the `-wrap` div
- Backdrop click always calls close
- New sheet HTML at bottom of its feature module
- Never createElement/removeChild for overlays

### 6.3 Router

Hash-based routing. Routes map to render functions.

```js
const routes = {
  '#/':           renderDashboard,
  '#/events':     renderEventsScreen,     // nav label: "Rotation Calendar" (2026-04-13)
  '#/locations':  renderLocationsScreen,   // was #/pastures in v1
  '#/feed':       renderFeedScreen,
  '#/animals':    renderAnimalsScreen,
  '#/reports':    renderReportsScreen,
  '#/settings':   renderSettingsScreen,
};
```

Unknown hash → fallback to dashboard. Navigation via `window.location.hash = '#/events'`.

**Display-label / route-id mapping.** The `#/events` route renders as "Rotation Calendar" in the sidebar and mobile bottom-nav; testids `nav-events` and `bnav-events` are preserved. This is a label-only alignment with the user-facing name of the screen — internal references (route id, function name `renderEventsScreen`, testids, feature directory `src/features/events/`) are intentionally unchanged.

**Not top-level routes (accessed as sub-screens):**
- Health (treatments, breeding, calving, heats, BCS, weights) — accessed from animal edit dialog and animal screen within `#/animals`
- Amendments (soil tests, amendments, manure batches, spreaders) — accessed from location detail within `#/locations`

### 6.4 Reactive Updates

Store subscribers trigger re-renders automatically. Each feature subscribes at init:

```js
// In events feature init
store.subscribe('events', () => renderEventsScreen());
store.subscribe('eventPaddockWindows', () => renderEventsScreen());
```

No manual render chains. Change data → store notifies → UI updates.

---

## 7. Reporting & Dashboard

### 7.1 Composable Report Engine

Reports are pure functions: take store data + filters, return DOM elements.

```js
function npkReport({ locationId, dateRange }) {
  const events = store.getEventsByLocation(locationId);
  // ... filter by date, compute NPK via registered calcs
  return el('div', { class: 'report' }, [ ... ]);
}
```

**Rules:**
- No state mutation in reports
- All calculations via registered calcs (never bare arithmetic)
- Filter by location, farm, date range
- Returns DOM, not HTML strings

### 7.2 Dashboard Widgets

Configurable grid. Each widget is a small report component:

```js
const widgets = [
  { id: 'activeEvents',  render: renderActiveEventsWidget,  size: 'half' },
  { id: 'restDays',      render: renderRestDaysWidget,      size: 'half' },
  { id: 'npkSummary',    render: renderNPKWidget,           size: 'full' },
  { id: 'feedInventory',  render: renderFeedInventoryWidget, size: 'half' },
  { id: 'recentSurveys', render: renderSurveysWidget,       size: 'half' },
  { id: 'costSummary',   render: renderCostWidget,          size: 'full' },
];
```

---

## 8. Naming Glossary

One canonical name per concept. Grep must work. No aliases.

| Concept | Canonical Name | NOT |
|---------|---------------|-----|
| Place animals graze or are confined | location | pasture, paddock, field, lot |
| Grazing session | event | grazing, entry, rotation |
| Feed inventory delivery | batch | lot, shipment, load |
| Animal classification group | group | mob, herd, batch |
| Pasture assessment | survey | rating, check, observation |
| Soil/nutrient input | amendment | application, input, fertilizer |
| Livestock health intervention | treatment | medication, dose, procedure |
| Business/tenant | operation | account, org, farm |
| Physical property | farm | ranch, property, location |

**Code conventions:**
- JS: camelCase (`eventPaddockWindow`)
- Supabase: snake_case (`event_paddock_windows`)
- Files: kebab-case (`event-paddock-window.js`)
- Mapping is mechanical via entity `sbColumn` names

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-04-14 | Tier 3 migration testing — OI-0054 | §5.2: Added write-method-by-operation-type table (insert/update/upsert distinction). Documented OI-0054 origin (upsert bootstrap failure during onboarding). |
| 2026-04-14 | Tier 3 migration testing — OI-0055 | New §5.5: Backup/Import/Export architecture covering CP-55/CP-56/CP-57. Documents FK_ORDER, TWO_PASS_TABLES, REFERENCE_TABLES, uniform operation_id delete/parity pattern, and the 10-step import flow. |
| 2026-04-18 | OI-0091 event window split | New §4.4: Window-Split on State Change pattern. `event_group_window` is a period of stable state; state changes (cull/move/wean/event-close) close the current window with live values stamped and open a new window. Render and calc paths read through `getLiveWindowHeadCount` / `getLiveWindowAvgWeight` helpers — open windows recompute live, closed windows use stored snapshots. Ships with OI-0073 orphan cleanup (migration 025) as a coordinated P0 package. |

---

*End of document. This spec defines how v2 code is structured and how patterns are applied. For data schemas see V2_SCHEMA_DESIGN.md. For formulas see V2_CALCULATION_SPEC.md. For UX flows see V2_UX_FLOWS.md.*
