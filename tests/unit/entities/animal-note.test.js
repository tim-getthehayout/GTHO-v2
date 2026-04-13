/** @file Entity tests: animal_notes */
import { describe, it, expect } from 'vitest';
import { create, validate, toSupabaseShape, fromSupabaseShape, FIELDS } from '../../../src/entities/animal-note.js';

describe('animal-note entity', () => {
  it('exports FIELDS with correct sbColumn mappings', () => {
    expect(FIELDS.id.sbColumn).toBe('id');
    expect(FIELDS.operationId.sbColumn).toBe('operation_id');
    expect(FIELDS.animalId.sbColumn).toBe('animal_id');
    expect(FIELDS.notedAt.sbColumn).toBe('noted_at');
    expect(FIELDS.note.sbColumn).toBe('note');
  });

  it('create() returns defaults', () => {
    const r = create();
    expect(r.id).toBeTruthy();
    expect(r.operationId).toBeNull();
    expect(r.animalId).toBeNull();
    expect(r.note).toBe('');
    expect(r.notedAt).toBeTruthy();
  });

  it('create() accepts overrides', () => {
    const r = create({ operationId: 'op1', animalId: 'a1', note: 'limping' });
    expect(r.operationId).toBe('op1');
    expect(r.animalId).toBe('a1');
    expect(r.note).toBe('limping');
  });

  it('validate() requires operationId, animalId, notedAt, note', () => {
    const r = create();
    const result = validate(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('operationId is required');
    expect(result.errors).toContain('animalId is required');
  });

  it('validate() passes with valid data', () => {
    const r = create({ operationId: 'op1', animalId: 'a1', note: 'test note' });
    expect(validate(r).valid).toBe(true);
  });

  it('validate() rejects empty note', () => {
    const r = create({ operationId: 'op1', animalId: 'a1', note: '  ' });
    expect(validate(r).valid).toBe(false);
  });

  it('shape round-trip preserves data', () => {
    const original = create({
      operationId: 'op1',
      animalId: 'a1',
      notedAt: '2026-04-12T10:00:00Z',
      note: 'separated from herd',
    });
    const sb = toSupabaseShape(original);
    expect(sb.operation_id).toBe('op1');
    expect(sb.animal_id).toBe('a1');
    expect(sb.noted_at).toBe('2026-04-12T10:00:00Z');
    expect(sb.note).toBe('separated from herd');

    const restored = fromSupabaseShape(sb);
    expect(restored.operationId).toBe(original.operationId);
    expect(restored.animalId).toBe(original.animalId);
    expect(restored.notedAt).toBe(original.notedAt);
    expect(restored.note).toBe(original.note);
    expect(restored.id).toBe(original.id);
  });
});
