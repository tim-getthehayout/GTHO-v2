# OI-0124 Phase 1 — Fix BRC auto-fill on Move All + Event Detail §5 + Edit Paddock Window + Pasture Survey (Location `.areaHa` field-name drift)

**Priority:** P1
**Parent OI:** OI-0124 (see `OPEN_ITEMS.md` — this is Phase 1 of three)
**Related shipped OIs:** OI-0114 (NC-1 on sub-move Open), OI-0075 (dashboard drift fix + fallback pattern), OI-0118 (Edit Paddock Window dialog)
**Labels:** bug, observations, data-integrity, P1

## Summary

OI-0114 NC-1 shipped reactive BRC on the Sub-move Open sheet using the correct `Location.areaHectares` field. The other four pre-graze observation surfaces (Move All wizard, Event Detail §5, Edit Paddock Window, Pasture Survey) read the wrong field name — `loc.areaHa`, which is `undefined` on every Location object — so `paddockAcres` resolves to `null`, `isBrcAvailable()` returns `false`, and the ring-count listener is a no-op.

User-visible symptom: typing a Bale Ring Count on any of those four surfaces does nothing. The helper text stays in its inactive state and the Forage Cover % does not auto-populate.

This Phase 1 scope is limited to the BRC observation-card surfaces. A broader `loc.areaHa` drift sweep (20+ other call sites) is Phase 2; the legacy-fallback cleanup is Phase 3. Both are tracked under OI-0124 and will ship in their own spec files after this one lands.

## Root cause

The `Location` entity (`src/entities/location.js:10`) defines only `areaHectares` (`sbColumn: 'area_hectares'`). There is no `areaHa` field. `fromSupabaseShape` (lines 77–97) returns objects with `areaHectares` — never `areaHa`.

Four surfaces read `loc.areaHa` directly, producing `undefined`:

```js
// Wrong (current):
const paddockAcres = loc?.areaHa != null
  ? convert(loc.areaHa, 'area', 'toImperial')
  : null;
```

One surface (`submove.js:74`) reads the correct field:

```js
// Correct (OI-0114 NC-1 reference pattern):
const acres = loc?.areaHectares != null
  ? convert(loc.areaHectares, 'area', 'toImperial')
  : null;
```

OI-0075 (commit `69cc154`) established a `?? areaHa` legacy fallback pattern for the dashboard's 8 drift sites:

```js
// OI-0075 pattern:
const locHa = l?.areaHectares ?? l?.areaHa;
```

Phase 1 uses this exact pattern for consistency with the existing legacy-safe approach. Phase 3 will retire the fallback once the full sweep confirms no writer produces `.areaHa` on a Location.

## Files to change

### 1. `src/features/events/move-wizard.js:400-402`

The Move All wizard's Step 3 (close-and-move form) destination pre-graze card.

```js
// BEFORE (lines 399-403):
const destLoc = state.locationId ? getById('locations', state.locationId) : null;
const paddockAcres = destLoc?.areaHa != null
  ? convert(destLoc.areaHa, 'area', 'toImperial')
  : null;
preGraze = renderPreGrazeCard({ farmSettings, paddockAcres, initialValues: {} });

// AFTER:
const destLoc = state.locationId ? getById('locations', state.locationId) : null;
const destLocHa = destLoc?.areaHectares ?? destLoc?.areaHa;
const paddockAcres = destLocHa != null
  ? convert(destLocHa, 'area', 'toImperial')
  : null;
preGraze = renderPreGrazeCard({ farmSettings, paddockAcres, initialValues: {} });
```

### 2. `src/features/events/detail.js:527-529`

Event Detail §5 — pre-graze cards rendered on every open paddock window.

```js
// BEFORE (lines 525-529):
for (const pw of openPaddockWindows) {
  const loc = getById('locations', pw.locationId);
  const paddockAcres = loc?.areaHa != null
    ? convert(loc.areaHa, 'area', 'toImperial')
    : null;

// AFTER:
for (const pw of openPaddockWindows) {
  const loc = getById('locations', pw.locationId);
  const locHa = loc?.areaHectares ?? loc?.areaHa;
  const paddockAcres = locHa != null
    ? convert(locHa, 'area', 'toImperial')
    : null;
```

### 3. `src/features/events/edit-paddock-window.js:84-86`

Edit Paddock Window dialog's pre-graze card (OI-0118, open + closed windows).

```js
// BEFORE (lines 82-86):
// OI-0118: pre-graze + post-graze observation cards.
const farmSettings = getAll('farmSettings')[0] || null;
const paddockAcres = loc?.areaHa != null
  ? convert(loc.areaHa, 'area', 'toImperial')
  : null;

// AFTER:
// OI-0118: pre-graze + post-graze observation cards.
// OI-0124 Phase 1: use OI-0075 fallback pattern; Location entity field is areaHectares.
const farmSettings = getAll('farmSettings')[0] || null;
const locHa = loc?.areaHectares ?? loc?.areaHa;
const paddockAcres = locHa != null
  ? convert(locHa, 'area', 'toImperial')
  : null;
```

### 4. `src/features/surveys/index.js:308-310`

Pasture Survey card — pre-graze for the initial location.

```js
// BEFORE (lines 307-310):
const initialLoc = ...;
const paddockAcres = initialLoc?.areaHa != null
  ? convert(initialLoc.areaHa, 'area', 'toImperial')
  : null;

// AFTER:
const initialLoc = ...;
const initialLocHa = initialLoc?.areaHectares ?? initialLoc?.areaHa;
const paddockAcres = initialLocHa != null
  ? convert(initialLocHa, 'area', 'toImperial')
  : null;
```

(Read lines 305–312 before editing — the surrounding `initialLoc` assignment spans a few lines; keep it intact.)

## Tests

Add four new unit cases — one per surface — asserting that `paddockAcres` passed to `renderPreGrazeCard` is non-null (and specifically the imperial-converted value of `areaHectares`) when the Location has `areaHectares` set to a positive number. Preferred: consolidate into one cross-surface file `tests/unit/location-area-field-brc.test.js`. Acceptable alternative: one case each in the existing surface-level test files.

The test does not need to exercise the full BRC calc (already covered by `tests/unit/submove-brc-reactive.test.js` and the calc registry tests). It only needs to prove the prop is wired correctly — i.e. that the `renderPreGrazeCard` call receives a non-null `paddockAcres` given a Location with `areaHectares: 2.5`.

Recommended pattern (mock-based):

```js
// Pseudocode per surface:
test('move-wizard passes non-null paddockAcres to pre-graze card when location has areaHectares', () => {
  const loc = { id: 'loc1', areaHectares: 2.5 /* ~6.18 acres */ };
  // seed store with location + event + ... ;
  // trigger renderStep3 in a jsdom fixture;
  // spy on renderPreGrazeCard and assert receivedProps.paddockAcres ≈ 6.18;
});
```

Existing surface-level tests for move-wizard / detail / edit-paddock-window / surveys may already have fixtures with Locations — extend them rather than rebuilding from scratch.

## Acceptance criteria

- [ ] `src/features/events/move-wizard.js:400-402` uses the `areaHectares ?? areaHa` fallback pattern
- [ ] `src/features/events/detail.js:527-529` uses the fallback pattern
- [ ] `src/features/events/edit-paddock-window.js:84-86` uses the fallback pattern
- [ ] `src/features/surveys/index.js:308-310` uses the fallback pattern
- [ ] Four new unit-test cases (or equivalent) assert `paddockAcres` is non-null when `areaHectares` is set
- [ ] `npx vitest run` clean (suite count goes up by 4 cases)
- [ ] `vite build` clean
- [ ] No `grep -n "\.areaHa\b" src/features/events/move-wizard.js src/features/events/detail.js src/features/events/edit-paddock-window.js src/features/surveys/index.js` matches remain except inside `?? loc?.areaHa` fallback expressions
- [ ] Manual browser smoke on all 4 surfaces (below)

## Manual browser smoke plan

After deploy, on a device where `farm_settings.bale_ring_residue_diameter_cm` is set:

1. **Move All wizard Step 3:** Start a move on an event with animals. Pick a destination farm/location that has acreage set. Advance to Step 3. In the pre-graze card, type a ring count → Forage Cover % auto-populates, helper note flips to "Ring diameter X ft · paddock Y ac."
2. **Event Detail §5 (open window):** Open an active event with at least one open paddock window. Scroll to §5 Paddocks → pre-graze card on the open window. Type a ring count → Cover % auto-populates.
3. **Edit Paddock Window dialog (closed window):** Open an event with a closed sub-move window. Tap the Edit pencil on any window row (§12 sub-move history or §4 paddocks). In the dialog's pre-graze section (OI-0118), type a ring count → Cover % auto-populates.
4. **Pasture Survey card:** Open Field Mode → Pasture Survey → pick a location with acreage → type a ring count in the pre-graze card → Cover % auto-populates.

All four surfaces should behave identically to the Sub-move Open sheet (which has been working since OI-0114 NC-1).

## Out of scope (Phase 2 + Phase 3)

These are **not** part of Phase 1 — they will be filed as follow-up spec files under OI-0124:

- **Phase 2 — drift sweep** (20+ other `loc.areaHa` reads): `detail.js:452`, `field-mode/index.js:183,490`, `locations/index.js:259,287,353,360,417,509,875-876,1290`, `harvest/index.js:201`, `amendments/entry.js:355`, `feed-forage.js:605,614,690`.
- **Phase 3 — legacy-fallback cleanup + Known Trap entry**: once Phase 2 closes, grep-verify no writer creates `.areaHa` on Location, drop the `?? areaHa` fallback across all sites, rename any residual readers to `.areaHectares` directly, add a CLAUDE.md §Known Traps entry.

Do not touch Phase 2 or Phase 3 sites in this commit. Ship Phase 1 clean so the diff stays focused on the user-reported symptom.

## CP-55/CP-56 impact

None. This is a read-path correction — no persisted shape change, no entity field change, no migration. Backup/restore is unaffected.

## Schema change

None.

## Commit message template

```
fix(observations): wire paddockAcres on Move All + Event Detail §5 + Edit Paddock Window + Survey (OI-0124 Phase 1)

Location entity field is areaHectares; four pre-graze surfaces read
loc.areaHa (undefined) and silently disabled BRC auto-fill. Uses the
OI-0075 ?? areaHa legacy fallback pattern for consistency. Fifth surface
(sub-move Open) already correct from OI-0114 NC-1.

Files: move-wizard.js:400-402, detail.js:527-529,
edit-paddock-window.js:84-86, surveys/index.js:308-310.

+4 unit test cases, suite NNNN → NNNN+4.

OI-0124 Phase 1 of 3. Phases 2 (drift sweep) + 3 (fallback cleanup)
tracked in OPEN_ITEMS.md and will ship in separate commits.
```

## After commit

1. Flip OI-0124's status line in `OPEN_ITEMS.md` to `Phase 1 closed — 2026-04-{day}, commit {hash}. Phases 2 + 3 pending.` (per CLAUDE.md §"Orphan-flip belt-and-braces")
2. File this spec as a GitHub issue and rename to `GH-{N}_location-area-field-brc-fix.md` per CLAUDE.md §"Spec File Handoff"
3. Close the GH issue once Phase 1 is merged and smoke-verified: `gh issue close {N} --comment "Phase 1 complete in {hash}; all 4 surfaces verified. Phases 2+3 pending under OI-0124."`
4. Do not close OI-0124 itself — it stays open until Phase 3 ships
