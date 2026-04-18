/** @file Tests for group archive/reactivate (OI-0090 / SP-11 Parts 2–3). */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getById, archiveGroup, reactivateGroup } from '../../src/data/store.js';
import * as GroupEntity from '../../src/entities/group.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const GID = '00000000-0000-0000-0000-0000000000g1';

function seedGroup(overrides = {}) {
  add('groups', GroupEntity.create({
    id: GID, operationId: OP, farmId: FARM, name: 'Herd', ...overrides,
  }), GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
}

describe('GroupEntity round-trip', () => {
  it('preserves archivedAt through toSupabaseShape → fromSupabaseShape', () => {
    const iso = '2026-04-18T12:30:00.000Z';
    const record = GroupEntity.create({ id: GID, operationId: OP, farmId: FARM, name: 'X', archivedAt: iso });
    const sb = GroupEntity.toSupabaseShape(record);
    expect(sb.archived_at).toBe(iso);
    const roundTrip = GroupEntity.fromSupabaseShape(sb);
    expect(roundTrip.archivedAt).toBe(iso);
  });

  it('preserves null archivedAt through round-trip', () => {
    const record = GroupEntity.create({ id: GID, operationId: OP, farmId: FARM, name: 'X' });
    expect(record.archivedAt).toBeNull();
    const sb = GroupEntity.toSupabaseShape(record);
    expect(sb.archived_at).toBeNull();
    const roundTrip = GroupEntity.fromSupabaseShape(sb);
    expect(roundTrip.archivedAt).toBeNull();
  });

  it('validate rejects non-ISO archivedAt', () => {
    const bad = { ...GroupEntity.create({ operationId: OP, farmId: FARM, name: 'X' }), archivedAt: 'not-a-date' };
    const { valid, errors } = GroupEntity.validate(bad);
    expect(valid).toBe(false);
    expect(errors[0]).toMatch(/archivedAt/);
  });
});

describe('archiveGroup / reactivateGroup', () => {
  beforeEach(() => _reset());

  it('archiveGroup stamps archivedAt with an ISO timestamp', () => {
    seedGroup();
    const before = getById('groups', GID);
    expect(before.archivedAt).toBeNull();
    const updated = archiveGroup(GID);
    expect(updated.archivedAt).not.toBeNull();
    expect(typeof updated.archivedAt).toBe('string');
    expect(Number.isNaN(Date.parse(updated.archivedAt))).toBe(false);
  });

  it('reactivateGroup clears archivedAt', () => {
    seedGroup({ archivedAt: '2026-04-01T00:00:00.000Z' });
    const updated = reactivateGroup(GID);
    expect(updated.archivedAt).toBeNull();
  });

  it('archiveGroup returns null when group not found (no throw)', () => {
    const result = archiveGroup('nope');
    expect(result).toBeNull();
  });
});

describe('backup-migrations v23 → v24 (archived boolean → archived_at timestamp)', () => {
  it('maps archived=true to archived_at=updated_at, strips archived key', () => {
    const backup = {
      schema_version: 23,
      exported_at: '2026-04-18T00:00:00.000Z',
      tables: {
        groups: [
          { id: 'g1', archived: true, updated_at: '2026-03-10T10:00:00.000Z' },
        ],
      },
    };
    const migrated = BACKUP_MIGRATIONS[23](backup);
    expect(migrated.schema_version).toBe(24);
    expect(migrated.tables.groups[0].archived_at).toBe('2026-03-10T10:00:00.000Z');
    expect(migrated.tables.groups[0]).not.toHaveProperty('archived');
  });

  it('maps archived=false to archived_at=null', () => {
    const backup = {
      schema_version: 23,
      tables: { groups: [{ id: 'g1', archived: false, updated_at: '2026-03-10T10:00:00.000Z' }] },
    };
    const migrated = BACKUP_MIGRATIONS[23](backup);
    expect(migrated.tables.groups[0].archived_at).toBeNull();
    expect(migrated.tables.groups[0]).not.toHaveProperty('archived');
  });

  it('falls back to exported_at when archived=true but updated_at missing', () => {
    const backup = {
      schema_version: 23,
      exported_at: '2026-04-18T09:00:00.000Z',
      tables: { groups: [{ id: 'g1', archived: true }] },
    };
    const migrated = BACKUP_MIGRATIONS[23](backup);
    expect(migrated.tables.groups[0].archived_at).toBe('2026-04-18T09:00:00.000Z');
  });

  it('runs cleanly when groups array missing', () => {
    const backup = { schema_version: 23, tables: {} };
    expect(() => BACKUP_MIGRATIONS[23](backup)).not.toThrow();
    expect(backup.schema_version).toBe(24);
  });
});
