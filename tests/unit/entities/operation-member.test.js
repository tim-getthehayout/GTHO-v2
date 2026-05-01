/** @file Entity tests: operation-member */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/operation-member.js';

describe('entity: operation-member', () => {
  const OP_ID = '550e8400-e29b-41d4-a716-446655440000';

  it('exports FIELDS with all columns', () => {
    const keys = Object.keys(FIELDS);
    expect(keys).toContain('operationId');
    expect(keys).toContain('displayName');
    expect(keys).toContain('role');
    expect(keys).toContain('inviteToken');
    expect(keys).toContain('isDev');
    expect(keys).toHaveLength(13);
  });

  it('every FIELDS entry has sbColumn', () => {
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('create', () => {
    it('returns a record with defaults', () => {
      const record = create({ operationId: OP_ID, displayName: 'Tim', email: 'tim@example.com' });
      expect(record.role).toBe('team_member');
      expect(record.userId).toBeNull();
      expect(record.inviteToken).toBeNull();
      expect(record.invitedAt).toBeNull();
      expect(record.acceptedAt).toBeNull();
    });
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const record = create({ operationId: OP_ID, displayName: 'Tim', email: 'tim@example.com' });
      expect(validate(record)).toEqual({ valid: true, errors: [] });
    });

    it('fails when operationId is missing', () => {
      const record = create({ displayName: 'Tim', email: 'tim@example.com' });
      expect(validate(record).valid).toBe(false);
    });

    it('fails when displayName is missing', () => {
      const record = create({ operationId: OP_ID, email: 'tim@example.com' });
      expect(validate(record).valid).toBe(false);
    });

    it('fails when email is missing', () => {
      const record = create({ operationId: OP_ID, displayName: 'Tim' });
      expect(validate(record).valid).toBe(false);
    });

    it('fails for invalid role', () => {
      const record = create({ operationId: OP_ID, displayName: 'Tim', email: 'tim@example.com', role: 'superadmin' });
      expect(validate(record).valid).toBe(false);
      expect(validate(record).errors[0]).toContain('role must be one of');
    });

    it('passes for all valid roles', () => {
      for (const role of ['owner', 'admin', 'team_member']) {
        const record = create({ operationId: OP_ID, displayName: 'Tim', email: 'tim@example.com', role });
        expect(validate(record).valid).toBe(true);
      }
    });
  });

  describe('shape round-trip', () => {
    it('fromSupabaseShape(toSupabaseShape(record)) returns original', () => {
      const record = create({
        operationId: OP_ID, displayName: 'Tim', email: 'tim@example.com',
        phone: '+1234567890', role: 'admin',
        userId: '770e8400-e29b-41d4-a716-446655440000',
        inviteToken: null,
        invitedAt: '2024-01-01T00:00:00Z', acceptedAt: '2024-01-02T00:00:00Z',
      });
      const roundTripped = fromSupabaseShape(toSupabaseShape(record));
      expect(roundTripped).toEqual(record);
    });

    it('round-trips invite_token for pending members', () => {
      const record = create({
        operationId: OP_ID, displayName: 'New Person', email: 'new@example.com',
        role: 'team_member', inviteToken: '990e8400-e29b-41d4-a716-446655440000',
        invitedAt: '2024-06-01T00:00:00Z',
      });
      const roundTripped = fromSupabaseShape(toSupabaseShape(record));
      expect(roundTripped).toEqual(record);
      expect(roundTripped.inviteToken).toBe('990e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('OI-0138: isDev', () => {
    it('isDev defaults to false on create()', () => {
      const record = create({ operationId: OP_ID, displayName: 'X', email: 'x@y.com' });
      expect(record.isDev).toBe(false);
    });

    it('validate accepts boolean true and false', () => {
      const t = create({ operationId: OP_ID, displayName: 'X', email: 'x@y.com', isDev: true });
      expect(validate(t).valid).toBe(true);
      const f = create({ operationId: OP_ID, displayName: 'X', email: 'x@y.com', isDev: false });
      expect(validate(f).valid).toBe(true);
    });

    it('validate rejects non-boolean isDev (string "true")', () => {
      const record = create({ operationId: OP_ID, displayName: 'X', email: 'x@y.com' });
      record.isDev = 'true';
      const result = validate(record);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('isDev must be a boolean');
    });

    it('toSupabaseShape maps isDev → is_dev', () => {
      const record = create({ operationId: OP_ID, displayName: 'X', email: 'x@y.com', isDev: true });
      expect(toSupabaseShape(record).is_dev).toBe(true);
    });

    it('fromSupabaseShape maps is_dev → isDev (defensive coerce)', () => {
      const sb = { id: '1', operation_id: OP_ID, user_id: null, display_name: 'X', email: 'x@y.com',
        phone: null, role: 'team_member', invite_token: null, invited_at: null, accepted_at: null,
        is_dev: true, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' };
      expect(fromSupabaseShape(sb).isDev).toBe(true);
      const sbFalse = { ...sb, is_dev: false };
      expect(fromSupabaseShape(sbFalse).isDev).toBe(false);
      const sbMissing = { ...sb }; delete sbMissing.is_dev;
      expect(fromSupabaseShape(sbMissing).isDev).toBe(false);
    });

    it('round-trips isDev=true', () => {
      const record = create({ operationId: OP_ID, displayName: 'X', email: 'x@y.com', isDev: true });
      const roundTripped = fromSupabaseShape(toSupabaseShape(record));
      expect(roundTripped.isDev).toBe(true);
      expect(roundTripped).toEqual(record);
    });
  });

  describe('CP-66: invite token', () => {
    it('inviteToken defaults to null', () => {
      const record = create({ operationId: OP_ID, displayName: 'X', email: 'x@y.com' });
      expect(record.inviteToken).toBeNull();
    });

    it('toSupabaseShape maps inviteToken → invite_token', () => {
      const record = create({
        operationId: OP_ID, displayName: 'X', email: 'x@y.com',
        inviteToken: 'abc-def',
      });
      const sb = toSupabaseShape(record);
      expect(sb.invite_token).toBe('abc-def');
    });

    it('fromSupabaseShape maps invite_token → inviteToken', () => {
      const sb = { id: '1', operation_id: OP_ID, user_id: null, display_name: 'X', email: 'x@y.com',
        phone: null, role: 'team_member', invite_token: 'tok-123',
        invited_at: null, accepted_at: null, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' };
      const js = fromSupabaseShape(sb);
      expect(js.inviteToken).toBe('tok-123');
    });
  });
});
