# OI-0102 — Multi-paddock open (spec)

**Status:** accepted by Tim, 2026-10-04. Ready for a Build session. Do not invent further design.
**Closes the design hold on OI-0102.** Does not change strip-graze (GH-4) or the per-window open/close sheets.
**Schema stamp today:** 34. This spec adds migration 035.

---

## 1. What Tim is doing

Fall and early spring: open several whole paddocks at once and let the cows graze all of them before the next move. One forage reading (cover, height, quality, condition) describes the set. Later, that set is the base. Paddocks around it still open and close one at a time, the way bale grazing already does around a single paddock.

That is not strip graze. Strip graze is one paddock cut into bands (`is_strip_graze`, `strip_group_id`, `area_pct`). It is also not “one main paddock open, then open and close neighbors.” Both stay. This spec adds the missing entry path: pick many, write many windows, one reading copied onto each.

## 2. What the code already does

The data model already allows this. `V2_SCHEMA_DESIGN.md` §5.2: “Multiple windows can be open simultaneously (multi-paddock grazing).” All windows are equal. There is no anchor column. An event is open while any paddock window and any group window overlap.

What is single-select today:

- `renderLocationPicker` (`src/features/events/index.js`) stores one `selection.locationId`. Click replaces the previous pick. Map picker (`src/features/map/picker.js`) highlights one polygon and returns one id.
- Move wizard Step 2 (`wizard-shared.js`) and the new-event / place paths pass that one id into `createDestinationEvent`, which writes one `event_paddock_windows` row and one `paddock_observations` row (`source_id` = that window id).
- Sub-move open (`submove.js`) is the same: one location, one window, one pre-graze card. Sub-move close is one window.
- Event detail still treats the earliest window as an “anchor” in the UI only (`detail.js` `renderSubmoves` does `sorted.slice(1)`). The schema says the opposite. That slice is why a set opened together would look like one real paddock plus sub-moves.

Feed already knows an event can have several open windows. Delivery uses a picker, not `activePWs[0]` (OI-0140).

OI-0102 (2026-04-18) parked this as design-required. This spec answers it.

## 3. Decision

One event. N `event_paddock_windows` rows. Same `date_opened` / `time_opened`. `area_pct` 100. Not strip graze.

The forage form is filled once. Save fans the same values out to one `paddock_observations` row per window (`type = 'open'`, `source = 'event'`, `source_id` = that window’s id, `location_id` = that paddock). Each paddock keeps its own history. There is no shared observation row.

Do not add an anchor column. The open set is the base. “Open around it” stays the existing sub-move open. “Close one around it” stays the existing sub-move close. “Close the set” is a bulk close of the windows that were opened together and are still open.

Strip graze and multi-select are mutually exclusive in the wizard. Checking strip graze collapses the picker to one paddock. Selecting a second paddock turns strip graze off.

## 4. Cohort, not an anchor

Windows opened in one Save share a `open_cohort_id` (uuid, nullable). Same idea as `strip_group_id`, different meaning: same open action, not bands of one paddock.

- Null means a window opened alone (every current row, and every future single open).
- A cohort is not a lock. Any member can still be closed by the existing close sheet.
- Bulk close closes every still-open window with that `open_cohort_id` on that event.
- A later sub-move open does not join the cohort. It is a neighbor, opened and closed on its own. That is the bale-grazing case, and it works whether the base is one window or a cohort.

Why a column, not “same timestamp”: two Saves in the same minute must not become one set, and a backdated edit must not dissolve the set.

Migration `035_paddock_window_open_cohort.sql`:

- `event_paddock_windows.open_cohort_id uuid NULL`
- index `(event_id, open_cohort_id)`
- `UPDATE operations SET schema_version = 35`
- backup-migrations no-op bump 34 → 35
- entity `FIELDS`, `create`, `toSupabaseShape`, `fromSupabaseShape`

No new table. Observations stay per location.

## 5. Picker

`renderLocationPicker` gains `opts.multi`.

- Default remains single-select. Harvest, amendments, todos, feed delivery, and strip graze do not change.
- Multi: tap toggles. Tap again unselects. Selected rows stay marked across search re-renders. Map button opens the map in toggle mode: tap a polygon adds or removes it, “Use N paddocks” returns the set.
- Sticky count line: “3 paddocks · 42.5 ac”. Acres are the sum of `area_hectares`, converted for display. Missing area is omitted from the sum and named in the line (“North has no area”).
- In-use paddocks (an open window on any event) stay visible in the In use section and are not selectable. Tap does nothing. The row shows why (“Open on {event}”). Map tap on an in-use polygon does not add it. Shared grazing is out of scope for this pass; blocking is the guard. A paddock already open on this same event is also not selectable.
- Confinement stays single-select. Multi is land only. If a confinement row is picked, the other picks clear.

Callers that pass `multi: true`: move wizard Step 2 when destination is new, place wizard, new-event dialog, sub-move open. Join-existing does not pick paddocks.

## 6. Forage card

One pre-graze card for the set. `setPaddockAcres` receives the summed acres so the card’s area hint matches the set. The stored observation does not store acres; area stays on the location.

Same card, same required fields as today (height, cover, and whatever the farm setting already requires). No per-paddock override in this pass. If one paddock is different, the farmer opens it alone or edits that window’s observation afterward (edit paddock window already hosts the card).

Close reading is one card, scoped to whatever this Save closes. Bulk close of a cohort copies that one residual onto each window being closed. Closing a single gate, including one member of a cohort, uses the existing one-card close sheet for that paddock only. The cohort is a label, not a lock: shutting one gate early leaves the other members open.

## 7. Write path

`createDestinationEvent` writes N windows when `state.locationIds.length > 1`.

- One new event. One group-window set (unchanged).
- One `open_cohort_id` for the batch.
- One observation per window, same field values, distinct `source_id`.
- Strip branch unchanged and only runs when `locationIds.length === 1`.

Move wizard source close does not change. It already closes every open window on the source (`closePaddockWindow` per open window). The close observation today is written per window inside that loop; this spec makes that loop share one post-graze reading when the farmer used the one-card close. Until the close sheet is cohort-aware, the existing per-window close observation stands.

Feed transfer on a multi-open move: the farmer must pick which selected paddock receives the moved bales. One select, defaulting to the first selected. Splitting a load across the set is out of scope (same deferral as OI-0140 Q1).

Sub-move open with N picks: N windows on the current event, one new cohort id, one observation each. Does not retitle the event. Does not move the group.

## 8. Event detail

Stop treating `sorted[0]` as the anchor.

- Open windows render as one list. A cohort renders as a group: “Opened together · North, South, Creek” with one “Close these” action, plus a per-row close for a single gate.
- Windows with a null cohort, or a different cohort, render as their own rows with the existing close button. That is “around the base.”
- “Add paddock” stays. It calls sub-move open, which now accepts one or many.
- Map and list chips already summarize multiple locations. They should list the open set, not the earliest window only. Grep `sorted[0]` / `slice(1)` on paddock windows before calling this done.

## 9. Calcs

Effective grazed area for an open event is the sum of `location.area_hectares * area_pct / 100` across open windows. That formula already exists for strip graze. Multi-open is the same formula with `area_pct = 100` on N rows. No new stored total.

DMI, stocking, and recovery stay per location. A copied observation is that location’s reading. Recovery on a paddock starts when its window closes, not when a neighbor closes.

## 10. Out of scope

- Drawing a lasso on the map.
- Different forage numbers per paddock inside one Save.
- Splitting one feed delivery across the set.
- Auto-suggesting neighbors of the set.
- Shapefile import.
- A stored anchor paddock.

## 11. Tests

- Picker multi toggle on and off, including after a search re-render.
- `createDestinationEvent` with two locations writes one event, two windows, one shared `open_cohort_id`, two observations with the same height and cover and different `source_id`.
- Strip graze plus a second location is rejected in the wizard (strip clears, or second pick is refused — match the UI rule in §3).
- Sub-move open of two paddocks does not close or rewrite existing windows.
- Bulk close sets `date_closed` on cohort members only. A neighbor window opened later stays open.
- Picker refuses an in-use location in multi mode (row visible, not selectable; Save cannot include it).
- Single-select callers (harvest, amendment, todo) still pass one id.

## 13. Locked answers (Tim, 2026-10-04)

1. Close reading. One residual copied onto every paddock this Save closes. A single-gate close gets its own reading.
2. Partial close. Yes. One gate of the set may close early. The others stay open. The cohort is a label, not a lock.
3. In use. Block. A paddock with an open window is visible and not selectable.
4. Feed on the move. Moved bales go to one chosen paddock of the set. No split.
5. Add paddock. The sub-move open sheet multi-selects too, so two neighbors can open in one Save.

## 14. Build order

1. Migration 035, entity, backup bump. Verify the column in Supabase before UI.
2. Picker multi mode and map toggle. Single-select default.
3. `createDestinationEvent` and sub-move open fan-out.
4. Move-wizard feed destination pick when N > 1.
5. Event detail cohort group and bulk close.
6. Grep sweep for single-window assumptions (`locationId` on wizard state, `slice(1)`, `activePWs[0]`).
