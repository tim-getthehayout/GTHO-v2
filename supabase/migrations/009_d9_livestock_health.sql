-- Domain 9: Livestock Health
-- Source: V2_SCHEMA_DESIGN.md §9.1–§9.10

-- §9.1 ai_bulls
CREATE TABLE ai_bulls (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  breed         text,
  tag           text,
  reg_num       text,
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_bulls ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY ai_bulls_insert ON ai_bulls FOR INSERT
  WITH CHECK (true);

CREATE POLICY ai_bulls_select ON ai_bulls FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY ai_bulls_update ON ai_bulls FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY ai_bulls_delete ON ai_bulls FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- Add deferred FK from animals.sire_ai_bull_id
ALTER TABLE animals ADD CONSTRAINT animals_sire_ai_bull_id_fkey
  FOREIGN KEY (sire_ai_bull_id) REFERENCES ai_bulls(id);

-- §9.2 treatment_categories
CREATE TABLE treatment_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  is_default    boolean DEFAULT false,
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE treatment_categories ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY treatment_categories_insert ON treatment_categories FOR INSERT
  WITH CHECK (true);

CREATE POLICY treatment_categories_select ON treatment_categories FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY treatment_categories_update ON treatment_categories FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY treatment_categories_delete ON treatment_categories FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §9.3 treatment_types
CREATE TABLE treatment_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  category_id   uuid NOT NULL REFERENCES treatment_categories(id),
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE treatment_types ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY treatment_types_insert ON treatment_types FOR INSERT
  WITH CHECK (true);

CREATE POLICY treatment_types_select ON treatment_types FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY treatment_types_update ON treatment_types FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY treatment_types_delete ON treatment_types FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §9.4 dose_units
CREATE TABLE dose_units (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  archived    boolean DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- No RLS — shared reference table

-- §9.5 animal_bcs_scores
CREATE TABLE animal_bcs_scores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  animal_id     uuid NOT NULL REFERENCES animals(id),
  scored_at     timestamptz NOT NULL,
  score         numeric NOT NULL,
  likely_cull   boolean DEFAULT false,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE animal_bcs_scores ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY animal_bcs_scores_insert ON animal_bcs_scores FOR INSERT
  WITH CHECK (true);

CREATE POLICY animal_bcs_scores_select ON animal_bcs_scores FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_bcs_scores_update ON animal_bcs_scores FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_bcs_scores_delete ON animal_bcs_scores FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §9.6 animal_treatments
CREATE TABLE animal_treatments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id),
  animal_id         uuid NOT NULL REFERENCES animals(id),
  treatment_type_id uuid REFERENCES treatment_types(id),
  treated_at        timestamptz NOT NULL,
  product           text,
  dose_amount       numeric,
  dose_unit_id      uuid REFERENCES dose_units(id),
  withdrawal_date   date,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE animal_treatments ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY animal_treatments_insert ON animal_treatments FOR INSERT
  WITH CHECK (true);

CREATE POLICY animal_treatments_select ON animal_treatments FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_treatments_update ON animal_treatments FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_treatments_delete ON animal_treatments FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §9.7 animal_breeding_records
CREATE TABLE animal_breeding_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id     uuid NOT NULL REFERENCES operations(id),
  animal_id        uuid NOT NULL REFERENCES animals(id),
  bred_at          timestamptz NOT NULL,
  method           text NOT NULL,
  sire_animal_id   uuid REFERENCES animals(id),
  sire_ai_bull_id  uuid REFERENCES ai_bulls(id),
  semen_id         text,
  technician       text,
  expected_calving date,
  confirmed_date   date,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE animal_breeding_records ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY animal_breeding_records_insert ON animal_breeding_records FOR INSERT
  WITH CHECK (true);

CREATE POLICY animal_breeding_records_select ON animal_breeding_records FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_breeding_records_update ON animal_breeding_records FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_breeding_records_delete ON animal_breeding_records FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §9.8 animal_heat_records
CREATE TABLE animal_heat_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  animal_id     uuid NOT NULL REFERENCES animals(id),
  observed_at   timestamptz NOT NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE animal_heat_records ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY animal_heat_records_insert ON animal_heat_records FOR INSERT
  WITH CHECK (true);

CREATE POLICY animal_heat_records_select ON animal_heat_records FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_heat_records_update ON animal_heat_records FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_heat_records_delete ON animal_heat_records FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §9.9 animal_calving_records
CREATE TABLE animal_calving_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id     uuid NOT NULL REFERENCES operations(id),
  dam_id           uuid NOT NULL REFERENCES animals(id),
  calf_id          uuid REFERENCES animals(id),
  calved_at        timestamptz NOT NULL,
  sire_animal_id   uuid REFERENCES animals(id),
  sire_ai_bull_id  uuid REFERENCES ai_bulls(id),
  stillbirth       boolean DEFAULT false,
  dried_off_date   date,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE animal_calving_records ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY animal_calving_records_insert ON animal_calving_records FOR INSERT
  WITH CHECK (true);

CREATE POLICY animal_calving_records_select ON animal_calving_records FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_calving_records_update ON animal_calving_records FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_calving_records_delete ON animal_calving_records FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §9.10 animal_weight_records
CREATE TABLE animal_weight_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  animal_id     uuid NOT NULL REFERENCES animals(id),
  recorded_at   timestamptz NOT NULL,
  weight_kg     numeric NOT NULL,
  source        text NOT NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE animal_weight_records ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY animal_weight_records_insert ON animal_weight_records FOR INSERT
  WITH CHECK (true);

CREATE POLICY animal_weight_records_select ON animal_weight_records FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_weight_records_update ON animal_weight_records FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_weight_records_delete ON animal_weight_records FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));
