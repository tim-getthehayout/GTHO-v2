# Dairy milk tracking (#449): Build brief

Issue: https://git.sarnford.com/Homelab/GTHO-v2/issues/449
Status: **LOCKED picks** (Tim card t1519s5955, Nov 24, 8:32 AM ET). Resumed Nov 25, 8:10 AM ET (Tim t1642u, via Orchestrator), Batch 3 item 1. Restacked onto main `0917c4a` (schema ceiling 50). **Open: Tim questions D-G and D-T (below). Build-ready once those are answered.**
Migration slot: **053** (Design slot map: 050 OI-0251 applied, 051 #388, 052 #437, 053 #449). Highest migration on main: `050_farm_settings_include_archived_locations_in_metrics.sql`.

## Goal
When a farm has dairy cattle, record where the milk goes: **processor pickups** and **milk fed to calves**. Show both next to the grazing that produced the milk.

## Tim's locked picks (t1519s5955)
- "Milk shows: with dairy cattle, plus a Settings switch".
- "Gallons to lb: 8.6, editable".
- "Calf feeding: with optional calf group".
- "Offset default: 1 day".
- Demo farm (#450) is on hold ("Demo farm: not now", t1521s5964). **#449 doesn't depend on #450.** #450 step 5 (sample milk rows) waits for #449.

## Verified against main 0917c4a (read-only)
- Species is on `animal_classes.species` (`beef_cattle|dairy_cattle|sheep|goat|other`), and role is `animal_classes.role` (onboarding seeds dairy roles cow/heifer/bull/steer/calf). Animals link to a class through `animals.class_id`. An animal is active when `animals.active` is true.
- `farm_settings` has one row per farm (`farm_id UNIQUE`). New columns follow the 047–050 pattern: additive typed columns, and the entity writes them only when `RELEASED_SCHEMA_VERSION >= 53`, otherwise reads null as the default.
- `groups` has no `farm_id` (dropped in 032). A group's farm comes from its open `event_group_windows` → `events.farm_id`.
- Grazing comes from `event_paddock_windows` (location_id, date_opened, date_closed) joined to `event_group_windows` (group_id, date_joined, date_left) on event_id.
- Storage is metric (AGENTS.md "Metric internally"). `units-core` already has `weight` (kg↔lb) and `volume` (L↔gal). Derived values are computed on read (AGENTS.md "Compute on Read").
- Deletes are hard deletes through the store and sync (`op: 'delete'`). No app table uses `deleted_at` soft delete (only `offline_voice_notes`). **Changed from the PROPOSED draft: no soft delete. Delete is a confirmed hard delete, like weights and treatments.**
- Phone tiles are the field-mode quick actions (`FIELD_MODULES`, `user_preferences.field_mode_quick_actions text[]`). The desktop menu is `src/ui/header.js` `sidebarNavItem`, and routes are in `src/main.js`.

## Migration 053 (written only, NOT applied until a verified backup plus Tim's separate yes)
File: `supabase/migrations/053_dairy_milk.sql`. Use `BEGIN; … COMMIT;`, the 045 table and RLS pattern, and the 047–050 farm_settings pattern.

```sql
CREATE TABLE public.milk_pickups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES public.operations(id),
  farm_id       uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  picked_up_at  timestamptz NOT NULL,
  weight_kg     numeric NOT NULL CHECK (weight_kg > 0 AND weight_kg < 'Infinity'::numeric),
  driver        text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_milk_pickups_op_time ON public.milk_pickups (operation_id, picked_up_at DESC);
CREATE INDEX idx_milk_pickups_farm ON public.milk_pickups (farm_id);

CREATE TABLE public.calf_milk_feedings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES public.operations(id),
  farm_id         uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  fed_at          timestamptz NOT NULL,
  volume_l        numeric NOT NULL CHECK (volume_l > 0 AND volume_l < 'Infinity'::numeric),
  kg_per_l_snapshot numeric NOT NULL CHECK (kg_per_l_snapshot > 0 AND kg_per_l_snapshot < 'Infinity'::numeric),
  group_id        uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_calf_milk_feedings_op_time ON public.calf_milk_feedings (operation_id, fed_at DESC);
CREATE INDEX idx_calf_milk_feedings_farm ON public.calf_milk_feedings (farm_id);
CREATE INDEX idx_calf_milk_feedings_group ON public.calf_milk_feedings (group_id);

-- RLS: copy the 045 four-policy block verbatim for each table
-- (select/insert/update/delete TO authenticated, operation_id IN accepted operation_members).

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS dairy_mode text NOT NULL DEFAULT 'auto' CHECK (dairy_mode IN ('auto','on','off')),
  ADD COLUMN IF NOT EXISTS milk_kg_per_l numeric NOT NULL DEFAULT 1.0305073 CHECK (milk_kg_per_l > 0 AND milk_kg_per_l < 'Infinity'::numeric),
  ADD COLUMN IF NOT EXISTS milk_grazing_offset_days integer NOT NULL DEFAULT 1 CHECK (milk_grazing_offset_days BETWEEN 0 AND 14);

UPDATE public.operations SET schema_version = 53 WHERE schema_version < 53;
```
- Calf milk weight is **derived**: `volume_l × kg_per_l_snapshot`. It isn't stored, so it can't drift. The snapshot keeps old records correct after the factor changes.
- 1.0305073 kg/L equals 8.6 lb/gal (8.6 × 0.45359237 / 3.785411784), so the display rounds back to 8.60. Settings shows "lb per gallon" in imperial and "kg per L" in metric. Add a `milkDensity` display family (kg/L ↔ lb/gal, factor 8.345404) to `units-core`.
- **Contiguity gate (apply order):** `schema_version` and the CP-56 chain step one version at a time. **053 must not be applied before 051 (#388) and 052 (#437).** If #449 is ready to apply first, Design re-stamps it to the next free number (051) before apply, and #388/#437 shift. Orchestrator confirms the order at the land card. No 051 or 052 file exists on any branch today.

## App changes (Build PR, one PR)
- **Entities:** `src/entities/milk-pickup.js` and `calf-milk-feeding.js` (FIELDS/create/validate/toSupabaseShape/fromSupabaseShape, `Number()` numerics per OI-0106). Validate weight/volume > 0, a valid timestamp, and operationId/farmId required. `farm-setting.js` adds `dairyMode`, `milkKgPerL`, `milkGrazingOffsetDays`, gated at 53 like `includeArchivedLocationsInMetrics`.
- **Store/sync:** `store.js` keys `milkPickups`, `calfMilkFeedings`. `sync-registry.js` entries. Pull skips them while the ceiling is below 53 (the existing `isTableReleased`).
- **Schema release:** `STAGED_TABLES[53] = ['milk_pickups','calf_milk_feedings']`, `STAGED_COLUMNS[53] = { farm_settings: ['dairy_mode','milk_kg_per_l','milk_grazing_offset_days'], milk_pickups: ['operation_id','farm_id','picked_up_at','weight_kg'], calf_milk_feedings: ['operation_id','farm_id','fed_at','volume_l','kg_per_l_snapshot'] }`. The ceiling moves to 53 in a separate release PR **after** the verified apply (the OI-0251 pattern, PR #470).
- **CP-55/CP-56 spec impact:** export both tables (paginate true). Import reads them. `BACKUP_MIGRATIONS[52→53]` defaults the missing tables to `[]` and fills the farm_settings defaults (auto / 1.0305073 / 1). Update **V2_MIGRATION_PLAN §5.3a**: both tables come after `farms`, `groups` and `operations`. Add a V2_SCHEMA_DESIGN entry.
- **Visibility (`isDairyVisible(farmId)`):** the farm's `dairy_mode` 'on' means shown and 'off' means hidden. 'auto' means shown when the operation has any active animal whose class species is `dairy_cattle`. In the "All farms" view, Milk shows if any farm resolves to shown. Everything stays hidden while the ceiling is below 53.
- **Desktop Milk view:** route `#/milk` and a sidebar item "Milk" after Feed, shown only when visible.
  - Filter: Pickups / Calves / All, with a date range defaulting to the last 14 days. Rows are newest first with their real date and time.
  - All adds a total row per the **D-T** answer.
  - Paddock column on the right uses the same vertical time axis, newest at the top. Grazing for the **D-G** groups is shifted later by `milk_grazing_offset_days` (grazing on day D sits beside milk on D+offset) but labelled with its real dates.
  - The header has an offset stepper (0–14) that saves to farm settings.
  - Rows can be edited, and deleted with a confirm.
- **Phone:** add field-mode modules `milkpickup` ("Record Milk Pickup") and `feedcalves` ("Feed Calves"), offered only when visible. When the user has never customised quick actions, the default list adds both while dairy is visible.
  - Forms default the date and time to now and the farm to the active farm (the farm picker shows only with 2+ farms).
  - Driver is free text with the 5 most recent distinct drivers suggested.
  - Feed Calves takes gallons (L in metric), shows a live lb (kg) preview, and has an optional calf group (non-archived groups).
- **Settings → Farm:** "Dairy features" Auto/On/Off, and "Milk lb per gallon" (> 0).
- **No effect** on DMI, feed, NPK, reports, or the assistant in this release.

## Acceptance tests
1. Entity round trip for both tables (numerics returned as strings become numbers). Validate rejects ≤ 0, a bad timestamp, or a missing farm or operation.
2. Gallons → lb: 10 gal at the default factor shows 86.0 lb. After the factor changes, old records keep their snapshot weight.
3. farm_settings: below 53, the new columns aren't written and read as auto / 8.6 / 1. At 53, they round-trip.
4. Visibility matrix: auto with and without an active dairy_cattle animal (a culled or inactive one doesn't count), on, off, the All-farms view, and ceiling < 53 (hidden).
5. Offset alignment: grazing on Nov 10 with offset 1 sits on the Nov 11 milk row and is labelled Nov 10. Offset 0 and 14 work.
6. Total row per the D-T rule.
7. Backup: a 50-version backup imports with empty milk tables. A 53 export/import keeps the counts the same.
8. Pull/backup skip both tables while the ceiling is below 53.
9. The phone tiles appear only when visible. The default quick-actions rule works.
10. Manual check: the desktop view, plus both forms on an iPhone.

## Order and gates
Docs (this brief) → Tim answers D-G/D-T → Build PR (code + 053 file, written only) → S1–S8 → **verified prod backup + Tim's separate yes** → apply 053 + verify (information_schema and pg_policies) → merge → release PR (ceiling 53) → publish. One PR open at a time.

## Tim questions (open)
- **D-G: which animals' grazing lines up with the milk?** (A, rec) Automatically, the groups that have dairy cows in them (class species dairy_cattle, role cow), with a group filter in the view header. (B) One "milking herd" group picked in Settings. (C) Every group with any dairy cattle, calves and heifers included.
- **D-T: how to total milk when the truck comes every 2–3 days?** (A, rec) Total per pickup: each pickup plus the calf milk fed since the previous pickup, also shown as lb/day. (B) Total per calendar day, as first drafted. Pickup days show big totals and the days between show only calf milk.

## Out of scope (follow-up)
Per-cow production, milk price or revenue, processor statement import, reports and exports, assistant actions, and any DMI or lactation tie-in.
