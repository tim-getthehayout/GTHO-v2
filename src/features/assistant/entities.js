import { SERVER_ASSISTANT_TABLES } from './schema.js';
import * as SubmissionFieldStates from '../../entities/submission-field-states.js';
import * as SubmissionReproSteps from '../../entities/submission-repro-steps.js';
import * as AssistantConversations from '../../entities/assistant-conversations.js';
import * as AssistantTranscriptTurns from '../../entities/assistant-transcript-turns.js';
import * as AssistantProposals from '../../entities/assistant-proposals.js';
import * as AssistantProposalRevisions from '../../entities/assistant-proposal-revisions.js';
import * as AssistantFieldMappings from '../../entities/assistant-field-mappings.js';
import * as AssistantReviewCards from '../../entities/assistant-review-cards.js';
import * as AssistantReviewConfirmations from '../../entities/assistant-review-confirmations.js';
import * as AssistantSessionCheckpoints from '../../entities/assistant-session-checkpoints.js';
import * as VoiceEntryAttempts from '../../entities/voice-entry-attempts.js';
import * as AssistantExecutionResults from '../../entities/assistant-execution-results.js';
import * as AssistantTestingConsents from '../../entities/assistant-testing-consents.js';
import * as AssistantTestingAudio from '../../entities/assistant-testing-audio.js';
import * as OfflineVoiceNotes from '../../entities/offline-voice-notes.js';
import * as AssistantSessionLocks from '../../entities/assistant-session-locks.js';
import * as AssistantBillingPolicies from '../../entities/assistant-billing-policies.js';
import * as AssistantBillingReservations from '../../entities/assistant-billing-reservations.js';
import * as AssistantBillingUsage from '../../entities/assistant-billing-usage.js';
import * as AssistantBillingSettlements from '../../entities/assistant-billing-settlements.js';
export const ASSISTANT_ENTITIES = {
  submissionFieldStates: { table: 'submission_field_states', entity: SubmissionFieldStates, serverOnly: SERVER_ASSISTANT_TABLES.has('submission_field_states') },
  submissionReproSteps: { table: 'submission_repro_steps', entity: SubmissionReproSteps, serverOnly: SERVER_ASSISTANT_TABLES.has('submission_repro_steps') },
  assistantConversations: { table: 'assistant_conversations', entity: AssistantConversations, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_conversations') },
  assistantTranscriptTurns: { table: 'assistant_transcript_turns', entity: AssistantTranscriptTurns, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_transcript_turns') },
  assistantProposals: { table: 'assistant_proposals', entity: AssistantProposals, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_proposals') },
  assistantProposalRevisions: { table: 'assistant_proposal_revisions', entity: AssistantProposalRevisions, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_proposal_revisions') },
  assistantFieldMappings: { table: 'assistant_field_mappings', entity: AssistantFieldMappings, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_field_mappings') },
  assistantReviewCards: { table: 'assistant_review_cards', entity: AssistantReviewCards, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_review_cards') },
  assistantReviewConfirmations: { table: 'assistant_review_confirmations', entity: AssistantReviewConfirmations, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_review_confirmations') },
  assistantSessionCheckpoints: { table: 'assistant_session_checkpoints', entity: AssistantSessionCheckpoints, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_session_checkpoints') },
  voiceEntryAttempts: { table: 'voice_entry_attempts', entity: VoiceEntryAttempts, serverOnly: SERVER_ASSISTANT_TABLES.has('voice_entry_attempts') },
  assistantExecutionResults: { table: 'assistant_execution_results', entity: AssistantExecutionResults, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_execution_results') },
  assistantTestingConsents: { table: 'assistant_testing_consents', entity: AssistantTestingConsents, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_testing_consents') },
  assistantTestingAudio: { table: 'assistant_testing_audio', entity: AssistantTestingAudio, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_testing_audio') },
  offlineVoiceNotes: { table: 'offline_voice_notes', entity: OfflineVoiceNotes, serverOnly: SERVER_ASSISTANT_TABLES.has('offline_voice_notes') },
  assistantSessionLocks: { table: 'assistant_session_locks', entity: AssistantSessionLocks, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_session_locks') },
  assistantBillingPolicies: { table: 'assistant_billing_policies', entity: AssistantBillingPolicies, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_billing_policies') },
  assistantBillingReservations: { table: 'assistant_billing_reservations', entity: AssistantBillingReservations, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_billing_reservations') },
  assistantBillingUsage: { table: 'assistant_billing_usage', entity: AssistantBillingUsage, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_billing_usage') },
  assistantBillingSettlements: { table: 'assistant_billing_settlements', entity: AssistantBillingSettlements, serverOnly: SERVER_ASSISTANT_TABLES.has('assistant_billing_settlements') },
};
