# Strip Grazing — Partial Paddock Windows

## Summary

Allow a single paddock to be grazed in stages (strips) within one event, rather than requiring the user to create separate paddock records for sections of a large paddock. When creating a move event, the user can opt into strip grazing for the destination paddock. This triggers strip-aware UI in both the event card (home screen) and the event dialog.

**Why this matters:** Large paddocks are common. Farmers often fence off a section with temporary wire, graze it for a few days, then advance the fence. Today v2 has no way to represent this — the user would either treat the whole paddock as one grazing period (losing per-strip observation data) or create fake sub-paddocks in the location list (polluting the pasture map). Strip grazing is a first-class rotational practice and should be modeled as such.

## Design Approach

Use **sequential paddock windows on the same location** within a single event. The v2 schema already allows multiple `event_paddock_windows` rows with the same `event_id` + `location_id`. Each window represents one strip. A new `area_pct` column indicates what portion of the paddock each strip covers.

This approach reuses all existing child-table logic (observations, feed entries, group windows) with minimal schema change. No new tables required.

### Schema Change

One column added to `event_paddock_windows`:

```sql
ALTER TABLE event_paddock_windows
  ADD COLUMN is_strip_graze boolean DEFAULT false,
  ADD COLUMN strip_group_id uuid DEFAULT NULL,
  ADD COLUMN area_pct numeric DEFAULT 100
    CHECK (area_pct > 0 AND area_pct <= 100);
```

- `is_strip_graze` (boolean, default false) — explicitly marks this window as part of a strip grazing sequence. Set when the user selects "Strip graze" in the move wizard. When `true`, the UI shows strip-specific controls (advance strip, strip progress, per-strip observations).
- `strip_group_id` (uuid, nullable) — shared across all strip windows in the same sequence. Generated once when the user initiates strip grazing in the move wizard, then copied to each subsequent strip window as the user advances. This ties strips together as an analytical unit — enabling queries like "show me all strips from this pass" and handling the edge case where the same paddock is strip-grazed more than once within the same event.
- `area_pct = 100` (default) — window represents the full paddock. All existing events behave identically.
- `area_pct < 100` — window represents a strip. Multiple strip windows sharing the same `strip_group_id` should sum to ≤ 100, but this is enforced at the application layer (not a DB constraint) since strips may not cover the full paddock and the user may not know the final count upfront.

### What stays unchanged

| Component | Why no change needed |
|---|---|
| `paddock_observations` | Already scoped to individual windows via `source_id`. Each strip gets its own pre-graze and post-graze observations. |
| `event_feed_entries` | Already tied to `location_id` (paddock). Feed totals for the paddock are the sum across all strips — no ambiguity. |
| `event_group_windows` | Groups are attached to the event, not to specific paddock windows. Moving from Strip 1 → Strip 2 doesn't affect group windows. |
| `event_feed_checks` / `event_feed_check_items` | Feed residual checks reference `location_id`. Per-strip checks are possible via the paddock window linkage but not required. |
| Event lifecycle (`date_in`/`date_out`) | Closing Strip N and opening Strip N+1 is window management within the event. Event stays open throughout. |

## User Workflow

### Entry point: Move Wizard

When creating a new move event:

1. User selects the "to" paddock as normal
2. New toggle/option: **"Strip graze this paddock"**
3. If selected, user defines strip size using **either acres/hectares or percentage** — whichever they prefer. The UI auto-derives the other value from the paddock's total area. Every grazer's mind works differently: some think "10 acres per strip," others think "25% at a time." Both inputs are always visible, and editing one updates the other in real time.
4. User can optionally set the number of strips (derived from strip size, or entered directly to derive strip size)
5. Only the first strip window opens immediately (with its pre-graze observation prompt). Subsequent strips are opened via the "Advance Strip" action.

**Note on units:** The UI respects the operation's display unit preference (acres vs. hectares) established in farm settings. The stored value is always `area_pct` — area-based input is converted to percentage using the paddock's total area from the `locations` table.

### Event card (home screen)

When an active event has strip grazing enabled (any paddock window with `area_pct < 100`):

- Card shows current strip indicator: e.g., **"Strip 2 of 4 — East Meadow"**
- Progress visualization: simple bar or segment indicator showing which strips have been grazed, which is current, and which are upcoming
- **"Advance Strip"** quick action available on the card (alongside existing actions like "Close Event")

### Event dialog

Full event detail view shows:

- Strip timeline: list of all strip windows with open/close dates, observations, and status
- Current strip highlighted with pre-graze readings
- Completed strips show post-graze residual and recovery estimates
- Option to adjust remaining strip percentages if the plan changes mid-graze
- Option to end strip grazing early (close current strip, mark remaining as skipped)

### Advance Strip action

When user taps "Advance Strip":

1. **Close current strip** — set `date_closed`/`time_closed` on current paddock window
2. **Post-graze observation prompt** — residual height, cover, recovery days (same as closing any paddock window)
3. **Open next strip** — create new paddock window for same `location_id` with next `area_pct`
4. **Pre-graze observation prompt** — height, cover, quality (same as opening any paddock window)

This is identical to the existing "close one window, open another" pattern — the only difference is both windows reference the same paddock.

## Calculation Layer Impacts

### Stocking density

Current: `head_count ÷ paddock_area_ha`

With strip grazing: `head_count ÷ (paddock_area_ha × area_pct / 100)`

A 40-hectare paddock grazed at 25% strips has an effective area of 10 hectares per strip. This matters for stocking rate reports and grazing pressure calculations.

### Rotation calendar / rest tracking

Each strip gets its own recovery clock based on its close observation. The rotation calendar needs to handle the case where Paddock A has strips in different recovery states simultaneously:

- Strip 1: closed 5 days ago, recovery estimate 21-28 days → 16-23 days remaining
- Strip 2: closed 2 days ago → 19-26 days remaining
- Strips 3-4: not yet grazed

The calendar should show per-strip recovery when strip windows exist, and whole-paddock recovery when `area_pct = 100`.

### NPK / nutrient calculations

Manure distribution and nutrient loading should use the effective strip area, not the full paddock area. Same formula: multiply paddock area by `area_pct / 100`.

## Acceptance Criteria

- [ ] `event_paddock_windows.is_strip_graze` column exists (boolean, default false)
- [ ] `event_paddock_windows.strip_group_id` column exists (uuid, nullable) — shared across all strips in a sequence
- [ ] `event_paddock_windows.area_pct` column exists with default 100 and check constraint (> 0, ≤ 100)
- [ ] Move wizard offers "Strip graze" option when selecting a destination paddock
- [ ] Selecting strip graze lets user define strip size as either acres/hectares or percentage, with auto-derivation of the other value
- [ ] Unit display respects operation's preference (acres vs. hectares)
- [ ] Only the first strip window opens when the event is created
- [ ] Event card on home screen shows strip progress indicator for strip-grazed events
- [ ] Event card has "Advance Strip" quick action
- [ ] Advance Strip closes current strip window (with post-graze obs prompt) and opens next strip window (with pre-graze obs prompt)
- [ ] Event dialog shows strip timeline with per-strip observations and status
- [ ] User can adjust remaining strip percentages mid-event
- [ ] User can end strip grazing early (skip remaining strips)
- [ ] Stocking density calculations use effective area (paddock area × area_pct / 100)
- [ ] Rotation calendar shows per-strip recovery states
- [ ] NPK calculations use effective strip area
- [ ] Existing events with area_pct = 100 behave identically to pre-change behavior (no regression)

## Test Plan

- [ ] Create a move event with strip grazing (4 strips at 25%) — verify only first strip window opens
- [ ] Advance through all 4 strips — verify each creates proper open/close observations
- [ ] Check stocking density report — should show effective area per strip, not full paddock
- [ ] Check rotation calendar — should show per-strip recovery clocks
- [ ] End strip grazing early at strip 2 — verify strips 3 and 4 are not created
- [ ] Adjust strip percentages mid-event (e.g., change from 25/25/25/25 to 30/30/40) — verify remaining windows pick up new values
- [ ] Create a normal (non-strip) event — verify area_pct defaults to 100 and no strip UI appears
- [ ] Enter strip size as acres — verify percentage auto-derives correctly from paddock total area
- [ ] Enter strip size as percentage — verify acres auto-derives correctly
- [ ] Switch operation unit preference (acres ↔ hectares) — verify strip size display updates
- [ ] Verify feed entries work correctly across strip windows on the same paddock
- [ ] Verify backup/restore handles events with strip windows and area_pct values

## Related OIs

- OI-0001 — Strip Grazing: Partial Paddock Windows

## Notes

- **No new tables.** The entire feature is enabled by three columns on `event_paddock_windows` (`is_strip_graze`, `strip_group_id`, `area_pct`) plus UI/calculation changes. This validates the v2 window model's composability.
- **Two columns serve different purposes.** `is_strip_graze` is the UI trigger — it tells the event card and dialog to show strip controls. `strip_group_id` is the analytical link — it explicitly groups strips into a sequence for reporting and handles the edge case of multiple strip passes on the same paddock within one event.
- **Strip labels are derived, not stored.** Strips are numbered sequentially by `date_opened` within the same event + location. No need for a `strip_number` column — the order is implicit and consistent.
- **Sum constraint is app-layer only.** Strip percentages for one paddock in one event should sum to ≤ 100%, but this is validated in the UI, not enforced by a database trigger. Reason: the user may not know upfront how many strips they'll use, and partial coverage (e.g., grazing 75% of a paddock then moving on) is a valid scenario.
- **Future: strip geometry.** If GTHY ever adds paddock mapping (GIS-style polygon boundaries), strips could be drawn on the map. For now, percentage is sufficient — farmers know where their temporary fence is.
