-- Preg-check protocol thresholds on farm_settings (min days since exposure / post-calving).
-- WRITTEN ONLY / NOT APPLIED until Tim's explicit yes + verified backup
-- (AGENTS.md Migration Execution Rule).
--
-- Locked defaults (Gd0): exposure = 35, post-calving = 45.
-- Combine rule (Gc0 AND) is application logic, not DDL.
-- Cattle-only first ship (Gs0 / E0); no per-group overrides (Gg0).
-- RLS: untouched (farm_settings policies already cover the table).

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS preg_check_min_days_since_exposure integer NOT NULL DEFAULT 35;

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS preg_check_min_days_post_calving integer NOT NULL DEFAULT 45;

ALTER TABLE public.farm_settings
  DROP CONSTRAINT IF EXISTS farm_settings_preg_check_min_days_since_exposure_check;

ALTER TABLE public.farm_settings
  ADD CONSTRAINT farm_settings_preg_check_min_days_since_exposure_check
  CHECK (preg_check_min_days_since_exposure >= 0);

ALTER TABLE public.farm_settings
  DROP CONSTRAINT IF EXISTS farm_settings_preg_check_min_days_post_calving_check;

ALTER TABLE public.farm_settings
  ADD CONSTRAINT farm_settings_preg_check_min_days_post_calving_check
  CHECK (preg_check_min_days_post_calving >= 0);

COMMENT ON COLUMN public.farm_settings.preg_check_min_days_since_exposure IS
  'Minimum calendar days since exposure_start before a female is due for pregnancy check. Default 35.';

COMMENT ON COLUMN public.farm_settings.preg_check_min_days_post_calving IS
  'Minimum calendar days since latest calved_at before due for pregnancy check. Default 45. N/A when no calving record.';

UPDATE public.operations
SET schema_version = 47
WHERE schema_version < 47;
