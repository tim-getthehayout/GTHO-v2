# Open Items

## Open

### OI-0001 — Strip Grazing: Partial Paddock Windows
**Added:** 2026-04-12 | **Area:** v2-design | **Priority:** P2
**Spec:** `github/issues/strip-grazing-paddock-windows.md`

Allow a single paddock to be grazed in stages (strips) within one event. User selects "Strip graze" in the move wizard for the destination paddock. Three new columns on `event_paddock_windows`: `is_strip_graze` (boolean flag for UI), `strip_group_id` (UUID linking strips in a sequence), `area_pct` (percentage of paddock per strip). Reuses existing observation, feed, and group window models with no new tables. Calculation layer needs updates for effective area in stocking density, rotation calendar per-strip recovery, and NPK distribution.

---

### OI-0002 — Unit System: No Schema Column
**Added:** 2026-04-12 | **Area:** v2-build | **Priority:** P2

CP-13 spec says "unit system toggle (metric/imperial)" on Farm Settings. V2_SCHEMA_DESIGN.md has no `unit_system` column on `farm_settings` or `user_preferences`. **Workaround for now:** Store as a localStorage-only preference (`gtho_v2_unit_system`, default `'imperial'`). This works offline and doesn't require a schema change. When Tim decides the correct column/table, migrate from localStorage to Supabase.

---

## Closed

