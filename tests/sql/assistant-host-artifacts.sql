-- Regression assertions ONLY for a disposable PostgreSQL fixture with migration 040.
-- Never run on a live project. Each block rolls back its fixture changes.
BEGIN;
DO $$
DECLARE op uuid := '00000000-0000-4000-8000-000000000001'; lease_id uuid; repeated uuid; n integer; policy assistant_billing_policies;
BEGIN
  ASSERT (SELECT count(*) FROM submission_field_states WHERE field_name IN ('affectedWork','workaround','dataRisk') AND state = 'unknown' AND source = 'host') = 3, 'historical impact unknowns carry explicit host provenance';
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
  BEGIN PERFORM assistant_billing_reserve(op,'feedback','unreconciled','request'); RAISE EXCEPTION 'unknown usage accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'usage-reconciliation-required' THEN RAISE; END IF; END;
  PERFORM assistant_billing_reserve(op,'feedback','reconcile','settlement');
  PERFORM assistant_billing_reconcile(op,lease_id,'fixture','verified',0,0,0,1);
  PERFORM assistant_billing_reserve(op,'feedback','after-verification','request');
  ASSERT NOT has_table_privilege('authenticated','assistant_session_checkpoints','INSERT'), 'browser cannot forge trusted snapshots';
  ASSERT NOT has_table_privilege('authenticated','assistant_execution_results','INSERT'), 'browser cannot forge receipts';
  ASSERT NOT has_function_privilege('authenticated','assistant_billing_reserve(uuid,text,text,text)','EXECUTE'), 'client cannot grant provider access';
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
