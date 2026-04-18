# Observation Boxes — Field-Testing Polish Pass (OI-0114)

## Summary

After OI-0112's big-bang migration landed, Tim field-tested the new observation cards on the sub-move Open sheet and flagged three visual/behavioral drift items versus the canonical design in `pre-graze-box-mockup.html`: **(1)** bale-ring auto-fill is inert on the sub-move Open surface, **(2)** the three fields in the top row are not lined up (baselines diverge because the Residual Bale Rings cell has a taller two-line label), **(3)** label font and overall typography do not match the canonical 13px/500 muted style — labels render too large and bold, and the Forage Cover input shows native number spinner arrows. The required pill is also red when the spec says amber.

Every issue traces to the shared renderers in `src/features/observations/_shared.js` or to missing CSS rules for classes the renderers reference (`.obs-compact-input`, `.obs-compact-label`, `.obs-top-row`, `.obs-brc-preview`, `.obs-quality-slider`, `.obs-condition-chip`). Because all six non-survey surfaces use the same shared components, a coordinated fix in `_shared.js` + `main.css` propagates to every surface in one pass.

**Scope:** pre-graze and post-graze cards only. The survey card is out of scope for this pass (Tim: "not survey they look fine").

## Single Source of Truth

- **Canonical visual spec:** `/sessions/happy-dreamy-keller/mnt/App Migration Project/pre-graze-box-mockup.html` — open in a browser to see the target design. Copy the CSS from the mockup's `<style>` block as the basis for the new `.obs-*` rules.
- **Parent spec:** OPEN_ITEMS.md § OI-0112 (observation boxes umbrella) and `github/issues/observation-boxes-redesign.md`.
- **This OI:** OPEN_ITEMS.md § OI-0114.

## Non-Conformance Findings

Seven confirmed items, ordered by visual impact.

### NC-1 — Sub-move Open BRC auto-fill is broken (surface #4)

**File:** `src/features/events/submove.js:65–70`

**Current code:**

```js
// paddockAcres is unknown at render time (location picked in the same sheet);
// BRC auto-fill stays inactive here. Farmer can still enter cover% manually.
const farmSettings = getAll('farmSettings')[0] || null;
const preGraze = renderPreGrazeCard({ farmSettings, paddockAcres: null, initialValues: {} });
```

**Why it's broken:** The card is rendered with `paddockAcres: null` because the farmer hasn't picked a location yet when the sheet opens. In `_shared.js:113`, `brcAvailable = !!(ringDiameterFt && paddockAcres && paddockAcres > 0)` → `false`. The input listener at lines 132–144 is gated by `if (brcAvailable)` and is never attached. So typing a ring count does nothing.

**Fix (root cause, not symptom):** Make the card reactive to location selection. Two equivalent implementations — pick whichever is cleaner:

**Option A — re-render on location pick (simpler):**
After the location picker fires a selection event, tear down and re-render the pre-graze card with the resolved `paddockAcres` from `getById('locations', selection.locationId)?.areaAcres`. Keep form state by reading `preGraze.getValues()` first and passing it as `initialValues` to the new card.

**Option B — make `_shared.js:renderForageStateRow` support a late-binding acres update (more invasive but reusable):**
Return a `setPaddockAcres(newAcres)` method on the state object. Internally, this (re)computes `brcAvailable`, updates the helper-note text, and if acres just went from null → valid, attach the bale-ring input listener. Also retrigger the calc if a ring count is already in the input. This pattern helps any other surface that needs late-bound acres.

**Acceptance:** In the sub-move Open sheet, select a location, then type a ring count. Forage Cover auto-fills; preview chip shows `≈ XX% cover`; helper note flips from "Set the bale-ring diameter in Settings to auto-compute cover." to "Ring diameter {d} ft · paddock {a} ac · auto-computes Forage Cover."

Add a unit test at `tests/unit/features/events/submove.test.js` that (a) renders the sheet with a location selected and asserts that entering a ring count updates the cover input, and (b) renders with no location initially, selects one, then verifies the BRC path activates without requiring a page refresh.

### NC-2 — Top row uses equal-width 3-column grid instead of a narrow-input flex row

**File:** `src/features/observations/_shared.js:146–149`

**Current code:**

```js
const topRow = el('div', {
  className: 'obs-top-row',
  style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginBottom: '6px' },
}, [ ... ]);
```

**Why it looks wrong:** `repeat(3, minmax(0, 1fr))` forces equal 1/3 widths. Each input stretches to fill its cell, and the three labels have different line heights (Bale Rings has a two-line label "(Forage Cover % Calculator)" sub-text), so baselines diverge. The screenshot shows Cover's input slightly lower than Height's, and the Bale Rings input even lower.

**Fix:** Replace the inline grid with a flex row matching the canonical `.top-row` rule from the mockup:

```css
/* main.css */
.obs-top-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;   /* aligns inputs at the bottom, not labels at the top */
  margin-bottom: 10px;
}
.obs-top-row .obs-field {
  margin-bottom: 0;
  flex: 0 0 auto;           /* let each field be its natural width */
}
.obs-top-row input[type="number"] {
  width: 88px;              /* narrow — not stretching to a grid cell */
  padding: 9px 28px 9px 11px;  /* right padding reserves room for the unit suffix */
}
.obs-top-row .obs-field-rings input[type="number"] {
  width: 72px;
  padding: 9px 11px;
}
```

And in `_shared.js`, remove the inline `style` from the top-row div — keep `className: 'obs-top-row'` and add `className: 'obs-field'` (plus `obs-field-rings` on the rings cell) on the three children.

**Acceptance:** On any pre-graze surface, inspect the top row — all three inputs sit at the same baseline. Cover's baseline matches Height's regardless of whether Bale Rings has a two-line label.

### NC-3 — Field labels render too large/bold; missing `.obs-compact-label` CSS

**File:** `src/features/observations/_shared.js:151, 155, 159` (label cells) + `main.css` (missing rule)

**Why it looks wrong:** The renderer emits `<div class="obs-compact-label">Forage Height (in)</div>`. There is no `.obs-compact-label` rule in any CSS file, so the div inherits default `<div>` typography (16px root + whatever the parent sets). The canonical is 13px / font-weight 500 / muted grey.

**Fix:** Add the rule to `main.css` matching the canonical `.field-label`:

```css
.obs-compact-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 500;
  color: var(--text2);
  margin-bottom: 4px;
}
.obs-compact-label .label-aux {
  display: block;
  font-size: 10px;
  font-weight: 400;
  color: var(--text3);
  margin-top: 1px;
}
```

**Related cleanup:** the inline `style={ fontSize: '10px', color: 'var(--text3)', fontWeight: '400' }` on the Bale Rings sub-label (`_shared.js:161`) becomes an `.label-aux` className. Drop the inline style.

**Acceptance:** Labels render at 13px/500 muted grey; the "(Forage Cover % Calculator)" sub-text renders at 10px/400 lighter grey underneath the main label.

### NC-4 — Native number-spinner arrows appear on Cover (and any other number input)

**File:** `src/features/observations/_shared.js:93–105` (and the `.obs-compact-input` missing rule)

**Why it looks wrong:** Input elements get the browser's native spinners unless suppressed. The canonical spec sets `-webkit-appearance: none` on `input[type="number"]` inside the card.

**Fix:** Add the rule to `main.css`:

```css
.obs-compact-input {
  font-family: inherit;
  font-size: 15px;
  padding: 9px 11px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: #fff;
  color: var(--text1);
  -webkit-appearance: none;
  -moz-appearance: textfield;
  appearance: none;
}
.obs-compact-input::-webkit-outer-spin-button,
.obs-compact-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.obs-compact-input:focus {
  outline: none;
  border-color: var(--accent, var(--teal));
  box-shadow: 0 0 0 3px rgba(10, 126, 164, 0.15);
}
```

**Acceptance:** No spinner arrows visible on Height, Cover, Bale Rings, Recovery Min/Max, Residual Height.

### NC-5 — Unit suffix baked into label instead of rendered as an inline suffix inside the input

**File:** `src/features/observations/_shared.js:151, 155` and `_shared.js:310` (residual height)

**Current code:**

```js
el('div', { className: 'obs-compact-label' }, [`${t('event.forageHeight')} (${heightUnit})`]),
// ...
el('div', { className: 'obs-compact-label' }, [`${t('event.forageCover')} (%)`]),
// ...
el('label', { className: 'form-label' }, [`${t('event.residualHeight')} (${heightUnit})`]),
```

**Why it looks wrong:** Unit in parentheses at the end of the label ("Forage Height (in)") visually competes with the field name and makes labels feel crowded — especially at 13px where the "(in)" fragment is easy to miss. Canonical pattern: label is "Forage Height", and the unit ("in") floats inside the input, right-aligned.

**Fix:** Wrap each unit-bearing input in an `.input-suffix` container with an absolutely positioned suffix span:

```js
// Helper in _shared.js
function withSuffix(input, suffixText) {
  return el('div', { className: 'input-suffix' }, [
    input,
    el('span', { className: 'input-suffix-label' }, [suffixText]),
  ]);
}
```

```css
.input-suffix { position: relative; display: inline-block; }
.input-suffix-label {
  position: absolute;
  right: 11px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  color: var(--text3);
  pointer-events: none;
}
```

Apply to Forage Height (suffix = unit), Forage Cover (suffix = "%"), Residual Height (suffix = unit). Recovery min/max stay as-is — they share one trailing "days" unit outside both inputs (already correct).

Drop `(${heightUnit})`, `(%)`, and `(${heightUnit})` from the label text strings. Keep i18n keys `event.forageHeight`, `event.forageCover`, `event.residualHeight` as pure field names.

**Acceptance:** Labels read "Forage Height", "Forage Cover", "Residual Height" (no parens). Unit floats inside each input at the right edge, muted grey, 13px. Input still accepts keyboard entry without the suffix blocking focus.

### NC-6 — Required pill renders red; canonical is amber/warn

**File:** `src/styles/main.css:1208`

**Current rule:**

```css
.obs-required { background: var(--color-red-light, #fde8e8); color: var(--color-red-base); }
```

**Why it looks wrong:** Red reads as "error" — but "Required" is a soft call-to-action, not a validation failure. Canonical spec uses warn/amber.

**Fix:**

```css
.obs-required {
  background: var(--color-amber-light, #fff3e0);
  color: var(--color-amber-dark, #e65100);
}
```

If `--color-amber-light` / `--color-amber-dark` don't exist in the token file, add them alongside the existing amber tokens (`--color-amber-base`) before adding the rule.

**Acceptance:** Required pill in pre-graze card renders amber on an off-white background — distinct from the green optional pill but not alarming.

### NC-7 — Dead `.paddock-card` className on the pre-graze container

**File:** `src/features/observations/pre-graze-card.js:33`

**Current:**

```js
className: 'obs-fields paddock-card obs-pre-graze-card',
```

**Why it's there:** legacy from before OI-0112; `.paddock-card` was the old shared component class. The class has no CSS rule in the repo.

**Fix:** Remove `paddock-card` from the className string. Leave `obs-fields obs-pre-graze-card`. Do the same check on `post-graze-card.js` and `survey-card.js` — drop any legacy classnames with no rule.

**Acceptance:** Grep for `paddock-card` across the repo after the fix — zero results in CSS, zero non-comment hits in source.

## Files Affected

- `src/features/observations/_shared.js` — 9 edits (remove inline grid style, add className-only top-row, wrap inputs with suffix helper, drop inline styles superseded by CSS classes, add `.obs-field`/`.obs-field-rings` classNames)
- `src/features/observations/pre-graze-card.js` — 1 edit (drop `paddock-card` className)
- `src/features/observations/post-graze-card.js` — same check, drop dead classes if present
- `src/features/events/submove.js:65–70` — NC-1 location-aware BRC wiring
- `src/styles/main.css` — add `.obs-top-row`, `.obs-field`, `.obs-field-rings`, `.obs-compact-label`, `.obs-compact-input` (+ spinner reset), `.input-suffix`, `.input-suffix-label`, `.label-aux` rules; change `.obs-required` to amber; keep `.obs-optional` green
- `src/styles/tokens.css` (or wherever color tokens live) — add `--color-amber-light` and `--color-amber-dark` if not already present
- `tests/unit/features/events/submove.test.js` — add NC-1 reactive-BRC tests
- `tests/unit/features/observations/_shared.test.js` — add visual-snapshot / structural assertions on the revised classNames and the new `.input-suffix` wrapping
- Consider a visual regression test (Playwright screenshot on one pre-graze surface) — matches Tim's field-testing method

## Acceptance Criteria (all must pass)

- [ ] NC-1: Sub-move Open BRC auto-fill works after the farmer picks a location — enter a ring count, cover auto-fills, preview chip activates
- [ ] NC-2: Top row has equal baselines across Height · Cover · Residual Bale Rings on every pre-graze surface (#1, #4, #7)
- [ ] NC-3: Labels render at 13px / 500 / muted grey; the Bale Rings sub-label renders at 10px / 400 / lighter grey
- [ ] NC-4: No native number-spinner arrows on any observation input
- [ ] NC-5: Labels no longer contain unit parentheses; units float inside inputs as right-aligned suffix spans on Height, Cover, Residual Height
- [ ] NC-6: Required pill renders amber (on an off-white background); Optional pill stays green
- [ ] NC-7: No `.paddock-card` classname remaining in any observation card source; no dead class in CSS
- [ ] Visual check against `pre-graze-box-mockup.html` — side-by-side, the app's pre-graze and post-graze cards are visually indistinguishable from the mockup on the same screen width (allowing for token-color substitutions)
- [ ] `npx vitest run` — all unit tests pass including new NC-1 regression
- [ ] Grep for inline style attributes on observation renderers — only the few dynamic ones remain (e.g., slider gradient, preview-chip color based on `brcAvailable`); all layout styles live in `main.css`
- [ ] Manual smoke of all six non-survey surfaces (move wizard dest/src, close event, sub-move open/close, event detail pre/post panels) — each one renders correctly with the new styles

## CP-55/CP-56 Spec Impact

**None.** Pure UI/CSS/rendering changes. No schema, no column, no state shape.

## Notes

- Do not edit the survey card in this pass — Tim explicitly excluded it, saying it looks fine. However, if the shared `_shared.js` sub-renderers change (as they will for NC-2, NC-3, NC-4, NC-5), the survey card will automatically pick up the same improvements because it calls the same sub-renderers. That's desired.
- If you find a second drift while implementing (e.g., the Notes textarea `.auth-input` class is wrong for this context) and it wasn't in this list, stop and add it as a new NC item in this doc or flag a follow-up OI. Do not silently extend scope (CLAUDE.md "Fix Root Causes, Not Symptoms").
- CSS tokens: use existing tokens where they exist (`--text1`, `--text2`, `--text3`, `--border`, `--border-strong`, `--radius-sm`, `--radius-md`) rather than re-declaring from the mockup.

## Related OIs

- **OI-0112** — parent umbrella (Observation Boxes Redesign)
- **OI-0114** — this OI (polish pass on OI-0112 implementation)
- **OI-0100** — original shared paddock-card component (superseded by OI-0112)
- **OI-0111** — bale-ring diameter rename (ft → cm); already landed, this spec uses `farmSettings.baleRingResidueDiameterCm`
