import { describe, it, expect } from 'vitest';
import {
  FIELDS,
  create,
  validate,
  toSupabaseShape,
  fromSupabaseShape,
} from '../../../src/entities/animal-calving-record.js';

const OP_ID     = '550e8400-e29b-41d4-a716-446655440000';
const ANIMAL_ID = '660e8400-e29b-41d4-a716-446655440000';
const CAT_ID    = '770e8400-e29b-41d4-a716-446655440000';

describe('animal-calving-record entity', () => {
  // --- FIELDS ---
  it('exports 12 fields', () => {
    expect(Object.keys(FIELDS)).toHaveLength(12);
  });

  it('FIELDS.operationId has sbColumn operation_id', () => {
    expect(FIELDS.operationId.sbColumn).toBe('operation_id');
  });

  it('FIELDS.damId has sbColumn dam_id', () => {
    expect(FIELDS.damId.sbColumn).toBe('dam_id');
  });

  it('FIELDS.calvedAt has sbColumn calved_at', () => {
    expect(FIELDS.calvedAt.sbColumn).toBe('calved_at');
  });

  it('FIELDS.calfId has sbColumn calf_id', () => {
    expect(FIELDS.calfId.sbColumn).toBe('calf_id');
  });

  it('FIELDS.sireAiBullId has sbColumn sire_ai_bull_id', () => {
    expect(FIELDS.sireAiBullId.sbColumn).toBe('sire_ai_bull_id');
  });

  it('FIELDS.driedOffDate has sbColumn dried_off_date', () => {
    expect(FIELDS.driedOffDate.sbColumn).toBe('dried_off_date');
  });

  // --- validate ---
  it('validate passes with required fields', () => {
    const record = create({
      operationId: OP_ID,
      damId:       ANIMAL_ID,
      calvedAt:    '2025-03-15T00:00:00.000Z',
    });
    const result = validate(record);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate fails when operationId is missing', () => {
    const record = create({ damId: ANIMAL_ID, calvedAt: '2025-03-15T00:00:00.000Z' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('operationId is required');
  });

  it('validate fails when damId is missing', () => {
    const record = create({ operationId: OP_ID, calvedAt: '2025-03-15T00:00:00.000Z' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('damId is required');
  });

  it('validate fails when calvedAt is missing', () => {
    const record = create({ operationId: OP_ID, damId: ANIMAL_ID });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('calvedAt is required');
  });

  it('validate fails when all required fields are missing', () => {
    const record = create({});
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  // --- shape round-trip ---
  it('round-trips through toSupabaseShape / fromSupabaseShape', () => {
    const original = create({
      operationId:  OP_ID,
      damId:        ANIMAL_ID,
      calfId:       CAT_ID,
      calvedAt:     '2025-03-15T00:00:00.000Z',
      sireAnimalId: null,
      sireAiBullId: CAT_ID,
      stillbirth:   false,
      driedOffDate: '2025-09-15',
      notes:        'Uneventful calving',
      createdAt:    '2025-01-01T00:00:00.000Z',
      updatedAt:    '2025-01-01T00:00:00.000Z',
    });
    const result = fromSupabaseShape(toSupabaseShape(original));
    expect(result).toEqual(original);
  });
});
