-- Empty voice-start cleanup (mic failure / Type-instead? No).
-- Atomic: restore-fence admission, conversation row lock, then delete that
-- conversation's testing consent, voice_entry_attempts, checkpoint, session
-- lock, and the empty conversation — only when no transcript turn exists.
-- Never deletes billing or usage rows. Membership: accepted operation_members
-- for auth.uid() (browser); service_role (edge after createIdentity) allowed
-- because the edge client has no user JWT. Fixed search_path.
-- APPLY REQUIRES TIM — do not run against a live database from Build.

BEGIN;

CREATE OR REPLACE FUNCTION public.assistant_discard_empty_start(p_operation uuid, p_conversation uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  locked_id uuid;
BEGIN
  IF p_operation IS NULL OR p_conversation IS NULL THEN
    RAISE EXCEPTION 'discard-empty-args-required';
  END IF;

  -- Browser JWT: require accepted membership. Edge service-role client has no
  -- auth.uid(); createIdentity already verified membership before this RPC.
  IF (SELECT auth.uid()) IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.operation_members
      WHERE operation_id = p_operation
        AND user_id = (SELECT auth.uid())
        AND accepted_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'discard-empty-membership-required' USING ERRCODE = '42501';
    END IF;
  ELSIF coalesce((SELECT auth.role()), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'discard-empty-membership-required' USING ERRCODE = '42501';
  END IF;

  -- Upfront restore-fence admission (same helper as other assistant writers).
  PERFORM public.assistant_assert_restore_unfenced(p_operation);

  -- Serialize on the conversation row (or no-op if already gone).
  SELECT c.id INTO locked_id
  FROM public.assistant_conversations c
  WHERE c.operation_id = p_operation AND c.id = p_conversation
  FOR UPDATE;
  IF locked_id IS NULL THEN
    RETURN 'discarded';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.assistant_transcript_turns
    WHERE operation_id = p_operation AND conversation_id = p_conversation
  ) THEN
    RAISE EXCEPTION 'discard-empty-refused-turns-exist';
  END IF;

  -- Never touch assistant_billing_* tables.
  -- Consent first: assistant_testing_consents FK is NO ACTION on conversation.
  DELETE FROM public.assistant_testing_consents
    WHERE operation_id = p_operation AND conversation_id = p_conversation;
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
-- Edge compose uses the service-role supabase-js client exclusively (function
-- secrets expose SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEYS, not the anon
-- key), so the production discard-empty path cannot invoke this RPC without
-- service_role EXECUTE. Membership is verified by createIdentity before the call.
GRANT EXECUTE ON FUNCTION public.assistant_discard_empty_start(uuid, uuid) TO service_role;

UPDATE public.operations SET schema_version = 41 WHERE schema_version < 41;

COMMIT;
