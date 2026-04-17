-- Migration 022: Add bale_ring_residue_count to event_observations
-- and bale_ring_residue_diameter_ft to farm_settings (SP-9 survey v1 parity)

ALTER TABLE event_observations ADD COLUMN IF NOT EXISTS bale_ring_residue_count integer;

ALTER TABLE farm_settings ADD COLUMN IF NOT EXISTS bale_ring_residue_diameter_ft numeric(5,2);

UPDATE operations SET schema_version = 22;
