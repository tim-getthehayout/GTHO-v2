# Event Detail Feed Entry — Rename "DMI" Label to "DM", Guard Silent-Zero Path, Support Metric Units

## Summary

The feed-entry row in the Event Detail sheet labels its computed value `{N} lbs DMI`, but the formula (`quantity × weight_per_unit × DM%`) produces **dry matter delivered (DM)**, not **dry matter intake (DMI)**. Rename the label, add a missing-parameter guard so bales with null weight or null DM% show `—` instead of `0`, and add metric unit support.

## Single Source of Truth

- **OPEN_ITEMS.md OI-0108** — full spec (before/after code, i18n keys, unit test list)

## Problem (from OI-0108)

Current code in `src/features/events/detail.js:942–949`:

```js
const dmiKg = (fe.quantity || 0) * (batch?.weightPerUnitKg ?? 0) * ((batch?.dmPct ?? 0) / 100);
const dmiLbs = dmiKg * KG_TO_LBS;
// …
el('div', {}, [`${Math.round(dmiLbs)} lbs DMI`]),
```

Two bugs:

1. **Label is wrong.** The formula produces DM (absolute dry matter delivered in the entry), not DMI (per-head-per-day consumption). Calling it DMI conflates the two concepts.
2. **Silent zero.** If the batch is missing `weightPerUnitKg` or `dmPct` (null or zero), the result is `0 lbs DMI` — indistinguishable from a legitimate zero-quantity entry. Tim saw this during field testing on a real bale delivery.

## Fix — Three Parts

### Part A — Rename the label

Change display from `{N} lbs DMI` → `{N} lbs DM`. Rename local vars `dmiKg`/`dmiLbs` → `dmKg`/`dmLbs`. Add i18n keys:

- `event.feedEntryDm` — English: `"{n} {unit} DM"`
- `event.feedEntryDmMissing` — English: `"Batch is missing weight-per-unit or DM %. Edit the batch in Feed to populate."` (tooltip on the em-dash case)

### Part B — Missing-parameter guard

Show `— lbs DM` (em-dash) when the computation can't produce a real number. A zero is legitimate only when `quantity === 0`:

```js
const weightKg = batch?.weightPerUnitKg;
const dmPct = batch?.dmPct;
const canCompute = weightKg != null && weightKg > 0 && dmPct != null && dmPct > 0;
const dmKg = canCompute ? (fe.quantity || 0) * weightKg * (dmPct / 100) : null;
const dmLbs = dmKg != null ? dmKg * KG_TO_LBS : null;
const dmDisplay = dmLbs != null ? `${Math.round(dmLbs)} lbs DM` : '— lbs DM';
```

Add `title` attribute on the em-dash case using the new i18n key.

### Part C — Metric unit support

Read `operation.unitSystem` and display `lbs DM` (imperial) or `kg DM` (metric) via `unitLabel('mass', unitSys)`. Match the pattern already used in the Event Summary hero line (§2 of GH-10).

## Audit Note (no code change expected)

During implementation, confirm that the Deliver Feed sheet (`openDeliverFeedSheet`) captures `weightPerUnitKg` and `dmPct` on the batch it creates. If the sheet assumes a shared bale weight/DM without per-batch storage, that's a **separate OI** — stop, flag, do not silently extend scope. Per CLAUDE.md "Fix Root Causes, Not Symptoms."

## Files Affected

- `src/features/events/detail.js` lines 942–949 (+ variable renames; add unit switch)
- `src/i18n/locales/en.json` — add `event.feedEntryDm` and `event.feedEntryDmMissing`
- `tests/unit/features/events/detail.test.js` — 5 new tests (see OI-0108)

## Acceptance Criteria

- [ ] Feed-entry row shows `{N} lbs DM` (not `DMI`), rounded to whole lbs
- [ ] Label reads `kg DM` under metric unit system
- [ ] Row shows `— lbs DM` when batch is missing `weightPerUnitKg` or `dmPct`
- [ ] Row still shows `0 lbs DM` when entry `quantity === 0` and batch parameters are populated (legitimate zero)
- [ ] Tooltip on the em-dash case present (text via i18n key)
- [ ] Local variables renamed `dmKg` / `dmLbs` (not `dmiKg` / `dmiLbs`)
- [ ] New i18n keys added to `en.json`
- [ ] 5 new unit tests pass; existing detail tests unchanged in behavior

## CP-55/CP-56 Spec Impact

None — rendering and label only, no schema or state-shape change.

## Related OIs

- **OI-0108** (this work; full spec in OPEN_ITEMS.md)
