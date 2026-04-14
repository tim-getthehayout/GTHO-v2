-- Domain 3: Animals & Groups
-- Source: V2_SCHEMA_DESIGN.md §3.1–§3.4
-- Note: ai_bulls FK on animals deferred — created in D9 migration

-- §3.1 animal_classes
CREATE TABLE animal_classes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id),
  name              text NOT NULL,
  species           text NOT NULL CHECK (species IN ('beef_cattle', 'dairy_cattle', 'sheep', 'goat', 'other')),
  role              text NOT NULL,
  default_weight_kg numeric,
  dmi_pct           numeric,
  dmi_pct_lactating numeric,
  excretion_n_rate  numeric,
  excretion_p_rate  numeric,
  excretion_k_rate  numeric,
  weaning_age_days  integer,
  archived          boolean DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE animal_classes ENABLE ROW LEVEL SECURITY;

-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY animal_classes_insert ON animal_classes FOR INSERT
  WITH CHECK (true);

CREATE POLICY animal_classes_select ON animal_classes FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_classes_update ON animal_classes FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_classes_delete ON animal_classes FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §3.2 animals
-- sire_ai_bull_id FK added in 009_d9 migration when ai_bulls table exists
CREATE TABLE animals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id     uuid NOT NULL REFERENCES operations(id),
  class_id         uuid REFERENCES animal_classes(id),
  tag_num          text,
  eid              text,
  name             text,
  sex              text NOT NULL,
  dam_id           uuid REFERENCES animals(id),
  sire_animal_id   uuid REFERENCES animals(id),
  sire_ai_bull_id  uuid,
  birth_date       date,
  weaned           boolean,
  weaned_date      date,
  notes            text,
  active           boolean DEFAULT true,
  cull_date        date,
  cull_reason      text,
  cull_notes       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE animals ENABLE ROW LEVEL SECURITY;

-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY animals_insert ON animals FOR INSERT
  WITH CHECK (true);

CREATE POLICY animals_select ON animals FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animals_update ON animals FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animals_delete ON animals FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §3.3 groups
CREATE TABLE groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  farm_id       uuid NOT NULL REFERENCES farms(id),
  name          text NOT NULL,
  color         text,
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY groups_insert ON groups FOR INSERT
  WITH CHECK (true);

CREATE POLICY groups_select ON groups FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY groups_update ON groups FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY groups_delete ON groups FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §3.4 animal_group_memberships
CREATE TABLE animal_group_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  animal_id     uuid NOT NULL REFERENCES animals(id),
  group_id      uuid NOT NULL REFERENCES groups(id),
  date_joined   date NOT NULL,
  date_left     date,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE animal_group_memberships ENABLE ROW LEVEL SECURITY;

-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY animal_group_memberships_insert ON animal_group_memberships FOR INSERT
  WITH CHECK (true);

CREATE POLICY animal_group_memberships_select ON animal_group_memberships FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_group_memberships_update ON animal_group_memberships FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY animal_group_memberships_delete ON animal_group_memberships FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));
