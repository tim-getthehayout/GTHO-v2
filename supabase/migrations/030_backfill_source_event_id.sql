-- Migration 030 — Backfill events.source_event_id for existing same-farm
-- rotations.
--
-- Origin: OI-0122. Before the code fix at move-wizard.js:680, same-farm
-- rotation moves set source_event_id = NULL. The DMI-8 chart's date-routing
-- bridge (dmi-chart-context.js:140-142) relies on source_event_id to route
-- chart days that pre-date the current event to the prior event's cascade.
-- Without it, pre-start days render as blank bars.
--
-- Backfill strategy: walk the event_group_windows graph. For each event with
-- source_event_id = NULL, find the set of prior group windows (same group_id)
-- whose date_left exactly equals this event's date_joined. If every group
-- that joined the new event came from exactly one same source event, we
-- have an unambiguous inference and we set source_event_id to that event.
-- Skip:
--   - Ambiguous cases (groups came from different source events, e.g. a
--     join of two prior events into one).
--   - Events with no matching prior windows (legitimate first events).
--   - Self-referential / cycle pairs: require source_start < target_start
--     (strict inequality) so a same-day cycle pair stays NULL.
--
-- Dry-run against live Supabase on 2026-04-20 produced 13 backfilled rows,
-- 2 ambiguous skipped (8f15a4ab, b23f20c2), and excluded three via the
-- cycle guard: the Corral pair 7e88a2d4 ↔ 8fca7c26 (both opened 2026-03-19)
-- and event 52bca23d whose inferred source starts 2026-04-13 but the target
-- itself starts 2026-03-24 (reverse-order inference).

WITH candidates AS (
  SELECT
    gw_new.event_id AS target_id,
    (array_agg(DISTINCT gw_prev.event_id::text))[1]::uuid AS inferred_source_id
  FROM event_group_windows gw_new
  JOIN event_group_windows gw_prev
    ON gw_prev.group_id = gw_new.group_id
    AND gw_prev.event_id != gw_new.event_id
    AND gw_prev.date_left = gw_new.date_joined
  JOIN events e ON e.id = gw_new.event_id
  WHERE e.source_event_id IS NULL
  GROUP BY gw_new.event_id
  HAVING COUNT(DISTINCT gw_prev.event_id) = 1
),
ordered AS (
  SELECT
    c.target_id,
    c.inferred_source_id,
    (SELECT MIN(date_opened) FROM event_paddock_windows WHERE event_id = c.target_id) AS target_start,
    (SELECT MIN(date_opened) FROM event_paddock_windows WHERE event_id = c.inferred_source_id) AS source_start
  FROM candidates c
)
UPDATE events e
SET source_event_id = o.inferred_source_id,
    updated_at = now()
FROM ordered o
WHERE e.id = o.target_id
  AND e.source_event_id IS NULL
  AND o.source_start IS NOT NULL
  AND o.target_start IS NOT NULL
  AND o.source_start < o.target_start;

UPDATE operations SET schema_version = 30;
