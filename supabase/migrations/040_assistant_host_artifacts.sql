-- Host artifact schema from V2_SCHEMA_DESIGN.md sections 11.2a-b.
-- PREPARED ONLY: not applied to a live project. Audio metadata is not audio-byte storage.
BEGIN;


ALTER TABLE submissions ADD CONSTRAINT submissions_operation_identity UNIQUE (operation_id, id);


CREATE TABLE submission_field_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  submission_id uuid NOT NULL,
  field_name text NOT NULL,
  state text NOT NULL CHECK (state IN ('known','unknown','unavailable','not_applicable','not_reproducible')),
  reason text,
  source text CHECK (source IN ('user','host')),
  CHECK (field_name NOT IN ('affectedWork','workaround','dataRisk') OR (state IN ('known','unknown') AND source IS NOT NULL)),
  CHECK (field_name <> 'reproSteps' OR state IN ('known','unknown','not_reproducible','not_applicable')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  UNIQUE (operation_id, submission_id, field_name)
);


ALTER TABLE submission_field_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON submission_field_states FROM anon, authenticated;
GRANT ALL ON submission_field_states TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON submission_field_states TO authenticated;

CREATE POLICY submission_field_states_select ON submission_field_states FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY submission_field_states_insert ON submission_field_states FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY submission_field_states_update ON submission_field_states FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY submission_field_states_delete ON submission_field_states FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



CREATE TABLE submission_repro_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  submission_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  step_text text NOT NULL CHECK (length(btrim(step_text)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  UNIQUE (operation_id, submission_id, position)
);


ALTER TABLE submission_repro_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON submission_repro_steps FROM anon, authenticated;
GRANT ALL ON submission_repro_steps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON submission_repro_steps TO authenticated;

CREATE POLICY submission_repro_steps_select ON submission_repro_steps FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY submission_repro_steps_insert ON submission_repro_steps FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY submission_repro_steps_update ON submission_repro_steps FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY submission_repro_steps_delete ON submission_repro_steps FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



CREATE TABLE assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  original_input text,
  original_context text,
  build_stamp text,
  captured_at timestamptz NOT NULL,
  current_intent text,
  feedback_module_pin text NOT NULL,
  conversation_runtime_pin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);


ALTER TABLE assistant_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_conversations FROM anon, authenticated;
GRANT ALL ON assistant_conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_conversations TO authenticated;

CREATE POLICY assistant_conversations_select ON assistant_conversations FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_conversations_insert ON assistant_conversations FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_conversations_update ON assistant_conversations FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_conversations_delete ON assistant_conversations FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



CREATE TABLE assistant_transcript_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  turn_index integer NOT NULL CHECK (turn_index >= 0),
  speaker text NOT NULL,
  text text NOT NULL,
  input_mode text NOT NULL,
  corrects_turn_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  UNIQUE (operation_id, conversation_id, turn_index)
);


ALTER TABLE assistant_transcript_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_transcript_turns FROM anon, authenticated;
GRANT ALL ON assistant_transcript_turns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_transcript_turns TO authenticated;

CREATE POLICY assistant_transcript_turns_select ON assistant_transcript_turns FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_transcript_turns_insert ON assistant_transcript_turns FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_transcript_turns_update ON assistant_transcript_turns FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_transcript_turns_delete ON assistant_transcript_turns FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



CREATE TABLE assistant_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  attempt_id uuid,
  destination_entity text NOT NULL,
  destination_ui text NOT NULL,
  existing_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);


ALTER TABLE assistant_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_proposals FROM anon, authenticated;
GRANT ALL ON assistant_proposals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_proposals TO authenticated;

CREATE POLICY assistant_proposals_select ON assistant_proposals FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_proposals_insert ON assistant_proposals FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_proposals_update ON assistant_proposals FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_proposals_delete ON assistant_proposals FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



CREATE TABLE assistant_proposal_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  proposal_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  destination_field_names text[] NOT NULL,
  superseded_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  UNIQUE (operation_id, proposal_id, revision_number)
);


ALTER TABLE assistant_proposal_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_proposal_revisions FROM anon, authenticated;
GRANT ALL ON assistant_proposal_revisions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_proposal_revisions TO authenticated;

CREATE POLICY assistant_proposal_revisions_select ON assistant_proposal_revisions FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_proposal_revisions_insert ON assistant_proposal_revisions FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_proposal_revisions_update ON assistant_proposal_revisions FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_proposal_revisions_delete ON assistant_proposal_revisions FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



CREATE TABLE assistant_field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  attempt_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  source_turn_id uuid,
  destination_field_name text NOT NULL,
  value_type text NOT NULL CHECK (value_type IN ('text','number','boolean','date','timestamp','uuid','null')),
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date date,
  value_timestamp timestamptz,
  value_uuid uuid,
  uncertainty text,
  correction_predecessor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  UNIQUE (operation_id, revision_id, destination_field_name),
  CHECK (num_nonnulls(value_text, value_number, value_boolean, value_date, value_timestamp, value_uuid) = CASE WHEN value_type = 'null' THEN 0 ELSE 1 END),
  CHECK (value_type = 'null' OR CASE value_type WHEN 'text' THEN value_text IS NOT NULL WHEN 'number' THEN value_number IS NOT NULL WHEN 'boolean' THEN value_boolean IS NOT NULL WHEN 'date' THEN value_date IS NOT NULL WHEN 'timestamp' THEN value_timestamp IS NOT NULL WHEN 'uuid' THEN value_uuid IS NOT NULL ELSE false END)
);


ALTER TABLE assistant_field_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_field_mappings FROM anon, authenticated;
GRANT ALL ON assistant_field_mappings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_field_mappings TO authenticated;

CREATE POLICY assistant_field_mappings_select ON assistant_field_mappings FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_field_mappings_insert ON assistant_field_mappings FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_field_mappings_update ON assistant_field_mappings FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_field_mappings_delete ON assistant_field_mappings FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



CREATE TABLE assistant_review_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  revision_id uuid NOT NULL,
  presented_at timestamptz NOT NULL,
  populated_ui text NOT NULL,
  presented_evidence text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  UNIQUE (operation_id, id, revision_id)
);


ALTER TABLE assistant_review_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_review_cards FROM anon, authenticated;
GRANT ALL ON assistant_review_cards TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_review_cards TO authenticated;

CREATE POLICY assistant_review_cards_select ON assistant_review_cards FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_review_cards_insert ON assistant_review_cards FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_review_cards_update ON assistant_review_cards FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_review_cards_delete ON assistant_review_cards FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



CREATE TABLE assistant_review_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  card_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  confirmed_at timestamptz NOT NULL,
  channel text NOT NULL,
  evidence_turn_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);


ALTER TABLE assistant_review_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_review_confirmations FROM anon, authenticated;
GRANT ALL ON assistant_review_confirmations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_review_confirmations TO authenticated;

CREATE POLICY assistant_review_confirmations_select ON assistant_review_confirmations FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_review_confirmations_insert ON assistant_review_confirmations FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_review_confirmations_update ON assistant_review_confirmations FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_review_confirmations_delete ON assistant_review_confirmations FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



CREATE TABLE assistant_session_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  transcript_position integer NOT NULL CHECK (transcript_position >= 0),
  pending_revision_id uuid,
  lifecycle_phase text NOT NULL,
  UNIQUE (operation_id, conversation_id),
  trusted_snapshot jsonb NOT NULL CHECK (jsonb_typeof(trusted_snapshot) = 'object' AND trusted_snapshot->'version' IS NOT DISTINCT FROM '1'::jsonb),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);


ALTER TABLE assistant_session_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_session_checkpoints FROM anon, authenticated;
GRANT ALL ON assistant_session_checkpoints TO service_role;











CREATE TABLE voice_entry_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  previous_attempt_id uuid,
  captured_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('unfinished','finished','discarded')),
  finished_at timestamptz,
  purpose text NOT NULL CHECK (purpose IN ('write','question','feedback','how-to')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  CHECK ((status = 'finished' AND finished_at IS NOT NULL) OR (status <> 'finished' AND finished_at IS NULL))
);


ALTER TABLE voice_entry_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON voice_entry_attempts FROM anon, authenticated;
GRANT ALL ON voice_entry_attempts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON voice_entry_attempts TO authenticated;

CREATE POLICY voice_entry_attempts_select ON voice_entry_attempts FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY voice_entry_attempts_insert ON voice_entry_attempts FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY voice_entry_attempts_update ON voice_entry_attempts FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY voice_entry_attempts_delete ON voice_entry_attempts FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



CREATE TABLE assistant_execution_results (
  conversation_ref text NOT NULL CHECK (length(btrim(conversation_ref)) > 0),
  proposal_id uuid NOT NULL,
  proposal_revision integer NOT NULL CHECK (proposal_revision > 0),
  UNIQUE (operation_id, conversation_ref, proposal_id, proposal_revision),
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  attempt_id uuid,
  revision_id uuid NOT NULL,
  confirmation_id uuid NOT NULL,
  destination_entity text NOT NULL,
  saved_record_id uuid,
  local_saved_at timestamptz,
  sync_queued_at timestamptz,
  server_acknowledged_at timestamptz,
  feedback_handoff_acknowledged_at timestamptz,
  failure_stage text,
  failure_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);


ALTER TABLE assistant_execution_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_execution_results FROM anon, authenticated;
GRANT ALL ON assistant_execution_results TO service_role;











CREATE TABLE assistant_testing_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  decision text NOT NULL CHECK (decision IN ('accepted','declined')),
  decided_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);


ALTER TABLE assistant_testing_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_testing_consents FROM anon, authenticated;
GRANT ALL ON assistant_testing_consents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_testing_consents TO authenticated;

CREATE POLICY assistant_testing_consents_select ON assistant_testing_consents FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_testing_consents_insert ON assistant_testing_consents FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_testing_consents_update ON assistant_testing_consents FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_testing_consents_delete ON assistant_testing_consents FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



CREATE TABLE assistant_testing_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  attempt_id uuid,
  consent_id uuid NOT NULL,
  audio_reference text NOT NULL,
  captured_at timestamptz NOT NULL,
  duration_ms numeric CHECK (duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);


ALTER TABLE assistant_testing_audio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_testing_audio FROM anon, authenticated;
GRANT ALL ON assistant_testing_audio TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_testing_audio TO authenticated;

CREATE POLICY assistant_testing_audio_select ON assistant_testing_audio FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_testing_audio_insert ON assistant_testing_audio FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_testing_audio_update ON assistant_testing_audio FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_testing_audio_delete ON assistant_testing_audio FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



CREATE TABLE offline_voice_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  attempt_id uuid,
  device_local_reference text NOT NULL,
  original_context text,
  captured_at timestamptz NOT NULL,
  confirmed_execution_result_id uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);


ALTER TABLE offline_voice_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON offline_voice_notes FROM anon, authenticated;
GRANT ALL ON offline_voice_notes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON offline_voice_notes TO authenticated;

CREATE POLICY offline_voice_notes_select ON offline_voice_notes FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY offline_voice_notes_insert ON offline_voice_notes FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY offline_voice_notes_update ON offline_voice_notes FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY offline_voice_notes_delete ON offline_voice_notes FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



ALTER TABLE submission_field_states ADD FOREIGN KEY (operation_id, submission_id) REFERENCES submissions(operation_id, id);

ALTER TABLE submission_repro_steps ADD FOREIGN KEY (operation_id, submission_id) REFERENCES submissions(operation_id, id);

ALTER TABLE assistant_transcript_turns ADD FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id);

ALTER TABLE assistant_transcript_turns ADD FOREIGN KEY (operation_id, corrects_turn_id) REFERENCES assistant_transcript_turns(operation_id, id);

ALTER TABLE assistant_proposals ADD FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id);

ALTER TABLE assistant_proposals ADD FOREIGN KEY (operation_id, attempt_id) REFERENCES voice_entry_attempts(operation_id, id);

ALTER TABLE assistant_proposal_revisions ADD FOREIGN KEY (operation_id, proposal_id) REFERENCES assistant_proposals(operation_id, id);

ALTER TABLE assistant_proposal_revisions ADD FOREIGN KEY (operation_id, superseded_by_id) REFERENCES assistant_proposal_revisions(operation_id, id);

ALTER TABLE assistant_field_mappings ADD FOREIGN KEY (operation_id, attempt_id) REFERENCES voice_entry_attempts(operation_id, id);

ALTER TABLE assistant_field_mappings ADD FOREIGN KEY (operation_id, revision_id) REFERENCES assistant_proposal_revisions(operation_id, id);

ALTER TABLE assistant_field_mappings ADD FOREIGN KEY (operation_id, source_turn_id) REFERENCES assistant_transcript_turns(operation_id, id);

ALTER TABLE assistant_field_mappings ADD FOREIGN KEY (operation_id, correction_predecessor_id) REFERENCES assistant_field_mappings(operation_id, id);

ALTER TABLE assistant_review_cards ADD FOREIGN KEY (operation_id, revision_id) REFERENCES assistant_proposal_revisions(operation_id, id);

ALTER TABLE assistant_review_confirmations ADD FOREIGN KEY (operation_id, revision_id) REFERENCES assistant_proposal_revisions(operation_id, id);

ALTER TABLE assistant_review_confirmations ADD FOREIGN KEY (operation_id, evidence_turn_id) REFERENCES assistant_transcript_turns(operation_id, id);

ALTER TABLE assistant_review_confirmations ADD FOREIGN KEY (operation_id, card_id, revision_id) REFERENCES assistant_review_cards(operation_id, id, revision_id);

ALTER TABLE assistant_session_checkpoints ADD FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id);

ALTER TABLE assistant_session_checkpoints ADD FOREIGN KEY (operation_id, pending_revision_id) REFERENCES assistant_proposal_revisions(operation_id, id);

ALTER TABLE voice_entry_attempts ADD FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id);

ALTER TABLE voice_entry_attempts ADD FOREIGN KEY (operation_id, previous_attempt_id) REFERENCES voice_entry_attempts(operation_id, id);

ALTER TABLE assistant_execution_results ADD FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id);

ALTER TABLE assistant_execution_results ADD FOREIGN KEY (operation_id, attempt_id) REFERENCES voice_entry_attempts(operation_id, id);

ALTER TABLE assistant_execution_results ADD FOREIGN KEY (operation_id, revision_id) REFERENCES assistant_proposal_revisions(operation_id, id);

ALTER TABLE assistant_execution_results ADD FOREIGN KEY (operation_id, confirmation_id) REFERENCES assistant_review_confirmations(operation_id, id);

ALTER TABLE assistant_testing_consents ADD FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id);

ALTER TABLE assistant_testing_audio ADD FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id);

ALTER TABLE assistant_testing_audio ADD FOREIGN KEY (operation_id, attempt_id) REFERENCES voice_entry_attempts(operation_id, id);

ALTER TABLE assistant_testing_audio ADD FOREIGN KEY (operation_id, consent_id) REFERENCES assistant_testing_consents(operation_id, id);

ALTER TABLE offline_voice_notes ADD FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id);

ALTER TABLE offline_voice_notes ADD FOREIGN KEY (operation_id, attempt_id) REFERENCES voice_entry_attempts(operation_id, id);

ALTER TABLE offline_voice_notes ADD FOREIGN KEY (operation_id, confirmed_execution_result_id) REFERENCES assistant_execution_results(operation_id, id);

ALTER TABLE submissions
  ADD COLUMN feedback_kind text CHECK (feedback_kind IN ('bug','request')),
  ADD COLUMN contract_version text,
  ADD COLUMN title text,
  ADD COLUMN first_note text,
  ADD COLUMN expected text,
  ADD COLUMN actual text,
  ADD COLUMN severity text CHECK (severity IN ('critical','high','normal','low')),
  ADD COLUMN impact_affected_work text CHECK (length(btrim(impact_affected_work)) > 0),
  ADD COLUMN impact_workaround text CHECK (length(btrim(impact_workaround)) > 0),
  ADD COLUMN impact_data_risk text CHECK (length(btrim(impact_data_risk)) > 0),
  ADD COLUMN captured_at timestamptz,
  ADD COLUMN filed_at timestamptz,
  ADD COLUMN conversation_id uuid,
  ADD COLUMN review_confirmation_id uuid,
  ADD FOREIGN KEY (operation_id, conversation_id)
    REFERENCES assistant_conversations(operation_id, id),
  ADD FOREIGN KEY (operation_id, review_confirmation_id)
    REFERENCES assistant_review_confirmations(operation_id, id);

CREATE INDEX assistant_transcript_turns_corrects_turn_id_idx ON assistant_transcript_turns (operation_id, corrects_turn_id);

CREATE INDEX assistant_proposals_conversation_id_idx ON assistant_proposals (operation_id, conversation_id);

CREATE INDEX assistant_proposals_attempt_id_idx ON assistant_proposals (operation_id, attempt_id);

CREATE INDEX assistant_proposal_revisions_superseded_by_id_idx ON assistant_proposal_revisions (operation_id, superseded_by_id);

CREATE INDEX assistant_field_mappings_attempt_id_idx ON assistant_field_mappings (operation_id, attempt_id);

CREATE INDEX assistant_field_mappings_source_turn_id_idx ON assistant_field_mappings (operation_id, source_turn_id);

CREATE INDEX assistant_field_mappings_correction_predecessor_id_idx ON assistant_field_mappings (operation_id, correction_predecessor_id);

CREATE INDEX assistant_review_cards_revision_id_idx ON assistant_review_cards (operation_id, revision_id);

CREATE INDEX assistant_review_confirmations_revision_id_idx ON assistant_review_confirmations (operation_id, revision_id);

CREATE INDEX assistant_review_confirmations_evidence_turn_id_idx ON assistant_review_confirmations (operation_id, evidence_turn_id);

CREATE INDEX assistant_review_confirmations_card_revision_idx ON assistant_review_confirmations (operation_id, card_id, revision_id);

CREATE INDEX assistant_session_checkpoints_conversation_id_idx ON assistant_session_checkpoints (operation_id, conversation_id);

CREATE INDEX assistant_session_checkpoints_pending_revision_id_idx ON assistant_session_checkpoints (operation_id, pending_revision_id);

CREATE INDEX voice_entry_attempts_conversation_id_idx ON voice_entry_attempts (operation_id, conversation_id);

CREATE INDEX voice_entry_attempts_previous_attempt_id_idx ON voice_entry_attempts (operation_id, previous_attempt_id);

CREATE INDEX assistant_execution_results_conversation_id_idx ON assistant_execution_results (operation_id, conversation_id);

CREATE INDEX assistant_execution_results_attempt_id_idx ON assistant_execution_results (operation_id, attempt_id);

CREATE INDEX assistant_execution_results_revision_id_idx ON assistant_execution_results (operation_id, revision_id);

CREATE INDEX assistant_execution_results_confirmation_id_idx ON assistant_execution_results (operation_id, confirmation_id);

CREATE INDEX assistant_testing_consents_conversation_id_idx ON assistant_testing_consents (operation_id, conversation_id);

CREATE INDEX assistant_testing_audio_conversation_id_idx ON assistant_testing_audio (operation_id, conversation_id);

CREATE INDEX assistant_testing_audio_attempt_id_idx ON assistant_testing_audio (operation_id, attempt_id);

CREATE INDEX assistant_testing_audio_consent_id_idx ON assistant_testing_audio (operation_id, consent_id);

CREATE INDEX offline_voice_notes_conversation_id_idx ON offline_voice_notes (operation_id, conversation_id);

CREATE INDEX offline_voice_notes_attempt_id_idx ON offline_voice_notes (operation_id, attempt_id);

CREATE INDEX offline_voice_notes_confirmed_execution_result_id_idx ON offline_voice_notes (operation_id, confirmed_execution_result_id);

CREATE INDEX submissions_conversation_id_idx ON submissions (operation_id, conversation_id);

CREATE INDEX submissions_confirmation_id_idx ON submissions (operation_id, review_confirmation_id);

CREATE INDEX voice_entry_attempts_finished_expiry_idx ON voice_entry_attempts (operation_id, finished_at) WHERE status = 'finished';

CREATE INDEX voice_entry_attempts_captured_at_idx ON voice_entry_attempts (operation_id, captured_at);

CREATE TABLE assistant_session_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_ref text NOT NULL CHECK (length(btrim(conversation_ref)) > 0),
  owner_token uuid NOT NULL,
  UNIQUE (operation_id, conversation_ref),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);
ALTER TABLE assistant_session_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_session_locks FROM anon, authenticated;
GRANT ALL ON assistant_session_locks TO service_role;

CREATE TABLE assistant_billing_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  rate_requests integer NOT NULL DEFAULT 30 CHECK (rate_requests > 0),
  rate_window_seconds integer NOT NULL DEFAULT 600 CHECK (rate_window_seconds > 0),
  monthly_requests integer NOT NULL DEFAULT 2000 CHECK (monthly_requests > 0),
  monthly_audio_minutes numeric NOT NULL DEFAULT 600 CHECK (monthly_audio_minutes > 0),
  billing_timezone text,
  UNIQUE (operation_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);
ALTER TABLE assistant_billing_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_billing_policies FROM anon, authenticated;
GRANT ALL ON assistant_billing_policies TO service_role;

CREATE TABLE assistant_billing_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  purpose text NOT NULL CHECK (length(btrim(purpose)) > 0),
  request_ref text NOT NULL CHECK (length(btrim(request_ref)) > 0),
  kind text NOT NULL CHECK (kind IN ('request','settlement')),
  lease uuid NOT NULL DEFAULT gen_random_uuid(),
  routing text NOT NULL CHECK (routing IN ('shared','operation-owned')),
  UNIQUE (operation_id, request_ref),
  UNIQUE (operation_id, lease),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);
ALTER TABLE assistant_billing_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_billing_reservations FROM anon, authenticated;
GRANT ALL ON assistant_billing_reservations TO service_role;

CREATE TABLE assistant_billing_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  lease uuid NOT NULL,
  purpose text NOT NULL,
  model text,
  voice_session text,
  input_tokens numeric CHECK (input_tokens >= 0),
  output_tokens numeric CHECK (output_tokens >= 0),
  audio_minutes numeric CHECK (audio_minutes >= 0),
  request_count integer CHECK (request_count >= 0),
  bill_shared boolean NOT NULL,
  failed boolean NOT NULL,
  UNIQUE (operation_id, lease),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);
ALTER TABLE assistant_billing_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_billing_usage FROM anon, authenticated;
GRANT ALL ON assistant_billing_usage TO service_role;

CREATE TABLE assistant_billing_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  lease uuid NOT NULL,
  provider_session_ref text NOT NULL CHECK (length(btrim(provider_session_ref)) > 0),
  settlement_ref text NOT NULL CHECK (length(btrim(settlement_ref)) > 0),
  UNIQUE (operation_id, provider_session_ref, settlement_ref),
  UNIQUE (operation_id, lease),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);
ALTER TABLE assistant_billing_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_billing_settlements FROM anon, authenticated;
GRANT ALL ON assistant_billing_settlements TO service_role;

CREATE POLICY assistant_session_checkpoints_member_scope ON assistant_session_checkpoints FOR ALL TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY assistant_execution_results_member_scope ON assistant_execution_results FOR ALL TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY assistant_session_locks_member_scope ON assistant_session_locks FOR ALL TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY assistant_billing_policies_member_scope ON assistant_billing_policies FOR ALL TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY assistant_billing_reservations_member_scope ON assistant_billing_reservations FOR ALL TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY assistant_billing_usage_member_scope ON assistant_billing_usage FOR ALL TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
CREATE POLICY assistant_billing_settlements_member_scope ON assistant_billing_settlements FOR ALL TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));
ALTER TABLE assistant_execution_results ADD FOREIGN KEY (operation_id, proposal_id) REFERENCES assistant_proposals(operation_id, id);
ALTER TABLE assistant_billing_usage ADD FOREIGN KEY (operation_id, lease) REFERENCES assistant_billing_reservations(operation_id, lease);
ALTER TABLE assistant_billing_settlements ADD FOREIGN KEY (operation_id, lease) REFERENCES assistant_billing_reservations(operation_id, lease);
CREATE INDEX assistant_billing_reservations_time_idx ON assistant_billing_reservations (operation_id, created_at);
CREATE INDEX assistant_billing_usage_time_idx ON assistant_billing_usage (operation_id, created_at);
-- A durable CP-56 fence, not assistant backup/restore or conversation content.
-- Deliberately NO operations FK: replace must not be blocked by its own fence.
CREATE TABLE assistant_restore_fences (
  operation_id uuid PRIMARY KEY,
  fence_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE assistant_restore_fences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_restore_fences FROM anon, authenticated;
REVOKE ALL ON assistant_restore_fences FROM PUBLIC;
GRANT ALL ON assistant_restore_fences TO service_role;

-- Writers take shared admission; prepare/finish/abort take exclusive admission.
-- Shared writers permit checkpoint/billing RPCs on separate connections while
-- the dedicated conversation transaction holds its session row lock.
-- A committed fence is NEVER waited out: writes raise, not queue for restore.
-- Probe admission is nonblocking: a queued exclusive probe could otherwise
-- starve a separate checkpoint RPC awaited by the session transaction. Busy
-- admission is unknown (RPC error), never proof of absence or a new fence.
-- READ COMMITTED is required so a waiter rechecks newly committed authority;
-- stale repeatable-read snapshots must fail closed rather than bypass a fence.
CREATE FUNCTION assistant_assert_restore_unfenced(p_operation uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'restore-read-committed-required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('gtho-assistant-restore:' || p_operation::text, 0));
  IF EXISTS (SELECT 1 FROM public.assistant_restore_fences WHERE operation_id = p_operation) THEN
    RAISE EXCEPTION 'assistant-restore-in-progress';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION assistant_assert_restore_unfenced(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_assert_restore_unfenced(uuid) TO service_role;

CREATE FUNCTION assistant_restore_write_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_operation uuid; new_operation uuid; scoped_operation uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_operation := OLD.operation_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_operation := NEW.operation_id; END IF;
  -- Check both scopes on an operation-id change; deterministic order avoids
  -- opposite-scope updates acquiring their operation mutexes in reverse order.
  FOR scoped_operation IN SELECT DISTINCT value FROM pg_catalog.unnest(ARRAY[old_operation,new_operation]) value
    WHERE value IS NOT NULL ORDER BY value LOOP
    PERFORM public.assistant_assert_restore_unfenced(scoped_operation);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION assistant_restore_write_guard() FROM PUBLIC, anon, authenticated;
DO $restore_triggers$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['assistant_session_checkpoints','assistant_execution_results','assistant_session_locks','assistant_billing_policies','assistant_billing_reservations','assistant_billing_usage','assistant_billing_settlements'] LOOP
    EXECUTE pg_catalog.format('CREATE TRIGGER assistant_restore_fence_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.assistant_restore_write_guard()', table_name);
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER assistant_restore_fence_guard', table_name);
    -- TRUNCATE bypasses row guards; it is not an authorized backend write path.
    EXECUTE pg_catalog.format('REVOKE TRUNCATE ON public.%I FROM service_role', table_name);
  END LOOP;
END;
$restore_triggers$;

-- Minimal membership-checked browser RPCs. No table rows or authority details
-- are returned; the fence token is not a substitute for authenticated membership.
CREATE FUNCTION assistant_restore_prepare(p_operation uuid)
RETURNS TABLE(outcome text, fence_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE installed_token uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.operation_members WHERE operation_id = p_operation
    AND user_id = auth.uid() AND accepted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'restore-operation-membership-required' USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'restore-read-committed-required';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('gtho-assistant-restore:' || p_operation::text, 0)) THEN
    RAISE EXCEPTION 'restore-authority-check-unavailable' USING ERRCODE = '55P03';
  END IF;
  IF EXISTS (SELECT 1 FROM public.assistant_restore_fences WHERE operation_id = p_operation) THEN
    RETURN QUERY SELECT 'restore-in-progress'::text, NULL::uuid; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.assistant_session_checkpoints WHERE operation_id = p_operation)
    OR EXISTS (SELECT 1 FROM public.assistant_execution_results WHERE operation_id = p_operation)
    OR EXISTS (SELECT 1 FROM public.assistant_session_locks WHERE operation_id = p_operation)
    OR EXISTS (SELECT 1 FROM public.assistant_billing_policies WHERE operation_id = p_operation)
    OR EXISTS (SELECT 1 FROM public.assistant_billing_reservations WHERE operation_id = p_operation)
    OR EXISTS (SELECT 1 FROM public.assistant_billing_usage WHERE operation_id = p_operation)
    OR EXISTS (SELECT 1 FROM public.assistant_billing_settlements WHERE operation_id = p_operation) THEN
    RETURN QUERY SELECT 'retained-authority'::text, NULL::uuid; RETURN;
  END IF;
  INSERT INTO public.assistant_restore_fences(operation_id) VALUES (p_operation)
    RETURNING assistant_restore_fences.fence_token INTO installed_token;
  RETURN QUERY SELECT 'prepared'::text, installed_token;
END;
$$;
REVOKE ALL ON FUNCTION assistant_restore_prepare(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_restore_prepare(uuid) TO authenticated;

CREATE FUNCTION assistant_restore_finish(p_operation uuid, p_fence_token uuid)
RETURNS TABLE(outcome text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.operation_members WHERE operation_id = p_operation
    AND user_id = auth.uid() AND accepted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'restore-operation-membership-required' USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'restore-read-committed-required';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('gtho-assistant-restore:' || p_operation::text, 0)) THEN
    RAISE EXCEPTION 'restore-authority-check-unavailable' USING ERRCODE = '55P03';
  END IF;
  DELETE FROM public.assistant_restore_fences WHERE operation_id = p_operation AND fence_token = p_fence_token;
  IF FOUND THEN RETURN QUERY SELECT 'finished'::text;
  ELSE RETURN QUERY SELECT 'token-mismatch'::text; END IF;
END;
$$;
REVOKE ALL ON FUNCTION assistant_restore_finish(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_restore_finish(uuid,uuid) TO authenticated;

CREATE FUNCTION assistant_restore_abort(p_operation uuid, p_fence_token uuid)
RETURNS TABLE(outcome text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.operation_members WHERE operation_id = p_operation
    AND user_id = auth.uid() AND accepted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'restore-operation-membership-required' USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'restore-read-committed-required';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('gtho-assistant-restore:' || p_operation::text, 0)) THEN
    RAISE EXCEPTION 'restore-authority-check-unavailable' USING ERRCODE = '55P03';
  END IF;
  DELETE FROM public.assistant_restore_fences WHERE operation_id = p_operation AND fence_token = p_fence_token;
  IF FOUND THEN RETURN QUERY SELECT 'aborted'::text;
  ELSE RETURN QUERY SELECT 'token-mismatch'::text; END IF;
END;
$$;
REVOKE ALL ON FUNCTION assistant_restore_abort(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_restore_abort(uuid,uuid) TO authenticated;


-- Callable backend bindings. No automatic lock expiry or cleanup schedule.
CREATE FUNCTION assistant_lock_acquire(p_operation uuid, p_ref text, p_owner uuid)
RETURNS SETOF assistant_session_locks LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT public.assistant_assert_restore_unfenced(p_operation);
  INSERT INTO assistant_session_locks (operation_id, conversation_ref, owner_token)
  VALUES (p_operation, p_ref, p_owner) ON CONFLICT (operation_id, conversation_ref) DO NOTHING RETURNING *;
$$;
CREATE FUNCTION assistant_lock_release(p_operation uuid, p_ref text, p_owner uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT public.assistant_assert_restore_unfenced(p_operation);
  DELETE FROM assistant_session_locks WHERE operation_id = p_operation AND conversation_ref = p_ref AND owner_token = p_owner;
$$;
CREATE FUNCTION assistant_billing_reserve(p_operation uuid, p_purpose text, p_request text, p_kind text)
RETURNS SETOF assistant_billing_reservations LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE policy assistant_billing_policies; existing assistant_billing_reservations;
  monthly_start timestamptz; used_requests bigint; used_audio numeric; rate_count bigint;
BEGIN
  PERFORM public.assistant_assert_restore_unfenced(p_operation);
  INSERT INTO assistant_billing_policies (operation_id, billing_timezone) SELECT id, timezone FROM operations WHERE id = p_operation ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO policy FROM assistant_billing_policies WHERE operation_id = p_operation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing-policy-required'; END IF;
  SELECT * INTO existing FROM assistant_billing_reservations WHERE operation_id = p_operation AND request_ref = p_request;
  -- A replayed reservation is not a second grant of provider access.
  IF FOUND THEN
    IF p_kind = 'settlement' AND existing.kind = 'settlement' AND existing.purpose = p_purpose THEN RETURN NEXT existing; RETURN; END IF;
    RAISE EXCEPTION 'billing-request-already-reserved';
  END IF;
  IF p_kind NOT IN ('request','settlement') THEN RAISE EXCEPTION 'invalid-reservation-kind'; END IF;
  IF p_kind = 'request' THEN
    IF policy.billing_timezone IS NULL THEN RAISE EXCEPTION 'billing-calendar-timezone-required'; END IF;
    monthly_start := date_trunc('month', now() AT TIME ZONE policy.billing_timezone) AT TIME ZONE policy.billing_timezone;
    IF EXISTS (SELECT 1 FROM assistant_billing_usage WHERE operation_id = p_operation AND
       (input_tokens IS NULL OR output_tokens IS NULL OR audio_minutes IS NULL OR request_count IS NULL))
    THEN RAISE EXCEPTION 'usage-reconciliation-required'; END IF;
    SELECT count(*) INTO rate_count FROM assistant_billing_reservations WHERE operation_id = p_operation
      AND kind = 'request' AND created_at > now() - make_interval(secs => policy.rate_window_seconds);
    SELECT coalesce(sum(greatest(CASE WHEN r.kind = 'request' THEN 1 ELSE 0 END, u.request_count)),0) INTO used_requests
      FROM assistant_billing_reservations r LEFT JOIN assistant_billing_usage u ON u.operation_id = r.operation_id AND u.lease = r.lease
      WHERE r.operation_id = p_operation AND r.created_at >= monthly_start;
    SELECT coalesce(sum(audio_minutes),0) INTO used_audio FROM assistant_billing_usage WHERE operation_id = p_operation AND created_at >= monthly_start;
    IF rate_count >= policy.rate_requests OR used_requests >= policy.monthly_requests OR used_audio >= policy.monthly_audio_minutes
    THEN RAISE EXCEPTION 'billing-cap-reached'; END IF;
  END IF;
  RETURN QUERY INSERT INTO assistant_billing_reservations (operation_id,purpose,request_ref,kind,routing)
    VALUES (p_operation,p_purpose,p_request,p_kind,'shared') RETURNING *;
END;
$$;
CREATE FUNCTION assistant_billing_finish(p_operation uuid, p_lease uuid, p_model text, p_voice text,
  p_input numeric, p_output numeric, p_audio numeric, p_requests integer, p_bill_shared boolean, p_failed boolean,
  p_unmeasured boolean DEFAULT NULL)
RETURNS SETOF assistant_billing_usage LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE reservation assistant_billing_reservations; unmeasured boolean := coalesce(p_unmeasured, p_failed);
BEGIN
  PERFORM public.assistant_assert_restore_unfenced(p_operation);
  PERFORM 1 FROM assistant_billing_policies WHERE operation_id = p_operation FOR UPDATE;
  SELECT * INTO STRICT reservation FROM assistant_billing_reservations WHERE operation_id = p_operation AND lease = p_lease;
  IF p_bill_shared IS DISTINCT FROM (reservation.routing = 'shared') THEN RAISE EXCEPTION 'billing-routing-mismatch'; END IF;
  -- A failure after provider work without a positive measured counter is unknown,
  -- never an invented zero. A failure that never reached a metered provider
  -- (p_unmeasured false) measured zero provider usage. Omitted = p_failed.
  IF p_unmeasured AND NOT p_failed THEN RAISE EXCEPTION 'unmeasured-usage-requires-failure'; END IF;
  RETURN QUERY INSERT INTO assistant_billing_usage (operation_id,lease,purpose,model,voice_session,input_tokens,output_tokens,audio_minutes,request_count,bill_shared,failed)
    VALUES (p_operation,p_lease,reservation.purpose,p_model,p_voice,
      CASE WHEN unmeasured AND p_input = 0 THEN NULL ELSE p_input END,
      CASE WHEN unmeasured AND p_output = 0 THEN NULL ELSE p_output END,
      CASE WHEN unmeasured AND p_audio = 0 THEN NULL ELSE p_audio END,
      p_requests,p_bill_shared,p_failed)
    ON CONFLICT (operation_id,lease) DO NOTHING RETURNING *;
END;
$$;
-- Only server-verified final counters may fill unknown failed-request usage.
CREATE FUNCTION assistant_billing_reconcile(p_operation uuid, p_lease uuid, p_model text, p_voice text,
  p_input numeric, p_output numeric, p_audio numeric, p_requests integer)
RETURNS SETOF assistant_billing_usage LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE existing assistant_billing_usage;
BEGIN
  PERFORM public.assistant_assert_restore_unfenced(p_operation);
  PERFORM 1 FROM assistant_billing_policies WHERE operation_id = p_operation FOR UPDATE;
  SELECT * INTO STRICT existing FROM assistant_billing_usage WHERE operation_id = p_operation AND lease = p_lease FOR UPDATE;
  IF p_input IS NULL OR p_output IS NULL OR p_audio IS NULL OR p_requests IS NULL THEN RAISE EXCEPTION 'verified-usage-required'; END IF;
  IF (existing.input_tokens IS NOT NULL AND existing.input_tokens <> p_input)
    OR (existing.output_tokens IS NOT NULL AND existing.output_tokens <> p_output)
    OR (existing.audio_minutes IS NOT NULL AND existing.audio_minutes <> p_audio)
    OR (existing.request_count IS NOT NULL AND existing.request_count <> p_requests)
  THEN RAISE EXCEPTION 'verified-usage-conflicts-with-known-counter'; END IF;
  RETURN QUERY UPDATE assistant_billing_usage SET model = coalesce(model,p_model), voice_session = coalesce(voice_session,p_voice),
    input_tokens = p_input, output_tokens = p_output, audio_minutes = p_audio, request_count = p_requests, updated_at = now()
    WHERE operation_id = p_operation AND lease = p_lease RETURNING *;
END;
$$;
-- A verified provider event and its usage delta commit atomically. No crash window
-- can consume the dedup marker without retaining the measured billing usage.
CREATE FUNCTION assistant_billing_settle(p_operation uuid, p_lease uuid, p_provider text, p_settlement text,
  p_model text, p_input numeric, p_output numeric, p_audio numeric, p_requests integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE reservation assistant_billing_reservations; claimed uuid;
BEGIN
  PERFORM public.assistant_assert_restore_unfenced(p_operation);
  PERFORM 1 FROM assistant_billing_policies WHERE operation_id = p_operation FOR UPDATE;
  SELECT * INTO STRICT reservation FROM assistant_billing_reservations WHERE operation_id = p_operation AND lease = p_lease;
  IF reservation.kind <> 'settlement' THEN RAISE EXCEPTION 'settlement-reservation-required'; END IF;
  IF p_input IS NULL OR p_output IS NULL OR p_audio IS NULL OR p_requests IS NULL THEN RAISE EXCEPTION 'verified-usage-required'; END IF;
  INSERT INTO assistant_billing_settlements (operation_id,lease,provider_session_ref,settlement_ref)
    VALUES (p_operation,p_lease,p_provider,p_settlement)
    ON CONFLICT (operation_id,provider_session_ref,settlement_ref) DO NOTHING RETURNING lease INTO claimed;
  IF NOT FOUND THEN RETURN false; END IF;
  -- finish must not have run before the verified delta for a fresh settlement.
  IF EXISTS (SELECT 1 FROM assistant_billing_usage WHERE operation_id = p_operation AND lease = p_lease) THEN RAISE EXCEPTION 'settlement-usage-already-recorded'; END IF;
  PERFORM assistant_billing_finish(p_operation,p_lease,p_model,p_provider,p_input,p_output,p_audio,p_requests,true,false);
  RETURN true;
END;
$$;
CREATE FUNCTION assistant_cleanup_finished(p_operation uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE attempts uuid[]; mappings uuid[];
BEGIN
  PERFORM public.assistant_assert_restore_unfenced(p_operation);
  SELECT array_agg(id) INTO attempts FROM (SELECT id FROM voice_entry_attempts WHERE operation_id = p_operation
    AND status = 'finished' AND finished_at <= now() - make_interval(hours => 90 * 24) FOR UPDATE) expired;
  SELECT array_agg(id) INTO mappings FROM assistant_field_mappings WHERE operation_id = p_operation AND attempt_id = ANY(attempts);
  UPDATE assistant_proposals SET attempt_id = NULL WHERE operation_id = p_operation AND attempt_id = ANY(attempts);
  UPDATE assistant_execution_results SET attempt_id = NULL WHERE operation_id = p_operation AND attempt_id = ANY(attempts);
  UPDATE assistant_testing_audio SET attempt_id = NULL WHERE operation_id = p_operation AND attempt_id = ANY(attempts);
  UPDATE offline_voice_notes SET attempt_id = NULL WHERE operation_id = p_operation AND attempt_id = ANY(attempts);
  UPDATE voice_entry_attempts SET previous_attempt_id = NULL WHERE operation_id = p_operation AND previous_attempt_id = ANY(attempts);
  UPDATE assistant_field_mappings SET correction_predecessor_id = NULL WHERE operation_id = p_operation AND correction_predecessor_id = ANY(mappings);
  DELETE FROM assistant_field_mappings WHERE operation_id = p_operation AND id = ANY(mappings);
  DELETE FROM voice_entry_attempts WHERE operation_id = p_operation AND id = ANY(attempts);
END;
$$;
REVOKE ALL ON FUNCTION assistant_lock_acquire(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_lock_acquire(uuid,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION assistant_lock_release(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_lock_release(uuid,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION assistant_billing_reserve(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_billing_reserve(uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION assistant_billing_finish(uuid,uuid,text,text,numeric,numeric,numeric,integer,boolean,boolean,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_billing_finish(uuid,uuid,text,text,numeric,numeric,numeric,integer,boolean,boolean,boolean) TO service_role;
REVOKE ALL ON FUNCTION assistant_billing_reconcile(uuid,uuid,text,text,numeric,numeric,numeric,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_billing_reconcile(uuid,uuid,text,text,numeric,numeric,numeric,integer) TO service_role;
REVOKE ALL ON FUNCTION assistant_billing_settle(uuid,uuid,text,text,text,numeric,numeric,numeric,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_billing_settle(uuid,uuid,text,text,text,numeric,numeric,numeric,integer) TO service_role;
REVOKE ALL ON FUNCTION assistant_cleanup_finished(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_cleanup_finished(uuid) TO service_role;

-- Historical submissions remain historical: no inferred facts, timestamps or consent.
INSERT INTO submission_field_states (operation_id, submission_id, field_name, state, source)
SELECT s.operation_id, s.id, fact.field_name, 'unknown', 'host'
FROM submissions s CROSS JOIN (VALUES ('type'), ('contractVersion'), ('title'), ('firstNote'), ('expected'), ('actual'), ('severity'), ('affectedWork'), ('workaround'), ('dataRisk'), ('capturedAt'), ('filedAt'), ('conversationId'), ('reproSteps'), ('reviewConfirmation')) AS fact(field_name)
ON CONFLICT (operation_id, submission_id, field_name) DO NOTHING;

-- Private early-testing audio bucket: user-mic recordings only, native codec,
-- 25 MB per object. No storage.objects policies are granted: bytes arrive only
-- through server-minted signed upload URLs after a stored accepted consent.
-- Guarded so non-Supabase test databases without the storage schema still load.
DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('assistant-testing-audio', 'assistant-testing-audio', false, 26214400, ARRAY['audio/webm','audio/mp4'])
    ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;

-- No SQL in this file has been applied by this implementation session.
UPDATE operations SET schema_version = 40 WHERE schema_version < 40;

COMMIT;
