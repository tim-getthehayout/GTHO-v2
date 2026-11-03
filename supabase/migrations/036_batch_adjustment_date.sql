-- Add user-settable adjustment date to batch_adjustments
-- so manual quantity corrections can be dated independently of created_at.
-- Schema stamp 36.

ALTER TABLE batch_adjustments
  ADD COLUMN IF NOT EXISTS adjustment_date date;

-- Backfill existing rows with the date portion of created_at
UPDATE batch_adjustments
SET adjustment_date = (created_at AT TIME ZONE 'UTC')::date
WHERE adjustment_date IS NULL;

COMMENT ON COLUMN batch_adjustments.adjustment_date IS
  'Date the quantity adjustment is effective (user-settable). Distinct from created_at.';

UPDATE operations SET schema_version = 36 WHERE schema_version < 36;
