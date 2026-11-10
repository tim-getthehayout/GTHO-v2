-- Regression assertions ONLY for a disposable PostgreSQL fixture with migrations
-- 040 + 041. Never run on a live project. Each block rolls back.

-- Role grants: authenticated may execute; service_role, anon, and PUBLIC may not.
BEGIN;
DO $$
BEGIN
  ASSERT has_function_privilege('authenticated','assistant_discard_empty_start(uuid,uuid)','EXECUTE'),
    'authenticated must execute assistant_discard_empty_start';
  ASSERT NOT has_function_privilege('anon','assistant_discard_empty_start(uuid,uuid)','EXECUTE'),
    'anon must not execute assistant_discard_empty_start';
  ASSERT NOT has_function_privilege('service_role','assistant_discard_empty_start(uuid,uuid)','EXECUTE'),
    'service_role must not execute assistant_discard_empty_start';
END $$;
ROLLBACK;

-- Null auth.uid() raises; non-member is refused.
BEGIN;
DO $$
DECLARE
  op uuid := '00000000-0000-4000-8000-000000000001';
  conv uuid := '00000000-0000-4000-8000-0000000000c1';
  member uuid := '00000000-0000-4000-8000-0000000000a1';
  stranger uuid := '00000000-0000-4000-8000-0000000000a2';
BEGIN
  INSERT INTO auth.users (id) VALUES (member), (stranger);
  INSERT INTO operation_members (operation_id, user_id, accepted_at) VALUES (op, member, now());
  INSERT INTO assistant_conversations (id, operation_id, captured_at, feedback_module_pin, conversation_runtime_pin)
    VALUES (conv, op, now(), '0.1.3', '0.1.1');

  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM assistant_discard_empty_start(op, conv);
    RAISE EXCEPTION 'null uid was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'discard-empty-auth-required' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', stranger::text, true);
  BEGIN
    PERFORM assistant_discard_empty_start(op, conv);
    RAISE EXCEPTION 'non-member was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'discard-empty-membership-required' THEN RAISE; END IF;
  END;

  ASSERT EXISTS (SELECT 1 FROM assistant_conversations WHERE id = conv),
    'refused calls must leave the conversation';
END $$;
ROLLBACK;

-- assistant_testing_consents FK is NO ACTION: deleting the conversation while a
-- consent row remains must fail (the reason 041 deletes consent first).
BEGIN;
DO $$
DECLARE
  op uuid := '00000000-0000-4000-8000-000000000001';
  conv uuid := '00000000-0000-4000-8000-0000000000c1';
  actor uuid := '00000000-0000-4000-8000-0000000000a1';
BEGIN
  INSERT INTO auth.users (id) VALUES (actor);
  INSERT INTO operation_members (operation_id, user_id, accepted_at) VALUES (op, actor, now());
  INSERT INTO assistant_conversations (id, operation_id, captured_at, feedback_module_pin, conversation_runtime_pin)
    VALUES (conv, op, now(), '0.1.3', '0.1.1');
  INSERT INTO assistant_testing_consents (operation_id, conversation_id, actor_id, decision, decided_at)
    VALUES (op, conv, actor, 'accepted', now());
  BEGIN
    DELETE FROM assistant_conversations WHERE id = conv;
    RAISE EXCEPTION 'conversation delete with consent was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
  ASSERT EXISTS (SELECT 1 FROM assistant_conversations WHERE id = conv),
    'FK must block conversation delete while consent remains';
END $$;
ROLLBACK;

-- Happy path: member discard deletes consent/attempt/checkpoint/lock/conversation
-- and leaves billing. Turns-exist refuses and rolls back every row (atomic).
BEGIN;
DO $$
DECLARE
  op uuid := '00000000-0000-4000-8000-000000000001';
  conv uuid := '00000000-0000-4000-8000-0000000000c1';
  actor uuid := '00000000-0000-4000-8000-0000000000a1';
  attempt uuid := '00000000-0000-4000-8000-0000000000b1';
  lease_id uuid := '00000000-0000-4000-8000-0000000000d1';
  outcome text;
BEGIN
  INSERT INTO auth.users (id) VALUES (actor);
  INSERT INTO operation_members (operation_id, user_id, accepted_at) VALUES (op, actor, now());
  INSERT INTO assistant_conversations (id, operation_id, captured_at, feedback_module_pin, conversation_runtime_pin)
    VALUES (conv, op, now(), '0.1.3', '0.1.1');
  INSERT INTO assistant_testing_consents (operation_id, conversation_id, actor_id, decision, decided_at)
    VALUES (op, conv, actor, 'accepted', now());
  INSERT INTO voice_entry_attempts (id, operation_id, conversation_id, captured_at, status, purpose)
    VALUES (attempt, op, conv, now(), 'unfinished', 'write');
  INSERT INTO assistant_session_checkpoints (operation_id, conversation_id, transcript_position, lifecycle_phase, trusted_snapshot)
    VALUES (op, conv, 0, 'cancelled', '{"version": 1}'::jsonb);
  INSERT INTO assistant_session_locks (operation_id, conversation_ref, owner_token)
    VALUES (op, conv::text, gen_random_uuid());
  INSERT INTO assistant_billing_reservations (operation_id, purpose, request_ref, kind, lease, routing)
    VALUES (op, 'feedback', 'discard-empty-keep', 'request', lease_id, 'shared');
  INSERT INTO assistant_billing_usage (operation_id, lease, purpose, audio_minutes, request_count, bill_shared, failed)
    VALUES (op, lease_id, 'feedback', 0, 1, true, false);

  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  SELECT assistant_discard_empty_start(op, conv) INTO outcome;
  ASSERT outcome = 'discarded', 'member discard of an empty start';
  ASSERT NOT EXISTS (SELECT 1 FROM assistant_conversations WHERE id = conv);
  ASSERT NOT EXISTS (SELECT 1 FROM assistant_testing_consents WHERE conversation_id = conv);
  ASSERT NOT EXISTS (SELECT 1 FROM voice_entry_attempts WHERE conversation_id = conv);
  ASSERT NOT EXISTS (SELECT 1 FROM assistant_session_checkpoints WHERE conversation_id = conv);
  ASSERT NOT EXISTS (SELECT 1 FROM assistant_session_locks WHERE conversation_ref = conv::text);
  ASSERT (SELECT count(*) FROM assistant_billing_reservations WHERE lease = lease_id) = 1,
    'billing reservation must stay';
  ASSERT (SELECT count(*) FROM assistant_billing_usage WHERE lease = lease_id) = 1,
    'billing usage must stay';
END $$;
ROLLBACK;

BEGIN;
DO $$
DECLARE
  op uuid := '00000000-0000-4000-8000-000000000001';
  conv uuid := '00000000-0000-4000-8000-0000000000c1';
  actor uuid := '00000000-0000-4000-8000-0000000000a1';
BEGIN
  INSERT INTO auth.users (id) VALUES (actor);
  INSERT INTO operation_members (operation_id, user_id, accepted_at) VALUES (op, actor, now());
  INSERT INTO assistant_conversations (id, operation_id, captured_at, feedback_module_pin, conversation_runtime_pin)
    VALUES (conv, op, now(), '0.1.3', '0.1.1');
  INSERT INTO assistant_testing_consents (operation_id, conversation_id, actor_id, decision, decided_at)
    VALUES (op, conv, actor, 'accepted', now());
  INSERT INTO assistant_transcript_turns (operation_id, conversation_id, turn_index, speaker, text, input_mode)
    VALUES (op, conv, 0, 'user', 'already started', 'voice');

  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  BEGIN
    PERFORM assistant_discard_empty_start(op, conv);
    RAISE EXCEPTION 'turns-exist was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'discard-empty-refused-turns-exist' THEN RAISE; END IF;
  END;
  ASSERT EXISTS (SELECT 1 FROM assistant_conversations WHERE id = conv),
    'turns-exist must roll back conversation delete';
  ASSERT EXISTS (SELECT 1 FROM assistant_testing_consents WHERE conversation_id = conv),
    'turns-exist must roll back consent delete';
  ASSERT EXISTS (SELECT 1 FROM assistant_transcript_turns WHERE conversation_id = conv);
END $$;
ROLLBACK;
