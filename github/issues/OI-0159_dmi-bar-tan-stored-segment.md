# OI-0159 — DMI bar stored-feed segment: tan, not amber

**Status:** Open — ready to build (no DESIGN REQUIRED).
**Owner:** Claude Code.
**Priority:** P2 — visual regression. Bar still readable; stored / deficit segments not distinct at a glance.

---

## Where the spec lives

This file is a **thin pointer**, not a duplicate.

- **Canonical OI body** (motivation, drift narrative, acceptance, grep contracts, change log): `OPEN_ITEMS.md` → `### OI-0159`.
- **Color decision + rationale** (Tan row in §1.1, "Tan vs. Amber — why both exist" paragraph, `--color-tan-*` token block in §5.4): `V2_DESIGN_SYSTEM.md`.
- **DMI chart copy** (status table + prose flipped from "amber stored" → "tan stored"): `V2_UX_FLOWS.md` §17.15.

If anything below conflicts with the canonical sources above, the canonical source wins.

---

## What ships in this commit

Two files, ~5 lines total.

### 1. `src/styles/main.css` — add three token lines

Next to the existing `--color-amber-*` block (around line 9–11 in the `:root` block):

```css
--color-tan-base: #C9A875;
--color-tan-dark: #8C7444;
--color-tan-light: #F2E8D2;
```

### 2. `src/ui/dmi-chart.js` — swap two constants (lines 14–15)

Before:
```js
const COLOR_STORED = 'var(--color-amber-base)';
const COLOR_STORED_STRIPED = 'repeating-linear-gradient(45deg, var(--color-amber-base), var(--color-amber-base) 4px, #E5C76B 4px, #E5C76B 8px)';
```

After:
```js
const COLOR_STORED = 'var(--color-tan-base)';
const COLOR_STORED_STRIPED = 'repeating-linear-gradient(45deg, var(--color-tan-base), var(--color-tan-base) 4px, var(--color-tan-light) 4px, var(--color-tan-light) 8px)';
```

The striped variant's secondary color also moves off the manually-picked `#E5C76B` (an amber-yellow sibling) onto `--color-tan-light` so the diagonal pattern stays in one tonal family.

Nothing else in `dmi-chart.js` changes. The legend swatch (lines ~178–181) already reads from `COLOR_STORED`, so it picks up the new color automatically.

---

## Acceptance

See `OPEN_ITEMS.md` OI-0159 for the full checklist. Summary:

- [ ] Stored segment renders `#C9A875` in the DOM (computed style).
- [ ] Striped variant uses `#C9A875` + `#F2E8D2` — no `#E5C76B`.
- [ ] Legend swatch matches the bar.
- [ ] On a deficit day, three segments (green / tan / red) are clearly distinct.
- [ ] `tests/unit/dmi-chart-context.test.js` and `tests/e2e/dmi-chart.spec.js` still green.

## Grep contracts (run before commit)

```bash
grep -n "var(--color-amber-base)" src/ui/dmi-chart.js   # must return 0 matches
grep -n "#E5C76B" src/ui/dmi-chart.js                    # must return 0 matches
grep -n "color-tan-base" src/styles/main.css             # must return ≥ 1 match
```

## What does NOT change

- No migration. No schema change. No CP-55 / CP-56 spec impact (presentation-layer only).
- Other consumers of `--color-amber-base` (dashboard threshold colors, todo card, observation severity ramp, badges) keep amber — amber is correct for *warning / pending* signals; tan is for *stored feed on data-viz surfaces*. See V2_DESIGN_SYSTEM.md §1.1 "Tan vs. Amber" for the divide.
- No new tests required. The chart contract is unchanged; existing tests cover render + legend wiring. A computed-style assertion against `#C9A875` is welcome but not blocking.

## Suggested commit message

```
OI-0159 — DMI bar stored-feed segment switches from --color-amber-base
to --color-tan-base (#C9A875) per V1 parity. Adds --color-tan-* tokens
to main.css. Doc updates already in V2_DESIGN_SYSTEM.md §1.1 + §5.4 and
V2_UX_FLOWS.md §17.15.
```
