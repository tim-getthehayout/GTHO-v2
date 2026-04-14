/**
 * @file Backup round-trip test — CP-55.
 * Validates the export envelope shape, table inclusion, and serialization rules
 * per V2_MIGRATION_PLAN.md §5.
 */
import { describe, it, expect } from 'vitest';
import { getBackupTableNames } from '../../src/data/backup-export.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import fixture from '../fixtures/backup-v14.json';

const EXPECTED_TABLE_COUNT = 49; // 52 total tables minus 3 excluded (operation_members, app_logs, release_notes)

describe('backup round-trip (CP-55)', () => {
  describe('fixture structure', () => {
    it('has correct format', () => {
      expect(fixture.format).toBe('gtho-v2-backup');
    });

    it('has format_version = 1', () => {
      expect(fixture.format_version).toBe(1);
    });

    it('has schema_version = 14', () => {
      expect(fixture.schema_version).toBe(14);
    });

    it('has exported_at as ISO timestamp', () => {
      expect(fixture.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });

    it('has exported_by with user_id and email', () => {
      expect(fixture.exported_by).toHaveProperty('user_id');
      expect(fixture.exported_by).toHaveProperty('email');
    });

    it('has operation_id as UUID', () => {
      expect(fixture.operation_id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('has build_stamp', () => {
      expect(fixture.build_stamp).toBeDefined();
    });

    it('has counts block with required keys', () => {
      expect(fixture.counts).toHaveProperty('farms');
      expect(fixture.counts).toHaveProperty('events');
      expect(fixture.counts).toHaveProperty('animals');
      expect(fixture.counts).toHaveProperty('batches');
      expect(fixture.counts).toHaveProperty('todos');
    });

    it('counts match actual table row counts', () => {
      expect(fixture.counts.farms).toBe(fixture.tables.farms.length);
      expect(fixture.counts.events).toBe(fixture.tables.events.length);
      expect(fixture.counts.animals).toBe(fixture.tables.animals.length);
      expect(fixture.counts.batches).toBe(fixture.tables.batches.length);
      expect(fixture.counts.todos).toBe(fixture.tables.todos.length);
    });
  });

  describe('table inclusion per §5.3', () => {
    it(`includes exactly ${EXPECTED_TABLE_COUNT} tables`, () => {
      const tableNames = Object.keys(fixture.tables);
      expect(tableNames.length).toBe(EXPECTED_TABLE_COUNT);
    });

    it('backup-export module lists same table count', () => {
      const exportTableNames = getBackupTableNames();
      expect(exportTableNames.length).toBe(EXPECTED_TABLE_COUNT);
    });

    it('fixture contains all tables from the export module', () => {
      const exportTableNames = getBackupTableNames();
      for (const name of exportTableNames) {
        expect(fixture.tables, `missing table: ${name}`).toHaveProperty(name);
      }
    });

    it('excludes operation_members, app_logs, release_notes', () => {
      expect(fixture.tables).not.toHaveProperty('operation_members');
      expect(fixture.tables).not.toHaveProperty('app_logs');
      expect(fixture.tables).not.toHaveProperty('release_notes');
    });
  });

  describe('column serialization per §5.5', () => {
    it('UUIDs are lowercase 36-char strings', () => {
      const op = fixture.tables.operations[0];
      expect(op.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('timestamps are ISO 8601 with Z suffix', () => {
      const op = fixture.tables.operations[0];
      expect(op.created_at).toMatch(/Z$/);
      expect(op.updated_at).toMatch(/Z$/);
    });

    it('dates are YYYY-MM-DD', () => {
      const event = fixture.tables.events[0];
      expect(event.date_in).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('booleans are JSON true/false', () => {
      const op = fixture.tables.operations[0];
      expect(typeof op.archived).toBe('boolean');
    });

    it('nullable columns use null, not omitted', () => {
      const event = fixture.tables.events[0];
      expect(event).toHaveProperty('date_out');
      expect(event.date_out).toBeNull();
    });

    it('numerics are JSON numbers', () => {
      const batch = fixture.tables.batches[0];
      expect(typeof batch.quantity_original).toBe('number');
      expect(typeof batch.cost_total).toBe('number');
    });
  });

  describe('operation row', () => {
    it('includes schema_version', () => {
      const op = fixture.tables.operations[0];
      expect(op.schema_version).toBe(14);
    });

    it('includes unit_system', () => {
      const op = fixture.tables.operations[0];
      expect(op.unit_system).toBe('imperial');
    });
  });

  describe('migration chain registry', () => {
    it('BACKUP_MIGRATIONS is an object', () => {
      expect(typeof BACKUP_MIGRATIONS).toBe('object');
    });

    it('is initially empty at schema_version 14', () => {
      expect(Object.keys(BACKUP_MIGRATIONS).length).toBe(0);
    });
  });

  describe('fixture data integrity', () => {
    it('every table value is an array', () => {
      for (const [name, rows] of Object.entries(fixture.tables)) {
        expect(Array.isArray(rows), `${name} should be an array`).toBe(true);
      }
    });

    it('operations table has exactly 1 row', () => {
      expect(fixture.tables.operations.length).toBe(1);
    });

    it('operation_id in envelope matches operations[0].id', () => {
      expect(fixture.operation_id).toBe(fixture.tables.operations[0].id);
    });
  });
});
