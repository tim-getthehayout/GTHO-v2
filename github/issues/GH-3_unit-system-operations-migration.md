# Unit System — Move from localStorage Workaround to operations.unit_system

## Summary

CP-13 currently stores the metric/imperial toggle in localStorage (`gtho_v2_unit_system`) as a workaround (OI-0002). Tim has decided the unit system belongs at the **operation level** — same rationale as currency (A20). One setting applies across every farm in the operation. Move the value from localStorage to a new `operations.unit_system` column, sync it, and retire the localStorage key.

**Why this matters:** Unit preference is a measurement convention that should not differ between a user's devices or between farms in the same operation. Today a user could set "metric" on their laptop and see "imperial" on their phone — that's confusing and inconsistent with how currency already behaves.

## Design Decision (A44)

**Unit system is operation-wide, not per-user and not per-farm.**

- Mirrors currency (A20): one value applies to every farm owned by the operation
- Mirrors A18's reasoning inverted: settings that are truly farm-specific (NPK prices, recovery defaults) live on `farm_settings`; settings that are truly operation-wide (currency, unit system) live on `operations`
- Storage is always metric (V2_INFRASTRUCTURE.md §1.1) — this column only controls the display layer

## Schema Change

Already documented in V2_SCHEMA_DESIGN.md §1.1. Migration SQL:

```sql
ALTER TABLE operations
  ADD COLUMN unit_system text NOT NULL DEFAULT 'imperial'
    CHECK (unit_system IN ('metric', 'imperial'));
```

Default `'imperial'` matches v1 behavior so migrated operations read unchanged.

## Implementation Work

### 1. Entity update

`src/entities/operation.js`:

- Add `unitSystem` to `FIELDS` (sbColumn: `unit_system`)
- `validate()` — enforce value is `'metric'` or `'imperial'`
- `toSupabaseShape()` / `fromSupabaseShape()` — map the new field
- Add round-trip test covering the new field

### 2. Store update

`src/data/store.js`:

- `store.getOperation()` already returns the operation — no new getter needed
- Add `store.setUnitSystem(value)` action that mutates the operation, persists, queues sync, notifies subscribers (standard pattern)

### 3. units.js consumes from store

`src/utils/units.js`:

- `display()` reads unit preference from `store.getOperation().unitSystem`
- Remove any reference to localStorage key `gtho_v2_unit_system`
- No caching outside the store — every `display()` call consults the store

### 4. Settings screen rewires the toggle

`src/features/settings/index.js`:

- Unit system toggle moves to the operation-level section (alongside currency) if there is one, or gets its own "Display Units" section
- Reads from `store.getOperation().unitSystem`
- On change: calls `store.setUnitSystem(newValue)`
- **Re-render the entire settings screen after change** so every unit-related field updates to the new display (see "Settings fields that must re-render" below)

### 5. **Unit-sensitive settings must re-render when the toggle flips**

When the user switches the unit system, every visible settings field that shows a measurement (weight, area, length, volume, yield rate) must update in place to display the same stored metric value in the new unit.

The store value doesn't change — only the formatting does. But the user needs to see this happen so they understand: "My `default_residual_height_cm = 7.62` (stored) now shows as `3 in` instead of `7.62 cm`."

**Settings fields that must re-render on toggle:**

| Field | Stored Unit | Displays As (Metric) | Displays As (Imperial) |
|-------|-------------|----------------------|------------------------|
| `farm_settings.default_au_weight_kg` | kg | kg | lbs |
| `farm_settings.default_residual_height_cm` | cm | cm | inches |
| `farm_settings.default_utilization_pct` | % | % | % (no change) |
| `farm_settings.n_price_per_kg` | $/kg | $/kg | $/lb |
| `farm_settings.p_price_per_kg` | $/kg | $/kg | $/lb |
| `farm_settings.k_price_per_kg` | $/kg | $/kg | $/lb |
| `farm_settings.default_manure_rate_kg_per_day` | kg/day | kg/day | lbs/day |
| `farm_settings.threshold_npk_warn_per_ha` | per ha | per ha | per acre |
| `animal_classes.dmi_pct` / `dmi_pct_lactating` | % | % | % (no change) |
| `animal_classes.excretion_n/p/k_rate` | kg/1000kg BW/day | kg/1000kg BW/day | lbs/1000lb BW/day |
| `forage_types.dm_kg_per_cm_per_ha` | kg/cm/ha | kg/cm/ha | lbs/inch/acre |
| `forage_types.min_residual_height_cm` | cm | cm | inches |
| `spreaders.capacity_*` | kg, liters, etc. | metric | imperial equivalents |
| `locations.area_hectares` | ha | ha | acres |

**Input fields also respect the setting:** a user editing "Default AU Weight" in imperial mode types `1200` (lbs), the form converts to `544.3` (kg) on save. Editing the same field in metric mode types `544.3` (kg) directly. See V2_INFRASTRUCTURE.md §1.1 for the conversion table.

**Rule of thumb:** If `units.display()` is used to render the value, `units.display()` picks up the change automatically as long as the component re-renders. Ensure every settings section subscribes to store changes and re-renders on unit system change.

### 6. Onboarding picks the initial value

`src/features/onboarding/index.js`:

- Onboarding wizard Step 1 (or wherever operation is created) adds a unit system selector defaulted to `'imperial'` (matches v1 migration default)
- Writes the chosen value to `operations.unit_system` when the record is created

### 7. localStorage migration + cleanup

On app boot, if `localStorage.getItem('gtho_v2_unit_system')` exists:

1. Read the value
2. If the current operation's `unit_system` differs from the stored operation default AND no other user has already set it, write the localStorage value to `operations.unit_system` via `store.setUnitSystem()`
3. Delete the localStorage key

This ensures users who toggled the setting under the workaround don't lose their preference on upgrade.

### 8. Sync

Operation mutations already go through the sync adapter (A10). No new sync wiring needed — just ensure the entity's `toSupabaseShape()` is updated (Step 1).

## Acceptance Criteria

- [ ] Migration SQL applied: `operations.unit_system` column exists with `DEFAULT 'imperial'` and CHECK constraint
- [ ] `src/entities/operation.js` includes `unitSystem` in FIELDS, validate, toSupabaseShape, fromSupabaseShape
- [ ] `store.setUnitSystem(value)` action exists and follows the standard pattern
- [ ] `units.display()` reads from `store.getOperation().unitSystem`
- [ ] Settings screen toggle reads/writes via the store
- [ ] **Flipping the toggle re-renders every unit-sensitive settings field in place** — user sees `7.62 cm` become `3 in` without reload
- [ ] Input fields on settings (e.g., "Default AU Weight") accept values in the current display unit and convert to metric on save
- [ ] Onboarding wizard sets `unit_system` when creating the operation
- [ ] One-time localStorage → operation migration runs on boot; `gtho_v2_unit_system` key is deleted after migration
- [ ] No code path references `localStorage.getItem('gtho_v2_unit_system')` after this change
- [ ] OI-0002 closed in OPEN_ITEMS.md with resolution note pointing to this spec

## Test Plan

- [ ] Round-trip test: `fromSupabaseShape(toSupabaseShape(op))` preserves `unitSystem`
- [ ] Invalid value rejected by `validate()` (e.g., `'metric'` and `'imperial'` pass; `'metric-us'` fails)
- [ ] Unit toggle in Settings changes the display of every field listed in Step 5 without a page reload
- [ ] Editing a settings field (e.g., AU weight) in imperial mode stores the metric equivalent in Supabase
- [ ] Reloading the page preserves the chosen unit system across devices (sync works)
- [ ] Fresh operation from onboarding has `unit_system` set to the user's pick, not the DB default
- [ ] localStorage migration: set `gtho_v2_unit_system = 'metric'` before boot, reload — operation's `unit_system` is now `'metric'` and the localStorage key is gone
- [ ] Backup/restore round-trip preserves `unit_system` on operations

## Related

- **Decision:** A44 (unit system on operations)
- **Replaces:** OI-0002 (localStorage workaround)
- **Reference:** A20 (currency on operations — same rationale), A18 (settings per-farm — this is the exception alongside currency)
- **Schema:** V2_SCHEMA_DESIGN.md §1.1 (operations)
- **Infrastructure:** V2_INFRASTRUCTURE.md §1.3 (Unit System Storage)
- **Migration:** V2_MIGRATION_PLAN.md §2.8 (operations row added)

## Notes

- Consider adding a persisted confirmation toast ("Units changed to imperial — all values now display in lbs/acres/inches") on toggle to reinforce the change
- Future: if the app ever supports multi-unit display (e.g., "Show me metric and imperial side by side"), that would live on `user_preferences` as a separate UI-only setting, not on `operations`. Out of scope for now.
