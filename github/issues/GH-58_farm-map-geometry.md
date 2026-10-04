# GH-58 — Farm map: paddock perimeters, FieldMargin import, shared location picker

**Status:** shipped 2026-10-04. Merged to main as `a554f01`. PR https://github.com/tim-getthehayout/GTHO-v2/pull/58

**Schema:** migration 034 applied in Supabase. `CURRENT_SCHEMA_VERSION = 34`.

## Contract

- A location that is a pasture stores a GeoJSON Polygon, a centroid, and acreage derived from the ring when the location has no area yet.
- A to-do location is a location id, a point (`point_lat` / `point_lng`), or both.
- Import accepts GeoJSON, KML, and KMZ. Match on name or field code; otherwise create with `map_source = imported`.
- The map picker is shared: harvest, amendments, move wizard, to-dos, locations.
- GPS is foreground only.

## Not in this ship

Shapefile. Background geofencing.
