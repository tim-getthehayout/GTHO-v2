# SESSION BRIEF — Field Mode: Expanded Event Card = Full Location Card

**Date:** 2026-04-17
**Context:** SP-8 field mode — expanded event cards show minimal text instead of the full location card
**Read first:** `UI_SPRINT_SPEC.md` § SP-3 (location card spec), `github/issues/field-mode-v1-parity.md` Part 7

---

## Problem

When an event card in field mode's Active Events section is expanded, it shows a lightweight text-only detail section: date in, cost, per-group head/weight lines, feed check count, and a Move all button. V1 shows the **full location card** — the same card as the dashboard Locations tab — wrapped in a teal border.

The current expanded view is also buggy:
- **Cost shows $0** for events that clearly have feed cost (v1 shows $211.50)
- **All groups show the same avg weight** (1,116 lbs for all three) — likely reading the wrong field or a shared value instead of per-group weights

## Fix

Replace the custom expanded detail section (lines 518–563 of `src/features/field-mode/index.js`) with the dashboard's `buildLocationCard()` function, wrapped in a teal border container with a collapse handle.

### Step 1: Export `buildLocationCard` from the dashboard

In `src/features/dashboard/index.js`, line 876:

**Current:** `function buildLocationCard(event, operationId, farmId, unitSys)`
**Change to:** `export function buildLocationCard(event, operationId, farmId, unitSys)`

### Step 2: Import and use in field mode

In `src/features/field-mode/index.js`:

```javascript
import { buildLocationCard } from '../dashboard/index.js';
```

### Step 3: Replace the expanded section

Replace the current expanded detail block (lines 518–563) with:

```javascript
// Expanded: full location card from dashboard
if (isExpanded) {
  const locationCard = buildLocationCard(evt, opId, farmId, unitSys);
  // Remove the card's own border-left since the teal wrapper provides the visual frame
  locationCard.style.borderLeft = 'none';
  locationCard.style.border = 'none';
  locationCard.style.borderRadius = '0';
  locationCard.style.boxShadow = 'none';

  const detail = el('div', {
    style: { borderTop: '0.5px solid var(--border)' },
  }, [locationCard]);
  card.appendChild(detail);
}
```

The teal border comes from the parent card wrapper (line 496: `border: isExpanded ? '1.5px solid var(--teal)' : ...`). The full location card renders inside it with its own border/styling stripped so it integrates cleanly.

### Step 4: Add collapse handle

The v1 pattern puts a `⌃` collapse handle in the top-right of the expanded card. This is already handled by the collapsed row's chevron changing from `›` to `▾` (line 514), which serves the same purpose — tapping the collapsed row header collapses it. No additional handle needed.

### Step 5: Verify button behavior inside expanded card

The full location card includes Move, Feed, Feed check, and Edit buttons. These should all work from field mode since:
- Move buttons call `openMoveWizard()` (already imported in field-mode)
- Feed/Feed check buttons call `openDeliverFeedSheet()` / `openFeedCheckSheet()` (already imported)
- Edit button calls `openEventDetailSheet()` — verify this import exists or add it

**Important:** After any action from an expanded card's buttons (feed, move, edit), the field mode home should re-render to reflect changes. The existing store subscriptions in `renderFieldModeHome()` (lines 72–75) should handle this since they subscribe to events, eventPaddockWindows, eventGroupWindows, and todos.

## Bugs Fixed By This Change

Both bugs in the current expanded view are eliminated because `buildLocationCard()` already handles these correctly:

1. **$0 cost** — the current field mode code calculates cost from `fe.quantity * batch.costPerUnit` but doesn't handle unit conversions or the batch cost model correctly. `buildLocationCard` uses the calc engine (CST-1) which handles this properly.

2. **Same avg weight for all groups** — the current code reads `gw.avgWeightKg` from the event group window, but this field may not be populated correctly for all groups. `buildLocationCard` reads group weight through the proper calc chain.

## Acceptance Criteria

- [ ] Tapping an event row expands to show the full location card (same as dashboard Locations tab)
- [ ] Expanded card shows: event type badge, day/date/cost summary, weight/AU, green capacity line, gray DM breakdown, sub-paddocks, groups with Move buttons, DMI chart, Feed/Feed check/Edit buttons, DMI/NPK summary
- [ ] Card is wrapped in teal border (already working)
- [ ] Tapping the collapsed row header collapses the card
- [ ] Only one event expanded at a time (already working)
- [ ] Feed, Feed check, Move, Edit buttons inside the expanded card are functional
- [ ] Cost values match what the dashboard shows (no more $0)
- [ ] Per-group weights are correct (no more identical values)
- [ ] "Move all" button from the old expanded section is removed (the full card has its own move buttons)

## Files Changed

| File | Change |
|------|--------|
| `src/features/dashboard/index.js` | Export `buildLocationCard` (add `export` keyword) |
| `src/features/field-mode/index.js` | Import `buildLocationCard`, replace lines 518–563 with card render |

## No Schema Impact

Visual/rendering only. No CP-55/CP-56 impact.
