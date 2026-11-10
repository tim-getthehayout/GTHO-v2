-- WRITTEN ONLY / NOT APPLIED. Approval and a backup are required from Tim
-- separately at apply time. Reconcile live prerequisites/history/policies first.
-- 041 source is not evidence of live 041, and its RPC does not prove 042.
-- No new-shape consumer release until approved apply and column verification.
-- No domain backfill. No grants, policies, RLS, FK or table-order changes.
-- Existing INSERT WITH CHECK (true) is permissive; not endorsed by this file.
BEGIN;
ALTER TABLE public.animal_breeding_records
  ADD COLUMN sire_name text DEFAULT NULL;
ALTER TABLE public.ai_bulls
  ADD COLUMN epds text DEFAULT NULL;
UPDATE public.operations SET schema_version = 42 WHERE schema_version < 42;
COMMIT;
