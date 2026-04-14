-- Migration 018: Split FOR ALL RLS policies into granular INSERT/SELECT/UPDATE/DELETE (OI-0054)
-- INSERT uses WITH CHECK (true) so onboarding inserts pass without requiring an existing
-- operation_members row. SELECT/UPDATE/DELETE retain membership checks.

-- Helper: membership subquery used by SELECT/UPDATE/DELETE
-- (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()))

-- ═══════════════════════════════════════════════════════════════════
-- Standard pattern: tables with direct operation_id column
-- ═══════════════════════════════════════════════════════════════════

DO $$ DECLARE
  tbl text;
  prefix text;
BEGIN
  FOR tbl, prefix IN VALUES
    ('farms', 'farms'),
    ('farm_settings', 'farm_settings'),
    ('locations', 'locations'),
    ('forage_types', 'forage_types'),
    ('animal_classes', 'animal_classes'),
    ('animals', 'animals'),
    ('groups', 'groups'),
    ('animal_group_memberships', 'animal_group_memberships'),
    ('feed_types', 'feed_types'),
    ('batches', 'batches'),
    ('batch_adjustments', 'batch_adjustments'),
    ('batch_nutritional_profiles', 'batch_nutritional_profiles'),
    ('events', 'events'),
    ('event_paddock_windows', 'event_paddock_windows'),
    ('event_group_windows', 'event_group_windows'),
    ('event_feed_entries', 'event_feed_entries'),
    ('event_feed_checks', 'event_feed_checks'),
    ('surveys', 'surveys'),
    ('paddock_observations', 'paddock_observations'),
    ('harvest_events', 'harvest_events'),
    ('input_product_categories', 'input_product_categories'),
    ('input_products', 'input_products'),
    ('spreaders', 'spreaders'),
    ('soil_tests', 'soil_tests'),
    ('amendments', 'amendments'),
    ('amendment_locations', 'amendment_locations'),
    ('manure_batches', 'manure_batches'),
    ('manure_batch_transactions', 'manure_batch_transactions'),
    ('npk_price_history', 'npk_price_history'),
    ('ai_bulls', 'ai_bulls'),
    ('treatment_categories', 'treatment_categories'),
    ('treatment_types', 'treatment_types'),
    ('animal_bcs_scores', 'animal_bcs_scores'),
    ('animal_treatments', 'animal_treatments'),
    ('animal_breeding_records', 'animal_breeding_records'),
    ('animal_heat_records', 'animal_heat_records'),
    ('animal_calving_records', 'animal_calving_records'),
    ('animal_weight_records', 'animal_weight_records'),
    ('animal_notes', 'animal_notes'),
    ('submissions', 'submissions'),
    ('todos', 'todos')
  LOOP
    -- Drop the FOR ALL policy
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', prefix || '_all', tbl);

    -- INSERT: any authenticated user can insert (the record's operation_id
    -- ties it to their operation; membership is enforced at app level)
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (true)',
      prefix || '_insert', tbl
    );

    -- SELECT: must be a member of the operation
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()))',
      prefix || '_select', tbl
    );

    -- UPDATE: must be a member
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()))',
      prefix || '_update', tbl
    );

    -- DELETE: must be a member
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = auth.uid()))',
      prefix || '_delete', tbl
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Join pattern: tables without direct operation_id
-- ═══════════════════════════════════════════════════════════════════

-- event_feed_check_items (via feed_check_id → event_feed_checks.operation_id)
DROP POLICY IF EXISTS event_feed_check_items_all ON event_feed_check_items;

CREATE POLICY event_feed_check_items_insert ON event_feed_check_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY event_feed_check_items_select ON event_feed_check_items FOR SELECT
  USING (feed_check_id IN (
    SELECT id FROM event_feed_checks WHERE operation_id IN (
      SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY event_feed_check_items_update ON event_feed_check_items FOR UPDATE
  USING (feed_check_id IN (
    SELECT id FROM event_feed_checks WHERE operation_id IN (
      SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY event_feed_check_items_delete ON event_feed_check_items FOR DELETE
  USING (feed_check_id IN (
    SELECT id FROM event_feed_checks WHERE operation_id IN (
      SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
    )
  ));

-- harvest_event_fields (via harvest_event_id → harvest_events.operation_id)
DROP POLICY IF EXISTS harvest_event_fields_all ON harvest_event_fields;

CREATE POLICY harvest_event_fields_insert ON harvest_event_fields FOR INSERT
  WITH CHECK (true);

CREATE POLICY harvest_event_fields_select ON harvest_event_fields FOR SELECT
  USING (harvest_event_id IN (
    SELECT id FROM harvest_events WHERE operation_id IN (
      SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY harvest_event_fields_update ON harvest_event_fields FOR UPDATE
  USING (harvest_event_id IN (
    SELECT id FROM harvest_events WHERE operation_id IN (
      SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY harvest_event_fields_delete ON harvest_event_fields FOR DELETE
  USING (harvest_event_id IN (
    SELECT id FROM harvest_events WHERE operation_id IN (
      SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
    )
  ));

-- survey_draft_entries (via survey_id → surveys.operation_id)
DROP POLICY IF EXISTS survey_draft_entries_all ON survey_draft_entries;

CREATE POLICY survey_draft_entries_insert ON survey_draft_entries FOR INSERT
  WITH CHECK (true);

CREATE POLICY survey_draft_entries_select ON survey_draft_entries FOR SELECT
  USING (survey_id IN (
    SELECT id FROM surveys WHERE operation_id IN (
      SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY survey_draft_entries_update ON survey_draft_entries FOR UPDATE
  USING (survey_id IN (
    SELECT id FROM surveys WHERE operation_id IN (
      SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY survey_draft_entries_delete ON survey_draft_entries FOR DELETE
  USING (survey_id IN (
    SELECT id FROM surveys WHERE operation_id IN (
      SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
    )
  ));

-- todo_assignments (via todo_id → todos.operation_id)
DROP POLICY IF EXISTS todo_assignments_all ON todo_assignments;

CREATE POLICY todo_assignments_insert ON todo_assignments FOR INSERT
  WITH CHECK (true);

CREATE POLICY todo_assignments_select ON todo_assignments FOR SELECT
  USING (todo_id IN (
    SELECT id FROM todos WHERE operation_id IN (
      SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY todo_assignments_update ON todo_assignments FOR UPDATE
  USING (todo_id IN (
    SELECT id FROM todos WHERE operation_id IN (
      SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY todo_assignments_delete ON todo_assignments FOR DELETE
  USING (todo_id IN (
    SELECT id FROM todos WHERE operation_id IN (
      SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
    )
  ));

-- Schema version bump
UPDATE operations SET schema_version = 18;
