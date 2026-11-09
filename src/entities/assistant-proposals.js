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
  "destinationEntity": {
    "type": "text",
    "required": true,
    "sbColumn": "destination_entity"
  },
  "destinationUi": {
    "type": "text",
    "required": true,
    "sbColumn": "destination_ui"
  },
  "existingRecordId": {
    "type": "uuid",
    "required": false,
    "sbColumn": "existing_record_id"
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
