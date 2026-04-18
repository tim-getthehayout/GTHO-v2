/** @file Entity tests: animal */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/animal.js';

const OP_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('entity: animal', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(21);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('create', () => {
    it('returns record with defaults', () => {
      const r = create({ operationId: OP_ID, sex: 'female' });
      expect(r.active).toBe(true);
      expect(r.weaned).toBeNull();
      expect(r.damId).toBeNull();
      // OI-0099: confirmed_bred column is NOT NULL DEFAULT false; entity default mirrors.
      expect(r.confirmedBred).toBe(false);
    });
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ operationId: OP_ID, sex: 'male' });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });
    it('fails when operationId is missing', () => {
      expect(validate(create({ sex: 'female' })).valid).toBe(false);
    });
    it('fails when sex is missing', () => {
      expect(validate(create({ operationId: OP_ID, sex: '' })).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({
        operationId: OP_ID, sex: 'female', tagNum: '42', eid: 'EID001',
        name: 'Daisy', birthDate: '2022-03-15', weaned: true, weanedDate: '2022-10-01',
        cullDate: null, cullReason: null, cullNotes: null,
      });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });

    it('round-trips confirmedBred (OI-0099)', () => {
      const r = create({ operationId: OP_ID, sex: 'female', confirmedBred: true });
      expect(r.confirmedBred).toBe(true);
      const sb = toSupabaseShape(r);
      expect(sb.confirmed_bred).toBe(true);
      expect(fromSupabaseShape(sb).confirmedBred).toBe(true);
    });

    it('treats missing confirmed_bred on old backups as false (CP-56 contract)', () => {
      const row = {
        id: r1id(), operation_id: OP_ID, sex: 'female',
        // confirmed_bred intentionally omitted — pre-migration-026 backup row.
      };
      const rec = fromSupabaseShape(row);
      expect(rec.confirmedBred).toBe(false);
    });

    it('round-trips sire FKs with mutual exclusivity preserved', () => {
      const herdSire = create({ operationId: OP_ID, sex: 'female', sireAnimalId: 'a-1', sireAiBullId: null });
      expect(fromSupabaseShape(toSupabaseShape(herdSire)).sireAnimalId).toBe('a-1');
      const aiSire = create({ operationId: OP_ID, sex: 'female', sireAnimalId: null, sireAiBullId: 'b-1' });
      expect(fromSupabaseShape(toSupabaseShape(aiSire)).sireAiBullId).toBe('b-1');
    });
  });
});

function r1id() { return '11111111-1111-1111-1111-111111111111'; }
