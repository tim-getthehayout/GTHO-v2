-- Farm season default: per-farm start/end month-day on farm_settings (#402).
-- WRITTEN ONLY / NOT APPLIED until Tim's explicit yes + verified backup
-- (AGENTS.md Migration Execution Rule). Migration number 049 assigned by Design.
--
-- Default Jan 1 – Dec 31 (calendar year; Tim, card t1477s5820), replacing the
-- app's hard-coded Oct 1 – Sep 30. A start after the end wraps the year
-- (e.g. Oct 1 – Sep 30). The app resolves the concrete dates for the season
-- containing today (periodContaining) and validates the 1–366 day rule.
-- Additive typed columns (047/048 pattern); do NOT reopen/widen 047/048.
-- RLS: untouched (farm_settings policies already cover the table).
-- No backfill: the column defaults are the farm default until someone edits it.

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS season_start_month integer NOT NULL DEFAULT 1;

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS season_start_day integer NOT NULL DEFAULT 1;

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS season_end_month integer NOT NULL DEFAULT 12;

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS season_end_day integer NOT NULL DEFAULT 31;

-- A real month-day (Feb allows 29; the app clamps Feb 29 to Feb 28 in non-leap years).
ALTER TABLE public.farm_settings
  DROP CONSTRAINT IF EXISTS farm_settings_season_start_check;
ALTER TABLE public.farm_settings
  ADD CONSTRAINT farm_settings_season_start_check
  CHECK (
    season_start_month BETWEEN 1 AND 12
    AND season_start_day BETWEEN 1 AND
      CASE WHEN season_start_month = 2 THEN 29
           WHEN season_start_month IN (4, 6, 9, 11) THEN 30
           ELSE 31 END
  );

ALTER TABLE public.farm_settings
  DROP CONSTRAINT IF EXISTS farm_settings_season_end_check;
ALTER TABLE public.farm_settings
  ADD CONSTRAINT farm_settings_season_end_check
  CHECK (
    season_end_month BETWEEN 1 AND 12
    AND season_end_day BETWEEN 1 AND
      CASE WHEN season_end_month = 2 THEN 29
           WHEN season_end_month IN (4, 6, 9, 11) THEN 30
           ELSE 31 END
  );

COMMENT ON COLUMN public.farm_settings.season_start_month IS
  'Farm season default start month (1-12). Default 1 (Jan 1 - Dec 31). Viewing/picking a period never writes this.';
COMMENT ON COLUMN public.farm_settings.season_start_day IS
  'Farm season default start day of month. Default 1.';
COMMENT ON COLUMN public.farm_settings.season_end_month IS
  'Farm season default end month (1-12). Default 12. End before start wraps the year.';
COMMENT ON COLUMN public.farm_settings.season_end_day IS
  'Farm season default end day of month. Default 31.';

UPDATE public.operations
SET schema_version = 49
WHERE schema_version < 49;
