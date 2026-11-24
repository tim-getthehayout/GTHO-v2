-- OI-0251 Ap: farm reporting preference "include archived locations in metrics".
-- WRITTEN ONLY / NOT APPLIED until Tim's explicit yes + verified backup
-- (AGENTS.md Migration Execution Rule). Migration number 050 assigned by Design
-- (2026-11-24; reservations moved up: #388→051, #406→052, #437→053, #449→054).
--
-- Spec: session_briefs/SHEEP_PERIOD_BACKFILL_2026-11-22.md §4 Ap / §5 (Tim
-- t990s3945 / t991u / t993u; re-confirmed t1622s6381). Farm-wide boolean,
-- default true (include): Locations Calendar DMI/NPK, the OI-0250 period totals
-- strip (Calendar + List) and reports include archived land pasture/mixed-use
-- locations; false = today's exclude-archived behaviour. Lists/pickers always
-- stay !archived. The app treats an absent column as true, so code may ship first.
-- Additive typed column (047/048/049 pattern). RLS untouched (farm_settings
-- policies already cover the table). No backfill: the default is the value.

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS include_archived_locations_in_metrics boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.farm_settings.include_archived_locations_in_metrics IS
  'OI-0251 Ap: include archived land pasture/mixed-use locations in season metrics, period totals and reports. Default true. Lists/pickers always hide archived.';

UPDATE public.operations
SET schema_version = 50
WHERE schema_version < 50;
