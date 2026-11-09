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
  "providerSessionRef": {
    "type": "text",
    "required": true,
    "sbColumn": "provider_session_ref",
    "minimum": 0
  },
  "settlementRef": {
    "type": "text",
    "required": true,
    "sbColumn": "settlement_ref",
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
