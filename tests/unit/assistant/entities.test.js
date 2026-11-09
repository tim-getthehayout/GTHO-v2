import { describe, it, expect } from 'vitest';
import { ASSISTANT_ENTITIES } from '../../../src/features/assistant/entities.js';
import { ENTITY_TYPES } from '../../../src/data/store.js';
import { SYNC_REGISTRY } from '../../../src/data/sync-registry.js';
const id = '00000000-0000-4000-8000-000000000001';
describe('artifact entity/store bindings', () => {
  for (const [key, { entity, table, serverOnly }] of Object.entries(ASSISTANT_ENTITIES)) {
    it(`${table} round-trips columns and is registered only on its authorized storage side`, () => {
      const data = {};
      for (const [name, field] of Object.entries(entity.FIELDS)) {
        data[name] = field.enum?.[0] ?? (field.type === 'uuid' ? id : field.type === 'text[]' ? ['x'] : field.type === 'jsonb' ? { version: 1, scope: { operationId: id }, conversationRef: id, transcript: [] } : ['numeric','integer'].includes(field.type) ? 2 : field.type === 'boolean' ? false : 'value');
      }
      const row = entity.create(data);
      expect(entity.fromSupabaseShape(entity.toSupabaseShape(row))).toEqual(row);
      expect(ENTITY_TYPES.includes(key)).toBe(!serverOnly);
      expect(!!SYNC_REGISTRY[key]).toBe(!serverOnly);
      if (!serverOnly) expect(SYNC_REGISTRY[key].table).toBe(table);
    });
  }
  it('rejects per-step state models and unknown artifact fields', () => {
    const step = ASSISTANT_ENTITIES.submissionReproSteps.entity;
    expect(() => step.create({ state: 'unknown' })).toThrow('Unknown artifact field');
    expect(step.validate(step.create({ operationId: id, submissionId: id, position: 0, stepText: '' })).valid).toBe(false);
  });
  it('requires impact source provenance even when the historical fact is unknown', () => {
    const entity = ASSISTANT_ENTITIES.submissionFieldStates.entity;
    const record = entity.create({ operationId: id, submissionId: id, fieldName: 'affectedWork', state: 'unknown' });
    expect(entity.validate(record).valid).toBe(false);
    expect(entity.validate({ ...record, source: 'host' }).valid).toBe(true);
  });
  it('coerces database numeric strings and rejects slot mismatch', () => {
    const entity = ASSISTANT_ENTITIES.assistantFieldMappings.entity;
    expect(entity.fromSupabaseShape({ value_number: '2.5' }).valueNumber).toBe(2.5);
    expect(entity.validate(entity.create({ operationId: id, attemptId: id, revisionId: id, destinationFieldName: 'notes', valueType: 'text', valueNumber: 2 })).valid).toBe(false);
  });
});
