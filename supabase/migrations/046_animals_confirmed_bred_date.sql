-- OI-0232: nullable confirmed-bred date on animals (Edit Animal date under the checkbox).
-- WRITTEN ONLY / NOT APPLIED until Tim's explicit yes + verified backup
-- (AGENTS.md Migration Execution Rule).
--
-- Q1 (locked): untick clears date (Weaned pattern) — app behavior, not DDL.
-- Q2 (locked): calving clears tick + date — app behavior, not DDL.
-- Q3 superseded by OI-0234 one-time backfill (separate write + yes).
--
-- Check: a date is only allowed when confirmed_bred is true.
-- A confirmed animal may still have NULL date (unknown / pre-column marks).
-- Existing rows: column defaults to NULL; prod currently has 0 confirmed_bred=true.
-- RLS: untouched (animals policies already cover the table).

ALTER TABLE public.animals
  ADD COLUMN IF NOT EXISTS confirmed_bred_date date;

ALTER TABLE public.animals
  DROP CONSTRAINT IF EXISTS animals_confirmed_bred_date_check;

ALTER TABLE public.animals
  ADD CONSTRAINT animals_confirmed_bred_date_check
  CHECK (confirmed_bred = true OR confirmed_bred_date IS NULL);

COMMENT ON COLUMN public.animals.confirmed_bred_date IS
  'Local calendar date pregnancy was confirmed. NULL when not confirmed or date unknown. Cleared with the tick (Q1) and on calving (Q2).';

UPDATE public.operations
SET schema_version = 46
WHERE schema_version < 46;
