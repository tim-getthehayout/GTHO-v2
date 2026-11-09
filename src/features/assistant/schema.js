/** Physical host-schema inventory; metadata rows never imply backed-up audio bytes. */
export const ASSISTANT_TABLES = Object.freeze([
  'assistant_conversations', 'assistant_transcript_turns', 'voice_entry_attempts',
  'assistant_proposals', 'assistant_proposal_revisions', 'assistant_field_mappings',
  'assistant_review_cards', 'assistant_review_confirmations',
  'assistant_session_checkpoints', 'assistant_execution_results',
  'assistant_testing_consents', 'assistant_testing_audio', 'offline_voice_notes',
  'submission_field_states', 'submission_repro_steps',
  'assistant_session_locks', 'assistant_billing_policies', 'assistant_billing_reservations',
  'assistant_billing_usage', 'assistant_billing_settlements', 'assistant_restore_fences',
]);
export const HISTORICAL_FEEDBACK_FACTS = Object.freeze(["type", "contractVersion", "title", "firstNote", "expected", "actual", "severity", "affectedWork", "workaround", "dataRisk", "capturedAt", "filedAt", "conversationId", "reproSteps", "reviewConfirmation"]);
export const SUBMISSION_EXTENSION_COLUMNS = Object.freeze([
  'feedback_kind', 'contract_version', 'title', 'first_note', 'expected', 'actual',
  'severity', 'impact_affected_work', 'impact_workaround', 'impact_data_risk', 'captured_at', 'filed_at', 'conversation_id', 'review_confirmation_id',
]);

// Backend-only persistence: never trust a client-synced runtime envelope, lock or meter.
export const SERVER_ASSISTANT_TABLES = new Set([
  'assistant_session_checkpoints', 'assistant_execution_results', 'assistant_session_locks',
  'assistant_billing_policies', 'assistant_billing_reservations', 'assistant_billing_usage', 'assistant_billing_settlements', 'assistant_restore_fences',
]);
