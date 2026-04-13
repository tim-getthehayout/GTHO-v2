-- Migration 013: Add unit_system column to operations (A44)
-- Display unit preference. Storage is always metric; this controls display only.
ALTER TABLE operations
  ADD COLUMN unit_system text NOT NULL DEFAULT 'imperial'
    CHECK (unit_system IN ('metric', 'imperial'));
