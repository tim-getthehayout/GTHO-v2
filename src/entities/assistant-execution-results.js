import { defineAssistantEntity } from './assistant-entity.js';

export const FIELDS = {
  "conversationRef": {
    "type": "text",
    "required": true,
    "sbColumn": "conversation_ref",
    "minimum": 0
  },
  "proposalId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "proposal_id"
  },
  "proposalRevision": {
    "type": "integer",
    "required": true,
    "sbColumn": "proposal_revision",
    "minimum": 1
  },
  "id": {
    "type": "uuid",
    "required": true,
    "sbColumn": "id"
  },
  "operationId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "operation_id"
  },
  "conversationId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "conversation_id"
  },
  "attemptId": {
    "type": "uuid",
    "required": false,
    "sbColumn": "attempt_id"
  },
  "revisionId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "revision_id"
  },
  "confirmationId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "confirmation_id"
  },
  "destinationEntity": {
    "type": "text",
    "required": true,
    "sbColumn": "destination_entity"
  },
  "savedRecordId": {
    "type": "uuid",
    "required": false,
    "sbColumn": "saved_record_id"
  },
  "localSavedAt": {
    "type": "timestamptz",
    "required": false,
    "sbColumn": "local_saved_at"
  },
  "syncQueuedAt": {
    "type": "timestamptz",
    "required": false,
    "sbColumn": "sync_queued_at"
  },
  "serverAcknowledgedAt": {
    "type": "timestamptz",
    "required": false,
    "sbColumn": "server_acknowledged_at"
  },
  "feedbackHandoffAcknowledgedAt": {
    "type": "timestamptz",
    "required": false,
    "sbColumn": "feedback_handoff_acknowledged_at"
  },
  "failureStage": {
    "type": "text",
    "required": false,
    "sbColumn": "failure_stage"
  },
  "failureDetail": {
    "type": "text",
    "required": false,
    "sbColumn": "failure_detail"
  },
  "createdAt": {
    "type": "timestamptz",
    "required": true,
    "sbColumn": "created_at"
  },
  "updatedAt": {
    "type": "timestamptz",
    "required": true,
    "sbColumn": "updated_at"
  }
};
export const { create, validate, toSupabaseShape, fromSupabaseShape } = defineAssistantEntity(FIELDS);
