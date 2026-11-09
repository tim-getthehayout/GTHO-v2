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
  "proposalId": {
    "type": "uuid",
    "required": true,
    "sbColumn": "proposal_id"
  },
  "revisionNumber": {
    "type": "integer",
    "required": true,
    "sbColumn": "revision_number",
    "minimum": 1
  },
  "destinationFieldNames": {
    "type": "text[]",
    "required": true,
    "sbColumn": "destination_field_names"
  },
  "supersededById": {
    "type": "uuid",
    "required": false,
    "sbColumn": "superseded_by_id"
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
