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
  "transcriptPosition": {
    "type": "integer",
    "required": true,
    "sbColumn": "transcript_position",
    "minimum": 0
  },
  "pendingRevisionId": {
    "type": "uuid",
    "required": false,
    "sbColumn": "pending_revision_id"
  },
  "lifecyclePhase": {
    "type": "text",
    "required": true,
    "sbColumn": "lifecycle_phase"
  },
  "trustedSnapshot": {
    "type": "jsonb",
    "required": true,
    "sbColumn": "trusted_snapshot"
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
export const { create, validate, toSupabaseShape, fromSupabaseShape } = defineAssistantEntity(FIELDS, record => {
  const s = record.trustedSnapshot;
  return s && s.version === 1 && s.scope?.operationId === record.operationId && typeof s.conversationRef === 'string' && Array.isArray(s.transcript) ? [] : ['trustedSnapshot must be the scoped version-1 runtime envelope'];
});
