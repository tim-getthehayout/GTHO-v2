-- CP-55: Add schema_version to operations for backup format stamping.
-- See V2_MIGRATION_PLAN.md §5.11.
ALTER TABLE operations
  ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 14;

-- Backfill existing rows to current migration number (14).
UPDATE operations SET schema_version = 14 WHERE schema_version = 14;
