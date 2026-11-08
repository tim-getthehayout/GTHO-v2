-- Host artifact schema from V2_SCHEMA_DESIGN.md sections 11.2a-b.
-- PREPARED ONLY: not applied to a live project. Audio metadata is not audio-byte storage.
BEGIN;


ALTER TABLE submissions ADD CONSTRAINT submissions_operation_identity UNIQUE (operation_id, id);


CREATE TABLE submission_field_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  submission_id uuid NOT NULL,
  field_name text NOT NULL,
  state text NOT NULL CHECK (state IN ('known','unknown','unavailable','not_applicable')),
  reason text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  UNIQUE (operation_id, submission_id, field_name)
);


ALTER TABLE submission_field_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON submission_field_states FROM anon, authenticated;
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
  step_text text,
  state text NOT NULL CHECK (state IN ('known','unknown','unavailable','not_applicable')),
  reason text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  UNIQUE (operation_id, submission_id, position),
  CHECK ((state = 'known' AND step_text IS NOT NULL) OR (state <> 'known' AND step_text IS NULL))
);


ALTER TABLE submission_repro_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON submission_repro_steps FROM anon, authenticated;
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);


ALTER TABLE assistant_session_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_session_checkpoints FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_session_checkpoints TO authenticated;

CREATE POLICY assistant_session_checkpoints_select ON assistant_session_checkpoints FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_session_checkpoints_insert ON assistant_session_checkpoints FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_session_checkpoints_update ON assistant_session_checkpoints FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_session_checkpoints_delete ON assistant_session_checkpoints FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



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
GRANT SELECT, INSERT, UPDATE, DELETE ON voice_entry_attempts TO authenticated;

CREATE POLICY voice_entry_attempts_select ON voice_entry_attempts FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY voice_entry_attempts_insert ON voice_entry_attempts FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY voice_entry_attempts_update ON voice_entry_attempts FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY voice_entry_attempts_delete ON voice_entry_attempts FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



CREATE TABLE assistant_execution_results (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_execution_results TO authenticated;

CREATE POLICY assistant_execution_results_select ON assistant_execution_results FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_execution_results_insert ON assistant_execution_results FOR INSERT TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_execution_results_update ON assistant_execution_results FOR UPDATE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)) WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));

CREATE POLICY assistant_execution_results_delete ON assistant_execution_results FOR DELETE TO authenticated USING (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL));



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
  ADD COLUMN impact text,
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

-- Historical submissions remain historical: no inferred facts, timestamps or consent.
INSERT INTO submission_field_states (operation_id, submission_id, field_name, state)
SELECT s.operation_id, s.id, fact.field_name, 'unknown'
FROM submissions s CROSS JOIN (VALUES ('type'), ('contractVersion'), ('title'), ('firstNote'), ('expected'), ('actual'), ('severity'), ('impact'), ('capturedAt'), ('filedAt'), ('conversationId'), ('reproSteps'), ('reviewConfirmation')) AS fact(field_name)
ON CONFLICT (operation_id, submission_id, field_name) DO NOTHING;

-- No SQL in this file has been applied by this implementation session.
UPDATE operations SET schema_version = 40 WHERE schema_version < 40;

COMMIT;
