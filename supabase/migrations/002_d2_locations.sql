-- Domain 2: Locations
-- Source: V2_SCHEMA_DESIGN.md §2.1–§2.2

-- §2.2 forage_types (created first — locations references it)
CREATE TABLE forage_types (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id           uuid NOT NULL REFERENCES operations(id),
  name                   text NOT NULL,
  dm_pct                 numeric,
  n_per_tonne_dm         numeric,
  p_per_tonne_dm         numeric,
  k_per_tonne_dm         numeric,
  dm_kg_per_cm_per_ha    numeric,
  min_residual_height_cm numeric,
  utilization_pct        numeric,
  notes                  text,
  is_seeded              boolean DEFAULT false,
  archived               boolean DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE forage_types ENABLE ROW LEVEL SECURITY;

-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY forage_types_insert ON forage_types FOR INSERT
  WITH CHECK (true);

CREATE POLICY forage_types_select ON forage_types FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY forage_types_update ON forage_types FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY forage_types_delete ON forage_types FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §2.1 locations
CREATE TABLE locations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  farm_id         uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name            text NOT NULL,
  type            text NOT NULL CHECK (type IN ('confinement', 'land')),
  land_use        text CHECK (land_use IN ('pasture', 'mixed_use', 'crop') OR land_use IS NULL),
  area_hectares   numeric,
  field_code      text,
  soil_type       text,
  forage_type_id  uuid REFERENCES forage_types(id),
  capture_percent numeric,
  archived        boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY locations_insert ON locations FOR INSERT
  WITH CHECK (true);

CREATE POLICY locations_select ON locations FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY locations_update ON locations FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY locations_delete ON locations FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));
