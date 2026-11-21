-- Preg-check protocol thresholds on farm_settings (per-species Gs1).
-- WRITTEN ONLY / NOT APPLIED until Tim's explicit yes + verified backup
-- (AGENTS.md Migration Execution Rule).
--
-- Widened before apply (M0): one apply covers cattle + sheep + goat pairs.
-- Locked defaults (Gd): cattle 35/45, sheep 25/30, goat 25/30.
-- Combine rule (Gc0 AND) is application logic, not DDL.
-- No per-group overrides (Gg0).
-- RLS: untouched (farm_settings policies already cover the table).

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS preg_check_min_days_since_exposure_cattle integer NOT NULL DEFAULT 35;

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS preg_check_min_days_post_calving_cattle integer NOT NULL DEFAULT 45;

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS preg_check_min_days_since_exposure_sheep integer NOT NULL DEFAULT 25;

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS preg_check_min_days_post_calving_sheep integer NOT NULL DEFAULT 30;

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS preg_check_min_days_since_exposure_goat integer NOT NULL DEFAULT 25;

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS preg_check_min_days_post_calving_goat integer NOT NULL DEFAULT 30;

ALTER TABLE public.farm_settings
  DROP CONSTRAINT IF EXISTS farm_settings_preg_check_min_days_since_exposure_cattle_check;
ALTER TABLE public.farm_settings
  ADD CONSTRAINT farm_settings_preg_check_min_days_since_exposure_cattle_check
  CHECK (preg_check_min_days_since_exposure_cattle >= 0);

ALTER TABLE public.farm_settings
  DROP CONSTRAINT IF EXISTS farm_settings_preg_check_min_days_post_calving_cattle_check;
ALTER TABLE public.farm_settings
  ADD CONSTRAINT farm_settings_preg_check_min_days_post_calving_cattle_check
  CHECK (preg_check_min_days_post_calving_cattle >= 0);

ALTER TABLE public.farm_settings
  DROP CONSTRAINT IF EXISTS farm_settings_preg_check_min_days_since_exposure_sheep_check;
ALTER TABLE public.farm_settings
  ADD CONSTRAINT farm_settings_preg_check_min_days_since_exposure_sheep_check
  CHECK (preg_check_min_days_since_exposure_sheep >= 0);

ALTER TABLE public.farm_settings
  DROP CONSTRAINT IF EXISTS farm_settings_preg_check_min_days_post_calving_sheep_check;
ALTER TABLE public.farm_settings
  ADD CONSTRAINT farm_settings_preg_check_min_days_post_calving_sheep_check
  CHECK (preg_check_min_days_post_calving_sheep >= 0);

ALTER TABLE public.farm_settings
  DROP CONSTRAINT IF EXISTS farm_settings_preg_check_min_days_since_exposure_goat_check;
ALTER TABLE public.farm_settings
  ADD CONSTRAINT farm_settings_preg_check_min_days_since_exposure_goat_check
  CHECK (preg_check_min_days_since_exposure_goat >= 0);

ALTER TABLE public.farm_settings
  DROP CONSTRAINT IF EXISTS farm_settings_preg_check_min_days_post_calving_goat_check;
ALTER TABLE public.farm_settings
  ADD CONSTRAINT farm_settings_preg_check_min_days_post_calving_goat_check
  CHECK (preg_check_min_days_post_calving_goat >= 0);

COMMENT ON COLUMN public.farm_settings.preg_check_min_days_since_exposure_cattle IS
  'Cattle: minimum calendar days since exposure_start before due for pregnancy check. Default 35.';
COMMENT ON COLUMN public.farm_settings.preg_check_min_days_post_calving_cattle IS
  'Cattle: minimum calendar days since latest calved_at before due for pregnancy check. Default 45. N/A when no calving record.';
COMMENT ON COLUMN public.farm_settings.preg_check_min_days_since_exposure_sheep IS
  'Sheep: minimum calendar days since exposure_start before due for pregnancy check. Default 25.';
COMMENT ON COLUMN public.farm_settings.preg_check_min_days_post_calving_sheep IS
  'Sheep: minimum calendar days since latest calved_at before due for pregnancy check. Default 30. N/A when no calving record.';
COMMENT ON COLUMN public.farm_settings.preg_check_min_days_since_exposure_goat IS
  'Goat: minimum calendar days since exposure_start before due for pregnancy check. Default 25.';
COMMENT ON COLUMN public.farm_settings.preg_check_min_days_post_calving_goat IS
  'Goat: minimum calendar days since latest calved_at before due for pregnancy check. Default 30. N/A when no calving record.';

UPDATE public.operations
SET schema_version = 47
WHERE schema_version < 47;
