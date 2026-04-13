# Header redesign + multi-farm context (operation name, farm picker, logout, cross-farm moves)

## Summary

Three threads of work, designed together because they share the same header real estate and the same underlying multi-farm concept:

1. **OI-0015** — Header currently shows `farms[0].name`. Should show the **operation name** as primary identity, with a **farm picker** for switching between farms in a multi-farm operation.
2. **OI-0019** — No **logout affordance** in the header (v1 parity regression). Add a user menu popover with email + Log Out.
3. **Cross-farm moves** — v2 needs a first-class way to move animals between farms. No event straddles farms; cross-farm moves are two events linked by `source_event_id`.

Also bundled: restore the **build stamp** to the header for diagnostic visibility during testing.

## Design decisions (locked)

1. **Active farm is per-user.** Stored on `user_preferences.active_farm_id uuid NULL`. Syncs across devices. `NULL` = "All farms" mode.
2. **"All farms" mode is supported.** When `active_farm_id` is null, farm-scoped screens aggregate across every farm in the operation. Screens that can't meaningfully aggregate prompt "pick a farm" instead.
3. **Switching farms with unsaved work shows a confirm dialog** — "Unsaved work on {farm} — it'll be kept here." Buttons: *Switch anyway* (primary), *Cancel*. No discard in the dialog; discard lives inside the draft.
4. **Active farm scopes display, not permissions.** Any wizard whose destination is farm-scoped (move wizard, paddock window open, etc.) includes a **farm chip** at the top of its location picker so users can target locations on any farm they have access to.
5. **No event straddles farms.** A whole-group cross-farm move closes the source event on Farm 1 and opens a new event on Farm 2, linked by `events.source_event_id` pointing back to the closed event. Same mechanics as a within-farm whole-group move.
6. **Individual animal cross-farm moves are membership edits only.** Both events stay open; `animal_group_memberships` ends on Farm 1 side and starts on Farm 2 side at the same timestamp.
7. **Build stamp returns** to the right cluster of the header as small muted text (11px, `--text2`), between sync dot and field mode button.

## Acceptance Criteria

### Schema

- [ ] Migration adds `user_preferences.active_farm_id uuid NULL REFERENCES farms(id) ON DELETE SET NULL`
- [ ] Migration adds `events.source_event_id uuid NULL REFERENCES events(id) ON DELETE SET NULL`
- [ ] `user_preferences` entity file (`src/entities/user-preferences.js`) updates `FIELDS`, `validate()`, `toSupabaseShape()`, `fromSupabaseShape()` to include `activeFarmId`
- [ ] `events` entity file updates `FIELDS` and shape functions to include `sourceEventId`
- [ ] Unit tests added for both entity round-trips

### Store

- [ ] `store.getActiveFarmId()` getter returns the user's `active_farm_id` from preferences (null if unset)
- [ ] `store.setActiveFarm(farmId | null)` action persists to `user_preferences.active_farm_id`, queues sync, notifies `user_preferences` subscribers
- [ ] Store action `setActiveFarm` triggers re-render subscribers for `farms`, `locations`, `groups`, `events`, `animals` (farm-scoped collections)
- [ ] When the picker is set to a farm that no longer exists (deleted), store falls back to the first available farm and writes that back to preferences
- [ ] Computed helpers — `getVisibleLocations()`, `getVisibleGroups()`, `getVisibleEvents()` — read the active farm and filter accordingly. In "All farms" mode (null), return every record in the operation.

### Header component (`src/ui/header.js`)

- [ ] Header left cluster renders two lines:
  - Line 1: operation name (`operations[0].name` — single op per session for now). Style: 18px/700, `--text` color, letter-spacing `-0.3px`.
  - Line 2: farm picker button showing active farm name or "All farms". Style: 14px/500, `--text2` color, chevron ▾ suffix when tappable.
- [ ] Farm picker button behavior:
  - Single-farm operation (farms.length === 1): plain text, no chevron, not interactive
  - Multi-farm, specific farm active: chevron shown, tappable
  - Multi-farm, "All farms" active: label reads "All farms" in `--text3` muted color, chevron shown, tappable
- [ ] Right cluster, left-to-right order: sync dot → build stamp → Field Mode button → user menu button
- [ ] Build stamp renders the meta tag value (`<meta name="app-version">`) at 11px, `--text2`
- [ ] User menu button: circle (28×28px, `--bg2` background, 1px `--border`) with user initials from `auth.user.email`. Tap opens popover anchored below the button.

### Farm picker UI

- [ ] Mobile: tap opens full-screen sheet (`.sheet`) titled "Switch farm". Rows: "All farms" pinned top, then farms sorted alphabetically (active farm shows checkmark), then divider, then "+ Add farm" action linking to `#/settings/farms`.
- [ ] Desktop: tap opens dropdown menu anchored to the button. Same content as mobile sheet.
- [ ] Selecting a farm calls `setActiveFarm(farmId)`, closes the picker, and re-renders dependent screens.
- [ ] Selecting "All farms" calls `setActiveFarm(null)`.

### User menu popover

- [ ] Popover width 240px, `--bg` background, `--border` 0.5px, `--radius-l`, shadow `--shadow-md`. Anchored below the user menu button with 4px gap.
- [ ] Rows:
  - User email (read-only, 13px/500, 2-line cap with ellipsis)
  - Divider (`--border` 0.5px)
  - Log Out action (13px/500, left-aligned, `--red` text on hover)
- [ ] Log Out triggers confirm dialog ONLY if there are unsynced writes in the queue. Otherwise logs out immediately, clearing the local store and routing to `#/auth`.

### Farm switch confirmation

- [ ] Before calling `setActiveFarm(farmId)`, check for unsaved drafts: survey drafts in `surveys` with `is_draft=true` AND any open wizards (move, feed, etc.). If found AND the draft belongs to the current farm:
  - Show modal: Title "Unsaved work on {currentFarmName}". Body: "You have an unsaved {draftType} — it'll be kept here and you can return to it later." Buttons: [Switch anyway] (primary, `--green`), [Cancel] (ghost).
  - On *Switch anyway*: proceed with `setActiveFarm(farmId)`.
  - On *Cancel*: close dialog, picker stays open on current selection.

### Move wizard farm chip (§1 Move Wizard)

- [ ] Step 2a (Location Picker) and Step 2b (Existing Event Picker) both render a **farm chip** at the top of the picker, above the list.
- [ ] Farm chip label: "Farm: {farmName}" with chevron ▾. Tap opens a short menu of farms the user has access to. Default = active farm.
- [ ] Selecting a different farm in the chip re-filters the location/event list for that farm. Does NOT change `active_farm_id`. The chip selection is transient, scoped to this wizard instance.
- [ ] If destination is on a different farm than the source event's farm, the resulting new event's `source_event_id` is set to the closed source event's id. Source event closes normally (all windows close at chosen time). New event opens with the standard paddock window on the chosen destination location.
- [ ] Individual-animal moves between existing groups on different farms do NOT create a new event. They update `animal_group_memberships` (end on source, start on destination) at the chosen timestamp. Both source and destination events stay open.

### Event card cross-farm markers (§11 Event Card)

- [ ] When an event has `source_event_id` set AND that source event has a different `farm_id` than this event, the event card header shows "← Moved from {sourceFarmName}" marker (11px, `--text2`, with icon).
- [ ] When another event's `source_event_id` points to this event AND that other event has a different `farm_id`, the card shows "→ Moved to {destFarmName}" marker. (Query: `events WHERE source_event_id = this.id AND farm_id != this.farm_id`.)
- [ ] Both markers are tappable and navigate to the paired event.

### All-farms mode screen behavior

- [ ] Dashboard (§17): In All farms mode, the Farm Overview card's subtitle reads "All farms — {N} farms, {totalHead} head". Group cards, location cards, event cards aggregate across all farms. Each card shows a small `{farmName}` chip to indicate which farm that record belongs to.
- [ ] Locations screen: location rows show a `{farmName}` chip in All farms mode. In single-farm mode, the chip is hidden.
- [ ] Events screen: event rows show a `{farmName}` chip in All farms mode. In single-farm mode, chip hidden.
- [ ] Groups screen: same pattern.
- [ ] Move wizard: in All farms mode, the source group picker shows groups across all farms with farm chips. Destination picker already handles cross-farm targeting.

### Build stamp

- [ ] Header renders `<meta name="app-version">` content in the right cluster, between sync dot and Field Mode button. Style: 11px, `--text2`, no decoration.
- [ ] Hidden on viewports below 360px wide (very narrow phones) — trade-off for space.

## Test Plan

- [ ] Unit: `user_preferences` round-trip test includes `activeFarmId`
- [ ] Unit: `events` round-trip test includes `sourceEventId`
- [ ] Unit: `setActiveFarm(farmId)` persists to preferences and triggers farm subscribers
- [ ] Unit: `getVisibleEvents()` with `active_farm_id=null` returns all operation events; with a specific `farm_id` filters correctly
- [ ] Unit: Cross-farm whole-group move creates a new event with `source_event_id` set and closes the source event
- [ ] Unit: Individual animal move across farms only touches `animal_group_memberships`; no new event row created
- [ ] Unit: Switching to a deleted farm falls back to first available
- [ ] E2E: Multi-farm user signs in, sees operation name + first farm in header, opens picker, selects second farm, dashboard re-renders with that farm's data
- [ ] E2E: User with unsaved survey draft tries to switch farms; confirm dialog appears; Cancel dismisses, Switch Anyway proceeds
- [ ] E2E: Move wizard from Farm 1 → destination farm chip → select Farm 2 location → save; source event closes on Farm 1, new event opens on Farm 2 with cross-farm markers on both cards
- [ ] E2E: User menu opens popover; Log Out clears session and routes to auth
- [ ] E2E: Build stamp text matches the meta tag value

## Related OIs

- OI-0015 (Header: operation name + farm picker)
- OI-0019 (Logout affordance in header)

## Notes

- **Schema guardrail:** The "no events straddle farms" constraint is already enforced by `events.farm_id NOT NULL`. No additional check needed — paddock windows reference locations which reference farms; if those farms don't match `events.farm_id`, the write will fail. Confirm this invariant in a unit test.
- **Multi-op deferred:** This design assumes a single operation per session. Operation switching is a separate concern and out of scope here.
- **Field Mode interaction:** Field Mode is farm-scoped implicitly through the animals/groups it shows. When in Field Mode, the farm picker should be hidden (Field Mode locks you to whatever farm you were on when you entered). Log out while in Field Mode should exit Field Mode first.
- **RLS:** `active_farm_id` doesn't change row-level permissions; it's a UI filter only. A user sees what RLS lets them see; the picker just narrows the current view.
- **Unused-draft cleanup:** Drafts scoped to a farm that's later deleted should be cleaned up in a future migration. Not in scope here.

## Spec source updates (Cowork will handle in parallel)

- V2_SCHEMA_DESIGN.md §1.5 — add `active_farm_id` column
- V2_SCHEMA_DESIGN.md §5.1 — add `source_event_id` column
- V2_UX_FLOWS.md §17.2 — rewrite header bar spec
- V2_UX_FLOWS.md §1 — add farm chip step to move wizard pickers
- V2_UX_FLOWS.md §18 (new) — Farm switching flow
- V2_DESIGN_SYSTEM.md §3.6 — extend with farm picker + user menu patterns
