# GTHO v2 — UX Flows

**Status:** APPROVED (2026-04-12)
**Source:** v1 feature audit (GRZ-01–05, FED-01–10, PAS-03–04, NUT-03) + v2 schema + V2_DESIGN_SYSTEM.md §4
**Purpose:** Define every multi-step user interaction. Claude Code builds UI from these flows.

**Terminology note:** "Sub-move" is the **user-facing term** for adding or removing a paddock (location) from an active event mid-graze. The backend models this as `event_paddock_windows` — opening and closing time-bound windows. This doc uses "sub-move" when describing what the user sees, and "paddock window" when describing data operations. See §2 for the full flow.

---

## 1. Move Wizard

The primary way to close an active event and place a group into a new location. Triggered from the group card via "Move" button.

### 1.1 Step 1: Destination Type

User chooses:
- **New location** — start a fresh event at a new paddock
- **Join existing event** — add this group to an event already in progress

### 1.2 Step 2a: Location Picker (New Location)

Four sections, each showing location cards:

| Section | Filter | Card shows |
|---------|--------|------------|
| Ready | No active event, recovery window passed | Name, land_use badge, days since last graze, last event date |
| Recovering | No active event, still in recovery window | Name, recovery days remaining, recovery window dates |
| In Use | Has active event | Name, current group(s), days occupied |
| Confinement | type='confinement' | Name |

Each card shows enough info to make a grazing decision without opening another screen.

### 1.3 Step 2b: Existing Event Picker (Join Existing)

List of active events with: location name(s), group(s) already on it, days open.

### 1.4 Step 2c: Strip Graze Option

When the user selects a destination paddock (Step 2a), a **"Strip graze this paddock"** toggle is available. If enabled:

- **Strip size input:** User defines strip size as either **acres/hectares** or **percentage** — both inputs are always visible, and editing one auto-derives the other from the paddock's total area. Respects the operation's display unit preference (acres vs. hectares).
- **Number of strips:** Optionally set directly (derives strip size) or derived from strip size.
- **Only the first strip window opens** when the event is created. Subsequent strips are opened via the "Advance Strip" action on the event card (§2.4).

Data: Sets `is_strip_graze = true`, generates a `strip_group_id` (shared UUID for all strips in this sequence), and sets `area_pct` on the first paddock window. The stored value is always `area_pct` — area-based input is converted to percentage using the paddock's total area from the `locations` table.

### 1.5 Step 3: Close-Out + New Event

Split panel:

**Left: Close current event**
- Date out (default: today)
- Time out (optional)
- Residual height (cm) — pre-filled from location's forage type default (3-tier config A17)
- Recovery min/max days — pre-filled from last observation or forage type default (3-tier config A17)
- Feed check prompt (if feed entries exist) — "How much feed remains?"
- **Confinement handling:** If any paddock windows point to confinement or partial-capture locations, the close summary shows captured NPK routed to the associated manure batch. Manure batch transaction created automatically based on `location.capture_percent × excretion NPK × (window duration / event duration)`.

**Right: New event (or join)**
- Date in (default: same as close date)
- Time in (optional)
- Pre-graze height (cm)
- Forage cover %
- Head count (auto-filled from group window)
- Feed to transfer (if any — "Move X bales to new location?")
- **Strip graze setup** (if selected in Step 2c): shows strip count and size summary

### 1.6 Save Actions (in order)

1. Create feed check with `is_close_reading: true` (if feed exists and user provided remaining)
2. Close all open paddock windows on source event (`date_closed = date_out`)
3. Close all open group windows on source event (`date_left = date_out`)
4. Set source event `date_out`
5. Create paddock_observation (type='close') with residual height, recovery days
6. Create new event at destination (or add group window to existing event)
7. Create paddock_observation (type='open') with pre-graze readings
8. Create feed transfer entries if user chose to move feed (new event_feed_entry with source_event_id = old event)
9. If strip graze: set `is_strip_graze = true`, `strip_group_id`, and `area_pct` on the first paddock window

### 1.7 Adaptation Notes for v2

- v1 had "anchor paddock" concept — **removed in v2**. All paddock windows close on move.
- v1's sub-move entity is replaced by paddock windows. Adding/removing paddocks mid-event (still called "sub-move" in the UI) is done via opening/closing paddock windows directly from the event card, not through the move wizard. See §2.
- Feed transfer uses `source_event_id` on the destination entry, not negative quantities.
- **Dairy milking routine (post-launch enhancement):** Saved schedule templates that auto-generate paddock windows (e.g., "6am–7:30am and 4pm–5:30pm daily at Milking Parlor"). Same data model as manual sub-moves — just removes the tedium of frequent daily entries.

---

## 2. Paddock Window Management (Sub-Moves)

**UI term:** Sub-move. **Backend:** `event_paddock_windows`. The farmer says "sub-move" — Claude Code writes `event_paddock_windows`. This section bridges the two.

Adding or removing a paddock (location) from an active event. Triggered from the event card via "Sub-move" or "Add location" button.

### 2.1 Open Paddock Window (Start Sub-Move)

- **Trigger:** "Sub-move" button on event card
- **Flow:** Location picker (same as Move Wizard Step 2a, filtered to available locations), date, time
- **Data:** Creates `event_paddock_window` with `date_opened`, `time_opened`
- **Side effect:** Creates `paddock_observation` (type='open') with pre-graze readings

### 2.2 Close Paddock Window (End Sub-Move)

- **Trigger:** "Close" button on the paddock's row within the event card
- **Primary paddock rule:** The first paddock window by `start_time` is the "primary" window. Its "Close" button is disabled — the user must close the entire event (§9) to leave the primary paddock. This prevents events from rolling indefinitely as paddocks open and close around a never-ending event. If the user wants to leave the primary paddock, they should close the event and start a new one via the Move wizard (§1).
- **Flow:** Date closed, time closed, residual height, recovery days, optional feed check for this paddock
- **Data:** Sets `date_closed`, `time_closed` on the paddock window
- **Side effect:** Creates `paddock_observation` (type='close') with residual data
- **Confinement handling:** If the location has `capture_percent > 0`, excretion NPK for the window's duration is routed to the associated manure batch.

### 2.4 Advance Strip (Strip Grazing)

- **Trigger:** "Advance Strip" button on event card (visible when event has any paddock window with `is_strip_graze = true` and an open strip window)
- **Flow:**
  1. Close current strip window: date closed, time closed, residual height, recovery days, optional feed check (same fields as §2.2)
  2. Open next strip window: date opened (default: same as close date), time opened, pre-graze height, forage cover, quality (same fields as §2.1)
  3. Option to **adjust remaining strip percentages** if the plan has changed mid-graze
  4. Option to **end strip grazing early** — closes current strip without opening next (remaining strips are never created)
- **Data:**
  - Closes current paddock window (`date_closed`, `time_closed`)
  - Creates `paddock_observation` (type='close') for current strip
  - Creates new `event_paddock_window` for same `location_id` with same `strip_group_id`, `is_strip_graze = true`, and next `area_pct`
  - Creates `paddock_observation` (type='open') for new strip
  - Strip number is derived (not stored): sequential count by `date_opened` within the `strip_group_id`

### 2.5 Design Note

V1's sub-move was a nested entity on the event with its own data structure and duration tracking. V2 replaces the separate entity with paddock windows — the same table used for the primary paddock. A "sub-move" is just a secondary paddock window on the same event. Time fields (`time_opened`, `time_closed`) enable sub-day NPK apportionment, which is critical for dairy operations where animals visit a milking parlor multiple times daily.

Strip grazing (§2.4) reuses the same paddock window model — each strip is a separate window on the same `location_id`, linked by `strip_group_id`. This means existing observation, feed, and NPK logic works per-strip without any special cases.

---

## 3. Group Window Management

Adding or removing a group from an active event. Triggered from the event card.

### 3.1 Add Group

- **Trigger:** "Add group" button on event card
- **Flow:** Group picker, date joined, time joined (optional), head count confirmation, avg weight confirmation
- **Data:** Creates `event_group_window` with `date_joined`, `time_joined`, `head_count` snapshot, `avg_weight_kg` snapshot

### 3.2 Remove Group

- **Trigger:** "Remove group" button on the group's row within the event card
- **Flow:** Date left, time left (optional), feed check prompt (if removing last group)
- **Data:** Sets `date_left`, `time_left` on the group window

### 3.3 Composition Change (e.g., Weaning)

When an animal moves from Group A to Group B mid-event:
1. Close Group A's window (date_left = today, captures current state)
2. Open new Group A window (date_joined = today, updated head_count and avg_weight_kg)
3. The animal's group membership is updated in animal_group_memberships
4. If Group B is on a different event, that event's Group B window also closes and reopens

This ensures DMI calculations are accurate per window — each window has a fixed head count.

---

## 4. Feed Delivery

Recording a feed delivery to a paddock within an active event. This is the most frequently used daily flow — farmers use it every morning and evening feeding.

### 4.1 Flow (Event-Picker-First)

- **Triggers:** "Feed Animals" button on feed screen, "Add feed" button on event card, or home screen group card "Feed" action
- **Step 1 — Select event:** List of all active events. Each row shows: location name(s), type badge (grazing/confinement), group name(s), day count, feed entry count. If opened from a group card, that group's event is pre-selected. Skip this step if opened from event card (event is known).
- **Step 2 — Log feeding:** Batch picker grouped by feed type. Each batch shows: label, remaining quantity, unit, DM%, cost per unit. User toggles batch selection and adjusts quantity with stepper (±0.5 increments). Live DM calculation and cost display update as quantity changes. Date and time default to now.
- **Save:** Creates `event_feed_entry` with `event_id`, `batch_id`, `location_id`, `date`, `quantity`. If event has multiple open paddock windows, user picks which paddock received the feed.

### 4.2 Field Mode Behavior

After saving, the sheet stays open and returns to the event picker (Step 1) — farmer can feed the next group without leaving the flow. "Done" button instead of backdrop close. This supports the morning/evening feeding routine where you're walking paddock to paddock with your phone.

### 4.3 Rules

- `location_id` is required — feed is always delivered to a specific paddock (A4)
- Quantity is always positive
- Batch remaining is computed by the calculation layer (total original − sum of all deliveries), not stored (A2)

---

## 5. Feed Check (Standalone)

Checking how much feed remains mid-event. Triggered from event card → "Check feed" button.

### 5.1 Flow

- **Shows:** One row per batch × paddock combination that has feed entries on this event
- **Per row:** Batch name, paddock name, "Started: X units" (computed via DMI-1a), remaining quantity input
- **Saves:** Creates event_feed_check (parent) + event_feed_check_items (one per row)

### 5.2 "Started" Display

The "Started: X units" value is computed as:
- If a prior check exists: last check's remaining_quantity + new deliveries since that check
- If no prior check: total delivered to this batch × paddock from event start

This is the corrected formula from v1 bug DMI-1a. **Both the standalone feed check AND the move wizard inline check must use the same calculation.**

---

## 6. Feed Transfer (during Move)

Moving leftover feed from a closing event to the next event.

### 6.1 Flow (integrated into Move Wizard Step 3)

- User sees remaining feed per batch per paddock (from last feed check or estimate)
- For each batch: "Move to new event?" toggle, quantity to move
- Remainder = recorded as feed residual (baked-in close reading)

### 6.2 Data Created

For each transferred batch:
1. **Feed check** on source event: is_close_reading = true, remaining = leftover after transfer
2. **Feed entry** on destination event: batch_id, location_id (new paddock), quantity = amount moved, source_event_id = old event's id

### 6.3 Source Tracking

The destination feed entry's `source_event_id` points to the source event. This lets the UI show "Transferred from [Event X]" and lets the calculation layer trace feed provenance.

---

## 7. Survey Workflow

Recording pasture assessments — either bulk (walk the whole farm) or single (one paddock).

### 7.1 Bulk Survey

- **Trigger:** Home screen nudge ("Time for a pasture walk?") or Locations screen → "Survey" tab → "New bulk survey"
- **Creates:** Survey with type='bulk', status='draft'
- **Flow:** Scrollable list of all non-archived locations. Each row has inputs for: forage_height_cm, forage_cover_pct, forage_condition (4-option picker: poor/fair/good/excellent), forage_quality (numeric input within farm-configurable range — see `farm_settings.forage_quality_scale_min/max`, default 1–100), bale_ring_residue_count, recovery_min_days, recovery_max_days, notes
- **Draft auto-save:** Each entry saved as survey_draft_entry. User can leave and resume.
- **Commit:** "Finish survey" button. Each draft entry becomes a paddock_observation (source='survey', source_id=survey.id). Survey status → 'committed'. Entries become read-only.

### 7.2 Single-Paddock Survey

- **Trigger:** Location card → "Survey" or Locations screen → individual paddock
- **Creates:** Survey with type='single', status='draft'
- **Flow:** Same fields as bulk, but for one location only
- **Commit:** Same as bulk — creates one paddock_observation

### 7.3 Design Note

Surveys don't have a farm_id on the parent record. A bulk survey can span locations across farms. The farm context comes from each location's farm_id.

---

## 8. Amendment Entry

Recording fertilizer, lime, compost, or manure applications.

### 8.1 Flow

- **Trigger:** Locations screen → "Apply amendment" or individual location → "Apply input"
- **Fields:** Date, source type toggle (product / manure), product picker (from input_products), quantity, unit, cost override, paddock multi-select, notes
- **NPK preview:** Computed from product NPK% × quantity, displayed before save
- **Save:** Creates one `amendment` (parent) with one `amendment_location` child per selected paddock. Quantity and nutrients split proportionally by area.

### 8.2 Adaptation Notes

- v1 had separate `input_applications` and `amendments` — **v2 merges these** into a single amendments table (Decision from gap audit)
- Per-paddock records are in amendment_locations (child table)
- NPK computed at display time from product composition × quantity, not stored

---

## 9. Event Close Sequence (without Move)

Closing an event when the group is going off-pasture entirely (e.g., sold, to barn, end of season).

### 9.1 Flow

- **Trigger:** Event card → "Close event"
- **Fields:** Date out, time out, residual height, recovery days, feed check (if feed exists)
- **Data:** Same close actions as Move Wizard Step 3 left side, without creating a new event
- **Confinement handling:** Same as Move Wizard — if any paddock windows point to confinement or partial-capture locations, captured NPK is routed to the associated manure batch based on `location.capture_percent × excretion NPK × (window duration / event duration)`.

---

## 10. Harvest Recording

Recording a hay/silage harvest session.

### 10.1 Flow

- **Trigger:** Feed screen → "Record harvest" or Locations screen → individual location → "Record harvest"
- **Creates:** harvest_event (parent) with date
- **Per field:** Location picker, feed type (filtered to `harvest_active = true` on `feed_types` — farmer toggles which types are harvest-eligible from feed type management), quantity, weight per unit, DM%, cutting number, notes
- **Save:** Creates harvest_event_fields. Each field record auto-creates a batch (feed inventory) with source='harvest'. batch_id is set on the harvest field record for traceability.

---

## 11. Event Card (Interaction Hub)

The event card is the central interface for daily operations. All event-related sub-flows (§2–§6, §9) are accessed from here. See V2_DESIGN_SYSTEM.md §4.8 for visual layout.

### 11.1 Card Display

- **Header:** Primary location name(s) from open paddock windows, event start date, day count (derived), status badge (active/closed)
- **Paddock section:** List of paddock windows — each showing location name, type badge (grazing/confinement), open/closed status, date range. Active windows highlighted. The first paddock window by `start_time` is labeled "Primary" and cannot be closed independently (see §2.2). **Strip graze display:** When any paddock window has `is_strip_graze = true`, shows strip progress indicator (e.g., "Strip 2 of 4 — East Meadow") with a segment bar showing grazed/current/upcoming strips.
- **Group section:** List of group windows — each showing group name, head count snapshot, avg weight snapshot, open/closed status.
- **Feed summary:** Recent feed entries, total delivered, DM consumed (computed).
- **Live metrics (active events):** AU, AUD, DMI target vs actual, pasture vs stored feed %, NPK deposited (all computed on read per A2).

### 11.2 Actions

| Button | Triggers | Section |
|--------|----------|---------|
| Sub-move | Open paddock window (start sub-move) | §2.1 |
| Close [paddock name] | Close paddock window (end sub-move). **Disabled on primary paddock** (first by start_time) — user must close event instead. | §2.2 |
| Advance Strip | Close current strip, open next (strip graze events only) | §2.4 |
| Add group | Add group window | §3.1 |
| Remove [group name] | Remove group window | §3.2 |
| Feed | Feed delivery flow | §4 |
| Check feed | Standalone feed check | §5 |
| Move | Move wizard (close + new event) | §1 |
| Close event | Event close sequence | §9 |
| Edit | Edit event metadata (dates, notes) | — |

### 11.3 Design Note

In v1, this was the "Edit Event" sheet (GRZ-02). V2 keeps the same role — it's the hub from which daily paddock, group, and feed actions are managed. The difference is that v2's sub-flows use normalized tables (paddock windows, group windows, feed entries) instead of v1's nested arrays on the event object.

---

## 12. Batch Adjustment & Reconciliation

Correcting feed inventory quantities and recording feed quality tests. Carried forward from v1 (FED-08) with normalized data model.

### 12.1 Edit Batch

- **Trigger:** Feed screen → batch row → "Edit"
- **Flow:** Update batch attributes — original quantity, weight per unit, cost per unit, DM%
- **Rule:** If original quantity changes, remaining adjusts proportionally. Warning displayed if batch has been used in events.
- **Data:** Updates `batch` record directly.

### 12.2 Reconcile (Physical Count)

- **Trigger:** Feed screen → batch row → "Reconcile"
- **Flow:** Enter physical count (what's actually in the barn). System computes delta (new count − system count). User picks reason: Entry Error, Waste, Sold, Reconciliation Adjustment.
- **Data:** Creates `batch_adjustment` record with `adjustment_type`, `quantity_delta`, `reason`, `previous_quantity`, `new_quantity`, `adjusted_by` (current user). Updates batch remaining.

### 12.3 Feed Test Recording

- **Trigger:** Feed screen → batch row → "Feed test" or from batch detail
- **Flow:** Lab result entry — DM%, N%, P%, K%, protein%, ADF%, NDF%, TDN%, RFV, lab name, date tested, notes.
- **Data:** Creates `batch_nutritional_profile` with `source = 'feed_test'`, `tested_at`. Latest profile by `tested_at` is used in calculations.

---

## 13. Feed Day Goal

Planning target for stored feed inventory. Drives the feed screen's color-coded "days on hand" display.

### 13.1 Setting

- **Location:** Feed screen header or farm settings
- **UI label:** "Days of Stored Feed on Hand"
- **Field:** `farm_settings.feed_day_goal` (integer, default 90, range 7–365)
- **Per-farm:** Each farm sets its own target (A18).

### 13.2 Feed Screen Display

- **Days on hand** = total DM on hand ÷ daily DMI run rate (sum of all group DMI targets)
- **Color coding:** Green ≥ goal, amber 33–99% of goal, red < 33% of goal
- **Progress bar:** Days as percentage of goal

---

## 14. Reusable Health & Recording Components

**Design principle:** Each health recording form is a single reusable sheet component invoked from multiple entry points with context pre-fill. No form is duplicated — the same Weight Recording sheet is used whether opened from the animal edit dialog, a quick-action button on the animal list, a group weight session, or the calving flow. Entry point determines which fields are pre-filled and what happens after save.

### 14.1 Component Inventory

| Component | Schema Table | Entry Points |
|-----------|-------------|--------------|
| Weight Recording | `animal_weight_records` (D9.10) | Animal edit sheet, per-animal quick-action, group weight session, calving flow (birth weight) |
| BCS Recording | `animal_bcs_scores` (D9.5) | Animal edit sheet, per-animal quick-action, group BCS session |
| Treatment Recording | `animal_treatments` (D9.6) | Animal edit sheet, per-animal quick-action, group treatment session |
| Breeding Recording | `animal_breeding_records` (D9.7) | Animal edit sheet, per-animal quick-action |
| Heat Recording | `animal_heat_records` (D9.8) | Animal edit sheet, per-animal quick-action, field mode quick-access |
| Calving Recording | `animal_calving_records` (D9.9) | Animal edit sheet (females only) |
| Animal Note | *(see §14.8 design note)* | Animal edit sheet, per-animal quick-action |

### 14.2 Weight Recording Sheet

**Schema:** `animal_weight_records` — `weight_kg` (numeric, metric internal), `recorded_at` (timestamptz), `source` (text), `notes` (text).

**Fields:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Weight | number input | — | Displayed in user's unit preference (lbs/kg). Stored as `weight_kg`. Step increment: 1 in lbs, 0.5 in kg. |
| Date | date picker | today | Maps to `recorded_at` |
| Note | text input | — | Optional. "Pre-shipping weight", "Post-wean", etc. |

**Context pre-fill by entry point:**

| Entry Point | Pre-filled | Source tag | After save |
|-------------|-----------|------------|------------|
| Animal edit sheet → weight history "+" | `animal_id` | `'manual'` | Refresh weight history list in animal edit |
| Per-animal quick-action button | `animal_id` | `'manual'` | Close sheet, refresh animal row (show updated weight) |
| Group weight session (§14.9) | `animal_id` (iterated) | `'group_update'` | Advance to next animal in group |
| Calving flow → birth weight | `animal_id` (new calf) | `'calving'` | Return to calving sheet (weight embedded, not a separate save) |

**Validation:** Weight > 0, weight < 5000 kg (sanity cap). Date required.

### 14.3 BCS Recording Sheet

**Schema:** `animal_bcs_scores` — `score` (numeric), `scored_at` (timestamptz), `likely_cull` (boolean), `notes` (text).

**Fields:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Score | chip selector (1–9 for cattle, 1–5 for sheep/goat) | — | Tap to select. Half-scores supported (tap between chips or long-press for .5). Species range driven by `operation_settings.species_type`. |
| Likely cull | toggle | false | Flags animal for culling review |
| Date | date picker | today | Maps to `scored_at` |
| Notes | textarea (2 rows) | — | Optional |

**Context pre-fill by entry point:**

| Entry Point | Pre-filled | After save |
|-------------|-----------|------------|
| Animal edit sheet → health history "+" | `animal_id`, last BCS shown for reference | Refresh health history |
| Per-animal quick-action button | `animal_id` | Close sheet, refresh animal row |
| Group BCS session (§14.9) | `animal_id` (iterated), last BCS shown | Advance to next animal |

### 14.4 Treatment Recording Sheet

**Schema:** `animal_treatments` — `treatment_type_id` (FK → treatment_types), `treated_at` (timestamptz), `product` (text), `dose_amount` (numeric), `dose_unit_id` (FK → dose_units), `withdrawal_date` (date), `notes` (text).

**Fields:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Treatment type | dropdown | — | Populated from `treatment_types` grouped by `treatment_categories`. "Add custom…" option at bottom opens inline create. |
| Product/drug | text input | — | Optional. Brand or generic name. |
| Dose amount | number input | — | Optional. Numeric portion only. |
| Dose unit | dropdown | last used | Populated from `dose_units` ('ml', 'cc', 'mg', 'tablet', etc.) |
| Withdrawal date | date picker | — | Optional. End of withdrawal period. Shown with calculated days-from-today. |
| Date | date picker | today | Maps to `treated_at` |
| Time | time picker | now | Optional |
| Notes | textarea (2 rows) | — | Optional |

**Context pre-fill by entry point:**

| Entry Point | Pre-filled | After save |
|-------------|-----------|------------|
| Animal edit sheet → health history "+" | `animal_id` | Refresh health history |
| Per-animal quick-action button | `animal_id` | Close sheet, refresh animal row |
| Group treatment session (§14.9) | `animal_id` (iterated), treatment type + product + dose (carried forward from first entry for batch consistency) | Advance to next animal |

**Withdrawal alert:** If `withdrawal_date` is in the future, animal row shows a withdrawal badge until the date passes. This is computed on read, not stored.

### 14.5 Breeding Recording Sheet

**Schema:** `animal_breeding_records` — `bred_at` (timestamptz), `method` (text: 'ai' or 'bull'), `sire_animal_id` / `sire_ai_bull_id` (FKs), `semen_id` (text), `technician` (text), `expected_calving` (date), `confirmed_date` (date), `notes` (text).

**Fields (common):**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Method | toggle: AI / Bull | — | Required. Determines which sire fields appear. |
| Date bred | date picker | today | Maps to `bred_at` |
| Expected calving | date picker | bred_at + gestation days | Auto-calculated from species gestation (cattle: 283, sheep: 150, goat: 150). User can override. |
| Notes | textarea (2 rows) | — | Optional |

**Method-specific fields:**

| Method | Fields |
|--------|--------|
| AI | Sire (dropdown from `ai_bulls`, + free-text option), Semen straw/lot ID (text), Technician (text) |
| Bull | Sire (dropdown from male animals in operation, + free-text name option) |

**Confirmation (edit mode only):** When editing an existing breeding record, a "Confirm pregnancy" date picker appears. Setting `confirmed_date` marks the animal as confirmed bred (derived status on animal record).

**Context pre-fill by entry point:**

| Entry Point | Pre-filled | After save |
|-------------|-----------|------------|
| Animal edit sheet | `animal_id` | Refresh breeding/health history |
| Per-animal quick-action button | `animal_id` | Close sheet, refresh animal row |

**Female-only:** This sheet is only available for female animals. Entry points are hidden for males.

### 14.6 Heat Recording Sheet

**Schema:** `animal_heat_records` — `observed_at` (timestamptz), `notes` (text).

**Two-step interface** (when animal is not pre-selected):

**Step 1 — Animal Picker:**
- Filter bar: group picker, class picker, search by tag/name
- **Female filter always on** — only female animals shown (heat is female-only)
- Animal list: tag, name, class badge, last heat date (if any), days since last heat
- Tap animal → advance to Step 2

**Step 2 — Heat Details:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Date | date picker | today | Maps to `observed_at` |
| Time | time picker | now | Optional |
| Notes | textarea (2 rows) | — | "Standing heat", "Mounting observed", etc. |

**Context pre-fill by entry point:**

| Entry Point | Step 1 (picker) | Pre-filled | After save |
|-------------|----------------|-----------|------------|
| Animal edit sheet | Skipped | `animal_id` | Refresh heat history in animal edit |
| Per-animal quick-action button | Skipped | `animal_id` | Close sheet, refresh animal row |
| Field mode quick-access (§16.4) | Shown (full picker) | — | Return to field mode home |

**Batch recording:** From the animal picker (Step 1), user can select multiple animals before advancing to Step 2. One heat record per selected animal, all sharing the same `observed_at` and notes. This supports the common pattern of observing multiple animals in heat during a single pasture walk.

### 14.7 Calving Recording Sheet

**Schema:** `animal_calving_records` — `dam_id` (FK → animals), `calf_id` (FK → animals), `calved_at` (timestamptz), `sire_animal_id` / `sire_ai_bull_id` (FKs), `stillbirth` (boolean), `dried_off_date` (date), `notes` (text).

**Fields:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Calving date | date picker | today | Maps to `calved_at` |
| Calf sex | dropdown: Female / Male | — | Required (unless stillbirth) |
| Calf ear tag | text input | auto-assigned if blank | Optional. Next available tag in sequence if left empty. |
| Calf class | dropdown | auto-selected from sex + species defaults | Suggested based on sex (e.g., "Heifer calf" for female cattle) |
| Calf group | dropdown | dam's current group | Which group the calf joins |
| Birth weight | weight input | — | Optional. Uses Weight Recording component inline (§14.2) with `source='calving'`. Displayed in user's unit preference. |
| Sire | conditional | from dam's last breeding record | If dam has a breeding record, auto-fills sire. Otherwise, manual sire picker (same AI/Bull toggle as §14.5). |
| Stillbirth | toggle | false | If true: calf sex still required for records, but no calf animal record is created (or created as `active=false`). Birth weight, tag, class, and group fields hidden. |
| Dried off date | date picker | — | Optional. Relevant for dairy operations. Maps to `dried_off_date`. |
| Notes | textarea (2 rows) | — | "Difficult birth", "Twins — see second record", etc. |

**Save actions (in order):**

1. Create new animal record for calf (sex, tag, class, group, birth_date = calving date, dam_id = dam)
2. Create `animal_group_membership` for calf → selected group
3. Create `animal_weight_record` on calf with birth weight (if provided), `source='calving'`
4. Create `animal_calving_record` linking dam → calf
5. If sire known: set `sire_animal_id` or `sire_ai_bull_id` on both calving record and calf's animal record

**Entry point:** Animal edit sheet → calving history section → "+ Record calving" button. Female-only.

**Info banner:** Shows "Calf will be added to [Group Name]" with the selected group, so the farmer knows where the calf lands.

### 14.8 Animal Note Sheet

**Design note:** V1 stored notes as health events (`type: 'note'`) in an array on the animal record. V2 splits health events into separate tables (D9.5–D9.10) but does not define a dedicated `animal_notes` table. Two options:

**Option A (recommended):** Add `animal_notes` table to schema (id, operation_id, animal_id, noted_at, note, created_at, updated_at). Lightweight, follows the same pattern as other D9 tables. Preserves the quick-note workflow that farmers use daily.

**Option B:** Drop per-animal notes as a standalone record type. Animal-level notes live only in the `animals.notes` text field. Health-specific observations go into the appropriate record type (treatment notes, BCS notes, etc.).

**OPEN_ITEMS entry required** — Tim to decide before CP-33 implementation. If Option A: schema update needed. If Option B: remove note quick-action button from component inventory.

**Pending decision, the sheet would follow Option A:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Date | date picker | today | |
| Time | time picker | now | Optional |
| Note | textarea (3 rows) | — | Required. Free-form observation. |

### 14.9 Group Session Mode

Several health recording components support a **group session** — recording the same type of data for multiple animals in sequence. This is a wrapper pattern, not a separate component.

**Flow:**
1. **Select group** — Group picker (or "All animals" option)
2. **Select recording type** — Weight, BCS, or Treatment
3. **Iterate through animals** — The selected recording sheet (§14.2, §14.3, or §14.4) opens with the first animal pre-filled. After save, it advances to the next animal in the group. Skip button available.
4. **Summary on completion** — Count recorded, count skipped, any warnings (e.g., "3 animals flagged as likely cull during BCS")

**Treatment session special behavior:** After the first animal's treatment is saved, subsequent animals in the session pre-fill treatment type, product, and dose from the first entry. The farmer only confirms or adjusts per animal. This supports the "working the chute" pattern where the same treatment is given to the whole group.

**Weight session special behavior:** Shows running average and count as animals are weighed. Displays group average weight after completion.

### 14.10 Per-Animal Quick-Action Bar

Every animal row in the animal list displays a row of quick-action buttons. Each button opens the corresponding reusable sheet with that animal's ID pre-filled.

| Button | Icon | Opens | Condition |
|--------|------|-------|-----------|
| Edit | pencil | Animal Edit Sheet (§15.1) | Always |
| Weight | scale | Weight Recording (§14.2) | Always |
| Note | note | Animal Note (§14.8) | Always |
| Treatment | syringe | Treatment Recording (§14.4) | Always |
| Breeding | ♀ | Breeding Recording (§14.5) | Female only |
| BCS | chart | BCS Recording (§14.3) | Always |
| Todo | checklist | Per-animal todo (links to task system) | Always |

Buttons use `event.stopPropagation()` to prevent the row's tap-to-edit behavior. On mobile (< 640px), buttons collapse into a swipe-reveal or overflow menu to conserve row width.

---

## 15. Entity CRUD Forms

Reusable sheet components for creating and editing core entities. Each form has two modes: **create** (empty fields, "Add" button) and **edit** (pre-filled from existing record, "Save" button). The same sheet component handles both modes — the entry point determines which mode activates.

### 15.1 Animal Edit Sheet

The primary interface for viewing and managing an individual animal. Combines CRUD fields with embedded health history and action shortcuts.

**Fields (create and edit):**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Ear tag | text | No | Unique per operation if provided |
| EID | text | No | Electronic ID (e.g., 840-…) |
| Sex | dropdown: Female / Male | Yes | |
| Class | dropdown | No | From `animal_classes` |
| Current weight | number (display only in edit) | No | Latest from `animal_weight_records`. Tap opens Weight Recording (§14.2). In create mode: editable input, creates initial weight record on save. |
| Group | dropdown | No | From `groups`. Sets `animal_group_memberships` |
| Dam/Mother | dropdown | No | From female animals in operation |
| Sire | text or dropdown | No | Free-text name, or pick from male animals / AI bulls |
| Birth date | date picker | No | Drives weaning target calculation |
| Weaned | toggle | No | With conditional wean date picker |
| Notes | textarea | No | General notes on this animal |

**Female-only sections (edit mode):**

- **Confirmed bred status** — Toggle + confirmation date. Derived from latest breeding record with `confirmed_date`, but can be manually toggled.
- **Calving history** — Chronological list of calving records. Each row: date, calf tag, calf sex, sire. "+ Record calving" button → Calving Recording Sheet (§14.7).
- **Heat history** — Recent heat observations. Each row: date, days since, notes snippet. "+ Record heat" button → Heat Recording Sheet (§14.6, step 2 only).

**All-animal sections (edit mode):**

- **Weight history** — Scrollable list (most recent first). Each row: date, weight (in display units), source badge, note. "+ Record weight" button → Weight Recording Sheet (§14.2).
- **Health timeline** — Merged chronological view of treatments, BCS scores, breeding events, and notes. Each row: date, type icon, summary text. "+ Add" button → type picker → appropriate recording sheet.
- **Cull section** — "Mark as culled" with date, reason dropdown (sold, died, poor performance, age, other), and notes. Reversible via "Reactivate" button.

**Save actions (create mode):**

1. Create `animal` record
2. If group selected: create `animal_group_membership` (date_joined = today, reason = 'initial')
3. If weight entered: create `animal_weight_record` (source = 'manual')

**Save actions (edit mode):**

1. Update `animal` record fields
2. If group changed: close current membership (date_left = today), create new membership (reason = 'move')
3. Cull action: set `active = false`, `cull_date`, `cull_reason`, `cull_notes`

### 15.2 Group CRUD Sheet

**Fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Name | text | Yes | |
| Color | color picker | No | For UI badges and calendar display |
| Description | text | No | "Spring calvers", "Finishing steers", etc. |

**Edit mode additions:**

- **Member list** — Animals currently in this group. Each row: tag, name, class, weight. Tap → Animal Edit Sheet.
- **Add animals** — Multi-select animal picker (animals not in any group, or from other groups with transfer confirmation).
- **Remove animals** — Swipe-to-remove or multi-select remove. Creates `animal_group_membership` close record.

### 15.3 Location CRUD Sheet

**Fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Name | text | Yes | |
| Type | toggle: Land / Confinement | Yes | |
| Farm | dropdown | Yes | From `farms` |
| Area | number | No (land only) | In user's display units (acres/hectares). Stored as hectares. |
| Forage type | dropdown | No (land only) | From `forage_types`. Drives 3-tier config defaults (A17). |
| Water source | toggle | No | |
| Shade available | toggle | No | |
| Capture percent | number (0–100) | No (confinement) | Portion of excretion captured for manure tracking |
| Associated manure batch | dropdown | No (confinement) | FK to manure batch for NPK routing |
| Notes | textarea | No | |

**Edit mode additions:**

- **Observation history** — Recent paddock observations (from surveys, event opens/closes). Read-only summary.
- **Event history** — Past events at this location. Each row: date range, group(s), days occupied.
- **Recovery status** — Current recovery state: days since last grazed, recovery window, ready date.

### 15.4 Feed Type CRUD Sheet

**Fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Name | text | Yes | "Orchard Grass Hay", "Corn Silage", etc. |
| Category | dropdown | Yes | Hay, Silage, Grain, Supplement, Other |
| DM% default | number | No | Default dry matter %. New batches inherit this. |
| Harvest active | toggle | No | Whether this type appears in harvest recording (§10). |
| Default NPK | number × 3 | No | N%, P%, K% defaults for new batches |
| Notes | textarea | No | |

### 15.5 Design Note on CRUD Consistency

All CRUD sheets follow the same interaction pattern from V2_APP_ARCHITECTURE.md (A12):

- Always in DOM, shown/hidden via `.open` class on `-wrap` div
- Backdrop click → close (discard unsaved changes with confirmation if dirty)
- `onOpen(context)` receives entity ID (edit mode) or null (create mode)
- `onSave()` validates → store action → close sheet → notify subscribers
- `onClose()` resets form state
- Delete action (edit mode only): confirmation dialog → soft delete (archive) or hard delete depending on entity type

---

## 16. Field Mode

A dedicated mobile-optimized UI mode for in-the-paddock work. Strips away navigation chrome and presents the most common field tasks as large, tappable action tiles. Designed for use while walking, wearing gloves, or in bright sunlight.

### 16.1 Activation

- **Toggle:** "Field" button in the app header (visible on all screens)
- **Persistence:** Stored in user preferences. Once activated, field mode persists across sessions until toggled off.
- **URL:** `?field=*` parameter also activates field mode (for bookmarking)

### 16.2 Field Mode Home Screen

The home screen in field mode replaces the standard dashboard with a task-oriented layout:

**Action Tiles (top section, 2×2 grid):**

| Tile | Opens | Flow |
|------|-------|------|
| Feed Animals | Feed Delivery sheet (§4) | Event picker → batch picker → save → return to event picker (§4.2 loop behavior) |
| Harvest | Harvest Recording sheet (§10) | Location → feed type → quantity → save → return home |
| Multi-Pasture Survey | Survey workflow (§7.1) | Bulk survey draft → walk paddock-to-paddock → commit → return home |
| Animals | Animals screen (field mode variant) | Animal list with quick-action bar (§14.10), full-screen sheets |

**Active Events (middle section):**

Scrollable list of all active events. Each row shows:
- Location name(s) from open paddock windows
- Group name(s) and head count
- Day count badge
- Feed status indicator (fed today: green dot, not fed: amber dot)
- **"Move"** button → Move Wizard (§1)

**Tasks (bottom section):**

Pending animal todos and time-sensitive items:
- Animals with withdrawal dates ending soon
- Overdue survey nudge (if last bulk survey > N days)
- Animals approaching weaning target date
- Upcoming expected calving dates

### 16.3 Field Mode Navigation

Field mode uses a simplified two-level navigation instead of the standard tab bar:

| Location | Header button | Action |
|----------|--------------|--------|
| Field mode home | "← Detail" | Exit field mode, return to standard dashboard |
| Any sub-screen (Animals, Feed, Survey) | "⌂ Home" | Return to field mode home (stay in field mode) |

**Sheet behavior in field mode:**
- All sheets expand to full-screen on mobile (no partial-height drawers)
- "Done" button instead of backdrop close (prevents accidental dismiss while walking)
- Backdrop tap-to-close disabled
- After save, return to field mode home (not the originating screen)

### 16.4 Record Heat Quick-Access

A dedicated quick-access flow available from the Animals screen in field mode. This supports the common pattern of spotting animals in heat while walking paddocks.

**Flow:**

1. **Animals screen (field mode)** → Animal list with standard quick-action bar
2. **Any animal's Breeding quick-action** → Opens Heat Recording Sheet (§14.6) with animal picker (Step 1) if needed, or directly to Step 2 if animal is pre-selected
3. **Alternatively:** Dedicated "Record Heat" action accessible from field mode Animals screen header — opens Heat Recording Sheet at Step 1 (animal picker, female-filtered)

**Animal picker filter defaults (field mode):**
- Female only (always on, non-removable in heat context)
- Class filter available (e.g., show only cows, not heifers)
- Group filter defaults to groups with active events (animals currently on pasture)
- Search by tag or name

**After save:** Return to field mode home.

### 16.5 Feed Check from Field Mode

When "Feed Animals" tile is selected:
- After completing a feed delivery, the sheet returns to the event picker (§4.2) — not to field mode home
- "Done" button on the event picker returns to field mode home
- This supports the morning/evening feeding loop: feed group 1 → feed group 2 → … → Done

### 16.6 Design Notes

- Field mode is a **UI mode**, not a separate app. The same store, sync, and data layer powers both modes. The difference is navigation structure and sheet presentation.
- Field mode is primarily a mobile pattern, but works on tablet/desktop with the same tile layout (tiles scale up, sheets remain full-width on mobile, standard width on desktop).
- All data entered in field mode syncs through the same SyncAdapter (A10) — no special offline handling needed beyond what the standard app provides.
- V1's field mode handlers (`_fieldModeMoveHandler`, `_fieldModeFeedCheckHandler`, `_fieldModePastureSurveyHandler`, `_fieldModeHeatHandler`) map directly to the four action tiles in v2.

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-04-12 | Session 11 — UX flow gap fill | Added §14 (reusable health & recording components — 10 subsections covering weight, BCS, treatment, breeding, heat, calving, note, group sessions, quick-action bar), §15 (entity CRUD forms — animal, group, location, feed type), §16 (field mode — home screen, navigation, heat quick-access, feed loop). Component-first approach: each form documented once with entry points and context pre-fill mapped. |

---

*End of document. For data schemas see V2_SCHEMA_DESIGN.md. For code patterns see V2_APP_ARCHITECTURE.md. For formulas see V2_CALCULATION_SPEC.md. For visual patterns see V2_DESIGN_SYSTEM.md.*
