/**
 * @file Backup round-trip test — CP-55.
 * Validates the export envelope shape, table inclusion, and serialization rules
 * per V2_MIGRATION_PLAN.md §5.
 */
import { describe, it, expect } from 'vitest';
import { getBackupTableNames } from '../../src/data/backup-export.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import { fromSupabaseShape as batchFromSb } from '../../src/entities/batch.js';
import { fromSupabaseShape as locationFromSb } from '../../src/entities/location.js';
import { fromSupabaseShape as farmSettingFromSb } from '../../src/entities/farm-setting.js';
import fixture from '../fixtures/backup-v14.json';

const EXPECTED_TABLE_COUNT = 50; // 53 total tables minus 3 excluded (operation_members, app_logs, release_notes)

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

    it('has migration entries for 14→27 chain', () => {
      expect(Object.keys(BACKUP_MIGRATIONS).length).toBe(13);
      expect(typeof BACKUP_MIGRATIONS[14]).toBe('function');
      expect(typeof BACKUP_MIGRATIONS[15]).toBe('function');
      expect(typeof BACKUP_MIGRATIONS[16]).toBe('function');
      expect(typeof BACKUP_MIGRATIONS[17]).toBe('function');
      expect(typeof BACKUP_MIGRATIONS[18]).toBe('function');
      expect(typeof BACKUP_MIGRATIONS[19]).toBe('function');
      expect(typeof BACKUP_MIGRATIONS[20]).toBe('function');
      expect(typeof BACKUP_MIGRATIONS[21]).toBe('function');
      expect(typeof BACKUP_MIGRATIONS[22]).toBe('function');
      expect(typeof BACKUP_MIGRATIONS[23]).toBe('function');
      expect(typeof BACKUP_MIGRATIONS[24]).toBe('function');
      expect(typeof BACKUP_MIGRATIONS[25]).toBe('function');
      expect(typeof BACKUP_MIGRATIONS[26]).toBe('function');
    });

    it('migration 26 renames bale_ring_residue_diameter_ft → _cm with ft × 30.48 (OI-0111)', () => {
      const backup = {
        schema_version: 26,
        tables: {
          farm_settings: [
            { id: 'fs1', bale_ring_residue_diameter_ft: 12 },
            { id: 'fs2', bale_ring_residue_diameter_ft: null },
            { id: 'fs3' },
          ],
        },
      };
      const migrated = BACKUP_MIGRATIONS[26](backup);
      expect(migrated.schema_version).toBe(27);
      const rows = migrated.tables.farm_settings;
      expect(rows[0].bale_ring_residue_diameter_cm).toBeCloseTo(365.76, 2);
      expect(rows[0].bale_ring_residue_diameter_ft).toBeUndefined();
      expect(rows[1].bale_ring_residue_diameter_cm).toBeNull();
      expect(rows[1].bale_ring_residue_diameter_ft).toBeUndefined();
      // Row with neither key should not gain the cm key.
      expect(rows[2].bale_ring_residue_diameter_cm).toBeUndefined();
    });
  });

  describe('pre-OI-0106-era backup round-trip (numeric coercion)', () => {
    // CP-55 writes raw PostgREST rows to backup JSON. PostgREST returns
    // `numeric` as strings, so pre-hotfix backups contain stringified numerics.
    // CP-56 reinserts them into Supabase (which silently casts string→number)
    // and then pullAllRemote routes every row through fromSupabaseShape,
    // which (as of OI-0106) coerces via `Number(...)`. Proves the round-trip
    // lands as numbers in memory regardless of what the backup JSON contained.
    it('stringified-numeric batch row → fromSupabaseShape → numbers in memory', () => {
      const legacyRow = {
        id: '00000000-0000-0000-0000-000000000b01',
        operation_id: '00000000-0000-0000-0000-0000000000aa',
        feed_type_id: '00000000-0000-0000-0000-0000000000bb',
        name: 'Hay (pre-hotfix backup)',
        source: 'purchase',
        quantity: '42.5',
        remaining: '30',
        unit: 'bale',
        weight_per_unit_kg: '20',
        dm_pct: '85',
        cost_per_unit: '12',
        archived: false,
      };
      const r = batchFromSb(legacyRow);
      expect(typeof r.quantity).toBe('number');
      expect(typeof r.remaining).toBe('number');
      expect(typeof r.weightPerUnitKg).toBe('number');
    });

    it('stringified-numeric location row → fromSupabaseShape → numbers in memory', () => {
      const r = locationFromSb({
        id: '00000000-0000-0000-0000-000000000c01',
        operation_id: '00000000-0000-0000-0000-0000000000aa',
        farm_id: '00000000-0000-0000-0000-0000000000bb',
        name: 'South 40', type: 'land', land_use: 'pasture',
        area_hectares: '16.2',
        capture_percent: '80',
      });
      expect(typeof r.areaHectares).toBe('number');
      expect(typeof r.capturePercent).toBe('number');
    });

    it('stringified-numeric farm-setting row → fromSupabaseShape → threshold comparison is numeric not lex', () => {
      const r = farmSettingFromSb({
        id: '00000000-0000-0000-0000-000000000d01',
        farm_id: '00000000-0000-0000-0000-0000000000bb',
        operation_id: '00000000-0000-0000-0000-0000000000aa',
        threshold_aud_warn_pct: '60',
        threshold_aud_target_pct: '100',
      });
      // Pre-coercion: "100" > "60" is false (lex). Post-coercion: 100 > 60 is true.
      expect(r.thresholdAudTargetPct > r.thresholdAudWarnPct).toBe(true);
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
