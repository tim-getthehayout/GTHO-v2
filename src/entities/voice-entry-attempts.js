import { defineAssistantEntity } from './assistant-entity.js';

export const FIELDS = {
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
  "previousAttemptId": {
    "type": "uuid",
    "required": false,
    "sbColumn": "previous_attempt_id"
  },
  "capturedAt": {
    "type": "timestamptz",
    "required": true,
    "sbColumn": "captured_at"
  },
  "status": {
    "type": "text",
    "required": true,
    "sbColumn": "status",
    "enum": [
      "unfinished",
      "finished",
      "discarded"
    ]
  },
  "finishedAt": {
    "type": "timestamptz",
    "required": false,
    "sbColumn": "finished_at"
  },
  "purpose": {
    "type": "text",
    "required": true,
    "sbColumn": "purpose",
    "enum": [
      "write",
      "question",
      "feedback",
      "how-to"
    ]
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
export const { create, validate, toSupabaseShape, fromSupabaseShape } = defineAssistantEntity(FIELDS, record => (record.status === 'finished') === (record.finishedAt != null) ? [] : ['finishedAt must match finished status']);
