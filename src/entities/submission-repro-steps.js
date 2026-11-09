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
  "submissionId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "submission_id"
  },
  "position": {
    "type": "integer",
    "required": true,
    "sbColumn": "position",
    "minimum": 0
  },
  "stepText": {
    "type": "text",
    "required": true,
    "sbColumn": "step_text",
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
