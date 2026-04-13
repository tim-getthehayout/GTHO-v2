-- Migration 014: Multi-farm context (GH-5, OI-0015, OI-0019)
-- Add active_farm_id to user_preferences for farm-scoped display filtering.
-- Add source_event_id to events for cross-farm move linkage.

ALTER TABLE user_preferences
  ADD COLUMN active_farm_id uuid NULL REFERENCES farms(id) ON DELETE SET NULL;

ALTER TABLE events
  ADD COLUMN source_event_id uuid NULL REFERENCES events(id) ON DELETE SET NULL;
