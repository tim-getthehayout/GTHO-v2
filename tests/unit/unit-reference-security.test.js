import { add, getAll, _reset } from '../../src/data/store.js';
/** Static migration/release checks; real role/trigger checks live in tests/sql. */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import { HELD_SCHEMA_VERSIONS, RELEASED_SCHEMA_VERSION, STAGED_COLUMNS } from '../../src/data/schema-release.js';
import { validateBackup } from '../../src/data/backup-import.js';
import { UNIT_STANDARDS, UNIT_TABLES } from '../../src/utils/unit-standards.js';
import { create, validate, toSupabaseShape } from '../../src/entities/dose-unit.js';
const sql = readFileSync(path.resolve(__dirname, '../../supabase/migrations/044_unit_reference_rls.sql'), 'utf8').replace(/--[^\n]*/g,'');
it.each(UNIT_TABLES)('%s is scoped with standard/custom indexes and accepted-membership policies', table => {
 expect(sql).toContain(`ALTER TABLE public.${table} ADD COLUMN operation_id uuid DEFAULT NULL REFERENCES public.operations(id)`);
 expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
 expect(sql).toContain(`ON public.${table} (lower(btrim(name))) WHERE operation_id IS NULL`);
 expect(sql).toContain(`ON public.${table} (operation_id, lower(btrim(name))) WHERE operation_id IS NOT NULL`);
 for(const op of ['SELECT','INSERT','UPDATE'])expect(sql).toContain(`ON public.${table} FOR ${op} TO authenticated`);
 expect(sql).toContain('accepted_at IS NOT NULL');
});
it('revokes all anon unit access and unsafe privileges, while release notes are authenticated read-only',()=>{
 expect(sql).toContain('REVOKE ALL ON TABLE public.dose_units, public.input_product_units FROM anon, authenticated');
 expect(sql).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.dose_units, public.input_product_units TO authenticated');
 expect(sql).toContain('REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.dose_units, public.input_product_units FROM anon, authenticated');
 expect(sql).toContain('CREATE POLICY release_notes_authenticated_select ON public.release_notes FOR SELECT TO authenticated USING (true)');
 expect(sql).toContain('REVOKE SELECT ON TABLE public.release_notes FROM anon');
 expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.release_notes FROM anon, authenticated');
 expect(sql).not.toMatch(/CREATE POLICY[^;]*TO anon/);
});
it('private guards serialize namespace checks, forbid ownership moves and check all three references',()=>{
 expect(sql).toContain('pg_advisory_xact_lock(44,');expect(sql).toContain("current_setting('transaction_isolation') <> 'read committed'");
 expect(sql).toContain('NEW.operation_id IS DISTINCT FROM OLD.operation_id');
 for(const [table,field]of [['animal_treatments','dose_unit_id'],['amendments','qty_unit_id'],['input_products','unit_id']])expect(sql).toContain(`BEFORE INSERT OR UPDATE OF operation_id, ${field} ON public.${table}`);
 expect(sql).not.toMatch(/CREATE FUNCTION public\.[^;]*SECURITY DEFINER/);
});
it('all eleven exact legacy IDs and fixed IDs are in the migration, with both apply aborts',()=>{
 expect(UNIT_STANDARDS).toHaveLength(11);expect(new Set(UNIT_STANDARDS.map(row=>row.id)).size).toBe(11);
 for(const row of UNIT_STANDARDS){expect(sql).toContain(row.id);expect(sql).toContain(row.legacyId);}
 expect(sql).toContain('unit-migration-references-exist');expect(sql).toContain('unit-migration-unexpected-standard-set');expect(sql).toContain('SET schema_version = 44');
});
it('keeps the release ceiling at 41, held 42/43/44, and custom serialization fails closed',()=>{
 expect(RELEASED_SCHEMA_VERSION).toBe(41);expect(HELD_SCHEMA_VERSIONS).toEqual([42,43,44]);expect(STAGED_COLUMNS[44]).toEqual({dose_units:['operation_id'],input_product_units:['operation_id']});
 expect(()=>toSupabaseShape(create({name:'custom',operationId:'op'}))).toThrow(/44|unreleasedSchema/);
 expect(validateBackup({format:'gtho-v2-backup',format_version:1,schema_version:44,operation_id:'op',tables:{}}).valid).toBe(false);
});
it('43→44 maps by exact legacy IDs only, skips standards, retains custom IDs and stamps all operations',()=>{
 const dose=UNIT_STANDARDS.find(row=>row.table==='dose_units'),product=UNIT_STANDARDS.find(row=>row.table==='input_product_units');
 const b={schema_version:43,operation_id:'op',tables:{operations:[{id:'op',schema_version:43}],dose_units:[{id:dose.legacyId,name:'untrusted name'},{id:'custom',name:' New e\u0301 '}],input_product_units:[{id:product.legacyId,name:'untrusted'}],animal_treatments:[{dose_unit_id:dose.legacyId}],amendments:[{qty_unit_id:product.legacyId}],input_products:[{unit_id:'custom-product'}]}};
 const out=BACKUP_MIGRATIONS[43](structuredClone(b));expect(out.schema_version).toBe(44);expect(out.tables.operations[0].schema_version).toBe(44);expect(out.tables.dose_units).toEqual([{id:'custom',name:'New é',operation_id:'op'}]);expect(out.tables.input_product_units).toEqual([]);expect(out.tables.animal_treatments[0].dose_unit_id).toBe(dose.id);expect(out.tables.amendments[0].qty_unit_id).toBe(product.id);expect(out.tables.input_products[0].unit_id).toBe('custom-product');expect(b.schema_version).toBe(43);
});
it('names alone never map unknown IDs into standards',()=>{const out=BACKUP_MIGRATIONS[43]({schema_version:43,operation_id:'op',tables:{dose_units:[{id:'different',name:'ml'}]}});expect(out.tables.dose_units[0]).toEqual({id:'different',name:'ml',operation_id:'op'});});

it('held custom writes fail before local persistence even without a serializer',()=>{
 _reset();localStorage.clear();expect(()=>add('doseUnits',create({name:'Custom',operationId:'op'}),validate)).toThrow(/44|unreleasedSchema/);expect(getAll('doseUnits')).toEqual([]);expect(localStorage.getItem('gtho_v2_doseUnits')).toBeNull();
});
