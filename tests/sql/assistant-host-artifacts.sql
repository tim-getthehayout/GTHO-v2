-- Regression assertions ONLY for a disposable PostgreSQL fixture with migration 040.
-- Never run on a live project. Each block rolls back its fixture changes.
BEGIN;
DO $$
DECLARE op uuid := '00000000-0000-4000-8000-000000000001'; lease_id uuid; repeated uuid; n integer; policy assistant_billing_policies;
BEGIN
  ASSERT (SELECT count(*) FROM submission_field_states WHERE field_name IN ('affectedWork','workaround','dataRisk') AND state = 'unknown' AND source = 'host') = 3, 'historical impact unknowns carry explicit host provenance';
  ASSERT NOT EXISTS(SELECT 1 FROM assistant_billing_policies), 'unused operations have no blanket policy seed';
  SELECT lease INTO lease_id FROM assistant_billing_reserve(op,'feedback','first-policy','settlement');
  SELECT * INTO STRICT policy FROM assistant_billing_policies WHERE operation_id = op;
  ASSERT policy.rate_requests = 30 AND policy.rate_window_seconds = 600 AND policy.monthly_requests = 2000 AND policy.monthly_audio_minutes = 600, 'initial mutable policy';
  FOR n IN 1..30 LOOP
    SELECT lease INTO lease_id FROM assistant_billing_reserve(op,'feedback',n::text,'request');
    PERFORM assistant_billing_finish(op,lease_id,'fixture',NULL,0,0,0,1,true,false);
  END LOOP;
  BEGIN
    PERFORM assistant_billing_reserve(op,'feedback','over-rate','request');
    RAISE EXCEPTION 'rate cap failed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'billing-cap-reached' THEN RAISE; END IF; END;
  SELECT lease INTO lease_id FROM assistant_billing_reserve(op,'feedback','settled','settlement');
  SELECT lease INTO repeated FROM assistant_billing_reserve(op,'feedback','settled','settlement');
  ASSERT repeated = lease_id, 'settlement-only retry reuses its lease without provider access';
  PERFORM assistant_billing_finish(op,lease_id,'fixture','verified-provider-session',0,0,0,0,true,false);
  -- Editing configured policy immediately affects enforcement; no hardcoded predicate.
  UPDATE assistant_billing_policies SET rate_requests = rate_requests + 1 WHERE operation_id = op;
  PERFORM assistant_billing_reserve(op,'feedback','configured-rate','request');
  ASSERT (SELECT count(*) FROM assistant_billing_usage WHERE operation_id = op) = 31, 'usage recorded separately';
END $$;
ROLLBACK;
BEGIN;
DO $$
DECLARE op uuid := '00000000-0000-4000-8000-000000000001'; lease_id uuid;
BEGIN
  SELECT lease INTO lease_id FROM assistant_billing_reserve(op,'feedback','monthly','request');
  PERFORM assistant_billing_finish(op,lease_id,'fixture',NULL,0,0,0,2000,true,false);
  BEGIN PERFORM assistant_billing_reserve(op,'feedback','over-month','request'); RAISE EXCEPTION 'monthly cap failed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'billing-cap-reached' THEN RAISE; END IF; END;
  SELECT lease INTO lease_id FROM assistant_billing_reserve(op,'feedback','verified-settlement','settlement');
  PERFORM assistant_billing_finish(op,lease_id,'fixture','provider',0,0,600,0,true,false);
  PERFORM assistant_billing_finish(op,lease_id,'fixture','provider',0,0,600,0,true,false);
  ASSERT (SELECT count(*) FROM assistant_billing_usage WHERE lease = lease_id) = 1, 'finish is idempotent';
  SELECT lease INTO lease_id FROM assistant_billing_reserve(op,'feedback','atomic-delta','settlement');
  ASSERT assistant_billing_settle(op,lease_id,'provider','event','fixture',0,0,0,0);
  ASSERT NOT assistant_billing_settle(op,lease_id,'provider','event','fixture',0,0,0,0);
  ASSERT (SELECT count(*) FROM assistant_billing_settlements WHERE provider_session_ref = 'provider' AND settlement_ref = 'event') = 1;
  ASSERT EXISTS(SELECT 1 FROM assistant_billing_usage WHERE lease = lease_id), 'dedup and usage committed together';
END $$;
ROLLBACK;
BEGIN;
DO $$
-- Unknown usage: never blocks, still one request against rate/monthly caps, adds no audio.
DECLARE op uuid := '00000000-0000-4000-8000-000000000001'; lease_id uuid;
BEGIN
  SELECT lease INTO lease_id FROM assistant_billing_reserve(op,'feedback','unknown-1','request');
  PERFORM assistant_billing_finish(op,lease_id,'fixture',NULL,0,0,0,1,true,true,true);
  ASSERT (SELECT input_tokens IS NULL AND output_tokens IS NULL AND audio_minutes IS NULL AND request_count = 1 FROM assistant_billing_usage WHERE lease = lease_id), 'unknown, never zero';
  UPDATE assistant_billing_policies SET monthly_audio_minutes = 0.001, rate_requests = 3, monthly_requests = 1000 WHERE operation_id = op;
  PERFORM assistant_billing_reserve(op,'feedback','unknown-2','request'); -- unknown audio adds nothing to the audio cap
  PERFORM assistant_billing_reserve(op,'feedback','unknown-3','request');
  BEGIN PERFORM assistant_billing_reserve(op,'feedback','unknown-4','request'); RAISE EXCEPTION 'rate window ignored unknown request';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'billing-cap-reached' THEN RAISE; END IF; END;
  UPDATE assistant_billing_policies SET rate_requests = 1000, monthly_requests = 3 WHERE operation_id = op;
  BEGIN PERFORM assistant_billing_reserve(op,'feedback','unknown-5','request'); RAISE EXCEPTION 'monthly cap ignored unknown request';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'billing-cap-reached' THEN RAISE; END IF; END;
  ASSERT (SELECT count(*) FROM assistant_billing_unreconciled_usage WHERE operation_id = op) = 1, 'listed for reconciliation';
END $$;
ROLLBACK;
BEGIN;
DO $$
DECLARE op uuid := '00000000-0000-4000-8000-000000000001'; lease_id uuid;
BEGIN
  SELECT lease INTO lease_id FROM assistant_billing_reserve(op,'feedback','audio','request');
  PERFORM assistant_billing_finish(op,lease_id,'fixture','provider',0,0,600,0,true,false);
  BEGIN PERFORM assistant_billing_reserve(op,'feedback','over-audio','request'); RAISE EXCEPTION 'audio cap failed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'billing-cap-reached' THEN RAISE; END IF; END;
  PERFORM assistant_billing_reserve(op,'feedback','still-settle','settlement');
END $$;
ROLLBACK;
BEGIN;
DO $$
DECLARE op uuid := '00000000-0000-4000-8000-000000000001'; lease_id uuid; owner uuid := gen_random_uuid(); n integer;
BEGIN
  SELECT count(*) INTO n FROM assistant_lock_acquire(op,'ref',owner); ASSERT n = 1;
  SELECT count(*) INTO n FROM assistant_lock_acquire(op,'ref',gen_random_uuid()); ASSERT n = 0, 'durable exclusivity';
  PERFORM assistant_lock_release(op,'ref',gen_random_uuid()); ASSERT EXISTS(SELECT 1 FROM assistant_session_locks WHERE operation_id = op);
  PERFORM assistant_lock_release(op,'ref',owner); ASSERT NOT EXISTS(SELECT 1 FROM assistant_session_locks WHERE operation_id = op);
  SELECT lease INTO lease_id FROM assistant_billing_reserve(op,'feedback','failure','request');
  PERFORM assistant_billing_finish(op,lease_id,NULL,NULL,0,0,0,1,true,true);
  ASSERT (SELECT input_tokens IS NULL AND output_tokens IS NULL AND audio_minutes IS NULL FROM assistant_billing_usage WHERE lease = lease_id), 'failure is not inferred zero usage';
  -- Unknown usage stays unknown, is listed for reconciliation, and does not block reserve.
  ASSERT (SELECT count(*) FROM assistant_billing_unreconciled_usage WHERE operation_id = op AND lease = lease_id) = 1, 'unknown usage is listed as unreconciled';
  ASSERT (SELECT request_count = 1 FROM assistant_billing_unreconciled_usage WHERE lease = lease_id), 'unknown usage still counts one request';
  PERFORM assistant_billing_reserve(op,'feedback','unreconciled','request');
  ASSERT NOT has_table_privilege('authenticated','assistant_billing_unreconciled_usage','SELECT'), 'no client grant on the unreconciled list';
  ASSERT NOT has_table_privilege('anon','assistant_billing_unreconciled_usage','SELECT'), 'no anon grant on the unreconciled list';
  PERFORM assistant_billing_reserve(op,'feedback','reconcile','settlement');
  PERFORM assistant_billing_reconcile(op,lease_id,'fixture','verified',0,0,0,1);
  ASSERT NOT EXISTS (SELECT 1 FROM assistant_billing_unreconciled_usage WHERE lease = lease_id), 'reconciled usage leaves the list';
  PERFORM assistant_billing_reserve(op,'feedback','after-verification','request');
  -- A failure that never reached a metered provider measured zero usage.
  SELECT lease INTO lease_id FROM assistant_billing_reserve(op,'feedback','pre-provider-failure','request');
  PERFORM assistant_billing_finish(op,lease_id,NULL,NULL,0,0,0,1,true,true,false);
  ASSERT (SELECT input_tokens = 0 AND output_tokens = 0 AND audio_minutes = 0 AND request_count = 1 AND failed FROM assistant_billing_usage WHERE lease = lease_id), 'pre-provider failure is measured zero';
  PERFORM assistant_billing_reserve(op,'feedback','after-pre-provider-failure','request');
  SELECT lease INTO lease_id FROM assistant_billing_reserve(op,'feedback','unmeasured-success','request');
  BEGIN PERFORM assistant_billing_finish(op,lease_id,NULL,NULL,0,0,0,1,true,false,true); RAISE EXCEPTION 'unmeasured success accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'unmeasured-usage-requires-failure' THEN RAISE; END IF; END;
  -- Worst-case voice session settled at token issue: audio cap, no request count.
  SELECT lease INTO lease_id FROM assistant_billing_reserve(op,'voice-session','voice-session:token-record','settlement');
  ASSERT assistant_billing_settle(op,lease_id,'token-record','session-cap-worst-case','voice-model',0,0,10,0), 'worst-case settlement recorded';
  ASSERT (SELECT audio_minutes = 10 AND request_count = 0 FROM assistant_billing_usage WHERE lease = lease_id), 'worst-case audio minutes';
  ASSERT NOT assistant_billing_settle(op,lease_id,'token-record','session-cap-worst-case','voice-model',0,0,10,0), 'token record settles once';
  ASSERT NOT has_table_privilege('authenticated','assistant_session_checkpoints','INSERT'), 'browser cannot forge trusted snapshots';
  ASSERT NOT has_table_privilege('authenticated','assistant_execution_results','INSERT'), 'browser cannot forge receipts';
  ASSERT NOT has_function_privilege('authenticated','assistant_billing_reserve(uuid,text,text,text)','EXECUTE'), 'client cannot grant provider access';
  ASSERT NOT has_function_privilege('authenticated','assistant_billing_finish(uuid,uuid,text,text,numeric,numeric,numeric,integer,boolean,boolean,boolean)','EXECUTE'), 'client cannot record usage';
END $$;
ROLLBACK;
BEGIN;
DO $$
DECLARE op uuid := '00000000-0000-4000-8000-000000000001'; conv uuid := gen_random_uuid(); proposal uuid := gen_random_uuid(); revision uuid := gen_random_uuid(); card uuid := gen_random_uuid(); receipt uuid := gen_random_uuid(); actor uuid := gen_random_uuid(); attempt uuid := gen_random_uuid(); oldmap uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users VALUES (actor);
  INSERT INTO assistant_conversations (id,operation_id,captured_at,feedback_module_pin,conversation_runtime_pin) VALUES (conv,op,now(),'0.1.3','0.1.1');
  INSERT INTO voice_entry_attempts (id,operation_id,conversation_id,captured_at,status,finished_at,purpose) VALUES (attempt,op,conv,now()-interval '100 days','finished',now()-interval '100 days','write');
  INSERT INTO assistant_proposals (id,operation_id,conversation_id,attempt_id,destination_entity,destination_ui) VALUES (proposal,op,conv,attempt,'calvings','calving');
  INSERT INTO assistant_proposal_revisions (id,operation_id,proposal_id,revision_number,destination_field_names) VALUES (revision,op,proposal,1,ARRAY['notes']);
  INSERT INTO assistant_field_mappings (id,operation_id,attempt_id,revision_id,destination_field_name,value_type,value_text) VALUES (oldmap,op,attempt,revision,'notes','text','kept in review evidence');
  INSERT INTO assistant_review_cards (id,operation_id,revision_id,presented_at,populated_ui,presented_evidence) VALUES (card,op,revision,now(),'calving','retained evidence');
  INSERT INTO assistant_review_confirmations (id,operation_id,card_id,revision_id,actor_id,confirmed_at,channel) VALUES (receipt,op,card,revision,actor,now(),'text');
  INSERT INTO assistant_execution_results (operation_id,conversation_id,attempt_id,conversation_ref,proposal_id,proposal_revision,revision_id,confirmation_id,destination_entity) VALUES (op,conv,attempt,conv::text,proposal,1,revision,receipt,'calvings');
  BEGIN INSERT INTO assistant_execution_results (operation_id,conversation_id,conversation_ref,proposal_id,proposal_revision,revision_id,confirmation_id,destination_entity) VALUES (op,conv,conv::text,proposal,1,revision,receipt,'calvings'); RAISE EXCEPTION 'execute key not unique';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO assistant_session_checkpoints (operation_id,conversation_id,transcript_position,lifecycle_phase,trusted_snapshot) VALUES (op,conv,0,'converse','{}'); RAISE EXCEPTION 'missing snapshot version accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO assistant_session_checkpoints (operation_id,conversation_id,transcript_position,lifecycle_phase,trusted_snapshot) VALUES (op,conv,0,'converse','{"version":1}');
  INSERT INTO assistant_transcript_turns (operation_id,conversation_id,turn_index,speaker,text,input_mode) VALUES (op,conv,0,'user','retained transcript','text');
  INSERT INTO offline_voice_notes (operation_id,conversation_id,attempt_id,captured_at,device_local_reference) VALUES (op,conv,attempt,now(),'discarded-fixture-reference');
  PERFORM assistant_cleanup_finished(op);
  ASSERT NOT EXISTS(SELECT 1 FROM voice_entry_attempts WHERE id = attempt);
  ASSERT NOT EXISTS(SELECT 1 FROM assistant_field_mappings WHERE id = oldmap);
  ASSERT EXISTS(SELECT 1 FROM assistant_proposals WHERE id = proposal AND attempt_id IS NULL);
  ASSERT EXISTS(SELECT 1 FROM assistant_execution_results WHERE conversation_id = conv AND attempt_id IS NULL);
  ASSERT EXISTS(SELECT 1 FROM assistant_review_cards WHERE id = card);
  ASSERT EXISTS(SELECT 1 FROM assistant_transcript_turns WHERE conversation_id = conv);
  ASSERT EXISTS(SELECT 1 FROM offline_voice_notes WHERE conversation_id = conv AND attempt_id IS NULL), 'discarded offline recordings retained';
END $$;
ROLLBACK;

BEGIN;
INSERT INTO operations VALUES ('00000000-0000-4000-8000-000000000002','America/New_York',40);
INSERT INTO operation_members VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003',now());
INSERT INTO assistant_conversations (id,operation_id,captured_at,feedback_module_pin,conversation_runtime_pin) VALUES
  ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001',now(),'0.1.3','0.1.1'),
  ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002',now(),'0.1.3','0.1.1');
DO $$ BEGIN
  BEGIN INSERT INTO assistant_proposals (operation_id,conversation_id,destination_entity,destination_ui) VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005','calvings','calving'); RAISE EXCEPTION 'unscoped FK accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM assistant_conversations) = 1, 'member sees only their operation';
  BEGIN INSERT INTO assistant_conversations (operation_id,captured_at,feedback_module_pin,conversation_runtime_pin) VALUES ('00000000-0000-4000-8000-000000000002',now(),'0.1.3','0.1.1'); RAISE EXCEPTION 'cross-operation insert accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;

-- Narrow definer RPC ACLs, accepted membership, durable/token-matched protocol.
BEGIN;
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000020'),('00000000-0000-4000-8000-000000000021');
INSERT INTO operation_members VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000020',now()),('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021',NULL);
DO $$
DECLARE table_name text; privilege_name text; fn text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['assistant_session_checkpoints','assistant_execution_results','assistant_session_locks','assistant_billing_policies','assistant_billing_reservations','assistant_billing_usage','assistant_billing_settlements','assistant_restore_fences'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
      ASSERT NOT has_table_privilege('authenticated',table_name,privilege_name), 'authenticated table access remains revoked';
      ASSERT NOT has_table_privilege('anon',table_name,privilege_name), 'anon table access remains revoked';
    END LOOP;
  END LOOP;
  FOREACH fn IN ARRAY ARRAY['assistant_restore_prepare(uuid)','assistant_restore_finish(uuid,uuid)','assistant_restore_abort(uuid,uuid)'] LOOP
    ASSERT has_function_privilege('authenticated',fn,'EXECUTE');
    ASSERT NOT has_function_privilege('anon',fn,'EXECUTE');
    ASSERT (SELECT prosecdef AND provolatile = 'v' AND proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = fn::regprocedure), 'fixed empty path, volatile, security definer';
  END LOOP;
  ASSERT NOT has_function_privilege('authenticated','assistant_assert_restore_unfenced(uuid)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','assistant_restore_write_guard()','EXECUTE');
  ASSERT pg_get_function_result('assistant_restore_prepare(uuid)'::regprocedure) = 'TABLE(outcome text, fence_token uuid)', 'no row contents in probe';
  ASSERT pg_get_function_result('assistant_restore_finish(uuid,uuid)'::regprocedure) = 'TABLE(outcome text)';
  ASSERT pg_get_function_result('assistant_restore_abort(uuid,uuid)'::regprocedure) = 'TABLE(outcome text)';
  ASSERT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid = 'assistant_restore_fences'::regclass AND contype = 'p' AND pg_get_constraintdef(oid) = 'PRIMARY KEY (operation_id)');
  ASSERT NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid = 'assistant_restore_fences'::regclass AND contype = 'f'), 'fence must not block parent operation replace';
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE op uuid := '00000000-0000-4000-8000-000000000001'; token uuid; newer uuid; probe record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN PERFORM assistant_restore_prepare(op); RAISE EXCEPTION 'missing auth accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000021',true);
  BEGIN PERFORM assistant_restore_prepare(op); RAISE EXCEPTION 'pending membership accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM assistant_restore_finish(op,gen_random_uuid()); RAISE EXCEPTION 'pending finish accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM assistant_restore_abort(op,gen_random_uuid()); RAISE EXCEPTION 'pending abort accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000020',true);
  BEGIN PERFORM assistant_restore_prepare(gen_random_uuid()); RAISE EXCEPTION 'unrelated operation accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT * INTO STRICT probe FROM assistant_restore_prepare(op); ASSERT probe.outcome = 'prepared' AND probe.fence_token IS NOT NULL; token := probe.fence_token;
  SELECT * INTO STRICT probe FROM assistant_restore_prepare(op); ASSERT probe.outcome = 'restore-in-progress' AND probe.fence_token IS NULL;
  ASSERT (SELECT outcome FROM assistant_restore_finish(op,gen_random_uuid())) = 'token-mismatch';
  ASSERT (SELECT outcome FROM assistant_restore_abort(op,gen_random_uuid())) = 'token-mismatch';
  ASSERT (SELECT outcome FROM assistant_restore_prepare(op)) = 'restore-in-progress', 'wrong token never releases fence';
  ASSERT (SELECT outcome FROM assistant_restore_abort(op,token)) = 'aborted';
  SELECT fence_token INTO newer FROM assistant_restore_prepare(op); ASSERT newer IS NOT NULL AND newer <> token;
  ASSERT (SELECT outcome FROM assistant_restore_finish(op,token)) = 'token-mismatch', 'old token cannot release a new restore';
  ASSERT (SELECT outcome FROM assistant_restore_finish(op,newer)) = 'finished';
END $$;
RESET ROLE;
DO $$ BEGIN ASSERT NOT EXISTS(SELECT 1 FROM assistant_restore_fences), 'successful finish removes exactly its fence'; END $$;
ROLLBACK;

-- Service writes cannot bypass the durable operation fence, even for first use.
BEGIN;
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000020');
INSERT INTO operations VALUES ('00000000-0000-4000-8000-000000000002','America/New_York',40);
INSERT INTO operation_members VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000020',now()),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020',now());
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000020',true);
  PERFORM assistant_restore_prepare('00000000-0000-4000-8000-000000000001');
END $$;
SET LOCAL ROLE service_role;
DO $$
DECLARE op uuid := '00000000-0000-4000-8000-000000000001'; table_name text; statement text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['assistant_session_checkpoints','assistant_execution_results','assistant_session_locks','assistant_billing_policies','assistant_billing_reservations','assistant_billing_usage','assistant_billing_settlements'] LOOP
    ASSERT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid = table_name::regclass AND tgname = 'assistant_restore_fence_guard' AND tgenabled = 'A' AND tgtype = 31), 'always-enabled insert/update/delete guard on every authority table';
    ASSERT NOT has_table_privilege('service_role',table_name,'TRUNCATE'), 'truncate cannot bypass row guards';
    BEGIN EXECUTE format('INSERT INTO %I(operation_id) VALUES ($1)',table_name) USING op; RAISE EXCEPTION 'unguarded authority insert';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'assistant-restore-in-progress' THEN RAISE; END IF; END;
  END LOOP;
  FOREACH statement IN ARRAY ARRAY[
    'SELECT assistant_lock_acquire($1,''ref'',gen_random_uuid())',
    'SELECT assistant_lock_release($1,''missing'',gen_random_uuid())',
    'SELECT assistant_billing_reserve($1,''feedback'',''first-use'',''request'')',
    'SELECT assistant_billing_reserve($1,''feedback'',''settlement'',''settlement'')',
    'SELECT assistant_billing_finish($1,gen_random_uuid(),''fixture'',NULL,0,0,0,1,true,false)',
    'SELECT assistant_billing_reconcile($1,gen_random_uuid(),''fixture'',NULL,0,0,0,1)',
    'SELECT assistant_billing_settle($1,gen_random_uuid(),''provider'',''settlement'',''fixture'',0,0,0,0)',
    'SELECT assistant_cleanup_finished($1)'
  ] LOOP
    BEGIN EXECUTE statement USING op; RAISE EXCEPTION 'unguarded callable write';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'assistant-restore-in-progress' THEN RAISE; END IF; END;
  END LOOP;
  ASSERT NOT EXISTS(SELECT 1 FROM assistant_billing_policies WHERE operation_id = op), 'fenced first reserve cannot seed a policy';
  PERFORM assistant_billing_reserve('00000000-0000-4000-8000-000000000002','feedback','other-operation','request');
END $$;
RESET ROLE;
DO $$
DECLARE token uuid; probe record; op uuid := '00000000-0000-4000-8000-000000000001';
BEGIN
  SELECT * INTO STRICT probe FROM assistant_restore_prepare('00000000-0000-4000-8000-000000000002');
  ASSERT probe.outcome = 'retained-authority' AND probe.fence_token IS NULL, 'first reserve blocks browser restore while authority retained';
  ASSERT NOT EXISTS(SELECT 1 FROM assistant_restore_fences WHERE operation_id = '00000000-0000-4000-8000-000000000002');
  SELECT fence_token INTO token FROM assistant_restore_fences WHERE operation_id = op;
  PERFORM assistant_restore_abort(op,token);
  PERFORM assistant_billing_reserve(op,'feedback','after-restore','request');
  ASSERT EXISTS(SELECT 1 FROM assistant_billing_policies WHERE operation_id = op), 'policy created only on first admitted reserve';
  -- Privileged test fixture only: no API prepares a fence over retained rows.
  INSERT INTO assistant_restore_fences(operation_id) VALUES(op);
END $$;
SET LOCAL ROLE service_role;
DO $$
DECLARE statement text; op uuid := '00000000-0000-4000-8000-000000000001';
BEGIN
  FOREACH statement IN ARRAY ARRAY[
    'UPDATE assistant_billing_policies SET rate_requests = rate_requests WHERE operation_id = $1',
    'DELETE FROM assistant_billing_policies WHERE operation_id = $1',
    'UPDATE assistant_billing_policies SET operation_id = ''00000000-0000-4000-8000-000000000003'' WHERE operation_id = $1',
    'UPDATE assistant_billing_policies SET operation_id = $1 WHERE operation_id = ''00000000-0000-4000-8000-000000000002'''
  ] LOOP
    BEGIN EXECUTE statement USING op; RAISE EXCEPTION 'unguarded authority update/delete/scope change';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'assistant-restore-in-progress' THEN RAISE; END IF; END;
  END LOOP;
END $$;
RESET ROLE;
ROLLBACK;

-- Non-default stale snapshot isolation must fail closed, not skip a fence.
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $$ BEGIN
  BEGIN PERFORM assistant_billing_reserve('00000000-0000-4000-8000-000000000001','feedback','stale-snapshot','request'); RAISE EXCEPTION 'stale snapshot accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'restore-read-committed-required' THEN RAISE; END IF; END;
  ASSERT NOT EXISTS(SELECT 1 FROM assistant_billing_policies), 'isolation rejection precedes policy creation';
END $$;
ROLLBACK;
