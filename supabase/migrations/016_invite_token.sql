-- Migration 016: invite_token on operation_members + claim RPCs (CP-66)
-- Adds shareable invite link support for member management.

-- 1. Add invite_token column
ALTER TABLE operation_members
  ADD COLUMN invite_token uuid UNIQUE;

-- 2. Token-based invite claim (primary path — shareable link)
CREATE OR REPLACE FUNCTION claim_invite_by_token(p_token uuid, p_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE operation_members
  SET user_id = p_user_id,
      accepted_at = now(),
      invite_token = NULL,
      updated_at = now()
  WHERE invite_token = p_token
    AND user_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Email-based invite claim (fallback — v1 parity)
CREATE OR REPLACE FUNCTION claim_pending_invite(p_email text, p_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE operation_members
  SET user_id = p_user_id,
      accepted_at = now(),
      invite_token = NULL,
      updated_at = now()
  WHERE email = p_email
    AND user_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Schema version bump (per §5.11a convention)
UPDATE operations SET schema_version = 16;
