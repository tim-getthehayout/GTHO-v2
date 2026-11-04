-- Feed batches can hold inventory in more than one location.
-- batch_location_balances is the current quantity at each location.
-- batch_moves is the append-only transfer trail (from_location_id null on first placement).
-- event_feed_entries.source_location_id is the storage location a delivery left from.
-- batches.remaining stays the sum of balances, kept in sync by the app.
-- Schema stamp 37. No location_id on batches. Existing batches are not backfilled.

CREATE TABLE batch_location_balances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  batch_id      uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  location_id   uuid NOT NULL REFERENCES locations(id),
  quantity      numeric NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, location_id)
);

CREATE INDEX idx_batch_location_balances_batch ON batch_location_balances (batch_id);

ALTER TABLE batch_location_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY batch_location_balances_insert ON batch_location_balances FOR INSERT
  WITH CHECK (true);

CREATE POLICY batch_location_balances_select ON batch_location_balances FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY batch_location_balances_update ON batch_location_balances FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY batch_location_balances_delete ON batch_location_balances FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE TABLE batch_moves (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id),
  batch_id          uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  from_location_id  uuid REFERENCES locations(id),
  to_location_id    uuid NOT NULL REFERENCES locations(id),
  quantity          numeric NOT NULL,
  moved_at          date NOT NULL DEFAULT CURRENT_DATE,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_batch_moves_batch ON batch_moves (batch_id);

ALTER TABLE batch_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY batch_moves_insert ON batch_moves FOR INSERT
  WITH CHECK (true);

CREATE POLICY batch_moves_select ON batch_moves FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY batch_moves_update ON batch_moves FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY batch_moves_delete ON batch_moves FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

ALTER TABLE event_feed_entries
  ADD COLUMN IF NOT EXISTS source_location_id uuid REFERENCES locations(id);

COMMENT ON COLUMN event_feed_entries.source_location_id IS
  'Storage location the feed left from. Distinct from location_id, which is the delivery paddock.';

UPDATE operations SET schema_version = 37 WHERE schema_version < 37;
