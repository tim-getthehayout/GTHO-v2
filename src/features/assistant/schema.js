/** Physical host-schema inventory; metadata rows never imply backed-up audio bytes. */
export const ASSISTANT_TABLES = Object.freeze([
  'assistant_conversations', 'assistant_transcript_turns', 'voice_entry_attempts',
  'assistant_proposals', 'assistant_proposal_revisions', 'assistant_field_mappings',
  'assistant_review_cards', 'assistant_review_confirmations',
  'assistant_session_checkpoints', 'assistant_execution_results',
  'assistant_testing_consents', 'assistant_testing_audio', 'offline_voice_notes',
  'submission_field_states', 'submission_repro_steps',
]);
export const HISTORICAL_FEEDBACK_FACTS = Object.freeze(["type", "contractVersion", "title", "firstNote", "expected", "actual", "severity", "impact", "capturedAt", "filedAt", "conversationId", "reproSteps", "reviewConfirmation"]);
export const SUBMISSION_EXTENSION_COLUMNS = Object.freeze([
  'feedback_kind', 'contract_version', 'title', 'first_note', 'expected', 'actual',
  'severity', 'impact', 'captured_at', 'filed_at', 'conversation_id', 'review_confirmation_id',
]);
