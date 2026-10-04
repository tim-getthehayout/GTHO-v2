-- Migration 035: OI-0102 — label paddock windows opened in one Save.
-- open_cohort_id is a shared uuid, not a lock and not an anchor.
-- Null means the window was opened alone.

ALTER TABLE event_paddock_windows
  ADD COLUMN IF NOT EXISTS open_cohort_id uuid;

CREATE INDEX IF NOT EXISTS idx_event_paddock_windows_event_open_cohort
  ON event_paddock_windows (event_id, open_cohort_id);

UPDATE operations SET schema_version = 35;
