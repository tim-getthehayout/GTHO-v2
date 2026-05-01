-- OI-0138: Dev Mode access flag per operation member. Gates the in-app
-- Dev Mode shelf (Event Audit walk-through, Error log viewer, Schema/
-- migration readout). Owners and admins manage access via the existing
-- member-management UI; bootstrap is direct SQL (one-time per dev user).
ALTER TABLE operation_members
  ADD COLUMN is_dev boolean NOT NULL DEFAULT false;

UPDATE operations SET schema_version = 33;
