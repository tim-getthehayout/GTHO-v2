-- WRITTEN ONLY / NOT APPLIED. Tim's explicit yes + verified backup required.
-- Held release: the compiled client ceiling stays 44 until this apply is verified.
-- historical_feedings: one row per last-winter feeding (no inventory effect).
-- historical_animal_basis: one row per herd/flock basis period for the intake forecast.
-- Backfill rows use fixed UUIDv5 ids (URL namespace) from
-- https://getthehayout.com/backfill/oi-0222/<table>/<source_key>.
-- Rows are never deleted by the app.
BEGIN;

CREATE TABLE public.historical_feedings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id                uuid NOT NULL REFERENCES public.operations(id),
  farm_id                     uuid REFERENCES public.farms(id) ON DELETE SET NULL,
  date                        date NOT NULL,
  quantity                    numeric NOT NULL CHECK (quantity > 0 AND quantity < 'Infinity'::numeric),
  unit_snapshot               text NOT NULL CHECK (length(btrim(unit_snapshot)) > 0),
  weight_per_unit_kg_snapshot numeric NOT NULL CHECK (weight_per_unit_kg_snapshot > 0 AND weight_per_unit_kg_snapshot < 'Infinity'::numeric),
  dm_pct_snapshot             numeric NOT NULL CHECK (dm_pct_snapshot > 0 AND dm_pct_snapshot <= 100),
  feed_type_id                uuid REFERENCES public.feed_types(id) ON DELETE SET NULL,
  feed_type_label             text,
  species                     text NOT NULL CHECK (species IN ('beef_cattle', 'dairy_cattle', 'sheep', 'goat', 'other')),
  group_id                    uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  group_label                 text,
  place_text                  text,
  notes                       text,
  source                      text NOT NULL DEFAULT 'manual' CHECK (source IN ('notes', 'manual')),
  source_key                  text NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_feedings_source_key_unique UNIQUE (operation_id, source_key)
);

CREATE INDEX idx_historical_feedings_operation ON public.historical_feedings (operation_id);
CREATE INDEX idx_historical_feedings_farm ON public.historical_feedings (farm_id);
CREATE INDEX idx_historical_feedings_feed_type ON public.historical_feedings (feed_type_id);
CREATE INDEX idx_historical_feedings_group ON public.historical_feedings (group_id);

CREATE TABLE public.historical_animal_basis (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id     uuid NOT NULL REFERENCES public.operations(id),
  farm_id          uuid REFERENCES public.farms(id) ON DELETE SET NULL,
  period_start     date NOT NULL,
  period_end       date NOT NULL,
  species          text NOT NULL CHECK (species IN ('beef_cattle', 'dairy_cattle', 'sheep', 'goat', 'other')),
  group_id         uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  group_label      text,
  class_id         uuid REFERENCES public.animal_classes(id) ON DELETE SET NULL,
  class_label      text,
  head_count       integer NOT NULL CHECK (head_count > 0),
  avg_weight_kg    numeric NOT NULL CHECK (avg_weight_kg > 0 AND avg_weight_kg < 'Infinity'::numeric),
  dmi_pct_snapshot numeric NOT NULL CHECK (dmi_pct_snapshot > 0 AND dmi_pct_snapshot <= 100),
  dmi_source       text NOT NULL CHECK (dmi_source IN ('class_default', 'class_mix', 'manual')),
  source           text NOT NULL DEFAULT 'manual' CHECK (source IN ('tim_entry', 'tim_answer', 'manual')),
  notes            text,
  source_key       text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_animal_basis_period CHECK (period_end >= period_start),
  CONSTRAINT historical_animal_basis_source_key_unique UNIQUE (operation_id, source_key)
);

CREATE INDEX idx_historical_animal_basis_operation ON public.historical_animal_basis (operation_id);
CREATE INDEX idx_historical_animal_basis_farm ON public.historical_animal_basis (farm_id);
CREATE INDEX idx_historical_animal_basis_group ON public.historical_animal_basis (group_id);
CREATE INDEX idx_historical_animal_basis_class ON public.historical_animal_basis (class_id);

ALTER TABLE public.historical_feedings ENABLE ROW LEVEL SECURITY;
CREATE POLICY historical_feedings_select ON public.historical_feedings FOR SELECT TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY historical_feedings_insert ON public.historical_feedings FOR INSERT TO authenticated
  WITH CHECK (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY historical_feedings_update ON public.historical_feedings FOR UPDATE TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL))
  WITH CHECK (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY historical_feedings_delete ON public.historical_feedings FOR DELETE TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

ALTER TABLE public.historical_animal_basis ENABLE ROW LEVEL SECURITY;
CREATE POLICY historical_animal_basis_select ON public.historical_animal_basis FOR SELECT TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY historical_animal_basis_insert ON public.historical_animal_basis FOR INSERT TO authenticated
  WITH CHECK (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY historical_animal_basis_update ON public.historical_animal_basis FOR UPDATE TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL))
  WITH CHECK (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY historical_animal_basis_delete ON public.historical_animal_basis FOR DELETE TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

UPDATE public.operations SET schema_version = 45 WHERE schema_version < 45;

COMMIT;
