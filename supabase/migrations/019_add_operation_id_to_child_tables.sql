-- Migration 019: Add operation_id to 4 child/junction tables (OI-0055)
-- These tables previously relied on parent FK joins for RLS and delete scoping.
-- Adding direct operation_id enforces Design Principle #8 uniformly.

-- 1. event_feed_check_items: backfill from event_feed_checks
ALTER TABLE event_feed_check_items ADD COLUMN operation_id uuid;

UPDATE event_feed_check_items ci
SET operation_id = fc.operation_id
FROM event_feed_checks fc
WHERE ci.feed_check_id = fc.id;

ALTER TABLE event_feed_check_items ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE event_feed_check_items
  ADD CONSTRAINT event_feed_check_items_operation_id_fkey
  FOREIGN KEY (operation_id) REFERENCES operations(id);

-- 2. harvest_event_fields: backfill from harvest_events
ALTER TABLE harvest_event_fields ADD COLUMN operation_id uuid;

UPDATE harvest_event_fields hf
SET operation_id = he.operation_id
FROM harvest_events he
WHERE hf.harvest_event_id = he.id;

ALTER TABLE harvest_event_fields ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE harvest_event_fields
  ADD CONSTRAINT harvest_event_fields_operation_id_fkey
  FOREIGN KEY (operation_id) REFERENCES operations(id);

-- 3. survey_draft_entries: backfill from surveys
ALTER TABLE survey_draft_entries ADD COLUMN operation_id uuid;

UPDATE survey_draft_entries sde
SET operation_id = s.operation_id
FROM surveys s
WHERE sde.survey_id = s.id;

ALTER TABLE survey_draft_entries ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE survey_draft_entries
  ADD CONSTRAINT survey_draft_entries_operation_id_fkey
  FOREIGN KEY (operation_id) REFERENCES operations(id);

-- 4. todo_assignments: backfill from todos
ALTER TABLE todo_assignments ADD COLUMN operation_id uuid;

UPDATE todo_assignments ta
SET operation_id = t.operation_id
FROM todos t
WHERE ta.todo_id = t.id;

ALTER TABLE todo_assignments ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE todo_assignments
  ADD CONSTRAINT todo_assignments_operation_id_fkey
  FOREIGN KEY (operation_id) REFERENCES operations(id);

-- 5. Replace join-based RLS policies with direct operation_id pattern

-- event_feed_check_items
DROP POLICY IF EXISTS event_feed_check_items_select ON event_feed_check_items;
CREATE POLICY event_feed_check_items_select ON event_feed_check_items FOR SELECT
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS event_feed_check_items_update ON event_feed_check_items;
CREATE POLICY event_feed_check_items_update ON event_feed_check_items FOR UPDATE
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS event_feed_check_items_delete ON event_feed_check_items;
CREATE POLICY event_feed_check_items_delete ON event_feed_check_items FOR DELETE
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

-- harvest_event_fields
DROP POLICY IF EXISTS harvest_event_fields_select ON harvest_event_fields;
CREATE POLICY harvest_event_fields_select ON harvest_event_fields FOR SELECT
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS harvest_event_fields_update ON harvest_event_fields;
CREATE POLICY harvest_event_fields_update ON harvest_event_fields FOR UPDATE
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS harvest_event_fields_delete ON harvest_event_fields;
CREATE POLICY harvest_event_fields_delete ON harvest_event_fields FOR DELETE
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

-- survey_draft_entries
DROP POLICY IF EXISTS survey_draft_entries_select ON survey_draft_entries;
CREATE POLICY survey_draft_entries_select ON survey_draft_entries FOR SELECT
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS survey_draft_entries_update ON survey_draft_entries;
CREATE POLICY survey_draft_entries_update ON survey_draft_entries FOR UPDATE
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS survey_draft_entries_delete ON survey_draft_entries;
CREATE POLICY survey_draft_entries_delete ON survey_draft_entries FOR DELETE
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

-- todo_assignments
DROP POLICY IF EXISTS todo_assignments_select ON todo_assignments;
CREATE POLICY todo_assignments_select ON todo_assignments FOR SELECT
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS todo_assignments_update ON todo_assignments;
CREATE POLICY todo_assignments_update ON todo_assignments FOR UPDATE
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS todo_assignments_delete ON todo_assignments;
CREATE POLICY todo_assignments_delete ON todo_assignments FOR DELETE
  USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()));

-- Bump schema version
UPDATE operations SET schema_version = 19;
