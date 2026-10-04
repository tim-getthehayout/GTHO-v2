# Session brief — farm map geometry

**Date:** 2026-10-04
**PR:** https://github.com/tim-getthehayout/GTHO-v2/pull/58 (squash `a554f01` on main)
**Migration:** `supabase/migrations/034_location_geometry_todo_points.sql` — applied in Supabase by Tim on 2026-10-04. `operations.schema_version = 34`.

## What shipped

Pastures are polygons. A to-do location is either a named location or a free map point.

- `locations.geojson` (Polygon), `centroid_lat`, `centroid_lng`, `map_source` (`drawn` | `imported`).
- `todos.point_lat`, `todos.point_lng`. Optional; a to-do may also keep `location_id`.
- `#/map` screen: satellite tiles, draw a perimeter, Where I am, import.
- Shared picker overlay used by harvest, amendments, move wizard, and to-dos. Does not navigate away.
- FieldMargin / other apps: GeoJSON, KML, KMZ. Match by name or field code, or create a location with `map_source = imported`. Shapefile is not in v1.
- Field mode: Near me sorts assigned tasks by foreground GPS. No background geofence.

## Docs not rewritten in the feature commit

The feature commit did not update `PROJECT_CHANGELOG.md`, `OPEN_ITEMS.md`, `V2_SCHEMA_DESIGN.md`, or `V2_UX_FLOWS.md`. Those files still describe the pre-map schema. This brief plus `github/issues/GH-58_farm-map-geometry.md` are the record for the ship. `V2_SCHEMA_DESIGN.md` §2.1 `locations` still omits `geojson`, centroid, and `map_source`.

## Out of scope

Shapefile import. Background geofencing. PostGIS.
