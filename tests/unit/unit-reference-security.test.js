/** File-only checks: never execute the staged SQL or contact a database. */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import { HELD_SCHEMA_VERSIONS, RELEASED_SCHEMA_VERSION } from '../../src/data/schema-release.js';
import { CURRENT_SCHEMA_VERSION, validateBackup, migrateBackupForward } from '../../src/data/backup-import.js';

const directory = path.resolve(__dirname, '../../supabase/migrations');
const source = readFileSync(path.join(directory, '044_unit_reference_read_only_rls.sql'), 'utf8');
const statements = source.replace(/--[^\n]*/g, '').split(';').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
const tables = ['input_product_units', 'dose_units'];

// Exact statement assertions prevent comments from satisfying the security checks.
describe('staged unit-reference RLS migration (static only)', () => {
  it.each(tables)('%s enables RLS with only authenticated global SELECT', table => {
    expect(statements).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    expect(statements.filter(s => s.startsWith('CREATE POLICY') && s.includes(`ON public.${table} `))).toEqual([
      `CREATE POLICY ${table}_authenticated_select ON public.${table} FOR SELECT TO authenticated USING (true)`,
    ]);
  });

  it.each(tables)('%s revokes all four unsafe browser privileges', table => {
    expect(statements).toContain(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.${table} FROM anon, authenticated`);
  });

  it('grants only authenticated SELECT, without anon policies, write policies or privileged functions', () => {
    expect(statements.filter(s => s.startsWith('GRANT'))).toEqual([
      'GRANT SELECT ON TABLE public.input_product_units, public.dose_units TO authenticated',
    ]);
    expect(statements.filter(s => s.startsWith('CREATE POLICY'))).toHaveLength(2);
    expect(statements.join(';')).not.toMatch(/DISABLE ROW LEVEL SECURITY|FOR (?:ALL|INSERT|UPDATE|DELETE)|TO anon|SECURITY DEFINER|CREATE FUNCTION/);
  });

  it('is a held, transactional stamp-44 file immediately after 042 and 043', () => {
    expect(source).toContain('WRITTEN ONLY / NOT APPLIED');
    expect(statements[0]).toBe('BEGIN');
    expect(statements.slice(-2)).toEqual(['UPDATE public.operations SET schema_version = 44 WHERE schema_version < 44', 'COMMIT']);
    // No hidden data/DDL changes beyond the audited security statements.
    expect(statements).toHaveLength(10);
    expect(readdirSync(directory).filter(f => /^04[234]_/.test(f)).sort()).toEqual([
      '042_retained_breeding_text.sql', '043_event_feed_pool_snapshots.sql', '044_unit_reference_read_only_rls.sql',
    ]);
    expect(RELEASED_SCHEMA_VERSION).toBe(41);
    expect(CURRENT_SCHEMA_VERSION).toBe(41);
    expect(HELD_SCHEMA_VERSIONS).toEqual([42, 43, 44]);
  });
});

describe('staged 43→44 backup permission-only step', () => {
  it('stamps the envelope and every operation without dropping or rewriting reference payloads/IDs', () => {
    const backup = {
      format: 'gtho-v2-backup', format_version: 1, schema_version: 43, operation_id: 'op',
      metadata: { untouched: true },
      tables: {
        operations: [{ id: 'op', schema_version: 43, name: 'Farm' }, { id: 'other', schema_version: 42 }],
        input_product_units: [{ id: 'kg', name: 'kg', archived: false, extra: 'preserve' }],
        dose_units: [{ id: 'ml', name: 'mL', archived: true }],
        input_products: [{ id: 'product', unit_id: 'kg' }],
        animal_treatment_records: [{ id: 'treatment', dose_unit_id: 'ml' }],
        event_feed_entries: [{ id: 'pool', batch_id: null, transfer_id: 'transfer' }],
      },
    };
    const expected = structuredClone(backup);
    expected.schema_version = 44;
    expected.tables.operations.forEach(op => { op.schema_version = 44; });
    const migrated = BACKUP_MIGRATIONS[43](structuredClone(backup));
    expect(migrated).toEqual(expected);
    expect(BACKUP_MIGRATIONS[43](migrated)).toEqual(expected);
    expect(backup.schema_version).toBe(43);
  });

  it('does not synthesize tables, reference rows or defaults in a minimal backup', () => {
    expect(BACKUP_MIGRATIONS[43]({ schema_version: 43, tables: {} })).toEqual({ schema_version: 44, tables: {} });
  });

  it('cannot release or automatically run the held step through the compiled importer', () => {
    const backup = { format: 'gtho-v2-backup', format_version: 1, operation_id: 'op', schema_version: 44, tables: {} };
    expect(validateBackup(backup)).toMatchObject({ valid: false });
    expect(validateBackup(backup).error).toContain('newer than this build (41)');
    const old = { ...backup, schema_version: 41 };
    const before = structuredClone(old);
    expect(migrateBackupForward(old).migrated).toBe(false);
    expect(old).toEqual(before);
  });
});
