# Session Brief — Feed Dialogs V1 Parity + Global Sheet CSS

**Date:** 2026-04-16
**From:** Cowork
**For:** Claude Code
**Spec file:** `github/issues/feed-check-ui-v1-parity.md`
**OI:** OI-0072

---

## Summary

Three changes, in order:

1. **Global sheet CSS fix** — align `.sheet-panel` sizing/positioning to match v1
2. **Feed check sheet rebuild** — `src/features/feed/check.js`
3. **Deliver feed sheet rebuild** — `src/features/feed/delivery.js`

All three are visual/interaction-only. No schema changes, no new entities, no CP-55/CP-56 impact.

---

## CRITICAL INSTRUCTION

The spec file includes **actual v1 HTML templates** under "V1 Reference HTML" sections. **Copy the exact structure, inline styles, and CSS classes from those templates.** Do not simplify, skip elements, or substitute your own styling. Use the DOM builder (`el()`) to produce the same HTML structure with the same inline styles.

This is the most important thing in this session. The reason these specs include raw HTML is that previous attempts to describe the UI in prose resulted in implementations that didn't match v1's look and feel. The HTML templates are the authoritative reference.

---

## Task 1: Global Sheet CSS

**File:** `src/styles/main.css`

Changes:
- `.sheet-wrap.open` → change `align-items: flex-end` to `align-items: center`
- `.sheet-panel` → change padding from `var(--space-6)` to `16px 16px 24px`, change width from `width: 100%; max-width: 480px` to `width: min(92vw, 680px)`, change max-height from `85vh` to `90vh`, remove the `border-radius` bottom-only rounding (use `var(--radius-xl)` all around)
- Remove the desktop media query override `@media (min-width: 900px) { .sheet-panel { max-width: 600px; } }`
- Add desktop sidebar offset: `@media (min-width: 900px) { .sheet-wrap.open { padding-left: 220px; } }`
- Add `.sheet-handle` class: `width: 36px; height: 4px; background: var(--border2); border-radius: 2px; margin: 0 auto 16px;`

Then add a `.sheet-handle` div as the first child of each sheet panel. This is the gray drag indicator bar at the top of v1 sheets.

**Verify:** After this change, all existing sheets should still function. Check that the move wizard, close event, and create survey sheets open and display correctly.

---

## Task 2: Feed Check Sheet Rebuild

**File:** `src/features/feed/check.js`

Full rewrite of `openFeedCheckSheet()`. See spec Part 1 for the complete v1 reference HTML.

Key changes from current implementation:
- Replace plain numeric input with triple-sync controls (stepper + pct input + slider)
- Add "consumed since last check" banner with DMI estimate
- Pre-fill remaining from last check value (query `eventFeedCheckItems` + `eventFeedChecks`)
- Use inline styles from the v1 reference HTML
- Save logic stays the same (FeedCheckEntity.create + store add)

The sync pattern requires four handler functions (`_fcAdj`, `_fcUnitsChanged`, `_fcPctChanged`, `_fcSliderChanged`) and one core update function (`_fcUpdateUI`) with skip flags. See spec for full details.

---

## Task 3: Deliver Feed Sheet Rebuild

**File:** `src/features/feed/delivery.js`

Full rewrite of `openDeliverFeedSheet()`. See spec Part 2 for the complete v1 reference HTML.

Key changes from current implementation:
- Header shows `{location} — Log feeding` with group names + day count
- Batch cards grouped by feed type with radio selection (green border/bg when selected)
- Multi-batch selection supported (toggle on/off)
- Inline quantity stepper appears under selected batch (±0.5 steps)
- Live DMI/cost summary bar at bottom
- CSS classes needed: `.batch-sel`, `.chk`, `.qty-btn`, `.qty-val` — add to main.css if missing
- Save logic stays the same (FeedEntryEntity.create + store add + batch remaining update)

---

## CSS Classes to Add

If not already in `src/styles/main.css`, add these classes (copied from v1):

```css
.batch-sel { display:flex; justify-content:space-between; align-items:center; padding:9px 12px; background:var(--bg2); border-radius:var(--radius); cursor:pointer; border:0.5px solid var(--border); }
.batch-sel.on { border-color:var(--green); background:var(--green-l); }
.chk { width:20px; height:20px; border-radius:50%; border:1.5px solid var(--border2); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.batch-sel.on .chk { background:var(--green); border-color:var(--green); }
.qty-btn { width:32px; height:32px; border:0.5px solid var(--border2); border-radius:var(--radius); background:transparent; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--text); font-family:inherit; flex-shrink:0; }
.qty-val { min-width:40px; text-align:center; font-size:15px; font-weight:600; }
```

Also verify these design tokens exist: `--green-l2`, `--green-d`. If missing, add them based on the v1 values.

---

## OPEN_ITEMS changes

- **OI-0071** → closed (7 UI fixes implemented)
- **OI-0072** → added (feed dialogs v1 parity, this session brief)

---

## i18n Keys to Add

Add to `feed` namespace in `src/i18n/locales/en.json`:

```json
"logFeeding": "Log feeding",
"selectFeedHeading": "Select feed",
"selectFeedHint": "Tap a batch to add it, then set the quantity.",
"feedDMI": "Feed DMI",
"feedCost": "Feed cost",
"saveFeeding": "Save feeding",
"changeEvent": "Change",
"quantity": "Quantity",
"noBatchesOnHand": "No feed batches on hand — add inventory first.",
"feedCheckRemainingPct": "Remaining %",
"feedCheckConsumed": "Consumed since last check",
"feedCheckNoPrior": "No prior check",
"feedCheckSaveBtn": "Save feed check"
```

---

## Verification

After all three tasks:
1. Open the app, navigate to a dashboard card with an active event
2. Tap "Feed check" — verify the triple-sync controls work (slider, stepper, pct all stay in sync)
3. Tap "Feed" — verify batch cards appear with radio buttons, inline stepper on selection, live DMI/cost summary
4. Verify all other sheets (move wizard, close event, etc.) still open at the correct size after the global CSS change
5. Run `npx vitest run` — all tests pass
