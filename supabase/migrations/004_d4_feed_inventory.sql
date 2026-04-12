-- Domain 4: Feed Inventory
-- Source: V2_SCHEMA_DESIGN.md §4.1–§4.3

-- §4.1 feed_types
CREATE TABLE feed_types (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id),
  name              text NOT NULL,
  category          text NOT NULL,
  unit              text NOT NULL,
  dm_pct            numeric,
  n_pct             numeric,
  p_pct             numeric,
  k_pct             numeric,
  default_weight_kg numeric,
  cutting_number    smallint,
  forage_type_id    uuid REFERENCES forage_types(id),
  harvest_active    boolean DEFAULT false,
  archived          boolean DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feed_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY feed_types_all ON feed_types FOR ALL
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §4.2 batches
CREATE TABLE batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id        uuid NOT NULL REFERENCES operations(id),
  feed_type_id        uuid NOT NULL REFERENCES feed_types(id),
  name                text NOT NULL,
  batch_number        text,
  source              text NOT NULL DEFAULT 'purchase',
  quantity            numeric NOT NULL,
  remaining           numeric NOT NULL,
  unit                text NOT NULL,
  weight_per_unit_kg  numeric,
  dm_pct              numeric,
  cost_per_unit       numeric,
  purchase_date       date,
  notes               text,
  archived            boolean DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY batches_all ON batches FOR ALL
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §4.3 batch_adjustments
CREATE TABLE batch_adjustments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  operation_id  uuid NOT NULL REFERENCES operations(id),
  adjusted_by   uuid REFERENCES operation_members(id),
  previous_qty  numeric NOT NULL,
  new_qty       numeric NOT NULL,
  delta         numeric NOT NULL,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE batch_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY batch_adjustments_all ON batch_adjustments FOR ALL
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));
