# SESSION_BRIEF — Feed day goal banner live refresh

**Generated:** 2026-11-03  
**Source:** Grok design session  
**Status:** Implemented (project chat, `3aedbae`)

## What was decided

The feed-day-goal banner (days on hand vs. target, progress bar, DM on hand, run rate) is computed correctly on first render of the feed screen but is never re-rendered when the underlying data changes. Adjusting a batch's remaining quantity, adding a batch, or logging a delivery therefore leaves the banner stale until the user leaves and re-enters the screen.

The existing calculation in `renderFeedDayGoalBanner()` is correct and must stay. Only the reactivity is missing.

## What to build / change

In `src/features/feed/index.js`:

- Add `refreshFeedDayGoalBanner(container)` that finds `[data-testid="feed-day-goal-banner"]` and replaces it with a fresh `renderFeedDayGoalBanner()`.
- Call it from the existing store subscriptions for `batches`, `batchAdjustments`, and `eventFeedEntries` (alongside the existing `renderBatchList` calls).
- Also subscribe to `farmSettings` so a goal change refreshes the banner.

No schema change. No new strings. No change to the calculation itself.

## Acceptance criteria

- After adjusting a batch's on-hand quantity, adding a batch, or recording a delivery while the feed screen is open, the banner's days-on-hand number, progress bar, and DM-on-hand figure update immediately.
- Goal change in farm settings also updates the banner if the feed screen is open.
- Existing batch list and activity list behavior is unchanged.
- `npx vitest run` green. No `innerHTML`. Store call param counts unchanged.

## Constraints and traps to avoid

- Do not change the days-on-hand formula.
- Do not invent a new stored field.
- Writes stay through the store.
- Scoped change only.

## References

- `PROJECT_STATUS.md`
- `AGENTS.md`
- `src/features/feed/index.js` (`renderFeedDayGoalBanner`, subscriptions in `renderFeedScreen`)

## Open questions for the implementer

- None.
