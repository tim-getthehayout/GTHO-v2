-- locations.type is constrained to confinement | land (migration 002 inline CHECK,
-- Postgres name locations_type_check). Storage is a third type and must not
-- reuse confinement. Schema stamp 38. No new columns.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'locations'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%confinement%'
    AND pg_get_constraintdef(con.oid) ILIKE '%land%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE locations DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_type_check;

ALTER TABLE locations
  ADD CONSTRAINT locations_type_check
  CHECK (type IN ('confinement', 'land', 'storage'));

COMMENT ON CONSTRAINT locations_type_check ON locations IS
  'confinement = animals housed; land = pasture/crop/mixed; storage = feed stored (barn, silo, pad).';

UPDATE operations SET schema_version = 38 WHERE schema_version < 38;
