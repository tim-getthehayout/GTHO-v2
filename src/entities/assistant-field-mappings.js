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
  "attemptId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "attempt_id"
  },
  "revisionId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "revision_id"
  },
  "sourceTurnId": {
    "type": "uuid",
    "required": false,
    "sbColumn": "source_turn_id"
  },
  "destinationFieldName": {
    "type": "text",
    "required": true,
    "sbColumn": "destination_field_name"
  },
  "valueType": {
    "type": "text",
    "required": true,
    "sbColumn": "value_type",
    "enum": [
      "text",
      "number",
      "boolean",
      "date",
      "timestamp",
      "uuid",
      "null"
    ]
  },
  "valueText": {
    "type": "text",
    "required": false,
    "sbColumn": "value_text"
  },
  "valueNumber": {
    "type": "numeric",
    "required": false,
    "sbColumn": "value_number"
  },
  "valueBoolean": {
    "type": "boolean",
    "required": false,
    "sbColumn": "value_boolean"
  },
  "valueDate": {
    "type": "date",
    "required": false,
    "sbColumn": "value_date"
  },
  "valueTimestamp": {
    "type": "timestamptz",
    "required": false,
    "sbColumn": "value_timestamp"
  },
  "valueUuid": {
    "type": "uuid",
    "required": false,
    "sbColumn": "value_uuid"
  },
  "uncertainty": {
    "type": "text",
    "required": false,
    "sbColumn": "uncertainty"
  },
  "correctionPredecessorId": {
    "type": "uuid",
    "required": false,
    "sbColumn": "correction_predecessor_id"
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
  const slots = { text: 'valueText', number: 'valueNumber', boolean: 'valueBoolean', date: 'valueDate', timestamp: 'valueTimestamp', uuid: 'valueUuid' };
  const populated = Object.values(slots).filter(key => record[key] != null);
  return record.valueType === 'null' ? (populated.length ? ['null mapping cannot carry a value'] : []) : populated.length === 1 && populated[0] === slots[record.valueType] ? [] : ['typed mapping slot mismatch'];
});
