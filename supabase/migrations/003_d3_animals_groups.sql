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

CREATE POLICY animal_classes_all ON animal_classes FOR ALL
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

CREATE POLICY animals_all ON animals FOR ALL
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

CREATE POLICY groups_all ON groups FOR ALL
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

CREATE POLICY animal_group_memberships_all ON animal_group_memberships FOR ALL
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));
