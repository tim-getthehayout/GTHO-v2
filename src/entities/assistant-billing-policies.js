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
  "rateRequests": {
    "type": "integer",
    "required": true,
    "sbColumn": "rate_requests",
    "minimum": 1
  },
  "rateWindowSeconds": {
    "type": "integer",
    "required": true,
    "sbColumn": "rate_window_seconds",
    "minimum": 1
  },
  "monthlyRequests": {
    "type": "integer",
    "required": true,
    "sbColumn": "monthly_requests",
    "minimum": 1
  },
  "monthlyAudioMinutes": {
    "type": "numeric",
    "required": true,
    "sbColumn": "monthly_audio_minutes",
    "minimum": 0
  },
  "billingTimezone": {
    "type": "text",
    "required": false,
    "sbColumn": "billing_timezone"
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
