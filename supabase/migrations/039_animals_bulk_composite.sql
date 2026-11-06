-- Composite/bulk animals: one animals row can stand for many head.
-- is_bulk false (the default) keeps every existing row an individual.
-- bulk_head_count is null on individuals and a non-negative integer on composites.
-- Total weight stays on animal_weight_records (no new weight column).
-- Schema stamp 39. Not applied in this session.

ALTER TABLE animals
  ADD COLUMN IF NOT EXISTS is_bulk boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bulk_head_count integer;

ALTER TABLE animals DROP CONSTRAINT IF EXISTS animals_bulk_head_count_check;

ALTER TABLE animals
  ADD CONSTRAINT animals_bulk_head_count_check
  CHECK (
    (is_bulk = false AND bulk_head_count IS NULL)
    OR (is_bulk = true AND bulk_head_count IS NOT NULL AND bulk_head_count >= 0)
  );

COMMENT ON COLUMN animals.is_bulk IS
  'True when this row is a group composite (many head, one record). False for an individual.';
COMMENT ON COLUMN animals.bulk_head_count IS
  'Head represented by a composite. Null on individual animals.';

UPDATE operations SET schema_version = 39 WHERE schema_version < 39;
