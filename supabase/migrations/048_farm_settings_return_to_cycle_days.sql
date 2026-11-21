-- Return-to-cycle days on farm_settings (per-species; due-band earliest, not preg-check protocol).
-- WRITTEN ONLY / NOT APPLIED until Tim's explicit yes + verified backup
-- (AGENTS.md Migration Execution Rule).
--
-- Defaults (P-a): cattle 45, sheep 25, goat 25.
-- Distinct from preg_check_min_days_post_* (OI-0244 protocol post-partum).
-- Do NOT reopen/widen applied 047.
-- RLS: untouched (farm_settings policies already cover the table).

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS return_to_cycle_days_cattle integer NOT NULL DEFAULT 45;

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS return_to_cycle_days_sheep integer NOT NULL DEFAULT 25;

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS return_to_cycle_days_goat integer NOT NULL DEFAULT 25;

ALTER TABLE public.farm_settings
  DROP CONSTRAINT IF EXISTS farm_settings_return_to_cycle_days_cattle_check;
ALTER TABLE public.farm_settings
  ADD CONSTRAINT farm_settings_return_to_cycle_days_cattle_check
  CHECK (return_to_cycle_days_cattle >= 0);

ALTER TABLE public.farm_settings
  DROP CONSTRAINT IF EXISTS farm_settings_return_to_cycle_days_sheep_check;
ALTER TABLE public.farm_settings
  ADD CONSTRAINT farm_settings_return_to_cycle_days_sheep_check
  CHECK (return_to_cycle_days_sheep >= 0);

ALTER TABLE public.farm_settings
  DROP CONSTRAINT IF EXISTS farm_settings_return_to_cycle_days_goat_check;
ALTER TABLE public.farm_settings
  ADD CONSTRAINT farm_settings_return_to_cycle_days_goat_check
  CHECK (return_to_cycle_days_goat >= 0);

COMMENT ON COLUMN public.farm_settings.return_to_cycle_days_cattle IS
  'Cattle: postpartum return-to-cycle days used to narrow earliest due (max(exposure_start, last_calving+P)+gestation). Default 45. Distinct from preg_check_min_days_post_calving_cattle.';
COMMENT ON COLUMN public.farm_settings.return_to_cycle_days_sheep IS
  'Sheep: postpartum return-to-cycle days used to narrow earliest due. Default 25. Distinct from preg_check_min_days_post_calving_sheep.';
COMMENT ON COLUMN public.farm_settings.return_to_cycle_days_goat IS
  'Goat: postpartum return-to-cycle days used to narrow earliest due. Default 25. Distinct from preg_check_min_days_post_calving_goat.';

UPDATE public.operations
SET schema_version = 48
WHERE schema_version < 48;
