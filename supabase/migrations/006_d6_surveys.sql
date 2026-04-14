-- Domain 6: Surveys
-- Source: V2_SCHEMA_DESIGN.md §6.1–§6.3

-- §6.1 surveys
CREATE TABLE surveys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  survey_date     date NOT NULL,
  type            text NOT NULL CHECK (type IN ('bulk', 'single')),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'committed')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY surveys_insert ON surveys FOR INSERT
  WITH CHECK (true);

CREATE POLICY surveys_select ON surveys FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY surveys_update ON surveys FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY surveys_delete ON surveys FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §6.2 survey_draft_entries
CREATE TABLE survey_draft_entries (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id                 uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  location_id               uuid NOT NULL REFERENCES locations(id),
  forage_height_cm          numeric,
  forage_cover_pct          numeric,
  forage_quality            numeric,
  forage_condition          text CHECK (forage_condition IN ('poor', 'fair', 'good', 'excellent') OR forage_condition IS NULL),
  bale_ring_residue_count   integer,
  recovery_min_days         integer,
  recovery_max_days         integer,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE survey_draft_entries ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY survey_draft_entries_insert ON survey_draft_entries FOR INSERT
  WITH CHECK (true);

CREATE POLICY survey_draft_entries_select ON survey_draft_entries FOR SELECT
  USING (survey_id IN (
    SELECT id FROM surveys WHERE operation_id IN (
      SELECT operation_id FROM operation_members
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  ));

CREATE POLICY survey_draft_entries_update ON survey_draft_entries FOR UPDATE
  USING (survey_id IN (
    SELECT id FROM surveys WHERE operation_id IN (
      SELECT operation_id FROM operation_members
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  ));

CREATE POLICY survey_draft_entries_delete ON survey_draft_entries FOR DELETE
  USING (survey_id IN (
    SELECT id FROM surveys WHERE operation_id IN (
      SELECT operation_id FROM operation_members
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  ));

-- §6.3 paddock_observations
CREATE TABLE paddock_observations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id              uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  location_id               uuid NOT NULL REFERENCES locations(id),
  observed_at               timestamptz NOT NULL,
  type                      text NOT NULL CHECK (type IN ('open', 'close')),
  source                    text NOT NULL CHECK (source IN ('event', 'survey')),
  source_id                 uuid,
  forage_height_cm          numeric,
  forage_cover_pct          numeric,
  forage_quality            numeric,
  forage_condition          text CHECK (forage_condition IN ('poor', 'fair', 'good', 'excellent') OR forage_condition IS NULL),
  bale_ring_residue_count   integer,
  residual_height_cm        numeric,
  recovery_min_days         integer,
  recovery_max_days         integer,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE paddock_observations ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY paddock_observations_insert ON paddock_observations FOR INSERT
  WITH CHECK (true);

CREATE POLICY paddock_observations_select ON paddock_observations FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY paddock_observations_update ON paddock_observations FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY paddock_observations_delete ON paddock_observations FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));
