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
  "lease": {
    "type": "uuid",
    "required": true,
    "sbColumn": "lease"
  },
  "purpose": {
    "type": "text",
    "required": true,
    "sbColumn": "purpose"
  },
  "model": {
    "type": "text",
    "required": false,
    "sbColumn": "model"
  },
  "voiceSession": {
    "type": "text",
    "required": false,
    "sbColumn": "voice_session"
  },
  "inputTokens": {
    "type": "numeric",
    "required": false,
    "sbColumn": "input_tokens",
    "minimum": 0
  },
  "outputTokens": {
    "type": "numeric",
    "required": false,
    "sbColumn": "output_tokens",
    "minimum": 0
  },
  "audioMinutes": {
    "type": "numeric",
    "required": false,
    "sbColumn": "audio_minutes",
    "minimum": 0
  },
  "requestCount": {
    "type": "integer",
    "required": false,
    "sbColumn": "request_count",
    "minimum": 0
  },
  "billShared": {
    "type": "boolean",
    "required": true,
    "sbColumn": "bill_shared"
  },
  "failed": {
    "type": "boolean",
    "required": true,
    "sbColumn": "failed"
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
