# GTHO v1 — Complete Feature & Data Audit

**Purpose:** Exhaustive catalog of every screen, sheet, user action, data entity, calculation, and edge case in the v1 app. This document is the source of truth for the v2 rebuild. If it's not in here, it doesn't get built. If it IS in here and it didn't get built, that's a trackable gap.

**Structure:** Raw catalog organized by domain. Each entry has a unique ID (e.g., GRZ-01) for tracking during implementation. A separate Consolidation Pass (Section 9) collapses duplicates and workarounds into clean rebuild capabilities.

---

## Table of Contents

1. [Grazing Domain](#1-grazing-domain)
2. [Feed Domain](#2-feed-domain)
3. [Animals Domain](#3-animals-domain)
4. [Pastures & Surveys Domain](#4-pastures--surveys-domain)
5. [Nutrients & Amendments Domain](#5-nutrients--amendments-domain)
6. [Settings & Configuration Domain](#6-settings--configuration-domain)
7. [Admin & Support Domain](#7-admin--support-domain)
8. [Cross-Cutting Concerns](#8-cross-cutting-concerns)
9. [Consolidation Pass — Capability Map](#9-consolidation-pass--capability-map)

---

## 1. Grazing Domain

### GRZ-01: Event Creation

**Entry points:** Move wizard Step 2 (`wizSaveNew`), home screen "New Event" button
**Trigger:** User wants to place a group of animals on a pasture/location

**Fields collected:**
| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Location(s) | pasture FK(s) | Yes | — | Single or multi-paddock via `wizPaddocks[]` |
| Date in | date | Yes | Today | |
| Time in | time | No | — | |
| Head count | number | Yes | Sum from selected groups | Aggregated from group animal counts |
| Average weight | number | Yes | Sum from selected groups | Aggregated from group animal weights |
| Height in | number | No | — | Hidden for confinement locations |
| Forage cover in | percent | No | — | Pre-graze cover |
| Feed entries | array | No | [] | Batch selections with quantities |
| No-pasture flag | boolean | No | Auto-true for confinement | Marks stored-feed-only events |
| Recovery min/max days | numbers | Conditional | Location or global default | Required if `S.settings.recoveryRequired` is true; skipped for confinement |

**Data created:**
- Event record pushed to `S.events[]` with status `'open'`
- Group entries in `ev.groups[]` with `dateAdded`, `groupId`, `groupName`
- Paddock entries in `ev.paddocks[]` with `pastureId`, `pastureName`, `acres`, `dateAdded`
- Feed entries in `ev.feedEntries[]` if initial feed provided
- Batch remaining decremented for any feed entries
- Paddock observation created (source: `'event_open'`, confidenceRank: 1)

**Supabase tables:** events, event_group_memberships, event_paddock_windows, event_feed_deliveries, paddock_observations, batches

**Edge cases:**
- Confinement locations auto-set `noPasture=true`, hide forage height fields, show manure capture notice
- Multi-paddock: primary paddock at index 0 is locked; additional paddocks can have later `dateAdded`
- Multi-group: all selected groups get separate `ev.groups[]` entries with individual snapshots

---

### GRZ-02: Event Editing

**Entry point:** `openEventEdit(eventId)` from events log or home screen
**Trigger:** User taps edit on an event card

**Editable on OPEN events:**
| Component | Actions | Notes |
|-----------|---------|-------|
| Paddocks | Add, close, reopen | Primary paddock (index 0) locked; "Open next paddock" shortcut after closing one |
| Groups | Add, remove, reopen | Group departure auto-records feed residual checkpoint |
| Feed entries | Add, edit, delete | Creates `ev.feedEntries[]` records |
| Feed checks | Add, edit | Intermediate residual readings (see FED-07) |
| Pre-graze data | Edit heightIn, forageCoverIn | |
| Notes | Edit | Free-form |
| No-pasture flag | Toggle | |
| Anchor close | Initiate close sequence | Transitions event to closed state |

**Editable on CLOSED events:**
- Sub-moves can be viewed/edited
- NPK preview displayed read-only
- Cannot reopen or edit core event data

**Paddock management details:**
- Session-only entries marked `_isNew: true` — can be discarded without persisting
- Saved entries toggle active/closed via `dateRemoved` field
- Paddock chip rendering shows status colors: green (active grazing), amber (stored feed/confinement)
- Acreage totals displayed; "NPK splits by acreage" label when multiple paddocks

**Group management details:**
- `syncEeGroupTotals()` recalculates head/weight from active group records
- Last group out triggers auto-close of parent event
- `_moveAction` tracks whether departure is via wizard or to existing event

**Recalculations:** Head/weight aggregate from active groups; event preview (totals, NPK, cost) for closed events; DMI variance for 100% stored-feed closed events

---

### GRZ-03: Event Closing

**Entry point:** `wizCloseEvent()` from move wizard Step 0 or event edit anchor close
**Trigger:** User closes out a grazing event (animals leaving)

**Data captured at close:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Date out | date | Yes | |
| Time out | time | No | |
| Height out | number | No | Post-graze forage height |
| Forage cover out | percent | No | Post-graze cover |
| Feed residual | percent | No | Final bales-remaining reading |
| Recovery min/max days | numbers | Conditional | Required if settings enforce |

**Calculations that run on close:**
1. `calcEventTotalsWithSubMoves()` computes: days, storedDMI, pastureDMI, cost, pasture%, NPK (n/p/k), NPK value, pasture fraction, sub-move hours, total hours, per-sub-move NPK
2. `calcResidualOM()` — organic matter from unconsumed feed residual
3. `calcGrassDMIByWindow()` — per-paddock grass DMI attribution if checkpoints recorded
4. NPK ledger entries created per paddock (source: `'livestock_excretion'` and `'feed_residual'`)
5. Paddock observations written (source: `'event_close'`)

**Confinement special handling:**
- NPK routed to manure batch via `addToManureBatch()` instead of pasture
- `totals.capturedNPK`, `totals.estimatedVolumeLbs`, `totals.capturePercent` set
- `totals.pastureDMI` and `totals.pct` set to null

**Sub-move NPK credit:** Each sub-move location with `captureManure` receives proportional NPK credit based on `durationHours / totalEventHours`

**Supabase tables:** events (updated), paddock_observations, manure_batch_transactions (if confinement)

---

### GRZ-04: Move Wizard (3-Step)

**Entry point:** `openMoveWizSheet(evId, groupId, moveAll)` from home screen "Move" button
**Trigger:** User wants to move animals from one location to another

**Step 0 — Close current event:**
- Only shown if groups are currently placed
- Displays: days, feed cost, stored DMI, pasture DMI %, NPK value, residual OM
- Captures: close date/time, forage height out, recovery min/max
- Calls `wizCloseEvent()` on save
- Last group out triggers auto-close of parent event
- Feed residual checkpoint auto-written on group departure

**Step 1 — Summary:**
- Displays close-out summary of what just happened

**Step 2 — New location:**
- Location selection (single or multi-paddock via `wizPaddocks[]`)
- Move-in date/time (pre-filled from close date)
- Head/weight (pre-filled from group totals)
- Feed entries (optional initial feed)
- No-pasture flag
- Recovery window

**Possible paths:**
- Single group, currently active → Step 0 (close) → Step 1 (summary) → Step 2 (new location)
- Unplaced group → Skip Step 0 → Step 2 (new location)
- Multi-group → All groups move together
- Multi-paddock destination → `wizPaddocks[]` allows multiple locations at move-in

**State variables:** `wizGroupIds[]`, `wizPaddocks[]`, `wizFeedLines[]`, `_mwStep`, `_mwSourceEvId`, `_mwGroupIds`, `_mwMoveAll`, `_mwDestType`, `_mwDestPaddockId`, `_mwDestEventId`

---

### GRZ-05: Sub-Moves

**Entry points:** `openSubMoveSheet(eventId, addOnly)` for creating; `openEditSubMoveSheet(evId, smId)` for editing
**Trigger:** Animals make a supplemental off-paddock movement while main event stays open (e.g., milking, shade, overnight shelter)

**Fields collected:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Location | pasture FK | Yes | Excludes current event paddocks; allows `"__new__"` quick-add |
| Date in | date | Yes | |
| Time in | time | No | Used for duration calc |
| Date out | date | No | Open sub-move if absent |
| Time out | time | Conditional | Required for duration calc |
| Duration hours | number | Derived | Calculated from times; or manual entry |
| No-pasture flag | boolean | No | For non-grazing locations |
| Feed entries | array | No | Optional feeding during sub-move |
| Height in/out | numbers | No | Grazing locations only |
| Forage cover in/out | percents | No | With sliders |
| Recovery min/max | numbers | No | Grazing locations only |
| Feed residual checkpoint | percent | No | If event has bale feed |
| Notes | text | No | |

**Active sub-move concept:** Sub-move with no `durationHours` is "active" — animals are currently there. Shown with "active" badge and "Record return" button.

**NPK calculation:** Based on `durationHours / totalEventHours`, routed to sub-move location if it has `captureManure`

**Membership-weighted AUD fallback (OI-0050):** Per-group NPK uses group's own head/weight snapshot, not event-level aggregate

**Supabase tables:** event_sub_moves (nested on event), paddock_observations

---

### GRZ-06: Close Sub-Paddock / Record Return

**Entry point:** `openCloseSubPaddockSheet(evId, smId)` or `openSmCloseForm(smId)`
**Trigger:** "Record return" button on active sub-move card

**Fields captured:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Date out | date | Yes | |
| Time out | time | Yes | |
| Time-in correction | date+time | Conditional | If original time-in was missing |
| Height out | number | No | |
| Forage cover out | percent | No | |
| Recovery min/max | numbers | No | If grazing location |
| Bale feed checkpoint | percent | No | If event has stored feed |

**Time correction:** If sub-move was recorded without time-in, correction dialog auto-shows on close. User can correct both date and time, then duration recalculates.

---

### GRZ-07: Add Group to Event

**Entry point:** `openAddGroupToEventSheet(evId)` from event edit
**Trigger:** Attaching an additional group to an already-open event

**Picker UI status indicators:**
- "Already here" — group already in this event
- "At location" — group placed at a different location (red flag)
- "Not placed" — unplaced, ready to add

**Data mutations:** Append to `ev.groups[]` with `dateAdded`, `groupId`, `groupName`; recalculate event head/weight totals

---

### GRZ-08: Event Groups (ev.groups[])

**Record shape:**
| Field | Type | Notes |
|-------|------|-------|
| groupId | FK | Links to S.animalGroups |
| groupName | string | Snapshot (denormalized) |
| dateAdded | date | When group entered event |
| timeAdded | time | Optional |
| dateRemoved | date | When group left; null if active |
| timeRemoved | time | Optional |

**Lifecycle:** `dateAdded` set on move-in; `dateRemoved` set on move-out. Active filter: `ev.groups.filter(g => !g.dateRemoved)`.

**Note:** headSnapshot / weightSnapshot NOT stored on group entry (OI-0050 — uses group's current totals instead)

---

### GRZ-09: Event Paddocks (ev.paddocks[])

**Record shape:**
| Field | Type | Notes |
|-------|------|-------|
| pastureId | FK | Links to S.pastures |
| pastureName | string | Snapshot |
| acres | number | Snapshot from pasture record |
| dateAdded | date | When grazing started on this paddock |
| timeAdded | time | Optional |
| dateRemoved | date | When grazing ended; null if active |
| timeRemoved | time | Optional |
| locationType | string | 'pasture' or 'confinement' |
| _isNew | boolean | Session-only flag; stripped before persist |

**Paddock windows define time ranges for NPK acreage-weighted calculations.** Primary paddock (index 0) is the anchor; additional paddocks have independent windows.

---

### GRZ-10: Events Log Display

**Entry point:** `renderEventsLog()` from events screen
**Trigger:** User navigates to Events tab

**Parent row displays:** Location (multi-paddock chip summary), date range (or "ongoing"), days, groups summary, status badge (active/closed), feed cost, pasture %, recovery window, edit button

**Sub-move thread (OI-0029):** Indented sub-list under parent with location, date range, duration, feed count. Active sub-moves get teal badge; returned get gray.

**Summary metrics per event:** AU (animal units), Pasture AUDs, ADA (AUDs/acre), Pasture DMI, Stored Feed DMI, NPK (closed only), DMI Variance (100% stored-feed closed events)

**Filtering:** Dropdown: "all", "open", "closed"

---

### GRZ-11: Active Rotation Banner

**Location:** Top of events log when open events exist
**Displays:** Paddock chips with status colors (active green, left amber), date in, feeding count, groups

---

### GRZ-12: Rotation Calendar

**Entry point:** `renderRotationCalendar(containerId)` — shared by Events tab and Reports tab
**Trigger:** User switches to calendar view

**Time spans:** Last 60 days (day view), Last 24 months (month view), 12 months of selected year (year view)

**Grid:** Rows = paddock names (sorted); Columns = time periods. Cells show colored event blocks.

**Metrics per cell:** AUDs (pasture-fraction-weighted), Pasture %, NPK/acre, OM (lbs), $/day, Efficiency %

**Thresholds:** Green/amber/red color coding per metric via `thresholdColor()` with configurable defaults

**Filters:** Closed events only by default; open events if `hasOpen` flag. Excludes confinement and amend-type events.

---

## 2. Feed Domain

### FED-01: Feed Screen

**Entry point:** `renderFeedScreen()` from feed tab
**Trigger:** User navigates to Feed tab

**Summary statistics displayed:**
- DM on hand (lbs): Sum of non-archived batches with remaining > 0, accounting for DM%
- Daily run rate: Sum of daily DMI targets from all animal groups
- Days on hand: DM on hand / daily DMI. Color-coded: green (≥ goal), amber (33-99%), red (<33%)
- Progress bar: Visual days as % of goal (default goal: 90 days)

**Batch list:** Filtered to non-archived, remaining > 0. Shows label, remaining qty, unit, DM%, cost/unit.

---

### FED-02: Feed Types

**Entry point:** `openFeedTypesSheet()` from feed screen
**Trigger:** User manages feed type definitions

**Fields:**
| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| name | string | Yes | — | e.g., "Alfalfa hay" |
| unit | string | Yes | — | "bale", "ton", "bag" |
| dm | percent | Yes | 85 | Dry matter % |
| cat | enum | Yes | — | "hay", "silage", "grain", "stored feed" |
| nPct, pPct, kPct | percents | No | null | NPK composition |
| harvestActive | boolean | No | false | Flag for harvest module (OI-0122) |
| cuttingNum | number | No | null | Cutting number (1st, 2nd, 3rd) |
| defaultWeightLbs | number | No | null | Default weight per unit (OI-0127) |
| forageTypeId | FK | No | null | Links to S.forageTypes (M7-E) |
| archived | boolean | No | false | Soft delete |

**Operations:** Create, edit, archive/unarchive, toggle harvestActive (one-tap)

**Supabase table:** feed_types

---

### FED-03: Batches

**Entry point:** Feed screen batch list, batch adjustment sheet
**Trigger:** User tracks feed inventory

**Fields:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | Auto | |
| label | string | Yes | e.g., "Alfalfa-20Jan2025-1000lbs" |
| feedTypeId | FK | Yes | Links to feed type |
| qty | number | Yes | Original quantity (units) |
| remaining | number | Auto | Units left (decremented on feeding) |
| unit | string | Yes | From feed type |
| dm | percent | Yes | From feed type |
| wt | number | No | Weight per unit (lbs) |
| cpu | number | No | Cost per unit ($) |
| date | date | Yes | When entered |
| adjustments | array | Auto | History of quantity adjustments |
| archived | boolean | No | Retired batch |

**Inventory tracking:** `remaining` decremented when feed entries saved via Quick Feed or event feed

**Supabase table:** batches

---

### FED-04: Quick Feed Sheet

**Entry point:** `openQuickFeedSheet(preselectGroupId)` from home, feed screen, or field mode
**Trigger:** User wants to log a feeding

**2-step location-centric flow (OI-0048):**

**Step 1 — Select event:** Lists all active events with location name, type badge, group names, day number, feed entry count. Pre-selects event containing `preselectGroupId` if provided.

**Step 2 — Log feeding:** Batch picker grouped by type. Each batch shows label, remaining, unit, DM%, cost/unit. Toggle selection + quantity stepper (±0.5 increments). Live DM calculation + cost display. Date/time fields (default: today, now).

**Save validation:** At least one batch with qty > 0

**Data mutations:** Creates feed entry object with `{id, date, time, lines: [{batchId, qty}]}`, appends to `ev.feedEntries[]`, decrements `batch.remaining`, calls `queueEventWrite(ev)`

**Field mode behavior:** Stays in sheet after save, shows picker again (allow feeding another group without exiting). "Done" button instead of backdrop close.

**Return routing:** `qfFromHome` flag tracks entry source — returns to home after save if opened from home group card.

---

### FED-05: Feed Day Goal

**Entry point:** `openFeedGoalSheet()` from feed screen
**Trigger:** User sets daily DMI planning target

**Fields:** `S.settings.feedDayGoal` (default: 90 days, valid: 7-365)
**Used in:** Feed screen "days on hand" color coding

---

### FED-06: Feed Entries (ev.feedEntries[])

**Record shape:**
| Field | Type | Notes |
|-------|------|-------|
| id | timestamp | Unique within event |
| date | date | When fed |
| time | time | Optional |
| lines | array | [{batchId, qty, unit?}] |
| kind | string | 'transfer' for transfer entries |
| transferPairId | string | Links paired +/- entries |
| notes | string | Optional |

**Creation paths:** Quick Feed sheet, event edit feed entry form, feed transfer system, move close (transfer between events)

**Supabase table:** event_feed_entries

---

### FED-07: Feed Residual Checks

**Entry point:** `openFeedCheckSheet(evId)` from event edit or field mode
**Trigger:** User records how much feed remains (intermediate checkpoint)

**Record shape:**
| Field | Type | Notes |
|-------|------|-------|
| id | timestamp | |
| date | date | |
| time | time | Optional |
| residualPct | percent | Legacy overall % (deprecated for per-type) |
| typeChecks | array | [{feedTypeId, remaining, total}] per feed type |
| isCloseReading | boolean | Auto-appended on event/sub-move close |
| carriedRate | number | DMI rate carried from source event (OI-0183 Fix 3) |
| notes | string | Optional; auto-set to "move_close", "event_close", etc. |

**Per-type card UI:** Stepper (±0.10), units input, percent slider (0-100%), "Consumed since last check" bar, last check info

**Key state:** `_fcEvId` (event being checked), `_fcEditId` (if editing existing), `_fcTypeData[]` (runtime working array with feedTypeId, totalUnits, startedUnits, lastCheckUnits, remaining)

**Integration:** Event close auto-appends `isCloseReading=true`; move close appends transfer_opening synthetic check; `_lastFeedCheck(ev)` filters to `!isCloseReading`

**Supabase table:** event_feed_residual_checks

---

### FED-08: Batch Adjustment / Reconciliation

**Entry point:** `openBatchAdjSheet(batchId, mode)` from feed screen
**Trigger:** User corrects batch data or does physical inventory count

**Modes:**
- **Edit:** Change original batch record (date, qty, weight, cost). If original qty changes, remaining adjusted proportionally. Warning if batch used in events.
- **Reconcile:** Physical count verification. Delta = new count - system count. Reasons: "Entry Error", "Waste", "Sold", "Reconciliation Adjustment".

**Adjustment record shape:** `{id, date, time, reason, delta, prevQty, newQty, notes, saleValue, createdAt}`

**Note:** Adjustments stored as array on batch record — NOT normalized to separate table.

**Feed test recording:** `saveBatchFeedTest()` creates `S.batchNutritionalProfiles[]` entry with source "feed_test". Fields: dmPct, nPct, pPct, kPct, proteinPct, adfPct, ndfPct, tdnPct, rfv, lab, notes.

**Supabase tables:** batches (updated), batch_nutritional_profiles (for feed tests)

---

### FED-09: DMI Calculations

**Core formulas:**
- **getDMITarget():** `herd.count × herd.weight × (herd.dmi / 100)` — daily run rate
- **calcConsumedDMI():**
  - With typeChecks: Per-type `(total - remaining) × batch.wt × (batch.dm / 100)`, summed
  - Without typeChecks (legacy fallback): Apply residualPct to last entry only
- **calcResidualOM():** Organic matter from last entry's unconsumed residual: `qty × wt × (dm/100) × (residualPct/100)`
- **calcEntryCost():** `sum(entry.lines: qty × batch.cpu)`

---

### FED-10: Harvest

**Entry point:** `openHarvestSheet()` from field mode or pastures screen
**Trigger:** User logs a forage cut

**Tile-first flow (OI-0123):**
1. Pick pasture/field (field mode only)
2. Select active feed types (those with `harvestActive === true`)
3. Fill per-field rows for each selected type

**Per-field row fields:** landId, landName, fieldCode, farmName, feedTypeId, quantity, weightPerUnitKg, batchUnit, dmPct, nPerTonneDM, pPerTonneDM, kPerTonneDM, batchId (auto-generated), notes

**Batch ID generation:** `[farm]-[field]-[cuttingNum]-[date]`

**Save logic:** Creates harvest event + harvest_event_fields (parent-child). For each field row, creates a batch record in `S.batches[]` with qty=remaining=quantity (fresh inventory).

**Supabase tables:** harvest_events, harvest_event_fields, batches

---

## 3. Animals Domain

### ANI-01: Animals Screen

**Entry point:** `renderAnimalsScreen()` from animals tab
**Trigger:** User navigates to Animals tab

**Display per animal:** Tag/ID, sex icon (♂/♀), class badge, group badge (colored dot), cull status badge, active event pasture badge, confirmed bred badge, open todo count, heat badge, current weight (or default from class)

**Filtering:** Active/culled toggle, text search (tag, EID, systemId, notes, class, group), group membership filter chips

**Sorting:** Tag/ID, class, group, weight — ascending/descending toggle

**Multi-select action bar:** Move to existing group, create new group (via `openAnimalMoveSheet()`)

**Per-animal action buttons:** Edit, Weight (⚖), Note (📝), Treatment (💉), Breeding (♀, females only), BCS (📊), Todo (📋)

---

### ANI-02: Animal CRUD

**Entry point:** `openNewAnimalSheet()` / `openAnimalEdit(id)` from animals screen
**Trigger:** User adds or edits an animal

**Fields:**
| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| tagNum | string | No | — | Ear tag; must be unique if provided |
| eid | string | No | — | Electronic ID |
| systemId | string | Auto | Generated on first edit | Never null after first save |
| name | string | No | — | |
| sex | enum | Yes | 'female' | Normalized to 'male'/'female' from legacy values |
| classId | FK | No | — | Links to animal class |
| groupId | FK | No | — | Links to animal group |
| damId | FK | No | — | Dam (female animals only; excludes self) |
| sireTag | string | No | — | Sire identifier |
| weightLbs | number | No | — | Current weight; derived from latest weight record |
| birthDate | date | No | — | Used for weaning calculation |
| weaned | boolean | No | null | null=unknown, false=not weaned, true=weaned |
| weanedDate | date | No | — | When marked weaned |
| weanTargetDate | date | Computed | — | birthDate + species wean target days |
| confirmedBred | boolean | No | false | Females only |
| confirmedBredDate | date | No | — | |
| notes | string | No | — | |
| active | boolean | Auto | true | false = culled |
| cullRecord | object | Auto | null | {date, reason, notes} when culled |
| calvingRecords | array | Auto | [] | One per birth event |
| healthEvents | array | Auto | [] | Notes, treatments, breeding, heat, BCS |
| weightHistory | array | Legacy | [] | Kept empty; actual data in S.animalWeightRecords |

**Save behaviors:**
- New animal: Set defaults, compute weanTargetDate if birthDate provided, add to group if selected, create membership ledger entry
- Edit: Validate tagNum uniqueness (excluding self), record new weight if changed, recompute weanTargetDate if birthDate changed, update group membership if changed
- Sex normalization: Legacy values ('bull', 'steer', 'ram', 'buck', 'calf-m') → 'male'/'female'

**Supabase table:** animals

---

### ANI-03: Animal Classes

**Entry point:** `openManageClassesSheet()` from settings
**Trigger:** User manages animal type definitions

**Fields:** id, name, species (e.g., "Beef cattle", "Dairy cattle", "Sheep", "Goats"), defaultWeightLbs, dmiPct (% body weight/day), archived

**Impact:** Linked to animals via classId. Used in DMI target calculations (`weight × dmiPct%`), weaning species mapping, display badges.

**Supabase table:** animal_classes

---

### ANI-04: Animal Groups

**Entry point:** `openAddGroupSheet()` / `openEditGroupSheet(groupId)` from settings or animals screen
**Trigger:** User manages herd groupings

**Fields:** id, name, color (hex for UI badges), animalIds[] (derived from membership ledger at load — NOT stored in Supabase), classes[] (legacy), archived

**Animal assignment model (M0b-G — Membership Ledger):**
- `S.animalGroupMemberships[]` is source of truth: `{id, animalId, groupId, dateJoined, dateLeft, reason}`
- Open membership: `dateLeft === null`
- At load time, `assembleGroups()` derives `group.animalIds` from membership ledger
- `_openGroupMembership(animalId, groupId, dateJoined)` — creates open row
- `_closeGroupMembership(animalId, groupId, dateLeft)` — sets dateLeft

**Edit sheet features:** Animal picker shows which animals are already in other groups (dimmed). Allows reassignment.

**Supabase tables:** groups, animal_group_memberships

---

### ANI-05: Animal Move Between Groups

**Entry point:** `openAnimalMoveSheet(mode)` from animals screen action bar
**Trigger:** User moves selected animals to a different group

**Modes:** 'existing' (move to existing group), 'new' (create group on the fly)

**Data mutations per animal:**
1. Remove from current group: filter from `animalIds`, call `_closeGroupMembership`
2. Log group change note: health event `{type: 'note', text: 'Group change: Old → New', _groupChange: true}`
3. Add to target group: add to `animalIds`, call `_openGroupMembership`

---

### ANI-06: Group Split

**Entry point:** `openSplitSheet(groupId)` from group card
**Trigger:** User partitions a group into two

**Data mutations:** Creates new group, moves selected animals via membership ledger operations.

---

### ANI-07: Group Weight

**Entry point:** `openWtSheet(groupId)` from group card
**Trigger:** User weighs all animals in a group at once

**UI:** Date selector, weight input per animal (labeled with tag + current weight)

**Save:** Iterates animals, updates `animal.weightLbs`, calls `_recordAnimalWeight()` for each. Alert with count updated and new group DMI target.

---

### ANI-08: Animal Health Events

**Entry point:** `openAnimalEventSheet(animalId, type, editEventId)` from animals screen
**Trigger:** User records a health observation

**Event types and fields:**

**Note:** date (required), time, text (required)

**Treatment:** date, time, treatmentTypeId (FK), treatmentName, product, dose, withdrawalDate, notes

**Breeding:** date, time, subtype ('ai'/'bull'/'heat'), sireName (required), sireRegNum, aiBullId (FK), bullAnimalId (FK), bullSystemId (snapshot), semenId, tech, expectedCalving (auto: date + 283 days)

**BCS (Body Condition Score):** date, time, score (1-10, chip selector), notes, likelyCull (boolean — red flag)

**Storage:** All types stored in `animal.healthEvents[]` array. Supabase table: animal_health_events (one mega-table for all types — v1 anti-pattern, v2 should split).

---

### ANI-09: Heat Records

**Entry points:** `openHeatRecordSheet(animalId, editEventId)` (direct), `openHeatPickerSheet()` (batch recording)
**Trigger:** User records estrus observation

**Heat picker (batch mode):** Filter by event/group/search, select animal, record date/time/notes. Shows "Last: [date]" per animal. Filters for females only.

**Data model:** Heat events are standard health events with `type='heat'` stored in `animal.healthEvents[]`.

---

### ANI-10: Calving

**Entry point:** `openCalvingSheet()` from animal edit screen
**Trigger:** User records a birth

**Fields:**
| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Date | date | Yes | Today | |
| Sex | enum | Yes | — | 'female' or 'male' |
| Tag | string | No | — | Ear tag for calf |
| Weight | number | No | — | Birth weight (lbs) |
| Sire tag | string | No | Dam's sireTag | |
| Notes | string | No | — | |
| Stillbirth | boolean | No | false | If true: calf marked inactive, culled as "Stillbirth" |

**Data mutations:**
1. Create calf record in `S.animals[]` with damId, birthDate, weaned=false, weanTargetDate (computed)
2. Add to dam's `calvingRecords[]`: {date, calfId, sireTag, stillbirth}
3. Add calving health event to dam's `healthEvents[]` (type='calving')
4. Auto-assign calf to dam's current group (unless stillbirth)
5. Record birth weight if provided

**Species-specific terms:** 'Calf'/'Lamb'/'Kid'/'Piglet' via `youngTermForSpecies()`. 'Calving'/'Lambing'/'Kidding'/'Farrowing' via `birthTermForSpecies()`.

**Supabase tables:** animals (calf + updated dam), animal_health_events, animal_weight_records (if weight), animal_group_memberships

---

### ANI-11: Weaning System

**Core functions:** `normalizeSpecies()`, `computeWeanTargetDate()`, `getWeanTargetDays()`

**Species mapping:** Class species string → 'cattle'/'sheep'/'goat'/'pig'/'other'

**Wean target days (defaults):** cattle=205, sheep=60, goat=60, pig=21, other=90. Customizable in `S.settings.weanTargets`.

**Wean target date:** `birthDate + weanTargetDays`

**Weaning dashboard:** Filters animals with birthDate. Status: "Not yet weaned" / "Due soon" / "Overdue" / "Weaned". Sorted by days until target. Bulk mark-as-weaned via checkboxes.

**Migration:** `migrateWeaningFields()` backfills missing birthDate from dam's calvingRecords.

---

### ANI-12: Animal Weights

**Entry point:** `openAnimalWeightSheet(animalId)` from animals screen
**Trigger:** User records individual weight

**Fields:** Weight (lbs, required), date (optional, default today), note (optional)

**Data model:** `S.animalWeightRecords[]` — top-level array (M0b-F). Entry: `{id, animalId, recordedAt, weightLbs, note, source}`. Sources: 'manual', 'group_update', 'calving', 'import'.

**At load time:** `assembleAnimals()` derives current `animal.weightLbs` from latest weight record.

**`animal.weightHistory[]`** is legacy — kept empty for compat; actual time series in `S.animalWeightRecords`.

**Supabase table:** animal_weight_records

---

### ANI-13: Cull

**Entry point:** `openCullSheet(animalId)` from animal edit
**Trigger:** User removes animal from active herd

**Fields:** Date (default today), reason (required string), notes (optional)

**Data mutations:**
1. Set `active = false`, set `cullRecord = {date, reason, notes}`
2. Remove from all groups: filter from `animalIds`, close membership ledger entries
3. Queue write, save

**Reactivation:** Set `active = true`, `cullRecord = null`, save.

**Display:** Culled animals marked with red badge, opacity 0.5, filtered out by default (toggle "Show culled").

---

### ANI-14: Treatment Types

**Entry point:** `openManageTreatmentTypesSheet()` from settings
**Trigger:** User manages treatment type definitions

**Fields:** id, name, category (enum: 'antibiotic', 'parasiticide', 'reproductive', 'other'), archived

**Supabase table:** treatment_types

---

### ANI-15: AI Bulls

**Entry point:** `openManageAIBullsSheet()` from settings
**Trigger:** User manages AI sire reference data

**Fields:** id, name, breed, tag, regNum, archived

**Supabase table:** ai_bulls

---

## 4. Pastures & Surveys Domain

### PAS-01: Pastures Screen

**Entry point:** `renderPastures()` from pastures tab
**Trigger:** User navigates to Pastures tab

**Filtering:** Land use chips (All, Pasture, Mixed-Use, Crop, Confinement), farm filter chips (multi-farm only), search

**Sorting:** Name, acres, est. graze, survey rating, avg %

**Grouped by farm** when multiple farms exist

**Per-pasture card displays:**
- Name + land use badge + field code + active event badge + confinement badge
- Detail line: acres, soil type, species
- Last soil test: date + N/P/K + unit
- NPK summary: total N/P/K from closed grazing + spread events
- Manure inventory (confinement only): volume in storage
- Est. available DM + est. AUDs (non-confinement)
- Recovery date line
- Harvest log: per-field reconciliation with batch IDs, cuttings, dates (OI-0124)
- Avg forage quality % badge + task count + survey rating badge
- Actions: Edit, Survey (📋), Soil (🧪)

---

### PAS-02: Pasture CRUD

**Fields:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | auto | — | |
| name | string | Yes | |
| acres | number | Yes | |
| soil | string | No | Soil type |
| species | string | No | Forage species |
| locationType | enum | Yes | 'pasture' or 'confinement' |
| landUse | enum | No | 'pasture', 'mixed-use', 'crop', 'confinement' |
| farmId | FK | No | Links to S.farms |
| fieldCode | string | No | |
| captureManure | boolean | No | Confinement only |
| capturePercent | percent | No | 0-100, confinement only |
| recoveryMinDays | number | No | Per-pasture fallback |
| recoveryMaxDays | number | No | |
| archived | boolean | No | |

**Note:** One pasture = one location. Multi-paddock events tracked via `event.paddocks[]`, not nested paddocks on pasture.

**Supabase table:** pastures

---

### PAS-03: Bulk Survey

**Entry point:** `openBulkSurveySheet()` from pastures screen or field mode
**Trigger:** User surveys multiple paddocks at once

**Flow:**
1. Resume draft OR create new survey record with status='draft'
2. Initialize state dicts: surveyRatings, surveyNotes, surveyRecovery, surveyVegHeight, surveyForageCover, surveyForageQuality
3. Re-hydrate from `draftRatings` JSONB

**Fields per paddock:**
| Field | Type | Notes |
|-------|------|-------|
| forageQuality/rating | 1-5 scale | |
| vegHeight | inches | Decimal allowed |
| forageCoverPct | 0-100% | |
| forageCondition | enum | poor/fair/good/excellent |
| recoveryMinDays | integer | Optional |
| recoveryMaxDays | integer | Optional |
| notes | text | Per-paddock |

**Card UI:** Paddock row with name + acres + avg past quality. Input row with all fields. Farm + type filter pills.

**Draft vs committed:** Draft auto-saved on close with `draftRatings` JSONB. Committed creates `paddockObservations` rows.

**Supabase tables:** surveys, paddock_observations (on commit)

---

### PAS-04: Single Survey

**Entry point:** `openSurveySheet(pastureId, surveyId)` from pasture card
**Trigger:** User surveys one paddock or edits a historical survey

**Differs from bulk:** `filteredPastures` set to `[pastureId]` only. Can pre-populate from existing observation if `surveyId` provided. Can edit historical readings.

---

### PAS-05: Paddock Observations

**Unified ledger (M0a-C): `S.paddockObservations[]`**

**Record shape:**
| Field | Type | Notes |
|-------|------|-------|
| id | string | |
| pastureId | FK | Links to S.pastures |
| pastureName | string | JS-only (not in Supabase) |
| observedAt | timestamp | |
| source | enum | 'survey', 'event_open', 'event_close', 'sub_move_open', 'sub_move_close' |
| sourceId | string | Links to originating record |
| confidenceRank | 1-3 | 1=low (event), 3=high (survey) |
| vegHeight | number | Inches |
| forageCoverPct | percent | |
| forageQuality | number | 1-5 |
| forageCondition | enum | |
| recoveryMinDays | number | |
| recoveryMaxDays | number | |
| notes | string | |

**Write function:** `_writePaddockObservation()` — upserts by source + sourceId + pastureId match

**Supabase table:** paddock_observations

---

### PAS-06: Soil Tests

**Entry point:** `openSoilTestSheet(landId)` from pasture card
**Trigger:** User logs a soil lab result

**Fields:** id, landId (pastureId), date (required), n, p, k (PPM or lbs/acre), unit, pH, organicMatter, lab (text), notes

**Helper:** `latestSoilTest(landId)` returns most recent by date

**Supabase table:** soil_tests

---

### PAS-07: Farms

**Entry point:** `openEditFarmSheet(idx)` from settings
**Trigger:** User manages farm/property definitions

**Fields:** id, name, location, areaHectares, address, notes

**Migration:** `migrateHomeFarm()` creates default "Home Farm" if none exist

**Supabase table:** farms

---

### PAS-08: Forage Types

**Entry point:** `openEditForageTypeSheet(idx)` from settings
**Trigger:** User manages forage species definitions

**Fields:** id, name, dmPercent, npkRates, heightToYield

**Supabase table:** forage_types

---

## 5. Nutrients & Amendments Domain

### NUT-01: NPK Ledger

**Storage:** `ev.npkLedger[]` on closed events

**Entry shape:** `{id, paddockName, pastureId, periodStart, periodEnd, head, avgWeight, days, acres, nLbs, pLbs, kLbs, source, dmLbsDeposited}`

**Calculation:**
- N lbs = `(head × avgWeight / AU_weight) × days × nExc`
- P lbs = `... × pExc`
- K lbs = `... × kExc`
- Default excretion rates: nExc=0.32, pExc=0.09, kExc=0.30 (lbs/AU/day)

**Sources:** 'livestock_excretion' (from grazing), 'feed_residual' (from unconsumed feed)

**Supabase table:** event_npk_deposits

---

### NUT-02: Input Products

**Entry point:** Settings > Manage Products
**Trigger:** User defines commercial amendments

**Fields:** id, name, type/cat, nPct, pPct, kPct, costPerUnit, unit ('ton', 'bag', 'lb'), archived

**Supabase table:** input_products

---

### NUT-03: Input Applications

**Entry point:** `openApplyInputSheet()` from pastures screen
**Trigger:** User applies amendments to pastures

**Flow:**
1. Select source: 'product' or 'manure'
2. Pick product OR manure batch
3. Select paddocks (multi-select)
4. Enter qty or % applied
5. Preview NPK + cost

**NPK calculation (product):** `qtyLbs × (nPct/100)` etc. Cost: override or `qty × costPerUnit`.
**NPK calculation (manure):** Ratio of applied volume to total remaining × remaining NPK.

**Location ledger:** Per-paddock attribution: `{pastureId, pastureName, nLbs, pLbs, kLbs, costPerAcre, acres}`

**Supabase tables:** input_applications, input_application_locations

---

### NUT-04: Manure System

**S.manureBatches fields:** id, label, locationName, estimatedVolumeLbs, nLbs, pLbs, kLbs, captureDate, notes, events[] (transactions array)

**S.manureBatchTransactions (M0b-I):** id, batchId, type ('input'/'application'), date, volumeLbs, nLbs/pLbs/kLbs, sourceEventId, applicationId, pastureNames[], notes

**Spread sheet (`openSpreadSheet()`):**
1. Select batch (active = remaining > 0)
2. Select paddock destination
3. Select amount: % of batch OR volume (unit conversion: lbs → tons/loads/gallons/cu_yards)
4. Preview NPK + fertilizer value
5. Save: append to batch events[], create transaction record, create amend event in S.events[]

**Remaining calculation:** `getBatchRemaining(batch)` = estimatedVolumeLbs - sum of application volumes

**Creation from confinement event close:** Auto-creates manure batch with estimated volume, NPK from excretion rates

**Known issue (OI-0181):** JS model does not match Supabase schema — zero column overlap, never synced

**Supabase tables:** manure_batches, manure_batch_transactions

---

### NUT-05: NPK Pricing

**Settings fields:** nPrice ($0.55/lb default), pPrice ($0.65/lb), kPrice ($0.42/lb)

**Fertilizer value:** `(nTotal × nPrice) + (pTotal × pPrice) + (kTotal × kPrice)` — displayed on pasture cards, spread preview, input app preview, reports

---

## 6. Settings & Configuration Domain

### SET-01: Settings Screen

**Entry point:** `loadSettings()` from settings tab
**Sections:**

1. **Farm Identity:** Herd name, type, count, weight, DMI
2. **Economics:** N/P/K prices, excretion rates
3. **Manure:** Volume rate (lbs/day), load lbs, volume unit
4. **Home Stats:** Selected stat metrics + period filter (7d/14d/30d/ytd)
5. **Grazing Management:** AU weight, DM per AUD, residual graze height, forage utilization %, recovery required toggle, recovery min/max days
6. **Thresholds:** Target & warning % for AUDs/rotation, pasture %, NPK/acre, OM residual, cost/day
7. **Wean Targets:** Per-species days-to-wean
8. **Version:** Display only
9. **Tester Name:** For feedback tagging
10. **Sync Queue Inspector:** Pending writes count + status + stuck warning (>24h)

**Supabase tables:** operations, operation_settings

---

### SET-02: Authentication

**Sign-in flow:** Email + password OR OTP (6-digit code, typed in-app). Supabase `onAuthStateChange` fires SIGNED_IN event.

**Auth state:** `_sbSession` (session), `_sbOperationId` (cached UUID), `_sbProfile` (operation_members row)

**Auth overlay:** Step 1: email + password/code. Step 2: code confirmation.

**Sign-out (`openSignOutSheet`):** Confirmation dialog. Calls `sbSignOut()`. Local data stays; syncs on next sign-in.

**Guards:** User-switch detection (clear operation ID on mismatch), concurrent load guard, JWT refresh guard (10-min window skips reload)

---

### SET-03: Users & Operations

**S.users:** Legacy local array (deprecated). Replaced by Supabase `operation_members`.

**operation_members:** id, operation_id, user_id, display_name, email, role ('owner'/'admin'/'member'), invited_at, accepted_at. Pending rows: user_id=null.

---

## 7. Admin & Support Domain

### ADM-01: Feedback/Submissions

**Entry point:** `openFeedbackSheet()` from feedback tab
**Trigger:** User submits bug report or feature request

**Fields:** type ('feedback'/'support'), category (roadblock/bug/ux/feature/calc/idea/question), note, priority (support only), auto-context (screen, active event, day number)

**Record shape (abbreviated):** id, type, cat, area, note, tester, version, priority, status ('open'/'resolved'/'closed'), thread[], resolvedInVersion, resolutionNote, confirmedBy, oiNumber

**Thread system:** Append-only JSONB array `[{author, timestamp, body, type}]`

**Resolve flow:** Dev marks status='resolved' + version. User sees confirm section: "This is fixed" or "Still broken". If fixed: status='closed'. If broken: creates regression entry.

**Dev Brief export:** Stats by category/area/priority

**Supabase table:** submissions

---

### ADM-02: Todos

**Entry point:** `renderTodos()` from todos tab; `openTodoSheet(id, fromWiz, animalId)` for create/edit
**Trigger:** User manages farm tasks

**Fields:** id, title (required), description, status ('open'/'inprogress'/'closed'), note, paddock (pasture name), animalId (optional FK), assignedTo[] (user IDs), dueDate

**Animal linking:** Pre-links animal in task form. Used for treatment/weaning reminders.

**Filters:** User, location, status (default: open + inprogress)

**Supabase table:** todos

---

## 8. Cross-Cutting Concerns

### XCT-01: Offline-First Architecture

**Local storage:** All data in `S` object, persisted to localStorage key `'gthy'`

**Sync queue:** `_syncQueue` in localStorage — array of `{table, record}` ops. Flushed via `flushToSupabase()` with debounced batching.

**Mutation pattern (mandatory):**
```
1. Mutate S.* (state)
2. queueWrite('table', shapeFunction(record)) — for each table touched
3. bumpSetupUpdatedAt() — if setup arrays changed
4. save() — localStorage + async Supabase push
5. Render function(s) — update UI
```

**Event writes:** `queueEventWrite(ev)` handles parent event + 6 child tables in one call.

**Offline detection:** `navigator.onLine` + `online`/`offline` events. Queue persists offline; flushes on reconnect.

**Flush tier ordering:** `FLUSH_TIERS` / `_FLUSH_TIER_MAP` — metadata tables first, leaf tables last (FK dependency order).

---

### XCT-02: Supabase Integration

**Client:** `_sbClient` from Supabase JS SDK CDN

**Load:** `loadFromSupabase(operationId)` — async 24-table load + assembly

**Realtime:** `subscribeRealtime(operationId)` — postgres_changes subscription

**Shape functions:** 25 per-table functions mapping camelCase JS → snake_case Supabase. `_sbToCamel()` / `_sbToSnake()` generic converters.

**RLS:** All tables scoped by `operation_id`. `operation_members` binds users to operations.

---

### XCT-03: Field Mode

**Entry point:** `applyFieldMode()` / `toggleFieldMode()`
**Trigger:** User activates simplified mobile UI

**Behavior:**
- Toggle class 'field-mode' on body
- Reduced desktop sidebar hidden; mobile nav centered
- URL param routing: `?field=home|feed|harvest|balance`
- User preference: `user.fieldMode` (persisted)

**8 field modules:** Quick Feed, Harvest, Move, Quick Notes, Weigh, Breed, Health, Settings. User selects default 4 active.

**Field home (`renderFieldHome`):** 3 sections: Tiles (2-4 col grid), Tasks (collapsed), Events (collapsed). Touch feedback on tap.

**Module tiles:** Feed 🌾, Harvest 🚜, Move 📍, Notes 📝, Weigh ⚖️, Breed 🐄, Health 💊, Settings ⚙️

---

### XCT-04: Backup/Restore

**Export (`exportDataJSON`):** Serializes entire S object. Filename: `gthy-backup-YYYY-MM-DD-HHMM.json`. Browser download.

**Import (`importDataJSON`):**
1. Admin-only check
2. Parse JSON + validate (must have herd, events, or pastures)
3. Confirm restore (warning: replaces all data)
4. Deep copy: `S = JSON.parse(JSON.stringify(imported))`
5. Run migrations: `migrateSystemIds()`, `migrateToPaddocksField()`, `ensureDataArrays()`
6. Save locally
7. If signed in: delete cloud data + `pushAllToSupabase()`

**`ensureDataArrays()`:** Initializes all 23+ arrays, herd/settings objects. Backfills missing fields on existing arrays.

---

### XCT-05: Reports

**Entry point:** `renderReportsScreen()` from reports tab
**7 report tabs:**

1. **Rotation calendar** — shared `renderRotationCalendar()` (see GRZ-12)
2. **NPK fertility** — pasture-by-pasture N/P/K balance + forage yield targets
3. **Feed & DMI trends** — forage vs supplement DMI over time
4. **Animal performance** — growth, breeding, health by class
5. **Season summary** — aggregated stats (total AUDs, acres, cost/lb)
6. **Pasture surveys** — quality ratings over time + recovery progress
7. **Weaning** — young animal progress toward target weight

**Stats engine:** Calculation functions for DMI, utilization, animal weights, NPK. Powered by same core formulas as event close.

---

### XCT-06: Error Handling

**`S.errorLog[]`:** Array of `{ts, source, message, stack, screen, version, repeatCount}`. Max 200 entries (rolling). Dedup: if last entry same source+message, increment repeatCount.

**Sources:** supabase-auth, supabase-fetch, supabase-load, supabase-flush, sb-members-list, application-level

**Export:** Text file `gthy-errors-YYYY-MM-DD.txt` with all entries. Clear function with confirmation.

---

### XCT-07: Service Worker / PWA

**`sw.js`:** Network-first for HTML, cache-first for assets. Manual update gate (user controls when to accept via "Update now" button).

**No auto-skipWaiting** — user-initiated via SKIP_WAITING message.

---

### XCT-08: Home Screen

**Entry point:** `renderHome()` from home tab
**Two view modes:** Groups (default) or Locations. Toggle stored in `S.settings.homeViewMode`.

**Group cards display:** Group name, color badge, animal count, active event location, days at current location, feed cost, DMI summary, NPK value, stat metrics (configurable per-card), action buttons (Move, Feed, Edit)

**Location cards display:** Location name, type badge, groups present, sub-paddock status, feed status, days in, action buttons

**Home stats period:** Configurable (7d/14d/30d/ytd) in settings

---

### XCT-09: Navigation

**Screen router:** `curScreen` global dispatches to render functions via `goToScreen(name)`

**9 screens:** home, feed, animals, events, todos, pastures, feedback, reports, settings

**Mobile nav:** Bottom bar with 5 visible buttons (home, feed, animals, events, settings) + hamburger for rest

**Desktop nav:** Fixed 220px sidebar with all 9 screen buttons

---

### XCT-10: Data Assembly at Load

**`assembleEvents()`:** Reconstructs event objects from Supabase flat tables (events + event_group_memberships + event_paddock_windows + event_feed_deliveries + event_sub_moves + event_feed_residual_checks + event_npk_deposits)

**`assembleAnimals()`:** Derives current weight from latest weight record, reconstructs healthEvents, rebuilds calving records as health events

**`assembleGroups()`:** Derives `group.animalIds` from membership ledger

---

## 9. Consolidation Pass — Capability Map

*This section maps the raw catalog entries above into clean rebuild capabilities. Each capability is a discrete unit of work in the v2 implementation.*

### Capability Groups

#### C-GRZ: Grazing Management
| Capability | Catalog Sources | Rebuild Notes |
|-----------|----------------|---------------|
| Create grazing event | GRZ-01 | Single entry point; supports multi-paddock, multi-group |
| Edit open event | GRZ-02 | Paddock/group add/remove/reopen, feed entries, notes |
| Close event with calculations | GRZ-03 | NPK, DMI, residual OM, observations, manure capture |
| Move wizard (3-step) | GRZ-04 | Close source → summary → open destination |
| Sub-move CRUD | GRZ-05, GRZ-06 | Create, edit, close/record return |
| Add group to existing event | GRZ-07 | Status-aware picker |
| Events log display | GRZ-10, GRZ-11 | Parent + sub-move thread, active banner, filtering |
| Rotation calendar | GRZ-12 | Shared component (events + reports), 3 time spans |

**Consolidation notes:** GRZ-08 (event groups) and GRZ-09 (event paddocks) are data structures, not standalone capabilities — they're consumed by C-GRZ capabilities above.

#### C-FED: Feed Management
| Capability | Catalog Sources | Rebuild Notes |
|-----------|----------------|---------------|
| Feed type CRUD | FED-02 | Include harvest fields (harvestActive, cuttingNum, defaultWeightLbs) |
| Batch inventory tracking | FED-03 | Creation, remaining tracking, archival |
| Quick feed recording | FED-04 | 2-step location-centric flow, field mode support |
| Feed day goal setting | FED-05 | Simple settings field |
| Feed residual checks | FED-07 | Per-type UI with stepper/slider/percent, close readings |
| Batch adjustment/reconcile | FED-08 | Edit mode + reconcile mode + feed test recording |
| Harvest recording | FED-10 | Tile flow, per-field rows, auto-batch creation |

**Consolidation notes:** FED-06 (feed entries shape) is a data structure consumed by Quick Feed and event edit. FED-09 (DMI calculations) is a calculation library, not a UI capability — should be a shared calc module.

#### C-ANI: Animal Management
| Capability | Catalog Sources | Rebuild Notes |
|-----------|----------------|---------------|
| Animal roster display | ANI-01 | Filter, sort, search, multi-select, action buttons |
| Animal CRUD | ANI-02 | Create/edit with sex normalization, group assignment |
| Animal class management | ANI-03 | CRUD with species, weight, DMI% |
| Animal group management | ANI-04 | CRUD with membership ledger model |
| Move animals between groups | ANI-05 | Existing or new group target |
| Group split | ANI-06 | Partition into two groups |
| Group weight recording | ANI-07 | Bulk weight entry per animal |
| Health event recording | ANI-08 | 4 types: note, treatment, breeding, BCS |
| Heat recording | ANI-09 | Individual + batch picker mode |
| Calving recording | ANI-10 | Dam/calf linkage, auto-group, stillbirth handling |
| Weaning system | ANI-11 | Species mapping, target dates, dashboard, bulk mark |
| Individual weight recording | ANI-12 | Single animal weight entry |
| Cull/reactivate | ANI-13 | Mark inactive, remove from groups, reactivate |
| Treatment type management | ANI-14 | CRUD with categories |
| AI bull management | ANI-15 | CRUD reference data |

**Consolidation notes:** v1 stores all health events in one mega-table (`animal_health_events` with 24 columns). v2 should split into: animal_bcs_scores, animal_treatments, animal_breeding_records, animal_calving_records, animal_notes. The UI capability (ANI-08) stays as one sheet with type-specific sections, but the backend is separate tables.

#### C-PAS: Pastures & Surveys
| Capability | Catalog Sources | Rebuild Notes |
|-----------|----------------|---------------|
| Pasture roster display | PAS-01 | Filter by land use/farm, search, sort, per-card details |
| Pasture CRUD | PAS-02 | Location types, confinement capture settings |
| Bulk survey | PAS-03 | Multi-paddock, draft/committed, per-paddock fields |
| Single survey | PAS-04 | One paddock, edit historical |
| Paddock observation ledger | PAS-05 | Unified from multiple sources, confidence ranking |
| Soil test recording | PAS-06 | NPK PPM/lbs, pH, organic matter |
| Farm management | PAS-07 | CRUD, default farm migration |
| Forage type management | PAS-08 | Species definitions |

#### C-NUT: Nutrients & Amendments
| Capability | Catalog Sources | Rebuild Notes |
|-----------|----------------|---------------|
| NPK calculation at event close | NUT-01 | Excretion-based, per-paddock ledger |
| Input product management | NUT-02 | CRUD with NPK% and cost |
| Amendment application | NUT-03 | Product or manure source, multi-paddock, preview |
| Manure batch tracking | NUT-04 | Auto-creation from confinement, spread, remaining calc |
| NPK pricing/value | NUT-05 | Per-lb prices, fertilizer value display |

**Consolidation notes:** OI-0181 (manure schema mismatch) must be resolved in v2 schema — proper batch + transaction tables.

#### C-CFG: Configuration & Admin
| Capability | Catalog Sources | Rebuild Notes |
|-----------|----------------|---------------|
| Settings management | SET-01 | 10 sections of preferences |
| Authentication | SET-02 | Email + OTP, auth overlay, sign-out confirmation |
| User/operation management | SET-03 | Operation members, roles |
| Feedback/submissions | ADM-01 | Submit, resolve, thread, dev brief |
| Todo management | ADM-02 | CRUD with animal linking, assignment, filtering |

#### C-XCT: Cross-Cutting
| Capability | Catalog Sources | Rebuild Notes |
|-----------|----------------|---------------|
| Offline queue + sync | XCT-01, XCT-02 | Must be architecturally first-class |
| Field mode | XCT-03 | 8 modules, tile grid, simplified UI |
| Backup/restore | XCT-04 | Export/import with migrations |
| Reports (7 tabs) | XCT-05 | Rotation, NPK, feed, animals, summary, surveys, weaning |
| Error logging | XCT-06 | Rolling log, export, viewer |
| Service worker / PWA | XCT-07 | Network-first HTML, cache-first assets, manual update gate |
| Home screen (dual view) | XCT-08 | Groups or locations toggle |
| Navigation (9 screens) | XCT-09 | Mobile bottom + desktop sidebar |
| Data assembly at load | XCT-10 | Flat Supabase → nested JS objects |

---

### Workarounds to Replace in v2

| v1 Workaround | Catalog Ref | v2 Proper Fix |
|---------------|------------|---------------|
| Single mega-table for health events (24 cols, 5 types) | ANI-08 | Split into 5 tables: bcs, treatments, breeding, calving, notes |
| Denormalized name snapshots on 8+ tables | GRZ-08, GRZ-09 | FK-only; resolve names from entity cache at render time |
| JSONB bags (operation_settings, surveys.draftRatings, todos.assignedTo) | SET-01, PAS-03, ADM-02 | Proper columns or junction tables |
| ID type chaos (bigint, text, uuid mixed) | All | UUID everywhere |
| Stored computed values (dm_lbs, cost, duration_hours) | FED-06, NUT-01 | Compute on read |
| Time-of-day as text (6 tables) | GRZ-01, GRZ-05 | PostgreSQL `time` type |
| Timestamp inconsistency (created_at vs ts vs recorded_at) | All | Standard `created_at` + `updated_at` on every table |
| Manure batch/transaction schema mismatch (OI-0181) | NUT-04 | Proper batch + transaction tables with correct columns |
| Batch adjustments stored as embedded array (not normalized) | FED-08 | Separate batch_adjustments table |
| animal.weightHistory[] legacy (parallel with animalWeightRecords) | ANI-12 | Single weight_records table only |
| group.animalIds[] derived at load (not in Supabase) | ANI-04 | Membership ledger is source of truth; remove animalIds[] |
| group.classes[] legacy array | ANI-04 | Remove entirely; individual animals model only |

---

### Schema Anti-Patterns to Fix

| Anti-Pattern | Tables Affected | v2 Fix |
|-------------|----------------|--------|
| Mixed ID types | All 38 tables | UUID (`crypto.randomUUID()`) everywhere |
| Name snapshots | events, paddocks, groups, feed entries | FK-only, resolve at render |
| JSONB bags | operation_settings, surveys, todos | Typed columns or junction tables |
| Stored computed values | event_feed_deliveries, event_npk_deposits | Compute on read |
| Imperial units in storage | All weight/area fields | Metric internal, display conversion |

---

*End of audit. This document should be version-controlled and updated as the rebuild progresses. Each catalog ID (GRZ-01, FED-02, etc.) should be referenced in commit messages and implementation tickets to maintain traceability.*
