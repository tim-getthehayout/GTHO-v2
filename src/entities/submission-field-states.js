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
  "fieldName": {
    "type": "text",
    "required": true,
    "sbColumn": "field_name"
  },
  "state": {
    "type": "text",
    "required": true,
    "sbColumn": "state",
    "enum": [
      "known",
      "unknown",
      "unavailable",
      "not_applicable",
      "not_reproducible"
    ]
  },
  "reason": {
    "type": "text",
    "required": false,
    "sbColumn": "reason"
  },
  "source": {
    "type": "text",
    "required": false,
    "sbColumn": "source",
    "enum": [
      "user",
      "host"
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
export const { create, validate, toSupabaseShape, fromSupabaseShape } = defineAssistantEntity(FIELDS, record => {
  if (['affectedWork','workaround','dataRisk'].includes(record.fieldName) && !['known','unknown'].includes(record.state)) return ['impact fact state must be known or unknown'];
  if (record.fieldName === 'reproSteps' && !['known','unknown','not_reproducible','not_applicable'].includes(record.state)) return ['invalid whole-list reproSteps state'];
  return [];
});
