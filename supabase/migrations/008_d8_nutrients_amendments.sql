-- Domain 8: Nutrients & Amendments
-- Source: V2_SCHEMA_DESIGN.md §8.1–§8.10

-- §8.1 input_product_categories
CREATE TABLE input_product_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  is_default    boolean DEFAULT false,
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE input_product_categories ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY input_product_categories_insert ON input_product_categories FOR INSERT
  WITH CHECK (true);

CREATE POLICY input_product_categories_select ON input_product_categories FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY input_product_categories_update ON input_product_categories FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY input_product_categories_delete ON input_product_categories FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §8.2 input_product_units
CREATE TABLE input_product_units (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  archived    boolean DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- No RLS — shared reference table

-- §8.3 input_products
CREATE TABLE input_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  category_id   uuid NOT NULL REFERENCES input_product_categories(id),
  n_pct         numeric,
  p_pct         numeric,
  k_pct         numeric,
  s_pct         numeric,
  ca_pct        numeric,
  mg_pct        numeric,
  cu_pct        numeric,
  fe_pct        numeric,
  mn_pct        numeric,
  mo_pct        numeric,
  zn_pct        numeric,
  b_pct         numeric,
  cl_pct        numeric,
  cost_per_unit numeric,
  unit_id       uuid REFERENCES input_product_units(id),
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE input_products ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY input_products_insert ON input_products FOR INSERT
  WITH CHECK (true);

CREATE POLICY input_products_select ON input_products FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY input_products_update ON input_products FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY input_products_delete ON input_products FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §8.4 spreaders
CREATE TABLE spreaders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  capacity_kg   numeric NOT NULL,
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spreaders ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY spreaders_insert ON spreaders FOR INSERT
  WITH CHECK (true);

CREATE POLICY spreaders_select ON spreaders FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY spreaders_update ON spreaders FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY spreaders_delete ON spreaders FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §8.5 soil_tests
CREATE TABLE soil_tests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id),
  location_id       uuid NOT NULL REFERENCES locations(id),
  tested_at         date NOT NULL,
  extraction_method text,
  n                 numeric,
  p                 numeric,
  k                 numeric,
  s                 numeric,
  ca                numeric,
  mg                numeric,
  cu                numeric,
  fe                numeric,
  mn                numeric,
  mo                numeric,
  zn                numeric,
  b                 numeric,
  cl                numeric,
  unit              text NOT NULL,
  ph                numeric,
  buffer_ph         numeric,
  cec               numeric,
  base_saturation   numeric,
  organic_matter    numeric,
  lab               text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE soil_tests ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY soil_tests_insert ON soil_tests FOR INSERT
  WITH CHECK (true);

CREATE POLICY soil_tests_select ON soil_tests FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY soil_tests_update ON soil_tests FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY soil_tests_delete ON soil_tests FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §8.8 manure_batches (created before amendments due to FK)
CREATE TABLE manure_batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id        uuid NOT NULL REFERENCES operations(id),
  label               text NOT NULL,
  source_location_id  uuid REFERENCES locations(id),
  estimated_volume_kg numeric,
  n_kg                numeric,
  p_kg                numeric,
  k_kg                numeric,
  s_kg                numeric,
  ca_kg               numeric,
  mg_kg               numeric,
  cu_kg               numeric,
  fe_kg               numeric,
  mn_kg               numeric,
  mo_kg               numeric,
  zn_kg               numeric,
  b_kg                numeric,
  cl_kg               numeric,
  capture_date        date,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE manure_batches ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY manure_batches_insert ON manure_batches FOR INSERT
  WITH CHECK (true);

CREATE POLICY manure_batches_select ON manure_batches FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY manure_batches_update ON manure_batches FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY manure_batches_delete ON manure_batches FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §8.6 amendments
CREATE TABLE amendments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id     uuid NOT NULL REFERENCES operations(id),
  applied_at       timestamptz NOT NULL,
  source_type      text NOT NULL,
  input_product_id uuid REFERENCES input_products(id),
  manure_batch_id  uuid REFERENCES manure_batches(id),
  spreader_id      uuid REFERENCES spreaders(id),
  total_qty        numeric,
  qty_unit_id      uuid REFERENCES input_product_units(id),
  cost_override    numeric,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE amendments ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY amendments_insert ON amendments FOR INSERT
  WITH CHECK (true);

CREATE POLICY amendments_select ON amendments FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY amendments_update ON amendments FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY amendments_delete ON amendments FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §8.7 amendment_locations
CREATE TABLE amendment_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  amendment_id  uuid NOT NULL REFERENCES amendments(id),
  location_id   uuid NOT NULL REFERENCES locations(id),
  qty           numeric,
  n_kg          numeric,
  p_kg          numeric,
  k_kg          numeric,
  s_kg          numeric,
  ca_kg         numeric,
  mg_kg         numeric,
  cu_kg         numeric,
  fe_kg         numeric,
  mn_kg         numeric,
  mo_kg         numeric,
  zn_kg         numeric,
  b_kg          numeric,
  cl_kg         numeric,
  area_ha       numeric,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE amendment_locations ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY amendment_locations_insert ON amendment_locations FOR INSERT
  WITH CHECK (true);

CREATE POLICY amendment_locations_select ON amendment_locations FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY amendment_locations_update ON amendment_locations FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY amendment_locations_delete ON amendment_locations FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §8.9 manure_batch_transactions
CREATE TABLE manure_batch_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id     uuid NOT NULL REFERENCES operations(id),
  batch_id         uuid NOT NULL REFERENCES manure_batches(id),
  type             text NOT NULL,
  transaction_date date NOT NULL,
  volume_kg        numeric NOT NULL,
  source_event_id  uuid REFERENCES events(id),
  amendment_id     uuid REFERENCES amendments(id),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE manure_batch_transactions ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY manure_batch_transactions_insert ON manure_batch_transactions FOR INSERT
  WITH CHECK (true);

CREATE POLICY manure_batch_transactions_select ON manure_batch_transactions FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY manure_batch_transactions_update ON manure_batch_transactions FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY manure_batch_transactions_delete ON manure_batch_transactions FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §8.10 npk_price_history
CREATE TABLE npk_price_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  operation_id     uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  effective_date   date NOT NULL,
  n_price_per_kg   numeric NOT NULL,
  p_price_per_kg   numeric NOT NULL,
  k_price_per_kg   numeric NOT NULL,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE npk_price_history ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY npk_price_history_insert ON npk_price_history FOR INSERT
  WITH CHECK (true);

CREATE POLICY npk_price_history_select ON npk_price_history FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY npk_price_history_update ON npk_price_history FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY npk_price_history_delete ON npk_price_history FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));
