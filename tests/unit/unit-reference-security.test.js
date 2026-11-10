/** File-only checks: never execute the staged SQL or contact a database. */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import { HELD_SCHEMA_VERSIONS, RELEASED_SCHEMA_VERSION } from '../../src/data/schema-release.js';
import { CURRENT_SCHEMA_VERSION, validateBackup, migrateBackupForward } from '../../src/data/backup-import.js';

const directory = path.resolve(__dirname, '../../supabase/migrations');
const source = readFileSync(path.join(directory, '044_unit_reference_rls.sql'), 'utf8');
const statements = source.replace(/--[^\n]*/g, '').split(';').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
const tables = ['input_product_units', 'dose_units'];

// Exact statements, not comments, must provide grants and matching policies.
describe('staged unit-reference RLS migration (static only)', () => {
  it.each(tables)('%s enables RLS and authenticated SELECT/INSERT/UPDATE policies only', table => {
    expect(statements).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    expect(statements.filter(s => s.startsWith('CREATE POLICY') && s.includes(`ON public.${table} `))).toEqual([
      `CREATE POLICY ${table}_authenticated_select ON public.${table} FOR SELECT TO authenticated USING (true)`,
      `CREATE POLICY ${table}_authenticated_insert ON public.${table} FOR INSERT TO authenticated WITH CHECK (true)`,
      `CREATE POLICY ${table}_authenticated_update ON public.${table} FOR UPDATE TO authenticated USING (true) WITH CHECK (true)`,
    ]);
  });

  it('anon has all privileges revoked and no policy or grant', () => {
    expect(statements).toContain('REVOKE ALL ON TABLE public.input_product_units, public.dose_units FROM anon');
    expect(statements.filter(s => s.startsWith('CREATE POLICY')).join(';')).not.toMatch(/TO anon|TO public/i);
    expect(statements.filter(s => s.startsWith('GRANT')).join(';')).not.toMatch(/TO anon|TO public/i);
  });

  it('authenticated keeps SELECT/INSERT/UPDATE for conflict-column reads and upsert, never DELETE/TRUNCATE', () => {
    expect(statements.filter(s => s.startsWith('GRANT'))).toEqual([
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.input_product_units, public.dose_units TO authenticated',
    ]);
    expect(statements).toContain('REVOKE DELETE, TRUNCATE ON TABLE public.input_product_units, public.dose_units FROM authenticated');
    expect(statements.filter(s => s.startsWith('CREATE POLICY'))).toHaveLength(6);
    expect(statements.join(';')).not.toMatch(/DISABLE ROW LEVEL SECURITY|FOR (?:ALL|DELETE)|SECURITY DEFINER|CREATE FUNCTION/);
  });

  it('revokes TRUNCATE/REFERENCES/TRIGGER for both client roles on all three tables, with no other release_notes change', () => {
    const revoke = 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dose_units, public.input_product_units, public.release_notes FROM anon, authenticated';
    expect(statements).toContain(revoke);
    expect(statements.filter(s => s.includes('public.release_notes'))).toEqual([revoke]);
  });

  it('is a held, transactional stamp-44 file immediately after 042 and 043', () => {
    expect(source).toContain('WRITTEN ONLY / NOT APPLIED');
    expect(statements[0]).toBe('BEGIN');
    expect(statements.slice(-2)).toEqual(['UPDATE public.operations SET schema_version = 44 WHERE schema_version < 44', 'COMMIT']);
    expect(statements).toHaveLength(15);
    expect(readdirSync(directory).filter(f => /^04[234]_/.test(f)).sort()).toEqual([
      '042_retained_breeding_text.sql', '043_event_feed_pool_snapshots.sql', '044_unit_reference_rls.sql',
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
