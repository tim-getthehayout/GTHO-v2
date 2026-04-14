-- Migration 017: Fix operation_members RLS infinite recursion (OI-0053)
-- Also disables RLS on lookup tables without operation_id.

-- 1. Drop the broken FOR ALL policy (self-referential → infinite recursion)
DROP POLICY IF EXISTS operation_members_all ON operation_members;

-- 2. Granular replacement policies

-- SELECT: see your own row + members of operations you belong to
CREATE POLICY operation_members_select ON operation_members FOR SELECT
  USING (user_id = auth.uid() OR operation_id IN (
    SELECT om.operation_id FROM operation_members om
    WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
  ));

-- INSERT: insert yourself (onboarding bootstrap) or invite if you're owner/admin
CREATE POLICY operation_members_insert ON operation_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR operation_id IN (
      SELECT om.operation_id FROM operation_members om
      WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
      AND om.role IN ('owner', 'admin')
    )
  );

-- UPDATE: owner/admin can update members in their operations
CREATE POLICY operation_members_update ON operation_members FOR UPDATE
  USING (operation_id IN (
    SELECT om.operation_id FROM operation_members om
    WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
    AND om.role IN ('owner', 'admin')
  ));

-- DELETE: only owner can remove members
CREATE POLICY operation_members_delete ON operation_members FOR DELETE
  USING (operation_id IN (
    SELECT om.operation_id FROM operation_members om
    WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
    AND om.role = 'owner'
  ));

-- 3. Disable RLS on standalone lookup tables (no operation_id column)
ALTER TABLE dose_units DISABLE ROW LEVEL SECURITY;
ALTER TABLE input_product_units DISABLE ROW LEVEL SECURITY;

-- 4. Schema version bump
UPDATE operations SET schema_version = 17;
