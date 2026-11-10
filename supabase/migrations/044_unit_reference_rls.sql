-- WRITTEN ONLY / NOT APPLIED. Tim's explicit yes + backup required.
-- Replaces the superseded global-write draft; 042/043 precede this file.
-- Fixed UUIDv5 URL namespace: https://getthehayout.com/units/<table>/<name>.
-- Legacy IDs below are authoritative production IDs supplied by Design.
-- No name-based remapping. Existing references OR unexpected data abort apply.
BEGIN;
LOCK TABLE public.animal_treatments, public.amendments, public.input_products IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.dose_units, public.input_product_units IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE unit_standards_044 (unit_table text, id uuid, legacy_id uuid, name text) ON COMMIT DROP;
INSERT INTO unit_standards_044 VALUES
  ('dose_units', 'ce6066fe-4b4d-5933-8520-aab9102ee8cf', 'bfc9a0da-5186-4d39-af87-67b58da4de18', 'capsule'),
  ('dose_units', '804cd2da-47d9-55e5-8af8-cce5f6a251d7', 'a8c3b815-e986-4c4a-8eb5-c06114301f50', 'cc'),
  ('dose_units', '22dc0057-e4e5-507d-88e8-cc6c4ef5883b', '79b1056a-3b9d-4dff-8aea-75c58be371a7', 'mg'),
  ('dose_units', 'aa226668-ae0b-5b58-8258-2f8cc72d1bb6', 'fb6b6211-5477-4297-8724-f020c5d71ba0', 'ml'),
  ('dose_units', '70513fd4-a913-5af3-a793-5eeddfc8426f', 'db85f2ab-2dc8-4c36-969c-97e6ad9bb395', 'pump'),
  ('dose_units', '16f780e7-59ea-57fd-a36b-50d0f7afc933', 'b66dee72-af92-4edb-b0d9-7b5ec6acabbf', 'tablet'),
  ('input_product_units', '3ce85e47-0115-5268-b89e-2b41b9a157e4', '3b1a5ced-39a8-441e-8f1b-21e1e0474bad', 'bag'),
  ('input_product_units', 'a3b40dcd-8d5b-55f9-8cc6-b56296911778', '57b4b90d-94c8-42c9-853c-16d34e673a87', 'gallon'),
  ('input_product_units', 'd9a7f557-ee57-5b35-bf32-cfb9b0cfa362', '893d8d0b-b88b-4ad2-a027-fa8842b17bfe', 'kg'),
  ('input_product_units', '1fbea7aa-d109-5fe1-b44a-b41d5fe844b8', '37a25a17-1a9c-47c7-9545-571279f7988e', 'lb'),
  ('input_product_units', '7b8594d1-029e-5f99-9314-45c2d9163497', '23deec76-a3a0-49dc-ade8-d69e1b37b8dc', 'ton');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.animal_treatments WHERE dose_unit_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.amendments WHERE qty_unit_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.input_products WHERE unit_id IS NOT NULL) THEN
    RAISE EXCEPTION 'unit-migration-references-exist';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dose_units) OR EXISTS (SELECT 1 FROM public.input_product_units) THEN
    IF EXISTS (
      (SELECT 'dose_units'::text, id, name FROM public.dose_units UNION ALL SELECT 'input_product_units', id, name FROM public.input_product_units)
      EXCEPT SELECT unit_table, legacy_id, name FROM unit_standards_044
    ) OR EXISTS (
      SELECT unit_table, legacy_id, name FROM unit_standards_044 EXCEPT
      (SELECT 'dose_units'::text, id, name FROM public.dose_units UNION ALL SELECT 'input_product_units', id, name FROM public.input_product_units)
    ) THEN RAISE EXCEPTION 'unit-migration-unexpected-standard-set'; END IF;
  END IF;
END $$;
ALTER TABLE public.dose_units ADD COLUMN operation_id uuid DEFAULT NULL REFERENCES public.operations(id);
ALTER TABLE public.input_product_units ADD COLUMN operation_id uuid DEFAULT NULL REFERENCES public.operations(id);
UPDATE public.dose_units u SET id = c.id FROM unit_standards_044 c WHERE c.unit_table = 'dose_units' AND u.id = c.legacy_id;
INSERT INTO public.dose_units (id, name, operation_id) SELECT id, name, NULL FROM unit_standards_044 WHERE unit_table = 'dose_units' ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.dose_units DROP CONSTRAINT dose_units_name_key;
CREATE UNIQUE INDEX dose_units_standard_name ON public.dose_units (lower(btrim(name))) WHERE operation_id IS NULL;
CREATE UNIQUE INDEX dose_units_custom_name ON public.dose_units (operation_id, lower(btrim(name))) WHERE operation_id IS NOT NULL;
ALTER TABLE public.dose_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY dose_units_select ON public.dose_units FOR SELECT TO authenticated USING (operation_id IS NULL OR operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY dose_units_insert ON public.dose_units FOR INSERT TO authenticated WITH CHECK (operation_id IS NOT NULL AND operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY dose_units_update ON public.dose_units FOR UPDATE TO authenticated USING (operation_id IS NOT NULL AND operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IS NOT NULL AND operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
UPDATE public.input_product_units u SET id = c.id FROM unit_standards_044 c WHERE c.unit_table = 'input_product_units' AND u.id = c.legacy_id;
INSERT INTO public.input_product_units (id, name, operation_id) SELECT id, name, NULL FROM unit_standards_044 WHERE unit_table = 'input_product_units' ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.input_product_units DROP CONSTRAINT input_product_units_name_key;
CREATE UNIQUE INDEX input_product_units_standard_name ON public.input_product_units (lower(btrim(name))) WHERE operation_id IS NULL;
CREATE UNIQUE INDEX input_product_units_custom_name ON public.input_product_units (operation_id, lower(btrim(name))) WHERE operation_id IS NOT NULL;
ALTER TABLE public.input_product_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY input_product_units_select ON public.input_product_units FOR SELECT TO authenticated USING (operation_id IS NULL OR operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY input_product_units_insert ON public.input_product_units FOR INSERT TO authenticated WITH CHECK (operation_id IS NOT NULL AND operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY input_product_units_update ON public.input_product_units FOR UPDATE TO authenticated USING (operation_id IS NOT NULL AND operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IS NOT NULL AND operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

-- Private trigger functions are not exposed as callable Data API write tools.
CREATE SCHEMA IF NOT EXISTS unit_private;
REVOKE ALL ON SCHEMA unit_private FROM PUBLIC, anon, authenticated;
CREATE FUNCTION unit_private.guard_unit_name_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE collision boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.operation_id IS DISTINCT FROM OLD.operation_id THEN
    RAISE EXCEPTION 'unit-ownership-is-immutable' USING ERRCODE = '23514';
  END IF;
  -- A volatile trigger query gets a fresh snapshot after the namespace lock at
  -- READ COMMITTED. Fail closed rather than use a stale REPEATABLE READ snapshot.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'unit-name-write-needs-read-committed' USING ERRCODE = '25001';
  END IF;
  PERFORM pg_advisory_xact_lock(44, CASE WHEN TG_TABLE_NAME = 'dose_units' THEN 1 ELSE 2 END);
  IF TG_TABLE_NAME = 'dose_units' THEN
    SELECT EXISTS (SELECT 1 FROM public.dose_units u WHERE u.id <> NEW.id AND lower(btrim(u.name)) = lower(btrim(NEW.name)) AND (NEW.operation_id IS NULL OR u.operation_id IS NULL OR u.operation_id = NEW.operation_id)) INTO collision;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.input_product_units u WHERE u.id <> NEW.id AND lower(btrim(u.name)) = lower(btrim(NEW.name)) AND (NEW.operation_id IS NULL OR u.operation_id IS NULL OR u.operation_id = NEW.operation_id)) INTO collision;
  END IF;
  IF collision THEN RAISE EXCEPTION 'unit-name-already-reserved' USING ERRCODE = '23505'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION unit_private.guard_unit_name_scope() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER unit_name_scope_guard BEFORE INSERT OR UPDATE ON public.dose_units FOR EACH ROW EXECUTE FUNCTION unit_private.guard_unit_name_scope();
CREATE TRIGGER unit_name_scope_guard BEFORE INSERT OR UPDATE ON public.input_product_units FOR EACH ROW EXECUTE FUNCTION unit_private.guard_unit_name_scope();

CREATE FUNCTION unit_private.guard_unit_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE unit_id uuid; owner_id uuid;
BEGIN
  unit_id := (to_jsonb(NEW)->>TG_ARGV[0])::uuid;
  IF unit_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'animal_treatments' THEN SELECT operation_id INTO owner_id FROM public.dose_units WHERE id = unit_id;
  ELSE SELECT operation_id INTO owner_id FROM public.input_product_units WHERE id = unit_id; END IF;
  IF NOT FOUND OR (owner_id IS NOT NULL AND owner_id IS DISTINCT FROM NEW.operation_id) THEN
    RAISE EXCEPTION 'unit-reference-outside-operation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION unit_private.guard_unit_reference() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER unit_reference_guard BEFORE INSERT OR UPDATE OF operation_id, dose_unit_id ON public.animal_treatments FOR EACH ROW EXECUTE FUNCTION unit_private.guard_unit_reference('dose_unit_id');
CREATE TRIGGER unit_reference_guard BEFORE INSERT OR UPDATE OF operation_id, qty_unit_id ON public.amendments FOR EACH ROW EXECUTE FUNCTION unit_private.guard_unit_reference('qty_unit_id');
CREATE TRIGGER unit_reference_guard BEFORE INSERT OR UPDATE OF operation_id, unit_id ON public.input_products FOR EACH ROW EXECUTE FUNCTION unit_private.guard_unit_reference('unit_id');

-- Read-only preflight closes the ID-collision blind spot of RLS-filtered pulls.
CREATE FUNCTION unit_private.unit_restore_id_conflicts(p_operation uuid, p_dose_ids uuid[], p_product_ids uuid[], p_dose_rows jsonb DEFAULT '[]'::jsonb, p_product_rows jsonb DEFAULT '[]'::jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.operation_members WHERE operation_id = p_operation AND user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'unit-restore-membership-required' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.dose_units WHERE id = ANY(p_dose_ids) AND operation_id IS DISTINCT FROM p_operation)
    OR EXISTS (SELECT 1 FROM public.input_product_units WHERE id = ANY(p_product_ids) AND operation_id IS DISTINCT FROM p_operation)
    -- Use PostgreSQL's actual collation/case-folding too, not just JS's approximation.
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_dose_rows) r GROUP BY lower(btrim(r->>'name')) HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_product_rows) r GROUP BY lower(btrim(r->>'name')) HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_dose_rows) r JOIN public.dose_units u ON lower(btrim(u.name)) = lower(btrim(r->>'name')) WHERE u.id <> (r->>'id')::uuid AND (u.operation_id IS NULL OR u.operation_id = p_operation))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_product_rows) r JOIN public.input_product_units u ON lower(btrim(u.name)) = lower(btrim(r->>'name')) WHERE u.id <> (r->>'id')::uuid AND (u.operation_id IS NULL OR u.operation_id = p_operation));
END $$;
REVOKE ALL ON FUNCTION unit_private.unit_restore_id_conflicts(uuid,uuid[],uuid[],jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA unit_private TO authenticated;
GRANT EXECUTE ON FUNCTION unit_private.unit_restore_id_conflicts(uuid,uuid[],uuid[],jsonb,jsonb) TO authenticated;
CREATE FUNCTION public.unit_restore_id_conflicts(p_operation uuid, p_dose_ids uuid[], p_product_ids uuid[], p_dose_rows jsonb DEFAULT '[]'::jsonb, p_product_rows jsonb DEFAULT '[]'::jsonb) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$ SELECT unit_private.unit_restore_id_conflicts(p_operation,p_dose_ids,p_product_ids,p_dose_rows,p_product_rows) $$;
REVOKE ALL ON FUNCTION public.unit_restore_id_conflicts(uuid,uuid[],uuid[],jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unit_restore_id_conflicts(uuid,uuid[],uuid[],jsonb,jsonb) TO authenticated;

REVOKE ALL ON TABLE public.dose_units, public.input_product_units FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dose_units, public.input_product_units TO authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dose_units, public.input_product_units FROM anon, authenticated;
ALTER TABLE public.release_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY release_notes_authenticated_select ON public.release_notes FOR SELECT TO authenticated USING (true);
GRANT SELECT ON TABLE public.release_notes TO authenticated;
REVOKE SELECT ON TABLE public.release_notes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.release_notes FROM anon, authenticated;
UPDATE public.operations SET schema_version = 44 WHERE schema_version < 44;
COMMIT;
