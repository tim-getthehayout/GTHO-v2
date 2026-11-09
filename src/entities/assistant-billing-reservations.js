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
  "purpose": {
    "type": "text",
    "required": true,
    "sbColumn": "purpose",
    "minimum": 0
  },
  "requestRef": {
    "type": "text",
    "required": true,
    "sbColumn": "request_ref",
    "minimum": 0
  },
  "kind": {
    "type": "text",
    "required": true,
    "sbColumn": "kind",
    "enum": [
      "request",
      "settlement"
    ]
  },
  "lease": {
    "type": "uuid",
    "required": true,
    "sbColumn": "lease"
  },
  "routing": {
    "type": "text",
    "required": true,
    "sbColumn": "routing",
    "enum": [
      "shared",
      "operation-owned"
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
export const { create, validate, toSupabaseShape, fromSupabaseShape } = defineAssistantEntity(FIELDS);
