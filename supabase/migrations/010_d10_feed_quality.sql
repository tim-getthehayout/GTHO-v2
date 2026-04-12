-- Domain 10: Feed Quality
-- Source: V2_SCHEMA_DESIGN.md §10.1

CREATE TABLE batch_nutritional_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  batch_id      uuid NOT NULL REFERENCES batches(id),
  tested_at     date NOT NULL,
  source        text NOT NULL,
  dm_pct        numeric,
  protein_pct   numeric,
  adf_pct       numeric,
  ndf_pct       numeric,
  tdn_pct       numeric,
  rfv           numeric,
  n_pct         numeric,
  p_pct         numeric,
  k_pct         numeric,
  ca_pct        numeric,
  mg_pct        numeric,
  s_pct         numeric,
  lab           text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE batch_nutritional_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY batch_nutritional_profiles_all ON batch_nutritional_profiles FOR ALL
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));
