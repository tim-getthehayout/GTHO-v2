# SESSION_BRIEF — Feed batch location picker: storage vs pasture

**Generated:** 2026-11-04  
**Source:** Grok design session (follow-up to feed batch locations)  
**Status:** Implemented. PR #63. Migration 038 applied.  
**Parent:** session_briefs/SESSION_BRIEF_2026-11-04_feed-batch-locations.md · PR #62

## What was decided

Feed storage locations (Hay Barn, Silo, Shop, pad, etc.) are different from both pastures and animal confinement areas. They must not share the confinement type.

- Add a distinct location type: `storage`.
- In the batch create and move location pickers only:
  - Toggle **Storage | Pasture**.
  - Opens on **Storage** by default.
  - Storage list shows only non-archived `type === 'storage'` locations.
  - “Add new…” appears only on the Storage side and creates a name-only `type: 'storage'` location (no geojson / map required).
  - Pasture list shows existing pasture locations only; no add-new.
  - Confinement locations are never listed and cannot be created from the batch flow.
- Animal-move and confinement pickers are unchanged and must never show `storage` locations.

No change to the balances / moves / delivery model already in PR #62.

## What to build / change

1. **Location type**
   - Allow `type = 'storage'` in `src/entities/location.js` (`VALID_TYPES`).
   - If a DB check constraint exists on `locations.type`, add a small migration to permit `'storage'`. If validation is app-only, no migration is required.
   - GeoJSON / map fields stay optional.

2. **Batch create + move location picker** (`src/features/feed/index.js` or wherever the picker was added in PR #62)
   - Toggle: Storage (default, active on open) | Pasture.
   - Storage: filter `!archived && type === 'storage'`.
   - “Add new storage location…” only in Storage mode. Simple name (optional notes). Creates location with `type: 'storage'`, current farm, no map. Selects it immediately.
   - Pasture: filter existing pastures (`type === 'land' && landUse === 'pasture'`). No add control.
   - Never list or create `type === 'confinement'` from this picker.

3. **Other location pickers**
   - Animal move, confinement, harvest, amendments, map, Locations screen: no behavior change. Do not surface `storage` locations in animal/confinement flows.

4. **Locations screen** (optional but useful)
   - Add a “Storage” filter pill alongside the existing Confinement / Pasture pills so storage locations are visible and editable there too.

## Acceptance criteria

- New batch / move opens with Storage selected.
- User can add a storage location by name from the batch picker; it appears and is selected.
- User cannot add a pasture or confinement location from the batch picker.
- Toggle switches the list between storage and pasture without mixing them.
- Confinement and animal-move pickers do not show storage locations.
- Existing PR #62 balances, moves, and delivery source-location behavior unchanged.
- Tests cover the filter and the “add storage only” path. `npx vitest run` green.

## Constraints

- Do not reuse `confinement` for storage.
- Do not allow pasture or confinement creation from the batch dialog.
- Default view is Storage.
- Schema-first if a constraint migration is needed; otherwise app validation is enough.
- Amendment to PR #62 preferred (same branch) unless the PR is already merged.

## References

- Parent brief and PR #62
- `src/entities/location.js`
- `src/features/feed/index.js`
- `src/features/locations/index.js`
