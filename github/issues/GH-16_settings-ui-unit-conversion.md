# BUG: Settings UI skips unit conversion — stores whatever number the user typed, regardless of unit system

## Summary

`renderFarmSection` in `src/features/settings/index.js` (lines 97–172) renders every numeric farm-setting field as a raw `<input type="number">` that (a) displays the stored metric value with no conversion and (b) saves whatever the user typed back with no conversion. Labels do not include a unit suffix, so the field key `defaultAuWeightKg` reaches the user as just "AU Reference Weight."

**Violates:** CLAUDE.md Known Traps — *"Unit confusion: always store metric, display converted"* and CLAUDE.md §"New UI Fields → Supabase Column Rule" (the v2 equivalent: the column exists, but the UI bypasses the conversion layer, so stored values are silently wrong for imperial users).

**Impact:** An imperial user who opens Settings sees metric numbers (e.g. `454` for AU weight, `10` for residual height), assumes they're wrong because they don't match their mental model, and "corrects" them — writing imperial numbers into metric columns. Every downstream calc that reads those fields (DMI, stocking rate, residual badges, NPK pricing, threshold comparisons) then operates on nonsense values.

**Confirmed incident (2026-04-18):** Tim edited AU weight and residual height from the correct metric defaults to imperial values. Data state now incorrect in his farm_settings row.

## Immediate recovery (before the fix ships)

Tim must manually re-enter the correct **metric** defaults in Settings:

- AU Reference Weight → `454` (kg; the 1000 lbs Animal Unit standard)
- Default Residual Height → `10` (cm; ≈ 4 in)

Any other metric-denominated farm setting Tim touched in that session should be reviewed against the defaults in `src/entities/farm-setting.js` `create()`.

## Scope — every unit-bearing field in `renderFarmSection`

| Field key | Current label | Stored unit | Imperial display | Measure type (for `convert()`) |
|---|---|---|---|---|
| `defaultAuWeightKg` | "AU Reference Weight" | kg | lbs | `weight` |
| `defaultResidualHeightCm` | "Default Residual Height" | cm | in | `length` |
| `defaultManureRateKgPerDay` | "Manure Rate (kg/AU/day)" | kg/AU/day | lbs/AU/day | `weight` (per-day suffix is unit-agnostic) |
| `nPricePerKg` | "N Price (per kg)" | $/kg | $/lb | `weight` — **inverted** (divide stored by factor, not multiply) |
| `pPricePerKg` | "P Price (per kg)" | $/kg | $/lb | `weight` — inverted |
| `kPricePerKg` | "K Price (per kg)" | $/kg | $/lb | `weight` — inverted |
| `baleRingResidueDiameterFt` | "Bale-ring residue diameter (ft)" | **ft (wrong)** | in or ft | `length` — **rename required, see §Bale-ring** |
| `defaultUtilizationPct` | "Default Utilization %" | % | % | unitless — no conversion |
| `defaultRecoveryMinDays` | "Recovery Min Days" | days | days | unitless — no conversion |
| `defaultRecoveryMaxDays` | "Recovery Max Days" | days | days | unitless — no conversion |
| `feedDayGoal` | "Feed Day Goal" | days | days | unitless — no conversion |
| `forageQualityScaleMin` | "Forage Quality Min" | score | score | unitless — no conversion |
| `forageQualityScaleMax` | "Forage Quality Max" | score | score | unitless — no conversion |

Threshold fields in the entity (`thresholdAudTargetPct`, `thresholdNpkWarnPerHa`, `thresholdCostPerDayTarget`, etc.) are not rendered in `renderFarmSection` today but follow the same rules when they surface in a future settings UI: `%` / `/ha` fields convert if the underlying measure type is imperial-sensitive (`/ha` → `/acre`), others are unitless.

## Bale-ring diameter — rename to metric storage

Per Tim's direction: the `baleRingResidueDiameterFt` field violates the metric-internal rule. Rename:

- `baleRingResidueDiameterFt` → `baleRingResidueDiameterCm`
- Supabase column: `bale_ring_residue_diameter_ft` → `bale_ring_residue_diameter_cm`
- Default value: `12.0` ft → `365.76` cm (or round to `366`; pick one and lock it in `create()`)
- Display per user settings: imperial shows in feet (not inches — diameters are intuitive in ft for farmers); metric shows in cm.

### Migration 027

```sql
-- 027_bale_ring_diameter_to_cm.sql
-- Rename bale_ring_residue_diameter_ft to _cm and convert stored values.
-- Part of BUG: Settings UI unit conversion (OI-0111).

ALTER TABLE farm_settings ADD COLUMN IF NOT EXISTS bale_ring_residue_diameter_cm numeric(6,2);

UPDATE farm_settings
  SET bale_ring_residue_diameter_cm = ROUND((bale_ring_residue_diameter_ft * 30.48)::numeric, 2)
  WHERE bale_ring_residue_diameter_ft IS NOT NULL;

ALTER TABLE farm_settings ALTER COLUMN bale_ring_residue_diameter_cm SET DEFAULT 365.76;
ALTER TABLE farm_settings DROP COLUMN bale_ring_residue_diameter_ft;

UPDATE operations SET schema_version = 27;
```

Per CLAUDE.md Migration Execution Rule — **write + run + verify** in the same session.

### Code changes tied to the rename

- `src/entities/farm-setting.js` — rename in `FIELDS`, `create()` (default `365.76`), `toSupabaseShape()`, `fromSupabaseShape()`.
- `src/calcs/survey-bale-ring.js` — calc expects `ringDiameterFt`. Option chosen: **keep the calc in feet; convert cm → ft at the call site.** Callers (`src/features/observations/paddock-card.js:116` and anywhere else reading `farmSettings.baleRingResidueDiameterCm`) convert via `convert(cmValue, 'length', 'toImperial') / 12` (cm → in → ft) before passing into the calc. Rationale: the BRC-1 formula is imperial-native; touching the calc is out of scope for this bug.
- `src/features/observations/paddock-card.js` — update the reference to the new field name + inline conversion.
- `tests/unit/paddock-card.test.js` — update the fixture (`baleRingResidueDiameterFt: 12` → `baleRingResidueDiameterCm: 365.76`).
- `src/data/backup-migrations.js` — add `26: (b) => { ... }` entry that maps old `bale_ring_residue_diameter_ft` → `bale_ring_residue_diameter_cm` (multiplied by 30.48) for imported backups from schema_version ≤ 26, and stamps `b.schema_version = 27`.
- `V2_MIGRATION_PLAN.md §5.3` / §5.3a — no FK changes, but the column rename must be noted alongside the existing `farm_settings` entries per CLAUDE.md commit-check rule 6c.
- `V2_SCHEMA_DESIGN.md §1.3 farm_settings` — rename the column in the doc.
- Any `.md` file that references `bale_ring_residue_diameter_ft` by name (GH-12, observation-boxes-redesign, UI_SPRINT_SPEC.md, OPEN_ITEMS OI-0107 + OI-0110 criteria) — update the name in references.

## Unit-aware input design

### Field descriptor (new)

Extend the `fields` array in `renderFarmSection` so each entry declares its measure type and whether conversion is standard or inverted:

```js
const fields = [
  { key: 'defaultAuWeightKg',         labelKey: 'settings.auWeight',         measureType: 'weight',  unitLabelKey: null },
  { key: 'defaultResidualHeightCm',   labelKey: 'settings.residualHeight',   measureType: 'length',  unitLabelKey: null },
  { key: 'defaultUtilizationPct',     labelKey: 'settings.utilizationPct',   measureType: null,      unitLabelKey: 'unit.pct' },
  { key: 'defaultRecoveryMinDays',    labelKey: 'settings.recoveryMinDays',  measureType: null,      unitLabelKey: 'unit.days' },
  { key: 'defaultRecoveryMaxDays',    labelKey: 'settings.recoveryMaxDays',  measureType: null,      unitLabelKey: 'unit.days' },
  { key: 'nPricePerKg',               labelKey: 'settings.nPrice',           measureType: 'weight',  inverted: true, currency: true },
  { key: 'pPricePerKg',               labelKey: 'settings.pPrice',           measureType: 'weight',  inverted: true, currency: true },
  { key: 'kPricePerKg',               labelKey: 'settings.kPrice',           measureType: 'weight',  inverted: true, currency: true },
  { key: 'defaultManureRateKgPerDay', labelKey: 'settings.manureRate',       measureType: 'weight',  perDay: true },
  { key: 'feedDayGoal',               labelKey: 'settings.feedDayGoal',      measureType: null,      unitLabelKey: 'unit.days' },
  { key: 'forageQualityScaleMin',     labelKey: 'settings.forageQualityMin', measureType: null,      unitLabelKey: null },
  { key: 'forageQualityScaleMax',     labelKey: 'settings.forageQualityMax', measureType: null,      unitLabelKey: null },
  { key: 'baleRingResidueDiameterCm', labelKey: 'settings.baleRingDiameter', measureType: 'length',  displayUnit: 'ft' },  // imperial uses ft, not in
];
```

### Render behavior

For each field, at render time:

1. Read the user's unit system (`getUserPreferences().unitSystem` or the operation-level `unit_system`).
2. If `measureType != null`:
   - If imperial: `displayValue = convert(storedValue, measureType, 'toImperial')`. For `inverted: true` (price-per-weight), invert: `displayValue = storedValue / conversionFactor` (so $/kg stored → $/lb displayed).
   - For `displayUnit: 'ft'` (bale-ring), after cm → in, divide by 12 to get ft (or convert cm → m → ft depending on chosen helper; lock in one path).
   - If metric: `displayValue = storedValue`.
3. The label reads `"{label} ({unit})"` where `{unit}` is `unitLabel(measureType, unitSystem)` or the static `unitLabelKey` translation. For `currency: true` fields: `"{label} ($/{weightUnit})"`. For `perDay: true`: `"{label} ({weightUnit}/AU/day)"`.
4. The `<input>` uses `step` sized for the display unit (see §Precision).

### Save behavior

On save, for each field:

1. Read raw input string. Empty → `null` as today.
2. `parseFloat(val)` → `inputNumber` (in display unit).
3. If `measureType != null` and unitSystem is imperial:
   - Standard: `storedValue = convert(inputNumber, measureType, 'toMetric')`.
   - `inverted: true`: `storedValue = inputNumber * conversionFactor` (so $/lb entered → $/kg stored).
   - `displayUnit: 'ft'`: `storedValue = convert(inputNumber * 12, measureType, 'toMetric')` (ft → in → cm).
4. Else (metric or unitless): `storedValue = inputNumber`.
5. Write `storedValue` into `changes[f.key]` and pass to `update(...)`.

**No truncation/rounding on store.** Store the full JavaScript float from `convert()` so round-trip is lossless at any display precision.

## Precision — round-trip stability rule

**Rule:** For every unit-bearing field, entering a value `X` in the user's display unit, saving, closing, and reopening Settings must show exactly `X` again (to the display precision of that field). No drift across save/load cycles, no drift from storing metric and converting back for display.

### Why this works

`convert(3.0, 'length', 'toMetric')` = `7.620001982...` stored in full JS float. `convert(7.620001982, 'length', 'toImperial')` = `3.00000078...`. With display precision of 1 decimal, this renders as `"3.0"`. The sub-decimal drift is below the display precision, so the user sees their input unchanged.

### Display precision by measure type + unit system

| Measure | Metric decimals | Imperial decimals | `step` attr (imperial) |
|---|---|---|---|
| `weight` (kg / lbs) | 1 | 0 | 1 |
| `weight` as $/kg → $/lb | 4 | 4 | 0.01 |
| `weight` as kg/AU/day → lbs/AU/day | 1 | 0 | 1 |
| `length` (cm / in) | 1 | 1 | 0.1 |
| `length` as ft | — | 1 | 0.1 |
| Unitless (%, days, score) | 0 (integer) | 0 (integer) | 1 |

### Required unit test

`tests/unit/settings-unit-roundtrip.test.js` (new) must cover every unit-bearing field:

```js
// For each field in the fields descriptor:
// - set unitSystem = 'imperial'
// - render settings with a known metric stored value
// - capture displayed input value (call it D1)
// - simulate save without changing the input
// - read stored value
// - re-render
// - capture displayed input value (D2)
// - assert D1 === D2 to the display precision of that field
```

Additional case: user types a specific value (e.g. `3.0` inches), saves, reopens — the input reads `3.0` again.

## Acceptance criteria

- [ ] `renderFarmSection` uses the extended field descriptor with `measureType`, `inverted`, `currency`, `perDay`, `displayUnit`, `unitLabelKey`.
- [ ] On render, each unit-bearing field displays converted to the user's unit system with a unit-suffixed label.
- [ ] On save, each unit-bearing field converts back to metric before calling `update(...)`.
- [ ] Metric storage is never rounded or truncated on save — full JS float preserved.
- [ ] Round-trip test passes for every field: display → save → reload → display equals original input at the field's display precision.
- [ ] `baleRingResidueDiameterFt` renamed to `baleRingResidueDiameterCm` everywhere (entity, calc callers, paddock-card, tests, spec files, settings UI).
- [ ] Migration 027 applied and verified against Supabase (schema check: `SELECT column_name FROM information_schema.columns WHERE table_name = 'farm_settings' AND column_name IN ('bale_ring_residue_diameter_cm', 'bale_ring_residue_diameter_ft')` — should return only `_cm`).
- [ ] `BACKUP_MIGRATIONS[26]` converts old `_ft` backups to `_cm`.
- [ ] `src/calcs/survey-bale-ring.js` untouched; caller in `paddock-card.js` converts cm → ft before invoking the calc.
- [ ] i18n keys added for unit labels: `unit.pct`, `unit.days`, `unit.kgPerDay` (or whatever the design lands on for compound units). English locale populated; other locales optional in this PR.
- [ ] A farmer with `unitSystem = 'imperial'` sees `1000 lbs` / `4 in` for the defaults and typing `1000` / `4` stores `453.592...` kg / `10.16` cm under the hood.
- [ ] A farmer with `unitSystem = 'metric'` sees `454 kg` / `10 cm` for the defaults and behavior is unchanged from today.
- [ ] `npx vitest run` clean.
- [ ] Manual smoke test: switch unit system, open Settings, confirm values reformat correctly without re-saving.

## Files affected

- `src/features/settings/index.js` — rewrite `renderFarmSection` field loop to use the descriptor + conversion helpers.
- `src/entities/farm-setting.js` — rename `baleRingResidueDiameterFt` → `baleRingResidueDiameterCm` throughout; update default `12.0` → `365.76`.
- `src/features/observations/paddock-card.js` — update reference to renamed field + inline cm → ft conversion when calling the BRC-1 calc.
- `src/utils/units.js` — add a `convertInverted()` helper (or extend `convert()` with an `inverted` flag) for price-per-weight fields, if cleaner than doing it inline.
- `src/utils/preferences.js` — confirm the unit-system getter exists and returns `'metric' | 'imperial'` reliably on load.
- `src/i18n/locales/en.json` — add `unit.pct`, `unit.days`, `settings.baleRingDiameter`, and any new `currency: true`/`perDay: true` label composition keys.
- `src/data/backup-migrations.js` — add entry `26` for the ft → cm rename.
- `supabase/migrations/027_bale_ring_diameter_to_cm.sql` — new migration file, write + run + verify.
- `tests/unit/settings-unit-roundtrip.test.js` — new, covers every unit-bearing farm-setting field.
- `tests/unit/paddock-card.test.js` — fixture update (`baleRingResidueDiameterFt: 12` → `baleRingResidueDiameterCm: 365.76`).
- `tests/unit/entities/farm-setting.test.js` (if it exists) — round-trip test name update.
- `V2_SCHEMA_DESIGN.md §1.3` — rename bale-ring column in doc.
- `V2_MIGRATION_PLAN.md §5.3` — rename in farm_settings row.
- Reference-only updates in `OPEN_ITEMS.md` (OI-0107 / OI-0110 acceptance lines), `UI_SPRINT_SPEC.md`, `GH-12_survey-sheet-v1-parity.md`, `observation-boxes-redesign.md` — find/replace `baleRingResidueDiameterFt` → `baleRingResidueDiameterCm` where it appears as code reference.

## CP-55 / CP-56 impact

**Yes.**

- CP-55 export: the `farm_settings` row shape changes — `bale_ring_residue_diameter_ft` is gone, `bale_ring_residue_diameter_cm` is in its place. Serializer picks it up automatically via `toSupabaseShape()`.
- CP-56 import: for backups with `schema_version ≤ 26`, `BACKUP_MIGRATIONS[26]` must rename `bale_ring_residue_diameter_ft` → `bale_ring_residue_diameter_cm` and multiply by `30.48` before handing the row to the entity. Stamp `schema_version = 27`.
- No other column changes. No row shape changes. No new tables. `%`-denominated and day-count fields do not impact backup (the stored value is unchanged — only the rendered display changes).

Confirmed this is the only schema change in this bug.

## Related OIs

- OI-0106 — PostgREST numeric coercion sweep. Farm-setting numerics were coerced there; this bug is orthogonal (the coercion is fine, the UI was wrong).
- OI-0050 — broken store call param counts in onboarding/settings. Same-area bug in the settings file (`renderFarmSection` and `renderPrefSection`), different bug class.
- OI-0053 — migrations committed but never executed. Reinforces the write-+-run-+-verify rule that migration 027 must follow.

## Notes

- **Schema version bump to 27.** Required because the column rename is a data shape change per CLAUDE.md commit-check rule 6.
- **Unit system source of truth:** the user's `unitSystem` preference lives on the `operations` row (per GH-3). Confirm the settings UI reads from there, not from `user_preferences`. If it reads from the wrong source, fix that as part of this PR (or file a follow-up if out of scope — but flag it).
- **Why not just add unit labels without converting?** Because farmers will still type in their native units. Labels alone don't prevent the exact bug Tim hit. Conversion on both render and save is non-negotiable.
- **Why not store in the user's preferred unit?** Because multi-user farms have mixed preferences, and every calc downstream assumes metric. Metric internal / display converted is the spec-level rule; this bug is enforcing it.
- **Currency fields** (`$/kg`): currency symbol is locale-dependent, not unit-system-dependent. Out of scope here — just show `$` for now; follow-up OI can surface locale-aware currency if Tim wants multi-currency support.
