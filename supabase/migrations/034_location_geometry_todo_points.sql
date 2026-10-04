-- Migration 034: Pasture perimeters on locations + optional todo map pins.
-- Locations store a GeoJSON polygon (fence line) and a centroid for labels.
-- Todos may attach to a named location and/or a free point on the map.

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS geojson jsonb,
  ADD COLUMN IF NOT EXISTS centroid_lat numeric,
  ADD COLUMN IF NOT EXISTS centroid_lng numeric,
  ADD COLUMN IF NOT EXISTS map_source text;

ALTER TABLE locations
  DROP CONSTRAINT IF EXISTS locations_map_source_check;

ALTER TABLE locations
  ADD CONSTRAINT locations_map_source_check
  CHECK (map_source IS NULL OR map_source IN ('drawn', 'imported'));

ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS point_lat numeric,
  ADD COLUMN IF NOT EXISTS point_lng numeric;

UPDATE operations SET schema_version = 34;
