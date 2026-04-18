-- OI-0073 Part B: close orphan open event_group_windows.
-- Keep only the most-recent open window per group; close all others by stamping
-- date_left = COALESCE(date_joined, event.date_out, CURRENT_DATE). Coordinated
-- with OI-0091 so no new orphans are generated post-cleanup.
--
-- Ships with: OI-0091 (window-split architecture), OI-0073 (Parts A/B/C).

WITH ranked AS (
  SELECT id, group_id,
         ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY date_joined DESC) AS rn
  FROM event_group_windows
  WHERE date_left IS NULL
)
UPDATE event_group_windows egw
SET date_left = COALESCE(egw.date_joined,
                         (SELECT date_out FROM events WHERE id = egw.event_id),
                         CURRENT_DATE),
    time_left = NULL
FROM ranked r
WHERE egw.id = r.id AND r.rn > 1;

UPDATE operations SET schema_version = 25;
