-- Migration 020: Fix operation_members RLS infinite recursion (OI-0058)
-- Migration 017 policies had self-referential subqueries that caused
-- "infinite recursion detected in policy for relation 'operation_members'"
-- on all Supabase reads. Simplified to non-recursive single-user policies.

DROP POLICY IF EXISTS operation_members_select ON operation_members;
CREATE POLICY operation_members_select ON operation_members FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS operation_members_insert ON operation_members;
CREATE POLICY operation_members_insert ON operation_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS operation_members_update ON operation_members;
CREATE POLICY operation_members_update ON operation_members FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS operation_members_delete ON operation_members;
CREATE POLICY operation_members_delete ON operation_members FOR DELETE
  USING (user_id = auth.uid());

UPDATE operations SET schema_version = 20;
