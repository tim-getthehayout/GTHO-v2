/** @file Entity tests: submission */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/submission.js';

const OP_ID   = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '880e8400-e29b-41d4-a716-446655440000';

describe('entity: submission', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(22);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('validate', () => {
    it('passes for valid record with operationId and type', () => {
      const r = create({ operationId: OP_ID, type: 'bug' });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });

    it('fails when operationId is missing', () => {
      const r = create({ type: 'feature' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('operationId is required');
    });

    it('fails when type is missing', () => {
      const r = create({ operationId: OP_ID });
      r.type = '';
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('type is required');
    });

    it('fails when both required fields are missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips a minimal valid record correctly', () => {
      const r = create({ operationId: OP_ID, type: 'bug' });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });

    it('round-trips a fully-populated record correctly', () => {
      const r = create({
        operationId:       OP_ID,
        submitterId:       USER_ID,
        app:               'gthy',
        type:              'feature',
        category:          'ui',
        area:              'dashboard',
        screen:            'pasture-map',
        priority:          'high',
        status:            'open',
        note:              'Would be great to have drag-and-drop',
        version:           '2.0.1',
        thread:            [{ ts: '2025-01-01T00:00:00Z', text: 'Noted.' }],
        devResponse:       'Will review in next sprint',
        devResponseTs:     '2025-01-02T10:00:00Z',
        firstResponseAt:   '2025-01-02T10:00:00Z',
        resolvedInVersion: '2.1.0',
        resolutionNote:    'Implemented drag-and-drop in v2.1',
        oiNumber:          'OI-042',
        linkedTo:          null,
      });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
