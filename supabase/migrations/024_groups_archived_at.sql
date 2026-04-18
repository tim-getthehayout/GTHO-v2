-- OI-0090 / SP-11 Part 3: upgrade `groups.archived boolean` to `groups.archived_at timestamptz`.
-- Idempotent. Guarded schema_version bump so DBs already at 25 (Tim's live DB after
-- migration 025 landed in the OI-0091 package) are not downgraded.

ALTER TABLE groups ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

UPDATE groups
SET archived_at = updated_at
WHERE archived = true AND archived_at IS NULL;

ALTER TABLE groups DROP COLUMN IF EXISTS archived;

CREATE INDEX IF NOT EXISTS idx_groups_active ON groups(farm_id) WHERE archived_at IS NULL;

UPDATE operations SET schema_version = 24 WHERE schema_version < 24;
