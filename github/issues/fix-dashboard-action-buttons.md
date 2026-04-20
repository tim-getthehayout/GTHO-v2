# Fix Dashboard Action Buttons — Move/Edit/Survey

**Status:** CLOSED — shipped in commit `7dd66f9` ("fix: wire dashboard action buttons to correct handlers (SP-1)"). Kept for historical record only; do not re-implement. Verified in `src/features/dashboard/index.js` — `openMoveWizard` and `openCloseEventSheet` imports (lines 15–16) and action-button wiring in `buildLocationCard` / group-card sections.

## Summary

The three action buttons on dashboard location cards (Move, Survey, Edit) all navigate to generic routes (`#/events` or `#/surveys`) instead of acting on the specific event. Move should call `openMoveWizard()` directly, Edit should open the close-event sheet (interim until event detail view exists), and Survey create needs to be exported from its module.

## Single Source of Truth

- **V2_UX_FLOWS.md §17.7** — "Locations View — Location Cards" → action buttons spec (updated 2026-04-15)

## Implementation Checklist

1. **Move button** — In `src/features/dashboard/index.js`, import `openMoveWizard` from `../events/move-wizard.js`. Replace `navigate('#/events')` on the Move button with `openMoveWizard(event, operations[0].id, farms[0].id)`. The `operations` and `farms` arrays are already available in `renderDashboard()` — pass them through to `renderLocationsView()` or retrieve them inside it.

2. **Edit button** — Import `openCloseEventSheet` from `../events/close.js`. Replace `navigate('#/events')` on the Edit button with `openCloseEventSheet(event, operations[0].id)`. This is interim behavior — will be replaced by event detail view navigation (§17.12) when that's built.

3. **Survey button** — Export `openCreateSurveySheet` from `src/features/surveys/index.js` (currently private). Import it in the dashboard. Replace `navigate('#/surveys')` with `openCreateSurveySheet(operations[0].id)`.

4. **Context passing** — `renderLocationsView(gridEl)` needs access to `operationId` and `farmId`. Either pass them as additional parameters from `renderDashboard()` or retrieve `getAll('operations')[0].id` / `getAll('farms')[0].id` inside `renderLocationsView`. Prefer passing them down since `renderDashboard` already has them.

## Test Plan

- [ ] Click Move on a dashboard location card → move wizard sheet opens with that event pre-loaded, NOT the Events screen
- [ ] Click Edit on a dashboard location card → close-event sheet opens for that event
- [ ] Click Survey on a dashboard location card → survey create sheet opens
- [ ] All three buttons work on every active event card (not just the first)
- [ ] Verify `openCreateSurveySheet` export doesn't break existing survey screen rendering

## Related OIs

- OI-0043 (Field mode tile navigation targets incorrect — same class of bug)

## Notes

- The Edit button behavior is explicitly interim. When Event Detail View (§17.12) is built, Edit should navigate to `#/events/{eventId}` instead of opening the close-event sheet.
- `operationId` and `farmId` derivation: for multi-farm support (GH-5), these should eventually come from the active farm context rather than `[0]`. For now, `operations[0].id` and the active farm ID are correct.
- The groups view has similar buttons that may also need the same fix — check and fix if applicable.

## CP-55/CP-56 Spec Impact

None — no schema or state-shape changes.
