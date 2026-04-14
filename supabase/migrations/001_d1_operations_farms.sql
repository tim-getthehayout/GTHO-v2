-- Domain 1: Operation & Farm Setup
-- Source: V2_SCHEMA_DESIGN.md §1.1–§1.5

-- §1.1 operations
CREATE TABLE operations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  timezone    text,
  currency    text NOT NULL DEFAULT 'USD',
  archived    boolean DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY operations_select ON operations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM operation_members
    WHERE operation_members.operation_id = operations.id
    AND operation_members.user_id = auth.uid()
    AND operation_members.accepted_at IS NOT NULL
  ));

CREATE POLICY operations_insert ON operations FOR INSERT
  WITH CHECK (true);

CREATE POLICY operations_update ON operations FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM operation_members
    WHERE operation_members.operation_id = operations.id
    AND operation_members.user_id = auth.uid()
    AND operation_members.accepted_at IS NOT NULL
    AND operation_members.role IN ('owner', 'admin')
  ));

CREATE POLICY operations_delete ON operations FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM operation_members
    WHERE operation_members.operation_id = operations.id
    AND operation_members.user_id = auth.uid()
    AND operation_members.accepted_at IS NOT NULL
    AND operation_members.role = 'owner'
  ));

-- §1.2 farms
CREATE TABLE farms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  address         text,
  latitude        numeric,
  longitude       numeric,
  area_hectares   numeric,
  notes           text,
  archived        boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE farms ENABLE ROW LEVEL SECURITY;

-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY farms_insert ON farms FOR INSERT
  WITH CHECK (true);

CREATE POLICY farms_select ON farms FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY farms_update ON farms FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY farms_delete ON farms FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §1.3 farm_settings
CREATE TABLE farm_settings (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                         uuid NOT NULL UNIQUE REFERENCES farms(id) ON DELETE CASCADE,
  operation_id                    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,

  -- Grazing management (Tier 3 fallbacks)
  default_au_weight_kg            numeric NOT NULL DEFAULT 454,
  default_residual_height_cm      numeric NOT NULL DEFAULT 10,
  default_utilization_pct         numeric NOT NULL DEFAULT 65,
  recovery_required               boolean NOT NULL DEFAULT false,
  default_recovery_min_days       integer NOT NULL DEFAULT 21,
  default_recovery_max_days       integer NOT NULL DEFAULT 60,

  -- Economics (per-farm — freight differentials)
  n_price_per_kg                  numeric NOT NULL DEFAULT 1.21,
  p_price_per_kg                  numeric NOT NULL DEFAULT 1.43,
  k_price_per_kg                  numeric NOT NULL DEFAULT 0.93,

  -- Manure
  default_manure_rate_kg_per_day  numeric NOT NULL DEFAULT 27,

  -- Feed planning
  feed_day_goal                   integer NOT NULL DEFAULT 90,

  -- Survey scales
  forage_quality_scale_min        numeric NOT NULL DEFAULT 1,
  forage_quality_scale_max        numeric NOT NULL DEFAULT 100,

  -- Thresholds
  threshold_aud_target_pct        numeric NOT NULL DEFAULT 80,
  threshold_aud_warn_pct          numeric NOT NULL DEFAULT 60,
  threshold_rotation_target_pct   numeric NOT NULL DEFAULT 80,
  threshold_rotation_warn_pct     numeric NOT NULL DEFAULT 60,
  threshold_npk_warn_per_ha       numeric,
  threshold_cost_per_day_target   numeric,
  threshold_cost_per_day_warn     numeric,

  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE farm_settings ENABLE ROW LEVEL SECURITY;

-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY farm_settings_insert ON farm_settings FOR INSERT
  WITH CHECK (true);

CREATE POLICY farm_settings_select ON farm_settings FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY farm_settings_update ON farm_settings FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY farm_settings_delete ON farm_settings FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §1.4 operation_members
CREATE TABLE operation_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id),
  display_name    text NOT NULL,
  email           text NOT NULL,
  phone           text,
  role            text NOT NULL DEFAULT 'team_member'
                    CHECK (role IN ('owner', 'admin', 'team_member')),
  invited_at      timestamptz,
  accepted_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE operation_members ENABLE ROW LEVEL SECURITY;

-- Fixed: original FOR ALL policy caused infinite recursion (OI-0053, migration 017)
CREATE POLICY operation_members_select ON operation_members FOR SELECT
  USING (user_id = auth.uid() OR operation_id IN (
    SELECT om.operation_id FROM operation_members om
    WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
  ));

CREATE POLICY operation_members_insert ON operation_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR operation_id IN (
      SELECT om.operation_id FROM operation_members om
      WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY operation_members_update ON operation_members FOR UPDATE
  USING (operation_id IN (
    SELECT om.operation_id FROM operation_members om
    WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
    AND om.role IN ('owner', 'admin')
  ));

CREATE POLICY operation_members_delete ON operation_members FOR DELETE
  USING (operation_id IN (
    SELECT om.operation_id FROM operation_members om
    WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
    AND om.role = 'owner'
  ));

-- §1.5 user_preferences
CREATE TABLE user_preferences (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id              uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  user_id                   uuid NOT NULL REFERENCES auth.users(id),
  home_view_mode            text NOT NULL DEFAULT 'groups'
                              CHECK (home_view_mode IN ('groups', 'locations')),
  default_view_mode         text NOT NULL DEFAULT 'detail'
                              CHECK (default_view_mode IN ('field', 'detail')),
  stat_period_days          integer NOT NULL DEFAULT 14,
  field_mode_quick_actions  text[],
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, user_id)
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_preferences_select ON user_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY user_preferences_insert ON user_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_preferences_update ON user_preferences FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY user_preferences_delete ON user_preferences FOR DELETE
  USING (user_id = auth.uid());
