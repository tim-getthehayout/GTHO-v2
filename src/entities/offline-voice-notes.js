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
  "deviceLocalReference": {
    "type": "text",
    "required": true,
    "sbColumn": "device_local_reference"
  },
  "originalContext": {
    "type": "text",
    "required": false,
    "sbColumn": "original_context"
  },
  "capturedAt": {
    "type": "timestamptz",
    "required": true,
    "sbColumn": "captured_at"
  },
  "confirmedExecutionResultId": {
    "type": "uuid",
    "required": false,
    "sbColumn": "confirmed_execution_result_id"
  },
  "deletedAt": {
    "type": "timestamptz",
    "required": false,
    "sbColumn": "deleted_at"
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
