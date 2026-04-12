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
CREATE POLICY events_all ON events FOR ALL
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
CREATE POLICY event_paddock_windows_all ON event_paddock_windows FOR ALL
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
CREATE POLICY event_group_windows_all ON event_group_windows FOR ALL
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
CREATE POLICY event_feed_entries_all ON event_feed_entries FOR ALL
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
CREATE POLICY event_feed_checks_all ON event_feed_checks FOR ALL
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
CREATE POLICY event_feed_check_items_all ON event_feed_check_items FOR ALL
  USING (feed_check_id IN (
    SELECT id FROM event_feed_checks WHERE operation_id IN (
      SELECT operation_id FROM operation_members
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  ));
