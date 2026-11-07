# SESSION_BRIEF — Feed batch pasture picker styling + map pick

**Generated:** 2026-11-04  
**Source:** Grok design session (UI follow-up)  
**Status:** Implemented. PR #64.  
**Parent:** session_briefs/SESSION_BRIEF_2026-11-04_feed-batch-storage-picker.md

## What was decided

On the batch create/move location picker, the Pasture list renders as grey custom buttons and has no way to pick from the map. Tim confirmed both are wrong.

- The location list (Storage and Pasture) must look like a normal selectable list, not greyed-out or disabled.
- On the **Pasture** side only, add a **Pick on map** control that reuses the existing shared map location picker (same UX as harvest, move wizard, todos, amendments).
- Selecting a pasture on the map sets the location the same way a list click does.
- Storage side stays list + “add new storage” (no map required).
- No schema change. No change to balances, moves, or delivery source location.

## What to build / change

In the batch location picker (`mountLocationChoice` in `src/features/feed/index.js` or equivalent):

1. Restyle the list items so they match normal selectable controls used elsewhere (readable text, clear selected state, not grey/disabled appearance).
2. When mode is `pasture`, add a “Pick on map” button/control that opens the shared map location picker, filtered to pastures (or allowing selection of a pasture).
3. On map selection, set `selection.locationId` and refresh the picker so the chosen pasture is marked selected.
4. Leave Storage mode unchanged (list + add-new name).

## Acceptance criteria

- Pasture list is readable and looks like a normal picker.
- Storage list is also not greyed.
- Pasture mode has a working “Pick on map” that selects a pasture.
- Map pick and list pick both set the same location for the batch/move.
- Tests cover list selection and map selection if practical. `npx vitest run` green.

## Constraints

- Reuse the existing shared map picker; do not invent a new map UI.
- Do not allow creating pastures from this flow.
- No schema change.

## References

- Screenshot from Tim (pasture list grey, no map option)
- `src/features/feed/index.js` (`mountLocationChoice`)
- Existing map location picker used by harvest / move / todos / amendments
