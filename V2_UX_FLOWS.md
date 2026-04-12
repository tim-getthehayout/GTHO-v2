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

*End of document. For data schemas see V2_SCHEMA_DESIGN.md. For code patterns see V2_APP_ARCHITECTURE.md. For formulas see V2_CALCULATION_SPEC.md. For visual patterns see V2_DESIGN_SYSTEM.md.*
