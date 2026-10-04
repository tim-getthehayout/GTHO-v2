# PROJECT_STATUS.md — GTHO v2

Read this first. Detail stays in the specs and in `OPEN_ITEMS.md`. This file is the current picture, not a second backlog.

**As of:** 2026-10-04
**Schema:** 34, applied in Supabase (`034_location_geometry_todo_points.sql`).
**App:** `https://tim-getthehayout.github.io/GTHO-v2/` deploys from `main`.

## Now

Farm map is on `main` (`a554f01`, PR #58). Locations can store a GeoJSON polygon, centroid, and `map_source` (`drawn` or `imported`). Todos can store a point. Shared picker is wired for harvest, amendments, the move wizard, and todos. Import is GeoJSON, KML, and KMZ. Shapefile is not in v1.

Working rules now live in `AGENTS.md`. `CLAUDE.md` is the implementation rulebook only.

## Read next if the session needs it

- Map ship: `session_briefs/SESSION_BRIEF_2026-10-04_farm-map-geometry.md` and `github/issues/GH-58_farm-map-geometry.md`.
- Open bugs: `OPEN_ITEMS.md`. Recently filed and still design-required as of 2026-06-24: OI-0188 (no UI into a closed event), OI-0189 (UTC date after 8 PM Eastern), OI-0190 (destination start edit does not cascade to the source close). OI-0191 (do not wizard an existing operation on an empty browser) shipped in `1cedc14`.
- Domain specs: `V2_SCHEMA_DESIGN.md` §2.1 does not yet list the migration 034 columns. Do not treat that section as the live schema for map fields.

## Not now

Shapefile import. Background geofencing. Rewriting `OPEN_ITEMS.md` or the V2 design docs into a new format.
