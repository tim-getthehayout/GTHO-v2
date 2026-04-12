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
    events/               — Event creation, editing, close sequence
    feed/                 — Feed delivery, checks, transfers
    locations/            — Location management
    surveys/              — Survey workflow
    harvest/              — Harvest recording
    animals/              — Animal/group management
    health/               — Treatments, breeding, calving, heats, BCS, weights
    amendments/           — Soil tests, amendment recording, manure batches, spreaders
    auth/                 — Login, signup, session management (loads before main app)
    onboarding/           — Setup wizard: species selection, class seeding, reference table defaults
    reports/              — Report generation
    settings/             — Settings, calc reference console
    dashboard/            — Home screen widgets
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
- **Dead letter handling:** After 5 failures, write moves to dead-letter queue with full context (table, record, error, retry count, timestamps). Manual "Push All" in Settings re-queues dead letters.
- **Conflict resolution:** Last-write-wins by `updated_at`, scoped by `operation_id`. Single user = rare conflicts. Upsert on `id`.

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
  '#/events':     renderEventsScreen,
  '#/locations':  renderLocationsScreen,   // was #/pastures in v1
  '#/feed':       renderFeedScreen,
  '#/animals':    renderAnimalsScreen,
  '#/reports':    renderReportsScreen,
  '#/settings':   renderSettingsScreen,
};
```

Unknown hash → fallback to dashboard. Navigation via `window.location.hash = '#/events'`.

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

*End of document. This spec defines how v2 code is structured and how patterns are applied. For data schemas see V2_SCHEMA_DESIGN.md. For formulas see V2_CALCULATION_SPEC.md. For UX flows see V2_UX_FLOWS.md.*
