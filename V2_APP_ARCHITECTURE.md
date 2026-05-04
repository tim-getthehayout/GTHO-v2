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
- **Sync indicator state (`src/data/pull-remote.js` + `src/ui/header.js`).** Sync state is *both* push-queue empty AND last-pull-recent. Storing a single "is in sync" boolean fails because an empty queue with a 6-hour-old pull is amber, not green. The dot/strip render derives state on every read from `adapter.getStatus().pendingCount` and `getLastPulledAt()` against the 15-min stale threshold — see V2_INFRASTRUCTURE.md §9. (OI-0141, 2026-05-01.)

**The architectural choice it forces.** When designing a new flow that handles a fact already stored elsewhere — head count, location, farm assignment, any "current X" — the default is to derive on read. Storing a copy on a parent is a deliberate exception that requires (a) a measurable performance reason the derivation can't satisfy, and (b) an explicit invariant write at every mutation site that touches the underlying source. Without both, the copy will drift, and the drift will be invisible.

**Grep contract.** The four canonical helpers above are the only authorized reads of those facts in feature code. Every alternative read (`event.dateIn`, `group.farmId`, ad-hoc per-line live-remaining math, "is the queue empty?" boolean checks) is a pre-commit failure with the contract lines listed in CLAUDE.md "Architecture Audit — Before Every Commit." This subsection is the design-level statement of why those grep contracts exist; the contracts are the implementation invariant.

**Origin:** OI-0117 + OI-0133 + OI-0139 + OI-0141, lifted out of CLAUDE.md grep-contract sections so the doctrine has a single canonical home in the architecture spec. Future "do we need a stored column for X?" decisions read this subsection first.

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
| 2026-04-18 | OI-0094 state-change entry point completeness | §4.4 expanded with the authoritative 13-entry-point table. Ten additional flows now route through `splitGroupWindow` / `closeGroupWindow` (Edit Group checkboxes, Edit Animal group change, Group Weights, Split Group, calving, §7 Add, §7 Remove, §7 per-row Edit view-only-on-open, Delete window confirm, Event reopen summary). `classifyGwsForReopen` added to reopen-event for keep-closed-vs-reopen partitioning. Ships with OI-0093 (Animals bulk action bar removal) which eliminates one of the originally-eleven entry points. |
| 2026-04-18 | OI-0095 paddock-window split architecture | New §4.4b: paddock-side analog of the group-window split. Adds `splitPaddockWindow` + `closePaddockWindow` store helpers and `getOpenPwForLocation` calc helper. Every paddock-window state-change entry point routes through the helpers (Advance Strip, edit-paddock-window on open, move-wizard close loop, event-close close loop). `classifyPwsForReopen` added alongside `classifyGwsForReopen` so the reopen summary dialog classifies both sides. Hardcoded `areaPct: 100` literals in dashboard + locations replaced with `getOpenPwForLocation(...)?.areaPct ?? 100`. One-time app-side orphan cleanup (`src/data/one-time-fixes.js`) runs once per device via localStorage flag — no schema change, no CP-55/CP-56 impact. |
| 2026-04-18 | OI-0106 base-doc reconciliation | New §3.1: Entity Contract. Documents the five required entity exports and, critically, the `fromSupabaseShape` numeric-coercion responsibility — PostgREST returns `numeric`/`decimal` columns as JavaScript strings, which caused silent math corruption, `.toFixed()` TypeErrors, and silent-reject validation bugs. Fix pattern `row.col != null ? Number(row.col) : null` is now mandated at the design-doc level, not only in CLAUDE.md. Reference entity: `event-observation.js`. Pairs with V2_INFRASTRUCTURE.md §6.1 test pattern update. |
| 2026-05-04 | Reconciliation Session C — architecture catch-up (RECONCILIATION_PLAN_2026-05-03 ARCH-1, ARCH-2) | Two new subsections lift project-wide patterns out of UI_SPRINT_SPEC.md and CLAUDE.md grep contracts into the architecture doc as design-level statements. **NEW §4.5 Snapshot / Rollback Pattern (ARCH-1):** documents the SP-10 Phase 1 helper (`src/data/snapshot.js`) — `takeSnapshot` / `stagedRead` / `commit` / `reSnap` primitives, why it exists (cancel-after-partial-commit and re-render cascade clobbering staged edits, both surfaced during the SP-10 walk-through and OI-0115 phantom-change incident), gap/overlap resolver re-snap behavior for nested flows, atomic two-write transactions (retro-place, Move Feed Out) as commit-time fan-outs of the same pattern, and the grep contract barring direct `store.add/update/remove` in multi-step edit flows before final confirm. Cross-references V2_UX_FLOWS.md §17.15.1 (the user-facing surface). Origin: OI-0081, ratified 2026-04-17. **NEW §4.6 Derive on Read, Don't Store (ARCH-2):** generalizes §1.4 "Compute on Read" from derived calcs (DMI/NPK/cost) to any structural fact with a single source of truth lower in the data tree. Documents the four current applications — `getEventStart()` (OI-0117, migration 028 dropped `events.date_in/time_in`), `getGroupCurrentFarm()` (OI-0133, migration 032 dropped `groups.farm_id`), `getLiveRemainingForMove()` (OI-0139, the per-(batchId, locationId) helper canonicalized in V2_CALCULATION_SPEC.md §4.6 in this session), and the honest sync indicator state (OI-0141, V2_INFRASTRUCTURE.md §9 in this session). States the architectural rule that "storing a copy on a parent is a deliberate exception requiring (a) a measurable perf reason and (b) explicit invariant writes at every mutation site," and points the grep contracts in CLAUDE.md as the implementation invariant for the rule documented here. No code changes — documentation catch-up only. Owner: Cowork. |

---

*End of document. This spec defines how v2 code is structured and how patterns are applied. For data schemas see V2_SCHEMA_DESIGN.md. For formulas see V2_CALCULATION_SPEC.md. For UX flows see V2_UX_FLOWS.md.*
