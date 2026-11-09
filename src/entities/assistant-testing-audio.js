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
  "attemptId": {
    "type": "uuid",
    "required": false,
    "sbColumn": "attempt_id"
  },
  "consentId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "consent_id"
  },
  "audioReference": {
    "type": "text",
    "required": true,
    "sbColumn": "audio_reference"
  },
  "capturedAt": {
    "type": "timestamptz",
    "required": true,
    "sbColumn": "captured_at"
  },
  "durationMs": {
    "type": "numeric",
    "required": false,
    "sbColumn": "duration_ms",
    "minimum": 0
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
