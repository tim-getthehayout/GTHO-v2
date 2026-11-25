-- WRITTEN ONLY / NOT APPLIED. Tim's explicit yes + verified backup required
-- (AGENTS.md Migration Execution Rule).
-- #449 dairy milk tracking. Brief: session_briefs/DAIRY_MILK_2026-11-24.md
-- (LOCKED Tim t1519s5955 + t1645s6488). Slot 051 (Orchestrator, Nov 25:
-- 051 #449, 052 #388, 053 #437).
-- Held release: the compiled client ceiling stays 50 until this apply is
-- verified; a separate release PR then raises it to 51.
-- milk_pickups: processor pickups (weight in kg, metric storage).
-- calf_milk_feedings: milk fed to calves (volume in L; weight is derived as
--   volume_l x kg_per_l_snapshot on read, never stored). Optional calf group,
--   cleared if the group is deleted.
-- Deletes are hard deletes through the app (no soft delete).
-- farm_settings dairy columns (047-050 additive pattern) and groups.is_milking
-- (per-group active milking flag). RLS on farm_settings/groups unchanged.
BEGIN;

CREATE TABLE public.milk_pickups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES public.operations(id),
  farm_id       uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  picked_up_at  timestamptz NOT NULL,
  weight_kg     numeric NOT NULL CHECK (weight_kg > 0 AND weight_kg < 'Infinity'::numeric),
  driver        text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_milk_pickups_op_time ON public.milk_pickups (operation_id, picked_up_at DESC);
CREATE INDEX idx_milk_pickups_farm ON public.milk_pickups (farm_id);

CREATE TABLE public.calf_milk_feedings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES public.operations(id),
  farm_id           uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  fed_at            timestamptz NOT NULL,
  volume_l          numeric NOT NULL CHECK (volume_l > 0 AND volume_l < 'Infinity'::numeric),
  kg_per_l_snapshot numeric NOT NULL CHECK (kg_per_l_snapshot > 0 AND kg_per_l_snapshot < 'Infinity'::numeric),
  group_id          uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_calf_milk_feedings_op_time ON public.calf_milk_feedings (operation_id, fed_at DESC);
CREATE INDEX idx_calf_milk_feedings_farm ON public.calf_milk_feedings (farm_id);
CREATE INDEX idx_calf_milk_feedings_group ON public.calf_milk_feedings (group_id);

ALTER TABLE public.milk_pickups ENABLE ROW LEVEL SECURITY;
CREATE POLICY milk_pickups_select ON public.milk_pickups FOR SELECT TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY milk_pickups_insert ON public.milk_pickups FOR INSERT TO authenticated
  WITH CHECK (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY milk_pickups_update ON public.milk_pickups FOR UPDATE TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL))
  WITH CHECK (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY milk_pickups_delete ON public.milk_pickups FOR DELETE TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

ALTER TABLE public.calf_milk_feedings ENABLE ROW LEVEL SECURITY;
CREATE POLICY calf_milk_feedings_select ON public.calf_milk_feedings FOR SELECT TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY calf_milk_feedings_insert ON public.calf_milk_feedings FOR INSERT TO authenticated
  WITH CHECK (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY calf_milk_feedings_update ON public.calf_milk_feedings FOR UPDATE TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL))
  WITH CHECK (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY calf_milk_feedings_delete ON public.calf_milk_feedings FOR DELETE TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS dairy_mode text NOT NULL DEFAULT 'auto' CHECK (dairy_mode IN ('auto','on','off')),
  ADD COLUMN IF NOT EXISTS milk_kg_per_l numeric NOT NULL DEFAULT 1.0305073 CHECK (milk_kg_per_l > 0 AND milk_kg_per_l < 'Infinity'::numeric),
  ADD COLUMN IF NOT EXISTS milk_grazing_offset_days integer NOT NULL DEFAULT 1 CHECK (milk_grazing_offset_days BETWEEN 0 AND 14),
  ADD COLUMN IF NOT EXISTS milk_totals_mode text NOT NULL DEFAULT 'per_pickup' CHECK (milk_totals_mode IN ('per_pickup','spread_daily'));

COMMENT ON COLUMN public.farm_settings.milk_kg_per_l IS
  '#449: milk density for calf feedings, kg per L. Default 1.0305073 = 8.6 lb/gal.';
COMMENT ON COLUMN public.farm_settings.milk_totals_mode IS
  '#449 D-T: per_pickup (pickup + calf milk since the previous pickup) or spread_daily (pickup split evenly over the days since the previous pickup).';

-- Tim t1645s6488 Q1: per-group active milking flag (one or more groups). No backfill.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS is_milking boolean NOT NULL DEFAULT false;

UPDATE public.operations SET schema_version = 51 WHERE schema_version < 51;

COMMIT;
