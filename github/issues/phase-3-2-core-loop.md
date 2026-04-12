# Phase 3.2 — Core Loop

> **Note:** The authoritative build spec is in V2_BUILD_INDEX.md. This file contains the detailed checkpoint breakdown for Claude Code.

## Summary

Build the first usable screens on top of the Phase 3.1 scaffold. When done, a user can log in, set up their operation and farm, create locations and animal groups, create and manage grazing events (including sub-moves, group changes, and the full move wizard), view the dashboard, and have data sync to Supabase with offline support. No feed, surveys, amendments, health, reports, or calculations yet — those are Phase 3.3+.

## Prerequisites

- Phase 3.1 complete (all 10 checkpoints, 50 entities, store, router, UI framework)
- v2 Supabase project created with D1–D5 migrations applied (Tim runs the SQL)
- `.env` file configured with Supabase URL + anon key

## Build Order

Checkpoints must be completed in sequence. Commit after each one.

### CP-11: Auth Flow

Login, signup, and session management. This gates everything — no other screen is reachable without auth.

**Create:**
- `src/features/auth/index.js` — Auth screen: login form, signup form, toggle between them
- `src/features/auth/session.js` — Session management: init from Supabase session, token refresh, logout
- Auth overlay per V2_DESIGN_SYSTEM.md §3.5 (z-index 500, centered card with shadow-lg)

**Wire:**
- `src/main.js` boot sequence: check session → if no session, show auth overlay → on login success, init store, load data, show app
- Supabase client (`src/data/supabase-client.js`) initialized with env vars
- `store.init()` loads from localStorage after auth succeeds

**Spec source:** V2_INFRASTRUCTURE.md §5 (auth, RLS). V2_APP_ARCHITECTURE.md §6.3 (auth loads before main app). V2_DESIGN_SYSTEM.md §4.7 (auth overlay styling).

- [ ] Login with email/password works against Supabase Auth
- [ ] Signup creates account and logs in
- [ ] Session persists across page reloads (token in localStorage)
- [ ] Logout clears session and shows auth overlay
- [ ] Unauthenticated users cannot reach app screens

---

### CP-12: Onboarding Wizard

First-run setup: create operation, first farm, select species, seed animal classes. Shown after auth if no operation exists for this user.

**Create:**
- `src/features/onboarding/index.js` — Multi-step wizard using wizard pattern (V2_DESIGN_SYSTEM.md §3.12)
  - Step 1: Operation name, timezone picker
  - Step 2: First farm name (required), area (optional)
  - Step 3: Species selection (beef cattle, dairy cattle, sheep, goat — multi-select)
  - Step 4: Review and confirm

**On save:**
1. Create `operation` record
2. Create `farm` record (linked to operation)
3. Create `farm_settings` record (linked to farm, all defaults from V2_SCHEMA_DESIGN.md §1.3)
4. Create `operation_member` record (current user, role='owner')
5. Create `user_preferences` record (defaults)
6. Seed `animal_classes` rows based on species selection — system-defined roles per species per A27. Use NRCS industry standard values for dmi_pct, excretion rates, weaning_age_days per A39.
7. Seed default `treatment_categories` per A31
8. Seed default `input_product_categories` per A35
9. Seed default `forage_types` (common forage types for selected species region)
10. Seed default `dose_units` (common veterinary units)

**Design note:** The onboarding UX flow is not detailed in V2_UX_FLOWS.md. The wizard steps above are the minimum needed to bootstrap the data model. If any step needs richer UI (e.g., per-class configuration of rates at onboarding), flag it as `DESIGN REQUIRED` and use the defaults. The goal is a working app, not a polished onboarding experience — that can be refined later.

**Spec source:** V2_SCHEMA_DESIGN.md D1 (§1.1–§1.5) for record shapes. A19 (no herd_type, species from classes). A27 (class roles per species). A39 (2-tier config, NRCS seeding). V2_APP_ARCHITECTURE.md §3 (features/onboarding/).

- [ ] Wizard completes and creates all required records
- [ ] Animal classes seeded with correct species roles and NRCS default rates
- [ ] App navigates to dashboard after onboarding completes
- [ ] Returning user with existing operation skips onboarding

---

### CP-13: Settings Screen (Basic)

Farm configuration and user preferences. Needed before other screens because unit display depends on `user_preferences.unit_system`.

**Create:**
- `src/features/settings/index.js` — `renderSettingsScreen()` with card sections:
  - **Farm Settings:** unit system toggle (metric/imperial), NPK prices (N, P, K per kg), AU reference weight, default recovery days (min/max), default residual height, default utilization %, feed day goal, forage quality scale min/max
  - **User Preferences:** view mode (standard/field), field mode behavior
  - **Account:** display name, email (read-only), logout button
  - **Sync Status:** connection indicator, last sync time, queue count (read-only diagnostic display from sync adapter)

**Wire:**
- `units.js` `display()` function reads unit_system from store's user preferences
- Settings save updates `farm_settings` and `user_preferences` via store actions

**Spec source:** V2_SCHEMA_DESIGN.md §1.3 (farm_settings columns), §1.5 (user_preferences columns). V2_DESIGN_SYSTEM.md §4.7 (settings card layout). V2_INFRASTRUCTURE.md §1 (unit system).

- [ ] Unit system toggle switches between metric and imperial display app-wide
- [ ] Farm settings save and persist to store + Supabase
- [ ] User preferences save and persist
- [ ] Sync status displays current adapter state
- [ ] Logout works from settings

---

### CP-14: Locations Screen

CRUD for paddocks, confinements, and other locations. This is the "Fields" screen in the nav.

**Create:**
- `src/features/locations/index.js` — `renderLocationsScreen()`:
  - Filter pills: All, Pasture, Mixed-Use, Crop, Confinement (per V2_DESIGN_SYSTEM.md §3.7)
  - Location card list: name, type badge, area display (in user's unit), land_use badge
  - Each card: Edit, Archive actions
  - "Add location" FAB or button
- `src/features/locations/location-sheet.js` — Add/edit location sheet:
  - Name, type toggle (confinement/land), land_use picker (pasture/mixed_use/crop — only for type='land'), area input, forage_type picker, capture_percent (confinement only), notes
  - Forage type picker shows existing types with "Manage" link
- `src/features/locations/forage-type-sheet.js` — Manage forage types sheet:
  - List of forage types with edit/archive
  - Add new: name, utilization_pct, dm_kg_per_cm_per_ha, min_residual_height_cm, recovery_days_min/max

**Spec source:** V2_SCHEMA_DESIGN.md D2 (§2.1 locations, §2.2 forage_types). V2_UX_FLOWS.md §8.1 (amendment mentions location picker). V2_DESIGN_SYSTEM.md §4.4 (Fields screen layout). A3 (locations replace pastures). A15 (per-forage-type utilization). A17 (3-tier config).

- [ ] Location CRUD works (create, read, update, archive)
- [ ] Filter pills filter by type/land_use
- [ ] Forage type CRUD works
- [ ] Area displays in user's preferred unit (hectares or acres)
- [ ] Confinement locations show capture_percent field
- [ ] `data-testid` attributes on all interactive elements and list containers

---

### CP-15: Animals Screen — Groups & Classes

Group management and animal class configuration. Groups are the primary unit farmers work with daily.

**Create:**
- `src/features/animals/index.js` — `renderAnimalsScreen()`:
  - Group filter pills (All + one per group, with color dots)
  - Config buttons row: Classes, Treatments (placeholder), AI Sires (placeholder)
  - Groups section with "+ Add group" button
  - Group cards: name, head count, active/paddock badge, action buttons (Edit, Archive)
- `src/features/animals/group-sheet.js` — Add/edit group sheet:
  - Name, color picker, notes
- `src/features/animals/class-sheet.js` — Manage animal classes sheet:
  - List of classes: name, species, role, dmi_pct, excretion rates
  - Edit class: name (user-defined), species (read-only after creation), role (system-defined, read-only), dmi_pct, dmi_pct_lactating, excretion_n_rate, excretion_p_rate, excretion_k_rate, weaning_age_days

**Spec source:** V2_SCHEMA_DESIGN.md D3 (§3.1 animal_classes, §3.3 groups). A14 (per-class rates). A27 (class roles drive action gating). A30 (groups are farm-scoped). V2_DESIGN_SYSTEM.md §4.2 (Animals screen layout).

- [ ] Group CRUD works
- [ ] Animal class editing works (rates, names)
- [ ] Group filter pills filter the display
- [ ] Head count on group card reflects actual animal count (0 initially, grows as animals are added in CP-16)
- [ ] `data-testid` attributes on all interactive elements

---

### CP-16: Animals Screen — Individual Animals

Animal table with CRUD and group assignment.

**Extend:**
- `src/features/animals/index.js` — Add below groups section:
  - Search bar (filter by tag, name)
  - Animal table: columns for Tag/ID, Name (optional), Class, Group, Weight (last recorded)
  - Per-animal action row: Edit, Archive
  - Sortable by any column
- `src/features/animals/animal-sheet.js` — Add/edit animal sheet:
  - Tag (visual_id), name (optional), class picker (filtered by farm's species), group picker, sex, birth_date, weight_kg, notes
  - Class picker shows role badge next to each class name
  - Group picker scoped to current farm (A30)

**Wire:**
- `animal_group_memberships` — when group is assigned, create membership record with `date_joined = today`
- Moving animal between groups: close current membership (date_left = today), open new one

**Spec source:** V2_SCHEMA_DESIGN.md D3 (§3.2 animals, §3.4 animal_group_memberships). A28 (sire linkage — display only, breeding records are Phase 3.3). A29 (confirmed bred is derived). V2_DESIGN_SYSTEM.md §4.2 (animal table layout).

- [ ] Animal CRUD works (create, edit, archive)
- [ ] Group assignment creates/closes membership records
- [ ] Search filters animal table
- [ ] Column sorting works
- [ ] Animal count on group card updates when animals are assigned
- [ ] `data-testid` attributes on table rows and interactive elements

---

### CP-17: Events — Create & List

Event creation and the events log screen. Basic event card display (full interactivity in CP-18–20).

**Create:**
- `src/features/events/index.js` — `renderEventsScreen()`:
  - Tab strip: Event Log | Rotation Calendar (calendar is placeholder — built in Phase 3.4)
  - Event log: chronological list of events
  - Each event row: location name(s), group name(s), date range, day count (derived), status badge (active/closed)
  - "New event" FAB or button
- `src/features/events/create-event-sheet.js` — New event sheet:
  - Location picker (same sections as Move Wizard Step 2a — Ready, Recovering, In Use, Confinement)
  - Group picker (multi-select — one or more groups)
  - Date in, time in (optional)
  - Pre-graze height, forage cover %
  - Head count and avg weight auto-filled from group data
- `src/features/events/event-card.js` — Event card sheet (V2_UX_FLOWS.md §11):
  - Header: location names, start date, day count, status badge
  - Paddock section: list of paddock windows with status
  - Group section: list of group windows with snapshots
  - Action buttons (wired in CP-18–20): Sub-move, Add group, Move, Close event — rendered but disabled until their checkpoint

**On save (new event):**
1. Create `event` record (operation_id, farm_id, date_in)
2. Create `event_paddock_window` (event_id, location_id, date_opened, time_opened)
3. Create `event_group_window` per selected group (event_id, group_id, date_joined, head_count snapshot, avg_weight_kg snapshot)
4. Create `paddock_observation` (type='open') with pre-graze readings

**Spec source:** V2_UX_FLOWS.md §11 (event card), §1.2 (location picker sections). V2_SCHEMA_DESIGN.md D5 (§5.1 events, §5.2 event_paddock_windows, §5.3 event_group_windows). V2_DESIGN_SYSTEM.md §4.3 (events screen), §4.8 (event card sheet).

- [ ] Event creation works with location + group selection
- [ ] Event list displays with correct status badges and derived day count
- [ ] Event card opens and displays paddock/group windows
- [ ] Location picker shows Ready/Recovering/In Use/Confinement sections
- [ ] Paddock observations created on event open
- [ ] `data-testid` attributes throughout

---

### CP-18: Paddock & Group Window Management

Sub-moves and group changes on active events. Enables the event card action buttons.

**Create:**
- `src/features/events/paddock-window-sheet.js` — Open paddock window (§2.1):
  - Location picker (available locations), date, time
  - Creates paddock_observation (type='open')
- `src/features/events/close-paddock-sheet.js` — Close paddock window (§2.2):
  - Date closed, time closed, residual height, recovery days
  - Creates paddock_observation (type='close')
  - **Primary paddock rule:** Close button disabled on first window by start_time (§2.2)
- `src/features/events/group-window-sheet.js` — Add group (§3.1):
  - Group picker, date joined, time joined, head count confirm, avg weight confirm
- Close group window inline action (§3.2):
  - Date left, time left

**Wire event card actions:**
- "Sub-move" → opens paddock-window-sheet
- "Close [paddock]" → opens close-paddock-sheet (disabled on primary)
- "Add group" → opens group-window-sheet
- "Remove [group]" → inline close group window

**Spec source:** V2_UX_FLOWS.md §2 (paddock windows), §3 (group windows). V2_DESIGN_SYSTEM.md §3.5 (sheet z-index: 210 for these stacked sheets).

- [ ] Open paddock window (sub-move start) works
- [ ] Close paddock window (sub-move end) works with observation
- [ ] Primary paddock close button is disabled
- [ ] Add group to event works with snapshot
- [ ] Remove group from event works
- [ ] Event card updates live after window changes (store subscriber)
- [ ] `data-testid` attributes

---

### CP-19: Move Wizard

The full close-current-event + create-new-event flow. The most complex user interaction in the app.

**Create:**
- `src/features/events/move-wizard.js` — Multi-step wizard per V2_UX_FLOWS.md §1:
  - **Step 1:** Destination type (new location / join existing)
  - **Step 2a:** Location picker (Ready/Recovering/In Use/Confinement sections)
  - **Step 2b:** Existing event picker (if join existing)
  - **Step 2c:** Strip graze toggle + strip size input (if new location selected)
  - **Step 3:** Split panel — close current (left) + new event (right)
    - Close side: date out, time out, residual height, recovery days
    - New side: date in, time in, pre-graze height, forage cover %, head count (auto)
    - **Feed transfer is NOT wired yet** — show placeholder "Feed transfer available in next update" if feed entries exist. Wired in Phase 3.3.

**Save sequence (§1.6) — in order:**
1. Close all open paddock windows on source event
2. Close all open group windows on source event
3. Set source event `date_out`
4. Create paddock_observation (type='close') with residual data
5. Create new event at destination (or add group window to existing)
6. Create event_paddock_window on new event
7. Create event_group_window(s) on new event
8. Create paddock_observation (type='open') with pre-graze readings
9. If strip graze: set is_strip_graze, strip_group_id, area_pct on paddock window

**Confinement handling:** If any closing paddock windows point to locations with `capture_percent > 0`, log it but do not create manure batch transactions yet — that requires the amendment/manure system from Phase 3.3. Add a TODO comment in the code referencing this.

**Spec source:** V2_UX_FLOWS.md §1 (full move wizard flow). V2_DESIGN_SYSTEM.md §3.12 (wizard dots). A1 (window model). A42 (sub-move terminology).

- [ ] Full move wizard flow works: close source → create destination
- [ ] Strip graze option creates correct paddock window flags
- [ ] Join existing event adds group window to selected event
- [ ] All save actions fire in correct order
- [ ] Source event shows as closed, destination shows as active
- [ ] Location picker sections reflect updated state after move
- [ ] `data-testid` attributes on wizard steps and actions

---

### CP-20: Event Close (without Move)

Close an event when animals are going off-pasture entirely.

**Create:**
- `src/features/events/close-event-sheet.js` — Per V2_UX_FLOWS.md §9:
  - Date out, time out, residual height, recovery days
  - **Feed check prompt:** If event has feed entries, show "Check remaining feed?" — but do NOT build the feed check UI. Show placeholder message "Feed check available in next update." Wired in Phase 3.3.

**Save sequence:**
1. Close all open paddock windows (date_closed = date_out)
2. Close all open group windows (date_left = date_out)
3. Set event date_out
4. Create paddock_observation (type='close')

**Spec source:** V2_UX_FLOWS.md §9.

- [ ] Event close works
- [ ] All windows closed on the event
- [ ] Event status updates to closed
- [ ] Observation created with residual data
- [ ] `data-testid` attributes

---

### CP-21: Dashboard

The home screen — the first thing users see after login. Group cards are the primary interaction point.

**Create:**
- `src/features/dashboard/index.js` — `renderDashboard()` per V2_DESIGN_SYSTEM.md §4.1:
  - **Header:** Farm name, sync indicator, field mode toggle
  - **Farm Overview stats row** (metric cells §3.8): Placeholder values for now — real calculations registered in Phase 3.3. Show: Active Events (count), Active Groups (count), Total Head (sum), Locations (count). Full metrics (DMI, NPK, Feed Cost) added when calc engine exists.
  - **View toggle:** Groups | Locations
  - **Group cards** (§3.13): Each active group shows:
    - Name with color bar
    - Head count, avg weight
    - Current location (from active event's open paddock windows) with "grazing" or "confinement" badge
    - Day count on current event (derived)
    - Action buttons: Move, Feed (placeholder → Phase 3.3), Edit
    - Mobile: collapsed by default with chevron expand
    - Desktop: always expanded, 2-column grid
  - **Groups with no active event:** Show with "Not on pasture" indicator
  - **FAB:** "+" button → options: New Event, New Animal, New Location

**Wire:**
- "Move" on group card → opens Move Wizard with that group's current event pre-selected
- Store subscribers: dashboard re-renders on event, group, location, or animal changes

**Spec source:** V2_DESIGN_SYSTEM.md §4.1 (home screen layout), §3.13 (group cards), §3.8 (metric cells). V2_UX_FLOWS.md §1 (move triggers from group card).

- [ ] Dashboard displays all groups with current location status
- [ ] Group cards show correct head count and location
- [ ] "Move" action opens move wizard
- [ ] Mobile collapse/expand works
- [ ] Desktop 2-column grid works
- [ ] FAB shows creation options
- [ ] Dashboard updates reactively when data changes
- [ ] `data-testid` attributes

---

### CP-22: Supabase Sync Wiring

Connect the sync adapter to live Supabase. Until now, data lives only in localStorage.

**Wire:**
- `src/data/custom-sync.js` — Connect to Supabase client:
  - `push()` → Supabase upsert using entity's `toSupabaseShape()`
  - `pull()` → Supabase select with `updated_at > since`, mapped back via `fromSupabaseShape()`
  - `delete()` → Supabase delete by id
  - Auth token passed via Supabase client session
- Offline queue in localStorage — detect online/offline via `navigator.onLine` + Supabase connection status
- Queue flush on reconnect (process in order, exponential backoff on failure)
- Dead letter after 5 retries (log to app_logs via logger)
- Sync status indicator in header and settings (§3.14 sync dot)

**Store integration:**
- Store actions call `getSyncAdapter().push()` after localStorage persist
- `store.init()` does initial pull on first load (merge remote into local, last-write-wins by updated_at)
- Pull on app resume (visibility change event)

**Test against the 14-scenario sync test suite** from V2_APP_ARCHITECTURE.md §5.4. Not all scenarios may be testable without a real Supabase instance — write tests for scenarios 1–4, 10, 13–14 with a mock adapter. Flag remaining scenarios for integration testing.

**Spec source:** V2_APP_ARCHITECTURE.md §5 (sync layer). V2_INFRASTRUCTURE.md §3.4–3.5 (sync error bootstrap, dead letters). A10 (pluggable sync adapter). A24 (app_logs direct-write).

- [ ] Online write → record appears in Supabase
- [ ] Offline write → queued → flushed on reconnect
- [ ] Pull merges remote data into local state
- [ ] Dead letters created after 5 failures
- [ ] Sync indicator shows correct state (idle/syncing/error/offline)
- [ ] App works fully offline (localStorage only)
- [ ] Sync test scenarios 1–4, 10, 13–14 pass

---

### CP-23: Integration Smoke Test

End-to-end verification that the core loop works as a connected system.

**Manual test script** (document in `tests/e2e/core-loop.spec.js` as a Playwright test):

1. Sign up new account → onboarding wizard → create operation + farm
2. Create 3 locations (2 pastures, 1 confinement)
3. Create 1 group, add 5 animals
4. Create event: place group on pasture 1
5. Dashboard shows group on pasture 1 with correct day count
6. Sub-move: add pasture 2 to the event
7. Close sub-move on pasture 2
8. Move wizard: close event on pasture 1 → new event on pasture 2
9. Dashboard shows group on pasture 2, day 0
10. Close event on pasture 2
11. Verify event log shows both events with correct dates and status
12. Refresh page → verify all data persists (localStorage)
13. (If Supabase connected) Verify data appears in Supabase tables

**Write Playwright test covering steps 1–12.** Step 13 is manual verification.

- [ ] Full core loop completes without errors
- [ ] All data persists across page refresh
- [ ] Event state transitions are correct (active → closed)
- [ ] Location status updates (ready → in use → recovering)

## Test Plan

- [ ] `npx vitest run` — all existing unit tests still pass + new tests for auth, onboarding, CRUD operations
- [ ] `npx playwright test` — core loop e2e test passes
- [ ] `npm run build` — production build succeeds
- [ ] No innerHTML anywhere in src/
- [ ] No hardcoded English in feature code — all strings use `t()`
- [ ] All interactive elements have `data-testid` attributes
- [ ] Every store action validates → mutates → persists → syncs → notifies

## Notes

**What this phase does NOT include:**
- No feed delivery, feed checks, or feed transfer — Phase 3.3
- No surveys or pasture observations (beyond event open/close observations) — Phase 3.3
- No amendments or manure management — Phase 3.3
- No health records (treatments, breeding, calving, BCS, weights) — Phase 3.3
- No calculation engine or registered formulas — Phase 3.3
- No reports — Phase 3.3
- No rotation calendar — Phase 3.4
- No harvest recording — Phase 3.3
- No batch/feed inventory management — Phase 3.3
- No PWA/service worker — Phase 3.5

**Feed and calculation placeholders:** Several screens reference feed data or computed metrics (dashboard stats, event card live metrics). These should show placeholder text or "—" until Phase 3.3 wires them. Do not stub fake values.

**Strip grazing:** The move wizard supports strip graze setup (CP-19), but the "Advance Strip" action (§2.4) requires the close-paddock flow to work in strip mode. Include the Advance Strip button on the event card in CP-18 and wire it — it follows the same close-then-open pattern as a regular sub-move but with strip_group_id continuity.

**Onboarding is minimal.** The wizard creates the essential records to make the app functional. A polished onboarding experience (animated intros, guided tours, sample data) is a Phase 3.5 polish item. If any onboarding step needs design decisions beyond basic CRUD, flag as `DESIGN REQUIRED`.

**`data-testid` convention:** `[screen]-[element]-[identifier]`. Examples: `locations-card-{id}`, `events-move-btn`, `dashboard-group-card-{id}`, `move-wizard-step-2`. Apply to every interactive element (buttons, inputs, links) and every list container.
