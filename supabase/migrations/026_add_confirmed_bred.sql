-- OI-0099 Class B: add `animals.confirmed_bred` for the Edit Animal "Confirmed bred"
-- checkbox that was previously rendered but silently dropped on save
-- (UI field without Supabase column — the v1 trap CLAUDE.md's rule is written to prevent).
--
-- Default false so existing rows satisfy the NOT NULL constraint without backfill.
-- Old CP-55 backups (schema_version ≤ 25) have no `confirmed_bred` field on animals
-- rows; the v25 → v26 backup-migrations chain entry is a no-op (the column default
-- provides the correct value when the column is missing from the backup row).

ALTER TABLE animals ADD COLUMN IF NOT EXISTS confirmed_bred BOOLEAN NOT NULL DEFAULT false;

UPDATE operations SET schema_version = 26 WHERE schema_version < 26;
