-- WRITTEN ONLY / NOT APPLIED. Tim's separate yes + backup required.
-- Stacked after 042/043; compiled release/restore ceiling remains 41.
-- Global references: 008/009 define no operation_id and unique shared names.
-- No pre-auth reader: anon gets no privileges or policies.
-- Authenticated SELECT/INSERT/UPDATE retain onboarding, dose-unit archive/edit,
-- queued sync, Push All and CP-56 upserts (ON CONFLICT needs all three).
-- Residual risk: ANY signed-in user can change these rows for ALL farms.
-- Accepted only while users are Tim's operation; follow-up A/B awaits Tim.
-- release_notes is read by registered client full-pull sync: preserve its other
-- grants/policies for a separate Design item; revoke only unsafe DDL privileges.
-- CP-56 can delete operation rows before a later restore failure: separate bug.
BEGIN;

ALTER TABLE public.input_product_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dose_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY input_product_units_authenticated_select
  ON public.input_product_units FOR SELECT TO authenticated
  USING (true);
CREATE POLICY input_product_units_authenticated_insert
  ON public.input_product_units FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY input_product_units_authenticated_update
  ON public.input_product_units FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY dose_units_authenticated_select
  ON public.dose_units FOR SELECT TO authenticated
  USING (true);
CREATE POLICY dose_units_authenticated_insert
  ON public.dose_units FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY dose_units_authenticated_update
  ON public.dose_units FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.input_product_units, public.dose_units FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.input_product_units, public.dose_units TO authenticated;
REVOKE DELETE, TRUNCATE ON TABLE public.input_product_units, public.dose_units FROM authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dose_units, public.input_product_units, public.release_notes FROM anon, authenticated;

UPDATE public.operations SET schema_version = 44 WHERE schema_version < 44;
COMMIT;
