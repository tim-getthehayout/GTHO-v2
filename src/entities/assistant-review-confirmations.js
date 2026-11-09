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
  "cardId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "card_id"
  },
  "revisionId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "revision_id"
  },
  "actorId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "actor_id"
  },
  "confirmedAt": {
    "type": "timestamptz",
    "required": true,
    "sbColumn": "confirmed_at"
  },
  "channel": {
    "type": "text",
    "required": true,
    "sbColumn": "channel"
  },
  "evidenceTurnId": {
    "type": "uuid",
    "required": false,
    "sbColumn": "evidence_turn_id"
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
