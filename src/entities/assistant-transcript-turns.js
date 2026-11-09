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
  "turnIndex": {
    "type": "integer",
    "required": true,
    "sbColumn": "turn_index",
    "minimum": 0
  },
  "speaker": {
    "type": "text",
    "required": true,
    "sbColumn": "speaker"
  },
  "text": {
    "type": "text",
    "required": true,
    "sbColumn": "text"
  },
  "inputMode": {
    "type": "text",
    "required": true,
    "sbColumn": "input_mode"
  },
  "correctsTurnId": {
    "type": "uuid",
    "required": false,
    "sbColumn": "corrects_turn_id"
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
