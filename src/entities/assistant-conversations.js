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
  "originalInput": {
    "type": "text",
    "required": false,
    "sbColumn": "original_input"
  },
  "originalContext": {
    "type": "text",
    "required": false,
    "sbColumn": "original_context"
  },
  "buildStamp": {
    "type": "text",
    "required": false,
    "sbColumn": "build_stamp"
  },
  "capturedAt": {
    "type": "timestamptz",
    "required": true,
    "sbColumn": "captured_at"
  },
  "currentIntent": {
    "type": "text",
    "required": false,
    "sbColumn": "current_intent"
  },
  "feedbackModulePin": {
    "type": "text",
    "required": true,
    "sbColumn": "feedback_module_pin"
  },
  "conversationRuntimePin": {
    "type": "text",
    "required": true,
    "sbColumn": "conversation_runtime_pin"
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
