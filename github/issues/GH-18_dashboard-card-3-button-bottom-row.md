# Dashboard Location Card — Replace Stacked Feed/Feed Check Buttons with 3-Button Bottom Row (Feed Check · Feed · Sub-Move)

## Summary

Replace the two full-width stacked buttons on the dashboard location card (amber Feed Check + green Feed, introduced in SP-3 / GH-11) with a single row of three equal-width buttons: Feed Check · Feed · Sub-Move. Restores v1's compact small-button style and elevates Sub-Move from a buried teal text link to a primary quick-access action.

## Single Source of Truth

- **OPEN_ITEMS.md OI-0109** — full spec (button table, file/line locations, acceptance criteria, test IDs)
- **UI_SPRINT_SPEC.md § SP-12 Part A** — sprint spec capturing this revision to SP-3

## Implementation Checklist

See OI-0109 for the complete implementation spec. High-level:

1. **`src/features/dashboard/index.js`** — `buildLocationCard()` around lines 1293–1305
   - Replace the two full-width stacked buttons with a 3-up `flex: 1` row (gap 6px, padding 10px 8px, font 13px/600, border-radius 8px)
   - Three buttons: Feed Check (amber outline) · Feed (green outline) · Sub-Move (teal outline)
   - Import `openSubmoveOpenSheet` from `../events/submove.js`
2. **Same file, ~lines 1130–1140** — remove the standalone `+ Add sub-move` teal link that renders above the SUB-PADDOCKS section when no sub-moves exist
3. **Keep** the `+ Add sub-move` link **inside** the SUB-PADDOCKS section (renders when sub-moves exist — Tim's explicit call)
4. **Do not touch** `src/features/events/detail.js` — Event Detail's Sub-move History section stays as-is
5. **`tests/unit/features/dashboard.test.js`** — update existing large-button assertion; add assertions for 3-button row, click handlers, testids

## Button Row Spec

| Position | Label | Color | Handler | Testid |
|---|---|---|---|---|
| 1 | Feed Check | amber outline (`#FDF6EA` bg, amber border, `#8B6914` text) | `openFeedCheckSheet(event, operationId)` | `dashboard-feed-check-btn-{event.id}` (existing) |
| 2 | Feed | green outline (green bg, white text) | `openDeliverFeedSheet(event, operationId)` | `dashboard-feed-btn-{event.id}` (existing) |
| 3 | Sub-Move | teal outline (`btn btn-outline` with teal accent) | `openSubmoveOpenSheet(event, operationId)` | `dashboard-submove-btn-{event.id}` (new) |

Row layout: `display: flex; gap: 6px;`, each button `flex: 1`, `padding: 10px 8px`, `font-size: 13px`, `font-weight: 600`, `border-radius: 8px`. Mirrors v1's `.grp-actions` style already extracted in GH-4.

## Acceptance Criteria

Full list in OI-0109. Summary:

- [ ] Dashboard location card renders a single bottom row with three buttons (Feed Check · Feed · Sub-Move) at equal width
- [ ] New testid `dashboard-submove-btn-{event.id}` added; existing Feed/Feed Check testids preserved
- [ ] `+ Add sub-move` teal link above the SUB-PADDOCKS section is removed
- [ ] `+ Add sub-move` link **inside** the SUB-PADDOCKS section is unchanged
- [ ] Event Detail sheet's Sub-move History `+ Add sub-move` button is unchanged
- [ ] Works on mobile (≤ 720px — row wraps to 2+1 only if absolute width < 240px, otherwise stays 3-up) and desktop
- [ ] `npx vitest run` clean

## CP-55/CP-56 Spec Impact

None — visual/wiring only, no schema or state-shape change.

## Base Doc Impact

This deliberately reverses SP-3's "only two deltas" decision (UI_SPRINT_SPEC.md line 21, 182–184 and GH-11 §13–16). The end-of-sprint reconciliation pass into `V2_UX_FLOWS.md §17.7` must reflect the 3-button row, not the two-large-button design. UI_SPRINT_SPEC.md SP-12 captures this revision.

## Related OIs

- **OI-0109** (this work; full spec in OPEN_ITEMS.md)
- **SP-3 / GH-11** — superseded for the bottom-button section only; all other SP-3 specs (accent bar, header, summary line, capacity, breakdown, sub-paddocks, groups, DMI chart, DMI/NPK summary) stand
- **OI-0100** — shared paddock-card component (related via event-detail quick-access bundle, not this specific card)
