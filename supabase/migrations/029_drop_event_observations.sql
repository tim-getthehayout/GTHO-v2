-- Migration 029: Drop event_observations table (OI-0113)
-- OI-0112 (2026-04-18) migrated all writers to paddock_observations.
-- OI-0119 (2026-04-20) migrated the last reader (DMI-8 chart) to paddock_observations.
-- Pre-drop audit (2026-04-20) confirmed: one pre-OI-0112 orphan row, zero live readers,
-- zero live writers. The event referenced by that row has equivalent pre-graze data in
-- paddock_observations — drop is safe.

DROP TABLE IF EXISTS event_observations CASCADE;

UPDATE operations SET schema_version = 29;
