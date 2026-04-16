# SESSION BRIEF — Fix Dashboard Action Buttons (SP-1)

**Date:** 2026-04-15
**Priority:** P0 — buttons are non-functional, blocking all event management from dashboard
**Scope:** Small, targeted fix — 3 button click handlers + 1 export

## Read First

1. `UI_SPRINT_SPEC.md` → SP-1 (full spec with line numbers and function signatures)
2. `github/issues/fix-dashboard-action-buttons.md` (spec file)

## What To Do

Fix the three action buttons on dashboard location cards. They all do `navigate('#/events')` or `navigate('#/surveys')` instead of calling the correct functions.

### Changes (4 files)

**1. `src/features/dashboard/index.js`**

Add imports:
```js
import { openMoveWizard } from '../events/move-wizard.js';
import { openCloseEventSheet } from '../events/close.js';
import { openCreateSurveySheet } from '../surveys/index.js';
```

In `renderLocationsView(gridEl)` — needs `operationId` and `farmId`. Either:
- Pass from `renderDashboard()` (which already has `operations` and `farms`), OR
- Retrieve inside: `const operationId = getAll('operations')[0]?.id; const farmId = getActiveFarmId() || getAll('farms')[0]?.id;`

Replace the button onClick handlers (~lines 852-855):
```js
// BEFORE:
el('button', { className: 'btn btn-teal btn-sm', onClick: () => navigate('#/events') }, [t('dashboard.move')]),
el('button', { className: 'btn btn-outline btn-sm', onClick: () => navigate('#/surveys') }, [t('dashboard.survey')]),
el('button', { className: 'btn btn-outline btn-sm', onClick: () => navigate('#/events') }, [t('action.edit')]),

// AFTER:
el('button', { className: 'btn btn-teal btn-sm', onClick: () => openMoveWizard(event, operationId, farmId) }, [t('dashboard.move')]),
el('button', { className: 'btn btn-outline btn-sm', onClick: () => openCreateSurveySheet(operationId) }, [t('dashboard.survey')]),
el('button', { className: 'btn btn-outline btn-sm', onClick: () => openCloseEventSheet(event, operationId) }, [t('action.edit')]),
```

**2. `src/features/surveys/index.js`**

Export `openCreateSurveySheet`:
```js
// Change from:
function openCreateSurveySheet(operationId) {
// To:
export function openCreateSurveySheet(operationId) {
```

**3. Check groups view too**

The groups view (`renderGroupsView`) likely has the same broken buttons. Check and fix if applicable — same pattern.

### Verify

- Click Move on a location card → move wizard opens for that event
- Click Edit on a location card → close-event sheet opens for that event
- Click Survey on a location card → survey create sheet opens
- Test on multiple cards, not just the first
- Run `npx vitest run` — all tests pass

## OPEN_ITEMS Changes

None — no new open items. This fixes the root cause of existing button issues.

## Notes

- The Edit button calling `openCloseEventSheet` is **interim**. Once the Event Detail View (SP-2) is built, Edit should navigate to `#/events?detail={eventId}` instead.
- `navigate` import can be kept — still used elsewhere in the dashboard.
