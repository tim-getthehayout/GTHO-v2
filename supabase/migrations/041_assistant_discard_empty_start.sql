-- Empty voice-start cleanup (mic failure / Type-instead? No).
-- Deletes that conversation's checkpoint, session lock, and voice_entry_attempts
-- only when no transcript turn exists. Never deletes billing or usage rows.
-- Membership: accepted operation_members row for auth.uid(). Fixed search_path.
-- APPLY REQUIRES TIM — do not run against a live database from Build.

BEGIN;

CREATE FUNCTION public.assistant_discard_empty_start(p_operation uuid, p_conversation uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_operation IS NULL OR p_conversation IS NULL THEN
    RAISE EXCEPTION 'discard-empty-args-required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.operation_members
    WHERE operation_id = p_operation
      AND user_id = (SELECT auth.uid())
      AND accepted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'discard-empty-membership-required' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.assistant_transcript_turns
    WHERE operation_id = p_operation AND conversation_id = p_conversation
  ) THEN
    RAISE EXCEPTION 'discard-empty-refused-turns-exist';
  END IF;

  -- Never touch assistant_billing_* tables.
  DELETE FROM public.voice_entry_attempts
    WHERE operation_id = p_operation AND conversation_id = p_conversation;
  DELETE FROM public.assistant_session_checkpoints
    WHERE operation_id = p_operation AND conversation_id = p_conversation;
  DELETE FROM public.assistant_session_locks
    WHERE operation_id = p_operation AND conversation_ref = p_conversation::text;
  DELETE FROM public.assistant_conversations
    WHERE operation_id = p_operation AND id = p_conversation;

  RETURN 'discarded';
END;
$$;

REVOKE ALL ON FUNCTION public.assistant_discard_empty_start(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assistant_discard_empty_start(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_discard_empty_start(uuid, uuid) TO service_role;

UPDATE public.operations SET schema_version = 41 WHERE schema_version < 41;

COMMIT;
