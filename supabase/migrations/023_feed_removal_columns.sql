-- Migration 023: Add feed removal columns to event_feed_entries (SP-10 §8a Move Feed Out)
-- entry_type: 'delivery' (default) or 'removal'
-- destination_type: 'batch' or 'event' (only set when entry_type = 'removal')
-- destination_event_id: FK to events (only set when destination_type = 'event')

ALTER TABLE event_feed_entries
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS destination_type text,
  ADD COLUMN IF NOT EXISTS destination_event_id uuid REFERENCES events(id) ON DELETE SET NULL;

-- Check constraints
ALTER TABLE event_feed_entries
  DROP CONSTRAINT IF EXISTS chk_entry_type_enum,
  ADD CONSTRAINT chk_entry_type_enum CHECK (entry_type IN ('delivery', 'removal'));

ALTER TABLE event_feed_entries
  DROP CONSTRAINT IF EXISTS chk_removal_has_destination,
  ADD CONSTRAINT chk_removal_has_destination CHECK (entry_type = 'delivery' OR destination_type IS NOT NULL);

ALTER TABLE event_feed_entries
  DROP CONSTRAINT IF EXISTS chk_destination_type_enum,
  ADD CONSTRAINT chk_destination_type_enum CHECK (destination_type IS NULL OR destination_type IN ('batch', 'event'));

ALTER TABLE event_feed_entries
  DROP CONSTRAINT IF EXISTS chk_dest_event_consistency,
  ADD CONSTRAINT chk_dest_event_consistency CHECK (
    (destination_type = 'event' AND destination_event_id IS NOT NULL)
    OR (destination_type = 'batch' AND destination_event_id IS NULL)
    OR (destination_type IS NULL AND destination_event_id IS NULL)
  );

UPDATE operations SET schema_version = 23;
