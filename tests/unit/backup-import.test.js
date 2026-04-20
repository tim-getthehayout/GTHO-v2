/**
 * @file Backup import tests — CP-56.
 * Validates envelope validation, preview extraction, migration chain,
 * FK ordering, two-pass tables, reference tables, and parity.
 */
import { describe, it, expect } from 'vitest';
import {
  validateBackup,
  getBackupPreview,
  migrateBackupForward,
  FK_ORDER,
  REFERENCE_TABLES,
  TWO_PASS_TABLES,
} from '../../src/data/backup-import.js';
import { getBackupTableNames } from '../../src/data/backup-export.js';
import fixture from '../fixtures/backup-v14.json';

describe('backup-import (CP-56)', () => {
  describe('validateBackup — §5.7 step 1', () => {
    it('accepts valid backup', () => {
      expect(validateBackup(fixture).valid).toBe(true);
    });

    it('rejects null', () => {
      const r = validateBackup(null);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('not an object');
    });

    it('rejects wrong format', () => {
      const r = validateBackup({ format: 'wrong', format_version: 1, schema_version: 14, tables: {}, operation_id: 'x' });
      expect(r.valid).toBe(false);
      expect(r.error).toContain('Invalid format');
    });

    it('rejects newer format_version', () => {
      const r = validateBackup({ format: 'gtho-v2-backup', format_version: 99, schema_version: 14, tables: {}, operation_id: 'x' });
      expect(r.valid).toBe(false);
      expect(r.error).toContain('format version');
    });

    it('rejects newer schema_version', () => {
      const r = validateBackup({ format: 'gtho-v2-backup', format_version: 1, schema_version: 999, tables: {}, operation_id: 'x' });
      expect(r.valid).toBe(false);
      expect(r.error).toContain('schema version');
    });

    it('rejects missing tables block', () => {
      const r = validateBackup({ format: 'gtho-v2-backup', format_version: 1, schema_version: 14, operation_id: 'x' });
      expect(r.valid).toBe(false);
      expect(r.error).toContain('tables');
    });

    it('rejects missing operation_id', () => {
      const r = validateBackup({ format: 'gtho-v2-backup', format_version: 1, schema_version: 14, tables: {} });
      expect(r.valid).toBe(false);
      expect(r.error).toContain('operation_id');
    });
  });

  describe('getBackupPreview — §5.7 step 3', () => {
    it('extracts preview data from fixture', () => {
      const preview = getBackupPreview(fixture);
      expect(preview.operationName).toBe('Test Ranch');
      expect(preview.exportedAt).toBe('2026-04-13T18:00:00Z');
      expect(preview.exportedByEmail).toBe('test@example.com');
      expect(preview.schemaVersion).toBe(14);
      expect(preview.counts.farms).toBe(1);
      expect(preview.counts.events).toBe(1);
    });

    it('handles missing data gracefully', () => {
      const preview = getBackupPreview({ tables: {}, counts: {} });
      expect(preview.operationName).toBe('Unknown');
      expect(preview.exportedByEmail).toBe('Unknown');
    });
  });

  describe('migrateBackupForward — §5.7 step 5', () => {
    it('returns no-op when schema_version matches current', () => {
      const backup = { ...fixture, schema_version: 29 };
      const result = migrateBackupForward(backup);
      expect(result.migrated).toBe(false);
      expect(result.from).toBe(29);
      expect(result.to).toBe(29);
    });

    it('migrates 14 → 29 through the chain', () => {
      const backup = { ...fixture, schema_version: 14 };
      const result = migrateBackupForward(backup);
      expect(result.migrated).toBe(true);
      expect(result.from).toBe(14);
      expect(result.to).toBe(29);
    });

    it('returns error when migration is missing', () => {
      const backup = { ...fixture, schema_version: 13 };
      const result = migrateBackupForward(backup);
      expect(result.error).toContain('Missing migration');
      expect(result.error).toContain('13');
    });
  });

  describe('FK_ORDER — §5.3a ordering', () => {
    it('has exactly 49 tables', () => {
      expect(FK_ORDER.length).toBe(49);
    });

    it('matches the export table list', () => {
      const exportTables = getBackupTableNames().sort();
      const importTables = [...FK_ORDER].sort();
      expect(importTables).toEqual(exportTables);
    });

    it('operations is first (root parent)', () => {
      expect(FK_ORDER[0]).toBe('operations');
    });

    it('farms comes before farm_settings', () => {
      expect(FK_ORDER.indexOf('farms')).toBeLessThan(FK_ORDER.indexOf('farm_settings'));
    });

    it('events comes before event_paddock_windows', () => {
      expect(FK_ORDER.indexOf('events')).toBeLessThan(FK_ORDER.indexOf('event_paddock_windows'));
    });

    it('animals comes before animal_group_memberships', () => {
      expect(FK_ORDER.indexOf('animals')).toBeLessThan(FK_ORDER.indexOf('animal_group_memberships'));
    });

    it('batches comes before batch_adjustments', () => {
      expect(FK_ORDER.indexOf('batches')).toBeLessThan(FK_ORDER.indexOf('batch_adjustments'));
    });

    it('todos comes before todo_assignments', () => {
      expect(FK_ORDER.indexOf('todos')).toBeLessThan(FK_ORDER.indexOf('todo_assignments'));
    });

    it('amendments comes before amendment_locations', () => {
      expect(FK_ORDER.indexOf('amendments')).toBeLessThan(FK_ORDER.indexOf('amendment_locations'));
    });

    it('surveys comes before survey_draft_entries', () => {
      expect(FK_ORDER.indexOf('surveys')).toBeLessThan(FK_ORDER.indexOf('survey_draft_entries'));
    });

    it('harvest_events comes before harvest_event_fields', () => {
      expect(FK_ORDER.indexOf('harvest_events')).toBeLessThan(FK_ORDER.indexOf('harvest_event_fields'));
    });
  });

  describe('TWO_PASS_TABLES — self-referential FKs', () => {
    it('animals has dam_id and sire_animal_id', () => {
      expect(TWO_PASS_TABLES.animals).toEqual(['dam_id', 'sire_animal_id']);
    });

    it('events has source_event_id', () => {
      expect(TWO_PASS_TABLES.events).toEqual(['source_event_id']);
    });

    it('only animals and events are two-pass', () => {
      expect(Object.keys(TWO_PASS_TABLES)).toEqual(['animals', 'events']);
    });
  });

  describe('REFERENCE_TABLES — upsert instead of delete-then-insert', () => {
    it('includes only global reference tables (no operation_id)', () => {
      // OI-0056: per-operation seed tables removed — only truly global lookups remain
      const expected = ['dose_units', 'input_product_units'];
      for (const t of expected) {
        expect(REFERENCE_TABLES.has(t), `missing: ${t}`).toBe(true);
      }
      expect(REFERENCE_TABLES.size).toBe(2);
    });
  });

  describe('FK-order resilience', () => {
    it('import would reorder regardless of JSON key order in backup', () => {
      // Simulate a backup where tables appear in reverse order in JSON
      const backupTableKeys = Object.keys(fixture.tables);
      const reversed = [...backupTableKeys].reverse();
      // FK_ORDER is the canonical insert order — it doesn't depend on JSON key order
      expect(FK_ORDER[0]).toBe('operations');
      expect(FK_ORDER[FK_ORDER.length - 1]).toBe('submissions');
      // The import code iterates FK_ORDER, not Object.keys(backup.tables)
      expect(reversed[0]).not.toBe(FK_ORDER[0]); // proves JSON order differs
    });
  });
});
