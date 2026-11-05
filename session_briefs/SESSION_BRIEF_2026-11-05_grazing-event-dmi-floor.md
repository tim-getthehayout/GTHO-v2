# SESSION_BRIEF — Grazing event card DMI floor and remaining capacity

**Generated:** 2026-11-05  
**Source:** Grok design session (live diagnosis of event eeb2febe-2943-41fc-98ac-6a85d3a061d1)  
**Status:** Ready for implementation

## What was decided

On the dashboard location card (and any other place that shows the same event-to-date pasture/stored split or days-remaining figure):

1. Pasture intake is inferred from stored-feed consumption relative to the estimated available pasture (FOR-1).  
   - Available pasture DM = FOR-1 (height, residual, cover, area, density).  
   - Stored consumed = sum of deliveries minus residual from the latest feed check.  
   - Pasture consumed = min(available pasture, max(0, totalDemandSoFar - storedConsumed)).  
   - Once the forage estimate is used up, pasture bottoms at 0 and further demand is attributed to stored feed. Negative pasture must never appear.

2. Days remaining must include remaining stored DM (use FOR-4 or an equivalent that does (max(0, availablePasture - pastureConsumed) + remainingStoredDm) / dailyDmi). The “(incl. stored feed)” label must only appear when the number actually includes it.

3. Ordinary feed checks (isCloseReading = false) must update the residual used for both the consumed split and the remaining-capacity calculation. Do not require a close-reading.

4. All values continue to be calculated on the fly from raw records. No stored aggregates, no backfill, no schema change.

## What to build / change

In src/features/dashboard/index.js (location-card path) and any shared helper that produces the same numbers:

- Replace the pure DMI-4 subtraction that can go negative with the floor-and-switch logic above.  
- Compute remaining stored DM from the latest feed check (any check, not only isCloseReading) plus any deliveries after that check.  
- Use FOR-4 (or equivalent) for daysRemaining so remaining hay is included.  
- Keep the existing forage-only path as a fallback when there is no stored feed.  
- Update tests to cover: (a) over-delivery of stored feed floors pasture at 0, (b) ordinary feed check residual reduces consumed and increases days remaining, (c) deliveries after a check are included in remaining.

## Acceptance criteria

- Event eeb2febe… no longer shows negative pasture DM.  
- Days remaining rises when hay is added and a residual check is recorded.  
- Past events recalculate correctly with the new formula (no data migration).  
- vitest green, lint clean on changed files.  
- Changelog and brief updated.

## Constraints

- No schema change.  
- Do not invent new formulas; use or extend the existing FOR-1 / FOR-4 / DMI-1 / DMI-4 registry entries.  
- Preserve the rest of the card (weight, AU, ADA, cost, chart).
