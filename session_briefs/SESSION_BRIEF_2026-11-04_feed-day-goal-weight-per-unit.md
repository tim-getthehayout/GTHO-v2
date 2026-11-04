# SESSION_BRIEF — Feed day goal DM on hand uses weightPerUnitKg

**Generated:** 2026-11-04  
**Source:** Grok design session  
**Status:** Ready for Grok Build

## What was decided

The feed-day-goal banner’s DM-on-hand figure currently does:

```
remaining × dmPct / 100
```

`remaining` is in the batch’s unit (bale, ton, kg, lb, etc.). That formula is only correct when the unit is already kilograms of as-fed material. For count units (bales) or other units it under- or over-states the inventory.

Correct dry matter on hand is:

```
Σ (remaining × weightPerUnitKg × dmPct / 100)
```

for non-archived batches.

Tim confirmed (2026-11-04) that the goal is correct values, so `weightPerUnitKg` must be applied.

## What to build / change

In `src/features/feed/index.js`, `renderFeedDayGoalBanner()`:

1. Change the total DM on hand loop to:

   ```
   const weightKg = b.weightPerUnitKg ?? ftMap.get(b.feedTypeId)?.defaultWeightKg ?? 1;
   totalDmKg += (b.remaining ?? 0) * weightKg * (dm / 100);
   ```

   - Prefer the batch’s own `weightPerUnitKg`.
   - Fall back to the feed type’s `defaultWeightKg` when the batch has none.
   - If both are missing, treat weight as 1 kg per unit so the old behavior is the fallback (does not invent a new stored field).

2. Leave the farm-wide active-animal DMI denominator unchanged (already correct as of `7e4563d`).

3. Keep the existing live-refresh subscriptions.

4. Add or extend a unit test that covers:
   - Bale batch with `weightPerUnitKg` produces `remaining × weight × dm%`.
   - Fallback to feed-type `defaultWeightKg` when batch weight is null.
   - Fallback to 1 when both are missing.

No schema change. No new strings.

## Acceptance criteria

- A batch of 10 bales at 20 kg/bale and 88% DM contributes 176 kg DM, not 8.8.
- Days on hand uses that corrected total DM divided by the existing farm-wide active-animal DMI.
- Banner still refreshes live.
- `npx vitest run` green. No `innerHTML`. Store call shapes unchanged.
- Header stamp named after the Pages workflow succeeds.

## Constraints and traps to avoid

- Do not change the DMI denominator.
- Do not invent a new stored column.
- Do not drop the fallback (batch weight → feed-type default → 1).
- Scoped change only.

## References

- `PROJECT_STATUS.md`
- `AGENTS.md`
- `session_briefs/SESSION_BRIEF_2026-11-04_feed-day-goal-dmi-denominator.md`
- `src/features/feed/index.js` (`renderFeedDayGoalBanner`)
- `src/entities/batch.js` (`weightPerUnitKg`)
- `src/entities/feed-type.js` (`defaultWeightKg`)

## Open questions for the implementer

- None.
