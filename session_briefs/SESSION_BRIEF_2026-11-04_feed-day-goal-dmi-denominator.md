# SESSION_BRIEF — Feed day goal uses farm-wide active animal DMI

**Generated:** 2026-11-04  
**Source:** Grok design session  
**Status:** Implemented (GTHO Build, `7e4563d`)

## What was decided

The feed-day-goal banner currently computes days on hand as:

total DM on hand ÷ 30-day average of DM from recent `eventFeedEntries`

That is incorrect. Per `V2_UX_FLOWS.md` §13.2 and Tim’s confirmation (2026-11-04):

**Days on hand** = total DM of current feed inventory ÷ daily DMI of all active animals on the farm

“All active animals” means every animal with `active !== false`, regardless of group membership, open event, or location. Culled animals (`active === false`) are excluded.

## What to build / change

In `src/features/feed/index.js`, `renderFeedDayGoalBanner()`:

1. **Keep** the existing total DM on hand calculation: sum of `(batch.remaining × dmPct / 100)` for non-archived batches. (If `weightPerUnitKg` must be applied to convert units to kg before the DM %, follow the same pattern already used in dashboard DMI-1; otherwise leave the existing DM-on-hand math unchanged.)

2. **Replace** the 30-day delivery run-rate with the farm-wide active-animal DMI:
   - Load all animals where `active !== false`.
   - For each animal, resolve:
     - Latest weight (most recent `animalWeightRecords` on or before today), falling back to the animal’s class `defaultWeightKg`, then 0.
     - DMI % from the animal’s class (`dmiPct`, default 2.5). Lactation flag may be ignored for this banner (same as current dashboard group DMI calls that pass `isLactating: false`) unless a cheap existing helper already provides it.
   - Sum `weightKg × dmiPct / 100` across those animals to get `dailyDmiKg`.
   - Prefer the existing DMI-2 calc (`getCalcByName('DMI-2').fn(...)`) if it can be called per animal or per small aggregate without inventing a new formula. Otherwise a simple inline sum is acceptable for this banner.

3. **Days on hand** = `dailyDmiKg > 0 ? Math.round(totalDmKg / dailyDmiKg) : null`

4. Update the “run rate” display cell to show the new daily DMI (same unit conversion as today) instead of the old delivery average. Keep the three-cell layout and progress bar logic.

5. Keep the existing `refreshFeedDayGoalBanner` subscriptions so the banner still updates live when batches, adjustments, feed entries, or farm settings change. Also refresh on `animals`, `animalWeightRecords`, and `animalClasses` if those stores are already subscribed elsewhere and the change is cheap.

No schema change. No new stored fields. No new i18n keys unless the run-rate label must change (reuse existing keys if possible).

## Acceptance criteria

- With the same inventory that currently shows ~278 lbs and 49 / 90 days, the days-on-hand figure updates to total DM ÷ sum of DMI for all active animals.
- Culled animals do not contribute to the DMI denominator.
- Animals not currently on an open event still contribute if they are active.
- Banner still refreshes live after an adjustment, new batch, or delivery.
- `npx vitest run` green. No `innerHTML`. Store call shapes unchanged.
- Header stamp named after the Pages workflow succeeds.

## Constraints and traps to avoid

- Do not change the days-on-hand formula to anything other than total DM on hand ÷ active-animal DMI.
- Do not invent a new stored column.
- Do not limit the DMI sum to animals currently on open group windows.
- Writes stay through the store.
- Scoped change only.

## References

- `PROJECT_STATUS.md`
- `AGENTS.md`
- `V2_UX_FLOWS.md` §13.2
- `src/features/feed/index.js` (`renderFeedDayGoalBanner`)
- `src/calcs/feed-forage.js` (DMI-2)
- `src/features/dashboard/index.js` (existing DMI-2 + live weight/head patterns)
- `src/entities/animal.js` (`active` flag)

## Open questions for the implementer

- None. Active = `animal.active !== false`. Weight = latest weight record or class default. DMI % = class `dmiPct` or 2.5. Lactation ignored for this banner.
