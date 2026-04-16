-- Migration 021: Create event_observations table (OI-0063, SP-2)
-- Aligns with paddock_observations so pre-graze observations during an event
-- capture the same pasture-assessment fields, plus post-graze-only fields.

CREATE TABLE IF NOT EXISTS event_observations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id         uuid NOT NULL REFERENCES operations(id),
  event_id             uuid NOT NULL REFERENCES events(id),
  paddock_window_id    uuid REFERENCES event_paddock_windows(id),
  observation_phase    text CHECK (observation_phase IN ('pre_graze', 'post_graze')),
  forage_height_cm     numeric(6,2),
  forage_cover_pct     numeric(5,2),
  forage_quality       integer CHECK (forage_quality IS NULL OR (forage_quality >= 1 AND forage_quality <= 100)),
  forage_condition     text CHECK (forage_condition IS NULL OR forage_condition IN ('dry', 'fair', 'good', 'lush')),
  stored_feed_only     boolean NOT NULL DEFAULT false,
  post_graze_height_cm numeric(6,2),
  recovery_min_days    integer,
  recovery_max_days    integer,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_observations ENABLE ROW LEVEL SECURITY;

-- Granular RLS policies (per OI-0054 pattern)
CREATE POLICY event_observations_insert ON event_observations FOR INSERT
  WITH CHECK (true);

CREATE POLICY event_observations_select ON event_observations FOR SELECT
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

CREATE POLICY event_observations_update ON event_observations FOR UPDATE
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

CREATE POLICY event_observations_delete ON event_observations FOR DELETE
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

UPDATE operations SET schema_version = 21;
