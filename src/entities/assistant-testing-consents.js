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
  "actorId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "actor_id"
  },
  "decision": {
    "type": "text",
    "required": true,
    "sbColumn": "decision",
    "enum": [
      "accepted",
      "declined"
    ]
  },
  "decidedAt": {
    "type": "timestamptz",
    "required": true,
    "sbColumn": "decided_at"
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
