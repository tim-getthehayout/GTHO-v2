-- Domain 7: Harvest
-- Source: V2_SCHEMA_DESIGN.md §7.1–§7.2

-- §7.1 harvest_events
CREATE TABLE harvest_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  date            date NOT NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE harvest_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY harvest_events_all ON harvest_events FOR ALL
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §7.2 harvest_event_fields
CREATE TABLE harvest_event_fields (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  harvest_event_id    uuid NOT NULL REFERENCES harvest_events(id) ON DELETE CASCADE,
  location_id         uuid NOT NULL REFERENCES locations(id),
  feed_type_id        uuid NOT NULL REFERENCES feed_types(id),
  quantity            numeric NOT NULL,
  weight_per_unit_kg  numeric,
  dm_pct              numeric,
  cutting_number      integer,
  batch_id            uuid REFERENCES batches(id),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE harvest_event_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY harvest_event_fields_all ON harvest_event_fields FOR ALL
  USING (harvest_event_id IN (
    SELECT id FROM harvest_events WHERE operation_id IN (
      SELECT operation_id FROM operation_members
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  ));
