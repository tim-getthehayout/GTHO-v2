/** @file Entity tests: release-note */
// No operationId — global/public table. No RLS (public read).
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/release-note.js';

describe('entity: release-note', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(5);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  it('does not include operationId (global table)', () => {
    expect(FIELDS).not.toHaveProperty('operationId');
  });

  describe('validate', () => {
    it('passes for valid record with version, title, and body', () => {
      const r = create({ version: '2.1.0', title: 'Spring 2025 Release', body: 'Added rotation calendar.' });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });

    it('fails when version is missing', () => {
      const r = create({ title: 'Spring Release', body: 'Added feature.' });
      r.version = '';
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('version is required');
    });

    it('fails when title is missing', () => {
      const r = create({ version: '2.1.0', body: 'Added feature.' });
      r.title = '';
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('title is required');
    });

    it('fails when body is missing', () => {
      const r = create({ version: '2.1.0', title: 'Spring Release' });
      r.body = '';
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('body is required');
    });

    it('fails when body is whitespace only', () => {
      const r = create({ version: '2.1.0', title: 'Spring Release', body: '   ' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('body is required');
    });

    it('fails when all required fields are missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips a minimal valid record correctly', () => {
      const r = create({ version: '2.1.0', title: 'Spring 2025 Release', body: 'Added rotation calendar.' });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });

    it('round-trips a fully-populated record correctly', () => {
      const r = create({
        version:     '2.2.0',
        title:       'Summer 2025 Release',
        body:        '## Highlights\n- Offline sync hardening\n- PWA install prompt\n- Accessibility improvements',
        publishedAt: '2025-06-01T12:00:00Z',
      });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
