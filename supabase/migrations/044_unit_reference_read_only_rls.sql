-- WRITTEN ONLY / NOT APPLIED. Separate apply approval + backup required.
-- Stacked after 042/043; compiled release/restore ceiling remains 41.
-- Global references: 008/009 define no operation_id and unique shared names.
-- Readers: sync-registry -> pull-remote -> CustomSync; main.js gates app boot
-- behind auth. Health/amendment forms and CP-55 read these shared rows.
-- No pre-auth consumer was found in src/ or supabase/functions/: no anon policy.
-- DEPLOYMENT CONFLICT (not resolved here): onboarding seeds both tables,
-- health reference editing writes dose_units, push-all replays both, and CP-56
-- upserts both references. These writes will be denied after approved apply.
-- V1 conversion emits empty unit arrays but uses that same CP-56 restore path.
-- A separate Design decision is needed for seeding/editing/restore; do not grant
-- browser writes or silently skip/remap reference IDs to work around this RLS.
BEGIN;

ALTER TABLE public.input_product_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dose_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY input_product_units_authenticated_select
  ON public.input_product_units FOR SELECT TO authenticated
  USING (true);
CREATE POLICY dose_units_authenticated_select
  ON public.dose_units FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON TABLE public.input_product_units, public.dose_units TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.input_product_units FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.dose_units FROM anon, authenticated;

UPDATE public.operations SET schema_version = 44 WHERE schema_version < 44;
COMMIT;
