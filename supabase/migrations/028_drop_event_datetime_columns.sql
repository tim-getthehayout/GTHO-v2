-- OI-0117: event start datetime becomes derived from the earliest child window
-- (event_paddock_windows.date_opened / event_group_windows.date_joined). The
-- stored columns `events.date_in` and `events.time_in` are dropped — they were
-- a second source of truth that could drift from the child windows (OI-0115
-- was exactly that class of bug).
--
-- Pre-check: log any event whose stored date_in disagrees with MIN(child opening)
-- so we keep an audit trail of OI-0115 corruption victims before the column
-- goes away.

WITH event_min AS (
  SELECT
    e.id AS event_id,
    e.date_in AS stored_date_in,
    e.time_in AS stored_time_in,
    LEAST(
      (SELECT MIN(date_opened) FROM event_paddock_windows WHERE event_id = e.id),
      (SELECT MIN(date_joined) FROM event_group_windows WHERE event_id = e.id)
    ) AS true_date_in
  FROM events e
)
INSERT INTO app_logs (level, source, message, context, operation_id)
SELECT
  'warn',
  'migration.028',
  'OI-0115 drift detected during column drop',
  jsonb_build_object(
    'event_id', event_id,
    'stored_date_in', stored_date_in,
    'stored_time_in', stored_time_in,
    'true_date_in', true_date_in
  ),
  (SELECT operation_id FROM events WHERE id = event_min.event_id)
FROM event_min
WHERE stored_date_in IS DISTINCT FROM true_date_in;

-- Fail-safe notice for events with no child windows — these can't derive a
-- start datetime post-migration. In practice v2's event creation flow always
-- creates a paddock window in the same transaction, so this should be empty.
DO $$
DECLARE
  orphan_count int;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM events e
  WHERE NOT EXISTS (SELECT 1 FROM event_paddock_windows pw WHERE pw.event_id = e.id)
    AND NOT EXISTS (SELECT 1 FROM event_group_windows gw WHERE gw.event_id = e.id);
  IF orphan_count > 0 THEN
    RAISE NOTICE 'OI-0117: % event(s) have no child windows — getEventStart() will return null for these; manual triage required', orphan_count;
  END IF;
END $$;

ALTER TABLE events DROP COLUMN IF EXISTS date_in;
ALTER TABLE events DROP COLUMN IF EXISTS time_in;

UPDATE operations SET schema_version = 28 WHERE schema_version < 28;
