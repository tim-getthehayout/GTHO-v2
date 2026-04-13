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

**Farm chip (top of picker):** Label reads "Farm: {farmName}" with chevron ▾, styled per §3.7 filter pill. Defaults to the current `active_farm_id` (or the first farm if in All farms mode). Tap opens a short menu of farms the user has access to. Selecting a different farm re-filters the section lists below to show that farm's locations. The chip selection is scoped to this wizard instance only — it does NOT change `active_farm_id`. When the destination farm differs from the source event's farm, the wizard is a cross-farm move: on save, the new destination event's `source_event_id` is set to the closing source event's id (§5.1).

Four sections, each showing location cards:

| Section | Filter | Card shows |
|---------|--------|------------|
| Ready | No active event, recovery window passed | Name, land_use badge, days since last graze, last event date |
| Recovering | No active event, still in recovery window | Name, recovery days remaining, recovery window dates |
| In Use | Has active event | Name, current group(s), days occupied |
| Confinement | type='confinement' | Name |

Each card shows enough info to make a grazing decision without opening another screen.

### 1.3 Step 2b: Existing Event Picker (Join Existing)

**Farm chip (top of picker):** Same behavior as §1.2 — filters the list to events on the selected farm. Default is current active farm. Joining an event on a different farm from the source is a valid cross-farm move: the source event closes, animals migrate to the existing destination event (`animal_group_memberships` update), and the destination event's `event_group_windows` extend to include the arriving group.

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

**Schema:** `animal_notes` (D9.11) — `noted_at` (timestamptz), `note` (text). Schema amendment: add `animal_notes` table to D9 (id, operation_id, animal_id, noted_at, note, created_at, updated_at). Follows the same pattern as other D9 health record tables. Preserves the quick-note workflow that farmers use daily ("limping on left front", "separated from herd").

**Fields:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Date | date picker | today | Maps to `noted_at` |
| Time | time picker | now | Optional |
| Note | textarea (3 rows) | — | Required. Free-form observation. |

**Context pre-fill by entry point:**

| Entry Point | Pre-filled | After save |
|-------------|-----------|------------|
| Animal edit sheet → health timeline "+" | `animal_id` | Refresh health timeline |
| Per-animal quick-action button | `animal_id` | Close sheet, refresh animal row |

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

The user's pending tasks from the todo table, filtered to the current user. Each row shows task description, associated animal/group (if any), and due date. Tap opens the task detail. "Add task" button at bottom.

**Note:** Time-sensitive alerts (withdrawal dates ending soon, overdue survey nudges, weaning targets, upcoming calving dates) belong on the **detail home screen** as dashboard widgets — not in field mode. Field mode tasks are the user's explicit todo list, not system-derived alerts.

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

## 17. Home Screen (Dashboard) & Todos

The home screen is the default view (`#/`) and the most-visited screen. It provides a real-time overview of the operation: farm performance stats, group/location cards, open tasks, survey prompts, and weaning alerts. V1 reference: `renderHome()` (index.html line 5533).

### 17.1 Screen Layout

**Desktop (≥900px):**
```
┌─────────┬──────────────────────────────────────────┐
│ sidebar │ Header: Farm name · sync dot · version   │
│ 220px   │         [Feedback] [Field]               │
│         ├──────────────────────────────────────────┤
│ nav     │ Farm Overview          [24h][3d][7d][30d][All]
│ items   │ {totalHead} head · {groupCount} groups · │
│         │ {activeCount} active                     │
│         │ ┌────────┬────────┬────────┬────────┬────────┐
│         │ │Past.DMI│Fd Cost │Past. % │NPK/Ac  │NPK Val │
│         │ └────────┴────────┴────────┴────────┴────────┘
│         │                                          │
│         │ View: [Groups] [Locations]               │
│         │ ┌─────────────┐ ┌─────────────┐         │
│         │ │ Group Card  │ │ Group Card  │ 2-col   │
│         │ │ (expanded)  │ │ (expanded)  │         │
│         │ └─────────────┘ └─────────────┘         │
│         │                                          │
│         │ My open tasks              [All tasks]   │
│         │ ┌─ task card (compact) ──┐               │
│         │ └────────────────────────┘ up to 4       │
│         │ [+ Add task]                             │
│         │                                          │
│         │ {Survey card if draft exists}            │
│         │ {Weaning nudge if applicable}            │
│ sync    │                                          │
│ strip   │                                          │
└─────────┴──────────────────────────────────────────┘
```

**Mobile (<900px):**
```
┌──────────────────────────┐
│ Header: Farm name · sync │
│         [Feedback] [Field]│
├──────────────────────────┤
│ Grazing performance      │
│ [24h][3d][7d][30d]       │
│ ┌────────┬────────┬──────┐
│ │Past. % │NPK/ac  │Fd $/d│  3-col
│ └────────┴────────┴──────┘
│                          │
│ View: [Groups][Locations]│
│ ┌── Group Card ──────▼──┐│ collapsed
│ ├── Group Card ──────▼──┤│ by default
│ └── Group Card ──────▼──┘│
│                          │
│ My open tasks  [All tasks]│
│ ┌── task (compact) ─────┐│
│ └────────────────────────┘│ up to 4
│ [+ Add task]              │
│                          │
│ {Survey card}            │
│ {Weaning nudge}          │
│                          │
├──────────────────────────┤
│ bnav: Home Animals Todos │
│        Events Locations  │
│        Feed Settings     │
└──────────────────────────┘
```

**Rendering order:** Header → stats row → view toggle → group/location grid → open tasks section → survey card (if draft exists) → weaning nudge (if applicable).

**No FAB.** V1's floating action button opened the feedback sheet. V2 replaces this with a feedback button in the header bar (see §17.2).

### 17.2 Header Bar

The header bar is sticky top on both mobile and desktop. Two clusters: identity on the left, actions on the right.

**Left cluster — identity (two lines):**

| Element | Source | Notes |
|---------|--------|-------|
| Operation name | `store.getAll('operations')[0].name` | Line 1, primary identity. 18px/700, `--text`, letter-spacing `-0.3px`. Truncates with ellipsis on narrow viewports before the farm picker does. If no operation exists (pre-onboarding), show "Get The Hay Out". |
| Farm picker | `store.getActiveFarmId()` → farm name, or "All farms" when null | Line 2, secondary. 14px/500, `--text2`. Behavior by context: single-farm op = plain text, no chevron, not interactive. Multi-farm op = chevron ▾, tappable. All-farms mode = "All farms" in `--text3` muted color with chevron. Tap opens the farm picker (sheet on mobile, dropdown on desktop — §3.6). |

**Right cluster — actions, left-to-right:**

| Element | Source | Notes |
|---------|--------|-------|
| Sync indicator | §3.14 sync dot | 8×8px circle. States: `.sync-ok` (green, online), `.sync-pending` (amber, queued writes), `.sync-off` (`--text3`, offline), `.sync-err` (red, error). Tap navigates to `#/settings` sync panel. |
| Build stamp | `<meta name="app-version">` | 11px, `--text2`. Format: `bYYYYMMDD.HHMM`. Hidden below 360px viewport width. Diagnostic value only — always visible during testing. |
| Field mode toggle | — | `btn btn-green btn-xs`. Navigates to `#/field`. Hidden while already in Field Mode. |
| User menu | `auth.user.email` initials | 28×28 circle button, `--bg2` bg, 1px `--border`, initials in 11px/600 `--text2`. Tap opens user menu popover (§3.6 user menu popover pattern) with user email (read-only) and Log Out action. |

**Switching farms with unsaved work:** When the user selects a different farm in the picker and there's an unsaved survey draft or an open wizard scoped to the current farm, show a confirm dialog: title "Unsaved work on {currentFarmName}", body "You have an unsaved {draftType} — it'll be kept here and you can return to it later.", buttons [Switch anyway] (primary `--green`) · [Cancel] (ghost). Drafts stay scoped to the farm they were started on — no discard from this dialog; discard lives inside the draft itself. See §18 for the full flow.

**Desktop sidebar** follows §3.6 exactly: 220px fixed, logo strip (32×32 icon, green bg, rounded, 14px bold farm name, 11px subtitle), nav items with hover (`--bg2`) and active (`--green-l` bg, `--green-d` text, 600 weight), sync strip at bottom (border-top, 11px, `--text2`).

**Nav items:** Dashboard, Events, Locations, Animals, Feed, **Todos**, Reports, Settings. (V1 had 9 screens including Pastures and Feedback; v2 merges Pastures into Locations and moves Feedback to the header.)

**Todos badge:** The Todos nav item shows a red badge with the count of non-closed todos (same pattern as v1's `updateTodoBadge()`). Badge uses §3.6 badge pattern: absolute positioned, `--red` bg, 9px white text.

**Mobile bottom nav:** Follows §3.6 bottom nav pattern. Fixed bottom, full width (max 480px), `z-index: 100`, flex row. Each item: column layout, 22×22 icon, 10px label. Active: `--green` color. Items: Home, Animals, Todos, Events, Locations, Feed, Settings.

### 17.3 Farm Overview Stats — Desktop

Rendered by `renderDesktopDashboardHeader()`. Shows above the view toggle.

**Header line:** "Farm Overview" label (left) with summary text: `"{totalHead} head · {groupCount} groups · {activeCount} active"`. Period pills (right).

**Period selector pills:** 5 options — `24h`, `3d`, `7d`, `30d`, `All`. Active pill: `--green` bg, white text, filled. Inactive pill: `--border2` border, transparent bg, `--text2` text. Selection stored in `user_preferences.home_stats_period` (or localStorage fallback). Default: `7d`.

**5 metric cells** in a `repeat(5, 1fr)` grid, 10px gap. Each cell follows §3.8 (`.m-cell`, `--bg2`, `--radius`, 12px padding):

| Metric | Color | Display | Sub-label | Calculation |
|--------|-------|---------|-----------|-------------|
| Pasture DMI | `--green` | lbs (1k+ as "Xk") | "lbs DM" | Sum pasture DMI from events in period, pro-rated by days |
| Feed Cost | `--amber` | "$XX.XX" | "stored feed" | Sum feed entry costs from all events in period |
| Pasture % | `--teal` | "XX%" or "--" | "avg, N closed events" or "estimated, open events" or "no grazing events" | Avg pasture % from closed events, or open event estimate |
| NPK / Acre | `--purple-d` | "XX.X /ac" or "--" | "N{X}/P{X}/K{X} lbs · {X.XX} ac" | Total N+P+K divided by total paddock acres |
| NPK Value | `--blue` | "${XX.XX}/ac" or "--" | "${X} total · {X.XX} ac" | (N×$nPrice + P×$pPrice + K×$kPrice) / acres |

**Empty state:** If no events match the selected period, show "No events in this period" in `--text2`, 13px, centered.

### 17.4 Farm Overview Stats — Mobile

Rendered by `renderMobilePerformanceStrip()`. Different metrics and layout from desktop.

**Header line:** "Grazing performance" (left). Period pills (right): 4 options — `24h`, `3d`, `7d`, `30d` (no "All" on mobile). Same pill styling as desktop.

**3 metric cells** in a `1fr 1fr 1fr` grid, 8px gap:

| Metric | Color | Threshold colors |
|--------|-------|-----------------|
| Pasture % | `--teal` | ≥70%: `--green`, 40–70%: `--amber`, <40%: `--red` |
| NPK / Acre | `--purple-d` | No thresholds — always purple |
| Feed Cost / Day | `--amber` | <$2/hd/day: `--green`, $2–5: `--amber`, >$5: `--red` |

Threshold colors apply to the value text. Labels remain `--text2`.

### 17.5 View Toggle: Groups / Locations

A pill-style toggle below the stats row, above the card grid. Follows v1's `renderHomeViewToggle()`.

```
View: [Groups] [Locations]
```

**Styling:** Two buttons side-by-side with 4px gap. Active button: `--green` border, `--green` bg, white text. Inactive button: `--border2` border, transparent bg, `--text2` text. Rounded corners (`--radius`).

**State:** Stored in `user_preferences.home_view_mode`. Values: `'groups'` or `'locations'`. **System default for new users: `'locations'`** (v2 change from v1's default of `'groups'`). Toggling calls store update, persists preference, and re-renders the card grid.

On desktop the toggle spans `grid-column: 1 / -1` (above the 2-column card grid).

### 17.6 Groups View — Group Cards

Default card grid when `home_view_mode = 'groups'`. One card per animal group (non-archived).

**Grid:** Single column on mobile, `1fr 1fr` on desktop with 14px gap. Design system §3.13 + §2.3.

**Card header** (always visible):
- **Color bar:** 4px wide, left edge, per-group color from `groups.color`
- **Title line:** Group name (14px, 600 weight)
- **Subtitle line:** `"{headCount} head · avg {avgWeight} lbs"` + location info if placed: `" · {locationName}"` or `" · Not placed"` if no active event
- **Chevron:** `--text3`, rotates 180° when expanded. Hidden on desktop (cards always expanded).

**Card body** (collapsed on mobile, always shown on desktop):

Rendered top-to-bottom in this order. Each sub-element is conditional:

1. **Composition line** — Animal counts by sex or class. E.g., "12 cows · 4 heifers · 1 bull". Only shows if group has animals with class/sex data. Font: 12px, `--text2`.

2. **Location status bar** — Only shows if group has an active event. Uses `.grp-loc-bar` (§3.13): `--bg2` bg, `--radius`, `9px 12px` padding. Contains:
   - Location name with green "grazing" badge (`.badge` with `--green-l` bg, `--green-d` text)
   - Day count: "Day {N}" (days since event open)
   - Sub-move count (if >0 sub-moves): "{N} sub-moves"
   - Feed entry count: "{N} feedings"
   - Feed cost: "${XX.XX}"

3. **DMI target + progress** — Only shows if `group.dmiTarget > 0` AND feed entries exist for the active event. Shows: "DMI: {consumed} / {target} lbs" with a progress bar (§3.10). Progress bar fill: `--green` if on track, `--amber` if behind pace.

4. **NPK deposited** — Only shows if group has animals with `bodyWeight > 0`. Shows: "NPK deposited: N{X} P{X} K{X} lbs". Font: 12px, `--text2`. Calculated from group head count, average weight, and days on pasture.

5. **Action buttons** — Flex wrap row, each button `flex: 1, min-width: 80px`:

| Button | Style | Condition | Action |
|--------|-------|-----------|--------|
| Move | `btn btn-teal` (filled) | Group has active event | Opens event edit sheet |
| Place | `btn btn-teal` (filled) | Group has NO active event | Opens move wizard (§1) |
| Split | `btn btn-outline` | Only if active event exists | Opens split sheet |
| Weights | `btn btn-outline` | Always | Opens weight recording (§14.1) |
| Edit | `btn btn-outline` | Always | Opens group edit sheet (§15.2) |

**Collapse/expand behavior (mobile):**
- Tap target: full header row (not just chevron)
- Toggle: instant (CSS class toggle, no animation)
- Multiple cards can be open simultaneously
- Auto-expand: cards with active events start expanded
- State preserved across re-renders (track expanded card IDs before re-render, re-apply after)

**Empty state:** When no groups exist, show a card centered on screen: "No groups set up yet" (16px, 600 weight) + "Add your animal classes and groups in Settings to get started." (13px, `--text2`) + CTA button: `btn btn-teal btn-sm` → navigates to `#/settings`.

### 17.7 Locations View — Location Cards

Alternate card grid when `home_view_mode = 'locations'`. Shows active events grouped by location, plus an unplaced groups section.

**Grid:** Same layout as groups view (single column mobile, `1fr 1fr` desktop, 14px gap).

**Active event cards** — one per active event (location-centric):
- **Header:** Location name (14px, 600 weight) + type badge (land_use value — using §3.3 chip pattern): pasture → `--green`, mixed-use → `--teal`, confinement → `--amber`, crop → `--purple`
- **Body:**
  - Groups present: list of group names with head counts. E.g., "Cows (24 head) · Heifers (12 head)"
  - Days in: "Day {N}" since event opened
  - Feed status: "{N} feedings · ${XX.XX} cost"
  - Sub-paddock status (if strip graze): "Strip {N} of {M}"
  - Action buttons: Move (opens event edit), Survey (opens paddock survey §7), Edit (opens event edit)

**Unplaced groups section** — below active event cards:
- Section header: "Unplaced groups" (`.sec` label)
- One row per unplaced group: group name + head count + "Place" button (`btn btn-teal btn-sm`)
- If no unplaced groups, section is hidden

**Empty state:** If no active events exist, show: "No active events. Place a group to start grazing." (13px, `--text2`, centered).

### 17.8 Open Tasks Section (Dashboard)

Shows below the group/location card grid. Displays up to 4 open (non-closed) todos.

**Layout:**
```
┌──────────────────────────────────────────┐
│ My open tasks                [All tasks] │
│ ┌── todo card (compact) ────────────────┐│
│ ├── todo card (compact) ────────────────┤│
│ ├── todo card (compact) ────────────────┤│
│ └── todo card (compact) ────────────────┘│
│ [+ Add task]                             │
└──────────────────────────────────────────┘
```

- Section header: "My open tasks" (`.sec` label, left) + "All tasks" button (`btn btn-outline btn-xs`, right) → navigates to `#/todos`
- Cards: up to 4 todos where `status !== 'closed'`, rendered with `compact = true` (no paddock/animal/note detail — title, status pill, and assignee avatars only). See §17.11 for card anatomy.
- "+ Add task" button: `btn btn-outline btn-sm`, full width, opens todo create sheet (§17.10)
- Empty state: "No open tasks" (13px, `--text2`)

### 17.9 Todos Screen (`#/todos`)

Dedicated full-screen list of all todos. Accessible from nav (both mobile bottom nav and desktop sidebar) and from dashboard "All tasks" button.

**Filter bar** — three rows of filter pills above the list:

1. **Status filters:** "Open" (default on), "In progress" (default on), "Closed" (default off). Toggle on/off. At least one must be active. Uses §3.7 filter pill pattern.
2. **User filters:** One pill per operation member. "All" clears filter. Default: show all.
3. **Location filters:** One pill per location that has todos. "(no location)" for unlinked todos. "All" clears filter. Default: show all.

**Sort:** Newest first (descending by `created_at`).

**List:** Scrollable list of todo cards (full detail, not compact). See §17.11 for card anatomy.

**Empty state:** "No tasks match these filters" (§3.11 empty pattern).

**Actions:**
- Tap any card → opens todo edit sheet (§17.10)
- "+ Add task" button at bottom: `btn btn-outline btn-sm` → opens todo create sheet

**Summary line:** Below filters, above list: "{N} tasks shown" (12px, `--text2`).

### 17.10 Todo Create/Edit Sheet

Standard sheet (§3.4 sheet pattern) for creating or editing a todo.

**Title:** "New task" (create) or "Edit task" (edit).

**Fields:**

| Field | Input | Required | Notes |
|-------|-------|----------|-------|
| Title | text input | Yes | Placeholder: "e.g. Check water trough in North paddock" |
| Assignees | multi-select chips | No | One chip per operation member. Tap to toggle. Uses `todo_assignments` junction table. |
| Status | select | Yes | Options: Open, In progress, Closed. Default: Open. |
| Location | select | No | Options: all locations + "— none —". V2 uses `location_id` FK (v1 used paddock name string). |
| Animal | select | No | Options: all active animals (tag number + name) + "— none —". |
| Due date | date input | No | V2 addition — column exists in schema but v1 didn't sync it. |
| Note | textarea | No | Placeholder: "Additional details..." |

**Pre-population contexts:**
- From animal quick-action bar (§14.9): `animal_id` pre-selected
- From move wizard: `location_id` pre-selected to the destination paddock
- From dashboard "+ Add task": all fields empty

**Save behavior:** Validate title (required). Create or update todo in store → persist → queue sync → notify. Update todo badge count. Re-render home/todos screen.

**Delete:** Edit mode only. Red delete button at bottom: `btn btn-red btn-sm`. Confirms before deleting. Queues Supabase delete.

### 17.11 Todo Card Anatomy

Used in both the dashboard (compact) and todos screen (full).

```
┌─────────────────────────────────────────────┐
│ ▌ Task title                    [Status pill]│
│ ▌ 📍 Location name · 🐄 Tag #42            │  ← hidden in compact mode
│ ▌ Note preview (80 chars max)...            │  ← hidden in compact mode
│ ▌ 👤 👤 avatars                             │
└─────────────────────────────────────────────┘
```

**Status bar:** 4px vertical bar on the left edge (same pattern as group card color bar):
- Open: `--amber`
- In progress: `--blue`
- Closed: `--green`

**Status pill** (top right): Uses status pill pattern.
- Open: `.sp-open` (amber)
- In progress: `.sp-progress` (blue)
- Closed: `.sp-closed` (green, card gets `.closed` class — reduced opacity)

**Title:** 14px, 600 weight, line-height 1.4.

**Detail line** (full mode only): 12px, `--text2`. Shows location name (if linked) and animal tag (if linked), joined with " · ". Prefixed with 📍 and 🐄 respectively.

**Note preview** (full mode only): 12px, `--text2`, line-height 1.4. First 80 characters of note, ellipsis if truncated.

**Assignee avatars:** Flex row, 6px gap. Each avatar is a small circle (24px) with initials or user icon. Shown in both compact and full modes.

**Tap action:** Opens todo edit sheet (§17.10).

### 17.12 Survey Draft Card

Shows on the dashboard below the tasks section when an incomplete survey draft exists in the store.

**Condition:** `store.getAll('surveys').some(s => s.status === 'draft')`.

**Card:** Standard card (§3.1) with amber banner style (`.ban-amber`):
- Title: "Survey in progress" (14px, 600 weight)
- Subtitle: survey location name + date started (12px, `--text2`)
- CTA button: `btn btn-amber btn-sm` → opens the survey sheet (§7) with draft pre-loaded

If no draft surveys exist, this card is not rendered (no empty state needed).

### 17.13 Weaning Nudge

Shows on the dashboard below the survey card when any animal group has calves approaching their weaning age target.

**Condition:** Group has calves where `(today - calf.birthDate)` is within 14 days of the weaning target age. Precedence: uses `group.weaning_target_days` if set, otherwise falls back to `animal_classes.weaning_target_days` for the group's class.

**Card:** Standard card (§3.1) with teal banner style (`.ban-teal`):
- Title: "Weaning alert" (14px, 600 weight)
- Body: "Group {name} has {N} calves at {avgDays} days — weaning target is {targetDays} days." (13px)
- One card per qualifying group (rendered in a stack if multiple)

If no groups qualify, this section is not rendered.

### 17.14 Design Notes

- **Render order matters.** The dashboard renders top-to-bottom: stats → toggle → cards → tasks → survey → weaning. Each section is independently conditional — missing data hides the section, it doesn't show an empty placeholder (except stats and tasks which have explicit empty states).
- **View toggle default.** New users default to Locations view (`home_view_mode = 'locations'`). This is a v2 change from v1 (which defaulted to Groups). Schema column `user_preferences.home_view_mode` has `DEFAULT 'groups'` — the application layer overrides this for new onboarding users.
- **Stats period persistence.** The selected period pill persists across sessions. If no `home_stats_period` preference exists, default to `'7d'`.
- **Calculation cross-references.** Stats row metrics connect to registered calculations in V2_CALCULATION_SPEC.md: Pasture DMI → DMI-1, Feed Cost → COST-1, Pasture % → DMI-3, NPK/Acre → NPK-1, NPK Value → NPK-2. The stat functions pass the selected period to filter event data.
- **Todo screen is a route.** `#/todos` is a first-class route in the router, with a nav entry (including badge) on both mobile bottom nav and desktop sidebar.
- **Todos entity already exists.** `src/entities/todo.js` and `src/entities/todo-assignment.js` are built. The feature UI (`src/features/todos/`) is what needs to be created.

---

## 18. Farm Switching & Multi-Farm Context

Defines how a user moves between farms within an operation and how cross-farm actions are handled. Added 2026-04-13 with OI-0015 resolution.

### 18.1 Active Farm

Stored in `user_preferences.active_farm_id` — per-user, syncs across devices. `NULL` = "All farms" mode (aggregate across every farm in the operation).

- **Scopes display, not permissions.** RLS is unchanged. The app uses `active_farm_id` to filter what's shown on farm-scoped screens (dashboard, locations, groups, events). Any farm the user has access to via `operation_members` is still accessible via cross-farm wizard paths.
- **Default for new users:** the first farm created during onboarding becomes the default `active_farm_id`. If the referenced farm is later deleted, the store falls back to the first available farm and writes that back to preferences.

### 18.2 Farm Picker

Entry point: the farm picker button on line 2 of the header left cluster (§17.2).

- **Single-farm op** (farms.length === 1): picker is non-interactive plain text.
- **Multi-farm op, specific farm active:** tap opens picker.
- **Multi-farm op, All farms active:** "All farms" label shown in `--text3` muted color, tap opens picker.

Picker presentation:
- **Mobile:** full-screen sheet (§3.5), titled "Switch farm".
- **Desktop:** dropdown anchored below the picker button.

Picker contents:
1. "All farms" row (pinned top, radio-style, active mark if currently null)
2. Farms — alphabetical, radio-style, active mark on current
3. Divider
4. "+ Add farm" → `#/settings/farms`

### 18.3 Switching with Unsaved Work

Before `store.setActiveFarm(farmId)` commits, check for unsaved drafts scoped to the current farm. Unsaved drafts currently include: survey drafts (`surveys.is_draft = true`) and any open wizard (move, feed delivery, etc.).

If any exist, show modal:
- **Title:** "Unsaved work on {currentFarmName}"
- **Body:** "You have an unsaved {draftType} — it'll be kept here and you can return to it later."
- **Buttons:** [Switch anyway] (primary `--green`) · [Cancel] (ghost)

On *Switch anyway*: proceed with `setActiveFarm(farmId)`. Draft remains in place, scoped to its source farm; when the user returns to that farm, the draft banner re-appears. On *Cancel*: close modal, keep current selection.

No discard action in this modal — discard lives inside the draft itself (survey draft card, wizard cancel).

### 18.4 Cross-Farm Moves (Whole Group)

Flow: same as within-farm move (§1) with one addition — the **farm chip** at the top of the destination picker (§1.2 Step 2a, §1.3 Step 2b) lets the user select a location or existing event on another farm.

Data effect:
- Source event on Farm 1 closes (sets `date_out`, closes all paddock windows, captures residual / manure / NPK per §1.5).
- A **new** event is created on Farm 2 (new `events` row, with `farm_id` = Farm 2). Its `source_event_id` column points back to the source event.
- If the destination step was "Join Existing" instead of "New Location", no new event is created — `animal_group_memberships` shift from source event's group to destination event's group at the chosen timestamp, and the destination event's `event_group_windows` extend to include the arrivals.

**Rule (enforced by schema):** no event straddles farms. `events.farm_id NOT NULL` plus the invariant that all of an event's `event_paddock_windows` must reference locations on the same farm as `events.farm_id`. The wizard enforces this by scoping the location list under the farm chip.

### 18.5 Cross-Farm Moves (Individual Animal)

Flow: from the animal detail sheet, "Change group" action → group picker with farm chip at top.

Data effect: no event is closed or opened.
- End `animal_group_memberships` for this animal in its current group at time T.
- Start `animal_group_memberships` for this animal in the destination group at time T.
- Both source and destination events stay open. Event cards show a sub-entry for the membership change on that day.

### 18.6 Cross-Farm Event Card Markers (§11)

When an event has `source_event_id` pointing to an event on a different farm (i.e., this event is the destination half of a cross-farm move), the card header shows:

- **"← Moved from {sourceFarmName}"** — tappable, jumps to the paired source event.

When another event's `source_event_id` points to this event AND that other event is on a different farm (i.e., this event is the source half):

- **"→ Moved to {destFarmName}"** — tappable, jumps to the paired destination event.

Style: 11px, `--text2`, with arrow glyph. Rendered below the event title, above the paddock summary.

### 18.7 All Farms Mode — Screen Behavior

When `active_farm_id` is null, farm-scoped screens aggregate across all farms in the operation. To keep records readable, each record on an aggregated screen shows a small `{farmName}` chip (§3.7 filter pill style, inactive variant).

- **Dashboard (§17.3):** Farm Overview subtitle reads "All farms — {N} farms, {totalHead} head". Stats aggregate across farms. Group and location cards show a farm chip.
- **Locations screen:** location rows show a farm chip.
- **Events screen:** event rows show a farm chip.
- **Groups screen:** group rows show a farm chip.
- **Move wizard (source step):** group picker shows groups across all farms with farm chips. Destination step already handles cross-farm targeting regardless of mode.

In single-farm mode (specific `active_farm_id`), farm chips are hidden — they're noise when every record is on the same farm.

### 18.8 Field Mode Interaction

Field Mode is locked to the farm that was active when the user entered Field Mode. The farm picker is hidden while in Field Mode — switching farms requires exiting Field Mode first. Log out while in Field Mode exits Field Mode cleanly before clearing the session.

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-04-12 | Session 11 — UX flow gap fill | Added §14 (reusable health & recording components — 10 subsections covering weight, BCS, treatment, breeding, heat, calving, note, group sessions, quick-action bar), §15 (entity CRUD forms — animal, group, location, feed type), §16 (field mode — home screen, navigation, heat quick-access, feed loop). Component-first approach: each form documented once with entry points and context pre-fill mapped. |
| 2026-04-13 | Session — Dashboard & todos spec | Added §17 (home screen / dashboard + todos). 14 subsections covering: screen layout (mobile/desktop), header bar, farm overview stats (desktop 5-metric, mobile 3-metric with thresholds), view toggle (groups/locations, default changed to locations for new users), group card anatomy (body elements, conditional logic, action buttons, collapse/expand), location card anatomy, open tasks dashboard section, todos screen with 3-axis filtering, todo create/edit sheet, todo card anatomy, survey draft card, weaning nudge. Derived from v1 `renderHome()` + `renderTodos()` code review against v2 schema D11.3/D11.4. FAB removed — feedback button moved to header. |
| 2026-04-13 | Header + multi-farm context design | OI-0015 & OI-0019 resolved. §17.2 Header Bar rewritten — left cluster now shows operation name + farm picker, right cluster adds user menu button and restores build stamp. §1.2 and §1.3 (move wizard location + existing event pickers) gained a farm chip at the top enabling cross-farm targeting. New §18 Farm Switching & Multi-Farm Context added (8 subsections): active farm semantics, farm picker UX, switch-with-unsaved-work confirm, cross-farm whole-group moves (no-straddling-events rule, source_event_id linkage), cross-farm individual animal moves (membership-only), event card cross-farm markers, All farms aggregate mode behavior, Field Mode interaction. |

---

*End of document. For data schemas see V2_SCHEMA_DESIGN.md. For code patterns see V2_APP_ARCHITECTURE.md. For formulas see V2_CALCULATION_SPEC.md. For visual patterns see V2_DESIGN_SYSTEM.md.*
