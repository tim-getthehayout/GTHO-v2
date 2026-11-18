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

### 3.1 Entity Contract

Every file in `src/entities/` is the single source of truth for one table and must export exactly five members. Each has a specific contract — violations are a frequent source of silent data-loss bugs.

**`FIELDS`** — metadata map of every persisted field: `{ type, required, sbColumn }`. Used by the store, validators, and tests to introspect the entity. `type` is one of `uuid`, `text`, `integer`, `numeric`, `boolean`, `date`, `timestamptz`, `jsonb`. `sbColumn` is the exact snake_case column name in Supabase.

**`create(data = {})`** — returns a new record with all fields defaulted. Generates `id` via `crypto.randomUUID()` if absent. Stamps `createdAt`/`updatedAt` with `new Date().toISOString()`. Must accept a partial input and fill in every field in `FIELDS`.

**`validate(record)`** — returns `{ valid: boolean, errors: string[] }`. Checks required fields, types, and entity-specific constraints. Must be pure (no side effects, no store reads). Called by the store *before* mutation and *before* sync.

**`toSupabaseShape(record)`** — maps JS camelCase → Supabase snake_case for write. Must emit every field in `FIELDS`. Consumed by the sync adapter when pushing to Supabase.

**`fromSupabaseShape(row)`** — maps Supabase snake_case → JS camelCase for read. Two responsibilities:

1. **Reverse the key mapping.** Every field `toSupabaseShape` emits, `fromSupabaseShape` must read back. Unit tests verify the round trip.
2. **Coerce PostgREST-stringified numerics.** PostgREST returns PostgreSQL `numeric` and `decimal` columns as **JavaScript strings** (arbitrary-precision safety), not numbers. Every field whose `FIELDS` entry has type `numeric` — and defensively, `integer` — must be coerced:

   ```js
   someField: row.some_col != null ? Number(row.some_col) : null
   ```

   Integer columns (`int4`, `int8` under the safe-integer ceiling) normally come back as numbers, but coerce them anyway — it's null-safe and cheap.

   **Skipping this coercion is a silent-corruption bug**, not a cosmetic one. Four harm classes observed in practice: string concatenation (`"0"+"1"+"2"="012"`) in sums; `.toFixed()` `TypeError` at render time; strict `typeof === 'number'` validator silently rejecting re-saved records; lexicographic threshold comparisons rendering the wrong badge color. Reference implementation: `src/entities/event-observation.js`. Every new numeric/integer column requires a round-trip unit test that feeds stringified input through `fromSupabaseShape` (see V2_INFRASTRUCTURE.md §6.1). Origin: OI-0103 → OI-0106 sweep.

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

Every store mutation (`add`, `update`, `remove`; `src/data/store.js:202-284`) follows this order:

1. **Validate** — entity's `validate()` function checks required fields, types, constraints
2. **Mutate state** — update the in-memory state array
3. **Persist to localStorage** — `saveToStorage(entityType, data)`. It throws on a storage error (quota) and the mutation is rolled back.
4. **Hand to sync** — `persistMutation` (`store.js:100-112`) calls `syncAdapter.push(table, toSupabaseShape(record), operation)` (`insert` for `add`, `update` for `update`) or `syncAdapter.delete(table, id)` for `remove`, **without awaiting it**. `update` sends the **whole row** with a fresh client `updatedAt` (`store.js:243`). As built (main `b4cb9335`), an online push is held **in memory** until it is sent (§5.2); only offline pushes are written to the persisted queue first.
5. **Notify subscribers** — all registered callbacks for this entity type fire

**Durable writes (2026-11-08, `866ada7`).** Multi-record saves run inside `runDurableWrite(key, write)` (`store.js:66-92`). The store collects the touched entity arrays and their sync commands instead of persisting each one; then `commitDurableWrite` (`local-storage.js:69-82`) writes a write-ahead journal (`gtho_v2_write_journal`) holding the arrays and queue entries, applies both to localStorage and `_sync_queue` (creates become `upsert`; each entry gets `enqueued_at` from the write-order clock and a `durable_key`), stores a receipt in `gtho_v2_write_receipts`, and clears the journal. `init()` replays an unfinished journal on the next start (`recoverDurableWrite`, `local-storage.js:50-64`). A receipt means "saved on this device and queued", never "on the server". As built, durable writes do **not** start a send; they wait for the next flush trigger (§5.2). Callers include group weights, amendments, feed checks, manual feed, move feed out, calving, pool transfers and checks, and close, move, sub-move and delivery when pool writes are on; the assistant paths call `flush()` right after their local apply.

**OI-0230 PR 1 (intended).** Step 4 becomes queue-first: the save's queue entry (and a per-row "unacked" marker) is written to localStorage **before** any network send, and the save fails visibly if that write fails. A flush then starts promptly for every save, durable or not. See `session_briefs/SYNC_DURABILITY_2026-11-18.md` §4 A.

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

**Entry points that must call the helpers** (authoritative as of OI-0094 — add to this table whenever a new flow mutates a group's head count, avg weight, or membership composition):

| # | Flow | File | Helper used | Notes |
|---|------|------|-------------|-------|
| 1 | Cull animal | `src/features/animals/cull-sheet.js` — `confirmCull` | `splitGroupWindow` | Per-group loop after membership close; auto-routes to `closeGroupWindow` if live head = 0. |
| 2 | Whole-group move | `src/features/events/move-wizard.js` | `closeGroupWindow` on source + live-stamped destination windows | Duplicate-open guard on existing-event destination. |
| 3 | Event close | `src/features/events/close.js` | `closeGroupWindow` | Per open gw on the closing event. |
| 4 | Calving (new calf) | `src/features/health/calving.js` | `splitGroupWindow` via `maybeSplitForGroup` | No-op when dam's group isn't on an open event. |
| 5 | Edit Group checkboxes | `src/features/animals/index.js` (Edit Group sheet) | `splitGroupWindow` per affected group | Adds + removes aggregated into one `affectedGroupIds` pass. |
| 6 | Edit Animal group change | `src/features/animals/index.js` (Edit Animal) | `splitGroupWindow` on source + target | Skips if neither group is placed. |
| 7 | Group Weights bulk update | `src/features/animals/index.js` (Group Weights sheet) | `splitGroupWindow` (avg weight shifts) | Head count unchanged; split only if a weight was written. |
| 8 | Split Group sheet | `src/features/animals/index.js` (Split Group) | `splitGroupWindow` on source (+ target if placed) | Target usually new → no-op for target. |
| 9 | §7 Add group | `src/features/events/group-windows.js` | direct `add()` with live values | No prior window to split — opens a new window with live head/weight. |
| 10 | §7 Remove group | `src/features/events/group-windows.js` | `closeGroupWindow` | Replaces bare `update()` so live values land on close. |
| 11 | §7 per-row Edit — `headCount`/`avgWeightKg` | `src/features/events/edit-group-window.js` | — (view-only on open windows) | Open windows render live values from the calc helpers; closed windows keep the editable inputs as historical-correction escape hatch. |
| 12 | §7 per-row Delete window | `src/features/events/edit-group-window.js` | `remove('eventGroupWindows', …)` | Confirmation dialog: "Delete this window? This removes the group's historical presence on this event. Use only to clean up mistakes." |
| 13 | Event reopen | `src/features/events/reopen-event.js` | `update()` to clear `dateLeft`; `classifyGwsForReopen` selects which | Summary dialog: "N group windows will be reopened. M stay closed because the group has since left." |

Future triggers (wean, reweigh OI-0065, per-group move OI-0066) plug into the same entry points.

**Grep contract:** no direct `gw.headCount` / `gw.avgWeightKg` reads in `src/features/**` or `src/calcs/**` outside the helpers module and the entity shape layer (closed-window render paths and form pre-population are allowed — closed snapshots are authoritative). No direct `update` / `insert` on `event_group_windows` outside `splitGroupWindow` / `closeGroupWindow` except for these narrow cases: (a) **new-window creation with no prior** — create-event flow (`src/features/events/index.js`), §7 Add group (`src/features/events/group-windows.js`), move-wizard destination creation (`src/features/events/move-wizard.js`), retro-place historical gap fill (`src/features/events/retro-place.js`); (b) **explicit user correction** in the per-row Edit dialog (`src/features/events/edit-group-window.js`) — closed-window snapshot or any-window `dateJoined` / `dateLeft`; (c) **selective reopen** (`src/features/events/reopen-event.js`) — clears `dateLeft` on windows returned by `classifyGwsForReopen`. Violations are a pre-commit failure.

### 4.4b Paddock-Side Window-Split (OI-0095)

The same principle applies to `event_paddock_window`: a paddock window is a **period of stable placement state** on an event. `locationId`, `areaPct`, `isStripGraze`, `stripGroupId`, and `noPasture` are constant over the window's lifetime by definition. Unlike group windows there is no live-recompute source — `areaPct` is a farmer's plan, not a derivation — so both the closing and opening rows carry a stored snapshot. When state changes (strip advance, strip-size re-plan mid-event, strip-graze toggled on/off), the current open window closes with its prior state intact (historical truth) and a new window opens with the new state stamped in.

**Rule of thumb (paddock-side):** *every change to `areaPct`, `isStripGraze`, `stripGroupId`, or `noPasture` on an open window splits the window. Direct `update()` on those columns on an open window is a bug.* `dateOpened` / `timeOpened` / `dateClosed` / `timeClosed` remain directly editable — they are the window's own bounds, not state that splits it.

Entry points:

- `splitPaddockWindow(locationId, eventId, changeDate, changeTime, newState)` — `src/data/store.js`. Closes current open PW, opens a new PW with `newState` overriding the prior state. Logs warn and no-ops if no open PW exists for the pair.
- `closePaddockWindow(locationId, eventId, closeDate, closeTime)` — `src/data/store.js`. Terminal close; no new window. Used by move-wizard close loop and event-close close loop.
- `getOpenPwForLocation(locationId, eventId, paddockWindows)` — `src/calcs/window-helpers.js`. Returns the single currently-open PW for the pair, or null. Render/calc paths that need "what `areaPct` is in force right now" read through this helper instead of iterating windows.

**Paddock entry-point table (authoritative as of OI-0095):**

| Flow | File | Helper / path |
|------|------|---------------|
| Advance Strip | `src/features/events/submove.js` | `closePaddockWindow` for the close half + direct `add()` for the open half (the UI exposes distinct close/open dates, so a single `splitPaddockWindow` call doesn't fit) |
| Edit paddock window — OPEN, `areaPct` or `isStripGraze` changed | `src/features/events/edit-paddock-window.js` | `splitPaddockWindow` |
| Edit paddock window — OPEN, `dateOpened` / `timeOpened` only | `src/features/events/edit-paddock-window.js` | direct `update()` (metadata edit, not a state change) |
| Edit paddock window — CLOSED | `src/features/events/edit-paddock-window.js` | direct `update()` (historical-correction escape hatch) |
| Edit paddock window — Reopen | `src/features/events/edit-paddock-window.js` | direct `update({ dateClosed: null })` with same-paddock overlap guard against other open PWs |
| Move wizard close loop | `src/features/events/move-wizard.js` | `closePaddockWindow` |
| Close event close-all loop | `src/features/events/close.js` | `closePaddockWindow` |
| Create Event initial window | `src/features/events/index.js` | direct `add()` (new window, no prior to split) |
| Quick Move new-event window | `src/features/events/index.js` | direct `add()` |
| Event reopen | `src/features/events/reopen-event.js` | `classifyPwsForReopen` selects which PWs to reopen; direct `update({ dateClosed: null })` on the approved set |

Future triggers (paddock swap within event, per-group strip reassignment, OI-0065 reweigh's paddock-side interactions) plug into the same entry points.

**Grep contract (paddock):** no `areaPct: 100` literal reads in `src/features/**` (test files excluded). No direct `update('eventPaddockWindows', ...)` in `src/features/**` mutating `areaPct`, `isStripGraze`, or `stripGroupId` on open windows except inside `splitPaddockWindow` itself. Allowed exceptions: (a) new-window creation (`add('eventPaddockWindows', ...)` in create-event, Quick Move, Advance Strip's open-half, move-wizard destination, `splitPaddockWindow` internal); (b) the Edit paddock window dialog's closed-window historical-correction path; (c) the Edit paddock window dialog's metadata-only update (`dateOpened` / `timeOpened`) on open windows; (d) reopen's selective `dateClosed: null` clears on `classifyPwsForReopen`-approved PWs.

### 4.5 Snapshot / Rollback Pattern (multi-step edit flows)

**The pattern.** A multi-step edit flow that plans a structural change to one or more entities — a paddock-window edit that triggers gap/overlap resolution, a sub-move's open + close + advance pair, a retro-place that may write to two events, a feed move-out that stages a feed check before the removal — must take a **snapshot** of the relevant store slice when the flow starts, stage all proposed mutations against that snapshot, and **roll back to the snapshot if the user cancels at any point before the final confirm**. Only on the final confirm does the flow commit the staged mutations as a single atomic transaction through the store.

This is now a project-wide pattern. The shared scaffolding lives in `src/data/snapshot.js` (the SP-10 Phase 1 helper) and is applied uniformly across the structural edit surfaces documented in V2_UX_FLOWS.md §17.15.1 — group-window edit, paddock-window edit, event-level date change with Event Reopen, retro-place, and Move Feed Out's four-step sheet.

**Why it matters.** Without this, two failure modes silently corrupt the store:

1. **Cancel after partial commit.** If a flow writes to entity A in step 2 and the user cancels in step 3, entity A is left in a half-edited state on disk. localStorage syncs that state, the UI re-renders from it, and the farmer never sees the correction they didn't actually save. This is exactly the class of bug OI-0081 was filed for during the SP-10 walk-through — sub-move Open + Sub-move Close + Advance Strip were three coupled writes to `event_paddock_windows`, and a mid-flow Cancel left the timeline in disagreement with the user's intent.
2. **Re-render cascade clobbering staged edits.** A subscription cascade fires when one of the staged writes lands. If the cascade tears down and rebuilds the form the user is still typing in, the unsaved input value is lost (and worse, a phantom `change` event on a teardown-replaced input can write a browser-default value into the store — see OI-0115 in CLAUDE.md "Known Traps"). The snapshot is the source of truth for what the form should re-render against during the staged window; the live store is only authoritative once the final confirm commits.

**Three primitives:**

- `takeSnapshot(scope)` — captures the slice of state the flow can touch. `scope` is a list of entity types (e.g. `['eventPaddockWindows', 'eventGroupWindows', 'events']`). Returns an opaque snapshot object held by the flow controller for the duration of the flow.
- `stagedRead(snapshot, entityType, predicate?)` — reads the slice as the flow has it staged. Reads from the snapshot first, falls through to the live store for entity types not in the snapshot scope. Form rendering and validation use this — never the live `store.getAll(...)`.
- `commit(snapshot, mutations)` — applies a list of staged mutations atomically through the store's normal validate → mutate → persist → queue sync → notify path. If any single mutation fails validation, the whole transaction aborts and the snapshot is preserved for the flow to surface the error and let the user retry. If every mutation passes, the snapshot is discarded and subscribers fire exactly once.
- (Cancel is implicit — discarding the snapshot is the rollback. No write goes through the store, nothing to roll back from.)

**Gap/overlap resolver re-snaps.** The shared gap/overlap resolution dialog (V2_UX_FLOWS.md §17.15.1) is itself a multi-step flow: detect → user picks resolution option → preview → confirm. When the user picks an option the resolver opens a fresh snapshot scoped to the entities the resolution will touch, stages the writes for that option, and commits or discards on confirm/cancel. A nested flow (gap resolution inside group-window edit) runs on its own snapshot — when the inner flow commits, the outer flow's snapshot needs to be *re-snapped* before continuing, because the inner commit moved live state forward. The helper exposes `reSnap(snapshot)` for this case; the outer flow calls it after any nested commit so its staged-vs-live diff stays accurate.

**Atomic two-write transactions** (retro-place's "place group X on event N from gap_start to gap_end" + "commit source event's edited date_joined", or Move Feed Out's "feed check on source + removal on source + delivery on destination + batch inventory bump") are commit-time fan-outs of the same pattern: the snapshot stages all writes, the final confirm passes them as a single mutation list to `commit`, and either every write lands or none do.

**Grep contract.** Multi-step edit flow modules (`src/features/events/edit-paddock-window.js`, `edit-group-window.js`, `event-reopen.js`, `retro-place.js`, `move-feed-out.js`) must import from `src/data/snapshot.js` and route reads through `stagedRead(snapshot, ...)` rather than `store.getAll(...)` while a snapshot is active. Direct `store.add` / `store.update` / `store.remove` calls inside a multi-step flow before the final confirm are a pre-commit failure — the staged write must go through the snapshot.

**Origin:** OI-0081 (filed 2026-04-15 during the SP-10 walk-through; ratified 2026-04-17). Ships with V2_UX_FLOWS.md §17.15.1 "Event Data Editing" (added in Session B, 2026-05-03) — that section is the user-facing description; this subsection is the architectural pattern the section relies on.

### 4.6 Derive on Read, Don't Store

A value that can be reconstructed from child rows or sibling state at render time **must not** also be stored on a parent or peer. Two stored locations for the same fact silently drift the moment one update path forgets the other, and the drift is invisible until a downstream calc gives the wrong number or a cross-farm move quietly puts a group in the wrong place.

This was already an architecture rule (§1.4 "Compute on Read"), but the rule there is scoped to *derived calculations* (DMI, NPK, cost). This subsection generalizes it to *any structural fact* — group placement, event start, live remaining feed, sync indicator state — that has a single source of truth lower in the data tree.

**Four current applications:**

- **`getEventStart(eventId)` / `getEventStartDate(eventId)` (`src/features/events/event-start.js`).** An event's start datetime was stored on `events.date_in` / `events.time_in` and *also* derivable from the earliest child window (`event_paddock_windows.date_opened` / `event_group_windows.date_joined`). The two drifted: a sub-move Save fired a phantom change event on a teardown-replaced input which overwrote the parent `date_in`, while every downstream calc still read the stored copy. Migration 028 dropped both columns; reads now route through these helpers, and the hero-line edit writes through to the earliest child window via `setEventStart()`. (OI-0117, 2026-04-18.)
- **`getGroupCurrentFarm(groupId)` (`src/data/store.js`).** A group's current farm was duplicated on `groups.farm_id` and *also* derivable from the open `event_group_window → event.farm_id`. Every cross-farm move that forgot to sync the parent silently desynced — the group rendered on the wrong farm's dashboard while its current event lived on the right farm. Migration 032 dropped `groups.farm_id`; reads use this helper. (OI-0133, 2026-04-22.)
- **`getLiveRemainingForMove(eventId)` (`src/calcs/feed-state.js`).** Live remaining feed per (batchId, locationId) is a pure read-time derivation — `latestCheck.remainingQuantity + Σ deliveries with (date, time) strictly > latestCheck (date, time)`, falling back to `Σ all deliveries` when no prior check exists. The strict-`>` rule is load-bearing (a same-instant delivery is captured *by* the check, not in addition to it). Three current consumers — feed-check sheet, move-wizard Step 3, and sub-move close hint — must all import the helper rather than re-deriving the formula. See V2_CALCULATION_SPEC.md §4.6 for the full design statement. (OI-0139, 2026-04-30.)
- **Sync indicator state (`src/data/pull-remote.js` + `src/ui/header.js`).** Sync state is *both* push-queue empty AND last-pull-recent. Storing a single "is in sync" boolean fails because an empty queue with a 6-hour-old pull is amber, not green. The dot/strip render derives state on every read from `adapter.getSyncHealth()` (`{ status, queueLength, deadLetterCount }`; a non-empty dead-letter queue forces `failed`, OI-0184) and `getLastPulledAt()` against the 15-min stale threshold (`STALE_THRESHOLD_MS`, `src/ui/header.js:18`) — see V2_INFRASTRUCTURE.md §9. (OI-0141, 2026-05-01; OI-0184, 2026-06-23.)

**The architectural choice it forces.** When designing a new flow that handles a fact already stored elsewhere — head count, location, farm assignment, any "current X" — the default is to derive on read. Storing a copy on a parent is a deliberate exception that requires (a) a measurable performance reason the derivation can't satisfy, and (b) an explicit invariant write at every mutation site that touches the underlying source. Without both, the copy will drift, and the drift will be invisible.

**Grep contract.** The four canonical helpers above are the only authorized reads of those facts in feature code. Every alternative read (`event.dateIn`, `group.farmId`, ad-hoc per-line live-remaining math, "is the queue empty?" boolean checks) is a pre-commit failure with the contract lines listed in CLAUDE.md "Architecture Audit — Before Every Commit." This subsection is the design-level statement of why those grep contracts exist; the contracts are the implementation invariant.

**Origin:** OI-0117 + OI-0133 + OI-0139 + OI-0141, lifted out of CLAUDE.md grep-contract sections so the doctrine has a single canonical home in the architecture spec. Future "do we need a stored column for X?" decisions read this subsection first.

---

## 5. Sync Layer — Pluggable SyncAdapter

### 5.1 Interface

```js
// src/data/sync-adapter.js
export class SyncAdapter {
  async push(table, record, operation) { throw new Error('Not implemented'); } // 'insert' | 'update' | 'upsert' (default)
  async pushBatch(table, records) { throw new Error('Not implemented'); }
  async pull(table, since) { throw new Error('Not implemented'); }
  async pullAll(table) { throw new Error('Not implemented'); }
  async delete(table, id) { throw new Error('Not implemented'); }
  async isOnline() { throw new Error('Not implemented'); }
  getStatus() { throw new Error('Not implemented'); }     // transient flag: 'idle' | 'syncing' | 'error' | 'offline'
  onStatusChange(callback) { throw new Error('Not implemented'); }
}
```

`CustomSync` (`src/data/custom-sync.js`) also exposes `flush()`, `getQueuedItems()`, `getQueueLength()`, `getDeadLetters()`, `retryDeadLetters()` and `getSyncHealth()`. **UI reads `getSyncHealth()`** (`{ status: 'idle'|'syncing'|'offline'|'error'|'failed', queueLength, deadLetterCount }`), never `getStatus()` alone: `status` is forced to `failed` while any dead letter exists and to `syncing` while the queue is non-empty (OI-0184).

### 5.2 Custom Sync Implementation

As built on main `b4cb9335` unless marked **OI-0230 PR 1 (intended)**.

- **Queue.** `_sync_queue` (localStorage) holds offline writes and durable writes (§4.2). It is flushed on boot, on `online`, when the tab becomes visible (`src/main.js:398-416`), on a red-indicator tap (`src/ui/header.js:352-354`) and by the assistant after its local apply. Online non-durable writes are sent straight from memory and never enter the queue (OI-0230 F2). Online deletes are not queued either.
  - **OI-0230 PR 1 (intended):** every write, online or offline, durable or not, including deletes, is enqueued first and then flushed promptly; an entry leaves the queue only when its send is confirmed, it is dead-lettered, or it is superseded; nothing enqueued during a flush is lost.
- **Retries.** Each send gets up to 5 attempts with 1 s, 2 s, 4 s, 8 s backoff between them; every request has a 15 s timeout (`SYNC_REQUEST_TIMEOUT_MS`) that counts as a failure.
- **Dead letters (OI-0184).** After the 5th failure the write moves to `_dead_letter_queue` with table, record, error, retry count, timestamps and its write order (`origin_at`). Each `flush()` auto-drains every letter once, up to 3 times per letter (`MAX_AUTO_DRAIN`), replayed as an upsert. After that only a tap on the red "Sync failed · N pending" indicator retries: `retryDeadLetters()` re-queues the newest letter per row, then `flush()`. Logout warns only when the queue (not the dead letters) is non-empty. A delete that fails 5 times in a flush is dropped (OI-0230 F7, slice G).
- **Per-row ordering (OI-0226 PR B, #78, 2026-11-17).** Every write to a row (table + id) goes through that row's gate: it waits for the previous write to the same row to settle, so versions reach the server in the order they were made; nothing is coalesced, and different rows still go in parallel. A payload older than the newest version already sent for the row (by `updated_at`, else by write order) is dropped; an online delete leaves an in-memory tombstone so an older save can't bring the row back. A success prunes that row's older queued saves and older dead letters. The four tables with no `updated_at` (`event_feed_check_items`, `batch_moves`, `batch_adjustments`, `todo_assignments`) are ordered by a shared monotonic write-order clock (`src/data/write-order.js`: `max(now, last + 1)`, seeded from the persisted queue and dead letters). These guards are per tab and in memory. An `update` whose create is still queued or dead-lettered is sent as an upsert (`_effectiveOp`).
- **Conflicts: what is and isn't guaranteed.** Last-write-wins by `updated_at` applies **only on pull**: `mergeRemote` replaces a local row when the remote `updated_at` is the same or later (`store.js:596-625`, `:612`), adds new rows, and never removes rows deleted on the server. **On push there is no cross-device check:** updates send the whole row, the server has no stale-write guard, and the last request to arrive wins whatever its stamp. A device with a stale copy can overwrite newer data. There is **no "no data loss" guarantee across devices** until OI-0226 PR C (server stale-write refusal; a DB change that needs Tim's yes plus a backup) and OI-0230 slice E (changed-fields-only updates).
- **Updates that match 0 rows.** As built, `.update(record).eq('id', id)` with no error counts as success even when RLS hid the row (no session) or the row doesn't exist (OI-0230 F3).
  - **OI-0230 PR 1 (intended):** check for a valid session before sending; no session or an expired JWT keeps the write queued (never dead-lettered for auth); an update that changes 0 rows with a valid session is dead-lettered at once with a `zero_rows` reason and is never marked sent; a 0-row letter replays only as an `update`, never as an upsert.
- **Pull errors.** As built, `pullAll` returns `[]` on an error, so the pull still stamps `gtho_last_pulled_at` and the header can show green; pulls are not paginated (1,000-row cap). OI-0230 slice C fixes both (later PR).

**Write method by operation type:**

| Store action | Sync method | Why |
|---|---|---|
| `add()` — new record | `.insert()` | New records must use INSERT so only the INSERT RLS policy is evaluated. Using `.upsert()` triggers INSERT + UPDATE policy checks, which fails during onboarding because UPDATE policies check `operation_members` (which may not exist yet). |
| `update()` — existing record | `.update().eq('id', id)` | Existing records already passed INSERT; only UPDATE policy needed. |
| `remove()` — delete | `.delete().eq('id', id)` | Already correct. |
| Durable-write queue entry (create) | `.upsert(record, { onConflict: 'id' })` | `commitDurableWrite` queues creates as upserts so a replay after a crash can't fail on a duplicate id. |
| Dead-letter replay (auto-drain and manual retry) | `.upsert(record, { onConflict: 'id' })` | OI-0184. **OI-0230 PR 1 (intended):** a `zero_rows` letter replays only as `.update()`, so it can't recreate a row deleted elsewhere. |
| "Resync to server" (Settings) | As built: `.upsert()` of **every** local record (`pushAllToSupabase`, `src/data/push-all.js:99-128`) | See "Resync to server" below. |

**"Resync to server".** Added 2026-04-14 (`2daa3e75`, OI-0050) as a one-time onboarding recovery for records created before sync worked. As built it walks every local record and upserts it as a full row with its local `updated_at`, sends without awaiting, then flushes; it reads nothing from the server, has no confirm step (`src/features/settings/index.js:405-419`), reports "Synced {count} records" whatever happened, and does **not** call `retryDeadLetters()` (the comment at `custom-sync.js:692-697` saying otherwise is wrong; Build fixes it in OI-0230 PR 1). On 2026-06-23 a stale tab's Resync reverted about 980 prod rows to a mid-May copy (OI-0230).
- **OI-0230 PR 1 (intended; Tim 2026-11-18 1:00 and 1:10 PM ET):** the full-store push is removed. The button sends **only this device's unconfirmed work** — the pending queue, the dead letters, and rows changed locally since their last confirmed server ack (a new persisted per-row marker) — and each item only if it is **strictly newer than the server copy** (`updated_at`). On the four tables with no `updated_at`, an item is sent only as a create of a row missing on the server, never as an overwrite. A row is never resent just because it is missing on the server; an update for a missing row is never turned into a create. A **confirm sheet** shows the counts (to send, skipped as same or newer on the server, deleted or unreachable, not comparable) before anything is sent, and the result is **awaited** and reported as sent / skipped / failed; failures go to the dead letters with a reason. These client checks are **not airtight** (stale tabs, clock skew, the read-to-write gap); the backstop is OI-0226 PR C's server stale-write guard. Brief: `session_briefs/SYNC_DURABILITY_2026-11-18.md` §4 D.

**Origin:** OI-0054 — discovered during Tier 3 testing. The sync adapter used `.upsert()` for all writes. During onboarding, every table's INSERT was rejected because Supabase evaluated both INSERT and UPDATE policies, and the UPDATE policy's `operation_members` check failed (the member row didn't exist yet). 24 records dead-lettered on every onboarding attempt.

### 5.3 Future PowerSync Swap

PowerSync implements the same SyncAdapter interface. When costs justify it:
1. Create `src/data/powersync-sync.js` implementing SyncAdapter
2. Change the import in store.js
3. Configure bucket rules to match current RLS policies

One file swap. No feature code changes.

### 5.4 Sync Tests (as built)

The original 14-scenario plan (clean write, offline replay, rapid writes, mid-flush disconnect, two-device edit, delete vs update, 500-record payload, token expiry, schema mismatch, duplicate push, empty pull, pull with deletes, dead letter, "Push All") was never built as one suite, and several of its pass criteria (last-write-wins with no data loss, token refresh with no data loss, pull removes deleted rows, "Push All" retries dead letters) do not hold for the code (§5.2). Sync coverage on main `b4cb9335` (Vitest, `tests/unit/`):

| File | Covers |
|---|---|
| `sync-adapter.test.js` | Base `SyncAdapter` methods throw until implemented |
| `sync-row-ordering.test.js` | OI-0226 PR B (#78): per-row chain, every version sent in order, newest-sent guard, dead letters through the chain, deletes in the chain, 15 s request timeout, gate bookkeeping, pruning on success, write-order fallback and clock, `operations` schema stamp on replay |
| `sync-dead-letter.test.js` | OI-0184: `getSyncHealth`, auto-drain on flush, `retryDeadLetters` manual recovery, `getQueueLength` |
| `sync-indicator.test.js` | Header indicator states (fresh, stale, non-idle pass-through) |
| `pull-remote.test.js`, `pull-remote-timestamp.test.js` | Pull in-flight dedupe, batched merge, last-pulled stamp |
| `assistant/durable-write.test.js`, `assistant/durable-sync.test.js` | Durable-write journal, receipts and recovery; a flush doesn't erase newly journalled commands |
| `unit-reference-flows.test.js` | `pushAllToSupabase` unit-table filters |

**Not covered today:** a reload or tab close mid-send, two-device conflicts, an expired session, 0-row updates, pull errors and pagination, and pulls after a server delete. **OI-0230 PR 1 (intended)** adds the A / B / D acceptance tests in `session_briefs/SYNC_DURABILITY_2026-11-18.md` §5 (reload mid-save, expired JWT, RLS 0-row, two-device cases, Resync with mixed unconfirmed items); slice C, E and the planned end-to-end save harness cover the rest.

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
| 2026-11-18 | GTHO Design — OI-0230 / OI-0231 sync chapters | §4.2 durable writes (`866ada7`) and the unawaited, in-memory online push; §4.6 indicator reads `getSyncHealth()`; §5.1 real adapter signature plus `CustomSync` extras; §5.2 rewritten to the code on `b4cb9335` (queue, retries, OI-0184 dead letters, #78 per-row ordering, LWW on pull only, 0-row updates, pull errors, Resync history) with OI-0230 PR 1 marked intended; §5.4 14-scenario plan replaced by the tests that exist. |
| 2026-04-14 | Tier 3 migration testing — OI-0054 | §5.2: Added write-method-by-operation-type table (insert/update/upsert distinction). Documented OI-0054 origin (upsert bootstrap failure during onboarding). |
| 2026-04-14 | Tier 3 migration testing — OI-0055 | New §5.5: Backup/Import/Export architecture covering CP-55/CP-56/CP-57. Documents FK_ORDER, TWO_PASS_TABLES, REFERENCE_TABLES, uniform operation_id delete/parity pattern, and the 10-step import flow. |
| 2026-04-18 | OI-0091 event window split | New §4.4: Window-Split on State Change pattern. `event_group_window` is a period of stable state; state changes (cull/move/wean/event-close) close the current window with live values stamped and open a new window. Render and calc paths read through `getLiveWindowHeadCount` / `getLiveWindowAvgWeight` helpers — open windows recompute live, closed windows use stored snapshots. Ships with OI-0073 orphan cleanup (migration 025) as a coordinated P0 package. |
| 2026-04-18 | OI-0094 state-change entry point completeness | §4.4 expanded with the authoritative 13-entry-point table. Ten additional flows now route through `splitGroupWindow` / `closeGroupWindow` (Edit Group checkboxes, Edit Animal group change, Group Weights, Split Group, calving, §7 Add, §7 Remove, §7 per-row Edit view-only-on-open, Delete window confirm, Event reopen summary). `classifyGwsForReopen` added to reopen-event for keep-closed-vs-reopen partitioning. Ships with OI-0093 (Animals bulk action bar removal) which eliminates one of the originally-eleven entry points. |
| 2026-04-18 | OI-0095 paddock-window split architecture | New §4.4b: paddock-side analog of the group-window split. Adds `splitPaddockWindow` + `closePaddockWindow` store helpers and `getOpenPwForLocation` calc helper. Every paddock-window state-change entry point routes through the helpers (Advance Strip, edit-paddock-window on open, move-wizard close loop, event-close close loop). `classifyPwsForReopen` added alongside `classifyGwsForReopen` so the reopen summary dialog classifies both sides. Hardcoded `areaPct: 100` literals in dashboard + locations replaced with `getOpenPwForLocation(...)?.areaPct ?? 100`. One-time app-side orphan cleanup (`src/data/one-time-fixes.js`) runs once per device via localStorage flag — no schema change, no CP-55/CP-56 impact. |
| 2026-04-18 | OI-0106 base-doc reconciliation | New §3.1: Entity Contract. Documents the five required entity exports and, critically, the `fromSupabaseShape` numeric-coercion responsibility — PostgREST returns `numeric`/`decimal` columns as JavaScript strings, which caused silent math corruption, `.toFixed()` TypeErrors, and silent-reject validation bugs. Fix pattern `row.col != null ? Number(row.col) : null` is now mandated at the design-doc level, not only in CLAUDE.md. Reference entity: `event-observation.js`. Pairs with V2_INFRASTRUCTURE.md §6.1 test pattern update. |
| 2026-05-04 | Reconciliation Session C — architecture catch-up (RECONCILIATION_PLAN_2026-05-03 ARCH-1, ARCH-2) | Two new subsections lift project-wide patterns out of UI_SPRINT_SPEC.md and CLAUDE.md grep contracts into the architecture doc as design-level statements. **NEW §4.5 Snapshot / Rollback Pattern (ARCH-1):** documents the SP-10 Phase 1 helper (`src/data/snapshot.js`) — `takeSnapshot` / `stagedRead` / `commit` / `reSnap` primitives, why it exists (cancel-after-partial-commit and re-render cascade clobbering staged edits, both surfaced during the SP-10 walk-through and OI-0115 phantom-change incident), gap/overlap resolver re-snap behavior for nested flows, atomic two-write transactions (retro-place, Move Feed Out) as commit-time fan-outs of the same pattern, and the grep contract barring direct `store.add/update/remove` in multi-step edit flows before final confirm. Cross-references V2_UX_FLOWS.md §17.15.1 (the user-facing surface). Origin: OI-0081, ratified 2026-04-17. **NEW §4.6 Derive on Read, Don't Store (ARCH-2):** generalizes §1.4 "Compute on Read" from derived calcs (DMI/NPK/cost) to any structural fact with a single source of truth lower in the data tree. Documents the four current applications — `getEventStart()` (OI-0117, migration 028 dropped `events.date_in/time_in`), `getGroupCurrentFarm()` (OI-0133, migration 032 dropped `groups.farm_id`), `getLiveRemainingForMove()` (OI-0139, the per-(batchId, locationId) helper canonicalized in V2_CALCULATION_SPEC.md §4.6 in this session), and the honest sync indicator state (OI-0141, V2_INFRASTRUCTURE.md §9 in this session). States the architectural rule that "storing a copy on a parent is a deliberate exception requiring (a) a measurable perf reason and (b) explicit invariant writes at every mutation site," and points the grep contracts in CLAUDE.md as the implementation invariant for the rule documented here. No code changes — documentation catch-up only. Owner: Cowork. |

---

*End of document. This spec defines how v2 code is structured and how patterns are applied. For data schemas see V2_SCHEMA_DESIGN.md. For formulas see V2_CALCULATION_SPEC.md. For UX flows see V2_UX_FLOWS.md.*
