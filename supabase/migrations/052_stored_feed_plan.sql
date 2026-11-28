-- WRITTEN ONLY / NOT APPLIED. Tim's explicit yes + verified backup required
-- (AGENTS.md Migration Execution Rule).
-- #436 / OI-0281 expected stored-feed plan (season budget core). Brief:
-- session_briefs/STORED_FEED_BUDGET_2026-11-23.md (LOCKED Tim t1387s5445
-- Pe1+Pm3+Pu1+Pw2). Slot 052 (Design comment 1913).
-- Held release: the compiled client ceiling stays 51 until this apply is
-- verified; a separate release PR then raises it to 52.
-- stored_feed_plans: one plan per farm per budget period (header: farm,
-- period start/end, notes).
-- stored_feed_plan_rows: date-range lines; exactly one of planned_pct
-- (0–100, % of herd daily need) or planned_kg_dm_per_day (fixed kg DM/day,
-- metric storage). Overlap is rejected in the client (validatePlanLines).
-- Deletes are hard deletes through the app (ON DELETE CASCADE from header).
-- Operation-scoped member RLS (OI-0233 / 045 / 051 pattern).

BEGIN;

CREATE TABLE public.stored_feed_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES public.operations(id),
  farm_id       uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stored_feed_plans_period_ck CHECK (period_end > period_start),
  CONSTRAINT stored_feed_plans_farm_period_uq UNIQUE (farm_id, period_start, period_end)
);
CREATE INDEX idx_stored_feed_plans_op ON public.stored_feed_plans (operation_id);
CREATE INDEX idx_stored_feed_plans_farm ON public.stored_feed_plans (farm_id, period_start);

CREATE TABLE public.stored_feed_plan_rows (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id          uuid NOT NULL REFERENCES public.operations(id),
  plan_id               uuid NOT NULL REFERENCES public.stored_feed_plans(id) ON DELETE CASCADE,
  start_date            date NOT NULL,
  end_date              date NOT NULL,
  planned_pct           numeric CHECK (planned_pct IS NULL OR (planned_pct >= 0 AND planned_pct <= 100 AND planned_pct < 'Infinity'::numeric)),
  planned_kg_dm_per_day numeric CHECK (planned_kg_dm_per_day IS NULL OR (planned_kg_dm_per_day >= 0 AND planned_kg_dm_per_day < 'Infinity'::numeric)),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stored_feed_plan_rows_dates_ck CHECK (end_date >= start_date),
  CONSTRAINT stored_feed_plan_rows_kind_ck CHECK (
    (planned_pct IS NOT NULL AND planned_kg_dm_per_day IS NULL)
    OR (planned_pct IS NULL AND planned_kg_dm_per_day IS NOT NULL)
  )
);
CREATE INDEX idx_stored_feed_plan_rows_op ON public.stored_feed_plan_rows (operation_id);
CREATE INDEX idx_stored_feed_plan_rows_plan ON public.stored_feed_plan_rows (plan_id, start_date);

ALTER TABLE public.stored_feed_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY stored_feed_plans_select ON public.stored_feed_plans FOR SELECT TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY stored_feed_plans_insert ON public.stored_feed_plans FOR INSERT TO authenticated
  WITH CHECK (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY stored_feed_plans_update ON public.stored_feed_plans FOR UPDATE TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL))
  WITH CHECK (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY stored_feed_plans_delete ON public.stored_feed_plans FOR DELETE TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

ALTER TABLE public.stored_feed_plan_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY stored_feed_plan_rows_select ON public.stored_feed_plan_rows FOR SELECT TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY stored_feed_plan_rows_insert ON public.stored_feed_plan_rows FOR INSERT TO authenticated
  WITH CHECK (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY stored_feed_plan_rows_update ON public.stored_feed_plan_rows FOR UPDATE TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL))
  WITH CHECK (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY stored_feed_plan_rows_delete ON public.stored_feed_plan_rows FOR DELETE TO authenticated
  USING (operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

UPDATE public.operations SET schema_version = 52 WHERE schema_version < 52;

COMMIT;
