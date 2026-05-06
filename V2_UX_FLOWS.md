# GTHO v2 — UX Flows

**Status:** APPROVED (2026-04-12)
**Source:** v1 feature audit (GRZ-01–05, FED-01–10, PAS-03–04, NUT-03) + v2 schema + V2_DESIGN_SYSTEM.md §4
**Purpose:** Define every multi-step user interaction. Claude Code builds UI from these flows.

**Terminology note:** "Sub-move" is the **user-facing term** for adding or removing a paddock (location) from an active event mid-graze. The backend models this as `event_paddock_windows` — opening and closing time-bound windows. This doc uses "sub-move" when describing what the user sees, and "paddock window" when describing data operations. See §2 for the full flow.

---

## 1. Move Wizard

Closes a group's window on its current event and opens a destination — either a new event at a new paddock or a join into an existing event. The wizard runs in one of three modes depending on which Move button was tapped:

- **Full-event mode** — every open group window on the source event closes, every open paddock window closes, and `events.date_out` is stamped. Triggered by the **Move all** button on the dashboard event card (§17.7) and by the Move buttons on the events list (§4) and field-mode picker (§16.5).
- **Scoped + remaining mode** — only the tapped group's window closes; other groups stay grazing on the source event, paddock windows stay open, and `events.date_out` stays null. Triggered by the per-group **Move** button on the dashboard event card's `GROUPS` section (§17.7 #10), the per-group Move button in the dashboard group strip, and the per-group Move button in the event detail sheet (§17.15).
- **Scoped + last mode** — same trigger surface as scoped + remaining, but the wizard detects that the tapped group is the last open group window on the event. Behaviorally identical to full-event mode: paddock windows close, `events.date_out` is stamped. The wizard's Step 3 copy reflects "Close {paddock}" rather than the per-group "Move {group} out of {paddock}" framing.

The mode determines what Step 3 renders and what the save sequence does. See §1.5 for render rules and §1.6 for the conditional save sequence.

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

Split panel. The section title and observation cards render conditionally based on mode (§1) and source/destination location type (`'land'` vs. `'confinement'` per the `locations.type` enum).

**Left: Close source side**

Section title varies by mode:

| mode | Title |
|---|---|
| `scoped-remaining` | `"Move {GroupName} out of {PaddockName}"` |
| `scoped-last` | `"Close {PaddockName}"` |
| `full-event` | `"Close Current Event"` |

Always rendered, regardless of mode:
- Date out (default: today)
- Time out (optional)
- Feed transfer card (if feed entries exist on the source event) — Move / Residual radio per batch × location, with forced remaining-quantity input on Residual (per OI-0136); skipped entirely in `scoped-remaining` mode (feed stays with the groups still on the source event)

Conditionally rendered — **post-graze observation card** (Residual height, Recovery min/max days, Notes):

| mode | source location type | Post-graze card |
|---|---|---|
| `scoped-remaining` | any | Hidden — paddock is mid-grazing; residual / recovery don't apply yet |
| `scoped-last` | `land` | Shown |
| `scoped-last` | `confinement` | Hidden — corral / dry-lot has no standing forage to measure |
| `full-event` | `land` | Shown |
| `full-event` | `confinement` | Hidden |

When shown, the card pre-fills: residual height from the location's forage type default (3-tier config A17), recovery min/max from last observation or forage type default. Values are validated per OI-0040 / OI-0041.

**Confinement handling on close:** If any paddock window on the closing event points to a confinement or partial-capture location, the close summary routes captured NPK to the associated manure batch (manure batch transaction created automatically based on `location.capture_percent × excretion NPK × window duration / event duration`). This runs regardless of post-graze card visibility — it's a data-side computation, not a UI capture.

**Right: New event (or join)**

Always rendered when destType is `'new'`:
- Date in (default: same as close date; one-way mirror from Date out per OI-0101 until the user touches the input)
- Time in (optional; same one-way mirror)
- Head count (auto-filled from the snapshotted group window — silent, no UI, captured automatically via `getLiveWindowHeadCount` at save time)
- Feed transfer destination (if Move was selected on any feed line) — destination paddock receives a new `event_feed_entry` with `source_event_id` linking back
- **Strip graze setup** (if selected in Step 2c): shows strip count and size summary

Conditionally rendered — **pre-graze observation card** (Pre-graze height, Forage cover %, Notes):

| destType + destination location type | Pre-graze card |
|---|---|
| `new` + `land` | Shown |
| `new` + `confinement` | Hidden — corral / dry-lot has no standing forage |
| `join` (existing event) | Hidden — destination paddock already has a pre-graze obs from when its event opened |

### 1.6 Save Actions (in order)

The save sequence is mode-aware. Steps marked **[full-event / scoped-last only]** are skipped in `scoped-remaining` mode because the source event stays open and the paddock continues to be grazed.

1. **[full-event / scoped-last only]** Create feed check with `is_close_reading: true` (if feed exists). Per-line `remainingQuantity` comes from the farmer's Move/Residual choice: Move → 0; Residual → farmer-confirmed value from the forced input (OI-0135 / OI-0136).
2. **[full-event / scoped-last only]** Close all open paddock windows on source event (`date_closed = date_out`); also creates `paddock_observation` (type='close') with residual / recovery values when the post-graze card was rendered.
3. Close the affected group window(s) on source event (`date_left = date_out`). Scoped modes close only the tapped group's window; full-event closes all open group windows. Live head count and avg weight are snapshotted onto the closing window before the close write (OI-0091).
4. **[full-event / scoped-last only]** Set source event `date_out`.
5. (Subsumed into step 2 — paddock observation is created in the same loop as the paddock-window close.)
6. Create new event at destination (or add group window to existing event).
7. **[destination is `'land'` only]** Create `paddock_observation` (type='open') with pre-graze readings from the pre-graze card. When destination is confinement, the obs row is not created (no standing forage to measure).
8. Create feed transfer entries on the destination for any Move-selected lines (new `event_feed_entry` with `source_event_id` linking back to the closing source event).
9. If strip graze: set `is_strip_graze = true`, `strip_group_id`, and `area_pct` on the first paddock window of the destination event.

The mode is determined at save time by counting remaining open group windows on the source event after the scoped close; `scoped-last` is the case where that count is zero, and the wizard runs the full close sequence (steps 1, 2, 4) even though the entry surface was a per-group Move button.

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

### 3.4 Empty Group Handling (Archive Cascade)

When the last animal leaves a group — by cull, move, wean, split, or manual remove — the group is left with zero open memberships. The window-split architecture (§4.4 in V2_APP_ARCHITECTURE.md) closes the open `event_group_window` at the mutation site with live values stamped at the change date, then each state-change flow calls `maybeShowEmptyGroupPrompt(groupId)`. That helper checks "does this group have zero open memberships?" and, if so, opens the empty-group prompt described below.

There is no centralized "after last membership closes" cascade — the responsibility belongs to each mutation flow (cull-sheet, move-wizard, wean-wizard, split-group, manual remove). Any future composition-change flow must call the helper after its window-split commit. A standalone toast confirms the window close ("[Group name] ended on [Event name] as of [YYYY-MM-DD]") before the prompt opens.

**Three first-class group states.** A group is `active` (has at least one open membership), `empty-but-active` (no open memberships, `archived_at IS NULL`), or `archived` (no open memberships, `archived_at IS NOT NULL`). The state lives on the single `groups.archived_at TIMESTAMPTZ` column shipped in migration 024 — `NULL` = active or empty-but-active, timestamp = archived on that date. The earlier design carried `archived BOOLEAN`; migration 024 dropped the boolean and replaced it with the timestamp form so audit history survives reactivation.

#### Empty-group prompt

Opens automatically right after the window-close toast.

- **Sheet title:** *"[Group name] is empty"*
- **Body copy:** *"[Group name] has no animals left. What would you like to do?"* followed by short descriptions for each option.
- **Primary action — Archive (green).** Archived groups stay attached to their historical events so reports stay intact. The user can reactivate the same group record later — useful for seasonal cohorts (Weaners 2025 → Weaners 2026) where keeping one group identity preserves continuity.
- **Secondary action — Keep active.** Leave the group as-is with no archive timestamp. Use when the farmer expects to add animals back soon.
- **Destructive action — Delete.** Permanently removes the group row. **Disabled** (with explanatory tooltip) whenever the group has any historical `event_group_window` rows — historical events would render "?" where the group name used to be. The destructive button is enabled only on groups that were never on an event.

Tap-outside, swipe-down, and X-button all dismiss the sheet as "Keep active" — no archive, no delete, no further write. Dismiss is the safest default for an in-the-field accidental tap.

**Archive write:** sets `group.archivedAt = now()` and queues the sync write. Toast: *"[Group name] archived"*. Pickers and dashboard cards filter `archivedAt IS NULL` and stop showing the group on subsequent renders.

**Delete write:** confirmation dialog ("Delete [Group name]? This cannot be undone.") then deletes the group row plus any orphaned `animal_group_memberships`. Only available when the disable guard above passes.

#### Group Management UI (Settings → Groups, or §15.2 Group CRUD Sheet)

Active groups render at the top of the list as today (`archivedAt IS NULL`). A new **"Show archived" toggle** sits at the top of the list. When on, a second section renders below the active list — *"Archived groups"* — listing groups with `archivedAt IS NOT NULL`.

Each archived row shows:

- Group name with its color dot
- Archive date (formatted in the user's locale)
- Last known head count (read from the most recent closed `event_group_window` for the group, or "—" if no window history exists)
- **Reactivate** action — clears `archivedAt` and re-shows the group in active pickers; toast: *"[Group name] reactivated"*
- **Delete** action — same enable/disable guard as the empty-group prompt's Delete (history-bearing groups can't be deleted)

Renaming an archived group is allowed and useful for seasonal reuse (rename Weaners 2025 → Weaners 2026 before reactivating).

#### Pickers that must filter `archivedAt IS NULL`

Move wizard group picker, event creation group picker, default Group CRUD list, Field Mode group pills, reports that default to "active groups only", and the dashboard groups view. Reports designed to show full history (e.g., a season summary) read all groups regardless of `archivedAt` and label archived ones explicitly.

#### Out of scope for v2 launch

Bulk archive of multiple empty groups (each cascade triggers its own prompt). Scheduled auto-archive (e.g., "archive after 30 days empty"). Forced archive of a non-empty group from the management UI — archiving requires emptiness today, with a follow-up OI tracking the request if it surfaces in field testing.

#### CP-55/CP-56 impact

`groups.archived_at` is serialized as ISO string or null on export. Old backups carrying the pre-migration-024 `archived` boolean run through the v23 → v24 backup-migrations chain entry, which maps `archived: true` to `archivedAt: <timestamp>` and `archived: false` to `archivedAt: null` before the import lands. This catch-up is part of OI-0156 (CP-55/CP-56 sweep for new persisted fields).

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

Recording pasture assessments — pasture-walk ratings that drive forage cover %, recovery windows, and the rotation calendar's "ready to graze" signals. The whole experience runs through a single sheet element with three modes plus a field-mode picker; this section is the design source of truth for that sheet (the v1 HTML reference and grep-level implementation notes live in the historical spec at `github/issues/GH-12_survey-sheet-v1-parity.md`, kept as a thin pointer).

### 7.1 Three Modes (one sheet)

The same sheet (`survey-sheet`) hosts three modes — `bulk`, `single`, and `bulk-edit` — toggled by a single `setSurveySheetMode(mode, draftDate, pastureName)` call. Switching modes swaps headers, save buttons, discard affordances, and draft-tag visibility on the same DOM container; it never destroys the sheet between modes.

- **Bulk mode** is the "walk the farm" experience. Bulk-mode chrome (filter pills, expand/collapse all, Save Draft, Finish & Save) replaces the classic header. The bottom Save button is hidden — Finish & Save in the chrome is the commit. One paddock card per visible (non-confinement, non-crop) location renders in a scrollable list, all collapsed by default.
- **Single mode** is "this one paddock." Classic header reads "Survey: {name}" or "Paddock survey." The card is auto-expanded and shows a richer context line (last-grazed and last-rated history). Save button is the bottom one.
- **Bulk-edit mode** opens an existing committed survey for re-rating. Classic header reads "Edit survey." Save replaces observations in place — it does not append. The recovery section header is hidden because recovery is embedded per card.

### 7.2 Entry Points

V1 had nine entry points; v2 keeps eight (the home "Pasture readiness" card is dropped because v2 has no equivalent surface). All eight call into one of three top-level functions — `openBulkSurveySheet()`, `openSurveySheet(pastureId)`, or `openPastureSurveyPickerSheet()` — so the surface area for survey orchestration stays small and grep-friendly.

| # | Entry point | Mode | Function |
|---|---|---|---|
| 1 | Locations screen → `📋 Survey` button | bulk | `openBulkSurveySheet()` |
| 2 | Locations screen → Surveys sub-tab → `+ New Survey` | bulk | `openBulkSurveySheet()` |
| 3 | Locations screen → Surveys sub-tab → `Resume` (draft banner) | bulk | `openBulkSurveySheet()` (resumes) |
| 4 | Locations screen → Surveys sub-tab → `Edit` (committed row) | bulk-edit | `openBulkSurveyEdit(surveyId)` |
| 5 | Location edit sheet → `+ Add reading` | single | `openSurveySheet(pastureId)` |
| 6 | Location edit sheet → survey-history row Edit | single (edit existing) | `openSurveySheet(pastureId, surveyId)` |
| 7 | Field Mode → `📋 Multi-Pasture Survey` tile | bulk | `openBulkSurveySheet()` (via FIELD_MODULES) |
| 8 | Field Mode → `📋 Pasture Survey` tile | single | `openPastureSurveyPickerSheet()` → picker → `openSurveySheet(pastureId)` |

There is deliberately no "survey just this paddock" button on the dashboard or Locations card. Single-paddock surveys are reached via location edit (5–6) or field-mode picker (8) — paths that match v1 exactly.

### 7.3 Paddock Card

The paddock card is the data-capture unit. It renders the same fields in every mode; only the chrome around it (collapsed-by-default in bulk vs auto-expanded in single, header content, save semantics) differs.

The collapsed bulk header reads `name · acres · Active badge · ✓ Complete badge` on the left and a chevron (rotates 180° on expand) on the right. The Active badge appears when the paddock currently hosts an open event; the Complete badge appears only when `isBulkSurveyCardComplete(paddockId)` is true (see §7.4 for the rule). Clicking the header toggles expand. Single mode skips the collapsed header entirely — there's only one card and it's always expanded — and shows a richer context line above the card body (`Last grazed {date} · {N}d ago` or `Active · Day {N}`, plus `Last rated {N}/10 on {date}` or `Not yet rated`).

The expanded body has six sections, top to bottom:

1. **Forage quality rating** — a 0–100 range slider paired with a number input, with a color bar underneath. Slider and number stay in sync via a single `setSurveyRating(paddockId, name, value)` handler. The bar shifts red → amber → green as the rating climbs.
2. **Avg veg height (in)** and **Avg forage cover (%)** — two numeric inputs side-by-side. Veg height accepts 0–72 in 0.5 steps; cover accepts 0–100 in 1 steps.
3. **Bale-ring residues** (new in v2) — see §7.4 for the helper that auto-fills cover %.
4. **Forage condition** — a 4-button group: Poor / Fair / Good / Exc. (the short label "Exc." stands in for "Excellent" so the row fits on narrow viewports). The selected button takes the green active style; tapping rerenders the group and triggers a draft save.
5. **Recovery window** — MIN days and MAX days, presented as "days from survey date" with a live date preview under each input (e.g. *Mar 15* under MIN=10 when the survey date is Mar 5). A `↻ {date} – {date}` status line below the inputs shows the resulting next-graze window. Defaults come from the last closed event for the paddock (or the paddock's own `recoveryMinDays` / `MaxDays` if no event history exists), reduced by `daysAlreadyRested` so the displayed window matches what the farmer would actually see if they did nothing else.
6. **Notes** — free-text textarea. Optional. Bulk-mode cards omit this row to keep cards compact, but draft hydration preserves any prior notes regardless of which mode wrote them.

**Recovery-window date math is inverse on commit.** What the farmer sees during the survey is "days from survey date" — natural for a pasture walk. What the schema stores is "days from the event's `dateOut`" so the value remains meaningful as time passes. On commit, the stored value is `displayedValue + daysAlreadyRested`. This conversion lives in §7.7 alongside the rest of the commit rules.

### 7.4 Bale-Ring Residue Helper (new in v2)

Users coming off bale grazing need a fast way to estimate forage cover %. Counting bale-ring footprints in the paddock and multiplying by ring area gives a defensible cover estimate without tape-measuring. The helper is the only deliberate addition to v1's survey UX.

The input lives between the cover field and the forage-condition buttons in the expanded card body. It's a single number input (placeholder `0`, min 0, max 999) with a live two-line caption underneath: `{count} rings × {ringArea} sq ft = {totalArea} sq ft`, then `↳ Sets forage cover to {100 - coverReducedPct}% (of {paddockArea} sq ft)`. The second line only renders when the paddock has a non-null `acres` value; otherwise the caption reads `↳ Set paddock acreage to estimate cover.` and the count is still stored but no auto-fill happens.

When the user types a count, `forageCoverPct` is auto-set from the registered calc (`survey.baleRingCover`, documented in V2_CALCULATION_SPEC.md §4.9). The user can override the cover field afterwards — the bale-ring count is a hint, not a lock. The hint copy below the input reads *"Count bale-ring residues visible across the paddock."*

The default ring diameter is 12 ft, stored as `farm_settings.bale_ring_residue_diameter_cm` (renamed from the original `_ft` column in OI-0111 / migration 027 per the metric-internal rule) and editable per farm in Settings. The count itself is stored on the observation (`paddock_observations.bale_ring_residue_count` and `event_observations.bale_ring_residue_count`) so the recovery story over time stays visible — a farmer can flip back to a paddock survey from six months ago and see exactly how many ring footprints were counted that day.

The bale-ring count is **not** required for the ✓ Complete badge. The completion rule mirrors v1 strictly: `rating + vegHeight + forageCover + forageCondition + recoveryMin + recoveryMax`. Bale-ring is a helper, not an independent data point. Notes are optional too.

### 7.5 Bulk-Mode Chrome

The bulk-mode header replaces the classic header entirely. It has four (or five, depending on operation shape) rows stacked top-to-bottom:

**Row 1 — actions.** Three clusters: Cancel as a red text button on the left (not an outline button — visually demotes the destructive option to a secondary-text affordance); a center cluster with a DRAFT pill and Expand/Collapse-all toggle; a right cluster with `Save Draft` (outline), `Finish & Save` (green), and a `✕` close button. The `✕` and the backdrop both auto-save the draft on close. Cancel is the only path that explicitly rolls back the session's edits — see §7.7.

**Date row.** Survey date input, narrow (160px max-width). Mirrors `survey-date` and `survey-bulk-date` so editing one updates the other.

**Farm filter pills** — only render when the operation has more than one farm. Pills are amber when active. Selecting a non-`all` farm filters the paddock list to that farm's locations.

**Type filter pills** — Pasture / Mixed-Use / All. Green active state. Crop locations are excluded by default; the type pill set deliberately omits `crop` so a survey doesn't accidentally rate a corn field. Confinement locations are always excluded — they're not pasture and have no rating context.

**Search row.** A single text input that filters the paddock list by name or `fieldCode` (case-insensitive substring). No debounce — each keystroke rerenders the filtered list because the lists are short enough that the cost is negligible.

**Finish-confirm bar** — when the user taps Finish & Save and any visible paddock is unrated, the bulk-action row swaps in a confirm bar with two buttons (`Finish Anyway` teal · `Go Back` outline) and a message reading *"{N} of {M} paddocks have no data — finish anyway?"*. This is in-place, not a modal — the rest of the chrome stays put. Confirming runs the commit; cancelling restores the action row.

### 7.6 Draft Lifecycle

Drafts are immediate-on-localStorage and 1-second-debounced-on-Supabase. Every input change calls `triggerSurveyDraftSave(surveyId)`, which captures the current DOM state into a `{ [paddockId]: { rating, vegHeight, forageCover, forageQuality, notes, recoveryMin, recoveryMax, baleRingResidueCount } }` object, runs it through `store.upsertSurveyDraftEntries(surveyId, state)` for an immediate localStorage write + sync queue insert, then schedules a 1-second debounced `flushSurveyDraftSync(surveyId)` so a fast typist doesn't spam the queue. The draft is also flushed on sheet close.

V2 stores draft state in a child table (`survey_draft_entries`) rather than v1's JSONB blob on the parent survey, but the UX is identical. The Resume action reads the child rows and hydrates the form state at sheet-open.

**Three close semantics** the user can pick from:

- **Backdrop click or `✕` button** — auto-saves the draft, closes the sheet. Next time the user opens a bulk survey, the Surveys sub-tab shows a Resume banner (§7.9).
- **"Cancel" (red text in the bulk header)** — confirms *"Discard changes from this session?"*; on confirm, restores the snapshot taken at sheet-open and closes the sheet. The draft record itself still exists, but its state mirrors what the farmer saw on entry, not what they edited during this session.
- **"Discard" (Surveys sub-tab banner)** — full delete: removes the survey row and all child draft entries from both localStorage and Supabase. The draft is gone.

Save Draft (in the bulk chrome) is the explicit "I want to leave this for later but make sure it's safe right now" button — it forces an immediate sync rather than waiting for the debounce, then shows a "Draft saved." toast and leaves the sheet open.

### 7.7 Commit Rules

Finish & Save (bulk) and Save survey (single, bulk-edit) all flow through `commitSurvey(surveyId, date)`. The commit rules are identical across modes — the only thing that differs is what gets written; bulk writes one observation per rated paddock, single writes one observation, bulk-edit replaces existing observations for the same `(sourceId, paddockId)` rather than appending.

The commit must satisfy:

- **At least one rated paddock.** A bulk survey with zero ratings cannot commit; an alert blocks the action and the user returns to the sheet.
- **One `paddock_observations` row per rated paddock.** `source = 'survey'`, `sourceId = survey.id`, `confidenceRank = 3` (surveys are middle-confidence — below in-event observations, above derived defaults). The bale-ring count is included on the observation when set. The same observation row carries `forageCondition` (the 4-button choice), `forageQuality` (the slider rating), `vegHeight`, `forageCoverPct`, `recoveryMinDays`, `recoveryMaxDays`, and `notes`.
- **Recovery-window inversion.** For each paddock with a non-null recovery edit, find the last closed event for the paddock and compute `daysAlreadyRested = surveyDate − event.dateOut`. The stored `recoveryMinDays` and `recoveryMaxDays` on the event are then `displayedValue + daysAlreadyRested` so the values remain event-date-relative. If no prior event exists, write directly to the paddock's own `recoveryMinDays` / `recoveryMaxDays`.
- **Stamp the parent survey.** `surveys.date = surveyDate`, `surveys.status = 'committed'`. Delete the child `survey_draft_entries` rows for this survey — they're no longer needed once observations are written.
- **Bulk-edit replaces, not appends.** When re-committing a previously committed survey, delete the existing `paddock_observations` rows for `(sourceId = survey.id, pastureId)` before writing the new ones. This is the only place the v1-vs-v2 schema difference matters at the commit layer.

### 7.8 Field Mode Adaptations

The bulk and single survey tiles in field mode (`surveybulk` / `surveysingle` in `FIELD_MODULES`) reuse the same sheet, but the field-mode body class triggers four behavioral changes:

| Element | Field-mode behavior |
|---|---|
| Backdrop click | Disabled. Prevents an accidental dismissal while the farmer is bouncing the phone in their pocket. |
| Sheet handle | `display: none` — the visual swipe-down indicator is hidden so the user knows the sheet won't close that way. |
| Close button | Text changes from `✕` to `⌂ Done` (Unicode U+2302) — same as the move picker, feed-check picker, and heat picker. |
| Sheet sizing | Full-screen on mobile (the field-mode-sheet CSS defined in §16). |

Single-paddock surveys in field mode go through a picker first: `openPastureSurveyPickerSheet()` opens a sheet with farm pills (only when >1 farm), type filter pills (All / Pasture / Mixed-Use), a search input, and a sorted list of paddocks (active first, then alphabetical). Each row shows `📋 · name · acres · "active" badge · land-use + farm hint`. Tapping a row closes the picker and calls `openSurveySheet(pastureId)` for that paddock. On close of the survey sheet (or the picker), the field-mode `goHome()` helper returns the user to the field-mode tile grid — the muscle-memory "back to home" pattern that holds across every field-mode flow.

### 7.9 Surveys Sub-Tab on Locations Screen

The Locations screen carries a Surveys sub-tab alongside the location list. Two cards, top to bottom:

**Draft banner** — only renders when there's an in-progress bulk draft (`surveys.status = 'draft'` exists for the active operation). Reads *"📋 Survey in progress · {N} paddocks rated"* with two buttons: `Resume` (green, opens the bulk sheet pre-populated) and `Discard` (red text, confirms then deletes the draft entirely per §7.6's third close semantic).

**Committed list** — chronological (newest first) list of committed surveys for the active operation. Each row shows: date, paddock count rated, "{N} paddocks · ✓ committed", and an `Edit` button that opens bulk-edit mode for that survey. There is no per-paddock drilldown from this list — to see one paddock's history, the user opens the location edit sheet and looks at its survey history (entry point #6 in §7.2).

A `+ New Survey` button at the top of the sub-tab opens a fresh bulk survey (entry point #2). When a draft already exists, the button is disabled with a tooltip reading *"Resume the in-progress draft above first."* — there's at most one draft per operation at a time, matching v1.

### 7.10 Design Notes

Surveys don't have a `farm_id` on the parent record. A bulk survey can span paddocks across farms, and the farm context comes from each paddock's `farmId` at observation-write time. This is intentional — the survey is an event in the user's life ("I walked the farm Tuesday"), not a per-farm artifact.

The completion rule lives in `isBulkSurveyCardComplete(paddockId)` and is the only place that decides whether the ✓ Complete badge appears. Keep it strict and grep-friendly — adding new "required" fields means changing this one function and the farmer's mental model in lockstep, not adding a second list elsewhere.

### 7.11 Schema and Export Impact

All survey columns ship in V2_SCHEMA_DESIGN.md §6 (`paddock_observations`) and §7 (`survey_draft_entries`). Migration 022 added `farm_settings.bale_ring_residue_diameter_ft` (default 12.0) and verified `event_observations.bale_ring_residue_count` exists; OI-0111 / migration 027 then renamed `_ft` to `_cm` per the metric-internal rule. CP-55 / CP-56 carry these fields; old backups predating migration 022 default the diameter to 12 ft on import via the v21 → v22 chain entry in `BACKUP_MIGRATIONS`.

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

**Dam + Birth date — shared row layout (SP-14, OI-0132).** Dam and Birth date sit on a single visual row in the Edit Animal panel — Dam at ~55–60% width, Birth date at ~35–40% width — implemented as a flex row directly inside the existing panel scroll. Putting the two fields side-by-side makes the linkage between them self-evident at form-fill time instead of error-surface time, and reclaims the wasted full-width space the standalone Dam dropdown used to occupy. The separate full-width Birth date row that previously rendered after Notes is removed; `inputs.birthDate.value` is preserved unchanged so all downstream `saveAnimal()` reads continue to work.

The Birth date label carries a small grey hint that toggles dynamically with Dam selection. When Dam = "— unknown —" the hint reads `optional` in `--text2`. When Dam = any selected animal the hint flips to `required` in red (`--red`) so the OI-0132 Class A "birthdate required when dam is set" rule reads as a form-level cue rather than an after-save error. The toggle is wired to a `change` listener on the Dam select so it updates live without a re-render. Initial render of an existing calf with a dam already set shows the red `required` hint immediately. On save, if the hard-gate trips (Dam set, Birth date blank), the inline error renders directly below the Birth date field — short field, short error: *"Birth date is required when a dam is set."*

On a narrow mobile viewport (≤ 400px) the two columns may wrap and stack; both take full width in that case as an acceptable fallback. The data-logic side of OI-0132 (bidirectional dam-calf sync helper at `src/features/animals/calving-sync.js`) shipped 2026-04-22 in commit `e9b40eb`; this layout supports the rule the helper enforces.

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

A dedicated mobile-optimized UI mode for in-the-paddock work. Strips away navigation chrome and presents the most common field tasks as large, tappable action tiles. Designed for use while walking, wearing gloves, or in bright sunlight. The v2 field mode renders to **v1 parity** — eight configurable modules, user-selectable tile grid, expandable event cards reusing the dashboard location card, interactive tasks, and field-mode-aware sheet behavior.

### 16.1 Activation

Field mode is toggled exclusively via the **header pill button** in the app header right-cluster (`data-testid="header-field-mode-toggle"`). The pill is contextual — its label and behavior depend on whether field mode is active and what route the user is on:

| Context | Pill text | Style | Action |
|---------|-----------|-------|--------|
| Not in field mode (any screen) | `⊞ Field` | `btn btn-outline btn-xs` (subtle, neutral border) | Enter field mode → `setFieldMode(true)` → save current `window.location.hash` to `sessionStorage` (for exit-returns-to-previous) → `navigate('#/field')` |
| Field mode, on home (`#/field`) | `← Detail` | `btn btn-green btn-xs` (green, active) | Exit field mode → `setFieldMode(false)` → read saved hash from `sessionStorage` and `navigate(savedHash || '#/')` |
| Field mode, on any sub-screen | `⌂ Home` | `btn btn-green btn-xs` | Return to field mode home → `navigate('#/field')` (stay in field mode) |

The pill must update its text and handler on every route change — either subscribe the header to hashchange or call `updateFieldModeToggle()` from the router after each navigation. There is **no green field-mode header bar** inside the field mode screen — the v1 parity rebuild deletes the `.field-mode-header` element entirely. Navigation in and out of field mode happens only through the header pill.

**Persistence:** Field mode state persists in user preferences (the existing `field_mode` flag on `user_preferences`). Once activated, it persists across sessions until toggled off.

**Exit returns to previous screen.** When the user enters field mode from a non-dashboard screen (Animals, Reports, Settings, etc.), exiting field mode returns to that screen, not to the dashboard. The header pill writes `window.location.hash` to `sessionStorage` under a known key on entry; the exit handler reads it back. This matches the farmer's mental model — "I dipped into field mode for a quick log, now drop me back where I was."

### 16.2 body.field-mode CSS gate

Field mode applies a `body.field-mode` class as a CSS-level gate. `setFieldMode(true)` adds it; `setFieldMode(false)` removes it; the app init reads `getFieldMode()` and applies the class on boot. The class hides chrome that doesn't belong in the field:

```css
body.field-mode .desktop-sidebar      { display: none !important; }
body.field-mode .bottom-nav           { display: none !important; }
body.field-mode .header-sub-row       { display: none !important; }  /* SP-6 feedback row */
body.field-mode .header-build-stamp   { display: none !important; }
body.field-mode .app-layout           { grid-template-columns: 1fr; }  /* desktop grid collapse */
```

The header pill's own `.btn` border color is also gated on this class so the pill takes on the green active treatment when field mode is on.

### 16.3 Field Mode Home Screen

The field mode home replaces the standard dashboard with a task-oriented layout. Top to bottom:

1. **Sub-heading** — *"Field mode"* (16px, 600 weight) followed by a hint line: *"Tap to log. Use ← Detail in the header to return to the full app."* Both strings flow through `t()` (`fieldMode.homeTitle` and `fieldMode.homeHint`).
2. **Tile grid** — dynamic, driven by the `FIELD_MODULES` constant filtered against the user's `field_mode_quick_actions` preference. See §16.4.
3. **Active events section** — expandable cards, one per active event. See §16.6.
4. **Tasks section** — interactive todos with checkboxes and due-date color coding. See §16.7.

### 16.4 Tile Grid (8 Modules)

The tile grid is dynamic. v2 ships eight modules, all configurable per-user via Settings (§20.1). The user's enabled set defaults to `['feed', 'harvest', 'surveybulk', 'animals']` when their `field_mode_quick_actions` preference is null.

| Key | Icon | Label key | Handler behavior |
|---|---|---|---|
| `feed` | 🌾 | `fieldMode.feedAnimals` | Opens Quick Feed sheet. After each delivery the sheet returns to the event picker (§4.2 loop), not field mode home. "Done" on the picker returns to `#/field`. |
| `move` | 🐄 | `fieldMode.moveAnimals` | Filter to events with `dateOut == null`. Zero open events → toast. One → open Move Wizard directly. Multiple → open the shared event picker sheet (§16.5), select event → Move Wizard. |
| `harvest` | 🚜 | `fieldMode.harvest` | Opens the Harvest sheet directly with `{ fieldMode: true }`. |
| `feedcheck` | 📋 | `fieldMode.feedCheck` | Filter to events with at least one `event_feed_entries` row. Zero → toast (`fieldMode.noStoredFeed`). One → open Feed Check sheet directly. Multiple → event picker → Feed Check sheet. |
| `surveybulk` | 📋 | `fieldMode.survey` | Opens the Bulk Survey sheet directly. |
| `surveysingle` | 📋 | `fieldMode.surveySingle` | Opens the pasture survey picker sheet (`openPastureSurveyPickerSheet`) — a location picker with farm/type/search filters; selecting a location opens the single-paddock survey for that location. Falls back to `navigate('#/surveys')` if the picker doesn't exist. |
| `animals` | 🐄 | `fieldMode.animals` | `navigate('#/animals')`. |
| `heat` | 🌡️ | `fieldMode.recordHeat` | Opens the heat picker sheet (`openHeatPickerSheet`) — see §16.8 for the 2-step animal picker flow. |

Tile rendering: a single button per active key, ~88px min height, 32px icon centered above a 13px label. On touch, the tile flashes a green-light background (`var(--green-l)`) and green border for tactile feedback. When the user has all eight modules disabled, the grid renders an empty-state message: *"No modules active — go to Settings to add tiles."*

### 16.5 Shared Event Picker Sheet

`openFieldModePickerSheet(type, events, onSelect)` is the shared picker used by Move, Feed Check, and the heat-fallback path when multiple open events exist. The sheet renders a list of event rows; each row shows location name (14px, 600 weight) and group names sub-line (12px, `--text2`). Tapping a row calls `onSelect(event)`, which closes the sheet and dispatches to the handler (open Move Wizard, open Feed Check sheet, etc.). The picker uses field-mode sheet treatment (no backdrop close, hidden handle, "⌂ Done" button). Tapping "⌂ Done" closes the sheet and navigates back to `#/field`.

### 16.6 Active Events Section — Expandable Cards

Below the tile grid. One row per active event.

**Collapsed row** — compact: green/grey accent bar · 🌿 location name · acreage · sub-line `{group names} · Day {N}{submove suffix}` · **Move all** button (`btn btn-teal btn-sm`, opens Move Wizard for the event) · expand chevron (`›`).

**Expanded state** — replaces the collapsed row with the **full dashboard location card** (§17.7) wrapped in a teal border, with a collapse handle (`⌃`) at the top to dismiss. The expanded card is rendered by importing `buildLocationCard()` from `src/features/dashboard/index.js` — not a lightweight reimplementation. This guarantees the expanded card shows the same DMI chart, feed/cost values, group lines, and sub-paddock structure that the dashboard does.

Only one event can be expanded at a time; expanding a second collapses the first. Tracked via a module-scope `expandedEventId` variable.

The `Move all` button on collapsed rows opens the Move Wizard scoped to the event. To prevent accidental taps while scanning the list, any other event-scoped actions (Add sub-move, etc.) live exclusively inside the expanded card body — never on the collapsed row.

### 16.7 Tasks Section — Interactive

Below the active events section. Up to 4 open todos for the current user, plus an **+ Add** action in the section header (opens the todo create sheet).

**Task row:** checkbox (18px, rounded square) · title (13px) · due-date sub-line (11px, color-coded).

**Due-date color coding:**
- Overdue: `--color-red`, text `Overdue · {date}`
- Due today: `--color-amber`, text `Due today`
- Future: `--text3`, text `Due {date}`
- No due date: no sub-line

Tapping the checkbox marks the todo closed (`status = 'closed'`, `closedAt = now()`) via the store. Tapping the row body opens the todo edit sheet. If the user has more than four open todos, render a **View all** link below the list that navigates to `#/todos`.

**Note:** Time-sensitive system-derived alerts (withdrawal end, overdue survey nudges, weaning targets, upcoming calving) belong on the detail-mode dashboard as widgets — not in field mode. Field mode tasks are the user's explicit todo list only.

### 16.8 Record Heat — 2-Step Animal Picker

The Heat module tile opens a dedicated heat picker sheet — a 2-step flow specific to field mode that replaces the v1 "auto-select first female" shortcut.

**Step 1 — Animal picker.** Filter pills at the top: an **event** pill row (one pill per active event, plus an "all" pill) and a **group** pill row (one pill per group on the active events, plus "all"). A search box matches tag, name, or ear-tag. The list below renders all matching female animals as cards. The picker supports **multi-record** — tapping multiple animals queues each into the heat sheet.

Default filter state on open: event = "all", group = "all", search empty.

**Step 2 — Heat recording.** Standard Heat Recording sheet (§14.6) bound to the selected animal(s). For multi-select, the sheet steps through each animal in turn. After the last save, the picker closes and `navigate('#/field')` returns to the field mode home.

**Sheet treatment:** field-mode rules apply — no backdrop close, sheet handle hidden, close button text "⌂ Done".

### 16.9 Feed Check Loop — Feed Animals Tile

Selecting the Feed Animals tile opens the Quick Feed sheet. After completing a feed delivery, the sheet does not close to field mode home — it returns to the event picker so the farmer can feed the next group. **Done** on the event picker returns to `#/field`. This supports the morning/evening feeding loop: feed group 1 → feed group 2 → … → Done.

The Feed Check save handler also redirects to `#/field` instead of just closing — once the farmer has logged the check, return them to field mode home, not to whatever lower-level screen the sheet was opened from.

### 16.10 Field-Mode Sheet Behavior

Every sheet that opens in field mode applies the following treatment:

- **Full-screen on mobile** — `body.field-mode .sheet-panel { border-radius: 0; max-height: 100vh; }`
- **Backdrop tap-to-close disabled** — sheet open functions check `getFieldMode()` and skip wiring the backdrop click handler when true.
- **Sheet handle hidden** — `body.field-mode .sheet-handle { display: none; }`
- **"⌂ Done" close button** — close buttons relabel from `✕` to `⌂ Done` in field mode.
- **After save → field mode home** — sheet save handlers check `getFieldMode()` and `navigate('#/field')` instead of the normal close-to-originator behavior. Exception: feed-loop sheets return to the event picker (§16.9).

### 16.11 Module Settings (Settings Screen)

A new card in the Settings preferences section: **Field Mode Modules**. Lists all 8 modules with icon, label, and a v1-style toggle pill (green filled when on, neutral outline when off). Toggling writes the new array to `user_preferences.field_mode_quick_actions` via `store.update()` with full 6-param signature. When the preference is null, the default set is `['feed', 'harvest', 'surveybulk', 'animals']`. Changes take effect immediately — the field mode home re-renders the tile grid against the new preference.

Position the card after the existing "Home view" preference card.

### 16.12 Design Notes

- Field mode is a **UI mode**, not a separate app. Same store, sync, and data layer power both modes. The differences are navigation structure (no nav, header pill only), sheet presentation (full-screen, no backdrop close, "⌂ Done"), and the tile-grid home screen.
- Field mode is primarily a mobile pattern, but works on tablet/desktop — tiles scale up; sheets stay full-screen on mobile and standard-width on desktop.
- All data entered in field mode syncs through the same SyncAdapter (A10). No special offline handling.
- The expanded event card reuses `buildLocationCard()` from the dashboard. Any dashboard card improvements (e.g. SP-3 v1 parity, future enhancements) flow into field mode for free.

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

**Feedback & Help sub-row:** A compact two-button row sits directly below the main header row, replacing v1's floating action button (no FAB in v2). It's a separate visual band so the existing right cluster is unchanged.

The sub-row is 28px tall, right-aligned to match the main right cluster, with 8px gap between the two buttons (same as the main row's right-cluster gap), `0 12px` padding (left auto-margin pushes the buttons right), a 1px `--border` bottom divider that matches the main header's bottom border, and a `--bg` background. The two buttons share `btn btn-outline btn-xs` styling at 11px/500 with `3px 10px` padding and `--radius` (6px) corners. The button labels are "💬 Feedback" and "🆘 Get Help" with the emoji prefix carried verbatim into the rendered string (per v1 styling).

Responsive behavior: visible on both desktop (≥900px, in the main content header above the page area) and mobile (<900px, same position) down to a 280px viewport — the two compact buttons fit any width that the main app supports. The sub-row is **hidden in Field Mode** (matches v1's FAB-hidden-in-field-mode rule).

Each button opens its own pre-configured sheet — no type toggle, no decision step before the user can write. The Feedback button opens a sheet with `type='feedback'`, title "Leave feedback", showing all seven category pills (🚧 Roadblock, Bug, UX friction, Missing feature, Calculation, Idea, Question). The Get Help button opens a sheet with `type='support'`, title "Get help", showing only the four "I have a problem" categories (Roadblock, Bug, Calculation, Question — the suggestion-shaped categories belong only on the Feedback sheet) and an always-visible Priority dropdown (Normal, High = blocking my work, Urgent = data at risk, Low = when you get a chance). Both sheets share the rest of their structure: an auto-filled read-only context tag (current screen + active event info), an auto-filled-but-editable Area dropdown using v2 screen names (`dashboard`, `rotation-calendar`, `animals`, `feed`, `locations`, `harvest`, `field-mode`, `reports`, `settings`, `sync`, `other` — note `home` → `dashboard`, `events` → `rotation-calendar`, `pastures` → `locations`, `todos` removed for v2 launch), a required Note textarea (placeholder copy differs per sheet), and Save / Cancel buttons. Both write to the existing `submissions` entity with the `type` field set automatically based on which button opened the sheet — there are no schema changes (V2_INFRASTRUCTURE.md §4.2 already covers `submissions`).

Unread badge counts on these header buttons are out of scope; the badge surface lives on the desktop Feedback nav item (see §21).

**Switching farms with unsaved work:** When the user selects a different farm in the picker and there's an unsaved survey draft or an open wizard scoped to the current farm, show a confirm dialog: title "Unsaved work on {currentFarmName}", body "You have an unsaved {draftType} — it'll be kept here and you can return to it later.", buttons [Switch anyway] (primary `--green`) · [Cancel] (ghost). Drafts stay scoped to the farm they were started on — no discard from this dialog; discard lives inside the draft itself. See §18 for the full flow.

**Desktop sidebar** follows §3.6 exactly: 220px fixed, logo strip (32×32 icon, green bg, rounded, 14px bold farm name, 11px subtitle), nav items with hover (`--bg2`) and active (`--green-l` bg, `--green-d` text, 600 weight), sync strip at bottom (border-top, 11px, `--text2`).

**Nav items:** Dashboard, Events, Locations, Animals, Feed, **Todos**, Reports, Settings, **Feedback** (desktop sidebar only — not in mobile bottom nav; see SP-7). (V1 had 9 screens including Pastures and Feedback; v2 merges Pastures into Locations, adds Feedback submit buttons to the header sub-row (SP-6), and adds a desktop-only Feedback management screen (SP-7).)

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

Alternate card grid when `home_view_mode = 'locations'`. Shows active events grouped by location, plus an unplaced groups section. The card renders to **v1 parity** — every farmer migrating from v1 must perceive the v2 dashboard card as the same card, not a new one. Two — and only two — deliberate deltas from v1 are applied (see "Deliberate v1 deltas" below).

**Grid:** Same layout as groups view (single column mobile, `1fr 1fr` desktop, 14px gap).

#### Active event cards — v1-parity anatomy

One card per active event (location-centric). Top to bottom, every element is required and renders in this order:

1. **Left green accent bar** — full-height, runs the left edge of the card. Identifies the card visually as a location card and matches v1.
2. **Header row** — leaf icon (🌿) · location name (14px, 600 weight) · acreage (in user units, e.g. `7.42 ac`). Floating top-right: small **Edit** button (pencil) and small **Move all** button. The Move-all button calls `openMoveWizard(event, operationId, farmId)` for every group on the event.
3. **Event type badge** — inline with the summary line, using §3.3 chip pattern. Examples: `stored feed & grazing`, `grazing`, `confinement`. Color: pasture/grazing → `--green`, mixed-use → `--teal`, confinement → `--amber`, crop → `--purple`. Stored-feed-and-grazing uses an amber-tinged variant to signal both inputs are active.
4. **Summary line** — `Day N · In {date} · ${cost}`. `Day N` is the inclusive day count since `event.dateIn`. `In {date}` shows the start date in user locale. Cost is the rolled-up event cost from CST-1 (calc engine).
5. **Weight line** — `{W} lbs · {AU} AU`. Total live weight (sum of `headCount × avgWeightKg` across active group windows, converted to user units) and total Animal Units.
6. **Green capacity line** — `Est. capacity: {N} AUDs · ~{M} days remaining (incl. stored feed) · {H}" · ADA est: {X}/ac`. From CAP-1. The `{H}"` is current standing forage height (most recent pre-graze observation, in user units). `ADA` is animal-days-per-acre estimate over the event's projected lifespan.
7. **Gray breakdown line** — `Pasture: {X} lbs DM · Stored feed: {Y} lbs DM · DMI demand: {Z} lbs/day`. Sources: FOR-1 (standing pasture DM), batch ledger (stored feed DM remaining on this event), DMI-1 (per-day demand based on AU and forage condition).
8. **`+ Add sub-move` link** — teal text link, opens the sub-move open sheet for this event.
9. **`SUB-PADDOCKS` section** — only renders when at least one sub-move exists on the event. One row per paddock window: status dot (open = green, closed = grey) · paddock name · acreage · `since {date}` · `active` or `closed` label · **Close** button on active rows (opens the sub-move close sheet, which on stored-feed events forces a feed check inline per §12 — see also §17.15.1).
10. **`GROUPS` section** — one row per active group window: status dot (group color) · group name · sub-line `{head} head · avg {W} {unit}` · **Move** button (opens move wizard scoped to that group). **No reweigh icon** — per-group reweigh is not on the dashboard card in v2 (see "What is NOT on this card" below).
11. **`DMI — LAST 3 DAYS` chart** — three bars (today + two days). Today renders solid; future days render striped with a `(est.)` label. Stored-feed segment renders amber at the base of each bar; grazing segment renders green above it. Today's total DMI value renders large on the right of the chart. Always-on legend below: `■ grazing · ■ stored`. The chart obeys the SP-12 / OI-0119 cascade — see §17.15.1 "DMI chart status model" for the five-state status set, deficit segment render, and `(Fix)` CTA links on missing-data bars.
12. **Large amber `Feed check` button** — full-width, `btn btn-amber`. Opens the feed check sheet for this event.
13. **Large green `Feed` button** — full-width, `btn btn-green`. **NEW in v2** — opens the deliver-feed sheet for this event. Sits directly below the Feed check button.
14. **DMI/NPK summary line(s)** — `DMI {N} lbs/day · X% stored · Y% est. pasture` and `NPK: N{n} / P{p} / K{k} lbs · ${value} value`. From DMI-1, NPK-1, NPK-2.
15. **No small bottom buttons.** v1 had two small `Feed check` and `Feed` text buttons at the very bottom of the card, below the NPK line. Both are removed in v2 — the large amber Feed check (#12) and large green Feed (#13) replace them.

#### Deliberate v1 deltas

Only two changes from v1 are applied. Every other element renders as v1 does.

1. **Removed:** the two small `Feed check` and `Feed` buttons that sat at the very bottom of the v1 card (below the NPK line).
2. **Added:** the large green `Feed` button (#13), full-width, sitting directly below the existing large amber `Feed check` button (#12).

The `Feed check` and `Feed` actions are accessed exclusively via the two large buttons. The v1 small-button shortcut is dropped — no second entry point.

#### What is NOT on this card

- **Per-group reweigh icon.** v1 showed a small scale icon next to the per-group Move button. v2 does not — reweigh moves to the Animals area. Tracked as **OI-0065** (P3, follow-up).
- (OI-0066 closed — per-group Move on this card now opens the wizard in scoped mode, closing only the tapped group's window. See §1 for the three modes.)

#### Header buttons (top-right, floating)

All three buttons receive the active event object plus operationId and farmId from the rendering context.

- **Edit (pencil icon)** — opens the Event Detail sheet (§17.15) via `openEventDetailSheet(event, operationId, farmId)`. The sheet is the v2 equivalent of v1's Edit Event sheet.
- **Move all** — calls `openMoveWizard(event, operationId, farmId)` directly. Does not navigate to the Events screen.

The `+ Add sub-move` link (#8) and the per-row Close (#9) and Move (#10) buttons follow the same direct-sheet pattern. No card action navigates away from the dashboard route — every interaction opens a sheet on top.

#### Survey entry point

Survey creation lives on the Surveys screen (§7) and on the per-paddock survey CTA inside the Event Detail sheet (§17.15). The dashboard location card does **not** expose a Survey button at the card level — v1 didn't either, and SP-3 explicitly preserves that.

#### Unplaced groups section

Renders below the active event card grid when at least one group has no open `event_group_window`.

- Section header: `Unplaced groups` (`.sec` label).
- One row per unplaced group: group name + head count + **Place** button (`btn btn-teal btn-sm`) — opens move wizard with the group pre-selected and no source event.
- Hidden entirely when no unplaced groups exist.

#### Empty state

If no active events exist, the locations view shows: *"No active events. Place a group to start grazing."* (13px, `--text2`, centered).

#### v1-parity reference

The full line-by-line spec, including the v1 HTML/CSS reference extracted verbatim, mockup v3, and acceptance criteria, lives in `github/issues/dashboard-card-enrichment.md` (SP-3 spec file). The spec file is the canonical implementation reference; this section documents the resulting card in flow-doc form.

**Linked OPEN_ITEMS:**

- **OI-0065** — Per-group reweigh moved from dashboard card to Animals area (P3, follow-up).

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

### 17.15 Event Detail View

Full-screen view for a single active or closed event. Opens when the user taps **Edit** on a dashboard location card (§17.7) or taps an event row in the events log. This is the v2 equivalent of v1's "Edit event" sheet — the central place to see everything about a grazing event and take action on it.

**Navigation:** Uses query parameter on the events route: `#/events?detail={eventId}`. The router already ignores query params for route matching, so this works within the existing `#/events` route. When the detail param is present, the events screen renders the detail view instead of the calendar/list. A **← Back** button navigates to the previous hash (or `#/` if no history).

**Layout — single scrollable column:**

```
┌───────────────────────────────────────────────┐
│ ← Back                            ● Active    │
│                                               │
│ ┌─ LOCATION ─────────────────────────────────┐│
│ │ 🌿 D  anchor            7.42 ac            ││
│ │ pasture · grazing                          ││
│ │ Forage: 4 in  · Cover: 85%                ││
│ │ [Close paddock]                            ││
│ └────────────────────────────────────────────┘│
│                                               │
│ ┌─ EVENT SUMMARY ────────────────────────────┐│
│ │ Date in: Mar 24, 2026    Date out: —       ││
│ │ Day 23 · 3 head · 4,350 lbs · 4.3 AU      ││
│ │ Est. capacity: 80 AUDs · ~6 days remaining ││
│ │ ADA est: 10.8/ac                           ││
│ │ Pasture: 2,078 lbs DM · Stored: 638 lbs   ││
│ │ DMI demand: 109 lbs/day                    ││
│ └────────────────────────────────────────────┘│
│                                               │
│ ┌─ PRE-GRAZE OBSERVATIONS ──────────────────┐│
│ │ Forage height: 4 in                        ││
│ │ Forage cover: 85%                          ││
│ │ 100% stored feed: ☐                        ││
│ └────────────────────────────────────────────┘│
│                                               │
│ ┌─ GROUPS ───────────────────────────────────┐│
│ │ ● Bull Group  primary       [Move] [✕]     ││
│ │   Joined Mar 24 · 3 head · avg 1450 lbs   ││
│ │   4.3 AU                                   ││
│ │ [+ Add group]                              ││
│ └────────────────────────────────────────────┘│
│                                               │
│ ┌─ FEED ENTRIES ─────────────────────────────┐│
│ │ Apr 1 · 1 bale Oak Field Barn              ││
│ │          638 lbs DM · $45.00    [Edit] [✕] ││
│ │ [+ Deliver feed]                           ││
│ └────────────────────────────────────────────┘│
│                                               │
│ ┌─ FEED CHECKS ─────────────────────────────┐│
│ │ Apr 13 · 90% remaining                     ││
│ │ [+ Feed check]                             ││
│ └────────────────────────────────────────────┘│
│                                               │
│ ┌─ DMI — LAST 3 DAYS ───────────────────────┐│
│ │ ▓▓▓▓▓  ▓▓▓▓▓  ▓▓▓▓▓  109 lbs DMI today   ││
│ │ Mon✓   Tue    Wed     ■ grazing ■ stored   ││
│ └────────────────────────────────────────────┘│
│                                               │
│ ┌─ DMI BREAKDOWN ────────────────────────────┐│
│ │ DMI 109 lbs/day · 0% stored · 100% pasture││
│ │ NPK: N32.0 / P9.0 / K30.0 lbs · $36.07   ││
│ └────────────────────────────────────────────┘│
│                                               │
│ Notes: [editable text area]                   │
│                                               │
│ ┌─ SUB-MOVE HISTORY ────────────────────────┐│
│ │ (collapsible, shows sub-move paddock       ││
│ │  windows with dates and observations)      ││
│ │ [+ Add sub-move]      [Manage]             ││
│ └────────────────────────────────────────────┘│
│                                               │
│ ┌─ ACTIONS ──────────────────────────────────┐│
│ │ [====== Move all groups ======]  (teal)    ││
│ │ [== Close event & move groups ==] (olive)  ││
│ │ [Delete event]                   (red)     ││
│ └────────────────────────────────────────────┘│
└───────────────────────────────────────────────┘
```

**Section details:**

**Header:** Back arrow (left) + status badge (right): "Active" (green dot + green badge) or "Closed" (grey badge with dateOut).

**Location section:**
- Location name (16px, 700 weight) + land use type + "anchor"/"secondary" label
- Acreage from `locations.areaHa` (converted to display units via `units.js`)
- Most recent observation: forage height and cover % (from `paddock_observations` where `source = 'event'`, `source_id` matches one of this event's paddock windows, most recent by `observed_at`)
- "Close paddock" button → calls `openCloseEventSheet(event, operationId)` (only shown for active events)

**Event summary section:**
- Date in / date out (formatted, date out shows "—" if active)
- Day count (from `daysBetweenInclusive(event.dateIn, today)`)
- Total head count (sum of all active group windows' `headCount`)
- Total weight (sum of `headCount × avgWeightKg` across group windows, converted to display units)
- Total AU (weight in lbs ÷ 1000, or use registered calc if available)
- Estimated capacity in AUDs (from calc engine CAP-1 if registered, otherwise omit)
- Days remaining estimate (capacity AUDs ÷ current AU, minus days elapsed)
- ADA estimate (AU ÷ location area in display units)
- Pasture DM / Stored feed DM / DMI demand (from calc engine DMI-1, DMI-2)

**Pre-graze observations section:**
- Displays values captured at event open: `forageHeightCm`, `forageCoverPct` (from `paddock_observations` with `source = 'event'`, `type = 'open'`, `source_id` matching the event's paddock window)
- "100% stored feed" checkbox state
- Read-only display for closed events; editable for active (inline save via store update)

**Groups section:**
- One row per active group window (sorted by `dateJoined`)
- Each row: group name + status dot (color from group entity) + "primary" badge (if first group) + **Move** button (calls `openMoveWizard` for just that group) + **✕** remove button (calls `openGroupRemoveSheet`)
- Sub-line: date joined, head count, avg weight (display units), AU
- **+ Add group** button → calls `openGroupAddSheet(event, operationId)`

**Feed entries section:**
- One row per `eventFeedEntries` record (sorted by date desc)
- Each row: date, description (batch name + location), DMI amount (lbs DM), cost, Edit button, delete ✕
- **+ Deliver feed** button → calls `openDeliverFeedSheet(event, operationId)`

**Feed checks section:**
- One row per feed check (sorted by date desc)
- Each row: date, remaining % by batch
- **+ Feed check** button → calls `openFeedCheckSheet(event, operationId)`

**DMI chart:**

3-day stacked bar chart shared with the dashboard location card (§17.7 element #11). Both surfaces render through the single component at `src/ui/dmi-chart.js`. The chart obeys the SP-12 / OI-0119 cascade allocation model — see V2_CALCULATION_SPEC.md §4.2 (DMI-8) for the canonical calc spec. Each bar represents one day across a 3-day window (today plus two), with grazing rendered green at the top of the stack and stored feed rendered tan (`--color-tan-base`, `#C9A875`) at the base. Tan — not amber — is correct here: amber sits perceptually adjacent to the deficit red and made the bar hard to read at a glance (2026-05-04). See V2_DESIGN_SYSTEM.md §1.1 for the tan vs. amber rationale.

The chart now reports five distinct status values per day. The status drives bar appearance, label, and any inline call-to-action. The five-state model replaced the earlier three-state model (actual / estimated / no_data) when SP-12 shipped, because real field-test data surfaced cases where a day had neither pasture data nor animals on the paddock — collapsing those into a single "no data" status hid the difference between *missing observation* (fixable with a CTA) and *no animals here yet* (not actionable, just blank).

| Status | Bar render | Label | CTA |
|---|---|---|---|
| `actual` | Solid two-stack (green pasture / tan stored) | Total DMI value · day label · `✓` indicator | None |
| `estimated` | Striped two-stack (existing diagonal pattern) | Total DMI value with `(est.)` suffix · day label | None |
| `estimated` with `deficitKg > 0` | Striped two-stack + **red segment atop the stored stack** sized to the deficit portion | Total DMI value `(est.)` with `+X deficit` sub-label · day label | None |
| `needs_check` | Grey short bar at fixed minimum height · `—` value | "Feed check needed" hint | None — the hint is the prompt; the user opens Feed Check from the card-level button |
| `no_pasture_data` (`reason: 'missing_observation'`) | Grey short bar · `—` value | "Add pre-graze" | Inline link → opens the Edit Paddock Window dialog (OI-0118) for the owning paddock window |
| `no_pasture_data` (`reason: 'missing_forage_type'`) | Grey short bar · `—` value | "Set forage type" | Inline link → opens the Location edit sheet for the paddock |
| `no_animals` | Blank space at bar height (no rendered bar) · `—` value | Day label only | None |

**`needs_check` status — "Feed check needed" hint.** When an event has stored-feed deliveries (any `event_feed_entries` row with `entry_type = 'delivery'` exists) but no recent feed check on a feed line, the cascade returns `needs_check` for the affected days. The chart renders the grey short bar with the inline hint text — the user opens Feed Check from the card-level button, not via a per-bar link. The `needs_check` status replaces the earlier ambiguous "no data" treatment for stored-feed events that lacked a strike point; surfacing it explicitly tells the farmer *what* to do next.

**Deficit segment.** When the cascade exhausts both pasture and stored buckets before meeting demand for the day, `deficitKg > 0` and the bar grows a red segment atop the tan stored stack. The sub-label `+X deficit` renders below the total. This is information-only — the chart doesn't take action on the deficit; it surfaces it so the farmer can react (deliver more feed, move animals, accept the under-feed).

**Legend.** Always-on: `■ grazing · ■ stored`. Conditional: `■ deficit` (red) appears in the legend only when at least one bar in the 3-day window has `deficitKg > 0`. The conditional swatch keeps the legend honest — no permanent "deficit" entry implying every event is in deficit.

**Partial pre-graze hint.** When a pre-graze observation has `forageHeightCm` but no `forageCoverPct`, the cascade defaults cover to 100% and the chart renders the bar normally with a subtle hint below: *"(assuming 100% cover — Fix)"*. Tapping "Fix" opens the Edit Paddock Window dialog for the observation. Best-effort render with a fixability link, not a fallthrough to `no_pasture_data` — preserves the farmer's incomplete data while surfacing the gap.

**Source-event bridge — date-routing only.** When an event was opened via the close-and-move flow, its `source_event_id` links back to the prior event. The 3-day chart window can span across that boundary; each chart day is routed to whichever event owned that calendar day, and DMI-8 runs against **that event's** self-contained cascade. There is no state handoff between events — stored feed physically carried from the old paddock to the new paddock does not appear on the new event's chart unless the farmer logs it as a delivery on the new event. Matches existing v1 + v2 semantics (deliveries are event-scoped).

The chart receives an `opts.onNoPastureData(reason, pw)` callback (wired by Event Detail to open the Edit Paddock Window dialog or Location edit sheet) and an `opts.onPartialPreGraze(pw)` callback for the "Fix" link. Surface integration details live in the SP-12 spec file (`github/issues/GH-29_dmi-8-cascade-rewrite.md`); this section documents the user-facing chart contract.

**Forced feed-check on sub-move close.** When `event.hasStoredFeed` is true (any `event_feed_entries` row exists), the Sub-move Close sheet renders a required feed-check card inline and blocks Save until the farmer records remaining stored feed for each batch. This strikes a clean `actual`/`estimated` boundary at the close date — the prior stored interval retroactively flips from `estimated` to `actual`. No pasture observation is forced (pre-graze observations are too subjective to be a useful boundary marker). Documented in §17.15.1 ("Sub-move Close — forced feed check") and in V2_UX_FLOWS §12.

**DMI breakdown section:**
- Total DMI per day, % stored vs % pasture
- NPK values (N/P/K in lbs) and total NPK dollar value
- Data from calc engine NPK-1, NPK-2

**Notes section:**
- Editable textarea bound to `events.notes`
- Auto-saves on blur via `store.update()`

**Sub-move history section:**
- Collapsible (default collapsed)
- Lists all paddock windows for this event (both open and closed)
- Each entry: location name, dates, observations
- **+ Add sub-move** → calls `openSubmoveOpenSheet(event, operationId)`
- **Manage** button → toggles expanded view with close/reopen actions

**Actions section:**
- **Move all groups** (teal, full width) → calls `openMoveWizard(event, operationId, farmId)`
- **Close event & move groups** (olive/dark green, full width) → calls `openCloseEventSheet(event, operationId)` with move-after-close flow
- **Delete event** (red text, no fill, left-aligned) → confirmation dialog, then `store.remove('events', event.id, 'events')`

**Responsive behavior:**
- Same single-column layout on mobile and desktop
- On desktop (≥900px), max-width 720px, centered
- All sections use card styling (`.card` class with padding and border-radius)

**Data dependencies:**
- `getById('events', eventId)` — core event
- `getAll('eventPaddockWindows').filter(w => w.eventId === eventId)` — paddock windows
- `getAll('eventGroupWindows').filter(gw => gw.eventId === eventId)` — group windows
- `getAll('eventFeedEntries').filter(fe => fe.eventId === eventId)` — feed entries
- `getAll('eventFeedChecks').filter(fc => fc.eventId === eventId)` — feed checks
- `getAll('eventObservations').filter(o => o.eventId === eventId)` — observations
- `getById('locations', paddockWindow.locationId)` — location details
- `getById('groups', groupWindow.groupId)` — group details
- `getById('batches', feedEntry.batchId)` — batch details for feed
- Calc engine: DMI-1, DMI-2, DMI-3, CAP-1, NPK-1, NPK-2, CST-1

**Subscription:** Subscribe to store changes for the event's entity types. Re-render affected sections on change (not full page — surgical updates to keep scroll position).

### 17.15.1 Event Data Editing

Section §17.15 ships the Event Detail sheet — the container and its 13 sections. This subsection defines the **edit behavior** of every field inside that sheet: what happens when the farmer changes a date, a head count, a feed amount, or an observation value, and how the rest of the event's data (and, where applicable, other events) stay consistent.

Field testing was blocked on this work — the product has to answer "what happens if I edit X?" predictably for every X on the event detail, or users create silent inconsistencies that accumulate over time. The full behavior was walked through and ratified across §7 Groups, §12 Sub-moves, event-level dates, §8 Feed Entries, §8a Move Feed Out, §9 Feed Checks, §3 Pre-graze Observations, and §6 Post-graze Observations during the SP-10 ratification (2026-04-17). This subsection is the flow-doc representation of that ratified behavior; the spec file (`github/issues/` SP-10) is the implementation reference.

#### Core principle

Two lines split everything in this subsection.

**Derived values compute on read.** DMI, NPK, cost, days on pasture, forecast end, accuracy stats — none are stored; all are recomputed from their inputs on every read. Any edit to an input automatically produces the correct downstream number on the next render. This is existing v2 architecture (the "Compute on Read" rule in CLAUDE.md and V2_APP_ARCHITECTURE.md) and it's why this subsection doesn't need cascade logic for calculations.

**Structural state requires explicit reconciliation.** Edits that would rewrite a *different* record (a prior event's `date_left`, a sibling paddock window's `date_joined`, a head-count snapshot) never cascade silently. They surface a resolution dialog and the farmer chooses. This applies anywhere a date-bounded record (group window, paddock window, event-level date) is being edited.

#### Shared routine — Gap / Overlap Resolution

Triggered whenever a structural edit (group window, paddock window, event-level date) creates either a **gap** (a time range where a group is unplaced — no open `event_group_window` covers the period) or an **overlap** (a group in two open or closed windows simultaneously, violating "one open window at a time"). The resolution dialog detects which case applies (or both) and offers the options below.

**Gap — three options.**

The first is **leave unplaced** — accept the gap. The prior window's `date_left` stays put; the edited window's new `date_joined` stands. The group is recorded as unplaced for the gap period. A small banner on the dashboard surfaces unresolved unplaced windows.

The second is **extend prior event** — push the prior `event_group_window`'s `date_left` forward to match the new `date_joined`. Continuous history preserved. One write to a different record, explicitly authorized by the farmer in this dialog.

The third is **move to existing event (retro-place)** — the gap is filled by recording the group as having been on a different open event during that span. See "Retro-place flow" below.

**Overlap — three options.**

The first is **trim the conflicting window's start** (default) — push the next window's `date_joined` forward to match the edited window's new `date_left`.

The second is **merge the windows** — if same group + same destination event, collapse into one continuous window.

The third is **reject the edit** — return to the edit dialog with an inline error so the farmer picks new dates that don't overlap.

**Retro-place flow (gap option 3) — atomic two-write, no reopen ceremony.**

Used when the gap is "they were on some other event that was open at the time."

The flow has four user-visible steps. **Destination event picker** — full-screen sheet with one card per candidate event. Each card shows event dates, location(s), groups currently on the event, and head count. Filter: events that **fully contain** the gap (`event.date_in ≤ gap_start` AND `event.date_out ≥ gap_end`). Events that only partially overlap the gap are excluded — partial fits would require a recursive multi-step decision tree that isn't worth the complexity until field testing shows it's needed.

**Paddock picker (within the picked event)** — if the destination has more than one paddock window that overlaps the gap, the farmer picks which one the group was on. Same full-containment check at the paddock level. If exactly one paddock on the destination covers the gap, this step is skipped.

**Conflict check** runs automatically after the picker. If the group already has any `event_group_window` on the destination event whose date range overlaps `[gap_start, gap_end]`, the flow blocks with an error: *"Group X already has a window on Event #N from {dateA} to {dateB}. This contradicts the gap you're trying to fill. Cancel this retro-place and review the existing window."* The premise of retro-place is that the group was unplaced during the gap; a pre-existing overlap violates that premise outright. Better to stop and let the farmer investigate than attempt reconciliation.

**Confirm dialog** previews the writes: *"Place Group X on Event #N, Paddock P, from {gap_start} to {gap_end}. Event #N stays closed with its original end date ({event.date_out}). Group X's join date on the current event changes from {prior} to {new}."* Buttons: Cancel · Confirm.

**On Confirm — atomic two-write transaction:** (a) commit the source event's edited `date_joined` (the change that triggered the gap); (b) insert a new historical `event_group_window` on the destination with `date_joined = gap_start`, `date_left = gap_end`, `head_count` and `avg_weight_kg` copied from the source's edited window. Both writes happen in a single store transaction. If either fails, neither commits. Sync queues both writes together.

**On Cancel** at any step before Confirm, nothing has been written. The source event's edited `date_joined` is still pending in the edit dialog's staged state — the farmer is returned there and can either revert the edit or pick a different gap resolution.

This is safer than the prior reopen-close design — the destination event is never in a half-open on-disk state. There is no undo toast; the retro-place is intentional and visible (the destination event's §7 group list now shows the new historical window). To reverse, the farmer opens the destination event's Edit dialog, finds the retro-placed window in §7, and uses Delete (with confirmation).

The retro-place flow does not collide with **Event Reopen** (described below under event-level dates). Reopen is for "the event wasn't really closed" — it clears `date_out` and re-opens matching child windows. Retro-place is for "the group was on the event during a time we didn't know about" — it leaves `date_out` untouched and inserts a closed historical window. Distinct intents, no shared code.

#### §7 Groups — Group Window Edit Dialog

A new **Edit** button per row on the Groups card (§17.15 §7), between Move and Remove. Opens the Edit Group Window dialog (sheet overlay, reuses `ensureSheetDOM()`).

Edit and Remove are kept distinct because the user's intent matches the tool. Edit is the verb for changing history (can create gaps/overlaps → gap resolver). Remove is the verb for "end this now, they're leaving" (forward-looking only, two-option picker stays as spec'd in §17.15 §7). Erasure of a window — rare, "we recorded this but it never happened" — lives inside the Edit dialog as a Delete window action, not on Remove.

**Dialog fields** (responsive, same layout desktop + mobile):

| Field | Type | Notes |
|---|---|---|
| Group name | read-only chip | Group rename lives in Animals/Groups area |
| `date_joined` | date input | Required. Gap/overlap detection fires on blur. |
| `time_joined` | time input | Optional. Stored as text per schema. |
| `date_left` | date input | Shown only if window is closed; editable. Gap/overlap detection fires on blur. |
| `time_left` | time input | Optional. |
| `head_count` | number, integer ≥ 1 | Point-in-time snapshot. Editing changes the historical record for this window only; does not propagate to prior/next windows. |
| `avg_weight_kg` | number ≥ 0 | Displayed in user units via `src/utils/units.js`; stored metric. |

**Save behavior.** Auto-save on blur (same pattern as Notes in §17.15 §11). Brief "Saved" pulse on successful write. For date fields, auto-save triggers gap/overlap detection — if either is detected, the save is held pending until the resolution dialog resolves.

**Delete window action** (bottom of dialog, destructive confirmation). Only available when the window can be safely deleted without orphaning history — the group's prior window can absorb the range, or there is no prior window on this event. Confirmation: *"Delete this window? Group X will no longer appear as having been on Event Y from `{date_joined}` to `{date_left}`. This cannot be undone."* Deleting an active (open) window falls back to the existing Remove flow (Unplace / Move to existing event) since forward placement is still needed.

**Edge cases.** `date_joined` edited before the event's `date_in` rejects with inline error — the group can't join before the event exists. `date_left` edited after the event's `date_out` (when closed) rejects with inline error. `head_count` edited to 0 is treated as Delete window (with confirmation). If the window is the **last open window on the event**, editing `date_left` to a non-null value effectively closes the event — surface this explicitly: *"Closing Group X's window leaves Event Y with no active groups. Close the event as well?"* with Yes (run close flow) / No (leave event open, Group X unplaced).

#### §12 Sub-moves — Paddock Window Edit Dialog

Editing `event_paddock_windows`. Much simpler than Groups because paddock windows don't chain across events and multi-paddock-open-at-once is legal (strip grazing, multi-paddock access). **Gaps between paddock windows aren't an invariant** — they just mean the animals were on whatever other paddock(s) were open during that interval.

**Two surfaces, one dialog.** From the §4 Paddocks card on the Event Detail, every paddock window card (anchor and sub-paddocks) gets an Edit button (`btn btn-ghost btn-xs`) alongside the existing Close. From §12 Sub-move History, each row's existing Edit button opens the same dialog. Both routes call `openPaddockWindowEditDialog(paddockWindow, event, operationId, farmId)`.

**Dialog fields:**

| Field | Type | Notes |
|---|---|---|
| Paddock name | read-only chip | To change the paddock, delete this window and re-open via sub-move. |
| `date_joined` | date input | Required. Range-guarded. |
| `time_joined` | time input | Optional. |
| `date_left` | date input | Shown only if window is closed. Range-guarded. |
| `time_left` | time input | Optional. |
| `area_pct` | number 1–100 | Percent of paddock area used (100 = full paddock; < 100 = strip graze). |
| `is_strip_graze` | toggle | Editing here flips between full-paddock and strip-graze mode. |
| `strip_group_id` | picker | Only shown when `is_strip_graze` is true. |

**Save behavior.** Auto-save on blur, "Saved" pulse on success. Same pattern as §7 Groups.

**Range guards (reject on save, inline error):**

- `date_joined` < `event.date_in` rejects: *"A paddock can't be open before the event started. Edit the event start date first, or pick a later join date."*
- `date_left` > `event.date_out` (when event is closed) rejects: *"A paddock can't stay open after the event closed. Edit the event end date first, or pick an earlier leave date."*
- `date_left` < `date_joined` rejects: *"Leave date must be after join date."*
- Same-paddock, same-event, overlapping window already exists rejects: *"This paddock already has a window during that range. Adjust the other window first."*

**Delete window action** (destructive confirmation): *"Delete this paddock window? Animals will no longer be recorded as having been on `{paddock name}` from `{date_joined}` to `{date_left}`. This cannot be undone."* Cannot delete the last open paddock window on an active event (would leave the event with no location). Cannot delete the anchor (the window whose `date_joined` matches `event.date_in`) if it's the only window ever opened — that's effectively deleting the event, which belongs in the Actions footer's Delete.

**Strip-graze flip.** Flipping `is_strip_graze` from true to false clears `strip_group_id` and sets `area_pct = 100`, with a confirm. Flipping false to true requires picking a `strip_group_id`; if no strip groups exist on this event, offer to create one inline.

**Reopen for closed paddock windows.** A closed paddock window's Edit dialog exposes a Reopen action alongside Delete. Reopen clears `date_left` and `time_left` (sets to NULL), restoring the window to active. Confirmation: *"Reopen `{paddock name}` on this event? Animals will be recorded as on this paddock from `{date_joined}` with no end date."* Reopen does not touch sibling windows — the farmer is responsible for closing/adjusting other windows if needed (consistent with the no-cascade principle). This resolves OI-0064: the v1 "Manage" button drops, and reopen folds into the Edit dialog.

There is no retro-place equivalent for paddock windows. Paddock windows belong to their event by definition. To record animals on a paddock in a different event, the farmer adds a paddock window to that other event directly.

#### Event-level dates — `date_in` / `date_out`

The event's overall start and end dates act as bookends. Every paddock record and every group record inside the event must fit within them. Edits that push a bookend across an existing record, or leave a stretch of event-time with no records occupying it, need explicit resolution.

**`date_in` is directly editable** in the Edit Event dialog. Two directions:

**Narrowing** (push start later, e.g. April 5 → April 10). If any paddock or group record has `date_joined < new date_in`, reject with inline error pointing to the offending record. Example: *"The anchor paddock (North Pasture) joined on April 5. It can't remain on the event if the event starts April 10. Edit North Pasture's join date first, or pick an earlier event start date."* The farmer must fix the child record before the event edit saves. No silent data destruction.

**Widening** (push start earlier, e.g. April 5 → April 1). Event's time range widens. No record violates. But any record whose `date_joined` equals the old `date_in` now sits later than the new event start, leaving an empty stretch at the beginning. Confirm dialog names the specific records: *"Extending event start from April 5 to April 1. The following currently join April 5: anchor paddock (North Pasture), group window (Group 1). Extend them to April 1 too?"* with Yes (extend all) / No (leave empty stretch at start).

**`date_out` is NOT directly editable.** Honors the schema rule that `date_out` is set by the close/move sequence, not editable directly. All end-date changes route through **Event Reopen** below.

**Event Reopen (closed events only).** A new user-facing action in the Edit Event dialog footer alongside Delete. Button: `Reopen event` (`btn btn-olive`). Confirmation: *"Reopen `{event name}`? This clears the close date and re-opens the paddock and group records that closed with the event."*

Execution is three coupled writes (atomic from the user's perspective): clear `events.date_out` (and `time_out`); for each paddock record whose `date_left` equals the old `date_out`, clear its `date_left` and `time_left`; same for each group record.

**Invariant check before executing.** If any group record being reopened would create a second open window for the same group elsewhere (that group is currently on a subsequent event), surface a conflict dialog before any writes:

*"Reopening this event would put `{group name}` back on it, but `{group name}` is currently on `{subsequent event name}` (started `{date}`). Pick one:"*

- **(A) Reopen event but leave `{group name}` on subsequent event** — event reopens, paddock records reopen, but this group's window stays closed. Event becomes open-but-without-this-group until the farmer adds them back manually.
- **(B) Pull `{group name}` back to this event** — closes `{group name}`'s window on the subsequent event at today, reopens their window on this event. If that leaves the subsequent event with no groups, prompt to also close it.
- **(C) Cancel** — no writes, dialog closes.

If two or more groups trigger the invariant check, the dialog lists all of them and the farmer picks per group.

After reopen succeeds, the farmer is taken back to the Edit Event dialog (now showing the event as active) and can edit `date_in` or child records freely. When ready, they re-close via the Actions footer's `Close & move` or by closing all open windows.

**Re-close overlap warning.** When the farmer re-closes the reopened event at a date later than a subsequent event's `date_in`, the close flow's final confirm surfaces: *"`{subsequent event name}` opened `{date}`, during the period this event is now open. Continue? This is allowed but creates overlapping events in the log."* Continue proceeds; Cancel returns to date input. No cascade to the subsequent event — the farmer handles any corrections there separately. At the records level, group and paddock windows don't overlap (they were moved to the subsequent event and stay there). The overlap is purely at the event-row level — a data peculiarity, not an invariant violation. Worth surfacing as a warning, not worth blocking.

| Edit | Direction | Behavior |
|---|---|---|
| `date_in` earlier (widen) | Extends event start backward | Confirm dialog: extend matching child records too, or leave empty stretch |
| `date_in` later (narrow) | Pushes event start forward | Reject if any child record's `date_joined` < new start; farmer fixes children first |
| `date_out` (any direction) | Not directly editable | Use Event Reopen → edit → re-close via close flow |
| Event Reopen | Re-opens closed event | Clears `date_out` + re-opens matching child windows; invariant-checks for group conflicts |
| Re-close after reopen | Event closed at new date | Warning if new `date_out` is later than a subsequent event's `date_in`; no block |

Event-row-level overlap between two events (both "open" for some period) is allowed — record-level invariants still hold. Empty stretches inside an event after widening without extending children are allowed — surfaces as "event has no occupants for period X" in any future data-quality view. Both edge cases are accepted as "find in testing."

#### §8 Feed Entries

Editing existing feed entry records, plus the new capability to **move feed out** of an active event (to inventory or to another open event — see §8a below).

**Edit dialog validation guards (reject on save, inline error):**

- `entry.date` < `event.date_in` rejects: *"Feed entry date must be on or after the event start date."*
- `entry.date` > `event.date_out` (when event is closed) rejects: *"Feed entry date must be on or before the event end date."*
- `entry.date` in the future rejects: *"Feed entry date can't be in the future."*
- `amount ≤ 0` rejects: *"Quantity must be greater than zero. To remove feed from this event, use the Move feed out action."*
- `batch_id` changed to a batch with insufficient remaining inventory rejects: *"Selected batch has only X remaining; entry is Y."*

No gap/overlap concept — feed entries are point-in-time deliveries, not lifecycle windows. All DMI/cost/NPK impact cascades through compute-on-read automatically.

**Delete entry.** Confirmation: *"Delete this feed entry? This removes the record of delivering `{amount unit}` of `{feed type}` to `{paddock}` on `{date}`. Cannot be undone."*

**Delete vs Move Out — distinct verbs.** Delete = "this entry should never have existed" (correcting an entry mistake). Move feed out = "this feed was delivered, then pulled back out" (correcting real-world movement after the fact). Keeping them distinct preserves history — Move Out leaves an audit trail of delivery + removal; Delete erases the delivery.

Every delivery row in the §8 list also gets a per-row **Move out** action next to Edit and Delete, opening the §8a Move Feed Out sheet pre-selected to that row's batch × location.

#### §8a Move Feed Out (new capability)

A new capability available on active events (`event.dateOut == null`). The farmer pulls feed back out to inventory or ships it to another open event.

**Two entry points, one sheet.** A `Move feed out` button in the §8 Feed Entries card footer (sits next to the existing `Deliver feed` CTA, visible only on active events) opens the sheet with no row pre-selected. The per-row `Move out` action on each delivery row opens the same sheet with that row's batch × location pre-selected on Step 1. Both call `openMoveFeedOutSheet(event, operationId, farmId, { preselectBatchId, preselectLocationId })`.

**Terminology.** Step 1 aggregates current feed state by **batch × location** (e.g., "Batch #7 Hay on North Pasture"). A **feed line** = one batch × location aggregation row — distinct from "animal group" to avoid collision.

**Four steps in a single sheet.**

**Step 1 — Current feed state.** List one feed line per batch × location for this event. Each line displays `{batchName} → {paddockName}: {currentRemaining} {unit}` where `currentRemaining` = (sum of deliveries on that line) minus (sum of removals on that line) minus (consumption implied by the most recent feed check on that line). If no feed check exists since the last delivery or removal, show `{netDelivered} {unit} (no check)` and fall back to net-delivered as the remaining.

**Step 2 — Strike the line (forced feed check).** For each selected feed line, show an inline `current remaining` input pre-filled with the Step 1 value. The farmer confirms or corrects. **This is staged in sheet state only — no database write happens yet.** The confirmed values travel with the sheet to Step 4; only Step 4 Confirm actually writes them. Copy: *"Confirm what's currently there before moving it. This becomes a feed check on today's date when you confirm the move."* If the farmer hits Cancel at any point before Step 4 Confirm, all staged values are discarded — the sheet closes, no rows are written, the source event is exactly as it was before.

**Step 3 — How much and where.** The farmer specifies `amount to move` per selected feed line (number input, max = Step 2 confirmed remaining, min = 0.1). Unselected lines are ignored. Then picks a **destination** from a single picker with two modes: **back to inventory** (the batch's remaining quantity increases by the moved amount) or **existing open event** (picker lists active events with `!e.dateOut && e.id !== sourceEvent.id`). If the destination event has multiple paddocks, the farmer also picks the destination paddock.

**Step 4 — Confirm.** Preview summary: *"Move 40 lbs Hay from Event {source} → Event {destination} (North Pasture). A feed check will also be recorded on today's date: {line} remaining {X} {unit}."* Cancel · Confirm.

**Writes on Confirm — atomic single transaction.** (a) One `event_feed_checks` row per selected feed line (from the Step 2 staged values), dated today, with the user-confirmed remaining amount. (b) One `event_feed_entries` row on the source event per selected feed line: `entry_type = 'removal'`, `destination_type = 'batch'` or `'event'`, `destination_event_id = {dest.id}` if event destination, `amount` positive (the `entry_type` flag signals direction). (c) If destination is inventory: increment the destination batch's remaining quantity. (d) If destination is event: create a matching inbound `event_feed_entries` row on the destination event with `entry_type = 'delivery'`, `source_event_id = {source.id}`, `amount`, `batch_id`, today's date, and the picked destination paddock as `location_id`. If any write fails, the whole transaction aborts.

**Why a feed check is staged in Step 2.** Without a feed check at the moment of move-out, DMI-5 (feed check interpolation) has no fixed point between "last known remaining" and "current remaining after removal." Step 2's value strikes the line — everything before it counts as consumption at the source; the remaining amount is what gets moved. Staging-not-writing in Step 2 means Cancel leaves the source event pristine.

**Validation guards in the sheet:** move amount > Step 2 confirmed remaining errors inline on Step 3. Destination event + destination paddock not selected disables Confirm. Destination event with the same id as source is filtered out by the picker.

**DMI / NPK / cost logic.** All compute-on-read. For any feed line on an active event, available feed at time `T` is `Σ deliveries(date ≤ T) − Σ removals(date ≤ T)`. Consumption between two checks at `T1` and `T2` is `(remaining(T1) + deliveries(T1 < date ≤ T2) − removals(T1 < date ≤ T2)) − remaining(T2)`. The Step 2 feed check guarantees a recorded remaining at the move-out instant; the next farmer-entered check after move-out compares against `(remaining(moveOut) − movedAmount + any deliveries since)`, giving correct post-move-out consumption. The calc registry change is one line per affected formula (DMI-1, DMI-5, NPK-1, NPK-2, cost-per-day): sum deliveries minus removals.

**Same-day ordering edge case.** If a farmer moves feed out at 9 AM (which writes a feed check at `date = today`) and then enters a genuine feed check also at `date = today` later in the day, the two checks share a date. The store treats the last-written check as authoritative for DMI purposes (latest wins). Documented for field testing — if confusion surfaces, revisit with a time-of-day stamp on feed checks.

**Edge cases.** Event with no feed entries → button disabled with tooltip "No feed to move." Event with feed entries all consumed → button active but Step 1 shows zeros; farmer sees "No remaining feed to move" and cancels. Closed events → button not available; farmer reopens the event first via the event-level Reopen action.

Schema: three columns on `event_feed_entries` — `entry_type` (text enum delivery/removal, default `delivery`), `destination_type` (batch/event, nullable), `destination_event_id` (uuid FK → events ON DELETE SET NULL, nullable). Check constraints enforce the implication structure. CP-55/CP-56 impact tracked under OI-0156. See V2_SCHEMA_DESIGN.md §5.4 for the column spec.

#### §9 Feed Checks

Editing and deleting existing feed check records (`event_feed_checks`), plus back-filling a forgotten check with a past date.

**Edit dialog fields:** `date`, `time` (optional, defaults to noon), `remaining_amount`, optional `notes`. `batch_id` and `location_id` are read-only on edit — changing the feed line a check belongs to isn't an edit, it's delete + re-add.

**Range guard on date.** Before-event-start, after-event-end (closed events), future, and negative remaining all reject with inline errors.

**Invariant check on save.** A feed line is a batch × location within an event. Across all checks on that feed line, consumption between consecutive checks must be ≥ 0:

```
consumed(Ti → Ti+1) = remaining(Ti)
                   + Σ deliveries(Ti < date ≤ Ti+1)
                   − Σ removals(Ti < date ≤ Ti+1)
                   − remaining(Ti+1)
                   ≥ 0
```

A later check reading higher than the prior with no delivery between is impossible — feed appearing from nowhere. When the farmer saves an edit (or back-fills a past-dated check), re-check this invariant across the check's neighbors. Four cases:

**Case A — edit is benign.** All adjacent-interval consumptions still ≥ 0. Save silently, let compute-on-read cascade. DMI-5 recomputes for the intervals on either side. No prompt, no warning.

**Case B — edit breaks a later interval.** A check after the edited one now implies negative consumption. Surface a **Re-snap dialog** before the edit commits: *"This edit makes a later feed check impossible. You're changing the check on `{T date}` from X to Y {unit}. But the check on `{T+k date}` recorded Z {unit} — which would mean feed appeared from nowhere between those dates. To proceed, we'll delete the later check(s) that no longer fit: • `{T+k date} — {Z unit}` • (any others in the same impossible run). After saving, enter a new feed check to re-measure what's actually there now."* Buttons: Cancel edit · Delete later checks and save. On the destructive option, the edit commits in a single transaction with the deletions, and the farmer sees a non-modal toast: *"Enter a new feed check to re-snap the line →"* with a shortcut to the check dialog pre-filled for that feed line.

**Case C — edit breaks an earlier interval.** Less common. Surface: *"This edit is inconsistent with an earlier feed check. … One of the two checks is wrong. Review them and edit the right one."* Only Cancel is offered — no auto-delete of earlier checks. The farmer decides which check to correct.

**Case D — back-fill a past check.** Net-new check dated in the past. Same invariant check against both neighbors. If it violates either side, use Case B or Case C resolution depending on direction.

**Delete a feed check.** Confirmation: *"Delete this feed check? `{batchName}` → `{paddockName}`, `{remaining}` `{unit}` on `{date}`."* No invariant check needed — deleting a check only widens the consumption interval on either side, which never creates an impossibility.

**Move Feed Out interaction.** The Step 2 "strike the line" check that Move Feed Out writes is an ordinary `event_feed_checks` row. It can be edited and deleted like any other check, with the same invariant rules. If a farmer deletes the Step 2 check after a move-out has happened, the removal row stays — DMI for the interval just widens. Acceptable but worth noting in field testing.

**Edge cases.** Check with no prior check on that feed line is benign (no previous interval to validate). Check with no later check is benign. Zero-delta edit (no value change) is a no-op. Two checks on the same date on the same feed line follow latest-wins.

#### §3 Pre-graze Observations

Editing per-paddock pre-graze observation values inline on the Event Detail's §3 card (per OI-0068 — inline fields, not a modal).

**Fields edited inline:** `grass_height_cm`, `forage_cover_pct`, `forage_condition`, `veg_height_cm`, `bale_ring_residue_count` (when the bale-ring helper applies), `pre_graze_rating`, optional notes.

**Behavior.** Auto-save on blur per field. No submit button. If validation rejects, the value reverts with inline error text on the field.

**Field-level validation guards.** Numeric fields < 0 reject. `forage_cover_pct` > 100 rejects. `pre_graze_rating` outside the slider's configured min/max rejects (slider clamps; the guard is belt-and-suspenders against direct keyboard entry). Blank required field shows no error until the farmer commits the event or leaves the screen.

**Cascade is silent, by design.** Pre-graze observation values feed pre-graze DM kg/ha, which feeds DMI targets and the move recommendation. When a farmer edits a value days or weeks after the fact, compute-on-read re-derives those values for the event. No warning on large deltas; no confirmation on edits that move DMI significantly. The farmer is correcting an observation — the downstream math should respond. Any surprise is better addressed by good change-log surfacing in Reports than by gating the edit. Flagged for field testing — if confusion surfaces, revisit with an optional "this edit changed X by Y%, continue?" confirmation.

No gap/overlap concept — pre-graze observations are per-paddock snapshots at event start, not lifecycle windows.

**Delete an observation row.** Confirmation modal. Safe — just widens "no observation on this paddock", which the calc layer handles (falls back to farm default or flags "no data" in Reports).

#### §6 Post-graze Observations

Editing per-paddock post-graze observation values inline on the Event Detail's §6 card. Card always renders (per SP-2 round 2), showing an empty-state hint when no post-graze data has been recorded yet.

**Fields edited inline:** `post_graze_height_cm`, `post_graze_cover_pct`, `post_graze_rating`, `recovery_window_days`, optional notes.

**Behavior.** Auto-save on blur per field. Same pattern as §3.

**Field-level validation guards.** Numeric fields < 0 reject. `post_graze_cover_pct` > 100 rejects. `recovery_window_days` outside 0–365 rejects. Live date preview next to `recovery_window_days` shows `{event.date_out + recovery_window_days}` so the farmer can sanity-check the target re-graze date as they type.

**Cascade is silent, by design.** Post-graze observations feed post-graze DM kg/ha (utilization %) and the recovery window end date (rotation calendar marks the paddock rest-eligible after that date). Edits cascade silently through compute-on-read.

**Recovery window specifically.** When `recovery_window_days` is edited, the paddock's next-eligible-graze date shifts. If a future event is already planned during what becomes the recovery window, the conflict is flagged **at the planning step of that future event**, not on the §6 edit. §6 stays silent — keeps the edit dialog from doing planning-level checks that belong in the planner.

No gap/overlap concept — post-graze observations are per-paddock snapshots at event close.

#### Sub-move Close — forced feed check

When `event.hasStoredFeed` is true (any `event_feed_entries` row with `entry_type = 'delivery'` exists on the event), the Sub-move Close sheet renders a **required feed-check card inline** and blocks Save until the farmer records remaining stored feed for each batch. This strikes a clean `actual` / `estimated` boundary at the close date — the prior stored interval retroactively flips from `estimated` to `actual` in the DMI chart. No pasture observation is forced (pre-graze observations are too subjective to be useful as a boundary marker). No new stored-feed close prompt — existing Close Event behavior is unchanged.

Reasoning (Tim, 2026-04-20): pasture observations are inherently subjective — pre-graze height is already a best guess. Forcing a pasture observation at sub-move close doesn't buy accuracy. Feed checks on stored feed are precise enough to give the cascade a firm anchor.

This rule also applies in §12 Sub-moves (V2_UX_FLOWS §12) and is the reason the DMI chart's `needs_check` status (§17.15 DMI chart) appears for stored-feed events that lack a strike point.

#### Linked OPEN_ITEMS

- **OI-0081** — SP-10 umbrella (ratified 2026-04-17, ready for Claude Code). Covers all seven edit-behavior subsections.
- **OI-0082** — SP-10 §8a Move Feed Out (new capability). Schema impact tracked separately.
- **OI-0064** — Manage button dropped from sub-move history; reopen folds into Edit dialog. Folded into §12 above.
- **OI-0068** — Pre-graze observations: inline fields, not modal. Closed; §3 confirms the pattern.
- **OI-0119** — DMI-8 cascade rewrite. The forced-feed-check rule on sub-move close ties into the chart's `needs_check` and `actual`/`estimated` status semantics.
- **OI-0156** — CP-55/CP-56 spec catch-up for §8a's three new persisted columns.

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

## 19. Rotation Calendar (Events)

The rotation calendar is the primary visualization of grazing history and forward-looking forecasts. It lives on the Rotation Calendar screen — nav label "Rotation Calendar," route `#/events`, testids `nav-events` / `bnav-events`. "Events screen" and "Rotation Calendar screen" refer to the same screen; route and testids are unchanged, only the user-visible nav label was renamed from "Events" to "Rotation Calendar." Reports does not mount a second copy; any season-scale view the user wants is reachable by changing Zoom + Jump on the Rotation Calendar screen. See V2_DESIGN_SYSTEM.md §4.3 for visual anatomy.

### 19.1 View Modes

Two mutually-exclusive modes drive the appearance of future (right-of-Today) blocks:

- **Estimated Status View** (default when no groups are selected in the Dry Matter Forecaster). Each paddock's forecast block spans min-recovery-date → max-recovery-date per REC-1. Rendered as an ambient horizontal DM gradient (`--green-wash` → `--green-base`). No demand-side reasoning — this is the "is it ready yet?" view.
- **DM Forecast View** (active when one or more groups are selected and a period is chosen). Each paddock's forecast block spans min-recovery-date → (min + period). Rendered as a capacity split: green segment width = fraction of the selected period the paddock can supply for the selected groups (via CAP-1); tan segment width = the shortfall (lbs of hay). Full green + `+ Xd Yh` surplus chip when DM ≥ demand.

The mode indicator pill (top-right of the screen header) shows which mode is active. Swapping modes does not refresh past blocks; only future blocks re-render.

### 19.2 Past Event Blocks

Rendered left of the Today line, one block per event overlapping the visible range. Block color = green (pasture), lighter green (sub-move destination), tan (hay / stored feed overlap). Labels follow the multi-group rule: single-group events show the group name; multi-group events collapse to `Multiple Groups (N)` with a dotted-underline hover tooltip listing all groups. Strip-grazed active events render proportional vertical bands (one per strip, width proportional to strip area) behind the label; strip-grazed closed events collapse to a single block with a `Strip k/N` note in Line 2.

Linked paddock groups render a dashed outer outline across all member rows plus a dotted connector on the left edge; the primary row carries full block content while linked rows show a reduced `↳ linked to <primary>` block.

Active (currently-open) events render with an inset white ring + dark-green outer ring plus a `NOW` chip in Line 1.

Click a past block → open the event edit sheet (§11.2).

### 19.3 Future Forecast Blocks

Rendered right of the Today line. Presence and appearance driven by view mode (§19.1). Min/max recovery dates (from REC-1) flank the block with small tick marks and dates. Never-grazed paddocks render 100% tan with an `Est. <lbs> hay needed — survey to confirm` label and route the user to the survey flow on click (§7). Active events render no forecast — instead a dashed `Grazing in progress — forecast available after close` label sits in their right-of-Today space.

Click a future block → open the paddock detail sheet with the forecast breakdown pre-filled.

### 19.4 Toolbar + Controls

**Timeline Selection lightbox** — two stacked rows: Zoom (Day · Week · Month · Last 90 days) and Jump (Today · Last 30d · This year · Pick date…). Zoom controls column density; Jump scrolls the timeline to a preset range. **Default on first load: Zoom = Week, Jump = Today.** (Revisit after real user feedback — the Week/Today bet trades daily detail for one week of context in each direction; if users report wanting more context by default, bump to Month.)

**Dry Matter Forecaster lightbox** — two stacked rows: Groups (multi-select chip picker with ＋ Add / Clear) and Period (1 day · 3 days · Custom…). Picking one or more groups switches the view into DM Forecast mode; clearing all groups returns to Estimated Status mode.

**Show Confinement Locations pill** — far-right on/off toggle. Default OFF — confinement locations are excluded from the paddock list. Toggling ON expands the list and the sidebar rows to match.

### 19.5 Sidebar

Right-hand column mirrors the left paddock column structure: 40px header, one 72px row per visible paddock aligned 1:1 with the timeline, 28px totals footer anchored at the bottom. Each paddock row shows AUDS, pasture %, NPK, and event-count note scoped to the visible range. Totals footer shows range totals + average feed cost. Recomputes on any pan, zoom, group change, or period change.

### 19.6 Empty States

Never-grazed paddocks show `No activity · survey needed` in the sidebar row and render the never-grazed tan forecast block (§19.3). The CTA routes to the Fields → Survey flow rather than to Move wizard, because forecasts require a post-graze observation to compute.

When no paddocks at all exist for the farm, the calendar collapses to a full-bleed empty state pointing to Fields → `+ Add location`.

### 19.7 Mobile Adaptation

**The rotation calendar is not rendered on mobile (below 900px).** Mobile Events falls back to the v1 list pattern: active-rotation banner at top (GRZ-11 — paddock chips with status colors, date in, feeding count, groups), followed by the events log list (§19.8 / GRZ-10). Rationale: the calendar's value comes from horizontal scale and side-by-side paddock comparison, neither of which survive a phone viewport — a scannable list beats a squeezed grid.

### 19.8 List View

Reuses the v1 events log (GRZ-10) — this is both the desktop Calendar/List toggle target and the mobile default.

Parent row displays: location (multi-paddock chip summary), date range (or "ongoing"), days, groups summary, active/closed badge, feed cost, pasture %, recovery window, edit button. Sub-move thread renders as an indented sub-list under the parent (active sub-moves get teal badge; returned get grey). Summary metrics per event: AU, Pasture AUDS, ADA, Pasture DMI, Stored Feed DMI, NPK (closed only), DMI Variance (100%-stored-feed closed events only). Filter dropdown: All / Open / Closed. Tap an event to open the event edit sheet. The list is unaffected by Dry Matter Forecaster state.

### 19.9 Interactions & Deep Linking

**Click targets.** Past block → event edit sheet (§11.2). Future block (Estimated Status View) → paddock detail sheet. Future block (DM Forecast View) → paddock detail sheet with forecast breakdown pre-filled. Never-grazed tan block → survey flow (§7). Sidebar row → filters the timeline to that paddock only (tap again to clear the filter).

**Pan gestures.**
- Desktop: horizontal scroll pans the timeline; vertical scroll pans the paddock list.
- Touch: one-finger horizontal swipe pans the timeline; vertical swipe pans the paddock list.
- Sidebar and Today line stay anchored (sticky) during pan.

**Zoom gestures.**
- Desktop: scroll-wheel while holding `ctrl` (Windows/Linux) or `cmd` (macOS) zooms.
- Touch: pinch-to-zoom.
- Clicking a Zoom preset (Day · Week · Month · Last 90 days) jumps directly to that zoom.

**Keyboard shortcuts (desktop calendar focused).**
- `←` / `→` — pan by one day at current zoom
- `Shift + ←` / `Shift + →` — pan by one week
- `T` — jump to Today
- `Esc` — close any open lightbox or popover (farm picker, user menu, period custom input, etc.)

**Deep-linking state.** Calendar state is fully URL-addressable so a user can share a specific view:

```
#/events?zoom={day|week|month|last90}
        &anchor={today|last30|thisYear|YYYY-MM-DD}
        &groups={id1},{id2},...
        &period={days | blank}
        &showConfinement={0|1}
        &view={calendar|list}
```

Any omitted parameter falls back to its default. Changes to state update the URL without a full route change (history.replaceState).

**First-load defaults.** `zoom=week`, `anchor=today`, `groups=[]`, `period=null`, `showConfinement=false`, `view=calendar`. Forecaster starting empty → Estimated Status View is the default mode.

**State persistence policy.** Calendar state is NOT persisted to `user_preferences` in v2.0. It lives in session memory and the URL only. Rationale: the URL is enough for deep-linking and sharing; sticky defaults are a small follow-up (one column + one getter/setter) that should be driven by user feedback, not pre-emptively. When user feedback asks for sticky defaults, add a `user_preferences.events_calendar_state jsonb` column and persist on change.

**Paddock sort order.** Paddocks render in the order locations appear in `store.locations` (stable sort by creation order / `locations.id`). Custom ordering (drag-to-reorder or a priority field) is out of scope for v2.0 — revisit once users report needing it.

**Accessibility.**
- All interactive elements (past/future blocks, lightbox pills, legend items, sidebar rows, view toggle, mode indicator, confinement pill) must have visible focus outlines meeting WCAG 2.1 AA contrast (3px outline, `--green-dark`, 3:1 min against adjacent content).
- Block labels that rely on tooltips (multi-group `Multiple Groups (N)` dotted underline) must also expose the group list via `aria-label` for screen readers.
- Strip bands' color-alternation is decorative; label text on top must have `text-shadow` strong enough to pass 4.5:1 contrast against the darkest band color.

---

## 20. Settings Screen

**Route:** `#/settings`. Entered from the user-menu popover (§17.2, "Settings" row) or — on mobile — the bottom-nav Settings tab.

**Scope:** Per-user, per-operation, per-farm configuration plus data actions. The settings screen is the single location where a user tunes how the app behaves. It is not a dashboard; it does not show live metrics.

### 20.1 Sections

In order from top to bottom:

1. **Account** — name, email (read-only), Log Out button. Matches the user-menu popover's Log Out affordance but surfaced for discoverability.
2. **Operation** — operation name (editable, admin-only), currency (read-only display of the currency code; editable by admin), **unit system** toggle (see §20.2), operation members row (admin/owner: tap opens Member Management sheet, §20.7; team_member: read-only chip showing member count).
3. **Active Farm** — farm picker (same component as header, §3.6); opens the farm picker sheet/dropdown. Below the picker, per-farm settings are rendered for the currently-active farm.
4. **Farm Settings (active farm)** — all 12 `farm_settings` fields with inline edit (NPK prices, manure_kg_per_head_day, residual_height_cm defaults, utilization_pct default, recovery day defaults, forage_quality_scale_min/max, feed_day_goal, default view mode). Field grouping mirrors V2_SCHEMA_DESIGN.md §1.3.
5. **Preferences** — per-user UI prefs from `user_preferences`: default home view (groups/locations), field mode auto-enter, quick-action bar configuration.
6. **Sync & Data** — sync status indicator (same component as header, §3.6 right cluster), manual "Push all to Supabase" recovery button, **Export backup (CP-55)**, **Import backup (CP-56)**, **Migrate from v1 (CP-57)**.
7. **About** — app version (build stamp), release notes link, feedback link, open-source license list.

The Operation, Farm Settings, and some Preferences sections are gated by role (admin vs member). Member-role users see read-only chips where admin sees inline editors.

### 20.2 Unit System Toggle

**Location:** Section 2 (Operation), row labelled "Unit system," two-segment control: `[Metric] [Imperial]`. Default is `Imperial` (matches `operations.unit_system` column default, A44).

**Scope:** The toggle writes to `operations.unit_system` and therefore takes effect across every user of the operation on every farm. The scope is intentional — see A44 rationale: a farmer does not think in acres at one farm and hectares at another.

**Action (on toggle):**

1. Optimistic update: `store.setUnitSystem('metric' | 'imperial')` — writes new value to local state, queues Supabase write, notifies subscribers.
2. Re-render all unit-sensitive surfaces on-screen. No page reload. Storage is always metric (V2_INFRASTRUCTURE.md §1.1); the toggle only changes how stored metric values are formatted for display and how user-entered values are converted on save.
3. Sync failure path: if Supabase write fails after three retries, revert local state and show a toast ("Couldn't save unit preference. Still in {previous}."). Do not leave the UI in a state where the toggle shows one value but stored `operations.unit_system` is the other.

**Fields that re-render on toggle:**

The following are unit-sensitive and must re-render their displayed value (and their input hints/labels when in an edit state):

- Areas: paddock area, farm area, field area (ha ↔ ac)
- Weights: animal weight, group average weight, head weight, target weight (kg ↔ lb)
- Distances / heights: residual height, pasture height, pre-graze height (cm ↔ in)
- Feed masses: batch weight, feed delivery quantity, feed check remaining (kg ↔ lb)
- DMI per head per day (kg DM/head/day ↔ lb DM/head/day)
- Manure rate: kg/head/day ↔ lb/head/day
- Harvest yield: kg ↔ lb (total) and kg/ha ↔ lb/ac (per area)
- NPK prices: $/kg ↔ $/lb (currency unaffected; just the denominator)
- Stocking density: AUDs/ha ↔ AUDs/ac
- Spreader capacity: kg per load ↔ lb per load

When the active screen contains any of these fields, the toggle must re-format them immediately. Screens not currently mounted inherit the new unit system on next mount.

**Input field conversion:**

Form inputs honor the active unit system for both label and numeric parsing:

- Imperial active → input accepts user-entered imperial value (e.g. "40 ac"); form converts to metric on save (16.19 ha → stored as `area_ha`).
- Metric active → input accepts user-entered metric value; saves as-is.
- If the user toggles unit system while a form is open with an in-progress numeric edit, the editor re-renders converting the current value (not the stored value) so the user's in-progress magnitude is preserved. Unsaved-form state survives the toggle.

**localStorage migration on boot (for users who upgraded from a pre-A44 v2 build):**

1. On app boot, after loading `operations` from Supabase, check if `operations.unit_system` is null/empty.
2. If null, check localStorage for a legacy `gtho.unitSystem` key.
3. If legacy key exists, write its value to `operations.unit_system` via `store.setUnitSystem()`, then delete the legacy key. Log the one-time migration via `logger.info('unit_system', 'migrated from localStorage', { value })`.
4. If neither is present, default to `'imperial'`.
5. This migration runs at most once per operation per device; `operations.unit_system` being NOT NULL prevents repeat.

**Field Mode behavior:**

Field Mode (§16) inherits the active unit system. Toggling unit system while Field Mode is active behaves identically — the farmer in a paddock changing units does not need to exit Field Mode to do so.

### 20.3 Sync & Data Section

**Export backup** (CP-55): button; on tap, opens a confirm sheet — "Export backup of {operation name}? This downloads a file containing all data for this operation." Confirm triggers download. File name: see V2_MIGRATION_PLAN.md §5.2. No preview — the file is the full operation. Downloads respect the browser's default download location. Disabled if offline (the export needs a fresh read from Supabase to ensure nothing in the sync queue is missing). An offline toast explains this.

**Import backup** (CP-56): button; on tap, opens a native file picker filtered to `.json`. Selected file is parsed and validated before the user commits: shows a preview sheet with backup metadata (export date, schema version, counts: farms, events, animals, batches, todos) and a destructive warning — "Restoring will REPLACE all current operation data." Two buttons: `[Cancel]` and `[Replace All Data]`. The replace button is red (`--danger`) and requires a second tap confirmation for destructive safety.

**Migrate from v1** (CP-57): visible only when `operations` is empty (onboarding path) or when feature flag `v2.migration.enabled` is true. Launches the migration wizard. Not part of normal settings flow.

**Manual "Push all to Supabase"**: recovery tool. Button label "Resync to server." On tap, confirm sheet then runs `pushAllToSupabase()` (re-queues every record). Shows a progress toast. Used when the sync queue is suspected of drift.

### 20.4 Mobile vs Desktop

Mobile: each section collapses to an accordion row; tap to expand. Only one section expanded at a time. Sections 1 and 6 auto-expand on first visit for discoverability (Account for identity confirmation, Sync & Data for backup awareness).

Desktop: all sections rendered as a single scrollable column with section headers and `--bg2` card backgrounds. No accordion. Sticky section nav on left (≥1200px only) with anchor links.

### 20.5 Accessibility

- The unit-system toggle is a `role="radiogroup"` with two `role="radio"` segments, keyboard-navigable via arrow keys. Label "Unit system" is `aria-labelledby` on the group.
- Destructive buttons (Replace All Data, Resync to server confirm) require a two-step interaction — either dialog confirm or press-and-hold for 500ms — never a single unprompted tap.
- Section headers are `<h2>`; subsection field groups use `<fieldset>` + `<legend>`. Screen readers announce section context when focus enters a new section.

### 20.6 Out of Scope for This Screen

- Calc reference console: lives in Reports (see §4.6 of V2_DESIGN_SYSTEM.md; OI-0020 deferred a move to Settings).
- Feedback & support: the feedback button sits in the header (§17.2), not here.
- Billing / subscription: deferred until commercialization.

### 20.7 Member Management & Invite

**Full spec:** `github/issues/CP-66_member-management-invite.md`

**Entry point:** Settings → Section 2 (Operation) → "Members" row. Admin/owner taps to open Member Management sheet. Team members see a read-only count chip ("3 members").

**Member list:** Full-height sheet. Ordered: owner → admins → team_members → pending invites. Each row: display name (or email if pending), role badge, status badge ("you" / "⏳ pending"). Admin actions: change role, remove member, copy/regenerate/cancel invite link.

**Invite creation:** "Invite member" button at bottom of sheet. Inline form: display name, email, role (Admin / Team Member). Creates pending `operation_members` row with `invite_token`, auto-copies shareable link to clipboard. No email sent — admin shares the link via text, email, WhatsApp, etc.

**Invite acceptance:** Invitee opens `{app_url}/#invite={token}`. If not signed in, sees sign-in prompt with invite context. After auth, app calls `claim_invite_by_token` RPC → sets user_id, accepted_at, nulls token. Fallback: email-based claim on sign-in (v1 parity via `claim_pending_invite` RPC).

**Owner protection:** Owner row has no action buttons. Operation must always have exactly one owner.

### 20.8 Forage Types (Reference Library)

**Where it sits:** Settings screen, between the Farm Settings card and the Field Mode section. Mirrors v1's vertical ordering (Farms → Forage Types → Field Mode → Farm Settings) so a v1 farmer's muscle memory transfers; the card sits next to the farms it attaches to. Visible on both desktop and mobile Settings — there is no Field Mode entry for forage types (matches v1).

**Purpose:** the reference library that drives FOR-1 (standing DM), DMI-8 (cascade chart), harvest NPK math, and the per-location `forageTypeId` link. v2 originally shipped only the onboarding seed step (`src/features/onboarding/seed-data.js` writes nine default rows once) plus the Location detail forage-type picker. This subsection adds the missing surface to view, add, edit, and delete forage types after onboarding — without it, a farmer who skipped or customized the seed step has no way to reach the values driving their pasture math (Tim hit this 2026-04-20).

**Card anatomy:**

- Section header reading "Forage types" with a subtitle: *"Reference library for DM% and NPK removal values. Linked to feed types and harvest events."*
- Top-right `+ Add` button (`btn btn-outline btn-sm`) opening the Add/Edit sheet in blank mode
- A list of all non-archived forage types for the active operation
- Each row shows `<strong>{name}</strong>` followed by a meta line — `DM {dmPct}% · N {n} / P {p} / K {k} kg/t DM` — with `?` rendered for null values (`DM ?%`, `N ?`)
- **Seeded badge.** Rows with `is_seeded = true` display a small "seeded" badge next to the name. The flag is set by the onboarding seed step and is **not user-editable** — editing a seeded row keeps the badge so the farmer can still see "this came from defaults"; user-created rows save with `isSeeded = false`. The distinction matters when a future migration reseeds defaults, and gives the farmer a quick "did I customize this?" read.
- Per-row controls: an `Edit` pill (opens the sheet in edit mode, pre-filled) and a delete `×` icon

**Add / Edit sheet fields** (sheet title "Add Forage Type" or "Edit Forage Type"):

| Field | Type | Notes |
|---|---|---|
| Name | text | Required. `placeholder = "e.g. Orchard Grass"` |
| DM % (dry matter) | number, 0–100 | No conversion. Integer. |
| N (kg/t DM) | number ≥ 0 | Metric density. Kept as kg/t DM for both unit systems (matches v1). |
| P (kg/t DM) | same | same |
| K (kg/t DM) | same | same |
| DM per inch per acre / DM per cm per ha | unit-aware number | Imperial users see `lbs/in/ac`; metric users see `kg/cm/ha`. New `dmYieldDensity` unit family — see V2_INFRASTRUCTURE.md §1.4. |
| Min residual height (in / cm) | unit-aware number ≥ 0 | Standard `length` family — `convert(cm, 'length', 'toImperial')`. |
| Utilization % | number, 0–100 | Optional. Seeded defaults are 50–75 by species. |
| Notes | textarea | Optional. `placeholder = "Source, lab, year…"` |

The sheet uses the same unit-aware descriptor pattern as the Farm Settings card (OI-0111 / `FARM_FIELD_DESCRIPTORS`) — `toDisplayValue` / `toStoredValue` / `composeFieldLabel` / `stepForField` shared via `src/features/settings/unit-descriptor.js` so there's exactly one conversion path. **Round-trip contract:** entering `300` for DM per inch per acre stores the metric equivalent via the `DM_LBS_IN_AC_TO_KG_CM_HA` constant from `v1-migration.js`; re-opening the sheet shows `300` again. The same round-trip holds for `3 in` ↔ `7.62 cm` for Min residual height.

**Save and validate.** Save calls `store.add('forageTypes', record, validateForageType, ftToSb, 'forage_types')` for new rows or `store.update('forageTypes', id, changes, validateForageType, ftToSb, 'forage_types')` for edits — both with the full 5-/6-param signatures per CLAUDE.md quality check #7 (sync params required so localStorage and Supabase stay aligned). `name` is the only required field; everything else is nullable per the entity. Editing a seeded row keeps `is_seeded = true` — the badge stays.

**Delete.** Hard-guarded against in-use forage types: if any `locations` row references the forage type via `forage_type_id`, block deletion with a confirm dialog listing the affected paddocks and a "View locations" link that navigates to `#/locations`. No silent reassignment, no cascade. When no locations reference the row, confirm with *"Delete \"{name}\"? This cannot be undone."* and call `store.remove('forageTypes', id, 'forage_types')` (3-param signature).

**Empty state.** When `getAll('forageTypes').filter(f => !f.archived).length === 0` — possible after a v1 import with no forage types, or if onboarding seeding becomes optional in the future — the list body shows: *"No forage types yet. Tap + Add to create one, or seed defaults."* The "seed defaults" link runs the same nine-row insert as `onboarding/seed-data.js`, gated by a confirm dialog (*"Seed 9 default forage types? You can edit or delete them afterward."*) so a mid-farmer with one custom row doesn't accidentally inflate the list.

**Out of scope for v2 launch:** archive UI (`forage_types.archived` column already exists; toggle deferred to a follow-up — Tim's operation has fewer than 20 types so delete is enough for MVP), per-type custom unit labels (v1 free-text "unit label" field), and forage quality grading (separate concept on `paddock_observations.forage_quality`, owned by SP-9).

**Schema / CP-55 / CP-56 impact:** none. All `forage_types` columns already exist (migrations 001 + 003) and the entity already round-trips. The new `dmYieldDensity` unit family is local to display/save — the stored column (`dm_kg_per_cm_per_ha`) is unchanged.

**Linked OPEN_ITEMS:** OI-0125.

---

## 21. Feedback Screen (Desktop-Only)

**Route:** `#/feedback`. Reached from a `Feedback` nav item that lives only in the desktop sidebar — between Settings and the sync strip — and never in the mobile bottom nav. The same row carries an unread badge with the count of submissions where `status === 'open' OR status === 'resolved'` (red `--red`, 9px white text, same pattern as the Todos badge in §17.2). Submission writes still come from the SP-6 header sub-row, which is available on every viewport; this screen is the management surface, not the capture surface, and management is a desktop-grade task that doesn't belong in the field.

**Reads from:** the `submissions` entity (V2_INFRASTRUCTURE.md §4.2). All mutations route through the store (`store.update('submissions', …)` and `store.remove('submissions', …)`). No new entities, no schema change, no CP-55/CP-56 impact.

**Screen sections, top to bottom (matches v1's order so the muscle memory transfers):**

1. **Confirmation section (banner + cards).** When at least one submission has `status === 'resolved'`, render an amber banner across the top of the page: *"N item(s) resolved — please confirm the fix worked."* Below the banner, render one card per resolved item showing its category pill, area, dev-response excerpt, original note, and two actions: `✓ Confirm fix` (sets `status='closed'`, clears the resolved badge for that row) and `↺ Reopen` (sets `status='open'` and posts a follow-up note). Confirmation is the user's signature that the fix landed for them — it's how a resolved item leaves the active list. If there are no resolved items, this section is hidden entirely.

2. **Stats strip (badge row).** A horizontal row of count badges: open / planned / awaiting-confirmation / closed / support. Each badge tappable to filter the All Submissions list below to that status. The strip uses the §3.3 badge tokens from V2_DESIGN_SYSTEM.md (color-coded per status). The strip is a quick read of "where am I" before the user dives into the list.

3. **Dev session brief card.** Two buttons (`Generate brief` and `Copy brief`) above a monospace code block. The brief is plain text auto-assembled from open + roadblock + bug submissions: title line, date, list of items grouped by category, each item's area, note, and any context tag. `Generate` recomputes; `Copy` copies the rendered text to clipboard. The brief is a hand-off artifact for paste into a session brief or an issue tracker. No persistence of the brief — it's regenerated on demand each time.

4. **All submissions card.** Three filter dropdowns at the top — type (`feedback` / `support` / both), area (matches the Area dropdown values from the SP-6 sheets), and a third combined status/category dropdown that lets the user filter to a specific status (`open`, `planned`, `resolved`, `closed`) or category (`roadblock`, `bug`, `ux`, etc.). Below the filters, a scrollable list of submission rows. Each row shows: created-at date (relative formatting — "today", "2 days ago"), category pill (color-coded per the SP-6 styling), area, type icon (💬 / 🆘), the first ~140 chars of the note with ellipsis, and a row click that opens the **Submission detail sheet** (slide-over from the right on desktop). The detail sheet shows the full submission, lets an admin edit the category / area / status / priority, post a dev response, and resolve, reopen, or delete. The submission detail sheet is the only place an admin can mutate a submission row — the list itself is read-only.

**Layout / desktop nav placement:**

| Property | Value |
|---|---|
| Route | `#/feedback` |
| Sidebar label | `Feedback` (with 💬 icon, matching the SP-6 header button) |
| Sidebar position | After Settings, before the sync strip at the bottom of the sidebar |
| Mobile bottom nav | Not shown — the screen is desktop-only |
| Badge | Red badge with count of `open` + `resolved` items |
| `data-testid` | `nav-feedback` |

**Resolve / edit sheets behavior.** Resolve and Edit live on the submission detail sheet, not as inline buttons in the list. Resolve writes `status='resolved'` plus the dev response, then surfaces the row in section 1's Confirmation banner the next time the user lands on the screen. Edit changes any of the editable fields (category, area, type, priority, status) and posts a system-generated note recording the change for audit trail.

**No mobile fallback.** A user who lands on `#/feedback` from a mobile viewport sees a centered card: *"Feedback management is desktop-only. Open this screen on a larger device to review and reply."* with a `Back to dashboard` button. Submissions still capture on mobile (header sub-row); only management is desktop-gated.

**Out of scope for v2 launch:** threaded multi-message dev responses (single response field for now), email notifications when an admin posts a response (deferred until commercialization), team-member self-confirmation on submissions another team member filed (the original submitter is the only confirmer for now).

**Linked specs:** SP-6 covers the capture sheets that write into this screen's data. The full v1 HTML/CSS/JS reference lived in `github/issues/feedback-screen-desktop.md` during the sprint and has been retired into the thin-pointer sweep at the end of Session C.

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-04-12 | Session 11 — UX flow gap fill | Added §14 (reusable health & recording components — 10 subsections covering weight, BCS, treatment, breeding, heat, calving, note, group sessions, quick-action bar), §15 (entity CRUD forms — animal, group, location, feed type), §16 (field mode — home screen, navigation, heat quick-access, feed loop). Component-first approach: each form documented once with entry points and context pre-fill mapped. |
| 2026-04-13 | Session — Dashboard & todos spec | Added §17 (home screen / dashboard + todos). 14 subsections covering: screen layout (mobile/desktop), header bar, farm overview stats (desktop 5-metric, mobile 3-metric with thresholds), view toggle (groups/locations, default changed to locations for new users), group card anatomy (body elements, conditional logic, action buttons, collapse/expand), location card anatomy, open tasks dashboard section, todos screen with 3-axis filtering, todo create/edit sheet, todo card anatomy, survey draft card, weaning nudge. Derived from v1 `renderHome()` + `renderTodos()` code review against v2 schema D11.3/D11.4. FAB removed — feedback button moved to header. |
| 2026-04-13 | Header + multi-farm context design | OI-0015 & OI-0019 resolved. §17.2 Header Bar rewritten — left cluster now shows operation name + farm picker, right cluster adds user menu button and restores build stamp. §1.2 and §1.3 (move wizard location + existing event pickers) gained a farm chip at the top enabling cross-farm targeting. New §18 Farm Switching & Multi-Farm Context added (8 subsections): active farm semantics, farm picker UX, switch-with-unsaved-work confirm, cross-farm whole-group moves (no-straddling-events rule, source_event_id linkage), cross-farm individual animal moves (membership-only), event card cross-farm markers, All farms aggregate mode behavior, Field Mode interaction. |
| 2026-04-13 | Nav label rename: Events → Rotation Calendar | §19 preamble updated to document the dual naming: nav label "Rotation Calendar," route `#/events`, testids `nav-events` / `bnav-events` — all internal references preserved; only the user-visible label changed. Label-only alignment with Claude Code commit `59833ea`. |
| 2026-04-17 | §17.2 Feedback & Help sub-row | Added "Feedback & Help sub-row" paragraph to §17.2 right-cluster section. Two-row header: existing row unchanged, new 28px sub-row with Feedback + Get Help buttons. Replaces v1 FAB. Full spec in UI_SPRINT_SPEC.md SP-6. Updated nav items note to reference sub-row. |
| 2026-04-17 | §17.2 Feedback screen nav item | Added "Feedback" to nav items list (desktop sidebar only, not mobile bottom nav). SP-7 spec: desktop-only screen at `#/feedback` with confirmation section, stats, dev brief, filtered list, resolve sheet, edit sheet. Full spec in `github/issues/feedback-screen-desktop.md`. |
| 2026-04-13 | Settings screen + unit-system toggle (GH-3 base-doc fill) | Added §20 Settings Screen (7 top-level sections). §20.2 documents the unit-system toggle mechanics: `store.setUnitSystem()` action, sync-failure revert, full list of unit-sensitive fields that re-render on toggle, input-field conversion rules, localStorage → `operations.unit_system` one-time migration on boot, Field Mode inheritance. §20.3 documents Export/Import/Migrate/Resync actions in the Sync & Data section (forward references to V2_MIGRATION_PLAN.md §5). Closes the GH-3 base-doc integration gap identified in the 2026-04-13 reconciliation audit. |
| 2026-04-13 | Rotation calendar design (CP-54) | Added §19 Rotation Calendar — 9 subsections covering view modes (Estimated Status + DM Forecast), past event blocks (linked, strip-grazed, active, sub-move), future forecast blocks (capacity split, surplus, never-grazed → survey CTA), toolbar lightboxes (Timeline Selection + Dry Matter Forecaster), confinement pill, sidebar mirroring paddock column, empty states, mobile fallback (no calendar below 900px — v1 GRZ-11 banner + GRZ-10 list), List view (v1 GRZ-10 pattern), and **§19.9 Interactions & Deep Linking** (click targets, pan/zoom gestures, keyboard shortcuts, deep-link URL schema, first-load defaults Zoom=Week/Jump=Today, state persistence policy deferred from user_preferences to a follow-up, paddock sort order, accessibility). Calendar lives only on the Events screen — Reports does not mount a second copy. Bundles strip-grazing from OI-0001. |
| 2026-05-03 | Reconciliation Session B — UX flows P1 catch-up (RECONCILIATION_PLAN_2026-05-03 UX-1, UX-2, UX-3, UX-4) | Four base-doc edits landing in one pass. **§17.7 (UX-1):** stub card body spec replaced with full v1-parity rewrite from UI_SPRINT_SPEC SP-3 — 15-element card anatomy (left green accent bar through DMI/NPK summary), explicit two deliberate v1 deltas (small bottom Feed/Feed-check buttons removed; large green Feed button added under large amber Feed check), header buttons (Edit opens §17.15 sheet, Move all opens move wizard), "What is NOT on this card" callouts for OI-0065 (per-group reweigh moved to Animals area) and OI-0066 (per-group Move on dashboard is event-scoped). **§16 (UX-2):** pre-sprint Field Mode prose replaced with v1-parity rewrite from UI_SPRINT_SPEC SP-8 — 12 subsections covering header pill activation with three-state context-aware behavior (⊞ Field / ← Detail / ⌂ Home), exit-returns-to-previous via sessionStorage, body.field-mode CSS gate (sidebar / bottom nav / SP-6 sub-row / build stamp hidden + desktop grid collapse), 8-module tile grid driven by `FIELD_MODULES` constant with 4-module default, shared event picker sheet (Move / Feed Check / Heat fallback), expandable event cards reusing `buildLocationCard()`, interactive tasks with checkboxes + due-date color coding, 2-step Heat picker (event/group filter pills, search, multi-record), feed-loop behavior on Feed Animals tile, field-mode sheet treatment (no backdrop close, hidden handle, "⌂ Done", full-screen mobile, after-save→#/field), Module Settings card cross-reference to §20. The dark-green field-mode header bar is explicitly deleted. **§17.15 DMI chart (UX-3):** added the 5-state status model (actual / estimated / needs_check / no_animals / no_pasture_data) per UI_SPRINT_SPEC SP-12 / OI-0119 — full status table with bar render, label, and CTA per status; "Feed check needed" hint on `needs_check` for stored-feed events without a strike point; deficit red-segment render and conditional `■ deficit` legend swatch; partial pre-graze "(Fix)" hint; source-event date-routing-only bridge documented; forced feed-check on sub-move close rule referenced. **NEW §17.15.1 (UX-4):** "Event Data Editing" subsection created from UI_SPRINT_SPEC SP-10 — core principle (compute on read for derived; explicit reconciliation for structural), shared gap/overlap routine (3 options each), retro-place atomic two-write flow (no reopen ceremony), §7 Groups Edit dialog (new Edit button between Move and Remove; auto-save on blur; Delete window with guards), §12 Sub-moves Edit dialog (resolves OI-0064 — Reopen folds in; no gap detection; range guards; strip-graze flip), event-level dates (`date_in` direct edit with reject-on-narrow / confirm-on-widen; Event Reopen for `date_out` with three-option group-conflict picker; re-close overlap warning), §8 Feed Entries validation guards, §8a Move Feed Out (new capability — 4-step sheet, two entry points, atomic transaction, DMI / NPK / cost logic block), §9 Feed Checks invariant + Re-snap dialog (Cases A/B/C/D), §3 Pre-graze + §6 Post-graze inline edit + silent cascade, sub-move close forced feed-check rule. Architecture-doc portion (snapshot/rollback pattern in V2_APP_ARCHITECTURE.md) deferred to Session C. No code changed in this session — documentation catch-up only. Owner: Cowork. |
| 2026-05-04 | Reconciliation Session D — SP-9 Survey Sheet + SP-14 cross-references | The last open item from the retired sprint spec's checklist. **§7 Survey Workflow rewritten end-to-end** from the brief 22-line sketch into 11 subsections covering: §7.1 three modes (one sheet — `bulk` / `single` / `bulk-edit` — toggled by `setSurveySheetMode`); §7.2 the 8-path entry-point matrix (Locations `📋 Survey`, Surveys sub-tab `+ New Survey` / Resume / Edit, Location edit `+ Add reading` / row Edit, Field Mode multi-pasture and single-pasture tiles; v1's home Pasture readiness card explicitly dropped); §7.3 paddock card (collapsed bulk header anatomy, single-mode richer context line, six body sections including the rating slider + number + color bar, recovery window with live date preview, recovery-window date math inverse on commit); §7.4 the **bale-ring residue helper** (the one deliberate v2 addition — input between cover and condition, two-line caption, auto-fill cover %, default 12-ft diameter editable per farm via `farm_settings.bale_ring_residue_diameter_cm`, count stored on observation but not required for the Complete badge); §7.5 bulk-mode chrome (action row with red Cancel + DRAFT pill + Expand/Collapse + Save Draft + Finish & Save + ✕; date row; farm pills only when >1 farm; type pills excluding crop; search; in-place finish-confirm bar); §7.6 draft lifecycle (immediate-on-localStorage + 1-second-debounced Supabase sync; child table `survey_draft_entries`; three close semantics — backdrop/✕ auto-saves, Cancel rolls back session edits, Discard deletes draft entirely); §7.7 commit rules (require ≥1 rated paddock; one observation per rated paddock with `source='survey'`, `sourceId=survey.id`, `confidenceRank=3`; recovery-window inversion on save so stored values are event-date-relative; bulk-edit replaces, doesn't append); §7.8 field-mode adaptations (backdrop disabled, sheet handle hidden, close = `⌂ Done`, full-screen mobile, single survey gated through picker sheet first); **§7.9 Surveys sub-tab on Locations Screen** (draft banner + committed list with Edit; `+ New Survey` disabled when a draft exists); §7.10 design notes (no `farm_id` on parent survey; Complete-badge rule lives in one function); §7.11 schema and export impact (migration 022 + OI-0111 / migration 027 rename to `_cm`). Pairs with V2_CALCULATION_SPEC.md §4.9 for the SUR-2 `survey.baleRingCover` calc spec added in the same session. **`github/issues/GH-12_survey-sheet-v1-parity.md` and `github/issues/GH-34_dam-calf-bidirectional-sync.md` thin-pointer conversions** complete the SP-N spec file sweep. With Session D, the entire UI Sprint reconciliation backlog is closed. No code changes — documentation catch-up only. Owner: Cowork. |
| 2026-05-04 | Reconciliation Session C — UX flows P2/P3 catch-up (RECONCILIATION_PLAN_2026-05-03 UX-5, UX-6, UX-7, UX-8) | Four base-doc edits landing in one pass, completing the UX-side reconciliation backlog. **NEW §3.4 (UX-5) — Empty Group Handling (Archive Cascade):** absorbs UI_SPRINT_SPEC SP-11 + OI-0090. Documents the post-window-split trigger (`maybeShowEmptyGroupPrompt(groupId)` — no centralized "after last membership closes" cascade; each mutation flow owns its call), three group states (`active` / `empty-but-active` / `archived`) on the `groups.archived_at TIMESTAMPTZ` column shipped in migration 024, the empty-group prompt (Archive primary / Keep active / Delete with hard-disable when group has any historical event_group_window), the Group Management UI ("Show archived" toggle + per-row Reactivate + delete-history guard), the picker filter list (move wizard / event creation / Group CRUD / Field Mode pills / reports / dashboard), and the CP-55/CP-56 OI-0156 catch-up note. **§17.2 (UX-6) — Feedback & Help sub-row:** the brief paragraph that pointed at UI_SPRINT_SPEC SP-6 has been replaced with the full inlined spec — sub-row layout (28px height, 1px `--border` bottom divider, right-aligned, 8px button gap), button styling (`btn btn-outline btn-xs`, 11px/500, 💬 / 🆘 emoji prefix), responsive behavior (≥900px desktop / <900px mobile / hidden in Field Mode, fits down to 280px viewport), Feedback sheet (`type='feedback'`, all 7 category pills) vs Get Help sheet (`type='support'`, 4 categories only, always-visible Priority dropdown), shared structure (auto-filled context tag and Area dropdown using v2 screen names — `home`→`dashboard`, `events`→`rotation-calendar`, `pastures`→`locations`, `todos` removed for v2 launch), and the no-FAB-in-v2 statement. Both sheets write to `submissions` (V2_INFRASTRUCTURE.md §4.2) — no schema change. **NEW §21 (UX-7) — Feedback Screen (Desktop-Only):** absorbs UI_SPRINT_SPEC SP-7. Documents the desktop-sidebar-only nav placement (between Settings and the sync strip; never in mobile bottom nav) with red unread badge for `open` + `resolved` items; four screen sections matching v1's order (Confirmation banner + cards for resolved items awaiting user confirm; Stats strip with status/category badges that filter the list; Dev session brief card with Generate + Copy buttons over a regenerated monospace text block; All Submissions card with type / area / status filters and a row-click submission detail sheet); resolve / edit lives only on the detail sheet (not inline); explicit mobile fallback (centered "desktop-only" card with Back to dashboard); out-of-scope items (threaded responses, email notifications, cross-team-member confirmation). No new entities, no schema, no CP-55/CP-56 impact. **NEW §20.8 (UX-8) — Forage Types (Reference Library):** absorbs UI_SPRINT_SPEC SP-13 + OI-0125. Documents the Settings card placement (between Farm Settings and Field Mode, mirroring v1's vertical order); card anatomy (header + subtitle + `+ Add` button + row list with `<strong>name</strong>` + meta line + "seeded" badge + Edit pill + delete `×`); Add/Edit sheet fields (name required; DM%; N/P/K kg/t DM; **dmYieldDensity** field with imperial `lbs/in/ac` ↔ metric `kg/cm/ha` — see new V2_INFRASTRUCTURE.md §1.4; Min residual height in length family; Utilization %; Notes); shared unit-descriptor pattern with Farm Settings (`src/features/settings/unit-descriptor.js`); store-call signatures with full sync params per CLAUDE.md quality check #7; delete hard-guard against in-use forage types (lists affected paddocks + "View locations" link); empty-state with "seed defaults" link gated by confirm; out-of-scope (archive UI, custom unit labels, forage quality grading); zero schema / CP-55 / CP-56 impact. No code changed in this session — documentation catch-up only. Owner: Cowork. |

---

*End of document. For data schemas see V2_SCHEMA_DESIGN.md. For code patterns see V2_APP_ARCHITECTURE.md. For formulas see V2_CALCULATION_SPEC.md. For visual patterns see V2_DESIGN_SYSTEM.md.*
