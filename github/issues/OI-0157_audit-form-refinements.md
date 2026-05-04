# OI-0157 — Event Audit form refinements (2026-05-04 batch)

**Origin:** OPEN_ITEMS.md OI-0157 — read the full body there for context, related OIs, and Change Log row.

Four sub-items. Ship in this order: **A → C → D → B**. Each sub-item is independently shippable. Don't bundle commits across sub-items — bundle by sub-item so the changelog stays readable.

---

## Sub-item A — Group window header: route weight through `formatAuditValue`

**File:** `src/features/dev-mode/audit.js` (lines 365–378 in the current revision).

**Bug:** the stored / live group-window weight strings are built as raw template literals with hardcoded ` kg` suffix, bypassing the audit page's metric/standard/hybrid toggle.

```js
// Current (broken on Standard / Hybrid mode):
const stored = `stored: ${gw.headCount ?? '—'} head / ${gw.avgWeightKg ?? '—'} kg`;
const live = `live: ${liveHead} head / ${typeof liveAvg === 'number' ? liveAvg.toFixed(2) : '—'} kg`;
```

Tim's repro on Standard:
> Group window: Mixed Calves gw 2b6a0ea3 closed
> 2026-04-24 11:37 → 2026-04-29 14:00
> stored: 28 head / 253.5300428571427 kg
> live: 28 head / 253.53 kg

Should render `559 lb` (or whatever 253.53 kg converts to in the operation's imperial unit) in Standard, and `253.53 kg (559 lb)` with the parenthetical muted in Hybrid.

### Fix

Replace lines 365–378 with a builder that:
1. Imports `formatAuditValue` from `./audit-units.js` (already imported at top of file — check before adding a duplicate).
2. Routes `gw.avgWeightKg` and `liveAvg` through `formatAuditValue(value, 'weight', 2)`.
3. Renders head counts unitless via `formatAuditValue(value, null)`.
4. Handles the hybrid `{ primary, secondary }` return shape exactly like existing audit.js consumers do — see line 617 (`renderFormattedValue(formatAuditValue(kgDm, 'weight'))`) for the reference pattern. Use `renderFormattedValue` if it already handles hybrid, or write a small inline helper that returns `[primary text, secondary span muted]`.

Stored and live lines should each be a `<div>` whose children are: `el('span', {}, ['stored: '])`, `formatAuditValue(headCount, null)`, `el('span', {}, [' head / '])`, `renderFormattedValue(formatAuditValue(weight, 'weight', 2))`. Same shape for live. The drift-badge logic above (`gw.headCount !== liveHead || ...`) stays unchanged — it operates on raw kg numbers, not display strings.

### Acceptance

- [ ] On Standard mode, avg weight renders converted (e.g. `559.04 lb`), not `253.53 kg`.
- [ ] On Hybrid mode, renders `253.53 kg (559.04 lb)` with the parenthetical muted (matches existing renderFormattedValue styling for other unit values in the same file).
- [ ] On Metric mode (default), renders `253.53 kg` — note `253.53` not `253.5300428571427` (the rounding fix is part of routing through `formatAuditValue` which honors the `decimals` param).
- [ ] Head count still renders as a plain integer in all three modes.
- [ ] Existing audit-page unit-toggle tests still pass.
- [ ] Add one test in `tests/unit/dev-mode/audit-units.test.js` (or wherever the group-window header is currently tested) that asserts the stored-line text under each of the three modes.

### Grep contract

After fix:
```bash
grep -nE "head /.+kg`" src/features/dev-mode/audit.js
```
Returns 0 matches. The `head / X kg` literal pattern is gone.

---

## Sub-item B — NPK, fertility, and AU/AUD/ADA calc cards in the audit form

This is the heavy lift. Two parts: **B1** registers three new calcs (closes inline-formula drift), **B2** adds nine resolvers (surfaces cards in the audit). Ship B1 first (it has no audit dependency), then B2.

### B1 — Register `ANI-AU`, `ANI-AUD`, `ANI-ADA`

**File:** `src/calcs/core.js` (extends `ANI-1` / `ANI-2` / `ANI-3` already there).

Today these formulas live inline as `/453.6` expressions in:
- `src/features/dashboard/index.js` line 830 — `auValue = (activeLiveHead * activeLiveAvg) / 453.6`
- `src/features/dashboard/index.js` line 1158 — `auValue = totalWeightKg / 453.6`
- `src/features/dashboard/index.js` line 1162 — `adaPerAc = (auValue * dayCount / totalAcres)`
- `src/features/dashboard/index.js` line 1237 — same `auValue` displayed in §6 Weight line
- `src/features/events/detail.js` line 273 — `auValue = totalWeightKg / 453.6`
- `src/features/events/detail.js` line 311 — same `auValue` rendered in hero token

**Definitions** (lock these formulas in the `formula` field of each `registerCalc` call):

```
ANI-AU  : au = (headCount × avgWeightKg) / 453.6
          source: 1 AU = 1000 lb base cow = 453.6 kg
ANI-AUD : auds = au × days
          source: standard livestock accounting
ANI-ADA : adaPerAc = auds / areaAcres
          source: standard pasture accounting (animal-days per acre)
```

Use the existing `registerCalc` pattern (see `ANI-1` / `ANI-2` / `ANI-3` for shape). Each must include `name`, `category: 'animal'`, `description`, `formula`, `source`, `inputs[]`, `output`, `fn`, `example`. Add unit tests in `tests/unit/calcs/core.test.js` mirroring existing ANI tests.

Then replace each inline call site with the registry call:

```js
import { getCalcByName } from '../../utils/calc-registry.js';
const auValue = getCalcByName('ANI-AU').fn({ headCount: totalHead, avgWeightKg: totalWeightKg / Math.max(totalHead, 1) });
// or pass total weight directly via a slightly different shape — pick one and use it everywhere.
```

Decide the input shape at spec lock-in. Cowork's lean: `ANI-AU` takes `{ headCount, avgWeightKg }` (matches DMI-2). If you'd rather take `{ totalWeightKg }` (since most callsites have it precomputed), document the choice in the registry's `inputs` block and stay consistent across all three new calcs.

#### B1 acceptance

- [ ] `getAllCalcs()` returns three new entries.
- [ ] Three new tests in `tests/unit/calcs/core.test.js`, each asserting the example fixture.
- [ ] **Grep contract** (must return 0 after B1):
  ```bash
  grep -rnE "/ ?453\.6" src/features/
  ```
- [ ] One round-trip test: instantiate each calc via `getCalcByName(...)`, confirm `fn(inputs)` matches the inline value the call site produced before refactor.

### B2 — Nine new resolvers in `audit-resolvers.js`

**File:** `src/features/dev-mode/audit-resolvers.js`.

Today the dispatcher has 4 entries (`DMI-2` / `DMI-3` / `DMI-8` / `FOR-1`). Add 9:

| Calc | Scope | Notes |
|------|-------|-------|
| `NPK-1` | `group-window` | Per open group window. Inputs: `headCount`, `avgWeightKg`, `days` (days in window so far), `excretionNRate` / `PRate` / `KRate` from animal class. Mirror DMI-2's group-window iteration. |
| `NPK-2` | `event` | Sums NPK-1 outputs across overlapping group windows × current $ prices. Inputs: `nKg`, `pKg`, `kKg` (from NPK-1 sums), `nPricePerKg`, `pPricePerKg`, `kPricePerKg` (from `npk_price_history` most-recent row). |
| `NPK-3` | `paddock-window` | Per open paddock window. Area-weighted distribution of total event NPK across paddocks. Inputs: `windows[{durationHours, areaHectares, areaPct}]`, `totalNKg`, `totalPKg`, `totalKKg`. |
| `NPK-4` | `event` | Sums external amendments applied during the event window. Source: pull `amendments` records (or whatever the entity is named — grep `amendments` in `src/entities/`) joined to event window via `appliedAt` between `getEventStartDate(eventId)` and `event.dateOut ?? today`. |
| `CST-3` | `event` | Fertility cost rollup. Inputs: same as NPK-2 (mass × price). |
| `REC-1` | `paddock-window` | Per closed paddock window. Inputs: `observedAt` = `pw.dateClosed`, `recoveryMinDays` / `recoveryMaxDays` from forage type. Output: `{ readyDate, latestDate }` so the audit can show recovery window. |
| `ANI-AU` | `group-window` | Per open group window. Inputs: `headCount`, `avgWeightKg`. Mirror DMI-2's iteration. |
| `ANI-AUD` | `group-window` | Per open group window. Inputs: `au` (from ANI-AU), `days` (days in window so far via `daysBetweenInclusive(gw.dateJoined ?? eventStart, today)`). |
| `ANI-ADA` | `paddock-window` | Per open paddock window. Inputs: `auds` (sum of ANI-AUD across overlapping group windows), `areaAcres` (`pw.areaPct/100 × loc.areaHectares × 2.47105`). |

Each resolver follows the exact pattern in `audit-resolvers.js` for `resolveDMI2` / `resolveFOR1`:

1. `const calc = getCalcByName('NPK-1'); if (!calc) return null;`
2. Pull inputs from the store via `getAll(...)`, `getById(...)`.
3. Filter to the relevant window set (open group windows for group-window scope; open paddock windows for paddock-window scope; once for event scope).
4. For each window (or once for event scope), build `inputs` array using the `input(name, value, source, measureType, missing)` helper.
5. Call `calc.fn(...)` inside try/catch; set `gateStatus` on failure.
6. Return `{ name, applicable, instances }` or `{ name, applicable: false, reason }`.

Update the `RESOLVERS` dispatcher table at the bottom of the file to include all 9 new entries with their scopes.

#### Resolved decisions for B2 (locked 2026-05-04 — implement these as written)

- **Q1 ✓ Animal class excretion rate field names.** Pull from `animal_classes.excretion_n_rate` / `excretion_p_rate` / `excretion_k_rate` (Supabase) — entity fields are `excretionNRate` / `excretionPRate` / `excretionKRate` (`src/entities/animal-class.js:12-14`). Type: nullable numeric, unit `kg/1000kg BW/day`. Resolver pseudocode:
  ```js
  const cls = animalClasses.find(c => c.id === gw.animalClassId);
  const NRC_DEFAULTS = { n: 0.145, p: 0.041, k: 0.136 }; // matches NPK-1 example block
  const nRate = cls?.excretionNRate ?? NRC_DEFAULTS.n;
  const nMissing = cls?.excretionNRate == null;
  inputs.push(input('excretionNRate', nRate, nMissing ? 'fallback (NRC beef defaults)' : `animalClasses.${cls.id}.excretionNRate`, null, nMissing));
  // repeat for P and K
  ```
  Missing inputs render red in the card (existing pattern in `audit-resolvers.js`). Don't gate the resolver — it's still applicable, just with a documented fallback.

- **Q2 ✓ `npk_price_history` fallback.** Implement the lookup documented in NPK-2's `notes` field (`src/calcs/advanced.js:12`): "latest `npk_price_history.effective_date ≤ event_date` for the farm. Falls back to earliest available row if no history before event date." When the table is **completely empty for the farm**, return `{ name, applicable: false, reason: 'Set NPK prices in Settings → NPK Prices to enable.' }`. Apply the same gating to CST-3. Onboarding does NOT seed defaults (verified — no `npkPriceHistory` inserts in `src/features/onboarding/`), so the empty-state path is the common case for new ops; the existing "Add NPK price" flow at `src/features/amendments/npk-prices.js` is the actionable fix from Settings.

- **Q3 ✓ ANI-ADA divisor unit.** Locked: `areaAcres`. Resolver converts hectares → acres before calling `calc.fn`:
  ```js
  const areaHectares = (loc.areaHectares ?? 0) * (pw.areaPct ?? 100) / 100;
  const areaAcres = areaHectares * 2.47105;
  // then: calc.fn({ auds: totalAuds, areaAcres })
  ```
  Matches the inline formula at `src/features/dashboard/index.js:1158-1162` and the user-facing "AU/ac" label.

#### B2 acceptance

- [ ] `RESOLVERS` table has 13 entries.
- [ ] `getResolverNames()` returns 13 names.
- [ ] Each new resolver has at least one applicability-true unit test and one applicability-false unit test in `tests/unit/dev-mode/audit-resolvers.test.js`.
- [ ] Audit page on a healthy event with a populated cow-calf herd renders 9 new calc cards (group-window cards inside their respective group-window sub-blocks; paddock-window cards inside their respective paddock-window blocks; event cards in Section 5).
- [ ] All cards honor the metric/standard/hybrid toggle via `formatAuditValue`.
- [ ] Inapplicable cards render the `reason` string in italic muted text (existing pattern in `renderEventCalcCards`).
- [ ] No regression on existing DMI-2 / DMI-3 / DMI-8 / FOR-1 tests.

---

## Sub-item C — Dev-mode dashboard cards show full event UUID

**File:** `src/features/dashboard/index.js`.

Two insertion points (verify via grep before editing — line numbers below are approximate to the current revision):

1. **Open-event card §3 action button row** — around line 1213–1225. Add a new line below the Edit + Move buttons.
2. **Closed-event "Recent groups" card action row** — around line 920. Same treatment for parity.

### Spec

```js
import { isCurrentUserDev } from '../../data/store.js';

// Inside the card builder, after the Edit + Move button row:
isCurrentUserDev(operationId) ? el('div', {
  'data-testid': `dashboard-dev-event-id-${event.id}`,
  style: {
    fontSize: '10px',
    fontFamily: 'monospace',
    color: 'var(--text2)',
    marginTop: '2px',
    userSelect: 'text',
  },
}, [event.id]) : null
```

The `userSelect: 'text'` is important — the surrounding card sets `user-select: none` in some places (verify before shipping). Tim's workflow is double-click → Cmd+C → paste into the audit URL.

### Acceptance

- [ ] When `isCurrentUserDev(operationId)` is true, every dashboard event card shows the full event UUID below the Edit/Move row in monospace 10px muted text.
- [ ] When `isCurrentUserDev(operationId)` is false (i.e. non-dev user), no event ID line renders.
- [ ] The event ID is text-selectable. Manual test: double-click selects the whole UUID, Cmd+C copies, paste matches the original.
- [ ] Test in `tests/unit/dashboard/` (or wherever dashboard unit tests live): render the dashboard with the user-as-dev fixture and assert `dashboard-dev-event-id-<uuid>` is present; render with the user-as-non-dev fixture and assert it's absent.
- [ ] No regression on existing dashboard tests.

---

## Sub-item D — Search bar next to audit page event picker

**File:** `src/features/dev-mode/audit.js` (lines 88–137 — the `navRow` block).

### Spec

Add a text input immediately to the right of the event picker `<select>` in the same flex container. Live-filters which `<option>` elements are present (or visible) based on the query.

```js
const searchInput = el('input', {
  type: 'text',
  'data-testid': 'dev-audit-event-search',
  placeholder: 'Search events…',
  style: {
    width: '200px',
    fontSize: '11px',
    padding: '4px 6px',
    border: '0.5px solid var(--border2)',
    borderRadius: '4px',
    background: 'var(--bg)',
    fontFamily: 'inherit',
    color: 'var(--text)',
  },
  value: sessionStorage.getItem('dev-audit-event-search') || '',
});
```

#### Filter logic

For each event, build a haystack string:

```js
function buildHaystack(evt) {
  const start = getEventStartDate(evt.id) || '';
  const farm = getById('farms', evt.farmId);
  const pwLocs = getAll('eventPaddockWindows')
    .filter(pw => pw.eventId === evt.id)
    .map(pw => getById('locations', pw.locationId)?.name)
    .filter(Boolean);
  return [evt.id, start, evt.type, farm?.name, ...pwLocs].filter(Boolean).join(' ').toLowerCase();
}
```

Filter `<option>` visibility on each `input` event: case-insensitive substring match against the haystack. Hide non-matching options via `style.display = 'none'`.

Persist the query in `sessionStorage` on each keystroke. Restore on render. (Don't use `localStorage` — that's reserved for the unit-mode toggle which should persist across tabs; search query is per-tab.)

On `keydown` for `Enter` with exactly one matching option, call `navigate('#/dev/audit?id=<that-event-id>')`.

### Acceptance

- [ ] Typing in the search box filters the dropdown options live (case-insensitive substring match against id / start date / type / farm name / location names).
- [ ] Pasting an 8-char prefix from a dashboard card's event-id stamp (sub-item C) leaves exactly one option visible.
- [ ] Pressing Enter with exactly one option visible navigates to that event.
- [ ] Search query persists across page navigations within the tab via `sessionStorage`.
- [ ] Search query is empty after closing and reopening the tab.
- [ ] Test in `tests/unit/dev-mode/audit-*.test.js` (existing audit unit tests): seed 5 events, render audit header, type a 4-char prefix that matches 1 event, assert only that option is visible.

---

## Implementation order (recap)

1. **A** — 5-line fix, ship first.
2. **C** — small UI addition, isolated file, ship second; unblocks Tim's cross-tab workflow.
3. **D** — small UI addition, isolated file, ship third.
4. **B1** — three registry entries + replace 6 inline call sites.
5. **B2** — nine new resolvers; cards surface in audit automatically.

Each sub-item gets its own commit. Each commit message references `OI-0157` and the sub-item letter (e.g. `OI-0157-A: route group-window header weight through formatAuditValue`).

After the last sub-item ships, flip OI-0157 status to closed in `OPEN_ITEMS.md` per the orphan-flip rule (commit-msg hook will enforce this).

## CP-55/CP-56 spec impact

NONE. AU/AUD/ADA are derived-on-read; no Supabase column added.

## Schema impact

NONE.
