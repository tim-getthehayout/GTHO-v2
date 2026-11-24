# Dairy milk tracking (#449): spec, Nov 24, 2026

Issue: https://git.sarnford.com/Homelab/GTHO-v2/issues/449 Status: LOCKED picks (Tim card t1519s5955, Nov 24, 8:32 AM ET), PARKED after #433 (Tim t1516u, 8:29 AM ET).


## Goal
When an operation has dairy cattle, track where milk goes: **processor pickups** and **milk fed to calves**. Show both side by side with the grazing that produced the milk.

## Records
- **Milk pickup:** date and time, weight (lb), driver (free text with recent names suggested), notes.
- **Calf feeding:** date and time, gallons entered, stored as lb = gallons × lb/gal (the factor is saved on the record). Optional calf group, notes. **Tim: "Calf feeding: with optional calf group".**
- Records can be edited and soft-deleted. They have no effect on DMI or feed calculations in this release.

## Visibility
- Farm setting `dairy_mode`: Auto / On / Off.
- Auto shows Milk when any active animal is in a class whose species is `dairy_cattle`.
- **Tim (t1519s5955): "Milk shows: with dairy cattle, plus a Settings switch".** Demo: a separate demo farm under another login (Tim t1518u; planned separately).

## Desktop: Milk view (menu item)
- Filter Pickup / Calves / All, plus a date range (default last 14 days). Newest first, with each row's actual date and time.
- **All** adds a per-day total row: pickups + calf feedings = total output.
- **Paddock column** to the right of the grid. It has a vertical time axis with the newest at the top. Grazing blocks are shifted later by the **offset days** (grazing on day D lines up with milk on D+offset) but are labelled with their real dates.
- An offset stepper in the view header saves to farm settings (default 1 day, range 0–14). **Tim: "Offset default: 1 day".**

## Mobile
- Tiles **Record Milk Pickup** and **Feed Calves**, with forms optimized for the phone. Date and time default to now, and the Feed Calves form shows a live lb preview.

## Settings
- Dairy features (Auto/On/Off).
- Milk lb per gallon (default 8.6, must be > 0). **Tim: "Gallons to lb: 8.6, editable".**

## Data: migration number assigned when this PR is next to apply (contiguous; 049 #402, 050 #388, 051 #406, 052 #437)
- `milk_pickups`: id, operation_id, picked_up_at timestamptz, weight_lb > 0, driver, notes, created/updated/deleted_at.
- `calf_milk_feedings`: id, operation_id, fed_at timestamptz, gallons > 0, lb_per_gallon, weight_lb, group_id null FK, notes, created/updated/deleted_at.
- `farm_settings`: `dairy_mode` (auto|on|off, default auto), `milk_lb_per_gallon` (default 8.6), `milk_grazing_offset_days` (default 1, 0–14).
- RLS: the standard 4 operation-member policies. Indexes on (operation_id, timestamp). Backup/CP-55, sync and schema-release coverage.
- The UI stays hidden until the migration is applied.
- **Apply needs a verified backup plus Tim's yes.**

## Out of scope (follow-up)
Per-cow production, milk price or revenue, processor statement import, reports and exports, assistant actions, and DMI or lactation tie-in.

## Acceptance
- Entity round trip, gallons→lb snapshot, visibility rule, offset alignment, and All daily totals are tested.
- The demo flow works on desktop and on an iPhone.
- Order: docs land, then migration (backup plus yes), then merge and publish, all on Nov 24.
