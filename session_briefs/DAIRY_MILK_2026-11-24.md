# Dairy milk tracking (#449): Build brief

Issue: https://git.sarnford.com/Homelab/GTHO-v2/issues/449
Status: **LOCKED** (Tim cards **t1519s5955**, Nov 24, 8:32 AM ET, and **t1645s6488**, Nov 25, 8:38 AM ET). Resumed Nov 25 (Tim t1642u), Batch 3 item 1. Based on main `0917c4a` (schema ceiling 50). **Build-ready.**
Migration slot: **051** (Orchestrator order, Nov 25: 051 #449, 052 #388, 053 #437). Highest migration on main: `050_farm_settings_include_archived_locations_in_metrics.sql`.

## Goal
When a farm has dairy cattle, record where the milk goes: **processor pickups** and **milk fed to calves**. Show both next to the grazing that produced the milk.

## Tim's locked picks (t1519s5955)
- "Milk shows: with dairy cattle, plus a Settings switch".
- "Gallons to lb: 8.6, editable".
- "Calf feeding: with optional calf group".
- "Offset default: 1 day".
- Q1 (t1645s6488): "In dairy we will need to be able to designate a group as active milking. So that group (or groups) would be tied to milk." This becomes a per-group **active milking** flag (see D-G).
- Q2 (t1645s6488): "Provide a choice in settings. Break up pick ups by days since last pick up or by pickup." This becomes a farm setting **milk totals mode** (see D-T).
- Demo farm (#450) is on hold ("Demo farm: not now", t1521s5964). **#449 doesn't depend on #450.** #450 step 5 (sample milk rows) waits for #449.

## Verified against main 0917c4a (read-only)
- Species is on `animal_classes.species` (`beef_cattle|dairy_cattle|sheep|goat|other`), and role is `animal_classes.role` (onboarding seeds dairy roles cow/heifer/bull/steer/calf). Animals link to a class through `animals.class_id`. An animal is active when `animals.active` is true.
- `farm_settings` has one row per farm (`farm_id UNIQUE`). New columns follow the 047–050 pattern: additive typed columns, and the entity writes them only when `RELEASED_SCHEMA_VERSION >= 51`, otherwise reads null as the default.
- `groups` (entity `group.js`: id, operation_id, name, color, archived_at, timestamps) is operation-scoped, synced (`sync-registry` `groups`) and backed up (`backup-export` `groups`). Gated new columns use `releasedColumns(version, {...})` in `toSupabaseShape` (the `animals.confirmed_bred_date` / 046 pattern). The edit sheet is `openGroupSheet` in `src/features/animals/index.js`. `groups` has no `farm_id` (dropped in 032). A group's farm comes from its open `event_group_windows` → `events.farm_id`.
- Grazing comes from `event_paddock_windows` (location_id, date_opened, date_closed) joined to `event_group_windows` (group_id, date_joined, date_left) on event_id.
- Storage is metric (AGENTS.md "Metric internally"). `units-core` already has `weight` (kg↔lb) and `volume` (L↔gal). Derived values are computed on read (AGENTS.md "Compute on Read").
- Deletes are hard deletes through the store and sync (`op: 'delete'`). No app table uses `deleted_at` soft delete (only `offline_voice_notes`). **Changed from the PROPOSED draft: no soft delete. Delete is a confirmed hard delete, like weights and treatments.**
- Phone tiles are the field-mode quick actions (`FIELD_MODULES`, `user_preferences.field_mode_quick_actions text[]`). The desktop menu is `src/ui/header.js` `sidebarNavItem`, and routes are in `src/main.js`.

## Migration 051 (written only, NOT applied until a verified backup plus Tim's separate yes)
File: `supabase/migrations/051_dairy_milk.sql`. Use `BEGIN; … COMMIT;`, the 045 table and RLS pattern, and the 047–050 farm_settings pattern.

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
  ADD COLUMN IF NOT EXISTS milk_grazing_offset_days integer NOT NULL DEFAULT 1 CHECK (milk_grazing_offset_days BETWEEN 0 AND 14),
  ADD COLUMN IF NOT EXISTS milk_totals_mode text NOT NULL DEFAULT 'per_pickup' CHECK (milk_totals_mode IN ('per_pickup','spread_daily'));

-- Tim t1645s6488 Q1: per-group active milking flag (one or more groups).
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS is_milking boolean NOT NULL DEFAULT false;

UPDATE public.operations SET schema_version = 51 WHERE schema_version < 51;
```
- Calf milk weight is **derived**: `volume_l × kg_per_l_snapshot`. It isn't stored, so it can't drift. The snapshot keeps old records correct after the factor changes.
- 1.0305073 kg/L equals 8.6 lb/gal (8.6 × 0.45359237 / 3.785411784), so the display rounds back to 8.60. Settings shows "lb per gallon" in imperial and "kg per L" in metric. Add a `milkDensity` display family (kg/L ↔ lb/gal, factor 8.345404) to `units-core`.
- No RLS change on `groups`: its existing policies cover the new column. No backfill: every group starts unflagged.
- **Apply order:** 051 is the next contiguous number after 050. #388 becomes 052 and #437 becomes 053 (Orchestrator, Nov 25).

## App changes (Build PR, one PR)
- **Entities:** `src/entities/milk-pickup.js` and `calf-milk-feeding.js` (FIELDS/create/validate/toSupabaseShape/fromSupabaseShape, `Number()` numerics per OI-0106). Validate weight/volume > 0, a valid timestamp, and operationId/farmId required. `farm-setting.js` adds `dairyMode`, `milkKgPerL`, `milkGrazingOffsetDays`, plus `milkTotalsMode`, gated at 51 like `includeArchivedLocationsInMetrics`. `group.js` adds `isMilking` (`is_milking`): written only via `releasedColumns(51, …)`, and read as false when absent.
- **Store/sync:** `store.js` keys `milkPickups`, `calfMilkFeedings`. `sync-registry.js` entries. Pull skips them while the ceiling is below 51 (the existing `isTableReleased`).
- **Schema release:** `STAGED_TABLES[51] = ['milk_pickups','calf_milk_feedings']`, `STAGED_COLUMNS[51] = { farm_settings: ['dairy_mode','milk_kg_per_l','milk_grazing_offset_days','milk_totals_mode'], groups: ['is_milking'], milk_pickups: ['operation_id','farm_id','picked_up_at','weight_kg'], calf_milk_feedings: ['operation_id','farm_id','fed_at','volume_l','kg_per_l_snapshot'] }`. The ceiling (`RELEASED_SCHEMA_VERSION`) moves to 51 in a separate release PR **after** the verified apply (the OI-0251 pattern, PR #470).
- **CP-55/CP-56 spec impact:** export both tables (paginate true). Import reads them. `BACKUP_MIGRATIONS[50→51]` defaults the missing tables to `[]`, fills the farm_settings defaults (auto / 1.0305073 / 1 / per_pickup) and sets `groups.is_milking = false`. Update **V2_MIGRATION_PLAN §5.3a**: both tables come after `farms`, `groups` and `operations`. Add a V2_SCHEMA_DESIGN entry.
- **Visibility (`isDairyVisible(farmId)`):** the farm's `dairy_mode` 'on' means shown and 'off' means hidden. 'auto' means shown when the operation has any active animal whose class species is `dairy_cattle`. In the "All farms" view, Milk shows if any farm resolves to shown. Everything stays hidden while the ceiling is below 51.
- **Desktop Milk view:** route `#/milk` and a sidebar item "Milk" after Feed, shown only when visible.
  - Filter: Pickups / Calves / All, with a date range defaulting to the last 14 days. Rows are newest first with their real date and time.
  - All adds total rows per **D-T**.
  - Paddock column on the right uses the same vertical time axis, newest at the top. Grazing for the **milking groups** (D-G) is shifted later by `milk_grazing_offset_days` (grazing on day D sits beside milk on D+offset) but labelled with its real dates.
  - The header has an offset stepper (0–14) that saves to farm settings.
  - Rows can be edited, and deleted with a confirm.
- **Phone:** add field-mode modules `milkpickup` ("Record Milk Pickup") and `feedcalves` ("Feed Calves"), offered only when visible. When the user has never customised quick actions, the default list adds both while dairy is visible.
  - Forms default the date and time to now and the farm to the active farm (the farm picker shows only with 2+ farms).
  - Driver is free text with the 5 most recent distinct drivers suggested.
  - Feed Calves takes gallons (L in metric), shows a live lb (kg) preview, and has an optional calf group (non-archived groups).
- **Settings → Farm:** "Dairy features" Auto/On/Off, "Milk lb per gallon" (> 0), and "Milk totals": By pickup / Spread over days since last pickup.

## D-G: active milking groups (LOCKED, Tim t1645s6488 Q1)
- **Where it's set:** the group edit sheet (`openGroupSheet`) gets an "Active milking group" switch, shown only when dairy is visible for the active farm (`isDairyVisible`) and the ceiling is 51 or higher. One or more groups can be flagged. Archived groups keep their flag but are ignored.
- **What it drives:** the Milk paddock column shows the grazing (paddock windows × group windows) of the flagged, non-archived groups, shifted by the offset. When several groups graze different paddocks on one day, the blocks stack side by side with the group name. The Milk page has a group filter that defaults to the flagged groups and can add or remove any group for viewing. The filter isn't saved.
- **No group flagged:** milk still records normally. The paddock column shows the hint "No milking group set. Mark a group as Active milking in its group settings." with a link to Animals.
- The flag is current state, not history: it applies to the group's grazing across the whole selected range. Moving cows between groups is already handled by group membership.
- No effect on DMI, feed or any calculation.

## D-T: milk totals mode (LOCKED, Tim t1645s6488 Q2)
`farm_settings.milk_totals_mode`, default **`per_pickup`** (the card's recommendation). Applies to the "All" view total rows and to the paddock-column alignment. Calf milk always stays on its actual feeding date.
- **`per_pickup`:** one total row per pickup = that pickup + all calf milk fed after the previous pickup, up to and including this pickup's time. The row shows the span ("Nov 9 6:10 AM → Nov 11 6:05 AM, 2 days") and the average lb/day. Calf milk after the latest pickup shows in an "Since last pickup" row at the top.
- **`spread_daily`:** each pickup's weight is split evenly across the calendar days from the day after the previous pickup's date through this pickup's date (inclusive). For example, pickups on Nov 9 and Nov 11 put half of the Nov 11 pickup on Nov 10 and half on Nov 11. The day total = spread pickup milk + that day's calf milk. Spread portions are shown as "est." so they aren't mistaken for real pickups.
  - **First pickup** (none earlier on that farm): counts on its own date only.
  - **Two pickups on one date:** both count on that date (the second spans 0 extra days).
  - The spread is per farm. Pickups on other farms are ignored.
- **No effect** on DMI, feed, NPK, reports, or the assistant in this release.

## Acceptance tests
1. Entity round trip for both tables (numerics returned as strings become numbers). Validate rejects ≤ 0, a bad timestamp, or a missing farm or operation.
2. Gallons → lb: 10 gal at the default factor shows 86.0 lb. After the factor changes, old records keep their snapshot weight.
3. farm_settings: below 51, the new columns aren't written and read as auto / 8.6 / 1 / per_pickup. At 51, they round-trip. `groups.is_milking`: below 51 not written and read as false; at 51 it round-trips.
4. Visibility matrix: auto with and without an active dairy_cattle animal (a culled or inactive one doesn't count), on, off, the All-farms view, and ceiling < 51 (hidden).
5. Offset alignment: a milking group grazing on Nov 10 with offset 1 sits on the Nov 11 milk row and is labelled Nov 10. Offset 0 and 14 work. Only flagged, non-archived groups are drawn. Two flagged groups in different paddocks stack.
6. Milking flag: the switch shows in the group sheet only when dairy is visible and the ceiling is ≥ 51. With no flagged group, the hint shows and records still save. The page filter defaults to the flagged groups.
7. `per_pickup`: pickups Nov 9 6 AM and Nov 11 6 AM with calf feedings Nov 9 5 PM and Nov 11 7 AM: the Nov 11 row includes only the Nov 9 5 PM feeding. The Nov 11 7 AM feeding is in "Since last pickup". Span and lb/day are right.
8. `spread_daily`: pickups Nov 9 (first) and Nov 11 (400 lb): Nov 9 = the full first pickup, Nov 10 = 200 est., Nov 11 = 200 est. + calf milk that day. Same-date pickups and per-farm isolation work. Switching the setting re-renders without changing records.
9. Backup: a 50-version backup imports with empty milk tables, the farm_settings defaults and `is_milking` false. A 51 export/import keeps the counts and flags the same.
10. Pull/backup skip both tables while the ceiling is below 51.
11. The phone tiles appear only when visible. The default quick-actions rule works.
12. Manual check: the desktop view, plus both forms and the group switch on an iPhone.

## Order and gates
Docs (this brief) land → Build PR (code + 051 file, written only) → S1–S8 → **verified prod backup + Tim's separate yes** → apply 051 + verify (information_schema columns on farm_settings/groups, both tables, pg_policies) → merge → separate release PR raising the schema version/ceiling to 51 → publish. One PR open at a time.

## Tim questions
None open. D-G and D-T are locked by t1645s6488 (sections above).

## Out of scope (follow-up)
Per-cow production, milk price or revenue, processor statement import, reports and exports, assistant actions, and any DMI or lactation tie-in.
