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
  "revisionId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "revision_id"
  },
  "presentedAt": {
    "type": "timestamptz",
    "required": true,
    "sbColumn": "presented_at"
  },
  "populatedUi": {
    "type": "text",
    "required": true,
    "sbColumn": "populated_ui"
  },
  "presentedEvidence": {
    "type": "text",
    "required": true,
    "sbColumn": "presented_evidence"
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
