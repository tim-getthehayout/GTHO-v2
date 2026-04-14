-- Domain 5: Event System
-- Source: V2_SCHEMA_DESIGN.md §5.1–§5.6

-- §5.1 events
CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  farm_id         uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  date_in         date NOT NULL,
  time_in         text,
  date_out        date,
  time_out        text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY events_insert ON events FOR INSERT
  WITH CHECK (true);

CREATE POLICY events_select ON events FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY events_update ON events FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY events_delete ON events FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §5.2 event_paddock_windows
CREATE TABLE event_paddock_windows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  location_id     uuid NOT NULL REFERENCES locations(id),
  date_opened     date NOT NULL,
  time_opened     text,
  date_closed     date,
  time_closed     text,
  no_pasture      boolean DEFAULT false,
  is_strip_graze  boolean DEFAULT false,
  strip_group_id  uuid,
  area_pct        numeric DEFAULT 100 CHECK (area_pct > 0 AND area_pct <= 100),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_paddock_windows ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY event_paddock_windows_insert ON event_paddock_windows FOR INSERT
  WITH CHECK (true);

CREATE POLICY event_paddock_windows_select ON event_paddock_windows FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY event_paddock_windows_update ON event_paddock_windows FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY event_paddock_windows_delete ON event_paddock_windows FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §5.3 event_group_windows
CREATE TABLE event_group_windows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES groups(id),
  date_joined     date NOT NULL,
  time_joined     text,
  date_left       date,
  time_left       text,
  head_count      integer NOT NULL,
  avg_weight_kg   numeric NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_group_windows ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY event_group_windows_insert ON event_group_windows FOR INSERT
  WITH CHECK (true);

CREATE POLICY event_group_windows_select ON event_group_windows FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY event_group_windows_update ON event_group_windows FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY event_group_windows_delete ON event_group_windows FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §5.4 event_feed_entries
CREATE TABLE event_feed_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  batch_id        uuid NOT NULL REFERENCES batches(id),
  location_id     uuid NOT NULL REFERENCES locations(id),
  date            date NOT NULL,
  time            text,
  quantity        numeric NOT NULL CHECK (quantity > 0),
  source_event_id uuid REFERENCES events(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_feed_entries ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY event_feed_entries_insert ON event_feed_entries FOR INSERT
  WITH CHECK (true);

CREATE POLICY event_feed_entries_select ON event_feed_entries FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY event_feed_entries_update ON event_feed_entries FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY event_feed_entries_delete ON event_feed_entries FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §5.5 event_feed_checks
CREATE TABLE event_feed_checks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date            date NOT NULL,
  time            text,
  is_close_reading boolean DEFAULT false,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_feed_checks ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY event_feed_checks_insert ON event_feed_checks FOR INSERT
  WITH CHECK (true);

CREATE POLICY event_feed_checks_select ON event_feed_checks FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY event_feed_checks_update ON event_feed_checks FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

CREATE POLICY event_feed_checks_delete ON event_feed_checks FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §5.6 event_feed_check_items
CREATE TABLE event_feed_check_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_check_id       uuid NOT NULL REFERENCES event_feed_checks(id) ON DELETE CASCADE,
  batch_id            uuid NOT NULL REFERENCES batches(id),
  location_id         uuid NOT NULL REFERENCES locations(id),
  remaining_quantity  numeric NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_feed_check_items ENABLE ROW LEVEL SECURITY;
-- Updated: FOR ALL policies split to granular INSERT/SELECT/UPDATE/DELETE (OI-0054, migration 018)
CREATE POLICY event_feed_check_items_insert ON event_feed_check_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY event_feed_check_items_select ON event_feed_check_items FOR SELECT
  USING (feed_check_id IN (
    SELECT id FROM event_feed_checks WHERE operation_id IN (
      SELECT operation_id FROM operation_members
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  ));

CREATE POLICY event_feed_check_items_update ON event_feed_check_items FOR UPDATE
  USING (feed_check_id IN (
    SELECT id FROM event_feed_checks WHERE operation_id IN (
      SELECT operation_id FROM operation_members
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  ));

CREATE POLICY event_feed_check_items_delete ON event_feed_check_items FOR DELETE
  USING (feed_check_id IN (
    SELECT id FROM event_feed_checks WHERE operation_id IN (
      SELECT operation_id FROM operation_members
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  ));
