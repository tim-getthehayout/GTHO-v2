# Open Items

## Open

### OI-0001 — Strip Grazing: Partial Paddock Windows
**Added:** 2026-04-12 | **Area:** v2-design | **Priority:** P2
**Spec:** `github/issues/strip-grazing-paddock-windows.md`

Allow a single paddock to be grazed in stages (strips) within one event. User selects "Strip graze" in the move wizard for the destination paddock. Three new columns on `event_paddock_windows`: `is_strip_graze` (boolean flag for UI), `strip_group_id` (UUID linking strips in a sequence), `area_pct` (percentage of paddock per strip). Reuses existing observation, feed, and group window models with no new tables. Calculation layer needs updates for effective area in stocking density, rotation calendar per-strip recovery, and NPK distribution.

---

## Closed

